// QUEDA MASSIVA — o snapshot bom substituído por uma fração dele.
//
// ─── A LACUNA QUE ISTO FECHA ────────────────────────────────────────────────────────
// `podeGravarListagemVazia_` pergunta "veio vazio?". Só isso. Uma listagem que traga 5
// títulos onde ontem havia 1390 NÃO vem vazia, portanto passa a guarda — e o rebuild
// reescreve o snapshot com essa fração. A lacuna estava fixada em teste, de propósito,
// para ser visível em vez de silenciosa (`snapshotIntegridade.test.js`).
//
// O caminho é concreto e não é hipotético: o laço termina em
// `if (lote.length < PAGE_LIMIT) break;`. Uma página que devolva 47 títulos em vez de
// 100, por um motivo transitório qualquer, ENCERRA A PAGINAÇÃO como se fosse a última.
//
// ─── PORQUE ESTA ESTRATÉGIA, E NÃO UM LIMIAR ────────────────────────────────────────
// A medição de 2026-08-23 (docs/INTEGRIDADE_SNAPSHOT_ESTRATEGIAS.md) comparou dois
// snapshots de contas a pagar com 9,1 dias de intervalo: ZERO títulos desapareceram —
// os liquidados mudam de situação e ficam na listagem. Isso desfaz a suposição que
// justificaria um limiar percentual, mas escolher o K de "bloquear quando
// novo < anterior − K" continua a ser DECISÃO DE NEGÓCIO: apagar um lançamento errado
// é legítimo e produz uma queda de 1.
//
// A sonda de página +1 não tem limiar nenhum e não pede decisão nenhuma. Ataca a CAUSA
// (terminação precoce) em vez do sintoma (contagem baixa) — e por isso deteta um
// truncamento de 1% tão bem como um de 99%, que nenhum limiar percentual apanharia.
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

/* Extrai a função pura da fonte REAL e avalia-a isolada — mesmo padrão dos restantes
 * testes de Apps Script deste projeto. Testar a fonte, e não uma cópia, é o que impede
 * o teste de passar a verde sobre código que já não existe. */
