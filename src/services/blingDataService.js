// src/services/blingDataService.js
// Conhece o formato do Bling (API v3) e traduz para o formato que as telas do
// Finer One já consomem. As telas continuam a ler as mesmas formas; muda só a
// origem. Sem API ou em falha, devolve sales:null e as telas usam o mockData.

import { isApiConfigured, ApiError } from "./api.js";

import {
  totalRevenue,
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
  toDate,
  prevMonthKey,
  monthKey,
} from "../utils/financialCalculations.js";

import {
  billablePayables,
  payableDate,
  payableStatus,
  totalPayables,
  /* latestPayableMonth, payableMoM e avgDailyMoM deixaram de ser usados neste ficheiro
   * na microfase D4 (a página Despesas passou a ancorar no mês civil). Continuam
   * exportados e testados em expenseCalculations.js — nada foi removido de lá. */
  payablesInMonth,
  avgDailyForMonth,
  expenseDailySeries,
  topPayable,
  pendingPayables,
  overduePayables,
  expenseByCategory,
  openPayables,
  payableOpenBalance,
  payablesDueWithin,
  payableDaysOverdue,
  suppliersByOpenBalance,
} from "../utils/expenseCalculations.js";

import {
  pendingReceivables,
  openReceivables,
  receivableOpenBalance,
  receivablesDueWithin,
  receivableDaysOverdue,
  clientsByOpenBalance,
} from "../utils/receivableCalculations.js";

import { buildSalesAlerts, buildExpenseAlerts, buildFinancialAlerts } from "../utils/alertsEngine.js";
import { buildMonthlyClosing, closedMonthKeys } from "../utils/monthlyClosing.js";
import { buildFinancialCompleteness, latestAnchorEligibleMonthKey, ANCHOR_SOURCE } from "../utils/financialCompleteness.js";
import { buildClosingAlerts } from "../utils/closingAlerts.js";
import { buildFinancialDiagnostic } from "../utils/diagnosticsEngine.js";
import { buildMonthlyDre, payablesCoverage, coverageComSnapshotParcial } from "../utils/dreEngine.js";
import { resolveEffectiveCoverage, describeCoverageSource } from "../utils/manualCoverage.js";
import {
  buildFinancialMetrics, latestUsableFinancialMonth, buildMetricsWithComparison,
  canComparePeriods,
} from "../utils/financialMetrics.js";
import { ACTIVE_COMPANY } from "../config/company.js";
import { createLegacyDataTransport, RECURSOS } from "./dataTransport.js";
import { buildDocumentCatalog } from "../utils/documentNormalizer.js";
import { buildClassificationCompleteness } from "../utils/classificationCompleteness.js";
import { buildCoverageDiagnostics } from "../utils/coverageDiagnostics.js";
import { fetchManualInputs } from "./manualInputsService.js";

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
    // toDate trata "YYYY-MM-DD" como data local (sem deslocamento de fuso).
    const d = toDate(o.date);
    if (!d) return false;
    if (d.getFullYear() !== now.getFullYear()) return false;
    if (period === "mes") return d.getMonth() === now.getMonth();
    if (period === "trimestre") return quarterOf(d) === quarterOf(now);
    return true; // 'ano'
  };
  return aggregateByCategory(billable(orders || []).filter(inPeriod));
}

