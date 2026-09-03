// Testes do CALLBACK OAuth automático (apps-script/Código.js).
//
// O que mudou e porque estes testes existem: o `doGet` deixou de imprimir o
// authorization code no browser à espera que um humano o copiasse para uma Script
// Property. Passa a trocá-lo por tokens no próprio callback. O code do Bling vive 60
// segundos e o caminho manual não cabia nesse prazo — três tentativas, três
// `invalid_grant / has expired`, a última já provada com um code novo e limpo.
//
// Isto toca no ficheiro que serve os quatro recursos financeiros em produção. Por isso
// metade destes testes não é sobre OAuth nenhum: é sobre PROVAR que os quatro recursos
// continuam a decidir exatamente como decidiam.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "Código.js"), "utf8");

/** Extrai uma função de topo pelo nome, até à linha que é exatamente "}". */
function fatiar(nome) {
  const marca = `\nfunction ${nome}(`;
  const i = fonte.indexOf(marca);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", i);
  expect(fim, `fim de ${nome} não encontrado`).toBeGreaterThan(i);
  return fonte.slice(i + 1, fim + 2);
}

/** Extrai uma declaração `var NOME = ...;` de topo. */
function fatiarVar(nome) {
  const re = new RegExp(`^var ${nome} = [^;]+;`, "m");
  const m = fonte.match(re);
  expect(m, `var ${nome} não encontrada`).toBeTruthy();
  return m[0];
}

const PURAS = [
  fatiar("estadoOAuthCorresponde_"),
  fatiar("oauthClassificarErro_"),
  fatiar("oauthSha256Hex_"),
  fatiar("trocarCodePorTokens_"),
  fatiar("serveOauthCallback_"),
  fatiarVar("OAUTH_STATE_TTL_MS"),
  fatiarVar("OAUTH_MARCA_TTL_S"),
].join("\n");

const CODE = "abc123def456abc123def456abc123def456";
const STATE = "11111111-2222-3333-4444-555555555555";
const ACCESS = "ACCESS-TOKEN-SENTINELA";
const REFRESH = "REFRESH-TOKEN-SENTINELA";

/** Carrega o bloco OAuth com todos os globais do Apps Script sob controlo do teste. */
function carregarOAuth({ props = {}, postTokenErro, cacheInicial = {}, agora = 1000000 } = {}) {
  const linhas = [];
  const apagadas = [];
  const gravadas = [];
  const cache = { ...cacheInicial };
  const postTokenChamadas = [];
  const respostas = [];

  const Logger = { log: (s) => linhas.push(String(s)) };
  const safeLog_ = (s) => linhas.push(String(s));
  const jsonOut_ = (o) => { respostas.push(o); return { __json: o }; };
  const getProp_ = (k) => (k in props ? props[k] : null);
  const setProps_ = (o) => gravadas.push(o);
  const PropertiesService = {
    getScriptProperties: () => ({
      deleteProperty: (k) => { apagadas.push(k); delete props[k]; },
      setProperties: (o) => gravadas.push(o),
    }),
  };
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      put: (k, v) => { cache[k] = v; },
    }),
  };
  let lockObtido = 0, lockSolto = 0;
  const LockService = {
    getScriptLock: () => ({
      waitLock: () => { lockObtido++; },
      releaseLock: () => { lockSolto++; },
    }),
  };
  const Utilities = {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest: (_a, s) => Array.from(createHash("sha256").update(String(s)).digest()),
    getUuid: () => STATE,
  };
  const postToken_ = (payload) => {
    postTokenChamadas.push(payload);
    if (postTokenErro) throw postTokenErro;
    return { access_token: ACCESS, refresh_token: REFRESH, expires_in: 21600 };
  };
  const guardados = [];
  const saveTokens_ = (j) => guardados.push(j);
  const DateStub = class extends Date { static now() { return agora; } };

  const api = new Function(
    "Logger", "safeLog_", "jsonOut_", "getProp_", "setProps_", "PropertiesService",
    "CacheService", "LockService", "Utilities", "postToken_", "saveTokens_", "Date",
    PURAS + "\nreturn { estadoOAuthCorresponde_, oauthClassificarErro_, oauthSha256Hex_," +
            " trocarCodePorTokens_, serveOauthCallback_, OAUTH_STATE_TTL_MS };"
  )(Logger, safeLog_, jsonOut_, getProp_, setProps_, PropertiesService,
    CacheService, LockService, Utilities, postToken_, saveTokens_, DateStub);

  return {
    ...api, linhas, apagadas, gravadas, cache, postTokenChamadas, guardados, respostas,
    lockEquilibrado: () => lockObtido === lockSolto && lockObtido > 0,
    resposta: () => respostas[respostas.length - 1],
    tudoQueSaiu: () => JSON.stringify(respostas) + "\n" + linhas.join("\n"),
  };
}

