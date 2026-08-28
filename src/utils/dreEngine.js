// src/utils/dreEngine.js
// Motor central e determinístico da DRE. Fonte única para Performance Financeira e,
// progressivamente, para os restantes módulos.
//
// PRINCÍPIO INEGOCIÁVEL: 0 é um valor real; null é ausência de fonte.
// Nenhuma linha é calculada quando um dos seus termos é null — devolve null e um
// warning, em vez de um número enganoso.
//
// Estrutura:
//   Receita bruta − comissões − devoluções − Simples = Receita líquida
//   (o frete cobrado ao cliente está DENTRO do order.total e NÃO é dedução)
//   Receita líquida − CMV                                            = Lucro bruto
//   Lucro bruto − pessoal − fixas − administrativas                  = EBITDA
//   EBITDA − retiradas de sócios                                     = Resultado líquido
//
// O CMV NÃO é calculado: não há fonte de custo/estoque no projeto. Entra por
// manualInputs (marcado como "manual") ou fica null, bloqueando o que dele depende.

import { round2, monthKey, billable } from "./financialCalculations.js";

/* ====================================================================================
 * Normalização de texto para classificação (insensível a acentos e maiúsculas).
 * ==================================================================================== */
function norm(s) {
  return String(s == null ? "" : s)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim();
}
const has = (haystack, ...terms) => terms.some((t) => haystack.includes(t));

/* ====================================================================================
 * MAPA DE CLASSIFICAÇÃO — categoria do Bling + histórico -> grupo da DRE.
 * Documentado e testável. Primeira regra que casa vence.
 * ==================================================================================== */
export const DRE_GROUPS = {
  COMISSOES: "comissoes",
  DEVOLUCOES: "devolucoes",
  IMPOSTOS: "impostos",
  PESSOAL: "pessoal",
  FIXAS: "fixas",
  ADMINISTRATIVAS: "administrativas",
  RETIRADAS: "retiradas",
  COMPRAS_ESTOQUE: "comprasEstoque", // fora da DRE operacional (vira CMV quando vendido)
  FRETE_PAGO: "fretePago",           // saída financeira; NÃO é o frete de venda da DRE
  NAO_CLASSIFICADO: "naoClassificado",
};

/**
 * Classifica uma conta a pagar num grupo da DRE.
 * @returns {{group: string, warnings: Array<{code:string,message:string,payableId:*}>}}
 */
export function classifyPayable(p) {
  const cat = norm(p && p.categoriaNome);
  const hist = norm(p && p.historico);
  const warnings = [];
  const id = p && p.id;

  const histIndicaRetirada = has(hist,
    "dividendo", "dividendos", "distribuicao de lucros", "retirada de socio", "retirada dos socios");
  const catProLabore = has(cat, "pro-labore", "pro labore", "prolabore");

  // 1) Retiradas de sócios — sempre separadas das despesas operacionais.
  if (has(cat, "distribuicao de lucros", "dividendo")) {
    return { group: DRE_GROUPS.RETIRADAS, warnings };
  }
  if (catProLabore) {
    if (histIndicaRetirada) {
      // Contradição real: categoria diz salário de sócio, histórico diz dividendos.
      warnings.push({
        code: "categoria-historico-contraditorios",
        message: `Categoria "${p.categoriaNome}" com histórico de retirada ("${p.historico}"): classificado como retirada de sócios.`,
        payableId: id,
      });
      return { group: DRE_GROUPS.RETIRADAS, warnings };
    }
    return { group: DRE_GROUPS.PESSOAL, warnings };
  }
  if (histIndicaRetirada) {
    warnings.push({
      code: "retirada-por-historico",
      message: `Histórico indica retirada de sócios ("${p.historico}") em categoria "${p.categoriaNome || "sem categoria"}".`,
      payableId: id,
    });
    return { group: DRE_GROUPS.RETIRADAS, warnings };
  }

  // 2) Deduções da receita.
  if (has(cat, "comissao", "comissoes")) return { group: DRE_GROUPS.COMISSOES, warnings };
  if (has(cat, "devolucao", "devolucoes") || has(hist, "devolucao de venda", "devolucao")) {
    return { group: DRE_GROUPS.DEVOLUCOES, warnings };
  }
  if (has(cat, "imposto", "impostos", "simples nacional", "tributo") ||
      has(hist, "simples nacional", "das simples")) {
    return { group: DRE_GROUPS.IMPOSTOS, warnings };
  }

  // 3) Compras e estoque — NUNCA despesa operacional da DRE.
  if (has(cat, "compras de fornecedores", "fornecedor", "fornecedores", "importacao", "importacoes",
    "insumo", "insumos", "materia-prima", "materia prima", "mercadoria", "estoque")) {
    return { group: DRE_GROUPS.COMPRAS_ESTOQUE, warnings };
  }

  // 4) Despesas operacionais.
  if (has(cat, "salario", "salarios", "folha de pagamento", "encargo", "pessoal")) {
    return { group: DRE_GROUPS.PESSOAL, warnings };
  }
  if (has(cat, "aluguel", "contab", "software", "licenca de software")) {
    return { group: DRE_GROUPS.FIXAS, warnings };
  }
  if (has(cat, "tarifa bancaria", "material de uso", "material de consumo", "material de escritorio",
    "servicos de terceiros", "terceiros", "escritorio", "administrativ")) {
    return { group: DRE_GROUPS.ADMINISTRATIVAS, warnings };
  }

  // 5) Fretes/seguros PAGOS: saída financeira real, mas não é o frete de venda da DRE
  //    (o frete cobrado ao cliente vem do pedido). Fica fora das linhas operacionais.
  if (has(cat, "frete", "seguro")) return { group: DRE_GROUPS.FRETE_PAGO, warnings };

  return { group: DRE_GROUPS.NAO_CLASSIFICADO, warnings };
}

