// Testes da camada documental. Datas civis "YYYY-MM-DD" de propósito: o dia 1 tem
// de continuar no seu mês em qualquer fuso (regressão da Fase 1).

import { describe, it, expect } from "vitest";
import {
  buildDocumentCatalog,
  buildDocumentStats,
  documentsFromOrders,
  documentsFromPayables,
  documentsFromReceivables,
  documentsByCategory,
  filterDocuments,
  searchDocuments,
  documentStatus,
  canDownload,
  resolveDocumentView,
  toCivilDate,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
} from "./documentNormalizer.js";

const order = (id, over = {}) => ({
  id, numero: 1318, date: "2026-06-01", total: 920, status: "recebida",
  client: { id: 7, name: "Cliente Alfa" }, items: [], ...over,
});
const payable = (id, over = {}) => ({
  id, situacao: 2, valor: 3180, dataEmissao: "2026-05-28", vencimento: "2026-06-10",
  numeroDocumento: "V/452", historico: "Compra de mercadoria", categoriaNome: "Compras",
  contato: { id: 31, nome: "Fornecedor Beta" }, ...over,
});
const receivable = (id, over = {}) => ({
  id, situacao: 1, valor: 4250, dataEmissao: "2026-06-15", vencimento: "2026-07-15",
  numeroDocumento: "FT 2026/130", historico: null, categoriaNome: "Vendas",
  contato: { id: 9, nome: "Cliente Gama" }, ...over,
});

describe("documentsFromOrders — nota fiscal do pedido", () => {
  it("A. pedido com notaFiscalId gera documento metadata_only", () => {
    const [doc] = documentsFromOrders([order(26576405725, { notaFiscalId: 26576410855 })], { currency: "BRL" });
    expect(doc).toBeDefined();
    expect(doc.type).toBe(DOCUMENT_TYPES.FISCAL_NOTE);
    expect(doc.status).toBe(DOCUMENT_STATUS.METADATA_ONLY);
    expect(doc.relatedEntity).toEqual({ type: "order", id: 26576405725 });
    expect(doc.metadata.notaFiscalId).toBe(26576410855);
    expect(doc.currency).toBe("BRL");
  });

  it("B. pedido sem nota não gera documento falso", () => {
    expect(documentsFromOrders([order(1)], {})).toEqual([]);
    expect(documentsFromOrders([order(1, { notaFiscalId: null })], {})).toEqual([]);
  });

  it("o número do PEDIDO nunca é apresentado como número fiscal", () => {
    const [doc] = documentsFromOrders([order(1, { notaFiscalId: 99, numero: 1318 })], {});
    expect(doc.number).toBeNull();                       // o Bling não devolve o número da nota
    expect(doc.label).toBe("Nota fiscal do pedido 1318"); // rótulo neutro
    expect(doc.label).not.toContain("FT ");
  });

  it("usa dataSaida quando existe, senão a data do pedido", () => {
    const [comSaida] = documentsFromOrders([order(1, { notaFiscalId: 9, date: "2026-06-01", dataSaida: "2026-06-03" })], {});
    expect(comSaida.date).toBe("2026-06-03");
    const [semSaida] = documentsFromOrders([order(2, { notaFiscalId: 9, date: "2026-06-01" })], {});
    expect(semSaida.date).toBe("2026-06-01"); // dia 1 continua em junho
  });

  it("pedido cancelado não gera documento", () => {
    expect(documentsFromOrders([order(1, { notaFiscalId: 9, status: "cancelada" })], {})).toEqual([]);
  });
});

describe("documentsFromPayables / documentsFromReceivables", () => {
  it("D. metadata sem ficheiro fica metadata_only", () => {
    const [doc] = documentsFromPayables([payable(500)], { currency: "BRL" });
    expect(doc.status).toBe(DOCUMENT_STATUS.METADATA_ONLY);
    expect(doc.number).toBe("V/452");
    expect(doc.file).toEqual({ url: null, mimeType: null, size: null });
    expect(doc.fileName).toBeNull();
    expect(doc.counterparty).toEqual({ id: 31, name: "Fornecedor Beta" });
    expect(doc.relatedEntity).toEqual({ type: "payable", id: 500 });
    expect(doc.date).toBe("2026-05-28"); // dataEmissao tem prioridade sobre vencimento
  });

  it("título sem numeroDocumento não vira documento", () => {
    expect(documentsFromPayables([payable(1, { numeroDocumento: null })], {})).toEqual([]);
    expect(documentsFromPayables([payable(2, { numeroDocumento: "" })], {})).toEqual([]);
    expect(documentsFromReceivables([receivable(3, { numeroDocumento: null })], {})).toEqual([]);
  });

  it("cancelados (situação 5) não geram documento", () => {
    expect(documentsFromPayables([payable(1, { situacao: 5 })], {})).toEqual([]);
    expect(documentsFromReceivables([receivable(1, { situacao: 5 })], {})).toEqual([]);
  });

  it("conta a receber vira documento de cliente", () => {
    const [doc] = documentsFromReceivables([receivable(800)], {});
    expect(doc.type).toBe(DOCUMENT_TYPES.CLIENT_INVOICE);
    expect(doc.category).toBe("Faturas de Clientes");
    expect(doc.relatedEntity).toEqual({ type: "receivable", id: 800 });
  });
});

