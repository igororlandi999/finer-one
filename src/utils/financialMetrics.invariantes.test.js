// OS INVARIANTES DE `buildFinancialMetrics` — o contrato de que o resto do produto vive.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE FICHEIRO EXISTE, E PORQUE NÃO SÃO GUARDAS NO DIAGNÓSTICO
// ═══════════════════════════════════════════════════════════════════════════════════
// `diagnosticsEngine` lê `fm.profitability.netResult` e `fm.profitability.netMarginPct`
// depois de verificar apenas `fm != null`. Se `buildFinancialMetrics` alguma vez
// devolvesse um objeto sem `profitability`, isso seria um TypeError no meio do cálculo
// financeiro — e, pelo caminho que o erro faz, o dataset inteiro cairia para
// `unavailable` por causa de um campo em falta.
//
// A resposta NÃO é encher o diagnóstico de `?.`. Um `?.` transforma um contrato partido
// num `null` silencioso, e um null silencioso num motor financeiro é exatamente o tipo
// de erro que este projeto recusa: plausível, do tipo certo, e errado.
//
// A resposta é fixar o contrato do lado de quem o produz. Se `buildFinancialMetrics`
// devolve alguma coisa, essa coisa TEM a forma que os consumidores assumem. Este
// ficheiro é essa afirmação, exercida contra DREs deliberadamente estropiadas.
//
// ─── E O SEGUNDO INVARIANTE: NENHUM NÚMERO NÃO-FINITO ──────────────────────────────
// `NaN` e `Infinity` são o modo silencioso de falhar em aritmética financeira.
// Sobrevivem a `typeof === "number"`, passam por `!= null`, atravessam a UI, e
// `JSON.stringify` transforma-os em `null` — ou seja, um erro de divisão chega ao fim
// disfarçado de ausência de dados. A regra do produto é "denominador zero é null, nunca
// Infinity"; aqui prova-se que ela sobrevive a entradas que ninguém desenhou.

import { describe, it, expect } from "vitest";
import { buildFinancialMetrics, safePct } from "./financialMetrics.js";

/** Uma DRE completa e plausível. Ponto de partida de todas as mutilações. */
function dreCompleta(over = {}) {
  return {
    monthKey: "2026-06",
    receitaBruta: 500000,
    receitaLiquida: 450000,
    totalDeducoes: 50000,
    cmv: 116039.7,
    despesasOperacionais: 200000,
    lucroBruto: 333960.3,
    ebitda: 133960.3,
    resultadoLiquido: 120000,
    retiradasSocios: 10000,
    availability: {
      receitaBruta: "real", receitaLiquida: "real", totalDeducoes: "real",
      cmv: "manual", despesasOperacionais: "partial", lucroBruto: "manual",
      ebitda: "partial", resultadoLiquido: "partial", retiradasSocios: "real",
      coberturaPayables: "partial",
    },
    warnings: [],
    ...over,
  };
}

/** Todos os números de um objeto, em profundidade. */
function numeros(v, caminho = "$", saida = []) {
  if (typeof v === "number") saida.push([caminho, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => numeros(x, `${caminho}[${i}]`, saida));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) numeros(x, `${caminho}.${k}`, saida);
  }
  return saida;
}

const CAMPOS = [
  "monthKey", "receitaBruta", "receitaLiquida", "totalDeducoes", "cmv",
  "despesasOperacionais", "lucroBruto", "ebitda", "resultadoLiquido",
  "retiradasSocios", "availability", "warnings",
];

/* Valores que uma fonte avariada, um payload truncado ou um campo por preencher podem
 * pôr no lugar de um número. Nenhum é inventado: são os que a normalização deixa passar
 * quando a fonte não colabora. */
const LIXO = [undefined, null, NaN, Infinity, -Infinity, 0, -0, "", "0", "abc", {}, [], true, false];

