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
  it("ordena cronologicamente faturação e títulos registados", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)];
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    expect(s.map((p) => p.monthKey)).toEqual(["2026-05", "2026-06"]);
    expect(s[0]).toMatchObject({ receitas: 1000, despesas: 400 });
    expect(s[1]).toMatchObject({ receitas: 2000, despesas: 500 });
    // O contrato operacional não fala de rentabilidade.
    expect(s[0].resultado).toBeUndefined();
    expect(s[0].margem).toBeUndefined();
  });

  it("preenche meses sem movimento dentro do intervalo coberto (a zero)", () => {
    const orders = [order(1, 2026, 4, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s.map((p) => p.monthKey)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(s[1]).toMatchObject({ receitas: 0, despesas: 0 });
  });

  it("nunca inclui meses futuros", () => {
    const orders = [order(1, 2026, 6, 10, 1000), order(2, 2026, 11, 10, 5000)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s.every((p) => p.monthKey <= "2026-07")).toBe(true);
    expect(s.some((p) => p.monthKey === "2026-11")).toBe(false);
  });

  it("faturação zero não produz NaN nem Infinity em lado nenhum", () => {
    const orders = [order(1, 2026, 5, 10, 1000)];
    const list = [desp(1, 2026, 6, 5, 300)]; // junho só tem despesa
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    const junho = s.find((p) => p.monthKey === "2026-06");
    expect(junho.receitas).toBe(0);
    expect(junho.margem).toBeUndefined();
    expect(Number.isFinite(junho.receitas)).toBe(true);
    expect(Number.isFinite(junho.despesas)).toBe(true);
  });

  it("mês com faturação e sem títulos => títulos a zero real", () => {
    const orders = [order(1, 2026, 6, 10, 800)];
    const s = buildMonthlyPerformance({ orders, despesasList: [], now: NOW });
    expect(s[0]).toMatchObject({ receitas: 800, despesas: 0 });
    expect(s[0].resultado).toBeUndefined();
  });

  it("fonte de títulos indisponível (null) => despesas a null", () => {
    const orders = [order(1, 2026, 6, 10, 800)];
    const s = buildMonthlyPerformance({ orders, despesasList: null, now: NOW });
    expect(s[0].receitas).toBe(800);
    expect(s[0].despesas).toBeNull();
    expect(s[0].resultado).toBeUndefined();
    expect(s[0].margem).toBeUndefined();
  });

  it("sem dados => série vazia (sem fallback para mock)", () => {
    expect(buildMonthlyPerformance({ orders: [], despesasList: [], now: NOW })).toEqual([]);
  });

  it("títulos acima da faturação: as duas grandezas continuam a ser reportadas", () => {
    const orders = [order(1, 2026, 6, 10, 1000)];
    const list = [desp(1, 2026, 6, 5, 1500)];
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    expect(s[0].receitas).toBe(1000);
    expect(s[0].despesas).toBe(1500);
    expect(s[0].resultado).toBeUndefined(); // antes: -500, um pseudo-resultado
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
    expect(m.resultado).toBeUndefined();
    expect(m.margem).toBeUndefined();
  });

  it("deltas calculados com base anterior válida", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.temAnterior).toBe(true);
    expect(m.receitasDelta).toBe(100);   // 1000 -> 2000
    expect(m.despesasDelta).toBe(25);    // 400 -> 500
    expect(m.margemDelta).toBeUndefined(); // margem saiu do contrato operacional
  });

  it("sem período anterior => deltas null (nunca 0%)", () => {
    const so = [order(1, 2026, 6, 10, 2000)];
    const m = buildPerformanceMetrics({ orders: so, despesasList: [desp(1, 2026, 6, 5, 500)], now: NOW });
    expect(m.temAnterior).toBe(false);
    expect(m.receitasDelta).toBeNull();
    expect(m.despesasDelta).toBeNull();
    expect(m.margemDelta).toBeUndefined();
  });

  it("período anterior a zero => delta null (não divide por zero)", () => {
    const os = [order(1, 2026, 6, 10, 2000)];
    const ls = [desp(1, 2026, 5, 5, 0), desp(2, 2026, 6, 5, 500)];
    const m = buildPerformanceMetrics({ orders: os, despesasList: ls, now: NOW });
    // maio tem receitas 0 => delta de receitas não calculável
    expect(m.receitasDelta).toBeNull();
    expect(Number.isNaN(m.receitasDelta)).toBe(false);
  });

  it("fonte de títulos indisponível => despesas a null, sem margem no contrato", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: null, now: NOW });
    expect(m.temDespesas).toBe(false);
    expect(m.margemCalculavel).toBeUndefined();
    expect(m.resultado).toBeUndefined();
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
    expect(texto).toContain("A faturação subiu");
    expect(texto).not.toContain("resultado"); // frase de rentabilidade removida
    expect(texto).not.toContain("margem");
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
    expect(frases).toContain("Sem período anterior comparável para a faturação.");
    // e não inventa uma subida a partir de base zero
    expect(frases.join(" ")).not.toContain("A faturação subiu");
  });

  it("mês anterior existe mas com despesas zero => frase de ausência de comparação", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 6, 5, 500)]; // maio sem despesas
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    expect(m.temAnterior).toBe(true);
    expect(m.despesasDelta).toBeNull();
    const frases = buildPerformanceInsights(m, []);
    expect(frases).toContain("Sem período anterior comparável para os títulos registados.");
    expect(frases.join(" ")).not.toContain("Os títulos registados subiram");
  });

  it("fonte de despesas ausente => nenhuma frase sobre despesas", () => {
    const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
    const m = buildPerformanceMetrics({ orders, despesasList: null, now: NOW });
    const frases = buildPerformanceInsights(m, []);
    expect(frases.some((f) => f.includes("títulos registados"))).toBe(false);
  });

  it("frases de ausência de comparação também não atribuem causas", () => {
    const orders = [order(1, 2026, 6, 10, 2000)];
    const list = [desp(1, 2026, 5, 5, 300), desp(2, 2026, 6, 5, 500)];
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: NOW });
    const texto = buildPerformanceInsights(m, []).join(" ");
    expect(texto).not.toMatch(/devido a|por causa de|em virtude de|resultado do aumento|explica-se/i);
  });
});
/* ====================================================================================
 * P2 — COBERTURA POR FONTE E MÊS EM CURSO.
 *
 * Pedidos e contas a pagar têm snapshots independentes. Sem cobertura declarada, um
 * mês fora do histórico de payables ficava com despesas 0, resultado = receitas e
 * margem 100% — uma afirmação sobre um mês de que nada se sabe. E o mês em curso era
 * comparado com um mês completo, produzindo deltas absurdos.
 * ==================================================================================== */
