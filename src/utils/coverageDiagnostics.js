// src/utils/coverageDiagnostics.js
// OBSERVABILIDADE DA COBERTURA DECLARADA — puro, read-only, sem UI e sem escrita.
//
// ─── O QUE ISTO NÃO FAZ ─────────────────────────────────────────────────────────────
// NÃO avança cobertura nenhuma, não deriva um limite novo e não altera `company.js`.
// Declarar que um mês de contas a pagar está completo é um facto CONTABILÍSTICO — "já
// entraram todas as faturas desse mês" — e nenhum campo do snapshot o sabe (ver
// docs/SOURCE_COVERAGE_CONTRACT.md §3). Derivá-lo automaticamente seria inventar.
//
// ─── O QUE FAZ ──────────────────────────────────────────────────────────────────────
// Responde a uma pergunta mecânica, que o calendário resolve sozinho:
//
//   "Há meses civis já encerrados que a cobertura declarada ainda não alcança?"
//
// Em 24/08/2026, com `payables.completeThroughMonth: "2026-06"`, a resposta é sim: julho
// terminou e continua fora da cobertura. Isso não é um erro — pode ser exatamente a
// verdade, se as faturas de julho ainda não chegaram todas. Mas até agora era
// INVISÍVEL: uma configuração esquecida durante meses tinha o mesmo aspeto de uma
// configuração conservadora e correta, e a única consequência observável era o mês
// nunca chegar a âncora dos KPIs, sem que nada explicasse porquê.
//
// ─── UM LIMITE DERIVADO NUNCA ENVELHECE ─────────────────────────────────────────────
// `completeThroughMonth: null` significa "deriva do relógio" e acompanha o calendário
// sozinho. Só um limite ESCRITO À MÃO pode ficar para trás — e por isso só esse é
// assinalado. Confundir os dois faria a fonte dos pedidos, que não precisa de
// manutenção nenhuma, aparecer eternamente como precisando de revisão.

import { monthKeyOf } from "./dreEngine.js";

/** Mês anterior a uma chave "aaaa-mm". Aritmética com Date local: a viragem de ano
 *  resolve-se sozinha e não há `new Date("aaaa-mm")`, que seria lido como UTC. */
function mesAnterior(mk) {
  if (!mk) return null;
  const [y, m] = String(mk).split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m)) return null;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Distância em meses entre duas chaves "aaaa-mm". Negativa se `ate` for anterior. */
function distanciaMeses(de, ate) {
  if (!de || !ate) return null;
  const [ya, ma] = String(de).split("-").map(Number);
  const [yb, mb] = String(ate).split("-").map(Number);
  if ([ya, ma, yb, mb].some((n) => !Number.isInteger(n))) return null;
  return (yb - ya) * 12 + (mb - ma);
}

/**
 * Diagnóstico de UMA fonte.
 *
 * @returns {{declared: string|null, derived: boolean, effectiveThroughMonth: string|null,
 *            lastClosedCivilMonth: string|null, coverageLagMonths: number,
 *            coverageNeedsReview: boolean}}
 */
function diagnosticarFonte(declarado, ultimoCivilEncerrado) {
  const derivado = !declarado;
  const efetivo = declarado || ultimoCivilEncerrado;

  /* Um limite derivado acompanha o calendário: o atraso é sempre 0, por construção.
   * Calculá-lo à mesma e depois ignorá-lo daria a dois caminhos a hipótese de
   * divergirem no dia em que um deles for tocado. */
  const atraso = derivado ? 0 : Math.max(0, distanciaMeses(efetivo, ultimoCivilEncerrado) ?? 0);

  return {
    // O que está escrito na configuração. `null` = deriva do relógio.
    declared: declarado || null,
    derived: derivado,
    // O limite que o motor de disponibilidade vai mesmo usar.
    effectiveThroughMonth: efetivo || null,
    lastClosedCivilMonth: ultimoCivilEncerrado || null,
    /* Quantos meses civis JÁ ENCERRADOS ficam para lá da cobertura declarada. 0 quando
     * a cobertura está em dia — ou quando é derivada, que nunca envelhece. */
    coverageLagMonths: atraso,
    /* Sinal para humanos, não para o motor: NADA na disponibilidade muda por causa
     * deste booleano. Diz apenas "vale a pena alguém confirmar se estes meses já
     * fecharam" — que é precisamente a pergunta que só uma pessoa pode responder. */
    coverageNeedsReview: atraso > 0,
  };
}

/**
 * Diagnóstico da cobertura declarada, por fonte.
 *
 * @param {{coverage?: object|null, referenceDate?: Date}} args
 * @returns {null|{lastClosedCivilMonth: string|null, orders: object, payables: object,
 *                 anyNeedsReview: boolean, maxLagMonths: number}}
 *   `null` sem data de referência: sem relógio não há calendário contra o qual medir,
 *   e um atraso inventado seria pior do que nenhum.
 */
export function buildCoverageDiagnostics({ coverage, referenceDate } = {}) {
  const mesAtual = monthKeyOf(referenceDate);
  if (!mesAtual) return null;
  const ultimoCivilEncerrado = mesAnterior(mesAtual);

  const cov = coverage || {};
  /* `closedThroughMonth` é lido como alias legado, exatamente como sourceAvailability o
   * faz. Um diagnóstico que ignorasse o alias descreveria uma cobertura diferente da
   * que o motor usa — e seriam duas verdades sobre a mesma configuração. */
  const declaradoPedidos = cov.completeThroughMonth || cov.closedThroughMonth || null;
  const declaradoPayables = (cov.payables && (cov.payables.completeThroughMonth || cov.payables.closedThroughMonth))
    || declaradoPedidos;

  const orders = diagnosticarFonte(declaradoPedidos, ultimoCivilEncerrado);
  const payables = diagnosticarFonte(declaradoPayables, ultimoCivilEncerrado);

  return {
    lastClosedCivilMonth: ultimoCivilEncerrado,
    orders,
    payables,
    anyNeedsReview: orders.coverageNeedsReview || payables.coverageNeedsReview,
    maxLagMonths: Math.max(orders.coverageLagMonths, payables.coverageLagMonths),
  };
}
