// src/lib/currency.js
// Camada central de formatação monetária, guiada pela empresa ATIVA.
// NÃO converte valores — apenas apresenta o montante na moeda correta.
//
// Substitui o formatEUR fixo de lib/format.js (que assume pt-PT/EUR).
//
// ─── O DEFAULT SEGUE A EMPRESA ATIVA, NÃO A CONFIGURAÇÃO COMPILADA ──────────────────
// O segundo argumento continua a ser o caminho explícito e preferido:
//
//     const { formatting } = useCompany();
//     formatMoney(v, formatting)
//
// Quem não o passa recebe `getActiveFormatting()` — a empresa que o `CompanyProvider`
// registou. Antes recebia `ACTIVE_COMPANY`, a Overcel compilada, e por isso 114
// chamadas afirmavam "R$" fosse qual fosse a empresa selecionada. O porquê desta
// inversão, e as regras que a tornam segura, estão em `lib/activeFormatting.js`.
//
// Os defaults são avaliados A CADA CHAMADA (semântica de default parameters em JS), pelo
// que uma troca de empresa é imediatamente refletida — não há valor capturado no
// arranque do módulo.
//
// ─── MOEDA DESCONHECIDA NÃO É MOEDA ZERO ────────────────────────────────────────────
// `currency: null` chega aqui quando a empresa ativa não declara moeda e NÃO é a da
// configuração (ver `companyForFormatting`). Nesse caso formata-se o número SEM SÍMBOLO.
//
// A alternativa era herdar o símbolo da configuração, e é a que estava. "R$ 84.300,00"
// sobre valores em euros é uma etiqueta errada sobre dados certos: completa, plausível e
// indetetável. "84.300,00" é incompleta e vê-se que é — quem a vê pergunta, em vez de
// exportar para uma folha de cálculo e assumir.

import { getActiveFormatting } from "./activeFormatting.js";

const cache = new Map();

/** Locale de último recurso, só para AGRUPAR dígitos quando nem locale há.
 *  Não afirma moeda nenhuma — é a escolha de onde vai o ponto e onde vai a vírgula. */
const LOCALE_NEUTRO = "pt-PT";

function fmt(locale, currency, compact) {
  const key = `${locale}|${currency}|${compact ? "c" : "f"}`;
  if (!cache.has(key)) {
    /* `currency` nulo -> formatador DECIMAL. Não é `style: "currency"` com um símbolo
     * vazio (que o Intl não aceita): é outro formatador, que não faz afirmação
     * nenhuma sobre a moeda. */
    const opcoes = currency
      ? {
        style: "currency",
        currency,
        ...(compact
          ? { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      }
      : {
        style: "decimal",
        ...(compact
          ? { notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      };
    cache.set(key, new Intl.NumberFormat(locale || LOCALE_NEUTRO, opcoes));
  }
  return cache.get(key);
}

/** Formata na moeda da empresa ativa (R$ para a Overcel, € para empresas PT). */
export function formatMoney(value, company = getActiveFormatting()) {
  return fmt(company?.locale, company?.currency, false).format(value ?? 0);
}

/** Versão compacta, para eixos de gráficos. */
export function formatMoneyCompact(value, company = getActiveFormatting()) {
  return fmt(company?.locale, company?.currency, true).format(value ?? 0);
}

/**
 * Formata um valor que pode ser null (fonte indisponível).
 * Nunca devolve "0,00" para ausência de fonte — devolve o marcador.
 */
export function formatMoneyOrDash(value, company = getActiveFormatting(), dash = "—") {
  return value == null ? dash : formatMoney(value, company);
}

/**
 * Símbolo da moeda da empresa ativa, isolado do valor.
 *
 * Existe para os sítios onde a moeda é NOMEADA em vez de formatada junto a um número:
 * cabeçalhos de CSV ("Valor (R$)"), rótulos de eixos, legendas. Esses sítios tinham o
 * símbolo escrito à mão — e um "€" escrito à mão numa coluna de valores em reais é uma
 * etiqueta errada sobre dados certos, que é a pior combinação possível num ficheiro
 * exportado que sai da aplicação e passa a viver sozinho.
 *
 * Derivado do MESMO Intl que formata os valores, para que o símbolo do cabeçalho não
 * possa divergir do símbolo das células.
 *
 * Sem moeda declarada devolve "—", e NÃO o símbolo da configuração. Um cabeçalho de CSV
 * que diga "Valor (—)" é honesto; um que diga "Valor (R$)" sobre outra empresa viaja
 * para fora da aplicação com a etiqueta errada colada.
 */
export function currencySymbol(company = getActiveFormatting()) {
  if (!company?.currency) return "—";
  const partes = fmt(company.locale, company.currency, false).formatToParts(0);
  const simbolo = partes.find((p) => p.type === "currency");
  return simbolo ? simbolo.value : company.currency;
}
