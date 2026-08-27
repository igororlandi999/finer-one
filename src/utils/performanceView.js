// src/utils/performanceView.js
// Decide, num único sítio, o que a página Performance Financeira pode mostrar.
// Mesmo padrão do alertsView: a página renderiza, este módulo decide.
//
// Regra central, e é só uma:
//
//   source === "api"  -> NUNCA conteúdo demonstrativo. Nem números fabricados,
//                        nem prosa inventada, nem selo Demo (não há nada a marcar).
//   source !== "api"  -> conteúdo demonstrativo permitido, SEMPRE com selo Demo.
//
// O defeito que isto corrige: as condições da página eram
//   {!real && !vazioReal && source === "api" && <DemoTag />}
// mas `!real && !vazioReal` só acontece quando não há fonte de receitas, ou seja,
// em modo mock — onde `source === "api"` é falso. O selo nunca aparecia, e os cinco
// KPIs demonstrativos entravam sem qualquer marca. A condição estava invertida.
//
// NÃO decide fórmulas nem períodos: resultado, margem, cobertura e âncora temporal
// continuam intocados (P2/P3/P4).

import { CLOSING_STATUS, ITEM_STATUS } from "./monthlyClosing.js";
import { sourceIsReal, sourceIsDemo } from "./dataSourceStates.js";

export const PERFORMANCE_MODES = {
  REAL: "real",                   // fonte real com movimentos e mês de referência
  VAZIO: "vazio",                 // fonte real sem movimentos apresentáveis
  INDISPONIVEL: "indisponivel",   // modo API sem fonte de receitas
  DEMO: "demo",                   // modo demonstração DELIBERADO: conteúdo fictício
  /* Nem real nem demonstração: a leitura ainda não tem veredito (loading) ou a fonte
   * falhou (unavailable). Não autoriza conteúdo demonstrativo nenhum. */
  INDETERMINADO: "indeterminado",
};

/**
 * @param {{
 *   source: string,                 "api" | "mock"
 *   temFonteReceitas: boolean,      sales.orders é um array
 *   temMovimentosReceitas: boolean, ...e tem pelo menos um pedido
 *   temMetrics: boolean,            buildPerformanceMetrics devolveu métricas
 *   temFonteDespesas?: boolean,     sales.despesas.list é um array
 * }} args
 */
export function resolvePerformanceView({
  source,
  temFonteReceitas = false,
  temMovimentosReceitas = false,
  temMetrics = false,
  temFonteDespesas = false,
} = {}) {
  const modoApi = sourceIsReal(source);

  /* Demonstração é uma ESCOLHA (sem backend configurado), nunca a ausência de veredito
   * nem uma avaria. Antes bastava `!modoApi` para cair em DEMO, o que fazia
   * `loading` e `unavailable` produzirem os cinco KPIs fictícios. */
  let modo;
  if (modoApi) {
    if (temFonteReceitas && temMovimentosReceitas && temMetrics) modo = PERFORMANCE_MODES.REAL;
    else if (temFonteReceitas) modo = PERFORMANCE_MODES.VAZIO;
    else modo = PERFORMANCE_MODES.INDISPONIVEL;
  } else if (sourceIsDemo(source)) {
    modo = PERFORMANCE_MODES.DEMO;
  } else {
    modo = PERFORMANCE_MODES.INDETERMINADO;
  }

  const demo = modo === PERFORMANCE_MODES.DEMO;

  return {
    modo,
    modoApi,
    real: modo === PERFORMANCE_MODES.REAL,
    vazioReal: modo === PERFORMANCE_MODES.VAZIO,
    fonteIndisponivel: modo === PERFORMANCE_MODES.INDISPONIVEL,
    indeterminado: modo === PERFORMANCE_MODES.INDETERMINADO,
    temFonteDespesas: !!temFonteDespesas,

    // Conteúdo demonstrativo: os cinco KPIs, as demonstrações contabilísticas e a
    // prosa de análise. Os três andam juntos porque têm a mesma origem — mockData.
    mostrarKpisDemo: demo,
    mostrarDemonstracoes: demo,
    permiteTextoDemonstrativo: demo,

    // Selo Demo: só faz sentido sobre conteúdo demonstrativo.
    mostrarDemoTag: demo,

    // Em modo API as demonstrações não existem: diz-se porquê, sem números.
    // (`modoApi` e não `!demo`: em INDETERMINADO não se afirma nada sobre a fonte.)
    mostrarNotaDemonstracoes: modoApi,
  };
}

