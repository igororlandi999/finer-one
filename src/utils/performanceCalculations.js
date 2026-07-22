// src/utils/performanceCalculations.js
// Performance financeira a partir das fontes reais já existentes. Sem React, sem
// definições paralelas: reutiliza as mesmas regras de receitas (financialCalculations)
// e a mesma regra temporal das despesas (payableDate = dataEmissao || vencimento),
// pela via de sales.despesas.list, que já é billablePayables com data formatada.
//
// NÃO calcula EBITDA, ativo, solvabilidade nem demonstrações contabilísticas: o
// projeto não tem plano de contas, ativos, capital próprio nem depreciações.

import { round2, MONTHS_PT, monthKey, revenueByMonth } from "./financialCalculations.js";
import { parsePtDate } from "./cashflowForecast.js";

// Rótulo curto do mês a partir de "aaaa-mm" (ex.: "Mai 26").
export function monthLabel(key) {
  if (!key) return "";
  const [y, m] = String(key).split("-");
  const idx = Number(m) - 1;
  return `${MONTHS_PT[idx] ?? m} ${String(y).slice(2)}`;
}

// Rótulo por extenso (ex.: "maio de 2026") para subtítulos dinâmicos.
const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export function monthLongLabel(key) {
  if (!key) return "";
  const [y, m] = String(key).split("-");
  const idx = Number(m) - 1;
  return `${MESES_EXTENSO[idx] ?? m} de ${y}`;
}

// Chave "aaaa-mm" do mês atual (para nunca apresentar meses futuros).
export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Último mês faturável que NÃO é futuro. Ignora pedidos com data futura.
 * Não altera a regra de faturação (usa revenueByMonth, que já filtra faturáveis).
 * @returns {string|null} "aaaa-mm" ou null se só existirem meses futuros.
 */
export function latestRevenueMonthAtOrBefore(orders, now = new Date()) {
  const limite = currentMonthKey(now);
  const meses = revenueByMonth(orders)
    .map((r) => r.month)
    .filter((k) => k <= limite)
    .sort();
  return meses.length ? meses[meses.length - 1] : null;
}

/**
 * Opções de janela para o seletor, limitadas ao histórico disponível.
 * 0 => []; 1 => [1]; 2 => [2]; 5 => [3,5]; 8 => [3,6,8]; 12+ => [3,6,12].
 * Garante que existe sempre uma opção igual ao total quando este é inferior ao
 * maior degrau padrão, para o valor selecionado ser sempre válido.
 */
export function buildAvailableWindows(totalMonths) {
  const total = Number(totalMonths) || 0;
  if (total <= 0) return [];
  const base = [3, 6, 12];
  const opts = base.filter((n) => n <= total);
  const maxBase = base[base.length - 1];
  if (!opts.includes(total) && total < maxBase) opts.push(total);
  return [...new Set(opts)].sort((a, b) => a - b);
}

