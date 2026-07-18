// Testes do motor determinístico do Chat Financeiro.
// Contratos centrais: responder com dados reais, limitar-se com honestidade
// e nunca inventar números no fallback.

import { describe, it, expect } from "vitest";
import { answerQuestion, buildWelcome, SUPPORTED_QUESTIONS } from "./chatEngine.js";

const salesFixture = {
  resumo: { metrics: { receitas: 5000, receitasDelta: -50, despesas: 3500, despesasDelta: 250, resultado: 1500, resultadoDelta: null } },
  diagnostico: {
    estado: "Aten\u00e7\u00e3o", score: 57, scoreLabel: "Regular",
    prioridadeMaxima: "Contas a pagar vencidas",
    resumoExecutivo: "No m\u00eas em an\u00e1lise, a empresa faturou 5000,00 \u20ac...",
    penalizacoes: [
      { pts: 15, motivo: "Quebra de fatura\u00e7\u00e3o face ao m\u00eas anterior" },
      { pts: 15, motivo: "Valor vencido elevado face \u00e0s despesas do m\u00eas" },
    ],
    problemas: [{ id: "pr-vencidas", severidade: "danger", titulo: "Contas a pagar vencidas", descricao: "6 t\u00edtulos...", impacto: -31029.6 }],
    acoes: [{ titulo: "Regularizar contas vencidas", prazo: "15 dias", descricao: "Priorizar o pagamento..." }],
    mudancasUltimoMes: [{ label: "Fatura\u00e7\u00e3o", valor: "-50%", tendencia: "down", detalhe: "vs m\u00eas anterior" }],
  },
  fornecedores: {
    metrics: { saldoPagar: 3500, faturasAbertasPagar: 2 },
    top: [{ nome: "Fornecedor X", faturasAbertas: 2, saldo: 3500 }],
    openInvoices: [{ fornecedor: "Fornecedor X", vencimento: "01/07/2026", valor: 2000, diasAtraso: 14 }],
  },
  despesas: { metrics: { totalMes: 3500 }, byCategory: [{ name: "Compras", value: 3000 }] },
  clientes: { top: [{ nome: "Cliente A", faturasAbertas: 1, saldo: 5000 }], concentracao: 93.3 },
  alertas: { list: [{ severity: "danger", title: "Contas a pagar vencidas", description: "..." }] },
};

describe("pergunta sobre o score", () => {
  it("responde com o score real e as penaliza\u00e7\u00f5es ponto a ponto", () => {
    const r = answerQuestion("Porque \u00e9 que o meu score est\u00e1 baixo?", salesFixture);
    expect(r.content).toContain("57/100");
    expect(r.highlights).toBeDefined();
    expect(r.highlights.some((h) => h.includes("-15 pts") && /Quebra de fatura\u00e7\u00e3o/.test(h))).toBe(true);
    expect(r.highlights).toHaveLength(salesFixture.diagnostico.penalizacoes.length);
  });

  it("sem diagn\u00f3stico dispon\u00edvel responde limita\u00e7\u00e3o, sem inventar score", () => {
    const r = answerQuestion("Porque \u00e9 que o meu score est\u00e1 baixo?", { resumo: salesFixture.resumo, diagnostico: null });
    expect(r.content).toMatch(/contas a pagar reais/i);
    expect(r.content).not.toMatch(/\d+\/100/);
  });
});

describe("limita\u00e7\u00f5es honestas", () => {
  it("cashflow, previs\u00e3o e saldo banc\u00e1rio devolvem a limita\u00e7\u00e3o de dados banc\u00e1rios", () => {
    for (const q of [
      "Qual a previs\u00e3o de cashflow para os pr\u00f3ximos meses?",
      "Qual \u00e9 o meu saldo banc\u00e1rio?",
      "Consegues prever o pr\u00f3ximo trimestre?",
    ]) {
      const r = answerQuestion(q, salesFixture);
      expect(r.content).toMatch(/dados banc\u00e1rios/i);
      expect(r.content).toMatch(/ainda n\u00e3o consigo/i);
      expect(r.table).toBeUndefined();
      expect(r.metrics).toBeUndefined();
    }
  });

  it("IVA e impostos devolvem a limita\u00e7\u00e3o fiscal", () => {
    const r = answerQuestion("Tenho IVA a pagar ou a receber?", salesFixture);
    expect(r.content).toMatch(/dados fiscais/i);
    expect(r.content).toMatch(/n\u00e3o tenho/i);
  });
});

describe("fallback", () => {
  it("pergunta fora do repert\u00f3rio lista o que sabe responder, sem inventar n\u00fameros", () => {
    const r = answerQuestion("Qual \u00e9 a capital de Fran\u00e7a?", salesFixture);
    expect(r.content).toMatch(/n\u00e3o consigo responder/i);
    expect(r.highlights).toEqual(SUPPORTED_QUESTIONS);
    expect(r.content).not.toContain("\u20ac");
    expect(r.table).toBeUndefined();
    expect(r.metrics).toBeUndefined();
  });
});

describe("boas-vindas", () => {
  it("cita o estado real quando h\u00e1 diagn\u00f3stico", () => {
    const w = buildWelcome(salesFixture);
    expect(w.content).toContain("Aten\u00e7\u00e3o");
    expect(w.content).toContain("57/100");
  });

  it("sem diagn\u00f3stico avisa a limita\u00e7\u00e3o em vez de citar score", () => {
    const w = buildWelcome({ resumo: salesFixture.resumo });
    expect(w.content).not.toMatch(/\d+\/100/);
    expect(w.content).toMatch(/contas a pagar/i);
  });
});
