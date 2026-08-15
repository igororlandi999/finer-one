// Testes dos alertas reais. Data simulada fixa: "hoje" = 15/07/2026.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildFinancialAlerts, buildSalesAlerts, buildExpenseAlerts,
  severityCounts, formatAlertTimestamp, mesPorExtenso,
} from "./alertsEngine.js";
import { formatMoney } from "../lib/currency.js";

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
    expect(vencidas.description).toContain("5.000,00");
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

describe("buildExpenseAlerts \u2014 d-cat-mom (categoria em forte subida)", () => {
  const cat = (id, m, d, valor, categoria) => ({
    ...payable(id, 2, m, d, valor),
    categoriaNome: categoria,
  });

  it("dispara quando uma categoria sobe \u2265 50% com valor atual \u2265 500 \u20ac", () => {
    const payables = [
      cat(1, 6, 5, 900, "Marketing"),  // julho: 900
      cat(2, 5, 5, 500, "Marketing"),  // junho: 500 => +80%
      cat(3, 6, 6, 400, "Compras"),
      cat(4, 5, 6, 400, "Compras"),    // estavel: nao interfere
    ];
    const g = buildExpenseAlerts(payables).find((a) => a.id === "d-cat-mom");
    expect(g).toBeDefined();
    expect(g.severity).toBe("warning");
    expect(g.description).toContain("Marketing");
    expect(g.description).toContain("80%");
    expect(g.description).toContain("900,00");
  });

  it("n\u00e3o dispara com crescimento baixo, valor irrelevante ou categoria sem hist\u00f3rico", () => {
    const payables = [
      cat(1, 6, 5, 600, "Compras"),    // +20% (<50): nao dispara
      cat(2, 5, 5, 500, "Compras"),
      cat(3, 6, 6, 450, "Servicos"),   // +125% mas valor atual < 500: nao dispara
      cat(4, 5, 6, 200, "Servicos"),
      cat(5, 6, 7, 5000, "Nova"),      // sem mes anterior (antes = 0): nao dispara
    ];
    const ids = buildExpenseAlerts(payables).map((a) => a.id);
    expect(ids).not.toContain("d-cat-mom");
  });

  it("ignora \"Sem categoria\" mesmo com subida enorme", () => {
    const payables = [
      { ...payable(1, 2, 6, 5, 9000), categoriaNome: null },  // julho, sem categoria
      { ...payable(2, 2, 5, 5, 500), categoriaNome: null },   // junho
    ];
    const ids = buildExpenseAlerts(payables).map((a) => a.id);
    expect(ids).not.toContain("d-cat-mom");
  });
});

/* ====================================================================================
 * ALERTAS MENSAIS DE DESPESAS ANCORADOS NO MÊS FINANCEIRO.
 *
 * Datas civis "YYYY-MM-DD" de propósito: payablesInMonth passa por
 * parseLocalISODate e o dia 1 tem de continuar no seu mês em qualquer fuso.
 *
 * Fixture (todos os títulos situacao 2 = pagos, para não gerar ruído operacional):
 *   maio  = 10.000  (Serviços 7.500 | Aluguel 2.000 | Marketing 500)   Fornecedor A
 *   junho = 13.000  (Aluguel 9.500 | Serviços 2.600 | Marketing 900)   Fornecedor B
 *   julho =    100  (Compras 50 | Marketing 50)                        Fornecedor C
 *
 * Julho é o último mês com títulos: é exatamente o que latestPayableMonth
 * escolheria sozinho. Cada asserção abaixo morre se ele voltar a ser escolhido.
 * ==================================================================================== */
