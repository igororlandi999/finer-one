// CLIENTE AUTENTICADO — o que sai no pedido, e o que nunca sai.
//
// Estes testes interceptam o `fetch` e inspecionam o pedido literal. Não verificam que
// o cliente "tem intenção" de mandar o token: verificam o cabeçalho que saiu.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAuthorizedApi, companyPath, assertPayloadSemIdentidade,
  AUTHORIZED_API_ERROR, AuthorizedApiError,
} from "./authorizedApi.js";
import { CAMPOS_DE_IDENTIDADE_PROIBIDOS } from "../auth/authorizationCore.js";

const BASE = "https://finer-one-proxy.vercel.app/api";

/** O módulo `api.js` lê `import.meta.env.VITE_API_BASE_URL` no arranque. */
vi.mock("./api.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, isApiConfigured: () => true };
});

let chamadas = [];

function responder({ status = 200, body = { data: { ok: true } } } = {}) {
  return vi.fn(async (url, init) => {
    chamadas.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
}

beforeEach(() => {
  chamadas = [];
  vi.stubEnv("VITE_API_BASE_URL", BASE);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function cliente(over = {}) {
  return createAuthorizedApi({
    getAccessToken: async () => "token-abc",
    companyId: "overcel",
    ...over,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O QUE SAI NO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o pedido que sai", () => {
  it("leva o token em Authorization: Bearer", async () => {
    globalThis.fetch = responder();
    await cliente().get("financial-data");
    expect(chamadas[0].init.headers.Authorization).toBe("Bearer token-abc");
  });

  it("o companyId vai no CAMINHO, não em query nem em corpo", async () => {
    globalThis.fetch = responder();
    await cliente().get("financial-data");
    expect(chamadas[0].url).toBe(`${BASE}/companies/overcel/financial-data`);
    expect(chamadas[0].url).not.toContain("?");
    expect(chamadas[0].init.body).toBeUndefined();
  });

  it("um POST leva o corpo em JSON", async () => {
    globalThis.fetch = responder();
    await cliente().post("manual-coverage", { monthKey: "2026-07" });
    expect(chamadas[0].init.method).toBe("POST");
    expect(JSON.parse(chamadas[0].init.body)).toEqual({ monthKey: "2026-07" });
    expect(chamadas[0].init.headers["Content-Type"]).toBe("application/json");
  });

  it("o token é pedido A CADA chamada, nunca reutilizado de uma anterior", async () => {
    globalThis.fetch = responder();
    let n = 0;
    const getAccessToken = vi.fn(async () => `token-${++n}`);
    const api = cliente({ getAccessToken });
    await api.get("financial-data");
    await api.get("financial-data");
    expect(getAccessToken).toHaveBeenCalledTimes(2);
    expect(chamadas[0].init.headers.Authorization).toBe("Bearer token-1");
    expect(chamadas[1].init.headers.Authorization).toBe("Bearer token-2");
  });

  it("um companyId com caracteres especiais é codificado", async () => {
    expect(companyPath("a/b", "x")).toBe("companies/a%2Fb/x");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O QUE NUNCA SAI
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("identidade nunca sai do cliente", () => {
  it.each(CAMPOS_DE_IDENTIDADE_PROIBIDOS)("um payload com %s é recusado ANTES de sair", async (campo) => {
    globalThis.fetch = responder();
    await expect(cliente().post("manual-coverage", { monthKey: "2026-07", [campo]: "x" }))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.PAYLOAD_COM_IDENTIDADE });
    expect(chamadas).toHaveLength(0);   // o pedido nem chegou à rede
  });

  it("a mensagem do erro nomeia o campo, para o programador saber o que remover", async () => {
    globalThis.fetch = responder();
    try {
      await cliente().post("x", { actorUserId: "u1" });
      throw new Error("devia ter falhado");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthorizedApiError);
      expect(e.message).toContain("actorUserId");
    }
  });

  it("assertPayloadSemIdentidade aceita payloads limpos", () => {
    expect(() => assertPayloadSemIdentidade({ monthKey: "2026-07", note: "x" })).not.toThrow();
    expect(() => assertPayloadSemIdentidade(undefined)).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * SEM TOKEN NÃO SE FAZ O PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("sem sessão", () => {
  it.each([
    ["null", async () => null],
    ["vazio", async () => ""],
    ["não string", async () => ({ token: "x" })],
    ["rebenta", async () => { throw new Error("sem adaptador"); }],
  ])("token %s -> erro SEM_SESSAO e nenhum pedido à rede", async (_r, getAccessToken) => {
    globalThis.fetch = responder();
    await expect(cliente({ getAccessToken }).get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.SEM_SESSAO });
    expect(chamadas).toHaveLength(0);
  });

  it("companyId inválido é apanhado antes de tudo o resto", async () => {
    globalThis.fetch = responder();
    await expect(cliente({ companyId: "../empresa-b" }).get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.EMPRESA_INVALIDA });
    expect(chamadas).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 401 E 403 SÃO COISAS DIFERENTES
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("respostas de recusa", () => {
  it("401 -> NAO_AUTENTICADO e dispara onUnauthorized", async () => {
    globalThis.fetch = responder({ status: 401, body: { error: true, code: "UNAUTHENTICATED" } });
    const onUnauthorized = vi.fn();
    await expect(cliente({ onUnauthorized }).get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.NAO_AUTENTICADO, status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("403 -> SEM_ACESSO e NÃO dispara onUnauthorized", async () => {
    /* Terminar a sessão num 403 expulsaria da aplicação um utilizador que ainda tem
     * outras empresas válidas, e faria parecer que a culpa é das credenciais. */
    globalThis.fetch = responder({ status: 403, body: { error: true, code: "FORBIDDEN" } });
    const onUnauthorized = vi.fn();
    await expect(cliente({ onUnauthorized }).get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.SEM_ACESSO, status: 403 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("500 -> BACKEND, distinto dos dois anteriores", async () => {
    globalThis.fetch = responder({ status: 500, body: { error: true } });
    await expect(cliente().get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.BACKEND, status: 500 });
  });

  it("falha de rede -> REDE", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(cliente().get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.REDE });
  });

  it("um onUnauthorized que rebenta não engole o erro original", async () => {
    globalThis.fetch = responder({ status: 401 });
    await expect(cliente({ onUnauthorized: () => { throw new Error("x"); } }).get("financial-data"))
      .rejects.toMatchObject({ code: AUTHORIZED_API_ERROR.NAO_AUTENTICADO });
  });
});
