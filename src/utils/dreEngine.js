// src/utils/dreEngine.js
// Motor central e determinístico da DRE. Fonte única para Performance Financeira e,
// progressivamente, para os restantes módulos.
//
// PRINCÍPIO INEGOCIÁVEL: 0 é um valor real; null é ausência de fonte.
// Nenhuma linha é calculada quando um dos seus termos é null — devolve null e um
// warning, em vez de um número enganoso.
//
// Estrutura:
//   Receita bruta − comissões − devoluções − frete de venda − Simples = Receita líquida
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
export const EMPTY_COVERAGE = { firstCompleteMonth: null, partialMonths: [], closedThroughMonth: null };

/** "aaaa-mm" de uma data. Puro: recebe a data, não a inventa. */
export function monthKeyOf(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
 *   3. depois do último mês fechado     -> partial  (inclui o mês corrente aberto)
 *   4. caso contrário                   -> real
 *
 * O limite de fecho vem de coverage.closedThroughMonth; sem ele, usa-se o mês
 * anterior ao da referenceDate — porque o mês civil corrente ainda está aberto.
 */
export function sourceAvailability(mk, coverage = EMPTY_COVERAGE, referenceDate, present = true) {
  if (!present) return "unavailable";
  const cov = coverage || EMPTY_COVERAGE;
  const parciais = cov.partialMonths || [];
  if (parciais.indexOf(mk) !== -1) return "partial";
  if (cov.firstCompleteMonth && mk < cov.firstCompleteMonth) return "unavailable";

  const limiteFechado = cov.closedThroughMonth || previousMonthKey(monthKeyOf(referenceDate));
  if (limiteFechado && mk > limiteFechado) return "partial";

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

/* ====================================================================================
 * Agregações auxiliares.
 * ==================================================================================== */

// Receita bruta do mês: soma dos pedidos faturáveis (regra já consolidada no projeto).
function receitaBrutaDoMes(orders, mk) {
  const doMes = billable(orders || []).filter((o) => monthKey(o.date) === mk);
  return { valor: round2(doMes.reduce((a, o) => a + (Number(o.total) || 0), 0)), pedidos: doMes };
}

// Frete de VENDA: campo enriquecido do pedido. Sem o campo em nenhum pedido do mês,
// a fonte é indisponível (null) — nunca zero, e nunca por diferença residual.
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
    ? null : "campo frete do pedido (enriquecido no snapshot)";
  if (frete.availability === "unavailable" && dispReceita !== "unavailable") {
    warnings.push({ code: "frete-venda-sem-fonte", message: `Sem campo de frete nos pedidos de ${mk}: frete de venda indisponível.` });
  }
  if (frete.availability === "partial") {
    warnings.push({ code: "frete-venda-parcial", message: `Só ${frete.comCampo} de ${pedidosDoMes.length} pedidos de ${mk} têm frete.` });
  }

  // ── Classificação das contas a pagar por competência ─────────
  let classificados = [];
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
      if (w && w.length) for (const one of w) warnings.push(one);
      return { payable: p, group, monthKey: comp.date ? monthKey(comp.date) : null, dateField: comp.field, fallback: comp.fallback };
    });
    const fallbacksNoMes = classificados.filter((c) => c.monthKey === mk && c.fallback && c.dateField);
    if (fallbacksNoMes.length) {
      warnings.push({
        code: "competencia-por-emissao",
        message: `${fallbacksNoMes.length} título(s) de ${mk} sem competência nem vencimento: usada a data de emissão.`,
      });
    }
    const naoClass = classificados.filter((c) => c.monthKey === mk && c.group === DRE_GROUPS.NAO_CLASSIFICADO);
    if (naoClass.length) {
      warnings.push({
        code: "titulos-nao-classificados",
        message: `${naoClass.length} título(s) de ${mk} sem categoria reconhecida: fora da DRE.`,
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
  const deducoes = [comissoes, devolucoes, frete.valor, simplesNacional];
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
  const dispTotalDeducoes = combineAvailability(dispPagaveis, dispPagaveis, dispFreteVenda, dispPagaveis);
  const dispReceitaLiquida = combineAvailability(dispReceita, dispTotalDeducoes);
  const dispLucroBruto = combineAvailability(dispReceitaLiquida, dispCmv);
  const dispDespesasOperacionais = combineAvailability(dispPagaveis, dispPagaveis, dispPagaveis);
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
      operatingExpenses: dispPagaveis,
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