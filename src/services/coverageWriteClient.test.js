// ESCRITA PROTEGIDA DA COBERTURA — o contrato do cliente.
//
// A afirmação central: o payload que sai daqui contém o MÊS e mais nada que se pareça
// com identidade. Em particular, não contém `confirmedBy` — que na versão em memória
// era a string "user" e que, enviado ao servidor, deixaria o cliente escolher o autor
// de um registo de auditoria financeiro.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCoverageWriteClient, buildCoveragePayload, RECURSO_COBERTURA } from "./coverageWriteClient.js";
import { AUTHORIZED_API_ERROR } from "./authorizedApi.js";
import { COVERAGE_REJECTION } from "../utils/manualCoverage.js";

const BASE = "https://finer-one-proxy.vercel.app/api";
/** 26 de agosto de 2026: o último mês encerrado é julho. */
const AGORA = new Date(2026, 7, 26, 12, 0, 0);

vi.mock("./api.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, isApiConfigured: () => true };
});

let chamadas = [];

function responder({ status = 200, body = { data: { payables: { completeThroughMonth: "2026-07" } } } } = {}) {
  return vi.fn(async (url, init) => {
    chamadas.push({ url: String(url), init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}

beforeEach(() => { chamadas = []; vi.stubEnv("VITE_API_BASE_URL", BASE); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function cliente(over = {}) {
  return createCoverageWriteClient({
    getAccessToken: async () => "token-abc",
    companyId: "overcel",
    referenceDate: AGORA,
    ...over,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O PAYLOAD
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("payload mínimo", () => {
  it("contém apenas monthKey e source", () => {
    expect(buildCoveragePayload({ monthKey: "2026-07" })).toEqual({ monthKey: "2026-07", source: "payables" });
  });

  it("a nota entra quando existe, e é aparada", () => {
    expect(buildCoveragePayload({ monthKey: "2026-07", note: "  faturas recebidas  " }))
      .toEqual({ monthKey: "2026-07", source: "payables", note: "faturas recebidas" });
  });

  it("uma nota vazia não cria a chave", () => {
    expect(buildCoveragePayload({ monthKey: "2026-07", note: "   " }))
      .not.toHaveProperty("note");
  });

  it.each(["confirmedBy", "actorUserId", "userId", "companyId", "role"])(
    "NUNCA inclui %s", (campo) => {
      const p = buildCoveragePayload({ monthKey: "2026-07", note: "x" });
      expect(p).not.toHaveProperty(campo);
    });

  it("o payload que SAI na rede é exatamente esse", async () => {
    globalThis.fetch = responder();
    await cliente().confirmar({ monthKey: "2026-07" });
    expect(JSON.parse(chamadas[0].init.body)).toEqual({ monthKey: "2026-07", source: "payables" });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o pedido", () => {
  it("é um POST autenticado para /companies/:companyId/manual-coverage", async () => {
    globalThis.fetch = responder();
    await cliente().confirmar({ monthKey: "2026-07" });
    expect(chamadas[0].url).toBe(`${BASE}/companies/overcel/${RECURSO_COBERTURA}`);
    expect(chamadas[0].init.method).toBe("POST");
    expect(chamadas[0].init.headers.Authorization).toBe("Bearer token-abc");
  });

  it("a cobertura devolvida é a do SERVIDOR, não a reconstruída localmente", async () => {
    /* O servidor pode ter normalizado o mês, recusado a nota ou carimbado outra data.
     * A verdade é a dele. */
    globalThis.fetch = responder({ body: { data: { payables: { completeThroughMonth: "2026-06" } } } });
    const r = await cliente().confirmar({ monthKey: "2026-07" });
    expect(r.ok).toBe(true);
    expect(r.coverage.payables.completeThroughMonth).toBe("2026-06");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * VALIDAÇÃO DE CORTESIA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("validação local (cortesia)", () => {
  it("um mês futuro nem chega à rede", async () => {
    globalThis.fetch = responder();
    const r = await cliente().confirmar({ monthKey: "2026-08" });
    expect(r).toEqual({ ok: false, code: COVERAGE_REJECTION.MES_FUTURO });
    expect(chamadas).toHaveLength(0);
  });

  it("um mês malformado nem chega à rede", async () => {
    globalThis.fetch = responder();
    expect((await cliente().confirmar({ monthKey: "julho" })).code).toBe(COVERAGE_REJECTION.MES_INVALIDO);
    expect(chamadas).toHaveLength(0);
  });

  it("uma fonte desconhecida é recusada", async () => {
    globalThis.fetch = responder();
    expect((await cliente().confirmar({ monthKey: "2026-07", source: "receitas" })).code)
      .toBe("fonte_desconhecida");
    expect(chamadas).toHaveLength(0);
  });

  it("SEM relógio do cliente, a validação é do servidor — o pedido sai na mesma", async () => {
    /* O relógio do cliente é do cliente. Um browser com a data adiantada não pode
     * impedir uma confirmação legítima; e a validação que conta é a do servidor. */
    globalThis.fetch = responder();
    const r = await cliente({ referenceDate: undefined }).confirmar({ monthKey: "2026-12" });
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * RECUSAS DO SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("recusas do servidor", () => {
  it("sem token -> 401 traduzido, sem lançar", async () => {
    globalThis.fetch = responder();
    const r = await cliente({ getAccessToken: async () => null }).confirmar({ monthKey: "2026-07" });
    expect(r).toMatchObject({ ok: false, code: AUTHORIZED_API_ERROR.SEM_SESSAO });
  });

  it("401 do servidor -> NAO_AUTENTICADO", async () => {
    globalThis.fetch = responder({ status: 401, body: { error: true, code: "UNAUTHENTICATED" } });
    expect(await cliente().confirmar({ monthKey: "2026-07" }))
      .toMatchObject({ ok: false, code: AUTHORIZED_API_ERROR.NAO_AUTENTICADO, status: 401 });
  });

  it("escrever na EMPRESA ERRADA -> 403 traduzido", async () => {
    globalThis.fetch = responder({ status: 403, body: { error: true, code: "FORBIDDEN" } });
    expect(await cliente({ companyId: "empresa-b" }).confirmar({ monthKey: "2026-07" }))
      .toMatchObject({ ok: false, code: AUTHORIZED_API_ERROR.SEM_ACESSO, status: 403 });
  });

  it("nenhuma falha esperada LANÇA — a UI tem de poder distinguir as três", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const r = await cliente().confirmar({ monthKey: "2026-07" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe(AUTHORIZED_API_ERROR.REDE);
  });
});