describe("documentStatus / canDownload", () => {
  it("C. documento com URL real fica available e permite download", () => {
    expect(documentStatus({ url: "https://exemplo/nf.pdf" })).toBe(DOCUMENT_STATUS.AVAILABLE);
    expect(canDownload({ file: { url: "https://exemplo/nf.pdf" } })).toBe(true);
  });

  it("sem URL fica metadata_only e o download é bloqueado", () => {
    expect(documentStatus(null)).toBe(DOCUMENT_STATUS.METADATA_ONLY);
    expect(documentStatus({ url: null })).toBe(DOCUMENT_STATUS.METADATA_ONLY);
    const [doc] = documentsFromPayables([payable(1)], {});
    expect(canDownload(doc)).toBe(false);
  });
});

describe("buildDocumentCatalog", () => {
  const orders = [order(10, { notaFiscalId: 111, date: "2026-06-01" })];
  const payables = [payable(10, { dataEmissao: "2026-05-28" })];
  const receivables = [receivable(10, { dataEmissao: "2026-06-15" })];

  it("F. entidades diferentes com o MESMO id não colidem", () => {
    const cat = buildDocumentCatalog({ orders, payables, receivables });
    expect(cat.list).toHaveLength(3);
    expect(cat.list.map((d) => d.id).sort()).toEqual([
      "doc-order-10", "doc-payable-10", "doc-receivable-10",
    ]);
  });

  it("E. ids documentais duplicados aparecem uma só vez", () => {
    const cat = buildDocumentCatalog({ payables: [payable(10), payable(10, { numeroDocumento: "OUTRO" })] });
    expect(cat.list).toHaveLength(1);
    expect(cat.list[0].number).toBe("V/452"); // a primeira ocorrência vence
  });

  it("ordena por data desc, com ordem determinística", () => {
    const cat = buildDocumentCatalog({ orders, payables, receivables });
    expect(cat.list.map((d) => d.date)).toEqual(["2026-06-15", "2026-06-01", "2026-05-28"]);
  });

  it("K. fonte real sem documentos continua vazia (zero real)", () => {
    const cat = buildDocumentCatalog({ orders: [order(1)], payables: [], receivables: [] });
    expect(cat.available).toBe(true);
    expect(cat.list).toEqual([]);
    expect(cat.stats.total).toBe(0);
  });

  it("L. fonte indisponível é diferente de lista vazia", () => {
    const semFonte = buildDocumentCatalog({});
    expect(semFonte.available).toBe(false);
    expect(semFonte.list).toEqual([]);
    const comFonte = buildDocumentCatalog({ payables: [] });
    expect(comFonte.available).toBe(true);
    expect(comFonte.list).toEqual([]);
  });

  it("stats só descrevem o que a fonte suporta (nada de 'processados')", () => {
    const cat = buildDocumentCatalog({ orders, payables, receivables });
    expect(cat.stats).toMatchObject({ total: 3, withFile: 0, metadataOnly: 3 });
    expect(cat.stats.byType[DOCUMENT_TYPES.FISCAL_NOTE]).toBe(1);
    expect("processados" in cat.stats).toBe(false);
    expect("armazenamento" in cat.stats).toBe(false);
  });

  it("buildDocumentStats conta ficheiros disponíveis quando existirem", () => {
    const stats = buildDocumentStats([
      { type: "x", status: DOCUMENT_STATUS.AVAILABLE },
      { type: "x", status: DOCUMENT_STATUS.METADATA_ONLY },
    ]);
    expect(stats).toMatchObject({ total: 2, withFile: 1, metadataOnly: 1 });
  });

  it("documentsByCategory devolve a forma do donut", () => {
    const cat = buildDocumentCatalog({ orders, payables, receivables });
    const donut = documentsByCategory(cat.list);
    expect(donut.map((c) => c.name).sort()).toEqual([
      "Faturas de Clientes", "Faturas de Fornecedores", "Notas Fiscais",
    ]);
    expect(donut.every((c) => c.value === 1)).toBe(true);
  });
});

