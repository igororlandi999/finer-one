// src/services/api.js
// Cliente HTTP genérico do Finer One. Não conhece o Bling nem regras de negócio.
// O backend (Google Apps Script, Vercel API, etc.) liga-se definindo
// VITE_API_BASE_URL. Sem essa variável, a app funciona com o mockData.

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";

const DEFAULT_TIMEOUT = 12000;

export class ApiError extends Error {
  constructor(message, { status = 0, cause = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.cause = cause;
  }
}

export function isApiConfigured() {
  return typeof API_BASE_URL === "string" && API_BASE_URL.trim().length > 0;
}

function buildUrl(path, params) {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const clean = String(path || "").replace(/^\/+/, "");
  const url = base ? `${base}/${clean}` : `/${clean}`;
  if (!params) return url;
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${url}?${qs}` : url;
}

/**
 * Pedido HTTP genérico. `apiGet` é o caso particular e continua a ser o que a leitura
 * de snapshots usa — nada do que já existe muda de comportamento.
 *
 * ─── PORQUE ISTO GANHOU MÉTODO E CORPO (fundação SaaS) ──────────────────────────────
 * O cliente autenticado (`authorizedApi.js`) precisa de POST para as escritas
 * protegidas. Acrescentar aqui, em vez de um segundo cliente HTTP ao lado, mantém um
 * só sítio a tratar de timeout, de abortos e da tradução de erros — que é a razão de
 * este ficheiro existir.
 *
 * NOTA DE SEGURANÇA: este módulo não conhece tokens nem sessões e não deve passar a
 * conhecer. Quem os junta é `authorizedApi.js`, através de `headers`. Um cliente HTTP
 * que soubesse ir buscar o token sozinho tornaria impossível dizer, olhando para uma
 * chamada, se ela é autenticada ou não.
 */
export async function apiRequest(path, {
  method = "GET", params, headers, body, timeout = DEFAULT_TIMEOUT,
} = {}) {
  if (!isApiConfigured()) {
    throw new ApiError("Sem backend configurado (VITE_API_BASE_URL vazio).", { status: 0 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const temCorpo = body !== undefined && body !== null;
    const res = await fetch(buildUrl(path, params), {
      method,
      headers: {
        Accept: "application/json",
        ...(temCorpo ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      ...(temCorpo ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    if (!res.ok) {
      /* O CORPO do erro é lido e anexado. 401 e 403 trazem um código estável que o
       * cliente autenticado precisa de distinguir (reautenticar vs. não tem acesso),
       * e deitá-lo fora aqui obrigaria a adivinhar pelo estado. */
      let payload = null;
      try { payload = await res.json(); } catch { /* erro sem corpo JSON */ }
      const err = new ApiError(`Pedido falhou (${res.status}).`, { status: res.status });
      err.payload = payload;
      err.code = payload && typeof payload.code === "string" ? payload.code : null;
      throw err;
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === "AbortError") {
      throw new ApiError("Tempo de espera excedido.", { status: 0, cause: err });
    }
    throw new ApiError("Erro de rede ao contactar o backend.", { status: 0, cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet(path, { params, headers, timeout = DEFAULT_TIMEOUT } = {}) {
  return apiRequest(path, { method: "GET", params, headers, timeout });
}
