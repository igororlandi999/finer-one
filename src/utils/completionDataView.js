// src/utils/completionDataView.js
// Camada APRESENTACIONAL do ecrã "Dados a completar". Puro, sem JSX e sem lógica
// financeira: não calcula, não agrega, não decide o que falta. Mesmo padrão de
// alertsView, performanceView, manualInputsView e closingSummaryView.
//
// ─── QUEM MANDA É O FECHO ───────────────────────────────────────────────────────────
// A pendência nasce SEMPRE do motor de fecho (closing.items). O documento de ajustes
// manuais nunca é fonte de pendência: uma rubrica ausente do documento não significa
// que falte — significa apenas que ninguém a introduziu à mão, o que pode ser o caso
// normal (rubrica vinda da integração, ou rubrica que nem se aplica àquele mês).
//
// O documento manual ENRIQUECE o que o fecho já diz estar completo, acrescentando
// duas coisas que o motor não guarda porque não são financeiras: a data em que o
// valor foi introduzido e a nota que o acompanha.
//
// Consequência prática: se o documento manual falhar ao carregar, esta página
// continua correta — perde a data e a nota, nunca a verdade sobre o que falta.

import { monthLongLabel } from "./performanceCalculations.js";
import { buildManualInputsRows } from "./manualInputsView.js";
import { AVAILABILITY_LABELS } from "./performanceView.js";
import { CLOSING_STATUS, ITEM_STATUS } from "./monthlyClosing.js";

/** Estados de ecrã. Poucos de propósito — ver manualInputsView para o mesmo critério. */
export const COMPLETION_VIEW = {
  LOADING: "loading",
  MONTHS: "months",
  EMPTY: "empty",
};

/* Tons nomeados pelo SIGNIFICADO, não pela cor: a paleta pertence à página, que já
 * tem os tokens do projeto. Iguais aos de closingSummaryView, pela mesma razão. */
export const COMPLETION_TONE = {
  POSITIVO: "positivo",
  ATENCAO: "atencao",
  INFORMATIVO: "informativo",
  NEUTRO: "neutro",
};

/** Estado de cada rubrica dentro do mês, já traduzido para o que a página desenha. */
export const COMPLETION_ITEM = {
  POR_PREENCHER: "por_preencher",
  CONCLUIDO: "concluido",
  POR_VALIDAR: "por_validar",
  NAO_APLICAVEL: "nao_aplicavel",
};

/* Apresentação de cada estado de MÊS. `badge` é a palavra que o empresário lê.
 * IN_PROGRESS está aqui por defesa: a janela do motor só tem meses terminados, mas um
 * relógio adiantado ou um fecho construído com outra data de referência podem
 * produzi-lo, e rebentar seria pior do que dizer a verdade. */
const MES_POR_ESTADO = {
  [CLOSING_STATUS.COMPLETE]:      { badge: "Concluído",   tone: COMPLETION_TONE.POSITIVO },
  [CLOSING_STATUS.INCOMPLETE]:    { badge: "Por completar", tone: COMPLETION_TONE.ATENCAO },
  [CLOSING_STATUS.INDETERMINATE]: { badge: "Por validar",  tone: COMPLETION_TONE.INFORMATIVO },
  [CLOSING_STATUS.IN_PROGRESS]:   { badge: "Em curso",     tone: COMPLETION_TONE.NEUTRO },
};

/* Origens que contam como valor introduzido à mão. `mixed` fica DE FORA: significa que
 * a linha combina automático e manual, e chamar-lhe "Valor manual" seria atribuir ao
 * utilizador um número que não é só dele. O motor distingue-as; esta camada respeita. */
const ORIGEM_MANUAL = "manual";

/** Índice `${monthKey}:${key}` -> linha manual, para juntar data e nota em O(1). */
function indexarManuais(manualInputs) {
  const mapa = new Map();
  // buildManualInputsRows já valida o envelope, ignora meses malformados e preserva o
  // valor 0 (que é um valor real). Reutilizá-lo evita uma segunda leitura do documento
  // com regras ligeiramente diferentes — que é como as duas verdades começam.
  for (const linha of buildManualInputsRows(manualInputs)) {
    mapa.set(`${linha.monthKey}:${linha.key}`, linha);
  }
  return mapa;
}

