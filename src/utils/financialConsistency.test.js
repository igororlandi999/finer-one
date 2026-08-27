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
/** O mesmo mes, na grafia que o produto mostra ao utilizador. */
const MES_LABEL = "junho de 2026";

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
    // Valores da política F3: o frete cobrado ao cliente está dentro do order.total
    // e NÃO é dedução da receita. Antes desta política eram 175.566,72 / 522,50 /
    // 51.120,34 — a diferença é exatamente os 3.097,80 de frete que se abatiam.
    expect(metrics.revenue.net).toBe(178664.52);
    expect(metrics.profitability.netResult).toBe(3620.30);
    expect(metrics.profitability.ebitda).toBe(54218.14);
  });

  it("Diagnóstico usa o MESMO resultado líquido e o MESMO mês", () => {
    const diag = buildFinancialDiagnostic(orders, payables, {
      financialMetrics: metrics, monthKey: MES,
    });
    // o resumo executivo cita o resultado líquido da DRE, não receitas - payables
    expect(diag.resumoExecutivo).toContain("3.620,30");
    expect(diag.resumoExecutivo).toContain("178.664,52");
    // e nunca a pseudo-margem antiga
    expect(diag.resumoExecutivo).not.toMatch(/com um resultado de/);
  });

  it("Alertas: junho saudável não gera qualquer alerta financeiro", () => {
    const alertas = buildFinancialAlerts({ financialMetrics: metrics, monthKey: MES });
    expect(alertas.some((a) => a.id === "f-resultado")).toBe(false); // 3.620,30 é positivo
    expect(alertas.some((a) => a.id === "f-ebitda")).toBe(false);    // EBITDA 54.218,14 é positivo
    // Não existe alerta de margem líquida: ela é apurada após as retiradas dos
    // sócios, pelo que 2,03% aqui NÃO significa baixa rentabilidade operacional
    // (a margem EBITDA do mesmo mês é de ~30%).
    expect(alertas.some((a) => a.id === "f-margem")).toBe(false);
    expect(alertas).toEqual([]);
  });

  it("a margem EBITDA de junho mostra a rentabilidade operacional real", () => {
    expect(metrics.profitability.ebitdaMarginPct).toBeCloseTo(30.35, 2);
    expect(metrics.profitability.netMarginPct).toBeCloseTo(2.03, 2);
    // as retiradas explicam a diferença entre as duas margens
    expect(metrics.withdrawals.total).toBe(50597.84);
  });

  it("Chat responde o MESMO resultado líquido e a MESMA margem", () => {
    const sales = { financeiro: { monthKey: MES, metrics, previous: null, comparable: false, emCurso: null } };
    const res = answerQuestion("qual foi o meu resultado?", sales);
    expect(res.content).toContain("3.620,30");
    /* O Chat nomeia o mes por EXTENSO ("junho de 2026"), como a Performance e o Resumo.
     * Escrevia a chave crua ("2026-06") — a forma como a base de dados fala, nao a
     * forma como se responde a um empresario. O mes tem de ser o mesmo; a grafia e
     * que passou a ser a do produto. */
    expect(res.content).toContain(MES_LABEL);
    expect(res.content).not.toContain(MES);

    const mar = answerQuestion("qual a minha margem?", sales);
    expect(mar.content).toContain("2,03%");
  });

  it("os quatro módulos concordam no mês de referência", () => {
    const diag = buildFinancialDiagnostic(orders, payables, { financialMetrics: metrics, monthKey: MES });
    const alertas = buildFinancialAlerts({ financialMetrics: metrics, monthKey: MES });
    const sales = { financeiro: { monthKey: MES, metrics, previous: null, comparable: false, emCurso: null } };
    const chat = answerQuestion("qual foi o meu resultado?", sales);

    expect(metrics.monthKey).toBe(MES);
    /* O resumo executivo passou a NOMEAR o mês (24/08/2026). A asserção anterior exigia
     * a perífrase "mês de referência" — que era exatamente o defeito: o motor sabia qual
     * era o mês e escrevia à volta dele. Exigir o nome é a versão forte deste teste:
     * antes, os quatro módulos podiam "concordar" sem que nenhum dissesse qual era. */
    expect(diag.resumoExecutivo).toContain(MES_LABEL);
    expect(diag.resumoExecutivo).not.toContain("No mês de referência");
    // sem alertas em junho, provamos o mês com um cenário de resultado negativo
    const alertasNeg = buildFinancialAlerts({
      financialMetrics: { ...metrics, profitability: { ...metrics.profitability, netResult: -100 } },
      monthKey: MES,
    });
    expect(alertasNeg.find((a) => a.id === "f-resultado").description).toContain(MES);
    expect(alertas).toEqual([]);
    expect(chat.content).toContain(MES_LABEL);
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