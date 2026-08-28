// TRANSPORTE PROTEGIDO LIGADO => ZERO CHAMADAS AO ENDPOINT ANÓNIMO.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O QUE ESTE FICHEIRO PROVA, E PORQUE AO NÍVEL DA REDE
// ═══════════════════════════════════════════════════════════════════════════════════
// `GET /api/pedidos/vendas` é ANÓNIMO: sem token, sem membership, e serve hoje os dados
// financeiros reais da Overcel. `resolveDataTransport` devolvia-o como recurso de
// último caso — incluindo quando o interruptor do transporte protegido já estava
// LIGADO. Dois ramos:
//
//     !isValidCompanyId(companyId)          -> LEGADO
//     typeof getAccessToken !== "function"  -> LEGADO
//
// `companyId` vem de `company?.id ?? null` no provider. `null` não é um caso de
// laboratório: é o valor durante todo o carregamento das memberships, e é o valor
// PERMANENTE de quem não tem membership nenhuma. Com o interruptor ligado, essa pessoa
// receberia os números reais da Overcel.
//
// ─── PORQUE UM TESTE À FUNÇÃO NÃO CHEGA ────────────────────────────────────────────
// `transporteDeDados.test.js` verifica o que `resolveDataTransport` DEVOLVE. Isso cobre
// os dois ramos acima e mais nada: não cobre o que acontece quando o transporte
// protegido é construído e depois FALHA — token que rebenta, 401, 403, 502, rede em
// baixo. Um retrocesso para o legado escondido em qualquer camada abaixo passaria
// despercebido a um teste que só olha para o valor de retorno.
//
// Aqui espia-se `globalThis.fetch` e conta-se o que SAI. A afirmação é sobre o fio.
//
// ─── A REGRA, INTEIRA ──────────────────────────────────────────────────────────────
// Com o interruptor LIGADO e a autenticação em vigor, o legado é PROIBIDO. Sem exceção,
// em nenhum modo de falha. Só é permitido quando o interruptor está explicitamente
// desligado, ou quando a autenticação está fora de vigor — e isso tem controlo positivo
// no fim deste ficheiro.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE = "https://bff.exemplo/api";
const EMPRESA = "overcel";

/** Ambiente com o interruptor LIGADO. É a configuração que ainda não está em produção. */
const ENV_PROTEGIDO = { VITE_PROTECTED_DATA_TRANSPORT: "true" };

/** Tudo o que saiu pelo fio, nesta ordem. */
let urlsVistos;

/** Instala um `fetch` espião. `responder` decide o que cada pedido devolve. */
function instalarFetch(responder) {
  urlsVistos = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = new URL(String(url));
    urlsVistos.push(u.pathname + u.search);
    return responder(u, opts);
  });
}

const jsonOk = (corpo) => new Response(JSON.stringify(corpo), {
  status: 200, headers: { "Content-Type": "application/json" },
});
const jsonErro = (status, code) => new Response(JSON.stringify({ error: true, code }), {
  status, headers: { "Content-Type": "application/json" },
});

/** As chamadas ao endpoint ANÓNIMO. É esta lista que tem de ficar vazia. */
const chamadasAoLegado = () => urlsVistos.filter((u) => u.includes("/pedidos/vendas"));
const chamadasAoProtegido = () => urlsVistos.filter((u) => u.includes("/financial-data"));

/** Carrega os módulos com o ambiente pedido. `resetModules` porque `api.js` lê
 *  `VITE_API_BASE_URL` no carregamento. */
async function carregar(env = ENV_PROTEGIDO) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);
  const dataTransport = await import("./dataTransport.js");
  const { loadFinerData } = await import("./blingDataService.js");
  return { ...dataTransport, loadFinerData, env };
}

/**
 * Resolve o transporte e faz uma leitura COMPLETA — as quatro fontes.
 * Devolve o que o produto viu e o que saiu pelo fio.
 */