describe("buildExpenseAlerts — mês âncora nos alertas mensais", () => {
  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2,
    dataEmissao: dataCivil,
    vencimento: dataCivil,
    valor,
    categoriaNome: categoria,
    contato: { id: fornecedor, nome: fornecedor },
  });

  const payables = [
    pg(1, "2026-05-01", 7500, "Serviços", "Fornecedor A"),
    pg(2, "2026-05-10", 2000, "Aluguel", "Fornecedor A"),
    pg(3, "2026-05-20", 500, "Marketing", "Fornecedor A"),
    pg(4, "2026-06-01", 9500, "Aluguel", "Fornecedor B"),
    pg(5, "2026-06-10", 2600, "Serviços", "Fornecedor B"),
    pg(6, "2026-06-20", 900, "Marketing", "Fornecedor B"),
    pg(7, "2026-07-01", 50, "Compras", "Fornecedor C"),
    pg(8, "2026-07-02", 50, "Marketing", "Fornecedor C"),
  ];
  const optsJunho = { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true };

  it("d-subida-mes compara junho vs maio (+30%), nunca julho vs junho", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-subida-mes");
    expect(a).toBeDefined();
    expect(a.description).toContain("30%");
    // Julho vs junho seria -99,2%: nem sequer geraria alerta.
  });

  it("d-cat-conc usa a categoria dominante de JUNHO (Aluguel)", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-cat-conc");
    expect(a).toBeDefined();
    expect(a.description).toContain("Aluguel");
    expect(a.description).not.toContain("Serviços"); // dominante de maio
    expect(a.description).not.toContain("Compras");  // dominante de julho
  });

  it("d-forn-alto usa o fornecedor de JUNHO (Fornecedor B)", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-forn-alto");
    expect(a).toBeDefined();
    expect(a.description).toContain("Fornecedor B");
    expect(a.description).not.toContain("Fornecedor A");
    expect(a.description).not.toContain("Fornecedor C");
  });

  it("d-cat-mom compara junho vs maio (Aluguel 2.000 -> 9.500 = +375%)", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-cat-mom");
    expect(a).toBeDefined();
    expect(a.description).toContain("Aluguel");
    expect(a.description).toContain("375%");
    expect(a.description).toContain(formatMoney(9500));
  });

  it("nenhum texto mensal cita julho: o mês parcial não interfere", () => {
    const texto = buildExpenseAlerts(payables, optsJunho)
      .filter((x) => ["d-subida-mes", "d-cat-conc", "d-forn-alto", "d-cat-mom"].includes(x.id))
      .map((x) => x.description).join(" ");
    expect(texto).not.toContain("Fornecedor C");
    expect(texto).not.toContain("Compras");
    expect(texto).not.toContain("€");
    expect(texto).toContain("R$");
  });

  it("mudar a âncora para maio muda categoria e fornecedor", () => {
    const optsMaio = { monthKey: "2026-05", previousMonthKey: "2026-04", comparable: true };
    const out = buildExpenseAlerts(payables, optsMaio);
    expect(out.find((x) => x.id === "d-cat-conc").description).toContain("Serviços");
    expect(out.find((x) => x.id === "d-forn-alto").description).toContain("Fornecedor A");
    // Abril não existe na fixture: sem base anterior, nada é afirmado.
    expect(out.some((x) => x.id === "d-subida-mes")).toBe(false);
    expect(out.some((x) => x.id === "d-cat-mom")).toBe(false);
  });

  it("sem opts preserva o comportamento legado (último mês com títulos = julho)", () => {
    const out = buildExpenseAlerts(payables);
    const conc = out.find((x) => x.id === "d-cat-conc");
    expect(conc).toBeDefined();
    expect(conc.description).toContain("Compras"); // julho, como antes
    expect(out.find((x) => x.id === "d-forn-alto").description).toContain("Fornecedor C");
  });
});

describe("buildExpenseAlerts — d-cat-mom com o par de meses da âncora", () => {
  const mkt = (id, dataCivil, valor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: "Marketing", contato: { id, nome: "Fornecedor X" },
  });
  // maio 500 -> junho 900 = +80%. Julho cai para 50: comparar julho contra junho
  // daria queda, e nunca um alerta de subida.
  const payables = [mkt(1, "2026-05-05", 500), mkt(2, "2026-06-05", 900), mkt(3, "2026-07-05", 50)];

  it("junho vs maio = +80% gera d-cat-mom", () => {
    const a = buildExpenseAlerts(payables, { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true })
      .find((x) => x.id === "d-cat-mom");
    expect(a).toBeDefined();
    expect(a.description).toContain("Marketing");
    expect(a.description).toContain("80%");
  });

  it("previousMonthKey omitido cai em prevMonthKey(monthKey)", () => {
    const a = buildExpenseAlerts(payables, { monthKey: "2026-06", comparable: true })
      .find((x) => x.id === "d-cat-mom");
    expect(a).toBeDefined();
    expect(a.description).toContain("80%");
  });
});

describe("buildExpenseAlerts — mês em curso (comparable=false)", () => {
  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: fornecedor, nome: fornecedor },
  });
  const payables = [
    pg(1, "2026-06-01", 1000, "Aluguel", "Fornecedor B"),
    pg(2, "2026-07-01", 900, "Compras", "Fornecedor C"),
    pg(3, "2026-07-02", 100, "Marketing", "Fornecedor C"),
  ];
  const optsJulhoParcial = {
    monthKey: "2026-07", previousMonthKey: "2026-06", comparable: false, partial: true,
  };

  it("os alertas COMPARATIVOS são suprimidos", () => {
    const ids = buildExpenseAlerts(payables, optsJulhoParcial).map((a) => a.id);
    expect(ids).not.toContain("d-subida-mes"); // seria +0% ... e mesmo +100% ficaria calado
    expect(ids).not.toContain("d-cat-mom");
  });

  it("os alertas de concentração são emitidos, mas declaram o mês em curso", () => {
    const out = buildExpenseAlerts(payables, optsJulhoParcial);
    const cat = out.find((a) => a.id === "d-cat-conc");
    const forn = out.find((a) => a.id === "d-forn-alto");
    expect(cat).toBeDefined();
    expect(cat.description).toContain("Compras");
    expect(cat.description).toContain("mês em curso");
    expect(forn).toBeDefined();
    expect(forn.description).toContain("Fornecedor C");
    expect(forn.description).toContain("mês em curso");
  });

  it("com o mês fechado, o texto não fala em mês em curso", () => {
    const out = buildExpenseAlerts(payables, { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true });
    const cat = out.find((a) => a.id === "d-cat-conc");
    expect(cat.description).toContain("Aluguel");
    expect(cat.description).not.toContain("mês em curso");
  });
});

