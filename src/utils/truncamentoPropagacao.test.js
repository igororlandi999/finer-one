// PROPAGAÇÃO DO TRUNCAMENTO — ponta a ponta, do envelope do Apps Script até à âncora.
//
// ─── A CADEIA QUE ESTAVA CORTADA ────────────────────────────────────────────────────
// O sinal de incompletude tinha de percorrer:
//
//   Apps Script (meta.parcial / meta.listagemTruncada)
//     -> lerParcial            (blingDataService)
//     -> sales.meta.parcial    (mapa por fonte)
//     -> dataHealth            (faixa "atualização parcial")          ✓ já chegava
//     -> coverage              (coverageComSnapshotParcial)           ✗ NÃO chegava
//     -> sourceAvailability    (veto)                                 ✗ NÃO chegava
//     -> buildMonthlyDre       (availability das linhas)              ✗ NÃO chegava
//     -> financialCompleteness / âncora                               ✗ NÃO chegava
//
// Auditado em 2026-08-24: o sinal morria em `dataHealth`. Resultado observável: a faixa
// dizia "parte dos dados ainda está a ser completada" e o card ao lado afirmava um
// "Resultado líquido · junho de 2026" como facto apurado, com availability `real`. As
// duas afirmações eram incompatíveis e ambas apareciam no mesmo ecrã.
//
// ─── O QUE ESTE FICHEIRO PROVA ──────────────────────────────────────────────────────
// Que nenhum caminho — nem o do tempo (rebuild interrompido), nem o da paginação
// (MAX_PAGES) — consegue produzir uma fonte declarada COMPLETA.

import { describe, it, expect } from "vitest";
import {
  sourceAvailability,
  payablesCoverage,
  coverageComSnapshotParcial,
  buildMonthlyDre,
  EMPTY_COVERAGE,
} from "./dreEngine.js";
import { resolveDataCompleteness, COMPLETENESS } from "./dataHealth.js";

/* Cobertura realista: histórico a partir de abril, fonte completa até junho. É a forma
 * da configuração da Overcel, sem os valores serem lidos de lá — um teste que importe
 * `company.js` passa a falhar quando a empresa mudar de mês, e isso não é um defeito. */
const COBERTURA = {
  firstCompleteMonth: "2026-04",
  partialMonths: ["2026-03"],
  completeThroughMonth: "2026-06",
  payables: { completeThroughMonth: "2026-06" },
};

const REF = new Date(2026, 7, 24, 12, 0, 0); // 24/08/2026

/* ==================================================================================== */
describe("coverageComSnapshotParcial — a ponte que faltava", () => {
  it("sem meta, devolve a MESMA cobertura (identidade, não uma cópia)", () => {
    expect(coverageComSnapshotParcial(COBERTURA, null)).toBe(COBERTURA);
    expect(coverageComSnapshotParcial(COBERTURA, {})).toBe(COBERTURA);
  });

  it("com todas as fontes completas, devolve a MESMA cobertura", () => {
    const meta = { parcial: { orders: false, payables: false, receivables: false } };
    expect(coverageComSnapshotParcial(COBERTURA, meta)).toBe(COBERTURA);
  });

  it("`null` (fonte silenciosa) não veta — silêncio não é declaração", () => {
    const meta = { parcial: { orders: null, payables: null, receivables: null } };
    expect(coverageComSnapshotParcial(COBERTURA, meta)).toBe(COBERTURA);
  });

  it("pedidos parciais marcam SÓ os pedidos", () => {
    const meta = { parcial: { orders: true, payables: false, receivables: false } };
    const cov = coverageComSnapshotParcial(COBERTURA, meta);
    expect(cov.snapshotPartial).toBe(true);
    // Sem isto, o spread de payablesCoverage herdava a marca dos pedidos.
    expect(payablesCoverage(cov).snapshotPartial).toBe(false);
  });

  it("contas a pagar parciais marcam SÓ as contas a pagar", () => {
    const meta = { parcial: { orders: false, payables: true, receivables: false } };
    const cov = coverageComSnapshotParcial(COBERTURA, meta);
    expect(cov.snapshotPartial).toBe(false);
    expect(payablesCoverage(cov).snapshotPartial).toBe(true);
  });

  it("recebíveis parciais NÃO vetam a DRE — tesouraria não é resultado", () => {
    const meta = { parcial: { orders: false, payables: false, receivables: true } };
    expect(coverageComSnapshotParcial(COBERTURA, meta)).toBe(COBERTURA);
  });

  it("um `parcial` com o tipo errado não rebenta nem inventa veto", () => {
    for (const lixo of [[true, true], "true", 1, true]) {
      expect(coverageComSnapshotParcial(COBERTURA, { parcial: lixo })).toBe(COBERTURA);
    }
  });

  it("preserva os campos de cobertura que já existiam", () => {
    const meta = { parcial: { orders: true, payables: true } };
    const cov = coverageComSnapshotParcial(COBERTURA, meta);
    expect(cov.firstCompleteMonth).toBe("2026-04");
    expect(cov.completeThroughMonth).toBe("2026-06");
    expect(cov.partialMonths).toEqual(["2026-03"]);
    // A afinação própria das contas a pagar sobrevive à marcação.
    expect(payablesCoverage(cov).completeThroughMonth).toBe("2026-06");
  });
});

