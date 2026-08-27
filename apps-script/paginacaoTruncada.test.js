// TRUNCAMENTO DE PAGINAÇÃO — o snapshot que parecia completo.
//
// ─── O DEFEITO ──────────────────────────────────────────────────────────────────────
// Os três paginadores deste projeto têm a mesma forma:
//
//     while (pagina <= MAX_PAGES) { ...; if (lote.length < PAGE_LIMIT) break; pagina++; }
//
// e param por duas razões DIFERENTES que o código colapsava numa só:
//
//   A) fim natural   — última página incompleta. Não há mais nada. Dataset completo.
//   B) teto MAX_PAGES — última página CHEIA, laço travado por segurança. Há títulos
//                       por ler, e é indeterminável quantos.
//
// Auditado em 2026-08-24:
//   - `fetchPedidosVendas_`      não media (B) de todo.
//   - `fetchContasReceberLista_` não media (B) de todo.
//   - `fetchContasPagarLista_`   media (B) e emitia `listagemTruncada` na meta... que
//                                NÃO entrava em `parcial`, e `parcial` é o único campo
//                                que o frontend lê. O sinal existia e morria no envelope.
//
// `/contas/pagar` e `/contas/receber` são listados SEM filtro de data e crescem
// monotonicamente. Com PAGE_LIMIT 100 e MAX_PAGES 50 o teto são 5000 títulos: atingível
// por acumulação, não por acidente.
//
// ─── ESTE FICHEIRO NÃO PUBLICA NADA ─────────────────────────────────────────────────
// Testa a fonte LOCAL. Produção continua na versão 11 do Apps Script.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (f) => readFileSync(join(raiz, f), "utf8");

const codigo = ler("Código.js");
const despesas = ler("Despesasbackend.js");
const recebiveis = ler("RecebiveisBackend.js");

/* Extrai a função pura da fonte REAL e avalia-a isolada — mesmo padrão de
 * snapshotIntegridade.test.js e metadataCobertura.test.js. Um teste sobre uma cópia
 * provaria apenas que a cópia funciona. */
function corpoDaFuncao(nomeFn, fonte) {
  const inicio = fonte.indexOf(`function ${nomeFn}(`);
  expect(inicio, `${nomeFn} não encontrada`).toBeGreaterThan(-1);
  /* Contagem de chavetas em vez de procurar "\n}": o atalho apanhava o fecho errado
   * quando o ficheiro tem comentários com chavetas entre funções, e um corpo que
   * transborda para a função seguinte faz um teste passar (ou falhar) pela razão
   * errada. */
  let i = fonte.indexOf("{", inicio);
  let nivel = 0;
  for (; i < fonte.length; i++) {
    if (fonte[i] === "{") nivel++;
    else if (fonte[i] === "}") { nivel--; if (nivel === 0) return fonte.slice(inicio, i + 1); }
  }
  throw new Error(`${nomeFn}: chavetas desequilibradas`);
}

/* `prelude` injeta as constantes de módulo de que a função depende (as globais do GAS
 * não existem dentro de um `new Function`). */
function carregar(nomeFn, fonte, prelude = "") {
  const src = corpoDaFuncao(nomeFn, fonte);
  return new Function(prelude + "\n" + src + `\nreturn ${nomeFn};`)();
}

const paginacaoTruncada_ = carregar("paginacaoTruncada_", codigo);
const mapaIncompleto_ = carregar("mapaIncompleto_", despesas, "var MAPA_INCOMPLETO_ = 'MAPA_INCOMPLETO_';");

const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

describe("paginacaoTruncada_ — fim natural vs teto de segurança", () => {
  it("última página INCOMPLETA no teto: fim natural, NÃO é truncamento", () => {
    // Chegou-se a MAX_PAGES, mas a última página veio com 37 de 100: o Bling não tem
    // mais. É o caso mais fácil de confundir e o mais importante de não marcar.
    expect(paginacaoTruncada_(MAX_PAGES, 37, PAGE_LIMIT, MAX_PAGES)).toBe(false);
  });

  it("última página CHEIA no teto: TRUNCADO", () => {
    expect(paginacaoTruncada_(MAX_PAGES, PAGE_LIMIT, PAGE_LIMIT, MAX_PAGES)).toBe(true);
  });

  it("página cheia ANTES do teto não é truncamento — o laço ainda ia continuar", () => {
    expect(paginacaoTruncada_(3, PAGE_LIMIT, PAGE_LIMIT, MAX_PAGES)).toBe(false);
  });

  it("listagem que cabe numa página: nem perto do teto", () => {
    expect(paginacaoTruncada_(1, 12, PAGE_LIMIT, MAX_PAGES)).toBe(false);
  });

  it("listagem legitimamente VAZIA não é truncamento — zero real não é ausência", () => {
    expect(paginacaoTruncada_(1, 0, PAGE_LIMIT, MAX_PAGES)).toBe(false);
  });

  it("o caso real da Overcel hoje (1103 pedidos, 12 páginas) é limpo", () => {
    expect(paginacaoTruncada_(12, 3, PAGE_LIMIT, MAX_PAGES)).toBe(false);
  });

  it("é uma função PURA: sem relógio, sem rede, mesmo resultado sempre", () => {
    const a = paginacaoTruncada_(MAX_PAGES, PAGE_LIMIT, PAGE_LIMIT, MAX_PAGES);
    const b = paginacaoTruncada_(MAX_PAGES, PAGE_LIMIT, PAGE_LIMIT, MAX_PAGES);
    expect(a).toBe(b);
  });
});

