// src/utils/operationalAlerts.js
// Alertas operacionais puros a partir dos dados reais já normalizados em
// sales.recebiveis e sales.fornecedores. Sem React, sem inventar dados.
//
// Entrada: { recebiveis, fornecedores } — cada um { metrics, top, openInvoices } | null.
//   openInvoices: [{ id, cliente|fornecedor, numero, dataEmissao, vencimento, valor, diasAtraso }]
//   (vencimento em dd/mm/aaaa; valor = saldo em aberto no lado recebíveis; diasAtraso já calculado)
//
// Saída: lista compatível com AlertCard/AlertRow. Cada alerta:
//   { id, severity, category, title, description, timestamp, acao,
//     type, source, priority, amount, days }
//   AlertCard usa severity/title/description/timestamp; AlertRow usa também category/acao.
//   Os extras (type, source, priority, amount, days) servem ordenação, dedupe e testes.
//
// NADA de valor absoluto arbitrário: "saldo elevado" e "concentração" usam critério
// relativo (participação no total em aberto do próprio lado).

import { round2, eur } from "./financialCalculations.js";
import { parsePtDate } from "./cashflowForecast.js";

// Prioridade por classe de alerta (maior = mais urgente). Usada para ordenar e cortar.
const PRIORITY = {
  vencido: 100,        // vencido há mais tempo / múltiplos vencidos
  maiorAtraso: 80,     // entidade com maior atraso
  saldoVencido: 70,
  vence7: 60,          // vence nos próximos 7 dias
  concentracao: 40,    // concentração relevante
  saldoElevado: 30,
};

// Um título é "válido" para alertas se tem nome de entidade e valor > 0.
function validInvoice(inv, entityKey) {
  if (!inv) return false;
  const nome = inv[entityKey];
  const valor = Number(inv.valor) || 0;
  return !!nome && nome !== "\u2014" && valor > 0;
}

// openInvoices não traz o id da entidade (só o id do título). Agrupamos por nome,
// que é o identificador estável disponível nesta camada. (Ver débito técnico: expor
// contato.id em openInvoices permitiria distinguir homónimos.)
function groupByEntity(invoices, entityKey) {
  const map = new Map();
  for (const inv of invoices) {
    if (!validInvoice(inv, entityKey)) continue;
    const nome = inv[entityKey];
    const cur = map.get(nome) || { nome, titulos: [], saldo: 0, vencidos: [], maxAtraso: 0 };
    cur.titulos.push(inv);
    cur.saldo = round2(cur.saldo + (Number(inv.valor) || 0));
    if (Number(inv.diasAtraso) > 0) {
      cur.vencidos.push(inv);
      cur.maxAtraso = Math.max(cur.maxAtraso, Number(inv.diasAtraso) || 0);
    }
    map.set(nome, cur);
  }
  return [...map.values()];
}

