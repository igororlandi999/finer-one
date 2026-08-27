// Testes do contrato de gating do dataset: a semântica de payables
// (undefined = ausência => mock/Demo; [] = zero títulos reais => zeros reais).
// Também protege a remoção dos campos mortos (alertas.metrics, diagnostics).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset, normalizeOrder } from "./blingDataService.js";
import { buildMonthlyDre } from "../utils/dreEngine.js";

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
    // Contrato legado removido: `despesas` e `resultado` deixaram de ser emitidos.
    expect(ds.resumo.metrics.despesas).toBeUndefined();
    expect(ds.resumo.metrics.resultado).toBeUndefined();
    expect(ds.fornecedores.metrics.saldoPagar).toBe(0);
  });

  it("payables com itens: dataset completo real", () => {
    const ds = buildSalesDataset({ orders, payables: payablesComItens });
    expect(ds.despesas).not.toBeNull();
    expect(ds.resumo.metrics.despesas).toBeUndefined();
    expect(ds.resumo.metrics.resultado).toBeUndefined();
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

  /* Os dois `comparable` têm CONTRATOS DIFERENTES e não se herdam:
   *   financeiro.comparable          -> availability.revenueNet (receita)
   *   financeiro.payables.comparable -> availability.operatingExpenses (despesas)
   * Antes da política F3 do frete, este teste provava a independência com a receita
   * a false; hoje a receita líquida já não depende do frete cobrado nem do CMV, e
   * nesta fixture ambas as camadas são legitimamente comparáveis. Não se força um
   * false artificial: prova-se a independência com uma razão ainda válida. */
  it("com ambas as camadas cobertas, as duas são comparáveis", () => {
    const ds = buildSalesDataset({ orders: ordersMJJ, payables: payablesMJJ, coverage: base });
    expect(ds.financeiro.comparable).toBe(true);
    expect(ds.financeiro.payables.comparable).toBe(true);
    // E vêm de fontes distintas: a das despesas é a availability das operacionais.
    expect(ds.financeiro.payables.availability).toBe(ds.financeiro.metrics.availability.operatingExpenses);
    expect(alertaDespesa(ds, "d-subida-mes")).toBeDefined(); // 2.000 -> 9.500
  });

  it("as duas comparabilidades divergem quando só a das despesas está comprometida", () => {
    // Mesma cobertura temporal; só a CLASSIFICAÇÃO das contas a pagar de junho falha
    // (categoria não reconhecida). A receita não é afetada por isso.
    const ds = buildSalesDataset({
      orders: ordersMJJ,
      payables: [
        pg(1, "2026-05-01", 2000, "Serviços de terceiros", "Forn A"),
        pg(2, "2026-06-01", 9500, null, "Forn B"),
      ],
      coverage: base,
    });
    expect(ds.financeiro.comparable).toBe(true);                       // receita intacta
    expect(ds.financeiro.payables.classificacaoIncompleta).toBe(true);
    expect(ds.financeiro.payables.comparable).toBe(false);             // despesas comprometidas
    expect(ds.financeiro.payables.partial).toBe(false);                // junho está fechado
    // E a comparação insegura não é afirmada.
    expect(alertaDespesa(ds, "d-subida-mes")).toBeUndefined();
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
 * CONTRATO LEGADO — REMOVIDO em 24/08/2026. Estes testes trancam a AUSÊNCIA.
 *
 * Estavam aqui para congelar `despesas` / `resultado` enquanto o chatEngine os lesse.
 * O chatEngine foi migrado; os campos ficaram, e o último leitor passou a ser o card
 * "Resultado (Mês)" do Resumo — que caía neles sempre que a DRE não tinha âncora e
 * mostrava `receita − contas a pagar` como resultado, a partir de dados REAIS.
 *
 * O que se testa agora é o contrário do que se testava: que o dataset NÃO os emite.
 * A fixture é a mesma de propósito — foi desenhada para que os dois contratos nunca
 * coincidissem, e continua a ser a melhor prova de que `contasPagar` (mês civil, por
 * vencimento) não herdou nada do legado (mês dos pedidos, por emissão).
 * ==================================================================================== */
describe("buildResumo — o contrato legado deixou de existir", () => {
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

  it("contasPagar continua correto: agosto, por vencimento", () => {
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;

    expect(m.contasPagarMonthKey).toBe("2026-08");
    expect(m.contasPagar).toBe(1000);
    // O título de junho (40.000) NÃO entra: vence em junho, não em agosto.
    expect(m.receitas).toBe(180000);
  });

  it("o pseudo-resultado `receita − contas a pagar` não existe no dataset", () => {
    /* 180.000 − 40.000 = 140.000 era o valor que saía daqui rotulado "resultado".
     * Não basta que ninguém o leia: enquanto for calculado, o próximo consumidor
     * encontra-o pronto a usar, com um nome que convida a usá-lo. */
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;
    expect(m.resultado).toBeUndefined();
    expect(m.resultadoDelta).toBeUndefined();
    expect(Object.values(m)).not.toContain(140000);
  });

  it("`despesas` (contas a pagar chamadas despesas) também não existe", () => {
    // Tesouraria não é DRE. Somar contas a pagar por emissão e chamar-lhes despesas
    // operacionais era um erro de NOME, e os erros de nome propagam-se sozinhos.
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    const m = ds.resumo.metrics;
    expect(m.despesas).toBeUndefined();
    expect(m.despesasDelta).toBeUndefined();
  });

  it("com mais histórico continua a não haver deltas legados", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [pg(1, "2026-05-05", "2026-05-20", 20000, 2), ...payables],
      coverage: cov,
    });
    expect(ds.resumo.metrics.despesasDelta).toBeUndefined();
    expect(ds.resumo.metrics.resultadoDelta).toBeUndefined();
  });

  it("quem precisa de resultado tem a DRE, com o mês e a disponibilidade", () => {
    /* O substituto não é "outro campo com outro nome": é uma estrutura que diz de que
     * mês fala e quanto se pode confiar nela. Era isso que faltava ao legado. */
    const ds = buildSalesDataset({ orders, payables, coverage: cov });
    expect(ds.financeiro).toBeTruthy();
    expect(typeof ds.financeiro.monthKey).toBe("string");
    expect(ds.financeiro.metrics).toBeTruthy();
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
    // B3: a frase passou a nomear o mês usado pelo motor. A intenção do teste
    // mantém-se — texto de mês FECHADO, nunca de mês em curso.
    expect(alertaDespesa(ds, "d-forn-alto").description).toContain("das despesas de junho de 2026");
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
    // O frete passou a ser propagado (F4). Os restantes campos financeiros do
    // snapshot continuam FORA: fases separadas.
    expect(o.totalProdutos).toBeUndefined();
    expect(o.desconto).toBeUndefined();
    expect(o.outrasDespesas).toBeUndefined();
    expect(o.fretePorConta).toBeUndefined();
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

/* ====================================================================================
 * MÊS DE REFERÊNCIA DA PÁGINA DESPESAS (microfase D3).
 *
 * D3 expôs `despesas.metrics.monthKey`. D4 mudou a âncora: passou de latestPayableMonth
 * ("o último mês que por acaso tem títulos") para monthKey(now) — o mês CIVIL corrente.
 * A página é operacional e responde a "o que estou a gastar NESTE mês".
 *
 * Não é o mês fechado dos alertas (financeiro.payables.monthKey) nem o KPI de tesouraria
 * do Resumo (contasPagarMonthKey, mês civil mas por VENCIMENTO). Os três coexistem.
 * ==================================================================================== */
describe("buildSalesDataset — despesas.metrics.monthKey", () => {
  const HOJE_AGOSTO = new Date(2026, 7, 14, 12, 0, 0);
  beforeEach(() => { vi.setSystemTime(HOJE_AGOSTO); });

  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, emissao, vencimento, valor, situacao = 1) => ({
    id, situacao, dataEmissao: emissao, vencimento, valor,
    categoriaNome: "Aluguel", contato: { id: 1, nome: "Forn" },
  });
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const orders = [ord(1, "2026-06-10", 180000)];

  it("expõe a mesma âncora que alimenta totalMes (mês civil corrente)", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-06-05", "2026-06-20", 40000, 2),
        pg(2, "2026-08-03", "2026-08-25", 1000),
      ],
      coverage: cov,
    });
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");
    expect(ds.despesas.metrics.totalMes).toBe(1000); // o total é desse mesmo mês
  });

  it("D4: segue o RELÓGIO, não os dados — sem títulos em agosto continua em agosto", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(1, "2026-06-05", "2026-06-20", 40000, 2)], coverage: cov,
    });
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");
    expect(ds.despesas.metrics.monthKey).not.toBe("2026-06"); // latestPayableMonth, regra antiga
    expect(ds.despesas.metrics.totalMes).toBe(0);             // zero REAL, não o total de junho
  });

  it("D4 caso 1: título FUTURO não desloca a página", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-07-04", "2026-07-20", 100000, 2),
        pg(2, "2026-08-03", "2026-08-25", 20000),
        pg(3, "2026-09-02", "2026-09-20", 500),   // futuro
      ],
      coverage: cov,
    });
    const m = ds.despesas.metrics;
    expect(m.monthKey).toBe("2026-08");
    expect(m.totalMes).toBe(20000);
    expect(m.monthKey).not.toBe("2026-09");
    expect(m.maiorDespesa.valor).toBe(20000);     // o de agosto, não o de setembro
    expect(ds.despesas.byCategory.reduce((a, c) => a + c.value, 0)).toBe(20000);
  });

  it("D4 caso 2: mês civil VAZIO — zeros reais e nenhuma fuga para outro mês", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(1, "2026-07-04", "2026-07-20", 100000, 2)], coverage: cov,
    });
    const m = ds.despesas.metrics;
    expect(m.monthKey).toBe("2026-08");
    expect(m.totalMes).toBe(0);
    expect(m.mediaDiaria).toBe(0);
    expect(ds.despesas.byCategory).toEqual([]);
    expect(ds.despesas.evolution).toEqual([]);
    expect(m.maiorDespesa.valor).toBeNull();
    expect(m.totalDelta).toBeNull();
  });

  it("D-2: a maior despesa NUNCA cai para um título de outro mês", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(1, "2026-07-04", "2026-07-20", 999999, 2)], coverage: cov,
    });
    const md = ds.despesas.metrics.maiorDespesa;
    expect(md.valor).toBeNull();
    expect(md.valor).not.toBe(999999);
    expect(md.fornecedor).toBe("—");
    expect(md.data).toBe("—");
  });

  it("D4: os deltas ficam null enquanto o mês civil está em curso", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-07-04", "2026-07-20", 100000, 2),
        pg(2, "2026-08-03", "2026-08-25", 20000),
      ],
      coverage: cov,
    });
    // -80% seria aritmeticamente verdade e semanticamente falso: agosto tem 14 dias.
    expect(ds.despesas.metrics.totalDelta).toBeNull();
    expect(ds.despesas.metrics.mediaDelta).toBeNull();
    expect(ds.despesas.metrics.totalDelta).not.toBe(0); // null é ausência, não variação nula
  });

  it("não é o mês fechado dos alertas nem o mês civil do Resumo", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-06-05", "2026-06-20", 40000, 2),
        pg(2, "2026-08-03", "2026-08-25", 1000),
      ],
      coverage: cov,
    });
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");       // âncora da página Despesas
    expect(ds.financeiro.payables.monthKey).toBe("2026-06");    // mês fechado (alertas)
    expect(ds.resumo.metrics.contasPagarMonthKey).toBe("2026-08"); // mês civil (tesouraria)
  });

  it("D4 caso 3: payables [] — mês civil conhecido, zeros reais", () => {
    // Contrato alterado em D4: o mês é o calendário, logo é SEMPRE conhecido. O que
    // falta são dados, e isso diz-se com totalMes: 0 real — não com monthKey null.
    const ds = buildSalesDataset({ orders, payables: [], coverage: cov });
    expect(ds.despesas).not.toBeNull();
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");
    expect(ds.despesas.metrics.totalMes).toBe(0);
    expect(ds.despesas.metrics.maiorDespesa.valor).toBeNull();
  });

  it("D4 caso 4: payables undefined — despesas fica null, como antes", () => {
    const ds = buildSalesDataset({ orders, payables: undefined, coverage: cov });
    expect(ds.despesas).toBeNull();
  });

  it("títulos sem data nenhuma não entram no mês civil, mas o mês continua conhecido", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [{ id: 9, situacao: 1, dataEmissao: null, vencimento: null, valor: 700, contato: {} }],
      coverage: cov,
    });
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");
    expect(ds.despesas.metrics.totalMes).toBe(0);
  });

  it("D3 é aditivo: nenhum valor financeiro da página mudou", () => {
    const payables = [
      pg(1, "2026-06-05", "2026-06-20", 40000, 2),
      pg(2, "2026-08-03", "2026-08-25", 1000),
      pg(3, "2026-08-09", "2026-09-02", 500),
    ];
    const m = buildSalesDataset({ orders, payables, coverage: cov }).despesas.metrics;
    // Valores fixados ao cêntimo: totalMes e mediaDiaria são do mês âncora (agosto);
    // pagamentosPendentes é GLOBAL e continua a somar todos os títulos em aberto.
    expect(m.totalMes).toBe(1500);
    expect(m.mediaDiaria).toBe(750);          // 1.500 em 2 dias distintos com despesa
    expect(m.pagamentosPendentes).toBe(1500); // ids 2 e 3, ambos situacao 1
    expect(m.pendentesQtd).toBe(2);
    expect(m.maiorDespesa.valor).toBe(1000);
  });

  it("D4: list continua GLOBAL — a tabela não é filtrada pelo mês", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-06-05", "2026-06-20", 40000, 2),
        pg(2, "2026-08-03", "2026-08-25", 1000),
      ],
      coverage: cov,
    });
    expect(ds.despesas.list).toHaveLength(2);           // junho e agosto
    expect(ds.despesas.metrics.totalMes).toBe(1000);    // mas o KPI é só de agosto
  });

  it("D4: o Chat recebe a nova âncora sem chatEngine ser alterado", () => {
    // O chatEngine lê sales.despesas.byCategory e metrics.totalMes. A âncora nova
    // chega-lhe por construção; nenhuma linha de chatEngine.js foi tocada.
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-07-04", "2026-07-20", 100000, 2),
        pg(2, "2026-08-03", "2026-08-25", 20000),
      ],
      coverage: cov,
    });
    const totalCats = ds.despesas.byCategory.reduce((a, c) => a + c.value, 0);
    expect(totalCats).toBe(ds.despesas.metrics.totalMes);
    expect(totalCats).toBe(20000); // agosto, não julho
  });

  it("pagamentosPendentes continua GLOBAL: inclui títulos fora do mês de referência", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        pg(1, "2026-05-02", "2026-05-20", 3000),   // aberto, maio
        pg(2, "2026-08-03", "2026-08-25", 1000),   // aberto, agosto
      ],
      coverage: cov,
    });
    const m = ds.despesas.metrics;
    expect(m.monthKey).toBe("2026-08");
    expect(m.totalMes).toBe(1000);              // só agosto
    expect(m.pagamentosPendentes).toBe(4000);   // todos os meses
    expect(m.pendentesQtd).toBe(2);
  });
});

