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
  monthKeyOf,
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
      /* COBERTURA TEMPORAL isolada das contas a pagar — aditivo, nenhum consumidor
       * existente muda de comportamento por existir.
       *
       * `operatingExpenses` combina DOIS factos: o período fechou na fonte, e a
       * natureza dos títulos é conhecida. Quem só precise do primeiro (para dizer ao
       * utilizador se o que falta é tempo ou classificação) tinha de o inferir da
       * linha combinada — ou seja, adivinhar. É o sinal que financialCompleteness
       * usa para decompor a causa da parcialidade. */
      payablesCoverage: a.coberturaPayables,
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
 *
 * ─── TETO CIVIL (P0.3) ──────────────────────────────────────────────────────────────
 * Meses POSTERIORES ao mês civil de referência nunca são candidatos, seja qual for a
 * cobertura. Um mês que ainda não começou não está fechado nem está "em curso": não é
 * utilizável em nenhum dos dois sentidos que esta função serve.
 *
 * Sem este teto, `allowPartial: true` devolvia o mês mais TARDIO presente nos dados —
 * e os dados contêm meses futuros que não representam atividade nenhuma: uma conta a
 * pagar com vencimento em 2027-07 cria a chave "2027-07" em `availableDreMonths`. Em
 * 23/08/2026, com `closedThroughMonth` CORRETO, o Resumo exibia «2027-07 em andamento».
 * Um vencimento futuro é uma obrigação futura, não um mês de atividade em curso.
 *
 * O teto NÃO substitui a cobertura nem afrouxa o critério de mês fechado: só remove
 * candidatos que a cobertura, sozinha, não conseguia eliminar. Com uma cobertura bem
 * declarada, o mês fechado escolhido é exatamente o mesmo de antes desta correção.
 */
export function latestUsableFinancialMonth({ orders, payables, coverage, referenceDate, allowPartial = false } = {}) {
  const meses = availableDreMonths({ orders, payables });

  /* Fronteira do relógio. `referenceDate` continua a ser o caminho preferido e é o que
   * os testes injetam; a leitura de `new Date()` existe porque a alternativa — deixar o
   * teto por aplicar quando ninguém injeta data — reintroduziria exatamente o defeito
   * que este teto corrige, e é esse o caminho que produção percorre hoje. */
  const tetoCivil = monthKeyOf(referenceDate || new Date());

  for (let i = meses.length - 1; i >= 0; i--) {
    const mk = meses[i];
    if (tetoCivil && mk > tetoCivil) continue;   // mês futuro: nunca utilizável
    const disp = revenueAvailability(mk, coverage, referenceDate);
    if (disp === "real") return mk;
    if (allowPartial && disp === "partial") return mk;
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
 *
 * INPUTS MANUAIS SÃO POR MÊS.
 * `manualInputsByMonth` é um mapa { "aaaa-mm": { cmv?: number } }. Cada mês recebe
 * EXCLUSIVAMENTE a sua própria entrada; um mês ausente do mapa fica sem input manual
 * (=> CMV null / unavailable) e nunca herda o valor de outro mês.
 *
 * O parâmetro singular `manualInputs` foi REMOVIDO desta função de propósito: era um
 * só objeto aplicado aos dois meses, pelo que um CMV informado apenas para junho
 * contaminava maio. `buildMonthlyDre` continua a receber `manualInputs` porque
 * representa um único mês, onde o contrato singular é o correto.
 */
export function buildMetricsWithComparison({ orders, payables, monthKey, previousMonthKey, manualInputsByMonth, coverage, referenceDate } = {}) {
  if (!monthKey) return null;
  // Ausência de mapa => ausência de inputs manuais. Nunca um objeto partilhado.
  const manuaisPorMes = manualInputsByMonth || {};
  const atual = buildFinancialMetrics(buildMonthlyDre({
    orders, payables, monthKey, manualInputs: manuaisPorMes[monthKey], coverage, referenceDate,
  }));
  const anterior = previousMonthKey
    ? buildFinancialMetrics(buildMonthlyDre({
        orders, payables, monthKey: previousMonthKey,
        manualInputs: manuaisPorMes[previousMonthKey], coverage, referenceDate,
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