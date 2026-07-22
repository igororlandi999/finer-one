// Testes do diagnóstico financeiro. Data simulada fixa para determinismo:
// "hoje" = 15/07/2026; mês âncora = julho, mês anterior = junho.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFinancialDiagnostic } from "./diagnosticsEngine.js";

const HOJE = new Date(2026, 6, 15, 12, 0, 0); // 15 Jul 2026
const iso = (y, m, d) => new Date(y, m, d).toISOString();

function order({ id, m, d, total, cliente = "Cliente A", cid = 1, status = "recebida" }) {
  return { id, date: iso(2026, m, d), total, status, client: { id: cid, name: cliente }, items: [] };
}
function payable({ id, situacao = 2, m, d, valor, saldo, categoria = "Compras", forn = "Forn A" }) {
  return {
    id, situacao,
    vencimento: iso(2026, m, d),
    dataEmissao: iso(2026, m, d),
    valor, saldo,
    categoriaNome: categoria,
    contato: { id: id, nome: forn },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(HOJE);
});
afterEach(() => {
  vi.useRealTimers();
});

// Cenário saudável: crescimento, margem alta, sem vencidas, tudo diversificado.
function cenarioSaudavel() {
  const orders = [
    order({ id: 1, m: 6, d: 3, total: 4000, cliente: "A", cid: 1 }),
    order({ id: 2, m: 6, d: 5, total: 3500, cliente: "B", cid: 2 }),
    order({ id: 3, m: 6, d: 8, total: 3000, cliente: "C", cid: 3 }),
    // junho diversificado: concentração de cliente é sobre a carteira toda
    order({ id: 4, m: 5, d: 5, total: 3000, cliente: "A", cid: 1 }),
    order({ id: 5, m: 5, d: 6, total: 3000, cliente: "B", cid: 2 }),
    order({ id: 6, m: 5, d: 8, total: 2000, cliente: "C", cid: 3 }),
  ];
  const payables = [
    payable({ id: 1, m: 6, d: 5, valor: 1800, categoria: "Compras", forn: "F1" }),
    payable({ id: 2, m: 6, d: 8, valor: 1700, categoria: "Servi\u00e7os", forn: "F2" }),
    payable({ id: 3, m: 6, d: 10, valor: 1500, categoria: "Log\u00edstica", forn: "F3" }),
    payable({ id: 4, m: 5, d: 10, valor: 4600, categoria: "Compras", forn: "F1" }), // MoM +8,7% (<20)
  ];
  return { orders, payables };
}

// Cenário catastrófico: acumula todas as penalizações possíveis.
function cenarioCatastrofico() {
  const orders = [
    order({ id: 1, m: 6, d: 3, total: 1000, cliente: "\u00danico", cid: 1 }), // julho fraco, 1 cliente
    order({ id: 2, m: 5, d: 5, total: 20000, cliente: "\u00danico", cid: 1 }), // junho forte => quebra
  ];
  const payables = [
    payable({ id: 1, situacao: 1, m: 6, d: 1, valor: 3000, saldo: 3000 }), // vencida (01/07 < 15/07)
    payable({ id: 2, situacao: 2, m: 6, d: 5, valor: 2000 }),               // paga do mês
    payable({ id: 3, situacao: 2, m: 5, d: 5, valor: 500 }),                // junho baixo => subida forte
  ];
  return { orders, payables };
}

describe("buildFinancialDiagnostic — guardas", () => {
  it("payables undefined (falha/aus\u00eancia) devolve null", () => {
    const { orders } = cenarioSaudavel();
    expect(buildFinancialDiagnostic(orders, undefined)).toBeNull();
    expect(buildFinancialDiagnostic(orders, null)).toBeNull();
  });

  it("sem pedidos devolve null", () => {
    const { payables } = cenarioSaudavel();
    expect(buildFinancialDiagnostic([], payables)).toBeNull();
  });

  it("payables [] (zero t\u00edtulos reais) devolve diagn\u00f3stico calculado", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    expect(d).not.toBeNull();
    expect(typeof d.score).toBe("number");
    expect(d.estado).toBeTruthy();
  });
});

describe("buildFinancialDiagnostic — score", () => {
  it("cen\u00e1rio saud\u00e1vel atinge 100 e classifica Saud\u00e1vel/Excelente", () => {
    const { orders, payables } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.score).toBe(100);
    expect(d.estado).toBe("Saud\u00e1vel");
    expect(d.scoreLabel).toBe("Excelente");
    expect(d.penalizacoes).toHaveLength(0);
  });

  it("score fica sempre no intervalo [0, 100], mesmo no pior cen\u00e1rio", () => {
    const casos = [cenarioSaudavel(), cenarioCatastrofico(), { orders: cenarioSaudavel().orders, payables: [] }];
    for (const { orders, payables } of casos) {
      const d = buildFinancialDiagnostic(orders, payables);
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  it("cen\u00e1rio catastr\u00f3fico penaliza quebra, vencidas e concentra\u00e7\u00f5es", () => {
    const { orders, payables } = cenarioCatastrofico();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.score).toBeLessThan(60);
    const motivos = d.penalizacoes.map((p) => p.motivo).join(" | ");
    expect(motivos).toMatch(/fatura\u00e7\u00e3o/i);
    expect(motivos).toMatch(/vencid/i);
  });
});

describe("buildFinancialDiagnostic — contratos de honestidade", () => {
  it("scorePrevious \u00e9 sempre null (sem hist\u00f3rico inventado)", () => {
    const a = buildFinancialDiagnostic(cenarioSaudavel().orders, cenarioSaudavel().payables);
    const b = buildFinancialDiagnostic(cenarioCatastrofico().orders, cenarioCatastrofico().payables);
    expect(a.scorePrevious).toBeNull();
    expect(b.scorePrevious).toBeNull();
  });

  it("existe pelo menos uma a\u00e7\u00e3o mesmo sem problemas graves", () => {
    const { orders, payables } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.problemas).toHaveLength(0);
    expect(d.acoes.length).toBeGreaterThanOrEqual(1);
    expect(d.acoes[0].impacto).toBeNull(); // nunca inventar euros nas a\u00e7\u00f5es
  });

  it("a\u00e7\u00f5es nunca trazem impacto financeiro inventado", () => {
    const { orders, payables } = cenarioCatastrofico();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(d.acoes.length).toBeGreaterThanOrEqual(1);
    for (const a of d.acoes) expect(a.impacto).toBeNull();
  });
});