const erroToken = (status, corpo) => new Error(`Falha no token (HTTP ${status}): ${corpo}`);
const propsValidas = (over = {}) => ({
  BLING_OAUTH_STATE: STATE, BLING_OAUTH_STATE_AT: "1000000", ...over,
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * O QUE NÃO PODE MUDAR — os quatro recursos financeiros.
 * ════════════════════════════════════════════════════════════════════════════════════ */
describe("os quatro recursos financeiros continuam a decidir igual", () => {
  const doGetSrc = fatiar("doGet");

  function correrDoGet(parametros) {
    const chamadas = [];
    const jsonOut_ = (o) => ({ __json: o });
    const api = new Function(
      "jsonOut_", "serveOauthCallback_", "serveDespesas_", "serveRecebiveis_",
      "serveAjustesManuais_", "recursoPresente_", "recursoConhecido_", "safeLog_",
      "sanitize_", "RECURSOS_SUPORTADOS", "readPedidosSnapshot_", "formatDateISO_",
      "addDays_", "DEFAULT_DAYS", "fetchPedidosVendas_", "errorOut_", "registo",
      doGetSrc + "\nreturn doGet;"
    )(
      jsonOut_,
      (p) => { chamadas.push(["oauth", p]); return "OAUTH"; },
      () => { chamadas.push(["despesas"]); return "DESPESAS"; },
      () => { chamadas.push(["recebiveis"]); return "RECEBIVEIS"; },
      () => { chamadas.push(["ajustes"]); return "AJUSTES"; },
      (v) => v !== null && v !== undefined && String(v).trim() !== "",
      (v) => ["pedidos", "despesas", "recebiveis", "ajustes-manuais"]
        .indexOf(String(v === null || v === undefined ? "" : v).trim()) > -1,
      () => {}, (s) => s, ["pedidos", "despesas", "recebiveis", "ajustes-manuais"],
      () => { chamadas.push(["snapshot"]); return { data: [{ id: 1 }], meta: { geradoEm: "x" } }; },
      () => "2026-09-01", () => new Date(), 90,
      () => [], (e) => ({ __erro: String(e && e.message) }), chamadas
    );
    const r = api({ parameter: parametros });
    return { r, chamadas };
  }

  it("?recurso=despesas continua a servir despesas", () => {
    const { r, chamadas } = correrDoGet({ recurso: "despesas" });
    expect(r).toBe("DESPESAS");
    expect(chamadas.map((c) => c[0])).toEqual(["despesas"]);
  });

  it("?recurso=recebiveis continua a servir recebíveis", () => {
    expect(correrDoGet({ recurso: "recebiveis" }).r).toBe("RECEBIVEIS");
  });

  it("?recurso=ajustes-manuais continua a servir ajustes manuais", () => {
    expect(correrDoGet({ recurso: "ajustes-manuais" }).r).toBe("AJUSTES");
  });

  it("sem recurso continua a servir o snapshot de pedidos", () => {
    const { r, chamadas } = correrDoGet({});
    expect(chamadas.map((c) => c[0])).toEqual(["snapshot"]);
    expect(r.__json.data).toEqual([{ id: 1 }]);
  });

  it("?recurso=pedidos continua a servir pedidos", () => {
    expect(correrDoGet({ recurso: "pedidos" }).r.__json.data).toEqual([{ id: 1 }]);
  });

  it("recurso desconhecido continua a ser rejeitado com RECURSO_DESCONHECIDO", () => {
    const { r } = correrDoGet({ recurso: "nfe" });
    expect(r.__json.code).toBe("RECURSO_DESCONHECIDO");
    expect(r.__json.recursosSuportados).toEqual(["pedidos", "despesas", "recebiveis", "ajustes-manuais"]);
  });

  it("NENHUM dos quatro recursos toca no callback OAuth", () => {
    for (const p of [{}, { recurso: "pedidos" }, { recurso: "despesas" },
                     { recurso: "recebiveis" }, { recurso: "ajustes-manuais" }]) {
      expect(correrDoGet(p).chamadas.some((c) => c[0] === "oauth")).toBe(false);
    }
  });

  it("o callback só dispara com `code` presente, e aí não toca nos recursos", () => {
    const { r, chamadas } = correrDoGet({ code: CODE, state: STATE });
    expect(r).toBe("OAUTH");
    expect(chamadas.map((c) => c[0])).toEqual(["oauth"]);
  });

  it("nenhuma rota financeira nova foi criada", () => {
    expect(fonte.match(/RECURSOS_SUPORTADOS = \[[^\]]*\]/)[0])
      .toBe("RECURSOS_SUPORTADOS = ['pedidos', 'despesas', 'recebiveis', 'ajustes-manuais']");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * STATE — a guarda que antes não existia.
 * ════════════════════════════════════════════════════════════════════════════════════ */
describe("estadoOAuthCorresponde_", () => {
  const { estadoOAuthCorresponde_: ok, OAUTH_STATE_TTL_MS: TTL } = carregarOAuth();

  it("aceita o state exato dentro do prazo", () => {
    expect(ok(STATE, STATE, 1000, 1000 + TTL - 1, TTL)).toBe(true);
    expect(ok(STATE, STATE, 1000, 1000, TTL)).toBe(true);
  });

  it("recusa state ausente dos dois lados", () => {
    expect(ok(null, STATE, 1000, 2000, TTL)).toBe(false);
    expect(ok(STATE, null, 1000, 2000, TTL)).toBe(false);
    expect(ok("", STATE, 1000, 2000, TTL)).toBe(false);
    expect(ok(undefined, undefined, 1000, 2000, TTL)).toBe(false);
  });

  it("recusa state diferente", () => {
    expect(ok("outro", STATE, 1000, 2000, TTL)).toBe(false);
  });

  it("recusa fora de prazo", () => {
    expect(ok(STATE, STATE, 1000, 1000 + TTL + 1, TTL)).toBe(false);
  });

  it("recusa carimbo ausente ou relógio para trás", () => {
    expect(ok(STATE, STATE, 0, 2000, TTL)).toBe(false);
    expect(ok(STATE, STATE, 5000, 1000, TTL)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * A TROCA.
 * ════════════════════════════════════════════════════════════════════════════════════ */
describe("trocarCodePorTokens_", () => {
  it("envia grant_type e code, e guarda os tokens", () => {
    const p = carregarOAuth();
    p.trocarCodePorTokens_(CODE);
    expect(p.postTokenChamadas).toEqual([{ grant_type: "authorization_code", code: CODE }]);
    expect(p.guardados).toHaveLength(1);
  });

  it("apara o code — um espaço invisível já custou uma sessão inteira", () => {
    const p = carregarOAuth();
    p.trocarCodePorTokens_("  " + CODE + "\n");
    expect(p.postTokenChamadas[0].code).toBe(CODE);
  });

  it("code vazio, nulo ou só espaços não chega a sair", () => {
    for (const v of ["", "   ", null, undefined]) {
      const p = carregarOAuth();
      expect(() => p.trocarCodePorTokens_(v)).toThrow();
      expect(p.postTokenChamadas).toHaveLength(0);
    }
  });

  it("nunca regista o code nem os tokens", () => {
    const p = carregarOAuth();
    p.trocarCodePorTokens_(CODE);
    const saiu = p.linhas.join("\n");
    expect(saiu).not.toContain(CODE);
    expect(saiu).not.toContain(ACCESS);
    expect(saiu).not.toContain(REFRESH);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * O CALLBACK.
 * ════════════════════════════════════════════════════════════════════════════════════ */
describe("serveOauthCallback_", () => {
  it("sucesso: troca UMA vez, consome o state e responde sem segredos", () => {
    const p = carregarOAuth({ props: propsValidas() });
    p.serveOauthCallback_({ code: CODE, state: STATE });

    expect(p.postTokenChamadas).toHaveLength(1);
    expect(p.guardados).toHaveLength(1);
    expect(p.resposta()).toMatchObject({ oauth: true, ok: true });
    expect(p.apagadas.sort()).toEqual(["BLING_OAUTH_STATE", "BLING_OAUTH_STATE_AT"]);
    expect(p.lockEquilibrado()).toBe(true);

    const saiu = p.tudoQueSaiu();
    for (const s of [CODE, ACCESS, REFRESH, STATE]) expect(saiu).not.toContain(s);
  });

  it("state inválido: RECUSA antes de tocar no code", () => {
    for (const params of [
      { code: CODE, state: "outro" },
      { code: CODE },
      { code: CODE, state: "" },
    ]) {
      const p = carregarOAuth({ props: propsValidas() });
      p.serveOauthCallback_(params);
      expect(p.postTokenChamadas).toHaveLength(0);
      expect(p.resposta()).toMatchObject({ ok: false, erro: "STATE_INVALIDO" });
    }
  });

  it("state fora de prazo é recusado", () => {
    const p = carregarOAuth({ props: propsValidas({ BLING_OAUTH_STATE_AT: "1" }), agora: 999999999 });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(p.postTokenChamadas).toHaveLength(0);
    expect(p.resposta().erro).toBe("STATE_INVALIDO");
  });

  it("o code é MARCADO antes da troca — um refresh não o reenvia", () => {
    const p = carregarOAuth({ props: propsValidas() });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(Object.keys(p.cache)).toHaveLength(1);

    // segunda passagem com o mesmo code: já não troca
    const props2 = propsValidas();
    const p2 = carregarOAuth({ props: props2, cacheInicial: p.cache });
    p2.serveOauthCallback_({ code: CODE, state: STATE });
    expect(p2.postTokenChamadas).toHaveLength(0);
    expect(p2.resposta()).toMatchObject({ ok: false, erro: "CODE_JA_PROCESSADO" });
  });

  it("a marca é um HASH — o code nunca fica em cache", () => {
    const p = carregarOAuth({ props: propsValidas() });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(Object.keys(p.cache)[0]).not.toContain(CODE);
    expect(Object.keys(p.cache)[0]).toMatch(/^oauth_[0-9a-f]{32}$/);
  });

  const casos = [
    ["code expirado", 400, '{"error":{"type":"invalid_grant","description":"The authorization code has expired"}}', "CODE_EXPIRADO"],
    ["code já usado", 400, '{"error":{"description":"This authorization code has already been used, for security reasons the user has been revoked."}}', "CODE_JA_USADO_UTILIZADOR_REVOGADO"],
    ["credenciais inválidas", 401, '{"error":{"type":"invalid_client"}}', "CREDENCIAIS_INVALIDAS"],
    ["empresa inativa", 401, '{"error":{"message":"Empresa inativa"}}', "EMPRESA_INATIVA"],
    ["invalid_grant genérico", 400, '{"error":{"type":"invalid_grant"}}', "GRANT_INVALIDO"],
  ];

  for (const [rot, status, corpo, esperado] of casos) {
    it(`${rot} → ${esperado}, sem corpo cru na resposta`, () => {
      const p = carregarOAuth({ props: propsValidas(), postTokenErro: erroToken(status, corpo) });
      p.serveOauthCallback_({ code: CODE, state: STATE });
      expect(p.resposta()).toMatchObject({ oauth: true, ok: false, erro: esperado, httpStatus: status });
      expect(p.tudoQueSaiu()).not.toContain("error");
      expect(p.guardados).toHaveLength(0);
    });
  }

  it("erro inesperado não vira sucesso e não vaza a mensagem", () => {
    const p = carregarOAuth({ props: propsValidas(), postTokenErro: new Error("boom segredo-xyz") });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(p.resposta()).toMatchObject({ ok: false, erro: "ERRO" });
    expect(p.tudoQueSaiu()).not.toContain("segredo-xyz");
  });

  it("falha na troca NÃO consome o state nem guarda tokens", () => {
    const p = carregarOAuth({ props: propsValidas(), postTokenErro: erroToken(400, "expired") });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(p.apagadas).toHaveLength(0);
    expect(p.guardados).toHaveLength(0);
  });

  it("o lock é sempre solto, mesmo em erro", () => {
    const p = carregarOAuth({ props: propsValidas(), postTokenErro: erroToken(400, "expired") });
    p.serveOauthCallback_({ code: CODE, state: STATE });
    expect(p.lockEquilibrado()).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════
 * O QUE O CÓDIGO DEIXOU DE FAZER.
 * ════════════════════════════════════════════════════════════════════════════════════ */
describe("o code deixou de ser exposto e de ser persistido", () => {
  it("o doGet já não devolve `code:` na resposta", () => {
    expect(fatiar("doGet")).not.toContain("code: p.code");
  });

  it("o callback não escreve BLING_AUTH_CODE em lado nenhum", () => {
    const cb = fatiar("serveOauthCallback_") + fatiar("trocarCodePorTokens_");
    expect(cb).not.toContain("BLING_AUTH_CODE");
  });

  it("buildAuthUrl_ passou a guardar um state aleatório, não o relógio", () => {
    const b = fatiar("buildAuthUrl_");
    expect(b).toContain("Utilities.getUuid()");
    expect(b).toContain("BLING_OAUTH_STATE");
    expect(b).not.toContain("finerone_' + Date.now()");
  });
});
