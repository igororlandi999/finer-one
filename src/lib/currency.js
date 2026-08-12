// src/lib/currency.js
// Camada central de formatação monetária, guiada pela empresa ativa.
// NÃO converte valores — apenas apresenta o montante na moeda correta.
//
// Substitui gradualmente o formatEUR fixo de lib/format.js (que assume pt-PT/EUR).
// Nesta fase é usada pela Performance Financeira e pelo motor de DRE; as restantes
// páginas migram depois, para não tocar em toda a aplicação de uma vez.

import { ACTIVE_COMPANY } from "../config/company.js";

const cache = new Map();

function fmt(locale, currency, compact) {
  const key = `${locale}|${currency}|${compact ? "c" : "f"}`;
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(compact
        ? { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }));
  }
  return cache.get(key);
}

/** Formata na moeda da empresa ativa (R$ para a Overcel, € para empresas PT). */
export function formatMoney(value, company = ACTIVE_COMPANY) {
  return fmt(company.locale, company.currency, false).format(value ?? 0);
}

/** Versão compacta, para eixos de gráficos. */
export function formatMoneyCompact(value, company = ACTIVE_COMPANY) {
  return fmt(company.locale, company.currency, true).format(value ?? 0);
}

/**
 * Formata um valor que pode ser null (fonte indisponível).
 * Nunca devolve "0,00" para ausência de fonte — devolve o marcador.
 */
export function formatMoneyOrDash(value, company = ACTIVE_COMPANY, dash = "—") {
  return value == null ? dash : formatMoney(value, company);
}