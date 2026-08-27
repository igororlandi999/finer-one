// src/utils/dataHealth.js
// Saúde do dataset em DUAS dimensões independentes: quão RECENTE é, e quão COMPLETO
// está. Puro, sem JSX, sem rede e sem uma única regra financeira.
//
// ─── PORQUE ISTO EXISTE (P0.2) ──────────────────────────────────────────────────────
// A C7F.3 corrigiu o TRANSPORTE da completude (`meta.parcial`, `algumParcial`,
// `todasCompletas`) mas não a APRESENTAÇÃO: a faixa continuava a dizer apenas
// «Atualizado há X», e dizia-o com a mesma serenidade sobre um conjunto incompleto.
//
// Frescura e completude são eixos ORTOGONAIS e não se substituem:
//
//   - um snapshot pode ser gerado há 2 minutos e estar incompleto — o rebuild escreve
//     `parcial: true` quando esgota o tempo a meio. É recente E incompleto ao mesmo
//     tempo, e a idade sozinha diria que está tudo bem;
//   - um snapshot pode estar completo e ter 8 dias — íntegro, mas desatualizado.
//
// Colapsar os dois numa escala única obriga a escolher qual dos dois problemas se
// esconde. Por isso aqui não há um enum combinatório: há dois vereditos, e quem
// apresenta compõe-nos.
//
// ─── O QUE ESTA CAMADA NÃO FAZ ──────────────────────────────────────────────────────
// Não altera, filtra nem invalida dado nenhum, exatamente como `dataFreshness`.
// E, sobretudo: `parcial` NÃO significa dado errado. Significa snapshot incompleto —
// o que lá está é válido, apenas pode não estar lá tudo. Dizer ao utilizador que os
// números estão errados seria uma afirmação mais forte do que a que os dados suportam.

import { resolveDataFreshness, FRESHNESS } from "./dataFreshness.js";

/** Estados de completude. `UNKNOWN` é um estado próprio, pela mesma razão que em
 *  `FRESHNESS`: uma fonte que não se pronuncia não autoriza afirmar que está completa,
 *  mas também não é prova de que esteja incompleta. */
export const COMPLETENESS = {
  COMPLETE: "complete",
  PARTIAL: "partial",
  UNKNOWN: "unknown",
};

/** Severidade de APRESENTAÇÃO — derivada, não é uma terceira dimensão de domínio.
 *  Existe porque a faixa tem de escolher UM tratamento visual, e essa escolha não
 *  pertence ao componente. */
export const HEALTH_SEVERITY = {
  NEUTRA: "neutra",
  ATENCAO: "atencao",
  ALERTA: "alerta",
  DESCONHECIDA: "desconhecida",
};

/** Nomes das fontes tal como o utilizador as reconhece. As CHAVES são o contrato que
 *  `blingDataService` emite em `meta.parcial`; não as renomear sem mudar lá. */
const ROTULO_FONTE = {
  orders: "pedidos",
  payables: "contas a pagar",
  receivables: "contas a receber",
};

