// Testes do contrato de gating do dataset: a semântica de payables
// (undefined = ausência => mock/Demo; [] = zero títulos reais => zeros reais).
// Também protege a remoção dos campos mortos (alertas.metrics, diagnostics).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset, normalizeOrder } from "./blingDataService.js";

const HOJE = new Date(2026, 6, 15, 12, 0, 0);
const iso = (y, m, d) => new Date(y, m, d).toISOString();

const orders = [
  { id: 1, date: iso(2026, 6, 5), total: 5000, status: "recebida", client: { id: 1, name: "A" }, items: [] },
  { id: 2, date: iso(2026, 5, 5), total: 4000, status: "recebida", client: { id: 2, name: "B" }, items: [] },
];
const payablesComItens = [
  {
    id: 1, situacao: 2,
    vencimento: iso(2026, 6, 7), dataEmissao: iso(2026, 6, 7),
    valor: 1200, categoriaNome: "Compras", contato: { id: 1, nome: "F1" },
  },
];

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

describe("buildSalesDataset — gating de payables", () => {
  it("payables undefined: despesas, fornecedores e diagn\u00f3stico ficam null (mock + Demo)", () => {
    const ds = buildSalesDataset({ orders, payables: undefined });
    expect(ds.despesas).toBeNull();
    expect(ds.fornecedores).toBeNull();
    expect(ds.diagnostico).toBeNull();
    expect(ds.resumo.metrics.despesas).toBeUndefined(); // mock preenche na tela
    expect(ds.resumo.metrics.receitas).toBe(5000);
  });

  it("payables []: zeros reais e diagn\u00f3stico calculado (sem Demo indevido)", () => {
    const ds = buildSalesDataset({ orders, payables: [] });
    expect(ds.despesas).not.toBeNull();
    expect(ds.fornecedores).not.toBeNull();
    expect(ds.diagnostico).not.toBeNull();
    expect(ds.resumo.metrics.despesas).toBe(0);
    expect(ds.resumo.metrics.resultado).toBe(5000);
    expect(ds.fornecedores.metrics.saldoPagar).toBe(0);
  });

  it("payables com itens: dataset completo real", () => {
    const ds = buildSalesDataset({ orders, payables: payablesComItens });
    expect(ds.despesas).not.toBeNull();
    expect(ds.resumo.metrics.despesas).toBe(1200);
    expect(ds.resumo.metrics.resultado).toBe(3800);
    expect(Array.isArray(ds.alertas.list)).toBe(true);
    expect(ds.diagnostico.score).toBeGreaterThanOrEqual(0);
  });
});

/* ====================================================================================
 * COBERTURA PRÓPRIA DAS CONTAS A PAGAR.
 *
 * Pedidos e contas a pagar vêm de snapshots distintos: coverage.payables pode
 * fechar noutro mês. O mês âncora dos alertas MENSAIS de despesas tem de seguir
 * essa cobertura, não o mês da receita (financeiro.monthKey).
 *
 * Datas civis "YYYY-MM-DD" de propósito: o dia 1 tem de continuar no seu mês.
 * ==================================================================================== */
