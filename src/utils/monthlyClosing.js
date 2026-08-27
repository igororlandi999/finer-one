// src/utils/monthlyClosing.js
// MOTOR DE FECHO MENSAL — puro, read-only, sem escrita e sem UI.
//
// Responde a uma única pergunta: "este mês tem todos os dados obrigatórios para que os
// indicadores financeiros sejam calculáveis?" — e, se não tiver, quais faltam.
//
// ─── INDEPENDÊNCIA DE ERP (requisito de arquitetura, não detalhe) ───────────────────
// Este ficheiro não sabe, e não pode saber, qual a integração ligada. Não existe aqui
// nenhuma referência a Bling, Moloni, Primavera, PHC, Sage, Jasmin, TOConline ou outro.
// A camada de integração é responsável por normalizar cada fonte em availability; o
// motor pergunta apenas "tenho este dado de forma fiável?", nunca "quem o forneceu?".
// Uma integração que forneça CMV automaticamente produz availability "real" e o mês
// fecha sem qualquer pendência, sem uma linha de código diferente.
//
// ─── FECHO NÃO É RENTABILIDADE ──────────────────────────────────────────────────────
// Um mês completo pode ter prejuízo; um mês incompleto pode ter receita alta. Este
// motor não lê resultados, apenas disponibilidade. Nada aqui calcula dinheiro.

import { currentMonthKey } from "./performanceCalculations.js";

/** Estados do mês. Deliberadamente sem "closed": fechar formalmente implicaria uma
 *  ação do utilizador que ainda não existe, e afirmá-la seria mentir sobre o produto. */
export const CLOSING_STATUS = {
  IN_PROGRESS: "in_progress",   // o mês civil ainda não terminou
  INCOMPLETE: "incomplete",     // terminou e falta dado obrigatório CONFIRMADO
  COMPLETE: "complete",         // terminou e tem tudo o que é exigido
  /* O mês civil terminou, mas a plataforma NÃO tem informação suficiente para afirmar
   * honestamente se o fecho está completo ou incompleto. Não é um mês em atraso (nada
   * está confirmadamente em falta) nem um mês fechado (nada garante que esteja).
   *
   * Existe porque os três estados anteriores seriam, todos, afirmações falsas neste
   * caso: "ainda não terminou" é falso, "falta dado obrigatório" é falso (não sabemos
   * se o dado é exigível) e "tem tudo o que é exigido" é falso (não sabemos o que é
   * exigido). A pergunta "este mês fecha?" passou a ter três respostas — sim, não, e
   * não é possível saber — e um enum de dois valores terminais não a comporta. */
  INDETERMINATE: "indeterminate",
};

/** Estado de cada requisito dentro do mês. */
export const ITEM_STATUS = {
  COMPLETE: "complete",
  MISSING: "missing",           // em falta num mês que já terminou, dentro da cobertura
  /* Ainda por apurar. TRÊS origens documentadas, deliberadamente no mesmo estado:
   *   1. o mês civil ainda está em curso — não é atraso, é cedo;
   *   2. o mês é anterior à cobertura histórica confiável — não há base para exigir;
   *   3. a APLICABILIDADE do requisito não é determinável (ver APPLICABILITY abaixo)
   *      — não sabemos sequer se o dado é exigível neste mês.
   * As três partilham a consequência observável: fora de missingItems, sem alerta,
   * e nunca contadas como requisito satisfeito. Distingui-las em `status` exigiria
   * um eixo novo que nenhum consumidor lê hoje; a origem continua derivável dos
   * inputs (mês vs. relógio, mês vs. cobertura, availability da receita). */
  PENDING: "pending",
  // O requisito existe mas não precisa de ser satisfeito NESTE mês — distinto de
  // "completo" (não há dado a avaliar), de "sem cobertura" e de "indeterminado"
  // (nesses, o mês É ou poderia ser avaliável e a exigência continua em aberto).
  // Nunca inferido de ausência: só de um valor fiável que PROVE que não se aplica.
  NOT_APPLICABLE: "not_applicable",
};

