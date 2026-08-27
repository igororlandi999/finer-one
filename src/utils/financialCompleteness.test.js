// CONTRATO — "MÊS FINANCEIRAMENTE COMPLETO" vs. "MÊS ELEGÍVEL COMO ÂNCORA".
//
// ─── O DEFEITO QUE ISTO TRAVA ───────────────────────────────────────────────────────
// O catálogo de requisitos de fecho tem hoje UMA entrada: o CMV. Logo, lançar o CMV
// esgotava o catálogo e o mês ficava CLOSING_STATUS.COMPLETE — e `latestCompleteMonthKey`
// promovia-o imediatamente a âncora dos KPIs de rentabilidade.
//
// Medido nos dados REAIS de julho/2026, com um CMV sintético injetado só em memória:
//   deduções               partial
//   despesas operacionais  partial
//   EBITDA                 partial
//   closing.status         complete   <- requisitos satisfeitos
//   âncora dos KPIs        2026-07    <- e a rentabilidade passava a assentar aqui
//
// Informar o CMV resolve o CMV. Não torna completas as contas a pagar de julho.
//
// ─── O QUE ESTES TESTES PROTEGEM ────────────────────────────────────────────────────
// Nenhum testa uma FÓRMULA nem um VALOR. Todos testam DISPONIBILIDADE e o direito de
// um mês sustentar KPIs. Os cenários passam pelos motores reais (buildMonthlyDre ->
// buildFinancialMetrics -> buildMonthlyClosing -> buildFinancialCompleteness): se a
// semântica mudar num motor, estes testes mudam com ele em vez de a mascarar.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import { buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import {
  buildFinancialCompleteness, latestAnchorEligibleMonthKey,
  FINANCIAL_COMPLETENESS, ANCHOR_BLOCKER, LINE_CAUSE,
} from "./financialCompleteness.js";

const NOW_AGOSTO = new Date(2026, 7, 24);   // 24/08/2026, local
const MES = "2026-07";

const PEDIDOS_JULHO = [
  { id: 1, date: "2026-07-03", total: 100000, status: "recebida" },
  { id: 2, date: "2026-07-18", total: 72995.4, status: "em_aberto" },
];

/** Contas a pagar de julho, todas com categoria reconhecida. */
const PAGAR_JULHO = [
  { id: 10, vencimento: "2026-07-10", valor: 12000, categoriaNome: "Salários", situacao: 2 },
  { id: 11, vencimento: "2026-07-12", valor: 3000, categoriaNome: "Comissões", situacao: 2 },
];

/** As mesmas, mais um título cuja natureza contabilística NÃO é reconhecida. */
const PAGAR_JULHO_COM_NAO_CLASSIFICADO = [
  ...PAGAR_JULHO,
  { id: 12, vencimento: "2026-07-20", valor: 900, categoriaNome: "Categoria XPTO", situacao: 2 },
];

/** Cobertura em que julho JÁ FECHOU dos dois lados (fonte de pedidos e de despesas). */
const COVERAGE_JULHO_FECHADO = {
  firstCompleteMonth: "2026-04",
  partialMonths: [],
  completeThroughMonth: "2026-07",
  payables: { completeThroughMonth: "2026-07" },
};

/** Cobertura REAL de hoje: pedidos derivam do calendário, despesas só até junho. */
const COVERAGE_DESPESAS_ATRASADAS = {
  firstCompleteMonth: "2026-04",
  partialMonths: [],
  completeThroughMonth: null,
  payables: { completeThroughMonth: "2026-06" },
};

/**
 * Percorre o caminho OFICIAL de ponta a ponta e devolve tudo o que os testes leem.
 * Não reimplementa regra nenhuma: é a mesma sequência que o blingDataService usa.
 */
