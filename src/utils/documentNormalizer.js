// src/utils/documentNormalizer.js
// Camada documental. Funções PURAS: recebem as entidades já normalizadas
// (orders, payables, receivables) e produzem um catálogo com um contrato único,
// para que a tela Documentos leia UMA forma em vez de três.
//
// Regras inegociáveis desta camada:
//   - Nunca inventar documentos. Sem metadata documental na entidade, não há documento.
//   - Nunca inventar ficheiros. `available` exige URL real; hoje nenhuma fonte a dá,
//     pelo que todos os documentos saem `metadata_only`.
//   - Nunca fazer matching heurístico (valor+data parecidos). A associação é por ID
//     da entidade de origem, ou não existe.
//   - Nunca apresentar o número do PEDIDO como número de documento fiscal. O detalhe
//     do Bling devolve `notaFiscal` apenas com `id` — não há número, série nem chave.
//   - Nenhum cálculo financeiro. Valores são copiados da entidade, nunca recalculados.

import { toDate, billable } from "./financialCalculations.js";
import { billablePayables, payableDate } from "./expenseCalculations.js";
import { billableReceivables, receivableDate } from "./receivableCalculations.js";

/** Tipos de documento com fonte automática real. */
export const DOCUMENT_TYPES = {
  FISCAL_NOTE: "fiscal_note",         // nota fiscal associada a um pedido de venda
  SUPPLIER_INVOICE: "supplier_invoice", // documento de uma conta a pagar
  CLIENT_INVOICE: "client_invoice",     // documento de uma conta a receber
};

/** Rótulos de apresentação (tabs/donut da tela). Um por tipo, sem categorias vazias. */
export const DOCUMENT_CATEGORY_LABELS = {
  [DOCUMENT_TYPES.FISCAL_NOTE]: "Notas Fiscais",
  [DOCUMENT_TYPES.SUPPLIER_INVOICE]: "Faturas de Fornecedores",
  [DOCUMENT_TYPES.CLIENT_INVOICE]: "Faturas de Clientes",
};

export const DOCUMENT_STATUS = {
  AVAILABLE: "available",         // existe ficheiro acessível
  METADATA_ONLY: "metadata_only", // documento identificado, sem ficheiro
};

function pad(n) { return String(n).padStart(2, "0"); }

/**
 * Data civil "YYYY-MM-DD" a partir de qualquer entrada aceite pelo projeto.
 * Delega em toDate/parseLocalISODate: não existe aqui um segundo parser, e
 * "2026-06-01" nunca recua para maio em fusos negativos.
 */
