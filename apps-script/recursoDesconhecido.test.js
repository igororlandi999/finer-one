// ?recurso=xyz deixou de devolver o snapshot de PEDIDOS com HTTP 200.
//
// O bug era silencioso por construção: um recurso mal escrito, um recurso ainda não
// implantado, ou um cliente mais novo do que o backend recebiam dados do tipo errado
// numa resposta perfeitamente bem-sucedida. Nada no payload permitia perceber isso.
//
// O que NÃO pode partir: recurso omitido continua a servir pedidos. É o contrato que
// o front (apiGet sem params) e o scripts/check-data-pipeline.mjs usam hoje.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "Código.js"), "utf8");

function carregarDecisor() {
  const inicio = fonte.indexOf("var RECURSOS_SUPORTADOS");
  expect(inicio, "RECURSOS_SUPORTADOS não encontrado").toBeGreaterThan(-1);
  const marca = "function recursoConhecido_";
  const posFim = fonte.indexOf(marca, inicio);
  const fim = fonte.indexOf("\n}", posFim);
  const src = fonte.slice(inicio, fim + 2);
  return new Function(src + "\nreturn { RECURSOS_SUPORTADOS, recursoPresente_, recursoConhecido_ };")();
}
const M = carregarDecisor();

/* Reproduz a decisão exata do doGet: rejeita se PRESENTE e DESCONHECIDO. */
const rejeita = (v) => M.recursoPresente_(v) && !M.recursoConhecido_(v);

describe("compatibilidade — o que já funcionava continua a funcionar", () => {
  it("recurso omitido serve pedidos (não é rejeitado)", () => {
    expect(rejeita(undefined)).toBe(false);
    expect(rejeita(null)).toBe(false);
  });

  it("recurso vazio ou só espaços conta como omissão", () => {
    expect(rejeita("")).toBe(false);
    expect(rejeita("   ")).toBe(false);
  });

  it("os três recursos que o front usa hoje continuam aceites", () => {
    for (const r of ["despesas", "recebiveis", "ajustes-manuais"]) {
      expect(rejeita(r), `${r} não pode ser rejeitado`).toBe(false);
    }
  });

  it("'pedidos' passou a ser um alias explícito e válido", () => {
    expect(M.RECURSOS_SUPORTADOS).toContain("pedidos");
    expect(rejeita("pedidos")).toBe(false);
  });

  it("espaços à volta de um recurso válido não o partem", () => {
    expect(rejeita(" despesas ")).toBe(false);
  });
});

describe("recurso desconhecido — rejeitado em vez de servir pedidos", () => {
  it("rejeita gralhas plausíveis", () => {
    for (const r of ["depesas", "recebiveies", "ajustes", "pedidos-vendas"]) {
      expect(rejeita(r), `${r} devia ser rejeitado`).toBe(true);
    }
  });

  it("rejeita variações de caixa e acento — o contrato é literal", () => {
    // Adivinhar "Despesas" -> "despesas" esconderia um erro do cliente. Preferimos
    // que o cliente veja o erro e corrija a chamada.
    expect(rejeita("Despesas")).toBe(true);
    expect(rejeita("recebíveis")).toBe(true);
  });

  it("rejeita valores hostis sem os interpretar", () => {
    for (const r of ["../../etc/passwd", "__proto__", "constructor", "<script>"]) {
      expect(rejeita(r), `${r} devia ser rejeitado`).toBe(true);
    }
  });

  it("não é enganado por propriedades herdadas de Object.prototype", () => {
    // A lista é um array percorrido com comparação exata, não um objeto indexado:
    // 'toString' e 'hasOwnProperty' não são recursos.
    expect(rejeita("toString")).toBe(true);
    expect(rejeita("hasOwnProperty")).toBe(true);
  });
});

describe("forma da resposta de erro", () => {
  it("devolve error:true e um code estável", () => {
    expect(fonte).toContain("code: 'RECURSO_DESCONHECIDO'");
    const pos = fonte.indexOf("code: 'RECURSO_DESCONHECIDO'");
    const trecho = fonte.slice(pos - 200, pos + 200);
    expect(trecho).toContain("error: true");
  });

  it("publica a lista de recursos suportados", () => {
    expect(fonte).toContain("recursosSuportados: RECURSOS_SUPORTADOS.slice()");
  });

  it("não devolve stack, token nem a query string no erro", () => {
    const pos = fonte.indexOf("code: 'RECURSO_DESCONHECIDO'");
    const bloco = fonte.slice(pos - 400, pos + 300);
    expect(bloco).not.toContain("err.stack");
    expect(bloco).not.toContain("e.parameter");
    expect(bloco).not.toContain("getContentText");
  });

  it("o valor recebido é sanitizado antes de ir para o log", () => {
    expect(fonte).toContain("safeLog_('Recurso desconhecido pedido: ' + sanitize_(String(p.recurso)))");
  });
});

describe("a guarda está no sítio certo do doGet", () => {
  const doGet = fonte.slice(fonte.indexOf("function doGet(e)"), fonte.indexOf("function setCredentials_"));

  it("vem DEPOIS de todas as rotas conhecidas", () => {
    const posGuarda = doGet.indexOf("RECURSO_DESCONHECIDO");
    for (const rota of ["p.recurso === 'despesas'", "p.recurso === 'recebiveis'", "p.recurso === 'ajustes-manuais'"]) {
      expect(doGet.indexOf(rota), `${rota} devia vir antes da guarda`).toBeLessThan(posGuarda);
    }
  });

  it("vem ANTES do ramo por omissão que serve pedidos", () => {
    const posGuarda = doGet.indexOf("RECURSO_DESCONHECIDO");
    const posPedidos = doGet.indexOf("readPedidosSnapshot_()");
    expect(posPedidos, "ramo de pedidos não encontrado").toBeGreaterThan(-1);
    expect(posGuarda).toBeLessThan(posPedidos);
  });

  it("não intercepta o retorno do OAuth (p.code)", () => {
    // O ramo do authorization code tem de continuar a ser o primeiro: um retorno
    // do OAuth não traz recurso, mas traz code, e não pode ser tocado por isto.
    expect(doGet.indexOf("if (p.code)")).toBeLessThan(doGet.indexOf("RECURSO_DESCONHECIDO"));
  });
});
