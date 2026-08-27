// src/utils/financialCalculations.js
// Funções puras de cálculo sobre vendas. Sem React, sem fetch, sem mocks.
// Recebem pedidos normalizados (NormalizedOrder) e devolvem números/listas.
//
// NormalizedOrder:
// {
//   id, numero, date (string ISO|Date), total (number),
//   status ('recebida'|'em_aberto'|'cancelada'),
//   client: { id, name }, seller: { id, name } | null,
//   method: string | null,
//   items: [ { productId, code, name, qty, unitValue, total } ]
// }

import { formatMoney } from "../lib/currency.js";

export const MONTHS_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const COUNTED = ["recebida", "em_aberto"]; // cancelados nunca entram nos totais

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Converte uma data civil "YYYY-MM-DD" numa Date LOCAL, sem passar por UTC.
 *
 * Porquê: new Date("2026-06-01") é interpretado como meia-noite UTC. Em fusos
 * negativos (São Paulo, UTC-3) isso resulta em 31/05 21:00 local, empurrando o
 * primeiro dia do mês para o mês anterior. Construímos a data pelos componentes
 * e fixamos ao meio-dia local, o que também imuniza contra transições de horário
 * de verão (que ocorrem de madrugada).
 *
 * Valores com hora (ISO completo) ou Date são devolvidos sem alteração de semântica.
 * @returns {Date|null} null quando a entrada é vazia ou não parseável.
 */
export function parseLocalISODate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Ponto único de conversão de datas. Delega em parseLocalISODate para que
// "YYYY-MM-DD" nunca sofra deslocamento de fuso.
export function toDate(value) {
  return parseLocalISODate(value);
}

export function monthKey(value) {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function billable(orders) {
  return (orders || []).filter((o) => COUNTED.includes(o.status));
}

export function totalRevenue(orders) {
  return round2(billable(orders).reduce((acc, o) => acc + (Number(o.total) || 0), 0));
}

export function totalOrders(orders) {
  return billable(orders).length;
}

export function averageTicket(orders) {
  const list = billable(orders);
  if (list.length === 0) return 0;
  return round2(totalRevenue(list) / list.length);
}

// [{ month:'2026-05', value }] ordenado cronologicamente.
export function revenueByMonth(orders) {
  const map = new Map();
  for (const o of billable(orders)) {
    const key = monthKey(o.date);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(o.total) || 0));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value: round2(value) }));
}

export function latestMonthKey(orders) {
  const months = revenueByMonth(orders);
  return months.length ? months[months.length - 1].month : null;
}

export function ordersInMonth(orders, key) {
  if (!key) return [];
  return (orders || []).filter((o) => monthKey(o.date) === key);
}

// Crescimento do último mês face ao anterior, em %.
export function monthOverMonthGrowth(orders) {
  const months = revenueByMonth(orders);
  if (months.length < 2) return null;
  const last = months[months.length - 1].value;
  const prev = months[months.length - 2].value;
  if (prev === 0) return null;
  return round2(((last - prev) / prev) * 100);
}

// [{ id, name, value, orders, avgTicket }] por valor desc.
export function revenueByClient(orders) {
  const map = new Map();
  for (const o of billable(orders)) {
    const id = o.client?.id ?? o.client?.name ?? "—";
    const cur = map.get(id) || { id, name: o.client?.name || "Sem nome", value: 0, orders: 0 };
    cur.value += Number(o.total) || 0;
    cur.orders += 1;
    map.set(id, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, value: round2(c.value), avgTicket: round2(c.value / c.orders) }))
    .sort((a, b) => b.value - a.value);
}

export function topClients(orders, n = 6) {
  return revenueByClient(orders).slice(0, n);
}

// [{ id, name, value, qty }] por valor desc.
export function revenueByProduct(orders) {
  const map = new Map();
  for (const o of billable(orders)) {
    for (const it of o.items || []) {
      const id = it.productId ?? it.code ?? it.name;
      const cur = map.get(id) || { id, name: it.name, value: 0, qty: 0 };
      cur.value += Number(it.total) || 0;
      cur.qty += Number(it.qty) || 0;
      map.set(id, cur);
    }
  }
  return [...map.values()]
    .map((p) => ({ ...p, value: round2(p.value) }))
    .sort((a, b) => b.value - a.value);
}

export function topProducts(orders, n = 6) {
  return revenueByProduct(orders).slice(0, n);
}

// % da faturação concentrada no maior cliente.
export function clientConcentration(orders) {
  const total = totalRevenue(orders);
  if (total === 0) return 0;
  const top = topClients(orders, 1)[0];
  return top ? round2((top.value / total) * 100) : 0;
}

// Nº de clientes distintos com pelo menos um pedido contável.
export function distinctClients(orders) {
  const set = new Set(billable(orders).map((o) => o.client?.id ?? o.client?.name));
  return set.size;
}

// Nº de clientes com pelo menos um pedido recebido.
export function payingClients(orders) {
  const set = new Set(
    (orders || []).filter((o) => o.status === "recebida").map((o) => o.client?.id ?? o.client?.name)
  );
  return set.size;
}

// Série diária de um mês: [{ dia:'30 Mai', valor }].
export function dailySeries(orders, key) {
  const map = new Map();
  for (const o of ordersInMonth(billable(orders), key)) {
    const d = toDate(o.date);
    if (!d) continue;
    const label = `${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
    map.set(label, { ts: d.getTime(), valor: (map.get(label)?.valor || 0) + (Number(o.total) || 0) });
  }
  return [...map.entries()]
    .map(([dia, v]) => ({ dia, ts: v.ts, valor: round2(v.valor) }))
    .sort((a, b) => a.ts - b.ts)
    .map(({ dia, valor }) => ({ dia, valor }));
}

// Pedidos recentes (ordenado por data desc).
export function recentOrders(orders, n = 10) {
  return [...(orders || [])]
    .sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0))
    .slice(0, n);
}

// ── primitivos partilhados (consolidação de helpers duplicados) ───────────
// Corpos copiados byte a byte das cópias locais dos engines — saída idêntica.
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
/* MOEDA DA EMPRESA ATIVA em texto corrido.
 *
 * Chamava-se `eur` e fazia jus ao nome: `toLocaleString("pt-PT")` com " €" concatenado
 * à mão. Os consumidores são os ALERTAS OPERACIONAIS e o DIAGNÓSTICO FINANCEIRO — as
 * duas superfícies que descrevem dados reais em frases ("X tem 3 faturas vencidas, no
 * total de ..."). Numa empresa em reais, cada uma dessas frases afirmava um valor em
 * euros sobre um saldo em reais.
 *
 * `eur` fica como alias para não partir chamadores; o nome novo é o que descreve o que
 * a função faz. A formatação delega em `lib/currency`, para que exista UM formatador
 * monetário na aplicação e não dois que possam divergir. */
export function money(n) { return formatMoney(n); }
export const eur = money;
export function pct(n) { return String(n).replace(".", ","); }
// Mes anterior de uma chave "YYYY-MM".
export function prevMonthKey(key) {
  if (!key) return null;
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1); // m-1 seria o proprio mes (0-based); m-2 = anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}