// Testes do transporte de recebíveis em loadFinerData: a distinção entre
// "ausência de snapshot" (debug.fonte === "snapshot-vazio" => receivables undefined
// => mock + Demo) e "snapshot com zero títulos" (debug.fonte === "snapshot" + data:[]
// => zero real). Mocka api.js para não tocar na rede.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock do cliente HTTP: cada teste define o comportamento de apiGet por recurso.
const state = { receivablesResponse: null, receivablesThrows: null };

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      const recurso = opts?.params?.recurso;
      if (recurso === "despesas") return { data: [] };            // despesas: irrelevante aqui
      if (recurso === "recebiveis") {
        if (state.receivablesThrows) throw state.receivablesThrows;
        return state.receivablesResponse;
      }
      return { data: [] };                                        // pedidos/vendas
    }),
  };
});

import { loadFinerData } from "../services/blingDataService.js";

beforeEach(() => { state.receivablesResponse = null; state.receivablesThrows = null; });
afterEach(() => { vi.clearAllMocks(); });

describe("loadFinerData — transporte de recebíveis", () => {
  it('fonte "snapshot-vazio" => receivables undefined => recebiveis null (mock + Demo)', async () => {
    state.receivablesResponse = { data: [], debug: { fonte: "snapshot-vazio" } };
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.recebiveis).toBeNull();       // null => tela usa mock + selo Demo
    // não derruba o resto:
    expect(sales.receitas).not.toBeNull();
    expect(sales.orders).toBeDefined();
  });

  it('fonte "snapshot" + data:[] => zero real (recebiveis não-null, métricas a zero)', async () => {
    state.receivablesResponse = { data: [], debug: { fonte: "snapshot" } };
    const { sales } = await loadFinerData();
    expect(sales.recebiveis).not.toBeNull();
    expect(sales.recebiveis.metrics.saldoReceber).toBe(0);
    expect(sales.recebiveis.metrics.faturasAbertasReceber).toBe(0);
    expect(sales.recebiveis.top).toEqual([]);
    expect(sales.recebiveis.openInvoices).toEqual([]);
  });

  it("erro de rede em recebíveis => receivables undefined, resto intacto", async () => {
    state.receivablesThrows = new Error("network");
    const { sales } = await loadFinerData();
    expect(sales.recebiveis).toBeNull();
    expect(sales.receitas).not.toBeNull();
  });

  it('fonte "snapshot" com títulos reais => métricas preenchidas', async () => {
    state.receivablesResponse = {
      data: [{ id: 1, situacao: 1, vencimento: "2030-01-01", valor: 500, saldo: 500, contato: { id: 9, nome: "Cliente Z" } }],
      debug: { fonte: "snapshot" },
    };
    const { sales } = await loadFinerData();
    expect(sales.recebiveis.metrics.saldoReceber).toBe(500);
    expect(sales.recebiveis.top[0].nome).toBe("Cliente Z");
  });
});
