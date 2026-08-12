// Testes do contrato de gating do dataset: a semântica de payables
// (undefined = ausência => mock/Demo; [] = zero títulos reais => zeros reais).
// Também protege a remoção dos campos mortos (alertas.metrics, diagnostics).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset } from "./blingDataService.js";

const HOJE = new Date(2026, 6, 15, 12, 0, 0);
const iso = (y, m, d) => new Date(y, m, d).toISOString();

const orders = [
  { id: 1, date: iso(2026, 6, 5), total: 5000, status: "recebida", client: { id: 1, name: "A" }, items: [] },
  { id: 2, date: iso(2026, 5, 5), total: 4000, status: "recebida", client: { id: 2, name: "B" }, items: [] },
];
const payablesComItens = [
  {
    id: 1, situacao: 2,
    vencimento: iso(2026, 6, 7), dataEmissao: iso(2026, 6, 7),
    valor: 1200, categoriaNome: "Compras", contato: { id: 1, nome: "F1" },
  },
];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

describe("buildSalesDataset — gating de payables", () => {
  it("payables undefined: despesas, fornecedores e diagn\u00f3stico ficam null (mock + Demo)", () => {
    const ds = buildSalesDataset({ orders, payables: undefined });
    expect(ds.despesas).toBeNull();
    expect(ds.fornecedores).toBeNull();
    expect(ds.diagnostico).toBeNull();
    expect(ds.resumo.metrics.despesas).toBeUndefined(); // mock preenche na tela
    expect(ds.resumo.metrics.receitas).toBe(5000);
  });

  it("payables []: zeros reais e diagn\u00f3stico calculado (sem Demo indevido)", () => {
    const ds = buildSalesDataset({ orders, payables: [] });
    expect(ds.despesas).not.toBeNull();
    expect(ds.fornecedores).not.toBeNull();
    expect(ds.diagnostico).not.toBeNull();
    expect(ds.resumo.metrics.despesas).toBe(0);
    expect(ds.resumo.metrics.resultado).toBe(5000);
    expect(ds.fornecedores.metrics.saldoPagar).toBe(0);
  });

  it("payables com itens: dataset completo real", () => {
    const ds = buildSalesDataset({ orders, payables: payablesComItens });
    expect(ds.despesas).not.toBeNull();
    expect(ds.resumo.metrics.despesas).toBe(1200);
    expect(ds.resumo.metrics.resultado).toBe(3800);
    expect(Array.isArray(ds.alertas.list)).toBe(true);
    expect(ds.diagnostico.score).toBeGreaterThanOrEqual(0);
  });
});

/* ====================================================================================
 * COBERTURA PRÓPRIA DAS CONTAS A PAGAR.
 *
 * Pedidos e contas a pagar vêm de snapshots distintos: coverage.payables pode
 * fechar noutro mês. O mês âncora dos alertas MENSAIS de despesas tem de seguir
 * essa cobertura, não o mês da receita (financeiro.monthKey).
 *
 * Datas civis "YYYY-MM-DD" de propósito: o dia 1 tem de continuar no seu mês.
 * ==================================================================================== */