/* ====================================================================================
 * CONTAS EM ATRASO no KPI da página Despesas (microfase D5).
 *
 * Substituiu "Despesa Média Diária". É GLOBAL e "até hoje" — nunca limitado ao mês
 * civil da página: uma conta vencida em março continua vencida hoje.
 *
 * O alerta `d-vencidas` responde à MESMA pergunta. Estes testes fixam a paridade
 * entre os dois, para que o número do cartão e o do alerta nunca divirjam em silêncio.
 * ==================================================================================== */
describe("buildSalesDataset — despesas.metrics.emAtraso", () => {
  const HOJE_AGOSTO = new Date(2026, 7, 14, 12, 0, 0);
  beforeEach(() => { vi.setSystemTime(HOJE_AGOSTO); });

  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, emissao, vencimento, valor, situacao = 1, saldo = null) => ({
    id, situacao, dataEmissao: emissao, vencimento, valor, saldo,
    categoriaNome: "Aluguel", contato: { id, nome: `Forn ${id}` },
  });
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const orders = [ord(1, "2026-06-10", 180000)];

  // Espelha os 4 títulos realmente vencidos no snapshot da Overcel.
  const vencidos = [
    pg(1, "2026-02-20", "2026-03-22", 10771.92),
    pg(2, "2026-03-23", "2026-04-23", 10925.35),
    pg(3, "2026-04-20", "2026-05-20", 4285.97),
    pg(4, "2026-05-04", "2026-06-04", 2186.36),
  ];

  it("expõe emAtraso e emAtrasoQtd", () => {
    const ds = buildSalesDataset({ orders, payables: vencidos, coverage: cov });
    expect(ds.despesas.metrics.emAtraso).toBe(28169.60);
    expect(ds.despesas.metrics.emAtrasoQtd).toBe(4);
  });

  it("é GLOBAL: os títulos vencidos são de março a junho, o mês da página é agosto", () => {
    const ds = buildSalesDataset({ orders, payables: vencidos, coverage: cov });
    expect(ds.despesas.metrics.monthKey).toBe("2026-08");
    expect(ds.despesas.metrics.totalMes).toBe(0);        // nenhum título é de agosto
    expect(ds.despesas.metrics.emAtraso).toBe(28169.60); // e mesmo assim conta tudo
  });

  it("PARIDADE com o alerta d-vencidas no mesmo dataset", () => {
    const ds = buildSalesDataset({ orders, payables: vencidos, coverage: cov });
    const alerta = ds.alertas.list.find((a) => a.id === "d-vencidas");
    expect(alerta).toBeDefined();
    expect(alerta.description).toContain(String(ds.despesas.metrics.emAtrasoQtd));
    // 28.169,60 formatado na moeda da empresa ativa (BRL na Overcel).
    expect(alerta.description).toContain("28.169,60");
    expect(ds.despesas.metrics.emAtraso).toBe(28169.60);
  });

  it("títulos pagos, cancelados, futuros e sem vencimento ficam fora", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [
        ...vencidos,
        pg(10, "2026-01-02", "2026-01-20", 5000, 2),   // pago
        pg(11, "2026-01-02", "2026-01-21", 6000, 5),   // cancelado
        pg(12, "2026-08-01", "2026-09-10", 7000),      // futuro
        { id: 13, situacao: 1, dataEmissao: "2026-07-01", vencimento: null, valor: 800, contato: {} },
      ],
      coverage: cov,
    });
    expect(ds.despesas.metrics.emAtraso).toBe(28169.60);
    expect(ds.despesas.metrics.emAtrasoQtd).toBe(4);
  });

  it("usa o saldo em aberto quando há pagamento parcial", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(1, "2026-05-01", "2026-06-10", 1000, 1, 250)], coverage: cov,
    });
    expect(ds.despesas.metrics.emAtraso).toBe(250);
  });

  it("payables [] : zero REAL, nunca null", () => {
    const ds = buildSalesDataset({ orders, payables: [], coverage: cov });
    expect(ds.despesas.metrics.emAtraso).toBe(0);
    expect(ds.despesas.metrics.emAtrasoQtd).toBe(0);
    expect(ds.despesas.metrics.emAtraso).not.toBeNull();
  });

  it("os outros KPIs da página não mudaram", () => {
    const ds = buildSalesDataset({
      orders,
      payables: [...vencidos, pg(20, "2026-08-03", "2026-08-25", 20000)],
      coverage: cov,
    });
    const m = ds.despesas.metrics;
    expect(m.monthKey).toBe("2026-08");
    expect(m.totalMes).toBe(20000);
    expect(m.maiorDespesa.valor).toBe(20000);
    expect(m.pagamentosPendentes).toBe(48169.60); // global: 28.169,60 + 20.000
    expect(m.pendentesQtd).toBe(5);
  });

  it("mediaDiaria e mediaDelta continuam NO CONTRATO, embora a página já não os mostre", () => {
    const ds = buildSalesDataset({
      orders, payables: [pg(20, "2026-08-03", "2026-08-25", 20000)], coverage: cov,
    });
    const m = ds.despesas.metrics;
    expect("mediaDiaria" in m).toBe(true);
    expect("mediaDelta" in m).toBe(true);
    expect(m.mediaDiaria).toBe(20000);
    expect(m.mediaDelta).toBeNull();
  });
});
/* ====================================================================================
 * F4 — PROPAGAÇÃO DO FRETE COBRADO.
 *
 * Só transporte de dado. Desde a F3 o frete cobrado não entra em totalDeducoes, pelo
 * que propagá-lo tem de ser NEUTRO para a receita líquida: o que muda é apenas o
 * `freteVenda` passar a ser medido em vez de `unavailable`.
 *
 * `frete: 0` é dado real — 539 dos 984 pedidos reais têm zero. Ausência é
 * desconhecimento — 215 ainda não hidratados. Os dois não podem colapsar.
 * ==================================================================================== */