async function lerCom({ env = ENV_PROTEGIDO, requiresAuth = true, companyId, getAccessToken }) {
  const mods = await carregar(env);
  const { transport, motivo } = mods.resolveDataTransport({
    env, requiresAuth, companyId, getAccessToken,
    onUnauthorized: () => { /* na app, faz signOut. Aqui só não pode causar legado. */ },
  });
  const dados = await mods.loadFinerData({ transport, ...(companyId ? { companyId } : {}) });
  return { transporte: transport.id, motivo, dados, mods };
}

beforeEach(() => { instalarFetch(() => jsonOk({ data: [] })); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

/* ═══════════════════════════════════════════════════════════════════════════════════
 * FALTA A EMPRESA OU O TOKEN — O TRANSPORTE NEM CHEGA A EXISTIR
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("interruptor LIGADO, sem empresa ou sem token: NENHUM, nunca legado", () => {
  const empresasInvalidas = [
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
    ["só espaços", "   "],
    ["travessia de caminho", "../outra-empresa"],
    ["com barra", "empresa/a"],
    ["maiúsculas", "OVERCEL"],
    ["com query", "overcel?x=1"],
    ["curta demais", "a"],
    ["não é string", 12345],
    ["objeto", { id: "overcel" }],
    ["array", ["overcel"]],
  ];

  for (const [rotulo, companyId] of empresasInvalidas) {
    it(`companyId ${rotulo}: zero chamadas de rede, e nenhuma ao legado`, async () => {
      const r = await lerCom({ companyId, getAccessToken: async () => "tok" });
      expect(r.transporte).toBe("nenhum");
      expect(chamadasAoLegado(), `companyId ${rotulo} caiu para o legado`).toEqual([]);
      expect(urlsVistos, "sem empresa não se contacta ninguém").toEqual([]);
      expect(r.dados.source).toBe("unavailable");
      expect(r.dados.sales).toBeNull();
    });
  }

  const semToken = [
    ["ausente", undefined],
    ["null", null],
    ["não é função (string)", "tok"],
    ["não é função (objeto)", { get: () => "tok" }],
  ];

  for (const [rotulo, getAccessToken] of semToken) {
    it(`getAccessToken ${rotulo}: zero chamadas de rede, e nenhuma ao legado`, async () => {
      const r = await lerCom({ companyId: EMPRESA, getAccessToken });
      expect(r.transporte).toBe("nenhum");
      expect(chamadasAoLegado()).toEqual([]);
      expect(urlsVistos).toEqual([]);
      expect(r.dados.source).toBe("unavailable");
    });
  }

  it("o motivo continua a dizer o que faltou — a recusa é diagnosticável", async () => {
    const semEmpresa = await lerCom({ companyId: null, getAccessToken: async () => "tok" });
    expect(semEmpresa.motivo).toBe("sem_empresa_valida");
    const semToken2 = await lerCom({ companyId: EMPRESA, getAccessToken: undefined });
    expect(semToken2.motivo).toBe("sem_token");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O TRANSPORTE EXISTE E FALHA — E CONTINUA SEM HAVER LEGADO
 * ═══════════════════════════════════════════════════════════════════════════════════
 * A parte que um teste à função de resolução não alcança: aqui o transporte protegido
 * foi construído, o pedido saiu (ou nem chegou a sair) e correu mal. Um retrocesso
 * escondido em `authorizedApi`, em `api.js` ou em `blingDataService` apareceria aqui.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o transporte protegido FALHA: nunca há segunda tentativa pelo legado", () => {
  const tokensMaus = [
    ["getAccessToken rebenta", async () => { throw new Error("adaptador em baixo"); }],
    ["getAccessToken devolve null", async () => null],
    ["getAccessToken devolve string vazia", async () => ""],
    ["getAccessToken devolve undefined", async () => undefined],
    ["getAccessToken devolve um número", async () => 12345],
    ["getAccessToken nunca resolve com um token", async () => ({ token: "tok" })],
  ];

  for (const [rotulo, getAccessToken] of tokensMaus) {
    it(`${rotulo}: o pedido nem sai, e o legado não é tentado`, async () => {
      const r = await lerCom({ companyId: EMPRESA, getAccessToken });
      expect(r.transporte).toBe("protegido");
      expect(chamadasAoLegado(), `${rotulo} caiu para o legado`).toEqual([]);
      expect(urlsVistos, "um pedido sem token não deve sair").toEqual([]);
      expect(r.dados.source).toBe("unavailable");
      expect(r.dados.sales).toBeNull();
    });
  }

  const estadosDoBff = [
    ["401 — token inválido", 401, "UNAUTHENTICATED"],
    ["401 — token EXPIRADO", 401, "TOKEN_EXPIRADO"],
    ["403 — empresa não é sua", 403, "FORBIDDEN"],
    ["400 — pedido malformado", 400, "DATA_INVALIDA"],
    ["404 — rota inexistente", 404, null],
    ["413 — corpo grande", 413, "CORPO_GRANDE"],
    ["429 — demasiados pedidos", 429, null],
    ["500 — erro interno", 500, "ERRO_INTERNO"],
    ["502 — upstream em baixo", 502, "UPSTREAM"],
    ["502 — upstream devolveu HTML", 502, "UPSTREAM_INVALIDO"],
    ["503 — serviço indisponível", 503, "INDISPONIVEL"],
  ];

  for (const [rotulo, status, code] of estadosDoBff) {
    it(`${rotulo}: só o endpoint protegido é contactado`, async () => {
      instalarFetch(() => jsonErro(status, code));
      const r = await lerCom({ companyId: EMPRESA, getAccessToken: async () => "tok" });

      expect(chamadasAoLegado(), `${rotulo} caiu para o legado`).toEqual([]);
      expect(chamadasAoProtegido().length, "o protegido devia ter sido tentado").toBeGreaterThan(0);
      /* Tudo o que saiu foi para o endpoint protegido — nada mais. */
      expect(urlsVistos.length).toBe(chamadasAoProtegido().length);
      expect(r.dados.source).toBe("unavailable");
      expect(r.dados.sales).toBeNull();
    });
  }

  const falhasDeRede = [
    ["a rede está em baixo", () => { throw new TypeError("Failed to fetch"); }],
    ["DNS não resolve", () => { throw new TypeError("getaddrinfo ENOTFOUND"); }],
    ["a ligação é cortada", () => { throw new Error("ECONNRESET"); }],
    ["resposta não é JSON", () => new Response("<html>login</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["resposta vazia com 200", () => new Response("", { status: 200 })],
  ];

  for (const [rotulo, responder] of falhasDeRede) {
    it(`${rotulo}: nenhuma chamada ao legado`, async () => {
      instalarFetch(responder);
      const r = await lerCom({ companyId: EMPRESA, getAccessToken: async () => "tok" });
      expect(chamadasAoLegado(), `${rotulo} caiu para o legado`).toEqual([]);
      expect(r.dados.source).toBe("unavailable");
    });
  }

  it("um 401 dispara onUnauthorized — e mesmo assim não se lê pelo legado", async () => {
    /* O 401 termina a sessão. O perigo é o que acontece a seguir: uma leitura de
     * recuperação pelo caminho anónimo seria exatamente a mina que este ficheiro fecha. */
    instalarFetch(() => jsonErro(401, "UNAUTHENTICATED"));
    const mods = await carregar();
    let deslogou = 0;
    const { transport } = mods.resolveDataTransport({
      env: ENV_PROTEGIDO, requiresAuth: true, companyId: EMPRESA,
      getAccessToken: async () => "tok",
      onUnauthorized: () => { deslogou++; },
    });
    const dados = await mods.loadFinerData({ transport, companyId: EMPRESA });

    expect(deslogou).toBeGreaterThan(0);
    expect(chamadasAoLegado()).toEqual([]);
    expect(dados.source).toBe("unavailable");
  });

  it("uma fonte responde e outra falha: continua sem legado, e sem dados de ninguém", async () => {
    /* `loadFinerData` lê as quatro fontes em `allSettled`. Uma falha parcial é o caso
     * mais provável em produção, e é onde um retrocesso "só para esta fonte" caberia. */
    instalarFetch((u) => (u.searchParams.get("recurso") === "despesas"
      ? jsonErro(502, "UPSTREAM")
      : jsonOk({ data: [] })));
    const r = await lerCom({ companyId: EMPRESA, getAccessToken: async () => "tok" });
    expect(chamadasAoLegado()).toEqual([]);
    expect(urlsVistos.every((u) => u.includes("/financial-data")), urlsVistos.join(" | ")).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * CONTROLO POSITIVO — O ESPIÃO SABE VER UMA CHAMADA AO LEGADO
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Sem isto, tudo acima passaria também se `chamadasAoLegado()` estivesse simplesmente
 * a olhar para o sítio errado, ou se nenhuma leitura estivesse a acontecer.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o legado continua a ser usado onde é PERMITIDO — e o espião vê-o", () => {
  it("interruptor DESLIGADO: é o legado, e as chamadas aparecem", async () => {
    const r = await lerCom({
      env: {}, requiresAuth: true, companyId: EMPRESA, getAccessToken: async () => "tok",
    });
    expect(r.transporte).toBe("legado");
    expect(r.motivo).toBe("protegido_nao_ativado");
    expect(chamadasAoLegado().length, "o espião não viu nenhuma chamada ao legado").toBeGreaterThan(0);
    expect(chamadasAoProtegido()).toEqual([]);
  });

  it("interruptor LIGADO mas autenticação FORA DE VIGOR: é o legado, por decisão", async () => {
    const r = await lerCom({
      env: ENV_PROTEGIDO, requiresAuth: false, companyId: EMPRESA, getAccessToken: async () => "tok",
    });
    expect(r.transporte).toBe("legado");
    expect(r.motivo).toBe("autenticacao_desligada");
    expect(chamadasAoLegado().length).toBeGreaterThan(0);
  });

  it("interruptor DESLIGADO e sem empresa: continua legado — a instalação de hoje não muda", async () => {
    /* A fronteira ao contrário: a correção não pode ter partido o comportamento atual,
     * onde `companyId` é frequentemente null e o legado é o caminho certo. */
    const r = await lerCom({ env: {}, requiresAuth: true, companyId: null, getAccessToken: undefined });
    expect(r.transporte).toBe("legado");
    expect(chamadasAoLegado().length).toBeGreaterThan(0);
  });

  it("tudo em ordem com o interruptor ligado: só o protegido, e com Bearer", async () => {
    let autorizacao = null;
    instalarFetch((u, opts) => {
      autorizacao = opts && opts.headers && opts.headers.Authorization;
      return jsonOk({ data: [] });
    });
    const r = await lerCom({ companyId: EMPRESA, getAccessToken: async () => "tok-bom" });
    expect(r.transporte).toBe("protegido");
    expect(r.motivo).toBe("pronto");
    expect(chamadasAoLegado()).toEqual([]);
    expect(chamadasAoProtegido().length).toBeGreaterThan(0);
    expect(autorizacao).toBe("Bearer tok-bom");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O ÚLTIMO RECURSO POR OMISSÃO — ONDE O LEGADO AINDA ESTÁ ESCRITO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o legado por omissão de `loadFinerData` é o comportamento de hoje, e está declarado", () => {
  it("sem transporte injetado usa-se o legado — o provider injeta SEMPRE", async () => {
    /* `blingDataService` e `manualInputsService` têm `transport || createLegacyDataTransport()`.
     * Não é um escape do interruptor: quem decide o transporte é `FinerDataProvider`, e
     * ele passa sempre um objeto (o transporte NENHUM também é um objeto). Fica aqui
     * escrito e provado, para que ninguém o descubra por acidente. */
    const mods = await carregar();
    const dados = await mods.loadFinerData({});
    expect(chamadasAoLegado().length).toBeGreaterThan(0);
    expect(dados.source).toBe("api");
  });

  it("o transporte NENHUM é um objeto — nunca cai no `||` do legado", async () => {
    const mods = await carregar();
    const { transport } = mods.resolveDataTransport({
      env: ENV_PROTEGIDO, requiresAuth: true, companyId: null, getAccessToken: async () => "t",
    });
    expect(transport).toBeTruthy();
    expect(Boolean(transport)).toBe(true);
    await mods.loadFinerData({ transport });
    expect(chamadasAoLegado()).toEqual([]);
  });
});