export function toCivilDate(value) {
  const d = toDate(value);
  if (!d) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Estado do documento a partir do ficheiro. `available` SÓ com URL real —
 * metadata nunca é promovida a ficheiro disponível.
 */
export function documentStatus(file) {
  return (file && file.url) ? DOCUMENT_STATUS.AVAILABLE : DOCUMENT_STATUS.METADATA_ONLY;
}

const EMPTY_FILE = { url: null, mimeType: null, size: null };

function makeDocument({ id, type, label, number, date, amount, currency, counterparty, relatedEntity, metadata, file }) {
  const f = file || EMPTY_FILE;
  return {
    id,
    source: "bling",
    type,
    category: DOCUMENT_CATEGORY_LABELS[type] || "Outros",
    label,
    number: number != null && number !== "" ? String(number) : null,
    fileName: f.name || null,
    date: date || null,
    amount: amount != null ? Number(amount) : null,
    currency: currency || null,
    status: documentStatus(f),
    counterparty: counterparty || null,
    relatedEntity: relatedEntity || null,
    file: { url: f.url || null, mimeType: f.mimeType || null, size: f.size != null ? f.size : null },
    metadata: metadata || {},
  };
}

function contactOf(entity) {
  const c = entity && entity.contato;
  if (!c || (c.id == null && !c.nome)) return null;
  return { id: c.id != null ? c.id : null, name: c.nome || null };
}

/**
 * ID DE NOTA FISCAL DO BLING → inteiro positivo, ou null.
 *
 * ─── PORQUE ISTO EXISTE (correção de integridade) ───────────────────────────────────
 * O gate anterior era `if (o.notaFiscalId == null) continue`. Contra a conta real da
 * Overcel isso deixava passar **245 documentos fiscais inexistentes**: o Bling usa
 * `notaFiscalId: 0` como SENTINELA de "pedido sem nota fiscal", e `0 == null` é falso.
 * Medido em 2026-09-01 sobre 1200 pedidos: 985 com `notaFiscalId` não-nulo, mas apenas
 * 729 ids reais (11 dígitos) — os restantes 256 pedidos partilhavam o valor `0`.
 *
 * É o mesmo padrão que o projeto já conhece de `categoriaId: 0` ("sem categoria").
 * Zero não é um id: é a ausência escrita com um número.
 *
 * ─── PORQUE O TIPO É VERIFICADO ANTES DA COERÇÃO ────────────────────────────────────
 * `Number(true)` é 1 e `Number(["7"])` é 7. Sem o teste de tipo, um booleano ou um
 * array de um elemento passariam a id de nota fiscal válido. Só número ou string.
 */
export function toNotaFiscalId(value) {
  let n;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    n = Number(t);
  } else return null;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* ====================================================================================
 * FONTE A — PEDIDOS DE VENDA.
 *
 * Só entram pedidos com `notaFiscalId` VÁLIDO (ver toNotaFiscalId: inteiro positivo).
 * O detalhe do Bling devolve `notaFiscal` apenas com `id`: não há número, série, chave
 * de acesso, PDF, XML nem link DANFE. Por isso `number` fica null e o rótulo é neutro
 * ("Nota fiscal do pedido 1318") — usar o número do pedido como número fiscal seria
 * informação falsa. Pedidos cancelados não geram documento.
 *
 * O id documental é `doc-nfe-{idNotaFiscal}` e NÃO `doc-order-{id}`: a identidade de
 * uma nota fiscal é a nota, não o pedido que a originou. É isso que permite que a
 * mesma nota vista pelo pedido e vista pelo recebível seja UM documento (ver FONTE D).
 * ==================================================================================== */
export function documentsFromOrders(orders, { currency } = {}) {
  const out = [];
  for (const o of billable(orders || [])) {
    const nfId = toNotaFiscalId(o.notaFiscalId);
    if (nfId == null) continue; // sem nota emitida (ou sentinela 0) => sem documento
    out.push(makeDocument({
      id: `doc-nfe-${nfId}`,
      type: DOCUMENT_TYPES.FISCAL_NOTE,
      label: o.numero != null ? `Nota fiscal do pedido ${o.numero}` : "Nota fiscal de pedido",
      number: null, // o Bling não devolve o número da nota no detalhe do pedido
      date: toCivilDate(o.dataSaida || o.date),
      amount: o.total,
      currency,
      counterparty: o.client && (o.client.id != null || o.client.name)
        ? { id: o.client.id != null ? o.client.id : null, name: o.client.name || null }
        : null,
      relatedEntity: { type: "order", id: o.id },
      metadata: { notaFiscalId: nfId, orderNumber: o.numero != null ? o.numero : null },
    }));
  }
  return out;
}

/* ====================================================================================
 * FONTE B — CONTAS A PAGAR. `numeroDocumento` é o número do documento do fornecedor.
 * Sem ele não há documento identificado (um título sem número não é um documento).
 * Cancelados (situação 5) ficam de fora, pelo contrato já consolidado.
 * ==================================================================================== */
export function documentsFromPayables(payables, { currency } = {}) {
  const out = [];
  for (const p of billablePayables(payables || [])) {
    const numero = p.numeroDocumento;
    if (numero == null || numero === "") continue;
    out.push(makeDocument({
      id: `doc-payable-${p.id}`,
      type: DOCUMENT_TYPES.SUPPLIER_INVOICE,
      label: `Documento ${numero}`,
      number: numero,
      date: toCivilDate(payableDate(p)),
      amount: p.valor,
      currency,
      counterparty: contactOf(p),
      relatedEntity: { type: "payable", id: p.id },
      metadata: {
        historico: p.historico || null,
        categoriaNome: p.categoriaNome || null,
        vencimento: toCivilDate(p.vencimento),
      },
    }));
  }
  return out;
}

/* ====================================================================================
 * FONTE C — CONTAS A RECEBER. Espelha a anterior.
 * ==================================================================================== */
export function documentsFromReceivables(receivables, { currency } = {}) {
  const out = [];
  for (const r of billableReceivables(receivables || [])) {
    const numero = r.numeroDocumento;
    if (numero == null || numero === "") continue;
    out.push(makeDocument({
      id: `doc-receivable-${r.id}`,
      type: DOCUMENT_TYPES.CLIENT_INVOICE,
      label: `Documento ${numero}`,
      number: numero,
      date: toCivilDate(receivableDate(r)),
      amount: r.valor,
      currency,
      counterparty: contactOf(r),
      relatedEntity: { type: "receivable", id: r.id },
      metadata: {
        historico: r.historico || null,
        categoriaNome: r.categoriaNome || null,
        vencimento: toCivilDate(r.vencimento),
      },
    }));
  }
  return out;
}

/* ====================================================================================
 * FONTE D — NOTAS FISCAIS VISTAS PELO RECEBÍVEL.
 *
 * `/contas/receber/{id}` devolve `origem`, e `origem.id` NÃO é sempre uma nota fiscal.
 * Medido em 2026-09-01 sobre as 1513 contas a receber reais da Overcel:
 *
 *   tipoOrigem      n     origem.id cruzado com…
 *   'venda'       1456    pedido.id: 1153/1454   |  notaFiscalId: 0/1454
 *   'notafiscal'    54    pedido.id:    0/53     |  notaFiscalId: 12/53
 *   ''               3    sem número, situacao 0
 *
 * Ou seja: com `tipoOrigem: 'venda'` o `origem.id` é um ID DE PEDIDO, e tratá-lo como
 * nota fiscal estaria errado nas 1454 linhas. `tipoOrigem` é o discriminador e tem de
 * ser lido ANTES de qualquer outro campo de `origem`.
 *
 * ARMADILHA DOCUMENTADA: `origem.situacao` é um enum AMBÍGUO — o mesmo inteiro tem
 * tabelas diferentes consoante o tipo. `1` é "Pendente" numa nota e "Atendido" numa
 * venda. Por isso `situacao` viaja em metadata como valor cru, sem ser interpretado
 * aqui: interpretá-lo sem o tipo produziria rótulos silenciosamente errados.
 *
 * Esta fonte NÃO substitui `documentsFromReceivables`: o título (fatura de cliente) e
 * a nota fiscal que lhe deu origem são documentos distintos.
 * ==================================================================================== */
export function documentsFromReceivableFiscalNotes(receivables, { currency } = {}) {
  const out = [];
  for (const r of billableReceivables(receivables || [])) {
    const o = r && r.origem;
    if (!o || o.tipoOrigem !== "notafiscal") continue; // 'venda' => é pedido, não nota
    const nfId = toNotaFiscalId(o.id);
    if (nfId == null) continue;
    out.push(makeDocument({
      id: `doc-nfe-${nfId}`,
      type: DOCUMENT_TYPES.FISCAL_NOTE,
      label: o.numero != null && o.numero !== "" ? `Nota fiscal ${o.numero}` : "Nota fiscal",
      number: o.numero, // aqui, ao contrário do pedido, o número da nota EXISTE
      date: toCivilDate(receivableDate(r)),
      amount: r.valor,
      currency,
      counterparty: contactOf(r),
      relatedEntity: { type: "receivable", id: r.id },
      metadata: {
        notaFiscalId: nfId,
        tipoOrigem: o.tipoOrigem,
        origemSituacao: o.situacao != null ? o.situacao : null,
      },
      file: o.url ? { url: o.url } : null,
    }));
  }
  return out;
}

/**
 * Catálogo consolidado.
 *
 * O id é prefixado pelo tipo de entidade (`doc-order-`, `doc-payable-`,
 * `doc-receivable-`): um pedido e uma conta a pagar com o mesmo id numérico são
 * documentos distintos e não podem colidir. Ids documentais repetidos dentro da
 * mesma fonte são colapsados (fica a primeira ocorrência).
 *
 * `available` descreve a FONTE, não a lista: fonte presente com zero documentos
 * é `available: true, list: []` (zero real). Sem qualquer fonte, `available: false`.
 *
 * @returns {{source, available, list, stats}}
 */
export function buildDocumentCatalog({ orders, payables, receivables, currency } = {}) {
  const temFonte = Array.isArray(orders) || Array.isArray(payables) || Array.isArray(receivables);

  const bruto = [
    ...documentsFromOrders(orders, { currency }),
    ...documentsFromPayables(payables, { currency }),
    ...documentsFromReceivables(receivables, { currency }),
    ...documentsFromReceivableFiscalNotes(receivables, { currency }),
  ];

  const porId = new Map();
  for (const d of bruto) {
    const anterior = porId.get(d.id);
    if (!anterior) porId.set(d.id, d);
    else completarDocumento_(anterior, d);
  }

  // Ordenação determinística: data desc (sem data no fim), depois id desc.
  const list = [...porId.values()].sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da !== db) return da < db ? 1 : -1;
    return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
  });

  return {
    source: "bling",
    available: temFonte,
    list,
    stats: buildDocumentStats(list),
  };
}

