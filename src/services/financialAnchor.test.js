// MATRIZ DA ÂNCORA FINANCEIRA — de onde vem `financeiro.monthKey`, em todos os casos.
//
// ─── O DEFEITO QUE ISTO TRAVA ───────────────────────────────────────────────────────
// A seleção é `mesElegivel || mesUsavel`. O segundo termo aceita o último mês com
// RECEITA real, sem olhar às contas a pagar nem ao CMV — e chegava à UI indistinguível
// do primeiro. Medido:
//
//   contas a pagar AUSENTES   -> âncora = julho; deduções, EBITDA e resultado `unavailable`
//   cobertura ATRASADA        -> âncora = julho; deduções e despesas `partial`
//
// Nos dois, `referenciaAtrasada` ficava `false` — literalmente verdade (a âncora É o mês
// civil), e lido como "está tudo em dia" sobre um mês sem EBITDA nenhum.
//
// O recurso mantém-se de propósito: um mês com receita verdadeira ainda responde a
// perguntas úteis, e `null` apagaria o Resumo. O que acabou foi o silêncio.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset } from "./blingDataService.js";
import { ANCHOR_SOURCE } from "../utils/financialCompleteness.js";

const HOJE = new Date(2026, 7, 24, 12, 0, 0);   // 24/08/2026 -> último mês civil: julho

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

const ord = (id, date, total) => ({
  id, date, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
});
const pg = (id, venc, valor, cat) => ({
  id, situacao: 2, dataEmissao: venc, vencimento: venc, valor, categoriaNome: cat,
  contato: { id: 1, nome: "F" },
});

/** Cobertura com os dois eixos explícitos. `payablesThrough` é o que muda entre casos. */
const COV = (payablesThrough, completeThrough = null, partialMonths = []) => ({
  firstCompleteMonth: "2026-04",
  partialMonths,
  completeThroughMonth: completeThrough,
  payables: { completeThroughMonth: payablesThrough },
});

const ORDERS = [ord(1, "2026-06-10", 150000), ord(2, "2026-07-10", 172899)];
const PAYABLES = [pg(10, "2026-06-05", 11000, "Salários"), pg(12, "2026-07-05", 12127, "Salários")];
const CMV_AMBOS = { "2026-06": { cmv: 116039 }, "2026-07": { cmv: 111111 } };

const ds = ({ orders = ORDERS, payables = PAYABLES, coverage, manual = {} }) =>
  buildSalesDataset({ orders, payables, coverage, manualInputsByMonth: manual });