describe("filtros e pesquisa", () => {
  const lista = buildDocumentCatalog({
    orders: [order(10, { notaFiscalId: 111, numero: 1318, date: "2026-06-01" })],
    payables: [payable(20, { dataEmissao: "2026-05-28", numeroDocumento: "V/452" })],
    receivables: [receivable(30, { dataEmissao: "2026-07-02", numeroDocumento: "FT 2026/130" })],
  }).list;

  it("G. filtra por tipo/categoria", () => {
    expect(filterDocuments(lista, { category: "Faturas de Fornecedores" }).map((d) => d.number)).toEqual(["V/452"]);
    expect(filterDocuments(lista, { type: DOCUMENT_TYPES.FISCAL_NOTE })).toHaveLength(1);
    expect(filterDocuments(lista, { category: "Todos" })).toHaveLength(3);
    expect(filterDocuments(lista, {})).toHaveLength(3);
  });

  it("H. filtra por período, sem deslocar o dia 1", () => {
    const junho = filterDocuments(lista, { from: "2026-06-01", to: "2026-06-30" });
    expect(junho).toHaveLength(1);
    expect(junho[0].relatedEntity.type).toBe("order"); // 01/06 pertence a junho
    expect(filterDocuments(lista, { from: "2026-06-02" })).toHaveLength(1); // só julho
    expect(filterDocuments(lista, { to: "2026-05-31" })).toHaveLength(1);   // só maio
  });

  it("filtra por estado do ficheiro", () => {
    expect(filterDocuments(lista, { status: DOCUMENT_STATUS.METADATA_ONLY })).toHaveLength(3);
    expect(filterDocuments(lista, { status: DOCUMENT_STATUS.AVAILABLE })).toHaveLength(0);
  });

  it("I. pesquisa por número do documento", () => {
    expect(searchDocuments(lista, "V/452")).toHaveLength(1);
    expect(searchDocuments(lista, "2026/130")).toHaveLength(1);
    expect(searchDocuments(lista, "inexistente")).toHaveLength(0);
  });

  it("J. pesquisa por cliente/fornecedor, sem distinguir maiúsculas", () => {
    expect(searchDocuments(lista, "fornecedor beta")).toHaveLength(1);
    expect(searchDocuments(lista, "Cliente Gama")).toHaveLength(1);
  });

  it("pesquisa alcança o número do pedido da nota fiscal", () => {
    const r = searchDocuments(lista, "1318");
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe(DOCUMENT_TYPES.FISCAL_NOTE);
  });

  it("critérios combinam-se por AND", () => {
    expect(filterDocuments(lista, { category: "Faturas de Clientes", search: "V/452" })).toHaveLength(0);
    expect(filterDocuments(lista, { counterpartyId: 31 })).toHaveLength(1);
  });
});

describe("resolveDocumentView — regras de contrato da tela", () => {
  const doc = () => documentsFromPayables([payable(1)], {})[0];

  it("fonte presente com documentos: tela real, sem demo", () => {
    const v = resolveDocumentView({ available: true, list: [doc()], stats: { total: 1 } });
    expect(v.isReal).toBe(true);
    expect(v.showDemo).toBe(false);
    expect(v.isEmptyReal).toBe(false);
  });

  it("zero-state real NÃO volta ao mock", () => {
    const v = resolveDocumentView({ available: true, list: [], stats: { total: 0 } });
    expect(v.isReal).toBe(true);
    expect(v.showDemo).toBe(false);  // nunca mostra documentos fictícios
    expect(v.isEmptyReal).toBe(true);
    expect(v.list).toEqual([]);
  });

  it("Demo aparece só quando a fonte está indisponível", () => {
    for (const entrada of [null, undefined, { available: false, list: [] }]) {
      const v = resolveDocumentView(entrada);
      expect(v.isReal).toBe(false);
      expect(v.showDemo).toBe(true);
      expect(v.list).toEqual([]);
      expect(v.stats).toBeNull();
    }
  });

  it("metadata_only não habilita download; available habilita", () => {
    expect(canDownload(doc())).toBe(false);
    expect(canDownload({ ...doc(), file: { url: "https://exemplo/nf.pdf" } })).toBe(true);
  });
});

describe("toCivilDate", () => {
  it("preserva a data civil e aceita timestamp completo", () => {
    expect(toCivilDate("2026-06-01")).toBe("2026-06-01");
    expect(toCivilDate(null)).toBeNull();
    expect(toCivilDate(new Date(2026, 5, 1, 12, 0, 0))).toBe("2026-06-01");
  });
});