// Testes da sonda NF-e (apps-script/DiagnosticoNfe.js).
//
// O ficheiro é código de Apps Script — sem `import`/`export`, e a depender de globais
// (`Logger`, `blingGet_`) que só existem no runtime da Google. Carrega-se aqui do mesmo
// modo que recursoDesconhecido.test.js já faz: lê-se a fonte e avalia-se com `new
// Function`, injetando os globais como parâmetros. Assim testa-se o ficheiro REAL, o que
// vai ser enviado, e não uma cópia que se pode dessincronizar.
//
// O que estes testes protegem, por ordem de importância:
//   1. nenhum valor sensível entra no resumo nem no log — é a razão de a sonda existir;
//   2. um 403 de escopo não é confundido com um 404, nem mascarado como sucesso;
//   3. a sentinela `0` nunca chega a produzir uma chamada de rede.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "DiagnosticoNfe.js"), "utf8");

/** Carrega o módulo com `Logger` e `blingGet_` sob controlo do teste. */
function carregar({ resposta, erro } = {}) {
  const linhas = [];
  const chamadas = [];
  const Logger = { log: (s) => linhas.push(String(s)) };
  const blingGet_ = (path, params) => {
    chamadas.push({ path, params });
    if (erro) throw erro;
    return resposta;
  };
  const api = new Function(
    "Logger",
    "blingGet_",
    fonte +
      "\nreturn { nfeProbeId_, preenchidoNfe_, classificarErroNfe_, resumoNfeSeguro_, runNfeProbe, NFE_PROBE_ID };"
  )(Logger, blingGet_);
  return { ...api, linhas, chamadas, ultimoLog: () => JSON.parse(linhas[linhas.length - 1]) };
}

const erroBling = (code, corpo = "") =>
  new Error(`Bling GET /nfe/123 falhou (HTTP ${code}): ${corpo}`);

/** Nota real plausível: os campos que a documentação promete, com valores inventados. */
const NOTA = {
  id: 26576410855,
  numero: "4471",
  serie: 1,
  situacao: 7,
  tipo: 1,
  chaveAcesso: "35260812345678000199550010000044711234567890",
  linkDanfe: "https://bling.com.br/danfe/x?accessKey=SEGREDO123",
  linkPDF: "https://bling.com.br/pdf/x?accessKey=SEGREDO123",
  xml: "https://bling.com.br/xml/x",
  contato: { nome: "Cliente Alfa", numeroDocumento: "12345678901" },
};

describe("nfeProbeId_ — só inteiro positivo chega à rede", () => {
  const { nfeProbeId_ } = carregar();

  it("aceita inteiro positivo, incluindo o id de 11 dígitos do Bling", () => {
    expect(nfeProbeId_(26576410855)).toBe(26576410855);
    expect(nfeProbeId_(1)).toBe(1);
    expect(nfeProbeId_("26576410855")).toBe(26576410855);
    expect(nfeProbeId_(" 42 ")).toBe(42);
  });

  it("rejeita a sentinela 0", () => {
    expect(nfeProbeId_(0)).toBeNull();
    expect(nfeProbeId_("0")).toBeNull();
  });

  it("rejeita negativo, null, undefined e string inválida", () => {
    for (const v of [-1, "-5", null, undefined, "", "   ", "abc", "12abc"]) {
      expect(nfeProbeId_(v)).toBeNull();
    }
  });

  it("rejeita não-inteiros e tipos que o Number() coagiria", () => {
    for (const v of [1.5, NaN, Infinity, -Infinity, true, false, ["7"], {}, []]) {
      expect(nfeProbeId_(v)).toBeNull();
    }
  });
});

describe("runNfeProbe — id inválido nunca toca na rede", () => {
  /* `null`/`undefined` NÃO estão nesta lista de propósito: o editor do Apps Script não
   * deixa passar argumentos, portanto ausência significa "usa NFE_PROBE_ID". Esse
   * caminho é fixado no bloco seguinte. Aqui ficam os valores que o utilizador escreveu
   * e que estão errados — esses nunca podem chegar à rede. */
  for (const [rot, v] of [["0", 0], ["'0'", "0"], ["negativo", -1], ["string inválida", "abc"],
                          ["vazia", ""], ["não-inteiro", 1.5], ["NaN", NaN], ["booleano", true]]) {
    it(`id ${rot} → ID_INVALIDO, zero chamadas`, () => {
      const p = carregar({ resposta: { data: NOTA } });
      p.runNfeProbe(v);
      expect(p.chamadas).toHaveLength(0);
      expect(p.ultimoLog()).toEqual({ ok: false, httpStatus: null, erro: "ID_INVALIDO" });
    });
  }

  it("id positivo faz exatamente UMA chamada GET a /nfe/{id}", () => {
    const p = carregar({ resposta: { data: NOTA } });
    p.runNfeProbe(26576410855);
    expect(p.chamadas).toHaveLength(1);
    expect(p.chamadas[0].path).toBe("/nfe/26576410855");
    expect(p.chamadas[0].params).toBeNull();
  });
});