/* ====================================================================================
 * BLOCO 2 — RENTABILIDADE (DRE).
 *
 * MAPEAMENTO PURO de financialMetrics para linhas de UI. Não há aqui uma única conta:
 * nenhuma subtração, nenhuma divisão, nenhum fallback. Se o motor devolve null, a
 * linha é null e a página mostra "—". Isto é deliberado — foi exatamente o cálculo
 * feito fora do motor (receita − contas a pagar) que produziu a pseudo-DRE.
 *
 * A rentabilidade tem mês PRÓPRIO (o último mês financeiro fechado) e não partilha a
 * âncora do bloco operacional, que segue o último mês com receita.
 * ==================================================================================== */

/** Legenda de disponibilidade. `real` não tem legenda: é o caso normal. */
export const AVAILABILITY_LABELS = {
  unavailable: "Fonte indisponível",
  partial: "Dados parciais",
  manual: "Valor manual",
  mixed: "Inclui valor manual",
};

export function availabilityLabel(availability) {
  return AVAILABILITY_LABELS[availability] ?? null;
}

/**
 * Linhas do bloco de rentabilidade, na ordem da cascata da DRE.
 * `kind` diz à página como formatar — não converte nada aqui.
 * @param {object|null} fm  financialMetrics de um mês (financeiro.metrics)
 */
export function buildProfitabilityRows(fm) {
  if (!fm) return [];
  const p = fm.profitability || {};
  const disp = p.availability || {};
  const rev = fm.revenue || {};
  return [
    { key: "revenueNet",      label: "Receita líquida",   value: rev.net ?? null,          availability: rev.netAvailability ?? null, kind: "money" },
    { key: "grossProfit",     label: "Lucro bruto",       value: p.grossProfit ?? null,    availability: disp.grossProfit ?? null,     kind: "money" },
    { key: "ebitda",          label: "EBITDA",            value: p.ebitda ?? null,         availability: disp.ebitda ?? null,          kind: "money" },
    { key: "ebitdaMarginPct", label: "Margem EBITDA",     value: p.ebitdaMarginPct ?? null, availability: disp.ebitdaMarginPct ?? null, kind: "pct" },
    { key: "netResult",       label: "Resultado líquido", value: p.netResult ?? null,      availability: disp.netResult ?? null,       kind: "money" },
    { key: "netMarginPct",    label: "Margem líquida",    value: p.netMarginPct ?? null,   availability: disp.netMarginPct ?? null,    kind: "pct" },
  ];
}

/* ====================================================================================
 * CAUSA DE UM INDICADOR BLOQUEADO (C7D).
 *
 * "Fonte indisponível" é verdade, mas não ajuda: o empresário não sabe se é um
 * problema dele, nosso, ou se não há nada a fazer. Quando o motor de fecho JÁ SABE
 * que falta um dado obrigatório no mesmo mês, dizer "CMV ainda não informado" é a
 * mesma verdade, acionável.
 *
 * TRÊS REGRAS QUE ESTA CAMADA NÃO PODE QUEBRAR:
 *
 *  1. A causa vem do FECHO, nunca da availability isolada. Um indicador
 *     `unavailable` não prova falta de CMV — pode faltar-lhe outra coisa. Sem um
 *     requisito por resolver que declare impacto sobre ESTE indicador, mantém-se a
 *     mensagem genérica.
 *
 *  2. Os indicadores afetados vêm do `impact` DECLARADO pelo requisito de fecho, que
 *     usa exatamente as mesmas chaves das linhas ("grossProfit", "ebitda",
 *     "netResult", ...). Não existe aqui uma segunda lista a dizer o que o CMV
 *     bloqueia — seriam duas verdades a divergir em silêncio.
 *
 *  3. `availability` não é alterada. Continua real/manual/mixed/partial/unavailable
 *     como o motor a produziu; só muda a FRASE apresentada.
 *
 * Um mês INDETERMINATE não permite nomear rubrica nenhuma — nem sequer sabemos se é
 * exigível — pelo que a frase é neutra e sem ação.
 * ==================================================================================== */

