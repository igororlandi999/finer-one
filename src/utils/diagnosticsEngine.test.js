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

describe("Score — inputs financeiros vindos da DRE central", () => {
  const { orders } = cenarioSaudavel();
  const metricsCom = (netResult, netMarginPct) => ({
    profitability: { netResult, netMarginPct, availability: {} },
  });

  /* ESTE TESTE DESCREVIA O DEFEITO. Sem métricas injetadas, "o comportamento anterior"
   * era calcular `receitas - contas a pagar` e chamar-lhe resultado. Passa a exigir o
   * contrário: a rentabilidade não é avaliada, e é dito que não foi. */
  it("sem métricas injetadas a rentabilidade NÃO é avaliada nem penalizada", () => {
    const d = buildFinancialDiagnostic(orders, []);
    expect(typeof d.score).toBe("number");
    expect(d.naoAvaliados.map((n) => n.dimensao)).toContain("rentabilidade");
    expect(d.penalizacoes.map((p) => p.motivo).join(" | ")).not.toMatch(/resultado|margem/i);
  });

  it("resultado líquido NEGATIVO da DRE penaliza", () => {
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(-500, -20) });
    expect(d.penalizacoes.some((p) => p.motivo === "Resultado líquido do mês negativo")).toBe(true);
  });

  it("margem líquida baixa da DRE penaliza pelo escalão correto", () => {
    const baixa = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(100, 5) });
    expect(baixa.penalizacoes.some((p) => p.motivo === "Margem líquida do mês abaixo de 10%")).toBe(true);
    const media = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(100, 15) });
    expect(media.penalizacoes.some((p) => p.motivo === "Margem líquida do mês abaixo de 20%")).toBe(true);
  });

  it("margem líquida saudável não penaliza a rentabilidade", () => {
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(1000, 30) });
    expect(d.penalizacoes.some((p) => p.motivo.startsWith("Margem líquida"))).toBe(false);
    expect(d.penalizacoes.some((p) => p.motivo === "Resultado líquido do mês negativo")).toBe(false);
  });

  it("AUSÊNCIA de CMV não penaliza: dimensão fica NÃO AVALIADA", () => {
    const semCmv = { profitability: { netResult: null, netMarginPct: null, availability: {} } };
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: semCmv });
    // nenhuma penalização de rentabilidade
    expect(d.penalizacoes.some((p) => p.motivo.includes("Margem"))).toBe(false);
    expect(d.penalizacoes.some((p) => p.motivo.includes("Resultado"))).toBe(false);
    // e fica registada como não avaliada
    expect(d.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(true);
  });

  it("ausência de fonte NUNCA baixa o score face a uma margem saudável", () => {
    const saudavel = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(1000, 30) });
    const semFonte = buildFinancialDiagnostic(orders, [], {
      financialMetrics: { profitability: { netResult: null, netMarginPct: null, availability: {} } },
    });
    expect(semFonte.score).toBeGreaterThanOrEqual(saudavel.score);
  });

  it("o score continua sem histórico inventado", () => {
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(1000, 30) });
    expect(d.scorePrevious).toBeNull();
    expect(d.evolucao).toBeNull();
  });

  it("queda de margem não gera impacto monetário", () => {
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: metricsCom(100, 5) });
    const ids = (d.impactBreakdown || []).map((b) => b.id);
    expect(ids.every((i) => i === "contas-vencidas")).toBe(true);
  });
});

