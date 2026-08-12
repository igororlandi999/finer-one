// Teste de consistência entre módulos.
//
// Objetivo: impedir a regressão para "múltiplas verdades". Para a MESMA fixture,
// financialMetrics (Performance/Resumo), Diagnóstico, Alertas e Chat têm de
// interpretar o mesmo resultado líquido, a mesma margem líquida e o mesmo mês.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import { buildFinancialDiagnostic } from "./diagnosticsEngine.js";
import { buildFinancialAlerts } from "./alertsEngine.js";
import { answerQuestion } from "./chatEngine.js";

// ── Fixture de junho da Overcel (a mesma de todas as fases) ──
const REF = new Date(2026, 6, 15);
const COV = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"], closedThroughMonth: "2026-06" };
const MES = "2026-06";

const order = (id, dateISO, total, extra = {}) => ({
  id: String(id), date: dateISO, total, status: "recebida",
  client: { id: 1, name: "Cliente A" }, items: [], ...extra,
});
const pay = (id, categoriaNome, valor, vencimento, historico = null) => ({
  id, categoriaNome, valor, historico, vencimento, situacao: 2, contato: { id: 1, nome: "F" },
});

const orders = [
  order(1, "2026-06-05", 100000.00, { frete: 1500.00 }),
  order(2, "2026-06-12", 60000.00, { frete: 1000.00 }),
  order(3, "2026-06-25", 46227.15, { frete: 597.80 }),
  order(4, "2026-05-20", 90000.00, { frete: 500.00 }), // mês anterior
];
const payables = [
  pay(1, "Comissão sobre vendas", 1144.93, "2026-06-10"),
  pay(2, "Impostos sobre vendas", 26417.70, "2026-06-20"),
  pay(3, "Salários", 2800.00, "2026-06-05"),
  pay(4, "Aluguel", 2425.90, "2026-06-08"),
  pay(5, "Software", 500.00, "2026-06-09"),
  pay(6, "Tarifa bancária", 180.78, "2026-06-11"),
  pay(7, "Serviços de terceiros", 2500.00, "2026-06-12"),
  pay(8, "Pró-labore", 50597.84, "2026-06-15", "Adiantamento de dividendos"),
];

// Uma única DRE alimenta todos os módulos — é esse o ponto.
const dre = buildMonthlyDre({
  orders, payables, monthKey: MES,
  manualInputs: { cmv: 116039.70 }, coverage: COV, referenceDate: REF,
});
const metrics = buildFinancialMetrics(dre);