describe("buildMonthlyPerformance — cobertura por fonte", () => {
  // Pedidos desde janeiro; contas a pagar só a partir de abril.
  const COV = {
    firstCompleteMonth: "2026-01",
    partialMonths: [],
    closedThroughMonth: "2026-06",
    payables: { firstCompleteMonth: "2026-04" },
  };
  const orders = [
    order(1, 2026, 1, 10, 1000), order(2, 2026, 4, 10, 2000), order(3, 2026, 5, 10, 3000),
  ];
  const list = [desp(1, 2026, 4, 5, 800), desp(2, 2026, 5, 5, 900)];

  it("Caso A: mês sem cobertura de payables => despesas null", () => {
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: COV, now: NOW });
    const jan = s.find((p) => p.monthKey === "2026-01");
    expect(jan.receitas).toBe(1000);      // a receita existe e é real
    expect(jan.despesas).toBeNull();      // antes: 0
    expect(jan.resultado).toBeUndefined(); // o campo já nem existe
    expect(jan.margem).toBeUndefined();
    expect(jan.disponibilidade.despesas).toBe("unavailable");
  });

  it("Caso A: meses cobertos continuam com valores reais", () => {
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: COV, now: NOW });
    const abr = s.find((p) => p.monthKey === "2026-04");
    expect(abr).toMatchObject({ receitas: 2000, despesas: 800 });
    expect(abr.disponibilidade).toEqual({ receitas: "real", despesas: "real" });
  });

  it("Caso B: mês coberto sem títulos => zero REAL, não ausência", () => {
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 4, 10, 2000), order(2, 2026, 5, 10, 3000)],
      despesasList: [desp(1, 2026, 5, 5, 900)], coverage: COV, now: NOW,
    });
    const abr = s.find((p) => p.monthKey === "2026-04");
    expect(abr.despesas).toBe(0);         // fonte cobre abril e não houve movimento
    expect(abr.disponibilidade.despesas).toBe("real");
  });

  it("lista vazia continua a ser fonte real com zero movimentos", () => {
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 4, 10, 2000)], despesasList: [], coverage: COV, now: NOW,
    });
    expect(s[0].despesas).toBe(0);
  });

  it("Caso E: mês em partialMonths não é comparável, mas mantém valores", () => {
    const cov = { ...COV, partialMonths: ["2026-05"] };
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: cov, now: NOW });
    const maio = s.find((p) => p.monthKey === "2026-05");
    expect(maio.despesas).toBe(900);
    expect(maio.disponibilidade.despesas).toBe("partial");
    expect(maio.disponibilidade.receitas).toBe("partial");
  });

  it("mês posterior ao fecho é parcial, nunca 'real'", () => {
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 6, 10, 1000), order(2, 2026, 7, 10, 1000)],
      despesasList: [desp(1, 2026, 7, 5, 500)], coverage: COV, now: NOW,
    });
    const jul = s.find((p) => p.monthKey === "2026-07");
    expect(jul.disponibilidade.receitas).toBe("partial"); // closedThroughMonth = 2026-06
    expect(jul.despesas).toBe(500);                        // valor existe
  });

  it("sem coverage o comportamento legado é preservado (tudo real)", () => {
    const s = buildMonthlyPerformance({ orders, despesasList: list, now: NOW });
    const jan = s.find((p) => p.monthKey === "2026-01");
    expect(jan.despesas).toBe(0);
    expect(jan.disponibilidade).toEqual({ receitas: "real", despesas: "real" });
  });

  it("fonte de despesas ausente (null) continua unavailable em todos os meses", () => {
    const s = buildMonthlyPerformance({ orders, despesasList: null, coverage: COV, now: NOW });
    expect(s.every((p) => p.disponibilidade.despesas === "unavailable")).toBe(true);
    expect(s.every((p) => p.despesas === null)).toBe(true);
  });

  it("meses futuros continuam excluídos, com ou sem coverage", () => {
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 6, 10, 1000), order(2, 2026, 12, 10, 9000)],
      despesasList: [], coverage: COV, now: NOW,
    });
    expect(s.some((p) => p.monthKey === "2026-12")).toBe(false);
  });
});