describe("normalizeOrder — frete cobrado", () => {
  const bruto = (over = {}) => ({
    id: 1, numero: 1318, data: "2026-06-10", total: 1130,
    situacao: { id: 9, valor: 9 }, contato: { id: 7, nome: "Cliente" }, itens: [], ...over,
  });

  it("zero é dado real, nunca ausência", () => {
    const o = normalizeOrder(bruto({ frete: 0 }));
    expect(o.frete).toBe(0);
    expect(o.frete).not.toBeNull();
  });

  it("número positivo é preservado", () => {
    expect(normalizeOrder(bruto({ frete: 150 })).frete).toBe(150);
  });

  it("string numérica vira número", () => {
    expect(normalizeOrder(bruto({ frete: "150" })).frete).toBe(150);
    expect(normalizeOrder(bruto({ frete: "27.09" })).frete).toBe(27.09);
    expect(normalizeOrder(bruto({ frete: "0" })).frete).toBe(0);
  });

  it("null, ausente e string vazia ficam null", () => {
    expect(normalizeOrder(bruto({ frete: null })).frete).toBeNull();
    expect(normalizeOrder(bruto()).frete).toBeNull();
    expect(normalizeOrder(bruto({ frete: "" })).frete).toBeNull();
  });

  it("string inválida fica null e NUNCA NaN", () => {
    for (const v of ["abc", "R$ 12", {}, [], NaN, Infinity]) {
      const f = normalizeOrder(bruto({ frete: v })).frete;
      expect(f).toBeNull();
      expect(Number.isNaN(f)).toBe(false);
    }
  });
});

