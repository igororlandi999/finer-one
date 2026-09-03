// Testes do diagnóstico OAuth (apps-script/DiagnosticoOAuth.js).
//
// Mesmo padrão de carregamento dos outros testes de Apps Script: lê-se a fonte real e
// avalia-se com `new Function`, injetando os globais do runtime da Google.
//
// O que estes testes protegem: que a prova identifica um code sem nunca o revelar, e
// que a classificação do erro distingue "expirou" de "já foi usado" — porque a segunda
// é, na documentação do Bling, a que revoga o utilizador.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "DiagnosticoOAuth.js"), "utf8");

function carregar({ props = {}, exchange } = {}) {
  const linhas = [];
  const apagadas = [];
  const Logger = { log: (s) => linhas.push(String(s)) };
  const Utilities = {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest: (_alg, s) => Array.from(createHash("sha256").update(String(s)).digest()),
  };
  const getProp_ = (k) => (k in props ? props[k] : null);
  const PropertiesService = {
    getScriptProperties: () => ({ deleteProperty: (k) => apagadas.push(k) }),
  };
  let chamouExchange = 0;
  const exchangeAuthorizationCode_ = () => {
    chamouExchange++;
    if (exchange) throw exchange;
  };
  const api = new Function(
    "Logger", "Utilities", "getProp_", "PropertiesService", "exchangeAuthorizationCode_",
    fonte + "\nreturn { analisarSegredo_, sha256Hex_, impressaoDigitalDoEstado_, " +
            "runProvaDoCode, runTrocarCodeComProva, classificarErroToken_ };"
  )(Logger, Utilities, getProp_, PropertiesService, exchangeAuthorizationCode_);
  return {
    ...api, linhas, apagadas,
    vezesQueTrocou: () => chamouExchange,
    prova: () => JSON.parse(linhas.find((l) => l.startsWith("PROVA ")).slice(6)),
    resultado: () => JSON.parse(linhas.find((l) => l.startsWith("RESULTADO ")).slice(10)),
  };
}

const CODE = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const REDIRECT = "https://script.google.com/macros/s/AKfycb_EXEMPLO_LONGO/exec";
const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

const erroToken = (status, corpo) =>
  new Error(`Falha no token (HTTP ${status}): ${corpo}`);