describe("Diagnóstico — nenhuma afirmação vem de receitas − contas a pagar", () => {
  const fmDe = (netResult, netMarginPct, net = 100000) => ({
    revenue: { net }, profitability: { netResult, netMarginPct, availability: {} },
  });

  it("A. netResult POSITIVO da DRE com receita−payables negativo: manda a DRE", () => {
    // payables enormes tornam receita − contas a pagar negativo
    const { orders } = cenarioSaudavel();
    const pesados = [{ id: 1, situacao: 2, valor: 9999999, dataEmissao: iso(2026, 6, 1), vencimento: iso(2026, 6, 5), contato: { id: 1, nome: "F" }, categoriaNome: "Compras de fornecedores" }];
    const d = buildFinancialDiagnostic(orders, pesados, { financialMetrics: fmDe(5000, 25) });
    expect(d.problemas.some((p) => p.id === "pr-resultado")).toBe(false); // DRE diz positivo
    expect(d.resumoExecutivo).toContain("receita líquida");
    expect(d.resumoExecutivo).not.toMatch(/com um resultado de/); // frase antiga não aparece
  });

  it("B. netResult NULL (sem CMV): nada de resultado/margem inventados", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: fmDe(null, null) });
    expect(d.naoAvaliados.some((n) => n.dimensao === "rentabilidade")).toBe(true);
    expect(d.problemas.some((p) => p.id === "pr-resultado")).toBe(false);
    expect(d.problemas.some((p) => p.id === "pr-margem")).toBe(false);
    expect(d.acoes.some((a) => a.id === "pr-resultado" || a.id === "pr-margem")).toBe(false);
    expect(d.resumoExecutivo).toContain("não pôde ser apurado");
    expect(d.mudancasUltimoMes.some((m) => m.label === "Resultado")).toBe(false);
  });

  it("C. netResult NEGATIVO cria pr-resultado, com impacto null", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: fmDe(-800, -5) });
    const pr = d.problemas.find((p) => p.id === "pr-resultado");
    expect(pr).toBeTruthy();
    expect(pr.descricao).toContain("resultado líquido");
    expect(pr.impacto).toBeNull(); // resultado negativo não é impacto recuperável
  });

  it("D. netMarginPct < 10 cria pr-margem a partir da DRE", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: fmDe(500, 4) });
    const pm = d.problemas.find((p) => p.id === "pr-margem");
    expect(pm).toBeTruthy();
    expect(pm.descricao).toContain("margem líquida");
    expect(pm.impacto).toBeNull();
  });

  it("E. monthKey injetado manda: julho parcial nos pedidos não contamina junho", () => {
    const orders = [
      // NOTA: o helper iso() deste ficheiro passa o mês 0-based ao Date,
      // portanto m:4 = maio, m:5 = junho, m:6 = julho.
      order({ id: 1, m: 4, d: 10, total: 10000 }),  // maio
      order({ id: 2, m: 5, d: 10, total: 12000 }),  // junho (referência)
      order({ id: 3, m: 6, d: 2, total: 300 }),     // julho em curso
    ];
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: fmDe(1000, 10), monthKey: "2026-06" });
    // crescimento compara junho vs maio (+20%), nunca julho vs junho (-97,5%)
    const fat = d.mudancasUltimoMes.find((m) => m.label === "Faturação");
    expect(fat.valor).toBe("+20%");
    expect(d.problemas.some((p) => p.id === "pr-vendas")).toBe(false);
  });

  it("F. variação de resultado só com períodos comparáveis", () => {
    const { orders } = cenarioSaudavel();
    const base = { financialMetrics: fmDe(1000, 10), previousFinancialMetrics: fmDe(500, 6) };
    const semComparar = buildFinancialDiagnostic(orders, [], { ...base, financialComparable: false });
    expect(semComparar.mudancasUltimoMes.some((m) => m.label === "Resultado")).toBe(false);
    const comparavel = buildFinancialDiagnostic(orders, [], { ...base, financialComparable: true });
    const res = comparavel.mudancasUltimoMes.find((m) => m.label === "Resultado");
    expect(res).toBeTruthy();
    expect(res.valor).toBe("+100%"); // 500 -> 1000
  });

  it("F2. sem previousFinancialMetrics não há variação de resultado", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, [], { financialMetrics: fmDe(1000, 10), financialComparable: true });
    expect(d.mudancasUltimoMes.some((m) => m.label === "Resultado")).toBe(false);
  });

  it("G. sem financialMetrics não há variação de resultado nenhuma", () => {
    const { orders } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, []);
    expect(d.resumoExecutivo).toContain("faturou");      // a faturação é um facto
    expect(typeof d.score).toBe("number");
    expect(d.mudancasUltimoMes.some((m) => m.label === "Resultado")).toBe(false);
    expect(d.naoAvaliados.map((n) => n.dimensao)).toContain("rentabilidade");
  });
});

