// @vitest-environment happy-dom
//
// A JANELA DE ARRANQUE — o legado anónimo entre o primeiro render e o veredito da
// autenticação.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A FALHA QUE ESTE FICHEIRO EXISTE PARA IMPEDIR
// ═══════════════════════════════════════════════════════════════════════════════════
// Encontrada no PRÉ-DEPLOY de E3, num browser real, antes de publicar. Com
// `VITE_PROTECTED_DATA_TRANSPORT=true`, cada carregamento de página produzia,
// deterministicamente:
//
//   GET /api/pedidos/vendas                     <- LEGADO ANÓNIMO
//   GET /api/pedidos/vendas?recurso=despesas    <- LEGADO ANÓNIMO
//   GET /api/pedidos/vendas?recurso=recebiveis  <- LEGADO ANÓNIMO
//   GET /api/pedidos/vendas?recurso=ajustes…    <- LEGADO ANÓNIMO
//   GET /rest/v1/memberships                       (a autenticação resolve aqui)
//   GET /api/companies/overcel/financial-data   <- protegido, já tarde
//
// Quatro leituras anónimas dos números REAIS da Overcel, antes de se saber quem está
// ao teclado — e portanto também para quem não é membro da Overcel.
//
// ─── A CAUSA, E PORQUE É SEMÂNTICA E NÃO UM DESCUIDO ───────────────────────────────
// `AuthContext` arranca com `mode = null` e resolve-o num efeito assíncrono.
// `modeRequiresAuthentication(null)` é `false`, e `resolveDataTransport` lia esse
// `false` como *"a autenticação está desligada"* — devolvendo o legado por decisão.
//
// Mas `false` ali significava DUAS coisas diferentes:
//
//   A. a autenticação está mesmo desligada por CONFIGURAÇÃO
//      -> o legado é a resposta certa, e é o comportamento de E2.1;
//   B. o modo ainda NÃO FOI RESOLVIDO
//      -> não há veredito nenhum, e um transporte anónimo não pode ser o default.
//
// Fundir "não" com "ainda não sei" é o mesmo erro que este projeto já nomeou noutros
// eixos: `unavailable` nunca vira zero, e *"sessão em LOADING não concede nada —
// ausência de veredito não é autorização"*. Aqui a doutrina faltava.
//
// ─── PORQUE OS TESTES ANTERIORES NÃO A APANHARAM ───────────────────────────────────
// Todo o harness de `transporteProtegido.semLegado.test.js` passa `requiresAuth: true`.
// A janela em que ele ainda não é `true` nunca era exercida — e é a única em que o
// defeito existe.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const BASE = "https://bff.exemplo.test/api";
const EMPRESA = "overcel";

const ENV = {
  DEV: false,
  PROD: true,
  MODE: "production",
  VITE_API_BASE_URL: BASE,
  VITE_AUTH_MODE: "supabase",
  VITE_SUPABASE_URL: "https://projeto-de-teste.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_" + "k".repeat(30),
  VITE_PROTECTED_DATA_TRANSPORT: "true",
};

/* ─── O CLIENTE SUPABASE, SUBSTITUÍDO ───────────────────────────────────────────────
 * O adaptador real é usado; o que se substitui é só o SDK. `getSession` resolve num
 * tick à frente DE PROPÓSITO: é essa demora que cria a janela de arranque, e sem ela o
 * teste não podia observar o defeito. */
const SESSAO = {
  access_token: "token-de-teste-nao-e-credencial",
  user: { id: "user-1", email: "quem@exemplo.test", user_metadata: { full_name: "Quem" } },
};

let sessaoAtual = SESSAO;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      async getSession() {
        await new Promise((r) => setTimeout(r, 0));
        return { data: { session: sessaoAtual }, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword() { return { error: null }; },
      async signOut() { sessaoAtual = null; },
    },
    from() {
      return {
        async select() {
          return {
            data: [{ role: "owner", companies: { id: EMPRESA, name: "Overcel", currency: "BRL", locale: "pt-BR", timezone: "America/Sao_Paulo", plan: "plus", status: "ativa" } }],
            error: null,
          };
        },
      };
    },
  }),
}));

/** Tudo o que saiu pelo fio, por ordem. */
let urlsVistos = [];
const chamadasAoLegado = () => urlsVistos.filter((u) => u.includes("/pedidos/vendas"));
const chamadasAoProtegido = () => urlsVistos.filter((u) => u.includes("/financial-data"));

let container = null;
let root = null;

