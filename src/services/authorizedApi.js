// src/services/authorizedApi.js
// O CLIENTE AUTENTICADO. Todos os pedidos a recursos de uma empresa passam por aqui.
//
// ─── O CONTRATO, EM UMA LINHA ───────────────────────────────────────────────────────
//   React -> Authorization: Bearer <token> -> BFF -> verifica -> resolve -> responde.
//
// ─── O QUE ESTE FICHEIRO NUNCA ENVIA ────────────────────────────────────────────────
// `userId`, `role`, `memberships` ou configuração da empresa. Nem no corpo, nem em
// query, nem em cabeçalhos. O servidor deriva tudo isso do token — e se algum dia um
// programador acrescentar `actorUserId` a um payload, o BFF responde 400 em vez de o
// ignorar em silêncio (`assertNoClientSuppliedIdentity`). O erro aparece no dia em que
// é escrito, não seis meses depois.
//
// O `companyId` VIAJA, no caminho do URL. Não é uma exceção à regra: é o PEDIDO ("quero
// os dados desta empresa"), não a AUTORIZAÇÃO ("posso"). O servidor procura uma
// membership entre o utilizador do token e este id, e sem ela responde 403.
//
// ─── SEM TOKEN NÃO SE FAZ O PEDIDO ──────────────────────────────────────────────────
// Um pedido sem token receberia 401 na mesma — o servidor está lá para isso. Não o
// fazer é uma questão de honestidade do cliente: uma aplicação que dispara pedidos que
// sabe que vão falhar enche os registos de 401 legítimos e torna impossível distinguir
// um ataque de uma aba esquecida aberta.

import { apiRequest, ApiError, isApiConfigured } from "./api.js";
import { isValidCompanyId, CAMPOS_DE_IDENTIDADE_PROIBIDOS } from "../auth/authorizationCore.js";

/** Falhas que o chamador precisa de distinguir. */
export const AUTHORIZED_API_ERROR = {
  /** Não há sessão utilizável. O pedido nem sai. */
  SEM_SESSAO: "sem_sessao",
  /** 401: o servidor não reconheceu o token. É preciso voltar a entrar. */
  NAO_AUTENTICADO: "nao_autenticado",
  /** 403: o servidor reconheceu o utilizador e recusou a empresa ou a ação. */
  SEM_ACESSO: "sem_acesso",
  /** Empresa ativa em falta ou malformada — erro nosso, não do servidor. */
  EMPRESA_INVALIDA: "empresa_invalida",
  /** O payload trazia identidade. Erro de programação, apanhado antes de sair. */
  PAYLOAD_COM_IDENTIDADE: "payload_com_identidade",
  REDE: "rede",
  BACKEND: "backend",
};

export class AuthorizedApiError extends Error {
  constructor(code, message, { status = 0, cause = null } = {}) {
    super(message);
    this.name = "AuthorizedApiError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

/** Caminho canónico de um recurso de empresa. Um sítio só: um caminho escrito à mão
 *  noutro ficheiro é o começo de um endpoint que se esquece do `companyId`. */
export function companyPath(companyId, recurso) {
  return `companies/${encodeURIComponent(companyId)}/${String(recurso).replace(/^\/+/, "")}`;
}

/**
 * Guarda de cliente: um payload de escrita não pode trazer identidade.
 *
 * Duplica a validação que o servidor faz. É duplicação DESEJADA e as duas metades têm
 * propósitos diferentes: a do servidor é a barreira (um cliente hostil não a contorna),
 * esta é o alarme (um cliente NOSSO que erre falha aqui, com uma mensagem que diz
 * exatamente o que fazer, em vez de receber um 400 opaco em produção).
 */
export function assertPayloadSemIdentidade(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return;
  for (const campo of CAMPOS_DE_IDENTIDADE_PROIBIDOS) {
    if (Object.prototype.hasOwnProperty.call(payload, campo)) {
      throw new AuthorizedApiError(
        AUTHORIZED_API_ERROR.PAYLOAD_COM_IDENTIDADE,
        `O campo "${campo}" não pode ser enviado pelo cliente: o servidor deriva-o do token.`
      );
    }
  }
}

/**
 * Cria um cliente ligado a uma sessão e a uma empresa.
 *
 * @param {object} args
 * @param {() => Promise<string|null>} args.getAccessToken  Pedido ao adaptador NO
 *   MOMENTO de cada chamada, nunca em cache: entre dois pedidos o token pode ter sido
 *   renovado, e um token em cache é um 401 à espera de acontecer.
 * @param {string} args.companyId
 * @param {(erro: AuthorizedApiError) => void} [args.onUnauthorized]  Chamado em 401.
 *   É por aqui que a aplicação faz logout quando a sessão morre do lado do servidor.
 */
export function createAuthorizedApi({ getAccessToken, companyId, onUnauthorized } = {}) {
  async function pedir(recurso, { method = "GET", params, body } = {}) {
    if (!isValidCompanyId(companyId)) {
      throw new AuthorizedApiError(AUTHORIZED_API_ERROR.EMPRESA_INVALIDA, "Empresa ativa inválida.");
    }
    if (!isApiConfigured()) {
      throw new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Sem backend configurado.");
    }
    if (body !== undefined) assertPayloadSemIdentidade(body);

    let token = null;
    try { token = typeof getAccessToken === "function" ? await getAccessToken() : null; }
    catch { token = null; }
    if (typeof token !== "string" || token === "") {
      throw new AuthorizedApiError(AUTHORIZED_API_ERROR.SEM_SESSAO, "Sessão não disponível.");
    }

    try {
      return await apiRequest(companyPath(companyId, recurso), {
        method,
        params,
        body,
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          const e = new AuthorizedApiError(AUTHORIZED_API_ERROR.NAO_AUTENTICADO, "Sessão inválida ou expirada.", { status: 401, cause: err });
          if (typeof onUnauthorized === "function") { try { onUnauthorized(e); } catch { /* o erro segue */ } }
          throw e;
        }
        if (err.status === 403) {
          /* 403 NÃO desencadeia logout. A sessão é boa; o que falha é o acesso a ESTA
           * empresa. Terminar a sessão aqui expulsaria da aplicação um utilizador que
           * ainda tem outras empresas válidas — e faria parecer que a culpa é das
           * credenciais. */
          throw new AuthorizedApiError(AUTHORIZED_API_ERROR.SEM_ACESSO, "Sem acesso a esta empresa.", { status: 403, cause: err });
        }
        if (err.status === 0) {
          throw new AuthorizedApiError(AUTHORIZED_API_ERROR.REDE, err.message, { status: 0, cause: err });
        }
        throw new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, err.message, { status: err.status, cause: err });
      }
      throw err;
    }
  }

  return {
    companyId,
    get: (recurso, opts) => pedir(recurso, { ...opts, method: "GET" }),
    post: (recurso, body, opts) => pedir(recurso, { ...opts, method: "POST", body }),
  };
}