// Mês seguinte/anterior de uma chave "aaaa-mm".
function shiftKey(key, delta) {
  if (!key) return null;
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Despesas por mês a partir de sales.despesas.list (data em dd/mm/aaaa).
// Devolve Map monthKey -> total. Ignora linhas com data inválida (não inventa).
export function expensesByMonthFromList(list) {
  const map = new Map();
  for (const d of list || []) {
    const dt = parsePtDate(d && d.data);
    if (!dt) continue;
    const k = monthKey(dt);
    if (!k) continue;
    map.set(k, round2((map.get(k) || 0) + (Number(d.valor) || 0)));
  }
  return map;
}

/**
 * Série mensal real de performance.
 * @param {{orders: array, despesasList: array|null, now?: Date}} args
 *   despesasList null => fonte de despesas indisponível (despesas/resultado/margem ficam null).
 * @returns {Array<{monthKey, label, receitas, despesas, resultado, margem}>}
 *   Ordenada cronologicamente. Só meses dentro do intervalo comprovadamente coberto
 *   pelos dados; nunca meses futuros; nunca meses inventados fora do intervalo.
 */
export function buildMonthlyPerformance({ orders, despesasList, now = new Date() } = {}) {
  const temDespesas = Array.isArray(despesasList);
  const receitasPorMes = new Map(revenueByMonth(orders).map((r) => [r.month, r.value]));
  const despesasPorMes = temDespesas ? expensesByMonthFromList(despesasList) : new Map();

  const chaves = [...new Set([...receitasPorMes.keys(), ...despesasPorMes.keys()])].sort();
  if (!chaves.length) return [];

  const limite = currentMonthKey(now);
  const dentroDoIntervalo = chaves.filter((k) => k <= limite); // nunca meses futuros
  if (!dentroDoIntervalo.length) return [];

  // Preenche os meses do intervalo coberto (primeiro..último com dados). Meses sem
  // movimento ficam a zero porque estão comprovadamente dentro do período coberto.
  const primeiro = dentroDoIntervalo[0];
  const ultimo = dentroDoIntervalo[dentroDoIntervalo.length - 1];
  const serie = [];
  for (let k = primeiro; k && k <= ultimo; k = shiftKey(k, 1)) {
    const receitas = round2(receitasPorMes.get(k) || 0);
    const despesas = temDespesas ? round2(despesasPorMes.get(k) || 0) : null;
    const resultado = temDespesas ? round2(receitas - despesas) : null;
    const margem = temDespesas && receitas > 0 ? round2((resultado / receitas) * 100) : null;
    serie.push({ monthKey: k, label: monthLabel(k), receitas, despesas, resultado, margem });
  }
  return serie;
}

/**
 * Métricas do mês de referência (mesmo âncora do Resumo/Diagnóstico: mês das receitas).
 * @returns {{
 *   mesRef, mesRefLabel, receitas, despesas, resultado, margem,
 *   receitasDelta, despesasDelta, resultadoDelta, margemDelta,
 *   temAnterior, temDespesas, margemCalculavel
 * } | null}
 * Deltas a null quando não existe base anterior válida (ausente ou zero).
 */
export function buildPerformanceMetrics({ orders, despesasList, now = new Date() } = {}) {
  const temDespesas = Array.isArray(despesasList);
  // Mês âncora: último mês faturável NÃO futuro (nunca latestMonthKey cru).
  const mesRef = latestRevenueMonthAtOrBefore(orders, now);
  if (!mesRef) return null;

  const serie = buildMonthlyPerformance({ orders, despesasList, now });
  const idx = serie.findIndex((p) => p.monthKey === mesRef);
  const atual = idx >= 0 ? serie[idx] : null;
  if (!atual) return null;
  const anterior = idx > 0 ? serie[idx - 1] : null;

  // Variação % só com base anterior válida e diferente de zero.
  const pctDelta = (novo, velho) =>
    (velho != null && velho !== 0 && novo != null) ? round2(((novo - velho) / Math.abs(velho)) * 100) : null;

  return {
    mesRef,
    mesRefLabel: monthLongLabel(mesRef),
    receitas: atual.receitas,
    despesas: atual.despesas,
    resultado: atual.resultado,
    margem: atual.margem,
    receitasDelta: anterior ? pctDelta(atual.receitas, anterior.receitas) : null,
    despesasDelta: anterior && temDespesas ? pctDelta(atual.despesas, anterior.despesas) : null,
    resultadoDelta: anterior && temDespesas ? pctDelta(atual.resultado, anterior.resultado) : null,
    // Margem compara-se em pontos percentuais, não em %.
    margemDelta: (anterior && atual.margem != null && anterior.margem != null)
      ? round2(atual.margem - anterior.margem) : null,
    temAnterior: !!anterior,
    temDespesas,
    margemCalculavel: temDespesas && atual.receitas > 0,
  };
}

/**
 * Categorias de despesa do mês de referência, a partir de sales.despesas.list.
 * "Sem categoria" sai do ranking principal e é devolvido à parte.
 * @returns {{categorias: Array<{name, value, pct}>, semCategoria: {value, pct}|null, total: number}}
 */
export function buildExpenseCategoryPerformance(despesasList, mesRef) {
  const vazio = { categorias: [], semCategoria: null, total: 0 };
  if (!Array.isArray(despesasList) || !mesRef) return vazio;

  const doMes = despesasList.filter((d) => {
    const dt = parsePtDate(d && d.data);
    return dt && monthKey(dt) === mesRef;
  });
  if (!doMes.length) return vazio;

  const map = new Map();
  for (const d of doMes) {
    const nome = d.categoria || "Sem categoria";
    map.set(nome, round2((map.get(nome) || 0) + (Number(d.valor) || 0)));
  }
  const total = round2([...map.values()].reduce((a, b) => a + b, 0));
  const pct = (v) => (total > 0 ? round2((v / total) * 100) : 0);

  const semValor = map.get("Sem categoria") || 0;
  map.delete("Sem categoria");

  const categorias = [...map.entries()]
    .map(([name, value]) => ({ name, value, pct: pct(value) }))
    .sort((a, b) => b.value - a.value);

  return {
    categorias,
    semCategoria: semValor > 0 ? { value: round2(semValor), pct: pct(semValor) } : null,
    total,
  };
}

/**
 * Frases determinísticas sobre os números reais. Nunca atribui causas.
 * @returns {string[]}
 */
export function buildPerformanceInsights(metrics, categorias) {
  if (!metrics) return [];
  const out = [];
  const pct1 = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")}%`;
  const pp1 = (v) => `${Math.abs(v).toFixed(1).replace(".", ",")} p.p.`;

  // Receitas: delta numérico => subida/queda; delta null => sem base comparável
  // (cobre também o caso de existir mês anterior mas com base zero).
  if (metrics.receitasDelta != null) {
    out.push(metrics.receitasDelta >= 0
      ? `As receitas subiram ${pct1(metrics.receitasDelta)} face ao mês anterior.`
      : `As receitas caíram ${pct1(metrics.receitasDelta)} face ao mês anterior.`);
  } else {
    out.push("Sem período anterior comparável para as receitas.");
  }

  // Despesas: só quando a fonte existe. Mesma regra de base comparável.
  if (metrics.temDespesas) {
    if (metrics.despesasDelta != null) {
      out.push(metrics.despesasDelta >= 0
        ? `As despesas subiram ${pct1(metrics.despesasDelta)} face ao mês anterior.`
        : `As despesas desceram ${pct1(metrics.despesasDelta)} face ao mês anterior.`);
    } else {
      out.push("Sem período anterior comparável para as despesas.");
    }
  }

  if (metrics.temDespesas && metrics.resultado != null) {
    out.push(metrics.resultado >= 0
      ? "O resultado do mês foi positivo."
      : "O resultado do mês foi negativo.");
  }

  if (metrics.margemDelta != null) {
    out.push(metrics.margemDelta >= 0
      ? `A margem subiu ${pp1(metrics.margemDelta)} face ao mês anterior.`
      : `A margem caiu ${pp1(metrics.margemDelta)} face ao mês anterior.`);
  }

  const top = categorias && categorias[0];
  if (top) {
    out.push(`${top.name} é a categoria com maior peso nas despesas do mês (${pct1(top.pct)}).`);
  }

  return out;
}