describe("F4 — integração: o frete é medido e NÃO altera a receita líquida", () => {
  const COVF = { firstCompleteMonth: "2026-01", partialMonths: [], closedThroughMonth: "2026-06" };
  const bruto = (id, total, frete) => ({
    id, numero: id, data: "2026-06-10", total,
    situacao: { id: 9, valor: 9 }, contato: { id: 1, nome: "C" }, itens: [],
    ...(frete !== undefined ? { frete } : {}),
  });
  const pag = (id, categoriaNome, valor) => ({
    id, situacao: 2, dataEmissao: "2026-06-02", vencimento: "2026-06-05",
    valor, categoriaNome, contato: { id: 1, nome: "F" },
  });
  // Deduções reais, para a receita líquida não ser trivialmente igual à bruta.
  const payables = [pag(1, "Comissão sobre vendas", 30), pag(2, "Impostos sobre vendas", 100)];
  const dreDe = (rawOrders) => buildMonthlyDre({
    orders: rawOrders.map(normalizeOrder), payables, monthKey: "2026-06", coverage: COVF,
  });

  const semCampo = dreDe([bruto(1, 1130), bruto(2, 500)]);
  const comZero = dreDe([bruto(1, 1130, 0), bruto(2, 500, 0)]);
  const comFrete = dreDe([bruto(1, 1130, 130), bruto(2, 500, 20)]);
  const parcial = dreDe([bruto(1, 1130, 130), bruto(2, 500)]);

  it("A. sem campo: receita líquida mantém o valor da política F3", () => {
    expect(semCampo.receitaBruta).toBe(1630);
    expect(semCampo.totalDeducoes).toBe(130);
    expect(semCampo.receitaLiquida).toBe(1500);
    expect(semCampo.freteVenda).toBeNull();
  });

  it("B. frete: 0 dá exatamente a mesma receita líquida do caso A", () => {
    expect(comZero.receitaLiquida).toBe(semCampo.receitaLiquida);
    expect(comZero.totalDeducoes).toBe(semCampo.totalDeducoes);
    expect(comZero.freteVenda).toBe(0);            // medido como zero real
    expect(comZero.availability.freteVenda).toBe("real");
  });

  it("C. frete > 0 é medido mas NÃO reduz a receita líquida", () => {
    expect(comFrete.freteVenda).toBe(150);         // 130 + 20
    expect(comFrete.receitaLiquida).toBe(1500);    // igual ao caso A
    expect(comFrete.totalDeducoes).toBe(130);      // só comissões + impostos
    expect(comFrete.receitaLiquida).toBe(semCampo.receitaLiquida);
  });

  it("D. cobertura completa: freteVenda deixa de ser unavailable e o warning some", () => {
    expect(semCampo.availability.freteVenda).toBe("unavailable");
    expect(semCampo.warnings.some((w) => w.code === "frete-venda-sem-fonte")).toBe(true);

    expect(comFrete.availability.freteVenda).toBe("real");
    expect(comFrete.warnings.some((w) => w.code === "frete-venda-sem-fonte")).toBe(false);
    expect(comFrete.warnings.some((w) => w.code === "frete-venda-parcial")).toBe(false);
  });

  it("E. cobertura parcial: partial no frete, receita líquida intacta", () => {
    expect(parcial.availability.freteVenda).toBe("partial");
    expect(parcial.warnings.some((w) => w.code === "frete-venda-parcial")).toBe(true);
    expect(parcial.availability.receitaLiquida).toBe("real");   // não contamina
    expect(parcial.receitaLiquida).toBe(1500);
    expect(parcial.freteVenda).toBe(130);                        // só o pedido que tem campo
  });

  it("nenhum dos quatro cenários altera a receita líquida", () => {
    const valores = [semCampo, comZero, comFrete, parcial].map((d) => d.receitaLiquida);
    expect(new Set(valores).size).toBe(1);
    expect(valores[0]).toBe(1500);
  });
});