/** Mensagem neutra de um mês por validar. Não nomeia rubricas nem pede ação. */
export const PERIODO_POR_VALIDAR = "Dados do período ainda não validados";
const PERIODO_POR_VALIDAR_DETALHE =
  "Ainda não existem informações suficientes para confirmar se o período está completo.";

/** Requisitos obrigatórios por resolver que declaram impacto sobre `metricKey`. */
function requisitosQueBloqueiam(closing, metricKey) {
  if (!closing || !metricKey) return [];
  const lista = closing.status === CLOSING_STATUS.INCOMPLETE
    ? (closing.missingItems || [])
    // INDETERMINATE: não há nada confirmadamente em falta; os que podem vir a sê-lo
    // estão por apurar. `not_applicable` e `complete` ficam de fora por construção.
    : (closing.items || []).filter((i) => i.required === true && i.status === ITEM_STATUS.PENDING);
  return lista.filter((i) => Array.isArray(i.impact) && i.impact.includes(metricKey));
}

/**
 * Nota a mostrar por baixo de um indicador: `{ nota, detalhe }`.
 * `detalhe` é o texto longo (tooltip) e é null quando não há nada a acrescentar.
 *
 * @param {{row: object, closing: object|null}} args
 */
export function resolveRowNote({ row, closing = null } = {}) {
  const generica = { nota: availabilityLabel(row?.availability), detalhe: null };
  if (!row) return generica;

  /* Só se explica o que está BLOQUEADO. Um indicador com valor, ou cuja
   * disponibilidade é parcial/manual, não está à espera de dado nenhum — trocar-lhe
   * a legenda seria inventar uma pendência sobre um número que já existe. */
  if (row.value != null || row.availability !== "unavailable") return generica;
  if (!closing) return generica;

  /* COMPLETE e IN_PROGRESS não explicam nada: no primeiro não falta nada, e no
   * segundo o período ainda decorre — não é atraso, e uma pendência aqui seria falsa. */
  if (closing.status !== CLOSING_STATUS.INCOMPLETE
    && closing.status !== CLOSING_STATUS.INDETERMINATE) return generica;

  const culpados = requisitosQueBloqueiam(closing, row.key);
  // Bloqueado por outra causa que o fecho não conhece: mensagem genérica, sem palpite.
  if (culpados.length === 0) return generica;

  if (closing.status === CLOSING_STATUS.INDETERMINATE) {
    return { nota: PERIODO_POR_VALIDAR, detalhe: PERIODO_POR_VALIDAR_DETALHE };
  }

  // INCOMPLETE: sabe-se exatamente o que falta, e o nome vem do catálogo do motor.
  if (culpados.length === 1) {
    const { label } = culpados[0];
    return {
      nota: `${label} ainda não informado`,
      detalhe: `Informe o ${label} do período para completar este cálculo.`,
    };
  }
  return {
    nota: `${culpados.length} dados ainda não informados`,
    detalhe: `Informe ${culpados.map((i) => i.label).join(" e ")} do período para completar este cálculo.`,
  };
}

/**
 * Estado do bloco de rentabilidade.
 * Em modo mock o bloco NÃO existe: a demonstração já tem os seus próprios KPIs.
 * Em modo API sem métricas o bloco fica indisponível — nunca cai para o mock.
 *
 * `closings` são os fechos JÁ APURADOS pelo motor (sales.closings). O bloco escolhe o
 * do SEU mês por monthKey — nunca por índice, nunca o mais recente: o mês da DRE é o
 * último mês financeiro fechado e pode não ser o primeiro da janela de fecho. Se não
 * existir fecho para esse mês, as notas ficam genéricas, que é o comportamento
 * anterior a esta microfase.
 *
 * @param {{source: string, financeiro: object|null, closings?: Array}} args
 */
