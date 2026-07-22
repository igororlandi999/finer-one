// src/utils/receivableCalculations.js
// Cálculos puros de Recebíveis (contas a receber) normalizadas. Espelha o padrão de
// expenseCalculations.js, mas para o lado CLIENTES: o que a empresa tem a receber.
// situacao (Bling /contas/receber): 1 = em aberto | 2 = recebido/baixado.
// (Só 1 e 2 confirmados no diagnóstico real; cancelado, se existir, fica fora dos totais.)

import { round2, toDate, monthKey, MONTHS_PT, startOfDay } from "./financialCalculations.js";

export const RECEIVABLE_COUNTED = [1, 2]; // situações que entram nos totais

export function billableReceivables(receivables) {
  return (receivables || []).filter((r) => r && RECEIVABLE_COUNTED.includes(Number(r.situacao)));
}

// Data de referência do título: emissão quando existir (vem do detalhe), senão vencimento.
export function receivableDate(r) {
  return (r && (r.dataEmissao || r.vencimento)) || null;
}

// 'recebida' | 'pendente' | 'atraso'
export function receivableStatus(r, now = new Date()) {
  if (Number(r?.situacao) === 2) return "recebida";
  const venc = toDate(r?.vencimento);
  if (venc && venc < startOfDay(now)) return "atraso";
  return "pendente";
}

export function totalReceivables(receivables) {
  return round2(billableReceivables(receivables).reduce((a, r) => a + (Number(r.valor) || 0), 0));
}

// [{ month:'2026-05', value }] cronológico.
export function receivablesByMonth(receivables) {
  const map = new Map();
  for (const r of billableReceivables(receivables)) {
    const key = monthKey(receivableDate(r));
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(r.valor) || 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round2(value) }));
}

export function latestReceivableMonth(receivables) {
  const m = receivablesByMonth(receivables);
  return m.length ? m[m.length - 1].month : null;
}

export function receivablesInMonth(receivables, key) {
  if (!key) return [];
  return (receivables || []).filter((r) => monthKey(receivableDate(r)) === key);
}

// ── Lado Clientes (a partir de contas a receber ABERTAS) ────────────────
// "Aberto" = situacao 1. Saldo do título = saldo restante, com fallback a valor.

export function openReceivables(receivables) {
  return (receivables || []).filter((r) => Number(r && r.situacao) === 1);
}

export function receivableOpenBalance(r) {
  return (r && r.saldo != null) ? Number(r.saldo) || 0 : Number(r && r.valor) || 0;
}

// Pendentes = situacao 1 (em aberto). Devolve { valor, qtd }.
export function pendingReceivables(receivables) {
  const open = openReceivables(receivables);
  return {
    valor: round2(open.reduce((a, r) => a + receivableOpenBalance(r), 0)),
    qtd: open.length,
  };
}

// Nº de títulos abertos que vencem nos próximos `dias` (inclui hoje).
export function receivablesDueWithin(receivables, dias) {
  const today = startOfDay(new Date());
  const limit = new Date(today);
  limit.setDate(limit.getDate() + dias);
  return openReceivables(receivables).filter((r) => {
    const v = toDate(r.vencimento);
    return v && v >= today && v <= limit;
  }).length;
}

// Dias em atraso de um título (0 se não vencido ou sem data).
export function receivableDaysOverdue(r, now = new Date()) {
  const v = toDate(r && r.vencimento);
  if (!v) return 0;
  const today = startOfDay(now);
  if (v >= today) return 0;
  return Math.floor((today - startOfDay(v)) / (1000 * 60 * 60 * 24));
}

// Top clientes por saldo em aberto: [{ id, nome, faturasAbertas, saldo }].
// Exclui títulos sem nome de cliente (não dá para "topar" sem nome).
export function clientsByOpenBalance(receivables) {
  const map = new Map();
  for (const r of openReceivables(receivables)) {
    const nome = r.contato && r.contato.nome;
    if (!nome) continue;
    // Agrupa por id do cliente (clientes homónimos com ids distintos não se fundem).
    // Sem id, cai para o nome como chave.
    const chave = r.contato && r.contato.id != null ? `id:${r.contato.id}` : `nome:${nome}`;
    const cur = map.get(chave) || { id: (r.contato && r.contato.id) ?? nome, nome, faturasAbertas: 0, saldo: 0 };
    cur.faturasAbertas += 1;
    cur.saldo += receivableOpenBalance(r);
    map.set(chave, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, saldo: round2(c.saldo) }))
    .sort((a, b) => b.saldo - a.saldo);
}