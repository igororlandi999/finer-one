// Invariantes financeiros do Finer One.
//
// ─── O QUE ESTE FICHEIRO É ──────────────────────────────────────────────────────────
// Uma rede de segurança sobre as distinções que este projeto já pagou caro para
// aprender. Não reimplementa nem reescreve motor nenhum: exercita o comportamento
// público e fixa-o.
//
// Cada bloco protege uma confusão CONCRETA que já aconteceu ou que estaria a um
// refactor de distância. A pergunta que cada teste responde é sempre a mesma: «se
// alguém colapsar estas duas coisas por engano, alguma coisa protesta?»
//
// Estes testes são deliberadamente redundantes com testes de unidade espalhados pela
// suíte. A redundância é o ponto: um invariante que só é protegido por um teste local
// desaparece quando esse ficheiro for reorganizado.

import { describe, it, expect } from "vitest";
import {
  classifyPayable, buildMonthlyDre, sourceAvailability, DRE_GROUPS,
  payableCompetenceMonth, isCancelledPayable, availableDreMonths,
} from "./dreEngine.js";
import { latestUsableFinancialMonth } from "./financialMetrics.js";
import { currentMonthKey, latestRevenueMonthAtOrBefore } from "./performanceCalculations.js";
import { closedMonthKeys } from "./monthlyClosing.js";

const COBERTURA = {
  firstCompleteMonth: "2026-01",
  partialMonths: [],
  closedThroughMonth: "2026-06",
};
const AGORA = new Date(2026, 7, 23, 12, 0, 0);   // 23/08/2026

const pedido = (id, data, total) => ({ id, date: data, total, status: "recebida" });
const titulo = (o) => ({ situacao: 2, valor: 0, ...o });

/* ==================================================================================== *
 * 1. DRE não é tesouraria.
 * ==================================================================================== */
describe("INVARIANTE · DRE ≠ tesouraria", () => {
  it("um título entra pela COMPETÊNCIA, não pela data em que o dinheiro sai", () => {
    // Competência em junho, vencimento em setembro: pertence a JUNHO.
    const t = titulo({ id: 1, competencia: "2026-06-05", vencimento: "2026-09-30", valor: 500, categoriaNome: "Aluguel" });
    expect(payableCompetenceMonth(t)).toBe("2026-06");
  });

  it("a ordem de precedência da competência é estável", () => {
    // competencia > vencimentoOriginal > vencimento > dataEmissao (este último, fallback).
    expect(payableCompetenceMonth(titulo({ competencia: "2026-01-01", vencimentoOriginal: "2026-02-01", vencimento: "2026-03-01", dataEmissao: "2026-04-01" }))).toBe("2026-01");
    expect(payableCompetenceMonth(titulo({ vencimentoOriginal: "2026-02-01", vencimento: "2026-03-01", dataEmissao: "2026-04-01" }))).toBe("2026-02");
    expect(payableCompetenceMonth(titulo({ vencimento: "2026-03-01", dataEmissao: "2026-04-01" }))).toBe("2026-03");
    expect(payableCompetenceMonth(titulo({ dataEmissao: "2026-04-01" }))).toBe("2026-04");
  });

  it("um título CANCELADO nunca entra na DRE", () => {
    expect(isCancelledPayable(titulo({ situacao: 5 }))).toBe(true);
    expect(isCancelledPayable(titulo({ situacao: 2 }))).toBe(false);
    // E não cria mês nenhum.
    const meses = availableDreMonths({ payables: [titulo({ id: 1, situacao: 5, competencia: "2030-01-01" })] });
    expect(meses).not.toContain("2030-01");
  });
});

/* ==================================================================================== *
 * 2. Conta a pagar não é despesa operacional.
 * ==================================================================================== */
