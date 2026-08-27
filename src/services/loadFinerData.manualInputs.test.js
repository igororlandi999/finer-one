// Testes da ligação dos AJUSTES MANUAIS ao fluxo produtivo (CMV C5C).
// Espelha o padrão de loadFinerData.receivables.test.js: mocka api.js para não tocar
// na rede e verifica o transporte ponta a ponta, do corpo devolvido pelo endpoint até
// às métricas financeiras do dataset.
//
// O que se protege aqui NÃO é a normalização (já coberta em manualInputsService.test.js),
// mas a integração: que o mapa chega ao motor, que a falha desta fonte não derruba as
// outras, e que a leitura não desloca nenhum mês âncora.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = { ajustesResposta: null, ajustesLanca: null, chamadas: [] };

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      const recurso = opts?.params?.recurso;
      state.chamadas.push(recurso || "pedidos");
      if (recurso === "despesas") return { data: PAYABLES };
      if (recurso === "recebiveis") return { data: [], debug: { fonte: "snapshot" } };
      if (recurso === "ajustes-manuais") {
        if (state.ajustesLanca) throw state.ajustesLanca;
        return state.ajustesResposta;
      }
      return { data: ORDERS };
    }),
  };
});

import { loadFinerData } from "../services/blingDataService.js";
import { ACTIVE_COMPANY } from "../config/company.js";

// Relógio fixo: junho fechado (closedThroughMonth "2026-06"), julho em curso.
const HOJE = new Date(2026, 6, 15, 12, 0, 0);

// Pedidos crus, no formato que normalizeOrder aceita.
const ord = (id, data, total) => ({
  id, numero: id, data, total,
  situacao: { id: 9, valor: 9 },
  contato: { id: 1, nome: "Cliente A" },
  itens: [],
});
const ORDERS = [
  ord(1, "2026-05-10", 40000),
  ord(2, "2026-06-10", 60000),
  ord(3, "2026-07-05", 900),
];

// Contas a pagar cruas, no formato que normalizePayable aceita.
const pag = (id, data, valor, categoriaNome) => ({
  id, situacao: 2, vencimento: data, dataEmissao: data,
  valor, categoriaNome, contato: { id: 7, nome: "Fornecedor F" },
});
const PAYABLES = [
  pag(1, "2026-05-08", 1000, "Aluguel"),
  pag(2, "2026-06-08", 2000, "Aluguel"),
  pag(3, "2026-07-08", 300, "Software"),
];

// Envelope do recurso ajustes-manuais, tal como o AjustesManuaisBackend.gs o devolve.
const doc = (months, { companyId = ACTIVE_COMPANY.id, fonte = "documento" } = {}) => ({
  data: { companyId, updatedAt: "2026-08-19T00:00:00.000Z", months },
  debug: { fonte, totalMeses: Object.keys(months || {}).length },
});
const rubrica = (value) => ({ value, updatedAt: "2026-08-19T00:00:00.000Z", note: null });
const ausente = { data: null, debug: { fonte: "documento-vazio", totalMeses: 0 } };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOJE);
  state.ajustesResposta = ausente;
  state.ajustesLanca = null;
  state.chamadas = [];
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("loadFinerData — ajustes manuais ausentes (baseline preservado)", () => {
  it("T9 — sem documento, o comportamento financeiro é o anterior à C5C", async () => {
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
    expect(sales.financeiro.metrics.availability.cmv).toBe("unavailable");
    expect(sales.financeiro.metrics.profitability.grossProfit).toBeNull();
    expect(sales.financeiro.metrics.profitability.ebitda).toBeNull();
    // As restantes fontes continuam a funcionar normalmente.
    expect(sales.receitas).not.toBeNull();
    expect(sales.despesas).not.toBeNull();
  });

  it("o recurso ajustes-manuais é efetivamente consultado", async () => {
    await loadFinerData();
    expect(state.chamadas).toContain("ajustes-manuais");
  });

  it("T14 — documento válido sem meses não cria CMV nenhum", async () => {
    state.ajustesResposta = doc({});
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
    expect(sales.financeiro.metrics.availability.cmv).toBe("unavailable");
  });
});

