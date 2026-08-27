// src/services/coverageWriteClient.js
// A ESCRITA PROTEGIDA que finalmente desbloqueia a persistência da cobertura.
//
// ─── O QUE ESTÁ BLOQUEADO HOJE, E PORQUÊ ────────────────────────────────────────────
// A confirmação de cobertura funciona no motor mas não persiste. A razão está escrita
// em `FinerDataContext.jsx` e em `docs/COBERTURA_CONFIRMADA_CONTRATO.md` §4: o Web App
// do Apps Script é `ANYONE_ANONYMOUS` e o URL do proxy vai no bundle, pelo que qualquer
// endpoint de escrita alcançável a partir do frontend seria um endpoint de escrita
// ANÓNIMO sobre dados financeiros.
//
// Este ficheiro é a metade do cliente da solução: a escrita passa a ir para o BFF, com
// token, e o BFF só a aceita depois de verificar a membership. Deixa de haver escrita
// anónima — passa a haver escrita autenticada e autorizada.
//
// ─── O PAYLOAD MÍNIMO, E O QUE ELE DELIBERADAMENTE NÃO TEM ──────────────────────────
//   ENVIA-SE:  { monthKey, source, note? }
//   NÃO SE ENVIA: actorUserId, confirmedBy, companyId no corpo, role.
//
// `confirmedBy` era, na versão em memória, a string "user". Enviá-lo ao servidor seria
// deixar o cliente escolher o autor de um registo de auditoria financeiro — o exato
// oposto do que um registo de auditoria serve. O servidor deriva o autor do token
// verificado, e é por isso que `assertNoClientSuppliedIdentity` REJEITA o pedido em vez
// de ignorar o campo: um cliente que o envie ou tem um bug ou está a personificar
// alguém, e nenhum dos dois merece silêncio.
//
// ─── ESTE FICHEIRO NÃO VALIDA A REGRA DE NEGÓCIO ────────────────────────────────────
// Quem decide se um mês pode ser confirmado é `validarConfirmacaoCobertura` em
// `utils/manualCoverage.js`, e a validação que CONTA é a que o servidor faz com o seu
// próprio relógio. Validar aqui é cortesia — poupa uma ida à rede para um mês futuro
// que o servidor recusaria de qualquer forma. O relógio do cliente é do cliente.

import { createAuthorizedApi, AUTHORIZED_API_ERROR, AuthorizedApiError } from "./authorizedApi.js";
import { validarConfirmacaoCobertura, FONTES_COBERTURA_CONFIRMAVEL } from "../utils/manualCoverage.js";

/** O recurso, no caminho já escopado por empresa: /companies/:companyId/manual-coverage */
export const RECURSO_COBERTURA = "manual-coverage";

/**
 * Constrói o payload da confirmação. PURO e exportado para ser testável sozinho —
 * é o sítio onde se prova, por teste, que nenhum campo de identidade sai daqui.
 *
 * @returns {{monthKey: string, source: string, note?: string}}
 */
export function buildCoveragePayload({ monthKey, source = "payables", note } = {}) {
  const payload = { monthKey, source };
  if (typeof note === "string" && note.trim() !== "") payload.note = note.trim();
  return payload;
}

/**
 * Cliente da escrita de cobertura.
 *
 * @param {object} args
 * @param {() => Promise<string|null>} args.getAccessToken
 * @param {string} args.companyId
 * @param {Date} [args.referenceDate]  Relógio do cliente, para a validação de cortesia.
 * @param {Function} [args.onUnauthorized]
 */
export function createCoverageWriteClient({ getAccessToken, companyId, referenceDate, onUnauthorized } = {}) {
  const api = createAuthorizedApi({ getAccessToken, companyId, onUnauthorized });

  return {
    /**
     * Confirma a cobertura de um mês.
     *
     * @returns {Promise<{ok: true, coverage: object}|{ok: false, code: string, status?: number}>}
     *   Nunca lança por falha esperada. Um erro de rede, um 401 e um 403 são três
     *   respostas diferentes que a UI tem de saber apresentar de forma diferente, e
     *   uma exceção colapsaria as três num só `catch`.
     */
    async confirmar({ monthKey, source = "payables", note } = {}) {
      if (FONTES_COBERTURA_CONFIRMAVEL.indexOf(source) === -1) {
        return { ok: false, code: "fonte_desconhecida" };
      }
      if (referenceDate instanceof Date) {
        const v = validarConfirmacaoCobertura({ fonte: source, monthKey, referenceDate });
        if (!v.ok) return { ok: false, code: v.code };
      }

      try {
        const resposta = await api.post(RECURSO_COBERTURA, buildCoveragePayload({ monthKey, source, note }));
        /* A resposta do servidor é a nova cobertura, TAL COMO ELE A GRAVOU. Não se
         * reconstrói localmente a partir do que se enviou: o servidor pode ter
         * normalizado o mês, recusado a nota ou carimbado uma data diferente, e a
         * verdade é a dele. */
        return { ok: true, coverage: resposta?.data ?? resposta ?? null };
      } catch (err) {
        if (err instanceof AuthorizedApiError) return { ok: false, code: err.code, status: err.status };
        return { ok: false, code: AUTHORIZED_API_ERROR.BACKEND };
      }
    },
  };
}