describe("buildSalesDataset — mês âncora das contas a pagar", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoria, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: fornecedor, nome: fornecedor },
  });

  const ordersMJJ = [ord(1, "2026-05-10", 50000), ord(2, "2026-06-10", 60000), ord(3, "2026-07-05", 900)];
  // Cada mês tem uma categoria e um fornecedor próprios: o texto do alerta
  // identifica sem ambiguidade qual mês foi escolhido.
  const payablesMJJ = [
    pg(1, "2026-05-01", 2000, "Serviços de terceiros", "Forn A"),
    pg(2, "2026-06-01", 9500, "Aluguel", "Forn B"),
    pg(3, "2026-07-01", 5000, "Compras de fornecedores", "Forn C"),
  ];
  // Pedidos fechados até junho em todos os cenários; só a cobertura dos payables muda.
  const base = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const alertaDespesa = (ds, id) => ds.alertas.list.find((a) => a.id === id);

  it("A. payables fechados até julho: despesas usam julho, vendas continuam em junho", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ, payables: payablesMJJ,
      coverage: { ...base, payables: { closedThroughMonth: "2026-07" } },
    });
    expect(ds.financeiro.monthKey).toBe("2026-06");           // receita/DRE
    expect(ds.financeiro.payables.monthKey).toBe("2026-07");  // contas a pagar
    expect(ds.financeiro.payables.previousMonthKey).toBe("2026-06");
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("Compras");
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn C");
  });

  it("B. payables fechados só até maio: despesas usam maio, nunca junho", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ, payables: payablesMJJ,
      coverage: { ...base, payables: { closedThroughMonth: "2026-05" } },
    });
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.monthKey).toBe("2026-05");
    const cat = alertaDespesa(ds, "d-cat-conc");
    expect(cat.description).toContain("Serviços de terceiros");
    expect(cat.description).not.toContain("Aluguel"); // junho
    expect(cat.description).not.toContain("Compras"); // julho
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn A");
  });

  it("C. mesma cobertura para ambos: comportamento preservado (junho)", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ, coverage: base });
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.monthKey).toBe("2026-06");
    expect(ds.financeiro.payables.comparable).toBe(true);
    expect(ds.financeiro.payables.partial).toBe(false);
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("Aluguel");
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("Forn B");
    // Julho tem títulos e seria o "último mês com títulos": não pode ser escolhido.
    expect(alertaDespesa(ds, "d-cat-conc").description).not.toContain("Compras");
  });

  it("D. sem payables: contexto vazio e nenhum alerta mensal de despesas", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: undefined, coverage: base });
    expect(ds.financeiro.payables.monthKey).toBeNull();
    expect(ds.financeiro.payables.comparable).toBe(false);
    expect(ds.alertas.list.some((a) => a.id.startsWith("d-"))).toBe(false);
  });

  it("a comparabilidade das despesas não herda a da receita", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ, coverage: base });
    // Sem CMV nem frete, a receita líquida é indisponível => receita não comparável.
    expect(ds.financeiro.comparable).toBe(false);
    // As contas a pagar de maio e junho estão ambas fechadas => comparáveis.
    expect(ds.financeiro.payables.comparable).toBe(true);
    expect(alertaDespesa(ds, "d-subida-mes")).toBeDefined(); // 2.000 -> 9.500
  });

  it("sem nenhum mês fechado de payables, usa o parcial e declara-o", () => {
    const ds = buildSalesDataset({
      orders: ordersMJJ,
      payables: [pg(1, "2026-07-01", 5000, "Compras de fornecedores", "Forn C")], // só julho
      coverage: { ...base, payables: { closedThroughMonth: "2026-06" } },
    });
    expect(ds.financeiro.payables.monthKey).toBe("2026-07");
    expect(ds.financeiro.payables.partial).toBe(true);
    expect(ds.financeiro.payables.comparable).toBe(false);
    expect(alertaDespesa(ds, "d-cat-conc").description).toContain("mês em curso");
    expect(ds.alertas.list.some((a) => a.id === "d-subida-mes")).toBe(false);
    expect(ds.alertas.list.some((a) => a.id === "d-cat-mom")).toBe(false);
  });

  it("sem coverage injetada usa a da empresa ativa (contrato preservado)", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ });
    expect(ds.financeiro.payables.monthKey).toBe("2026-06"); // closedThroughMonth da Overcel
  });
});

/* ====================================================================================
 * CONTAS A PAGAR ESTE MÊS — KPI operacional do Resumo.
 *
 * Responde a "quanto tenho de pagar neste mês civil". Soma por VENCIMENTO e o mês
 * é o civil corrente — nunca dataEmissao, nunca competência, nunca
 * financeiro.payables.monthKey (mês fechado), nunca latestMonthKey(orders).
 *
 * "Hoje" nestes testes = 13/08/2026, o cenário real que expôs o defeito: pedidos
 * em agosto, cobertura fechada em junho, contas a vencer em agosto.
 * ==================================================================================== */
