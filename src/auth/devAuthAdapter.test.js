// AUTENTICAÇÃO SIMULADA — o que ela faz, e sobretudo o que se recusa a fazer.
//
// Dois grupos de testes, com propósitos diferentes:
//   1. o adaptador funciona (login, logout, notificações, fixtures);
//   2. o adaptador é IMPOSSÍVEL em produção, e o `sessionStorage` não concede nada.
//
// O segundo grupo é o que interessa. Um adaptador de desenvolvimento que funcione mal
// custa uma hora a um programador; um que funcione em produção custa a empresa.

import { describe, it, expect, vi } from "vitest";
import {
  createDevAuthAdapter, createDevTokenVerifier, createDevMembershipLoader,
  UTILIZADORES_FIXTURE, EMPRESAS_FIXTURE, PREFIXO_TOKEN_DEV,
} from "./devAuthAdapter.js";
import { validateAuthAdapter, SIGN_IN_ERROR } from "./authAdapterPort.js";
import { ROLES } from "./authorizationCore.js";

const DEV = { DEV: true, PROD: false };

/** sessionStorage falso, para não depender do ambiente do runner. */
function storageFalso(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

function criar(inicial) {
  const storage = storageFalso(inicial);
  return { adapter: createDevAuthAdapter({ env: DEV, storage }), storage };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A BARREIRA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("impossível em produção", () => {
  it.each([
    ["PROD:true", { PROD: true }],
    ["MODE:production", { MODE: "production" }],
    ["NODE_ENV:production", { NODE_ENV: "production" }],
  ])("createDevAuthAdapter LANÇA em %s", (_r, env) => {
    expect(() => createDevAuthAdapter({ env })).toThrow();
  });

  it("o verificador de tokens simulados também se recusa a existir em produção", () => {
    expect(() => createDevTokenVerifier({ env: { PROD: true } })).toThrow();
  });

  it("o leitor de memberships simuladas também", () => {
    expect(() => createDevMembershipLoader({ env: { PROD: true } })).toThrow();
  });

  it("a guarda é a PRIMEIRA instrução: nem storage nem fixtures chegam a ser tocados", () => {
    const storage = storageFalso({ "finer-one.dev-auth.user-id": "dev-user-overcel" });
    const espia = vi.spyOn(storage, "getItem");
    expect(() => createDevAuthAdapter({ env: { PROD: true }, storage })).toThrow();
    expect(espia).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O STORAGE NÃO CONCEDE NADA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o sessionStorage não é uma fonte de autorização", () => {
  it("um id inventado no storage NÃO produz sessão", async () => {
    const { adapter } = criar({ "finer-one.dev-auth.user-id": "sou-o-dono-de-tudo" });
    expect(await adapter.getSession()).toBeNull();
  });

  it("não há forma de escrever memberships no storage — elas são constantes compiladas", async () => {
    /* Tentativa deliberada de injeção: JSON com memberships no valor do storage. */
    const { adapter } = criar({
      "finer-one.dev-auth.user-id": JSON.stringify({ id: "x", memberships: [{ companyId: "empresa-b", role: "owner" }] }),
    });
    expect(await adapter.getSession()).toBeNull();
  });

  it("o storage só guarda um id de fixture, e mais nada", async () => {
    /* O utilizador multiempresa é o caso revelador: duas memberships, dois papéis, e
     * no browser fica uma única cadeia com o id da fixture. */
    const { adapter, storage } = criar();
    await adapter.signIn({ email: "multi@finer.local" });
    const guardado = storage._dump();
    expect(Object.keys(guardado)).toEqual(["finer-one.dev-auth.user-id"]);
    expect(guardado["finer-one.dev-auth.user-id"]).toBe("dev-user-multi");

    /* Nem papel, nem empresa, nem token. O que está no browser é uma etiqueta que só
     * significa alguma coisa contra a tabela compilada. */
    const bruto = JSON.stringify(guardado);
    for (const proibido of ["owner", "member", "viewer", "role", "overcel", "empresa-exemplo", "dev-token"]) {
      expect(bruto).not.toContain(proibido);
    }
  });

  it("um utilizador simulado só recebe as memberships da SUA fixture", async () => {
    const { adapter } = criar();
    await adapter.signIn({ email: "consulta@finer.local" });
    const s = await adapter.getSession();
    expect(s.companies).toHaveLength(1);
    expect(s.companies[0].companyId).toBe("overcel");
    expect(s.companies[0].role).toBe(ROLES.VIEWER);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * COMPORTAMENTO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("cumpre o porto", () => {
  it("tem todos os métodos obrigatórios", () => {
    const { adapter } = criar();
    expect(validateAuthAdapter(adapter)).toEqual({ ok: true });
    expect(adapter.simulated).toBe(true);
    expect(adapter.id).toBe("dev");
  });
});

describe("login e logout", () => {
  it("sem sessão, getSession devolve null", async () => {
    const { adapter } = criar();
    expect(await adapter.getSession()).toBeNull();
    expect(await adapter.getAccessToken()).toBeNull();
  });

  it("login com email de fixture cria sessão", async () => {
    const { adapter } = criar();
    expect(await adapter.signIn({ email: "dev@finer.local" })).toEqual({ ok: true });
    const s = await adapter.getSession();
    expect(s.user.id).toBe("dev-user-overcel");
    expect(s.companies.map((c) => c.companyId)).toEqual(["overcel"]);
  });

  it("email desconhecido é recusado", async () => {
    const { adapter } = criar();
    const r = await adapter.signIn({ email: "estranho@exemplo.com" });
    expect(r).toEqual({ ok: false, code: SIGN_IN_ERROR.CREDENCIAIS_INVALIDAS });
    expect(await adapter.getSession()).toBeNull();
  });

  it("email em falta é um código diferente de credenciais inválidas", async () => {
    const { adapter } = criar();
    expect((await adapter.signIn({})).code).toBe(SIGN_IN_ERROR.CAMPOS_EM_FALTA);
  });

  it("o email é comparado sem distinção de maiúsculas e sem espaços", async () => {
    const { adapter } = criar();
    expect((await adapter.signIn({ email: "  DEV@Finer.Local " })).ok).toBe(true);
  });

  it("logout apaga a sessão", async () => {
    const { adapter } = criar();
    await adapter.signIn({ email: "dev@finer.local" });
    await adapter.signOut();
    expect(await adapter.getSession()).toBeNull();
    expect(await adapter.getAccessToken()).toBeNull();
  });

  it("os ouvintes são notificados no login e no logout", async () => {
    const { adapter } = criar();
    const ouvinte = vi.fn();
    const cancelar = adapter.onAuthStateChange(ouvinte);

    await adapter.signIn({ email: "dev@finer.local" });
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(ouvinte.mock.calls[0][0].user.id).toBe("dev-user-overcel");

    await adapter.signOut();
    expect(ouvinte).toHaveBeenCalledTimes(2);
    expect(ouvinte.mock.calls[1][0]).toBeNull();

    cancelar();
    await adapter.signIn({ email: "dev@finer.local" });
    expect(ouvinte).toHaveBeenCalledTimes(2);   // já não ouve
  });

  it("um ouvinte que rebenta não derruba os outros", async () => {
    const { adapter } = criar();
    const bom = vi.fn();
    adapter.onAuthStateChange(() => { throw new Error("ouvinte partido"); });
    adapter.onAuthStateChange(bom);
    await adapter.signIn({ email: "dev@finer.local" });
    expect(bom).toHaveBeenCalled();
  });

  it("sem storage nenhum, degrada para memória em vez de rebentar", async () => {
    const adapter = createDevAuthAdapter({ env: DEV, storage: null });
    await adapter.signIn({ email: "dev@finer.local" });
    expect((await adapter.getSession()).user.id).toBe("dev-user-overcel");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * FIXTURES
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("fixtures", () => {
  it("cobrem os quatro estados que interessa poder ver", () => {
    const porEmpresas = UTILIZADORES_FIXTURE.map((u) => u.memberships.length);
    expect(porEmpresas).toContain(0);   // acesso não configurado
    expect(porEmpresas).toContain(1);   // entrada direta
    expect(porEmpresas).toContain(2);   // seletor de empresas
    const papeis = UTILIZADORES_FIXTURE.flatMap((u) => u.memberships.map((m) => m.role));
    expect(new Set(papeis)).toEqual(new Set([ROLES.OWNER, ROLES.MEMBER, ROLES.VIEWER]));
  });

  it("a segunda empresa é INEQUIVOCAMENTE uma fixture, não uma empresa real", () => {
    const segunda = EMPRESAS_FIXTURE["empresa-exemplo"];
    expect(segunda.name.toLowerCase()).toContain("fixture");
    /* E não partilha nada com a empresa real: id, nome e moeda são todos distintos. */
    expect(segunda.companyId).not.toBe(EMPRESAS_FIXTURE.overcel.companyId);
    expect(segunda.currency).not.toBe(EMPRESAS_FIXTURE.overcel.currency);
  });

  it("uma membership para empresa inexistente é descartada", async () => {
    /* Não há como criar uma por configuração — mas o filtro existe e é o que impede
     * que uma fixture mal escrita produza uma empresa sem nome nem moeda no seletor. */
    const { adapter } = criar();
    await adapter.signIn({ email: "multi@finer.local" });
    const s = await adapter.getSession();
    for (const c of s.companies) expect(EMPRESAS_FIXTURE[c.companyId]).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O LADO DO SERVIDOR EM DESENVOLVIMENTO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("verificador e leitor de memberships simulados", () => {
  it("o token simulado NÃO se parece com um JWT", async () => {
    const { adapter } = criar();
    await adapter.signIn({ email: "dev@finer.local" });
    const token = await adapter.getAccessToken();
    expect(token.startsWith(PREFIXO_TOKEN_DEV)).toBe(true);
    /* Um JWT tem três segmentos separados por pontos. Este não pode ter, para que um
     * verificador real mal configurado não o consiga sequer analisar. */
    expect(token.split(".").length).toBe(1);
  });

  it("verifica os tokens que emitiu e recusa todos os outros", async () => {
    const verificar = createDevTokenVerifier({ env: DEV });
    expect(await verificar("dev-token:dev-user-overcel")).toEqual({ ok: true, userId: "dev-user-overcel", expiresAt: null });
    expect((await verificar("dev-token:inventado")).ok).toBe(false);
    expect((await verificar("eyJhbGciOiJIUzI1NiJ9.abc.def")).ok).toBe(false);
    expect((await verificar(null)).ok).toBe(false);
    expect((await verificar("")).ok).toBe(false);
  });

  it("o leitor devolve exatamente as memberships da fixture", async () => {
    const ler = createDevMembershipLoader({ env: DEV });
    expect(await ler("dev-user-multi")).toEqual([
      { userId: "dev-user-multi", companyId: "overcel", role: ROLES.MEMBER },
      { userId: "dev-user-multi", companyId: "empresa-exemplo", role: ROLES.VIEWER },
    ]);
    expect(await ler("dev-user-sem-acesso")).toEqual([]);
    expect(await ler("nao-existe")).toEqual([]);
  });
});
