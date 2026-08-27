// src/utils/coverageConfirmationView.js
// Camada APRESENTACIONAL da confirmação de cobertura das despesas. Puro, sem JSX, sem
// rede: mesmo padrão de completionDataView, closingSummaryView e manualInputsView — a
// página desenha, este módulo decide o que há para dizer.
//
// ─── DUAS COISAS DIFERENTES NO MESMO ECRÃ ───────────────────────────────────────────
// "Dados a completar" passa a ter dois tipos de pendência, e a diferença entre elas é a
// razão de este módulo existir em vez de se acrescentar uma linha ao outro:
//
//   INFORMAR   — o utilizador tem um VALOR que a plataforma não conhece.  (CMV)
//                CTA: "Introduzir valor".
//   CONFIRMAR  — a plataforma tem um ESTADO que não consegue apurar sozinha, e só quem
//                conhece a operação o pode afirmar.                        (cobertura)
//                CTA: "Confirmar cobertura".
//
// Misturar as duas na mesma lista faria a cobertura parecer um campo por preencher, e um
// utilizador que procurasse "o valor da cobertura de julho" não o encontraria — porque
// não existe. Não há valor nenhum a introduzir: há um facto a afirmar.
//
// ─── O QUE ESTE ECRÃ NUNCA PODE DIZER ───────────────────────────────────────────────
// Nem "as despesas estão corretas", nem "o mês está fechado", nem "a contabilidade está
// validada". A afirmação que se pede é estritamente esta, e está escrita por extenso na
// caixa de confirmação:
//
//   "Confirmo que, até onde sei, os documentos relevantes de despesas de <mês> já estão
//    disponíveis para análise."

import { monthLongLabel } from "./performanceCalculations.js";
import { COVERAGE_SOURCE } from "./manualCoverage.js";

/** Estados do cartão. Poucos, e cada um com uma frase própria. */
export const COVERAGE_CARD = {
  /** Há um mês encerrado cuja cobertura ninguém confirmou. É a pendência. */
  POR_CONFIRMAR: "por_confirmar",
  /** A cobertura já alcança o último mês encerrado. Nada a pedir. */
  EM_DIA: "em_dia",
  /** A fonte declarou-se incompleta: confirmar não resolveria nada, e pedi-lo seria
   *  mandar o utilizador afirmar uma coisa que o sistema sabe ser falsa. */
  BLOQUEADO_POR_SNAPSHOT: "bloqueado_por_snapshot",
  /** Sem dados reais: não há cobertura sobre a qual falar. */
  INDISPONIVEL: "indisponivel",
  /**
   * Há a pendência, e QUEM ESTÁ A VER não a pode resolver. Tipicamente um `viewer`:
   * contabilista externo, sócio, investidor.
   *
   * ─── PORQUE ISTO É UM ESTADO E NÃO UM `null` ──────────────────────────────────────
   * Devolver `null` esconderia o cartão por inteiro, e esconder é a resposta errada
   * para este papel em concreto. Um contabilista externo que veja "a cobertura das
   * despesas de julho está por confirmar" tem exatamente a informação de que precisa:
   * é o aviso de que a análise do mês está incompleta e de que alguém com acesso de
   * gestão tem de agir. Apagar-lhe o cartão fá-lo-ia ler os números de julho como
   * definitivos, sem nada no ecrã a dizer que não são.
   *
   * `viewer` é um papel de LEITURA, não um papel de menos informação. O que se remove é
   * a AÇÃO, e diz-se porquê.
   */
  POR_CONFIRMAR_SEM_PERMISSAO: "por_confirmar_sem_permissao",
};

