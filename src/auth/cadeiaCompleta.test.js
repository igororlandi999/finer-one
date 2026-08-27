// A CADEIA COMPLETA: browser -> token -> verificação -> membership -> decisão.
//
// ─── O QUE ESTE FICHEIRO ACRESCENTA AOS OUTROS ──────────────────────────────────────
// `authorizationCore.test.js` exercita a decisão com um verificador falso. Aqui a
// cadeia é a REAL do modo de desenvolvimento: o token é emitido pelo adaptador que a
// aplicação usa, verificado pelo verificador que o BFF usa, e as memberships são lidas
// pelo leitor que o BFF usa. Nenhuma das três pontas é simulada dentro do teste.
//
// É o teste que responde à pergunta da FASE 12 sem rodeios:
//
//     Cliente A entra  -> vê Empresa A.
//     Cliente B entra  -> vê Empresa B.
//     Cliente A NÃO consegue obter dados da Empresa B, mesmo manipulando o browser.

import { describe, it, expect } from "vitest";
import {
  createDevAuthAdapter, createDevTokenVerifier, createDevMembershipLoader,
} from "./devAuthAdapter.js";
import { authorizeCompanyRequest, AUTHZ, CAPABILITIES, safeErrorBody } from "./authorizationCore.js";

const DEV = { DEV: true, PROD: false };
const AGORA = new Date("2026-08-26T12:00:00.000Z");

const verifyToken = createDevTokenVerifier({ env: DEV });
const loadMemberships = createDevMembershipLoader({ env: DEV });

