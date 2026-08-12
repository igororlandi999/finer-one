// src/utils/financialMetrics.js
// Camada central de métricas financeiras. Recebe a DRE do motor central e produz
// métricas empresariais normalizadas, para que Resumo, Diagnóstico e Score leiam
// todos a MESMA realidade financeira — em vez de cada um recalcular a sua.
//
// Regras inegociáveis (herdadas do dreEngine):
//   0 é valor real; null é ausência de fonte.
//   Nenhum rácio é inventado: se o numerador ou o denominador faltar, ou se o
//   denominador for zero, o rácio é null (nunca Infinity, nunca NaN).

import { round2 } from "./financialCalculations.js";
import {
  combineAvailability,
  availableDreMonths,
  revenueAvailability,
  buildMonthlyDre,
} from "./dreEngine.js";

/**
 * Rácio percentual seguro. null quando qualquer termo falta ou o denominador é 0.
 * (Denominador zero não é "0%": é uma divisão sem significado.)
 */
export function safePct(numerador, denominador) {
  if (numerador == null || denominador == null) return null;
  if (denominador === 0) return null;
  return round2((numerador / denominador) * 100);
}

/** Disponibilidade de um rácio: combina a das duas parcelas. */
function pctAvailability(availNum, availDen, valor) {
  if (valor == null) return "unavailable";
  return combineAvailability(availNum, availDen);
}

/**
 * Métricas empresariais a partir de uma DRE mensal.
 * @param {object|null} dre  resultado de buildMonthlyDre
 * @returns {object|null}
 */
export function buildFinancialMetrics(dre) {
  if (!dre) return null;
  const a = dre.availability || {};

  // ── Receita ──────────────────────────────────────────────
  const revenue = {
    gross: dre.receitaBruta,
    net: dre.receitaLiquida,
    availability: combineAvailability(a.receitaBruta, a.receitaLiquida),
    grossAvailability: a.receitaBruta,
    netAvailability: a.receitaLiquida,
  };

  const base = dre.receitaLiquida; // denominador de todas as margens e pesos

  // ── Deduções ─────────────────────────────────────────────
  const dedTotal = dre.totalDeducoes;
  const dedPct = safePct(dedTotal, dre.receitaBruta);
  const deductions = {
    total: dedTotal,
    pctOfGrossRevenue: dedPct,
    availability: a.totalDeducoes,
    pctAvailability: pctAvailability(a.totalDeducoes, a.receitaBruta, dedPct),
  };

  // ── CMV ──────────────────────────────────────────────────
  const cmvPct = safePct(dre.cmv, base);
  const cmv = {
    value: dre.cmv,
    pctOfNetRevenue: cmvPct,
    availability: a.cmv,
    pctAvailability: pctAvailability(a.cmv, a.receitaLiquida, cmvPct),
  };

  // ── Despesas operacionais ────────────────────────────────
  const opexPct = safePct(dre.despesasOperacionais, base);
  const operatingExpenses = {
    total: dre.despesasOperacionais,
    pctOfNetRevenue: opexPct,
    availability: a.despesasOperacionais,
    pctAvailability: pctAvailability(a.despesasOperacionais, a.receitaLiquida, opexPct),
  };

  // ── Rentabilidade ────────────────────────────────────────
  const grossMarginPct = safePct(dre.lucroBruto, base);
  const ebitdaMarginPct = safePct(dre.ebitda, base);
  const netMarginPct = safePct(dre.resultadoLiquido, base);

  const profitability = {
    grossProfit: dre.lucroBruto,
    grossMarginPct,
    ebitda: dre.ebitda,
    ebitdaMarginPct,
    netResult: dre.resultadoLiquido,
    netMarginPct,
    availability: {
      grossProfit: a.lucroBruto,
      grossMarginPct: pctAvailability(a.lucroBruto, a.receitaLiquida, grossMarginPct),
      ebitda: a.ebitda,
      ebitdaMarginPct: pctAvailability(a.ebitda, a.receitaLiquida, ebitdaMarginPct),
      netResult: a.resultadoLiquido,
      netMarginPct: pctAvailability(a.resultadoLiquido, a.receitaLiquida, netMarginPct),
    },
  };

  // ── Retiradas de sócios (fora das operacionais, por definição) ──
  const withdrawals = { total: dre.retiradasSocios, availability: a.retiradasSocios };

  return {
    monthKey: dre.monthKey,
    revenue,
    deductions,
    cmv,
    operatingExpenses,
    profitability,
    withdrawals,
    availability: {
      revenueGross: a.receitaBruta,
      revenueNet: a.receitaLiquida,
      deductions: a.totalDeducoes,
      cmv: a.cmv,
      operatingExpenses: a.despesasOperacionais,
      grossProfit: a.lucroBruto,
      ebitda: a.ebitda,
      netResult: a.resultadoLiquido,
      withdrawals: a.retiradasSocios,
    },
    warnings: dre.warnings || [],
  };
}

/* ====================================================================================
 * SELEÇÃO CENTRAL DO MÊS DE REFERÊNCIA.
 * Um só sítio decide o mês; os módulos não escolhem por conta própria.
 * ==================================================================================== */

/**
 * Último mês financeiramente utilizável.
 * @param {{orders, payables, coverage, referenceDate, allowPartial?: boolean}} args
 *   allowPartial=false (omissão): só meses FECHADOS — para métricas de fecho,
 *     diagnóstico e score. Ex.: com julho em curso, devolve junho.
 *   allowPartial=true: aceita o mês corrente em curso — para acompanhamento
 *     operacional (ex.: "julho em andamento" no Resumo).
 * @returns {string|null}
 */
export function latestUsableFinancialMonth({ orders, payables, coverage, referenceDate, allowPartial = false } = {}) {
  const meses = availableDreMonths({ orders, payables });
  for (let i = meses.length - 1; i >= 0; i--) {
    const disp = revenueAvailability(meses[i], coverage, referenceDate);
    if (disp === "real") return meses[i];
    if (allowPartial && disp === "partial") return meses[i];
  }
  return null;
}

/**
 * Dois períodos só são comparáveis quando ambos são conclusivos.
 * partial ou unavailable de qualquer lado => não comparável (um mês em curso não
 * se compara com um mês fechado sem produzir uma conclusão falsa).
 */
export function canComparePeriods(atual, anterior) {
  const ok = (a) => a != null && a !== "partial" && a !== "unavailable";
  return ok(atual) && ok(anterior);
}

/**
 * Métricas de um mês + do mês anterior, com a indicação de se são comparáveis.
 * Não produz variações: apenas entrega as duas fotografias e o veredito.
 */
export function buildMetricsWithComparison({ orders, payables, monthKey, previousMonthKey, manualInputs, coverage, referenceDate } = {}) {
  if (!monthKey) return null;
  const atual = buildFinancialMetrics(buildMonthlyDre({
    orders, payables, monthKey, manualInputs, coverage, referenceDate,
  }));
  const anterior = previousMonthKey
    ? buildFinancialMetrics(buildMonthlyDre({
        orders, payables, monthKey: previousMonthKey, manualInputs, coverage, referenceDate,
      }))
    : null;

  return {
    current: atual,
    previous: anterior,
    comparable: !!anterior && canComparePeriods(
      atual && atual.availability.revenueNet,
      anterior && anterior.availability.revenueNet
    ),
  };
}