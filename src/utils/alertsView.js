// src/utils/alertsView.js
// Composição da VISTA da página Alertas. Regra de apresentação, não de negócio:
// decide o que é mostrado (real ou demonstrativo) e se o selo Demo se aplica.
// Puro e sem React, para ser testável sem montar a página.
//
// B1 — Com fonte real (source === "api") a lista é composta SOMENTE por alertas
// reais. Nenhum alerta de mockData é acrescentado. A infraestrutura demo mantém-se
// intacta e continua a servir o modo mock, que não foi tocado.
//
// B5 — O selo Demo passa a marcar o que é efetivamente demonstrativo: aparece no
// modo mock e desaparece com fonte real. Antes estava invertido.
//
// B6 — Em modo real as contagens saem da lista real, sem qualquer fallback do mock:
// zero alertas positivos tem de mostrar 0, e não os 12 do mock.

import { severityCounts } from "./alertsEngine.js";
import { sourceIsIndeterminate } from "./dataSourceStates.js";

/** Fonte real quando existe lista de alertas vinda da API. */
export function isRealSource(source, salesList) {
  return source === "api" && Array.isArray(salesList);
}

/**
 * Lista visível na página.
 * Fonte real  -> apenas os alertas reais (mesmo que sejam poucos, ou nenhuns).
 * Fonte mock  -> a lista demonstrativa completa, como antes.
 */
export function composeAlerts(salesList, mockList, source) {
  if (isRealSource(source, salesList)) return salesList;
  /* Sem veredito sobre a fonte (loading) ou fonte em avaria (unavailable) NÃO é modo
   * demonstração: devolve-se lista vazia em vez do mock. Mostrar os alertas fictícios
   * porque a ligação caiu seria apresentar uma avaria como se fosse intencional. */
  if (sourceIsIndeterminate(source)) return [];
  return mockList || [];
}

/**
 * Modelo completo da vista: lista, contagens por severidade e marca demo.
 * @param {{salesList: Array|null, mockList: Array, mockMetrics: Object, source: string}} args
 * @returns {{list: Array, metrics: Object, isDemo: boolean}}
 */
export function alertsViewModel({ salesList, mockList, mockMetrics, source } = {}) {
  const real = isRealSource(source, salesList);
  const list = composeAlerts(salesList, mockList, source);
  /* O selo Demo marca conteúdo DEMONSTRATIVO. Em loading/unavailable não há conteúdo
   * demonstrativo nenhum (a lista vem vazia), logo também não há nada a selar. */
  const demo = !real && !sourceIsIndeterminate(source);
  return {
    list,
    // Real: contagem verdadeira da lista, sem fallback. Mock: as métricas do mock.
    metrics: real ? severityCounts(list) : (demo ? (mockMetrics || severityCounts(list)) : severityCounts(list)),
    isDemo: demo,
  };
}