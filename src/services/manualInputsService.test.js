// Testes da normalização dos AJUSTES MANUAIS (C5A).
// O que se protege é o CONTRATO: o que conta como fonte, o que conta como ausência,
// e a fronteira entre zero real e ausência de valor.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Mock do cliente HTTP: nenhum teste toca na rede. `state` permite a cada teste decidir
 * o que o endpoint devolve (ou se rebenta). */
const state = { resposta: null, lanca: null, chamadas: [] };
vi.mock("./api.js", async () => {
  const actual = await vi.importActual("./api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      state.chamadas.push({ path, params: opts?.params });
      if (state.lanca) throw state.lanca;
      return state.resposta;
    }),
  };
});

import {
  normalizeManualInputs,
  fetchManualInputs,
  resolveManualInputsStatus,
  MANUAL_INPUTS_STATUS,
  RUBRICAS_MANUAIS_CONHECIDAS,
  FONTE_AUSENCIA,
} from "./manualInputsService.js";
import { ACTIVE_COMPANY } from "../config/company.js";

const EMPRESA = ACTIVE_COMPANY.id;

// Envelope do recurso: { data: documento, debug: { fonte } }.
const doc = (months, { companyId = EMPRESA, fonte = "documento" } = {}) => ({
  data: { companyId, updatedAt: "2026-08-18T10:00:00.000Z", months },
  debug: { fonte, totalMeses: Object.keys(months || {}).length },
});
const rubrica = (value, extra = {}) => ({ value, updatedAt: "2026-08-18T10:00:00.000Z", note: null, ...extra });

describe("normalizeManualInputs — documento válido", () => {
  it("lê uma rubrica de um mês", () => {
    expect(normalizeManualInputs(doc({ "2026-06": { cmv: rubrica(500) } })))
      .toEqual({ "2026-06": { cmv: 500 } });
  });

  it("mantém os meses independentes entre si", () => {
    const r = normalizeManualInputs(doc({
      "2026-06": { cmv: rubrica(500) },
      "2026-05": { cmv: rubrica(300) },
    }));
    expect(r).toEqual({ "2026-06": { cmv: 500 }, "2026-05": { cmv: 300 } });
  });

  it("valores negativos são preservados (não é papel desta camada julgá-los)", () => {
    expect(normalizeManualInputs(doc({ "2026-06": { cmv: rubrica(-120.5) } })))
      .toEqual({ "2026-06": { cmv: -120.5 } });
  });

  it("campos extra da rubrica (updatedAt, note) não contaminam o mapa", () => {
    const r = normalizeManualInputs(doc({ "2026-06": { cmv: rubrica(500, { note: "fecho" }) } }));
    expect(r["2026-06"]).toEqual({ cmv: 500 });
  });
});

describe("normalizeManualInputs — zero é valor real", () => {
  it("cmv 0 entra no mapa como 0", () => {
    const r = normalizeManualInputs(doc({ "2026-06": { cmv: rubrica(0) } }));
    expect(r["2026-06"].cmv).toBe(0);
    expect(Object.is(r["2026-06"].cmv, 0)).toBe(true);
  });

  it("cmv 0 não é lido como ausência: o mês existe no mapa", () => {
    const r = normalizeManualInputs(doc({ "2026-06": { cmv: rubrica(0) } }));
    expect(Object.keys(r)).toContain("2026-06");
    expect(r["2026-06"]).toHaveProperty("cmv");
  });

  it("cmv 0 num mês e valor noutro: nenhum apaga o outro", () => {
    const r = normalizeManualInputs(doc({
      "2026-06": { cmv: rubrica(0) },
      "2026-05": { cmv: rubrica(300) },
    }));
    expect(r).toEqual({ "2026-06": { cmv: 0 }, "2026-05": { cmv: 300 } });
  });
});