describe("MATRIZ — de onde vem a âncora dos KPIs", () => {
  it("A. há mês elegível => usa esse mês e declara-o elegível", () => {
    const fin = ds({ coverage: COV("2026-07", "2026-07"), manual: CMV_AMBOS }).financeiro;
    expect(fin.monthKey).toBe("2026-07");
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.ELIGIBLE);
    expect(fin.anchorEligible).toBe(true);
    expect(fin.anchorFinancial.anchorEligible).toBe(true);
  });

  it("B. nenhum elegível, cobertura das despesas atrasada => RECURSO, nunca elegível", () => {
    const fin = ds({ coverage: COV("2026-05"), manual: {} }).financeiro;
    expect(fin.monthKey).toBe("2026-07");        // o recurso continua a dar números
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.FALLBACK);
    expect(fin.anchorEligible).toBe(false);
    // E o mês continua a dizer a verdade sobre as suas linhas.
    expect(fin.metrics.availability.operatingExpenses).toBe("partial");
  });

  it("C. nenhum mês financeiramente completo (sem CMV nenhum) => RECURSO", () => {
    const fin = ds({ coverage: COV("2026-07", "2026-07"), manual: {} }).financeiro;
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.FALLBACK);
    expect(fin.anchorEligible).toBe(false);
    // As fontes estão completas; o que falta é o requisito do utilizador.
    expect(fin.anchorFinancial.sourceCompleteness).toBe("complete");
    expect(fin.metrics.availability.ebitda).toBe("unavailable");
  });

  it("D. só receita real, contas a pagar AUSENTES => RECURSO, e nada finge estar completo", () => {
    /* O pior caso da matriz: sem fonte de contas a pagar, deduções, despesas, EBITDA e
     * resultado são todos `unavailable` — e a âncora era, ainda assim, o mês civil, com
     * `referenciaAtrasada: false`. Nada na resposta dizia que não havia análise. */
    /* Chamada direta, sem o helper: `payables: undefined` acionaria o valor por
     * omissão de `ds()` e o caso testaria o contrário do que diz. A ausência da fonte
     * é exatamente o que se quer aqui, e tem de chegar ao serviço como ausência. */
    const fin = buildSalesDataset({
      orders: ORDERS, payables: undefined,
      coverage: COV("2026-07", "2026-07"), manualInputsByMonth: CMV_AMBOS,
    }).financeiro;
    expect(fin.monthKey).toBe("2026-07");
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.FALLBACK);
    expect(fin.anchorEligible).toBe(false);
    const a = fin.metrics.availability;
    expect(a.revenueGross).toBe("real");
    expect(a.deductions).toBe("unavailable");
    expect(a.ebitda).toBe("unavailable");
    expect(a.netResult).toBe("unavailable");
  });

  it("E. mês vazio COMPLETE por vacuidade => NUNCA é âncora", () => {
    const fin = ds({ orders: [], payables: [], coverage: COV("2026-07", "2026-07") }).financeiro;
    expect(fin.monthKey).toBeNull();
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.NONE);
    expect(fin.anchorEligible).toBe(false);
    expect(fin.metrics).toBeNull();
    expect(fin.anchorFinancial).toBeNull();
  });

  it("F. mês futuro com conta a pagar => nunca é âncora", () => {
    /* Regressão histórica: um vencimento em 2027-07 criava a chave "2027-07" em
     * availableDreMonths e o Resumo exibia «2027-07 em andamento». */
    const fin = ds({
      orders: [ord(1, "2026-06-10", 150000)],
      payables: [...PAYABLES, pg(99, "2027-07-01", 50000, "Salários")],
      coverage: COV("2026-07", "2026-07"),
      manual: { "2026-06": { cmv: 116039 } },
    }).financeiro;
    expect(fin.monthKey).toBe("2026-06");
    expect(fin.anchorSource).toBe(ANCHOR_SOURCE.ELIGIBLE);
    expect(fin.referenciaAtrasada).toBe(true);
  });
});

describe("o recurso nunca se disfarça de fecho", () => {
  it("`anchorEligible` e `referenciaAtrasada` respondem a perguntas DIFERENTES", () => {
    /* No caso B a âncora É o mês civil, logo `referenciaAtrasada` é false — e continua
     * correto. O que estava em falta era o outro eixo: o mês não é elegível. Um campo
     * não substitui o outro, e ler só `referenciaAtrasada` é como o defeito voltava. */
    const fin = ds({ coverage: COV("2026-05"), manual: {} }).financeiro;
    expect(fin.referenciaAtrasada).toBe(false);
    expect(fin.anchorEligible).toBe(false);
  });

  it("um mês elegível traz sempre bloqueios vazios; um recurso traz-nos nomeados", () => {
    const elegivel = ds({ coverage: COV("2026-07", "2026-07"), manual: CMV_AMBOS }).financeiro;
    expect(elegivel.anchorFinancial.anchorBlockers).toEqual([]);

    const recurso = ds({ coverage: COV("2026-05"), manual: {} }).financeiro;
    expect(recurso.anchorFinancial.anchorBlockers.length).toBeGreaterThan(0);
  });

  it("`anchorSource` cobre os três casos e nunca fica indefinido", () => {
    const casos = [
      ds({ coverage: COV("2026-07", "2026-07"), manual: CMV_AMBOS }),
      ds({ coverage: COV("2026-05"), manual: {} }),
      ds({ orders: [], payables: [], coverage: COV("2026-07", "2026-07") }),
    ];
    const fontes = casos.map((d) => d.financeiro.anchorSource);
    expect(fontes).toEqual([ANCHOR_SOURCE.ELIGIBLE, ANCHOR_SOURCE.FALLBACK, ANCHOR_SOURCE.NONE]);
    for (const f of fontes) expect(Object.values(ANCHOR_SOURCE)).toContain(f);
  });
});