describe("Concentração de cliente e moeda respeitam o mês âncora", () => {
  // NOTA: iso() deste ficheiro é 0-based no mês => m:4 = maio, m:5 = junho, m:6 = julho.
  const ordersTresMeses = [
    // maio: Cliente A domina
    order({ id: 1, m: 4, d: 5, total: 9000, cliente: "Cliente A", cid: 1 }),
    order({ id: 2, m: 4, d: 6, total: 1000, cliente: "Outro", cid: 9 }),
    // junho (mês âncora): Cliente B domina
    order({ id: 3, m: 5, d: 5, total: 9500, cliente: "Cliente B", cid: 2 }),
    order({ id: 4, m: 5, d: 6, total: 500, cliente: "Outro", cid: 9 }),
    // julho em curso: Cliente C domina
    order({ id: 5, m: 6, d: 2, total: 8000, cliente: "Cliente C", cid: 3 }),
  ];
  const fm = { revenue: { net: 9000 }, profitability: { netResult: 1000, netMarginPct: 11, availability: {} } };

  it("A. concentração usa SOMENTE o mês âncora (junho)", () => {
    const d = buildFinancialDiagnostic(ordersTresMeses, [], { financialMetrics: fm, monthKey: "2026-06" });
    // 9500 de 10000 em junho => 95%
    expect(d.problemas.some((p) => p.id === "pr-conc-cliente")).toBe(true);
    const pc = d.problemas.find((p) => p.id === "pr-conc-cliente");
    expect(pc.descricao).toContain("Cliente B");
    expect(pc.descricao).not.toContain("Cliente A");
    expect(pc.descricao).not.toContain("Cliente C");
  });

  it("B. pr-conc-cliente nasce do cliente dominante de junho", () => {
    const d = buildFinancialDiagnostic(ordersTresMeses, [], { financialMetrics: fm, monthKey: "2026-06" });
    const pc = d.problemas.find((p) => p.id === "pr-conc-cliente");
    expect(pc.descricao).toMatch(/9[0-9](,[0-9]+)?% da faturação vem de Cliente B/);
  });

  it("C. resumo executivo refere o cliente do mês âncora", () => {
    const d = buildFinancialDiagnostic(ordersTresMeses, [], { financialMetrics: fm, monthKey: "2026-06" });
    expect(d.resumoExecutivo).toContain("Cliente B");
    expect(d.resumoExecutivo).not.toContain("Cliente A");
    expect(d.resumoExecutivo).not.toContain("Cliente C");
  });

  it("A2. mudar o mês âncora muda o cliente dominante", () => {
    const maio = buildFinancialDiagnostic(ordersTresMeses, [], { financialMetrics: fm, monthKey: "2026-05" });
    expect(maio.resumoExecutivo).toContain("Cliente A");
    const julho = buildFinancialDiagnostic(ordersTresMeses, [], { financialMetrics: fm, monthKey: "2026-07" });
    expect(julho.resumoExecutivo).toContain("Cliente C");
  });

  it("D. valores monetários usam a moeda da empresa ativa (R$), não €", () => {
    const vencidas = [payable({ id: 1, situacao: 1, m: 3, d: 1, valor: 14000, saldo: 14000 })];
    const d = buildFinancialDiagnostic(ordersTresMeses, vencidas, { financialMetrics: fm, monthKey: "2026-06" });
    const texto = [
      d.resumoExecutivo,
      ...d.problemas.map((p) => p.descricao),
      ...d.mudancasUltimoMes.map((m) => m.detalhe),
    ].join(" ");
    expect(texto).toContain("R$");
    expect(texto).not.toContain("€");
  });

  it("E. sem financialMetrics afirma-se a faturação e cala-se a rentabilidade", () => {
    const d = buildFinancialDiagnostic(ordersTresMeses, [], { monthKey: "2026-06" });
    expect(d.resumoExecutivo).toContain("faturou");   // facto dos pedidos
    expect(d.resumoExecutivo).toContain("R$");        // na moeda da empresa ativa
    expect(d.resumoExecutivo).toMatch(/não puderam ser apurados/);
    expect(d.naoAvaliados.map((n) => n.dimensao)).toContain("rentabilidade");
    expect(typeof d.score).toBe("number");
  });
});
/* ══════════════════════════════════════════════════════════════════════════════════
 * "O QUE MUDOU" — encontrado a olhar para o produto a correr (FASE 13).
 *
 * Esta lista alimenta duas superfícies: "O que mudou desde o mês passado" no Resumo e
 * "Insights inteligentes" no Chat Financeiro. No ecrã do Chat lia-se, com dados reais:
 *
 *     Faturação: -56,01% (vs mês anterior).
 *     Despesas:  -79,44% (vs mês anterior).
 *
 * Dois problemas, ambos do género que este projeto trata como grave:
 *
 *   1. "Despesas" era `totalPayables` de dois meses — CONTAS A PAGAR. Tesouraria com o
 *      nome de uma linha da DRE, ao lado de "Faturação" e "Resultado", sem nada que a
 *      distinguisse.
 *   2. Nenhuma linha dizia de que mês falava. E o mês destas linhas é o mês ÂNCORA, que
 *      no Resumo aparece ao lado de um card de contas a pagar do mês CIVIL e de um card
 *      de receitas do último mês com pedidos. Três meses, três "vs mês anterior", zero
 *      referências.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("diagnóstico — 'o que mudou' nomeia o mês e chama as coisas pelo nome", () => {
  const mudanca = (d, label) => (d.mudancasUltimoMes || []).find((m) => m.label === label);

  it("contas a pagar não são chamadas 'Despesas'", () => {
    const { orders, payables } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(mudanca(d, "Despesas")).toBeUndefined();
    expect(mudanca(d, "Contas a pagar")).toBeDefined();
  });

  it("cada linha comparativa nomeia o mês a que se refere", () => {
    const { orders, payables } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, payables);
    const comparativas = (d.mudancasUltimoMes || [])
      .filter((m) => /vs mês anterior/.test(m.detalhe || ""));
    expect(comparativas.length).toBeGreaterThan(0);
    for (const m of comparativas) {
      expect(m.detalhe, `"${m.label}" não nomeia o mês`).toMatch(/^[a-zç]+ de \d{4} vs mês anterior$/);
    }
  });

  /* Um mês cujas despesas operacionais estão `partial` — por cobertura ou por títulos
   * por classificar — é um MÍNIMO CONHECIDO. "As contas a pagar caíram 79%" calculado
   * sobre dois mínimos é uma afirmação insegura, e o produto tem um só critério para
   * isto: `canComparePeriods`. */
  it("com períodos não comparáveis, a variação de contas a pagar cala-se", () => {
    const { orders, payables } = cenarioSaudavel();
    const metrics = (disp) => ({
      monthKey: "2026-07",
      revenue: { net: 10000, gross: 10500 },
      cmv: { value: 4000 },
      operatingExpenses: { total: 3500 },
      profitability: { netResult: 1200, netMarginPct: 12, ebitda: 1500, availability: {} },
      availability: { operatingExpenses: disp, revenueNet: "real" },
    });
    const naoComparavel = buildFinancialDiagnostic(orders, payables, {
      financialMetrics: metrics("partial"),
      previousFinancialMetrics: metrics("partial"),
      financialComparable: false,
      monthKey: "2026-07",
    });
    expect(mudanca(naoComparavel, "Contas a pagar")).toBeUndefined();

    const comparavel = buildFinancialDiagnostic(orders, payables, {
      financialMetrics: metrics("real"),
      previousFinancialMetrics: metrics("real"),
      financialComparable: true,
      monthKey: "2026-07",
    });
    expect(mudanca(comparavel, "Contas a pagar")).toBeDefined();
  });

  /* Sem DRE injetada nada nesta camada sabe o suficiente para vetar: mantém-se o
   * comportamento anterior em vez de calar uma linha por precaução mal fundamentada. */
  it("sem métricas da DRE o comportamento anterior mantém-se", () => {
    const { orders, payables } = cenarioSaudavel();
    const d = buildFinancialDiagnostic(orders, payables);
    expect(mudanca(d, "Contas a pagar")).toBeDefined();
  });
});