/**
 * COLISÃO DE ID DOCUMENTAL → a primeira ocorrência VENCE, e só os campos que ela tem
 * a null são completados pela segunda. Muta `base` no sítio.
 *
 * Porquê completar em vez de descartar: com a chave fiscal canónica `doc-nfe-{id}`, a
 * MESMA nota chega por dois caminhos — pelo pedido (que não conhece o número da nota,
 * `number: null`) e pelo recebível (que o conhece). Descartar o segundo deitaria fora
 * um facto que temos. Completar não inventa nada: os dois documentos são a mesma nota.
 *
 * O que NUNCA acontece: sobrepor um valor já preenchido. Quem chegou primeiro manda —
 * é a regra que já existia e que os testes fixam.
 */
function completarDocumento_(base, extra) {
  for (const campo of ["number", "date", "amount", "currency", "counterparty", "fileName"]) {
    if (base[campo] == null && extra[campo] != null) base[campo] = extra[campo];
  }
  if (!base.file.url && extra.file && extra.file.url) {
    base.file = { ...extra.file };
    base.status = documentStatus(base.file);
  }
  for (const [k, v] of Object.entries(extra.metadata || {})) {
    if (base.metadata[k] == null && v != null) base.metadata[k] = v;
  }
  return base;
}

/** Métricas suportadas pela fonte. Nada de "processados": não existe pipeline. */
export function buildDocumentStats(list) {
  const arr = list || [];
  const byType = {};
  let withFile = 0;
  for (const d of arr) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    if (d.status === DOCUMENT_STATUS.AVAILABLE) withFile += 1;
  }
  return { total: arr.length, withFile, metadataOnly: arr.length - withFile, byType };
}

