// Testes da camada apresentacional dos ajustes manuais (C6D).
// O contrato protegido: as linhas nascem do documento (nunca do mapa financeiro),
// zero é valor real, os meses vêm do mais recente para o mais antigo, e uma rubrica
// desconhecida nunca aparece sozinha no ecrã.

import { describe, it, expect } from "vitest";
import {
  buildManualInputsRows,
  resolveManualInputsView,
  formatUpdatedAt,
  MANUAL_INPUTS_VIEW,
  RUBRICAS_VISIVEIS,
} from "./manualInputsView.js";

const rubrica = (value, { updatedAt = "2026-08-19T10:00:00.000Z", note = null } = {}) =>
  ({ value, updatedAt, note });

const envelope = (months, { status = "documento" } = {}) => ({
  status,
  valuesByMonth: {},
  document: { companyId: "empresa-teste", updatedAt: "2026-08-19T10:00:00.000Z", months },
});

describe("buildManualInputsRows", () => {
  it("T1 — documento com um CMV produz uma linha completa", () => {
    const rows = buildManualInputsRows(envelope({ "2026-06": { cmv: rubrica(500) } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      monthKey: "2026-06",
      monthLabel: "junho de 2026",
      key: "cmv",
      label: "CMV",
      value: 500,
    });
  });

  it("T2 — cmv 0 gera linha e mantém o valor 0", () => {
    const rows = buildManualInputsRows(envelope({ "2026-06": { cmv: rubrica(0) } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(0);
  });

  it("T3 — meses ordenados do mais recente para o mais antigo", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-05": { cmv: rubrica(300) },
      "2026-12": { cmv: rubrica(900) },
      "2025-11": { cmv: rubrica(100) },
      "2026-06": { cmv: rubrica(500) },
    }));
    expect(rows.map((r) => r.monthKey)).toEqual(["2026-12", "2026-06", "2026-05", "2025-11"]);
  });

  it("T3b — a ordenação atravessa a fronteira do ano sem parsing de datas", () => {
    const rows = buildManualInputsRows(envelope({
      "2025-12": { cmv: rubrica(1) },
      "2026-01": { cmv: rubrica(2) },
    }));
    expect(rows.map((r) => r.monthKey)).toEqual(["2026-01", "2025-12"]);
  });

  it("T4 — updatedAt é preservado e formatado", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { cmv: rubrica(500, { updatedAt: "2026-08-21T23:30:00.000Z" }) },
    }));
    expect(rows[0].updatedAt).toBe("2026-08-21T23:30:00.000Z");
    expect(rows[0].updatedAtLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("T4b — updatedAt ausente ou inválido não inventa data", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { cmv: { value: 500, note: null } },
      "2026-05": { cmv: rubrica(300, { updatedAt: "nao e uma data" }) },
    }));
    expect(rows[0].updatedAt).toBeNull();
    expect(rows[0].updatedAtLabel).toBeNull();
    expect(rows[1].updatedAtLabel).toBeNull();
  });

  it("T5 — note null, vazia ou só espaços fica null", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { cmv: rubrica(500, { note: null }) },
      "2026-05": { cmv: rubrica(300, { note: "" }) },
      "2026-04": { cmv: rubrica(200, { note: "   " }) },
    }));
    expect(rows.map((r) => r.note)).toEqual([null, null, null]);
  });

  it("T6 — note preenchida é preservada e aparada", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { cmv: rubrica(500, { note: "  fecho confirmado  " }) },
    }));
    expect(rows[0].note).toBe("fecho confirmado");
  });

  it("T7 — mês sem CMV reconhecido não gera linha", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": {},
      "2026-05": { cmv: rubrica(300) },
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].monthKey).toBe("2026-05");
  });

  it("T7b — valor não numérico não gera linha", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { cmv: { value: "500" } },
      "2026-05": { cmv: { value: null } },
      "2026-04": { cmv: { value: NaN } },
    }));
    expect(rows).toEqual([]);
  });

  it("T8 — rubrica futura desconhecida não quebra nem aparece sozinha", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-06": { impostosSobreLucro: rubrica(999), cmv: rubrica(500) },
      "2026-05": { impostosSobreLucro: rubrica(999) },
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("cmv");
    expect(RUBRICAS_VISIVEIS).toEqual(["cmv"]);
  });

  it("meses com chave inválida são ignorados sem derrubar os válidos", () => {
    const rows = buildManualInputsRows(envelope({
      "2026-13": { cmv: rubrica(999) },
      "junho": { cmv: rubrica(999) },
      "2026-06": { cmv: rubrica(500) },
    }));
    expect(rows.map((r) => r.monthKey)).toEqual(["2026-06"]);
  });

  it("nunca constrói linhas a partir de valuesByMonth", () => {
    const rows = buildManualInputsRows({
      status: "documento",
      valuesByMonth: { "2026-06": { cmv: 500 } },
      document: null,
    });
    expect(rows).toEqual([]);
  });

  it("envelope ausente ou sem documento devolve lista vazia", () => {
    expect(buildManualInputsRows(null)).toEqual([]);
    expect(buildManualInputsRows(undefined)).toEqual([]);
    expect(buildManualInputsRows({ status: "documento" })).toEqual([]);
    expect(buildManualInputsRows({ document: { months: [] } })).toEqual([]);
  });
});