function carregar(nomeFn, fonte) {
  const inicio = fonte.indexOf(`function ${nomeFn}(`);
  expect(inicio, `${nomeFn} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", inicio);
  return new Function(fonte.slice(inicio, fim + 2) + `\nreturn ${nomeFn};`)();
}

const terminacaoPrematura_ = carregar("terminacaoPrematura_", codigo);

const PAGE_LIMIT = 100;

describe("terminacaoPrematura_ — fim natural verdadeiro vs. paginação parada a meio", () => {
  it("última página curta E página seguinte vazia: é o fim natural, nada a assinalar", () => {
    expect(terminacaoPrematura_(47, PAGE_LIMIT, 0)).toBe(false);
    expect(terminacaoPrematura_(0, PAGE_LIMIT, 0)).toBe(false);
    expect(terminacaoPrematura_(99, PAGE_LIMIT, 0)).toBe(false);
  });

  it("última página curta MAS página seguinte com dados: a paginação parou antes do fim", () => {
    expect(terminacaoPrematura_(47, PAGE_LIMIT, 100)).toBe(true);
    // E um único título na sonda chega: não há quantidade mínima a atingir.
    expect(terminacaoPrematura_(47, PAGE_LIMIT, 1)).toBe(true);
  });

  /* O teto MAX_PAGES já é medido por paginacaoTruncada_. Contar o mesmo facto duas
   * vezes, com dois nomes, só tornaria o diagnóstico ambíguo. */
  it("última página CHEIA não é terminação prematura — isso é o teto, e tem nome próprio", () => {
    expect(terminacaoPrematura_(100, PAGE_LIMIT, 100)).toBe(false);
    expect(terminacaoPrematura_(120, PAGE_LIMIT, 100)).toBe(false);
  });

  it("não tem limiar nenhum: nenhuma percentagem, nenhum K, nenhuma contagem anterior", () => {
    const src = codigo.slice(codigo.indexOf("function terminacaoPrematura_"));
    const corpo = src.slice(0, src.indexOf("\n}") + 2);
    // A assinatura não recebe o total anterior — logo não pode comparar contagens.
    expect(corpo).not.toMatch(/totalAnterior|anterior|limiar|threshold|0\.\d+|percent/i);
  });
});

describe("a sonda é feita no rebuild, e NUNCA no caminho de leitura ao vivo", () => {
  /* O fallback ao vivo já amplifica um pedido anónimo em 4-7 chamadas ao Bling, contra
   * um limite de 3 req/s. Um request extra por leitura pioraria a degradação
   * auto-reforçada documentada em INTEGRIDADE_SNAPSHOT_ESTRATEGIAS §6. No rebuild é
   * +1 request por noite. */
  for (const [nome, fonte, fetchFn] of [
    ["despesas", despesas, "fetchContasPagarLista_"],
    ["recebíveis", recebiveis, "fetchContasReceberLista_"],
  ]) {
    it(`${nome}: o paginador só sonda quando lhe pedem`, () => {
      expect(fonte).toContain(`function ${fetchFn}(opts)`);
      expect(fonte).toContain("var sondarFim = !!(opts && opts.sondarFim);");
      expect(fonte).toMatch(/if \(sondarFim && !(todos\.)?truncado\)/);
    });

    it(`${nome}: o rebuild pede a sonda`, () => {
      expect(fonte).toContain(`${fetchFn}({ sondarFim: true })`);
    });
  }

  it("o fallback ao vivo de despesas continua a chamar o paginador sem sonda", () => {
    // A função que serve sem snapshot não pode pagar o request extra.
    const serve = despesas.slice(despesas.indexOf("function serveDespesas_"));
    // "\n}" e não "\n}\n": os ficheiros do Apps Script têm CRLF, e o segundo padrão
    // nunca casa — devolvia -1 e a fatia passava a ser o ficheiro todo.
    const corpo = serve.slice(0, serve.indexOf("\n}") + 2);
    expect(corpo).toContain("fetchContasPagarLista_()");
    expect(corpo).not.toContain("sondarFim");
  });
});

describe("terminação prematura ABORTA o rebuild — não grava marcada como parcial", () => {
  /* A diferença face ao teto MAX_PAGES é deliberada e importa:
   *   - teto  = limite CONHECIDO e estável -> grava e marca `parcial`;
   *   - queda = sintoma de falha TRANSITÓRIA -> não grava; o snapshot de ontem serve e
   *             a leitura seguinte tem tudo para correr bem.
   * Marcar `parcial` e gravar destruiria o snapshot bom na mesma. */
  for (const [nome, fonte, save] of [
    ["despesas", despesas, "saveDespesasSnapshot_("],
    ["recebíveis", recebiveis, "saveRecebiveisSnapshot_("],
  ]) {
    it(`${nome}: aborta antes de qualquer gravação`, () => {
      const posGuarda = fonte.indexOf("lista.terminacaoPrematura");
      expect(posGuarda, `${nome} não consulta terminacaoPrematura`).toBeGreaterThan(-1);
      const posSave = fonte.indexOf(save + "snapshot)");
      expect(posSave, `${nome}: gravação não encontrada`).toBeGreaterThan(-1);
      expect(posGuarda).toBeLessThan(posSave);
      expect(fonte).toContain("motivo: 'paginacao-terminada-cedo'");
    });

    it(`${nome}: aborta ANTES de gastar chamadas de hidratação`, () => {
      // Enriquecer uma listagem que já se sabe incompleta é queimar orçamento por nada.
      const posGuarda = fonte.indexOf("lista.terminacaoPrematura");
      const posDetalhe = fonte.indexOf("chamadasDetalhe++");
      expect(posDetalhe).toBeGreaterThan(-1);
      expect(posGuarda).toBeLessThan(posDetalhe);
    });
  }
});

/* PEDIDOS ficam de fora, e não por esquecimento: `rebuildPedidosSnapshot_` consolida
 * via `mergePedidosSnapshot` — histórico + janela, sem descartar nada. Uma janela
 * truncada produz menos pedidos NOVOS, não a destruição do histórico. A guarda existe
 * para o caso irrecuperável, que é a SUBSTITUIÇÃO integral do snapshot. */
describe("pedidos não precisam da guarda — o rebuild consolida em vez de substituir", () => {
  it("o snapshot de pedidos sai de um merge com o histórico anterior", () => {
    expect(codigo).toContain("mergePedidosSnapshot(anteriorData, janela)");
    expect(codigo).toContain("data: merged.data");
  });
});
