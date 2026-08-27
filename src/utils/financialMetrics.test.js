// Testes da camada central de métricas financeiras.

import { describe, it, expect } from "vitest";
import {
  buildFinancialMetrics,
  safePct,
  latestUsableFinancialMonth,
  canComparePeriods,
  buildMetricsWithComparison,
} from "./financialMetrics.js";
import { buildMonthlyDre } from "./dreEngine.js";

const order = (id, dateISO, total, extra = {}) => ({
  id: String(id), date: dateISO, total, status: "recebida",
  client: { id: 1, name: "C" }, items: [], ...extra,
});
const pay = (id, categoriaNome, valor, vencimento, situacao = 2, historico = null) => ({
  id, categoriaNome, valor, historico, vencimento, situacao, contato: { id: 1, nome: "F" },
});

// ── Fixture de junho da Overcel (mesma da Fase 2) ───────────
const REF = new Date(2026, 6, 15);
const COV = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"], closedThroughMonth: "2026-06" };
const ordersJun = [
  order(1, "2026-06-05", 100000.00, { frete: 1500.00 }),
  order(2, "2026-06-12", 60000.00, { frete: 1000.00 }),
  order(3, "2026-06-25", 46227.15, { frete: 597.80 }),
];
const payablesJun = [
  pay(1, "Comissão sobre vendas", 1144.93, "2026-06-10"),
  pay(2, "Impostos sobre vendas", 26417.70, "2026-06-20"),
  pay(3, "Salários", 2800.00, "2026-06-05"),
  pay(4, "Aluguel", 2425.90, "2026-06-08"),
  pay(5, "Software", 500.00, "2026-06-09"),
  pay(6, "Tarifa bancária", 180.78, "2026-06-11"),
  pay(7, "Serviços de terceiros", 2500.00, "2026-06-12"),
  pay(8, "Pró-labore", 50597.84, "2026-06-15", 2, "Adiantamento de dividendos"),
];
const dreJunho = (manualInputs = { cmv: 116039.70 }) => buildMonthlyDre({
  orders: ordersJun, payables: payablesJun, monthKey: "2026-06",
  manualInputs, coverage: COV, referenceDate: REF,
});

describe("safePct — rácios seguros", () => {
  it("calcula a percentagem", () => expect(safePct(50, 200)).toBe(25));
  it("denominador zero => null (nunca Infinity)", () => {
    expect(safePct(100, 0)).toBeNull();
    expect(Number.isFinite(safePct(100, 0))).toBe(false);
  });
  it("numerador ou denominador null => null", () => {
    expect(safePct(null, 100)).toBeNull();
    expect(safePct(100, null)).toBeNull();
  });
  it("numerador zero é resultado real (0%)", () => expect(safePct(0, 100)).toBe(0));
  it("valores negativos são preservados", () => expect(safePct(-50, 200)).toBe(-25));
});

describe("buildFinancialMetrics — fixture de junho da Overcel", () => {
  const m = buildFinancialMetrics(dreJunho());

  it("receita bruta e líquida", () => {
    expect(m.revenue.gross).toBe(206227.15);
    expect(m.revenue.net).toBe(178664.52); // frete cobrado já não é abatido
  });

  it("deduções e o seu peso na receita bruta", () => {
    expect(m.deductions.total).toBe(27562.63); // comissões + devoluções + impostos
    expect(m.deductions.pctOfGrossRevenue).toBeCloseTo(13.37, 2);
  });

  it("CMV e o seu peso na receita líquida", () => {
    expect(m.cmv.value).toBe(116039.70);
    expect(m.cmv.pctOfNetRevenue).toBeCloseTo(64.95, 2);
  });

  it("lucro bruto e margem bruta", () => {
    expect(m.profitability.grossProfit).toBe(62624.82);
    expect(m.profitability.grossMarginPct).toBeCloseTo(35.05, 2);
  });

  it("despesas operacionais e o seu peso", () => {
    expect(m.operatingExpenses.total).toBe(8406.68);
    expect(m.operatingExpenses.pctOfNetRevenue).toBeCloseTo(4.71, 2);
  });

  it("EBITDA e margem EBITDA", () => {
    expect(m.profitability.ebitda).toBe(54218.14);
    expect(m.profitability.ebitdaMarginPct).toBeCloseTo(30.35, 2);
  });

  it("resultado líquido e margem líquida", () => {
    expect(m.profitability.netResult).toBe(3620.30);
    expect(m.profitability.netMarginPct).toBeCloseTo(2.03, 2);
  });

  it("retiradas ficam à parte das operacionais", () => {
    expect(m.withdrawals.total).toBe(50597.84);
    expect(m.operatingExpenses.total).toBe(8406.68); // não as inclui
  });
});

