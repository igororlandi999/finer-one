// Testes CARACTERIZADORES do acoplamento entre COBERTURA DE FONTE e VALIDAÇÃO HUMANA.
//
// ─── ESTADO: DEFEITO CORRIGIDO EM 24/08/2026 ────────────────────────────────────────
// Este ficheiro passou a documentar HISTÓRIA, não o presente. Continua a passar, e é
// isso que se quer dele agora: as suas asserções usam `closedThroughMonth`, o campo
// LEGADO, e provam duas coisas de uma vez —
//
//   1. o que o produto fazia quando um só campo respondia a duas perguntas;
//   2. que o alias legado continua a funcionar, para não partir configurações antigas.
//
// A produção deixou de usar esta forma: `config/company.js` declara agora
// `completeThroughMonth` (cobertura) e `validatedThroughMonth` (validação) em
// separado. O contrato que vigora está em `fechoContratoNovo.test.js`; o desenho em
// `docs/MONTHLY_CLOSING_CONTRACT.md`.
//
// Se um dia o alias legado for removido, é este ficheiro que deve cair primeiro — e
// deliberadamente, não por acidente.
//
// ─── O DEFEITO, EM UMA FRASE ────────────────────────────────────────────────────────
// `closedThroughMonth` responde hoje a DUAS perguntas distintas com um só valor:
//
//   A. "até que mês é que a FONTE tem dados completos?"     (cobertura, técnica)
//   B. "até que mês é que um HUMANO validou o fecho?"       (validação, contabilística)
//
// Enquanto forem o mesmo campo, existe um ciclo fechado:
//
//   julho > closedThroughMonth
//     -> sourceAvailability("2026-07") = "partial"          (dreEngine.js:218-219)
//     -> metrics.revenue.grossAvailability = "partial"
//     -> applicability do CMV = INDETERMINATE               (monthlyClosing.js)
//     -> item CMV = PENDING (não MISSING)
//     -> mês = INDETERMINATE, missingItems = []
//     -> "Dados a completar" não pede o CMV
//     -> ninguém consegue lançar o CMV
//     -> nada permite avançar closedThroughMonth
//     -> julho > closedThroughMonth  ... (volta ao início)
//
// A única saída é editar `src/config/company.js` à mão. Isto é o bug de arquitetura:
// **a configuração manual decide se o sistema pode sequer PEDIR o dado que falta.**
//
// A separação corrige-o sem tocar em nenhuma fórmula: a cobertura da fonte passa a
// dizer só o que a fonte sabe (os pedidos de julho estão todos cá), e a validação
// humana passa a ser um eixo próprio que NÃO silencia pendências.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import { buildMonthlyClosing, CLOSING_STATUS, ITEM_STATUS } from "./monthlyClosing.js";

/* ── Cenário fiel ao de produção em 24/08/2026 ──────────────────────────────────────
 * Julho terminou, tem receita real, tem despesas, e NÃO tem CMV lançado. */
const NOW_AGOSTO = new Date(2026, 7, 24);   // 24/08/2026, local

const PEDIDOS_JULHO = [
  { id: 1, date: "2026-07-03", total: 100000, status: "recebida" },
  { id: 2, date: "2026-07-18", total: 72995.4, status: "em_aberto" },
];
const PAGAR_JULHO = [
  { id: 10, vencimento: "2026-07-10", dataEmissao: "2026-07-01", valor: 12000,
    categoriaNome: "Salários", situacao: 2 },
];

/** Cobertura tal como está hoje em company.js: julho FORA do limite de fecho. */
const COVERAGE_HOJE = {
  firstCompleteMonth: "2026-04",
  partialMonths: ["2026-03"],
  closedThroughMonth: "2026-06",
};

function fecharJulho(coverage, manualInputs) {
  const dre = buildMonthlyDre({
    orders: PEDIDOS_JULHO, payables: PAGAR_JULHO, monthKey: "2026-07",
    manualInputs, coverage,
  });
  return {
    metrics: buildFinancialMetrics(dre),
    closing: buildMonthlyClosing({
      monthKey: "2026-07",
      metrics: buildFinancialMetrics(dre),
      now: NOW_AGOSTO,
      coverage,
    }),
  };
}

describe("DEFEITO: cobertura de fonte silencia a pendência de CMV", () => {
  it("julho tem receita real na origem — os pedidos estão todos no snapshot", () => {
    // A prova de que o problema NÃO é falta de dados: a receita bruta está lá, inteira.
    const { metrics } = fecharJulho(COVERAGE_HOJE);
    expect(metrics.revenue.gross).toBe(172995.4);
  });

  it("mas closedThroughMonth marca essa receita como 'partial'", () => {
    const { metrics } = fecharJulho(COVERAGE_HOJE);
    // Nada na FONTE é parcial. É a configuração manual que o declara.
    expect(metrics.revenue.grossAvailability).toBe("partial");
  });

  it("e por isso o CMV de julho fica PENDING em vez de MISSING", () => {
    const { closing } = fecharJulho(COVERAGE_HOJE);
    const cmv = closing.items.find((i) => i.key === "cmv");
    expect(cmv.status).toBe(ITEM_STATUS.PENDING);
  });

  it("julho fica INDETERMINATE e sem uma única pendência acionável", () => {
    const { closing } = fecharJulho(COVERAGE_HOJE);
    expect(closing.status).toBe(CLOSING_STATUS.INDETERMINATE);
    // ESTA é a linha que descreve o bug de produto: não há o que pedir ao utilizador.
    expect(closing.missingItems).toEqual([]);
  });

  it("o ciclo só se quebra editando company.js à mão", () => {
    // Exatamente a mesma fonte, exatamente o mesmo mês. Só muda a config manual.
    const { closing } = fecharJulho({ ...COVERAGE_HOJE, closedThroughMonth: "2026-07" });
    expect(closing.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(closing.missingItems.map((i) => i.key)).toEqual(["cmv"]);
    // Ou seja: o dado que falta é o MESMO nos dois casos. O que muda é se a Finer One
    // se autoriza a pedi-lo — e isso não pode depender de uma edição de código.
  });
});