describe("normalizeManualInputs — ausência (undefined), nunca mapa inventado", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "documento"],
    ["número", 42],
    ["array na raiz", [{ companyId: EMPRESA }]],
  ])("payload %s => undefined", (_rotulo, payload) => {
    expect(normalizeManualInputs(payload)).toBeUndefined();
  });

  it("{ error: true } => undefined, mesmo com data aparentemente válida", () => {
    expect(normalizeManualInputs({
      error: true,
      message: "Erro inesperado.",
      data: { companyId: EMPRESA, months: { "2026-06": { cmv: rubrica(500) } } },
    })).toBeUndefined();
  });

  it(`debug.fonte "${FONTE_AUSENCIA}" => undefined, mesmo com months preenchido`, () => {
    const p = doc({ "2026-06": { cmv: rubrica(500) } }, { fonte: FONTE_AUSENCIA });
    expect(normalizeManualInputs(p)).toBeUndefined();
  });

  it("data ausente, null ou primitivo => undefined", () => {
    expect(normalizeManualInputs({ debug: { fonte: "documento" } })).toBeUndefined();
    expect(normalizeManualInputs({ data: null })).toBeUndefined();
    expect(normalizeManualInputs({ data: "x" })).toBeUndefined();
  });

  /* Esta asserção fixa a regra "rejeitar arrays" de forma ISOLADA. Um array com
   * propriedades nomeadas não é produzível por JSON.parse, logo o guarda isPlainObject
   * é defesa em profundidade e não um caminho alcançável pelo fio. Sem este teste, a
   * regra não seria observável: o snapshot de pedidos abaixo é rejeitado pela guarda
   * de companyId, não pela de array. */
  it("array em data é rejeitado mesmo que traga companyId e months", () => {
    const arr = [];
    arr.companyId = EMPRESA;
    arr.months = { "2026-06": { cmv: rubrica(500) } };
    expect(normalizeManualInputs({ data: arr })).toBeUndefined();
  });

  it("REGRESSÃO: snapshot de PEDIDOS ({ data: [...] }) nunca vira documento", () => {
    const pedidos = { data: [
      { id: 1, numero: 1318, data: "2026-06-05", total: 100000, itens: [] },
      { id: 2, numero: 1319, data: "2026-06-12", total: 60000, itens: [] },
    ] };
    expect(normalizeManualInputs(pedidos)).toBeUndefined();
  });

  it("months ausente, array ou primitivo => undefined (documento incompleto não é vazio)", () => {
    const base = { companyId: EMPRESA, updatedAt: "…" };
    expect(normalizeManualInputs({ data: { ...base } })).toBeUndefined();
    expect(normalizeManualInputs({ data: { ...base, months: [] } })).toBeUndefined();
    expect(normalizeManualInputs({ data: { ...base, months: "2026-06" } })).toBeUndefined();
  });

  it("companyId ausente, vazio ou não-string => undefined", () => {
    expect(normalizeManualInputs({ data: { months: {} } })).toBeUndefined();
    expect(normalizeManualInputs({ data: { companyId: "", months: {} } })).toBeUndefined();
    expect(normalizeManualInputs({ data: { companyId: 123, months: {} } })).toBeUndefined();
  });
});

describe("normalizeManualInputs — empresa", () => {
  it("companyId de outra empresa => undefined, sem aproveitar nada", () => {
    const p = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    expect(normalizeManualInputs(p)).toBeUndefined();
  });

  it("companyId é comparado tal e qual (sem normalizar caixa)", () => {
    const p = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: EMPRESA.toUpperCase() });
    expect(normalizeManualInputs(p)).toBeUndefined();
  });

  it("companyId esperado pode ser injetado (empresa ativa é só o valor por omissão)", () => {
    const p = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    expect(normalizeManualInputs(p, { companyId: "outra-empresa" }))
      .toEqual({ "2026-06": { cmv: 500 } });
  });
});

