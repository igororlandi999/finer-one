/* ══════════════════════════════════════════════════════════════════════════════════
 * SEM DRE, O DIAGNÓSTICO CALA-SE — DECISÃO DE 28/08/2026
 * ══════════════════════════════════════════════════════════════════════════════════
 * `buildFinancialDiagnostic` tinha um ramo alcançável (`financialMetrics == null`) que
 * calculava:
 *
 *     resultado = receitas - contas a pagar
 *     margem    = resultado / receitas
 *
 * As duas fórmulas que os invariantes financeiros deste produto proíbem. O ramo era
 * alcançável a sério: `blingDataService` passa `financialMetrics: financeiro.metrics`,
 * e `metrics` é `comparacao ? comparacao.current : null` — sem comparação disponível,
 * `null`. Uma empresa sem CMV lançado via um "resultado" que não era o seu resultado,
 * afirmado no resumo executivo, na lista de problemas e no score.
 *
 * Estes testes provam as cinco fronteiras da decisão:
 *
 *   1. sem DRE não se afirma resultado económico;
 *   2. sem DRE não se afirma margem económica;
 *   3. as contas a pagar CONTINUAM presentes — como tesouraria e obrigações;
 *   4. com DRE, a DRE prevalece (controlo positivo: as asserções sabem falhar);
 *   5. um ZERO real da DRE continua a ser zero — nunca "indisponível".
 * ══════════════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFinancialDiagnostic } from "./diagnosticsEngine.js";
import { formatMoney } from "../lib/currency.js";

const HOJE = new Date(2026, 6, 15, 12, 0, 0); // 15 Jul 2026 — mês âncora: julho
const iso = (y, m, d) => new Date(y, m, d).toISOString();

const order = ({ id, m, d, total, cliente = "Cliente A", cid = 1 }) => ({
  id, date: iso(2026, m, d), total, status: "recebida",
  client: { id: cid, name: cliente }, items: [],
});
const payable = ({ id, situacao = 2, m, d, valor, saldo, categoria = "Compras", forn = "Forn A" }) => ({
  id, situacao,
  vencimento: iso(2026, m, d), dataEmissao: iso(2026, m, d),
  valor, saldo, categoriaNome: categoria, contato: { id, nome: forn },
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

/** Todo o texto que o diagnóstico AFIRMA, num só string. Uma asserção que só olhasse
 *  para `resumoExecutivo` deixaria passar o mesmo número dentro de um problema. */
function tudoOQueAfirma(d) {
  return [
    d.resumoExecutivo,
    d.prioridadeMaxima,
    ...d.problemas.flatMap((p) => [p.titulo, p.descricao]),
    ...d.acoes.flatMap((a) => [a.titulo, a.descricao]),
    ...d.mudancasUltimoMes.flatMap((m) => [m.label, m.valor, m.detalhe]),
    ...d.penalizacoes.map((p) => p.motivo),
  ].join(" | ");
}

/* Só JULHO tem movimento: sem mês anterior não há `growth` nem `despDelta`, e a
 * rentabilidade fica isolada de qualquer outra penalização. */
const RECEITAS_JUL = 1000;
const PAGAR_JUL = 5000;
const orders = [order({ id: 1, m: 6, d: 3, total: RECEITAS_JUL })];
const payables = [payable({ id: 1, m: 6, d: 5, valor: PAGAR_JUL })];

/* O número que o ramo antigo produzia: 1000 - 5000 = -4000, e -400% de "margem". */
const PSEUDO_RESULTADO = RECEITAS_JUL - PAGAR_JUL;
const PSEUDO_MARGEM_PCT = (PSEUDO_RESULTADO / RECEITAS_JUL) * 100;

const fmDe = (netResult, netMarginPct, receitaLiquida = 900) => ({
  revenue: { net: receitaLiquida },
  profitability: { netResult, netMarginPct, availability: {} },
});