describe("buildExpenseAlerts — alertas operacionais continuam \u00e0 data de hoje", () => {
  // "Hoje" = 15/07/2026. Âncora financeira = junho (fechado).
  const optsJunho = { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true };
  const aberto = (id, vencCivil, valor) => ({
    id, situacao: 1, dataEmissao: vencCivil, vencimento: vencCivil,
    valor, categoriaNome: "Compras", contato: { id, nome: "Fornecedor Z" },
  });

  it("t\u00edtulo vencido em julho gera d-vencidas mesmo com \u00e2ncora em junho", () => {
    const out = buildExpenseAlerts([aberto(1, "2026-07-01", 5000)], optsJunho);
    const v = out.find((a) => a.id === "d-vencidas");
    expect(v).toBeDefined();
    expect(v.description).toContain(formatMoney(5000));
  });

  it("t\u00edtulo a vencer em julho gera d-proximos7 mesmo com \u00e2ncora em junho", () => {
    const out = buildExpenseAlerts([aberto(1, "2026-07-18", 2500)], optsJunho);
    expect(out.some((a) => a.id === "d-proximos7")).toBe(true);
  });

  it("d-pendentes conta os abertos de qualquer m\u00eas, n\u00e3o s\u00f3 os da \u00e2ncora", () => {
    const lista = Array.from({ length: 12 }, (_, i) => aberto(i + 1, "2026-07-25", 100));
    const out = buildExpenseAlerts(lista, optsJunho);
    const p = out.find((a) => a.id === "d-pendentes");
    expect(p).toBeDefined();
    expect(p.description).toContain("12");
  });
});

describe("buildFinancialAlerts — rentabilidade a partir da DRE", () => {
  const fmDe = (over = {}) => ({
    revenue: { net: 100000 },
    profitability: {
      netResult: 5000, netMarginPct: 25, ebitda: 8000,
      availability: { netResult: "real", netMarginPct: "real", ebitda: "real" },
      ...over,
    },
  });

  it("netResult NEGATIVO gera alerta, com impacto não monetário", () => {
    const out = buildFinancialAlerts({ financialMetrics: fmDe({ netResult: -1200, netMarginPct: -5 }), monthKey: "2026-06" });
    const a = out.find((x) => x.id === "f-resultado");
    expect(a).toBeTruthy();
    expect(a.severity).toBe("danger");
    expect(a.description).toContain("2026-06");
    expect(a.impacto).toBeUndefined(); // nunca quantifica impacto monetário
  });

  it("netResult POSITIVO e margem saudável não geram alerta", () => {
    const out = buildFinancialAlerts({ financialMetrics: fmDe(), monthKey: "2026-06" });
    expect(out.some((x) => x.id === "f-resultado")).toBe(false);
    expect(out.some((x) => x.id === "f-margem")).toBe(false);
  });

  it("netResult NULL (sem CMV) não gera qualquer alerta financeiro", () => {
    const semCmv = fmDe({ netResult: null, netMarginPct: null, ebitda: null,
      availability: { netResult: "unavailable", netMarginPct: "unavailable", ebitda: "unavailable" } });
    expect(buildFinancialAlerts({ financialMetrics: semCmv, monthKey: "2026-06" })).toEqual([]);
  });

  it("margem líquida baixa NÃO gera alerta (é apurada após retiradas dos sócios)", () => {
    // 4% de margem líquida com resultado positivo: sem regra aprovada, sem alerta.
    const out = buildFinancialAlerts({ financialMetrics: fmDe({ netResult: 300, netMarginPct: 4 }), monthKey: "2026-06" });
    expect(out.some((x) => x.id === "f-margem")).toBe(false);
    expect(out).toEqual([]);
  });

  it("só existem duas regras financeiras: resultado negativo e EBITDA negativo", () => {
    const ids = buildFinancialAlerts({
      financialMetrics: fmDe({ netResult: -100, netMarginPct: -1, ebitda: -50 }), monthKey: "2026-06",
    }).map((a) => a.id).sort();
    expect(ids).toEqual(["f-ebitda", "f-resultado"]);
  });

  it("o texto do resultado negativo explicita que é após retiradas", () => {
    const a = buildFinancialAlerts({ financialMetrics: fmDe({ netResult: -1200 }), monthKey: "2026-06" })
      .find((x) => x.id === "f-resultado");
    expect(a.title).toContain("após retiradas");
    expect(a.description).toContain("retiradas dos sócios");
  });

  it("EBITDA negativo gera alerta (regra nova desta fase)", () => {
    const out = buildFinancialAlerts({ financialMetrics: fmDe({ ebitda: -900 }), monthKey: "2026-06" });
    expect(out.some((x) => x.id === "f-ebitda")).toBe(true);
  });

  it("manual/mixed é usado mas conserva a origem no texto", () => {
    const mixed = fmDe({ netResult: -500, availability: { netResult: "mixed", netMarginPct: "mixed", ebitda: "mixed" } });
    const a = buildFinancialAlerts({ financialMetrics: mixed, monthKey: "2026-06" }).find((x) => x.id === "f-resultado");
    expect(a.description).toContain("inclui valor manual");
  });

  it("sem financialMetrics não há alertas financeiros", () => {
    expect(buildFinancialAlerts({})).toEqual([]);
    expect(buildFinancialAlerts({ financialMetrics: null })).toEqual([]);
  });

  it("nenhum alerta de CMV é criado (sem fonte automática)", () => {
    const out = buildFinancialAlerts({ financialMetrics: fmDe(), monthKey: "2026-06" });
    expect(out.some((x) => /cmv/i.test(x.id) || /cmv/i.test(x.title))).toBe(false);
  });
});