describe("buildFinancialMetrics — null e zero", () => {
  it("receita líquida null => todas as margens null", () => {
    // A receita líquida deixou de depender do frete. Fica null quando falta a fonte
    // das deduções: sem contas a pagar não há comissões, devoluções nem impostos.
    const dre = buildMonthlyDre({
      orders: [order(1, "2026-06-05", 1000, { frete: 10 })], payables: null,
      monthKey: "2026-06", manualInputs: { cmv: 100 }, coverage: COV, referenceDate: REF,
    });
    const m = buildFinancialMetrics(dre);
    expect(m.revenue.net).toBeNull();
    expect(m.profitability.grossMarginPct).toBeNull();
    expect(m.profitability.ebitdaMarginPct).toBeNull();
    expect(m.profitability.netMarginPct).toBeNull();
    expect(m.cmv.pctOfNetRevenue).toBeNull();
  });

  it("receita líquida ZERO => margens null (não é 0%, é indefinido)", () => {
    const dre = buildMonthlyDre({
      orders: [order(1, "2026-06-05", 0, { frete: 0 })], payables: [],
      monthKey: "2026-06", manualInputs: { cmv: 0 }, coverage: COV, referenceDate: REF,
    });
    const m = buildFinancialMetrics(dre);
    expect(m.revenue.net).toBe(0);
    expect(m.profitability.grossMarginPct).toBeNull();
    expect(m.profitability.netMarginPct).toBeNull();
  });

  it("EBITDA null => margem EBITDA null", () => {
    const m = buildFinancialMetrics(dreJunho(null)); // sem CMV
    expect(m.profitability.ebitda).toBeNull();
    expect(m.profitability.ebitdaMarginPct).toBeNull();
  });

  it("resultado líquido ZERO => margem líquida ZERO (valor real)", () => {
    // EBITDA exatamente igual às retiradas => resultado 0
    const orders = [order(1, "2026-06-05", 1000, { frete: 0 })];
    const payables = [pay(1, "Distribuição de Lucros", 900, "2026-06-10")];
    const dre = buildMonthlyDre({ orders, payables, monthKey: "2026-06", manualInputs: { cmv: 100 }, coverage: COV, referenceDate: REF });
    const m = buildFinancialMetrics(dre);
    expect(m.profitability.netResult).toBe(0);
    expect(m.profitability.netMarginPct).toBe(0);
    expect(m.profitability.netMarginPct).not.toBeNull();
  });

  it("dre null => métricas null", () => {
    expect(buildFinancialMetrics(null)).toBeNull();
  });
});

describe("buildFinancialMetrics — disponibilidade", () => {
  it("todas as fontes reais => métricas reais", () => {
    const dre = buildMonthlyDre({
      orders: [order(1, "2026-06-05", 1000, { frete: 10 })],
      payables: [pay(1, "Aluguel", 100, "2026-06-05")],
      monthKey: "2026-06", coverage: COV, referenceDate: REF,
    });
    const m = buildFinancialMetrics(dre);
    expect(m.revenue.netAvailability).toBe("real");
    expect(m.operatingExpenses.availability).toBe("real");
  });

  it("CMV manual => métricas dependentes marcadas como mixed", () => {
    const m = buildFinancialMetrics(dreJunho());
    expect(m.cmv.availability).toBe("manual");
    expect(m.profitability.availability.grossProfit).toBe("mixed");
    expect(m.profitability.availability.ebitda).toBe("mixed");
    expect(m.profitability.availability.netResult).toBe("mixed");
  });

  it("receita parcial => métricas dependentes parciais", () => {
    const dre = buildMonthlyDre({
      orders: [order(1, "2026-07-05", 1000, { frete: 10 })],
      payables: [pay(1, "Aluguel", 100, "2026-07-05")],
      monthKey: "2026-07", coverage: COV, referenceDate: REF, manualInputs: { cmv: 100 },
    });
    const m = buildFinancialMetrics(dre);
    expect(m.revenue.netAvailability).toBe("partial");
    expect(m.profitability.availability.ebitdaMarginPct).toBe("partial");
  });

  it("fonte indisponível => métrica indisponível", () => {
    const m = buildFinancialMetrics(dreJunho(null));
    expect(m.availability.cmv).toBe("unavailable");
    expect(m.profitability.availability.netResult).toBe("unavailable");
    expect(m.profitability.availability.netMarginPct).toBe("unavailable");
  });
});