/* ====================================================================================
 * Contas a pagar CANCELADAS nunca entram na DRE.
 * Contrato do projeto (expenseCalculations.js): PAYABLE_COUNTED = [1, 2] e
 * "5 (cancelado) nunca entra nos totais". Excluímos apenas o cancelado — um
 * título em aberto é uma obrigação real e entra pela sua competência.
 * ==================================================================================== */
export const PAYABLE_SITUACAO_CANCELADO = 5;

export function isCancelledPayable(p) {
  if (!p) return false;
  const s = p.situacao;
  const codigo = (s !== null && typeof s === "object") ? s.id : s;
  return Number(codigo) === PAYABLE_SITUACAO_CANCELADO;
}

/* ====================================================================================
 * COMBINAÇÃO DE DISPONIBILIDADES (função pura).
 * unavailable domina; depois partial; manual puro fica manual; manual misturado
 * com fontes reais fica "mixed" (legenda honesta: inclui valor manual).
 * ==================================================================================== */
export function combineAvailability(...partes) {
  const lista = partes.filter((a) => a != null);
  if (!lista.length) return "unavailable";
  if (lista.some((a) => a === "unavailable")) return "unavailable";
  if (lista.some((a) => a === "partial")) return "partial";
  if (lista.every((a) => a === "manual")) return "manual";
  // "mixed" já carrega uma entrada manual: tem de continuar a propagar, senão a
  // marca de valor manual desaparecia nas linhas seguintes (ex.: EBITDA vindo de
  // um lucro bruto "mixed" aparecia como "real").
  if (lista.some((a) => a === "manual" || a === "mixed")) return "mixed";
  return "real";
}

/* ====================================================================================
 * DATA DE COMPETÊNCIA das contas a pagar.
 * Prioridade documentada: competencia > vencimentoOriginal > vencimento > dataEmissao.
 * A data de emissão é o ÚLTIMO recurso (um título recorrente emitido hoje mas com
 * vencimento em 2027 pertence a 2027, não a hoje) e gera warning.
 * ==================================================================================== */
export function payableCompetenceDate(p) {
  if (!p) return { date: null, field: null, fallback: true };
  if (p.competencia) return { date: p.competencia, field: "competencia", fallback: false };
  if (p.vencimentoOriginal) return { date: p.vencimentoOriginal, field: "vencimentoOriginal", fallback: false };
  if (p.vencimento) return { date: p.vencimento, field: "vencimento", fallback: false };
  if (p.dataEmissao) return { date: p.dataEmissao, field: "dataEmissao", fallback: true };
  return { date: null, field: null, fallback: true };
}

export function payableCompetenceMonth(p) {
  const { date } = payableCompetenceDate(p);
  return date ? monthKey(date) : null;
}

/* ====================================================================================
 * COBERTURA HISTÓRICA — configurável e documentada, nunca embutida no motor.
 * Determina se o mês tem dados reais, parciais ou indisponíveis.
 * ==================================================================================== */