describe("normalizeManualInputs — documento real sem ajustes", () => {
  it('months {} com fonte "documento" => mapa vazio, NÃO undefined', () => {
    const r = normalizeManualInputs(doc({}));
    expect(r).toEqual({});
    expect(r).not.toBeUndefined();
  });

  it("documento só com meses inválidos => mapa vazio (o documento existe)", () => {
    const r = normalizeManualInputs(doc({ "2026-13": { cmv: rubrica(500) } }));
    expect(r).toEqual({});
  });
});

describe("normalizeManualInputs — meses inválidos são ignorados sem derrubar os válidos", () => {
  it.each([
    ["mês 13", "2026-13"],
    ["mês 00", "2026-00"],
    ["mês sem zero à esquerda", "2026-6"],
    ["data completa", "2026-06-01"],
    ["formato invertido", "06-2026"],
    ["texto", "junho"],
    ["vazio", ""],
  ])("%s é descartado, o mês válido sobrevive", (_rotulo, chaveInvalida) => {
    const r = normalizeManualInputs(doc({
      [chaveInvalida]: { cmv: rubrica(999) },
      "2026-06": { cmv: rubrica(500) },
    }));
    expect(r).toEqual({ "2026-06": { cmv: 500 } });
  });

  it("mês com valor não-objeto é ignorado", () => {
    const r = normalizeManualInputs(doc({ "2026-05": 300, "2026-06": { cmv: rubrica(500) } }));
    expect(r).toEqual({ "2026-06": { cmv: 500 } });
  });
});

describe("normalizeManualInputs — valores inválidos não entram", () => {
  it.each([
    ["string numérica", "500"],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["booleano", true],
    ["objeto", { valor: 500 }],
    ["array", [500]],
  ])("value %s => rubrica descartada", (_rotulo, valor) => {
    const r = normalizeManualInputs(doc({ "2026-06": { cmv: { value: valor } } }));
    expect(r).toEqual({});
  });

  it("rubrica sem o shape { value } é descartada (número solto não é aceite)", () => {
    expect(normalizeManualInputs(doc({ "2026-06": { cmv: 500 } }))).toEqual({});
  });

  it("um valor inválido não contamina o mês seguinte", () => {
    const r = normalizeManualInputs(doc({
      "2026-05": { cmv: { value: "300" } },
      "2026-06": { cmv: rubrica(500) },
    }));
    expect(r).toEqual({ "2026-06": { cmv: 500 } });
  });
});

describe("normalizeManualInputs — rubricas desconhecidas", () => {
  it("hoje só cmv é reconhecido", () => {
    expect(RUBRICAS_MANUAIS_CONHECIDAS).toEqual(["cmv"]);
  });

  it("rubrica desconhecida é ignorada, sem derrubar o cmv do mesmo mês", () => {
    const r = normalizeManualInputs(doc({
      "2026-06": { cmv: rubrica(500), impostosSobreLucro: rubrica(999), qualquerCoisa: rubrica(1) },
    }));
    expect(r["2026-06"]).toEqual({ cmv: 500 });
  });

  it("mês só com rubricas desconhecidas não entra no mapa", () => {
    const r = normalizeManualInputs(doc({ "2026-06": { impostosSobreLucro: rubrica(999) } }));
    expect(r).toEqual({});
    expect(r).not.toHaveProperty("2026-06");
  });
});

describe("normalizeManualInputs — não muta a entrada", () => {
  it("o payload recebido fica intacto", () => {
    const p = doc({ "2026-06": { cmv: rubrica(500) } });
    const copia = JSON.parse(JSON.stringify(p));
    normalizeManualInputs(p);
    expect(p).toEqual(copia);
  });
});

/* ====================================================================================
 * TRANSPORTE — fetchManualInputs.
 * Aqui não se repete a bateria de normalização: testa-se o CONTRATO do service, ou
 * seja, que chama o recurso certo, que nunca propaga exceções e que delega a decisão
 * de shape à função pura em vez de a duplicar.
 * ==================================================================================== */
