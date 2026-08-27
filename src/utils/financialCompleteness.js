// src/utils/financialCompleteness.js
// COMPLETUDE FINANCEIRA DE UM MÊS — puro, read-only, sem UI e sem escrita.
//
// ─── PORQUE ISTO EXISTE (24/08/2026) ────────────────────────────────────────────────
// `buildMonthlyClosing` responde bem a UMA pergunta: "o utilizador preencheu tudo o que
// lhe foi pedido?". O catálogo de requisitos tem hoje uma entrada (o CMV), pelo que
// preencher o CMV esgotava os requisitos e o mês ficava COMPLETE.
//
// O defeito era tratar essa resposta como se fosse outra: "este mês pode sustentar
// KPIs de rentabilidade?". Medido em dados reais de julho/2026, com um CMV sintético
// injetado só em memória:
//
//   receita bruta          172 899,40   real
//   deduções                20 882,02   PARTIAL
//   despesas operacionais   12 127,28   PARTIAL
//   CMV                    111 111,11   manual
//   EBITDA                  28 778,99   PARTIAL
//   closing.status          complete            <- requisitos satisfeitos
//   latestCompleteMonthKey  2026-07             <- e julho virava a âncora dos KPIs
//
// Informar o CMV resolve o CMV. Não torna completas as contas a pagar de julho, que a
// cobertura declara fechadas só até junho. O mês ficava "completo" com um EBITDA que o
// próprio motor marcava como parcial — e os KPIs de rentabilidade passavam a assentar
// nele. É essa a contradição que este módulo separa.
//
// ─── QUATRO PERGUNTAS, QUATRO RESPOSTAS ─────────────────────────────────────────────
//   1. requirementsStatus      "o utilizador preencheu tudo o que lhe foi pedido?"
//                              -> vem inteiro de buildMonthlyClosing; não se recalcula.
//   2. sourceCompleteness      "as fontes necessárias estão completas?"
//                              -> só as linhas que vêm do ERP; o CMV NÃO conta.
//   3. financialAnalysisStatus "a análise financeira do mês está completa?"
//                              -> todas as linhas essenciais, incluindo o CMV.
//   4. anchorEligible          "este mês pode ser a referência oficial da rentabilidade?"
//                              -> exige as três anteriores E atividade real no mês.
//
// Colapsar quaisquer duas destas foi exatamente o que produziu o defeito. Não voltar a
// colapsá-las: um mês pode ter (1) satisfeito e (2) por satisfazer, e é esse o caso
// normal enquanto as faturas de fornecedor de um mês chegam depois do mês acabar.
//
// ─── NÃO CALCULA DINHEIRO ───────────────────────────────────────────────────────────
// Lê `availability`, nunca valores. Um mês com prejuízo é tão completo como um mês com
// lucro: este módulo não tem opinião sobre resultados, só sobre a solidez da base.

import { combineAvailability } from "./dreEngine.js";
import { CLOSING_STATUS } from "./monthlyClosing.js";

/** Estado de completude de um eixo. Deliberadamente NÃO reutiliza CLOSING_STATUS:
 *  aquele fala de requisitos do utilizador, este fala de disponibilidade de dados. */
export const FINANCIAL_COMPLETENESS = {
  COMPLETE: "complete",         // todas as linhas do eixo têm dado utilizável
  PARTIAL: "partial",           // alguma linha está subavaliada (cobertura ou classificação)
  UNAVAILABLE: "unavailable",   // alguma linha não tem fonte de todo
  IN_PROGRESS: "in_progress",   // o mês civil ainda não terminou: cedo, não incompleto
};

/**
 * DE ONDE VEIO a âncora dos KPIs.
 *
 * ─── PORQUE ISTO EXISTE ─────────────────────────────────────────────────────────────
 * A seleção da âncora é `mesElegivel || mesUsavel`. O segundo termo é um recurso: aceita
 * o último mês com RECEITA real, sem olhar às contas a pagar nem ao CMV. Sem este campo,
 * os dois casos chegavam à UI indistinguíveis — e foi medido que produzem estados muito
 * diferentes (matriz em `financialAnchor.test.js`):
 *
 *   contas a pagar ausentes  -> âncora = julho, deduções/EBITDA/resultado `unavailable`
 *   cobertura atrasada       -> âncora = julho, deduções/despesas `partial`
 *
 * Em ambos, `referenciaAtrasada` ficava `false` — literalmente verdade (a âncora É o mês
 * civil), mas lida como "está tudo em dia" sobre um mês cujo EBITDA não é calculável.
 *
 * O recurso mantém-se, e de propósito: um mês com receita e deduções verdadeiras ainda
 * responde a perguntas úteis, ao passo que `null` apagaria o Resumo inteiro. O que não
 * se mantém é o silêncio — quem mostra o número passa a saber de que material é feito.
 */
