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