describe("loadFinerData — ajustes manuais presentes", () => {
  it("T10 — CMV de junho chega a sales.financeiro.metrics", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(500) } });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.monthKey).toBe("2026-06");
    expect(sales.financeiro.metrics.cmv.value).toBe(500);
    expect(sales.financeiro.metrics.availability.cmv).toBe("manual");
    // Derivados passam a ser calculáveis, com marca de origem mista.
    expect(sales.financeiro.metrics.profitability.grossProfit).not.toBeNull();
    expect(sales.financeiro.metrics.availability.grossProfit).toBe("mixed");
  });

  it("T11 — CMV de junho não contamina maio", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(500) } });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBe(500);
    expect(sales.financeiro.previous.cmv.value).toBeNull();
    expect(sales.financeiro.previous.availability.cmv).toBe("unavailable");
  });

  it("T11b — junho e maio no documento: cada mês com o seu valor", async () => {
    state.ajustesResposta = doc({
      "2026-06": { cmv: rubrica(500) },
      "2026-05": { cmv: rubrica(300) },
    });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBe(500);
    expect(sales.financeiro.previous.cmv.value).toBe(300);
  });

  it("T12 — cmv 0 chega intacto e é valor manual, não ausência", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(0) } });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBe(0);
    expect(sales.financeiro.metrics.availability.cmv).toBe("manual");
    expect(sales.financeiro.metrics.profitability.grossProfit).not.toBeNull();
  });

  it("T15 — mês fora do par analisado e fora do mês em curso não influencia nada", async () => {
    state.ajustesResposta = doc({ "2026-01": { cmv: rubrica(999999) } });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
    expect(sales.financeiro.previous.cmv.value).toBeNull();
    expect(sales.financeiro.metrics.profitability.grossProfit).toBeNull();
  });

  it("mês EM CURSO recebe o seu próprio ajuste (contrato da C3.1)", async () => {
    state.ajustesResposta = doc({ "2026-07": { cmv: rubrica(70) } });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.emCurso.monthKey).toBe("2026-07");
    expect(sales.financeiro.emCurso.cmv.value).toBe(70);
    expect(sales.financeiro.metrics.cmv.value).toBeNull(); // junho não herda julho
  });

  it("T11c — empresa divergente não entra na DRE", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
  });
});

describe("loadFinerData — falha exclusiva dos ajustes manuais", () => {
  it("T13 — erro de rede nos ajustes não derruba as outras fontes nem cai para mock", async () => {
    state.ajustesLanca = new Error("network");
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales).not.toBeNull();
    expect(sales.receitas).not.toBeNull();
    expect(sales.despesas).not.toBeNull();
    expect(sales.recebiveis).not.toBeNull();
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
  });

  it("T13b — { error: true } em HTTP 200 não entra no motor", async () => {
    state.ajustesResposta = { error: true, message: "Erro inesperado.", details: "" };
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
    expect(sales.financeiro.metrics.availability.cmv).toBe("unavailable");
  });

  it("T13c — documento corrompido ou ambíguo: CMV indisponível, resto intacto", async () => {
    for (const fonte of ["documento-corrompido", "documento-ambiguo"]) {
      state.ajustesResposta = { data: null, debug: { fonte, totalMeses: 0 } };
      const { source, sales } = await loadFinerData();
      expect(source).toBe("api");
      expect(sales.financeiro.metrics.cmv.value).toBeNull();
      expect(sales.receitas).not.toBeNull();
    }
  });

  it("T13d — REGRESSÃO: se o endpoint devolver pedidos, nada disso vira ajuste", async () => {
    state.ajustesResposta = { data: ORDERS };
    const { sales } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBeNull();
    expect(sales.financeiro.metrics.availability.cmv).toBe("unavailable");
  });
});