export const ANCHOR_SOURCE = {
  /** O mês passou em todos os critérios de elegibilidade. É a referência oficial. */
  ELIGIBLE: "eligible",
  /** Nenhum mês da janela é elegível: usou-se o último mês com receita real. Os números
   *  são verdadeiros no que têm, mas o mês NÃO está financeiramente completo. */
  FALLBACK: "fallback",
  /** Não há mês nenhum utilizável. `monthKey` é null e não há métricas. */
  NONE: "none",
};

/** Porque é que um mês NÃO pode ser âncora. Códigos, não frases: a redação pertence
 *  às camadas de apresentação, que já sabem em que língua estão. */
export const ANCHOR_BLOCKER = {
  MES_EM_CURSO: "mes_em_curso",
  REQUISITOS_POR_PREENCHER: "requisitos_por_preencher",
  REQUISITOS_POR_APURAR: "requisitos_por_apurar",
  SEM_ATIVIDADE: "sem_atividade",
  ANALISE_INCOMPLETA: "analise_incompleta",
};

/** Porque é que uma linha essencial não está completa. Eixos independentes: uma linha
 *  pode estar parcial pelos dois motivos ao mesmo tempo. */
export const LINE_CAUSE = {
  COBERTURA: "cobertura",           // o período ainda não fechou na fonte
  CLASSIFICACAO: "classificacao",   // há títulos cuja natureza não foi reconhecida
  SEM_FONTE: "sem_fonte",           // a fonte não existe para este mês
  POR_INFORMAR: "por_informar",     // requisito do utilizador ainda por preencher
};

/* Availabilities que contam como dado utilizável. Igual ao critério de
 * monthlyClosing.AVAILABILITY_UTILIZAVEL — e igual de propósito: se um dado serve
 * para fechar um requisito, serve para sustentar a linha da DRE que dele depende.
 * "partial" fica de fora: um mínimo conhecido não é o total do mês. */
const UTILIZAVEL = ["real", "manual", "mixed"];

/**
 * LINHAS ESSENCIAIS da DRE — as que, faltando, tornam a rentabilidade do mês uma
 * afirmação insegura. São as linhas BASE, não as derivadas: `lucroBruto`, `ebitda` e
 * `resultadoLiquido` são combinações destas, pelo que avaliá-las seria contar o mesmo
 * defeito duas vezes e, pior, esconder QUAL a linha responsável.
 *
 * `freteVenda` está deliberadamente FORA: desde a F3 é informativo e não entra em
 * dedução nenhuma. Um pedido sem o campo de frete não pode bloquear o mês.
 *
 * `origem` separa o que a plataforma vai buscar ao ERP do que só o utilizador pode
 * dar. É essa distinção que permite responder "as fontes estão completas?" sem que a
 * resposta dependa de o utilizador já ter lançado o CMV.
 */
export const ESSENTIAL_LINES = [
  { key: "revenueGross",      label: "Receita bruta",         origem: "fonte" },
  { key: "deductions",        label: "Deduções",              origem: "fonte" },
  { key: "cmv",               label: "CMV",                   origem: "requisito" },
  { key: "operatingExpenses", label: "Despesas operacionais", origem: "fonte" },
  { key: "withdrawals",       label: "Retiradas de sócios",   origem: "fonte" },
];

/** Traduz uma availability combinada para o vocabulário de completude. */
function estadoDe(availabilities) {
  // combineAvailability já filtra nulls e devolve "unavailable" para lista vazia:
  // ausência de linhas é ausência de base, nunca completude por vacuidade.
  const combinada = combineAvailability(...availabilities);
  if (combinada === "unavailable") return FINANCIAL_COMPLETENESS.UNAVAILABLE;
  if (combinada === "partial") return FINANCIAL_COMPLETENESS.PARTIAL;
  return FINANCIAL_COMPLETENESS.COMPLETE;
}

/**
 * Causas da incompletude de UMA linha. Devolve uma lista porque as causas coexistem:
 * as despesas operacionais de um mês podem estar parciais por cobertura E por
 * classificação, e reportar só a primeira mandaria o utilizador resolver metade.
 *
 * A decomposição só é possível para as linhas que saem das contas a pagar, e usa dois
 * sinais que o motor de DRE já produz — nenhum é recalculado aqui:
 *   - `availability.payablesCoverage`, a cobertura TEMPORAL isolada;
 *   - o warning `titulos-nao-classificados`, emitido por mês pelo próprio motor.
 */
