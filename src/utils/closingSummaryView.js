// src/utils/closingSummaryView.js
// Camada APRESENTACIONAL do fecho mensal no Resumo. Mesmo padrão de alertsView,
// performanceView e manualInputsView: a página desenha, este módulo decide.
//
// ─── NÃO HÁ AQUI UMA ÚNICA REGRA FINANCEIRA ─────────────────────────────────────────
// Este ficheiro não sabe o que é CMV, receita, cobertura ou disponibilidade. Não chama
// buildMonthlyClosing, não lê métricas, não conta alertas. Recebe fechos JÁ APURADOS
// pelo motor (C7/C7B) e limita-se a escolher UM mês e a redigir o que ele diz.
//
// A consequência é a que interessa: se a semântica de fecho mudar, muda no motor e
// esta camada acompanha sem alteração. E não existe forma de o Resumo discordar do
// motor, porque não tem material com que o fazer.
//
// ─── O ESTADO NÃO SE RECONSTRÓI A PARTIR DOS ALERTAS ────────────────────────────────
// Alertas são CONSEQUÊNCIA do fecho, não a sua fonte. Contar alertas para inferir o
// estado do mês inverteria a dependência e produziria erros silenciosos: um mês
// INDETERMINATE não gera alerta nenhum e seria indistinguível de um mês COMPLETE.

import { closedMonthKeys, CLOSING_STATUS } from "./monthlyClosing.js";
import { monthLongLabel } from "./performanceCalculations.js";

/* Tons de apresentação, nomeados pelo SIGNIFICADO e não pela cor. A escolha da cor
 * pertence à página, que já tem os tokens do projeto (StatusBadge). Um tom chamado
 * "amber" aqui obrigaria este módulo a saber a paleta — e a mudá-la obrigaria a mexer
 * em lógica em vez de em estilo. */
export const CLOSING_TONE = {
  POSITIVO: "positivo",       // o período está resolvido
  ATENCAO: "atencao",         // há algo concreto por fazer
  INFORMATIVO: "informativo", // falta informação, mas não há erro nem ação clara
  NEUTRO: "neutro",           // nada a assinalar
};