describe("formatUpdatedAt", () => {
  it("formata ISO completo como dd/mm/aaaa", () => {
    expect(formatUpdatedAt("2026-08-19T10:00:00.000Z")).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });

  it("devolve null para ausência ou lixo", () => {
    expect(formatUpdatedAt(null)).toBeNull();
    expect(formatUpdatedAt("")).toBeNull();
    expect(formatUpdatedAt("qualquer coisa")).toBeNull();
    expect(formatUpdatedAt(12345)).toBeNull();
  });
});

describe("resolveManualInputsView", () => {
  it("loading tem precedência sobre tudo o resto", () => {
    const r = resolveManualInputsView(envelope({ "2026-06": { cmv: rubrica(500) } }), true);
    expect(r.state).toBe(MANUAL_INPUTS_VIEW.LOADING);
    expect(r.rows).toEqual([]);
  });

  it("documento com linhas => estado rows", () => {
    const r = resolveManualInputsView(envelope({ "2026-06": { cmv: rubrica(500) } }), false);
    expect(r.state).toBe(MANUAL_INPUTS_VIEW.ROWS);
    expect(r.rows).toHaveLength(1);
  });

  it("T9 — documento vazio e documento-vazio convergem no mesmo estado", () => {
    const semMeses = resolveManualInputsView(envelope({}), false);
    const semDocumento = resolveManualInputsView(
      { status: "documento-vazio", valuesByMonth: undefined, document: null }, false);
    expect(semMeses.state).toBe(MANUAL_INPUTS_VIEW.EMPTY);
    expect(semDocumento.state).toBe(MANUAL_INPUTS_VIEW.EMPTY);
  });

  it("documento só com rubricas desconhecidas cai em empty, não em erro", () => {
    const r = resolveManualInputsView(envelope({ "2026-06": { impostosSobreLucro: rubrica(9) } }), false);
    expect(r.state).toBe(MANUAL_INPUTS_VIEW.EMPTY);
  });

  it.each([
    "documento-corrompido",
    "documento-ambiguo",
    "documento-empresa-divergente",
    "fonte-indisponivel",
  ])("T10 — estado %s => erro, nunca lista vazia", (status) => {
    const r = resolveManualInputsView({ status, valuesByMonth: undefined, document: null }, false);
    expect(r.state).toBe(MANUAL_INPUTS_VIEW.ERROR);
    expect(r.rows).toEqual([]);
  });

  it("erro e vazio são estados distintos: nunca fingir lista vazia", () => {
    const erro = resolveManualInputsView({ status: "fonte-indisponivel" }, false);
    const vazio = resolveManualInputsView({ status: "documento-vazio" }, false);
    expect(erro.state).not.toBe(vazio.state);
  });

  it("envelope ausente (modo demonstração) => erro, não lista vazia", () => {
    expect(resolveManualInputsView(null, false).state).toBe(MANUAL_INPUTS_VIEW.ERROR);
    expect(resolveManualInputsView({}, false).state).toBe(MANUAL_INPUTS_VIEW.ERROR);
  });
});