// src/services/blingDataService.js
// Conhece o formato do Bling (API v3) e traduz para o formato que as telas do
// Finer One já consomem. As telas continuam a ler as mesmas formas; muda só a
// origem. Sem API ou em falha, devolve sales:null e as telas usam o mockData.

import { apiGet, isApiConfigured } from "./api.js";

import {
  totalRevenue,
  averageTicket,
  monthOverMonthGrowth,
  revenueByClient,
  topClients,
  topProducts,
  clientConcentration,
  distinctClients,
  payingClients,
  ordersInMonth,
  latestMonthKey,
  revenueByMonth,
  dailySeries,
  billable,
  round2,
} from "../utils/financialCalculations.js";

import { buildSalesAlerts, severityCounts } from "../utils/alertsEngine.js";
import { buildSalesDiagnostics } from "../utils/diagnosticsEngine.js";

// Mapeamento de estado Bling -> Finer One. Ajustar às situações reais da Overcel.
// situacao.valor: 9 = atendido/recebido, 1 = em aberto, 12 = cancelado.
const STATUS_MAP = { 9: "recebida", 1: "em_aberto", 12: "cancelada" };

function mapStatus(situacao) {
  // Prioriza situacao.id (situação real do pedido no Bling). O campo valor é
  // genérico e na conta da Overcel vem fixo (ex.: {id:9, valor:1}), o que fazia
  // todos os pedidos caírem em em_aberto. Mantém valor como fallback.
  const v = situacao?.id ?? situacao?.valor;
  return STATUS_MAP[v] || "em_aberto";
}

// Categoria Finer One a partir do produto (código). Cores iguais ao mock.
const CATEGORY_COLORS = {
  "Células 18650": "#10B981",
  "Células 21700": "#2563eb",
  "Packs / Baterias": "#7C3AED",
  "Termo Retrátil / PVC": "#F59E0B",
  "Fitas de Níquel": "#0ea5e9",
  "Fitas e Adesivos": "#ec4899",
  "Acessórios": "#14b8a6",
  "Outros Produtos": "#94a3b8",
};

// Palavras-chave dos produtos da Overcel (baterias, células, termo retrátil,
// níquel, fitas, packs...). Variantes com e sem acento, pois os dados reais
// chegam em maiúsculas e sem acento.
function categoryForItem(item) {
  const code = String(item.code || "").toUpperCase();
  const desc = String(item.name || "").toLowerCase();
  const all = (code + " " + desc).toLowerCase();

  // Famílias comerciais da Overcel (a ordem importa).
  if (all.includes("18650")) return "Células 18650";
  if (all.includes("21700")) return "Células 21700";

  // Packs / Baterias — "pack" só como palavra inteira (evita "packing" do PVC).
  if (code.includes("PACK") || code.includes("EN40PL") || code.includes("EN35V") ||
      /\bpack\b/.test(desc) || desc.includes("bateria de pilhas") || desc.includes("li-ion")) {
    return "Packs / Baterias";
  }

  // Termo Retrátil / PVC — "TR" pelo início do código (evita "tr" no meio de palavras).
  if (code.includes("PVC") || code.startsWith("TR") ||
      desc.includes("termo retrátil") || desc.includes("termo retratil")) {
    return "Termo Retrátil / PVC";
  }

  // Fitas de Níquel — "FN" pelo início do código.
  if (code.startsWith("FN") || code.includes("NIQUEL") || code.includes("NÍQUEL") ||
      desc.includes("fita níquel") || desc.includes("fita de níquel") ||
      desc.includes("fita niquel") || desc.includes("fita de niquel")) {
    return "Fitas de Níquel";
  }

  // Fitas e Adesivos
  if (code.includes("TAPE") || code.includes("ADESIVA") ||
      desc.includes("fita adesiva") || desc.includes("adesiv")) {
    return "Fitas e Adesivos";
  }

  // Produto físico sem regra específica.
  return "Outros Produtos";
}

