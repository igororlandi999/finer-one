// src/utils/alertsEngine.js
// Gera alertas a partir de vendas, no formato exato da tela Alertas:
// { id, severity:'danger'|'warning'|'info'|'success', category, title, description, timestamp, acao }
// Sem React. Apenas alertas de origem comercial/vendas.

import {
  monthOverMonthGrowth,
  totalRevenue,
  ordersInMonth,
  clientConcentration,
  topClients,
  averageTicket,
  revenueByMonth,
  revenueByProduct,
  billable,
  round2,
  toDate,
  startOfDay,
  prevMonthKey,
} from "./financialCalculations.js";
import { formatMoney } from "../lib/currency.js";

import {
  billablePayables,
  totalPayables,
  latestPayableMonth,
  payablesInMonth,
  payableMoM,
  expenseByCategory,
  pendingPayables,
} from "./expenseCalculations.js";

function mk(id, severity, category, title, description, acao = "—") {
  return { id, severity, category, title, description, timestamp: "Hoje", acao };
}

/**
 * @param {Array} orders
 * @param {{monthKey?: string, previousMonthKey?: string, comparable?: boolean}} [opts]
 *   Quando o mês âncora é injetado, o crescimento compara ESSE mês com o anterior
 *   — nunca o último mês dos pedidos, que pode estar em curso. Com comparable
 *   explicitamente false, não se afirma queda nem subida.
 */
export function buildSalesAlerts(orders, opts) {
  const out = [];
  const hasData = billable(orders).length > 0;
  if (!hasData) return out;

  // Quebra de faturação: só entre períodos comparáveis.
  const growth = growthEntrePeriodos_(orders, opts);
  if (growth !== null && growth <= -10) {
    out.push(mk("v-queda", "danger", "Faturação",
      "Quebra de faturação",
      `A faturação caiu ${Math.abs(growth)}% face ao mês anterior.`,
      "Rever pipeline comercial e reativar clientes"));
  } else if (growth !== null && growth >= 15) {
    out.push(mk("v-subida", "success", "Crescimento",
      "Faturação em crescimento",
      `A faturação subiu ${growth}% face ao mês anterior.`,
      "Manter o ritmo comercial"));
  }

  // Concentração de receita: do MÊS ÂNCORA quando injetado (senão, histórico).
  const ordersConc = (opts && opts.monthKey) ? ordersInMonth(orders, opts.monthKey) : orders;
  const conc = clientConcentration(ordersConc);
  const top = topClients(ordersConc, 1)[0];
  if (top && conc >= 40) {
    out.push(mk("v-conc", "danger", "Concentração",
      "Dependência de cliente",
      `${conc}% da faturação depende de ${top.name}.`,
      "Diversificar a carteira de clientes"));
  } else if (top && conc >= 25) {
    out.push(mk("v-conc", "warning", "Concentração",
      "Concentração de receita",
      `${conc}% da faturação concentra-se em ${top.name}.`,
      "Reduzir dependência do cliente principal"));
  }

  // Produto em queda (compara último mês com o anterior por produto)
  const drop = topProductDrop(orders, opts);
  if (drop) {
    out.push(mk("v-prod", "warning", "Produtos",
      "Produto com queda de vendas",
      `${drop.name} caiu ${Math.abs(drop.delta)}% face ao mês anterior.`,
      "Analisar preço e procura do produto"));
  }

  // Ticket médio em queda
  const ticketTrend = ticketMonthTrend(orders, opts);
  if (ticketTrend !== null && ticketTrend <= -10) {
    out.push(mk("v-ticket", "warning", "Faturação",
      "Ticket médio em queda",
      `O ticket médio recuou ${Math.abs(ticketTrend)}% face ao mês anterior.`,
      "Rever mix de produtos e descontos"));
  } else {
    // Informativo: com mês âncora injetado mostra o ticket DESSE mês; sem opts,
    // mantém o comportamento legado (média de todo o histórico).
    const ticketOrders = (opts && opts.monthKey) ? ordersInMonth(orders, opts.monthKey) : orders;
    const t = averageTicket(ticketOrders);
    if (t > 0) {
      out.push(mk("v-ticket-info", "info", "Faturação",
        "Ticket médio",
        `O valor médio por pedido está em ${formatMoney(t)}.`, "—"));
    }
  }

  return out;
}