function avaliar({
  mk = MES, coverage = COVERAGE_JULHO_FECHADO, manualInputs,
  orders = PEDIDOS_JULHO, payables = PAGAR_JULHO, now = NOW_AGOSTO,
} = {}) {
  const dre = buildMonthlyDre({ orders, payables, monthKey: mk, manualInputs, coverage, referenceDate: now });
  const metrics = buildFinancialMetrics(dre);
  const closing = buildMonthlyClosing({ monthKey: mk, metrics, now, coverage });
  const financial = buildFinancialCompleteness({ metrics, closing });
  return { dre, metrics, closing, financial, comFinancial: { ...closing, financial } };
}

/* ══════════════════════════════════════════════════════════════════════════════════
 * FASE 8 — a matriz obrigatória da elegibilidade como âncora.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("ÂNCORA DOS KPIs — a matriz obrigatória", () => {
  it("A. CMV manual + despesas reais => PODE ser âncora", () => {
    const { closing, financial } = avaliar({ manualInputs: { cmv: 90000 } });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.COMPLETE);
    expect(financial.anchorEligible).toBe(true);
    expect(financial.anchorBlockers).toEqual([]);
  });

  it("B. CMV manual + despesas PARCIAIS => NÃO pode ser âncora (o defeito original)", () => {
    const { closing, financial } = avaliar({
      coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 },
    });
    // Os requisitos ESTÃO satisfeitos — e é exatamente por isso que o defeito passava.
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    // Mas a análise financeira do mês não está.
    expect(financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.PARTIAL);
    expect(financial.anchorEligible).toBe(false);
    expect(financial.anchorBlockers).toContain(ANCHOR_BLOCKER.ANALISE_INCOMPLETA);
  });

  it("C. CMV real do ERP + despesas parciais => NÃO pode ser âncora", () => {
    /* Se um dia uma integração fornecer o CMV automaticamente, a availability da linha
     * passa a "real" em vez de "manual". A origem do dado não pode alterar o veredito:
     * o que bloqueia são as despesas, e continuam bloqueadas. */
    const { financial } = avaliar({
      coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 },
    });
    const comCmvReal = buildFinancialCompleteness({
      metrics: {
        monthKey: MES, warnings: [],
        availability: { ...financial.lines.reduce((a, l) => ({ ...a, [l.key]: l.availability }), {}), cmv: "real" },
      },
      closing: { monthKey: MES, status: CLOSING_STATUS.COMPLETE, totalComplete: 1, items: [] },
    });
    expect(comCmvReal.anchorEligible).toBe(false);
    expect(comCmvReal.anchorBlockers).toContain(ANCHOR_BLOCKER.ANALISE_INCOMPLETA);
  });

  it("D. CMV manual ZERO válido + despesas reais => PODE ser âncora", () => {
    // 0 é um valor real informado, nunca ausência. Um mês pode mesmo ter CMV zero.
    const { closing, financial } = avaliar({ manualInputs: { cmv: 0 } });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(financial.anchorEligible).toBe(true);
  });

  it("E. receita PARCIAL => não pode ser âncora", () => {
    const { financial } = avaliar({
      coverage: { ...COVERAGE_JULHO_FECHADO, partialMonths: [MES] },
      manualInputs: { cmv: 90000 },
    });
    expect(financial.anchorEligible).toBe(false);
    const receita = financial.lines.find((l) => l.key === "revenueGross");
    expect(receita.availability).toBe("partial");
    expect(receita.causes).toContain(LINE_CAUSE.COBERTURA);
  });

  it("F. deduções PARCIAIS => não pode ser âncora", () => {
    // As deduções saem só das contas a pagar: atrasar a cobertura delas basta.
    const { financial } = avaliar({
      coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 },
    });
    const deducoes = financial.lines.find((l) => l.key === "deductions");
    expect(deducoes.availability).toBe("partial");
    expect(financial.anchorEligible).toBe(false);
  });

  it("G. tudo real/manual válido => PODE ser âncora", () => {
    const { financial } = avaliar({ manualInputs: { cmv: 90000 } });
    expect(financial.sourceCompleteness).toBe(FINANCIAL_COMPLETENESS.COMPLETE);
    expect(financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.COMPLETE);
    expect(financial.anchorEligible).toBe(true);
  });

  it("H. mês COMPLETE por vacuidade (sem atividade) => NUNCA é âncora", () => {
    /* Sem um único pedido, a receita é 0 real, o CMV fica not_applicable e o mês fecha
     * com totalComplete: 0. É um veredito correto para "o mês pode fechar?" e péssimo
     * para "onde ancoro os KPIs?" — as margens de um mês sem vendas não significam nada. */
    const { closing, financial } = avaliar({ orders: [], payables: [] });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(closing.totalComplete).toBe(0);
    expect(financial.anchorEligible).toBe(false);
    expect(financial.anchorBlockers).toContain(ANCHOR_BLOCKER.SEM_ATIVIDADE);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * FASE 5 — as regras mínimas, uma a uma.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("REGRAS MÍNIMAS da completude financeira", () => {
  it("CMV em falta => o mês NÃO é financeiramente completo", () => {
    const { closing, financial } = avaliar();   // sem manualInputs
    expect(closing.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(financial.financialAnalysisStatus).not.toBe(FINANCIAL_COMPLETENESS.COMPLETE);
    expect(financial.anchorBlockers).toContain(ANCHOR_BLOCKER.REQUISITOS_POR_PREENCHER);
  });

  it("CMV manual válido resolve APENAS o CMV — não toca nas despesas", () => {
    const semCmv = avaliar({ coverage: COVERAGE_DESPESAS_ATRASADAS });
    const comCmv = avaliar({ coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 } });

    const opex = (r) => r.financial.lines.find((l) => l.key === "operatingExpenses").availability;
    // A linha das despesas é exatamente a mesma antes e depois de o CMV entrar.
    expect(opex(semCmv)).toBe("partial");
    expect(opex(comCmv)).toBe("partial");
    // O que muda é só a linha do CMV.
    expect(comCmv.financial.lines.find((l) => l.key === "cmv").availability).toBe("manual");
  });

  it("despesas operacionais parciais => EBITDA e resultado líquido ficam PARCIAIS", () => {
    const { dre } = avaliar({ coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 } });
    // O motor já dizia a verdade sobre as linhas; o que faltava era alguém ouvi-la.
    expect(dre.availability.ebitda).toBe("partial");
    expect(dre.availability.resultadoLiquido).toBe("partial");
  });

  it("zero REAL continua a ser um dado válido e completa a linha", () => {
    // Julho sem contas a pagar nenhumas: as deduções são 0 REAL, não ausência.
    const { dre, financial } = avaliar({ payables: [], manualInputs: { cmv: 90000 } });
    expect(dre.totalDeducoes).toBe(0);
    expect(dre.availability.totalDeducoes).toBe("real");
    expect(financial.anchorEligible).toBe(true);
  });

  it("NOT_APPLICABLE legítimo não bloqueia e não pede nada ao utilizador", () => {
    const { closing, financial } = avaliar({ orders: [], payables: [] });
    expect(closing.items[0].status).toBe("not_applicable");
    const cmv = financial.lines.find((l) => l.key === "cmv");
    expect(cmv.notApplicable).toBe(true);
    // Nunca "CMV por preencher" num mês em que a plataforma declarou o CMV inexigível.
    expect(cmv.causes).toEqual([]);
    expect(financial.blockers.map((b) => b.key)).not.toContain("cmv");
  });

  it("fonte ausente (unavailable) em linha essencial => não completo", () => {
    const { financial } = avaliar({ payables: null, manualInputs: { cmv: 90000 } });
    expect(financial.sourceCompleteness).toBe(FINANCIAL_COMPLETENESS.UNAVAILABLE);
    expect(financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.UNAVAILABLE);
    expect(financial.anchorEligible).toBe(false);
  });

  it("mês em curso => IN_PROGRESS, e nunca âncora", () => {
    const { closing, financial } = avaliar({ mk: "2026-08" });
    expect(closing.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.IN_PROGRESS);
    expect(financial.anchorBlockers).toEqual([ANCHOR_BLOCKER.MES_EM_CURSO]);
  });

  it("mês FUTURO nunca é âncora", () => {
    const { financial } = avaliar({ mk: "2027-07" });
    expect(financial.anchorEligible).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * FASE 6 — decompor a parcialidade das despesas: cobertura vs. classificação.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("DECOMPOSIÇÃO da parcialidade das despesas operacionais", () => {
  it("A. parcial só por COBERTURA da fonte (período por fechar)", () => {
    const { financial } = avaliar({
      coverage: COVERAGE_DESPESAS_ATRASADAS, manualInputs: { cmv: 90000 },
    });
    const opex = financial.lines.find((l) => l.key === "operatingExpenses");
    expect(opex.causes).toEqual([LINE_CAUSE.COBERTURA]);
  });

  it("B. parcial só por CLASSIFICAÇÃO (mês fechado, títulos por reconhecer)", () => {
    const { dre, financial } = avaliar({
      payables: PAGAR_JULHO_COM_NAO_CLASSIFICADO, manualInputs: { cmv: 90000 },
    });
    // O período FECHOU: a cobertura temporal está limpa.
    expect(dre.availability.coberturaPayables).toBe("real");
    const opex = financial.lines.find((l) => l.key === "operatingExpenses");
    expect(opex.availability).toBe("partial");
    expect(opex.causes).toEqual([LINE_CAUSE.CLASSIFICACAO]);
    // E um título por classificar chega para tirar o mês da âncora.
    expect(financial.anchorEligible).toBe(false);
  });

  it("C. parcial pelos DOIS motivos ao mesmo tempo — reporta os dois", () => {
    const { financial } = avaliar({
      coverage: COVERAGE_DESPESAS_ATRASADAS,
      payables: PAGAR_JULHO_COM_NAO_CLASSIFICADO,
      manualInputs: { cmv: 90000 },
    });
    const opex = financial.lines.find((l) => l.key === "operatingExpenses");
    expect(opex.causes).toEqual([LINE_CAUSE.COBERTURA, LINE_CAUSE.CLASSIFICACAO]);
  });

  it("a classificação NUNCA contamina as linhas que não a têm", () => {
    // Só as despesas operacionais excluem títulos por reconhecer. As retiradas de
    // sócios e as deduções saem da mesma fonte mas não carregam esse eixo.
    const { financial } = avaliar({
      payables: PAGAR_JULHO_COM_NAO_CLASSIFICADO, manualInputs: { cmv: 90000 },
    });
    expect(financial.lines.find((l) => l.key === "withdrawals").availability).toBe("real");
    expect(financial.lines.find((l) => l.key === "deductions").availability).toBe("real");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * O SELETOR DA ÂNCORA.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("latestAnchorEligibleMonthKey", () => {
  const elegivel = (mk) => ({ monthKey: mk, financial: { monthKey: mk, anchorEligible: true } });
  const naoElegivel = (mk) => ({ monthKey: mk, financial: { monthKey: mk, anchorEligible: false } });

  it("escolhe o mês elegível mais recente, seja qual for a ordem da lista", () => {
    expect(latestAnchorEligibleMonthKey([elegivel("2026-05"), elegivel("2026-06")])).toBe("2026-06");
    expect(latestAnchorEligibleMonthKey([elegivel("2026-06"), elegivel("2026-05")])).toBe("2026-06");
  });

  it("ignora meses não elegíveis mesmo que sejam mais recentes", () => {
    expect(latestAnchorEligibleMonthKey([naoElegivel("2026-07"), elegivel("2026-06")])).toBe("2026-06");
  });

  it("um fecho SEM veredito é ignorado — nunca assumido elegível", () => {
    // Sem o bloco `financial` não há base para afirmar elegibilidade. Assumir que sim
    // seria o regresso exato do defeito que este módulo corrige.
    expect(latestAnchorEligibleMonthKey([{ monthKey: "2026-07", status: "complete" }])).toBeNull();
  });

  it("entrada inválida => null, sem rebentar", () => {
    expect(latestAnchorEligibleMonthKey(null)).toBeNull();
    expect(latestAnchorEligibleMonthKey([])).toBeNull();
    expect(latestAnchorEligibleMonthKey([null, undefined])).toBeNull();
  });
});
