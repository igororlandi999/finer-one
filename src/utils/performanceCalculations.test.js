// Testes de performanceCalculations — datas fixas, sem relógio real.
// Cobre série mensal, mês de referência, margens, deltas, categorias e insights.

import { describe, it, expect } from "vitest";
import {
  buildMonthlyPerformance,
  buildPerformanceMetrics,
  buildExpenseCategoryPerformance,
  buildPerformanceInsights,
  expensesByMonthFromList,
  latestRevenueMonthAtOrBefore,
  buildAvailableWindows,
  monthLabel,
  monthLongLabel,
} from "./performanceCalculations.js";

// "Agora" fixo: 15 de julho de 2026.
const NOW = new Date(2026, 6, 15, 12, 0, 0);

// Pedido no formato normalizado do projeto (date ISO, status recebida = faturável).
const order = (id, y, m, d, total) => ({
  id: String(id),
  date: new Date(y, m - 1, d).toISOString(),
  total,
  status: "recebida",
  cliente: { id: 1, nome: "Cliente A" },
  itens: [],
});

// Linha de sales.despesas.list (data já em dd/mm/aaaa).
const desp = (id, y, m, d, valor, categoria = "Compras") => ({
  id: String(id),
  data: `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
  valor,
  categoria,
});

describe("buildMonthlyPerformance — série mensal", () => {
  it("ordena cronologicamente e calcula resultado e margem", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)];
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    expect(s.map((p) => p.monthKey)).toEqual(["2026-05", "2026-06"]);
    expect(s[0]).toMatchObject({ receitas: 1000, despesas: 400, resultado: 600, margem: 60 });
    expect(s[1]).toMatchObject({ receitas: 2000, despesas: 500, resultado: 1500, margem: 75 });
  });

  it("preenche meses sem movimento dentro do intervalo coberto (a zero)", () => {
    const orders = [order(1, 2026, 4, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s.map((p) => p.monthKey)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(s[1]).toMatchObject({ receitas: 0, despesas: 0, resultado: 0 });
  });

  it("nunca inclui meses futuros", () => {
    const orders = [order(1, 2026, 6, 10, 1000), order(2, 2026, 11, 10, 5000)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s.every((p) => p.monthKey <= "2026-07")).toBe(true);
    expect(s.some((p) => p.monthKey === "2026-11")).toBe(false);
  });

  it("receitas zero => margem null (nunca NaN nem Infinity)", () => {
    const orders = [order(1, 2026, 5, 10, 1000)];
    const list = [desp(1, 2026, 6, 5, 300)]; // junho só tem despesa
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    const junho = s.find((p) => p.monthKey === "2026-06");
    expect(junho.receitas).toBe(0);
    expect(junho.margem).toBeNull();
    expect(Number.isFinite(junho.resultado)).toBe(true);
  });

  it("mês com receitas e sem despesas => resultado igual às receitas", () => {
    const orders = [order(1, 2026, 6, 10, 800)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s[0]).toMatchObject({ receitas: 800, despesas: 0, resultado: 800, margem: 100 });
  });

  it("fonte de despesas indisponível (null) => despesas/resultado/margem a null", () => {
    const orders = [order(1, 2026, 6, 10, 800)];
    const s = buildMonthlyPerformance({ orders, despesasList: null, now: NOW });
    expect(s[0].receitas).toBe(800);
    expect(s[0].despesas).toBeNull();
    expect(s[0].resultado).toBeNull();
    expect(s[0].margem).toBeNull();
  });

  it("sem dados => série vazia (sem fallback para mock)", () => {
    expect(buildMonthlyPerformance({ orders: [], despesasList: [], now: NOW })).toEqual([]);
  });

  it("margem negativa quando despesas superam receitas", () => {
    const orders = [order(1, 2026, 6, 10, 1000)];
    const list = [desp(1, 2026, 6, 5, 1500)];
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    expect(s[0].resultado).toBe(-500);
    expect(s[0].margem).toBe(-50);
  });
});

describe("buildPerformanceMetrics — mês de referência e deltas", () => {
  const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
  const list = [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)];

  it("mês de referência é o último mês real de receitas", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.mesRef).toBe("2026-06");
    expect(m.mesRefLabel).toBe("junho de 2026");
    expect(m.receitas).toBe(2000);
    expect(m.despesas).toBe(500);
    expect(m.resultado).toBe(1500);
    expect(m.margem).toBe(75);
  });

  it("deltas calculados com base anterior válida", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.temAnterior).toBe(true);
    expect(m.receitasDelta).toBe(100);   // 1000 -> 2000
    expect(m.despesasDelta).toBe(25);    // 400 -> 500
    expect(m.margemDelta).toBe(15);      // 60% -> 75% = +15 p.p.
  });

  it("sem período anterior => deltas null (nunca 0%)", () => {
    const so = [order(1, 2026, 6, 10, 2000)];
    const m = buildPerformanceMetrics({ orders: so, despesasList: [desp(1, 2026, 6, 5, 500)], now: NOW });
    expect(m.temAnterior).toBe(false);
    expect(m.receitasDelta).toBeNull();
    expect(m.despesasDelta).toBeNull();
    expect(m.margemDelta).toBeNull();
  });

  it("período anterior a zero => delta null (não divide por zero)", () => {
    const os = [order(1, 2026, 6, 10, 2000)];
    const ls = [desp(1, 2026, 5, 5, 0), desp(2, 2026, 6, 5, 500)];
    const m = buildPerformanceMetrics({ orders: os, despesasList: ls, now: NOW });
    // maio tem receitas 0 => delta de receitas não calculável
    expect(m.receitasDelta).toBeNull();
    expect(Number.isNaN(m.receitasDelta)).toBe(false);
  });

  it("fonte de despesas indisponível => margemCalculavel false", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: null, now: NOW });
    expect(m.temDespesas).toBe(false);
    expect(m.margemCalculavel).toBe(false);
    expect(m.resultado).toBeNull();
  });

  it("sem pedidos => null (sem mês de referência)", () => {
    expect(buildPerformanceMetrics({ orders: [], despesasList: [], now: NOW })).toBeNull();
  });
});

describe("buildExpenseCategoryPerformance — categorias", () => {
  it("agrupa por categoria com percentagem e ordena por valor", () => {
    const list = [
      desp(1, 2026, 6, 5, 600, "Compras"),
      desp(2, 2026, 6, 6, 300, "Serviços"),
      desp(3, 2026, 6, 7, 100, "Compras"),
    ];
    const r = buildExpenseCategoryPerformance(list, "2026-06");
    expect(r.total).toBe(1000);
    expect(r.categorias[0]).toMatchObject({ name: "Compras", value: 700, pct: 70 });
    expect(r.categorias[1]).toMatchObject({ name: "Serviços", value: 300, pct: 30 });
  });

  it("separa 'Sem categoria' do ranking principal", () => {
    const list = [
      desp(1, 2026, 6, 5, 800, "Compras"),
      desp(2, 2026, 6, 6, 200, "Sem categoria"),
    ];
    const r = buildExpenseCategoryPerformance(list, "2026-06");
    expect(r.categorias.map((c) => c.name)).toEqual(["Compras"]);
    expect(r.semCategoria).toMatchObject({ value: 200, pct: 20 });
  });

  it("ignora meses diferentes do mês de referência", () => {
    const list = [desp(1, 2026, 5, 5, 999, "Compras"), desp(2, 2026, 6, 5, 100, "Compras")];
    const r = buildExpenseCategoryPerformance(list, "2026-06");
    expect(r.total).toBe(100);
  });

  it("lista vazia ou fonte ausente => vazio (sem mock)", () => {
    expect(buildExpenseCategoryPerformance([], "2026-06").categorias).toEqual([]);
    expect(buildExpenseCategoryPerformance(null, "2026-06").categorias).toEqual([]);
  });
});

describe("buildPerformanceInsights — frases sem causas inventadas", () => {
  const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
  const list = [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)];

  it("descreve variações reais sem atribuir causas", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    const cats = buildExpenseCategoryPerformance(list, m.mesRef).categorias;
    const frases = buildPerformanceInsights(m, cats);
    const texto = frases.join(" ");
    expect(texto).toContain("As receitas subiram");
    expect(texto).toContain("O resultado do mês foi positivo");
    // nunca explica porquê
    expect(texto).not.toMatch(/devido a|por causa de|em virtude de|resultado do aumento/i);
  });

  it("sem período anterior => frase transparente", () => {
    const so = [order(1, 2026, 6, 10, 2000)];
    const m = buildPerformanceMetrics({ orders: so, despesasList: [], now: NOW });
    const frases = buildPerformanceInsights(m, []);
    expect(frases.join(" ")).toContain("Sem período anterior comparável");
  });

  it("metrics null => sem frases", () => {
    expect(buildPerformanceInsights(null, [])).toEqual([]);
  });
});

describe("auxiliares", () => {
  it("expensesByMonthFromList ignora datas inválidas", () => {
    const map = expensesByMonthFromList([
      desp(1, 2026, 6, 5, 100),
      { id: "x", data: "31/02/2026", valor: 999 }, // inválida
      { id: "y", data: null, valor: 999 },
    ]);
    expect(map.get("2026-06")).toBe(100);
    expect(map.size).toBe(1);
  });

  it("rótulos de mês", () => {
    expect(monthLabel("2026-05")).toBe("Mai 26");
    expect(monthLongLabel("2026-05")).toBe("maio de 2026");
  });
});

describe("latestRevenueMonthAtOrBefore — mês de referência nunca futuro", () => {
  it("junho real + novembro futuro, com now em julho => referência junho", () => {
    const orders = [order(1, 2026, 6, 10, 1000), order(2, 2026, 11, 10, 9999)];
    expect(latestRevenueMonthAtOrBefore(orders, NOW)).toBe("2026-06");
  });

  it("mês atual conta como não futuro", () => {
    const orders = [order(1, 2026, 7, 2, 500)];
    expect(latestRevenueMonthAtOrBefore(orders, NOW)).toBe("2026-07");
  });

  it("somente pedidos futuros => null", () => {
    const orders = [order(1, 2026, 11, 10, 9999)];
    expect(latestRevenueMonthAtOrBefore(orders, NOW)).toBeNull();
  });

  it("sem pedidos => null", () => {
    expect(latestRevenueMonthAtOrBefore([], NOW)).toBeNull();
  });

  it("métricas: só dados futuros => null (não inventa mês)", () => {
    const orders = [order(1, 2026, 11, 10, 9999)];
    expect(buildPerformanceMetrics({ orders, despesasList: [], now: NOW })).toBeNull();
  });

  it("métricas ignoram o futuro: referência é junho, não novembro", () => {
    const orders = [order(1, 2026, 6, 10, 1000), order(2, 2026, 11, 10, 9999)];
    const m = buildPerformanceMetrics({ orders, despesasList: [], now: NOW });
    expect(m.mesRef).toBe("2026-06");
    expect(m.receitas).toBe(1000); // nunca soma o pedido de novembro
  });

  it("nenhum mês futuro aparece na série nem nas métricas", () => {
    const orders = [order(1, 2026, 6, 10, 1000), order(2, 2026, 11, 10, 9999)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    const m = buildPerformanceMetrics({ orders, despesasList: [], now: NOW });
    expect(s.every((p) => p.monthKey <= "2026-07")).toBe(true);
    expect(m.mesRef <= "2026-07").toBe(true);
  });
});

describe("buildAvailableWindows — opções do seletor", () => {
  it("0 meses => sem opções", () => {
    expect(buildAvailableWindows(0)).toEqual([]);
  });
  it("1 mês => [1]", () => {
    expect(buildAvailableWindows(1)).toEqual([1]);
  });
  it("2 meses => [2]", () => {
    expect(buildAvailableWindows(2)).toEqual([2]);
  });
  it("5 meses => [3, 5]", () => {
    expect(buildAvailableWindows(5)).toEqual([3, 5]);
  });
  it("8 meses => [3, 6, 8]", () => {
    expect(buildAvailableWindows(8)).toEqual([3, 6, 8]);
  });
  it("12 meses => [3, 6, 12]", () => {
    expect(buildAvailableWindows(12)).toEqual([3, 6, 12]);
  });
  it("15 meses => [3, 6, 12] (não excede os degraus padrão)", () => {
    expect(buildAvailableWindows(15)).toEqual([3, 6, 12]);
  });
  it("nunca devolve opção superior ao histórico disponível", () => {
    for (const total of [1, 2, 3, 4, 5, 7, 8, 11, 12, 15]) {
      expect(buildAvailableWindows(total).every((n) => n <= total)).toBe(true);
    }
  });
});

describe("fonte real vazia não é ausência de fonte", () => {
  it("orders [] => série vazia e métricas null (mas a fonte existe)", () => {
    // A distinção fonte-vs-movimentos é feita no ecrã; aqui garantimos que os
    // helpers devolvem vazio em vez de inventar dados.
    expect(buildMonthlyPerformance({ orders: [], despesasList: [], now: NOW })).toEqual([]);
    expect(buildPerformanceMetrics({ orders: [], despesasList: [], now: NOW })).toBeNull();
    expect(buildPerformanceInsights(null, [])).toEqual([]);
  });

  it("despesas [] (zero títulos reais) não é o mesmo que null", () => {
    const orders = [order(1, 2026, 6, 10, 1000)];
    const comLista = buildPerformanceMetrics({ orders, despesasList: [], now: NOW });
    const semFonte = buildPerformanceMetrics({ orders, despesasList: null, now: NOW });
    expect(comLista.temDespesas).toBe(true);
    expect(comLista.despesas).toBe(0);
    expect(comLista.resultado).toBe(1000);
    expect(semFonte.temDespesas).toBe(false);
    expect(semFonte.despesas).toBeNull();
  });
});

describe("buildPerformanceInsights — base comparável com mês anterior a zero", () => {
  it("mês anterior existe mas com receitas zero => frase de ausência de comparação", () => {
    // Maio existe na série (tem despesa) mas com receitas 0; junho tem receitas.
    const orders = [order(1, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 5, 5, 300), desp(2, 2026, 6, 5, 500)];
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.temAnterior).toBe(true);      // o mês anterior EXISTE
    expect(m.receitasDelta).toBeNull();    // mas a base é zero => não comparável
    const frases = buildPerformanceInsights(m, []);
    expect(frases).toContain("Sem período anterior comparável para as receitas.");
    // e não inventa uma subida a partir de base zero
    expect(frases.join(" ")).not.toContain("As receitas subiram");
  });

  it("mês anterior existe mas com despesas zero => frase de ausência de comparação", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 6, 5, 500)]; // maio sem despesas
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.temAnterior).toBe(true);
    expect(m.despesasDelta).toBeNull();
    const frases = buildPerformanceInsights(m, []);
    expect(frases).toContain("Sem período anterior comparável para as despesas.");
    expect(frases.join(" ")).not.toContain("As despesas subiram");
  });

  it("fonte de despesas ausente => nenhuma frase sobre despesas", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const m = buildPerformanceMetrics({ orders, despesasList: null, now: NOW });
    const frases = buildPerformanceInsights(m, []);
    expect(frases.some((f) => f.includes("despesas"))).toBe(false);
  });

  it("frases de ausência de comparação também não atribuem causas", () => {
    const orders = [order(1, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 5, 5, 300), desp(2, 2026, 6, 5, 500)];
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    const texto = buildPerformanceInsights(m, []).join(" ");
    expect(texto).not.toMatch(/devido a|por causa de|em virtude de|resultado do aumento|explica-se/i);
  });
});