// Testes de saldo restante em fornecedores (conta parcialmente paga).
// Garante que payableOpenBalance e pendingPayables usam o saldo, não o valor original.

import { describe, it, expect } from "vitest";
import {
  payableOpenBalance,
  pendingPayables,
  suppliersByOpenBalance,
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