beforeEach(() => {
  urlsVistos = [];
  sessaoAtual = SESSAO;
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  globalThis.fetch = vi.fn(async (url) => {
    urlsVistos.push(new URL(String(url)).pathname + new URL(String(url)).search);
    return new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  container = null;
  root = null;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Monta a árvore REAL: autenticação, empresa e dados. Nada de duplos além do SDK. */
async function montarAplicacao() {
  vi.resetModules();
  const { AuthProvider } = await import("../auth/AuthContext.jsx");
  const { CompanyProvider } = await import("../auth/CompanyContext.jsx");
  const { FinerDataProvider } = await import("../context/FinerDataContext.jsx");

  await act(async () => {
    root.render(
      <AuthProvider env={ENV}>
        <CompanyProvider>
          <FinerDataProvider env={ENV}>
            <div>montado</div>
          </FinerDataProvider>
        </CompanyProvider>
      </AuthProvider>
    );
  });
  /* Deixar a autenticação assentar: o `getSession` resolve num tick à frente e as
   * memberships logo a seguir. */
  for (let i = 0; i < 5; i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O CONTRATO, NA FUNÇÃO QUE DECIDE
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("resolveDataTransport — 'ainda não sei' não é 'não'", () => {
  async function carregar() {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", BASE);
    return import("./dataTransport.js");
  }

  const ENV_PROTEGIDO = { VITE_PROTECTED_DATA_TRANSPORT: "true" };
  const ENV_LEGADO = { VITE_PROTECTED_DATA_TRANSPORT: "" };

  it("CONTRATO 2 · protegido PEDIDO + autenticação POR RESOLVER -> NENHUM, nunca legado", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();

    /* É o estado do primeiro render da aplicação: o modo ainda é `null`, portanto
     * `requiresAuth` ainda é `false` — mas não porque alguém desligou a autenticação. */
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO,
      authResolved: false,
      requiresAuth: false,
      companyId: EMPRESA,
      getAccessToken: async () => "tok",
    });

    expect(transport.id, "a janela de arranque caiu no legado anónimo").toBe(TRANSPORTE.NENHUM);
    expect(transport.protegido).toBe(false);
  });

  it("CONTRATO 2 · e o transporte devolvido NÃO LÊ NADA — não há caminho escondido", async () => {
    const { resolveDataTransport } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, authResolved: false, requiresAuth: false,
      companyId: EMPRESA, getAccessToken: async () => "tok",
    });
    await transport.ler("pedidos");
    expect(urlsVistos, "o transporte da janela de arranque foi à rede").toEqual([]);
  });

  it("CONTRATO 2 · a janela continua fechada mesmo sem empresa e sem token", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, authResolved: false, requiresAuth: false,
      companyId: null, getAccessToken: undefined,
    });
    expect(transport.id).toBe(TRANSPORTE.NENHUM);
  });

  it("CONTRATO 1 · protegido DESLIGADO + autenticação por resolver -> LEGADO, como em E2.1", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();

    /* A instalação de hoje. Quem não pediu leituras autenticadas não pode ser
     * penalizado por o modo ainda não ter resolvido: E2.1 não muda. */
    const { transport } = resolveDataTransport({
      env: ENV_LEGADO, authResolved: false, requiresAuth: false, companyId: null,
    });
    expect(transport.id).toBe(TRANSPORTE.LEGADO);
  });

  it("CONTRATO 1 · protegido DESLIGADO + autenticação resolvida e desligada -> LEGADO", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_LEGADO, authResolved: true, requiresAuth: false, companyId: null,
    });
    expect(transport.id).toBe(TRANSPORTE.LEGADO);
  });

  it("protegido PEDIDO + autenticação RESOLVIDA e desligada por configuração -> LEGADO, por decisão", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();

    /* Este é o caso A: alguém desligou mesmo a autenticação. Continua a ser uma decisão
     * explícita e continua a valer — o que mudou foi deixar de a confundir com o caso B. */
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, authResolved: true, requiresAuth: false, companyId: EMPRESA,
    });
    expect(transport.id).toBe(TRANSPORTE.LEGADO);
  });

  it("CONTRATO 3 · protegido + resolvida + sem token -> NENHUM", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, authResolved: true, requiresAuth: true,
      companyId: EMPRESA, getAccessToken: undefined,
    });
    expect(transport.id).toBe(TRANSPORTE.NENHUM);
  });

  it("CONTRATO 4 · protegido + resolvida + sessão válida -> PROTEGIDO", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, authResolved: true, requiresAuth: true,
      companyId: EMPRESA, getAccessToken: async () => "tok",
    });
    expect(transport.id).toBe(TRANSPORTE.PROTEGIDO);
    expect(transport.protegido).toBe(true);
  });

  it("omitir `authResolved` não muda nada para quem já passava — compatibilidade", async () => {
    const { resolveDataTransport, TRANSPORTE } = await carregar();
    const { transport } = resolveDataTransport({
      env: ENV_PROTEGIDO, requiresAuth: true,
      companyId: EMPRESA, getAccessToken: async () => "tok",
    });
    expect(transport.id).toBe(TRANSPORTE.PROTEGIDO);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A APLICAÇÃO INTEIRA, A ARRANCAR
 * ═══════════════════════════════════════════════════════════════════════════════════
 * A prova que a função sozinha não dá: que o PROVIDER passa mesmo o estado de resolução,
 * e que nenhuma leitura anónima escapa entre o primeiro render e o veredito.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("a aplicação a arrancar com E3 ligado", () => {
  it("ZERO chamadas ao legado, do primeiro render ao fim do arranque", async () => {
    await montarAplicacao();

    expect(
      chamadasAoLegado(),
      `saíram ${chamadasAoLegado().length} leituras anónimas na janela de arranque`
    ).toEqual([]);
  });

  it("e depois de a autenticação resolver, o transporte PROTEGIDO arranca normalmente", async () => {
    await montarAplicacao();

    expect(chamadasAoProtegido().length, "o transporte protegido nunca chegou a ler").toBeGreaterThan(0);
    /* Tudo o que saiu para o BFF foi para o endpoint protegido — nada mais. */
    const aoBff = urlsVistos.filter((u) => u.includes("/pedidos/vendas") || u.includes("/financial-data"));
    expect(aoBff.length).toBe(chamadasAoProtegido().length);
    for (const u of chamadasAoProtegido()) expect(u).toContain(`/companies/${EMPRESA}/financial-data`);
  });

  it("sem sessão nenhuma: continua sem legado, e sem dados de ninguém", async () => {
    /* O caso que mais importa: um visitante sem sessão não pode receber, em silêncio,
     * os números reais da Overcel pelo caminho anónimo. */
    sessaoAtual = null;
    await montarAplicacao();

    expect(chamadasAoLegado(), "um visitante sem sessão leu pelo legado anónimo").toEqual([]);
    expect(chamadasAoProtegido()).toEqual([]);
  });
});