// Constrói os alertas de UM lado (recebíveis ou fornecedores).
function buildSideAlerts(side, cfg) {
  const { entityKey, category, prefixo, papel, verboDever, acaoVencido, acaoVence7, acaoConc } = cfg;
  // Base COMPLETA de títulos abertos (não a lista truncada de exibição).
  const invoices = (side && (side.allOpenInvoices ?? side.openInvoices)) || [];
  const out = [];
  if (!invoices.length) return out;

  const grupos = groupByEntity(invoices, entityKey);
  if (!grupos.length) return out;

  // Denominador da concentração: métrica completa do lado quando disponível; senão,
  // soma dos títulos (fallback defensivo).
  const saldoTotalMetric = side && side.metrics
    ? (side.metrics.saldoReceber ?? side.metrics.saldoPagar ?? null)
    : null;
  const totalAberto = (saldoTotalMetric != null && saldoTotalMetric > 0)
    ? round2(saldoTotalMetric)
    : round2(grupos.reduce((a, g) => a + g.saldo, 0));

  // Ordena entidades por atraso desc para escolher a "pior".
  const porAtraso = grupos.filter((g) => g.vencidos.length).sort((a, b) => b.maxAtraso - a.maxAtraso);

  // 1) Entidade com múltiplos vencidos (agregado) ou um único vencido.
  for (const g of porAtraso) {
    const n = g.vencidos.length;
    const totalVenc = round2(g.vencidos.reduce((a, i) => a + (Number(i.valor) || 0), 0));
    if (n >= 2) {
      out.push({
        id: `${prefixo}-multi-${g.nome}`,
        severity: "danger", category,
        title: `${papel} com várias faturas vencidas`,
        description: `${g.nome} tem ${n} faturas vencidas, no total de ${eur(totalVenc)} (a mais antiga há ${g.maxAtraso} dias).`,
        timestamp: "Hoje", acao: acaoVencido,
        type: "vencido-multiplo", source: category.toLowerCase(),
        priority: PRIORITY.vencido + g.maxAtraso, amount: totalVenc, days: g.maxAtraso,
      });
    } else {
      const inv = g.vencidos[0];
      out.push({
        id: `${prefixo}-venc-${g.nome}`,
        severity: "danger", category,
        title: `${papel} com fatura vencida`,
        description: `${g.nome}: fatura ${inv.numero} vencida há ${inv.diasAtraso} dias (${eur(Number(inv.valor) || 0)}).`,
        timestamp: "Hoje", acao: acaoVencido,
        type: "vencido", source: category.toLowerCase(),
        priority: PRIORITY.vencido + (Number(inv.diasAtraso) || 0), amount: Number(inv.valor) || 0, days: Number(inv.diasAtraso) || 0,
      });
    }
  }

  // 2) Títulos a vencer nos próximos 7 dias.
  // Conciliação (regra fixa):
  //  - a quantidade APRESENTADA é a métrica *Vencer7 quando disponível; senão dentro7.length;
  //  - o valor financeiro só é mostrado quando a métrica IGUALA dentro7.length (conciliável);
  //  - havendo divergência (ou métrica ausente com valor não fiável), mostra-se só a quantidade;
  //  - nunca se substitui silenciosamente a métrica pela amostra conciliável.
  // dentro7 = títulos com vencimento em [hoje, hoje+7] (parsePtDate seguro; vencido não conta).
  const today = startOfTodayLocal();
  const limite7 = new Date(today);
  limite7.setDate(limite7.getDate() + 7);
  const dentro7 = invoices.filter((i) => {
    if (!validInvoice(i, entityKey)) return false;
    if (Number(i.diasAtraso) > 0) return false; // vencido não é "a vencer"
    const d = parsePtDate(i.vencimento);
    return d && d >= today && d <= limite7;
  });

  const vence7QtdMetric = side && side.metrics
    ? (side.metrics.faturasAbertasReceberVencer7 ?? side.metrics.faturasAbertasPagarVencer7 ?? null)
    : null;

  const metricaDisponivel = vence7QtdMetric != null;
  // Quantidade apresentada: métrica quando disponível; senão a contagem dos títulos ≤7 dias.
  const vence7Qtd = metricaDisponivel ? vence7QtdMetric : dentro7.length;

  if (vence7Qtd > 0) {
    const total7 = round2(dentro7.reduce((a, i) => a + (Number(i.valor) || 0), 0));
    // Valor só quando conciliável: métrica ausente (usamos dentro7) OU métrica === dentro7.length.
    const conciliavel = metricaDisponivel ? (vence7QtdMetric === dentro7.length) : true;
    const mostraValor = conciliavel && dentro7.length > 0 && total7 > 0;
    out.push({
      id: `${prefixo}-vence7`,
      severity: "warning", category,
      title: `Faturas a ${verboDever} nos próximos 7 dias`,
      description: `${vence7Qtd} ${vence7Qtd === 1 ? "fatura" : "faturas"} ${vence7Qtd === 1 ? "vence" : "vencem"} nos próximos 7 dias${mostraValor ? ` (${eur(total7)})` : ""}.`,
      timestamp: "Hoje", acao: acaoVence7,
      type: "vence7", source: category.toLowerCase(),
      priority: PRIORITY.vence7, amount: mostraValor ? total7 : null, days: 7,
    });
  }

  // 3) Concentração: líder do ranking COMPLETO (side.top) sobre o saldo total (métrica).
  // Fallback defensivo para os grupos locais quando top/métrica não existem.
  const ranking = (side && Array.isArray(side.top) && side.top.length)
    ? side.top
    : [...grupos].sort((a, b) => b.saldo - a.saldo).map((g) => ({ nome: g.nome, saldo: g.saldo }));
  const numEntidades = (side && Array.isArray(side.top) && side.top.length) ? side.top.length : grupos.length;

  if (totalAberto > 0 && ranking.length) {
    const lider = ranking[0];
    const liderSaldo = Number(lider.saldo) || 0;
    const share = Math.round((liderSaldo / totalAberto) * 1000) / 10;
    if (share >= 50 && numEntidades >= 2) {
      out.push({
        id: `${prefixo}-conc-${lider.nome}`,
        severity: "warning", category,
        title: `Concentração de saldo num ${papel.toLowerCase()}`,
        description: `${share}% do saldo em aberto (${eur(liderSaldo)}) concentra-se em ${lider.nome}.`,
        timestamp: "Hoje", acao: acaoConc,
        type: "concentracao", source: category.toLowerCase(),
        priority: PRIORITY.concentracao + share, amount: liderSaldo, days: 0,
      });
    } else if (share >= 40 && numEntidades >= 3) {
      out.push({
        id: `${prefixo}-saldo-${lider.nome}`,
        severity: "info", category,
        title: `${papel} com saldo em aberto elevado`,
        description: `${lider.nome} representa ${share}% do saldo em aberto (${eur(liderSaldo)}).`,
        timestamp: "Hoje", acao: acaoConc,
        type: "saldo-elevado", source: category.toLowerCase(),
        priority: PRIORITY.saldoElevado + share, amount: liderSaldo, days: 0,
      });
    }
  }

  return out;
}