describe("analisarSegredo_ — identifica sem revelar", () => {
  const { analisarSegredo_ } = carregar();

  it("ausência é dita, não inventada", () => {
    expect(analisarSegredo_(null, "")).toEqual({ existe: false });
    expect(analisarSegredo_(undefined, "")).toEqual({ existe: false });
  });

  it("dá comprimento e prefixo de hash, nunca o valor", () => {
    const r = analisarSegredo_(CODE, sha8(CODE) + "resto");
    expect(r.existe).toBe(true);
    expect(r.comprimento).toBe(CODE.length);
    expect(r.fingerprint).toBe(sha8(CODE));
    expect(r.fingerprint).toHaveLength(8);
    expect(JSON.stringify(r)).not.toContain(CODE);
  });

  it("codes diferentes dão fingerprints diferentes", () => {
    const a = analisarSegredo_("codeA", sha8("codeA"));
    const b = analisarSegredo_("codeB", sha8("codeB"));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("o mesmo code dá sempre o mesmo fingerprint", () => {
    expect(analisarSegredo_(CODE, sha8(CODE)).fingerprint)
      .toBe(analisarSegredo_(CODE, sha8(CODE)).fingerprint);
  });

  it("apanha a sujidade típica de uma colagem", () => {
    expect(analisarSegredo_("  " + CODE + "\n", "x").temEspacoNasPontas).toBe(true);
    expect(analisarSegredo_(CODE + "\n", "x").temQuebraLinha).toBe(true);
    expect(analisarSegredo_('"' + CODE + '"', "x").temAspas).toBe(true);
    expect(analisarSegredo_("abc%2Fdef", "x").temPercentEncoding).toBe(true);
    expect(analisarSegredo_("abc def", "x").temEspacoInterno).toBe(true);
  });

  it("um code limpo não levanta nenhum sinalizador", () => {
    const r = analisarSegredo_(CODE, sha8(CODE));
    expect(r).toMatchObject({
      temEspacoNasPontas: false, temQuebraLinha: false, temAspas: false,
      temPercentEncoding: false, temEspacoInterno: false,
    });
    expect(r.comprimento).toBe(r.comprimentoAparado);
  });
});

describe("impressão digital do estado", () => {
  it("descreve code e redirect sem os imprimir", () => {
    /* Sentinelas distintivas de propósito: um valor de uma letra apanharia a letra
     * dentro de nomes de campo do próprio relatório ("existe" tem um x) e o teste
     * falharia por razão nenhuma. */
    const p = carregar({ props: {
      BLING_AUTH_CODE: CODE, BLING_REDIRECT_URI: REDIRECT,
      BLING_CLIENT_ID: "CLIENTID-SENTINELA",
      BLING_CLIENT_SECRET: "CLIENTSECRET-SENTINELA",
      BLING_REFRESH_TOKEN: "REFRESH-SENTINELA",
    }});
    p.runProvaDoCode();
    const serial = p.linhas.join("\n");
    const out = JSON.parse(p.linhas[0]);

    expect(out.code.fingerprint).toBe(sha8(CODE));
    expect(out.redirectUri.fingerprint).toBe(sha8(REDIRECT));
    expect(out).toMatchObject({ temClientId: true, temClientSecret: true, temRefreshTokenAntigo: true });

    for (const proibido of [CODE, REDIRECT, "script.google.com", "AKfycb",
                            "CLIENTID-SENTINELA", "CLIENTSECRET-SENTINELA", "REFRESH-SENTINELA"]) {
      expect(serial).not.toContain(proibido);
    }
  });

  it("propriedade ausente é reportada como ausente", () => {
    const p = carregar({ props: {} });
    p.runProvaDoCode();
    const out = JSON.parse(p.linhas[0]);
    expect(out.code).toEqual({ existe: false });
    expect(out.temClientId).toBe(false);
  });

  it("runProvaDoCode NÃO troca nada — não gasta o code", () => {
    const p = carregar({ props: { BLING_AUTH_CODE: CODE } });
    p.runProvaDoCode();
    expect(p.vezesQueTrocou()).toBe(0);
  });
});

describe("runTrocarCodeComProva — prova e troca no mesmo arranque", () => {
  it("regista a prova ANTES de trocar, e troca uma só vez", () => {
    const p = carregar({ props: { BLING_AUTH_CODE: CODE, BLING_REDIRECT_URI: REDIRECT } });
    p.runTrocarCodeComProva();
    expect(p.linhas[0].startsWith("PROVA ")).toBe(true);
    expect(p.prova().code.fingerprint).toBe(sha8(CODE));
    expect(p.vezesQueTrocou()).toBe(1);
    expect(p.resultado()).toEqual({ ok: true, erro: null });
  });

  it("sem code, não chega a tentar", () => {
    const p = carregar({ props: {} });
    p.runTrocarCodeComProva();
    expect(p.vezesQueTrocou()).toBe(0);
    expect(p.resultado()).toEqual({ ok: false, erro: "SEM_CODE" });
  });

  it("a prova sobrevive à falha da troca — fica provado qual code foi enviado", () => {
    const p = carregar({
      props: { BLING_AUTH_CODE: CODE },
      exchange: erroToken(400, '{"error":{"type":"invalid_grant","description":"The authorization code has expired"}}'),
    });
    p.runTrocarCodeComProva();
    expect(p.prova().code.fingerprint).toBe(sha8(CODE));
    expect(p.resultado()).toEqual({ ok: false, httpStatus: 400, erro: "CODE_EXPIRADO" });
  });

  it("nunca imprime o code, mesmo quando a troca falha", () => {
    const p = carregar({ props: { BLING_AUTH_CODE: CODE }, exchange: erroToken(400, "boom " + CODE) });
    p.runTrocarCodeComProva();
    expect(p.linhas.join("\n")).not.toContain(CODE);
  });
});

describe("classificarErroToken_ — distingue expirou de já-usado", () => {
  const { classificarErroToken_ } = carregar();

  it("expirado", () => {
    expect(classificarErroToken_(erroToken(400,
      '{"error":{"type":"invalid_grant","description":"The authorization code has expired"}}')))
      .toEqual({ ok: false, httpStatus: 400, erro: "CODE_EXPIRADO" });
  });

  /* O Bling revoga o utilizador quando um code é reusado. Confundir este caso com o
   * anterior levaria a "tentar outra vez", que é exatamente o que o provoca. */
  it("já usado — o caso que revoga o utilizador", () => {
    expect(classificarErroToken_(erroToken(400,
      '{"error":{"type":"VALIDATION_ERROR","description":"This authorization code has already been used, for security reasons the user has been revoked."}}')))
      .toEqual({ ok: false, httpStatus: 400, erro: "CODE_JA_USADO_UTILIZADOR_REVOGADO" });
  });

  it("credenciais inválidas", () => {
    expect(classificarErroToken_(erroToken(401, '{"error":{"type":"invalid_client"}}')).erro)
      .toBe("CREDENCIAIS_INVALIDAS");
  });

  it("empresa inativa", () => {
    expect(classificarErroToken_(erroToken(401, '{"error":{"message":"Empresa inativa"}}')).erro)
      .toBe("EMPRESA_INATIVA");
  });

  it("invalid_grant genérico não é confundido com expirado", () => {
    expect(classificarErroToken_(erroToken(400, '{"error":{"type":"invalid_grant"}}')).erro)
      .toBe("GRANT_INVALIDO");
  });

  it("erro desconhecido não vira sucesso e não devolve o corpo", () => {
    const r = classificarErroToken_(new Error("qualquer coisa com segredo abc123"));
    expect(r).toEqual({ ok: false, httpStatus: null, erro: "ERRO" });
    expect(JSON.stringify(r)).not.toContain("abc123");
  });
});

describe("o diagnóstico é seguro por construção", () => {
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("o código nunca escreve propriedades nem altera tokens", () => {
    for (const proibido of ["setProps_", "setProperty", "setProperties", "saveTokens_", "UrlFetchApp"]) {
      expect(codigo).not.toContain(proibido);
    }
  });

  it("o hash completo nunca é registado — só 8 caracteres", () => {
    expect(codigo).toContain(".slice(0, 8)");
  });
});