function storageFalso() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Simula um cliente: entra, obtém o token, e faz um pedido a uma empresa. */
async function clienteFaz({ email, companyId, capability = CAPABILITIES.READ_FINANCIAL_DATA, payload }) {
  const adapter = createDevAuthAdapter({ env: DEV, storage: storageFalso() });
  const login = await adapter.signIn({ email });
  const token = await adapter.getAccessToken();
  const decisao = await authorizeCompanyRequest({
    /* O cabeçalho é construído como o `authorizedApi.js` o constrói. */
    authorizationHeader: token ? `Bearer ${token}` : undefined,
    companyId,
    capability,
    verifyToken,
    loadMemberships,
    now: AGORA,
    payload,
  });
  return { login, token, decisao };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ISOLAMENTO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("cada cliente vê a sua empresa", () => {
  it("o utilizador da Overcel obtém a Overcel", async () => {
    const { decisao } = await clienteFaz({ email: "dev@finer.local", companyId: "overcel" });
    expect(decisao.status).toBe(200);
    expect(decisao.companyId).toBe("overcel");
    expect(decisao.userId).toBe("dev-user-overcel");
  });

  it("o utilizador da Overcel NÃO obtém a empresa-exemplo", async () => {
    const { decisao } = await clienteFaz({ email: "dev@finer.local", companyId: "empresa-exemplo" });
    expect(decisao.status).toBe(403);
    expect(decisao.decision).toBe(AUTHZ.FORBIDDEN);
  });

  it("o utilizador multiempresa obtém AS DUAS — e mais nenhuma", async () => {
    for (const id of ["overcel", "empresa-exemplo"]) {
      const { decisao } = await clienteFaz({ email: "multi@finer.local", companyId: id });
      expect(decisao.status, id).toBe(200);
    }
    const terceira = await clienteFaz({ email: "multi@finer.local", companyId: "empresa-c" });
    expect(terceira.decisao.status).toBe(403);
  });

  it("o utilizador sem memberships não obtém empresa nenhuma", async () => {
    for (const id of ["overcel", "empresa-exemplo"]) {
      const { decisao } = await clienteFaz({ email: "sem-acesso@finer.local", companyId: id });
      expect(decisao.status, id).toBe(403);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * MANIPULAR O BROWSER NÃO MUDA NADA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("manipulação do lado do cliente", () => {
  it("trocar o companyId do pedido dá 403 — é o ataque do localStorage", async () => {
    /* A aplicação guarda a empresa preferida no localStorage. O atacante troca-a e o
     * pedido sai com outro id. O token continua a ser o dele. */
    const { decisao } = await clienteFaz({ email: "dev@finer.local", companyId: "empresa-exemplo" });
    expect(decisao.status).toBe(403);
  });

  it("forjar um token para outro utilizador não funciona", async () => {
    const decisao = await authorizeCompanyRequest({
      authorizationHeader: "Bearer dev-token:dev-user-multi-inventado",
      companyId: "overcel",
      capability: CAPABILITIES.READ_FINANCIAL_DATA,
      verifyToken, loadMemberships, now: AGORA,
    });
    expect(decisao.status).toBe(401);
  });

  it("um token de OUTRO utilizador válido só dá as empresas DESSE utilizador", async () => {
    /* Roubar um token dá a sessão do dono do token, não privilégios extra. */
    const decisao = await authorizeCompanyRequest({
      authorizationHeader: "Bearer dev-token:dev-user-sem-acesso",
      companyId: "overcel",
      capability: CAPABILITIES.READ_FINANCIAL_DATA,
      verifyToken, loadMemberships, now: AGORA,
    });
    expect(decisao.status).toBe(403);
  });

  it("sem token, 401 — e o corpo do erro não diz nada sobre a empresa", async () => {
    const decisao = await authorizeCompanyRequest({
      authorizationHeader: undefined,
      companyId: "overcel",
      capability: CAPABILITIES.READ_FINANCIAL_DATA,
      verifyToken, loadMemberships, now: AGORA,
    });
    expect(decisao.status).toBe(401);
    expect(JSON.stringify(safeErrorBody(decisao.decision))).not.toContain("overcel");
  });

  it("a empresa alheia e uma empresa inventada respondem exatamente o mesmo", async () => {
    const alheia = await clienteFaz({ email: "dev@finer.local", companyId: "empresa-exemplo" });
    const inventada = await clienteFaz({ email: "dev@finer.local", companyId: "empresa-inexistente" });
    expect(alheia.decisao.status).toBe(inventada.decisao.status);
    expect(safeErrorBody(alheia.decisao.decision)).toEqual(safeErrorBody(inventada.decisao.decision));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * ESCRITAS
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("escrita de cobertura", () => {
  const escrita = { capability: CAPABILITIES.WRITE_FINANCIAL_STATE, payload: { monthKey: "2026-07" } };

  it("sem autenticação -> 401", async () => {
    const decisao = await authorizeCompanyRequest({
      authorizationHeader: undefined, companyId: "overcel",
      capability: escrita.capability, payload: escrita.payload,
      verifyToken, loadMemberships, now: AGORA,
    });
    expect(decisao.status).toBe(401);
  });

  it("na empresa errada -> 403", async () => {
    const { decisao } = await clienteFaz({ email: "dev@finer.local", companyId: "empresa-exemplo", ...escrita });
    expect(decisao.status).toBe(403);
  });

  it("um membro consegue escrever na sua empresa", async () => {
    const { decisao } = await clienteFaz({ email: "multi@finer.local", companyId: "overcel", ...escrita });
    expect(decisao.status).toBe(200);
    expect(decisao.role).toBe("member");
  });

  it("um viewer NÃO consegue escrever, mesmo na sua empresa", async () => {
    const { decisao } = await clienteFaz({ email: "consulta@finer.local", companyId: "overcel", ...escrita });
    expect(decisao.status).toBe(403);
  });

  it("o viewer consegue LER a mesma empresa — a distinção é por capacidade", async () => {
    const { decisao } = await clienteFaz({ email: "consulta@finer.local", companyId: "overcel" });
    expect(decisao.status).toBe(200);
  });

  it("o multiempresa é viewer na empresa-exemplo: lê e não escreve", async () => {
    const leitura = await clienteFaz({ email: "multi@finer.local", companyId: "empresa-exemplo" });
    expect(leitura.decisao.status).toBe(200);
    const escreve = await clienteFaz({ email: "multi@finer.local", companyId: "empresa-exemplo", ...escrita });
    expect(escreve.decisao.status).toBe(403);
  });

  it("o actorUserId da escrita é o do TOKEN", async () => {
    const { decisao } = await clienteFaz({ email: "multi@finer.local", companyId: "overcel", ...escrita });
    expect(decisao.userId).toBe("dev-user-multi");
  });

  it("um payload que tente enviar o autor é rejeitado com 400", async () => {
    const { decisao } = await clienteFaz({
      email: "multi@finer.local", companyId: "overcel",
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07", actorUserId: "dev-user-overcel" },
    });
    expect(decisao.status).toBe(400);
    expect(decisao.campo).toBe("actorUserId");
  });

  it("um payload que tente enviar confirmedBy passa — porque confirmedBy não é identidade", async () => {
    /* `confirmedBy` guarda um PAPEL ("user"), não uma pessoa, e o servidor escreve-o
     * ele próprio. Não está na lista de campos proibidos porque proibir tudo o que
     * soa a identidade tornaria a lista impossível de manter; o que garante que o
     * valor do cliente não conta é o handler nunca o ler. */
    const { decisao } = await clienteFaz({
      email: "multi@finer.local", companyId: "overcel",
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07", confirmedBy: "outra-pessoa" },
    });
    expect(decisao.status).toBe(200);
  });
});