// Meia-noite local de hoje (para a janela de 7 dias dos alertas).
function startOfTodayLocal() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

// Remove alertas duplicados por id (defensivo) e ordena por prioridade desc.
function dedupeAndSort(list) {
  const seen = new Set();
  const uniq = [];
  for (const a of list) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    uniq.push(a);
  }
  return uniq.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/**
 * Gera os alertas operacionais a partir dos lados disponíveis.
 * @param {{recebiveis: object|null, fornecedores: object|null}} args
 * @returns {Array} alertas ordenados por prioridade (desc). Vazio se ambos ausentes
 *          ou sem títulos elegíveis. NÃO decide fallback para mock — isso é do JSX.
 */
export function buildOperationalAlerts({ recebiveis, fornecedores } = {}) {
  const out = [];

  if (recebiveis) {
    out.push(...buildSideAlerts(recebiveis, {
      entityKey: "cliente", category: "Recebimentos", prefixo: "r", papel: "Cliente",
      verboDever: "receber",
      acaoVencido: "Reforçar cobrança junto do cliente",
      acaoVence7: "Confirmar recebimentos previstos",
      acaoConc: "Diversificar a carteira de clientes",
    }));
  }

  if (fornecedores) {
    out.push(...buildSideAlerts(fornecedores, {
      entityKey: "fornecedor", category: "Pagamentos", prefixo: "f", papel: "Fornecedor",
      verboDever: "pagar",
      acaoVencido: "Regularizar o pagamento em atraso",
      acaoVence7: "Garantir tesouraria para os pagamentos",
      acaoConc: "Diversificar ou renegociar com o fornecedor",
    }));
  }

  return dedupeAndSort(out);
}

/**
 * Indica se há alguma fonte real disponível para o bloco de alertas operacionais.
 * Usado pelo JSX para decidir entre (dados reais / estado vazio) e (mock + Demo).
 */
export function hasOperationalSource({ recebiveis, fornecedores } = {}) {
  return !!recebiveis || !!fornecedores;
}