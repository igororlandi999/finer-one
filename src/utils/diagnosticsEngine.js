// src/utils/diagnosticsEngine.js
// Motores determinísticos de diagnóstico derivados de vendas e contas a pagar.
// O diagnóstico financeiro completo alimenta a tela Diagnóstico Financeiro
// quando as fontes reais necessárias estão disponíveis.

import {
  totalRevenue,
  averageTicket,
  monthOverMonthGrowth,
  clientConcentration,
  topClients,
  ordersInMonth,
  latestMonthKey,
  round2,
  toDate,
  startOfDay,
  pct,
  prevMonthKey as prevKeyOf,
} from "./financialCalculations.js";
import { formatMoney } from "../lib/currency.js";

import {
  totalPayables,
  payablesInMonth,
  billablePayables,
  expenseByCategory,
  openPayables,
  payableOpenBalance,
} from "./expenseCalculations.js";

import { buildSalesAlerts, buildExpenseAlerts } from "./alertsEngine.js";

function finding(id, status, label, message) {
  // status: 'positivo' | 'atencao' | 'risco' | 'neutro'
  return { id, status, label, message };
}

export function buildSalesDiagnostics(orders) {
  const items = [];

  const growth = monthOverMonthGrowth(orders);
  if (growth !== null) {
    if (growth >= 5) {
      items.push(finding("crescimento", "positivo", "Crescimento de vendas",
        `A faturação subiu ${growth}% face ao mês anterior.`));
    } else if (growth <= -10) {
      items.push(finding("crescimento", "risco", "Quebra de vendas",
        `A faturação caiu ${pct(Math.abs(growth))}% face ao mês anterior.`));
    } else if (growth < 0) {
      items.push(finding("crescimento", "atencao", "Vendas em desaceleração",
        `A faturação recuou ${pct(Math.abs(growth))}% face ao mês anterior.`));
    }
  }

  const conc = clientConcentration(orders);
  const top = topClients(orders, 1)[0];
  if (top && conc >= 40) {
    items.push(finding("concentracao", "risco", "Dependência de cliente",
      `${conc}% da faturação vem de ${top.name}.`));
  } else if (top && conc >= 25) {
    items.push(finding("concentracao", "atencao", "Concentração de clientes",
      `${conc}% da faturação vem de ${top.name}.`));
  } else if (top) {
    items.push(finding("concentracao", "positivo", "Carteira diversificada",
      `Nenhum cliente ultrapassa ${conc}% da faturação.`));
  }

  const ticket = averageTicket(orders);
  if (ticket > 0) {
    items.push(finding("ticket", "neutro", "Ticket médio",
      `Valor médio por pedido: ${ticket.toFixed(2)} €.`));
  }

  return {
    generatedAt: new Date().toISOString(),
    revenue: totalRevenue(orders),
    growth,
    concentration: conc,
    sentiment: sentimentOf(items),
    items,
  };
}

function sentimentOf(items) {
  if (items.some((i) => i.status === "risco")) return "risco";
  if (items.some((i) => i.status === "atencao")) return "atencao";
  if (items.some((i) => i.status === "positivo")) return "positivo";
  return "neutro";
}

// ── Diagnóstico financeiro completo (vendas + contas a pagar) ──────────
// Score determinístico: parte de 100 e desconta penalizações documentadas,
// todas derivadas de dados reais. Só é gerado com orders + payables; sem
// payables o diagnóstico ficaria meio-cego e a tela mantém o mock + Demo.
// Sem histórico de score real: scorePrevious é sempre null (delta oculto).

/**
 * @param {Array} orders
 * @param {Array} payables
 * @param {{financialMetrics?: object}} [opts]  métricas da DRE central. Quando
 *   presentes, a rentabilidade (resultado e margem) vem da DRE em vez de
 *   "receitas - contas a pagar". Quando a fonte da DRE não existe, a dimensão
 *   NÃO é avaliada — ausência de dados nunca é tratada como mau desempenho.
 */