function causasDaLinha(linha, availability, metrics, naoAplicavel) {
  if (naoAplicavel) return [];
  if (UTILIZAVEL.includes(availability)) return [];
  if (linha.origem === "requisito") return [LINE_CAUSE.POR_INFORMAR];
  if (availability === "unavailable" || availability == null) return [LINE_CAUSE.SEM_FONTE];

  const disp = (metrics && metrics.availability) || {};
  const cobertura = disp.payablesCoverage;
  const temNaoClassificados = (metrics && metrics.warnings || [])
    .some((w) => w && w.code === "titulos-nao-classificados");

  const causas = [];
  // A receita não vem das contas a pagar: a sua parcialidade é sempre de cobertura.
  if (linha.key === "revenueGross") return [LINE_CAUSE.COBERTURA];
  if (cobertura === "partial" || cobertura === "unavailable") causas.push(LINE_CAUSE.COBERTURA);
  // Só a linha de despesas operacionais carrega a completude da classificação — é a
  // única cuja soma exclui títulos por reconhecer (ver dreEngine.dispClassificacaoOpex).
  if (linha.key === "operatingExpenses" && temNaoClassificados) causas.push(LINE_CAUSE.CLASSIFICACAO);
  // Parcial sem causa identificável continua a ser parcial: nunca se inventa "completo"
  // por não se saber explicar porquê.
  return causas.length ? causas : [LINE_CAUSE.COBERTURA];
}

/**
 * Completude financeira de um mês.
 *
 * @param {{metrics?: object|null, closing?: object|null}} args
 *   `metrics` é o resultado de buildFinancialMetrics; `closing` o de buildMonthlyClosing.
 *   Os dois descrevem o MESMO mês — este módulo não os constrói nem os reconcilia.
 * @returns {null|{
 *   monthKey: string,
 *   requirementsStatus: string|null,
 *   sourceCompleteness: string,
 *   financialAnalysisStatus: string,
 *   anchorEligible: boolean,
 *   anchorBlockers: string[],
 *   lines: Array<{key, label, origem, availability, causes: string[]}>,
 *   blockers: Array<{key, label, origem, availability, causes: string[]}>
 * }}
 */
