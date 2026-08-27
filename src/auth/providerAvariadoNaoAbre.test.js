// UM PROVIDER AVARIADO NÃO PODE VIRAR "SEM AUTENTICAÇÃO".
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O INCIDENTE QUE ESTE FICHEIRO IMPEDE DE VOLTAR
// ═══════════════════════════════════════════════════════════════════════════════════
// Em 27/08/2026, no primeiro arranque contra o Supabase real com
// `VITE_AUTH_MODE=supabase`, a aplicação mostrou o dashboard financeiro completo da
// Overcel — saldos, receitas, contas a pagar — SEM QUALQUER LOGIN. A cadeia:
//
//   1. `supabaseAuthAdapter.js` importava o SDK com o especificador numa VARIÁVEL e
//      `@vite-ignore`. Era correto enquanto o pacote não estava instalado; passou a ser
//      fatal depois, porque nem o Vite nem o Rollup reescrevem um import assim e o
//      browser recebe o nome cru:
//          TypeError: Failed to resolve module specifier '@supabase/supabase-js'
//   2. o `catch` de `authAdapters.js` engolia o erro SEM registar nada;
//   3. devolvia `mode: DISABLED`;
//   4. `modeRequiresAuthentication(DISABLED)` é `false`;
//   5. `ProtectedRoute` devolvia `children`.
//
// Consola limpa. Nenhum erro. A aplicação inteira aberta.
//
// ─── O COMENTÁRIO QUE AFIRMAVA O CONTRÁRIO DO QUE O CÓDIGO FAZIA ───────────────────
// O `catch` dizia: "Ninguém entra — que é o oposto de toda a gente entrar, e é o lado
// certo de falhar." Entrava toda a gente. É por isso que este teste existe em vez de um
// comentário: um comentário não falha quando deixa de ser verdade.
//
// ─── A REGRA ───────────────────────────────────────────────────────────────────────
// Quem pediu `supabase` pediu uma porta. Se a porta se avaria, NÃO SE ABRE — não se
// retira dos gonzos. O modo mantém-se SUPABASE (logo `requiresAuth` continua `true`) e
// o que muda é só o adaptador: um que não concede sessão a ninguém.

import { describe, it, expect, vi, afterEach } from "vitest";
import { AUTH_MODE, modeRequiresAuthentication } from "./authMode.js";

/** Ambiente que pede explicitamente o provider real, com configuração válida. */
const ENV_SUPABASE = {
  DEV: true,
  PROD: false,
  MODE: "development",
  VITE_AUTH_MODE: "supabase",
  VITE_SUPABASE_URL: "https://projeto-de-teste.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_chave_de_teste_com_tamanho_suficiente",
};

afterEach(() => { vi.resetModules(); vi.doUnmock("./supabaseAuthAdapter.js"); });

/** Carrega `authAdapters` com o adaptador de Supabase substituído. */
async function comAdaptadorSubstituido(fabrica) {
  vi.resetModules();
  vi.doMock("./supabaseAuthAdapter.js", () => ({ createSupabaseAuthAdapter: fabrica }));
  return import("./authAdapters.js");
}

describe("o SDK não resolve (o incidente de 27/08/2026)", () => {
  const falhaDoIncidente = async () => {
    throw new TypeError("Failed to resolve module specifier '@supabase/supabase-js'");
  };

  it("o modo continua SUPABASE — nunca DISABLED", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(falhaDoIncidente);
    const r = await createAuthAdapter(ENV_SUPABASE);
    expect(r.mode).toBe(AUTH_MODE.SUPABASE);
    expect(r.mode).not.toBe(AUTH_MODE.DISABLED);
  });

  it("`requiresAuth` continua verdadeiro — é isto que fecha o portão", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(falhaDoIncidente);
    const r = await createAuthAdapter(ENV_SUPABASE);
    // O passo exato que falhou: `ProtectedRoute` só deixa passar quando isto é false.
    expect(modeRequiresAuthentication(r.mode)).toBe(true);
  });

  it("o motivo é dito, para a UI o poder mostrar em voz alta", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(falhaDoIncidente);
    const r = await createAuthAdapter(ENV_SUPABASE);
    expect(r.reason).toBe("supabase_indisponivel");
  });

  it("o adaptador devolvido NÃO concede sessão a ninguém", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(falhaDoIncidente);
    const r = await createAuthAdapter(ENV_SUPABASE);
    expect(r.adapter).toBeTruthy();
    await expect(r.adapter.getSession()).resolves.toBeFalsy();
  });

  it("tentar entrar dá erro de provider, e nunca um `ok`", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(falhaDoIncidente);
    const r = await createAuthAdapter(ENV_SUPABASE);
    const tentativa = await r.adapter.signIn({ email: "a@b.c", password: "x" });
    expect(tentativa.ok).toBe(false);
  });
});

describe("o adaptador vem incompleto (contrato por cumprir)", () => {
  it("um adaptador a que faltam métodos também não abre a porta", async () => {
    const { createAuthAdapter } = await comAdaptadorSubstituido(async () => ({
      id: "supabase", simulated: false, // e mais nada: sem getSession, sem signIn...
    }));
    const r = await createAuthAdapter(ENV_SUPABASE);
    expect(r.mode).toBe(AUTH_MODE.SUPABASE);
    expect(modeRequiresAuthentication(r.mode)).toBe(true);
    expect(r.reason).toBe("adaptador_incompleto");
  });
});

describe("o caminho feliz continua a funcionar", () => {
  it("um adaptador válido é devolvido tal como veio, sem motivo de falha", async () => {
    const valido = {
      id: "supabase",
      simulated: false,
      getSession: async () => null,
      onAuthStateChange: () => () => {},
      signIn: async () => ({ ok: true }),
      signOut: async () => {},
      getAccessToken: async () => null,
    };
    const { createAuthAdapter } = await comAdaptadorSubstituido(async () => valido);
    const r = await createAuthAdapter(ENV_SUPABASE);
    expect(r.mode).toBe(AUTH_MODE.SUPABASE);
    expect(r.reason ?? null).toBe(null);
    expect(r.adapter).toBe(valido);
  });
});

describe("a regra não se aplica só ao Supabase", () => {
  it("`disabled` PEDIDO explicitamente continua a ser `disabled`", async () => {
    // A correção não pode ter transformado o modo sem autenticação — que é legítimo e
    // é como a aplicação corre hoje sem provider — em algo que exige sessão.
    vi.resetModules();
    const { createAuthAdapter } = await import("./authAdapters.js");
    const r = await createAuthAdapter({ ...ENV_SUPABASE, VITE_AUTH_MODE: "disabled" });
    expect(r.mode).toBe(AUTH_MODE.DISABLED);
    expect(modeRequiresAuthentication(r.mode)).toBe(false);
  });
});