/* ==================================================================================== */
describe("sourceAvailability — o veto em si", () => {
  const parcial = coverageComSnapshotParcial(COBERTURA, { parcial: { orders: true, payables: true } });

  it("SEM veto, junho é real (o comportamento que não pode regredir)", () => {
    expect(sourceAvailability("2026-06", COBERTURA, REF)).toBe("real");
  });

  it("COM veto, junho deixa de ser real", () => {
    expect(sourceAvailability("2026-06", parcial, REF)).toBe("partial");
  });

  it("o veto alcança TODOS os meses cobertos, não só o mais recente", () => {
    /* As listagens de /contas/pagar e /contas/receber não são pedidas por data nem
     * chegam ordenadas por competência: o que ficou do lado de lá do teto MAX_PAGES
     * pode ser de abril tanto como de junho. Vetar só os meses recentes assumiria uma
     * ordenação que a fonte nunca prometeu. */
    for (const mk of ["2026-04", "2026-05", "2026-06"]) {
      expect(sourceAvailability(mk, COBERTURA, REF), `${mk} sem veto`).toBe("real");
      expect(sourceAvailability(mk, parcial, REF), `${mk} com veto`).toBe("partial");
    }
  });

  it("NÃO suaviza `unavailable`: um mês fora do histórico continua indisponível", () => {
    // partial seria uma promessa maior do que unavailable. O veto só pode tornar um
    // mês MENOS disponível, nunca mais.
    expect(sourceAvailability("2026-01", parcial, REF)).toBe("unavailable");
  });

  it("NÃO suaviza uma fonte AUSENTE", () => {
    expect(sourceAvailability("2026-06", parcial, REF, false)).toBe("unavailable");
  });

  it("um mês já declarado parcial continua parcial", () => {
    expect(sourceAvailability("2026-03", parcial, REF)).toBe("partial");
  });

  it("snapshotPartial: false é explicitamente inofensivo", () => {
    const cov = { ...COBERTURA, snapshotPartial: false };
    expect(sourceAvailability("2026-06", cov, REF)).toBe("real");
  });
});

/* ==================================================================================== */
describe("buildMonthlyDre — o veto chega às linhas da DRE", () => {
  const pedidos = [
    { id: 1, date: "2026-06-10", total: 1000, status: "recebida" },
    { id: 2, date: "2026-06-20", total: 500, status: "recebida" },
  ];
  const contas = [
    { id: 10, vencimento: "2026-06-15", dataEmissao: "2026-06-01", valor: 200, situacao: 1, categoriaNome: "Aluguer" },
  ];

  const dre = (coverage) => buildMonthlyDre({
    orders: pedidos, payables: contas, monthKey: "2026-06",
    coverage, referenceDate: REF,
  });

  it("baseline: sem veto, a receita de junho é real", () => {
    expect(dre(COBERTURA).availability.receitaBruta).toBe("real");
  });

  it("pedidos truncados: a RECEITA deixa de ser real", () => {
    const cov = coverageComSnapshotParcial(COBERTURA, { parcial: { orders: true, payables: false } });
    expect(dre(cov).availability.receitaBruta).toBe("partial");
  });

  it("contas a pagar truncadas: a receita mantém-se real, as despesas não", () => {
    /* Fontes independentes, snapshots independentes, rebuilds independentes. Um
     * truncamento num lado não é prova de nada sobre o outro — e degradar os dois
     * seria inventar uma correlação. */
    const cov = coverageComSnapshotParcial(COBERTURA, { parcial: { orders: false, payables: true } });
    const r = dre(cov);
    expect(r.availability.receitaBruta).toBe("real");
    const naoReal = ["partial", "unavailable", "manual", "mixed"];
    expect(naoReal).toContain(r.availability.coberturaPayables);
  });

  it("o VALOR não muda — o veto fala de confiança, não de aritmética", () => {
    /* Um snapshot truncado não torna erradas as linhas que vieram. Se o veto mexesse
     * nos números, estaria a inventar dados para compensar os que faltam — que é
     * exatamente o que nunca se pode fazer aqui. */
    const cov = coverageComSnapshotParcial(COBERTURA, { parcial: { orders: true, payables: true } });
    expect(dre(cov).receitaBruta).toBe(dre(COBERTURA).receitaBruta);
  });
});

/* ==================================================================================== */
describe("dataHealth continua a receber o mesmo mapa por fonte", () => {
  it("uma fonte truncada aparece como PARTIAL na faixa", () => {
    const r = resolveDataCompleteness({ meta: { parcial: { orders: false, payables: true, receivables: false } } });
    expect(r.estado).toBe(COMPLETENESS.PARTIAL);
    expect(r.parciais).toEqual(["payables"]);
  });

  it("faixa e motor concordam: nunca uma diz parcial e o outro diz real", () => {
    /* A regressão que isto tranca: a faixa a avisar que faltam dados enquanto o card
     * ao lado afirma um resultado apurado. As duas leituras saem do MESMO
     * `meta.parcial`, e é isso que as impede de divergir. */
    const meta = { parcial: { orders: false, payables: true, receivables: false } };
    const faixaParcial = resolveDataCompleteness({ meta }).estado === COMPLETENESS.PARTIAL;
    const motorParcial = sourceAvailability(
      "2026-06", payablesCoverage(coverageComSnapshotParcial(COBERTURA, meta)), REF
    ) !== "real";
    expect(faixaParcial).toBe(true);
    expect(motorParcial).toBe(true);
  });
});

/* ==================================================================================== */
describe("cobertura vazia continua segura", () => {
  it("EMPTY_COVERAGE sem veto já era partial, e continua", () => {
    expect(sourceAvailability("2026-06", EMPTY_COVERAGE, undefined)).toBe("partial");
  });

  it("vetar uma cobertura vazia não a torna pior nem rebenta", () => {
    const cov = coverageComSnapshotParcial(EMPTY_COVERAGE, { parcial: { orders: true, payables: true } });
    expect(sourceAvailability("2026-06", cov, REF)).toBe("partial");
  });
});
