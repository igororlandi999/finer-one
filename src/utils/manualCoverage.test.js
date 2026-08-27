// COBERTURA CONFIRMADA POR UMA PESSOA — a regra, e sobretudo os seus limites.
//
// ─── O QUE ESTE FICHEIRO PROTEGE ────────────────────────────────────────────────────
// Uma confirmação humana é a única coisa neste produto que deixa um utilizador tornar um
// mês MAIS disponível. Isso torna-a a superfície mais perigosa que aqui existe, e a maior
// parte destes testes não verifica que ela funciona — verifica que ela NÃO consegue fazer
// o que não deve:
//
//   - não transforma um snapshot tecnicamente incompleto em completo;
//   - não liberta um mês que ainda não terminou;
//   - não toca no CMV, que é um requisito do utilizador e não uma cobertura;
//   - não toca na validação contabilística (`validatedThroughMonth`);
//   - não finge que a classificação está completa quando não está.

import { describe, it, expect } from "vitest";
import {
  normalizeManualCoverage,
  resolveEffectiveCoverage,
  validarConfirmacaoCobertura,
  describeCoverageSource,
  lastClosedCivilMonth,
  COVERAGE_SOURCE,
  COVERAGE_REJECTION,
} from "./manualCoverage.js";
import { sourceAvailability, payablesCoverage, coverageComSnapshotParcial } from "./dreEngine.js";

/* 25 de agosto de 2026: julho é o último mês civil ENCERRADO. É a data real da sessão em
 * que este fluxo foi construído, e a configuração de produção que lhe corresponde. */
const HOJE = new Date(2026, 7, 25, 12, 0, 0);

/** A cobertura de `company.js`, tal como está em produção. */
const CONFIG = {
  firstCompleteMonth: "2026-04",
  partialMonths: ["2026-03"],
  completeThroughMonth: null,
  validatedThroughMonth: "2026-06",
  payables: { completeThroughMonth: "2026-06" },
};

const confirmacao = (mk, over = {}) => ({
  payables: {
    completeThroughMonth: mk,
    confirmedAt: "2026-08-25T20:15:00.000Z",
    confirmedBy: "user",
    note: null,
    ...over,
  },
});

/** A disponibilidade das contas a pagar de um mês, pelo caminho REAL do motor. */
const dispPayables = (coverage, mk) =>
  sourceAvailability(mk, payablesCoverage(coverage), HOJE, true);

describe("lastClosedCivilMonth — o mês corrente nunca está encerrado", () => {
  it("em agosto, o último encerrado é julho", () => {
    expect(lastClosedCivilMonth(HOJE)).toBe("2026-07");
  });

  it("em janeiro, recua para dezembro do ano anterior", () => {
    expect(lastClosedCivilMonth(new Date(2027, 0, 3))).toBe("2026-12");
  });

  it("sem data não inventa mês", () => {
    expect(lastClosedCivilMonth(null)).toBeNull();
    expect(lastClosedCivilMonth(new Date("nada"))).toBeNull();
  });
});

describe("normalizeManualCoverage — ausência é ausência", () => {
  it("documento sem bloco de cobertura devolve undefined, nunca defaults", () => {
    /* `undefined` e não `{}`: um objeto vazio afirmaria que alguém confirmou alguma
     * coisa. O fallback de company.js só é o correto porque isto é ausência. */
    expect(normalizeManualCoverage(undefined)).toBeUndefined();
    expect(normalizeManualCoverage(null)).toBeUndefined();
    expect(normalizeManualCoverage({})).toBeUndefined();
    expect(normalizeManualCoverage([])).toBeUndefined();
    expect(normalizeManualCoverage("2026-07")).toBeUndefined();
  });

  it("mês malformado é ignorado — cai no fallback em vez de derrubar o documento", () => {
    for (const mau of ["2026-13", "26-07", "2026/07", "julho", "", 202607, null]) {
      expect(normalizeManualCoverage({ payables: { completeThroughMonth: mau } })).toBeUndefined();
    }
  });

  it("fonte desconhecida não entra — só as contas a pagar são confirmáveis", () => {
    const r = normalizeManualCoverage({
      orders: { completeThroughMonth: "2026-07" },
      recebiveis: { completeThroughMonth: "2026-07" },
    });
    expect(r).toBeUndefined();
  });

  it("metadata em falta degrada a auditoria, nunca a confirmação", () => {
    const r = normalizeManualCoverage({ payables: { completeThroughMonth: "2026-07" } });
    expect(r.payables.completeThroughMonth).toBe("2026-07");
    expect(r.payables.confirmedAt).toBeNull();
    expect(r.payables.confirmedBy).toBeNull();
  });

  /* O documento não guarda quem é a pessoa. `confirmedBy` é um PAPEL. */
  it("não aceita um confirmedBy arbitrário — sem PII no documento", () => {
    const r = normalizeManualCoverage({
      payables: { completeThroughMonth: "2026-07", confirmedBy: "maria@empresa.pt" },
    });
    expect(r.payables.confirmedBy).toBeNull();
    expect(JSON.stringify(r)).not.toContain("@");
  });
});

