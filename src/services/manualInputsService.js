// src/services/manualInputsService.js
// Fronteira dos AJUSTES MANUAIS financeiros (primeiro caso: CMV mensal).
//
// Duas responsabilidades, deliberadamente separadas:
//   - normalizeManualInputs: função PURA, autoridade única sobre o shape do documento;
//   - fetchManualInputs: transporte best-effort, que não repete uma só regra de shape.
//
// Regras inegociáveis desta camada:
//   - Nunca inventar um ajuste. Sem fonte válida, o resultado é AUSÊNCIA (undefined),
//     que o motor já traduz em CMV null / availability unavailable.
//   - 0 é valor manual REAL. Ausência de chave é outra coisa. Nunca colapsar os dois.
//   - Documento válido com zero meses é um facto real (mapa vazio), não ausência.
//   - Só se aceita o que se reconhece: mês fora de aaaa-mm e rubrica desconhecida são
//     ignorados sem derrubar o resto do documento.
//   - Empresa errada não é "dado a filtrar": é documento a rejeitar por inteiro.

import { apiGet } from "./api.js";
import { ACTIVE_COMPANY } from "../config/company.js";
import { createLegacyDataTransport, RECURSOS } from "./dataTransport.js";
import { normalizeManualCoverage } from "../utils/manualCoverage.js";

/* Rubricas manuais reconhecidas hoje. A lista existe para que uma rubrica futura
 * (resultado financeiro, impostos sobre o lucro, ajustes extraordinários) entre por
 * acrescento explícito e nunca por acaso. */
export const RUBRICAS_MANUAIS_CONHECIDAS = ["cmv"];

/* Marcador de ausência no protocolo do backend, espelhando "snapshot-vazio" já usado
 * pelos recebíveis: documento inexistente, ilegível ou inválido do lado do servidor. */
export const FONTE_AUSENCIA = "documento-vazio";

/* Estados de origem, para consumo APRESENTACIONAL. Não têm efeito financeiro nenhum:
 * o motor continua a ver apenas o mapa, e qualquer estado que não seja DOCUMENTO produz
 * mapa indefinido. Existem porque uma área administrativa precisa de distinguir
 * "ainda não há ajustes" de "não foi possível ler os ajustes" — para o utilizador são
 * frases diferentes, mesmo quando para a DRE são a mesma coisa. */
export const MANUAL_INPUTS_STATUS = {
  DOCUMENTO: "documento",
  VAZIO: "documento-vazio",
  CORROMPIDO: "documento-corrompido",
  AMBIGUO: "documento-ambiguo",
  EMPRESA_DIVERGENTE: "documento-empresa-divergente",
  INDISPONIVEL: "fonte-indisponivel",   // rede, timeout, { error: true }, shape irreconhecível
};

const ESTADOS_DE_AUSENCIA_DO_BACKEND = [
  MANUAL_INPUTS_STATUS.VAZIO,
  MANUAL_INPUTS_STATUS.CORROMPIDO,
  MANUAL_INPUTS_STATUS.AMBIGUO,
  MANUAL_INPUTS_STATUS.EMPRESA_DIVERGENTE,
];

const RE_MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Objeto simples: exclui null, arrays e primitivos. */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Valor manual utilizável.
 * Aceita SÓ número finito. String numérica é rejeitada de propósito: o documento é
 * escrito por nós, não pelo Bling, logo não há razão para tolerar formatos ambíguos
 * numa rubrica que entra diretamente na DRE.
 * 0 é válido; NaN, Infinity, null, "500" e booleanos não são.
 */