describe("a forma devolvida é a que os consumidores assumem", () => {
  it("uma DRE completa produz todas as secções que o diagnóstico lê sem guarda", () => {
    const fm = buildFinancialMetrics(dreCompleta());
    for (const secao of ["revenue", "deductions", "cmv", "operatingExpenses", "profitability", "withdrawals", "availability"]) {
      expect(fm[secao], `secção ausente: ${secao}`).toBeTypeOf("object");
      expect(fm[secao]).not.toBeNull();
    }
    /* Os três acessos concretos de `diagnosticsEngine`, escritos como lá estão. */
    expect(() => fm.profitability.netResult).not.toThrow();
    expect(() => fm.profitability.netMarginPct).not.toThrow();
    expect(() => fm.revenue.net).not.toThrow();
    expect(Array.isArray(fm.warnings)).toBe(true);
  });

  it.each(CAMPOS)("com `%s` em falta, ou continua a ter a forma toda, ou não devolve nada", (campo) => {
    const dre = dreCompleta();
    delete dre[campo];
    const fm = buildFinancialMetrics(dre);
    if (fm === null) return;   // recusar é uma resposta válida; devolver meio objeto não é
    expect(fm.profitability, `${campo} em falta partiu profitability`).toBeTypeOf("object");
    expect(fm.revenue).toBeTypeOf("object");
    expect(fm.availability).toBeTypeOf("object");
    expect(Array.isArray(fm.warnings)).toBe(true);
  });

  it.each(CAMPOS)("com `%s` substituído por lixo, nunca rebenta", (campo) => {
    for (const v of LIXO) {
      const dre = dreCompleta({ [campo]: v });
      expect(
        () => buildFinancialMetrics(dre),
        `${campo}=${String(v)} rebentou`
      ).not.toThrow();
    }
  });

  it("sem DRE nenhuma devolve null, e não um objeto vazio", () => {
    for (const v of [null, undefined, 0, "", false, NaN]) {
      expect(buildFinancialMetrics(v)).toBeNull();
    }
  });
});

describe("nenhum número não-finito escapa", () => {
  it("uma DRE completa não produz NaN nem Infinity em lado nenhum", () => {
    const fm = buildFinancialMetrics(dreCompleta());
    for (const [caminho, n] of numeros(fm)) {
      expect(Number.isFinite(n), `${caminho} = ${n}`).toBe(true);
    }
  });

  it("receita líquida ZERO produz margens `null`, e nunca Infinity nem NaN", () => {
    /* A regra do produto, escrita: denominador zero não é 0% — é uma divisão sem
     * significado. Um `Infinity` aqui chegaria à UI como "∞%" ou, pior, seria
     * serializado para `null` pelo JSON.stringify e apresentar-se-ia como ausência
     * de dados — um erro de divisão disfarçado de facto sobre a empresa. */
    const fm = buildFinancialMetrics(dreCompleta({ receitaLiquida: 0, receitaBruta: 0 }));
    expect(fm.profitability.netMarginPct).toBeNull();
    expect(fm.profitability.grossMarginPct).toBeNull();
    expect(fm.profitability.ebitdaMarginPct).toBeNull();
    expect(fm.cmv.pctOfNetRevenue).toBeNull();
    expect(fm.operatingExpenses.pctOfNetRevenue).toBeNull();
    expect(fm.deductions.pctOfGrossRevenue).toBeNull();
    for (const [caminho, n] of numeros(fm)) {
      expect(Number.isFinite(n), `${caminho} = ${n}`).toBe(true);
    }
  });

  it("resultado ZERO com receita real continua a ser um FACTO, e a margem é 0", () => {
    /* O contrapeso do teste anterior, e a regra que este produto mais defende: zero real
     * nunca vira ausência. Uma guarda que devolvesse null para um resultado nulo
     * apagaria um mês em que a empresa ficou exactamente a zero — que é uma informação,
     * e das mais importantes. */
    const fm = buildFinancialMetrics(dreCompleta({ resultadoLiquido: 0 }));
    expect(fm.profitability.netResult).toBe(0);
    expect(fm.profitability.netMarginPct).toBe(0);
    expect(fm.profitability.netMarginPct).not.toBeNull();
  });

  it("a ausência (null) não se confunde com o zero em nenhuma das margens", () => {
    const fm = buildFinancialMetrics(dreCompleta({ resultadoLiquido: null, cmv: null }));
    expect(fm.profitability.netResult).toBeNull();
    expect(fm.profitability.netMarginPct).toBeNull();
    expect(fm.cmv.value).toBeNull();
    expect(fm.cmv.pctOfNetRevenue).toBeNull();
  });
});

describe("safePct — a divisão que nunca inventa um número", () => {
  it("um denominador zero é ausência de significado, não zero por cento", () => {
    expect(safePct(100, 0)).toBeNull();
    expect(safePct(0, 0)).toBeNull();
    expect(safePct(-100, 0)).toBeNull();
  });

  it("qualquer termo em falta é null", () => {
    expect(safePct(null, 100)).toBeNull();
    expect(safePct(100, null)).toBeNull();
    expect(safePct(undefined, 100)).toBeNull();
    expect(safePct(100, undefined)).toBeNull();
  });

  it("um numerador ZERO com denominador real é 0% — um facto", () => {
    expect(safePct(0, 450000)).toBe(0);
  });

  it("valores negativos atravessam: um prejuízo tem margem negativa", () => {
    expect(safePct(-45000, 450000)).toBe(-10);
  });
});