function pad(n) { return String(n).padStart(2, "0"); }
function formatPtDate(value) {
  // toDate garante que "YYYY-MM-DD" nao recua um dia em fusos negativos.
  const d = toDate(value);
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ── Normalizadores (Bling bruto -> modelo interno) ────────────

/* Número que preserva o ZERO e a AUSÊNCIA. Espelha extrairValorNumerico_ do Apps
 * Script, que é quem produz estes campos no snapshot.
 *
 * Não existe helper equivalente no frontend: o padrão em uso é `Number(x) || 0`, que
 * colapsa null e "abc" em zero — inaceitável aqui, porque `frete: 0` é um dado real
 * (539 dos 984 pedidos) e ausência é desconhecimento (215 pedidos ainda não
 * hidratados). O dreEngine distingue os dois casos com `o.frete != null`. */
function numOuNull_(v) {
  // Só número ou string. `Number([])` é 0 e `Number({})` é NaN: coerções silenciosas
  // que transformariam lixo em dado financeiro. Tipo inesperado é desconhecimento.
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

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
    // Metadata DOCUMENTAL (Fase 5). O Apps Script preserva notaFiscalId/dataSaida no
    // snapshot; sem os copiar aqui, a camada documental não teria como saber que o
    // pedido tem nota emitida. São metadata: nenhum motor financeiro os lê.
    notaFiscalId: (raw.notaFiscalId != null) ? raw.notaFiscalId : null,
    dataSaida: raw.dataSaida || null,
    /* FRETE COBRADO ao cliente (F4). Só transporte de dado: desde a F3 o dreEngine
     * já não o inclui em totalDeducoes, pelo que propagá-lo NÃO altera receita
     * líquida nenhuma — apenas permite que `freteVenda` deixe de ser unavailable.
     * `desconto`, `totalProdutos`, `outrasDespesas` e `fretePorConta` continuam
     * deliberadamente por propagar: fases separadas. */
    frete: numOuNull_(raw.frete),
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

// Conta a pagar (Bling) -> modelo interno de despesa. Apps Script ja resolve nomes;
// aqui garantimos defaults para o fallback ao vivo (que vem sem detalhe/nomes).
export function normalizePayable(raw) {
  if (!raw) return null;
  return {
    id: (raw.id != null) ? raw.id : null,
    situacao: (raw.situacao != null) ? raw.situacao : null,
    vencimento: raw.vencimento || null,
    valor: Number(raw.valor) || 0,
    dataEmissao: raw.dataEmissao || null,
    vencimentoOriginal: raw.vencimentoOriginal || null,
    competencia: raw.competencia || null, // usado pelo motor de DRE (regime de competência)
    numeroDocumento: (raw.numeroDocumento != null) ? raw.numeroDocumento : null,
    historico: (raw.historico != null) ? raw.historico : null,
    saldo: (raw.saldo != null) ? Number(raw.saldo) : null,
    categoriaId: (raw.categoriaId != null) ? raw.categoriaId : (raw.categoria && raw.categoria.id != null ? raw.categoria.id : null),
    categoriaNome: raw.categoriaNome || null,
    contato: { id: raw.contato && raw.contato.id != null ? raw.contato.id : null, nome: raw.contato && raw.contato.nome ? raw.contato.nome : null },
    formaPagamento: { id: raw.formaPagamento && raw.formaPagamento.id != null ? raw.formaPagamento.id : null, nome: raw.formaPagamento && raw.formaPagamento.nome ? raw.formaPagamento.nome : null },
  };
}

/**
 * Conta a receber (Bling /contas/receber) -> modelo interno de recebível.
 * Espelha normalizePayable. O Apps Script (rebuild) já resolve nomes e hidrata o
 * detalhe; aqui garantimos defaults defensivos e tolerância ao shape legado do
 * snapshot (categoria na raiz vs. objeto categoria), sem inventar valores.
 *
 * Contrato esperado (Fase 1B), campos usados pelas telas:
 * @typedef {Object} Receivable
 * @property {number|string|null} id
 * @property {number|null} situacao          1 = em aberto | 2 = recebido
 * @property {string|null} vencimento        ISO yyyy-MM-dd
 * @property {number} valor
 * @property {string|null} dataEmissao        ISO yyyy-MM-dd
 * @property {string|null} vencimentoOriginal
 * @property {string|number|null} numeroDocumento
 * @property {string|null} historico
 * @property {number|null} saldo              saldo restante do título
 * @property {number|string|null} categoriaId
 * @property {string|null} categoriaNome
 * @property {{id:number|null, nome:string|null}} contato
 * @property {{id:number|null, nome:string|null}} formaPagamento
 */
export function normalizeReceivable(raw) {
  if (!raw) return null;
  // Categoria: aceita objeto categoria {id,nome} (shape novo) ou categoriaId/Nome na raiz (legado).
  const catId = (raw.categoriaId != null)
    ? raw.categoriaId
    : (raw.categoria && raw.categoria.id != null ? raw.categoria.id : null);
  const catNome = raw.categoriaNome || (raw.categoria && raw.categoria.nome) || null;
  return {
    id: (raw.id != null) ? raw.id : null,
    situacao: (raw.situacao != null) ? raw.situacao : null,
    vencimento: raw.vencimento || null,
    valor: Number(raw.valor) || 0,
    dataEmissao: raw.dataEmissao || null,
    vencimentoOriginal: raw.vencimentoOriginal || null,
    numeroDocumento: (raw.numeroDocumento != null) ? raw.numeroDocumento : null,
    historico: (raw.historico != null) ? raw.historico : null,
    saldo: (raw.saldo != null) ? Number(raw.saldo) : null,
    categoriaId: catId,
    categoriaNome: catNome,
    contato: {
      id: raw.contato && raw.contato.id != null ? raw.contato.id : null,
      nome: raw.contato && raw.contato.nome ? raw.contato.nome : null,
    },
    formaPagamento: {
      id: raw.formaPagamento && raw.formaPagamento.id != null ? raw.formaPagamento.id : null,
      nome: raw.formaPagamento && raw.formaPagamento.nome ? raw.formaPagamento.nome : null,
    },
  };
}

// ── Adaptadores por tela (formas iguais às do mockData) ───────

function buildReceitas(orders) {
  const latest = latestMonthKey(orders);
  const months = revenueByMonth(orders);
  const prev = months.length >= 2 ? months[months.length - 2].month : null;

  const latestOrders = ordersInMonth(orders, latest);
  const prevOrders = ordersInMonth(orders, prev);

  const totalMes = totalRevenue(latestOrders);
  const totalDelta = monthOverMonthGrowth(orders) ?? 0;

  const days = new Set(billable(latestOrders).map((o) => toDate(o.date)?.getDate()).filter((d) => d != null));
  const mediaDiaria = days.size ? round2(totalMes / days.size) : 0;
  const prevDays = new Set(billable(prevOrders).map((o) => toDate(o.date)?.getDate()).filter((d) => d != null));
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
    .sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0))
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

// Resumo ancorado no mes das receitas. Despesas/resultado so entram com payables reais;
// sem payables, o mock preenche e os cards mantem o selo Demo.
// Deltas: MoM honesto; null (oculto) quando a base anterior nao permite % clara.
/* Contas a pagar de UM mês, pela data de VENCIMENTO — visão de tesouraria.
 *
 * Deliberadamente NÃO usa expenseCalculations.payableDate (dataEmissao || vencimento):
 * essa regra é a de outras páginas e mudá-la globalmente alteraria Despesas, alertas
 * e Performance de uma só vez. Aqui a pergunta é outra — "quanto vence neste mês" —
 * e a resposta é o vencimento, nunca a emissão.
 *
 * Também não é a competência da DRE (competencia > vencimentoOriginal > vencimento >
 * dataEmissao): isto é tesouraria, não resultado. Um título sem vencimento não tem
 * mês de tesouraria e fica de fora — não é inventado para nenhum mês.
 * A regra de quais títulos contam (cancelados fora) continua a ser a de totalPayables.
 */function contasPagarNoMes_(payables, mk) {
  if (!mk) return 0;
  return totalPayables(
    billablePayables(payables).filter((p) => monthKey(p.vencimento) === mk)
  );
}

/**
 * Cards do topo do Resumo.
 *
 * DOIS CONTRATOS COEXISTEM AQUI, de propósito:
 *   - `contasPagar` / `contasPagarMonthKey` — NOVO. Alimenta só o card
 *     "Contas a pagar este mês". Responde a "quanto tenho de pagar NESTE mês
 *     civil": operacional, não de fecho. Por isso não usa
 *     financeiro.payables.monthKey (mês fechado, dependente de closedThroughMonth
 *     mantido à mão, que ficaria congelado em junho durante agosto), nem
 *     latestMonthKey(orders), nem competência. Essas âncoras continuam corretas
 *     noutros contextos e não foram tocadas.
 *   - `despesas` / `resultado` (+ deltas) — LEGADO DEPRECADO, congelado no
 *     comportamento anterior enquanto o chatEngine não for migrado. Ver o bloco
 *     dentro da função.
 *
 * `now` é injetável para o mês civil ser testável sem depender do relógio.
 * Sai de monthKey(now) — o helper já consolidado em financialCalculations, o mesmo
 * usado no filtro. Não importei currentMonthKey de performanceCalculations: faria
 * o serviço depender de um módulo de página para uma conversão de data que já
 * existe na camada base, e seriam duas fontes para a mesma regra na mesma função.
 */
function buildResumo(orders, payables, financeiro, now = new Date()) {
  const latest = latestMonthKey(orders);
  const receitas = totalRevenue(ordersInMonth(orders, latest));
  const receitasDelta = monthOverMonthGrowth(orders) ?? 0;
  /* `receitasMonthKey` é ADITIVO e existe por uma razão só: `receitas` é o total de UM
   * mês concreto e viajava sem dizer qual. O Chat mostrava um cartão "Receitas (mês)"
   * sem nomear o mês — e o mês daqui (último com pedidos) não é o mês âncora da DRE
   * nem o mês civil, pelo que quem o lesse não tinha como o descobrir. */
  const metrics = { receitas, receitasDelta, receitasMonthKey: latest };

  if (Array.isArray(payables)) {
    // ── NOVO CONTRATO: card "Contas a pagar este mês" do Resumo ──
    const mesCivil = monthKey(now);
    metrics.contasPagarMonthKey = mesCivil;
    metrics.contasPagar = contasPagarNoMes_(payables, mesCivil);
    // Sem delta: o mês civil está em curso e o anterior está completo — a
    // comparação não é limpa. Melhor não afirmar nada do que afirmar mal.

    /* ── CONTRATO LEGADO REMOVIDO EM 24/08/2026 ───────────────────────────────
     * Aqui viviam `despesas`, `despesasDelta`, `resultado` e `resultadoDelta`.
     *
     * `resultado` era `receita − contas a pagar`: exatamente a métrica que este
     * projeto proíbe. Estava banida do Diagnóstico, foi retirada do Chat — e
     * continuava a ser CALCULADA aqui, a partir de dados reais, e a viajar no
     * dataset. O último leitor era o card "Resultado (Mês)" do Resumo, que caía
     * nela sempre que a DRE não tinha âncora: um número verde, rotulado como
     * resultado, sem selo Demo e sem ressalva nenhuma. O comentário que aqui
     * estava dizia que os campos ficavam "congelados enquanto o chatEngine não
     * for migrado"; o chatEngine foi migrado e os campos ficaram.
     *
     * `despesas` tinha o mesmo problema de nome: somava contas a pagar por
     * `dataEmissao || vencimento` e chamava-lhes despesas. Tesouraria não é DRE.
     *
     * Quem precisa de resultado lê `financeiro.metrics` (DRE, com availability).
     * Quem precisa de contas a pagar lê `contasPagar` (mês civil, por vencimento),
     * que continua acima e diz no nome o que é. O caminho DEMONSTRATIVO do Resumo
     * continua a funcionar: `monthMetrics` faz spread do mock por baixo, e sem
     * estes campos é o mock que preenche — que é o que se quer numa demonstração.
     * ──────────────────────────────────────────────────────────────────────── */
  }

  return { metrics };
}

/**
 * Alertas: operacionais (fontes próprias) + financeiros (DRE central).
 * O mês âncora e a comparabilidade vêm da camada financeira — os alertas não
 * escolhem meses nem recalculam finanças.
 *
 * Os alertas MENSAIS de despesas usam `financeiro.payables`, que tem cobertura
 * própria (coverage.payables) e disponibilidade própria (availability.
 * operatingExpenses). Nunca `financeiro.monthKey` nem `financeiro.comparable`:
 * esses são o veredito da RECEITA (buildMetricsWithComparison compara
 * availability.revenueNet) e podem divergir do lado das contas a pagar.
 * Os alertas operacionais (vencidas, a vencer, pendentes) não são ancorados.
 */
function buildAlertas(orders, payables, financeiro, closings) {
  const fin = financeiro || null;
  const finPag = (fin && fin.payables) || null;
  const list = [
    ...buildSalesAlerts(orders, fin ? {
      monthKey: fin.monthKey,
      previousMonthKey: fin.previous ? fin.previous.monthKey : null,
      comparable: fin.comparable,
    } : undefined),
    ...buildExpenseAlerts(payables || [], finPag ? {
      monthKey: finPag.monthKey,
      previousMonthKey: finPag.previousMonthKey,
      comparable: finPag.comparable,
      partial: finPag.partial,
    } : undefined),
    ...buildFinancialAlerts({ financialMetrics: fin ? fin.metrics : null, monthKey: fin ? fin.monthKey : null }),
    // Pendências de fecho: já apuradas a montante, aqui só se redigem.
    ...buildClosingAlerts({ closings }),
  ];
  return { list };
}

// Despesas a partir de contas a pagar (Bling). Formas iguais aos mocks de Despesas.
// categoria fica "Sem categoria" no MVP-1 (a listagem/detalhe so trazem categoria.id).
/* ÂNCORA OPERACIONAL DA PÁGINA DESPESAS (D4).
 *
 * A página responde a "o que estou a gastar NESTE mês", pelo que o mês é o CIVIL
 * corrente — nunca latestPayableMonth, que era "o último mês que por acaso tem
 * títulos" e fazia a página inteira saltar para um mês futuro assim que aparecesse
 * um único título com data à frente.
 *
 * `now` é injetável (mesmo padrão de buildResumo): o relógio é lido uma só vez,
 * aqui, e nunca dentro dos helpers.
 *
 * O que segue o mês civil: monthKey, totalMes, mediaDiaria, maiorDespesa, evolution,
 * byCategory. O que continua GLOBAL, por decisão de produto: pagamentosPendentes,
 * pendentesQtd e `list`. */
/* Meses cujos títulos por classificar interessam mostrar: o mês CIVIL corrente (o mês
 * da página) e os meses da janela de fecho. Os de julho são o caso real que motivou
 * isto — ficam fora da linha de despesas operacionais da DRE, e não apareciam em lado
 * nenhum: nem em Despesas (que mostra o mês civil), nem em "Dados a completar" (que só
 * mostra requisitos do utilizador, e classificar não é um deles). */
function classificacoesDe_(payables, meses) {
  return meses
    .map((mk) => buildClassificationCompleteness({ payables, monthKey: mk }))
    .filter((c) => c && c.unclassifiedCount > 0);
}

function buildDespesas(payables, now = new Date(), mesesClassificacao = []) {
  const list = billablePayables(payables)
    .slice()
    .sort((a, b) => {
      const da = toDate(payableDate(a))?.getTime() || 0;
      const db = toDate(payableDate(b))?.getTime() || 0;
      return db - da;
    })
    .map((p) => ({
      id: String(p.id),
      data: formatPtDate(payableDate(p)),
      descricao: p.historico || (p.numeroDocumento ? ("Documento " + p.numeroDocumento) : "Conta a pagar"),
      fornecedor: (p.contato && p.contato.nome) || "—",
      categoria: p.categoriaNome || "Sem categoria",
      valor: Number(p.valor) || 0,
      vencimento: formatPtDate(p.vencimento),
      status: payableStatus(p),
      metodo: (p.formaPagamento && p.formaPagamento.nome) || "—",
    }));

  const latest = monthKey(now);
  const inMonth = payablesInMonth(payables, latest);
  /* D-2: SEM fallback global. Existia `|| topPayable(payables)`, que num mês sem
   * títulos mostrava o maior título de toda a história sem qualquer marca — ao lado
   * de um total do mês a zero. Não há "maior despesa" num mês sem despesas: há
   * ausência, e ausência exprime-se com null, nunca com um valor de outro período. */
  const top = topPayable(inMonth);
  const pend = pendingPayables(payables);
  /* EM ATRASO (D5): GLOBAL e "até hoje", como pagamentosPendentes — nunca limitado ao
   * mês civil. Uma conta vencida em março continua vencida hoje. */
  const atraso = overduePayables(payables, now);

  const metrics = {
    /* MÊS DE REFERÊNCIA da página: o mês CIVIL corrente (D4). É sempre conhecido
     * — é o calendário — mesmo quando não há títulos nenhuns nesse mês. Nesse caso
     * o que falta são dados, e isso diz-se com totalMes: 0 REAL, não com mês null.
     *
     * NÃO confundir com:
     *   - financeiro.payables.monthKey        -> último mês FECHADO (alertas mensais);
     *   - resumo.metrics.contasPagarMonthKey  -> mês civil, mas por VENCIMENTO. */
    monthKey: latest,
    totalMes: totalPayables(inMonth),
    /* DELTAS SUPRIMIDOS (D4). O mês civil está EM CURSO e o anterior está completo:
     * comparar 14 dias com 31 não é uma variação, é o calendário a andar. É a mesma
     * regra já aplicada ao card "Contas a pagar este mês" do Resumo.
     * payableMoM/avgDailyMoM também eram cegos à âncora (comparavam os dois últimos
     * meses COM TÍTULOS), pelo que descreveriam períodos que a página não mostra.
     * null e não 0: ausência de comparação, não variação nula. */
    totalDelta: null,
    /* mediaDiaria e mediaDelta permanecem no CONTRATO por decisão explícita, embora
     * a página já não os mostre: o KPI foi substituído por "Contas em Atraso" (D5).
     * A limpeza destes campos fica para fase posterior. */
    mediaDiaria: avgDailyForMonth(payables, latest),
    mediaDelta: null,
    emAtraso: atraso.valor,
    emAtrasoQtd: atraso.qtd,
    /* valor null = não há despesas no mês. Nunca 0: zero seria afirmar que existe
     * uma maior despesa e que ela vale zero. */
    maiorDespesa: top
      ? {
          fornecedor: (top.contato && top.contato.nome) || "—",
          valor: Number(top.valor) || 0,
          data: formatPtDate(payableDate(top)),
        }
      : { fornecedor: "—", valor: null, data: "—" },
    pagamentosPendentes: pend.valor,
    pendentesQtd: pend.qtd,
  };

  return {
    metrics,
    evolution: expenseDailySeries(payables, latest),
    byCategory: expenseByCategory(inMonth),
    list,
    /* MOVIMENTOS POR CLASSIFICAR — aditivo. Só meses que TÊM títulos por classificar
     * entram; um array vazio significa "nada por classificar", e a página não desenha
     * secção nenhuma. Não é uma pendência do utilizador dentro do Finer One: a
     * categoria resolve-se no ERP, e por isso isto informa em vez de pedir. */
    porClassificar: classificacoesDe_(payables, mesesClassificacao),
  };
}

// Dataset completo pronto para as telas.
// Lado Fornecedores da tela Clientes e Fornecedores, a partir de contas a pagar.
// Apenas títulos em aberto (situacao 1). Sem delta de saldo (ponto-no-tempo).
function buildFornecedores(payables) {
  const pend = pendingPayables(payables); // { valor, qtd } dos abertos

  const metrics = {
    saldoPagar: pend.valor,
    saldoPagarDelta: null, // oculto: sem base honesta de comparação mês a mês
    faturasAbertasPagar: pend.qtd,
    faturasAbertasPagarVencer7: payablesDueWithin(payables, 7),
  };

  const top = suppliersByOpenBalance(payables).slice(0, 6);

  // Todos os títulos abertos, ordenados por vencimento. openInvoices continua limitado
  // a 20 (exibição); allOpenInvoices é a base completa para cashflow, alertas e CSV.
  // valor = saldo restante (payableOpenBalance), não o valor original do título.
  const allOpen = openPayables(payables)
    .slice()
    .sort((a, b) => {
      const da = toDate(a.vencimento), db = toDate(b.vencimento);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    })
    .map((p) => ({
      id: p.id,
      fornecedor: (p.contato && p.contato.nome) || "\u2014",
      numero: (p.numeroDocumento != null && p.numeroDocumento !== "") ? String(p.numeroDocumento) : "\u2014",
      dataEmissao: p.dataEmissao ? formatPtDate(p.dataEmissao) : "\u2014",
      vencimento: p.vencimento ? formatPtDate(p.vencimento) : "\u2014",
      valor: payableOpenBalance(p),
      diasAtraso: payableDaysOverdue(p),
    }));

  const openInvoices = allOpen.slice(0, 20);

  return { metrics, top, openInvoices, allOpenInvoices: allOpen };
}

// Lado Clientes da tela Clientes e Fornecedores, a partir de contas a receber.
// Apenas títulos em aberto (situacao 1) alimentam saldo/top/faturas. Sem delta de
// saldo (ponto-no-tempo, sem base honesta de comparação mês a mês). Espelha buildFornecedores.
function buildRecebiveis(receivables) {
  const pend = pendingReceivables(receivables); // { valor, qtd } dos abertos

  const metrics = {
    saldoReceber: pend.valor,
    saldoReceberDelta: null, // oculto: sem base honesta de comparação mês a mês
    faturasAbertasReceber: pend.qtd,
    faturasAbertasReceberVencer7: receivablesDueWithin(receivables, 7),
  };

  const top = clientsByOpenBalance(receivables).slice(0, 6);

  // Todos os títulos abertos, ordenados por vencimento, na forma de linha das tabelas.
  // openInvoices continua limitado a 20 (exibição); allOpenInvoices é a base completa
  // para cashflow, alertas e CSV (allOpenInvoices ?? openInvoices).
  const allOpen = openReceivables(receivables)
    .slice()
    .sort((a, b) => {
      const da = toDate(a.vencimento), db = toDate(b.vencimento);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    })
    .map((r) => ({
      id: r.id,
      cliente: (r.contato && r.contato.nome) || "\u2014",
      numero: (r.numeroDocumento != null && r.numeroDocumento !== "") ? String(r.numeroDocumento) : "\u2014",
      dataEmissao: r.dataEmissao ? formatPtDate(r.dataEmissao) : "\u2014",
      vencimento: r.vencimento ? formatPtDate(r.vencimento) : "\u2014",
      valor: receivableOpenBalance(r),
      diasAtraso: receivableDaysOverdue(r),
    }));

  const openInvoices = allOpen.slice(0, 20);

  return { metrics, top, openInvoices, allOpenInvoices: allOpen };
}

/* Janela de verificação de fecho: os 3 últimos meses civis terminados. Fixa nesta fase,
 * para que uma pendência ignorada não desapareça no mês seguinte, sem por isso inundar
 * um cliente novo com o histórico inteiro. */
const MESES_JANELA_FECHO = 3;

export function buildSalesDataset({ orders, payables, receivables, coverage: coverageOverride, manualInputsByMonth, manualCoverage, meta, companyId }) {
  /* `manualInputsByMonth` é OPCIONAL: mapa { "aaaa-mm": { cmv?: number } }.
   * O contrato é POR MÊS, não "por mês fechado": qualquer mês construído aqui recebe
   * exclusivamente a sua própria entrada — o par fechado/anterior via
   * buildMetricsWithComparison, e o mês em curso via leitura direta da sua chave.
   * Aqui não se deriva, não se normaliza chaves, não se completam meses em falta e
   * não se lê de config/env/armazenamento. Sem mapa, o comportamento é exatamente o
   * anterior: CMV null e availability unavailable. */
  const manuaisPorMes = manualInputsByMonth || {};
  // Critério único de dados reais de contas a pagar: array presente (mesmo vazio).
  // undefined/null => falha ou ausência => telas usam mock + Demo.
  // [] => dado real com zero títulos => zeros reais, sem selo.
  const hasPayables = Array.isArray(payables);
  // Critério idêntico ao de payables: array presente (mesmo vazio) => dado real.
  // undefined/null => falha ou ausência => lado Clientes segue mock + Demo.
  const hasReceivables = Array.isArray(receivables);

  // ── Camada financeira central ────────────────────────────
  // Um só sítio escolhe o mês: o último FECHADO (métricas de fecho, diagnóstico
  // e score). O mês em curso fica disponível à parte, para acompanhamento.
  /* A cobertura configurada afirma até que mês o ERP já entregou tudo. Essa afirmação
   * pressupõe que a LEITURA do ERP correu até ao fim — e quando a fonte se declara
   * incompleta (`meta.parcial`), o pressuposto cai. `coverageComSnapshotParcial` marca
   * isso na cobertura para o motor poder vetar; sem nada a vetar devolve a mesma
   * referência e o comportamento é bit a bit o anterior. */
  /* ── COBERTURA EFETIVA: configurada + confirmada por uma pessoa ──────────────────
   * `company.js` deixa de ser fonte OPERACIONAL e passa a ser o que devia ter sido
   * desde sempre: o fallback. `payables.completeThroughMonth: "2026-06"` era editado à
   * mão todos os meses — uma operação mensal disfarçada de constante.
   *
   * A ORDEM DESTAS DUAS CHAMADAS É A GARANTIA DE SEGURANÇA, e não é permutável:
   *
   *   1. `resolveEffectiveCoverage` — a confirmação humana escreve o limite;
   *   2. `coverageComSnapshotParcial` — o facto técnico veta por cima.
   *
   * Invertê-las deixaria uma confirmação humana apagar a marca de um snapshot
   * incompleto. Assim não há sequer caminho para isso: `sourceAvailability` testa
   * `snapshotPartial` ANTES de olhar para o limite, e o limite é escrito primeiro.
   * Uma pessoa pode dizer "os documentos de julho já cá estão"; não pode dizer que a
   * leitura do ERP chegou ao fim quando o próprio ERP declarou que não. */
  const coverage = coverageComSnapshotParcial(
    resolveEffectiveCoverage({
      configCoverage: coverageOverride || ACTIVE_COMPANY.historyCoverage,
      manualCoverage,
      referenceDate: new Date(),
    }),
    meta
  );
  const payablesParaDre = hasPayables ? payables : null;

  /* DATA DE REFERÊNCIA — injetada, nunca implícita.
   *
   * `sourceAvailability` precisa de saber onde está o relógio para recuar ao último
   * mês civil TERMINADO quando a cobertura não declara limite. Até 24/08/2026 esta
   * chamada não passava data nenhuma: o recuo nunca acontecia e a ausência de limite
   * era lida como cobertura ilimitada — o caminho que fez a âncora da DRE saltar para
   * 2027-07. O motor passou a ser seguro sozinho (limite desconhecido => partial), mas
   * essa segurança sem data seria conservadora DEMAIS: nenhum mês seria real.
   * Injetar a data é o que devolve a cobertura correta sem depender de configuração.
   *
   * Uma só leitura do relógio por dataset, partilhada por todas as âncoras: duas
   * leituras separadas podem cair em lados opostos da meia-noite do dia 1. */
  const referenceDate = new Date();

  /* FECHO MENSAL — janela fixa dos últimos meses civis JÁ TERMINADOS.
   * A janela vem do calendário, nunca do último mês com movimento: um mês terminado
   * sem um único documento continua a precisar dos seus dados obrigatórios. Cada mês
   * é apurado pelo caminho oficial (buildMonthlyDre -> buildFinancialMetrics), pelo que
   * nenhuma regra de DRE é reimplementada aqui. São poucos meses e cada um percorre os
   * dados uma vez; se a janela crescer, isto passa a merecer memoização.
   *
   * Calculado ANTES das âncoras (era depois, até 24/08/2026) porque a âncora dos KPIs
   * passou a derivar destes fechos — ver `mesFechado` logo abaixo. */
  const closings = closedMonthKeys({ now: referenceDate, count: MESES_JANELA_FECHO }).map((mk) => {
    const metricsDoMes = buildFinancialMetrics(buildMonthlyDre({
      orders, payables: payablesParaDre, monthKey: mk,
      manualInputs: manuaisPorMes[mk], coverage, referenceDate,
    }));
    const fecho = buildMonthlyClosing({
      monthKey: mk,
      metrics: metricsDoMes,
      // Mesma cobertura histórica da DRE: um mês anterior a firstCompleteMonth não
      // gera pendência de fecho, sem puxar um mês extra para compensar a janela.
      coverage,
      now: referenceDate,
    });
    if (!fecho) return fecho;
    /* ── SEGUNDO EIXO, ADITIVO: completude FINANCEIRA ─────────────────────────────
     * O fecho responde a "o utilizador preencheu o que lhe foi pedido?". Não responde
     * a "este mês pode sustentar KPIs de rentabilidade?" — e tratá-lo como se
     * respondesse fazia julho virar âncora assim que o CMV entrasse, com as deduções
     * e as despesas operacionais desse mês ainda parciais.
     *
     * Anexado ao fecho (e não devolvido à parte) porque descreve o MESMO mês e é
     * consumido pelos mesmos sítios: Resumo, Dados a completar e alertas já recebem
     * `closings`. Campo novo, nada renomeado: quem lê `status`, `items` ou
     * `missingItems` continua a ler exatamente o mesmo. */
    return { ...fecho, financial: buildFinancialCompleteness({ metrics: metricsDoMes, closing: fecho }) };
  });

  /* ── ÂNCORA DOS KPIs: o último mês ELEGÍVEL ───────────────────────────────────────
   * Não é o último mês civil encerrado, e a distinção passou a importar em 24/08/2026,
   * quando a cobertura da fonte deixou de estar acoplada à validação humana.
   *
   * Julho é hoje o último mês civil encerrado, com receita real — e é por isso que a
   * plataforma já lhe pede o CMV. Mas sem CMV, o seu lucro bruto, EBITDA e resultado
   * líquido são `null`. Ancorar aqui encheria o Resumo de traços onde antes havia
   * números, sem que nada tivesse piorado nos dados.
   *
   * ELEGIBILIDADE, NÃO REQUISITOS SATISFEITOS. Até esta correção usava-se
   * `latestCompleteMonthKey`, que só olha para o catálogo de requisitos. Como o
   * catálogo tem hoje uma entrada, lançar o CMV de julho esgotava-o e julho virava a
   * âncora — com as deduções e as despesas operacionais desse mês ainda `partial` e um
   * EBITDA que o próprio motor marcava como parcial. `latestAnchorEligibleMonthKey`
   * exige as duas coisas: requisitos satisfeitos E linhas essenciais da DRE completas.
   *
   * Fallback para `latestUsableFinancialMonth` quando nenhum mês da janela é elegível:
   * é preferível a `null` — um mês com receita e deduções verdadeiras ainda responde a
   * perguntas úteis, ao passo que `null` apagaria o Resumo inteiro.
   *
   * MAS O RECURSO DEIXA DE SER SILENCIOSO (`anchorSource`, abaixo). Medido na matriz de
   * `financialAnchor.test.js`: com as contas a pagar ausentes, o recurso elegia o mês
   * civil com deduções, EBITDA e resultado todos `unavailable` — e `referenciaAtrasada`
   * ficava `false`, porque a âncora ERA o mês civil. Literalmente verdade, e lido como
   * "está tudo em dia" sobre um mês que não tem EBITDA nenhum. */
  const mesCompleto = latestAnchorEligibleMonthKey(closings);
  const mesUsavel = latestUsableFinancialMonth({ orders, payables: payablesParaDre, coverage, referenceDate });
  const mesFechado = mesCompleto || mesUsavel;
  const anchorSource = mesCompleto
    ? ANCHOR_SOURCE.ELIGIBLE
    : (mesUsavel ? ANCHOR_SOURCE.FALLBACK : ANCHOR_SOURCE.NONE);
  const mesEmCurso = latestUsableFinancialMonth({ orders, payables: payablesParaDre, coverage, allowPartial: true, referenceDate });

  /* Último mês civil ENCERRADO, independentemente de estar completo. É a âncora do
   * "o que falta" — e o mês que o Resumo deve nomear ao dizer que há trabalho por
   * fazer. Vem do mesmo calendário que gera a janela de fechos, para não haver duas
   * definições de "mês anterior" no mesmo dataset. */
  const mesCivilEncerrado = closedMonthKeys({ now: referenceDate, count: 1 })[0] || null;
  const comparacao = mesFechado
    ? buildMetricsWithComparison({
        orders, payables: payablesParaDre, monthKey: mesFechado,
        previousMonthKey: prevMonthKey(mesFechado), coverage,
        manualInputsByMonth,
      })
    : null;

  /* ── Mês âncora PRÓPRIO das contas a pagar ───────────────────
   * mesFechado é o mês da RECEITA/DRE. Pedidos e contas a pagar vêm de snapshots
   * distintos e coverage.payables pode fechar noutro mês (Fase 2), pelo que os
   * alertas mensais de despesas não podem herdar o mês da receita: com payables
   * fechados até julho ficariam presos a junho; fechados só até maio, afirmariam
   * junho sem cobertura.
   *
   * A escolha reutiliza os helpers existentes, sem reimplementar coverage:
   *   - payablesCoverage(coverage) aplica a herança de coverage.payables;
   *   - latestUsableFinancialMonth SEM orders percorre apenas os meses que têm
   *     contas a pagar (availableDreMonths) e aceita o último cuja fonte esteja
   *     fechada. Sem nenhum mês fechado, aceita o último parcial — assinalado em
   *     `partial`, que faz os alertas declararem o mês em curso e calarem os
   *     comparativos, em vez de cair no "último mês com títulos".
   */
  const coveragePayables = payablesCoverage(coverage);
  const mesPayablesFechado = hasPayables
    ? latestUsableFinancialMonth({ payables: payablesParaDre, coverage: coveragePayables, referenceDate })
    : null;
  const mesPayables = mesPayablesFechado
    || (hasPayables
      ? latestUsableFinancialMonth({ payables: payablesParaDre, coverage: coveragePayables, allowPartial: true, referenceDate })
      : null);
  const mesPayablesAnterior = mesPayables ? prevMonthKey(mesPayables) : null;

  /* ── DOIS SINAIS DISTINTOS, deliberadamente separados ────────
   * `partial`  = o PERÍODO está aberto/incompleto no tempo. Vem só da cobertura
   *              (availability.coberturaPayables). É este sinal que autoriza os
   *              alertas a dizer "mês em curso".
   * `classificacaoIncompleta` = existem títulos no mês cuja natureza contabilística
   *              não foi reconhecida. Reutiliza o warning `titulos-nao-classificados`
   *              que o motor já emite, em vez de criar um segundo sinal para o mesmo
   *              facto. Um mês FECHADO pode ter classificação incompleta.
   *
   * `comparable` continua a sair de availability.operatingExpenses, que combina as
   * duas coisas — e é o que se quer: comparar dois meses cuja classificação está
   * incompleta é comparar mínimos conhecidos, e "as despesas subiram X%" seria uma
   * afirmação insegura. Mês fechado + classificação incompleta => comparable false
   * sem que nada chame junho de "mês em curso".
   */
  const dreDoMes = (mk) => (mk
    ? buildMonthlyDre({ orders, payables: payablesParaDre, monthKey: mk, coverage })
    : null);
  const dreAtual = dreDoMes(mesPayables);
  const dreAnterior = dreDoMes(mesPayablesAnterior);
  const dispOpex = (dre) => (dre ? dre.availability.operatingExpenses : null);
  const temNaoClassificados = (dre) =>
    !!(dre && (dre.warnings || []).some((w) => w.code === "titulos-nao-classificados"));

  const dispPayablesAtual = dispOpex(dreAtual);
  const financeiroPayables = {
    monthKey: mesPayables,
    previousMonthKey: mesPayablesAnterior,
    comparable: canComparePeriods(dispPayablesAtual, dispOpex(dreAnterior)),
    // Parcialidade TEMPORAL apenas. Não vira true por falta de categoria.
    partial: dreAtual ? dreAtual.availability.coberturaPayables === "partial" : false,
    classificacaoIncompleta: temNaoClassificados(dreAtual),
    availability: dispPayablesAtual,
  };

  const financeiro = {
    monthKey: mesFechado,
    metrics: comparacao ? comparacao.current : null,
    previous: comparacao ? comparacao.previous : null,
    comparable: comparacao ? comparacao.comparable : false,
    // Mês em curso (parcial), só para acompanhamento — nunca para comparações.
    // O input manual é por mês, logo aplica-se também aqui: leitura da chave do mês
    // em curso, sem truthy e sem default. Chave ausente => undefined => CMV null e
    // availability unavailable; o valor de outro mês nunca é herdado.
    emCurso: (mesEmCurso && mesEmCurso !== mesFechado)
      ? buildFinancialMetrics(buildMonthlyDre({
          orders, payables: payablesParaDre, monthKey: mesEmCurso,
          manualInputs: manuaisPorMes[mesEmCurso], coverage,
        }))
      : null,
    // Contexto das contas a pagar, com cobertura própria (pode divergir de monthKey).
    payables: financeiroPayables,

    /* ── DOIS MESES, DUAS PERGUNTAS (24/08/2026) ──────────────────────────────────
     * Campos ADITIVOS: nenhum consumidor existente muda de comportamento por eles
     * existirem, e `monthKey` continua a ser o mês dos KPIs, como sempre foi.
     *
     * `monthKey`            -> "de que mês são estes números?"     (último COMPLETO)
     * `civilMonthKey`       -> "que mês acabou e precisa de mim?"  (último ENCERRADO)
     *
     * Enquanto o fecho era avançado à mão só depois de o CMV estar lançado, os dois
     * coincidiam sempre e um só campo bastava. Separados os eixos de cobertura e de
     * validação, passam a divergir precisamente quando há trabalho por fazer — que é
     * quando o utilizador mais precisa de ver os dois.
     *
     * `closingPendente` é o fecho do mês civil encerrado, tal como o motor o produziu.
     * Está aqui para que o Resumo possa nomear o mês e a pendência sem reconstruir
     * nada nem inventar uma segunda definição de "mês anterior". `null` quando o mês
     * encerrado não está na janela de fechos. */
    civilMonthKey: mesCivilEncerrado,
    closingPendente: closings.find((c) => c.monthKey === mesCivilEncerrado) || null,

    /* ── DE QUE MATERIAL É FEITA A ÂNCORA ─────────────────────────────────────────
     * `anchorSource` responde a "este mês foi ESCOLHIDO ou foi o que sobrou?".
     * `anchorEligible` é o mesmo facto em booleano, para quem só precisa do sim/não.
     * `anchorFinancial` é o veredito completo do mês âncora — com os bloqueios
     * nomeados — quando esse mês está dentro da janela de fechos. Fora da janela é
     * `null`: não se inventa um veredito que ninguém apurou.
     *
     * NENHUMA UI PODE TRATAR UM `fallback` COMO MÊS OFICIALMENTE COMPLETO. Os números
     * continuam verdadeiros no que têm; o que não se pode é apresentá-los como fecho. */
    anchorSource,
    anchorEligible: anchorSource === ANCHOR_SOURCE.ELIGIBLE,

    /* ── DIAGNÓSTICO DA COBERTURA DECLARADA ──────────────────────────────────────
     * Contrato INTERNO por agora: nenhuma tela o mostra, e nada na disponibilidade
     * muda por causa dele. Responde a "há meses civis já encerrados que a cobertura
     * declarada ainda não alcança?" — a pergunta mecânica que o calendário resolve
     * sozinho, e que até agora era invisível: uma configuração esquecida durante
     * meses tinha o mesmo aspeto de uma configuração conservadora e correta.
     *
     * NÃO avança cobertura nenhuma. Declarar um mês completo é um facto
     * contabilístico que nenhum campo do snapshot sabe. */
    coverageDiagnostics: buildCoverageDiagnostics({ coverage, referenceDate }),
    anchorFinancial: (closings.find((c) => c.monthKey === mesFechado) || {}).financial || null,
    /* true quando os KPIs NÃO são do mês que acabou de terminar — ou seja, quando há
     * um mês encerrado por completar. É o sinal que autoriza o Resumo a dizê-lo. */
    referenciaAtrasada: Boolean(mesCivilEncerrado && mesFechado && mesCivilEncerrado !== mesFechado),
  };

  return {
    receitas: buildReceitas(orders),
    clientes: buildClientes(orders),
    resumo: buildResumo(orders, payables, financeiro),
    alertas: buildAlertas(orders, payables, financeiro, closings),
    /* `referenceDate` injetada (era `now` por omissão, uma segunda leitura do relógio
     * no mesmo dataset — duas leituras podem cair em lados opostos da meia-noite do
     * dia 1). Os meses de classificação são o mês civil da página mais a janela de
     * fecho, sem duplicados. */
    despesas: hasPayables
      ? buildDespesas(payables, referenceDate,
          [...new Set([monthKey(referenceDate), ...closings.map((c) => c.monthKey)])])
      : null, // null => Despesas usa mock
    fornecedores: hasPayables ? buildFornecedores(payables) : null, // null => Fornecedores usa mock
    recebiveis: hasReceivables ? buildRecebiveis(receivables) : null, // null => lado Clientes usa mock
    diagnostico: hasPayables ? buildFinancialDiagnostic(orders, payables, {
          financialMetrics: financeiro.metrics,
          previousFinancialMetrics: financeiro.previous,
          financialComparable: financeiro.comparable,
          monthKey: financeiro.monthKey, // sincroniza o mês do diagnóstico com o da DRE
        }) : null, // null => tela Diagnóstico usa mock
    // Catálogo documental (Fase 5). Aditivo: nenhuma tela existente muda.
    // Fonte real = metadata do Bling; nenhuma fonte devolve ficheiro, logo todos os
    // documentos saem metadata_only. `available` descreve a FONTE, não a lista.
    documents: buildDocumentCatalog({
      orders,
      payables: hasPayables ? payables : null,
      receivables: hasReceivables ? receivables : null,
      currency: ACTIVE_COMPANY.currency,
    }),
    // Métricas financeiras centrais (DRE). Fonte única de receita, margem e
    // resultado para Resumo, Diagnóstico e Score.
    financeiro,
    /* FECHO MENSAL — os MESMOS fechos que originaram os alertas acima, expostos para
     * o Resumo poder mostrar o estado do mês anterior (C7C).
     *
     * É a mesma referência passada a buildAlertas: uma só fonte de verdade, apurada
     * uma só vez. O Resumo não reconstrói o estado a partir do número de alertas —
     * seria inverter a dependência, e um mês INDETERMINATE (que não gera alerta
     * nenhum) ficaria indistinguível de um mês completo.
     *
     * Ordem: do mês mais recente para o mais antigo, como closedMonthKeys os produz.
     * Quem precise de um mês concreto procura-o por monthKey, nunca por índice. */
    closings,
    /* FRESCURA E COMPLETUDE DA LEITURA (C7F, C7F.3E). Metadata pura, em dois eixos
     * INDEPENDENTES: `geradoEm` diz QUANDO cada fonte gerou o snapshot (e a mais antiga
     * das três no agregado); `parcial` diz se o rebuild chegou ao fim. Um snapshot pode
     * ser recente e estar incompleto — confundir as duas coisas foi um defeito próprio.
     *
     * NÃO participa em cálculo nenhum — nenhuma linha da DRE, nenhum mês âncora e
     * nenhuma disponibilidade a consultam. É consumida pela faixa de frescura
     * (utils/dataFreshness.js + utils/dataHealth.js -> components/ui/DataHealth.jsx,
     * montada no AppShell).
     *
     * `null` quando a fonte não declara — nunca o relógio local, que descreveria o
     * momento da leitura e não o da recolha dos dados, e nunca `false` por omissão, que
     * afirmaria completude sem prova. */
    meta: meta ?? null,

    /* ── COBERTURA EFETIVA, exposta ────────────────────────────────────────────────
     * `PerformanceFinanceira` lia `ACTIVE_COMPANY.historyCoverage` DIRETAMENTE para a
     * série mensal de atividade. Era um segundo leitor da configuração, e a partir do
     * momento em que a cobertura passa a poder ser confirmada dentro do produto, esse
     * segundo leitor passaria a discordar do motor: a DRE veria julho como real e a
     * série ao lado continuaria a chamar-lhe fora de cobertura.
     *
     * Expor a cobertura JÁ RESOLVIDA (config + confirmação + veto do snapshot) dá às
     * páginas exatamente o mesmo objeto que o motor usou. Quem não tiver dataset — modo
     * demonstrativo — continua a cair na configuração, que ali é o que se quer.
     *
     * `coverageOrigem` responde a "isto foi confirmado por alguém ou é o valor de
     * partida?", que é a pergunta que a UI precisa de fazer e que o limite sozinho não
     * responde. */
    coverage,
    coverageOrigem: describeCoverageSource(coverage),

    /* ── A QUE EMPRESA ESTE DATASET PERTENCE ───────────────────────────────────────
     * Acrescentado na fundação SaaS. Até aqui a resposta era implícita — havia uma
     * empresa e era essa — e implícito chega enquanto for uma.
     *
     * Deixa de chegar no instante em que existe um seletor de empresas: a leitura
     * ainda não é escopada por empresa (isso é o passo D do plano de migração), e um
     * dataset que não diz de quem é pode ser apresentado sob o nome de outra. Este
     * campo é o que permite a `resolveCompanyDataScope` recusar essa apresentação em
     * vez de a fazer em silêncio.
     *
     * Não muda cálculo nenhum: é uma etiqueta de proveniência.
     *
     * ─── A ETIQUETA TEM DE VIR DA LEITURA, NÃO DA CONFIGURAÇÃO ────────────────────
     * Estava `companyId: ACTIVE_COMPANY.id` — a constante compilada, sempre. Enquanto a
     * leitura foi sempre da Overcel, a constante e a verdade coincidiram e nada as
     * distinguia. Deixam de coincidir no dia em que o transporte protegido liga: a
     * leitura passa a ser `/api/companies/:id/financial-data` e traz os dados de QUEM
     * FOI PEDIDO, enquanto a etiqueta continuava a dizer "overcel".
     *
     * O efeito não era uma fuga — era o contrário, e igualmente grave: o guarda
     * `resolveCompanyDataScope` comparava a empresa ativa com a configuração e concluía
     * NAO_LIGADA para toda a gente menos a empresa compilada. Os dados certos eram
     * lidos e depois recusados pelo guarda que existe para os proteger.
     *
     * E, a prazo, o defeito mais fundo: uma etiqueta que não depende da leitura nunca
     * pode DETETAR uma leitura da empresa errada. O guarda estava a comparar a
     * configuração consigo própria — acertava por coincidência, não por construção.
     *
     * Sem `companyId` — o transporte LEGADO, que é anónimo e serve uma empresa só —
     * mantém-se a configuração. É onde a verdade está nesse caminho, e é o
     * comportamento de hoje sem uma vírgula de diferença. */
    companyId: (typeof companyId === "string" && companyId !== "") ? companyId : ACTIVE_COMPANY.id,

    /* ── ENTRADAS DO REBUILD ───────────────────────────────────────────────────────
     * `orders` e `payables` já eram expostos; faltavam estes dois para se poder
     * reconstruir o MESMO dataset com uma cobertura diferente sem voltar à rede.
     *
     * Confirmar cobertura não muda um único dado — muda a leitura que o motor faz dos
     * mesmos dados. Repetir as quatro leituras para aplicar uma string gastaria a quota
     * do Bling e, pior, arriscaria apanhar um snapshot diferente do que está no ecrã,
     * tornando o antes/depois incomparável. Ver `rebuildComCobertura`.
     *
     * São as entradas CRUAS, não uma segunda vista: nada aqui é uma nova verdade. */
    rebuildInputs: {
      receivables: hasReceivables ? receivables : undefined,
      manualInputsByMonth,
    },

    orders, // exposto para recálculos por período no front (ex.: donut de categorias)
    // Contas a pagar normalizadas, expostas para o motor de DRE (precisa de
    // categoriaNome, historico e datas de competência, que despesas.list não tem).
    // null => fonte indisponível (nunca confundir com lista real vazia).
    payables: hasPayables ? payables : null,
  };
}

/**
 * Reconstrói um dataset já carregado, aplicando uma cobertura confirmada.
 *
 * ─── PORQUE ISTO EXISTE, EM VEZ DE UM RELOAD ────────────────────────────────────────
 * Confirmar cobertura não muda um único dado: muda a leitura que o motor faz dos mesmos
 * dados. Voltar a pedir os quatro snapshots ao backend para aplicar uma string seria
 * gastar a quota do Bling — e, pior, arriscar que a confirmação apanhasse um snapshot
 * diferente do que estava no ecrã, tornando o antes/depois impossível de comparar.
 *
 * Reaproveita as MESMAS entradas do dataset anterior (`orders`, `payables`, `meta`), que
 * já estão expostas, e volta a percorrer o caminho oficial. Nenhuma regra é reimplementada.
 *
 * `null` quando não há dataset ou lhe faltam as entradas — o chamador mantém o que tem.
 *
 * @param {object|null} dataset dataset devolvido por buildSalesDataset
 * @param {object} manualCoverage bloco de cobertura confirmada (ver utils/manualCoverage)
 */
export function rebuildComCobertura(dataset, manualCoverage) {
  if (!dataset || !Array.isArray(dataset.orders)) return null;
  const entradas = dataset.rebuildInputs || {};
  return buildSalesDataset({
    orders: dataset.orders,
    /* `?? undefined` e nunca `|| []`: `null` significa FONTE AUSENTE e `[]` significa
     * fonte real com zero títulos. Colapsar os dois faria um rebuild transformar uma
     * fonte em falta numa fonte vazia — e o produto passaria a mostrar zeros reais
     * onde devia mostrar o selo Demo. */
    payables: dataset.payables ?? undefined,
    receivables: entradas.receivables,
    manualInputsByMonth: entradas.manualInputsByMonth,
    manualCoverage,
    meta: dataset.meta ?? undefined,
    /* Confirmar cobertura não muda de empresa. Sem isto, o rebuild ia buscar a etiqueta
     * à configuração e um dataset da empresa B renascia carimbado como Overcel — o
     * guarda de escopo, que até aí deixava passar, passaria a recusar a meio da sessão. */
    companyId: dataset.companyId,
  });
}

// Versão testável a partir de dados brutos Bling.
export function buildSalesDatasetFromRaw(rawSales = []) {
  const orders = (rawSales || []).map(normalizeOrder);
  return buildSalesDataset({ orders });
}

// ── Carregamento ──────────────────────────────────────────────

/* FRESCURA DA FONTE (C7F). O backend serve de um snapshot e declara quando o gerou.
 * Essa informação vinha no payload e era deitada fora — a aplicação não tinha como saber
 * que estava a mostrar dados de há dias, nem como avisar.
 *
 * ─── DOIS CONTRATOS, NÃO UM (C7F.3A) ────────────────────────────────────────────────
 * A C7F.2 leu apenas `meta.geradoEm`. A auditoria ao payload de PRODUÇÃO mostrou que esse
 * caminho não existe hoje em fonte nenhuma: pedidos e despesas não declaram data (chaves
 * de topo: apenas `data`) e recebíveis declara-a em `debug.snapshotMeta.geradoEm`. O
 * resultado era `geradoEm: null` em todas as leituras — e um UNKNOWN permanente na UI, que
 * nunca chegava a avisar por mais velho que o snapshot estivesse. A camada de frescura
 * estava construída e testada, e morta em produção, por um caminho de leitura.
 *
 * Aceitam-se agora os dois. `meta.geradoEm` mantém a PRECEDÊNCIA por ser o contrato
 * canónico para onde o backend deve convergir; `debug.snapshotMeta.geradoEm` é o que ele
 * emite hoje. Quando o Apps Script passar a declarar `meta` nas três fontes, esta função
 * continua correta sem mudar uma linha — e só então o ramo de `debug` pode sair.
 *
 * Aqui só se LÊ e se transporta. Nenhum cálculo depende disto, nenhuma linha da DRE muda:
 * é metadata sobre a leitura, não um dado financeiro. Ausência => null, nunca uma data
 * inventada a partir do relógio nem inferida do último movimento dos dados — dizer
 * "atualizado agora" sobre um snapshot de origem desconhecida seria exatamente a mentira
 * que isto vem resolver. */
function lerGeradoEm(res) {
  const valor = res?.meta?.geradoEm ?? res?.debug?.snapshotMeta?.geradoEm;
  return (typeof valor === "string" && valor !== "") ? valor : null;
}

/* COMPLETUDE DA FONTE (C7F.3E). Frescura e completude são propriedades DIFERENTES e
 * até agora só uma viajava. Um rebuild de recebíveis que esgote o orçamento de tempo
 * grava um snapshot com `parcial: true`: é recente e está incompleto ao mesmo tempo.
 * Sem este campo, a aplicação podia dizer "Atualizado há 5 minutos" sobre um conjunto
 * a que faltam títulos — verdade na data, engano no conteúdo.
 *
 * Só se LÊ e transporta, tal como `geradoEm`. Nenhum cálculo depende disto e nenhuma
 * linha da DRE muda: quem decidir o que fazer com a informação é a camada de cima.
 *
 * Três estados, e a diferença importa: `true` incompleto declarado, `false` completo
 * declarado, `null` a fonte não se pronunciou. Ausência de declaração NÃO é completude
 * — é a mesma inversão que a frescura já teve de corrigir. */
function lerParcial(res) {
  /* SINAIS DE INCOMPLETUDE, EM OU LÓGICO PESSIMISTA.
   *
   * `parcial` era o único campo lido, e no backend significava apenas "o rebuild não
   * chegou ao fim no eixo do TEMPO". O eixo da PAGINAÇÃO viajava à parte, em
   * `listagemTruncada`, e ninguém o lia: uma listagem que batesse no teto MAX_PAGES
   * chegava aqui com `parcial: false` e era declarada COMPLETA em toda a cadeia — o
   * exato oposto do invariante "partial nunca vira complete".
   *
   * O backend passou a agregar os dois em `parcial`, o que resolve o problema na
   * origem. Esta segunda leitura é deliberadamente redundante e não é desperdício: a
   * produção corre Apps Script v11, que não tem a correção, e qualquer combinação
   * futura de versões backend/frontend fica coberta. Um sinal de incompletude que
   * chegue por QUALQUER um dos caminhos veta a afirmação "completo".
   *
   * `enriquecimentoIncompleto` conta pela mesma razão que conta no backend: o seu
   * efeito é um nome de categoria ERRADO, não ausente.
   *
   * Regra dos três estados preservada: `true` incompleto declarado, `false` completo
   * declarado por TODOS os sinais presentes, `null` a fonte não se pronunciou. Ausência
   * de declaração continua a não ser completude.
   *
   * Lêem-se os DOIS envelopes (`meta` e `debug.snapshotMeta`) em vez de escolher um: o
   * `??` original escolhia, e escolher perde informação quando um envelope declara um
   * sinal que o outro não tem. Recolher tudo nunca pode transformar `true` em `false`. */
  const envelopes = [res?.meta, res?.debug?.snapshotMeta];
  const sinais = envelopes.flatMap((m) =>
    (m && typeof m === "object" && !Array.isArray(m))
      ? [m.parcial, m.listagemTruncada, m.enriquecimentoIncompleto]
      : []
  );
  const booleanos = sinais.filter((s) => typeof s === "boolean");
  if (booleanos.length === 0) return null;
  return booleanos.some((s) => s === true);
}

/* LINHAS OU FALHA — o Apps Script responde HTTP 200 mesmo quando falha.
 *
 * O que chegava aqui antes: `res?.data ?? res ?? []`. Perante um payload de erro
 * (`{ error: true, message }`), `data` é indefinido, o `??` cai para o próprio objeto
 * de erro, e `rows` passava a ser um objeto. O `.map()` a seguir rebentava com
 * TypeError — e rebentava FORA do allSettled, no corpo do loadFinerData, apanhado só
 * pelo catch global. Resultado: uma falha numa fonte secundária (despesas) derrubava
 * o dataset inteiro para `unavailable`, destruindo o best-effort por fonte que o
 * allSettled existe precisamente para garantir.
 *
 * Passa a rejeitar aqui, de forma explícita. Uma rejeição dentro de allSettled é
 * exatamente o que o desenho já sabe tratar: aquela fonte fica indisponível, as
 * outras seguem. Comportamento de sucesso: idêntico ao anterior.
 *
 * `[]` continua a ser uma resposta VÁLIDA — zero títulos é um facto, não uma falha.
 * O que deixa de passar é o que não é lista nenhuma. */
function linhasOuFalha(res, rotulo) {
  if (Array.isArray(res)) return res;                 // backend a devolver array cru
  if (res && res.error === true) {
    /* `code` existe desde a guarda de recurso desconhecido do doGet; payloads de erro
     * mais antigos só trazem `message`. Nenhum dos dois é conteúdo do utilizador. */
    const codigo = (res.code && typeof res.code === "string") ? res.code : "ERRO_BACKEND";
    throw new ApiError(`${rotulo}: backend devolveu erro (${codigo}).`, { status: 0 });
  }
  if (res && Array.isArray(res.data)) return res.data;
  throw new ApiError(`${rotulo}: resposta sem lista de dados.`, { status: 0 });
}

/* ─── AS LEITURAS PASSAM POR UM TRANSPORTE (FASE 8) ────────────────────────────────
 * Estas três funções chamavam o endpoint `pedidos/vendas` diretamente — ou seja, o
 * motor financeiro conhecia o endpoint anónimo do proxy de hoje. Passam a receber um
 * TRANSPORTE, e é ele que sabe se a leitura vai pelo caminho legado ou pelo
 * `/api/companies/:companyId/financial-data` autenticado.
 *
 * O que se ganha: no dia em que o BFF existir, nada AQUI muda. A normalização, a
 * reconciliação e os contratos financeiros deste ficheiro ficam intocados — que é o
 * objetivo, porque é o sítio onde um erro produz números errados em vez de um ecrã
 * avariado. Ver `services/dataTransport.js`. */
async function fetchRawSales(transport) {
  // Backend pode devolver { data: [...] } (padrão Bling v3) ou um array.
  const res = await transport.ler(RECURSOS.PEDIDOS);
  return { rows: linhasOuFalha(res, "Pedidos"), geradoEm: lerGeradoEm(res), parcial: lerParcial(res) };
}

async function fetchRawPayables(transport) {
  // Mesmo endpoint do proxy, com ?recurso=despesas (contas a pagar).
  const res = await transport.ler(RECURSOS.DESPESAS);
  return { rows: linhasOuFalha(res, "Despesas"), geradoEm: lerGeradoEm(res), parcial: lerParcial(res) };
}

async function fetchRawReceivables(transport) {
  // Mesmo endpoint do proxy, com ?recurso=recebiveis (contas a receber).
  // O endpoint serve só do snapshot; sem snapshot devolve { data: [], debug.fonte: "snapshot-vazio" }.
  // Distinguimos "zero títulos reais" de "ausência de snapshot" pelo debug.fonte:
  //   - fonte "snapshot"       + data:[]  => zero real (array vazio segue para o gating).
  //   - fonte "snapshot-vazio"            => ausência => erro controlado => loadFinerData
  //                                          transforma em receivables:undefined (mock + Demo).
  const res = await transport.ler(RECURSOS.RECEBIVEIS);
  if (res && res.debug && res.debug.fonte === "snapshot-vazio") {
    throw new ApiError("Recebíveis sem snapshot (fonte snapshot-vazio).", { status: 0 });
  }
  return { rows: linhasOuFalha(res, "Recebíveis"), geradoEm: lerGeradoEm(res), parcial: lerParcial(res) };
}

/** A data mais ANTIGA das disponíveis, ou null. Um conjunto de dados não é mais fresco
 *  do que a sua fonte mais velha, e afirmar o contrário seria escolher o número que
 *  fica melhor. Ordenação lexicográfica de ISO-8601, que é cronológica por construção. */
function geradoEmMaisAntigo(datas) {
  const validas = datas.filter((d) => typeof d === "string" && d !== "").sort();
  return validas.length ? validas[0] : null;
}

/**
 * Devolve { source, sales, manualInputs }.
 *
 * ─── ESCOLHA vs AVARIA (C7F.1) ──────────────────────────────────────────────────────
 * `source` distingue três desfechos que antes colapsavam todos em "mock":
 *
 *   "api"          leitura bem sucedida.
 *   "mock"         NÃO existe backend configurado. É uma decisão de quem instalou —
 *                  .env.example documenta que deixar VITE_API_BASE_URL vazio faz a app
 *                  correr com os dados de exemplo da Overcel. Intenção explícita.
 *   "unavailable"  existe backend configurado e a leitura falhou. Avaria.
 *
 * A diferença é a única coisa que permite ao produto dizer a verdade: com "mock" a app
 * afirma que os números são de demonstração; com "unavailable" afirma que perdeu o
 * acesso aos reais e não mostra número nenhum. Antes, uma quebra de rede era
 * apresentada como modo demonstração.
 *
 * `sales: null` continua a significar "sem dataset" nos dois casos de insucesso; quem
 * decide o que fazer com isso é a camada de apresentação, olhando para `source`.
 */
export async function loadFinerData({ transport, companyId } = {}) {
  if (!isApiConfigured()) {
    // Sem backend configurado: demonstração deliberada, não falha.
    return { source: "mock", sales: null, manualInputs: null };
  }
  /* Sem transporte injetado usa-se o LEGADO — o comportamento de hoje, byte a byte.
   * Quem injeta é `FinerDataProvider`, que é a única camada que conhece a sessão e a
   * empresa ativa. Este ficheiro continua a não saber que existe autenticação. */
  const transporte = transport || createLegacyDataTransport();
  try {
    /* ── LEITURA EM PARALELO (C7F) ────────────────────────────────────────────────
     * As quatro fontes eram lidas em série, cada uma com 12s de timeout: no pior caso
     * 48s de espera, e ~10s no caso normal — tempo durante o qual a aplicação mostrava
     * dados fictícios. São quatro pedidos ao MESMO endpoint, independentes entre si e
     * sem qualquer ordem de dependência: nada justificava esperar por um para pedir o
     * seguinte. O tempo total passa a ser o da fonte mais lenta, não a soma.
     *
     * `allSettled` e não `all`: `all` rejeitaria à primeira falha e derrubaria as
     * fontes que responderam bem, destruindo o best-effort por fonte que já existia.
     * Cada resultado é avaliado isoladamente, exatamente como antes.
     *
     * Diferença de comportamento assumida: quando os pedidos falham, as outras três
     * leituras passam a ocorrer à mesma (antes, a falha dos pedidos abortava tudo).
     * São pedidos ao mesmo endpoint que já teriam sido feitos no caminho normal, e o
     * resultado final é idêntico — o dataset continua a não existir. */
    const [resSales, resPayables, resReceivables, resManual] = await Promise.allSettled([
      fetchRawSales(transporte),
      fetchRawPayables(transporte),
      fetchRawReceivables(transporte),
      /* fetchManualInputs já absorve rede, timeout e estados de domínio, devolvendo um
       * envelope de ausência em vez de rejeitar. Entra na mesma rede de segurança que
       * as outras por consistência, não porque se espere que rejeite. */
      fetchManualInputs({ transport: transporte, ...(companyId ? { companyId } : {}) }),
    ]);

    /* Os PEDIDOS são a fonte primária: sem eles não há dataset nenhum a construir.
     * O backend ESTÁ configurado (verificado acima) e não respondeu — isto é avaria,
     * nunca demonstração. */
    if (resSales.status !== "fulfilled") {
      return { source: "unavailable", sales: null, manualInputs: null };
    }
    const orders = (resSales.value.rows || []).map(normalizeOrder);

    // Despesas: best-effort. Se falhar, despesas fica undefined => mock no front,
    // sem derrubar pedidos/receitas/clientes.
    const payables = resPayables.status === "fulfilled"
      ? (resPayables.value.rows || []).map(normalizePayable).filter(Boolean)
      : undefined;

    // Recebíveis: best-effort e independente de despesas. Se falhar, receivables fica
    // undefined => lado Clientes segue mock + Demo, sem derrubar o resto.
    const receivables = resReceivables.status === "fulfilled"
      ? (resReceivables.value.rows || []).map(normalizeReceivable).filter(Boolean)
      : undefined;

    // Sem documento, o mapa fica undefined e o CMV permanece null/unavailable, tal como
    // antes desta ligação.
    const manualInputs = resManual.status === "fulfilled" ? resManual.value : null;

    /* Uma leitura, dois consumidores. O motor recebe SÓ o mapa; o estado e o documento
     * seguem à parte, para consumo apresentacional. Nunca se funde metadata no mapa:
     * o contrato que o dreEngine vê é exatamente o mesmo desde a C3. */
    const manualInputsByMonth = manualInputs ? manualInputs.valuesByMonth : undefined;

    /* Frescura declarada por cada fonte que respondeu. Uma fonte que falhou não tem
     * data — e não herda a das outras. */
    const meta = {
      orders: resSales.value.geradoEm,
      payables: resPayables.status === "fulfilled" ? resPayables.value.geradoEm : null,
      receivables: resReceivables.status === "fulfilled" ? resReceivables.value.geradoEm : null,
    };
    meta.geradoEm = geradoEmMaisAntigo([meta.orders, meta.payables, meta.receivables]);

    /* Completude por fonte, a par da frescura. `algumParcial` é o resumo pessimista:
     * basta uma fonte declarar-se incompleta para o conjunto não estar completo. Uma
     * fonte que não se pronuncia (null) não conta como incompleta — mas também não
     * autoriza afirmar que está completa, e por isso `todasCompletas` exige que as
     * três digam explicitamente que não são parciais. */
    meta.parcial = {
      orders: resSales.value.parcial ?? null,
      payables: resPayables.status === "fulfilled" ? (resPayables.value.parcial ?? null) : null,
      receivables: resReceivables.status === "fulfilled" ? (resReceivables.value.parcial ?? null) : null,
    };
    meta.algumParcial = Object.values(meta.parcial).some((p) => p === true);
    meta.todasCompletas = Object.values(meta.parcial).every((p) => p === false);

    return {
      source: "api",
      sales: buildSalesDataset({
        orders, payables, receivables, manualInputsByMonth,
        /* Mesma leitura, terceiro consumidor. A cobertura confirmada entra no motor
         * como cobertura, nunca como rubrica — ver `envelopeManualInputs`. */
        manualCoverage: manualInputs ? manualInputs.coverage : undefined,
        meta,
        /* A empresa que ESTA leitura pediu. Só existe quando a leitura é escopada —
         * transporte protegido. No legado é `undefined` e o dataset volta a etiquetar-se
         * pela configuração, que é o comportamento de hoje. Ver o bloco A ETIQUETA TEM
         * DE VIR DA LEITURA em `buildSalesDataset`. */
        companyId,
      }),
      manualInputs,
    };
  } catch {
    // Qualquer falha inesperada com backend configurado: avaria, não demonstração.
    return { source: "unavailable", sales: null, manualInputs: null };
  }
}