/* Veredito de aplicabilidade de um requisito NUM mês concreto. Eixo separado do
 * `status`: responde a "este dado é exigível aqui?", não a "este dado existe?".
 *
 * `INDETERMINATE` é o valor que impede a falsa cobrança: quando a plataforma não
 * consegue provar que houve atividade no mês, não pode exigir o dado — mas também
 * não pode declarar que não se aplica. Ausência de prova não é prova de ausência,
 * nos dois sentidos. */
const APPLICABILITY = {
  APPLICABLE: "applicable",
  NOT_APPLICABLE: "not_applicable",
  INDETERMINATE: "indeterminate",
};

/* Availabilities que contam como dado utilizável. "partial" fica de fora de propósito:
 * cobertura parcial não é o dado completo do mês, e tratá-la como completa produziria
 * um fecho falso. "manual" conta tanto como "real" — a origem não altera a completude. */
const AVAILABILITY_UTILIZAVEL = ["real", "manual", "mixed"];

/**
 * Catálogo de requisitos de fecho. Lista de propósito: o CMV é apenas o primeiro.
 * Acrescentar impostos sobre o lucro, depreciações ou inventário é acrescentar uma
 * entrada aqui, sem tocar na agregação nem nos estados.
 *
 * `resolve(metrics)` devolve { availability, value } lidos das métricas já normalizadas.
 * `impact` declara que indicadores deixam de ser calculáveis sem este dado — é usado
 * para explicar a pendência ao utilizador, e está coberto por um teste que o confronta
 * com a availability real das métricas, para não poder divergir em silêncio.
 *
 * `applicability(metrics)` é OPCIONAL e devolve um valor de APPLICABILITY. Um
 * requisito sem esta função é sempre `applicable` — o comportamento de antes desta
 * rubrica existir. Só o CMV a define hoje.
 */
export const CLOSING_REQUIREMENTS = [
  {
    key: "cmv",
    label: "CMV",
    title: "Custo das mercadorias vendidas",
    required: true,
    priority: "critical",   // bloqueia lucro bruto, EBITDA e resultado líquido
    impact: ["grossProfit", "grossMarginPct", "ebitda", "ebitdaMarginPct", "netResult", "netMarginPct"],
    resolve: (metrics) => ({
      availability: metrics?.cmv?.availability ?? null,
      // 0 é valor real informado. Só se lê o valor quando há dado; nunca se converte
      // ausência em zero, nem se usa truthy para decidir se existe.
      value: metrics?.cmv?.value ?? null,
    }),
    /* REGRA: a Finer One só pode EXIGIR o CMV quando consegue provar que houve
     * atividade de venda no mês. Não basta não conseguir provar o contrário.
     *
     * A prova é a receita BRUTA, não a líquida: a líquida depende também da
     * disponibilidade das contas a pagar (comissões, devoluções, impostos), uma fonte
     * independente — usá-la acoplaria "houve venda?" a uma disponibilidade que nada
     * tem a ver com a pergunta. A bruta vem só dos pedidos.
     *
     * Três respostas possíveis, e só a primeira autoriza cobrar o dado:
     *   real e ≠ 0  -> applicable      houve venda comprovada; o CMV é exigível.
     *   real e = 0  -> not_applicable  não houve venda comprovada; não há CMV a pedir.
     *   partial     -> indeterminate   receita subavaliada por definição (histórico
     *                                  incompleto): um zero aqui pode ser lacuna de
     *                                  cobertura, e um valor > 0 não garante que o
     *                                  mês esteja inteiro. Não se cobra, mas também
     *                                  não se declara inaplicável.
     *   unavailable -> indeterminate   sem fonte de pedidos, ou mês anterior à
     *                                  cobertura: nada a afirmar em nenhum sentido.
     *
     * Um `gross` não numérico com availability "real" é uma contradição da camada de
     * métricas (real significa que há valor). Trata-se como indeterminado — nunca
     * como zero, que seria inventar a ausência de vendas a partir da ausência de dado.
     */
    applicability: (metrics) => {
      const receita = metrics?.revenue || {};
      if (receita.grossAvailability !== "real") return APPLICABILITY.INDETERMINATE;
      if (typeof receita.gross !== "number") return APPLICABILITY.INDETERMINATE;
      return receita.gross === 0 ? APPLICABILITY.NOT_APPLICABLE : APPLICABILITY.APPLICABLE;
    },
  },
];

