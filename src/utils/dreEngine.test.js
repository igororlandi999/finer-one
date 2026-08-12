// Testes do motor central de DRE.
// Regra que atravessa tudo: 0 é valor real, null é ausência de fonte.

import { describe, it, expect } from "vitest";
import {
  buildMonthlyDre,
  buildDreSeries,
  availableDreMonths,
  classifyPayable,
  payableCompetenceDate,
  payableCompetenceMonth,
  revenueAvailability,
  isCancelledPayable,
  combineAvailability,
  sourceAvailability,
  payablesCoverage,
  DRE_GROUPS,
} from "./dreEngine.js";

// ── Fixtures ────────────────────────────────────────────────
const order = (id, dateISO, total, extra = {}) => ({
  id: String(id), date: dateISO, total, status: "recebida",
  client: { id: 1, name: "Cliente" }, items: [], ...extra,
});
const pay = (id, categoriaNome, valor, datas = {}, historico = null) => ({
  id, categoriaNome, valor, historico,
  situacao: 2,
  competencia: datas.competencia || null,
  vencimentoOriginal: datas.vencimentoOriginal || null,
  vencimento: datas.vencimento || null,
  dataEmissao: datas.dataEmissao || null,
  contato: { id: 1, nome: "F" },
});
const vencEm = (d) => ({ vencimento: d });

describe("classifyPayable — mapa de categorias", () => {
  const grupo = (cat, hist = null) => classifyPayable({ id: 1, categoriaNome: cat, historico: hist }).group;

  it("comissão sobre vendas => dedução da receita", () => {
    expect(grupo("Comissão sobre vendas")).toBe(DRE_GROUPS.COMISSOES);
  });

  it("devolução => dedução da receita (por categoria ou histórico)", () => {
    expect(grupo("Devoluções de venda")).toBe(DRE_GROUPS.DEVOLUCOES);
    expect(grupo("Transferências", "Devolução ao cliente")).toBe(DRE_GROUPS.DEVOLUCOES);
  });

  it("imposto sobre vendas / Simples Nacional => impostos", () => {
    expect(grupo("Impostos sobre vendas")).toBe(DRE_GROUPS.IMPOSTOS);
    expect(grupo("Tributos", "DAS Simples Nacional")).toBe(DRE_GROUPS.IMPOSTOS);
  });

  it("salários => pessoal", () => {
    expect(grupo("Salários")).toBe(DRE_GROUPS.PESSOAL);
    expect(grupo("Folha de pagamento")).toBe(DRE_GROUPS.PESSOAL);
  });

  it("aluguel, contabilidade e software => fixas", () => {
    expect(grupo("Aluguel")).toBe(DRE_GROUPS.FIXAS);
    expect(grupo("Serviços contábeis")).toBe(DRE_GROUPS.FIXAS);
    expect(grupo("Software")).toBe(DRE_GROUPS.FIXAS);
  });

  it("tarifa bancária, material de consumo e serviços de terceiros => administrativas", () => {
    expect(grupo("Tarifa bancária")).toBe(DRE_GROUPS.ADMINISTRATIVAS);
    expect(grupo("Material de uso e consumo")).toBe(DRE_GROUPS.ADMINISTRATIVAS);
    expect(grupo("Serviços de terceiros")).toBe(DRE_GROUPS.ADMINISTRATIVAS);
  });

  it("compra de fornecedor NÃO é despesa operacional", () => {
    expect(grupo("Compras de fornecedores")).toBe(DRE_GROUPS.COMPRAS_ESTOQUE);
    expect(grupo("Importações")).toBe(DRE_GROUPS.COMPRAS_ESTOQUE);
    expect(grupo("Compra de insumos e matéria-prima")).toBe(DRE_GROUPS.COMPRAS_ESTOQUE);
  });

  it("distribuição de lucros é separada como retirada de sócios", () => {
    expect(grupo("Distribuição de Lucros")).toBe(DRE_GROUPS.RETIRADAS);
  });

  it("pró-labore sem indício de retirada => pessoal", () => {
    expect(grupo("Pró-labore", "Pagamento mensal")).toBe(DRE_GROUPS.PESSOAL);
  });

  it("pró-labore com histórico de dividendos => retirada + WARNING", () => {
    const r = classifyPayable({ id: 7, categoriaNome: "Pró-labore", historico: "Adiantamento de dividendos" });
    expect(r.group).toBe(DRE_GROUPS.RETIRADAS);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].code).toBe("categoria-historico-contraditorios");
    expect(r.warnings[0].payableId).toBe(7);
  });

  it("frete pago fica fora das linhas operacionais (não é frete de venda)", () => {
    expect(grupo("Fretes e seguros")).toBe(DRE_GROUPS.FRETE_PAGO);
  });

  it("categoria desconhecida não entra na DRE", () => {
    expect(grupo("Categoria Nova XPTO")).toBe(DRE_GROUPS.NAO_CLASSIFICADO);
    expect(grupo(null)).toBe(DRE_GROUPS.NAO_CLASSIFICADO);
  });
});