/* ====================================================================================
 * CMV C3 — o serviço aceita manualInputsByMonth e LIMITA-SE a propagá-lo.
 * Protege três coisas distintas: que sem mapa nada muda (não-regressão), que o mapa
 * chega ao mês certo sem contaminar o anterior, e que o mapa não tem qualquer
 * influência sobre a escolha do mês âncora.
 * ==================================================================================== */
describe("buildSalesDataset — manualInputsByMonth (propagação)", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoria) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: "F", nome: "F" },
  });
  const ordersMJ = [ord(1, "2026-05-10", 50000), ord(2, "2026-06-10", 60000)];
  const payablesMJ = [
    pg(1, "2026-05-01", 2000, "Serviços de terceiros"),
    pg(2, "2026-06-01", 9500, "Aluguel"),
  ];
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };

  it("T9 — sem manualInputsByMonth: CMV null nos dois meses (não-regressão)", () => {
    const ds = buildSalesDataset({ orders: ordersMJ, payables: payablesMJ, coverage: cov });
    expect(ds.financeiro.metrics.cmv.value).toBeNull();
    expect(ds.financeiro.metrics.availability.cmv).toBe("unavailable");
    expect(ds.financeiro.previous.cmv.value).toBeNull();
    expect(ds.financeiro.metrics.profitability.grossProfit).toBeNull();
  });

  it("T10 — mapa só com o mês fechado: propaga para junho e não contamina maio", () => {
    const ds = buildSalesDataset({
      orders: ordersMJ, payables: payablesMJ, coverage: cov,
      manualInputsByMonth: { "2026-06": { cmv: 500 } },
    });
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.metrics.cmv.value).toBe(500);
    expect(ds.financeiro.metrics.availability.cmv).toBe("manual");
    expect(ds.financeiro.previous.cmv.value).toBeNull();
    expect(ds.financeiro.previous.availability.cmv).toBe("unavailable");
  });

  it("T11 — mapa com um mês fora do par analisado: nenhum efeito", () => {
    const ds = buildSalesDataset({
      orders: ordersMJ, payables: payablesMJ, coverage: cov,
      manualInputsByMonth: { "2026-02": { cmv: 999999 } },
    });
    expect(ds.financeiro.metrics.cmv.value).toBeNull();
    expect(ds.financeiro.previous.cmv.value).toBeNull();
    expect(ds.financeiro.metrics.profitability.grossProfit).toBeNull();
  });

  it("T12 — o mapa não influencia a escolha do mês âncora (receita nem contas a pagar)", () => {
    const semMapa = buildSalesDataset({ orders: ordersMJ, payables: payablesMJ, coverage: cov });
    const comMapa = buildSalesDataset({
      orders: ordersMJ, payables: payablesMJ, coverage: cov,
      manualInputsByMonth: { "2026-05": { cmv: 300 }, "2026-06": { cmv: 500 }, "2026-07": { cmv: 700 } },
    });
    expect(comMapa.financeiro.monthKey).toBe(semMapa.financeiro.monthKey);
    expect(comMapa.financeiro.previous.monthKey).toBe(semMapa.financeiro.previous.monthKey);
    expect(comMapa.financeiro.payables.monthKey).toBe(semMapa.financeiro.payables.monthKey);
    expect(comMapa.financeiro.payables.previousMonthKey).toBe(semMapa.financeiro.payables.previousMonthKey);
    // Um mês inexistente no dataset não passa a existir por estar no mapa.
    expect(comMapa.financeiro.monthKey).not.toBe("2026-07");
  });
});