describe("buildSalesAlerts — comparação entre períodos", () => {
  const o = (id, mesIdx, total) => ({
    id: String(id), date: new Date(2026, mesIdx, 10).toISOString(), total,
    status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  // maio=4, junho=5, julho=6 (Date é 0-based)
  const orders = [o(1, 4, 10000), o(2, 5, 12000), o(3, 6, 300)];

  it("junho vs maio (ambos fechados) permite a comparação", () => {
    const out = buildSalesAlerts(orders, { monthKey: "2026-06", comparable: true });
    // +20% não atinge o limiar de subida (>=15% gera alerta de crescimento)
    expect(out.some((a) => a.id === "v-subida")).toBe(true);
    expect(out.some((a) => a.id === "v-queda")).toBe(false);
  });

  it("mês parcial (comparable false) NÃO gera alerta categórico de queda", () => {
    const out = buildSalesAlerts(orders, { monthKey: "2026-07", comparable: false });
    expect(out.some((a) => a.id === "v-queda")).toBe(false);
    expect(out.some((a) => a.id === "v-subida")).toBe(false);
  });

  it("sem mês injetado mantém o comportamento antigo", () => {
    const out = buildSalesAlerts(orders);
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("buildSalesAlerts — produto, ticket e concentração no mês âncora", () => {
  // Date é 0-based: maio=4, junho=5, julho=6.
  const ord = (id, mesIdx, total, cliente, cid, prod, qty = 1) => ({
    id: String(id), date: new Date(2026, mesIdx, 10).toISOString(), total,
    status: "recebida", client: { id: cid, name: cliente },
    items: [{ productId: prod, code: prod, name: prod, qty, unitValue: total, total }],
  });

  // maio: Cliente A domina, produto P forte. junho: Cliente B, produto P estável.
  // julho (parcial): Cliente C, produto P em colapso e ticket muito baixo.
  const orders = [
    ord(1, 4, 9000, "Cliente A", 1, "P"), ord(2, 4, 1000, "Outro", 9, "Q"),
    ord(3, 5, 9500, "Cliente B", 2, "P"), ord(4, 5, 1000, "Outro", 9, "Q"), // Q estável maio->junho
    ord(5, 6, 200, "Cliente C", 3, "P"), ord(6, 6, 100, "Outro", 9, "Q"),
  ];
  const optsJunho = { monthKey: "2026-06", comparable: true };

  it("produto em queda compara junho vs maio, nunca julho vs junho", () => {
    const out = buildSalesAlerts(orders, optsJunho);
    const prod = out.find((a) => a.id === "v-prod");
    // P passou de 9000 (maio) para 9500 (junho): sem queda. Julho não entra.
    expect(prod).toBeFalsy();
  });

  it("sem mês âncora, o fallback antigo compararia julho (comportamento preservado)", () => {
    const out = buildSalesAlerts(orders);
    expect(out.some((a) => a.id === "v-prod")).toBe(true); // P caiu de 9500 para 200
  });

  it("comparable=false não gera queda de produto nem de ticket", () => {
    const out = buildSalesAlerts(orders, { monthKey: "2026-07", comparable: false });
    expect(out.some((a) => a.id === "v-prod")).toBe(false);
    expect(out.some((a) => a.id === "v-ticket")).toBe(false);
  });

  it("ticket médio: julho parcial não contamina o alerta de junho", () => {
    const out = buildSalesAlerts(orders, optsJunho);
    // ticket junho (5000) vs maio (5000): sem queda
    expect(out.some((a) => a.id === "v-ticket")).toBe(false);
  });

  it("concentração é a do mês âncora (Cliente B, não A nem C)", () => {
    const conc = buildSalesAlerts(orders, optsJunho).find((a) => a.id === "v-conc");
    expect(conc).toBeTruthy();
    expect(conc.description).toContain("Cliente B");
    expect(conc.description).not.toContain("Cliente A");
    expect(conc.description).not.toContain("Cliente C");
  });

  it("mudar o mês âncora muda o cliente concentrado", () => {
    const maio = buildSalesAlerts(orders, { monthKey: "2026-05", comparable: true }).find((a) => a.id === "v-conc");
    expect(maio.description).toContain("Cliente A");
    const julho = buildSalesAlerts(orders, { monthKey: "2026-07", comparable: true }).find((a) => a.id === "v-conc");
    expect(julho.description).toContain("Cliente C");
  });

  it("moeda: textos de vendas em R$, sem qualquer €", () => {
    const texto = buildSalesAlerts(orders, optsJunho).map((a) => a.description).join(" ");
    expect(texto).not.toContain("€");
    const comTicket = buildSalesAlerts([ord(1, 5, 1000, "A", 1, "P")], { monthKey: "2026-06", comparable: true })
      .map((a) => a.description).join(" ");
    expect(comTicket).toContain("R$");
  });
});

/* ====================================================================================
 * DATAS CIVIS "YYYY-MM-DD" — regressão da Fase 1.
 *
 * As datas abaixo são strings de data civil REAIS, não convertidas para timestamp.
 * new Date("2026-06-01") é lido como meia-noite UTC; em America/Sao_Paulo (UTC-3)
 * isso é 31/05 21:00 local e o pedido do dia 1 salta para maio. Estes testes falham
 * se alguém voltar a introduzir new Date(dataCivil) nesta lógica — em UTC continuam
 * a passar por acaso, mas em São Paulo não.
 *
 * Fixture (produto P em todos os pedidos):
 *   2026-05-31 -> 5.000   (maio: P=5.000, ticket 5.000)
 *   2026-06-01 -> 4.000   (junho: P=10.000, ticket 5.000)  <- o pedido em risco
 *   2026-06-15 -> 6.000
 *   2026-07-01 -> 100     (julho: fora do mês âncora)
 *
 * Se 01/06 escorregasse para maio: maio P=9.000 vs junho P=6.000 (-33%) gerava
 * v-prod, a faturação passava a queda em vez de subida e o ticket de junho virava
 * 6.000. Cada asserção abaixo mata um desses cenários.
 * ==================================================================================== */
describe("buildSalesAlerts — datas civis YYYY-MM-DD no mês âncora", () => {
  const civil = (id, dataCivil, total, cliente, cid) => ({
    id: String(id), date: dataCivil, total,
    status: "recebida", client: { id: cid, name: cliente },
    items: [{ productId: "P", code: "P", name: "P", qty: 1, unitValue: total, total }],
  });

  const orders = [
    civil(1, "2026-05-31", 5000, "Cliente A", 1),
    civil(2, "2026-06-01", 4000, "Cliente B", 2),
    civil(3, "2026-06-15", 6000, "Cliente C", 3),
    civil(4, "2026-07-01", 100, "Cliente D", 4),
  ];
  const optsJunho = { monthKey: "2026-06", comparable: true };

  it("o pedido de 01/06 pertence a junho: produto P não aparece em queda", () => {
    const out = buildSalesAlerts(orders, optsJunho);
    // junho 10.000 vs maio 5.000. Com o bug de fuso seria 6.000 vs 9.000 (-33%).
    expect(out.some((a) => a.id === "v-prod")).toBe(false);
  });

  it("o pedido de 01/06 conta na faturação de junho (subida, nunca queda)", () => {
    const out = buildSalesAlerts(orders, optsJunho);
    expect(out.some((a) => a.id === "v-subida")).toBe(true);
    expect(out.some((a) => a.id === "v-queda")).toBe(false);
  });

  it("o ticket de junho inclui 01/06 e não é deslocado para maio", () => {
    const info = buildSalesAlerts(orders, optsJunho).find((a) => a.id === "v-ticket-info");
    expect(info).toBeTruthy();
    expect(info.description).toContain(formatMoney(5000)); // (4.000 + 6.000) / 2
    expect(info.description).not.toContain(formatMoney(6000)); // seria só 15/06
    expect(info.description).not.toContain(formatMoney(100));  // julho não entra
  });

  it("maio fica apenas com 31/05: o pedido do dia 1 não recua de mês", () => {
    const maio = buildSalesAlerts(orders, { monthKey: "2026-05", comparable: true })
      .find((a) => a.id === "v-ticket-info");
    expect(maio.description).toContain(formatMoney(5000));     // apenas o pedido de 31/05
    expect(maio.description).not.toContain(formatMoney(4500)); // (5.000 + 4.000) / 2
  });
});

/* O bloco acima corre no fuso do runner. Este força America/Sao_Paulo dentro do
 * próprio teste: assim a guarda continua a valer mesmo que a CI corra em UTC,
 * onde o bug de new Date("YYYY-MM-DD") passaria despercebido. */
describe("buildSalesAlerts — datas civis com fuso forçado a America/Sao_Paulo", () => {
  const tzOriginal = process.env.TZ;
  beforeEach(() => { process.env.TZ = "America/Sao_Paulo"; });
  afterEach(() => { process.env.TZ = tzOriginal; });

  const civil = (id, dataCivil, total) => ({
    id: String(id), date: dataCivil, total,
    status: "recebida", client: { id: Number(id), name: `C${id}` },
    items: [{ productId: "P", code: "P", name: "P", qty: 1, unitValue: total, total }],
  });
  const orders = [
    civil(1, "2026-05-31", 5000),
    civil(2, "2026-06-01", 4000),
    civil(3, "2026-06-15", 6000),
    civil(4, "2026-07-01", 100),
  ];

  it("em UTC-3, 01/06 continua em junho (produto, ticket e faturação)", () => {
    expect(new Date(2026, 5, 1).getTimezoneOffset()).toBe(180); // confirma o fuso ativo
    const out = buildSalesAlerts(orders, { monthKey: "2026-06", comparable: true });
    expect(out.some((a) => a.id === "v-prod")).toBe(false);
    expect(out.some((a) => a.id === "v-queda")).toBe(false);
    expect(out.find((a) => a.id === "v-ticket-info").description).toContain(formatMoney(5000));
  });
});

describe("buildSalesAlerts — v-ticket-info usa o mês âncora, não o histórico", () => {
  // maio: ticket 1.000 | junho: ticket 5.000 | julho: ticket 100.
  // Junho vs maio é subida (+400%), logo não há v-ticket de queda: cai no informativo.
  const ord = (id, dataCivil, total) => ({
    id: String(id), date: dataCivil, total,
    status: "recebida", client: { id: Number(id), name: `C${id}` }, items: [],
  });
  const orders = [
    ord(1, "2026-05-10", 1000), ord(2, "2026-05-20", 1000),
    ord(3, "2026-06-10", 5000), ord(4, "2026-06-20", 5000),
    ord(5, "2026-07-05", 100), ord(6, "2026-07-06", 100),
  ];

  it("mostra o ticket de junho, não a média histórica nem o ticket de julho", () => {
    const out = buildSalesAlerts(orders, { monthKey: "2026-06", comparable: true });
    expect(out.some((a) => a.id === "v-ticket")).toBe(false); // não é queda
    const info = out.find((a) => a.id === "v-ticket-info");
    expect(info).toBeTruthy();
    expect(info.description).toContain(formatMoney(5000));
    expect(info.description).not.toContain(formatMoney(2033.33)); // média de todo o histórico
    expect(info.description).not.toContain(formatMoney(100));     // julho
    expect(info.description).not.toContain(formatMoney(1000));    // maio
  });

  it("sem opts mantém o comportamento legado (média de todo o histórico)", () => {
    // Sem julho não há queda de ticket, pelo que o informativo é emitido:
    // média histórica = (1.000 + 1.000 + 5.000 + 5.000) / 4 = 3.000.
    const semJulho = orders.filter((o) => !o.date.startsWith("2026-07"));
    const info = buildSalesAlerts(semJulho).find((a) => a.id === "v-ticket-info");
    expect(info).toBeTruthy();
    expect(info.description).toContain(formatMoney(3000));
    expect(info.description).not.toContain(formatMoney(5000)); // não é só junho
  });
});

/* ====================================================================================
 * MICROFASE C1 — regressões dos bugs B6, B3 e B2.
 * ==================================================================================== */

describe("severityCounts — B6: zero real não cai no fallback", () => {
  const a = (id, severity) => ({ id, severity });

  it("sem alertas positivos, resolvidos é 0 — nunca o fallback", () => {
    const m = severityCounts([a(1, "danger"), a(2, "warning"), a(3, "info")], 12);
    expect(m.resolvidos).toBe(0);
    expect(m.resolvidos).not.toBe(12);
    expect(m.criticos).toBe(1);
    expect(m.atencao).toBe(1);
    expect(m.informativos).toBe(1);
  });

  it("lista vazia é contagem conhecida: tudo a zero", () => {
    expect(severityCounts([], 12).resolvidos).toBe(0);
  });

  it("sem lista (null/undefined) a contagem é desconhecida: usa o fallback", () => {
    expect(severityCounts(null, 12).resolvidos).toBe(12);
    expect(severityCounts(undefined, 12).resolvidos).toBe(12);
    expect(severityCounts(null).resolvidos).toBe(0); // sem fallback declarado
  });

  it("com alertas positivos, conta-os e ignora o fallback", () => {
    expect(severityCounts([a(1, "success"), a(2, "success")], 12).resolvidos).toBe(2);
  });

  it("os 6 alertas reais da Overcel não produzem 12 resolvidos", () => {
    const reais = [
      a("v-ticket-info", "info"), a("d-vencidas", "danger"), a("d-proximos7", "warning"),
      a("d-pendentes", "info"), a("d-cat-conc", "warning"), a("d-forn-alto", "info"),
    ];
    const m = severityCounts(reais, 12);
    expect(m).toEqual({ criticos: 1, atencao: 2, informativos: 3, resolvidos: 0 });
  });
});

describe("mesPorExtenso — B3", () => {
  it("converte a chave de mês para texto em português", () => {
    expect(mesPorExtenso("2026-06")).toBe("junho de 2026");
    expect(mesPorExtenso("2026-01")).toBe("janeiro de 2026");
    expect(mesPorExtenso("2026-03")).toBe("março de 2026");
    expect(mesPorExtenso("2025-12")).toBe("dezembro de 2025");
  });

  it("chave inválida devolve null — a frase omite o mês em vez de o inventar", () => {
    expect(mesPorExtenso(null)).toBeNull();
    expect(mesPorExtenso("")).toBeNull();
    expect(mesPorExtenso("2026-13")).toBeNull();
    expect(mesPorExtenso("junho")).toBeNull();
  });
});

describe("B3 — os alertas mensais nomeiam o mês que o motor usou", () => {
  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: fornecedor, nome: fornecedor },
  });
  const payables = [
    pg(1, "2026-05-01", 2000, "Serviços", "Fornecedor A"),
    pg(4, "2026-06-01", 9500, "Aluguel", "Fornecedor B"),
    pg(6, "2026-06-20", 900, "Marketing", "Fornecedor B"),
    pg(7, "2026-07-01", 900, "Compras", "Fornecedor C"),
  ];
  const optsJunho = { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true };

  it("d-cat-conc escreve o mês fechado por extenso", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-cat-conc");
    expect(a.description).toContain("junho de 2026");
    expect(a.description).toContain("Aluguel");
    expect(a.description).not.toContain("mês em curso");
  });

  it("d-forn-alto escreve o mês fechado por extenso", () => {
    const a = buildExpenseAlerts(payables, optsJunho).find((x) => x.id === "d-forn-alto");
    expect(a.description).toContain("junho de 2026");
    expect(a.description).toContain("Fornecedor B");
  });

  it("a âncora NÃO mudou: o mês citado é o do motor, não o último mês com títulos", () => {
    const texto = buildExpenseAlerts(payables, optsJunho)
      .filter((x) => ["d-cat-conc", "d-forn-alto"].includes(x.id))
      .map((x) => x.description).join(" ");
    expect(texto).not.toContain("julho de 2026"); // último mês com títulos
    expect(texto).not.toContain("agosto");
    expect(texto).not.toContain("Fornecedor C");
  });

  it("mês em curso: nomeia o mês E continua a declarar a parcialidade", () => {
    const out = buildExpenseAlerts(payables, {
      monthKey: "2026-07", previousMonthKey: "2026-06", comparable: false, partial: true,
    });
    const cat = out.find((a) => a.id === "d-cat-conc");
    expect(cat.description).toContain("julho de 2026");
    expect(cat.description).toContain("mês em curso");
    expect(cat.description).toContain("Até ao momento");
  });

  it("v-ticket-info nomeia o mês âncora quando existe", () => {
    const orders = [order(1, 5, 10, 4000), order(2, 5, 20, 6000)];
    const info = buildSalesAlerts(orders, { monthKey: "2026-06", comparable: false })
      .find((a) => a.id === "v-ticket-info");
    expect(info.description).toContain("junho de 2026");
    expect(info.description).toContain(formatMoney(5000));
  });

  it("sem mês âncora, o ticket é do histórico e nenhum mês é afirmado", () => {
    const orders = [order(1, 5, 10, 4000), order(2, 5, 20, 6000)];
    const info = buildSalesAlerts(orders).find((a) => a.id === "v-ticket-info");
    expect(info.description).not.toContain(" de 2026");
    expect(info.description).toContain(formatMoney(5000));
  });
});

/* ====================================================================================
 * B2 — TIMESTAMP: contrato e robustez de fuso.
 *
 * CONTRATO: `formatAlertTimestamp` rende o instante na HORA LOCAL do ambiente que
 * gera o alerta (getDate/getMonth/getHours/getMinutes). Não usa toLocaleString, não
 * fixa timeZone e não usa UTC. É o correto para um carimbo mostrado ao utilizador.
 *
 * POR QUE ESTES TESTES NÃO FIXAM "09:05":
 * um literal de hora só é estável se o instante for construído com a MESMA noção de
 * local usada na leitura. Ambientes onde a construção e a leitura divergem (foi o
 * caso reportado, com desvio fixo de +3h) faziam falhar um teste correto. A expetativa
 * passa a ser DERIVADA do mesmo instante através de Intl.DateTimeFormat — uma segunda
 * implementação, independente dos getters, do que é "hora local". O teste continua a
 * validar semântica: se a produção passasse a render em UTC, falharia em qualquer
 * fuso diferente de UTC (caso coberto explicitamente abaixo).
 * ==================================================================================== */
describe("B2 — timestamp é o momento da geração, injetado e determinístico", () => {
  // Instante EXPLÍCITO (offset declarado): não depende de componentes locais.
  const GERADO_EM = new Date("2026-08-14T12:05:00Z");

  /* Referência independente: mesma timezone local, mas via Intl em vez dos getters.
   * Não é tautológica com a produção — é outra via para o mesmo conceito. */
  const esperadoLocal = (instante) => {
    const p = new Intl.DateTimeFormat("pt-PT", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(instante).reduce((acc, x) => (acc[x.type] = x.value, acc), {});
    return `${p.day}/${p.month}/${p.year}, ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
  };

  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: fornecedor, nome: fornecedor },
  });

  it("formatAlertTimestamp é puro: mesmo instante, mesmo resultado, sem ler o relógio", () => {
    expect(formatAlertTimestamp(GERADO_EM)).toBe(esperadoLocal(GERADO_EM));
    expect(formatAlertTimestamp(GERADO_EM)).toBe(formatAlertTimestamp(GERADO_EM));
    // Chamar noutro "agora" não muda o resultado: não há relógio escondido.
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    expect(formatAlertTimestamp(GERADO_EM)).toBe(esperadoLocal(GERADO_EM));
    vi.setSystemTime(HOJE);
  });

  it("rende hora LOCAL e não UTC (verificado quando o ambiente não está em UTC)", () => {
    const emUtc = "14/08/2026, 12:05";
    if (GERADO_EM.getTimezoneOffset() !== 0) {
      expect(formatAlertTimestamp(GERADO_EM)).not.toBe(emUtc);
    } else {
      expect(formatAlertTimestamp(GERADO_EM)).toBe(emUtc);
    }
  });

  it("o formato é dd/mm/aaaa, hh:mm com zeros à esquerda", () => {
    expect(formatAlertTimestamp(GERADO_EM)).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });

  it("instantes distintos produzem carimbos distintos, na ordem correta", () => {
    const a = new Date("2026-08-14T12:05:00Z");
    const b = new Date("2026-08-14T13:35:00Z"); // +90 min
    expect(formatAlertTimestamp(a)).toBe(esperadoLocal(a));
    expect(formatAlertTimestamp(b)).toBe(esperadoLocal(b));
    expect(formatAlertTimestamp(a)).not.toBe(formatAlertTimestamp(b));
  });

  it("data inválida não inventa momento", () => {
    expect(formatAlertTimestamp(new Date("xpto"))).toBe("—");
  });

  it("buildExpenseAlerts carimba todos os alertas com o now injetado", () => {
    const out = buildExpenseAlerts(
      [pg(1, "2026-06-01", 9500, "Aluguel", "Fornecedor B")],
      { monthKey: "2026-06", previousMonthKey: "2026-05", comparable: true, now: GERADO_EM },
    );
    expect(out.length).toBeGreaterThan(0);
    for (const a of out) expect(a.timestamp).toBe(esperadoLocal(GERADO_EM));
  });

  it("buildSalesAlerts carimba com o now injetado", () => {
    const out = buildSalesAlerts([order(1, 5, 10, 4000)], { monthKey: "2026-06", now: GERADO_EM });
    expect(out.length).toBeGreaterThan(0);
    for (const a of out) expect(a.timestamp).toBe(esperadoLocal(GERADO_EM));
  });

  it("buildFinancialAlerts carimba com o now injetado", () => {
    const out = buildFinancialAlerts({
      financialMetrics: { profitability: { netResult: -100, ebitda: -50, availability: { netResult: "real", ebitda: "real" } } },
      monthKey: "2026-06", now: GERADO_EM,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const a of out) expect(a.timestamp).toBe(esperadoLocal(GERADO_EM));
  });

  it("o now injetado manda: dois instantes diferentes dão carimbos diferentes", () => {
    const outro = new Date("2026-09-02T08:00:00Z");
    const alerta = (now) => buildExpenseAlerts(
      [pg(1, "2026-06-01", 9500, "Aluguel", "Fornecedor B")],
      { monthKey: "2026-06", comparable: true, now },
    )[0].timestamp;
    expect(alerta(GERADO_EM)).toBe(esperadoLocal(GERADO_EM));
    expect(alerta(outro)).toBe(esperadoLocal(outro));
    expect(alerta(GERADO_EM)).not.toBe(alerta(outro));
  });

  it("todos os alertas da MESMA execução partilham o instante", () => {
    const out = buildExpenseAlerts(
      [pg(1, "2026-06-01", 9500, "Aluguel", "Forn B"), pg(2, "2026-06-02", 100, "Aluguel", "Forn B")],
      { monthKey: "2026-06", comparable: true, now: GERADO_EM },
    );
    expect(new Set(out.map((a) => a.timestamp)).size).toBe(1);
  });

  it("sem now injetado usa o relógio do chamador — nunca a string \"Hoje\"", () => {
    const out = buildExpenseAlerts(
      [pg(1, "2026-06-01", 9500, "Aluguel", "Fornecedor B")],
      { monthKey: "2026-06", comparable: true },
    );
    // HOJE é o instante posto por vi.setSystemTime; a expetativa deriva do MESMO instante.
    expect(out[0].timestamp).toBe(esperadoLocal(HOJE));
    expect(out[0].timestamp).not.toBe("Hoje");
  });

  it("o now injetado também manda nos alertas operacionais (vencidas/a vencer)", () => {
    // Título que vence a 20/08: a vencer se "hoje" for 14/08, vencido se for 25/08.
    const p = [{ id: 9, situacao: 1, vencimento: "2026-08-20", dataEmissao: "2026-07-01", valor: 500, categoriaNome: "Aluguel", contato: { id: 1, nome: "F" } }];
    const antes = buildExpenseAlerts(p, { now: new Date("2026-08-14T12:00:00Z") }).map((a) => a.id);
    const depois = buildExpenseAlerts(p, { now: new Date("2026-08-25T12:00:00Z") }).map((a) => a.id);
    expect(antes).not.toContain("d-vencidas");
    expect(depois).toContain("d-vencidas");
  });
});