// Métricas de severidade calculadas a partir de uma lista de alertas.
export function severityCounts(list, resolvidosFallback = 0) {
  const c = { danger: 0, warning: 0, info: 0, success: 0 };
  for (const a of list || []) c[a.severity] = (c[a.severity] || 0) + 1;
  return {
    criticos: c.danger,
    atencao: c.warning,
    informativos: c.info,
    resolvidos: c.success || resolvidosFallback,
  };
}

/**
 * Alertas reais derivados de contas a pagar (sales.despesas). Mesmo formato dos de vendas.
 * Sem payables billable => nenhum alerta (nao inventar).
 *
 * Dois grupos, com regras de tempo diferentes:
 *   OPERACIONAIS ("até hoje")  — d-vencidas, d-proximos7, d-pendentes.
 *     Olham a situação atual dos títulos. NUNCA são ancorados no mês financeiro:
 *     uma conta vencida hoje é um problema de hoje, mesmo que o mês fechado seja junho.
 *   MENSAIS (fotografia de um mês) — d-subida-mes, d-cat-conc, d-forn-alto, d-cat-mom.
 *     Sem opts, mantêm o comportamento legado (latestPayableMonth), que pode
 *     apanhar um mês em curso. Com opts.monthKey, usam SEMPRE esse mês.
 *
 * @param {Array} payables
 * @param {{monthKey?: string, previousMonthKey?: string, comparable?: boolean, partial?: boolean}} [opts]
 *   monthKey        mês âncora das contas a pagar (não é o mês dos pedidos — ver serviço).
 *   previousMonthKey  omitido => prevMonthKey(monthKey).
 *   comparable      false => os alertas COMPARATIVOS (d-subida-mes, d-cat-mom) não são
 *                   emitidos: um mês em curso não se compara com um mês fechado.
 *   partial         true => o mês âncora ainda está em curso; os alertas de concentração
 *                   continuam a ser emitidos, mas o texto declara a parcialidade.
 */