// Agrega itens por categoria -> [{ name, value, color }] ordenado por valor desc.
// Recebe pedidos JÁ filtrados (faturáveis e/ou por período).
function aggregateByCategory(orders) {
  const catMap = new Map();
  for (const o of orders) {
    for (const it of o.items || []) {
      const cat = categoryForItem(it);
      catMap.set(cat, (catMap.get(cat) || 0) + (Number(it.total) || 0));
    }
  }
  return [...catMap.entries()]
    .map(([name, value]) => ({ name, value: round2(value), color: CATEGORY_COLORS[name] || "#94a3b8" }))
    .sort((a, b) => b.value - a.value);
}

// Receitas por categoria a partir dos pedidos reais, filtrando por período.
// period: 'mes' | 'trimestre' | 'ano'. Devolve [{ name, value, color }] (forma do donut).
// Usa a data do pedido contra o mês/trimestre/ano ATUAIS e exclui cancelados (billable).
export function buildRevenueByCategoryFromOrders(orders, period = "mes") {
  const now = new Date();
  const quarterOf = (d) => Math.floor(d.getMonth() / 3);
  const inPeriod = (o) => {
    const d = new Date(o.date);
    if (isNaN(d.getTime())) return false;
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (period === "mes") return d.getMonth() === now.getMonth();
    if (period === "trimestre") return quarterOf(d) === quarterOf(now);
    return true; // 'ano'
  };
  return aggregateByCategory(billable(orders || []).filter(inPeriod));
}

function pad(n) { return String(n).padStart(2, "0"); }
function formatPtDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Normalizadores (Bling bruto -> modelo interno) ────────────

export function normalizeOrder(raw) {
  return {
    id: raw.id,
    numero: raw.numero,
    date: raw.data,
    total: Number(raw.total) || 0,
    status: mapStatus(raw.situacao),
    method: raw.formaPagamento?.nome || raw.metodo || null,
    client: { id: raw.contato?.id ?? null, name: raw.contato?.nome || "Sem nome" },
    seller: raw.vendedor ? { id: raw.vendedor.id, name: raw.vendedor.nome || "—" } : null,
    items: (raw.itens || []).map((it) => ({
      productId: it.produto?.id ?? it.codigo ?? null,
      code: it.codigo || "",
      name: it.descricao || "Item",
      qty: Number(it.quantidade) || 0,
      unitValue: Number(it.valor) || 0,
      total: (Number(it.quantidade) || 0) * (Number(it.valor) || 0),
    })),
  };
}

export const normalizeClient = (raw) => ({ id: raw.id, name: raw.nome, taxId: raw.numeroDocumento || null });
export const normalizeProduct = (raw) => ({ id: raw.id, code: raw.codigo, name: raw.nome, price: Number(raw.preco) || 0 });

// ── Adaptadores por tela (formas iguais às do mockData) ───────

