// src/utils/manualInputsView.js
// Camada APRESENTACIONAL dos ajustes manuais. Puro, sem JSX e sem lógica financeira:
// não calcula, não agrega, não decide nada sobre a DRE. Apenas transforma o envelope
// devolvido por fetchManualInputs em linhas prontas a desenhar.
//
// Regra que atravessa o ficheiro: as linhas nascem SEMPRE de `manualInputs.document`,
// nunca de `valuesByMonth`. O mapa é o contrato do motor e não transporta metadata;
// reconstruir linhas a partir dele obrigaria a inventar `updatedAt` e `note`.

import { monthLongLabel } from "./performanceCalculations.js";

/* Rubricas reconhecidas visualmente, na ordem em que aparecem dentro de um mês.
 * Uma rubrica futura só passa a ser desenhada quando for acrescentada aqui de
 * propósito — nunca por aparecer no documento. */
export const RUBRICAS_VISIVEIS = ["cmv"];

export const RUBRICA_LABELS = {
  cmv: "CMV",
};

/* Estados de ecrã. Deliberadamente poucos: o utilizador não precisa de saber se o
 * documento está corrompido, ambíguo ou inacessível — precisa de saber que não foi
 * possível carregar. Os estados técnicos ficam do lado do serviço. */
export const MANUAL_INPUTS_VIEW = {
  LOADING: "loading",
  ROWS: "rows",
  EMPTY: "empty",
  ERROR: "error",
};

/* Estados de origem que significam "o documento existe, apenas não tem ajustes".
 * Convergem visualmente com o documento vazio, por decisão de produto. */
const ESTADOS_SEM_AJUSTES = ["documento", "documento-vazio"];

const RE_MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Data apresentacional a partir de um ISO completo (ex.: "2026-08-19T10:00:00.000Z").
 * `new Date(iso)` é seguro AQUI porque o valor traz fuso explícito — ao contrário de
 * "aaaa-mm-dd", que seria interpretado como meia-noite UTC e podia recuar um dia em
 * São Paulo. Devolve null para ausência ou valor inválido, para que a UI possa omitir.
 */
export function formatUpdatedAt(iso) {
  if (typeof iso !== "string" || iso === "") return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

/** Nota utilizável: string com conteúdo depois de aparada. Caso contrário, null. */
function lerNota(note) {
  if (typeof note !== "string") return null;
  const t = note.trim();
  return t === "" ? null : t;
}

/**
 * Linhas apresentacionais do documento, do mês mais recente para o mais antigo.
 *
 * @param {{status?: string, document?: object|null}|null} manualInputs
 * @returns {Array<{id, monthKey, monthLabel, key, label, value, updatedAt, updatedAtLabel, note}>}
 */
export function buildManualInputsRows(manualInputs) {
  const doc = manualInputs && manualInputs.document;
  if (!isPlainObject(doc) || !isPlainObject(doc.months)) return [];

  const meses = Object.keys(doc.months)
    .filter((mk) => RE_MONTH_KEY.test(mk))
    // Ordenação por string: "aaaa-mm" é lexicograficamente ordenável e evita
    // qualquer parsing de data (new Date("2026-06") seria UTC e deslocaria o mês).
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const linhas = [];
  for (const monthKey of meses) {
    const mes = doc.months[monthKey];
    if (!isPlainObject(mes)) continue;

    for (const key of RUBRICAS_VISIVEIS) {
      const rubrica = mes[key];
      if (!isPlainObject(rubrica)) continue;
      // 0 é valor real e tem de gerar linha; ausência e valores inválidos não.
      if (typeof rubrica.value !== "number" || !Number.isFinite(rubrica.value)) continue;

      linhas.push({
        id: `${monthKey}:${key}`,
        monthKey,
        monthLabel: monthLongLabel(monthKey),
        key,
        label: RUBRICA_LABELS[key] || key,
        value: rubrica.value,
        updatedAt: typeof rubrica.updatedAt === "string" ? rubrica.updatedAt : null,
        updatedAtLabel: formatUpdatedAt(rubrica.updatedAt),
        note: lerNota(rubrica.note),
      });
    }
  }
  return linhas;
}

/**
 * Estado do ecrã + linhas, numa só decisão, para a página não ter de a repetir.
 *
 * @param {object|null} manualInputs envelope { status, valuesByMonth, document }
 * @param {boolean} loading estado de carregamento do contexto
 */
export function resolveManualInputsView(manualInputs, loading) {
  if (loading) return { state: MANUAL_INPUTS_VIEW.LOADING, rows: [] };

  // Sem envelope não há fonte: em modo de demonstração, ou se o carregamento falhou.
  if (!manualInputs || typeof manualInputs.status !== "string") {
    return { state: MANUAL_INPUTS_VIEW.ERROR, rows: [] };
  }
  if (ESTADOS_SEM_AJUSTES.indexOf(manualInputs.status) === -1) {
    // corrompido, ambíguo, empresa divergente, fonte indisponível: tudo o mesmo ecrã.
    return { state: MANUAL_INPUTS_VIEW.ERROR, rows: [] };
  }

  const rows = buildManualInputsRows(manualInputs);
  return rows.length > 0
    ? { state: MANUAL_INPUTS_VIEW.ROWS, rows }
    : { state: MANUAL_INPUTS_VIEW.EMPTY, rows: [] };
}