function isDadoUtilizavel(availability) {
  return typeof availability === "string" && AVAILABILITY_UTILIZAVEL.includes(availability);
}

/**
 * O mês está dentro da cobertura histórica confiável da empresa?
 *
 * Só compara chaves "aaaa-mm" com `coverage.firstCompleteMonth` — a mesma âncora já
 * usada pelo motor de DRE (dreEngine.sourceAvailability) para decidir se uma fonte é
 * real, parcial ou indisponível. Não se reimplementa aqui a disponibilidade da fonte:
 * só se responde "este período existe no histórico de que a empresa dispõe?", o que
 * é anterior e mais grosseiro do que "os dados deste período estão completos?".
 *
 * Sem `coverage` (ou sem `firstCompleteMonth`), não há limite conhecido: todo o mês
 * é considerado coberto — o comportamento de antes de existir este conceito.
 */
function historicamenteCoberto(mk, coverage) {
  const primeiro = coverage && coverage.firstCompleteMonth;
  return !primeiro || mk >= primeiro;
}

/**
 * Os últimos `count` meses civis JÁ TERMINADOS, do mais recente para o mais antigo.
 *
 * Em 21/08/2026 com count 3: ["2026-07", "2026-06", "2026-05"]. O mês em curso nunca
 * entra, e a viragem de ano resolve-se sozinha porque a aritmética é feita com Date
 * local (mês -1 em janeiro cai em dezembro do ano anterior) e não por manipulação de
 * strings nem por new Date("aaaa-mm"), que seria interpretado como UTC.
 *
 * A janela é de CALENDÁRIO. Não depende de existirem movimentos: um mês terminado sem
 * um único documento continua a ser um mês que precisa dos seus dados obrigatórios.
 *
 * @param {{now?: Date, count?: number}} args
 * @returns {string[]}
 */