describe("buildResumo — contas a pagar do mês civil corrente", () => {
  const HOJE_AGOSTO = new Date(2026, 7, 13, 12, 0, 0);
  beforeEach(() => { vi.setSystemTime(HOJE_AGOSTO); });

  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, emissao, vencimento, valor, situacao = 1) => ({
    id, situacao, dataEmissao: emissao, vencimento, valor,
    categoriaNome: "Fixas", contato: { id: 1, nome: "Forn" },
  });
  // Cobertura real da Overcel: fechada em junho enquanto se está em agosto.
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const orders = [ord(1, "2026-06-10", 180000), ord(2, "2026-08-11", 211448.77)];

  it("1. usa o mês civil de now: emissão em julho, vencimento em agosto", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(10, "2026-07-20", "2026-08-25", 1000)], coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
    expect(ds.resumo.metrics.contasPagar).toBe(1000);
  });

  it("2. independente de closedThroughMonth e da âncora de fecho", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-05-25", "2026-06-10", 40000, 2), pg(11, "2026-07-20", "2026-08-05", 38170.57)],
      coverage: cov,
    });
    // A âncora de fecho continua a existir e a apontar junho — só não manda neste card.
    expect(ds.financeiro.payables.monthKey).toBe("2026-06");
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
    expect(ds.resumo.metrics.contasPagar).toBe(38170.57);
    expect(ds.resumo.metrics.contasPagar).not.toBe(40000); // valor do mês fechado
  });

  it("2b. sem pedidos em agosto, o mês do KPI continua a ser agosto", () => {
    // Discrimina o mês civil do mês dos PEDIDOS: aqui o último pedido é de junho.
    const ds = buildSalesDataset({
      orders: [ord(1, "2026-06-10", 180000)],
      payables: [pg(10, "2026-05-25", "2026-06-10", 40000, 2), pg(11, "2026-07-20", "2026-08-05", 38170.57)],
      coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
    expect(ds.resumo.metrics.contasPagarMonthKey).not.toBe("2026-06"); // latestMonthKey(orders)
    expect(ds.resumo.metrics.contasPagar).toBe(38170.57);
  });

  it("3. título que vence dia 25 entra já no dia 13", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-07-20", "2026-08-05", 38170.57), pg(11, "2026-07-28", "2026-08-25", 97780.27)],
      coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagar).toBe(135950.84); // vencido + ainda por vencer
  });

  it("4. título de setembro não entra em agosto", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(10, "2026-08-01", "2026-09-10", 5000)], coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
    expect(ds.resumo.metrics.contasPagar).toBe(0);
  });

  it("5. título sem vencimento não entra", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [{ id: 9, situacao: 1, dataEmissao: "2026-08-05", vencimento: null, valor: 700, contato: {} }],
      coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagar).toBe(0);
  });

  it("6. título cancelado não entra", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-08-01", "2026-08-20", 900), pg(11, "2026-08-01", "2026-08-21", 500, 5)],
      coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagar).toBe(900);
  });

  it("7. payables [] é zero real, não indisponível", () => {
    const ds = buildSalesDataset({ orders, payables: [], coverage: cov });
    expect(ds.resumo.metrics.contasPagar).toBe(0);
    expect(ds.resumo.metrics.contasPagar).not.toBeNull();
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
  });

  it("8. fonte ausente continua a não existir (mock + Demo na tela)", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, coverage: cov });
    expect(ds.resumo.metrics.contasPagar).toBeUndefined();
    expect(ds.resumo.metrics.contasPagarMonthKey).toBeUndefined();
    expect(ds.resumo.metrics.despesas).toBeUndefined();
  });

  it("o novo KPI não expõe delta: mês em curso vs mês completo não compara", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-06-25", "2026-07-10", 45000, 2), pg(11, "2026-07-28", "2026-08-25", 1000)],
      coverage: cov,
    });
    expect(ds.resumo.metrics.contasPagarDelta).toBeUndefined();
  });
});

/* ====================================================================================
 * CONTRATO LEGADO — congelado enquanto o chatEngine não for migrado.
 *
 * `despesas` e `resultado` são consumidos pelo chatEngine (monthMetricsCards). Se o
 * novo KPI os arrastasse consigo, o Chat passaria a mostrar outros números sem ter
 * sido revisto. Estes testes existem para impedir esse efeito colateral silencioso:
 * são a fronteira entre o contrato novo e o antigo, não um aval à lógica antiga.
 * ==================================================================================== */
