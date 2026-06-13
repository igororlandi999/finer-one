// src/utils/alertsEngine.js
// Gera alertas a partir de vendas, no formato exato da tela Alertas:
// { id, severity:'danger'|'warning'|'info'|'success', category, title, description, timestamp, acao }
// Sem React. Apenas alertas de origem comercial/vendas.

import {
  monthOverMonthGrowth,
  clientConcentration,
  topClients,
  averageTicket,
  revenueByMonth,
  revenueByProduct,
  billable,
} from "./financialCalculations.js";

function mk(id, severity, category, title, description, acao = "—") {
  return { id, severity, category, title, description, timestamp: "Hoje", acao };
}

export function buildSalesAlerts(orders) {
  const out = [];
  const hasData = billable(orders).length > 0;
  if (!hasData) return out;

  // Quebra de faturação
  const growth = monthOverMonthGrowth(orders);
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

  // Concentração de receita
  const conc = clientConcentration(orders);
  const top = topClients(orders, 1)[0];
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
  const drop = topProductDrop(orders);
  if (drop) {
    out.push(mk("v-prod", "warning", "Produtos",
      "Produto com queda de vendas",
      `${drop.name} caiu ${Math.abs(drop.delta)}% face ao mês anterior.`,
      "Analisar preço e procura do produto"));
  }

  // Ticket médio em queda
  const ticketTrend = ticketMonthTrend(orders);
  if (ticketTrend !== null && ticketTrend <= -10) {
    out.push(mk("v-ticket", "warning", "Faturação",
      "Ticket médio em queda",
      `O ticket médio recuou ${Math.abs(ticketTrend)}% face ao mês anterior.`,
      "Rever mix de produtos e descontos"));
  } else {
    const t = averageTicket(orders);
    if (t > 0) {
      out.push(mk("v-ticket-info", "info", "Faturação",
        "Ticket médio",
        `O valor médio por pedido está em ${t.toFixed(2)} €.`, "—"));
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

// ── auxiliares internos ───────────────────────────────────────

function ticketMonthTrend(orders) {
  const months = revenueByMonth(orders);
  if (months.length < 2) return null;
  const lastKey = months[months.length - 1].month;
  const prevKey = months[months.length - 2].month;
  const lastList = (orders || []).filter((o) => o.status !== "cancelada" && keyOf(o.date) === lastKey);
  const prevList = (orders || []).filter((o) => o.status !== "cancelada" && keyOf(o.date) === prevKey);
  const lastT = lastList.length ? sum(lastList) / lastList.length : 0;
  const prevT = prevList.length ? sum(prevList) / prevList.length : 0;
  if (prevT === 0) return null;
  return Math.round(((lastT - prevT) / prevT) * 1000) / 10;
}

function topProductDrop(orders) {
  const months = revenueByMonth(orders);
  if (months.length < 2) return null;
  const lastKey = months[months.length - 1].month;
  const prevKey = months[months.length - 2].month;
  const last = revenueByProduct((orders || []).filter((o) => keyOf(o.date) === lastKey));
  const prev = revenueByProduct((orders || []).filter((o) => keyOf(o.date) === prevKey));
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

function keyOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function sum(list) {
  return list.reduce((a, o) => a + (Number(o.total) || 0), 0);
}