/**
 * Uma rubrica do mês, pronta a desenhar.
 * `value` sai como NÚMERO (ou null): a formatação de moeda pertence à página, que já
 * tem o formatador da empresa. Um util que escreve símbolos de moeda é um util que
 * passa a saber em que país está.
 */
function construirItem(item, manual) {
  const base = {
    key: item.key,
    label: item.label,
    value: null,
    origemManual: false,
    nota: null,
    atualizadoEm: null,
  };

  if (item.status === ITEM_STATUS.MISSING) {
    return {
      ...base,
      estado: COMPLETION_ITEM.POR_PREENCHER,
      badge: "Por preencher",
      /* Impacto DELIBERADAMENTE genérico. O requisito declara `impact` em chaves
       * técnicas ("grossProfit", "ebitda"); traduzi-las exigiria uma segunda tabela de
       * nomes ao lado da que a Performance já tem, e duas tabelas de nomes divergem.
       * Esta frase é verdadeira para qualquer requisito, presente ou futuro. */
      detalhe: "Necessário para completar os cálculos financeiros do período.",
      discreto: false,
    };
  }

  if (item.status === ITEM_STATUS.COMPLETE) {
    const manualMesmo = item.source === ORIGEM_MANUAL;
    return {
      ...base,
      estado: COMPLETION_ITEM.CONCLUIDO,
      /* Só se chama manual ao que o motor diz ser manual. Um valor vindo da
       * integração aparece como concluído, sem se disfarçar de introdução do
       * utilizador — seria dar-lhe crédito por trabalho que não fez.
       *
       * O rótulo é o que já existe para a mesma ideia ("este valor foi introduzido à
       * mão"), em vez de uma segunda string com o mesmo texto: duas cópias do mesmo
       * rótulo divergem no dia em que uma delas for reescrita. */
      badge: manualMesmo ? AVAILABILITY_LABELS.manual : "Concluído",
      // `?? null` e não `|| null`: o valor 0 é um valor real e tem de sobreviver.
      value: item.value ?? null,
      origemManual: manualMesmo,
      // Data e nota SÓ existem para valores manuais, e só se o documento os tiver.
      nota: manualMesmo && manual ? manual.note : null,
      atualizadoEm: manualMesmo && manual ? manual.updatedAtLabel : null,
      detalhe: null,
      discreto: false,
    };
  }

  if (item.status === ITEM_STATUS.NOT_APPLICABLE) {
    return {
      ...base,
      estado: COMPLETION_ITEM.NAO_APLICAVEL,
      badge: "Não aplicável",
      detalhe: "Não há dados a introduzir para este período.",
      // Discreto: continua visível porque um mês sem linha nenhuma parece avariado,
      // mas não compete com o que precisa mesmo de atenção.
      discreto: true,
    };
  }

  /* PENDING. Num mês por validar não se pede preenchimento: não sabemos sequer se o
   * dado é exigível, e pedi-lo seria mandar o utilizador trabalhar à toa. */
  return {
    ...base,
    estado: COMPLETION_ITEM.POR_VALIDAR,
    badge: null,
    detalhe: "Ainda não foi possível validar este dado.",
    discreto: true,
  };
}

/** Frase de resumo do mês. Singular e plural corretos; nunca "1 dados". */
function resumirMes(status, porPreencher) {
  if (status === CLOSING_STATUS.INCOMPLETE) {
    return porPreencher === 1
      ? "1 dado por preencher."
      : `${porPreencher} dados por preencher.`;
  }
  if (status === CLOSING_STATUS.INDETERMINATE) {
    return "Ainda não existem informações suficientes para confirmar se o período está completo.";
  }
  if (status === CLOSING_STATUS.IN_PROGRESS) return "O período ainda não terminou.";
  /* "Todos os dados PEDIDOS foram preenchidos" e não "todos os dados necessários estão
   * disponíveis". Esta página responde por UM eixo — o que foi pedido ao utilizador — e
   * a frase antiga estendia a garantia a tudo o resto: num mês com as contas a pagar
   * ainda por fechar, prometia completude que a DRE não tinha. O estado das FONTES
   * viaja à parte, em `analise`, para que os dois nunca voltem a ser a mesma frase. */
  return "Todos os dados pedidos foram preenchidos.";
}