/** Contagem por categoria, na forma do donut: [{ name, value }]. Maior primeiro. */
export function documentsByCategory(list) {
  const map = new Map();
  for (const d of list || []) map.set(d.category, (map.get(d.category) || 0) + 1);
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Filtro puro. Todos os critérios são opcionais e combinam-se por AND.
 * `from`/`to` são datas civis "YYYY-MM-DD": a comparação é lexicográfica sobre o
 * formato ISO, sem construir Date (e portanto sem risco de fuso).
 */
export function filterDocuments(list, { category, type, status, from, to, counterpartyId, search } = {}) {
  const termo = (search || "").trim().toLowerCase();
  return (list || []).filter((d) => {
    if (category && category !== "Todos" && d.category !== category) return false;
    if (type && d.type !== type) return false;
    if (status && d.status !== status) return false;
    if (from && (!d.date || d.date < from)) return false;
    if (to && (!d.date || d.date > to)) return false;
    if (counterpartyId != null && (!d.counterparty || d.counterparty.id !== counterpartyId)) return false;
    if (termo && !matchesSearch(d, termo)) return false;
    return true;
  });
}

/** Pesquisa por número, rótulo e contraparte. Sem backend: a lista já está em memória. */
export function matchesSearch(doc, termo) {
  if (!termo) return true;
  const t = String(termo).toLowerCase();
  const campos = [
    doc.number,
    doc.label,
    doc.counterparty && doc.counterparty.name,
    doc.metadata && doc.metadata.orderNumber,
  ];
  return campos.some((v) => v != null && String(v).toLowerCase().includes(t));
}

export function searchDocuments(list, termo) {
  return filterDocuments(list, { search: termo });
}

/** O download só existe com ficheiro real. Regra única, partilhada pela UI. */
export function canDownload(doc) {
  return !!(doc && doc.file && doc.file.url);
}

/**
 * Decisão real vs demonstração, num só sítio (a tela não a reimplementa).
 *
 * Fonte presente => a tela é REAL, mesmo com zero documentos: um zero real nunca
 * faz a página voltar ao mock. Sem fonte => demonstração, com selo explícito.
 * As duas listas nunca se misturam.
 */
export function resolveDocumentView(catalog) {
  const isReal = !!(catalog && catalog.available);
  return {
    isReal,
    showDemo: !isReal,
    list: isReal ? (catalog.list || []) : [],
    stats: isReal ? catalog.stats : null,
    isEmptyReal: isReal && (catalog.list || []).length === 0,
  };
}