describe("INVARIANTE · payable ≠ despesa operacional", () => {
  it("compras de estoque são uma SAÍDA, mas não são despesa da DRE", () => {
    const { group } = classifyPayable(titulo({ categoriaNome: "Compras de fornecedores" }));
    expect(group).toBe(DRE_GROUPS.COMPRAS_ESTOQUE);
    // O grupo existe precisamente para não somar em despesasOperacionais.
    expect(group).not.toBe(DRE_GROUPS.ADMINISTRATIVAS);
    expect(group).not.toBe(DRE_GROUPS.FIXAS);
    expect(group).not.toBe(DRE_GROUPS.PESSOAL);
  });

  it("retiradas de sócios não são despesa operacional nem pessoal", () => {
    expect(classifyPayable(titulo({ categoriaNome: "Distribuição de lucros" })).group).toBe(DRE_GROUPS.RETIRADAS);
    // Mesmo com categoria de pró-labore, um histórico de dividendos manda na classificação.
    const r = classifyPayable(titulo({ categoriaNome: "Pró-labore", historico: "Dividendos do trimestre" }));
    expect(r.group).toBe(DRE_GROUPS.RETIRADAS);
    expect(r.warnings.some((w) => w.code === "categoria-historico-contraditorios")).toBe(true);
  });

  it("pró-labore SEM histórico de retirada é pessoal, não retirada", () => {
    expect(classifyPayable(titulo({ categoriaNome: "Pró-labore" })).group).toBe(DRE_GROUPS.PESSOAL);
  });

  it("compras e estoque NÃO contam como despesa operacional na DRE", () => {
    const payables = [
      titulo({ id: 1, competencia: "2026-06-10", valor: 100000, categoriaNome: "Compras de fornecedores" }),
      titulo({ id: 2, competencia: "2026-06-10", valor: 1000, categoriaNome: "Aluguel" }),
    ];
    const dre = buildMonthlyDre({ orders: [], payables, monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    // Só o aluguel entra. Os 100 000 de compras ficam fora — viram CMV quando vendidos.
    expect(dre.despesasOperacionais).toBe(1000);
    expect(dre.fixas).toBe(1000);
  });
});

/* ==================================================================================== *
 * 3. Frete cobrado ao cliente ≠ frete pago pela empresa.
 * ==================================================================================== */
describe("INVARIANTE · frete de venda ≠ frete pago", () => {
  it("frete PAGO tem grupo próprio e fica fora das linhas operacionais", () => {
    expect(classifyPayable(titulo({ categoriaNome: "Fretes e seguros" })).group).toBe(DRE_GROUPS.FRETE_PAGO);
  });

  it("o frete pago não entra em despesasOperacionais", () => {
    const payables = [titulo({ id: 1, competencia: "2026-06-10", valor: 2600, categoriaNome: "Fretes e seguros" })];
    const dre = buildMonthlyDre({ orders: [], payables, monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    expect(dre.despesasOperacionais).toBe(0);
  });

  it("o frete de VENDA vem do pedido e é informativo — não deduz a receita", () => {
    const orders = [{ ...pedido(1, "2026-06-10", 1000), frete: 150 }];
    const dre = buildMonthlyDre({ orders, payables: [], monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    expect(dre.freteVenda).toBe(150);
    // A receita líquida NÃO desconta o frete de venda.
    expect(dre.receitaLiquida).toBe(dre.receitaBruta - dre.totalDeducoes);
    expect(dre.totalDeducoes).toBe(0);
  });
});

/* ==================================================================================== *
 * 4. Zero real ≠ indisponível.
 * ==================================================================================== */
describe("INVARIANTE · zero real ≠ unavailable", () => {
  it("uma lista VAZIA de contas a pagar é dado real: zeros verdadeiros", () => {
    const dre = buildMonthlyDre({ orders: [], payables: [], monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    expect(dre.despesasOperacionais).toBe(0);
    expect(dre.availability.despesasOperacionais).not.toBe("unavailable");
  });

  it("AUSÊNCIA de fonte (null) é unavailable — e nunca zero", () => {
    const dre = buildMonthlyDre({ orders: [], payables: null, monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    expect(dre.availability.despesasOperacionais).toBe("unavailable");
  });

  it("as duas situações produzem availability DIFERENTE — é essa a distinção", () => {
    const comLista = buildMonthlyDre({ orders: [], payables: [], monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    const semFonte = buildMonthlyDre({ orders: [], payables: null, monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA });
    expect(comLista.availability.despesasOperacionais).not.toBe(semFonte.availability.despesasOperacionais);
  });
});

/* ==================================================================================== *
 * 5 e 6. CMV: manual é manual, e custo atual não é custo histórico.
 * ==================================================================================== */
describe("INVARIANTE · CMV", () => {
  const base = { orders: [pedido(1, "2026-06-10", 1000)], payables: [], monthKey: "2026-06", coverage: COBERTURA, referenceDate: AGORA };

  it("um CMV informado à mão mantém availability 'manual' — nunca 'real'", () => {
    const dre = buildMonthlyDre({ ...base, manualInputs: { cmv: 400 } });
    expect(dre.cmv).toBe(400);
    expect(dre.availability.cmv).toBe("manual");
    expect(dre.availability.cmv).not.toBe("real");
  });

  it("a origem do valor é declarada explicitamente", () => {
    const dre = buildMonthlyDre({ ...base, manualInputs: { cmv: 400 } });
    expect(dre.sources.cmv).toMatch(/manual/i);
    expect(dre.sources.cmv).toMatch(/não calculado/i);
  });

  it("CMV = 0 é um valor REAL informado, não ausência", () => {
    const dre = buildMonthlyDre({ ...base, manualInputs: { cmv: 0 } });
    expect(dre.cmv).toBe(0);
    expect(dre.availability.cmv).toBe("manual");
  });

  it("sem CMV, lucro bruto / EBITDA / resultado líquido são null — nunca estimados", () => {
    const dre = buildMonthlyDre(base);
    expect(dre.cmv).toBeNull();
    expect(dre.lucroBruto).toBeNull();
    expect(dre.ebitda).toBeNull();
    expect(dre.resultadoLiquido).toBeNull();
    expect(dre.availability.cmv).toBe("unavailable");
    expect(dre.warnings.some((w) => w.code === "cmv-indisponivel")).toBe(true);
  });

  it("o motor NUNCA deriva CMV de contas a pagar de compras", () => {
    /* A confusão a evitar: «comprei 100 000 este mês, logo o CMV é 100 000». Compra é
     * estoque; CMV é o custo do que foi VENDIDO. Só o utilizador sabe a diferença. */
    const payables = [titulo({ id: 1, competencia: "2026-06-10", valor: 100000, categoriaNome: "Compras de fornecedores" })];
    const dre = buildMonthlyDre({ ...base, payables });
    expect(dre.cmv).toBeNull();
    expect(dre.availability.cmv).toBe("unavailable");
  });

  it("o CMV de um mês nunca é herdado por outro", () => {
    const comCmv = buildMonthlyDre({ ...base, manualInputs: { cmv: 400 } });
    const semCmv = buildMonthlyDre({ ...base, monthKey: "2026-05", manualInputs: undefined });
    expect(comCmv.cmv).toBe(400);
    expect(semCmv.cmv).toBeNull();
  });
});

/* ==================================================================================== *
 * 7, 8 e 9. Cobertura temporal: o futuro nunca é fechado.
 * ==================================================================================== */
describe("INVARIANTE · cobertura temporal", () => {
  const meses = ["2026-05", "2026-06", "2026-07", "2026-08", "2027-07"];
  const orders = meses.map((mk, i) => pedido(i + 1, `${mk}-15`, 100));

  it("um mês POSTERIOR ao fecho nunca é 'real'", () => {
    expect(sourceAvailability("2026-07", COBERTURA, AGORA)).toBe("partial");
    expect(sourceAvailability("2026-08", COBERTURA, AGORA)).toBe("partial");
  });

  it("um mês de vencimento FUTURO nunca vira o mês em curso", () => {
    /* Regressão da P0.3: uma conta a pagar com vencimento em 2027-07 criava a chave e
     * `allowPartial` aceitava-a. O Resumo chegou a exibir «2027-07 em andamento». */
    const emCurso = latestUsableFinancialMonth({ orders, coverage: COBERTURA, allowPartial: true, referenceDate: AGORA });
    expect(emCurso).toBe("2026-08");
    expect(emCurso < "2026-09").toBe(true);
  });

  it("o mês civil corrente nunca é escolhido como mês FECHADO", () => {
    const fechado = latestUsableFinancialMonth({ orders, coverage: COBERTURA, referenceDate: AGORA });
    expect(fechado).toBe("2026-06");
    expect(fechado).not.toBe("2026-08");
  });

  it("uma cobertura que declare o futuro como fechado não vence o calendário", () => {
    const absurda = { ...COBERTURA, closedThroughMonth: "2099-12" };
    // A cobertura diz que 2027-07 está fechado; o teto civil recusa-o à mesma.
    expect(latestUsableFinancialMonth({ orders, coverage: absurda, referenceDate: AGORA })).toBe("2026-08");
  });

  it("closedThroughMonth ausente NÃO pode libertar meses futuros", () => {
    /* P0.1-bis: `sourceAvailability` continua a ler a ausência como cobertura
     * ilimitada — por isso este teste protege o que HOJE limita o estrago, que é o teto
     * civil. Se um dia a via B for aplicada, o esperado passa a "2026-07" e este teste
     * tem de ser atualizado de propósito. */
    const semLimite = { ...COBERTURA, closedThroughMonth: null };
    const escolhido = latestUsableFinancialMonth({ orders, coverage: semLimite, referenceDate: AGORA });
    expect(escolhido).not.toBe("2027-07");
    expect(escolhido <= "2026-08").toBe(true);
  });
});

/* ==================================================================================== *
 * 10. Nenhuma função que escolhe meses pode devolver o futuro.
 * ====================================================================================
 * A P0.3 mostrou que este projeto já tinha o padrão certo em quase todo o lado — o que
 * faltava era aplicá-lo na única função que percorria os DADOS em vez do CALENDÁRIO.
 * Auditadas em 23/08/2026, as três derivações de mês do projeto:
 *
 *   closedMonthKeys              deriva do calendário  (nunca podia falhar)
 *   latestRevenueMonthAtOrBefore filtra por `<= limite` (já se protegia)
 *   latestUsableFinancialMonth   percorria os dados     (era o buraco — corrigido)
 *
 * Este bloco fixa a consistência entre as três, para que a próxima função que escolha
 * meses tenha um sítio óbvio onde provar que também se protege.
 */
describe("INVARIANTE · nenhuma escolha de mês devolve o futuro", () => {
  const meses = ["2026-06", "2026-07", "2026-08", "2026-12", "2027-07"];
  const orders = meses.map((mk, i) => pedido(i + 1, `${mk}-15`, 100));

  it("closedMonthKeys deriva do CALENDÁRIO e é sempre passado", () => {
    const chaves = closedMonthKeys({ now: AGORA, count: 3 });
    expect(chaves).toEqual(["2026-07", "2026-06", "2026-05"]);
    for (const k of chaves) expect(k < currentMonthKey(AGORA)).toBe(true);
  });

  it("latestRevenueMonthAtOrBefore ignora pedidos com data futura", () => {
    expect(latestRevenueMonthAtOrBefore(orders, AGORA)).toBe("2026-08");
  });

  it("latestUsableFinancialMonth nunca ultrapassa o mês civil", () => {
    const emCurso = latestUsableFinancialMonth({ orders, coverage: COBERTURA, allowPartial: true, referenceDate: AGORA });
    expect(emCurso).toBe("2026-08");
  });

  it("as três concordam sobre qual é o limite superior", () => {
    const limite = currentMonthKey(AGORA);
    expect(latestRevenueMonthAtOrBefore(orders, AGORA) <= limite).toBe(true);
    expect(latestUsableFinancialMonth({ orders, coverage: COBERTURA, allowPartial: true, referenceDate: AGORA }) <= limite).toBe(true);
    expect(closedMonthKeys({ now: AGORA, count: 1 })[0] < limite).toBe(true);
  });
});