export const EMPTY_COVERAGE = {
  firstCompleteMonth: null,
  partialMonths: [],
  /* Até que mês a FONTE tem dados completos. Eixo TÉCNICO: responde a "o ERP já me
   * entregou tudo o que este mês teve?", nunca a "alguém validou este mês?". */
  completeThroughMonth: null,
  /* Alias LEGADO de completeThroughMonth. Ver sourceAvailability para a história. */
  closedThroughMonth: null,
  /* Até que mês um HUMANO validou o fecho. Eixo CONTABILÍSTICO, deliberadamente SEM
   * efeito na disponibilidade: uma validação em atraso não torna a fonte incompleta. */
  validatedThroughMonth: null,
};

/**
 * "aaaa-mm" de uma data. Puro: recebe a data, não a inventa.
 *
 * ─── PORQUE DELEGA, EM VEZ DE FAZER `new Date(date)` ────────────────────────────────
 * Fazia `date instanceof Date ? date : new Date(date)`. Para um objeto `Date` está
 * certo — é um instante, e `getMonth()` local é a leitura que se quer. Para uma STRING
 * de calendário estava errado, e errado do pior modo:
 *
 *     new Date("2026-07-01")  ->  meia-noite UTC
 *     em America/Sao_Paulo    ->  2026-06-30 21:00 local
 *     getMonth()              ->  JUNHO
 *
 * Ou seja: o primeiro dia de cada mês seria atribuído ao mês anterior — uma venda de
 * 1 de julho contada como receita de junho. E não apareceria a quem programa em Lisboa,
 * onde o desvio é positivo e o resultado sai certo. Apareceria só no browser do cliente
 * brasileiro, que é onde o produto corre.
 *
 * Não era alcançável: os três chamadores passam sempre um `Date`. Era uma armadilha à
 * espera do primeiro que passasse uma string.
 *
 * `monthKey` — já importado neste ficheiro — resolve isto há muito, via
 * `parseLocalISODate`, que constrói a data pelos COMPONENTES e a fixa ao meio-dia local
 * (o que também a imuniza contra as transições de horário de verão, que ocorrem de
 * madrugada). Havia duas cópias da mesma regra de fronteira no mesmo grafo de imports, e
 * a que divergia era a mais frouxa — o padrão que já obrigou a criar `lib/cors.js` e
 * `lib/contratoUpstream.js`.
 *
 * Comportamento para `Date`, `null`, `undefined`, `""` e datas ilegíveis: idêntico.
 */
export function monthKeyOf(date) {
  return monthKey(date);
}

