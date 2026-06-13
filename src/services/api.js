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

export async function apiGet(path, { params, headers, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!isApiConfigured()) {
    throw new ApiError("Sem backend configurado (VITE_API_BASE_URL vazio).", { status: 0 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(buildUrl(path, params), {
      method: "GET",
      headers: { Accept: "application/json", ...(headers || {}) },
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(`Pedido falhou (${res.status}).`, { status: res.status });
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