describe("os três paginadores medem paginação e marcam o array", () => {
  const casos = [
    ["fetchPedidosVendas_", codigo],
    ["fetchContasPagarLista_", despesas],
    ["fetchContasReceberLista_", recebiveis],
  ];

  it.each(casos)("%s usa paginacaoTruncada_ e publica paginasLidas/truncado", (nome, fonte) => {
    const corpo = corpoDaFuncao(nome, fonte);

    // A regra vive num sítio só. Reimplementá-la em cada laço foi exatamente como
    // pedidos e recebíveis ficaram sem ela.
    expect(corpo, `${nome} deve delegar a decisão em paginacaoTruncada_`)
      .toContain("paginacaoTruncada_");
    expect(corpo).toMatch(/\.truncado\s*=/);
    expect(corpo).toMatch(/\.paginasLidas\s*=/);
  });
});

describe("meta dos três snapshots: truncamento entra em `parcial`", () => {
  /* `parcial` é o ÚNICO campo de completude que o frontend lê (lerParcial em
   * blingDataService). Um sinal de truncamento que não entre aqui não existe para a
   * aplicação — foi literalmente o que aconteceu às despesas. */
  const casos = [
    ["pedidos", codigo, "janela"],
    ["despesas", despesas, "lista"],
    ["recebiveis", recebiveis, "lista"],
  ];

  it.each(casos)("%s: parcial agrega o eixo do tempo E o da paginação", (_nome, fonte) => {
    const m = fonte.match(/parcial:\s*parcial[^\n]*(\n[^\n]*)?/);
    expect(m, "atribuição de `parcial:` na meta não encontrada").toBeTruthy();
    expect(m[0]).toContain("truncado");
  });

  it("pedidos e recebíveis publicam o FACTO em listagemTruncada, não só o agregado", () => {
    // O agregado diz que não está completo; o facto diz PORQUÊ. Perder o porquê
    // transforma um diagnóstico em adivinhação.
    expect(codigo).toContain("listagemTruncada:");
    expect(recebiveis).toContain("listagemTruncada:");
    expect(despesas).toContain("listagemTruncada:");
  });
});

describe("mapas de enriquecimento incompletos", () => {
  it("mapa normal não está marcado", () => {
    expect(mapaIncompleto_({ 12: "Fornecedores", 13: "Impostos" })).toBe(false);
  });

  it("mapa marcado é detetado", () => {
    expect(mapaIncompleto_({ 12: "Fornecedores", MAPA_INCOMPLETO_: true })).toBe(true);
  });

  it("mapa vazio não é o mesmo que mapa incompleto", () => {
    // Uma conta sem categorias nenhumas é um facto legítimo; um mapa que falhou a
    // carregar não é. Colapsar os dois faria "Sem categoria" significar duas coisas.
    expect(mapaIncompleto_({})).toBe(false);
  });

  it("null/undefined não rebentam nem afirmam completude", () => {
    expect(mapaIncompleto_(null)).toBe(false);
    expect(mapaIncompleto_(undefined)).toBe(false);
  });

  const buildersComGuarda = [
    ["buildFormasPagamentoMap_", despesas],
    ["buildCategoriasMap_", despesas],
    ["buildCategoriasMapRecebiveis_", recebiveis],
  ];

  it.each(buildersComGuarda)("%s marca o mapa no catch E no teto de páginas", (nome, fonte) => {
    const corpo = corpoDaFuncao(nome, fonte);

    // Duas causas, o mesmo efeito visível: um nome de categoria ERRADO, não em falta.
    expect(corpo).toContain("paginacaoTruncada_");
    const marcacoes = corpo.match(/MAPA_INCOMPLETO_\]\s*=\s*true/g) || [];
    expect(marcacoes.length, "esperadas 2 marcações: catch e teto").toBe(2);
  });

  it("a chave sentinela não pode colidir com um id do Bling", () => {
    // Os ids são numéricos; a sentinela é maiúsculas com underscore.
    expect(/^[A-Z_]+$/.test("MAPA_INCOMPLETO_")).toBe(true);
    expect(Number.isNaN(Number("MAPA_INCOMPLETO_"))).toBe(true);
  });
});