describe("NFE_PROBE_ID — o que o editor vai mesmo executar", () => {
  const p0 = carregar();

  /* Sem isto, um `NFE_PROBE_ID` esquecido a 0 faria a sonda registar ID_INVALIDO e a
   * medição pareceria "falhou" quando na verdade nunca chegou a sair. */
  it("está configurado com um id válido, pronto a correr", () => {
    expect(p0.nfeProbeId_(p0.NFE_PROBE_ID)).toBe(p0.NFE_PROBE_ID);
    expect(p0.NFE_PROBE_ID).toBeGreaterThan(0);
    expect(Number.isInteger(p0.NFE_PROBE_ID)).toBe(true);
  });

  for (const [rot, v] of [["sem argumento", undefined], ["null", null]]) {
    it(`${rot} → usa NFE_PROBE_ID (é como o editor a invoca)`, () => {
      const p = carregar({ resposta: { data: NOTA } });
      rot === "null" ? p.runNfeProbe(null) : p.runNfeProbe();
      expect(p.chamadas).toHaveLength(1);
      expect(p.chamadas[0].path).toBe(`/nfe/${p0.NFE_PROBE_ID}`);
      expect(p.ultimoLog().ok).toBe(true);
    });
  }

  it("um argumento explícito ganha sempre ao NFE_PROBE_ID", () => {
    const p = carregar({ resposta: { data: NOTA } });
    p.runNfeProbe(999);
    expect(p.chamadas[0].path).toBe("/nfe/999");
  });
});

describe("resposta 200 — descreve a forma, nunca o conteúdo", () => {
  const p = carregar({ resposta: { data: NOTA } });
  p.runNfeProbe(26576410855);
  const out = p.ultimoLog();

  it("responde às perguntas da medição", () => {
    expect(out).toMatchObject({
      ok: true, httpStatus: 200,
      hasNumero: true, hasSerie: true, hasChaveAcesso: true,
      hasLinkDanfe: true, hasLinkPDF: true, hasXml: true,
      situacao: 7, tipo: 1,
    });
  });

  it("dá comprimentos, e os comprimentos são os reais", () => {
    expect(out.chaveAcessoLen).toBe(NOTA.chaveAcesso.length);
    expect(out.linkPDFLen).toBe(NOTA.linkPDF.length);
    expect(out.xmlLen).toBe(NOTA.xml.length);
  });

  it("classifica o campo xml como url ou conteúdo, sem o imprimir", () => {
    expect(out.xmlParece).toBe("url");
    const q = carregar({ resposta: { data: { ...NOTA, xml: "<?xml version=\"1.0\"?><nfeProc/>" } } });
    q.runNfeProbe(9);
    expect(q.ultimoLog().xmlParece).toBe("conteudo");
  });

  it("assinala a presença de accessKey sem revelar o valor", () => {
    expect(out.linksTemAccessKey).toBe(true);
    expect(JSON.stringify(out)).not.toContain("accessKey=");
  });

  /* O teste que justifica o ficheiro inteiro. */
  it("NENHUM valor sensível entra no resumo nem no log", () => {
    const serial = JSON.stringify(out) + "\n" + p.linhas.join("\n");
    for (const proibido of [
      NOTA.chaveAcesso, NOTA.linkDanfe, NOTA.linkPDF, NOTA.xml,
      "SEGREDO123", "bling.com.br", "https://",
      NOTA.numero, NOTA.contato.nome, NOTA.contato.numeroDocumento,
    ]) {
      expect(serial).not.toContain(proibido);
    }
    // e nenhuma chave inesperada apareceu no resumo
    expect(Object.keys(out).sort()).toEqual([
      "chaveAcessoLen", "hasChaveAcesso", "hasLinkDanfe", "hasLinkPDF", "hasNumero",
      "hasSerie", "hasXml", "httpStatus", "linkDanfeLen", "linkPDFLen",
      "linksTemAccessKey", "ok", "situacao", "tipo", "xmlLen", "xmlParece",
    ]);
  });

  it("campos em falta na nota dão false e comprimento 0, não erro", () => {
    const q = carregar({ resposta: { data: { id: 1, situacao: 1, tipo: 1 } } });
    q.runNfeProbe(9);
    expect(q.ultimoLog()).toMatchObject({
      ok: true, hasNumero: false, hasSerie: false, hasChaveAcesso: false,
      hasLinkDanfe: false, hasLinkPDF: false, hasXml: false,
      chaveAcessoLen: 0, xmlLen: 0, xmlParece: null, linksTemAccessKey: false,
    });
  });

  it("string vazia conta como ausente; 0 e false contam como presentes", () => {
    const q = carregar({ resposta: { data: { numero: "  ", serie: 0, situacao: 0, tipo: 0 } } });
    q.runNfeProbe(9);
    expect(q.ultimoLog()).toMatchObject({ hasNumero: false, hasSerie: true, situacao: 0, tipo: 0 });
  });

  it("200 sem data não é tratado como sucesso", () => {
    const q = carregar({ resposta: { data: null } });
    q.runNfeProbe(9);
    expect(q.ultimoLog()).toEqual({ ok: false, httpStatus: 200, erro: "SEM_DATA" });
  });
});