export function buildExpenseAlerts(payables, opts) {
  const out = [];
  const billables = billablePayables(payables);
  if (!billables.length) return out;

  const today = startOfDay(new Date());
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);

  // Apenas titulos em aberto (situacao 1).
  const open = (payables || []).filter((p) => Number(p && p.situacao) === 1);

  // A. Contas a pagar vencidas (aberto + vencimento < hoje).
  const overdue = open.filter((p) => { const v = toDate(p.vencimento); return v && v < today; });
  if (overdue.length) {
    const total = round2(overdue.reduce((a, p) => a + (Number(p.valor) || 0), 0));
    out.push(mk("d-vencidas", "danger", "Despesas",
      "Contas a pagar vencidas",
      `${overdue.length} ${overdue.length === 1 ? "conta vencida" : "contas vencidas"} no total de ${formatMoney(total)}.`,
      "Regularizar pagamentos em atraso"));
  }

  // B. Pagamentos a vencer nos proximos 7 dias.
  const soon = open.filter((p) => { const v = toDate(p.vencimento); return v && v >= today && v <= in7; });
  if (soon.length) {
    const total = round2(soon.reduce((a, p) => a + (Number(p.valor) || 0), 0));
    out.push(mk("d-proximos7", "warning", "Despesas",
      "Pagamentos a vencer em breve",
      `${soon.length} ${soon.length === 1 ? "conta vence" : "contas vencem"} nos proximos 7 dias (${formatMoney(total)}).`,
      "Garantir tesouraria para os pagamentos"));
  }

  // ── Resolução do mês dos alertas MENSAIS ────────────────────
  // Com âncora injetada, é ela que manda; sem ela, comportamento legado.
  const ancora = (opts && opts.monthKey) ? opts.monthKey : null;
  const mesAlvo = ancora || latestPayableMonth(payables);
  const mesAnterior = ancora
    ? ((opts && opts.previousMonthKey) || prevMonthKey(ancora))
    : prevMonthKey(mesAlvo);
  // Só se bloqueia a comparação quando há âncora: sem opts nada muda.
  const comparavel = ancora ? (opts.comparable !== false) : true;
  const emCurso = !!(ancora && opts.partial);

  // C. Despesa mensal a subir forte vs mes anterior.
  // Com âncora: total(mesAlvo) vs total(mesAnterior), explicitamente — payableMoM
  // escolheria sozinha os dois últimos meses com títulos (podendo ser o parcial).
  const mom = ancora
    ? (comparavel ? payablesMoMEntre_(payables, mesAlvo, mesAnterior) : null)
    : payableMoM(payables);
  if (mom !== null && mom >= 20) {
    out.push(mk("d-subida-mes", "warning", "Despesas",
      "Despesas em forte subida",
      `As despesas subiram ${mom}% face ao mes anterior.`,
      "Rever custos e pagamentos do mes"));
  }

  // D. Muitas contas pendentes.
  const pend = pendingPayables(payables);
  if (pend.qtd >= 10) {
    out.push(mk("d-pendentes", "info", "Despesas",
      "Muitas contas pendentes",
      `Existem ${pend.qtd} contas por pagar, no total de ${formatMoney(pend.valor)}.`,
      "Planear a ordem de pagamentos"));
  }

  // Base do mes analisado para concentracao (categoria/fornecedor).
  const monthTotal = totalPayables(payablesInMonth(payables, mesAlvo));

  // E. Categoria concentrada no mes (exclui "Sem categoria").
  if (monthTotal > 0) {
    const cats = expenseByCategory(payablesInMonth(payables, mesAlvo))
      .filter((c) => c.name !== "Sem categoria");
    const topCat = cats[0];
    if (topCat) {
      const share = Math.round((topCat.value / monthTotal) * 1000) / 10;
      if (share >= 40) {
        out.push(mk("d-cat-conc", "warning", "Despesas",
          "Categoria de despesa concentrada",
          emCurso
            ? `Até ao momento, ${share}% das despesas do mês em curso estão em ${topCat.name}.`
            : `${share}% das despesas do mes estao em ${topCat.name}.`,
          "Avaliar dependencia desta categoria"));
      }
    }
  }

  // F. Fornecedor com gasto alto no mes.
  if (monthTotal > 0) {
    const inMonth = billablePayables(payablesInMonth(payables, mesAlvo));
    const bySupplier = new Map();
    for (const p of inMonth) {
      const nome = (p.contato && p.contato.nome) || null;
      if (!nome) continue;
      bySupplier.set(nome, (bySupplier.get(nome) || 0) + (Number(p.valor) || 0));
    }
    let topSup = null;
    for (const [nome, val] of bySupplier) if (!topSup || val > topSup.val) topSup = { nome, val };
    if (topSup) {
      const share = Math.round((topSup.val / monthTotal) * 1000) / 10;
      if (share >= 40) {
        out.push(mk("d-forn-alto", "info", "Despesas",
          "Concentracao num fornecedor",
          emCurso
            ? `Até ao momento, ${share}% das despesas do mês em curso são para ${topSup.nome}.`
            : `${share}% das despesas do mes sao para ${topSup.nome}.`,
          "Diversificar ou renegociar com o fornecedor"));
      }
    }
  }

  // G. Categoria de despesa em forte subida vs mes anterior.
  // Comparativo: com âncora usa monthKey vs previousMonthKey e cala-se quando os
  // dois meses não são comparáveis (parcial vs fechado nunca vira conclusão).
  if (mesAlvo && mesAnterior && comparavel) {
    const atuais = expenseByCategory(payablesInMonth(payables, mesAlvo));
    const antesMap = new Map(expenseByCategory(payablesInMonth(payables, mesAnterior)).map((c) => [c.name, c.value]));
    let pior = null;
    for (const c of atuais) {
      if (c.name === "Sem categoria") continue;
      const antes = Number(antesMap.get(c.name)) || 0;
      if (antes <= 0 || c.value < 500) continue; // exige historico e valor relevante
      const growth = Math.round(((c.value - antes) / antes) * 100);
      if (growth >= 50 && (!pior || growth > pior.growth)) pior = { name: c.name, value: c.value, growth };
    }
    if (pior) {
      out.push(mk("d-cat-mom", "warning", "Despesas",
        "Categoria de despesa em forte subida",
        `A categoria "${pior.name}" subiu ${pior.growth}% face ao mes anterior (${formatMoney(pior.value)} este mes).`,
        "Rever gastos e contratos desta categoria"));
    }
  }

  return out;
}

