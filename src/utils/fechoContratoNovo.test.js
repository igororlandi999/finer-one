// CONTRATO do fecho mensal depois da separação dos eixos (24/08/2026).
//
// O ficheiro irmão — `fechoCivilVsValidacao.test.js` — descreve o DEFEITO que existia
// quando `closedThroughMonth` respondia a duas perguntas ao mesmo tempo. Este descreve
// o que passou a estar garantido.
//
// ─── OS TRÊS EIXOS ──────────────────────────────────────────────────────────────────
//   1. COBERTURA DA FONTE   `completeThroughMonth`   até onde o ERP entregou tudo
//   2. CALENDÁRIO           o relógio                 que meses já terminaram
//   3. VALIDAÇÃO HUMANA     `validatedThroughMonth`   até onde alguém reviu
//
// Só os dois primeiros decidem se um dado pode ser PEDIDO. O terceiro é informativo e
// não silencia nada — foi precisamente ao silenciar que criou o ciclo.
//
// NADA aqui testa uma fórmula. Todos estes testes são sobre DISPONIBILIDADE e sobre o
// direito de pedir um dado, nunca sobre o valor de um número.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import {
  buildMonthlyClosing, latestCompleteMonthKey, CLOSING_STATUS, ITEM_STATUS,
} from "./monthlyClosing.js";

const NOW_AGOSTO = new Date(2026, 7, 24);   // 24/08/2026, local

const PEDIDOS_JULHO = [
  { id: 1, date: "2026-07-03", total: 100000, status: "recebida" },
  { id: 2, date: "2026-07-18", total: 72995.4, status: "em_aberto" },
];
const PAGAR_JULHO = [
  { id: 10, vencimento: "2026-07-10", dataEmissao: "2026-07-01", valor: 12000,
    categoriaNome: "Salários", situacao: 2 },
];

/** Cobertura depois da separação — a forma real de company.js. */
const COVERAGE_NOVA = {
  firstCompleteMonth: "2026-04",
  partialMonths: ["2026-03"],
  completeThroughMonth: null,        // deriva do relógio
  validatedThroughMonth: "2026-06",  // validação humana em atraso — não cala nada
};

/** Fecha um mês pelo caminho oficial, com a data injetada onde o motor a exige. */
function fecharMes(mk, {
  coverage = COVERAGE_NOVA, manualInputs, now = NOW_AGOSTO,
  orders = PEDIDOS_JULHO, payables = PAGAR_JULHO,
} = {}) {
  const dre = buildMonthlyDre({
    orders, payables, monthKey: mk, manualInputs, coverage, referenceDate: now,
  });
  const metrics = buildFinancialMetrics(dre);
  return { dre, metrics, closing: buildMonthlyClosing({ monthKey: mk, metrics, now, coverage }) };
}