/** Mês anterior a uma chave "aaaa-mm". */
function previousMonthKey(mk) {
  if (!mk) return null;
  const [y, m] = String(mk).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Disponibilidade TEMPORAL de uma fonte num mês. Função PURA: a data de
 * referência é injetada (nunca lida do relógio aqui dentro).
 *
 * Ordem das regras:
 *   0. fonte ausente                    -> unavailable  (cobertura nunca "salva" fonte ausente)
 *   1. mês declarado parcial            -> partial
 *   2. antes do primeiro mês completo   -> unavailable
 *   3. depois do limite de COBERTURA    -> partial  (inclui o mês corrente aberto)
 *   4. caso contrário                   -> real
 *
 * ─── O LIMITE É DE COBERTURA, NÃO DE VALIDAÇÃO ──────────────────────────────────────
 * `completeThroughMonth` responde a UMA pergunta: "até que mês é que esta fonte já
 * entregou tudo o que o mês teve?". É um facto sobre o ERP e sobre o calendário, não
 * uma opinião sobre contabilidade.
 *
 * Até 24/08/2026 este limite vinha de `closedThroughMonth`, um campo que respondia ao
 * mesmo tempo a essa pergunta E a "até que mês é que um humano validou o fecho?".
 * Ao encolher a segunda (validação em atraso), encolhia também a primeira — e um mês
 * civil terminado, com a fonte inteira em mãos, aparecia como `partial`. A jusante isso
 * tornava a aplicabilidade do CMV INDETERMINADA, e o produto ficava sem autorização
 * para PEDIR o dado que faltava. Só editar código quebrava o ciclo.
 * A validação humana mudou-se para `validatedThroughMonth`, que NÃO entra aqui.
 * `closedThroughMonth` continua a ser lido como alias, para não partir configurações
 * e testes existentes — ver docs/MONTHLY_CLOSING_CONTRACT.md.
 *
 * ─── AUSÊNCIA DE LIMITE É COBERTURA DESCONHECIDA, NUNCA ILIMITADA ───────────────────
 * Sem limite configurado usa-se o mês anterior ao da `referenceDate` (o mês civil
 * corrente está sempre aberto). Se nem isso houver, o mês é `partial`: não há base
 * para afirmar que a fonte está completa. Antes, esse caso saltava a guarda por
 * inteiro e devolvia `real` para TODOS os meses — foi o que fez a âncora da DRE saltar
 * para 2027-07, um mês que só existia por contas a pagar com vencimento futuro.
 * É a mesma regra do resto do projeto: ausência de prova nunca é prova.
 */
export function sourceAvailability(mk, coverage = EMPTY_COVERAGE, referenceDate, present = true) {
  if (!present) return "unavailable";
  const cov = coverage || EMPTY_COVERAGE;
  const parciais = cov.partialMonths || [];
  if (parciais.indexOf(mk) !== -1) return "partial";
  if (cov.firstCompleteMonth && mk < cov.firstCompleteMonth) return "unavailable";

  /* ── VETO DO SNAPSHOT INCOMPLETO ────────────────────────────────────────────────
   * `completeThroughMonth` é uma afirmação sobre o CALENDÁRIO: "o ERP já entregou
   * tudo o que estes meses tiveram". Vale enquanto a leitura do ERP tiver corrido até
   * ao fim. Quando a fonte se declara incompleta — rebuild interrompido pelo orçamento
   * de tempo, ou listagem truncada no teto MAX_PAGES — a premissa cai, e a cobertura
   * configurada passa a descrever um mundo que não foi lido.
   *
   * Vetar TODOS os meses, e não só os recentes, é a única leitura defensável: as
   * listagens de `/contas/pagar` e `/contas/receber` não são pedidas por data nem
   * chegam ordenadas por competência, portanto os títulos que ficaram do lado de lá do
   * teto podem pertencer a QUALQUER mês. Restringir o veto aos últimos meses seria
   * assumir uma ordenação que a fonte nunca prometeu.
   *
   * Depois da guarda de `firstCompleteMonth` de propósito: `unavailable` é mais forte
   * do que `partial` e não deve ser suavizado. Esta regra só pode tornar um mês MENOS
   * disponível, nunca mais — a direção segura. Ver docs/SOURCE_COVERAGE_CONTRACT.md. */
  if (cov.snapshotPartial === true) return "partial";

  const limiteCobertura = cov.completeThroughMonth
    || cov.closedThroughMonth
    || previousMonthKey(monthKeyOf(referenceDate));
  // Limite desconhecido => nada se pode declarar completo.
  if (!limiteCobertura) return "partial";
  if (mk > limiteCobertura) return "partial";

  return "real";
}

/** Disponibilidade da receita (pedidos). Mantida como nome próprio do domínio. */
export function revenueAvailability(mk, coverage = EMPTY_COVERAGE, referenceDate) {
  return sourceAvailability(mk, coverage, referenceDate, true);
}

/**
 * Cobertura das CONTAS A PAGAR. Por omissão é a mesma dos pedidos; pode ser
 * afinada em coverage.payables porque os dois lados vêm de snapshots distintos,
 * com cadências de rebuild próprias (ex.: pedidos fechados até julho, contas a
 * pagar só até junho). Os campos não sobrepostos são herdados.
 */
export function payablesCoverage(coverage) {
  const cov = coverage || EMPTY_COVERAGE;
  return cov.payables ? { ...cov, ...cov.payables } : cov;
}

/**
 * Marca na COBERTURA que a fonte se declarou incompleta, para que `sourceAvailability`
 * possa vetar. Função PURA: recebe a cobertura e o `meta.parcial` que o serviço já
 * transporta, e devolve cobertura — não lê configuração, não lê relógio, não conhece
 * o Apps Script.
 *
 * ─── PORQUE ISTO FALTAVA ────────────────────────────────────────────────────────────
 * `meta.parcial` viajava do Apps Script até `dataHealth` e morria ali: dava uma faixa
 * ("atualização parcial") e mais nada. O motor financeiro nunca soube. Uma fonte
 * truncada continuava a produzir meses `real`, KPIs elegíveis para âncora e um
 * "Resultado líquido" afirmado sem ressalva — a faixa dizia que faltavam dados e o
 * número ao lado dizia que estava tudo apurado.
 *
 * ─── PORQUE OS RECEBÍVEIS NÃO ENTRAM ────────────────────────────────────────────────
 * Contas a receber são tesouraria, não DRE. Um snapshot de recebíveis truncado
 * corrompe saldos em aberto e prazos, não a receita nem o resultado. Vetar a DRE por
 * causa deles seria misturar os dois universos — exatamente o erro que este projeto
 * corrige noutros sítios. Quem consome recebíveis lê `meta.parcial.receivables`.
 *
 * @param {object|null} coverage cobertura de partida.
 * @param {{parcial?: {orders?: boolean|null, payables?: boolean|null}}|null} meta
 * @returns {object} a MESMA referência quando não há nada a vetar.
 */
export function coverageComSnapshotParcial(coverage, meta) {
  const base = coverage || EMPTY_COVERAGE;
  const porFonte = meta?.parcial;
  if (!porFonte || typeof porFonte !== "object" || Array.isArray(porFonte)) return base;

  /* Só `true` veta. `null` é "a fonte não se pronunciou" e já é tratado a montante:
   * transformá-lo aqui em veto tornaria qualquer backend antigo inutilizável, e
   * transformá-lo em "completo" seria a inversão que este projeto proíbe. */
  const ordersParcial = porFonte.orders === true;
  const payablesParcial = porFonte.payables === true;
  if (!ordersParcial && !payablesParcial) return base;

  /* Cada eixo leva a SUA marca: pedidos incompletos não tornam as contas a pagar
   * incompletas. Sem isto, o spread de `payablesCoverage` herdaria a marca dos
   * pedidos e contaminaria o outro lado. */
  return {
    ...base,
    snapshotPartial: ordersParcial,
    payables: { ...(base.payables || {}), snapshotPartial: payablesParcial },
  };
}

/* ====================================================================================
 * Agregações auxiliares.
 * ==================================================================================== */

// Receita bruta do mês: soma dos pedidos faturáveis (regra já consolidada no projeto).
function receitaBrutaDoMes(orders, mk) {
  const doMes = billable(orders || []).filter((o) => monthKey(o.date) === mk);
  return { valor: round2(doMes.reduce((a, o) => a + (Number(o.total) || 0), 0)), pedidos: doMes };
}

// Frete de VENDA cobrado ao cliente: campo enriquecido do pedido. Sem o campo em
// nenhum pedido do mês, a fonte é indisponível (null) — nunca zero, e nunca por
// diferença residual. INFORMATIVO: não entra em totalDeducoes (ver `deducoes`).
function freteVendaDoMes(pedidosDoMes) {
  if (!pedidosDoMes.length) return { valor: null, availability: "unavailable", comCampo: 0 };
  const comCampo = pedidosDoMes.filter((o) => o.frete != null);
  if (!comCampo.length) return { valor: null, availability: "unavailable", comCampo: 0 };
  const valor = round2(comCampo.reduce((a, o) => a + (Number(o.frete) || 0), 0));
  const availability = comCampo.length === pedidosDoMes.length ? "real" : "partial";
  return { valor, availability, comCampo: comCampo.length };
}

// Soma das contas a pagar de um grupo, pela data de competência do mês.
function somaGrupo(classificados, mk, grupo) {
  return round2(classificados
    .filter((c) => c.group === grupo && c.monthKey === mk)
    .reduce((a, c) => a + (Number(c.payable.valor) || 0), 0));
}

/* ====================================================================================
 * MOTOR: DRE de um mês.
 *
 * @param {{
 *   orders: Array|null,        // pedidos normalizados (null = fonte indisponível)
 *   payables: Array|null,      // contas a pagar normalizadas (null = fonte indisponível)
 *   monthKey: string,          // "aaaa-mm"
 *   manualInputs?: {cmv?: number},
 *   coverage?: {firstCompleteMonth: string|null, partialMonths: string[]}
 * }} args
 * ==================================================================================== */
export function buildMonthlyDre({ orders, payables, monthKey: mk, manualInputs, coverage, referenceDate } = {}) {
  const warnings = [];
  const sources = {};
  const temOrders = Array.isArray(orders);
  const temPayables = Array.isArray(payables);
  const manuais = manualInputs || {};

  // ── Receita bruta ────────────────────────────────────────────
  // referenceDate injetável; o relógio só é lido aqui, na fronteira do motor.
  const refDate = referenceDate || new Date();
  const dispReceita = temOrders ? revenueAvailability(mk, coverage, refDate) : "unavailable";
  const { valor: receitaCalc, pedidos: pedidosDoMes } = temOrders
    ? receitaBrutaDoMes(orders, mk)
    : { valor: null, pedidos: [] };
  const receitaBruta = dispReceita === "unavailable" ? null : receitaCalc;
  sources.receitaBruta = temOrders ? "pedidos faturáveis (order.total), data do pedido" : null;
  if (dispReceita === "partial") {
    warnings.push({ code: "receita-parcial", message: `Histórico de pedidos incompleto em ${mk}: receita subavaliada.` });
  }
  if (dispReceita === "unavailable" && temOrders) {
    warnings.push({ code: "receita-indisponivel", message: `Sem cobertura de pedidos para ${mk}.` });
  }

  // ── Frete de venda (campo do pedido, nunca "Fretes e seguros" das contas a pagar) ──
  const frete = temOrders && dispReceita !== "unavailable"
    ? freteVendaDoMes(pedidosDoMes)
    : { valor: null, availability: "unavailable", comCampo: 0 };
  sources.freteVenda = frete.availability === "unavailable"
    ? null : "campo frete do pedido (enriquecido no snapshot), informativo";
  /* Os dois avisos passaram a ser DIAGNÓSTICO, não bloqueio: medem a hidratação do
   * campo no snapshot e já não afetam receita líquida nenhuma. Mantidos (opção B)
   * porque continuam a dizer algo verdadeiro e útil — 215 dos 984 pedidos ainda não
   * têm o campo — mas a mensagem deixou de afirmar indisponibilidade da DRE. */
  if (frete.availability === "unavailable" && dispReceita !== "unavailable") {
    warnings.push({ code: "frete-venda-sem-fonte", message: `Sem campo de frete nos pedidos de ${mk}: frete cobrado não medido (informativo, não afeta a receita líquida).` });
  }
  if (frete.availability === "partial") {
    warnings.push({ code: "frete-venda-parcial", message: `Só ${frete.comCampo} de ${pedidosDoMes.length} pedidos de ${mk} têm frete: valor informativo subavaliado (não afeta a receita líquida).` });
  }

  // ── Classificação das contas a pagar por competência ─────────
  let classificados = [];
  let naoClassNoMes = [];
  if (temPayables) {
    const canceladas = payables.filter(isCancelledPayable);
    if (canceladas.length) {
      warnings.push({
        code: "titulos-cancelados-excluidos",
        message: `${canceladas.length} título(s) cancelado(s) excluído(s) da DRE.`,
      });
    }
    classificados = payables.filter((p) => !isCancelledPayable(p)).map((p) => {
      const { group, warnings: w } = classifyPayable(p);
      const comp = payableCompetenceDate(p);
      const mkTitulo = comp.date ? monthKey(comp.date) : null;
      /* ÂMBITO TEMPORAL DOS WARNINGS POR TÍTULO.
       * classifyPayable corre sobre TODOS os títulos da fonte — tem de correr, porque a
       * classificação é necessária para somar qualquer mês. Mas os warnings que devolve
       * descrevem UM título concreto e só pertencem à DRE do mês desse título. Sem este
       * filtro, a DRE de junho recebia avisos de títulos de abril e maio: o facto descrito
       * nem sequer existe no mês analisado.
       * Os warnings AGREGADOS (titulos-nao-classificados, competencia-por-emissao) já
       * filtravam por mês; esta linha alinha os warnings por título com essa mesma regra.
       * Um título sem data de competência (mkTitulo null) não pertence a mês nenhum e por
       * isso não injeta warnings em mês nenhum. */
      if (mkTitulo === mk && w && w.length) for (const one of w) warnings.push(one);
      return { payable: p, group, monthKey: mkTitulo, dateField: comp.field, fallback: comp.fallback };
    });
    const fallbacksNoMes = classificados.filter((c) => c.monthKey === mk && c.fallback && c.dateField);
    if (fallbacksNoMes.length) {
      warnings.push({
        code: "competencia-por-emissao",
        message: `${fallbacksNoMes.length} título(s) de ${mk} sem competência nem vencimento: usada a data de emissão.`,
      });
    }
    naoClassNoMes = classificados.filter((c) => c.monthKey === mk && c.group === DRE_GROUPS.NAO_CLASSIFICADO);
    if (naoClassNoMes.length) {
      warnings.push({
        code: "titulos-nao-classificados",
        message: `${naoClassNoMes.length} título(s) de ${mk} sem categoria reconhecida: fora da DRE.`,
      });
    }
  }

  // Contas a pagar também têm cobertura temporal: um mês ainda aberto produz
  // valores calculáveis mas PARCIAIS. Fonte ausente continua unavailable.
  const dispPagaveis = sourceAvailability(mk, payablesCoverage(coverage), refDate, temPayables);
  const g = (grupo) => (temPayables ? somaGrupo(classificados, mk, grupo) : null);

  const comissoes = g(DRE_GROUPS.COMISSOES);
  const devolucoes = g(DRE_GROUPS.DEVOLUCOES);
  const simplesNacional = g(DRE_GROUPS.IMPOSTOS);
  const pessoal = g(DRE_GROUPS.PESSOAL);
  const fixas = g(DRE_GROUPS.FIXAS);
  const administrativas = g(DRE_GROUPS.ADMINISTRATIVAS);
  const retiradasSocios = g(DRE_GROUPS.RETIRADAS);
  if (temPayables) {
    sources.comissoes = "contas a pagar, categoria de comissão, por competência";
    sources.devolucoes = "contas a pagar/histórico de devolução, por competência";
    sources.simplesNacional = "contas a pagar, categoria de impostos sobre vendas, por competência";
    sources.despesasOperacionais = "contas a pagar classificadas (pessoal, fixas, administrativas)";
    sources.retiradasSocios = "contas a pagar, distribuição de lucros/dividendos";
  }

  // ── CMV: só manual. Nunca calculado, nunca inferido de compras. ──
  const cmvManual = manuais.cmv;
  const cmv = (cmvManual != null && !isNaN(Number(cmvManual))) ? round2(Number(cmvManual)) : null;
  const dispCmv = cmv != null ? "manual" : "unavailable";
  sources.cmv = cmv != null ? "valor manual fornecido (não calculado pelo sistema)" : null;
  if (cmv == null) {
    warnings.push({ code: "cmv-indisponivel", message: "CMV sem fonte automática: lucro bruto, EBITDA e resultado líquido não são calculáveis." });
  }

  // ── Fórmulas, com propagação estrita de null ─────────────────
  /* O FRETE COBRADO AO CLIENTE NÃO É DEDUÇÃO.
   * Medido em dados reais (F1): nos pedidos da Overcel o frete está DENTRO do
   * order.total, com fretePorConta = 0 (CIF). É preço de venda cobrado ao cliente,
   * não um abatimento à receita. Deduzi-lo reduzia a receita líquida pelo valor que
   * o cliente efetivamente pagou — e, pior, sem que o frete PAGO pela empresa
   * (FRETE_PAGO, contas a pagar) entrasse em lado nenhum: abatia-se uma ponta e
   * ignorava-se a outra.
   * `freteVenda` continua a ser medido e exposto, como informação; simplesmente não
   * entra nesta soma. A integração económica do frete pago é microfase separada. */
  const deducoes = [comissoes, devolucoes, simplesNacional];
  const totalDeducoes = deducoes.every((v) => v != null)
    ? round2(deducoes.reduce((a, v) => a + v, 0)) : null;

  const receitaLiquida = (receitaBruta != null && totalDeducoes != null)
    ? round2(receitaBruta - totalDeducoes) : null;

  const lucroBruto = (receitaLiquida != null && cmv != null)
    ? round2(receitaLiquida - cmv) : null;

  const operacionais = [pessoal, fixas, administrativas];
  const despesasOperacionais = operacionais.every((v) => v != null)
    ? round2(operacionais.reduce((a, v) => a + v, 0)) : null;

  const ebitda = (lucroBruto != null && despesasOperacionais != null)
    ? round2(lucroBruto - despesasOperacionais) : null;

  const resultadoLiquido = (ebitda != null && retiradasSocios != null)
    ? round2(ebitda - retiradasSocios) : null;

  // ── Disponibilidade POR LINHA, incluindo as derivadas ────────
  // O frete vem do MESMO snapshot de pedidos que a receita: não pode ser mais
  // fiável do que ela. freteVendaDoMes mede apenas a completude do campo dentro
  // do dataset recebido; a disponibilidade final combina-a com a da receita.
  const dispFreteVenda = combineAvailability(dispReceita, frete.availability);
  // As deduções vêm SÓ das contas a pagar (comissões, devoluções, impostos sobre
  // vendas). O frete deixou de entrar, logo a sua disponibilidade também não entra:
  // um pedido sem campo de frete já não torna a receita líquida indisponível.
  const dispTotalDeducoes = combineAvailability(dispPagaveis, dispPagaveis, dispPagaveis);
  const dispReceitaLiquida = combineAvailability(dispReceita, dispTotalDeducoes);
  const dispLucroBruto = combineAvailability(dispReceitaLiquida, dispCmv);

  /* COMPLETUDE DA CLASSIFICAÇÃO das despesas operacionais.
   *
   * A cobertura temporal (dispPagaveis) responde a "o mês está fechado?". Não
   * responde a "conheço a natureza dos títulos?". Um título sem categoria
   * reconhecida fica fora das linhas operacionais, pelo que a soma passa a ser
   * um mínimo conhecido, não o total — e um mínimo conhecido não é "real".
   *
   * Só NAO_CLASSIFICADO conta como incompleto: compras/estoque e frete pago são
   * exclusões DELIBERADAS e conhecidas, não lacunas.
   *
   * Sem títulos por classificar no mês, `real` — inclusive quando o mês não tem
   * títulos nenhuns: aí o zero é verdadeiro. Sem fonte, `unavailable` continua a
   * dominar por via de combineAvailability. */
  const dispClassificacaoOpex = naoClassNoMes.length ? "partial" : "real";
  const dispDespesasOperacionais = combineAvailability(dispPagaveis, dispClassificacaoOpex);

  const dispEbitda = combineAvailability(dispLucroBruto, dispDespesasOperacionais);
  const dispResultadoLiquido = combineAvailability(dispEbitda, dispPagaveis);

  return {
    monthKey: mk,
    availability: {
      // chaves originais (contrato aprovado na Fase 2)
      revenue: dispReceita,
      commissions: dispPagaveis,
      returns: dispPagaveis,
      salesFreight: dispFreteVenda,
      taxes: dispPagaveis,
      cmv: dispCmv,
      // Alias da Fase 2 da MESMA linha que `despesasOperacionais` — tem de valer
      // o mesmo, senão o projeto passa a ter duas verdades para a mesma métrica.
      operatingExpenses: dispDespesasOperacionais,
      partnerWithdrawals: dispPagaveis,
      // disponibilidade própria de cada linha da DRE
      receitaBruta: dispReceita,
      comissoes: dispPagaveis,
      devolucoes: dispPagaveis,
      freteVenda: dispFreteVenda,
      simplesNacional: dispPagaveis,
      totalDeducoes: dispTotalDeducoes,
      receitaLiquida: dispReceitaLiquida,
      lucroBruto: dispLucroBruto,
      pessoal: dispPagaveis,
      fixas: dispPagaveis,
      administrativas: dispPagaveis,
      despesasOperacionais: dispDespesasOperacionais,
      /* COBERTURA TEMPORAL da fonte de contas a pagar, isolada.
       * Responde só a "o período está fechado?" — nunca a "conheço a natureza dos
       * títulos?". É o valor de que várias linhas acima já são alias; nomeá-lo
       * explicitamente evita que quem precise do sinal temporal tenha de o inferir
       * de `despesasOperacionais` (que agora também carrega a completude da
       * classificação) ou de espreitar linhas como `retiradasSocios`. */
      coberturaPayables: dispPagaveis,
      ebitda: dispEbitda,
      retiradasSocios: dispPagaveis,
      resultadoLiquido: dispResultadoLiquido,
    },
    receitaBruta,
    comissoes,
    devolucoes,
    freteVenda: frete.valor,
    simplesNacional,
    totalDeducoes,
    receitaLiquida,
    cmv,
    lucroBruto,
    pessoal,
    fixas,
    administrativas,
    despesasOperacionais,
    ebitda,
    retiradasSocios,
    resultadoLiquido,
    warnings,
    sources,
  };
}

/**
 * Série de DREs mensais. manualInputsByMonth: { "2026-06": { cmv: 116039.70 } }.
 * Só produz meses realmente presentes nas fontes (nunca inventa histórico).
 */
export function buildDreSeries({ orders, payables, months, manualInputsByMonth, coverage } = {}) {
  const lista = Array.isArray(months) ? months.slice().sort() : [];
  const manuais = manualInputsByMonth || {};
  return lista.map((mk) => buildMonthlyDre({
    orders, payables, monthKey: mk, manualInputs: manuais[mk], coverage,
  }));
}

/** Meses distintos presentes nas fontes (pedidos e contas a pagar), ordenados. */
export function availableDreMonths({ orders, payables } = {}) {
  const set = new Set();
  for (const o of billable(orders || [])) {
    const k = monthKey(o.date);
    if (k) set.add(k);
  }
  for (const p of payables || []) {
    if (isCancelledPayable(p)) continue; // título cancelado não cria mês de DRE
    const k = payableCompetenceMonth(p);
    if (k) set.add(k);
  }
  return [...set].sort();
}