describe("buildResumo — campos legados do Chat não mudam com o novo KPI", () => {
  const HOJE_AGOSTO = new Date(2026, 7, 13, 12, 0, 0);
  beforeEach(() => { vi.setSystemTime(HOJE_AGOSTO); });

  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, emissao, vencimento, valor, situacao = 1) => ({
    id, situacao, dataEmissao: emissao, vencimento, valor,
    categoriaNome: "Fixas", contato: { id: 1, nome: "Forn" },
  });
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };

  /* Fixture desenhada para que os dois contratos NUNCA coincidam:
   *   pedidos param em junho          -> latestMonthKey(orders) = 2026-06
   *   "hoje" é 13/08                  -> mês civil               = 2026-08
   *   título A: emitido e vencido em junho (40.000)  -> só o legado o vê
   *   título B: emitido em julho, vence em agosto (1.000) -> só o novo KPI o vê
   * Uma implementação que faça metrics.despesas = metrics.contasPagar morre aqui. */
  const orders = [ord(1, "2026-05-10", 100000), ord(2, "2026-06-10", 180000)];
  const payables = [
    pg(10, "2026-06-05", "2026-06-20", 40000, 2),
    pg(11, "2026-07-20", "2026-08-25", 1000),
  ];

  it("contasPagar usa agosto pelo vencimento; despesas mantém junho pela emissão", () => {
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;

    expect(m.contasPagarMonthKey).toBe("2026-08");
    expect(m.contasPagar).toBe(1000);

    // Legado: mês dos pedidos (junho) + payableDate (emissão). Valores diferentes.
    expect(m.despesas).toBe(40000);
    expect(m.despesas).not.toBe(m.contasPagar);
  });

  it("resultado legado continua receita(junho) − despesas(junho)", () => {
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;
    expect(m.receitas).toBe(180000);              // junho
    expect(m.resultado).toBe(140000);             // 180.000 − 40.000
    expect(m.resultado).not.toBe(179000);         // seria 180.000 − contasPagar
  });

  it("os deltas legados continuam a ser calculados", () => {
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;
    // Maio não tem contas a pagar => sem base anterior => delta null (regra antiga).
    expect(m.despesasDelta).toBeNull();
    expect(m.resultadoDelta).toBe(40);            // (140.000 − 100.000) / 100.000
  });

  it("com base anterior, o delta legado mantém a fórmula antiga", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(1, "2026-05-05", "2026-05-20", 20000, 2), ...payables],
      coverage: cov,
    });
    expect(ds.resumo.metrics.despesasDelta).toBe(100); // 20.000 -> 40.000
  });
});

/* ====================================================================================
 * DOIS SINAIS DISTINTOS: parcialidade TEMPORAL vs CLASSIFICAÇÃO incompleta.
 *
 * `partial` responde a "o período está aberto?"; `classificacaoIncompleta` responde a
 * "conheço a natureza dos títulos?". São independentes e podem coexistir. Colapsá-los
 * num só fazia os alertas chamarem "mês em curso" a um junho fechado só porque as
 * contas não tinham categoria reconhecida.
 * ==================================================================================== */