describe("validarConfirmacaoCobertura — o que não se pode confirmar", () => {
  it("aceita o último mês encerrado", () => {
    expect(validarConfirmacaoCobertura({ fonte: "payables", monthKey: "2026-07", referenceDate: HOJE }))
      .toEqual({ ok: true });
  });

  it("aceita meses ANTERIORES — é assim que se corrige uma confirmação a mais", () => {
    expect(validarConfirmacaoCobertura({ fonte: "payables", monthKey: "2026-05", referenceDate: HOJE }).ok)
      .toBe(true);
  });

  /* Confirmar um mês em curso é afirmar sobre dias que ainda não aconteceram. */
  it("recusa o mês CORRENTE e qualquer mês futuro", () => {
    for (const mk of ["2026-08", "2026-09", "2027-01"]) {
      expect(validarConfirmacaoCobertura({ fonte: "payables", monthKey: mk, referenceDate: HOJE }))
        .toEqual({ ok: false, code: COVERAGE_REJECTION.MES_FUTURO });
    }
  });

  it("recusa fonte desconhecida e mês malformado", () => {
    expect(validarConfirmacaoCobertura({ fonte: "orders", monthKey: "2026-07", referenceDate: HOJE }).code)
      .toBe(COVERAGE_REJECTION.FONTE_DESCONHECIDA);
    expect(validarConfirmacaoCobertura({ fonte: "payables", monthKey: "2026-13", referenceDate: HOJE }).code)
      .toBe(COVERAGE_REJECTION.MES_INVALIDO);
  });
});

describe("resolveEffectiveCoverage — a configuração passa a ser o fallback", () => {
  it("sem confirmação devolve a MESMA referência: nada muda por isto existir", () => {
    const r = resolveEffectiveCoverage({ configCoverage: CONFIG, referenceDate: HOJE });
    expect(r).toBe(CONFIG);
  });

  it("com confirmação válida, o limite passa a ser o confirmado", () => {
    const r = resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE,
    });
    expect(r.payables.completeThroughMonth).toBe("2026-07");
    expect(r.payables.coverageSource).toBe(COVERAGE_SOURCE.USER);
    expect(r.payables.coverageConfirmedAt).toBe("2026-08-25T20:15:00.000Z");
  });

  it("o resto da configuração fica intacto — não é uma substituição, é uma sobreposição", () => {
    const r = resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE,
    });
    expect(r.firstCompleteMonth).toBe("2026-04");
    expect(r.partialMonths).toEqual(["2026-03"]);
    // Eixo CONTABILÍSTICO: intocado. Confirmar cobertura não é validar contabilidade.
    expect(r.validatedThroughMonth).toBe("2026-06");
  });

  it("uma confirmação de mês futuro persistida é ignorada NA LEITURA", () => {
    /* O documento pode ter sido escrito por outra versão, à mão, ou noutro fuso. A
     * leitura defende-se na mesma, e cair no fallback é o lado seguro. */
    const r = resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-09"), referenceDate: HOJE,
    });
    expect(r).toBe(CONFIG);
  });

  it("sem data de referência não se sobrepõe nada", () => {
    const r = resolveEffectiveCoverage({ configCoverage: CONFIG, manualCoverage: confirmacao("2026-07") });
    expect(r).toBe(CONFIG);
  });

  /* FASE 9 — um valor que só sobe é um valor que não se corrige. */
  it("a confirmação pode RECUAR: é o mecanismo de correção", () => {
    const r = resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-05"), referenceDate: HOJE,
    });
    expect(r.payables.completeThroughMonth).toBe("2026-05");
    // E o efeito é real: junho volta a ser parcial.
    expect(dispPayables(r, "2026-06")).toBe("partial");
  });
});

