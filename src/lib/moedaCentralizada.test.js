// MOEDA CENTRALIZADA — guarda de regressão.
//
// ─── O DEFEITO, E PORQUE VOLTA SOZINHO ──────────────────────────────────────────────
// `lib/format.js` exporta `formatEUR`, com pt-PT e EUR cozidos dentro. Foi o formatador
// original do projeto, de quando a aplicação era demonstrada com uma fixture portuguesa.
// A empresa ativa passou a ser brasileira e o formatador ficou. Resultado observado em
// 2026-08: a página Despesas mostrava "336 461,88 €" sobre contas a pagar em reais.
//
// Corrigir a página não chega. Enquanto `formatEUR` for importável, a próxima página —
// ou o próximo componente partilhado, que é pior porque contamina várias telas — volta
// a importá-lo sem que nada se queixe. Este ficheiro é a queixa.
//
// ─── O QUE FICA DE FORA, DE PROPÓSITO ───────────────────────────────────────────────
// `data/mockData.js` tem valores demonstrativos escritos como texto ("84.300 €"). São
// conteúdo de fixture, não uma escolha de moeda feita pelo código, e mudá-los seria
// editar a demonstração — outra decisão, com outro dono.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { formatMoney, formatMoneyCompact, currencySymbol, formatMoneyOrDash } from "./currency.js";
import { ACTIVE_COMPANY } from "../config/company.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const SRC = join(aqui, "..");

/** Todos os ficheiros de código da aplicação, excluindo testes e a própria fixture. */
function ficheirosDeCodigo(dir = SRC, acc = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) { ficheirosDeCodigo(caminho, acc); continue; }
    if (!/\.(js|jsx)$/.test(entrada.name)) continue;
    if (/\.test\.jsx?$/.test(entrada.name)) continue;
    acc.push(caminho);
  }
  return acc;
}

const CODIGO = ficheirosDeCodigo().map((f) => ({
  caminho: relative(SRC, f).replace(/\\/g, "/"),
  fonte: readFileSync(f, "utf8"),
}));

/* ==================================================================================== */
describe("nenhum ficheiro de aplicação escolhe a moeda por si", () => {
  it("ninguém importa formatEUR / formatEURCompact", () => {
    const infratores = CODIGO
      .filter((f) => f.caminho !== "lib/format.js")
      .filter((f) => /\bformatEURCompact?\b/.test(f.fonte) && /import[^;]*from\s+["'][^"']*lib\/format/.test(f.fonte))
      .map((f) => f.caminho);

    expect(infratores, `importam o formatador fixo em EUR: ${infratores.join(", ")}`).toEqual([]);
  });

  it("ninguém instancia Intl.NumberFormat com style currency fora de lib/currency", () => {
    /* Um `new Intl.NumberFormat(..., { style: "currency", currency: "..." })` escrito
     * numa página é a mesma decisão que `formatEUR`, só que escrita à mão e mais difícil
     * de encontrar. `lib/format.js` é o legado tolerado; tudo o resto passa pelo módulo
     * central, que lê a moeda da empresa. */
    const infratores = CODIGO
      .filter((f) => !["lib/currency.js", "lib/format.js"].includes(f.caminho))
      .filter((f) => /style:\s*["']currency["']/.test(f.fonte))
      .map((f) => f.caminho);

    expect(infratores, `escolhem moeda diretamente: ${infratores.join(", ")}`).toEqual([]);
  });

  it("nenhum símbolo de moeda escrito à mão em código de aplicação", () => {
    /* Cabeçalhos de CSV ("Valor (€)"), rótulos de eixos ("Limite 0 €") e frases geradas
     * ("... no total de 1.234,56 €"). Todos descreviam dados REAIS com o símbolo errado.
     * Escapes exclui `mockData.js` (fixture) e os comentários que EXPLICAM o defeito. */

    const linhasComSimbolo = [];
    for (const { caminho, fonte } of CODIGO) {
      if (caminho === "data/mockData.js") continue;
      /* Comentários são prosa SOBRE o defeito — inclusive esta explicação e as várias
       * que documentam a migração. Contá-los faria o guarda disparar por causa da sua
       * própria documentação, e a resposta seria apagar a documentação. Bloco `/* *​/`,
       * `//` e `{/* *​/}` de JSX são todos ignorados; o resto é código. */
      let emBloco = false;
      fonte.split("\n").forEach((linha, i) => {
        const t = linha.trim();
        const abre = t.includes("/*"), fecha = t.includes("*/");
        const eraBloco = emBloco;
        if (abre && !fecha) emBloco = true;
        else if (fecha) emBloco = false;
        if (eraBloco || abre || t.startsWith("//") || t.startsWith("*")) return;
        if (linha.includes("€")) linhasComSimbolo.push(`${caminho}:${i + 1}`);
      });
    }
    expect(linhasComSimbolo, `símbolo € em código: ${linhasComSimbolo.join(", ")}`).toEqual([]);
  });
});

/* ==================================================================================== */
describe("o módulo central segue a empresa ativa", () => {
  it("a empresa ativa é a brasileira, e é essa a moeda formatada", () => {
    expect(ACTIVE_COMPANY.currency).toBe("BRL");
    //   (espaço não-quebrável) é o que o Intl emite entre símbolo e valor.
    expect(formatMoney(1234.5)).toMatch(/^R\$/);
    expect(formatMoney(1234.5)).toContain("1.234,50");
  });

  it("uma empresa portuguesa continua a ver euros — a moeda é config, não código", () => {
    const pt = { currency: "EUR", locale: "pt-PT" };
    expect(formatMoney(1234.5, pt)).toContain("€");
    expect(currencySymbol(pt)).toBe("€");
  });

  it("currencySymbol sai do MESMO Intl que formata os valores", () => {
    // Se divergissem, um cabeçalho de CSV podia dizer uma moeda e as células outra.
    const simbolo = currencySymbol();
    expect(formatMoney(0)).toContain(simbolo);
    expect(simbolo).toBe("R$");
  });

  it("a versão compacta usa a mesma moeda", () => {
    expect(formatMoneyCompact(1250000)).toContain("R$");
  });

  it("null continua a ser ausência, não zero", () => {
    /* A regra que nenhuma migração de moeda pode pisar: um valor sem fonte mostra o
     * travessão, nunca "R$ 0,00" — que seria afirmar uma despesa que não existe. */
    expect(formatMoneyOrDash(null)).toBe("—");
    expect(formatMoneyOrDash(undefined)).toBe("—");
    expect(formatMoneyOrDash(0)).toContain("0,00");
  });
});

/* ==================================================================================== */
describe("o alias legado `eur` deixou de fabricar euros", () => {
  it("financialCalculations.eur formata na moeda da empresa", async () => {
    /* Alimentava os ALERTAS OPERACIONAIS e o DIAGNÓSTICO — as duas superfícies que
     * descrevem dados reais em frases. Cada frase afirmava euros sobre reais. */
    const { eur, money } = await import("../utils/financialCalculations.js");
    expect(eur(1234.5)).toContain("R$");
    expect(eur(1234.5)).not.toContain("€");
    expect(money(1234.5)).toBe(eur(1234.5));
  });
});