export function buildFinancialCompleteness({ metrics, closing } = {}) {
  const mk = (closing && closing.monthKey) || (metrics && metrics.monthKey) || null;
  if (!mk) return null;

  const disp = (metrics && metrics.availability) || {};

  /* REQUISITO NÃO APLICÁVEL NÃO BLOQUEIA — regra de produto, não conveniência.
   *
   * Num mês com receita real ZERO o motor de fecho declara o CMV `not_applicable`:
   * não houve venda, não há custo de mercadoria vendida a pedir. A availability da
   * linha continua, ainda assim, `unavailable` — o dreEngine não conhece o eixo da
   * aplicabilidade e limita-se a dizer que não recebeu valor nenhum.
   *
   * Sem esta leitura, esse mês era reportado com "CMV por preencher": mandava o
   * utilizador lançar um dado que a própria plataforma tinha acabado de declarar
   * inexigível. A linha é retirada da avaliação — nem completa nem bloqueadora, porque
   * não há dado a avaliar — e a distinção fica visível em `notApplicable`.
   *
   * O que NÃO muda: um mês assim continua fora dos KPIs, mas por SEM_ATIVIDADE, que é
   * a razão verdadeira. As linhas derivadas (lucro bruto, EBITDA) continuam `null`
   * nesse mês — dívida conhecida e documentada em docs/FINANCIAL_COMPLETENESS_CONTRACT.md:
   * exigiria o dreEngine tratar "não aplicável" como zero económico, o que é uma
   * mudança de semântica da DRE e não uma correção desta camada. */
  const itensDoFecho = (closing && Array.isArray(closing.items)) ? closing.items : [];
  const naoAplicavel = (key) => itensDoFecho
    .some((i) => i && i.key === key && i.status === "not_applicable");

  const lines = ESSENTIAL_LINES.map((l) => {
    const availability = disp[l.key] ?? null;
    const na = l.origem === "requisito" && naoAplicavel(l.key);
    return { ...l, availability, notApplicable: na, causes: causasDaLinha(l, availability, metrics, na) };
  });
  // Só as linhas que têm mesmo algo a avaliar entram nos vereditos.
  const avaliaveis = lines.filter((l) => !l.notApplicable);

  /* O mês em curso não está incompleto: está a decorrer. Distingui-los evita que a UI
   * peça ao utilizador para completar um mês que ainda nem acabou — o mesmo cuidado
   * que CLOSING_STATUS.IN_PROGRESS já tem do lado dos requisitos. */
  const emCurso = closing ? closing.status === CLOSING_STATUS.IN_PROGRESS : false;

  const daFonte = avaliaveis.filter((l) => l.origem === "fonte");
  const sourceCompleteness = emCurso
    ? FINANCIAL_COMPLETENESS.IN_PROGRESS
    : estadoDe(daFonte.map((l) => l.availability));
  const financialAnalysisStatus = emCurso
    ? FINANCIAL_COMPLETENESS.IN_PROGRESS
    : estadoDe(avaliaveis.map((l) => l.availability));

  const blockers = avaliaveis.filter((l) => !UTILIZAVEL.includes(l.availability));

  /* ── ELEGIBILIDADE COMO ÂNCORA ───────────────────────────────────────────────────
   * Todas as condições, e não a mais forte: um mês pode falhar por vários motivos ao
   * mesmo tempo, e mostrar só um faria o utilizador resolver um e voltar à mesma
   * pergunta. A lista é ordenada do mais estrutural para o mais específico. */
  const anchorBlockers = [];
  if (emCurso) {
    anchorBlockers.push(ANCHOR_BLOCKER.MES_EM_CURSO);
  } else {
    if (closing && closing.status === CLOSING_STATUS.INCOMPLETE) {
      anchorBlockers.push(ANCHOR_BLOCKER.REQUISITOS_POR_PREENCHER);
    }
    if (closing && closing.status === CLOSING_STATUS.INDETERMINATE) {
      anchorBlockers.push(ANCHOR_BLOCKER.REQUISITOS_POR_APURAR);
    }
    /* COMPLETO POR VACUIDADE não é âncora. Um mês sem uma única venda fecha sozinho
     * (sem receita, o CMV fica not_applicable e não sobra requisito nenhum), com
     * `totalComplete: 0`. As margens de um mês sem vendas não significam nada — era
     * um defeito real de latestCompleteMonthKey, e a guarda mantém-se aqui. */
    if (closing && closing.status === CLOSING_STATUS.COMPLETE && !(closing.totalComplete > 0)) {
      anchorBlockers.push(ANCHOR_BLOCKER.SEM_ATIVIDADE);
    }
    if (financialAnalysisStatus !== FINANCIAL_COMPLETENESS.COMPLETE) {
      anchorBlockers.push(ANCHOR_BLOCKER.ANALISE_INCOMPLETA);
    }
  }
  /* Sem fecho não há veredito possível: nada prova que o mês terminou, nada prova que
   * os requisitos foram apurados. Ausência de prova nunca é prova. */
  if (!closing) anchorBlockers.push(ANCHOR_BLOCKER.REQUISITOS_POR_APURAR);

  return {
    monthKey: mk,
    requirementsStatus: closing ? closing.status : null,
    sourceCompleteness,
    financialAnalysisStatus,
    anchorEligible: anchorBlockers.length === 0,
    anchorBlockers,
    lines,
    blockers,
  };
}

/**
 * O último mês ELEGÍVEL COMO ÂNCORA de uma lista de fechos já enriquecidos.
 *
 * Substitui `monthlyClosing.latestCompleteMonthKey` como seletor da âncora dos KPIs.
 * Aquele continua exportado e correto para o que o nome diz — "o último mês cujos
 * REQUISITOS estão satisfeitos" — mas essa pergunta não é a que a âncora faz, e usá-lo
 * aqui foi o defeito: com o CMV de julho lançado devolvia julho, apesar de as despesas
 * operacionais e as deduções desse mês continuarem parciais.
 *
 * PURA: recebe fechos já construídos, em qualquer ordem, e não sabe o que é um CMV.
 *
 * @param {Array} closings Fechos com o bloco `financial` de buildFinancialCompleteness.
 *   Um fecho sem esse bloco é IGNORADO — nunca assumido elegível: sem o veredito não há
 *   base para o afirmar, e a omissão silenciosa seria o regresso do mesmo defeito.
 * @returns {string|null}
 */
export function latestAnchorEligibleMonthKey(closings) {
  if (!Array.isArray(closings)) return null;
  let melhor = null;
  for (const c of closings) {
    const fin = c && c.financial;
    if (!fin || fin.anchorEligible !== true) continue;
    const mk = fin.monthKey;
    // Comparação lexicográfica de "aaaa-mm": correta e sem parsing de datas.
    if (typeof mk === "string" && (melhor === null || mk > melhor)) melhor = mk;
  }
  return melhor;
}