describe("buildPerformanceMetrics — mês em curso e comparabilidade", () => {
  const COV = { firstCompleteMonth: "2026-01", partialMonths: [], closedThroughMonth: "2026-06" };
  // "Agora" = 14 de agosto de 2026: agosto está em curso.
  const AGOSTO = new Date(2026, 7, 14, 12, 0, 0);
  const orders = [order(1, 2026, 7, 10, 3000), order(2, 2026, 8, 11, 1000)];
  const list = [desp(1, 2026, 7, 5, 1000), desp(2, 2026, 8, 5, 2000)];

  it("Caso C: mês de referência em curso => TODOS os deltas null", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, coverage: COV, now: AGOSTO });
    expect(m.mesRef).toBe("2026-08");
    expect(m.mesEmCurso).toBe(true);
    expect(m.receitas).toBe(1000);          // os valores do mês continuam visíveis
    expect(m.despesas).toBe(2000);
    expect(m.receitasDelta).toBeNull();
    expect(m.despesasDelta).toBeNull();
    expect(m.resultadoDelta).toBeUndefined(); // antes: +106% e afins
    expect(m.margemDelta).toBeUndefined();
    expect(m.comparavel).toBe(false);
  });

  it("Caso D: mês fechado com anterior fechado => comparações permitidas", () => {
    const cov = { ...COV, closedThroughMonth: "2026-08" };
    const JULHO = new Date(2026, 6, 20, 12, 0, 0);
    const m = buildPerformanceMetrics({
      orders: [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)],
      despesasList: [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)],
      coverage: cov, now: JULHO,
    });
    expect(m.mesRef).toBe("2026-06");
    expect(m.mesEmCurso).toBe(false);
    expect(m.comparavel).toBe(true);
    expect(m.receitasDelta).toBe(100);
    expect(m.despesasDelta).toBe(25);
  });

  it("Caso E: mês anterior parcial => sem deltas, valores preservados", () => {
    const cov = { ...COV, partialMonths: ["2026-05"], closedThroughMonth: "2026-08" };
    const JULHO = new Date(2026, 6, 20, 12, 0, 0);
    const m = buildPerformanceMetrics({
      orders: [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)],
      despesasList: [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)],
      coverage: cov, now: JULHO,
    });
    expect(m.receitas).toBe(2000);
    expect(m.receitasDelta).toBeNull();
    expect(m.despesasDelta).toBeNull();
    expect(m.comparavel).toBe(false);
  });

  it("mês de referência sem cobertura de payables => títulos a null", () => {
    const cov = { ...COV, payables: { firstCompleteMonth: "2026-09" } };
    const JULHO = new Date(2026, 6, 20, 12, 0, 0);
    const m = buildPerformanceMetrics({
      orders: [order(1, 2026, 6, 10, 2000)],
      despesasList: [desp(1, 2026, 6, 5, 500)], coverage: cov, now: JULHO,
    });
    expect(m.despesas).toBeNull();
    expect(m.resultado).toBeUndefined();
    expect(m.margem).toBeUndefined();
    expect(m.margemCalculavel).toBeUndefined();
  });

  it("sem coverage, um mês de referência em curso ainda bloqueia os deltas", () => {
    // A regra do mês em curso não depende de cobertura declarada.
    const m = buildPerformanceMetrics({ orders, despesasList: list, now: AGOSTO });
    expect(m.mesEmCurso).toBe(true);
    expect(m.receitasDelta).toBeNull();
    expect(m.resultadoDelta).toBeUndefined();
  });
});