describe("sem DRE — nenhum resultado económico é afirmado", () => {
  it("não existe o problema de resultado negativo, mesmo com pagar > receber", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.problemas.some((p) => p.id === "pr-resultado")).toBe(false);
  });

  it("o score não é penalizado por um resultado que ninguém apurou", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    const motivos = d.penalizacoes.map((p) => p.motivo).join(" | ");
    expect(motivos).not.toMatch(/[Rr]esultado/);
  });

  it("o número `receitas - contas a pagar` não aparece em lado nenhum", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    expect(tudoOQueAfirma(d)).not.toContain(formatMoney(PSEUDO_RESULTADO));
  });

  it("a indisponibilidade é DITA, não omitida em silêncio", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.resumoExecutivo).toMatch(/não puderam ser apurados/);
    const nao = d.naoAvaliados.find((n) => n.dimensao === "rentabilidade");
    expect(nao).toBeTruthy();
    expect(nao.motivo).toMatch(/demonstração de resultados/i);
  });

  it("não há linha 'Resultado' no que mudou (a variação também não é apurável)", () => {
    const orders2 = [
      order({ id: 1, m: 5, d: 3, total: 8000 }),   // junho
      order({ id: 2, m: 6, d: 3, total: 1000 }),   // julho
    ];
    const payables2 = [
      payable({ id: 1, m: 5, d: 5, valor: 1000 }),
      payable({ id: 2, m: 6, d: 5, valor: 5000 }),
    ];
    const d = buildFinancialDiagnostic(orders2, payables2);
    expect(d.mudancasUltimoMes.some((m) => m.label === "Resultado")).toBe(false);
    // controlo: as linhas que SÃO apuráveis continuam lá
    expect(d.mudancasUltimoMes.some((m) => m.label === "Faturação")).toBe(true);
    expect(d.mudancasUltimoMes.some((m) => m.label === "Contas a pagar")).toBe(true);
  });
});

describe("sem DRE — nenhuma margem económica é afirmada", () => {
  /* Margem baixa mas positiva: o ramo antigo emitia `pr-margem` e penalizava 10 pontos.
   * 10000 de receita, 9500 a pagar => "margem" de 5%. */
  const ordersM = [order({ id: 1, m: 6, d: 3, total: 10000 })];
  const payablesM = [payable({ id: 1, m: 6, d: 5, valor: 9500 })];

  it("não existe o problema de margem reduzida", () => {
    const d = buildFinancialDiagnostic(ordersM, payablesM);
    expect(d.problemas.some((p) => p.id === "pr-margem")).toBe(false);
  });

  it("o score não é penalizado por uma margem que ninguém apurou", () => {
    const d = buildFinancialDiagnostic(ordersM, payablesM);
    expect(d.penalizacoes.map((p) => p.motivo).join(" | ")).not.toMatch(/[Mm]argem/);
  });

  /* A palavra "margem" PODE aparecer — é o que a frase de indisponibilidade diz. O que
   * não pode aparecer é um NÚMERO na mesma frase: isso seria afirmar um valor. */
  it("nenhuma percentagem de margem é escrita", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    const texto = tudoOQueAfirma(d);
    expect(texto).not.toMatch(/margem[^.|]*\d/i);
    expect(texto).not.toContain(String(Math.round(PSEUDO_MARGEM_PCT)));
  });
});

describe("sem DRE — as contas a pagar continuam disponíveis, como tesouraria", () => {
  const vencidas = [
    payable({ id: 9, situacao: 1, m: 3, d: 1, valor: 700, saldo: 700 }), // 01/04 < 15/07
  ];

  it("o total a pagar do mês é afirmado, e chamado pelo nome", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.resumoExecutivo).toContain("em contas a pagar");
    expect(d.resumoExecutivo).toContain(formatMoney(PAGAR_JUL));
    expect(d.resumoExecutivo).not.toMatch(/em despesas/);
  });

  it("os vencidos continuam a ser um problema e um impacto quantificado", () => {
    const d = buildFinancialDiagnostic(orders, vencidas);
    expect(d.problemas.some((p) => p.id === "pr-vencidas")).toBe(true);
    expect(d.impactIsQuantified).toBe(true);
    expect(d.impactBreakdown[0].id).toBe("contas-vencidas");
  });

  it("a concentração por categoria e por fornecedor continua a ser calculada", () => {
    const concentrado = [
      payable({ id: 1, m: 6, d: 5, valor: 9000, categoria: "Compras", forn: "F1" }),
      payable({ id: 2, m: 6, d: 6, valor: 1000, categoria: "Serviços", forn: "F2" }),
    ];
    const d = buildFinancialDiagnostic(orders, concentrado);
    expect(d.problemas.some((p) => p.id === "pr-conc-cat")).toBe(true);
    expect(d.problemas.some((p) => p.id === "pr-conc-forn")).toBe(true);
  });

  it("a faturação, que É um facto dos pedidos, continua a ser afirmada", () => {
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.resumoExecutivo).toContain(formatMoney(RECEITAS_JUL));
    expect(d.resumoExecutivo).toContain("faturou");
  });
});

