// Testes dos cálculos de Recebíveis e do gating hasReceivables no dataset.
// Espelham a semântica já testada para payables: undefined = ausência => mock/Demo;
// [] = zero títulos reais => zeros reais sem selo.

import { describe, it, expect } from "vitest";

import {
  billableReceivables,
  receivableStatus,
  totalReceivables,
  openReceivables,
  pendingReceivables,
  receivablesDueWithin,
  receivableDaysOverdue,
  clientsByOpenBalance,
} from "./receivableCalculations.js";

import { buildSalesDataset, normalizeReceivable } from "../services/blingDataService.js";

// Helper: data ISO deslocada em dias a partir de hoje.
function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const rAberto = { id: 1, situacao: 1, vencimento: isoOffset(3), valor: 100, saldo: 100, contato: { id: 10, nome: "Cliente A" } };
const rVencido = { id: 2, situacao: 1, vencimento: isoOffset(-10), valor: 50, saldo: 50, contato: { id: 11, nome: "Cliente B" } };
const rRecebido = { id: 3, situacao: 2, vencimento: isoOffset(-30), valor: 200, saldo: 0, contato: { id: 10, nome: "Cliente A" } };
const rCancelado = { id: 4, situacao: 5, vencimento: isoOffset(-5), valor: 999, saldo: 999, contato: { id: 12, nome: "Cliente C" } };

describe("receivableCalculations", () => {
  it("billableReceivables inclui 1 e 2, exclui outras situações", () => {
    const list = billableReceivables([rAberto, rVencido, rRecebido, rCancelado]);
    expect(list.map((r) => r.id).sort()).toEqual([1, 2, 3]);
  });

  it("totalReceivables soma só billable (exclui cancelado)", () => {
    expect(totalReceivables([rAberto, rVencido, rRecebido, rCancelado])).toBe(350);
  });

  it("receivableStatus classifica recebida/atraso/pendente", () => {
    expect(receivableStatus(rRecebido)).toBe("recebida");
    expect(receivableStatus(rVencido)).toBe("atraso");
    expect(receivableStatus(rAberto)).toBe("pendente");
  });

  it("openReceivables e pendingReceivables contam só situacao 1", () => {
    expect(openReceivables([rAberto, rVencido, rRecebido]).map((r) => r.id).sort()).toEqual([1, 2]);
    expect(pendingReceivables([rAberto, rVencido, rRecebido])).toEqual({ valor: 150, qtd: 2 });
  });

  it("receivablesDueWithin conta abertos que vencem na janela", () => {
    expect(receivablesDueWithin([rAberto, rVencido], 7)).toBe(1); // só o rAberto (vence em +3)
  });

  it("receivableDaysOverdue: 0 se não vencido, positivo se vencido", () => {
    const now = new Date(2026, 6, 21, 12, 0, 0);

    const aberto = {
      ...rAberto,
      vencimento: new Date(2026, 6, 24, 12, 0, 0),
    };

    const vencido = {
      ...rVencido,
      vencimento: new Date(2026, 6, 11, 12, 0, 0),
    };

    expect(receivableDaysOverdue(aberto, now)).toBe(0);
    expect(receivableDaysOverdue(vencido, now)).toBe(10);
  });

  it("clientsByOpenBalance agrega por nome, maior saldo primeiro", () => {
    const top = clientsByOpenBalance([rAberto, rVencido]);
    expect(top[0]).toMatchObject({ nome: "Cliente A", faturasAbertas: 1, saldo: 100 });
    expect(top[1]).toMatchObject({ nome: "Cliente B", faturasAbertas: 1, saldo: 50 });
  });

  it("clientsByOpenBalance NÃO agrupa homónimos com ids diferentes", () => {
    const a1 = { id: 10, situacao: 1, vencimento: isoOffset(2), valor: 100, saldo: 100, contato: { id: 1, nome: "Silva, Lda" } };
    const a2 = { id: 11, situacao: 1, vencimento: isoOffset(2), valor: 300, saldo: 300, contato: { id: 2, nome: "Silva, Lda" } };
    const top = clientsByOpenBalance([a1, a2]);
    expect(top).toHaveLength(2); // dois clientes distintos, mesmo nome
    expect(top.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(top[0]).toMatchObject({ id: 2, nome: "Silva, Lda", saldo: 300 });
  });

  it("clientsByOpenBalance usa saldo restante (não o valor cheio)", () => {
    const r = { id: 20, situacao: 1, vencimento: isoOffset(2), valor: 1000, saldo: 200, contato: { id: 5, nome: "Parcial, Lda" } };
    expect(clientsByOpenBalance([r])[0].saldo).toBe(200);
  });
});

describe("normalizeReceivable — tolerância a shape novo e legado", () => {
  it("lê categoria do objeto (shape novo)", () => {
    const n = normalizeReceivable({ id: 1, valor: 10, categoria: { id: 40, nome: "Vendas" }, contato: { id: 1, nome: "X" } });
    expect(n.categoriaId).toBe(40);
    expect(n.categoriaNome).toBe("Vendas");
  });

  it("lê categoria da raiz (shape legado)", () => {
    const n = normalizeReceivable({ id: 2, valor: 20, categoriaId: 41, categoriaNome: "Serviços" });
    expect(n.categoriaId).toBe(41);
    expect(n.categoriaNome).toBe("Serviços");
  });

  it("defaults defensivos para nulos", () => {
    const n = normalizeReceivable({ id: 3 });
    expect(n.valor).toBe(0);
    expect(n.contato).toEqual({ id: null, nome: null });
    expect(n.formaPagamento).toEqual({ id: null, nome: null });
  });
});

describe("buildSalesDataset — gating de recebiveis", () => {
  const orders = [];

  it("receivables undefined => recebiveis: null (lado Clientes usa mock)", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, receivables: undefined });
    expect(ds.recebiveis).toBeNull();
  });

  it("receivables [] => dado real de zero títulos (não null)", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, receivables: [] });
    expect(ds.recebiveis).not.toBeNull();
    expect(ds.recebiveis.metrics).toEqual({
      saldoReceber: 0,
      saldoReceberDelta: null,
      faturasAbertasReceber: 0,
      faturasAbertasReceberVencer7: 0,
    });
    expect(ds.recebiveis.top).toEqual([]);
    expect(ds.recebiveis.openInvoices).toEqual([]);
  });

  it("receivables reais => métricas e top preenchidos", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, receivables: [rAberto, rVencido, rRecebido] });
    expect(ds.recebiveis.metrics.saldoReceber).toBe(150);
    expect(ds.recebiveis.metrics.faturasAbertasReceber).toBe(2);
    expect(ds.recebiveis.top[0].nome).toBe("Cliente A");
    expect(ds.recebiveis.openInvoices).toHaveLength(2);
  });

  it("openInvoices usa saldo restante (valor 1000, saldo 200 => 200)", () => {
    const parcial = { id: 99, situacao: 1, vencimento: isoOffset(2), valor: 1000, saldo: 200, contato: { id: 7, nome: "Parcial, Lda" } };
    const ds = buildSalesDataset({ orders, payables: undefined, receivables: [parcial] });
    expect(ds.recebiveis.openInvoices).toHaveLength(1);
    expect(ds.recebiveis.openInvoices[0].valor).toBe(200);
  });
});