describe("Consistência entre módulos — uma só verdade financeira", () => {
  it("a fixture continua a fechar nos valores de referência", () => {
    expect(metrics.revenue.net).toBe(175566.72);
    expect(metrics.profitability.netResult).toBe(522.50);
    expect(metrics.profitability.ebitda).toBe(51120.34);
  });

  it("Diagnóstico usa o MESMO resultado líquido e o MESMO mês", () => {
    const diag = buildFinancialDiagnostic(orders, payables, {
      financialMetrics: metrics, monthKey: MES,
    });
    // o resumo executivo cita o resultado líquido da DRE, não receitas - payables
    expect(diag.resumoExecutivo).toContain("522,50");
    expect(diag.resumoExecutivo).toContain("175.566,72");
    // e nunca a pseudo-margem antiga
    expect(diag.resumoExecutivo).not.toMatch(/com um resultado de/);
  });

  it("Alertas: junho saudável não gera qualquer alerta financeiro", () => {
    const alertas = buildFinancialAlerts({ financialMetrics: metrics, monthKey: MES });
    expect(alertas.some((a) => a.id === "f-resultado")).toBe(false); // 522,50 é positivo
    expect(alertas.some((a) => a.id === "f-ebitda")).toBe(false);    // EBITDA 51.120,34 é positivo
    // Não existe alerta de margem líquida: ela é apurada após as retiradas dos
    // sócios, pelo que 0,3% aqui NÃO significa baixa rentabilidade operacional
    // (a margem EBITDA do mesmo mês é de ~29%).
    expect(alertas.some((a) => a.id === "f-margem")).toBe(false);
    expect(alertas).toEqual([]);
  });

  it("a margem EBITDA de junho mostra a rentabilidade operacional real", () => {
    expect(metrics.profitability.ebitdaMarginPct).toBeCloseTo(29.12, 2);
    expect(metrics.profitability.netMarginPct).toBeCloseTo(0.30, 2);
    // as retiradas explicam a diferença entre as duas margens
    expect(metrics.withdrawals.total).toBe(50597.84);
  });

  it("Chat responde o MESMO resultado líquido e a MESMA margem", () => {
    const sales = { financeiro: { monthKey: MES, metrics, previous: null, comparable: false, emCurso: null } };
    const res = answerQuestion("qual foi o meu resultado?", sales);
    expect(res.content).toContain("522,50");
    expect(res.content).toContain(MES);

    const mar = answerQuestion("qual a minha margem?", sales);
    expect(mar.content).toContain("0,3%");
  });

  it("os quatro módulos concordam no mês de referência", () => {
    const diag = buildFinancialDiagnostic(orders, payables, { financialMetrics: metrics, monthKey: MES });
    const alertas = buildFinancialAlerts({ financialMetrics: metrics, monthKey: MES });
    const sales = { financeiro: { monthKey: MES, metrics, previous: null, comparable: false, emCurso: null } };
    const chat = answerQuestion("qual foi o meu resultado?", sales);

    expect(metrics.monthKey).toBe(MES);
    expect(diag.resumoExecutivo).toContain("mês de referência");
    // sem alertas em junho, provamos o mês com um cenário de resultado negativo
    const alertasNeg = buildFinancialAlerts({
      financialMetrics: { ...metrics, profitability: { ...metrics.profitability, netResult: -100 } },
      monthKey: MES,
    });
    expect(alertasNeg.find((a) => a.id === "f-resultado").description).toContain(MES);
    expect(alertas).toEqual([]);
    expect(chat.content).toContain(MES);
  });

  it("sem CMV, TODOS se calam sobre o resultado — nenhum inventa um número", () => {
    const dreSemCmv = buildMonthlyDre({ orders, payables, monthKey: MES, coverage: COV, referenceDate: REF });
    const m2 = buildFinancialMetrics(dreSemCmv);
    expect(m2.profitability.netResult).toBeNull();

    const diag = buildFinancialDiagnostic(orders, payables, { financialMetrics: m2, monthKey: MES });
    expect(diag.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(true);
    expect(diag.problemas.some((p) => p.id === "pr-resultado" || p.id === "pr-margem")).toBe(false);

    expect(buildFinancialAlerts({ financialMetrics: m2, monthKey: MES })).toEqual([]);

    const sales = { financeiro: { monthKey: MES, metrics: m2, previous: null, comparable: false, emCurso: null } };
    const chat = answerQuestion("qual foi o meu resultado?", sales);
    expect(chat.content).toContain("não pode ser apurado");
  });

  it("nenhum módulo apresenta valores em euros para a Overcel", () => {
    const diag = buildFinancialDiagnostic(orders, payables, { financialMetrics: metrics, monthKey: MES });
    const alertas = buildFinancialAlerts({
      financialMetrics: { ...metrics, profitability: { ...metrics.profitability, netResult: -100 } },
      monthKey: MES,
    });
    const sales = { financeiro: { monthKey: MES, metrics, previous: null, comparable: false, emCurso: null } };
    const chat = answerQuestion("qual foi o meu resultado?", sales);

    const textos = [
      diag.resumoExecutivo,
      ...alertas.map((a) => a.description),
      chat.content,
    ].join(" ");
    expect(textos).toContain("R$");
    expect(textos).not.toContain("€");
  });
});