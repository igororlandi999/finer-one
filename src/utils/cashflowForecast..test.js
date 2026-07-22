// Testes de cashflowForecast — janela 30/60, entradas/saídas, vencidos no dia atual,
// fora da janela, vazios, um lado, ambos ausentes, acumulado, datas inválidas, nulos.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildCashflowForecast, hasCashflowSource, parsePtDate } from "./cashflowForecast.js";

// Congela "hoje" para datas relativas determinísticas.
const HOJE = new Date(2026, 0, 15, 10, 0, 0); // 15/01/2026
function ddmmaaaa(offsetDias) {
  const d = new Date(2026, 0, 15 + offsetDias);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function receb(openInvoices) { return { metrics: {}, top: [], openInvoices }; }
function forn(openInvoices) { return { metrics: {}, top: [], openInvoices }; }
const inv = (valor, offsetDias, diasAtraso = 0, extra = {}) => ({
  id: extra.id ?? 1, cliente: extra.cliente ?? "C", fornecedor: extra.fornecedor ?? "F",
  numero: "N1", dataEmissao: "01/01/2026", vencimento: ddmmaaaa(offsetDias), valor, diasAtraso,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

describe("buildCashflowForecast — estrutura e janelas", () => {
  it("janela 30 => 31 pontos (0..30), primeiro é Hoje", () => {
    const out = buildCashflowForecast({ recebiveis: receb([]), fornecedores: forn([]), dias: 30 });
    expect(out.serie).toHaveLength(31);
    expect(out.serie[0].dia).toBe("Hoje");
    expect(out.dias).toBe(30);
  });

  it("janela 60 => 61 pontos", () => {
    const out = buildCashflowForecast({ recebiveis: receb([]), fornecedores: forn([]), dias: 60 });
    expect(out.serie).toHaveLength(61);
    expect(out.dias).toBe(60);
  });

  it("dias inválido cai para 30", () => {
    const out = buildCashflowForecast({ recebiveis: receb([]), fornecedores: forn([]), dias: 99 });
    expect(out.dias).toBe(30);
  });
});

describe("buildCashflowForecast — alocação", () => {
  it("entrada futura entra no dia do vencimento", () => {
    const out = buildCashflowForecast({ recebiveis: receb([inv(1000, 10)]), fornecedores: null, dias: 30 });
    expect(out.serie[10].entradas).toBe(1000);
    expect(out.totalEntradas).toBe(1000);
    expect(out.variacaoLiquida).toBe(1000);
  });

  it("saída futura entra como saida", () => {
    const out = buildCashflowForecast({ recebiveis: null, fornecedores: forn([inv(400, 5)]), dias: 30 });
    expect(out.serie[5].saidas).toBe(400);
    expect(out.variacaoLiquida).toBe(-400);
  });

  it("entrada e saída no mesmo dia => liquidoDia combina", () => {
    const out = buildCashflowForecast({
      recebiveis: receb([inv(1000, 7)]), fornecedores: forn([inv(300, 7)]), dias: 30,
    });
    expect(out.serie[7].entradas).toBe(1000);
    expect(out.serie[7].saidas).toBe(300);
    expect(out.serie[7].liquidoDia).toBe(700);
  });

  it("vencido (diasAtraso>0) é alocado ao dia atual (offset 0)", () => {
    const out = buildCashflowForecast({ recebiveis: receb([inv(500, -20, 20)]), fornecedores: null, dias: 30 });
    expect(out.serie[0].entradas).toBe(500);
  });

  it("título além da janela é ignorado", () => {
    const out = buildCashflowForecast({ recebiveis: receb([inv(999, 45)]), fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(0);
    expect(out.temDados).toBe(false);
  });

  it("título dentro de 60 mas fora de 30", () => {
    const in45 = receb([inv(999, 45)]);
    expect(buildCashflowForecast({ recebiveis: in45, fornecedores: null, dias: 30 }).totalEntradas).toBe(0);
    expect(buildCashflowForecast({ recebiveis: in45, fornecedores: null, dias: 60 }).totalEntradas).toBe(999);
  });
});

describe("buildCashflowForecast — acumulado e robustez", () => {
  it("saldo acumula variação líquida ponto a ponto", () => {
    const out = buildCashflowForecast({
      recebiveis: receb([inv(1000, 5)]), fornecedores: forn([inv(400, 10)]), dias: 30,
    });
    expect(out.serie[5].saldo).toBe(1000);   // após entrada
    expect(out.serie[10].saldo).toBe(600);   // após saída
    expect(out.serie[30].saldo).toBe(600);   // mantém até ao fim
  });

  it("data inválida é ignorada (não inventa)", () => {
    const bad = receb([{ id: 1, cliente: "C", numero: "N", dataEmissao: "x", vencimento: "31/02/2026", valor: 500, diasAtraso: 0 }]);
    const out = buildCashflowForecast({ recebiveis: bad, fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(0);
  });

  it("valor nulo/<=0 é ignorado", () => {
    const out = buildCashflowForecast({ recebiveis: receb([inv(0, 5), inv(-100, 6)]), fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(0);
  });

  it("ambos ausentes => série zerada, temDados false", () => {
    const out = buildCashflowForecast({ recebiveis: null, fornecedores: null, dias: 30 });
    expect(out.temDados).toBe(false);
    expect(out.serie.every((p) => p.saldo === 0)).toBe(true);
  });

  it("hasCashflowSource reflete presença", () => {
    expect(hasCashflowSource({ recebiveis: null, fornecedores: null })).toBe(false);
    expect(hasCashflowSource({ recebiveis: receb([]), fornecedores: null })).toBe(true);
  });

  it("saldo parcial já vem em openInvoices.valor (não recalcula)", () => {
    // valor 200 = saldo restante do título (1000 originais); a projeção usa 200.
    const out = buildCashflowForecast({ recebiveis: receb([inv(200, 3)]), fornecedores: null, dias: 30 });
    expect(out.serie[3].entradas).toBe(200);
  });
});

describe("buildCashflowForecast — base completa (allOpenInvoices)", () => {
  it("prefere allOpenInvoices a openInvoices quando presente", () => {
    const side = {
      metrics: {}, top: [],
      openInvoices: [inv(100, 5)],                    // truncado (exibição)
      allOpenInvoices: [inv(100, 5), inv(900, 6, 0, { id: 2 })], // completo
    };
    const out = buildCashflowForecast({ recebiveis: side, fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(1000); // usou a base completa, não só 100
  });

  it("não trunca em 20 títulos (base completa soma todos dentro da janela)", () => {
    const all = [];
    for (let i = 0; i < 25; i++) all.push(inv(100, 5, 0, { id: i + 1 }));
    const side = { metrics: {}, top: [], openInvoices: all.slice(0, 20), allOpenInvoices: all };
    const out = buildCashflowForecast({ recebiveis: side, fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(2500); // 25 × 100, não 2000
  });

  it("cai para openInvoices se allOpenInvoices ausente (retrocompat)", () => {
    const side = { metrics: {}, top: [], openInvoices: [inv(300, 4)] };
    const out = buildCashflowForecast({ recebiveis: side, fornecedores: null, dias: 30 });
    expect(out.totalEntradas).toBe(300);
  });
});

describe("parsePtDate — parsing seguro dd/mm/aaaa", () => {
  it("parseia data válida sem deslocamento de timezone", () => {
    const d = parsePtDate("15/03/2026");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // março (0-based)
    expect(d.getDate()).toBe(15);
  });
  it("rejeita data impossível (31/02)", () => {
    expect(parsePtDate("31/02/2026")).toBeNull();
  });
  it("rejeita formato inválido e nulos", () => {
    expect(parsePtDate("2026-03-15")).toBeNull();
    expect(parsePtDate("\u2014")).toBeNull();
    expect(parsePtDate(null)).toBeNull();
    expect(parsePtDate(undefined)).toBeNull();
  });
  it("aceita Date e normaliza a meia-noite", () => {
    const d = parsePtDate(new Date(2026, 5, 10, 14, 30));
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(10);
  });
});