// ── auxiliares internos ───────────────────────────────────────

/* Variação % das despesas entre dois meses EXPLÍCITOS. Reutiliza payablesInMonth
 * e totalPayables — a regra de quais títulos contam (cancelados fora) vive lá,
 * não é duplicada aqui. Sem base anterior positiva, não há conclusão. */
function payablesMoMEntre_(payables, mesAtual, mesAnterior) {
  if (!mesAtual || !mesAnterior) return null;
  const atual = totalPayables(payablesInMonth(payables, mesAtual));
  const anterior = totalPayables(payablesInMonth(payables, mesAnterior));
  if (!(anterior > 0)) return null;
  return round2(((atual - anterior) / anterior) * 100);
}

/* Resolve o par de meses a comparar. Com opts.monthKey, usa SEMPRE esse mês e o
 * anterior; com comparable === false, devolve null (nada é afirmado). Sem opts,
 * mantém o comportamento antigo (dois últimos meses com receita). */
function paresDeMeses_(orders, opts) {
  if (opts && opts.monthKey) {
    if (opts.comparable === false) return null;
    return { lastKey: opts.monthKey, prevKey: opts.previousMonthKey || prevMonthKey(opts.monthKey) };
  }
  const months = revenueByMonth(orders);
  if (months.length < 2) return null;
  return { lastKey: months[months.length - 1].month, prevKey: months[months.length - 2].month };
}

function ticketMonthTrend(orders, opts) {
  const par = paresDeMeses_(orders, opts);
  if (!par) return null;
  const { lastKey, prevKey } = par;
  const lastList = ordersInMonth(orders, lastKey);
  const prevList = ordersInMonth(orders, prevKey);
  const lastT = averageTicket(lastList);
  const prevT = averageTicket(prevList);
  if (prevT === 0) return null;
  return Math.round(((lastT - prevT) / prevT) * 1000) / 10;
}

function topProductDrop(orders, opts) {
  const par = paresDeMeses_(orders, opts);
  if (!par) return null;
  const { lastKey, prevKey } = par;
  const last = revenueByProduct(ordersInMonth(orders, lastKey));
  const prev = revenueByProduct(ordersInMonth(orders, prevKey));
  const prevMap = new Map(prev.map((p) => [p.id, p.value]));
  let worst = null;
  for (const p of last) {
    const before = prevMap.get(p.id);
    if (!before || before === 0) continue;
    const delta = Math.round(((p.value - before) / before) * 1000) / 10;
    if (delta <= -20 && (!worst || delta < worst.delta)) worst = { name: p.name, delta };
  }
  return worst;
}