describe("efeito no motor — o que a confirmação liberta, e o que não", () => {
  const SEM = CONFIG;
  const COM = resolveEffectiveCoverage({
    configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE,
  });

  it("julho passa de partial a real na cobertura das contas a pagar", () => {
    expect(dispPayables(SEM, "2026-07")).toBe("partial");
    expect(dispPayables(COM, "2026-07")).toBe("real");
  });

  it("agosto continua partial — está em curso, e nenhuma confirmação o alcança", () => {
    expect(dispPayables(SEM, "2026-08")).toBe("partial");
    expect(dispPayables(COM, "2026-08")).toBe("partial");
  });

  it("meses anteriores ao histórico continuam unavailable", () => {
    expect(dispPayables(COM, "2026-01")).toBe("unavailable");
  });

  it("um mês declarado parcial continua parcial", () => {
    expect(dispPayables(COM, "2026-03")).toBe("partial");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * O LIMITE QUE NÃO PODE CEDER.
 *
 * Uma pessoa pode afirmar que os documentos de julho já lhe chegaram. Não pode afirmar
 * que a leitura do ERP correu até ao fim quando o próprio ERP declarou que não.
 *
 * A garantia é ESTRUTURAL, não uma verificação: `sourceAvailability` testa
 * `snapshotPartial` ANTES de olhar para qualquer limite de cobertura, e em
 * `buildSalesDataset` o veto do snapshot é aplicado DEPOIS da confirmação. Estes testes
 * exercem essa ordem pelo caminho real.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("snapshot incompleto prevalece sobre a confirmação humana", () => {
  const metaParcial = { parcial: { orders: false, payables: true, receivables: false } };

  it("confirmação + snapshot parcial => a fonte continua partial", () => {
    const confirmada = resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE,
    });
    // A ordem real do serviço: confirma primeiro, veta depois.
    const final = coverageComSnapshotParcial(confirmada, metaParcial);
    expect(dispPayables(final, "2026-07")).toBe("partial");
    // E o limite confirmado continua lá — o que veta é o facto técnico, não o esquecimento.
    expect(final.payables.completeThroughMonth).toBe("2026-07");
  });

  it("o veto alcança TODOS os meses, mesmo os já cobertos pela configuração", () => {
    /* As listagens não são pedidas por data: os títulos que ficaram por ler podem ser de
     * qualquer mês. Vetar só os recentes assumiria uma ordenação que a fonte nunca
     * prometeu. */
    const final = coverageComSnapshotParcial(
      resolveEffectiveCoverage({ configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE }),
      metaParcial
    );
    expect(dispPayables(final, "2026-05")).toBe("partial");
  });

  it("um snapshot de PEDIDOS parcial não contamina as contas a pagar", () => {
    const soPedidos = { parcial: { orders: true, payables: false, receivables: false } };
    const final = coverageComSnapshotParcial(
      resolveEffectiveCoverage({ configCoverage: CONFIG, manualCoverage: confirmacao("2026-07"), referenceDate: HOJE }),
      soPedidos
    );
    expect(dispPayables(final, "2026-07")).toBe("real");
  });
});

describe("describeCoverageSource — a UI tem de poder distinguir os dois", () => {
  it("sem confirmação, a origem é a configuração", () => {
    const d = describeCoverageSource(CONFIG);
    expect(d).toEqual({
      completeThroughMonth: "2026-06",
      source: COVERAGE_SOURCE.CONFIG,
      confirmedAt: null,
      note: null,
    });
  });

  it("com confirmação, a origem é o utilizador, com a data", () => {
    const d = describeCoverageSource(resolveEffectiveCoverage({
      configCoverage: CONFIG, manualCoverage: confirmacao("2026-07", { note: "faturas todas recebidas" }),
      referenceDate: HOJE,
    }));
    expect(d.source).toBe(COVERAGE_SOURCE.USER);
    expect(d.completeThroughMonth).toBe("2026-07");
    expect(d.confirmedAt).toBe("2026-08-25T20:15:00.000Z");
    expect(d.note).toBe("faturas todas recebidas");
  });

  it("sem limite nenhum não se inventa proveniência", () => {
    expect(describeCoverageSource({})).toBeNull();
    expect(describeCoverageSource(null)).toBeNull();
  });
});
