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

describe("Chat — respostas a partir da DRE central", () => {
  const finDe = (over = {}) => ({
    monthKey: "2026-06",
    metrics: {
      monthKey: "2026-06",
      revenue: { net: 175566.72, gross: 206227.15 },
      cmv: { value: 116039.70, pctOfNetRevenue: 66.09 },
      operatingExpenses: { total: 8406.68, pctOfNetRevenue: 4.79 },
      profitability: {
        netResult: 522.50, netMarginPct: 0.30,
        ebitda: 51120.34, ebitdaMarginPct: 29.12,
        grossProfit: 59527.02, grossMarginPct: 33.91,
        availability: {},
      },
      ...over,
    },
    previous: null, comparable: false, emCurso: null,
  });
  const salesCom = (fin) => ({ ...salesFixture, financeiro: fin });

  it("A. 'qual foi o meu resultado?' responde o netResult da DRE e informa o mês", () => {
    const r = answerQuestion("qual foi o meu resultado?", salesCom(finDe()));
    expect(r.content).toContain("2026-06");
    expect(r.content).toContain("522,50");
    expect(r.content).toContain("resultado líquido");
  });

  it("B. sem CMV não responde pseudo-resultado e explica o limite", () => {
    const semCmv = finDe({ profitability: { netResult: null, netMarginPct: null, ebitda: null, availability: {} } });
    const r = answerQuestion("qual foi o meu lucro?", salesCom(semCmv));
    expect(r.content).toContain("não pode ser apurado");
    expect(r.content).toContain("CMV");
    expect(r.content).toContain("175.566,72"); // dá o que sabe: receita líquida
    expect(r.content).not.toMatch(/resultado líquido foi de/);
  });

  it("C. 'qual a minha margem?' usa netMarginPct", () => {
    const r = answerQuestion("qual a minha margem?", salesCom(finDe()));
    expect(r.content).toContain("margem líquida");
    expect(r.content).toContain("0,3%");
  });

  it("D. 'qual o meu ebitda?' usa o EBITDA da DRE", () => {
    const r = answerQuestion("qual o meu ebitda?", salesCom(finDe()));
    expect(r.content).toContain("51.120,34");
    expect(r.content).toContain("29,12%");
  });

  it("E. 'qual a minha receita líquida?' usa a receita líquida", () => {
    const r = answerQuestion("qual a minha receita liquida?", salesCom(finDe()));
    expect(r.content).toContain("175.566,72");
  });

  it("F. 'quanto tenho a pagar?' usa contas a pagar, não a DRE", () => {
    const r = answerQuestion("quanto tenho a pagar?", salesCom(finDe()));
    expect(r.content).toContain("contas a pagar");
    expect(r.content).toContain("tesouraria");
    expect(r.content).not.toContain("8.406,68"); // não é a despesa operacional da DRE
  });

  it("G. 'quanto gastei?' deixa explícito o conceito usado", () => {
    const r = answerQuestion("quanto gastei?", salesCom(finDe()));
    expect(r.content).toMatch(/contas a pagar|despesas operacionais/);
  });

  it("G2. 'qual a minha despesa operacional?' usa a DRE e dá o peso", () => {
    const r = answerQuestion("qual a minha despesa operacional?", salesCom(finDe()));
    expect(r.content).toContain("8.406,68");
    expect(r.content).toContain("4,79%");
  });

  it("H. pergunta sobre o mês em curso identifica que está em andamento", () => {
    const fin = { ...finDe(), emCurso: { monthKey: "2026-07", revenue: { net: 30000 }, profitability: {} } };
    const r = answerQuestion("como está o mês atual?", salesCom(fin));
    expect(r.content).toContain("2026-07");
    expect(r.content).toContain("andamento");
    expect(r.content).toContain("não são diretamente comparáveis");
  });

  it("I. não afirma queda categórica com mês parcial", () => {
    const fin = { ...finDe(), emCurso: { monthKey: "2026-07", revenue: { net: 30000 }, profitability: {} } };
    const r = answerQuestion("como está o mês em curso?", salesCom(fin));
    expect(r.content).not.toMatch(/caiu \d|desceu \d|queda de \d/);
  });

  it("J. moeda em R$, sem qualquer €", () => {
    const perguntas = ["qual foi o meu resultado?", "qual a minha margem?", "qual o meu ebitda?", "quanto tenho a pagar?"];
    for (const p of perguntas) {
      const r = answerQuestion(p, salesCom(finDe()));
      expect(r.content).not.toContain("€");
    }
    expect(answerQuestion("qual foi o meu resultado?", salesCom(finDe())).content).toContain("R$");
  });

  it("K. null nunca vira zero", () => {
    const nulo = finDe({ revenue: { net: null, gross: null }, profitability: { netResult: null, netMarginPct: null, ebitda: null, availability: {} } });
    const r = answerQuestion("qual a minha receita liquida?", salesCom(nulo));
    expect(r.content).toContain("indisponível");
    expect(r.content).not.toMatch(/R\$\s*0,00/);
  });

  it("sem camada financeira não inventa resultado", () => {
    const r = answerQuestion("qual foi o meu resultado?", { ...salesFixture, financeiro: null });
    expect(r.content).toContain("não posso apurar");
  });
});