describe("fetchManualInputs — transporte best-effort", () => {
  beforeEach(() => { state.resposta = null; state.lanca = null; state.chamadas = []; });
  afterEach(() => { vi.clearAllMocks(); });

  it("chama o recurso ajustes-manuais no endpoint existente", async () => {
    state.resposta = doc({});
    await fetchManualInputs();
    expect(state.chamadas).toHaveLength(1);
    expect(state.chamadas[0].path).toBe("pedidos/vendas");
    expect(state.chamadas[0].params).toEqual({ recurso: "ajustes-manuais" });
  });

  it("T1 — documento-vazio => undefined", async () => {
    state.resposta = { data: null, debug: { fonte: FONTE_AUSENCIA, totalMeses: 0 } };
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("T2 — documento válido sem meses => mapa vazio (não é ausência)", async () => {
    state.resposta = doc({});
    expect((await fetchManualInputs()).valuesByMonth).toEqual({});
  });

  it("T3 — documento com CMV => mapa por mês", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } });
    expect((await fetchManualInputs()).valuesByMonth).toEqual({ "2026-06": { cmv: 500 } });
  });

  it("T4 — cmv 0 atravessa o transporte intacto", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(0) } });
    const r = await fetchManualInputs();
    expect(r.valuesByMonth["2026-06"].cmv).toBe(0);
  });

  it("T5 — { error: true } em HTTP 200 => undefined (o corpo é que decide)", async () => {
    state.resposta = { error: true, message: "Erro inesperado.", details: "" };
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("T6 — snapshot de PEDIDOS na resposta => undefined", async () => {
    state.resposta = { data: [{ id: 1, numero: 1318, total: 100000, itens: [] }] };
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("T7 — empresa divergente => undefined", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("T8 — erro de rede não propaga: devolve undefined em vez de rejeitar", async () => {
    state.lanca = new Error("network");
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("T8b — timeout do apiGet também é absorvido", async () => {
    state.lanca = Object.assign(new Error("Tempo de espera excedido."), { name: "ApiError", status: 0 });
    expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
  });

  it("estados de domínio corrompido e ambíguo => undefined", async () => {
    for (const fonte of ["documento-corrompido", "documento-ambiguo", "documento-empresa-divergente"]) {
      state.resposta = { data: null, debug: { fonte, totalMeses: 0 } };
      expect((await fetchManualInputs()).valuesByMonth).toBeUndefined();
    }
  });

  it("companyId esperado pode ser injetado no transporte", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    expect((await fetchManualInputs({ companyId: "outra-empresa" })).valuesByMonth)
      .toEqual({ "2026-06": { cmv: 500 } });
  });
});

/* ====================================================================================
 * ESTADO DE ORIGEM (C6C) — metadata para a área administrativa.
 * A regra que estes testes fixam é a invariante: o estado nunca pode contradizer o
 * motor. "documento" se e so se existe mapa. E metadata nunca entra no mapa.
 * ==================================================================================== */
describe("estado de origem dos ajustes manuais", () => {
  beforeEach(() => { state.resposta = null; state.lanca = null; state.chamadas = []; });
  afterEach(() => { vi.clearAllMocks(); });

  it("documento com meses => status documento, mapa e documento presentes", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } });
    const r = await fetchManualInputs();
    expect(r.status).toBe(MANUAL_INPUTS_STATUS.DOCUMENTO);
    expect(r.valuesByMonth).toEqual({ "2026-06": { cmv: 500 } });
    expect(r.document.months["2026-06"].cmv.updatedAt).toBe("2026-08-18T10:00:00.000Z");
    expect(r.document.companyId).toBe(EMPRESA);
  });

  it("METADATA NAO CONTAMINA O MAPA: updatedAt e note ficam fora de valuesByMonth", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500, { note: "fecho" }) } });
    const r = await fetchManualInputs();
    expect(r.valuesByMonth["2026-06"]).toEqual({ cmv: 500 });
    expect(r.valuesByMonth["2026-06"].cmv).toBe(500);   // número, não objeto
    expect(r.document.months["2026-06"].cmv.note).toBe("fecho");
  });

  it("documento vazio => status documento (existe), mapa vazio, documento presente", async () => {
    state.resposta = doc({});
    const r = await fetchManualInputs();
    expect(r.status).toBe(MANUAL_INPUTS_STATUS.DOCUMENTO);
    expect(r.valuesByMonth).toEqual({});
    expect(r.document).not.toBeNull();
  });

  it("VAZIO e INDISPONIVEL nao sao colapsados", async () => {
    state.resposta = { data: null, debug: { fonte: "documento-vazio" } };
    const semDocumento = await fetchManualInputs();
    state.lanca = new Error("network");
    const semFonte = await fetchManualInputs();
    expect(semDocumento.status).toBe(MANUAL_INPUTS_STATUS.VAZIO);
    expect(semFonte.status).toBe(MANUAL_INPUTS_STATUS.INDISPONIVEL);
    expect(semDocumento.status).not.toBe(semFonte.status);
    // ...mas o efeito financeiro é o mesmo nos dois casos.
    expect(semDocumento.valuesByMonth).toBeUndefined();
    expect(semFonte.valuesByMonth).toBeUndefined();
  });

  it.each([
    ["documento-corrompido", MANUAL_INPUTS_STATUS.CORROMPIDO],
    ["documento-ambiguo", MANUAL_INPUTS_STATUS.AMBIGUO],
    ["documento-empresa-divergente", MANUAL_INPUTS_STATUS.EMPRESA_DIVERGENTE],
  ])("estado %s do backend chega intacto", async (fonte, esperado) => {
    state.resposta = { data: null, debug: { fonte } };
    const r = await fetchManualInputs();
    expect(r.status).toBe(esperado);
    expect(r.valuesByMonth).toBeUndefined();
    expect(r.document).toBeNull();
  });

  it("{ error: true } e snapshot de pedidos => INDISPONIVEL, sem documento", async () => {
    state.resposta = { error: true, message: "Erro inesperado." };
    expect((await fetchManualInputs()).status).toBe(MANUAL_INPUTS_STATUS.INDISPONIVEL);
    state.resposta = { data: [{ id: 1, total: 100 }] };
    const r = await fetchManualInputs();
    expect(r.status).toBe(MANUAL_INPUTS_STATUS.INDISPONIVEL);
    expect(r.document).toBeNull();
  });

  it("documento de outra empresa nao e exposto, nem sequer como metadata", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } }, { companyId: "outra-empresa" });
    const r = await fetchManualInputs();
    expect(r.valuesByMonth).toBeUndefined();
    expect(r.document).toBeNull();
  });

  it("INVARIANTE: status documento se e so se existe mapa", () => {
    expect(resolveManualInputsStatus(null, {})).toBe(MANUAL_INPUTS_STATUS.DOCUMENTO);
    expect(resolveManualInputsStatus({ debug: { fonte: "documento-vazio" } }, {}))
      .toBe(MANUAL_INPUTS_STATUS.DOCUMENTO);   // mapa manda sobre o rótulo do backend
    expect(resolveManualInputsStatus({ debug: { fonte: "documento" } }, undefined))
      .toBe(MANUAL_INPUTS_STATUS.INDISPONIVEL); // backend diz documento mas nada normalizou
    expect(resolveManualInputsStatus(undefined, undefined)).toBe(MANUAL_INPUTS_STATUS.INDISPONIVEL);
  });

  it("uma unica chamada ao endpoint por leitura", async () => {
    state.resposta = doc({ "2026-06": { cmv: rubrica(500) } });
    await fetchManualInputs();
    expect(state.chamadas).toHaveLength(1);
  });
});