describe("payableCompetenceDate — regime de competência", () => {
  it("prioridade: competencia > vencimentoOriginal > vencimento > dataEmissao", () => {
    expect(payableCompetenceDate({ competencia: "2026-06-01", vencimentoOriginal: "2026-07-01", vencimento: "2026-08-01" }).field).toBe("competencia");
    expect(payableCompetenceDate({ vencimentoOriginal: "2026-07-01", vencimento: "2026-08-01" }).field).toBe("vencimentoOriginal");
    expect(payableCompetenceDate({ vencimento: "2026-08-01" }).field).toBe("vencimento");
    expect(payableCompetenceDate({ dataEmissao: "2026-06-01" }).field).toBe("dataEmissao");
  });

  it("título recorrente emitido em junho e vencendo em 2027 NÃO entra em junho", () => {
    const p = pay(1, "Software", 100, { dataEmissao: "2026-06-15", vencimento: "2027-01-10" });
    expect(payableCompetenceMonth(p)).toBe("2027-01");
  });

  it("salário com emissão antiga e vencimento em junho entra em junho", () => {
    const p = pay(2, "Salários", 2800, { dataEmissao: "2025-01-01", vencimento: "2026-06-05" });
    expect(payableCompetenceMonth(p)).toBe("2026-06");
  });

  it("Simples Nacional com emissão antiga e vencimento em junho entra em junho", () => {
    const p = pay(3, "Impostos sobre vendas", 26417.70, { dataEmissao: "2025-12-01", vencimento: "2026-06-20" });
    expect(payableCompetenceMonth(p)).toBe("2026-06");
  });

  it("usar só a emissão marca fallback", () => {
    expect(payableCompetenceDate({ dataEmissao: "2026-06-01" }).fallback).toBe(true);
    expect(payableCompetenceDate({ vencimento: "2026-06-01" }).fallback).toBe(false);
  });
});

describe("revenueAvailability — cobertura histórica configurável", () => {
  const cov = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"] };
  it("meses antes da cobertura => unavailable", () => {
    expect(revenueAvailability("2026-01", cov)).toBe("unavailable");
    expect(revenueAvailability("2026-02", cov)).toBe("unavailable");
  });
  it("mês declarado parcial => partial", () => {
    expect(revenueAvailability("2026-03", cov)).toBe("partial");
  });
  it("meses cobertos => real", () => {
    expect(revenueAvailability("2026-04", cov)).toBe("real");
    expect(revenueAvailability("2026-06", cov)).toBe("real");
  });
  it("sem configuração, tudo é real (contrato explícito)", () => {
    expect(revenueAvailability("2020-01")).toBe("real");
  });
});

describe("buildMonthlyDre — receita", () => {
  const orders = [
    order(1, "2026-06-01", 6799),
    order(2, "2026-06-15", 1000),
    order(3, "2026-06-20", 500, { status: "cancelada" }), // excluído
    order(4, "2026-05-10", 9999),
  ];

  it("mês real soma pedidos faturáveis e exclui cancelados", () => {
    const d = buildMonthlyDre({ orders, payables: [], monthKey: "2026-06" });
    expect(d.receitaBruta).toBe(7799);
    expect(d.availability.revenue).toBe("real");
  });

  it("pedido do dia 1 continua no mês correto (Fase 1)", () => {
    const d = buildMonthlyDre({ orders, payables: [], monthKey: "2026-06" });
    expect(d.receitaBruta).toBe(7799); // inclui os 6799 de 01/06
    const maio = buildMonthlyDre({ orders, payables: [], monthKey: "2026-05" });
    expect(maio.receitaBruta).toBe(9999); // maio não é contaminado
  });

  it("mês parcial calcula mas avisa", () => {
    const d = buildMonthlyDre({ orders, payables: [], monthKey: "2026-06", coverage: { firstCompleteMonth: "2026-04", partialMonths: ["2026-06"] } });
    expect(d.availability.revenue).toBe("partial");
    expect(d.warnings.some((w) => w.code === "receita-parcial")).toBe(true);
    expect(d.receitaBruta).toBe(7799);
  });

  it("mês indisponível devolve null, nunca zero", () => {
    const d = buildMonthlyDre({ orders, payables: [], monthKey: "2026-01", coverage: { firstCompleteMonth: "2026-04", partialMonths: [] } });
    expect(d.availability.revenue).toBe("unavailable");
    expect(d.receitaBruta).toBeNull();
  });

  it("mês fechado sem pedidos => zero real (diferente de indisponível)", () => {
    // Abril está dentro da cobertura e fechado; não tem pedidos nesta fixture.
    const d = buildMonthlyDre({ orders, payables: [], monthKey: "2026-04", referenceDate: new Date(2026, 6, 15) });
    expect(d.receitaBruta).toBe(0);
    expect(d.availability.revenue).toBe("real");
  });

  it("fonte de pedidos ausente (null) => receita null", () => {
    const d = buildMonthlyDre({ orders: null, payables: [], monthKey: "2026-06" });
    expect(d.receitaBruta).toBeNull();
    expect(d.availability.revenue).toBe("unavailable");
  });
});