/* NOTA: este ficheiro NÃO tem parser de datas próprio. Existiu aqui um keyOf()
 * que fazia new Date(date) — com "YYYY-MM-DD" isso é lido como meia-noite UTC e,
 * em São Paulo (UTC-3), 2026-06-01 caía em maio. A conversão de datas civis é
 * responsabilidade única de financialCalculations (parseLocalISODate/monthKey),
 * consumida aqui através de ordersInMonth(). Não reintroduzir um segundo parser. */

/* ====================================================================================
 * Crescimento entre o mês âncora e o anterior. Sem mês injetado, mantém o
 * comportamento antigo (compatibilidade). Com comparable === false, devolve null:
 * um mês em curso não produz afirmação categórica de queda ou subida.
 * ==================================================================================== */
function growthEntrePeriodos_(orders, opts) {
  if (!opts || !opts.monthKey) return monthOverMonthGrowth(orders);
  if (opts.comparable === false) return null;
  const prevKey = opts.previousMonthKey || prevMonthKey(opts.monthKey);
  const atual = totalRevenue(ordersInMonth(orders, opts.monthKey));
  const anterior = totalRevenue(ordersInMonth(orders, prevKey));
  if (!(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/* ====================================================================================
 * ALERTAS FINANCEIROS (DRE) — leem SEMPRE financialMetrics; nunca recalculam.
 *
 * Regras desta fase — apenas duas, ambas de sinal (não de limiar arbitrário):
 *   - resultado líquido (após retiradas dos sócios) < 0;
 *   - EBITDA < 0 — regra NOVA nesta fase, documentada como tal.
 * Não existe alerta de margem líquida: ver nota dentro da função.
 *
 * Regras de disponibilidade:
 *   - métrica null/unavailable  -> nenhum alerta (ausência de fonte nunca vira mau desempenho);
 *   - partial                   -> sem afirmação categórica de comparação entre períodos;
 *   - manual/mixed              -> alerta permitido, com a origem indicada no texto.
 * Impacto monetário é SEMPRE null: margem e resultado não são valores recuperáveis.
 * ==================================================================================== */
export function buildFinancialAlerts({ financialMetrics, monthKey } = {}) {
  const out = [];
  const fm = financialMetrics;
  if (!fm) return out;

  const prof = fm.profitability || {};
  const disp = prof.availability || {};
  const manual = (a) => (a === "manual" || a === "mixed" ? " (inclui valor manual)" : "");
  const utilizavel = (a) => a === "real" || a === "manual" || a === "mixed" || a === "partial";

  // Resultado líquido negativo (limiar do score: < 0)
  if (prof.netResult != null && utilizavel(disp.netResult) && prof.netResult < 0) {
    out.push(mk("f-resultado", "danger", "Rentabilidade",
      "Resultado líquido após retiradas negativo",
      `O resultado líquido após as retiradas dos sócios${monthKey ? `, em ${monthKey},` : ""} foi de ${formatMoney(prof.netResult)}${manual(disp.netResult)}.`,
      "Rever estrutura de custos e preços"));
  }

  // NOTA: não existe alerta de margem líquida. A margem líquida é apurada DEPOIS
  // das retiradas dos sócios, pelo que um limiar sobre ela faria uma empresa
  // operacionalmente rentável parecer pouco rentável apenas por os sócios terem
  // levantado o resultado. Um alerta sobre margem EBITDA exigiria um limiar novo,
  // que não foi aprovado nesta fase.

  // EBITDA negativo — REGRA NOVA nesta fase (não existia equivalente anterior).
  if (prof.ebitda != null && utilizavel(disp.ebitda) && prof.ebitda < 0) {
    out.push(mk("f-ebitda", "danger", "Rentabilidade",
      "EBITDA negativo",
      `O EBITDA${monthKey ? ` de ${monthKey}` : ""} foi de ${formatMoney(prof.ebitda)}${manual(disp.ebitda)}.`,
      "Rever despesas operacionais e margem bruta"));
  }

  return out;
}

function pctTxt_(v) {
  return String(v).replace(".", ",");
}