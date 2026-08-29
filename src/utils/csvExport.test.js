// @vitest-environment happy-dom
// Testes do helper de exportação CSV. O downloadCsv é testado de ponta a ponta
// capturando o Blob passado a URL.createObjectURL — sem alterar o fonte.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsv, csvMoney, neutralizarFormula } from "./csvExport.js";

describe("csvMoney", () => {
  it("usa vírgula decimal com duas casas", () => {
    expect(csvMoney(14800.5)).toBe("14800,50");
    expect(csvMoney(1234.567)).toBe("1234,57"); // arredonda
  });

  it("não usa símbolo de euro nem separador de milhar", () => {
    const out = csvMoney(1234567.89);
    expect(out).toBe("1234567,89");
    expect(out).not.toContain("\u20ac");
    expect(out).not.toContain(" ");
  });

  it("trata zero, null e NaN como 0,00", () => {
    expect(csvMoney(0)).toBe("0,00");
    expect(csvMoney(null)).toBe("0,00");
    expect(csvMoney(NaN)).toBe("0,00");
    expect(csvMoney(undefined)).toBe("0,00");
  });
});

describe("downloadCsv", () => {
  let capturedBlob;

  beforeEach(() => {
    capturedBlob = null;
    if (!URL.createObjectURL) URL.createObjectURL = () => "";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob;
      return "blob:teste";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function csvGerado(headers, rows) {
    downloadCsv("teste.csv", headers, rows);
    expect(capturedBlob).not.toBeNull();
    return await capturedBlob.text();
  }

  it("gera BOM UTF-8, separador ; e linhas CRLF", async () => {
    const csv = await csvGerado(["A", "B"], [["1", "2"], ["3", "4"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("A;B\r\n1;2\r\n3;4");
  });

  it("escapa células com ponto e vírgula, aspas e quebras de linha", async () => {
    const csv = await csvGerado(
      ["Fornecedor", "Nota"],
      [["Norte; Industrial", 'com "aspas"'], ["Simples", "linha1\nlinha2"]]
    );
    const corpo = csv.slice(1);
    expect(corpo).toContain('"Norte; Industrial"');
    expect(corpo).toContain('"com ""aspas"""');
    expect(corpo).toContain('"linha1\nlinha2"');
    expect(corpo).toContain("Simples"); // sem aspas quando não precisa
    expect(corpo.startsWith("Fornecedor;Nota\r\n")).toBe(true);
  });

  it("mantém a vírgula decimal do csvMoney no ficheiro final", async () => {
    const csv = await csvGerado(["Valor (\u20ac)"], [[csvMoney(1500.4)]]);
    expect(csv).toContain("1500,40");
  });

  it("trata null/undefined em células como string vazia", async () => {
    const csv = await csvGerado(["A", "B"], [[null, undefined]]);
    expect(csv.slice(1)).toBe("A;B\r\n;");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * INJEÇÃO DE FÓRMULA
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O escape de CSV e a neutralização de fórmula resolvem problemas DIFERENTES, em
 * camadas diferentes: um é sobre o ficheiro, o outro é sobre o que a folha de cálculo
 * faz com ele depois de o ler. Ter o primeiro não dá o segundo.
 *
 * Os nomes de cliente e de fornecedor exportados vêm do Bling — texto que ninguém deste
 * lado escreveu nem revê — e quem abre o ficheiro é quem tem os números todos à frente.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
describe("uma célula exportada nunca chega à folha de cálculo como fórmula", () => {
  let blob;
  beforeEach(() => {
    blob = null;
    if (!URL.createObjectURL) URL.createObjectURL = () => "";
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { blob = b; return "blob:teste"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  async function ficheiro(headers, rows) {
    downloadCsv("teste.csv", headers, rows);
    return await blob.text();
  }

  it.each([
    ["=1+1", "'=1+1"],
    ['=HYPERLINK("https://exemplo.invalid";"Fatura")', '\'=HYPERLINK("https://exemplo.invalid";"Fatura")'],
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ["+351912345678", "'+351912345678"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["-- comentario", "'-- comentario"],
    ["\tTab a abrir", "'\tTab a abrir"],
  ])("%s é neutralizado", (entrada, esperado) => {
    expect(neutralizarFormula(entrada)).toBe(esperado);
  });

  it("um NÚMERO NEGATIVO não é neutralizado — senão a coluna de montantes deixa de somar", () => {
    /* O contrapeso que impede a correção de partir o produto. `-` é um início perigoso
     * E é o sinal de tudo o que se paga; tratar os dois da mesma maneira transformaria
     * um CSV financeiro num CSV de texto. */
    expect(neutralizarFormula("-1234,56")).toBe("-1234,56");
    expect(neutralizarFormula("-1234.56")).toBe("-1234.56");
    expect(neutralizarFormula("-0")).toBe("-0");
    expect(neutralizarFormula(csvMoney(-1234.56))).toBe("-1234,56");
  });

  it("texto normal atravessa intacto", () => {
    for (const s of ["Norte Industrial", "Fatura 2026/07", "", "0,00", "1234,56", "Crítico"]) {
      expect(neutralizarFormula(s)).toBe(s);
    }
  });

  it("no ficheiro final, nenhuma célula começa por = + @ depois do separador", async () => {
    /* A afirmação de ponta a ponta: não interessa o que a função devolve isolada, mas o
     * que sai no ficheiro que o utilizador abre. */
    const csv = await ficheiro(
      ["Fornecedor", "Valor (€)"],
      [["=HYPERLINK(\"https://exemplo.invalid\")", csvMoney(-500)], ["@SUM(A1)", csvMoney(120.5)]]
    );
    const corpo = csv.slice(1);
    for (const linha of corpo.split("\r\n").slice(1)) {
      for (const celula of linha.split(";")) {
        const conteudo = celula.replace(/^"/, "");
        expect(/^[=+@]/.test(conteudo), `célula ativa no ficheiro: ${celula}`).toBe(false);
      }
    }
    /* E os montantes continuam montantes. */
    expect(corpo).toContain("-500,00");
    expect(corpo).toContain("120,50");
  });

  /* ═════════════════════════════════════════════════════════════════════════════════
   * O ESPAÇO À CABEÇA — A NEUTRALIZAÇÃO NÃO PODE DEPENDER DE NINGUÉM ARRUMAR A FOLHA
   * ═════════════════════════════════════════════════════════════════════════════════
   * `" =1+1"` não é avaliado pelo Excel NO MOMENTO DA IMPORTAÇÃO — o espaço faz a célula
   * ficar texto. É por isso que isto não se classifica como uma falha explorável hoje.
   *
   * O que se fecha é o passo seguinte: basta um "remover espaços", uma limpeza de coluna
   * ou uma reimportação com trim — coisas que quem trata de folhas de cálculo faz por
   * hábito — para o espaço cair e a fórmula ficar armada num ficheiro que já ninguém
   * volta a rever. Uma defesa que só se mantém enquanto ninguém arrumar a folha não é
   * uma defesa que se possa afirmar por escrito.
   * ═════════════════════════════════════════════════════════════════════════════════ */
  it.each([
    [" =1+1", "' =1+1"],
    ["  =cmd|'/c calc'!A1", "'  =cmd|'/c calc'!A1"],
    [" @SUM(A1:A9)", "' @SUM(A1:A9)"],
    [" +351912345678", "' +351912345678"],
    [" =1+1", "' =1+1"],                 // espaço inquebrável (U+00A0)
    ["   =HYPERLINK(\"x\")", "'   =HYPERLINK(\"x\")"],
  ])("espaços à cabeça não escondem a fórmula: %j", (entrada, esperado) => {
    expect(neutralizarFormula(entrada)).toBe(esperado);
  });

  it("um montante com espaço à cabeça CONTINUA a não ser neutralizado", () => {
    /* O contrapeso da regra acima. Alargar o teste aos espaços não pode ter alargado a
     * neutralização aos números: `" -1234,56"` é o mesmo valor a pagar com um espaço que
     * veio da fonte, e prefixá-lo com apóstrofo tirava-o da soma da coluna. */
    expect(neutralizarFormula(" -1234,56")).toBe(" -1234,56");
    expect(neutralizarFormula("  -0")).toBe("  -0");
    expect(neutralizarFormula(" -500.00")).toBe(" -500.00");
  });

  it("os sósias unicode de `=` NÃO são neutralizados, e é deliberado", () => {
    /* Pediu-se para verificar os lookalikes. A verificação dá NEGATIVO e fica registada
     * para não voltar a ser feita: `＝` (U+FF1D), `﹦` (U+FE66) e `⁼` (U+207C) não são o
     * `=` ASCII e NENHUMA folha de cálculo os interpreta como início de fórmula — o
     * Excel, o LibreOffice e o Sheets comparam o caractere literal.
     *
     * Neutralizá-los seria pôr um apóstrofo visível em nomes legítimos de fornecedores
     * asiáticos, ou seja, estragar dados reais para resolver um ataque que não existe. */
    for (const s of ["＝1+1", "﹦SUM(A1)", "⁼A1", "≠A1"]) {
      expect(neutralizarFormula(s)).toBe(s);
    }
  });

  it("no ficheiro final, uma célula com espaço à cabeça também sai neutralizada", async () => {
    const csv = await ficheiro(
      ["Fornecedor", "Valor (€)"],
      [[" =HYPERLINK(\"https://exemplo.invalid\")", csvMoney(-500)]]
    );
    const corpo = csv.slice(1);
    /* O apóstrofo tem de estar ANTES do espaço: é a primeira coisa na célula que a folha
     * lê, e é isso que a marca como texto. */
    expect(corpo).toContain("' =HYPERLINK");
    expect(corpo).toContain("-500,00");
  });
});