describe("buildMonthlyDre — null versus zero", () => {
  it("fonte real vazia devolve zero nas linhas de contas a pagar", () => {
    const d = buildMonthlyDre({ orders: [order(1, "2026-06-10", 100)], payables: [], monthKey: "2026-06" });
    expect(d.comissoes).toBe(0);
    expect(d.simplesNacional).toBe(0);
    expect(d.pessoal).toBe(0);
    expect(d.availability.commissions).toBe("real");
  });

  it("fonte ausente devolve null nas linhas de contas a pagar", () => {
    const d = buildMonthlyDre({ orders: [order(1, "2026-06-10", 100)], payables: null, monthKey: "2026-06" });
    expect(d.comissoes).toBeNull();
    expect(d.pessoal).toBeNull();
    expect(d.retiradasSocios).toBeNull();
    expect(d.availability.operatingExpenses).toBe("unavailable");
  });

  it("CMV ausente bloqueia lucro bruto, EBITDA e resultado líquido", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [], monthKey: "2026-06",
    });
    expect(d.cmv).toBeNull();
    expect(d.availability.cmv).toBe("unavailable");
    expect(d.receitaLiquida).toBe(1000);   // esta ainda é calculável
    expect(d.lucroBruto).toBeNull();
    expect(d.ebitda).toBeNull();
    expect(d.resultadoLiquido).toBeNull();
    expect(d.warnings.some((w) => w.code === "cmv-indisponivel")).toBe(true);
  });

  it("CMV manual permite os cálculos seguintes e é marcado como manual", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [], monthKey: "2026-06", manualInputs: { cmv: 400 },
    });
    expect(d.availability.cmv).toBe("manual");
    expect(d.lucroBruto).toBe(600);
    expect(d.ebitda).toBe(600);
    expect(d.resultadoLiquido).toBe(600);
  });

  it("frete de venda sem campo nos pedidos => null e warning (nunca zero)", () => {
    const d = buildMonthlyDre({ orders: [order(1, "2026-06-10", 1000)], payables: [], monthKey: "2026-06" });
    expect(d.freteVenda).toBeNull();
    expect(d.availability.salesFreight).toBe("unavailable");
    expect(d.totalDeducoes).toBeNull();
    expect(d.receitaLiquida).toBeNull(); // não se inventa dedução
    expect(d.warnings.some((w) => w.code === "frete-venda-sem-fonte")).toBe(true);
  });

  it("frete presente só em alguns pedidos => partial", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 10 }), order(2, "2026-06-11", 500)],
      payables: [], monthKey: "2026-06",
    });
    expect(d.availability.salesFreight).toBe("partial");
    expect(d.freteVenda).toBe(10);
  });
});

describe("buildMonthlyDre — compras e retiradas fora das operacionais", () => {
  it("compra de fornecedor não entra nas despesas operacionais", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [pay(1, "Compras de fornecedores", 50000, vencEm("2026-06-10"))],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.despesasOperacionais).toBe(0);
    expect(d.ebitda).toBe(1000);
  });

  it("retirada de sócios não entra nas operacionais e sai depois do EBITDA", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [pay(1, "Distribuição de Lucros", 300, vencEm("2026-06-10"))],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.despesasOperacionais).toBe(0);
    expect(d.ebitda).toBe(1000);
    expect(d.retiradasSocios).toBe(300);
    expect(d.resultadoLiquido).toBe(700);
  });

  it("não multiplica retiradas por número de sócios", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [pay(1, "Distribuição de Lucros", 1000, vencEm("2026-06-10"))],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.retiradasSocios).toBe(1000); // exatamente o registado
  });
});