/* ══════════════════════════════════════════════════════════════════════════════════
 * RESSALVA DA ÂNCORA — nenhuma UI pode tratar um recurso como fecho.
 *
 * `financeiro.monthKey` sai de `mesElegivel || mesUsavel`. O segundo termo aceita o
 * último mês com RECEITA real, sem olhar às contas a pagar nem ao CMV. Sem esta
 * ressalva, os dois chegavam ao ecrã com exatamente a mesma aparência — e, medido na
 * matriz de `financialAnchor.test.js`, o recurso podia ser um mês com deduções,
 * EBITDA e resultado todos `unavailable`, apresentado sob o rótulo tranquilo
 * "Mês de referência".
 *
 * Os números do recurso continuam VERDADEIROS no que têm: a receita é a receita. O que
 * não se pode é apresentá-los como um fecho — daí a ressalva, e não a supressão.
 *
 * Devolve `null` quando não há nada a ressalvar (âncora elegível, ou serviço antigo sem
 * `anchorSource`): não se escreve um aviso sem base.
 * ════════════════════════════════════════════════════════════════════════════════ */

/** Redação das causas, igual à de closingSummaryView — os códigos vêm do motor. */
const CAUSA_ANCORA = {
  cobertura: "período por fechar na fonte",
  classificacao: "títulos por classificar",
  sem_fonte: "sem fonte para o período",
  por_informar: "por preencher",
};

export function buildAnchorNotice(financeiro) {
  const fonte = financeiro && financeiro.anchorSource;
  if (!fonte || fonte === "eligible") return null;

  if (fonte === "none") {
    return {
      source: "none",
      badge: "Sem mês completo",
      nota: "Nenhum período tem dados suficientes para apurar rentabilidade.",
      itens: [],
    };
  }

  /* FALLBACK. Nomeia as rubricas em falta quando o veredito do mês âncora existe —
   * dizer "está parcial" sem dizer o quê obriga o utilizador a adivinhar. */
  const bloqueios = (financeiro.anchorFinancial && financeiro.anchorFinancial.blockers) || [];
  return {
    source: "fallback",
    badge: "Análise parcial",
    nota: "Nenhum mês está financeiramente completo: estes valores são do último mês com receita real e não representam um fecho.",
    itens: bloqueios.map((b) => {
      const causas = (b.causes || []).map((c) => CAUSA_ANCORA[c]).filter(Boolean);
      return causas.length ? `${b.label}: ${causas.join(", ")}` : b.label;
    }),
  };
}

export function buildProfitabilityBlock({ source, financeiro = null, closings = null } = {}) {
  const modoApi = source === "api";
  const fm = (financeiro && financeiro.metrics) || null;
  const disponivel = modoApi && !!fm;
  // Mês PRÓPRIO da DRE (último mês fechado), independente do mês operacional.
  const monthKey = disponivel ? (fm.monthKey || financeiro.monthKey || null) : null;

  const closing = (Array.isArray(closings) && monthKey)
    ? (closings.find((c) => c && c.monthKey === monthKey) || null)
    : null;

  const rows = disponivel ? buildProfitabilityRows(fm) : [];

  return {
    modoApi,
    disponivel,
    monthKey,
    // As notas são resolvidas aqui, uma vez, e não com ifs espalhados pelo JSX.
    rows: rows.map((r) => ({ ...r, ...resolveRowNote({ row: r, closing }) })),
    warnings: disponivel ? (fm.warnings || []) : [],
    /* Ressalva do mês âncora. `null` quando a âncora é elegível — o caso normal, em que
     * não há nada a acrescentar ao rótulo "Mês de referência". */
    anchorNotice: disponivel ? buildAnchorNotice(financeiro) : null,
  };
}