export function closedMonthKeys({ now = new Date(), count = 3 } = {}) {
  const total = Number.isInteger(count) && count > 0 ? count : 0;
  const ano = now.getFullYear();
  const mes = now.getMonth();          // 0-11, mês em curso
  const out = [];
  for (let i = 1; i <= total; i++) {
    const d = new Date(ano, mes - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * O último mês com os REQUISITOS SATISFEITOS de uma lista de fechos já apurados.
 *
 * ─── NÃO É A ÂNCORA DOS KPIs (24/08/2026) ───────────────────────────────────────────
 * DEPRECADO como seletor de âncora: usar `financialCompleteness.latestAnchorEligibleMonthKey`.
 *
 * O nome dizia "COMPLETO" e a função respondia a "os requisitos do catálogo estão
 * satisfeitos?". Enquanto o catálogo tiver uma entrada — o CMV — as duas perguntas
 * parecem a mesma, e não são: lançar o CMV de julho esgotava o catálogo, o mês ficava
 * COMPLETE e a rentabilidade passava a ancorar num mês cujas deduções e despesas
 * operacionais o próprio motor marcava como `partial`. Informar o CMV resolve o CMV;
 * não fecha as contas a pagar de julho.
 *
 * Continua exportada e correta PARA O QUE FAZ, e é o que consumidores de requisitos
 * devem usar. Não a voltar a ligar à âncora.
 *
 * ─── PORQUE ISTO EXISTE (24/08/2026) ───────────────────────────────────────────────
 * "Último mês civil encerrado" e "último mês financeiramente completo" são perguntas
 * diferentes, e durante muito tempo tiveram a mesma resposta por acidente: enquanto
 * `closedThroughMonth` era avançado à mão só depois de o CMV estar lançado, o último
 * mês declarado fechado era, por construção, também o último mês completo.
 *
 * Separados os eixos, deixam de coincidir. Em 24/08/2026 julho é o último mês civil
 * encerrado — e é bom que o seja, porque é isso que autoriza pedir-lhe o CMV — mas
 * não tem CMV, pelo que lucro bruto, EBITDA e resultado líquido são `null`. Ancorar
 * os KPIs de rentabilidade em julho encheria o Resumo de traços onde havia números.
 *
 * A regra é: os KPIs ancoram no último mês que a plataforma consegue calcular por
 * inteiro; a lista de pendências ancora no calendário. Junho continua a responder
 * "quanto ganhámos", julho responde "o que falta".
 *
 * ─── COMPLETE NÃO CHEGA: O MÊS TEM DE TER SIDO COMPLETADO ──────────────────────────
 * Um mês SEM ATIVIDADE NENHUMA é COMPLETE por vacuidade: sem receita, o CMV fica
 * `not_applicable`, não sobra requisito nenhum por satisfazer e o mês fecha — com
 * `totalComplete: 0`. É um veredito correto para "este mês pode fechar?" e péssimo
 * para "onde ancoro os KPIs?": as margens de um mês sem vendas não significam nada, e
 * um mês vazio de abril ganharia a um junho movimentado só por não ter nada a dever.
 *
 * Foi um defeito real desta função, apanhado pela suite ao escolher um mês sem um
 * único pedido como âncora financeira. A condição extra `totalComplete > 0` exige que
 * pelo menos um requisito tenha sido efetivamente SATISFEITO — não apenas dispensado.
 *
 * PURA e sem opinião sobre a origem: recebe fechos já construídos. Não sabe o que é
 * um CMV nem consulta cobertura — se um dia o catálogo de requisitos crescer, esta
 * função não muda.
 *
 * @param {Array} closings Fechos de `buildMonthlyClosing`, em qualquer ordem.
 * @returns {string|null} A chave "aaaa-mm" mais recente completa E não-vazia, ou null.
 */
export function latestCompleteMonthKey(closings) {
  if (!Array.isArray(closings)) return null;
  let melhor = null;
  for (const c of closings) {
    if (!c || c.status !== CLOSING_STATUS.COMPLETE) continue;
    if (!(c.totalComplete > 0)) continue;   // completo por vacuidade: não é âncora
    const mk = c.monthKey;
    // Comparação lexicográfica de "aaaa-mm": correta e sem parsing de datas.
    if (typeof mk === "string" && (melhor === null || mk > melhor)) melhor = mk;
  }
  return melhor;
}

/**
 * Estado de fecho de um mês.
 *
 * Inputs mínimos por decisão: `metrics` já traz `monthKey` e a availability de cada
 * rubrica, pelo que não é preciso reencaminhar orders, payables nem o mapa de ajustes
 * manuais. Passar datasets inteiros aqui só criaria acoplamento sem informação nova.
 *
 * SEMÂNTICA DAS LISTAS (deliberada, não acidental):
 *   items          — TODOS os requisitos conhecidos, obrigatórios e opcionais;
 *   missingItems   — apenas requisitos OBRIGATÓRIOS confirmadamente em falta;
 *   completedItems — apenas requisitos OBRIGATÓRIOS completos.
 *
 * `missingItems` nunca contém `not_applicable` nem `pending`: são as pendências que
 * se podem, com honestidade, pedir ao utilizador. É essa garantia que faz com que
 * `closingAlerts` não precise de conhecer aplicabilidade nem cobertura.
 *
 * Uma rubrica opcional ausente não impede o fecho do mês, e por isso também não pode
 * aparecer entre as pendências: seria pedir ao utilizador algo que não é exigido.
 * Se um dia for preciso acompanhar opcionais, acrescenta-se uma vista própria — não se
 * mistura com estas, que respondem à pergunta "o mês pode fechar?".
 *
 * `requirements` existe para permitir compor e testar catálogos alternativos sem mexer
 * na constante global. Produção nunca o passa.
 *
 * `coverage`, se passada, é `{firstCompleteMonth}` (mesma forma da cobertura histórica
 * da empresa — ver dreEngine.EMPTY_COVERAGE). Um mês anterior a `firstCompleteMonth`
 * não é avaliável: os seus requisitos obrigatórios ficam PENDING (não MISSING), o mês
 * não entra em missingItems e por isso não gera alerta — sem que isso o confunda com
 * "completo" no sentido em que um mês com todos os dados o é. Sem `coverage`, nenhum
 * mês tem limite: o comportamento é o de antes deste conceito existir.
 *
 * @param {{metrics?: object|null, monthKey?: string|null, now?: Date, requirements?: Array,
 *           coverage?: {firstCompleteMonth?: string|null}}} args
 * @returns {{monthKey, status, totalRequired, totalComplete, totalMissing,
 *            items: Array, missingItems: Array, completedItems: Array}|null}
 */
export function buildMonthlyClosing({
  metrics, monthKey, now = new Date(), requirements = CLOSING_REQUIREMENTS, coverage,
} = {}) {
  const mk = monthKey || metrics?.monthKey || null;
  if (!mk) return null;

  /* Âncora de CIVIL, não de dados. O mês a fechar é determinado pelo calendário e
   * nunca pelo último mês com movimento: um mês sem um único título continua a ser um
   * mês que terminou e que precisa dos seus dados obrigatórios. É a mesma correção já
   * aplicada às Despesas — por isso este motor não consulta nada parecido com o último
   * mês de contas a pagar. */
  const atual = currentMonthKey(now);
  const terminou = mk < atual;   // comparação lexicográfica de "aaaa-mm", sem parsing de datas
  const coberto = historicamenteCoberto(mk, coverage);

  /* A aplicabilidade é apurada por item e guardada AO LADO do item, não dentro dele:
   * é um eixo interno de decisão, e expô-la no shape público criaria um campo que
   * nenhum consumidor lê hoje. */
  const avaliados = (requirements || []).map((req) => {
    const { availability, value } = req.resolve(metrics);
    const utilizavel = isDadoUtilizavel(availability);
    const aplicabilidade = req.applicability
      ? req.applicability(metrics)
      : APPLICABILITY.APPLICABLE;

    /* ORDEM DELIBERADA: a aplicabilidade decide ANTES da presença do dado.
     * Consequência conhecida e mantida: num mês com receita real 0 em que o
     * utilizador informou o CMV à mão, o requisito fica not_applicable em vez de
     * complete. O valor manual continua guardado e legível nas métricas — não é
     * apagado nem ignorado a jusante; apenas não é o CMV que fazia o mês fechar,
     * porque não havia nada a exigir. Dívida registada: se um dia se quiser que um
     * dado presente ganhe sempre ao veredito de aplicabilidade, é trocar estes dois
     * ramos — e é uma mudança de semântica, não uma correção. */
    let status;
    if (aplicabilidade === APPLICABILITY.NOT_APPLICABLE) {
      status = ITEM_STATUS.NOT_APPLICABLE;
    } else if (utilizavel) {
      status = ITEM_STATUS.COMPLETE;
    } else if (!terminou || !coberto || aplicabilidade === APPLICABILITY.INDETERMINATE) {
      // As três origens de PENDING: mês em curso; mês fora da cobertura histórica;
      // aplicabilidade não determinável. Nenhuma é um dado em atraso.
      status = ITEM_STATUS.PENDING;
    } else {
      status = ITEM_STATUS.MISSING;
    }

    return {
      aplicabilidade,
      item: {
        key: req.key,
        label: req.label,
        title: req.title,
        required: req.required,
        priority: req.priority,
        impact: req.impact,
        status,
        source: utilizavel ? availability : null,
        value: utilizavel ? value : null,
      },
    };
  });

  const items = avaliados.map((a) => a.item);

  /* O fecho é decidido SÓ pelos obrigatórios. `required: false` num requisito futuro
   * não pode impedir o mês de fechar, nem inflacionar os totais de pendências. */
  const obrigatorios = avaliados.filter((a) => a.item.required === true);
  const completedItems = items.filter((i) => i.required === true && i.status === ITEM_STATUS.COMPLETE);
  const missingItems = items.filter((i) => i.required === true && i.status === ITEM_STATUS.MISSING);
  const pendentes = obrigatorios.filter((a) => a.item.status === ITEM_STATUS.PENDING);

  /* ── SEMÂNTICA DOS TOTAIS ──────────────────────────────────────────────────────
   * `totalRequired` = requisitos obrigatórios cuja APLICABILIDADE foi apurada neste
   * mês e que continuam em aberto ou resolvidos — ou seja, tudo menos:
   *   - os `not_applicable` (a aplicabilidade foi apurada: não se aplicam);
   *   - os que estão PENDING por aplicabilidade INDETERMINADA (não se sabe sequer
   *     se são exigíveis, logo contá-los seria afirmar uma exigência que não existe).
   * Um PENDING por tempo (mês em curso) ou por falta de cobertura CONTINUA a contar:
   * aí o requisito é reconhecidamente exigível, só ainda não foi possível resolvê-lo.
   *
   * `totalComplete` e `totalMissing` contam exatamente `completedItems` e
   * `missingItems`. Um mês INDETERMINATE tem os três a zero (ou totalRequired > 0 com
   * os outros a zero, se a indeterminação vier da cobertura): em nenhum caso um mês
   * indeterminado pode parecer completo, porque `totalComplete` só cresce com dados
   * realmente presentes. A soma totalComplete + totalMissing só fecha em
   * totalRequired quando não há nada pendente — e isso é o sinal, não um defeito.
   *
   * `totalPending` NÃO é exposto: nenhum consumidor o lê hoje.
   * ──────────────────────────────────────────────────────────────────────────── */
  const contaveis = obrigatorios.filter((a) =>
    a.aplicabilidade !== APPLICABILITY.NOT_APPLICABLE
    && !(a.item.status === ITEM_STATUS.PENDING && a.aplicabilidade === APPLICABILITY.INDETERMINATE));

  /* PRECEDÊNCIA DOS ESTADOS DO MÊS, por ordem de força da afirmação:
   *   1. o mês não terminou                    -> IN_PROGRESS
   *   2. há dado obrigatório CONFIRMADO em falta -> INCOMPLETE
   *   3. há obrigatório por apurar              -> INDETERMINATE
   *   4. nada em falta e nada por apurar        -> COMPLETE
   *
   * INCOMPLETE ganha a INDETERMINATE de propósito: saber com certeza que falta um
   * dado é mais forte, e mais acionável, do que não saber se outro é exigível. Um
   * mês com um requisito em falta E outro indeterminado é um mês com trabalho
   * concreto por fazer, e é isso que se diz ao utilizador.
   *
   * COMPLETE deixou de ser o ramo por omissão: exige ausência de pendências, e não
   * apenas `missingItems` vazio. Era exatamente aí que um mês por apurar passava por
   * fechado. */
  const status = !terminou
    ? CLOSING_STATUS.IN_PROGRESS
    : missingItems.length > 0
      ? CLOSING_STATUS.INCOMPLETE
      : pendentes.length > 0
        ? CLOSING_STATUS.INDETERMINATE
        : CLOSING_STATUS.COMPLETE;

  return {
    monthKey: mk,
    status,
    totalRequired: contaveis.length,
    totalComplete: completedItems.length,
    totalMissing: missingItems.length,
    items,
    missingItems,
    completedItems,
  };
}