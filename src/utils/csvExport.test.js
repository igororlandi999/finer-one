// @vitest-environment happy-dom
// Testes do helper de exportação CSV. O downloadCsv é testado de ponta a ponta
// capturando o Blob passado a URL.createObjectURL — sem alterar o fonte.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsv, csvMoney } from "./csvExport.js";

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