describe("CONTRATO — o mês civil encerrado pode pedir o que lhe falta", () => {
  it("julho: receita real, CMV em falta, mês INCOMPLETE com pendência acionável", () => {
    const { metrics, closing } = fecharMes("2026-07");
    // A receita deixou de ser rebaixada por uma validação humana em atraso.
    expect(metrics.revenue.grossAvailability).toBe("real");
    expect(closing.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(closing.missingItems.map((i) => i.key)).toEqual(["cmv"]);
  });

  it("e consegue-o SEM que ninguém edite company.js", () => {
    // A cobertura da fonte é `null`: não há data escrita à mão em lado nenhum.
    expect(COVERAGE_NOVA.completeThroughMonth).toBeNull();
    expect(fecharMes("2026-07").closing.missingItems).toHaveLength(1);
  });

  it("a validação humana em atraso NÃO silencia a pendência", () => {
    expect(COVERAGE_NOVA.validatedThroughMonth).toBe("2026-06");
    expect(fecharMes("2026-07").closing.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });
});

describe("CONTRATO — o que NÃO pode ser pedido", () => {
  it("mês CORRENTE fica IN_PROGRESS e nunca entra em pendências", () => {
    const emAgosto = [{ id: 9, date: "2026-08-05", total: 5000, status: "recebida" }];
    const { closing } = fecharMes("2026-08", { orders: emAgosto, payables: [] });
    expect(closing.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(closing.missingItems).toEqual([]);
  });

  it("mês FUTURO nunca é declarado real, mesmo com títulos lá dentro", () => {
    // O snapshot de contas a pagar tem vencimentos até 2027: era por aqui que a
    // âncora da DRE saltava para um mês que ainda nem tinha começado.
    const { metrics, closing } = fecharMes("2027-07", { orders: [], payables: [] });
    expect(metrics.revenue.grossAvailability).not.toBe("real");
    expect(closing.missingItems).toEqual([]);
  });

  it("mês com receita real ZERO: CMV é NOT_APPLICABLE, não uma pendência", () => {
    // Zero real é um dado, não uma lacuna: não houve venda, não há CMV a pedir.
    const { closing } = fecharMes("2026-05", { orders: [], payables: [] });
    expect(closing.items.find((i) => i.key === "cmv").status).toBe(ITEM_STATUS.NOT_APPLICABLE);
    expect(closing.missingItems).toEqual([]);
  });

  it("mês ANTES da cobertura histórica fica PENDING, sem alerta falso", () => {
    const { closing } = fecharMes("2026-02", { orders: [], payables: [] });
    expect(closing.items.find((i) => i.key === "cmv").status).toBe(ITEM_STATUS.PENDING);
    expect(closing.missingItems).toEqual([]);
  });

  it("fonte declarada PARCIAL continua indeterminada — partial nunca vira complete", () => {
    // março está em partialMonths: a receita é subavaliada por definição, logo um
    // zero pode ser lacuna de cobertura e um valor > 0 não garante o mês inteiro.
    const emMarco = [{ id: 7, date: "2026-03-10", total: 1000, status: "recebida" }];
    const { metrics, closing } = fecharMes("2026-03", { orders: emMarco, payables: [] });
    expect(metrics.revenue.grossAvailability).toBe("partial");
    expect(closing.status).not.toBe(CLOSING_STATUS.COMPLETE);
    expect(closing.missingItems).toEqual([]);
  });
});

describe("CONTRATO — o CMV, venha de onde vier", () => {
  it("CMV manual ZERO é um valor real e fecha o mês", () => {
    const { closing } = fecharMes("2026-07", { manualInputs: { cmv: 0 } });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(closing.completedItems.map((i) => i.key)).toEqual(["cmv"]);
    // E o zero sobrevive à viagem: nunca é confundido com ausência.
    expect(closing.items.find((i) => i.key === "cmv").value).toBe(0);
  });

  it("CMV manual com valor fecha o mês e marca a origem", () => {
    const { closing } = fecharMes("2026-07", { manualInputs: { cmv: 90000 } });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(closing.items.find((i) => i.key === "cmv").source).toBe("manual");
  });

  it("um ERP que forneça CMV real fecha o mês sem pedir nada ao utilizador", () => {
    /* ERP-agnóstico por construção: o motor lê `availability`, nunca a marca de quem
     * a produziu. Simula-se o que uma integração com CMV automático produziria. */
    const metrics = {
      monthKey: "2026-07",
      revenue: { gross: 172995.4, grossAvailability: "real" },
      cmv: { value: 88000, availability: "real" },
    };
    const closing = buildMonthlyClosing({
      monthKey: "2026-07", metrics, now: NOW_AGOSTO, coverage: COVERAGE_NOVA,
    });
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(closing.items.find((i) => i.key === "cmv").source).toBe("real");
    expect(closing.missingItems).toEqual([]);
  });
});

describe("CONTRATO — junho não muda por causa de julho nem de agosto", () => {
  const PEDIDOS_MULTI = [
    { id: 1, date: "2026-06-10", total: 206179.15, status: "recebida" },
    { id: 2, date: "2026-07-03", total: 172995.4, status: "recebida" },
    { id: 3, date: "2026-08-05", total: 99999, status: "recebida" },
  ];

  it("a receita de junho é a mesma antes e depois de existirem meses posteriores", () => {
    const so = fecharMes("2026-06", { orders: [PEDIDOS_MULTI[0]], payables: [] });
    const comTudo = fecharMes("2026-06", { orders: PEDIDOS_MULTI, payables: [] });
    expect(comTudo.metrics.revenue.gross).toBe(so.metrics.revenue.gross);
    expect(comTudo.metrics.revenue.gross).toBe(206179.15);
  });

  it("junho continua real, e com CMV lançado continua COMPLETE", () => {
    const { metrics, closing } = fecharMes("2026-06", {
      orders: PEDIDOS_MULTI, payables: [], manualInputs: { cmv: 116039.7 },
    });
    expect(metrics.revenue.grossAvailability).toBe("real");
    expect(closing.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("um título com vencimento em 2027 não contamina o mês de junho", () => {
    const futuros = [{
      id: 99, vencimento: "2027-07-10", dataEmissao: "2027-07-01",
      valor: 500000, categoriaNome: "Aluguel", situacao: 2,
    }];
    const semFuturo = fecharMes("2026-06", { orders: [PEDIDOS_MULTI[0]], payables: [] });
    const comFuturo = fecharMes("2026-06", { orders: [PEDIDOS_MULTI[0]], payables: futuros });
    expect(comFuturo.dre.totalDespesasOperacionais)
      .toBe(semFuturo.dre.totalDespesasOperacionais);
  });
});

describe("CONTRATO — a âncora dos KPIs é o último mês COMPLETO", () => {
  const fecho = (monthKey, status, totalComplete) => ({ monthKey, status, totalComplete });

  it("escolhe junho enquanto julho não tiver CMV", () => {
    expect(latestCompleteMonthKey([
      fecho("2026-07", CLOSING_STATUS.INCOMPLETE, 0),
      fecho("2026-06", CLOSING_STATUS.COMPLETE, 1),
      fecho("2026-05", CLOSING_STATUS.COMPLETE, 1),
    ])).toBe("2026-06");
  });

  it("passa a julho no momento em que julho ficar completo", () => {
    expect(latestCompleteMonthKey([
      fecho("2026-07", CLOSING_STATUS.COMPLETE, 1),
      fecho("2026-06", CLOSING_STATUS.COMPLETE, 1),
    ])).toBe("2026-07");
  });

  it("um mês COMPLETO por vacuidade não pode ser âncora", () => {
    /* Regressão real, apanhada pela suite: um mês sem uma única venda fecha com
     * totalComplete 0 (o CMV não se aplica) e ganhava a um mês movimentado só por
     * não dever nada. As margens de um mês sem vendas não significam coisa nenhuma. */
    expect(latestCompleteMonthKey([
      fecho("2026-06", CLOSING_STATUS.COMPLETE, 0),   // vazio
      fecho("2026-05", CLOSING_STATUS.COMPLETE, 1),   // real
    ])).toBe("2026-05");
  });

  it("sem nenhum mês completo devolve null, e nunca inventa um", () => {
    expect(latestCompleteMonthKey([
      fecho("2026-07", CLOSING_STATUS.INCOMPLETE, 0),
      fecho("2026-06", CLOSING_STATUS.INDETERMINATE, 0),
    ])).toBeNull();
    expect(latestCompleteMonthKey([])).toBeNull();
    expect(latestCompleteMonthKey(null)).toBeNull();
  });
});
