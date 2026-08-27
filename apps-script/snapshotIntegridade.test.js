// P0 — um erro externo nunca pode substituir um snapshot bom por um dataset vazio.
//
// O caminho que motivou este teste é concreto: blingGet_ devolvia safeParse_(body),
// que transformava um corpo ilegível num `null` silencioso. Com HTTP 200 e corpo
// inválido, o chamador via `res.data` indefinido, tratava como lote vazio, parava a
// paginação na primeira página e reescrevia o snapshot inteiro com `data: []`.
//
// As duas defesas são testadas aqui pela fonte real: a decisão pura (zero só grava se
// já era zero) e a garantia estrutural de que os rebuilds a consultam antes de gravar.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (f) => readFileSync(join(raiz, f), "utf8");

const codigo = ler("Código.js");
const despesas = ler("Despesasbackend.js");
const recebiveis = ler("RecebiveisBackend.js");

/* Extrai a função pura da fonte real e avalia-a isolada. */
function carregar(nomeFn, fonte) {
  const inicio = fonte.indexOf(`function ${nomeFn}(`);
  expect(inicio, `${nomeFn} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", inicio);
  const src = fonte.slice(inicio, fim + 2);
  return new Function(src + `\nreturn ${nomeFn};`)();
}

const podeGravarListagemVazia_ = carregar("podeGravarListagemVazia_", codigo);

describe("podeGravarListagemVazia_ — zero real vs. zero por falha", () => {
  it("grava sempre quando a listagem trouxe títulos", () => {
    expect(podeGravarListagemVazia_(301, 301)).toBe(true);
    expect(podeGravarListagemVazia_(1, 5000)).toBe(true);
    expect(podeGravarListagemVazia_(1, 0)).toBe(true);
  });

  it("BLOQUEIA a gravação de zero quando havia histórico", () => {
    // O caso que interessa: 301 títulos ontem, 0 hoje. Isto é uma falha até prova
    // em contrário, e a prova não pode vir de um rebuild automático.
    expect(podeGravarListagemVazia_(0, 301)).toBe(false);
    expect(podeGravarListagemVazia_(0, 1)).toBe(false);
    expect(podeGravarListagemVazia_(0, 1390)).toBe(false);
  });

  it("permite zero quando também não havia nada antes", () => {
    // Primeira execução, ou empresa sem títulos: zero é o dado correto e passa.
    expect(podeGravarListagemVazia_(0, 0)).toBe(true);
  });

  it("trata ausência de snapshot anterior como zero anterior", () => {
    expect(podeGravarListagemVazia_(0, null)).toBe(true);
    expect(podeGravarListagemVazia_(0, undefined)).toBe(true);
  });

  it("é pura: não toca em rede, Drive nem relógio", () => {
    const src = codigo.slice(codigo.indexOf("function podeGravarListagemVazia_"));
    const corpo = src.slice(0, src.indexOf("\n}") + 2);
    for (const proibido of ["UrlFetchApp", "DriveApp", "Date.now", "new Date", "blingGet_", "Logger"]) {
      expect(corpo, `${proibido} não devia aparecer numa função pura`).not.toContain(proibido);
    }
  });
});

describe("loteDaListagem_ — `data` de uma listagem tem de ser lista", () => {
  const loteDaListagem_ = carregar("loteDaListagem_", codigo);

  it("devolve a lista quando o shape está certo", () => {
    expect(loteDaListagem_({ data: [1, 2, 3] }, "/x")).toEqual([1, 2, 3]);
  });

  it("HTTP 200 com `data: []` continua a ser aceite — é zero legítimo, não erro", () => {
    expect(loteDaListagem_({ data: [] }, "/x")).toEqual([]);
  });

  it("ausência de `data` continua a valer lista vazia (comportamento antigo)", () => {
    // Protegido a jusante pela guarda de listagem vazia. Não se transforma em erro
    // para não arriscar partir uma última página legitimamente vazia.
    expect(loteDaListagem_({}, "/x")).toEqual([]);
    expect(loteDaListagem_(null, "/x")).toEqual([]);
    expect(loteDaListagem_({ data: null }, "/x")).toEqual([]);
  });

  it("REBENTA quando `data` vem presente mas não é lista", () => {
    /* O caso que motivou a função: `lote.length` undefined faz o `for` não correr E o
     * `break` da paginação não disparar (undefined < 100 é falso), gastando MAX_PAGES
     * chamadas contra o rate limit para não recolher nada. */
    for (const mau of [{ data: { erro: "x" } }, { data: "texto" }, { data: 42 }, { data: true }]) {
      expect(() => loteDaListagem_(mau, "/contas/receber")).toThrow(/nao e uma lista/);
    }
  });

  it("a mensagem de erro diz qual o endpoint e que nada foi gravado", () => {
    expect(() => loteDaListagem_({ data: {} }, "/contas/pagar"))
      .toThrow(/\/contas\/pagar[\s\S]*abortado sem gravar/);
  });

  it("é pura: não toca em rede, Drive nem relógio", () => {
    const src = codigo.slice(codigo.indexOf("function loteDaListagem_"));
    const corpo = src.slice(0, src.indexOf("\n}") + 2);
    for (const proibido of ["UrlFetchApp", "DriveApp", "Date.now", "new Date", "blingGet_"]) {
      expect(corpo, `${proibido} não devia aparecer numa função pura`).not.toContain(proibido);
    }
  });
});

describe("as três listagens de PRODUÇÃO usam o guarda de shape", () => {
  /* Os ficheiros de diagnóstico e de teste do GAS mantêm o padrão antigo de propósito:
   * são ferramentas de inspeção e não escrevem snapshot nenhum. O que tem de estar
   * coberto é o caminho que alimenta os snapshots servidos ao público. */
  for (const [nome, fonte, path] of [
    ["pedidos", codigo, "/pedidos/vendas"],
    ["despesas", despesas, "/contas/pagar"],
    ["recebíveis", recebiveis, "/contas/receber"],
  ]) {
    it(`${nome}: a listagem passa por loteDaListagem_`, () => {
      expect(fonte).toContain(`loteDaListagem_(res, '${path}')`);
    });
  }
});

describe("LIMITE CONHECIDO da guarda — protege contra zero, não contra queda parcial", () => {
  /* Isto não é um teste de uma funcionalidade: é a fixação de uma lacuna, para que ela
   * seja visível em vez de silenciosa.
   *
   * A guarda pergunta "veio vazio?". Uma listagem que devolva 5 títulos onde ontem havia
   * 1390 não vem vazia, portanto passa — e o snapshot bom é substituído por um snapshot
   * quase vazio. O cenário é plausível: uma página que devolve menos do que PAGE_LIMIT
   * por falha transitória faz o laço de paginação parar cedo e a listagem fica truncada.
   *
   * A GUARDA continua sem apanhar isto, e continua a ser de propósito: um limiar (por
   * exemplo, bloquear quedas acima de 50%) é uma decisão de negócio, e um limiar mal
   * escolhido bloqueia rebuilds legítimos todas as noites.
   *
   * O QUE MUDOU EM 2026-08-25: o cenário deixou de estar desprotegido, por outra via.
   * A sonda de página +1 (`terminacaoPrematura_`, testada em `quedaMassiva.test.js`)
   * ataca a CAUSA medida — a paginação a terminar cedo — em vez do sintoma, e aborta o
   * rebuild sem gravar. Não tem limiar nenhum, portanto não precisou de decisão nenhuma.
   *
   * Estes testes continuam a descrever a guarda de listagem vazia, ISOLADA: uma queda
   * de 1390 para 5 causada por outra coisa que não terminação precoce (um apagamento em
   * massa no ERP, por exemplo) continua a passar por aqui. É a lacuna que a estratégia
   * B fecharia, e B continua por decidir. */
  it("uma queda de 1390 para 5 títulos passa a guarda — hoje é gravada", () => {
    expect(podeGravarListagemVazia_(5, 1390)).toBe(true);
    expect(podeGravarListagemVazia_(1, 1390)).toBe(true);
  });

  it("só o zero absoluto é travado", () => {
    expect(podeGravarListagemVazia_(0, 1390)).toBe(false);
  });
});

describe("os rebuilds consultam a guarda ANTES de gravar", () => {
  for (const [nome, fonte, save] of [
    ["despesas", despesas, "saveDespesasSnapshot_("],
    ["recebíveis", recebiveis, "saveRecebiveisSnapshot_("],
  ]) {
    it(`${nome}: a guarda existe e vem antes da gravação`, () => {
      const posGuarda = fonte.indexOf("podeGravarListagemVazia_(lista.length");
      expect(posGuarda, `${nome} não consulta a guarda`).toBeGreaterThan(-1);
      const posSave = fonte.indexOf(save + "snapshot)");
      expect(posSave, `${nome}: gravação não encontrada`).toBeGreaterThan(-1);
      expect(posGuarda).toBeLessThan(posSave);
    });

    it(`${nome}: aborta com motivo explícito em vez de gravar vazio`, () => {
      expect(fonte).toContain("listagem-vazia-suspeita");
      expect(fonte).toContain("PRESERVADO");
    });
  }

  it("pedidos já estava protegido por construção: a consolidação preserva o histórico", () => {
    // Uma janela vazia não apaga nada porque o snapshot é o merge de histórico +
    // janela, e não a janela sozinha. Não precisa da guarda — precisa do merge.
    expect(codigo).toContain("mergePedidosSnapshot(anteriorData, janela)");
  });
});

describe("ASSIMETRIA CONHECIDA — quem pode disparar chamadas ao Bling a partir do exterior", () => {
  /* Segunda lacuna fixada, não corrigida.
   *
   * serveRecebiveis_ foi endurecido: sem snapshot devolve data:[] com fonte
   * "snapshot-vazio" e NÃO consulta o Bling. Pedidos e despesas mantêm o fallback ao
   * vivo — ou seja, com o snapshot em falta, um pedido HTTP anónimo (o Web App é
   * ANYONE_ANONYMOUS) faz o backend paginar a API do Bling. Isso gasta quota partilhada
   * com as outras integrações da conta e pode provocar os 429 que o P0-3 remedeia.
   *
   * Estender o endurecimento a pedidos e despesas é plausível, mas o fallback existe
   * para o arranque a frio: removê-lo é uma decisão de produto, não uma limpeza. */
  it("recebíveis: sem snapshot NÃO consulta o Bling", () => {
    const fn = recebiveis.slice(recebiveis.indexOf("function serveRecebiveis_"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toContain("snapshot-vazio");
    expect(corpo).not.toContain("fetchContasReceberLista_(");
  });

  it("despesas: sem snapshot AINDA consulta o Bling ao vivo", () => {
    const fn = despesas.slice(despesas.indexOf("function serveDespesas_"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toContain("fetchContasPagarLista_(");
  });

  it("pedidos: sem snapshot AINDA consulta o Bling ao vivo", () => {
    const fn = codigo.slice(codigo.indexOf("function doGet("));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toContain("fetchPedidosVendas_(");
  });
});

describe("blingGet_ — HTTP 200 com corpo ilegível é falha, não lote vazio", () => {
  it("rebenta em vez de devolver null", () => {
    expect(codigo).toContain("corpo ilegivel (JSON invalido");
    const pos = codigo.indexOf("var parsed = safeParse_(body);");
    expect(pos, "parse endurecido não encontrado").toBeGreaterThan(-1);
    const trecho = codigo.slice(pos, pos + 400);
    expect(trecho).toContain("if (parsed === null)");
    expect(trecho).toContain("throw new Error");
  });

  it("não há mais nenhum `return safeParse_` no caminho de leitura da API", () => {
    const fn = codigo.slice(codigo.indexOf("function blingGet_"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).not.toContain("return safeParse_(body);");
  });
});