function valorManualValido(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Extrai o valor de uma rubrica no shape do documento: { value, updatedAt, note }.
 * Devolve { ok: true, value } ou { ok: false }. Nunca devolve 0 por omissão.
 */
function lerRubrica(rubrica) {
  if (!isPlainObject(rubrica)) return { ok: false };
  if (!valorManualValido(rubrica.value)) return { ok: false };
  return { ok: true, value: rubrica.value };
}

/**
 * Normaliza o payload de ajustes manuais em `manualInputsByMonth`.
 *
 * @param {*} payload Resposta crua do recurso (ou qualquer coisa: a função é defensiva).
 * @param {{companyId?: string}} [opts] Empresa esperada; por omissão, a empresa ativa.
 * @returns {Object|undefined}
 *   undefined => AUSÊNCIA de fonte. O chamador não deve fabricar mapa nenhum.
 *   {}        => documento real sem ajustes registados (facto, não ausência).
 *   { "aaaa-mm": { cmv: number } } => ajustes reconhecidos, mês a mês.
 */
export function normalizeManualInputs(payload, { companyId = ACTIVE_COMPANY.id } = {}) {
  // ── Ausência declarada pelo protocolo ou pela forma do payload ──
  if (!isPlainObject(payload)) return undefined;
  if (payload.error === true) return undefined;
  if (isPlainObject(payload.debug) && payload.debug.fonte === FONTE_AUSENCIA) return undefined;

  const doc = payload.data;
  /* `data` como ARRAY é rejeitado explicitamente. Não é zelo teórico: enquanto o
   * recurso não existir no Apps Script, um ?recurso=ajustes-manuais cai no ramo por
   * omissão do doGet e devolve o snapshot de PEDIDOS, ou seja { data: [...] }. Sem
   * esta guarda, centenas de pedidos entrariam aqui como se fossem um documento. */
  if (!isPlainObject(doc)) return undefined;
  if (typeof doc.companyId !== "string" || doc.companyId.length === 0) return undefined;
  if (!isPlainObject(doc.months)) return undefined;

  // ── Empresa: documento de outra empresa não se aproveita em parte nenhuma ──
  if (doc.companyId !== companyId) return undefined;

  // ── Meses e rubricas ──
  const out = {};
  for (const mk of Object.keys(doc.months)) {
    if (!RE_MONTH_KEY.test(mk)) continue;          // mês fora de aaaa-mm: ignorado
    const mes = doc.months[mk];
    if (!isPlainObject(mes)) continue;

    const inputs = {};
    for (const chave of RUBRICAS_MANUAIS_CONHECIDAS) {
      const lido = lerRubrica(mes[chave]);
      if (lido.ok) inputs[chave] = lido.value;      // inclui 0
    }

    /* Mês sem nenhuma rubrica reconhecida não entra no mapa. Um {} por mês teria o
     * mesmo efeito no motor, mas afirmaria a existência de um ajuste que não existe. */
    if (Object.keys(inputs).length > 0) out[mk] = inputs;
  }

  return out;
}

/* ====================================================================================
 * TRANSPORTE — leitura best-effort do documento de ajustes manuais.
 *
 * O Apps Script devolve HTTP 200 mesmo em erro, pelo que `res.ok` não diz nada sobre o
 * conteúdo. Quem decide se há fonte utilizável é `normalizeManualInputs`, a partir do
 * corpo: estados de domínio (documento-vazio, -corrompido, -ambiguo,
 * -empresa-divergente), `{ error: true }` e shapes inesperados resolvem-se todos lá.
 * Aqui não se duplica nenhuma dessas regras.
 *
 * Falha de rede, timeout ou qualquer exceção => ausência. Nunca propaga para cima: os
 * ajustes manuais são uma fonte secundária e a sua indisponibilidade não pode derrubar
 * pedidos, despesas ou recebíveis.
 * ==================================================================================== */
export async function fetchManualInputs({ companyId = ACTIVE_COMPANY.id, transport } = {}) {
  let res;
  try {
    /* Mesmo transporte das outras três fontes (FASE 8). Sem ele, o caminho legado —
     * que é o de hoje. */
    const transporte = transport || createLegacyDataTransport();
    res = await transporte.ler(RECURSOS.AJUSTES_MANUAIS);
  } catch {
    return envelopeManualInputs(undefined, undefined); // rede/timeout: ausência, não erro
  }
  return envelopeManualInputs(res, normalizeManualInputs(res, { companyId }));
}

/**
 * Estado de origem — função PURA, derivada do payload E do resultado da normalização.
 *
 * INVARIANTE: o estado nunca contradiz o motor. `documento` se e só se existe mapa;
 * qualquer outro estado implica mapa indefinido. Sem isto, a UI poderia dizer
 * "documento carregado" enquanto a DRE mostra CMV indisponível.
 */
export function resolveManualInputsStatus(payload, valuesByMonth) {
  if (valuesByMonth !== undefined) return MANUAL_INPUTS_STATUS.DOCUMENTO;
  const fonte = (payload && payload.debug && typeof payload.debug.fonte === "string")
    ? payload.debug.fonte : null;
  if (fonte && ESTADOS_DE_AUSENCIA_DO_BACKEND.indexOf(fonte) !== -1) return fonte;
  return MANUAL_INPUTS_STATUS.INDISPONIVEL;
}

/**
 * Envelope de uma única leitura, a servir dois consumidores com necessidades diferentes:
 *   - `valuesByMonth` alimenta o motor financeiro (contrato inalterado desde a C3);
 *   - `status` e `document` alimentam a apresentação administrativa.
 *
 * `document` só é exposto quando há mapa — ou seja, quando o documento passou pelo
 * normalizador e pertence à empresa ativa. Nunca se entrega o documento de outra
 * empresa a pretexto de "mostrar metadata".
 */
export function envelopeManualInputs(payload, valuesByMonth) {
  const status = resolveManualInputsStatus(payload, valuesByMonth);
  const document = (valuesByMonth !== undefined && payload && payload.data) ? payload.data : null;
  /* COBERTURA CONFIRMADA — terceiro consumidor da MESMA leitura, e deliberadamente um
   * campo à parte.
   *
   * Não entra em `valuesByMonth`: o contrato que o `dreEngine` vê continua a ser um mapa
   * de rubricas por mês, e cobertura não é uma rubrica. Misturá-los faria o CMV e a
   * cobertura partilhar validação, escrita e histórico — três coisas que não têm as
   * mesmas regras. `manualCoverage.js` é a autoridade sobre este shape, tal como esta
   * função é a autoridade sobre o outro.
   *
   * Só se lê a cobertura de um documento que já passou pela guarda de empresa:
   * `document` é null quando o documento é de outra empresa, e daí não sai cobertura
   * nenhuma. */
  const coverage = document ? normalizeManualCoverage(document.coverage) : undefined;
  return { status: status, valuesByMonth: valuesByMonth, document: document, coverage: coverage };
}