function buildReceitas(orders) {
  const latest = latestMonthKey(orders);
  const months = revenueByMonth(orders);
  const prev = months.length >= 2 ? months[months.length - 2].month : null;

  const latestOrders = ordersInMonth(orders, latest);
  const prevOrders = ordersInMonth(orders, prev);

  const totalMes = totalRevenue(latestOrders);
  const totalDelta = monthOverMonthGrowth(orders) ?? 0;

  const days = new Set(billable(latestOrders).map((o) => new Date(o.date).getDate()));
  const mediaDiaria = days.size ? round2(totalMes / days.size) : 0;
  const prevDays = new Set(billable(prevOrders).map((o) => new Date(o.date).getDate()));
  const prevMedia = prevDays.size ? totalRevenue(prevOrders) / prevDays.size : 0;
  const mediaDelta = prevMedia ? round2(((mediaDiaria - prevMedia) / prevMedia) * 100) : 0;

  const clientesPagos = payingClients(latestOrders);
  const clientesDelta = clientesPagos - payingClients(prevOrders);

  // Proxy de "em atraso": pedidos em aberto (real exige datas de vencimento).
  const open = (orders || []).filter((o) => o.status === "em_aberto");
  const emAtraso = round2(open.reduce((a, o) => a + (Number(o.total) || 0), 0));
  const emAtrasoQtd = new Set(open.map((o) => o.client?.id ?? o.client?.name)).size;

  const metrics = {
    totalMes, totalDelta, mediaDiaria, mediaDelta,
    clientesPagos, clientesDelta, emAtraso, emAtrasoQtd,
  };

  // Distribuição por categoria (todo o período disponível no snapshot).
  // O card por período recalcula a partir de sales.orders via
  // buildRevenueByCategoryFromOrders (função pura exportada acima).
  const byCategory = aggregateByCategory(billable(orders));

  // Lista de receitas (exclui cancelados)
  const list = (orders || [])
    .filter((o) => o.status !== "cancelada")
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((o) => ({
      id: `r-${o.id}`,
      data: formatPtDate(o.date),
      cliente: o.client?.name || "Sem nome",
      documento: `FT ${o.numero}`,
      categoria: categoryForItem(o.items?.[0] || {}),
      valor: round2(o.total),
      recebidoEm: o.status === "recebida" ? formatPtDate(o.date) : null,
      status: o.status === "recebida" ? "recebida" : "pendente",
      metodo: o.method || "—",
    }));

  return {
    metrics,
    evolution: dailySeries(orders, latest),
    byCategory,
    list,
    topProducts: topProducts(orders, 6),
  };
}

function buildClientes(orders) {
  const top = topClients(orders, 6).map((c) => ({
    id: `c-${c.id}`,
    nome: c.name,
    faturasAbertas: c.orders, // nº de pedidos (proxy; aging real exige contas a receber)
    saldo: c.value,           // faturação total do cliente
  }));
  return {
    metrics: { clientesAtivos: distinctClients(orders) },
    top,
    byClient: revenueByClient(orders),
    concentracao: clientConcentration(orders),
  };
}

function buildResumo(orders) {
  const latest = latestMonthKey(orders);
  const receitas = totalRevenue(ordersInMonth(orders, latest));
  const receitasDelta = monthOverMonthGrowth(orders) ?? 0;
  return { metrics: { receitas, receitasDelta } };
}

function buildAlertas(orders) {
  const list = buildSalesAlerts(orders);
  return { list, metrics: severityCounts(list) };
}

// Dataset completo pronto para as telas.
export function buildSalesDataset({ orders }) {
  return {
    receitas: buildReceitas(orders),
    clientes: buildClientes(orders),
    resumo: buildResumo(orders),
    alertas: buildAlertas(orders),
    diagnostics: buildSalesDiagnostics(orders), // não ligado às telas nesta etapa
    orders, // exposto para recálculos por período no front (ex.: donut de categorias)
  };
}

// Versão testável a partir de dados brutos Bling.
export function buildSalesDatasetFromRaw(rawSales = []) {
  const orders = (rawSales || []).map(normalizeOrder);
  return buildSalesDataset({ orders });
}

// ── Carregamento ──────────────────────────────────────────────

async function fetchRawSales() {
  // Backend pode devolver { data: [...] } (padrão Bling v3) ou um array.
  const res = await apiGet("pedidos/vendas");
  return res?.data ?? res ?? [];
}

// Devolve { source:'api'|'mock', sales } — sales:null significa usar mockData.
export async function loadFinerData() {
  if (!isApiConfigured()) {
    return { source: "mock", sales: null };
  }
  try {
    const rawSales = await fetchRawSales();
    const orders = (rawSales || []).map(normalizeOrder);
    return { source: "api", sales: buildSalesDataset({ orders }) };
  } catch {
    return { source: "mock", sales: null };
  }
}