describe("Referência Overcel — junho/2026 fecha centavo a centavo", () => {
  // Receita bruta e frete de venda vêm dos PEDIDOS; o resto das contas a pagar.
  const orders = [
    order(1, "2026-06-05", 100000.00, { frete: 1500.00 }),
    order(2, "2026-06-12", 60000.00, { frete: 1000.00 }),
    order(3, "2026-06-25", 46227.15, { frete: 597.80 }),
    order(9, "2026-05-20", 999999, { frete: 1 }), // outro mês, não deve entrar
  ];
  const payables = [
    pay(1, "Comissão sobre vendas", 1144.93, vencEm("2026-06-10")),
    pay(2, "Impostos sobre vendas", 26417.70, { dataEmissao: "2026-05-02", vencimento: "2026-06-20" }),
    pay(3, "Salários", 2800.00, { dataEmissao: "2025-01-01", vencimento: "2026-06-05" }),
    pay(4, "Aluguel", 2425.90, vencEm("2026-06-08")),
    pay(5, "Software", 500.00, vencEm("2026-06-09")),
    pay(6, "Tarifa bancária", 180.78, vencEm("2026-06-11")),
    pay(7, "Serviços de terceiros", 2500.00, vencEm("2026-06-12")),
    pay(8, "Pró-labore", 50597.84, vencEm("2026-06-15"), "Adiantamento de dividendos"),
    // Ruído que NÃO pode entrar na DRE operacional:
    pay(20, "Compras de fornecedores", 180000.00, vencEm("2026-06-18")),
    pay(21, "Importações", 90000.00, vencEm("2026-06-19")),
    pay(22, "Fretes e seguros", 4200.00, vencEm("2026-06-21")),
    pay(23, "Software", 300.00, { dataEmissao: "2026-06-15", vencimento: "2027-01-10" }), // 2027
  ];

  const dre = buildMonthlyDre({
    orders, payables, monthKey: "2026-06",
    manualInputs: { cmv: 116039.70 },
    coverage: { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"] },
  });

  it("receita bruta = 206.227,15", () => expect(dre.receitaBruta).toBe(206227.15));
  it("comissões = 1.144,93", () => expect(dre.comissoes).toBe(1144.93));
  it("devoluções = 0,00 (zero real)", () => expect(dre.devolucoes).toBe(0));
  it("frete de venda = 3.097,80 (dos pedidos, não das contas a pagar)", () => expect(dre.freteVenda).toBe(3097.80));
  it("Simples Nacional = 26.417,70", () => expect(dre.simplesNacional).toBe(26417.70));
  it("total de deduções = 30.660,43", () => expect(dre.totalDeducoes).toBe(30660.43));
  it("receita líquida = 175.566,72", () => expect(dre.receitaLiquida).toBe(175566.72));
  it("CMV manual = 116.039,70", () => expect(dre.cmv).toBe(116039.70));
  it("lucro bruto = 59.527,02", () => expect(dre.lucroBruto).toBe(59527.02));
  it("pessoal = 2.800,00", () => expect(dre.pessoal).toBe(2800));
  it("fixas = 2.925,90", () => expect(dre.fixas).toBe(2925.90));
  it("administrativas = 2.680,78", () => expect(dre.administrativas).toBe(2680.78));
  it("despesas operacionais = 8.406,68", () => expect(dre.despesasOperacionais).toBe(8406.68));
  it("EBITDA = 51.120,34", () => expect(dre.ebitda).toBe(51120.34));
  it("retiradas de sócios = 50.597,84", () => expect(dre.retiradasSocios).toBe(50597.84));
  it("RESULTADO LÍQUIDO = 522,50", () => expect(dre.resultadoLiquido).toBe(522.50));

  it("o pró-labore com histórico de dividendos gerou warning", () => {
    expect(dre.warnings.some((w) => w.code === "categoria-historico-contraditorios")).toBe(true);
  });

  it("compras, importações e fretes pagos ficaram fora das operacionais", () => {
    // 180.000 + 90.000 + 4.200 = 274.200 não contaminaram nenhuma linha da DRE
    expect(dre.despesasOperacionais).toBe(8406.68);
  });

  it("o título com vencimento em 2027 não entrou em junho", () => {
    expect(dre.fixas).toBe(2925.90); // 2425,90 + 500,00, sem os 300,00 de 2027
  });
});

describe("buildDreSeries e availableDreMonths", () => {
  const orders = [order(1, "2026-05-10", 100), order(2, "2026-06-10", 200)];
  const payables = [pay(1, "Aluguel", 50, vencEm("2026-06-05"))];

  it("lista os meses presentes nas fontes, ordenados", () => {
    expect(availableDreMonths({ orders, payables })).toEqual(["2026-05", "2026-06"]);
  });

  it("série respeita manualInputs por mês", () => {
    const s = buildDreSeries({
      orders, payables, months: ["2026-05", "2026-06"],
      manualInputsByMonth: { "2026-06": { cmv: 20 } },
    });
    expect(s[0].cmv).toBeNull();  // maio sem CMV
    expect(s[1].cmv).toBe(20);    // junho com CMV manual
    expect(s.map((d) => d.monthKey)).toEqual(["2026-05", "2026-06"]);
  });

  it("nunca inventa meses ausentes", () => {
    expect(availableDreMonths({ orders: [], payables: [] })).toEqual([]);
    expect(buildDreSeries({ orders, payables, months: [] })).toEqual([]);
  });
});

describe("revenueAvailability — mês corrente é parcial", () => {
  const cov = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"], closedThroughMonth: "2026-06" };
  const REF = new Date(2026, 6, 15); // 15/07/2026

  it("mês anterior ao primeiro completo => unavailable", () => {
    expect(revenueAvailability("2026-01", cov, REF)).toBe("unavailable");
    expect(revenueAvailability("2026-02", cov, REF)).toBe("unavailable");
  });

  it("mês explicitamente parcial => partial", () => {
    expect(revenueAvailability("2026-03", cov, REF)).toBe("partial");
  });

  it("meses até closedThroughMonth => real", () => {
    expect(revenueAvailability("2026-04", cov, REF)).toBe("real");
    expect(revenueAvailability("2026-05", cov, REF)).toBe("real");
    expect(revenueAvailability("2026-06", cov, REF)).toBe("real");
  });

  it("JULHO/2026 com fecho até junho => partial (mês corrente aberto)", () => {
    expect(revenueAvailability("2026-07", cov, REF)).toBe("partial");
  });

  it("mês posterior ao último fechado => partial", () => {
    expect(revenueAvailability("2026-08", cov, REF)).toBe("partial");
  });

  it("sem closedThroughMonth, o mês da referenceDate é parcial", () => {
    const semFecho = { firstCompleteMonth: "2026-04", partialMonths: [] };
    expect(revenueAvailability("2026-07", semFecho, REF)).toBe("partial"); // mês corrente
    expect(revenueAvailability("2026-06", semFecho, REF)).toBe("real");    // mês anterior fechado
  });

  it("motor marca o mês corrente como parcial (referenceDate injetada)", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 500)], payables: [], monthKey: "2026-07",
      coverage: { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" },
      referenceDate: REF,
    });
    expect(d.availability.revenue).toBe("partial");
    expect(d.receitaBruta).toBe(500); // calcula, mas avisa
    expect(d.warnings.some((w) => w.code === "receita-parcial")).toBe(true);
  });
});

