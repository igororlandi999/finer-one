// Testes dos alertas reais. Data simulada fixa: "hoje" = 15/07/2026.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesAlerts, buildExpenseAlerts } from "./alertsEngine.js";

const HOJE = new Date(2026, 6, 15, 12, 0, 0);
const iso = (y, m, d) => new Date(y, m, d).toISOString();

const order = (id, m, d, total, cid = 1, nome = "Cliente A") => ({
  id, date: iso(2026, m, d), total, status: "recebida", client: { id: cid, name: nome }, items: [],
});
const payable = (id, situacao, m, d, valor, extra = {}) => ({
  id, situacao,
  vencimento: iso(2026, m, d),
  dataEmissao: iso(2026, m, d),
  valor,
  categoriaNome: "Compras",
  contato: { id, nome: "Fornecedor X" },
  ...extra,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

describe("buildSalesAlerts — quebra de fatura\u00e7\u00e3o", () => {
  it("gera alerta quando a fatura\u00e7\u00e3o cai forte face ao m\u00eas anterior", () => {
    const orders = [
      order(1, 6, 5, 2000),   // julho: 2.000
      order(2, 5, 5, 10000),  // junho: 10.000 => queda de 80%
    ];
    const alerts = buildSalesAlerts(orders);
    expect(alerts.some((a) => /quebra de fatura\u00e7\u00e3o/i.test(a.title))).toBe(true);
  });

  it("n\u00e3o gera alerta de quebra quando a fatura\u00e7\u00e3o cresce", () => {
    const orders = [
      order(1, 6, 5, 12000),
      order(2, 5, 5, 10000),
    ];
    const alerts = buildSalesAlerts(orders);
    expect(alerts.some((a) => /quebra de fatura\u00e7\u00e3o/i.test(a.title))).toBe(false);
  });
});

describe("buildExpenseAlerts — contas a pagar", () => {
  it("gera d-vencidas quando existe t\u00edtulo aberto com vencimento no passado", () => {
    const payables = [
      payable(1, 1, 6, 1, 5000), // aberto, venceu 01/07 (antes de 15/07)
      payable(2, 2, 6, 10, 1000), // pago: n\u00e3o conta como vencido
    ];
    const alerts = buildExpenseAlerts(payables);
    const vencidas = alerts.find((a) => a.id === "d-vencidas");
    expect(vencidas).toBeDefined();
    expect(vencidas.severity).toBe("danger");
    expect(vencidas.description).toContain("5000,00");
  });

  it("gera d-proximos7 quando h\u00e1 t\u00edtulo aberto a vencer nos pr\u00f3ximos 7 dias", () => {
    const payables = [
      payable(1, 1, 6, 18, 2500), // aberto, vence 18/07 (em 3 dias)
    ];
    const alerts = buildExpenseAlerts(payables);
    const proximos = alerts.find((a) => a.id === "d-proximos7");
    expect(proximos).toBeDefined();
    expect(proximos.severity).toBe("warning");
  });

  it("t\u00edtulo aberto com vencimento distante n\u00e3o gera vencidas nem proximos7", () => {
    const payables = [
      payable(1, 1, 7, 20, 2500), // vence 20/08: fora da janela
    ];
    const ids = buildExpenseAlerts(payables).map((a) => a.id);
    expect(ids).not.toContain("d-vencidas");
    expect(ids).not.toContain("d-proximos7");
  });

  it("lista vazia devolve zero alertas (n\u00e3o inventar)", () => {
    expect(buildExpenseAlerts([])).toEqual([]);
    expect(buildExpenseAlerts(undefined)).toEqual([]);
  });
});