/* ====================================================================================
 * CMV C3.1 — o mês EM CURSO também recebe o seu próprio input manual.
 * O contrato de manualInputsByMonth é por mês, não "por mês fechado". Estes testes
 * fixam isso e, ao mesmo tempo, garantem que a abertura do mês em curso não abriu
 * porta a contaminação entre meses nem a mudança do mês âncora.
 * ==================================================================================== */
describe("buildSalesDataset — manualInputsByMonth no mês em curso", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoria) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: "F", nome: "F" },
  });
  // Junho fechado, julho em curso (o relógio dos testes está em 15/07/2026).
  const ordersMJJ = [ord(1, "2026-05-10", 50000), ord(2, "2026-06-10", 60000), ord(3, "2026-07-05", 900)];
  const payablesMJJ = [
    pg(1, "2026-05-01", 2000, "Serviços de terceiros"),
    pg(2, "2026-06-01", 9500, "Aluguel"),
    pg(3, "2026-07-01", 400, "Software"),
  ];
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };
  const build = (manualInputsByMonth) => buildSalesDataset({
    orders: ordersMJJ, payables: payablesMJJ, coverage: cov, manualInputsByMonth,
  });

  it("pré-condição: o mês em curso existe e é distinto do mês fechado", () => {
    const ds = build(undefined);
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.emCurso).not.toBeNull();
    expect(ds.financeiro.emCurso.monthKey).toBe("2026-07");
  });

  it("T13 — CMV manual do mês em curso chega a financeiro.emCurso", () => {
    const ds = build({ "2026-07": { cmv: 700 } });
    expect(ds.financeiro.emCurso.cmv.value).toBe(700);
    expect(ds.financeiro.emCurso.availability.cmv).toBe("manual");
  });

  it("T14 — cmv 0 no mês em curso é valor real informado (manual, não unavailable)", () => {
    const ds = build({ "2026-07": { cmv: 0 } });
    expect(ds.financeiro.emCurso.cmv.value).toBe(0);
    expect(ds.financeiro.emCurso.availability.cmv).toBe("manual");
  });

  it("T15 — CMV de outro mês não contamina o mês em curso, nem o inverso", () => {
    const ds = build({ "2026-06": { cmv: 500 } });
    expect(ds.financeiro.metrics.cmv.value).toBe(500);        // junho, fechado
    expect(ds.financeiro.emCurso.cmv.value).toBeNull();       // julho, em curso
    expect(ds.financeiro.emCurso.availability.cmv).toBe("unavailable");

    const inverso = build({ "2026-07": { cmv: 700 } });
    expect(inverso.financeiro.emCurso.cmv.value).toBe(700);
    expect(inverso.financeiro.metrics.cmv.value).toBeNull();  // junho não herda julho
    expect(inverso.financeiro.previous.cmv.value).toBeNull(); // maio também não
  });

  it("T16 — sem mapa: mês em curso continua com CMV null (não-regressão)", () => {
    const ds = build(undefined);
    expect(ds.financeiro.emCurso.cmv.value).toBeNull();
    expect(ds.financeiro.emCurso.availability.cmv).toBe("unavailable");
    expect(ds.financeiro.emCurso.profitability.grossProfit).toBeNull();
  });

  it("T17 — input no mês em curso não altera nenhum mês âncora", () => {
    const semMapa = build(undefined);
    const comMapa = build({ "2026-07": { cmv: 700 } });
    expect(comMapa.financeiro.monthKey).toBe(semMapa.financeiro.monthKey);
    expect(comMapa.financeiro.emCurso.monthKey).toBe(semMapa.financeiro.emCurso.monthKey);
    expect(comMapa.financeiro.payables.monthKey).toBe(semMapa.financeiro.payables.monthKey);
    expect(comMapa.financeiro.payables.previousMonthKey).toBe(semMapa.financeiro.payables.previousMonthKey);
    // O mês em curso continua parcial: um CMV manual não o promove a comparável.
    expect(comMapa.financeiro.comparable).toBe(semMapa.financeiro.comparable);
  });
});

/* ====================================================================================
 * C7B — pendências de fecho no fluxo real de alertas.
 * O relógio dos testes está em 15/07/2026, logo a janela é junho, maio e abril.
 * ==================================================================================== */