describe("isCancelledPayable — cancelados fora da DRE", () => {
  it("tolera situacao numérica e objeto", () => {
    expect(isCancelledPayable({ situacao: 5 })).toBe(true);
    expect(isCancelledPayable({ situacao: { id: 5 } })).toBe(true);
    expect(isCancelledPayable({ situacao: "5" })).toBe(true);
  });

  it("pago (2) e em aberto (1) NÃO são cancelados", () => {
    expect(isCancelledPayable({ situacao: 1 })).toBe(false);
    expect(isCancelledPayable({ situacao: 2 })).toBe(false);
    expect(isCancelledPayable({ situacao: { id: 1 } })).toBe(false);
    expect(isCancelledPayable(null)).toBe(false);
  });

  it("título pago entra e título em aberto entra por competência", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [
        { ...pay(1, "Salários", 1000, vencEm("2026-06-05")), situacao: 2 },  // pago
        { ...pay(2, "Aluguel", 500, vencEm("2026-06-06")), situacao: 1 },    // em aberto
      ],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.pessoal).toBe(1000);
    expect(d.fixas).toBe(500);
  });

  it("cancelado numérico não entra em nenhuma linha", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [
        { ...pay(1, "Comissão sobre vendas", 999, vencEm("2026-06-05")), situacao: 5 },
        { ...pay(2, "Salários", 888, vencEm("2026-06-05")), situacao: 5 },
        { ...pay(3, "Impostos sobre vendas", 777, vencEm("2026-06-05")), situacao: 5 },
        { ...pay(4, "Distribuição de Lucros", 666, vencEm("2026-06-05")), situacao: 5 },
      ],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.comissoes).toBe(0);
    expect(d.pessoal).toBe(0);
    expect(d.simplesNacional).toBe(0);
    expect(d.retiradasSocios).toBe(0);
    expect(d.warnings.some((w) => w.code === "titulos-cancelados-excluidos")).toBe(true);
  });

  it("cancelado em forma de objeto também não entra", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [{ ...pay(1, "Salários", 999, vencEm("2026-06-05")), situacao: { id: 5 } }],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.pessoal).toBe(0);
  });

  it("lista real só com cancelados => ZERO real, nunca null", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [{ ...pay(1, "Salários", 999, vencEm("2026-06-05")), situacao: 5 }],
      monthKey: "2026-06", manualInputs: { cmv: 0 },
    });
    expect(d.pessoal).toBe(0);
    expect(d.pessoal).not.toBeNull();
    expect(d.availability.pessoal).toBe("real");
  });
});

