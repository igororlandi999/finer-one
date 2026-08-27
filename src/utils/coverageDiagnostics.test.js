// OBSERVABILIDADE DA COBERTURA DECLARADA.
//
// Nada aqui altera cobertura nenhuma: o diagnóstico responde a uma pergunta mecânica
// ("há meses civis já encerrados que a cobertura declarada ainda não alcança?") e
// deixa a resposta contabilística — "as faturas desse mês já entraram todas?" — a quem
// a pode dar. Ver docs/SOURCE_COVERAGE_CONTRACT.md.

import { describe, it, expect } from "vitest";
import { buildCoverageDiagnostics } from "./coverageDiagnostics.js";

const AGOSTO = new Date(2026, 7, 24, 12, 0, 0);   // 24/08/2026 -> último encerrado: julho

describe("buildCoverageDiagnostics — atraso da cobertura", () => {
  it("o caso REAL de hoje: pedidos derivados em dia, contas a pagar um mês atrás", () => {
    const d = buildCoverageDiagnostics({
      coverage: { completeThroughMonth: null, payables: { completeThroughMonth: "2026-06" } },
      referenceDate: AGOSTO,
    });
    expect(d.lastClosedCivilMonth).toBe("2026-07");

    // Pedidos: limite derivado do relógio, acompanha o calendário sozinho.
    expect(d.orders.derived).toBe(true);
    expect(d.orders.effectiveThroughMonth).toBe("2026-07");
    expect(d.orders.coverageLagMonths).toBe(0);
    expect(d.orders.coverageNeedsReview).toBe(false);

    // Contas a pagar: limite escrito à mão, julho já terminou e continua fora.
    expect(d.payables.derived).toBe(false);
    expect(d.payables.declared).toBe("2026-06");
    expect(d.payables.coverageLagMonths).toBe(1);
    expect(d.payables.coverageNeedsReview).toBe(true);

    expect(d.anyNeedsReview).toBe(true);
    expect(d.maxLagMonths).toBe(1);
  });

  it("um limite DERIVADO nunca envelhece — não precisa de manutenção nenhuma", () => {
    /* Confundir derivado com declarado faria a fonte dos pedidos, que se mantém
     * sozinha, aparecer eternamente como precisando de revisão. */
    const d = buildCoverageDiagnostics({
      coverage: { completeThroughMonth: null }, referenceDate: AGOSTO,
    });
    expect(d.orders.coverageNeedsReview).toBe(false);
    expect(d.payables.coverageNeedsReview).toBe(false);   // herda o dos pedidos
    expect(d.anyNeedsReview).toBe(false);
  });

  it("cobertura em dia não é assinalada", () => {
    const d = buildCoverageDiagnostics({
      coverage: { completeThroughMonth: "2026-07", payables: { completeThroughMonth: "2026-07" } },
      referenceDate: AGOSTO,
    });
    expect(d.maxLagMonths).toBe(0);
    expect(d.anyNeedsReview).toBe(false);
  });

  it("cobertura ADIANTADA (à frente do calendário) não produz atraso negativo", () => {
    const d = buildCoverageDiagnostics({
      coverage: { payables: { completeThroughMonth: "2026-12" } }, referenceDate: AGOSTO,
    });
    expect(d.payables.coverageLagMonths).toBe(0);
    expect(d.payables.coverageNeedsReview).toBe(false);
  });

  it("conta os meses corretamente através da viragem do ano", () => {
    // 05/01/2027 -> último encerrado é dezembro/2026; cobertura em setembro/2026.
    const d = buildCoverageDiagnostics({
      coverage: { payables: { completeThroughMonth: "2026-09" } },
      referenceDate: new Date(2027, 0, 5, 9, 0, 0),
    });
    expect(d.lastClosedCivilMonth).toBe("2026-12");
    expect(d.payables.coverageLagMonths).toBe(3);
  });

  it("lê o alias legado `closedThroughMonth`, como o motor faz", () => {
    /* Um diagnóstico que ignorasse o alias descreveria uma cobertura diferente da que
     * sourceAvailability usa — duas verdades sobre a mesma configuração. */
    const d = buildCoverageDiagnostics({
      coverage: { closedThroughMonth: "2026-05" }, referenceDate: AGOSTO,
    });
    expect(d.orders.declared).toBe("2026-05");
    expect(d.orders.coverageLagMonths).toBe(2);
  });

  it("as contas a pagar HERDAM o limite dos pedidos quando não declaram o seu", () => {
    const d = buildCoverageDiagnostics({
      coverage: { completeThroughMonth: "2026-06" }, referenceDate: AGOSTO,
    });
    expect(d.payables.declared).toBe("2026-06");
    expect(d.payables.coverageLagMonths).toBe(1);
  });

  it("sem data de referência devolve null — não um atraso inventado", () => {
    expect(buildCoverageDiagnostics({ coverage: {} })).toBeNull();
    expect(buildCoverageDiagnostics({ coverage: {}, referenceDate: null })).toBeNull();
  });

  it("sem cobertura nenhuma trata tudo como derivado, sem rebentar", () => {
    const d = buildCoverageDiagnostics({ coverage: null, referenceDate: AGOSTO });
    expect(d.orders.derived).toBe(true);
    expect(d.anyNeedsReview).toBe(false);
  });

  it("NÃO altera nem sugere alterar a cobertura — só descreve", () => {
    const d = buildCoverageDiagnostics({
      coverage: { payables: { completeThroughMonth: "2026-06" } }, referenceDate: AGOSTO,
    });
    // Nenhum campo propõe um valor novo para a configuração.
    expect(d.payables).not.toHaveProperty("suggestedThroughMonth");
    expect(d.payables).not.toHaveProperty("newCompleteThroughMonth");
    // O limite efetivo é o DECLARADO, nunca o que o calendário permitiria.
    expect(d.payables.effectiveThroughMonth).toBe("2026-06");
  });
});