describe("financeiro.payables — parcialidade temporal separada da classificação", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoriaNome, fornecedor) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil, valor,
    categoriaNome, contato: { id: fornecedor, nome: fornecedor },
  });
  // Junho fechado; julho fica temporalmente parcial.
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const covJulhoAberto = { ...cov, payables: { closedThroughMonth: "2026-06" } };
  const orders = [ord(1, "2026-05-10", 100000), ord(2, "2026-06-10", 180000)];
  const alertaDespesa = (ds, id) => ds.alertas.list.find((a) => a.id === id);

  it("Caso 1: mês fechado + classificação completa", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-05-05", 20000, "Aluguel", "F"), pg(11, "2026-06-05", 40000, "Aluguel", "F")],
      coverage: cov,
    });
    expect(ds.financeiro.payables).toMatchObject({
      monthKey: "2026-06", partial: false, classificacaoIncompleta: false, comparable: true,
    });
  });

  it("Caso 2: mês FECHADO + classificação incompleta — nunca 'mês em curso'", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-05-05", 20000, null, "Forn A"), pg(11, "2026-06-05", 40000, null, "Forn B")],
      coverage: cov,
    });
    const fp = ds.financeiro.payables;
    expect(fp.monthKey).toBe("2026-06");
    expect(fp.partial).toBe(false);                 // junho está fechado
    expect(fp.classificacaoIncompleta).toBe(true);  // mas não sabemos a natureza
    expect(fp.comparable).toBe(false);              // comparar mínimos conhecidos seria enganoso
    expect(fp.availability).toBe("partial");

    const textos = ds.alertas.list.map((a) => `${a.title} ${a.description}`).join(" ");
    expect(textos).not.toContain("mês em curso");
    expect(textos).not.toContain("Até ao momento");
    // Comparação insegura não é afirmada.
    expect(ds.alertas.list.some((a) => a.id === "d-subida-mes")).toBe(false);
    expect(ds.alertas.list.some((a) => a.id === "d-cat-mom")).toBe(false);
    // O alerta de concentração do próprio mês continua, com o texto de mês fechado.
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("das despesas do mes");
  });

  it("Caso 3: mês em CURSO + classificação completa", () => {
    const ds = buildSalesDataset({
      orders: [ord(1, "2026-06-10", 180000)],
      payables: [pg(11, "2026-07-05", 40000, "Aluguel", "F")], // só julho, ainda aberto
      coverage: covJulhoAberto,
    });
    const fp = ds.financeiro.payables;
    expect(fp.monthKey).toBe("2026-07");
    expect(fp.partial).toBe(true);
    expect(fp.classificacaoIncompleta).toBe(false);
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("mês em curso");
  });

  it("Caso 4: mês em curso + classificação incompleta — os dois sinais coexistem", () => {
    const ds = buildSalesDataset({
      orders: [ord(1, "2026-06-10", 180000)],
      payables: [pg(11, "2026-07-05", 40000, null, "F")],
      coverage: covJulhoAberto,
    });
    expect(ds.financeiro.payables).toMatchObject({
      monthKey: "2026-07", partial: true, classificacaoIncompleta: true, comparable: false,
    });
  });

  it("Caso 5: fonte ausente continua unavailable, não vira classificação incompleta", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, coverage: cov });
    const fp = ds.financeiro.payables;
    expect(fp.monthKey).toBeNull();
    expect(fp.availability).toBeNull();
    expect(fp.partial).toBe(false);
    expect(fp.classificacaoIncompleta).toBe(false);
    expect(fp.comparable).toBe(false);
  });

  it("exclusões deliberadas (compras) não contam como classificação incompleta", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-05-05", 20000, "Compras de fornecedores", "F"),
                 pg(11, "2026-06-05", 40000, "Compras de fornecedores", "F")],
      coverage: cov,
    });
    expect(ds.financeiro.payables.classificacaoIncompleta).toBe(false);
    expect(ds.financeiro.payables.comparable).toBe(true);
  });

  it("um só título sem categoria basta para marcar o mês", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(10, "2026-05-05", 20000, "Aluguel", "F"),
                 pg(11, "2026-06-05", 40000, "Aluguel", "F"),
                 pg(12, "2026-06-06", 100, null, "F")],
      coverage: cov,
    });
    expect(ds.financeiro.payables.partial).toBe(false);
    expect(ds.financeiro.payables.classificacaoIncompleta).toBe(true);
  });
});