describe("combineAvailability e disponibilidade por linha", () => {
  it("unavailable domina; depois partial", () => {
    expect(combineAvailability("real", "unavailable")).toBe("unavailable");
    expect(combineAvailability("real", "partial")).toBe("partial");
    expect(combineAvailability("partial", "unavailable")).toBe("unavailable");
    expect(combineAvailability("real", "real")).toBe("real");
  });

  it("manual puro fica manual; manual com real fica mixed", () => {
    expect(combineAvailability("manual", "manual")).toBe("manual");
    expect(combineAvailability("manual", "real")).toBe("mixed");
  });

  it("receita real + frete parcial => receita líquida PARCIAL", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 10 }), order(2, "2026-06-11", 500)],
      payables: [], monthKey: "2026-06",
    });
    expect(d.availability.freteVenda).toBe("partial");
    expect(d.availability.receitaLiquida).toBe("partial");
  });

  it("receita real + frete indisponível => receita líquida INDISPONÍVEL", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000)], payables: [], monthKey: "2026-06",
    });
    expect(d.availability.freteVenda).toBe("unavailable");
    expect(d.availability.receitaLiquida).toBe("unavailable");
    expect(d.receitaLiquida).toBeNull();
  });

  it("CMV manual + restantes reais => lucro bruto MIXED (legenda honesta)", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [], monthKey: "2026-06", manualInputs: { cmv: 400 },
    });
    expect(d.availability.receitaLiquida).toBe("real");
    expect(d.availability.cmv).toBe("manual");
    expect(d.availability.lucroBruto).toBe("mixed");
  });

  it("frete PARCIAL propaga parcialidade até ao EBITDA (a origem é o frete)", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 10 }), order(2, "2026-06-11", 500)],
      payables: [], monthKey: "2026-06", manualInputs: { cmv: 100 },
    });
    expect(d.availability.ebitda).toBe("partial");
    // prova de que a parcialidade vem do frete e NÃO das despesas operacionais
    expect(d.availability.freteVenda).toBe("partial");
    expect(d.availability.despesasOperacionais).toBe("real");
  });

  it("retirada indisponível => resultado líquido INDISPONÍVEL", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: null, monthKey: "2026-06", manualInputs: { cmv: 100 },
    });
    expect(d.availability.retiradasSocios).toBe("unavailable");
    expect(d.availability.resultadoLiquido).toBe("unavailable");
    expect(d.resultadoLiquido).toBeNull();
  });

  it("todas as fontes reais => linha derivada real", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 50 })],
      payables: [pay(1, "Aluguel", 100, vencEm("2026-06-05"))],
      monthKey: "2026-06",
    });
    expect(d.availability.totalDeducoes).toBe("real");
    expect(d.availability.receitaLiquida).toBe("real");
    expect(d.availability.despesasOperacionais).toBe("real");
  });

  it("o objeto de disponibilidade cobre todas as 16 linhas", () => {
    const d = buildMonthlyDre({ orders: [], payables: [], monthKey: "2026-06" });
    for (const k of ["receitaBruta", "comissoes", "devolucoes", "freteVenda", "simplesNacional",
      "totalDeducoes", "receitaLiquida", "cmv", "lucroBruto", "pessoal", "fixas",
      "administrativas", "despesasOperacionais", "ebitda", "retiradasSocios", "resultadoLiquido"]) {
      expect(d.availability[k]).toBeTruthy();
    }
  });
});