/** Enumeração em português corrente: "a", "a e b", "a, b e c". */
function enumerar(lista) {
  if (lista.length === 0) return "";
  if (lista.length === 1) return lista[0];
  return `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
}

/**
 * Completude declarada pelas fontes.
 *
 * @param {{meta?: object|null}} args `meta` é `sales.meta`. Lê `meta.parcial`, que é um
 *   OBJETO por fonte (`{orders, payables, receivables}`) com `true` / `false` / `null`.
 * @returns {{
 *   estado: string, conhecida: boolean,
 *   parciais: string[], desconhecidas: string[], rotulosParciais: string[],
 *   label: string|null, detalhe: string|null
 * }}
 */
export function resolveDataCompleteness({ meta } = {}) {
  /* Um ARRAY passa em `typeof === "object"`. Um `[false, false, false]` chegaria ao
   * Object.keys com três chaves ("0","1","2") todas a false e sairia COMPLETE — uma
   * afirmação de completude sobre fontes que não existem. Só um objeto simples conta
   * como mapa por fonte. */
  const parcialBruto = meta && typeof meta === "object" && !Array.isArray(meta) ? meta.parcial : undefined;
  const porFonte = parcialBruto && typeof parcialBruto === "object" && !Array.isArray(parcialBruto)
    ? parcialBruto
    : null;

  /* Sem o mapa por fonte não há veredito. Note-se que NÃO se recorre a `algumParcial`
   * como substituto: esse booleano é derivado do mesmo mapa, e na sua ausência valeria
   * `false` — o que se leria como "está completo". É precisamente a inversão que esta
   * camada existe para evitar. */
  if (!porFonte) {
    return {
      estado: COMPLETENESS.UNKNOWN,
      conhecida: false,
      parciais: [],
      desconhecidas: [],
      rotulosParciais: [],
      label: null,
      detalhe: null,
    };
  }

  const chaves = Object.keys(porFonte);
  const parciais = chaves.filter((k) => porFonte[k] === true);
  const completas = chaves.filter((k) => porFonte[k] === false);
  const desconhecidas = chaves.filter((k) => porFonte[k] !== true && porFonte[k] !== false);
  const rotulosParciais = parciais.map((k) => ROTULO_FONTE[k] ?? k);

  /* Pessimismo deliberado, alinhado com o produtor: basta UMA fonte incompleta para o
   * conjunto não estar completo; mas afirmar que está completo exige que TODAS se
   * tenham pronunciado. Uma única fonte silenciosa deixa o veredito em UNKNOWN. */
  const estado = parciais.length > 0 ? COMPLETENESS.PARTIAL
    : (chaves.length > 0 && completas.length === chaves.length) ? COMPLETENESS.COMPLETE
      : COMPLETENESS.UNKNOWN;

  if (estado === COMPLETENESS.PARTIAL) {
    return {
      estado,
      conhecida: true,
      parciais,
      desconhecidas,
      rotulosParciais,
      label: "atualização parcial",
      /* Nunca "os dados estão errados". O que está no snapshot é válido; o que pode
       * faltar são linhas que o rebuild ainda não escreveu. */
      detalhe: `Parte dos dados ainda está a ser completada (${enumerar(rotulosParciais)}).`,
    };
  }

  return {
    estado,
    conhecida: estado === COMPLETENESS.COMPLETE,
    parciais: [],
    desconhecidas,
    rotulosParciais: [],
    label: null,
    /* Completo e fresco não merece frase nenhuma: uma nota a dizer que está tudo bem é
     * ruído, e ruído permanente treina o utilizador a ignorar a faixa. */
    detalhe: null,
  };
}

/** Severidade visual a partir dos dois eixos. Regra que não pode ser quebrada:
 *  um conjunto PARCIAL nunca pode sair NEUTRA, por mais fresco que seja. */
function severidadeDe(frescura, completude) {
  if (frescura.estado === FRESHNESS.UNKNOWN) return HEALTH_SEVERITY.DESCONHECIDA;
  if (frescura.estado === FRESHNESS.STALE) return HEALTH_SEVERITY.ALERTA;
  if (frescura.estado === FRESHNESS.WARNING) return HEALTH_SEVERITY.ATENCAO;
  return completude.estado === COMPLETENESS.PARTIAL
    ? HEALTH_SEVERITY.ATENCAO
    : HEALTH_SEVERITY.NEUTRA;
}

/**
 * Saúde do conjunto: frescura × completude, sem as fundir.
 *
 * @param {{meta?: object|null, now?: Date}} args `meta` é `sales.meta`; `now` é
 *   injetável para os testes não dependerem do relógio real.
 * @returns {{
 *   freshness: object, completeness: object,
 *   severidade: string, label: string,
 *   dateLabel: string|null, timeLabel: string|null,
 *   detalhes: string[]
 * }}
 */
export function resolveDataHealth({ meta, now = new Date() } = {}) {
  const freshness = resolveDataFreshness({ geradoEm: meta?.geradoEm ?? null, now });
  const completeness = resolveDataCompleteness({ meta });

  /* Sem data conhecida não se alega atualização nenhuma — e também não se acrescenta
   * a nota de parcialidade ao rótulo: "Data desconhecida · atualização parcial" daria
   * a entender que se sabe mais do que se sabe. A parcialidade continua a aparecer no
   * detalhe, onde é uma observação e não uma alegação sobre o momento. */
  const label = freshness.conhecida && completeness.label
    ? `${freshness.label} · ${completeness.label}`
    : freshness.label;

  /* Os dois problemas coexistem: quando há atraso E incompletude, mostram-se ambos.
   * Esconder um por causa do outro é o defeito que esta camada corrige. */
  const detalhes = [freshness.detalhe, completeness.detalhe].filter(Boolean);

  return {
    freshness,
    completeness,
    severidade: severidadeDe(freshness, completeness),
    label,
    dateLabel: freshness.dateLabel,
    timeLabel: freshness.timeLabel,
    detalhes,
  };
}
