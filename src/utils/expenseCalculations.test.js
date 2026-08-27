// Testes de saldo restante em fornecedores (conta parcialmente paga).
// Garante que payableOpenBalance e pendingPayables usam o saldo, não o valor original.

import { describe, it, expect } from "vitest";
import {
  payableOpenBalance,
  pendingPayables,
  suppliersByOpenBalance,
  overduePayables,
} from "./expenseCalculations.js";

const parcial = { id: 1, situacao: 1, valor: 1000, saldo: 200, contato: { id: 5, nome: "F, Lda" }, vencimento: "2030-01-01" };
const cheio = { id: 2, situacao: 1, valor: 500, saldo: null, contato: { id: 6, nome: "G, Lda" }, vencimento: "2030-01-01" };

describe("payableOpenBalance — saldo restante", () => {
  it("usa saldo quando existe (conta parcialmente paga)", () => {
    expect(payableOpenBalance(parcial)).toBe(200);
  });
  it("cai para valor quando saldo é null", () => {
    expect(payableOpenBalance(cheio)).toBe(500);
  });
  it("zero defensivo para entrada inválida", () => {
    expect(payableOpenBalance(null)).toBe(0);
    expect(payableOpenBalance({})).toBe(0);
  });
});

describe("pendingPayables — soma o saldo restante", () => {
  it("conta parcial soma 200 (não 1000)", () => {
    const r = pendingPayables([parcial]);
    expect(r.valor).toBe(200);
    expect(r.qtd).toBe(1);
  });
  it("mistura parcial + cheio", () => {
    const r = pendingPayables([parcial, cheio]);
    expect(r.valor).toBe(700); // 200 + 500
    expect(r.qtd).toBe(2);
  });
});

describe("suppliersByOpenBalance — já usava saldo restante", () => {
  it("top usa o saldo restante da conta parcial", () => {
    const top = suppliersByOpenBalance([parcial, cheio]);
    const f = top.find((t) => t.nome === "F, Lda");
    expect(f.saldo).toBe(200);
  });
});

/* ====================================================================================
 * overduePayables (D5) — títulos ABERTOS cujo vencimento já passou.
 *
 * A regra "está vencido?" é reutilizada de payableDaysOverdue; estes testes fixam o
 * contrato visível: limite do dia, situações que contam, e base de valor (saldo).
 * ==================================================================================== */
describe("overduePayables — contas em atraso", () => {
  const HOJE = new Date(2026, 7, 14, 12, 0, 0); // 14/08/2026
  const t = (id, situacao, vencimento, valor, saldo = null) => ({
    id, situacao, vencimento, valor, saldo, contato: { id, nome: `F${id}` },
  });

  it("aberto e vencido ONTEM conta", () => {
    const r = overduePayables([t(1, 1, "2026-08-13", 500)], HOJE);
    expect(r).toEqual({ valor: 500, qtd: 1 });
  });

  it("vence HOJE não conta (o dia ainda não acabou)", () => {
    expect(overduePayables([t(1, 1, "2026-08-14", 500)], HOJE)).toEqual({ valor: 0, qtd: 0 });
  });

  it("vence AMANHÃ não conta", () => {
    expect(overduePayables([t(1, 1, "2026-08-15", 500)], HOJE)).toEqual({ valor: 0, qtd: 0 });
  });

  it("título PAGO não conta, mesmo vencido", () => {
    expect(overduePayables([t(1, 2, "2026-01-10", 500)], HOJE)).toEqual({ valor: 0, qtd: 0 });
  });

  it("título CANCELADO não conta", () => {
    expect(overduePayables([t(1, 5, "2026-01-10", 500)], HOJE)).toEqual({ valor: 0, qtd: 0 });
  });

  it("sem vencimento não conta", () => {
    expect(overduePayables([t(1, 1, null, 500)], HOJE)).toEqual({ valor: 0, qtd: 0 });
  });

  it("usa o SALDO em aberto, não o valor original", () => {
    const r = overduePayables([t(1, 1, "2026-06-10", 1000, 200)], HOJE);
    expect(r.valor).toBe(200);
    expect(r.valor).not.toBe(1000);
  });

  it("saldo null cai para o valor do título", () => {
    expect(overduePayables([t(1, 1, "2026-06-10", 1000, null)], HOJE).valor).toBe(1000);
  });

  it("o now injetado manda: o mesmo título muda de estado entre duas datas", () => {
    const p = [t(1, 1, "2026-08-20", 700)];
    expect(overduePayables(p, new Date(2026, 7, 14, 12, 0, 0))).toEqual({ valor: 0, qtd: 0 });
    expect(overduePayables(p, new Date(2026, 7, 25, 12, 0, 0))).toEqual({ valor: 700, qtd: 1 });
  });

  it("hora do dia não altera o resultado (comparação por início do dia)", () => {
    const p = [t(1, 1, "2026-08-13", 500)];
    expect(overduePayables(p, new Date(2026, 7, 14, 0, 0, 1)).qtd).toBe(1);
    expect(overduePayables(p, new Date(2026, 7, 14, 23, 59, 59)).qtd).toBe(1);
  });

  it("lista vazia e fonte ausente devolvem ZERO REAL, nunca null", () => {
    expect(overduePayables([], HOJE)).toEqual({ valor: 0, qtd: 0 });
    expect(overduePayables(null, HOJE)).toEqual({ valor: 0, qtd: 0 });
    expect(overduePayables(undefined, HOJE).valor).not.toBeNull();
  });

  it("soma vários títulos de meses diferentes: é GLOBAL, não de um mês", () => {
    const r = overduePayables([
      t(1, 1, "2026-03-22", 10771.92),
      t(2, 1, "2026-04-23", 10925.35),
      t(3, 1, "2026-05-20", 4285.97),
      t(4, 1, "2026-06-04", 2186.36),
      t(5, 1, "2026-09-01", 999),   // futuro, fora
      t(6, 2, "2026-01-05", 888),   // pago, fora
    ], HOJE);
    expect(r).toEqual({ valor: 28169.60, qtd: 4 });
  });
});