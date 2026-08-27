// Testes de comportamento do escudo de rate limit do Bling (Código.js).
//
// O Apps Script não é importável: não há módulos, não há `export`, e o ficheiro
// depende de globais do runtime da Google (UrlFetchApp, Utilities, Logger). O que É
// testável — e o que interessa testar — são as três funções PURAS que decidem quando
// esperar e quando repetir. Elas foram escritas puras exatamente para isto.
//
// A extração é feita a partir do texto-fonte real: se alguém apagar ou renomear uma
// delas, o teste falha em vez de passar contra uma cópia desatualizada.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "Código.js"), "utf8");

/* Recorta o bloco puro do rate limit e avalia-o isolado. Nada do runtime da Google
 * é tocado: as três funções não chamam nada de fora. */
function carregarBlocoPuro() {
  const inicio = fonte.indexOf("var BLING_HTTP_RATE_LIMIT");
  expect(inicio, "bloco de constantes do rate limit não encontrado").toBeGreaterThan(-1);
  const marcaFim = "function blingBackoffMs_";
  const posFim = fonte.indexOf(marcaFim, inicio);
  expect(posFim, "blingBackoffMs_ não encontrado").toBeGreaterThan(-1);
  const fimBloco = fonte.indexOf("\n}", posFim);
  expect(fimBloco, "fim de blingBackoffMs_ não encontrado").toBeGreaterThan(-1);

  const codigo = fonte.slice(inicio, fimBloco + 2);
  const fabrica = new Function(
    codigo +
    "\nreturn { blingEsperaAntesDaChamadaMs_, blingDeveRepetirPorRateLimit_, blingBackoffMs_," +
    " BLING_HTTP_RATE_LIMIT, BLING_MIN_INTERVAL_MS, BLING_RATE_LIMIT_MAX_RETRIES, BLING_RATE_LIMIT_BACKOFF_MS };"
  );
  return fabrica();
}

const M = carregarBlocoPuro();

describe("limites configurados", () => {
  it("o intervalo mínimo respeita os 3 pedidos por segundo do Bling", () => {
    // 1000/3 = 333.3ms. Menos do que isso volta a permitir a rajada que deu 429.
    expect(M.BLING_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(334);
  });

  it("o backoff espera mais do que a janela de um segundo do limite", () => {
    expect(M.BLING_RATE_LIMIT_BACKOFF_MS).toBeGreaterThan(1000);
  });

  it("existe um teto duro de tentativas", () => {
    expect(M.BLING_RATE_LIMIT_MAX_RETRIES).toBeGreaterThan(0);
    expect(M.BLING_RATE_LIMIT_MAX_RETRIES).toBeLessThanOrEqual(5);
  });
});

describe("blingEsperaAntesDaChamadaMs_ — espaçamento entre chamadas", () => {
  const esperar = M.blingEsperaAntesDaChamadaMs_;

  it("não espera na primeira chamada (não há chamada anterior)", () => {
    expect(esperar(1_000_000, 0, 350)).toBe(0);
  });

  it("espera o que falta quando a chamada anterior foi há pouco", () => {
    // Passaram 100ms de um intervalo de 350ms: faltam 250ms.
    expect(esperar(1_000_100, 1_000_000, 350)).toBe(250);
  });

  it("não espera quando já passou o intervalo inteiro", () => {
    expect(esperar(1_000_400, 1_000_000, 350)).toBe(0);
  });

  it("não espera no limite exato do intervalo", () => {
    expect(esperar(1_000_350, 1_000_000, 350)).toBe(0);
  });

  it("nunca devolve um valor negativo", () => {
    expect(esperar(2_000_000, 1_000_000, 350)).toBe(0);
  });

  it("não inventa espera se o relógio recuar", () => {
    // Defensivo: um instante 'agora' anterior à última chamada não deve gerar
    // uma espera gigante que travaria o rebuild inteiro.
    expect(esperar(1_000_000, 1_000_500, 350)).toBe(0);
  });
});

describe("blingDeveRepetirPorRateLimit_ — só 429, e só até ao teto", () => {
  const repetir = M.blingDeveRepetirPorRateLimit_;

  it("repete em 429 enquanto houver tentativas por gastar", () => {
    expect(repetir(429, 0, 3)).toBe(true);
    expect(repetir(429, 1, 3)).toBe(true);
    expect(repetir(429, 2, 3)).toBe(true);
  });

  it("para ao atingir o teto — não há ciclo infinito", () => {
    expect(repetir(429, 3, 3)).toBe(false);
    expect(repetir(429, 99, 3)).toBe(false);
  });

  it("NÃO repete em nenhum outro código de erro", () => {
    // Isto é o coração do requisito: um 401, 403, 404 ou 500 tem de rebentar já,
    // com a mensagem original. Repetir mascararia a causa real.
    for (const code of [200, 201, 400, 401, 403, 404, 422, 500, 502, 503]) {
      expect(repetir(code, 0, 3), `código ${code} não deve repetir`).toBe(false);
    }
  });

  it("trata o código como número mesmo vindo em texto", () => {
    expect(repetir("429", 0, 3)).toBe(true);
    expect(repetir("500", 0, 3)).toBe(false);
  });
});

describe("blingBackoffMs_ — espera crescente e limitada", () => {
  const backoff = M.blingBackoffMs_;

  it("cresce a cada tentativa", () => {
    expect(backoff(1, 1100)).toBe(1100);
    expect(backoff(2, 1100)).toBe(2200);
    expect(backoff(3, 1100)).toBe(3300);
  });

  it("a soma do pior caso cabe no orçamento de execução do Apps Script", () => {
    let total = 0;
    for (let i = 1; i <= M.BLING_RATE_LIMIT_MAX_RETRIES; i++) {
      total += backoff(i, M.BLING_RATE_LIMIT_BACKOFF_MS);
    }
    // O orçamento por rebuild é de 5 min; o limite duro do GAS é ~6 min. Uma única
    // chamada não pode consumir uma fatia significativa disso.
    expect(total).toBeLessThan(30_000);
  });

  it("devolve 0 para tentativa inválida", () => {
    expect(backoff(0, 1100)).toBe(0);
    expect(backoff(-1, 1100)).toBe(0);
  });
});

describe("blingGet_ — integração do escudo no caminho real", () => {
  it("todas as chamadas passam pelo espaçamento, incluindo o retry de 401", () => {
    const corpo = fonte.slice(fonte.indexOf("function blingGet_"));
    const fim = corpo.indexOf("\n}\n");
    const fn = corpo.slice(0, fim);
    // doFetch só pode ser invocado através de `chamar`, que aplica o espaçamento.
    const chamadasDiretas = fn.match(/=\s*doFetch\(/g) || [];
    expect(chamadasDiretas.length, "doFetch chamado sem passar pelo espaçamento").toBe(0);
    expect(fn).toContain("chamar(token)");
  });

  it("o erro não-2xx continua a rebentar com o código original", () => {
    expect(fonte).toContain("throw new Error('Bling GET ' + path + ' falhou (HTTP ' + code + ')");
  });
});