export function buildFinancialDiagnostic(orders, payables, opts) {
  if (!orders || !orders.length || !Array.isArray(payables)) return null; // [] = zero títulos reais => diagnóstico calculado

  // Métricas da DRE central (quando injetadas, são a ÚNICA fonte de rentabilidade).
  const fm = opts && opts.financialMetrics ? opts.financialMetrics : null;
  const fmPrev = opts && opts.previousFinancialMetrics ? opts.previousFinancialMetrics : null;
  const fmComparable = !!(opts && opts.financialComparable);

  // Mês âncora: o injetado pelo serviço (mesmo da DRE) ou, sem ele, o último dos
  // pedidos. Isto impede misturar operacional de julho com rentabilidade de junho.
  const key = (opts && opts.monthKey) || latestMonthKey(orders);
  const prev = prevKeyOf(key);

  const receitas = totalRevenue(ordersInMonth(orders, key));
  const despesas = totalPayables(payablesInMonth(payables, key));
  const resultado = round2(receitas - despesas);
  const margem = receitas > 0 ? round2((resultado / receitas) * 100) : null;

  const prevReceitas = prev ? totalRevenue(ordersInMonth(orders, prev)) : 0;
  const prevDespesas = prev ? totalPayables(payablesInMonth(payables, prev)) : 0;
  // Crescimento e deltas comparam SEMPRE o mês âncora com o anterior correspondente
  // (não o último mês dos pedidos, que pode estar em curso).
  const growth = prevReceitas > 0 ? round2(((receitas - prevReceitas) / prevReceitas) * 100) : null;
  const despDelta = prevDespesas > 0 ? round2(((despesas - prevDespesas) / prevDespesas) * 100) : null;

  // Rentabilidade: com a DRE presente, nada vem de "receitas - contas a pagar".
  const dreResultado = fm ? fm.profitability.netResult : null;
  const dreMargem = fm ? fm.profitability.netMarginPct : null;
  const rentabilidadeAvaliavel = fm != null && dreResultado != null;
  // Valores que o diagnóstico pode AFIRMAR. Com DRE incompleta ficam null: o motor
  // cala-se em vez de recuar para a pseudo-margem antiga.
  const resultadoAfirmavel = fm ? (rentabilidadeAvaliavel ? dreResultado : null) : resultado;
  const margemAfirmavel = fm ? (rentabilidadeAvaliavel ? dreMargem : null) : margem;

  // Variação do resultado: com DRE, só a partir do mês anterior da DRE e apenas
  // quando os períodos são comparáveis.
  const prevResultado = round2(prevReceitas - prevDespesas);
  const prevNetResult = fmPrev ? fmPrev.profitability.netResult : null;
  const resDelta = fm
    ? ((rentabilidadeAvaliavel && fmComparable && prevNetResult != null && prevNetResult !== 0)
        ? round2(((dreResultado - prevNetResult) / Math.abs(prevNetResult)) * 100)
        : null)
    : (prevResultado > 0 ? round2(((resultado - prevResultado) / prevResultado) * 100) : null);

  // Contas vencidas: títulos em aberto com vencimento no passado.
  const hoje = startOfDay(new Date());
  const vencidas = openPayables(payables).filter((t) => { const v = toDate(t.vencimento); return v && v < hoje; });
  const vencidasQtd = vencidas.length;
  const vencidasValor = round2(vencidas.reduce((a, t) => a + payableOpenBalance(t), 0));

  // Alertas críticos reais (excluindo o de vencidas, já penalizado à parte).
  const criticos = [...buildSalesAlerts(orders), ...buildExpenseAlerts(payables)]
    .filter((a) => a.severity === "danger" && a.id !== "d-vencidas").length;

  // Concentrações (cliente / categoria de despesa / fornecedor, no mês âncora).
  // Concentração SEMPRE do mês âncora: usar todos os pedidos contaminaria o
  // diagnóstico com clientes de outros meses (ex.: um mês em curso).
  const ordersMes = ordersInMonth(orders, key);
  const concCliente = clientConcentration(ordersMes);
  const topCli = topClients(ordersMes, 1)[0] || null;
  const cats = expenseByCategory(payablesInMonth(payables, key)).filter((c) => c.name !== "Sem categoria");
  const catShare = despesas > 0 && cats[0] ? round2((cats[0].value / despesas) * 100) : 0;
  const supMap = new Map();
  for (const t of billablePayables(payablesInMonth(payables, key))) {
    const n = t.contato && t.contato.nome;
    if (!n) continue;
    supMap.set(n, (supMap.get(n) || 0) + (Number(t.valor) || 0));
  }
  let topSup = null;
  for (const [nome, val] of supMap) if (!topSup || val > topSup.val) topSup = { nome, val };
  const supShare = despesas > 0 && topSup ? round2((topSup.val / despesas) * 100) : 0;

  // ── Score ──
  let score = 100;
  const penalizacoes = [];
  const naoAvaliados = []; // dimensões sem fonte: registadas, nunca penalizadas
  const pen = (pts, motivo) => { score -= pts; penalizacoes.push({ pts, motivo }); };

  // ── Rentabilidade: da DRE central quando disponível ──
  // Prioridade: resultado líquido e margem líquida da DRE. Sem essa fonte
  // (tipicamente por falta de CMV), a dimensão fica NÃO AVALIADA: não se
  // penaliza a empresa por uma lacuna da Finer.
  if (rentabilidadeAvaliavel) {
    if (dreResultado < 0) pen(25, "Resultado líquido do mês negativo");
    else if (dreMargem !== null && dreMargem < 10) pen(10, "Margem líquida do mês abaixo de 10%");
    else if (dreMargem !== null && dreMargem < 20) pen(5, "Margem líquida do mês abaixo de 20%");
  } else if (fm != null) {
    naoAvaliados.push({
      dimensao: "rentabilidade",
      motivo: "Resultado líquido sem fonte completa (CMV indisponível): dimensão não avaliada.",
    });
  } else {
    // Sem métricas da DRE injetadas: comportamento anterior (compatibilidade).
    if (resultado < 0) pen(25, "Resultado do mês negativo");
    else if (margem !== null && margem < 10) pen(10, "Margem do mês abaixo de 10%");
    else if (margem !== null && margem < 20) pen(5, "Margem do mês abaixo de 20%");
  }

  if (growth !== null && growth <= -10) pen(15, "Quebra de faturação face ao mês anterior");
  else if (growth !== null && growth < 0) pen(7, "Faturação em desaceleração");

  if (despesas > 0 && vencidasValor > despesas * 0.2) pen(15, "Valor vencido elevado face às despesas do mês");
  else if (vencidasValor > 0) pen(7, "Existem contas a pagar vencidas");

  if (criticos > 0) pen(Math.min(criticos * 5, 15), "Alertas críticos ativos");

  if (concCliente >= 40) pen(8, "Concentração elevada num cliente");
  if (catShare >= 40) pen(4, "Concentração numa categoria de despesa");
  if (supShare >= 40) pen(4, "Concentração num fornecedor");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const estado = score >= 75 ? "Saudável" : score >= 50 ? "Atenção" : "Crítico";
  const scoreLabel = score >= 90 ? "Excelente" : score >= 75 ? "Bom" : score >= 50 ? "Regular" : "Fraco";

  // ── Problemas (base real; € apenas quando existe valor real) ──
  const problemas = [];
  if (vencidasQtd > 0) {
    problemas.push({
      id: "pr-vencidas",
      severidade: despesas > 0 && vencidasValor > despesas * 0.2 ? "danger" : "warning",
      titulo: "Contas a pagar vencidas",
      descricao: `${vencidasQtd} ${vencidasQtd === 1 ? "título vencido" : "títulos vencidos"} por regularizar, no total de ${formatMoney(vencidasValor)}.`,
      impacto: -vencidasValor,
    });
  }
  if (resultadoAfirmavel != null && resultadoAfirmavel < 0) {
    problemas.push({
      id: "pr-resultado", severidade: "danger", titulo: "Resultado do mês negativo",
      descricao: fm
        ? "O resultado líquido do mês de referência foi negativo."
        : "As despesas superaram as receitas no mês em análise.",
      // Resultado negativo NÃO é um impacto recuperável: continua null.
      impacto: null,
    });
  }
  if (growth !== null && growth < 0) {
    problemas.push({
      id: "pr-vendas",
      severidade: growth <= -10 ? "danger" : "warning",
      titulo: growth <= -10 ? "Quebra de faturação" : "Faturação em desaceleração",
      descricao: `A faturação caiu ${pct(Math.abs(growth))}% face ao mês anterior.`,
      impacto: null, // variação de faturação não é impacto financeiro recuperável
    });
  }
  if (despDelta !== null && despDelta >= 20) {
    problemas.push({
      id: "pr-despesas", severidade: "warning", titulo: "Despesas em forte subida",
      descricao: `As despesas subiram ${pct(despDelta)}% face ao mês anterior.`,
      impacto: null, // variação de despesas não é impacto financeiro recuperável
    });
  }
  if (resultadoAfirmavel != null && resultadoAfirmavel >= 0 && margemAfirmavel !== null && margemAfirmavel < 10) {
    problemas.push({
      id: "pr-margem", severidade: "warning", titulo: "Margem do mês reduzida",
      descricao: fm
        ? `A margem líquida do mês de referência foi de ${pct(margemAfirmavel)}%.`
        : `O resultado representa apenas ${pct(margemAfirmavel)}% das receitas do mês.`,
      impacto: null,
    });
  }
  if (topCli && concCliente >= 40) {
    problemas.push({
      id: "pr-conc-cliente", severidade: "warning", titulo: "Dependência de um cliente",
      descricao: `${pct(concCliente)}% da faturação vem de ${topCli.name}.`,
      impacto: null,
    });
  }
  if (cats[0] && catShare >= 40) {
    problemas.push({
      id: "pr-conc-cat", severidade: "warning", titulo: "Concentração numa categoria de despesa",
      descricao: `${pct(catShare)}% das despesas do mês estão em ${cats[0].name}.`,
      impacto: null,
    });
  }
  if (topSup && supShare >= 40) {
    problemas.push({
      id: "pr-conc-forn", severidade: "warning", titulo: "Concentração num fornecedor",
      descricao: `${pct(supShare)}% das despesas do mês são para ${topSup.nome}.`,
      impacto: null,
    });
  }
  const sevRank = { danger: 0, warning: 1 };
  problemas.sort((a, b) => (sevRank[a.severidade] ?? 9) - (sevRank[b.severidade] ?? 9));
  const problemasFinal = problemas.slice(0, 5);

  // ── Ações (recomendações operacionais; sem € inventado, prazos sugeridos) ──
  const ACAO_POR_PROBLEMA = {
    "pr-vencidas":     { titulo: "Regularizar contas vencidas",        descricao: "Priorizar o pagamento dos títulos vencidos para evitar juros e proteger a relação com fornecedores.", prazo: "15 dias" },
    "pr-resultado":    { titulo: "Travar o desvio do mês",             descricao: "Rever as maiores despesas do mês e adiar gastos não essenciais até o resultado voltar a positivo.", prazo: "30 dias" },
    "pr-vendas":       { titulo: "Reforçar a ação comercial",          descricao: "Contactar os principais clientes e ativar propostas pendentes para recuperar a faturação.", prazo: "30 dias" },
    "pr-despesas":     { titulo: "Rever custos do mês",                descricao: "Analisar as categorias que mais subiram e renegociar ou cortar onde for possível.", prazo: "30 dias" },
    "pr-margem":       { titulo: "Rever preços e custos",              descricao: "Avaliar ajustes de preço ou redução de custos para recuperar margem.", prazo: "30 dias" },
    "pr-conc-cliente": { titulo: "Diversificar a carteira de clientes", descricao: "Reduzir a dependência do cliente principal com prospeção ativa de novos clientes.", prazo: "60 dias" },
    "pr-conc-cat":     { titulo: "Rever a categoria dominante",         descricao: "Analisar a categoria com maior peso e procurar alternativas ou renegociação.", prazo: "60 dias" },
    "pr-conc-forn":    { titulo: "Diversificar fornecedores",           descricao: "Procurar fornecedores alternativos ou renegociar condições com o principal.", prazo: "60 dias" },
  };
  const acoes = problemasFinal
    .map((pr, i) => {
      const base = ACAO_POR_PROBLEMA[pr.id];
      return base ? { id: `ac-${i + 1}`, titulo: base.titulo, descricao: base.descricao, impacto: null, prazo: base.prazo } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
  if (!acoes.length) {
    acoes.push({
      id: "ac-1", titulo: "Manter o acompanhamento mensal",
      descricao: "Sem problemas relevantes identificados. Manter a disciplina de acompanhamento de receitas, despesas e vencimentos.",
      impacto: null, prazo: "30 dias",
    });
  }

  // ── O que mudou (deltas reais; tendência = bom/mau, não sinal) ──
  const mudancas = [];
  if (growth !== null) mudancas.push({ label: "Faturação", valor: `${growth > 0 ? "+" : ""}${pct(growth)}%`, tendencia: growth >= 0 ? "up" : "down", detalhe: "vs mês anterior" });
  if (despDelta !== null) mudancas.push({ label: "Despesas", valor: `${despDelta > 0 ? "+" : ""}${pct(despDelta)}%`, tendencia: despDelta <= 0 ? "up" : "down", detalhe: "vs mês anterior" });
  if (resDelta !== null) mudancas.push({ label: "Resultado", valor: `${resDelta > 0 ? "+" : ""}${pct(resDelta)}%`, tendencia: resDelta >= 0 ? "up" : "down", detalhe: "vs mês anterior" });
  mudancas.push({
    label: "Contas vencidas",
    valor: `${vencidasQtd} ${vencidasQtd === 1 ? "título" : "títulos"}`,
    tendencia: vencidasQtd > 0 ? "down" : "up",
    detalhe: vencidasQtd > 0 ? `${formatMoney(vencidasValor)} em aberto` : "nada por regularizar",
  });

  // ── Resumo executivo (frases-template com números reais) ──
  const frases = [];
  if (fm) {
    // Linguagem de DRE: nunca chamar "resultado" a receitas menos contas a pagar.
    const receitaLiquida = fm.revenue ? fm.revenue.net : null;
    if (receitaLiquida != null && rentabilidadeAvaliavel) {
      frases.push(`No mês de referência, a receita líquida foi de ${formatMoney(receitaLiquida)}, com resultado líquido de ${formatMoney(dreResultado)}${dreMargem !== null ? ` e margem líquida de ${pct(dreMargem)}%` : ""}.`);
    } else if (receitaLiquida != null) {
      frases.push(`A receita líquida do mês de referência foi de ${formatMoney(receitaLiquida)}. O resultado líquido não pôde ser apurado com os dados disponíveis.`);
    } else {
      frases.push("A receita líquida do mês de referência não pôde ser apurada com os dados disponíveis.");
    }
    // Contas a pagar entram apenas como contexto OPERACIONAL, nunca como "despesas da DRE".
    frases.push(`No mesmo período foram registados ${formatMoney(despesas)} em contas a pagar.`);
  } else {
    frases.push(`No mês em análise, a empresa faturou ${formatMoney(receitas)} e registou ${formatMoney(despesas)} em despesas, com um resultado de ${formatMoney(resultado)}${margem !== null ? ` (margem de ${pct(margem)}%)` : ""}.`);
  }
  if (growth !== null) frases.push(growth >= 0 ? `A faturação cresceu ${pct(growth)}% face ao mês anterior.` : `A faturação caiu ${pct(Math.abs(growth))}% face ao mês anterior.`);
  frases.push(vencidasQtd > 0
    ? `Existem ${vencidasQtd} ${vencidasQtd === 1 ? "título vencido" : "títulos vencidos"} num total de ${formatMoney(vencidasValor)} por regularizar.`
    : "Não existem contas a pagar vencidas.");
  if (topCli && concCliente >= 25) frases.push(`${pct(concCliente)}% da faturação depende de ${topCli.name}.`);

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // ── Impacto identificado (só valores DIRETAMENTE comprováveis) ──
  // Regra: entram apenas montantes concretos já apurados a partir dos dados reais.
  // NÃO entram faturação perdida, risco, concentração nem quedas percentuais
  // convertidas em euros — não existe fórmula aprovada para isso.
  // Hoje o único montante comprovável no âmbito do motor é o das contas a pagar
  // vencidas (valor real por regularizar).
  const impactBreakdown = [];
  if (vencidasQtd > 0 && vencidasValor > 0) {
    impactBreakdown.push({
      id: "contas-vencidas",
      label: `Contas a pagar vencidas (${vencidasQtd})`,
      amount: round2(vencidasValor),
    });
  }
  const impactIsQuantified = impactBreakdown.length > 0;
  const impactAmount = impactIsQuantified
    ? round2(impactBreakdown.reduce((a, b) => a + b.amount, 0))
    : null;
  const impactLabel = impactIsQuantified
    ? "Valor vencido por regularizar"
    : "Impacto não quantificado";

  return {
    estado,
    score,
    scoreLabel,
    scorePrevious: null, // sem histórico real de score; delta fica oculto
    prioridadeMaxima: problemasFinal[0] ? problemasFinal[0].titulo : "Manter o acompanhamento regular",
    ultimaAtualizacao: `hoje às ${hhmm}`,
    problemas: problemasFinal,
    acoes,
    mudancasUltimoMes: mudancas,
    resumoExecutivo: frases.join(" "),
    penalizacoes, // transparência do cálculo (não renderizado)
    naoAvaliados, // dimensões não avaliadas por falta de fonte (nunca penalizam)
    // Impacto: explícito e rastreável (null quando não quantificável).
    impactAmount,
    impactLabel,
    impactBreakdown,
    impactIsQuantified,
    // Sem snapshots mensais de score: não há evolução real a apresentar.
    // Explicitamente null para o ecrã mostrar estado vazio em vez da série mock.
    evolucao: null,
  };
}

// ── auxiliares locais ───────────────────────────────────────