// Testes ESTRUTURAIS do Resumo — encontrados a olhar para o produto a correr (FASE 13).
//
// O projeto não tem ambiente DOM no vitest (ver a nota em AjustesManuais.estrutura.test.js),
// pelo que se analisa a fonte. É grosseiro por natureza, e apanha exatamente as duas
// regressões que interessam aqui — as duas foram vistas no ecrã, com dados reais.
//
// ─── 1. TRÊS CARTÕES, TRÊS MESES, UM SEM NOME ───────────────────────────────────────
// O Resumo mostra lado a lado:
//   "Receitas (Mês)"          -> último mês COM PEDIDOS   (podia ser agosto, em curso)
//   "Contas a pagar este mês" -> mês CIVIL, por vencimento (agosto)
//   "Receita líquida (DRE)"   -> mês ÂNCORA                (junho)
// Dois nomeavam o seu período. O das receitas não — e era o único cujo mês não se podia
// inferir de mais lado nenhum.
//
// ─── 2. DUAS VARIAÇÕES CONTRADITÓRIAS NO MESMO ECRÃ ─────────────────────────────────
// O card das receitas anunciava "105,4% vs mês anterior" (agosto em curso vs julho) a
// poucos centímetros do alerta "a faturação caiu 56% face ao mês anterior", que o motor
// calcula sobre o par ancorado e comparável. Duas frases "vs mês anterior", sobre meses
// diferentes, de sinal oposto, nenhuma a dizer de que meses falava.
//
// A regra aplicada — não afirmar variação sobre um mês em curso — já existia em dois
// sítios: no card das contas a pagar ao lado, e no motor de alertas.
//
// ─── 3. O CARTÃO "PERGUNTE À FINER" PROMETIA O QUE O CHAT NÃO DAVA ──────────────────
// Mostrava três perguntas fixas do mock. Duas eram recusadas pelo motor e a terceira
// falava em "4.500 €" a uma empresa cuja moeda é o real.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const bruto = readFileSync(join(raiz, "Resumo.jsx"), "utf8");

/* Sem comentários: um comentário que EXPLICA por que razão não há delta não é um delta,
 * e sem esta limpeza o teste proibiria documentar a decisão. */
const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Resumo — cada cartão nomeia o seu mês", () => {
  it("o cartão de receitas mostra o mês de `receitasMonthKey`", () => {
    expect(fonte).toContain("monthMetrics.receitasMonthKey");
    expect(fonte).toMatch(/monthLongLabel\(monthMetrics\.receitasMonthKey\)/);
  });

  it("o cartão de contas a pagar continua a nomear o mês dos vencimentos", () => {
    expect(fonte).toMatch(/Vencimentos de \$\{monthLongLabel\(monthMetrics\.contasPagarMonthKey\)\}/);
  });

  it("o cartão da DRE continua a nomear o mês de referência", () => {
    expect(fonte).toMatch(/Mês de referência: \$\{monthLongLabel\(fin\.monthKey\)\}/);
  });
});

describe("Resumo — não se afirma variação sobre um mês em curso", () => {
  it("o delta das receitas é suprimido quando o mês está em curso", () => {
    expect(fonte).toContain("delta={receitasEmCurso ? undefined : monthMetrics.receitasDelta}");
  });

  /* O "em curso" sai da comparação com `contasPagarMonthKey`, que o SERVIÇO derivou do
   * mês civil. Uma segunda leitura do relógio aqui podia cair do outro lado da
   * meia-noite do dia 1 e discordar do resto do dataset. */
  it("o mês em curso vem do dataset, não de um `new Date()` na página", () => {
    expect(fonte).toContain("monthMetrics.receitasMonthKey === monthMetrics.contasPagarMonthKey");
    expect(fonte).not.toMatch(/new Date\(\)/);
  });
});

describe("Resumo — só se sugerem perguntas que o Chat sabe responder", () => {
  it("as sugestões em modo real vêm do catálogo do motor", () => {
    expect(fonte).toContain("SUPPORTED_QUESTIONS.slice(0, 3)");
    // O mock permanece disponível, mas só para o modo demonstrativo.
    expect(fonte).toContain('source === "api" ? SUPPORTED_QUESTIONS.slice(0, 3) : chatSuggestions');
  });

  it("a página não escreve perguntas à mão nem moeda fixa", () => {
    expect(fonte).not.toContain("€");
    expect(fonte).not.toContain("formatEUR");
  });
});