describe("buildSalesDataset — alertas de fecho mensal", () => {
  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  const pg = (id, dataCivil, valor, categoria) => ({
    id, situacao: 2, dataEmissao: dataCivil, vencimento: dataCivil,
    valor, categoriaNome: categoria, contato: { id: "F", nome: "F" },
  });
  const orders = [ord(1, "2026-05-10", 50000), ord(2, "2026-06-10", 60000), ord(3, "2026-07-05", 900)];
  const payables = [pg(1, "2026-05-01", 2000, "Aluguel"), pg(2, "2026-06-01", 9500, "Aluguel")];
  const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };

  const alertasDeFecho = (manualInputsByMonth) => buildSalesDataset({
    orders, payables, coverage: cov, manualInputsByMonth,
  }).alertas.list.filter((a) => a.id.startsWith("closing-"));

  /* Abril ("2026-04") está DENTRO da cobertura (firstCompleteMonth="2026-04") mas não
   * tem um único pedido: a receita bruta do mês é 0, com availability "real" (sem
   * lacuna de histórico). C7B.1 — este é exatamente o falso positivo que a
   * microfase corrige: "Falta informar CMV" deixou de fazer sentido para um mês em
   * que não houve venda nenhuma, comprovado pela própria fonte de receita. CMV
   * passa a not_applicable em abril, e por isso já não entra nas pendências abaixo. */
  it("sem ajustes manuais, só os meses com receita aplicável geram pendência", () => {
    const a = alertasDeFecho(undefined);
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06", "2026-05"]);
    expect(a[0].severity).toBe("danger");     // junho é o mês anterior a julho
    expect(a[1].severity).toBe("warning");
  });

  it("o mês em curso não gera pendência de fecho", () => {
    expect(alertasDeFecho(undefined).map((x) => x.monthKey)).not.toContain("2026-07");
  });

  it("nada além da janela de três meses entra", () => {
    const a = alertasDeFecho(undefined);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-03");
  });

  it("CMV manual em junho remove a pendência de junho; abril já não pendia por não ter vendas", () => {
    const a = alertasDeFecho({ "2026-06": { cmv: 500 } });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-05"]);
  });

  it("CMV manual igual a zero também fecha o mês", () => {
    const a = alertasDeFecho({ "2026-06": { cmv: 0 } });
    expect(a.map((x) => x.monthKey)).not.toContain("2026-06");
  });

  it("um mês da janela sem qualquer movimento é avaliado, mas a ausência real de vendas não gera pendência falsa", () => {
    expect(alertasDeFecho(undefined).map((x) => x.monthKey)).not.toContain("2026-04");
  });

  it("o mesmo mês, com uma venda real, volta a exigir CMV — prova de que é avaliado, não ignorado", () => {
    const comVendaEmAbril = [...orders, ord(4, "2026-04-20", 300)];
    const a = buildSalesDataset({ orders: comVendaEmAbril, payables, coverage: cov })
      .alertas.list.filter((x) => x.id.startsWith("closing-"));
    expect(a.map((x) => x.monthKey)).toContain("2026-04");
  });

  it("os alertas de fecho convivem com os restantes sem os substituir", () => {
    const lista = buildSalesDataset({ orders, payables, coverage: cov }).alertas.list;
    expect(lista.some((a) => a.id.startsWith("closing-"))).toBe(true);
    expect(lista.some((a) => !a.id.startsWith("closing-"))).toBe(true);
    // Ids únicos: recarregar não pode duplicar nada.
    expect(new Set(lista.map((a) => a.id)).size).toBe(lista.length);
  });
});

/* ====================================================================================
 * C7B.1 — elegibilidade histórica no fluxo real: um mês anterior à cobertura confiável
 * não gera pendência, e a janela continua fixa em 3 meses (não puxa um quarto mês para
 * compensar). Cenário do enunciado: em agosto, a janela é [julho, junho, maio]; se a
 * cobertura confiável começa em junho, maio não pende e abril nunca é sequer olhado.
 * ==================================================================================== */
