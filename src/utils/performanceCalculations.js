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
// Cobertura: reutiliza a semântica JÁ existente do motor (firstCompleteMonth,
// partialMonths, closedThroughMonth e o override coverage.payables). Não existe aqui
// nenhuma regra de cobertura própria — seria uma segunda verdade sobre os mesmos dados.
import { payablesCoverage, sourceAvailability } from "./dreEngine.js";

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
 * Série mensal de ATIVIDADE OPERACIONAL.
 *
 * Devolve faturação e títulos registados, e mais nada. `resultado` e `margem` foram
 * REMOVIDOS: eram `faturação − títulos a pagar` e o seu rácio — uma pseudo-DRE que
 * misturava faturação por data do pedido com títulos por data de emissão, e chamava
 * ao resto "resultado". Rentabilidade vive só no bloco DRE (financialMetrics).
 * @param {{orders: array, despesasList: array|null, coverage?: object|null, now?: Date}} args
 *   despesasList null => fonte de títulos indisponível (despesas fica null).
 *   coverage      cobertura declarada do histórico (ACTIVE_COMPANY.historyCoverage).
 *                 Omitida => comportamento legado, todos os meses tratados como reais.
 * @returns {Array<{monthKey, label, receitas, despesas, disponibilidade}>}
 *   Ordenada cronologicamente. Só meses dentro do intervalo comprovadamente coberto
 *   pelos dados; nunca meses futuros; nunca meses inventados fora do intervalo.
 *   despesas a null quando a fonte não cobre o mês — nunca zero.
 */
export function buildMonthlyPerformance({ orders, despesasList, coverage = null, now = new Date() } = {}) {
  const temFonteReceitas = Array.isArray(orders);
  const temDespesas = Array.isArray(despesasList);
  const receitasPorMes = new Map(revenueByMonth(orders).map((r) => [r.month, r.value]));
  const despesasPorMes = temDespesas ? expensesByMonthFromList(despesasList) : new Map();

  const chaves = [...new Set([...receitasPorMes.keys(), ...despesasPorMes.keys()])].sort();
  if (!chaves.length) return [];

  const limite = currentMonthKey(now);
  const dentroDoIntervalo = chaves.filter((k) => k <= limite); // nunca meses futuros
  if (!dentroDoIntervalo.length) return [];

  /* Cobertura por FONTE. Pedidos e contas a pagar têm snapshots independentes: o
   * intervalo da série é a UNIÃO dos dois, não a interseção. Sem isto, um mês com
   * receitas mas fora do histórico de payables ficava com despesas = 0, resultado =
   * receitas e margem = 100% — uma afirmação sobre um mês de que não sabemos nada.
   *
   * `coverage` omitido => comportamento legado (tudo "real"). É deliberado: uma lista
   * vazia continua a ser fonte REAL com zero movimentos, e zero real não é ausência.
   * Só uma cobertura declarada pode dizer que um mês está fora do histórico. */
  const covDespesas = coverage ? payablesCoverage(coverage) : null;

  /* sourceAvailability testa partialMonths ANTES de firstCompleteMonth, pelo que um mês
   * listado como parcial e anterior ao início do histórico devolve "partial". Para a
   * DRE isso serve; aqui não: um mês fora do histórico com zero títulos produziria
   * despesas 0 e margem 100%. A pergunta desta série é outra — "a fonte chega sequer a
   * este mês?" — e a resposta é firstCompleteMonth. Não é uma regra nova nem um segundo
   * coverage: é o mesmo campo, aplicado à pergunta certa, com o motor intocado. */
  const foraDoHistorico = (cov, k) => !!(cov && cov.firstCompleteMonth && k < cov.firstCompleteMonth);
  const dispDe = (cov, k, presente) => {
    if (!presente) return "unavailable";
    if (!coverage) return "real";
    if (foraDoHistorico(cov, k)) return "unavailable";
    return sourceAvailability(k, cov, now, true);
  };

  const primeiro = dentroDoIntervalo[0];
  const ultimo = dentroDoIntervalo[dentroDoIntervalo.length - 1];
  const serie = [];
  for (let k = primeiro; k && k <= ultimo; k = shiftKey(k, 1)) {
    const dispReceitas = dispDe(coverage, k, temFonteReceitas);
    const dispDespesas = dispDe(covDespesas, k, temDespesas);

    const receitas = round2(receitasPorMes.get(k) || 0);
    // Fora do histórico coberto não há zero: há desconhecimento.
    const despesas = dispDespesas === "unavailable" ? null : round2(despesasPorMes.get(k) || 0);

    serie.push({
      monthKey: k, label: monthLabel(k), receitas, despesas,
      // "real" = mês fechado e coberto; "partial" = em curso ou declarado parcial;
      // "unavailable" = fora do histórico da fonte. Só "real" autoriza comparação.
      disponibilidade: { receitas: dispReceitas, despesas: dispDespesas },
    });
  }
  return serie;
}

