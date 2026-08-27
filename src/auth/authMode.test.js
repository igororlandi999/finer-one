// MODO DE AUTENTICAÇÃO — a barreira de runtime contra autenticação simulada em produção.
//
// O ataque realista não é sofisticado: é um `.env` copiado de uma máquina de
// desenvolvimento para um deploy. Todos os testes deste ficheiro descrevem variações
// desse mesmo acidente.

import { describe, it, expect } from "vitest";
import {
  AUTH_MODE, AUTH_MODE_REASON, MODOS_PROIBIDOS_EM_PRODUCAO,
  resolveAuthMode, assertDevAuthAllowed, hasSupabaseConfig, modeRequiresAuthentication,
} from "./authMode.js";

const SUPABASE_OK = {
  VITE_SUPABASE_URL: "https://abcdefghijklm.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.chave-anon-publica-longa",
};

/* Um ambiente de produção pode declarar-se de três maneiras. Todos os testes de
 * produção correm contra as três, porque basta uma passar despercebida. */
const AMBIENTES_DE_PRODUCAO = [
  ["PROD:true", { PROD: true, DEV: false }],
  ["MODE:production", { MODE: "production" }],
  ["NODE_ENV:production", { NODE_ENV: "production" }],
];

describe("dev nunca corre em produção", () => {
  it.each(AMBIENTES_DE_PRODUCAO)(
    "VITE_AUTH_MODE=dev num ambiente %s é DESPROMOVIDO", (_rotulo, env) => {
      const r = resolveAuthMode({ ...env, VITE_AUTH_MODE: "dev" });
      expect(r.mode).not.toBe(AUTH_MODE.DEV);
      expect(r.reason).toBe(AUTH_MODE_REASON.MODO_DEV_EM_PRODUCAO);
      expect(r.downgradedFrom).toBe(AUTH_MODE.DEV);
    });

  it("em produção COM Supabase, o downgrade é para o provider real", () => {
    const r = resolveAuthMode({ PROD: true, VITE_AUTH_MODE: "dev", ...SUPABASE_OK });
    expect(r.mode).toBe(AUTH_MODE.SUPABASE);
  });

  it("em produção SEM Supabase, o downgrade é para DISABLED — nunca para dev", () => {
    const r = resolveAuthMode({ PROD: true, VITE_AUTH_MODE: "dev" });
    expect(r.mode).toBe(AUTH_MODE.DISABLED);
  });

  it.each(["DEV", " Dev ", "dEv"])("a variável %s (maiúsculas/espaços) é apanhada na mesma", (valor) => {
    const r = resolveAuthMode({ PROD: true, VITE_AUTH_MODE: valor });
    expect(r.mode).not.toBe(AUTH_MODE.DEV);
  });

  it.each(AMBIENTES_DE_PRODUCAO)("assertDevAuthAllowed LANÇA em %s", (_rotulo, env) => {
    expect(() => assertDevAuthAllowed(env)).toThrow(/simulada|produção/i);
  });

  it("assertDevAuthAllowed deixa passar em desenvolvimento", () => {
    expect(assertDevAuthAllowed({ DEV: true, PROD: false })).toBe(true);
    expect(assertDevAuthAllowed({})).toBe(true);
  });

  it("a lista de modos proibidos contém dev — se alguém a esvaziar, este teste cai", () => {
    expect(MODOS_PROIBIDOS_EM_PRODUCAO).toContain(AUTH_MODE.DEV);
  });
});

describe("dev é permitido em desenvolvimento", () => {
  it("VITE_AUTH_MODE=dev em DEV devolve dev", () => {
    const r = resolveAuthMode({ DEV: true, PROD: false, VITE_AUTH_MODE: "dev" });
    expect(r.mode).toBe(AUTH_MODE.DEV);
    expect(r.reason).toBeNull();
  });
});

describe("falta de configuração nunca abre portas", () => {
  it("pedir supabase sem configuração cai para DISABLED, NUNCA para dev", () => {
    const r = resolveAuthMode({ DEV: true, VITE_AUTH_MODE: "supabase" });
    expect(r.mode).toBe(AUTH_MODE.DISABLED);
    expect(r.reason).toBe(AUTH_MODE_REASON.SUPABASE_SEM_CONFIGURACAO);
  });

  it("modo escrito à mão que ninguém reconhece cai para DISABLED", () => {
    const r = resolveAuthMode({ DEV: true, VITE_AUTH_MODE: "nenhum" });
    expect(r.mode).toBe(AUTH_MODE.DISABLED);
    expect(r.reason).toBe(AUTH_MODE_REASON.MODO_DESCONHECIDO);
  });

  it("modo desconhecido em produção com Supabase cai para o provider real", () => {
    const r = resolveAuthMode({ PROD: true, VITE_AUTH_MODE: "qualquer-coisa", ...SUPABASE_OK });
    expect(r.mode).toBe(AUTH_MODE.SUPABASE);
  });

  it("nenhum caminho de resolução devolve dev quando o ambiente é produção", () => {
    const variantes = ["", "dev", "supabase", "disabled", "inventado", "DEV"];
    for (const v of variantes) {
      for (const [, env] of AMBIENTES_DE_PRODUCAO) {
        expect(resolveAuthMode({ ...env, VITE_AUTH_MODE: v }).mode).not.toBe(AUTH_MODE.DEV);
        expect(resolveAuthMode({ ...env, VITE_AUTH_MODE: v, ...SUPABASE_OK }).mode).not.toBe(AUTH_MODE.DEV);
      }
    }
  });
});

describe("sem pedido explícito, o ambiente decide", () => {
  it("com configuração de Supabase -> supabase", () => {
    expect(resolveAuthMode({ DEV: true, ...SUPABASE_OK }).mode).toBe(AUTH_MODE.SUPABASE);
  });

  it("sem nada -> disabled (a aplicação corre como hoje)", () => {
    expect(resolveAuthMode({ DEV: true }).mode).toBe(AUTH_MODE.DISABLED);
    expect(resolveAuthMode(undefined).mode).toBe(AUTH_MODE.DISABLED);
  });
});

describe("hasSupabaseConfig", () => {
  it("exige https e uma chave com comprimento plausível", () => {
    expect(hasSupabaseConfig(SUPABASE_OK)).toBe(true);
    expect(hasSupabaseConfig({ ...SUPABASE_OK, VITE_SUPABASE_URL: "http://x.supabase.co" })).toBe(false);
    expect(hasSupabaseConfig({ ...SUPABASE_OK, VITE_SUPABASE_ANON_KEY: "curta" })).toBe(false);
    expect(hasSupabaseConfig({})).toBe(false);
    expect(hasSupabaseConfig(null)).toBe(false);
  });
});

describe("modeRequiresAuthentication", () => {
  it("só os modos com provider a sério exigem sessão", () => {
    expect(modeRequiresAuthentication(AUTH_MODE.SUPABASE)).toBe(true);
    expect(modeRequiresAuthentication(AUTH_MODE.DEV)).toBe(true);
    expect(modeRequiresAuthentication(AUTH_MODE.DISABLED)).toBe(false);
    expect(modeRequiresAuthentication(null)).toBe(false);
  });
});