describe("canComparePeriods", () => {
  it("real vs real => comparável", () => expect(canComparePeriods("real", "real")).toBe(true));
  it("partial vs real => NÃO comparável", () => {
    expect(canComparePeriods("partial", "real")).toBe(false);
    expect(canComparePeriods("real", "partial")).toBe(false);
  });
  it("unavailable => NÃO comparável", () => {
    expect(canComparePeriods("unavailable", "real")).toBe(false);
    expect(canComparePeriods("real", "unavailable")).toBe(false);
  });
  it("null => NÃO comparável", () => {
    expect(canComparePeriods(null, "real")).toBe(false);
    expect(canComparePeriods("real", undefined)).toBe(false);
  });
  it("manual/mixed entre si são comparáveis (mesma natureza)", () => {
    expect(canComparePeriods("mixed", "mixed")).toBe(true);
    expect(canComparePeriods("manual", "real")).toBe(true);
  });
});

describe("latestUsableFinancialMonth — mês de referência central", () => {
  const orders = [
    order(1, "2026-05-10", 100), order(2, "2026-06-10", 200), order(3, "2026-07-03", 300),
  ];

  it("por omissão devolve o último mês FECHADO (junho, não julho)", () => {
    expect(latestUsableFinancialMonth({ orders, payables: [], coverage: COV, referenceDate: REF })).toBe("2026-06");
  });

  it("com allowPartial devolve o mês em curso (julho)", () => {
    expect(latestUsableFinancialMonth({ orders, payables: [], coverage: COV, referenceDate: REF, allowPartial: true })).toBe("2026-07");
  });

  it("ignora meses fora da cobertura", () => {
    const antigos = [order(9, "2026-01-10", 999)];
    expect(latestUsableFinancialMonth({ orders: antigos, payables: [], coverage: COV, referenceDate: REF })).toBeNull();
  });

  it("sem dados => null (nunca inventa mês)", () => {
    expect(latestUsableFinancialMonth({ orders: [], payables: [], coverage: COV, referenceDate: REF })).toBeNull();
  });
});

describe("buildMetricsWithComparison", () => {
  const orders = [
    order(1, "2026-05-10", 1000, { frete: 10 }),
    order(2, "2026-06-10", 2000, { frete: 20 }),
    order(3, "2026-07-03", 500, { frete: 5 }),
  ];

  it("junho vs maio (ambos fechados) => comparável", () => {
    const r = buildMetricsWithComparison({
      orders, payables: [], monthKey: "2026-06", previousMonthKey: "2026-05",
      coverage: COV, referenceDate: REF,
    });
    expect(r.comparable).toBe(true);
    expect(r.current.revenue.gross).toBe(2000);
    expect(r.previous.revenue.gross).toBe(1000);
  });

  it("julho (parcial) vs junho (fechado) => NÃO comparável", () => {
    const r = buildMetricsWithComparison({
      orders, payables: [], monthKey: "2026-07", previousMonthKey: "2026-06",
      coverage: COV, referenceDate: REF,
    });
    expect(r.current.revenue.gross).toBe(500); // valor existe
    expect(r.comparable).toBe(false);          // mas não se conclui nada
  });

  it("sem mês anterior => não comparável", () => {
    const r = buildMetricsWithComparison({ orders, payables: [], monthKey: "2026-06", coverage: COV, referenceDate: REF });
    expect(r.previous).toBeNull();
    expect(r.comparable).toBe(false);
  });
});

/* ====================================================================================
 * CMV C3 — contrato manualInputsByMonth.
 * O que estes testes protegem NÃO é a implementação, é o contrato: cada mês recebe
 * exclusivamente o seu próprio input manual. Antes da C3, buildMetricsWithComparison
 * aplicava um único objeto manualInputs aos dois meses, pelo que um CMV informado só
 * para junho contaminava maio.
 * ==================================================================================== */
