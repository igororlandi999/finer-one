// Regressões da composição da vista da página Alertas (microfase C1).
//
// B1 — com fonte real, nenhum alerta de mockData entra na lista.
// B5 — o selo Demo marca o que é demonstrativo, não o contrário.
// B6 — em modo real as contagens saem da lista real, sem fallback do mock.

import { describe, it, expect } from "vitest";
import { composeAlerts, alertsViewModel, isRealSource } from "./alertsView.js";

// Os 6 alertas reais que a Overcel produz hoje.
const REAIS = [
  { id: "v-ticket-info", severity: "info", category: "Faturação", title: "Ticket médio" },
  { id: "d-vencidas", severity: "danger", category: "Despesas", title: "Contas a pagar vencidas" },
  { id: "d-proximos7", severity: "warning", category: "Despesas", title: "Pagamentos a vencer em breve" },
  { id: "d-pendentes", severity: "info", category: "Despesas", title: "Muitas contas pendentes" },
  { id: "d-cat-conc", severity: "warning", category: "Despesas", title: "Categoria de despesa concentrada" },
  { id: "d-forn-alto", severity: "info", category: "Despesas", title: "Concentração num fornecedor" },
];

// Os 7 que a página injetava por cima dos reais, e os 4 que já eram filtrados.
const MOCK = [
  { id: "ax1", severity: "danger", category: "Liquidez", title: "Risco de liquidez" },
  { id: "ax2", severity: "danger", category: "Receitas", title: "Cliente com atraso recorrente" },
  { id: "ax3", severity: "warning", category: "Despesas", title: "Despesa acima do habitual" },
  { id: "ax4", severity: "warning", category: "Margem", title: "Margem bruta em queda" },
  { id: "ax5", severity: "warning", category: "Recebimentos", title: "Prazo médio a aumentar" },
  { id: "ax6", severity: "warning", category: "Tesouraria", title: "Pico de pagamentos em breve" },
  { id: "ax7", severity: "info", category: "Fiscal", title: "Próxima entrega de IVA" },
  { id: "ax8", severity: "info", category: "Crescimento", title: "Cliente novo recorrente" },
  { id: "ax9", severity: "info", category: "Recebimentos", title: "Recebimento confirmado" },
  { id: "ax10", severity: "success", category: "Resultado", title: "Resultado em crescimento" },
  { id: "ax11", severity: "success", category: "Liquidez", title: "Saldo confortável" },
];
const MOCK_METRICS = { criticos: 2, atencao: 4, informativos: 5, resolvidos: 12 };

const INJETADOS_ANTES = ["ax1", "ax4", "ax5", "ax6", "ax7", "ax9", "ax11"];

describe("isRealSource", () => {
  it("só é real com source api E lista presente", () => {
    expect(isRealSource("api", REAIS)).toBe(true);
    expect(isRealSource("api", [])).toBe(true);      // zero alertas reais é um facto
    expect(isRealSource("api", null)).toBe(false);   // fonte falhou
    expect(isRealSource("mock", REAIS)).toBe(false);
  });
});

describe("composeAlerts — B1: nenhum mock com fonte real", () => {
  it("com API, a lista é exatamente a lista real", () => {
    const out = composeAlerts(REAIS, MOCK, "api");
    expect(out).toEqual(REAIS);
    expect(out).toHaveLength(6);
  });

  it("nenhum dos 7 alertas antes injetados sobrevive", () => {
    const ids = composeAlerts(REAIS, MOCK, "api").map((a) => a.id);
    for (const id of INJETADOS_ANTES) expect(ids).not.toContain(id);
  });

  it("os 6 alertas reais da Overcel continuam todos presentes", () => {
    const ids = composeAlerts(REAIS, MOCK, "api").map((a) => a.id);
    expect(ids).toEqual([
      "v-ticket-info", "d-vencidas", "d-proximos7", "d-pendentes", "d-cat-conc", "d-forn-alto",
    ]);
  });

  it("lista real vazia continua vazia: não é preenchida com ficção", () => {
    expect(composeAlerts([], MOCK, "api")).toEqual([]);
  });

  it("modo mock mantém o comportamento demonstrativo completo", () => {
    expect(composeAlerts(null, MOCK, "mock")).toEqual(MOCK);
    expect(composeAlerts(null, MOCK, "mock")).toHaveLength(11);
  });

  it("fonte api mas lista ausente (falha) cai no demonstrativo, sem rebentar", () => {
    expect(composeAlerts(null, MOCK, "api")).toEqual(MOCK);
  });
});

describe("alertsViewModel — B5 e B6", () => {
  it("com fonte real: sem selo Demo e contagens da lista real", () => {
    const vm = alertsViewModel({
      salesList: REAIS, mockList: MOCK, mockMetrics: MOCK_METRICS, source: "api",
    });
    expect(vm.isDemo).toBe(false);
    expect(vm.list).toHaveLength(6);
    expect(vm.metrics).toEqual({ criticos: 1, atencao: 2, informativos: 3, resolvidos: 0 });
  });

  it("B6: zero positivos mostra 0, nunca os 12 do mock", () => {
    const vm = alertsViewModel({
      salesList: REAIS, mockList: MOCK, mockMetrics: MOCK_METRICS, source: "api",
    });
    expect(vm.metrics.resolvidos).toBe(0);
    expect(vm.metrics.resolvidos).not.toBe(MOCK_METRICS.resolvidos);
  });

  it("com fonte mock: selo Demo e métricas demonstrativas intactas", () => {
    const vm = alertsViewModel({
      salesList: null, mockList: MOCK, mockMetrics: MOCK_METRICS, source: "mock",
    });
    expect(vm.isDemo).toBe(true);
    expect(vm.metrics).toEqual(MOCK_METRICS);
    expect(vm.list).toHaveLength(11);
  });

  it("as contagens reais somam sempre o comprimento da lista", () => {
    const vm = alertsViewModel({
      salesList: REAIS, mockList: MOCK, mockMetrics: MOCK_METRICS, source: "api",
    });
    const { criticos, atencao, informativos, resolvidos } = vm.metrics;
    expect(criticos + atencao + informativos + resolvidos).toBe(vm.list.length);
  });

  it("lista real vazia: zero em tudo, sem Demo e sem fallback", () => {
    const vm = alertsViewModel({
      salesList: [], mockList: MOCK, mockMetrics: MOCK_METRICS, source: "api",
    });
    expect(vm.isDemo).toBe(false);
    expect(vm.metrics).toEqual({ criticos: 0, atencao: 0, informativos: 0, resolvidos: 0 });
  });
});