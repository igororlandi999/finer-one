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