describe("buildSalesDataset — catálogo documental (sales.documents)", () => {
  const ord = (id, over = {}) => ({
    id, numero: 1318, date: "2026-06-01", total: 920, status: "recebida",
    client: { id: 7, name: "Cliente Alfa" }, items: [], ...over,
  });
  const pag = (id, over = {}) => ({
    id, situacao: 2, valor: 3180, dataEmissao: "2026-05-28", vencimento: "2026-06-10",
    numeroDocumento: "V/452", categoriaNome: "Compras",
    contato: { id: 31, nome: "Fornecedor Beta" }, ...over,
  });

  it("expõe documents sem quebrar os contratos existentes", () => {
    const ds = buildSalesDataset({ orders: [ord(10, { notaFiscalId: 111 })], payables: [pag(10)] });
    expect(ds.documents.available).toBe(true);
    expect(ds.documents.list).toHaveLength(2);
    expect(ds.documents.stats).toMatchObject({ total: 2, withFile: 0, metadataOnly: 2 });
    // contratos anteriores intactos
    expect(ds.alertas).toBeDefined();
    expect(ds.financeiro).toBeDefined();
    expect(ds.despesas).not.toBeNull();
  });

  it("usa a moeda da empresa ativa, nunca EUR fixo", () => {
    const ds = buildSalesDataset({ orders: [ord(10, { notaFiscalId: 111 })] });
    expect(ds.documents.list[0].currency).toBe("BRL");
  });

  it("payables ausentes: só documentos de pedidos, sem inventar", () => {
    const ds = buildSalesDataset({ orders: [ord(10, { notaFiscalId: 111 })], payables: undefined });
    expect(ds.documents.list).toHaveLength(1);
    expect(ds.documents.list[0].relatedEntity.type).toBe("order");
  });

  it("sem nota fiscal e sem numeroDocumento, o catálogo fica vazio (zero real)", () => {
    const ds = buildSalesDataset({ orders: [ord(10)], payables: [pag(11, { numeroDocumento: null })] });
    expect(ds.documents.available).toBe(true);
    expect(ds.documents.list).toEqual([]);
  });

  it("normalizeOrder preserva a metadata documental do snapshot", () => {
    const o = normalizeOrder({
      id: 26576405725, numero: 1318, data: "2026-08-11", total: 920,
      situacao: { id: 9, valor: 9 }, contato: { id: 7, nome: "Cliente Alfa" },
      notaFiscalId: 26576410855, dataSaida: "2026-08-11", itens: [],
    });
    expect(o.notaFiscalId).toBe(26576410855);
    expect(o.dataSaida).toBe("2026-08-11");
    // Campos financeiros do snapshot continuam FORA (pendência da DRE, não desta fase).
    expect(o.frete).toBeUndefined();
    expect(o.totalProdutos).toBeUndefined();
  });

  it("pedido sem nota fica com notaFiscalId null, nunca inventado", () => {
    const o = normalizeOrder({ id: 1, numero: 2, data: "2026-06-01", total: 10, itens: [] });
    expect(o.notaFiscalId).toBeNull();
    expect(o.dataSaida).toBeNull();
  });
});

describe("buildSalesDataset — campos mortos removidos", () => {
  it("alertas exp\u00f5e apenas { list } e o dataset n\u00e3o tem diagnostics", () => {
    const ds = buildSalesDataset({ orders, payables: payablesComItens });
    expect("metrics" in ds.alertas).toBe(false);
    expect("diagnostics" in ds).toBe(false);
  });
});

describe("buildSalesDataset — allOpenInvoices e saldo restante (fornecedores)", () => {
  const orders2 = [];
  const parcialPay = {
    id: 1, situacao: 1, valor: 1000, saldo: 200,
    vencimento: iso(2026, 6, 20), dataEmissao: iso(2026, 6, 1),
    contato: { id: 1, nome: "F, Lda" }, numeroDocumento: "FC 1",
  };
  const parcialRec = {
    id: 2, situacao: 1, valor: 800, saldo: 300,
    vencimento: iso(2026, 6, 22), dataEmissao: iso(2026, 6, 2),
    contato: { id: 2, nome: "C, Lda" }, numeroDocumento: "FT 1",
  };

  it("fornecedores expõe allOpenInvoices e usa saldo restante no valor", () => {
    const ds = buildSalesDataset({ orders: orders2, payables: [parcialPay] });
    expect(Array.isArray(ds.fornecedores.allOpenInvoices)).toBe(true);
    expect(ds.fornecedores.allOpenInvoices[0].valor).toBe(200); // saldo, não 1000
    expect(ds.fornecedores.metrics.saldoPagar).toBe(200);       // pendingPayables usa saldo
  });

  it("recebíveis expõe allOpenInvoices com saldo restante", () => {
    const ds = buildSalesDataset({ orders: orders2, payables: undefined, receivables: [parcialRec] });
    expect(Array.isArray(ds.recebiveis.allOpenInvoices)).toBe(true);
    expect(ds.recebiveis.allOpenInvoices[0].valor).toBe(300);
    expect(ds.recebiveis.metrics.saldoReceber).toBe(300);
  });

  it("openInvoices continua limitado a 20; allOpenInvoices não", () => {
    const many = [];
    for (let i = 0; i < 25; i++) many.push({
      id: i + 1, situacao: 1, valor: 100, saldo: 100,
      vencimento: iso(2026, 6, (i % 27) + 1), dataEmissao: iso(2026, 6, 1),
      contato: { id: i + 1, nome: `F${i}` }, numeroDocumento: `FC ${i}`,
    });
    const ds = buildSalesDataset({ orders: orders2, payables: many });
    expect(ds.fornecedores.openInvoices.length).toBe(20);
    expect(ds.fornecedores.allOpenInvoices.length).toBe(25);
  });
});