describe("cobertura temporal das CONTAS A PAGAR", () => {
  const REF_JUL = new Date(2026, 6, 15); // 15/07/2026
  const covAteJunho = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };

  it("payables em julho com fecho até junho => calculados mas PARCIAIS", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 0 })],
      payables: [
        pay(1, "Salários", 2800, vencEm("2026-07-05")),
        pay(2, "Aluguel", 500, vencEm("2026-07-08")),
      ],
      monthKey: "2026-07", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.pessoal).toBe(2800);                              // valor calculado
    expect(d.availability.pessoal).toBe("partial");
    expect(d.availability.fixas).toBe("partial");
    expect(d.availability.administrativas).toBe("partial");
    expect(d.availability.despesasOperacionais).toBe("partial");
  });

  it("retiradas em julho => valor calculado, disponibilidade e resultado líquido parciais", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 0 })],
      payables: [pay(1, "Distribuição de Lucros", 300, vencEm("2026-07-10"))],
      monthKey: "2026-07", coverage: covAteJunho, referenceDate: REF_JUL,
      manualInputs: { cmv: 100 },
    });
    expect(d.retiradasSocios).toBe(300);
    expect(d.availability.retiradasSocios).toBe("partial");
    expect(d.resultadoLiquido).not.toBeNull();
    expect(d.availability.resultadoLiquido).toBe("partial");
  });

  it("despesas PARCIAIS com receita real e CMV manual => EBITDA parcial (origem: despesas)", () => {
    // Pedidos fechados até julho, contas a pagar só até junho: snapshots distintos.
    const cov = {
      firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-07",
      payables: { closedThroughMonth: "2026-06" },
    };
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 50 })], // frete presente em todos
      payables: [pay(1, "Salários", 200, vencEm("2026-07-05"))],
      monthKey: "2026-07", coverage: cov, referenceDate: REF_JUL, manualInputs: { cmv: 100 },
    });
    expect(d.availability.revenue).toBe("real");        // receita real
    expect(d.availability.freteVenda).toBe("real");     // a parcialidade NÃO vem do frete
    expect(d.availability.despesasOperacionais).toBe("partial");
    expect(d.ebitda).not.toBeNull();                    // continua calculado
    expect(d.availability.ebitda).toBe("partial");
  });

  it("payables AUSENTES => linhas null e unavailable (cobertura não salva fonte ausente)", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 0 })],
      payables: null, monthKey: "2026-07", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.pessoal).toBeNull();
    expect(d.retiradasSocios).toBeNull();
    expect(d.availability.pessoal).toBe("unavailable");
    expect(d.availability.despesasOperacionais).toBe("unavailable");
    expect(d.availability.retiradasSocios).toBe("unavailable");
  });

  it("junho FECHADO => linhas de contas a pagar continuam reais", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [pay(1, "Salários", 2800, vencEm("2026-06-05"))],
      monthKey: "2026-06", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.availability.pessoal).toBe("real");
    expect(d.availability.despesasOperacionais).toBe("real");
    expect(d.availability.retiradasSocios).toBe("real");
  });

  it("sourceAvailability: fonte ausente é unavailable mesmo em mês fechado", () => {
    expect(sourceAvailability("2026-06", covAteJunho, REF_JUL, false)).toBe("unavailable");
    expect(sourceAvailability("2026-06", covAteJunho, REF_JUL, true)).toBe("real");
    expect(sourceAvailability("2026-07", covAteJunho, REF_JUL, true)).toBe("partial");
    expect(sourceAvailability("2026-01", covAteJunho, REF_JUL, true)).toBe("unavailable");
  });

  it("payablesCoverage herda o que não for sobreposto", () => {
    const cov = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"], closedThroughMonth: "2026-07", payables: { closedThroughMonth: "2026-05" } };
    const pc = payablesCoverage(cov);
    expect(pc.closedThroughMonth).toBe("2026-05");
    expect(pc.firstCompleteMonth).toBe("2026-04");
    expect(pc.partialMonths).toEqual(["2026-03"]);
    expect(payablesCoverage({ closedThroughMonth: "2026-06" }).closedThroughMonth).toBe("2026-06");
  });
});