describe("buildMonthlyPerformance — mês parcial ANTES do início do histórico", () => {
  // Cobertura real da Overcel: março é parcial E anterior a firstCompleteMonth.
  const COV = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"], closedThroughMonth: "2026-06" };

  it("mês parcial fora do histórico não vira despesas 0", () => {
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 3, 15, 90000), order(2, 2026, 4, 15, 150000)],
      despesasList: [desp(1, 2026, 4, 10, 70000)], coverage: COV, now: NOW,
    });
    const mar = s.find((p) => p.monthKey === "2026-03");
    expect(mar.receitas).toBe(90000);
    expect(mar.despesas).toBeNull();
    expect(mar.resultado).toBeUndefined();
    expect(mar.margem).toBeUndefined();
    expect(mar.disponibilidade.despesas).toBe("unavailable");
  });

  it("mês parcial DENTRO do histórico mantém os valores, marcado como partial", () => {
    const cov = { ...COV, firstCompleteMonth: "2026-01", partialMonths: ["2026-05"] };
    const s = buildMonthlyPerformance({
      orders: [order(1, 2026, 5, 15, 1000)],
      despesasList: [desp(1, 2026, 5, 10, 400)], coverage: cov, now: NOW,
    });
    expect(s[0].despesas).toBe(400);
    expect(s[0].disponibilidade.despesas).toBe("partial");
  });
});

/* ====================================================================================
 * P4 — O CONTRATO OPERACIONAL NÃO FALA DE RENTABILIDADE.
 *
 * `resultado` era faturação − títulos a pagar, e `margem` o seu rácio: dois eixos
 * temporais diferentes subtraídos e apresentados como rentabilidade. Foram removidos.
 * Lucro, resultado, EBITDA e margem existem num único sítio — o bloco DRE.
 * ==================================================================================== */