describe("buildFinancialDiagnostic — impacto e evolução (credibilidade)", () => {
  it("sem contas vencidas: impacto NÃO quantificado, sem valor fictício", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    expect(d.impactIsQuantified).toBe(false);
    expect(d.impactAmount).toBeNull();
    expect(d.impactLabel).toBe("Impacto não quantificado");
    expect(d.impactBreakdown).toEqual([]);
  });

  it("com contas vencidas: impacto quantificado e rastreável", () => {
    const venc = [
      { id: 1, situacao: 1, valor: 500, saldo: 500, vencimento: "2020-01-01", dataEmissao: "2019-12-01", contato: { id: 1, nome: "F" } },
      { id: 2, situacao: 1, valor: 300, saldo: 300, vencimento: "2020-02-01", dataEmissao: "2019-12-01", contato: { id: 2, nome: "G" } },
    ];
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, venc);
    expect(d.impactIsQuantified).toBe(true);
    expect(d.impactAmount).toBeGreaterThan(0);
    expect(d.impactBreakdown.length).toBeGreaterThan(0);
    expect(d.impactBreakdown[0].id).toBe("contas-vencidas");
    // rastreável: o total do breakdown iguala o impactAmount
    const soma = d.impactBreakdown.reduce((a, b) => a + b.amount, 0);
    expect(soma).toBe(d.impactAmount);
  });

  it("impactBreakdown contém apenas contas vencidas", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    const ids = (d.impactBreakdown || []).map((b) => b.id);
    expect(ids.every((i) => i === "contas-vencidas")).toBe(true);
  });

  it("evolucao é null: sem histórico real de score (nunca série inventada)", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    expect(d.evolucao).toBeNull();
    expect(d.scorePrevious).toBeNull();
  });

  it("score real continua a ser produzido e rotulado", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    expect(typeof d.score).toBe("number");
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
    expect(typeof d.scoreLabel).toBe("string");
    expect(typeof d.resumoExecutivo).toBe("string");
    expect(d.resumoExecutivo.length).toBeGreaterThan(0);
  });
});

describe("buildFinancialDiagnostic — impactos individuais dos problemas", () => {
  // Cenário com quebra de faturação e subida de despesas face ao mês anterior.
  function cenarioQuedaESubida() {
    const orders = [
      order({ id: 1, m: 5, d: 10, total: 10000 }), // mês anterior alto
      order({ id: 2, m: 6, d: 10, total: 4000 }),  // mês atual baixo => queda
    ];
    const payables = [
      payable({ id: 1, situacao: 2, m: 5, d: 5, valor: 500 }),   // mês anterior baixo
      payable({ id: 2, situacao: 2, m: 6, d: 5, valor: 3000 }),  // mês atual alto => subida
    ];
    return { orders, payables };
  }

  it("pr-vendas tem impacto null (queda de faturação não é recuperável)", () => {
    const { orders, payables } = cenarioQuedaESubida();
    const d = buildFinancialDiagnostic(orders, payables);
    const p = d.problemas.find((x) => x.id === "pr-vendas");

    expect(p).toBeTruthy();
    expect(p.impacto).toBeNull();
  });

  it("pr-despesas tem impacto null (subida de despesas não é recuperável)", () => {
    const { orders, payables } = cenarioQuedaESubida();
    const d = buildFinancialDiagnostic(orders, payables);
    const p = d.problemas.find((x) => x.id === "pr-despesas");

    expect(p).toBeTruthy();
    expect(p.impacto).toBeNull();
  });

  it("nenhum problema de variação (%) carrega valor em euros", () => {
    const { orders, payables } = cenarioQuedaESubida();
    const d = buildFinancialDiagnostic(orders, payables);
    for (const p of d.problemas) {
      if (p.id === "pr-vendas" || p.id === "pr-despesas") expect(p.impacto).toBeNull();
    }
  });

  it("pr-vencidas mantém impacto numérico rastreável (valor vencido real)", () => {
    const { orders } = cenarioSaudavel();
    const venc = [
      { id: 1, situacao: 1, valor: 700, saldo: 700, vencimento: "2020-01-01", dataEmissao: "2019-12-01", contato: { id: 1, nome: "F" } },
    ];
    const d = buildFinancialDiagnostic(orders, venc);
    const p = d.problemas.find((x) => x.id === "pr-vencidas");
    expect(p).toBeTruthy();
    expect(typeof p.impacto).toBe("number");
    expect(p.impacto).toBeLessThan(0); // saída de dinheiro
    // rastreável: coincide com o montante do breakdown de impacto
    expect(Math.abs(p.impacto)).toBe(d.impactAmount);
  });

  it("impactBreakdown continua a conter apenas contas vencidas", () => {
    const { orders, payables } = cenarioQuedaESubida();
    const d = buildFinancialDiagnostic(orders, payables);
    const ids = (d.impactBreakdown || []).map((b) => b.id);
    expect(ids.every((i) => i === "contas-vencidas")).toBe(true);
  });
});