/* Ressalva sobre a análise do mês — eixo distinto do dos requisitos.
 *
 * ─── PORQUE LÊ `sourceCompleteness` E NÃO `financialAnalysisStatus` ─────────────────
 * `financialAnalysisStatus` inclui o CMV, que é um requisito DO UTILIZADOR. Num mês
 * com as fontes todas fechadas e o CMV ainda por lançar, esse eixo fica `unavailable`
 * — e a ressalva diria "faltam fontes do período" sobre um mês cujas fontes estão
 * completas, mandando o utilizador procurar no ERP um dado que o ERP não tem. Pior:
 * repetiria, com outras palavras, o que a página já diz em `porPreencher`.
 *
 * Esta página já responde pelo eixo dos requisitos. O que lhe falta dizer é a parte
 * que o utilizador NÃO consegue resolver — e essa é exatamente `sourceCompleteness`.
 *
 * `null` quando não há nada a acrescentar: sem veredito, com as fontes completas, ou
 * com o mês ainda a decorrer. Nunca se escreve uma ressalva sem base. */
function notaDeAnalise(financial) {
  if (!financial) return null;
  const estado = financial.sourceCompleteness;
  if (estado == null || estado === "complete" || estado === "in_progress") return null;
  return {
    status: estado,
    badge: "Análise parcial",
    // Sem lista de rubricas: nenhuma delas é acionável AQUI, e enumerá-las nesta
    // página convidaria o utilizador a tentar preenchê-las. O detalhe por linha vive
    // no Resumo, que é onde o estado do período se lê.
    nota: estado === "unavailable"
      ? "Faltam fontes do período: a análise financeira do mês não está disponível."
      : "Algumas fontes do período ainda não estão completas: a análise financeira do mês não é definitiva.",
  };
}

/**
 * Vista completa do ecrã "Dados a completar".
 *
 * Os meses são exatamente os que o motor de fecho apurou (a mesma janela dos alertas
 * e do Resumo) — esta camada não escolhe períodos nem inventa meses ausentes. A ordem
 * é reafirmada aqui, do mais recente para o mais antigo, para não depender da ordem
 * com que a lista chegou.
 *
 * @param {{closings?: Array, manualInputs?: object|null, loading?: boolean}} args
 *   `manualInputs` é o envelope { status, document } do contexto; a sua ausência ou
 *   falha degrada a data e a nota, nunca a lista de pendências.
 */
export function buildCompletionDataView({ closings, manualInputs = null, loading = false } = {}) {
  if (loading) return { state: COMPLETION_VIEW.LOADING, months: [] };

  const lista = (Array.isArray(closings) ? closings : []).filter(
    (c) => c && typeof c.monthKey === "string");
  if (lista.length === 0) return { state: COMPLETION_VIEW.EMPTY, months: [] };

  const manuais = indexarManuais(manualInputs);

  const months = lista
    .slice()
    // "aaaa-mm" é lexicograficamente ordenável: nenhum parsing de data, e por isso
    // nenhum risco de new Date("2026-06") ser lido como UTC e recuar um mês.
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0))
    .map((c) => {
      const apresentacao = MES_POR_ESTADO[c.status] || MES_POR_ESTADO[CLOSING_STATUS.IN_PROGRESS];

      /* Só requisitos OBRIGATÓRIOS. Um opcional ausente não impede o fecho e por isso
       * não é uma pendência — pedi-lo seria exigir o que não é exigido. */
      const itens = (Array.isArray(c.items) ? c.items : [])
        .filter((i) => i && i.required === true)
        .map((i) => construirItem(i, manuais.get(`${c.monthKey}:${i.key}`) || null));

      // A contagem vem do fecho, nunca do documento manual nem do tamanho da lista.
      const porPreencher = itens.filter((i) => i.estado === COMPLETION_ITEM.POR_PREENCHER).length;

      return {
        monthKey: c.monthKey,
        monthLabel: monthLongLabel(c.monthKey),
        status: c.status,
        badge: apresentacao.badge,
        tone: apresentacao.tone,
        porPreencher,
        resumo: resumirMes(c.status, porPreencher),
        // Aditivo: a página desenha se existir, ignora se for null. Nenhum campo
        // existente mudou de significado.
        analise: notaDeAnalise(c.financial),
        itens,
      };
    });

  return { state: COMPLETION_VIEW.MONTHS, months };
}