describe("frete de venda herda a cobertura da receita", () => {
  const REF_JUL = new Date(2026, 6, 15);
  const covAteJunho = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-06" };

  it("julho parcial + TODOS os pedidos com frete => frete calculado mas PARCIAL", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 40 }), order(2, "2026-07-09", 500, { frete: 10 })],
      payables: [], monthKey: "2026-07", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.availability.revenue).toBe("partial");
    expect(d.freteVenda).toBe(50);                     // valor calculado na mesma
    expect(d.availability.freteVenda).toBe("partial"); // não pode ser mais fiável que a receita
    expect(d.availability.salesFreight).toBe("partial");
  });

  it("pedidos fechados até julho + todos com frete => frete REAL", () => {
    const cov = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2026-07" };
    const d = buildMonthlyDre({
      orders: [order(1, "2026-07-03", 1000, { frete: 40 })],
      payables: [], monthKey: "2026-07", coverage: cov, referenceDate: REF_JUL,
    });
    expect(d.availability.revenue).toBe("real");
    expect(d.availability.freteVenda).toBe("real");
  });

  it("receita real + campo de frete incompleto => partial", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-03", 1000, { frete: 40 }), order(2, "2026-06-09", 500)],
      payables: [], monthKey: "2026-06", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.availability.freteVenda).toBe("partial");
  });

  it("receita indisponível => frete indisponível", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-01-03", 1000, { frete: 40 })],
      payables: [], monthKey: "2026-01", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.availability.revenue).toBe("unavailable");
    expect(d.availability.freteVenda).toBe("unavailable");
  });

  it("sem campo de frete => indisponível, mesmo com receita real", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-03", 1000)],
      payables: [], monthKey: "2026-06", coverage: covAteJunho, referenceDate: REF_JUL,
    });
    expect(d.availability.revenue).toBe("real");
    expect(d.availability.freteVenda).toBe("unavailable");
  });
});

describe("availableDreMonths ignora títulos cancelados", () => {
  it("payable cancelado sozinho NÃO cria mês", () => {
    const cancelado = { ...pay(1, "Salários", 500, vencEm("2026-09-10")), situacao: 5 };
    expect(availableDreMonths({ orders: [], payables: [cancelado] })).toEqual([]);
  });

  it("payable cancelado em forma de objeto também não cria mês", () => {
    const cancelado = { ...pay(1, "Salários", 500, vencEm("2026-09-10")), situacao: { id: 5 } };
    expect(availableDreMonths({ orders: [], payables: [cancelado] })).toEqual([]);
  });

  it("payable em ABERTO cria mês", () => {
    const aberto = { ...pay(1, "Salários", 500, vencEm("2026-09-10")), situacao: 1 };
    expect(availableDreMonths({ orders: [], payables: [aberto] })).toEqual(["2026-09"]);
  });

  it("payable PAGO cria mês", () => {
    const pago = { ...pay(1, "Salários", 500, vencEm("2026-09-10")), situacao: 2 };
    expect(availableDreMonths({ orders: [], payables: [pago] })).toEqual(["2026-09"]);
  });

  it("mês só com cancelados desaparece da lista; os outros mantêm-se", () => {
    const meses = availableDreMonths({
      orders: [order(1, "2026-06-10", 100)],
      payables: [
        { ...pay(1, "Salários", 500, vencEm("2026-09-10")), situacao: 5 }, // mês só com cancelado
        { ...pay(2, "Aluguel", 200, vencEm("2026-08-05")), situacao: 2 },
      ],
    });
    expect(meses).toEqual(["2026-06", "2026-08"]);
  });
});

describe("combineAvailability propaga 'mixed'", () => {
  it("mixed combinado com real continua mixed (a marca manual não se perde)", () => {
    expect(combineAvailability("mixed", "real")).toBe("mixed");
    expect(combineAvailability("real", "mixed")).toBe("mixed");
    expect(combineAvailability("mixed", "mixed")).toBe("mixed");
  });
  it("partial e unavailable continuam a dominar mixed", () => {
    expect(combineAvailability("mixed", "partial")).toBe("partial");
    expect(combineAvailability("mixed", "unavailable")).toBe("unavailable");
  });
  it("CMV manual marca toda a cadeia até ao resultado líquido", () => {
    const d = buildMonthlyDre({
      orders: [order(1, "2026-06-10", 1000, { frete: 0 })],
      payables: [pay(1, "Aluguel", 100, vencEm("2026-06-05"))],
      monthKey: "2026-06", manualInputs: { cmv: 200 },
    });
    expect(d.availability.lucroBruto).toBe("mixed");
    expect(d.availability.ebitda).toBe("mixed");
    expect(d.availability.resultadoLiquido).toBe("mixed");
  });
});