describe("buildSalesDataset — cobertura histórica no fecho mensal", () => {
  const HOJE_AGOSTO = new Date(2026, 7, 21, 12, 0, 0);
  beforeEach(() => { vi.setSystemTime(HOJE_AGOSTO); });

  const ord = (id, dataCivil, total) => ({
    id, date: dataCivil, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
  });
  // Maio não tem um único pedido: se a cobertura não o distinguir de "receita zero",
  // seria indistinguível do caso de abril em C7B (zero real, dentro da cobertura).
  const orders = [ord(1, "2026-06-10", 60000), ord(2, "2026-07-05", 900)];
  const covJunho = { firstCompleteMonth: "2026-06", partialMonths: [], closedThroughMonth: "2026-07" };

  const pendenciasDeFecho = (coverage) => buildSalesDataset({ orders, payables: [], coverage })
    .alertas.list.filter((a) => a.id.startsWith("closing-"));

  it("a janela mantém-se em julho, junho e maio — maio fora da cobertura não pende, abril não entra", () => {
    const a = pendenciasDeFecho(covJunho);
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07", "2026-06"]);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-05");
    expect(a.map((x) => x.monthKey)).not.toContain("2026-04");
  });

  it("a mesma ausência de pedidos em maio: fora da cobertura é pending, dentro da cobertura é not_applicable — nos dois casos, sem pendência", () => {
    // Mesmos pedidos (maio sem nenhum); só a cobertura muda. Fora da cobertura, o
    // motor nem chega a avaliar a receita (unavailable => pending). Com a cobertura
    // alargada a janeiro, a receita de maio é um zero REAL (not_applicable). As duas
    // vias são deliberadamente distintas por dentro — nenhuma pode ser confundida com
    // "receita zero" pela outra — mas nenhuma gera pendência.
    const coberturaEstreita = pendenciasDeFecho(covJunho);
    const coberturaAlargada = pendenciasDeFecho({ firstCompleteMonth: "2026-01", partialMonths: [], closedThroughMonth: "2026-07" });
    expect(coberturaEstreita.map((x) => x.monthKey)).not.toContain("2026-05");
    expect(coberturaAlargada.map((x) => x.monthKey)).not.toContain("2026-05");
  });

  /* C7B.2 no fluxo real: julho tem pedidos e CMV em falta, mas está declarado como mês
   * de cobertura PARCIAL. A receita que o dreEngine produz é, por isso, "partial" —
   * subavaliada por definição. Não se pode provar que o mês está inteiro, logo não se
   * pode cobrar o CMV. O caminho é o oficial (buildMonthlyDre -> buildFinancialMetrics
   * -> buildMonthlyClosing): nenhuma availability é fabricada pelo teste. */
  it("mês com cobertura parcial e CMV em falta não gera pendência, mesmo tendo pedidos", () => {
    const covParcialJulho = {
      firstCompleteMonth: "2026-06", partialMonths: ["2026-07"], closedThroughMonth: "2026-07",
    };
    const a = pendenciasDeFecho(covParcialJulho);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-07");
    // Junho continua completo em cobertura e sem CMV: a pendência real mantém-se.
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06"]);
  });

  it("a janela continua a ter exatamente 3 meses civis, e nenhum quarto mês é puxado para compensar os inelegíveis", () => {
    // Julho parcial + maio fora da cobertura: dois dos três meses não pendem. Se o
    // motor compensasse, abril e março apareceriam. Nunca aparecem.
    const covParcialJulho = {
      firstCompleteMonth: "2026-06", partialMonths: ["2026-07"], closedThroughMonth: "2026-07",
    };
    const a = pendenciasDeFecho(covParcialJulho);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-04");
    expect(a.map((x) => x.monthKey)).not.toContain("2026-03");
    expect(a.length).toBeLessThanOrEqual(3);
  });
});
/* ══════════════════════════════════════════════════════════════════════════════════
 * MOVIMENTOS POR CLASSIFICAR — A LIGAÇÃO, não a regra (FASE 7).
 *
 * `classificationCompleteness` tinha testes próprios e a página Despesas tinha a
 * secção. O que NÃO tinha teste nenhum era o fio entre os dois: que o serviço chama
 * mesmo o medidor, com os MESES certos, e expõe o resultado onde a página o lê.
 *
 * É exatamente a classe de falha que este projeto já apanhou uma vez (C7F.3A): dois
 * lados corretos, testados cada um contra si próprio, e nada a verificar que estão
 * ligados. Uma regressão que deixasse `porClassificar` sempre vazio passaria em todos
 * os testes unitários — e a secção desapareceria da página sem uma única falha.
 *
 * MESES: o mês CIVIL corrente (o mês que a página Despesas mostra) mais a janela de
 * fecho. Os títulos por classificar de julho são o caso real que motivou a secção:
 * são de um mês que a página não mostra, e por isso não apareciam em lado nenhum.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("buildSalesDataset — movimentos por classificar", () => {
  const semCategoria = (id, valor, mes, over = {}) => ({
    id, situacao: 2, valor,
    vencimento: iso(2026, mes, 10), dataEmissao: iso(2026, mes, 10),
    categoriaNome: "Sem categoria",
    contato: { id: 9, nome: "Fornecedor Z" },
    historico: "Ref. mão de obra alarme",
    ...over,
  });
  const classificado = (id, valor, mes) => ({
    id, situacao: 2, valor,
    vencimento: iso(2026, mes, 10), dataEmissao: iso(2026, mes, 10),
    categoriaNome: "Salários", contato: { id: 1, nome: "F1" },
  });

  it("expõe os títulos por classificar do mês civil E dos meses de fecho", () => {
    /* HOJE é 2026-07-15: o mês civil é julho (índice 6) e junho (índice 5) está na
     * janela de fecho. Um título por classificar em cada um. */
    const ds = buildSalesDataset({
      orders,
      payables: [
        classificado(1, 20000, 6),
        semCategoria(2, 1118, 6),
        semCategoria(3, 500, 5),
      ],
    });
    const meses = ds.despesas.porClassificar.map((c) => c.monthKey);
    expect(meses).toContain("2026-07");
    expect(meses).toContain("2026-06");

    const julho = ds.despesas.porClassificar.find((c) => c.monthKey === "2026-07");
    expect(julho.unclassifiedCount).toBe(1);
    expect(julho.unclassifiedAmount).toBe(1118);
    // Os itens chegam à página com o que ela mostra — e nada mais.
    expect(julho.items[0].description).toBe("Ref. mão de obra alarme");
    expect(julho.items[0].sourceCategory).toBe("Sem categoria");
    // Nunca uma categoria sugerida: sugerir é classificar.
    expect(Object.keys(julho.items[0])).not.toContain("suggestedCategory");
  });

  it("mês inteiramente classificado NÃO entra na lista", () => {
    /* Um mês com zero títulos por classificar não é uma linha vazia na página: é
     * ausência de secção. Emiti-lo obrigaria a página a filtrar o que o serviço já
     * sabe — e uma secção "Movimentos por classificar" sem movimento nenhum é ruído
     * sobre um problema que a empresa não tem. */
    const ds = buildSalesDataset({
      orders,
      payables: [classificado(1, 20000, 6), classificado(2, 3000, 5)],
    });
    expect(ds.despesas.porClassificar).toEqual([]);
  });

  it("sem fonte de contas a pagar não se inventa nada por classificar", () => {
    // payables undefined => despesas é null e a página cai no mock, SEM secção.
    const ds = buildSalesDataset({ orders, payables: undefined });
    expect(ds.despesas).toBeNull();
  });

  it("fonte real e vazia mede e não encontra nada — que não é o mesmo que não medir", () => {
    const ds = buildSalesDataset({ orders, payables: [] });
    expect(ds.despesas.porClassificar).toEqual([]);
  });
});