describe("buildSalesDataset — mês âncora das contas a pagar", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: fornecedor, nome: fornecedor },
  });

  const ordersMJJ = [ord(1, "2026-05-10", 50000), ord(2, "2026-06-10", 60000), ord(3, "2026-07-05", 900)];
  // Cada mês tem uma categoria e um fornecedor próprios: o texto do alerta
  // identifica sem ambiguidade qual mês foi escolhido.
  const payablesMJJ = [
    pg(1, "2026-05-01", 2000, "Serviços", "Forn A"),
    pg(2, "2026-06-01", 9500, "Aluguel", "Forn B"),
    pg(3, "2026-07-01", 5000, "Compras", "Forn C"),
  ];
  // Pedidos fechados até junho em todos os cenários; só a cobertura dos payables muda.
  const base = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const alertaDespesa = (ds, id) => ds.alertas.list.find((a) => a.id === id);

  it("A. payables fechados até julho: despesas usam julho, vendas continuam em junho", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ, payables: payablesMJJ,
      coverage: { ...base, payables: { closedThroughMonth: "2026-07" } },
    });
    expect(ds.financeiro.monthKey).toBe("2026-06");           // receita/DRE
    expect(ds.financeiro.payables.monthKey).toBe("2026-07");  // contas a pagar
    expect(ds.financeiro.payables.previousMonthKey).toBe("2026-06");
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("Compras");
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn C");
  });

  it("B. payables fechados só até maio: despesas usam maio, nunca junho", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ, payables: payablesMJJ,
      coverage: { ...base, payables: { closedThroughMonth: "2026-05" } },
    });
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.monthKey).toBe("2026-05");
    const cat = alertaDespesa(ds, "d-cat-conc");
    expect(cat.description).toContain("Serviços");
    expect(cat.description).not.toContain("Aluguel"); // junho
    expect(cat.description).not.toContain("Compras"); // julho
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn A");
  });

  it("C. mesma cobertura para ambos: comportamento preservado (junho)", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ, coverage: base });
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.comparable).toBe(true);
    expect(ds.financeiro.payables.partial).toBe(false);
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("Aluguel");
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn B");
    // Julho tem títulos e seria o "último mês com títulos": não pode ser escolhido.
    expect(alertaDespesa(ds, "d-cat-conc").description).not.toContain("Compras");
  });

  it("D. sem payables: contexto vazio e nenhum alerta mensal de despesas", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: undefined, coverage: base });
    expect(ds.financeiro.payables.monthKey).toBeNull();
    expect(ds.financeiro.payables.comparable).toBe(false);
    expect(ds.alertas.list.some((a) => a.id.startsWith("d-"))).toBe(false);
  });

  it("a comparabilidade das despesas não herda a da receita", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ, coverage: base });
    // Sem CMV nem frete, a receita líquida é indisponível => receita não comparável.
    expect(ds.financeiro.comparable).toBe(false);
    // As contas a pagar de maio e junho estão ambas fechadas => comparáveis.
    expect(ds.financeiro.payables.comparable).toBe(true);
    expect(alertaDespesa(ds, "d-subida-mes")).toBeDefined(); // 2.000 -> 9.500
  });

  it("sem nenhum mês fechado de payables, usa o parcial e declara-o", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ,
      payables: [pg(1, "2026-07-01", 5000, "Compras", "Forn C")], // só julho
      coverage: { ...base, payables: { closedThroughMonth: "2026-06" } },
    });
    expect(ds.financeiro.payables.monthKey).toBe("2026-07");
    expect(ds.financeiro.payables.partial).toBe(true);
    expect(ds.financeiro.payables.comparable).toBe(false);
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("mês em curso");
    expect(ds.alertas.list.some((a) => a.id === "d-subida-mes")).toBe(false);
    expect(ds.alertas.list.some((a) => a.id === "d-cat-mom")).toBe(false);
  });

  it("sem coverage injetada usa a da empresa ativa (contrato preservado)", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ });
    expect(ds.financeiro.payables.monthKey).toBe("2026-06"); // closedThroughMonth da Overcel
  });
});

describe("buildSalesDataset — campos mortos removidos", () => {
  it("alertas exp\u00f5e apenas { list } e o dataset n\u00e3o tem diagnostics", () => {
    const ds = buildSalesDataset({ orders, payables: payablesComItens });
    expect("metrics" in ds.alertas).toBe(false);
    expect("diagnostics" in ds).toBe(false);
  });
});

describe("buildSalesDataset — allOpenInvoices e saldo restante (fornecedores)", () => {
  const orders2 = [];
  const parcialPay = {
    id: 1, situacao: 1, valor: 1000, saldo: 200,
    vencimento: iso(2026, 6, 20), dataEmissao: iso(2026, 6, 1),
    contato: { id: 1, nome: "F, Lda" }, numeroDocumento: "FC 1",
  };
  const parcialRec = {
    id: 2, situacao: 1, valor: 800, saldo: 300,
    vencimento: iso(2026, 6, 22), dataEmissao: iso(2026, 6, 2),
    contato: { id: 2, nome: "C, Lda" }, numeroDocumento: "FT 1",
  };

  it("fornecedores expõe allOpenInvoices e usa saldo restante no valor", () => {
    const ds = buildSalesDataset({ orders: orders2, payables: [parcialPay] });
    expect(Array.isArray(ds.fornecedores.allOpenInvoices)).toBe(true);
    expect(ds.fornecedores.allOpenInvoices[0].valor).toBe(200); // saldo, não 1000
    expect(ds.fornecedores.metrics.saldoPagar).toBe(200);       // pendingPayables usa saldo
  });

  it("recebíveis expõe allOpenInvoices com saldo restante", () => {
    const ds = buildSalesDataset({ orders: orders2, payables: undefined, receivables: [parcialRec] });
    expect(Array.isArray(ds.recebiveis.allOpenInvoices)).toBe(true);
    expect(ds.recebiveis.allOpenInvoices[0].valor).toBe(300);
    expect(ds.recebiveis.metrics.saldoReceber).toBe(300);
  });

  it("openInvoices continua limitado a 20; allOpenInvoices não", () => {
    const many = [];
    for (let i = 0; i < 25; i++) many.push({
      id: i + 1, situacao: 1, valor: 100, saldo: 100,
      vencimento: iso(2026, 6, (i % 27) + 1), dataEmissao: iso(2026, 6, 1),
      contato: { id: i + 1, nome: `F${i}` }, numeroDocumento: `FC ${i}`,
    });
    const ds = buildSalesDataset({ orders: orders2, payables: many });
    expect(ds.fornecedores.openInvoices.length).toBe(20);
    expect(ds.fornecedores.allOpenInvoices.length).toBe(25);
  });
});