describe("loadFinerData — a leitura de ajustes não desloca nenhum mês âncora", () => {
  it("T16 — mesFechado, previousMonthKey e mês em curso ficam idênticos com e sem documento", async () => {
    state.ajustesResposta = ausente;
    const semDoc = (await loadFinerData()).sales.financeiro;

    state.ajustesResposta = doc({
      "2026-05": { cmv: rubrica(300) },
      "2026-06": { cmv: rubrica(500) },
      "2026-07": { cmv: rubrica(700) },
      "2026-08": { cmv: rubrica(800) },
    });
    const comDoc = (await loadFinerData()).sales.financeiro;

    expect(comDoc.monthKey).toBe(semDoc.monthKey);
    expect(comDoc.previous.monthKey).toBe(semDoc.previous.monthKey);
    expect(comDoc.emCurso.monthKey).toBe(semDoc.emCurso.monthKey);
    expect(comDoc.payables.monthKey).toBe(semDoc.payables.monthKey);
    expect(comDoc.payables.previousMonthKey).toBe(semDoc.payables.previousMonthKey);
    // Um mês inexistente no dataset não passa a existir por estar no documento.
    expect(comDoc.monthKey).not.toBe("2026-08");
  });

  it("comparabilidade não muda por existir CMV manual", async () => {
    state.ajustesResposta = ausente;
    const semDoc = (await loadFinerData()).sales.financeiro.comparable;
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(500) } });
    const comDoc = (await loadFinerData()).sales.financeiro.comparable;
    expect(comDoc).toBe(semDoc);
  });
});

describe("loadFinerData — envelope dos ajustes manuais exposto ao contexto", () => {
  it("uma unica leitura serve motor e apresentacao", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(500) } });
    const { sales, manualInputs } = await loadFinerData();
    // Uma so chamada ao recurso: a pagina nao pode precisar de refazer o fetch.
    expect(state.chamadas.filter((c) => c === "ajustes-manuais")).toHaveLength(1);
    // Motor:
    expect(sales.financeiro.metrics.cmv.value).toBe(500);
    // Apresentacao, da MESMA leitura:
    expect(manualInputs.status).toBe("documento");
    expect(manualInputs.document.months["2026-06"].cmv.updatedAt).toBe("2026-08-19T00:00:00.000Z");
  });

  it("documento vazio e fonte indisponivel sao distinguiveis no contexto", async () => {
    state.ajustesResposta = doc({});
    expect((await loadFinerData()).manualInputs.status).toBe("documento");

    state.ajustesResposta = ausente;
    expect((await loadFinerData()).manualInputs.status).toBe("documento-vazio");

    state.ajustesLanca = new Error("network");
    expect((await loadFinerData()).manualInputs.status).toBe("fonte-indisponivel");
  });

  it("corrompido e ambiguo chegam ao contexto sem afetar a DRE", async () => {
    for (const fonte of ["documento-corrompido", "documento-ambiguo"]) {
      state.ajustesResposta = { data: null, debug: { fonte } };
      const { sales, manualInputs } = await loadFinerData();
      expect(manualInputs.status).toBe(fonte);
      expect(sales.financeiro.metrics.cmv.value).toBeNull();
      expect(sales.receitas).not.toBeNull();
    }
  });

  it("cmv 0 sobrevive no mapa e a metadata fica fora dele", async () => {
    state.ajustesResposta = doc({ "2026-06": { cmv: rubrica(0) } });
    const { sales, manualInputs } = await loadFinerData();
    expect(sales.financeiro.metrics.cmv.value).toBe(0);
    expect(manualInputs.valuesByMonth["2026-06"]).toEqual({ cmv: 0 });
    expect(manualInputs.document.months["2026-06"].cmv.value).toBe(0);
  });
});