describe("buildMetricsWithComparison — manualInputsByMonth (isolamento entre meses)", () => {
  // payables: [] => deduções, operacionais e retiradas são zeros REAIS.
  // Assim a única fonte não-real possível é o CMV, e a availability derivada é legível.
  const ordersMJ = [
    order(1, "2026-05-10", 1000),
    order(2, "2026-06-10", 2000),
  ];
  const comparar = (manualInputsByMonth) => buildMetricsWithComparison({
    orders: ordersMJ, payables: [], monthKey: "2026-06", previousMonthKey: "2026-05",
    manualInputsByMonth, coverage: COV, referenceDate: REF,
  });

  it("T1 — junho e maio no mapa: cada mês recebe apenas o seu valor", () => {
    const r = comparar({ "2026-06": { cmv: 500 }, "2026-05": { cmv: 300 } });
    expect(r.current.cmv.value).toBe(500);
    expect(r.previous.cmv.value).toBe(300);
    // O valor de um mês nunca aparece no outro.
    expect(r.current.cmv.value).not.toBe(300);
    expect(r.previous.cmv.value).not.toBe(500);
  });

  it("T2 — só junho no mapa: maio fica sem CMV, não herda junho", () => {
    const r = comparar({ "2026-06": { cmv: 500 } });
    expect(r.current.cmv.value).toBe(500);
    expect(r.current.availability.cmv).toBe("manual");
    expect(r.previous.cmv.value).toBeNull();
    expect(r.previous.availability.cmv).toBe("unavailable");
  });

  it("T3 — só maio no mapa: junho fica sem CMV, não herda maio", () => {
    const r = comparar({ "2026-05": { cmv: 300 } });
    expect(r.previous.cmv.value).toBe(300);
    expect(r.previous.availability.cmv).toBe("manual");
    expect(r.current.cmv.value).toBeNull();
    expect(r.current.availability.cmv).toBe("unavailable");
  });

  it("T4 — cmv 0 em junho é valor real informado, e não escorrega para maio", () => {
    const r = comparar({ "2026-06": { cmv: 0 } });
    expect(r.current.cmv.value).toBe(0);
    expect(r.current.availability.cmv).toBe("manual"); // zero informado != ausência
    expect(r.current.profitability.grossProfit).toBe(2000); // receita líquida - 0
    expect(r.previous.cmv.value).toBeNull();
    expect(r.previous.availability.cmv).toBe("unavailable");
  });

  it("T5 — cmv 0 em junho com maio preenchido: 0 não é lido como ausência", () => {
    const r = comparar({ "2026-06": { cmv: 0 }, "2026-05": { cmv: 300 } });
    expect(r.current.cmv.value).toBe(0);
    expect(r.current.availability.cmv).toBe("manual");
    expect(r.previous.cmv.value).toBe(300);
    // O 0 de junho não silencia nem substitui o valor de maio.
    expect(r.previous.cmv.value).not.toBe(0);
  });

  it("T6 — sem mapa e com mapa vazio: comportamento idêntico ao anterior à C3", () => {
    const semMapa = comparar(undefined);
    const mapaVazio = comparar({});
    for (const r of [semMapa, mapaVazio]) {
      expect(r.current.cmv.value).toBeNull();
      expect(r.previous.cmv.value).toBeNull();
      expect(r.current.availability.cmv).toBe("unavailable");
      expect(r.previous.availability.cmv).toBe("unavailable");
      // Nenhum valor inventado nas linhas que dependem do CMV.
      expect(r.current.profitability.grossProfit).toBeNull();
      expect(r.current.profitability.ebitda).toBeNull();
      expect(r.current.profitability.netResult).toBeNull();
    }
  });

  it("T7 — com CMV manual e restantes fontes reais, derivados calculáveis e mixed", () => {
    const r = comparar({ "2026-06": { cmv: 500 } });
    expect(r.current.profitability.grossProfit).toBe(1500);
    expect(r.current.profitability.ebitda).toBe(1500);
    expect(r.current.profitability.netResult).toBe(1500);
    expect(r.current.availability.grossProfit).toBe("mixed");
    expect(r.current.availability.ebitda).toBe("mixed");
    expect(r.current.availability.netResult).toBe("mixed");
    // Sem CMV, as mesmas linhas continuam indisponíveis no outro mês.
    expect(r.previous.availability.grossProfit).toBe("unavailable");
    expect(r.previous.availability.ebitda).toBe("unavailable");
    expect(r.previous.availability.netResult).toBe("unavailable");
  });

  it("T8 — sem previousMonthKey: previous null, sem erro, mesmo com mapa presente", () => {
    const r = buildMetricsWithComparison({
      orders: ordersMJ, payables: [], monthKey: "2026-06",
      manualInputsByMonth: { "2026-06": { cmv: 500 }, "2026-05": { cmv: 300 } },
      coverage: COV, referenceDate: REF,
    });
    expect(r.previous).toBeNull();
    expect(r.comparable).toBe(false);
    expect(r.current.cmv.value).toBe(500);
  });
});