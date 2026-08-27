// src/utils/dataFreshness.js
// Interpreta a IDADE dos dados. Puro, sem JSX, sem rede e sem uma única regra
// financeira: recebe a data que a fonte declarou e devolve o que a UI deve dizer.
//
// ─── PORQUE ISTO EXISTE ─────────────────────────────────────────────────────────────
// O backend serve de um snapshot e declara em `meta.geradoEm` quando o gerou. Até à
// C7F essa data era deitada fora, e a aplicação não tinha como saber — nem como avisar
// — que estava a mostrar dados de há dias. Um snapshot parado é indistinguível de um
// snapshot atual: os números continuam lá, apenas deixam de corresponder à realidade.
//
// ─── O QUE ESTA CAMADA NÃO FAZ ──────────────────────────────────────────────────────
// Não altera, filtra nem invalida dado nenhum. Um dataset velho continua a ser exibido
// tal como o motor o produziu — o que muda é o utilizador passar a saber a idade dele.
// Esconder números velhos seria uma decisão de produto diferente, e mais destrutiva.

import { formatUpdatedAt } from "./manualInputsView.js";

/** Estados de frescura. `UNKNOWN` é um estado próprio: não saber a idade dos dados não
 *  é o mesmo que saber que estão velhos, nem que estão frescos. */
export const FRESHNESS = {
  FRESH: "fresh",
  WARNING: "warning",
  STALE: "stale",
  UNKNOWN: "unknown",
};

/* Limiares, em horas. Ancorados na cadência real da fonte: o snapshot é reconstruído
 * ao ritmo de aproximadamente uma vez por dia, pelo que dados com menos de 24h são o
 * funcionamento normal. Entre 1 e 3 dias há motivo para reparar; acima de 3 dias o
 * pipeline provavelmente parou — foi exatamente esse o caso que originou esta fase.
 *
 * Exportados para poderem ser afinados num só sítio e testados explicitamente, em vez
 * de ficarem enterrados em comparações soltas. */
export const FRESHNESS_THRESHOLDS = {
  warningHours: 24,
  staleHours: 72,
};

const MS_POR_HORA = 3600000;

/** Data utilizável a partir de um ISO completo, ou null. Mesma regra de
 *  `formatUpdatedAt`: só ISO com fuso explícito, nunca "aaaa-mm-dd". */
function lerData(iso) {
  if (typeof iso !== "string" || iso === "") return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "01:48" na hora LOCAL do utilizador — o mesmo fuso que `formatUpdatedAt` usa para a
 *  data, para que as duas metades nunca descrevam momentos diferentes. */
function horaLocal(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Frase de idade, com singular e plural corretos. Nunca "há 1 dias". */
function descreverIdade(horas) {
  if (horas < 1) return "Atualizado agora mesmo";
  if (horas < 24) {
    const h = Math.floor(horas);
    return h === 1 ? "Atualizado há 1 hora" : `Atualizado há ${h} horas`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "Atualizado há 1 dia" : `Atualizado há ${dias} dias`;
}

/**
 * Frescura dos dados a partir da data declarada pela fonte.
 *
 * @param {{geradoEm?: string|null, now?: Date}} args
 *   `geradoEm` é `sales.meta.geradoEm` — a data da fonte MAIS ANTIGA do conjunto.
 *   `now` é injetável para os testes não dependerem do relógio real.
 * @returns {{
 *   estado: string, conhecida: boolean, iso: string|null,
 *   ageHours: number|null, ageDays: number|null,
 *   dateLabel: string|null, timeLabel: string|null,
 *   label: string, detalhe: string|null
 * }}
 */
export function resolveDataFreshness({ geradoEm, now = new Date() } = {}) {
  const data = lerData(geradoEm);

  /* Sem data, ou com data inválida, o veredito é UNKNOWN — nunca FRESH. Assumir
   * frescura na ausência de prova seria a mesma inversão que esta fase veio corrigir:
   * ausência de informação não é informação tranquilizadora. */
  if (!data) {
    return {
      estado: FRESHNESS.UNKNOWN,
      conhecida: false,
      iso: null,
      ageHours: null,
      ageDays: null,
      dateLabel: null,
      timeLabel: null,
      label: "Data de atualização desconhecida",
      detalhe: "A fonte não indicou quando os dados foram recolhidos.",
    };
  }

  /* Idade em horas. Pode sair NEGATIVA se o relógio da fonte estiver adiantado face ao
   * do utilizador — é desvio de relógio, não dados do futuro. Trata-se como frescura
   * máxima (0) em vez de inventar um estado de erro: o utilizador não tem nada a fazer
   * com essa informação, e um alarme por causa de fusos seria ruído. */
  const horas = Math.max(0, (now.getTime() - data.getTime()) / MS_POR_HORA);

  const estado = horas >= FRESHNESS_THRESHOLDS.staleHours ? FRESHNESS.STALE
    : horas >= FRESHNESS_THRESHOLDS.warningHours ? FRESHNESS.WARNING
      : FRESHNESS.FRESH;

  return {
    estado,
    conhecida: true,
    iso: geradoEm,
    ageHours: horas,
    ageDays: horas / 24,
    // A data reutiliza o formatador já usado nos ajustes manuais: um só formato de data
    // em toda a aplicação, para o utilizador não ter de aprender dois.
    dateLabel: formatUpdatedAt(geradoEm),
    timeLabel: horaLocal(data),
    label: descreverIdade(horas),
    /* Só se acrescenta explicação quando ela muda alguma coisa. Em dados frescos, uma
     * frase a dizer que está tudo bem é ruído. */
    detalhe: estado === FRESHNESS.STALE
      ? "Os valores apresentados podem não refletir a atividade mais recente."
      : estado === FRESHNESS.WARNING
        ? "Os dados podem não incluir os movimentos mais recentes."
        : null,
  };
}