/** "julho de 2026" -> "Julho de 2026". Só a primeira letra; o ano e o resto ficam. */
function capitalizar(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/* Redação das CAUSAS de uma linha incompleta. O motor devolve códigos
 * (financialCompleteness.LINE_CAUSE) precisamente para que a frase viva aqui, na
 * camada que já sabe em que língua está — e para que mudar a copy não seja mexer
 * em lógica financeira. */
const CAUSA_TEXTO = {
  cobertura: "período ainda por fechar na fonte",
  classificacao: "títulos por classificar",
  sem_fonte: "sem fonte para o período",
  por_informar: "por preencher",
};

/** "Despesas operacionais: período ainda por fechar na fonte, títulos por classificar"
 *
 * EXPORTADA porque o Chat passou a explicar porque é que um mês não sustenta
 * rentabilidade, e essa explicação tem de ser A MESMA frase que o Resumo já mostra.
 * Duas redações do mesmo facto, em dois sítios do produto, é a forma mais barata de
 * as duas divergirem — e de o utilizador ler duas explicações diferentes para o
 * mesmo mês. A regra do módulo mantém-se: os códigos vêm do motor, a língua vive aqui. */
export function descreverBloqueio(linha) {
  const causas = (linha.causes || []).map((c) => CAUSA_TEXTO[c]).filter(Boolean);
  return causas.length ? `${linha.label}: ${causas.join(", ")}` : linha.label;
}

/* Redação dos BLOQUEIOS DE ÂNCORA (financialCompleteness.ANCHOR_BLOCKER) — o outro
 * eixo do mesmo veredito. `blockers` diz que LINHAS faltam; `anchorBlockers` diz
 * porque é que o MÊS não pode sustentar os KPIs, e as duas respostas não coincidem:
 * um mês pode ter todas as linhas utilizáveis e continuar inelegível por estar em
 * curso ou por não ter tido atividade nenhuma.
 *
 * Vive aqui pela mesma razão que CAUSA_TEXTO: é língua, não é lógica. */
const BLOQUEIO_ANCORA_TEXTO = {
  mes_em_curso: "o mês ainda está a decorrer",
  requisitos_por_preencher: "há dados pedidos ainda por preencher (por exemplo, o CMV)",
  requisitos_por_apurar: "os requisitos do mês ainda não foram apurados",
  sem_atividade: "o mês não teve atividade que sustente margens",
  analise_incompleta: "há linhas essenciais da demonstração de resultados incompletas",
};

/** ["o mês ainda está a decorrer", …] — códigos desconhecidos são omitidos, nunca
 *  traduzidos por adivinhação. */
export function descreverBloqueiosAncora(codigos) {
  return (codigos || []).map((c) => BLOQUEIO_ANCORA_TEXTO[c]).filter(Boolean);
}

/**
 * O fecho do mês civil IMEDIATAMENTE ANTERIOR, pronto a desenhar.
 *
 * ESCOLHA DO MÊS: `closedMonthKeys({count: 1})` — a mesma função de calendário que
 * define a janela do motor e a severidade dos alertas. Nunca o primeiro fecho da
 * lista (dependeria da ordem), nunca o último mês com vendas, com despesas ou com
 * títulos. O mês vem do relógio; a viragem de ano resolve-se dentro do helper.
 *
 * `now` é injetável para o mês ser testável sem depender do relógio real.
 *
 * @param {{closings?: Array, now?: Date}} args `closings` são resultados de
 *   buildMonthlyClosing, tal como o motor os produziu.
 * @returns {null|{
 *   monthKey: string, monthLabel: string, tone: string, badge: string,
 *   estado: string, detalhe: string, itens: string[], cta: {label: string}|null
 * }}  null quando não há fecho para esse mês — a secção simplesmente não existe,
 *     em vez de inventar um estado para ela.
 */
export function resolveClosingSummary({ closings, now = new Date() } = {}) {
  const lista = Array.isArray(closings) ? closings : [];
  const alvo = closedMonthKeys({ now, count: 1 })[0] || null;
  if (!alvo) return null;

  const fecho = lista.find((c) => c && c.monthKey === alvo) || null;
  if (!fecho) return null;

  const monthLabel = monthLongLabel(alvo);        // "julho de 2026"
  const mesCapitalizado = capitalizar(monthLabel); // "Julho de 2026"

  if (fecho.status === CLOSING_STATUS.COMPLETE) {
    /* ── REQUISITOS SATISFEITOS NÃO É ANÁLISE COMPLETA ──────────────────────────────
     * O catálogo de requisitos tem hoje uma entrada (o CMV). Lançar o CMV esgotava-o e
     * esta secção anunciava "Julho concluído — os dados necessários estão completos",
     * com as deduções e as despesas operacionais desse mês ainda parciais e um EBITDA
     * que o próprio motor marcava como `partial`. Era uma afirmação falsa sobre o
     * produto, dita com o tom mais tranquilizador de todos.
     *
     * O veredito vem JÁ APURADO em `fecho.financial` (financialCompleteness). Aqui não
     * se lê availability nenhuma nem se reconstrói nada: escolhe-se a frase verdadeira.
     * Sem o bloco, mantém-se o texto anterior — nunca se inventa uma parcialidade que
     * ninguém apurou. */
    const fin = fecho.financial || null;
    const analiseIncompleta = !!fin
      && fin.financialAnalysisStatus != null
      && fin.financialAnalysisStatus !== "complete";

    if (analiseIncompleta) {
      return {
        monthKey: alvo,
        monthLabel,
        tone: CLOSING_TONE.INFORMATIVO,
        badge: "Análise parcial",
        estado: `${mesCapitalizado} com análise parcial`,
        // Diz-se as duas coisas, por esta ordem: o que o utilizador já fez, e o que
        // continua a faltar do lado da plataforma. Trocar a ordem soaria a cobrança.
        detalhe: "Os dados pedidos foram preenchidos. Há fontes do período ainda incompletas, pelo que a rentabilidade do mês não é definitiva.",
        itens: (fin.blockers || []).map(descreverBloqueio),
        // Sem ação: nada disto se resolve no ecrã de preenchimento.
        cta: null,
      };
    }

    /* COMPLETE — o período está resolvido.
     * Nunca "fechado contabilisticamente": a Finer One não tem ação formal de
     * encerramento, e afirmá-la seria mentir sobre o produto. Diz-se o que é
     * verdade — os dados necessários existem e as linhas essenciais estão completas. */
    return {
      monthKey: alvo,
      monthLabel,
      tone: CLOSING_TONE.POSITIVO,
      badge: "Concluído",
      estado: `${mesCapitalizado} concluído`,
      detalhe: "Os dados necessários para os cálculos financeiros do período estão completos.",
      itens: [],
      cta: null,
    };
  }

  /* INCOMPLETE — há dado obrigatório confirmadamente em falta.
   * É o ÚNICO estado com ação: sabe-se o que falta e sabe-se onde resolver. */
  if (fecho.status === CLOSING_STATUS.INCOMPLETE) {
    const emFalta = Array.isArray(fecho.missingItems) ? fecho.missingItems : [];
    const n = emFalta.length;
    return {
      monthKey: alvo,
      monthLabel,
      tone: CLOSING_TONE.ATENCAO,
      badge: "Por completar",
      estado: `${mesCapitalizado} tem dados por completar`,
      detalhe: n === 1
        ? "Falta 1 dado obrigatório para completar os cálculos financeiros do período."
        : `Faltam ${n} dados obrigatórios para completar os cálculos financeiros do período.`,
      // Nomes curtos das rubricas, para o utilizador saber o que o espera sem sair
      // do Resumo. O `label` vem do catálogo do motor ("CMV"), não é escrito aqui.
      itens: emFalta.map((i) => `${i.label} por preencher`),
      cta: { label: "Ver pendências" },
    };
  }

  /* INDETERMINATE — o mês terminou mas não é possível afirmar se está completo.
   *
   * Não se nomeia rubrica nenhuma e não se pede ação: nesse estado não sabemos se o
   * dado é sequer exigível, pelo que "Falta o CMV" seria falso e "Complete os dados"
   * mandaria o utilizador preencher algo que pode não se aplicar. Diz-se exatamente
   * o que se sabe — e o que se sabe é que não se sabe. */
  if (fecho.status === CLOSING_STATUS.INDETERMINATE) {
    return {
      monthKey: alvo,
      monthLabel,
      tone: CLOSING_TONE.INFORMATIVO,
      badge: "Por validar",
      estado: `Não foi possível validar todos os dados de ${monthLabel}`,
      detalhe: "Ainda não existem informações suficientes para confirmar se o período está completo.",
      itens: [],
      cta: null,
    };
  }

  /* IN_PROGRESS — defensivo. O mês imediatamente anterior não devia estar em curso
   * (por definição já terminou), mas um relógio adiantado, um fuso ou um fecho
   * construído com outra data de referência podem produzi-lo. Trata-se sem erro e,
   * sobretudo, sem pendência falsa: um período que ainda não acabou não deve nada. */
  return {
    monthKey: alvo,
    monthLabel,
    tone: CLOSING_TONE.NEUTRO,
    badge: "Em curso",
    estado: `${mesCapitalizado} ainda está em curso`,
    detalhe: "O período ainda não terminou.",
    itens: [],
    cta: null,
  };
}