/**
 * Métricas de ATIVIDADE OPERACIONAL do mês de referência.
 * Sem resultado, sem margem: essas afirmações pertencem ao bloco DRE.
 * Métricas do mês de referência (mesmo âncora do Resumo/Diagnóstico: mês das receitas).
 * @returns {{
 *   mesRef, mesRefLabel, receitas, despesas,
 *   receitasDelta, despesasDelta,
 *   temAnterior, temDespesas, mesEmCurso, disponibilidade, comparavel
 * } | null}
 * Deltas a null quando não existe base anterior válida (ausente ou zero).
 */
export function buildPerformanceMetrics({ orders, despesasList, coverage = null, now = new Date() } = {}) {
  const temDespesas = Array.isArray(despesasList);
  // Mês âncora: último mês faturável NÃO futuro (nunca latestMonthKey cru).
  const mesRef = latestRevenueMonthAtOrBefore(orders, now);
  if (!mesRef) return null;

  const serie = buildMonthlyPerformance({ orders, despesasList, coverage, now });
  const idx = serie.findIndex((p) => p.monthKey === mesRef);
  const atual = idx >= 0 ? serie[idx] : null;
  if (!atual) return null;
  const anterior = idx > 0 ? serie[idx - 1] : null;

  // Variação % só com base anterior válida e diferente de zero.
  const pctDelta = (novo, velho) =>
    (velho != null && velho !== 0 && novo != null) ? round2(((novo - velho) / Math.abs(velho)) * 100) : null;

  /* COMPARABILIDADE.
   *
   * 1) Mês em curso: comparar 14 dias decorridos com um mês completo não é uma
   *    variação, é o calendário a andar. Foi o que produziu "resultado +106%" e
   *    "margem +133,9 p.p." em agosto. Mesma regra já aplicada em D4 (Resumo e
   *    Despesas): nenhum delta, e não zero — ausência de comparação.
   * 2) Cobertura: só se comparam meses "real". Um mês parcial ou fora do histórico
   *    não é base de comparação, mesmo que tenha valores.
   * Cada delta usa a cobertura da SUA fonte. */
  const mesEmCurso = mesRef === currentMonthKey(now);
  const dispOk = (p, fonte) => !!p && p.disponibilidade && p.disponibilidade[fonte] === "real";
  const compReceitas = !mesEmCurso && !!anterior && dispOk(atual, "receitas") && dispOk(anterior, "receitas");
  const compDespesas = !mesEmCurso && !!anterior && temDespesas
    && dispOk(atual, "despesas") && dispOk(anterior, "despesas");
  return {
    mesRef,
    mesRefLabel: monthLongLabel(mesRef),
    receitas: atual.receitas,
    despesas: atual.despesas,
    receitasDelta: compReceitas ? pctDelta(atual.receitas, anterior.receitas) : null,
    despesasDelta: compDespesas ? pctDelta(atual.despesas, anterior.despesas) : null,
    temAnterior: !!anterior,
    temDespesas,
    // Expostos para a página poder explicar a ausência de deltas sem a recalcular.
    mesEmCurso,
    disponibilidade: atual.disponibilidade,
    // As duas grandezas operacionais são comparáveis com o mês anterior.
    comparavel: compReceitas && compDespesas,
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

  // Receitas: delta numérico => subida/queda; delta null => sem base comparável
  // (cobre também o caso de existir mês anterior mas com base zero).
  if (metrics.receitasDelta != null) {
    out.push(metrics.receitasDelta >= 0
      ? `A faturação subiu ${pct1(metrics.receitasDelta)} face ao mês anterior.`
      : `A faturação caiu ${pct1(metrics.receitasDelta)} face ao mês anterior.`);
  } else {
    out.push("Sem período anterior comparável para a faturação.");
  }

  // Despesas: só quando a fonte existe. Mesma regra de base comparável.
  if (metrics.temDespesas) {
    if (metrics.despesasDelta != null) {
      out.push(metrics.despesasDelta >= 0
        ? `Os títulos registados subiram ${pct1(metrics.despesasDelta)} face ao mês anterior.`
        : `Os títulos registados desceram ${pct1(metrics.despesasDelta)} face ao mês anterior.`);
    } else {
      out.push("Sem período anterior comparável para os títulos registados.");
    }
  }

  /* Não há aqui frases sobre resultado ou margem. Eram derivadas do pseudo-resultado
   * (faturação − títulos) e afirmavam rentabilidade a partir de dados operacionais.
   * Rentabilidade só se comenta com base na DRE. */

  const top = categorias && categorias[0];
  if (top) {
    out.push(`${top.name} é a categoria com maior peso nos títulos do mês (${pct1(top.pct)}).`);
  }

  return out;
}