describe("P4 — contrato operacional sem pseudo-rentabilidade", () => {
  const orders = [order(1, 2026, 5, 10, 1000), order(2, 2026, 6, 10, 2000)];
  const list = [desp(1, 2026, 5, 5, 400), desp(2, 2026, 6, 5, 500)];
  const COV = { firstCompleteMonth: "2026-01", partialMonths: [], closedThroughMonth: "2026-06" };

  it("1 e 2. a série não produz resultado nem margem", () => {
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: COV, now: NOW });
    for (const p of s) {
      expect("resultado" in p).toBe(false);
      expect("margem" in p).toBe(false);
      // As grandezas medidas continuam lá.
      expect(typeof p.receitas).toBe("number");
      expect(typeof p.despesas).toBe("number");
    }
  });

  it("3 e 4. as métricas não produzem resultadoDelta nem margemDelta", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, coverage: COV, now: NOW });
    for (const campo of ["resultado", "margem", "resultadoDelta", "margemDelta", "margemCalculavel"]) {
      expect(campo in m).toBe(false);
    }
    expect(m.receitasDelta).toBe(100);
    expect(m.despesasDelta).toBe(25);
  });

  it("5. o gráfico opera só com as duas grandezas medidas", () => {
    // Nenhuma chave derivada disponível para uma linha calculada.
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: COV, now: NOW });
    const chaves = Object.keys(s[0]).sort();
    expect(chaves).toEqual(["despesas", "disponibilidade", "label", "monthKey", "receitas"]);
  });

  it("10 e 11. a série só expõe as duas grandezas medidas, sem derivados", () => {
    // Garantia ESTRUTURAL, não numérica: uma coincidência de valores (receitas 100,
    // títulos 0) não deve fazer falhar um teste que quer provar ausência de campo.
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: COV, now: NOW });
    for (const p of s) {
      const numericos = Object.entries(p)
        .filter(([, v]) => typeof v === "number")
        .map(([k]) => k)
        .sort();
      expect(numericos).toEqual(["despesas", "receitas"]);
    }
  });

  it("os insights não falam de resultado nem de margem", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, coverage: COV, now: NOW });
    const cats = buildExpenseCategoryPerformance(list, m.mesRef).categorias;
    const texto = buildPerformanceInsights(m, cats).join(" ").toLowerCase();
    for (const proibido of ["resultado", "margem", "lucro", "ebitda", "rentab"]) {
      expect(texto).not.toContain(proibido);
    }
    expect(texto).toContain("faturação");
  });

  it("os insights usam vocabulário operacional para os títulos", () => {
    const m = buildPerformanceMetrics({ orders, despesasList: list, coverage: COV, now: NOW });
    const texto = buildPerformanceInsights(m, []).join(" ");
    expect(texto).toContain("títulos registados");
    expect(texto).not.toContain("As despesas subiram");
  });

  it("6, 7 e 8. a P2 fica intacta: cobertura, zero real e mês em curso", () => {
    const cov = { ...COV, payables: { firstCompleteMonth: "2026-06" } };
    const s = buildMonthlyPerformance({ orders, despesasList: list, coverage: cov, now: NOW });
    expect(s.find((p) => p.monthKey === "2026-05").despesas).toBeNull();       // sem cobertura
    expect(s.find((p) => p.monthKey === "2026-06").despesas).toBe(500);        // coberto
    expect(s.find((p) => p.monthKey === "2026-05").disponibilidade.despesas).toBe("unavailable");

    const zero = buildMonthlyPerformance({
      orders: [order(1, 2026, 6, 10, 1000)], despesasList: [], coverage: COV, now: NOW,
    });
    expect(zero[0].despesas).toBe(0);                                          // zero real

    const AGOSTO = new Date(2026, 7, 14, 12, 0, 0);
    const emCurso = buildPerformanceMetrics({
      orders: [order(1, 2026, 7, 10, 1000), order(2, 2026, 8, 10, 500)],
      despesasList: [desp(1, 2026, 7, 5, 100), desp(2, 2026, 8, 5, 200)],
      coverage: COV, now: AGOSTO,
    });
    expect(emCurso.mesEmCurso).toBe(true);
    expect(emCurso.receitasDelta).toBeNull();
    expect(emCurso.despesasDelta).toBeNull();
  });
});