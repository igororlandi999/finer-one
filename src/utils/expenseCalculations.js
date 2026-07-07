// src/utils/expenseCalculations.js
// Cálculos puros de Despesas a partir de contas a pagar normalizadas.
// situacao: 1 = em aberto | 2 = pago/baixado | 5 = cancelado (excluído dos totais).
// Mantém a lógica fora do JSX, espelhando o padrão de financialCalculations.js.

import { round2, toDate, monthKey, MONTHS_PT } from "./financialCalculations.js";

export const PAYABLE_COUNTED = [1, 2]; // 5 (cancelado) nunca entra nos totais

export function billablePayables(payables) {
  return (payables || []).filter((p) => p && PAYABLE_COUNTED.includes(Number(p.situacao)));
}

// Data de referência da despesa: emissão quando existir (vem do detalhe), senão vencimento.
export function payableDate(p) {
  return (p && (p.dataEmissao || p.vencimento)) || null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 'paga' | 'pendente' | 'atraso'
export function payableStatus(p, now = new Date()) {
  if (Number(p?.situacao) === 2) return "paga";
  const venc = toDate(p?.vencimento);
  if (venc && venc < startOfDay(now)) return "atraso";
  return "pendente";
}

export function totalPayables(payables) {
  return round2(billablePayables(payables).reduce((a, p) => a + (Number(p.valor) || 0), 0));
}

// [{ month:'2026-05', value }] cronológico.
export function payablesByMonth(payables) {
  const map = new Map();
  for (const p of billablePayables(payables)) {
    const key = monthKey(payableDate(p));
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(p.valor) || 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round2(value) }));
}

export function latestPayableMonth(payables) {
  const m = payablesByMonth(payables);
  return m.length ? m[m.length - 1].month : null;
}

export function payablesInMonth(payables, key) {
  if (!key) return [];
  return (payables || []).filter((p) => monthKey(payableDate(p)) === key);
}

// Crescimento do último mês face ao anterior, em %.
export function payableMoM(payables) {
  const m = payablesByMonth(payables);
  if (m.length < 2) return null;
  const last = m[m.length - 1].value;
  const prev = m[m.length - 2].value;
  if (prev === 0) return null;
  return round2(((last - prev) / prev) * 100);
}

function distinctExpenseDays(list) {
  const set = new Set();
  for (const p of list) {
    const d = toDate(payableDate(p));
    if (d) set.add(d.toDateString());
  }
  return set.size;
}

// Média por dia COM despesa no mês (evita divisão enganosa por dias sem movimento).
export function avgDailyForMonth(payables, key) {
  const list = billablePayables(payablesInMonth(payables, key));
  if (!list.length) return 0;
  const days = distinctExpenseDays(list) || 1;
  return round2(totalPayables(list) / days);
}

export function avgDailyMoM(payables) {
  const m = payablesByMonth(payables);
  if (m.length < 2) return null;
  const a = avgDailyForMonth(payables, m[m.length - 1].month);
  const b = avgDailyForMonth(payables, m[m.length - 2].month);
  if (!b) return null;
  return round2(((a - b) / b) * 100);
}

// Série diária do mês: [{ dia:'30 Mai', valor }].
export function expenseDailySeries(payables, key) {
  const map = new Map();
  for (const p of billablePayables(payablesInMonth(payables, key))) {
    const d = toDate(payableDate(p));
    if (!d) continue;
    const label = `${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
    const cur = map.get(label) || { ts: d.getTime(), valor: 0 };
    cur.valor += Number(p.valor) || 0;
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([dia, v]) => ({ dia, ts: v.ts, valor: round2(v.valor) }))
    .sort((a, b) => a.ts - b.ts)
    .map(({ dia, valor }) => ({ dia, valor }));
}

// Maior despesa (título de maior valor) entre os billable.
export function topPayable(payables) {
  const list = billablePayables(payables);
  if (!list.length) return null;
  return list.reduce((mx, p) => ((Number(p.valor) || 0) > (Number(mx.valor) || 0) ? p : mx));
}

// Pendentes = situacao 1 (em aberto). Devolve { valor, qtd }.
export function pendingPayables(payables) {
  const open = (payables || []).filter((p) => Number(p?.situacao) === 1);
  return {
    valor: round2(open.reduce((a, p) => a + (Number(p.valor) || 0), 0)),
    qtd: open.length,
  };
}

// Paleta para o donut de categorias (mesma família visual da app).
const EXPENSE_PALETTE = [
  "#10B981", "#3B82F6", "#7C3AED", "#F59E0B", "#EF4444",
  "#14B8A6", "#6366F1", "#F472B6", "#84CC16", "#0EA5E9",
];

// Agrupa despesas por categoriaNome -> [{ name, value, color }], maior primeiro.
// "Sem categoria" recebe cinza neutro; o resto cicla a paleta.
export function expenseByCategory(payables) {
  const map = new Map();
  for (const p of billablePayables(payables)) {
    const name = (p && p.categoriaNome) || "Sem categoria";
    map.set(name, (map.get(name) || 0) + (Number(p.valor) || 0));
  }
  let ci = 0;
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => b.value - a.value)
    .map((e) => ({
      ...e,
      color: e.name === "Sem categoria" ? "#94a3b8" : EXPENSE_PALETTE[ci++ % EXPENSE_PALETTE.length],
    }));
}

// ── Lado Fornecedores (a partir de contas a pagar abertas) ──────────────
// "Aberto" = situacao 1. Saldo do título = saldo restante, com fallback a valor.

export function openPayables(payables) {
  return (payables || []).filter((p) => Number(p && p.situacao) === 1);
}

export function payableOpenBalance(p) {
  return (p && p.saldo != null) ? Number(p.saldo) || 0 : Number(p && p.valor) || 0;
}

// Nº de títulos abertos que vencem nos próximos `dias` (inclui hoje).
export function payablesDueWithin(payables, dias) {
  const today = startOfDay(new Date());
  const limit = new Date(today);
  limit.setDate(limit.getDate() + dias);
  return openPayables(payables).filter((p) => {
    const v = toDate(p.vencimento);
    return v && v >= today && v <= limit;
  }).length;
}

// Dias em atraso de um título (0 se não vencido ou sem data).
export function payableDaysOverdue(p, now = new Date()) {
  const v = toDate(p && p.vencimento);
  if (!v) return 0;
  const today = startOfDay(now);
  if (v >= today) return 0;
  return Math.floor((today - startOfDay(v)) / (1000 * 60 * 60 * 24));
}

// Top fornecedores por saldo em aberto: [{ id, nome, faturasAbertas, saldo }].
// Exclui títulos sem nome de fornecedor (não dá para "topar" sem nome).
export function suppliersByOpenBalance(payables) {
  const map = new Map();
  for (const p of openPayables(payables)) {
    const nome = p.contato && p.contato.nome;
    if (!nome) continue;
    const cur = map.get(nome) || { id: (p.contato && p.contato.id) ?? nome, nome, faturasAbertas: 0, saldo: 0 };
    cur.faturasAbertas += 1;
    cur.saldo += payableOpenBalance(p);
    map.set(nome, cur);
  }
  return [...map.values()]
    .map((s) => ({ ...s, saldo: round2(s.saldo) }))
    .sort((a, b) => b.saldo - a.saldo);
}