describe("erros — classificados, nunca mascarados, nunca crus", () => {
  const casos = [
    ["403 insufficient_scope", 403, '{"error":{"type":"insufficient_scope"}}', "SEM_ESCOPO", true],
    ["403 sem escopo indicado", 403, '{"error":{"type":"FORBIDDEN"}}', "PROIBIDO", false],
    ["404", 404, '{"error":{"type":"RESOURCE_NOT_FOUND"}}', "NAO_ENCONTRADA", false],
    ["401", 401, '{"error":{"type":"UNAUTHORIZED"}}', "NAO_AUTENTICADO", false],
    ["500", 500, "erro interno", "ERRO", false],
  ];

  for (const [rot, status, corpo, esperado, escopo] of casos) {
    it(`${rot} → ${esperado}`, () => {
      const p = carregar({ erro: erroBling(status, corpo) });
      p.runNfeProbe(26576410855);
      expect(p.ultimoLog()).toEqual({
        ok: false, httpStatus: status, erro: esperado, escopoInsuficiente: escopo,
      });
    });
  }

  it("erro sem HTTP reconhecível não vira sucesso", () => {
    const p = carregar({ erro: new Error("timeout na rede") });
    p.runNfeProbe(9);
    expect(p.ultimoLog()).toEqual({
      ok: false, httpStatus: null, erro: "ERRO", escopoInsuficiente: false,
    });
  });

  it("o corpo do erro NUNCA é devolvido nem registado", () => {
    const corpo = '{"error":{"type":"FORBIDDEN","chaveAcesso":"35260812345678000199","cpf":"12345678901"}}';
    const p = carregar({ erro: erroBling(403, corpo) });
    p.runNfeProbe(9);
    const serial = p.linhas.join("\n");
    expect(serial).not.toContain("35260812345678000199");
    expect(serial).not.toContain("12345678901");
    expect(serial).not.toContain("chaveAcesso");
    expect(Object.keys(p.ultimoLog()).sort()).toEqual([
      "erro", "escopoInsuficiente", "httpStatus", "ok",
    ]);
  });

  it("um 403 de escopo é distinguível de um 404, e nunca ok:true", () => {
    const escopo = carregar({ erro: erroBling(403, "insufficient_scope") });
    escopo.runNfeProbe(9);
    const naoExiste = carregar({ erro: erroBling(404, "RESOURCE_NOT_FOUND") });
    naoExiste.runNfeProbe(9);
    expect(escopo.ultimoLog().erro).toBe("SEM_ESCOPO");
    expect(naoExiste.ultimoLog().erro).toBe("NAO_ENCONTRADA");
    expect(escopo.ultimoLog().ok).toBe(false);
    expect(naoExiste.ultimoLog().ok).toBe(false);
  });
});

describe("a sonda é read-only por construção", () => {
  /* Verifica o CÓDIGO, não a prosa: os comentários deste ficheiro dizem "não chama
   * /nfe/documento" e "não altera OAuth" — descrevem a garantia, e uma busca ingénua
   * no texto todo acusaria precisamente a frase que promete o contrário do que acusa. */
  const codigo = fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  it("o código não escreve, não chama /nfe/documento e não toca em OAuth", () => {
    for (const proibido of [
      "UrlFetchApp", "setProperty", "deleteProperty", "PropertiesService",
      "/nfe/documento", "oauth", "refresh_token", "CLIENT_SECRET", "doPost",
    ]) {
      expect(codigo.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });

  it("só existe uma chamada ao Bling em todo o código", () => {
    expect((codigo.match(/blingGet_\(/g) || []).length).toBe(1);
  });

  it("o único caminho de rede é GET /nfe/{id}", () => {
    const paths = codigo.match(/blingGet_\(\s*'([^']*)'/g) || [];
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("/nfe/");
    expect(paths[0]).not.toContain("documento");
  });
});