/** "julho de 2026" -> "Julho de 2026". */
function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * O cartão de confirmação de cobertura, pronto a desenhar.
 *
 * @param {object} args
 * @param {object|null} [args.sales]
 * @param {string} [args.source]
 * @param {boolean} [args.canWrite=true]  A UI deve oferecer a AÇÃO de confirmar?
 *   Vem de `uiCan(CAPABILITIES.WRITE_FINANCIAL_STATE)` — ver `auth/uiPermissions.js`.
 *
 *   ─── PORQUE O DEFAULT É `true` NUM PROJETO QUE NEGA POR OMISSÃO ───────────────────
 *   Porque este módulo é APRESENTAÇÃO e não autorização, e o default tem de preservar o
 *   comportamento de quem já o chama. A barreira que conta é dupla e nenhuma das metades
 *   é aqui: `uiCan` decide se se oferece, e o BFF recusa 403 a um `viewer` que force o
 *   pedido. Um default `false` aqui não acrescentaria segurança nenhuma — só faria o
 *   cartão desaparecer em qualquer chamada que se esquecesse do argumento, incluindo os
 *   testes existentes desta camada.
 *
 *   O que impede o esquecimento é um TESTE que lê o código de `AjustesManuais.jsx` e
 *   falha se a página deixar de passar `canWrite` (`permissoesUI.test.js`). É o mesmo
 *   padrão de `moedaCentralizada.test.js`: a disciplina que importa é a que falha sozinha.
 *
 * @returns {null|{
 *   state, monthKey, monthLabel, titulo, explicacao, cta, confirmText,
 *   contexto: Array<{rotulo: string, valor: string}>, origem: object|null,
 *   readOnly: boolean
 * }}  `null` quando não há nada a mostrar — a secção não existe, em vez de existir vazia.
 */