/* ─── CONTROLO POSITIVO ────────────────────────────────────────────────────────────
 * Sem isto, os testes acima passariam também se `buildFinancialDiagnostic` devolvesse
 * um objeto vazio. Aqui exige-se que EXATAMENTE as mesmas asserções encontrem o que
 * procuravam, quando a DRE existe. */
describe("com DRE — a DRE prevalece, e as asserções acima sabem falhar", () => {
  it("resultado líquido negativo da DRE gera problema, penalização e frase", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(-4000, -400) });
    const pr = d.problemas.find((p) => p.id === "pr-resultado");
    expect(pr).toBeTruthy();
    expect(pr.descricao).toMatch(/resultado líquido/i);
    expect(d.penalizacoes.some((p) => p.motivo === "Resultado líquido do mês negativo")).toBe(true);
    expect(d.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(false);
  });

  it("margem líquida baixa da DRE gera problema e penalização", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(500, 5) });
    expect(d.problemas.some((p) => p.id === "pr-margem")).toBe(true);
    expect(d.penalizacoes.some((p) => p.motivo === "Margem líquida do mês abaixo de 10%")).toBe(true);
  });

  it("o valor da DRE é o que aparece — nunca o de `receitas - contas a pagar`", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(2500, 30) });
    const texto = tudoOQueAfirma(d);
    expect(texto).toContain(formatMoney(2500));
    expect(texto).not.toContain(formatMoney(PSEUDO_RESULTADO));
  });

  it("DRE presente mas INCOMPLETA cala-se com o motivo do CMV, não com o de falta de DRE", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(null, null) });
    expect(d.problemas.some((p) => p.id === "pr-resultado")).toBe(false);
    const nao = d.naoAvaliados.find((n) => n.dimensao === "rentabilidade");
    expect(nao.motivo).toMatch(/CMV/);
    expect(nao.motivo).not.toMatch(/demonstração de resultados/i);
  });
});

/* ─── A FRONTEIRA QUE ESTA DECISÃO NÃO PODE ATRAVESSAR ─────────────────────────────
 * "Zero real != indisponível" é o mesmo princípio que já governa `{"data":[]}` no BFF.
 * Um resultado líquido de ZERO é um facto apurado e tem de continuar a comportar-se
 * como um número, não como uma ausência. */
describe("zero real da DRE continua a ser zero, nunca indisponível", () => {
  it("netResult 0 é avaliável: não entra em naoAvaliados", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(0, 0) });
    expect(d.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(false);
  });

  it("netResult 0 com margem 0 penaliza a margem, como qualquer outro valor abaixo de 10%", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(0, 0) });
    expect(d.penalizacoes.some((p) => p.motivo === "Margem líquida do mês abaixo de 10%")).toBe(true);
  });

  it("netResult 0 NÃO é resultado negativo", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(0, 0) });
    expect(d.problemas.some((p) => p.id === "pr-resultado")).toBe(false);
    expect(d.penalizacoes.some((p) => p.motivo === "Resultado líquido do mês negativo")).toBe(false);
  });

  it("o zero é escrito no resumo executivo, com a linguagem da DRE", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(0, 0) });
    expect(d.resumoExecutivo).toContain(formatMoney(0));
    expect(d.resumoExecutivo).toContain("resultado líquido");
    expect(d.resumoExecutivo).not.toMatch(/não puderam ser apurados/);
  });

  it("margem 0 com resultado positivo real também é avaliada, não silenciada", () => {
    const d = buildFinancialDiagnostic(orders, payables, { financialMetrics: fmDe(10, 0) });
    expect(d.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(false);
    expect(d.problemas.some((p) => p.id === "pr-margem")).toBe(true);
  });
});