export function buildCoverageConfirmationCard({ sales, source, canWrite = true } = {}) {
  if (source !== "api" || !sales) return null;

  const diag = sales.financeiro?.coverageDiagnostics ?? null;
  const origem = sales.coverageOrigem ?? null;
  const alvo = diag?.lastClosedCivilMonth ?? null;
  if (!alvo) return null;

  const snapshotParcial = sales.coverage?.payables?.snapshotPartial === true;
  const precisa = diag?.payables?.coverageNeedsReview === true;

  /* ── CONTEXTO ANTES DA DECISÃO ────────────────────────────────────────────────────
   * Pedir uma confirmação sem mostrar sobre o quê é pedir uma assinatura em branco.
   * Todos estes números já existem no dataset: nada é recalculado aqui. */
  const classificacao = (sales.despesas?.porClassificar || []).find((c) => c.monthKey === alvo) || null;
  const contexto = [];

  const titulosDoMes = classificacao?.totalRelevantAmount;
  if (typeof titulosDoMes === "number") {
    contexto.push({ rotulo: "Valor conhecido no mês", valor: titulosDoMes, tipo: "moeda" });
  }
  if (classificacao && classificacao.unclassifiedCount > 0) {
    contexto.push({
      rotulo: "Títulos por classificar",
      valor: classificacao.unclassifiedCount,
      tipo: "contagem",
      /* O peso, sem veredito. Não existe limiar de materialidade neste produto e esta
       * frase não pode sugerir um: diz-se quanto é, não se diz se é pouco. */
      detalhe: classificacao.unclassifiedRatio != null
        ? `${String(classificacao.unclassifiedRatio).replace(".", ",")}% dos títulos do mês`
        : null,
    });
  }
  if (sales.meta?.geradoEm) {
    contexto.push({ rotulo: "Última atualização dos dados", valor: sales.meta.geradoEm, tipo: "data" });
  }
  contexto.push({
    rotulo: "Estado do snapshot",
    valor: snapshotParcial ? "Incompleto" : "Completo",
    tipo: "texto",
  });

  const base = {
    monthKey: alvo,
    monthLabel: monthLongLabel(alvo),
    contexto,
    origem,
    /* `readOnly` é o que a página lê para decidir se desenha o botão. Fica no cartão —
     * e não só no `state` — para que nenhum estado futuro possa acrescentar uma ação sem
     * passar por esta bandeira. */
    readOnly: canWrite !== true,
  };

  /* A fonte declarou-se incompleta. Confirmar não teria efeito nenhum — `sourceAvailability`
   * veta antes de olhar para a cobertura — e oferecer o botão seria oferecer uma ação
   * que não faz o que promete. */
  if (snapshotParcial) {
    return {
      ...base,
      state: COVERAGE_CARD.BLOQUEADO_POR_SNAPSHOT,
      titulo: "Cobertura das despesas",
      explicacao:
        "A última leitura das contas a pagar não chegou ao fim, por isso ainda faltam títulos por carregar. " +
        "Confirmar a cobertura agora não tornaria a análise mais completa. A próxima atualização automática resolve isto.",
      cta: null,
      confirmText: null,
    };
  }

  if (!precisa) {
    return {
      ...base,
      state: COVERAGE_CARD.EM_DIA,
      titulo: "Cobertura das despesas",
      explicacao: origem?.source === COVERAGE_SOURCE.USER
        ? `A cobertura das despesas alcança ${monthLongLabel(origem.completeThroughMonth)}, confirmada por si.`
        : `A cobertura das despesas alcança ${monthLongLabel(origem?.completeThroughMonth)}.`,
      cta: null,
      confirmText: null,
    };
  }

  /* ── HÁ PENDÊNCIA, E QUEM ESTÁ A VER NÃO A PODE RESOLVER ─────────────────────────
   * Diz-se o ESTADO (a análise do mês está incompleta) e retira-se a AÇÃO. Sem `cta`,
   * sem `confirmText` e sem `ressalva`: a frase que se afirma ao confirmar não tem razão
   * de aparecer a quem não vai confirmar nada, e mostrá-la sugeriria que há um passo por
   * dar aqui.
   *
   * Nenhum número é escondido — `contexto` é o mesmo. Um `viewer` vê tudo o que um
   * `owner` vê; o que não vê é o botão. */
  if (canWrite !== true) {
    return {
      ...base,
      state: COVERAGE_CARD.POR_CONFIRMAR_SEM_PERMISSAO,
      titulo: "Cobertura das despesas por confirmar",
      explicacao:
        `A Finer One ainda não sabe se todos os documentos relevantes de despesas de ` +
        `${monthLongLabel(alvo)} já estão disponíveis, por isso trata o mês como incompleto. ` +
        `A confirmação é feita por quem tem acesso de gestão a esta empresa.`,
      cta: null,
      confirmText: null,
      ressalva: null,
    };
  }

  return {
    ...base,
    state: COVERAGE_CARD.POR_CONFIRMAR,
    titulo: "Confirmar cobertura das despesas",
    /* Diz-se o que a plataforma NÃO SABE, e não o que o utilizador deve fazer. A
     * diferença importa: a primeira é verdade, a segunda seria uma instrução sobre uma
     * decisão que é dele. */
    explicacao:
      `A Finer One ainda não sabe se todos os documentos relevantes de despesas de ` +
      `${monthLongLabel(alvo)} já estão disponíveis. Enquanto não souber, trata o mês como incompleto.`,
    cta: "Confirmar cobertura",
    /* A frase que o utilizador confirma. Deliberadamente na primeira pessoa e com
     * "até onde sei": é uma afirmação sobre o que ele conhece, não uma garantia sobre
     * o que existe. Sem linguagem jurídica e sem a palavra "fecho". */
    confirmText:
      `Confirmo que, até onde sei, os documentos relevantes de despesas de ` +
      `${monthLongLabel(alvo)} já estão disponíveis para análise.`,
    /* O que esta ação NÃO é. Fica visível no momento da decisão, não escondido num
     * tooltip: é a parte que impede a confirmação de ser lida como um fecho contabilístico. */
    ressalva:
      "Isto não é um fecho contabilístico nem uma validação da contabilidade, e não afirma que os valores estão corretos.",
  };
}

/** Rótulo do mês para o cabeçalho da secção, capitalizado. */
export function coverageMonthHeading(card) {
  return card ? capitalizar(card.monthLabel) : null;
}
