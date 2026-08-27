// Invariantes de CONTAMINAÇÃO — o complemento de invariantesFinanceiros.test.js.
//
// O ficheiro irmão protege confusões de CLASSIFICAÇÃO (o que entra em que linha).
// Este protege confusões de PROPAGAÇÃO: uma incerteza, um mês, ou um campo que
// contamina o que não devia — nos dois sentidos.
//
// Cada bloco corresponde a um risco identificado na auditoria de 2026-08-23.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre, combineAvailability, classifyPayable, DRE_GROUPS } from "./dreEngine.js";

const COBERTURA = {
  firstCompleteMonth: "2026-01",
  partialMonths: [],
  closedThroughMonth: "2026-06",
};
const AGORA = new Date(2026, 7, 23, 12, 0, 0);   // 23/08/2026

const pedido = (id, data, total) => ({ id, date: data, total, status: "recebida" });
const titulo = (o) => ({ situacao: 2, valor: 0, ...o });

const dreDe = ({ orders = [], payables = [], monthKey, manualInputs = undefined }) =>
  buildMonthlyDre({ orders, payables, monthKey, manualInputs, coverage: COBERTURA, refDate: AGORA });

/* ==================================================================================== *
 * 1. Uma parte incerta contamina o todo — nunca ao contrário.
 * ==================================================================================== */
describe("INVARIANTE · partial nunca sobe a real", () => {
  it("a combinação é pessimista: uma parte parcial torna o resultado parcial", () => {
    expect(combineAvailability("real", "partial")).toBe("partial");
    expect(combineAvailability("partial", "real", "real")).toBe("partial");
    expect(combineAvailability("manual", "partial")).toBe("partial");
    expect(combineAvailability("mixed", "partial")).toBe("partial");
  });

  it("unavailable domina tudo, incluindo partial", () => {
    expect(combineAvailability("partial", "unavailable")).toBe("unavailable");
    expect(combineAvailability("real", "real", "unavailable")).toBe("unavailable");
  });

  it("só tudo real dá real — não há maioria que ganhe", () => {
    expect(combineAvailability("real", "real")).toBe("real");
    expect(combineAvailability("real", "real", "partial")).not.toBe("real");
  });

  it("um valor manual nunca é lavado para real ao passar por outra linha", () => {
    /* Foi um defeito próprio: o EBITDA vindo de um lucro bruto "mixed" aparecia como
     * "real", e o utilizador perdia a marca de que havia lá um número escrito à mão. */
    expect(combineAvailability("mixed", "real")).toBe("mixed");
    expect(combineAvailability("manual", "real")).toBe("mixed");
    expect(combineAvailability("manual", "manual")).toBe("manual");
  });

  it("sem nenhuma parte conhecida, o resultado é unavailable — nunca real", () => {
    expect(combineAvailability()).toBe("unavailable");
    expect(combineAvailability(null, undefined)).toBe("unavailable");
  });
});

/* ==================================================================================== *
 * 2. A ausência de CMV bloqueia o que vem DEPOIS dele — e nada do que vem antes.
 * ==================================================================================== */
describe("INVARIANTE · o CMV ausente não contamina as linhas a montante", () => {
  const orders = [pedido(1, "2026-06-10", 100000)];
  const payables = [
    titulo({ id: 1, categoriaNome: "Comissão sobre vendas", vencimento: "2026-06-05", valor: 3000 }),
    titulo({ id: 2, categoriaNome: "Impostos sobre vendas", vencimento: "2026-06-20", valor: 12000 }),
    titulo({ id: 3, categoriaNome: "Aluguel", vencimento: "2026-06-01", valor: 2000 }),
  ];
  const dre = dreDe({ orders, payables, monthKey: "2026-06" });   // sem manualInputs

  it("o CMV está mesmo ausente neste cenário", () => {
    expect(dre.cmv).toBeNull();
    expect(dre.availability.cmv).toBe("unavailable");
  });

  it("receita bruta, deduções e receita líquida continuam REAIS e calculadas", () => {
    /* Este é o ponto todo do desenho de propagação estrita: null propaga para BAIXO,
     * na direção da fórmula, e nunca para cima. Uma dedução conhecida não deixa de o
     * ser por faltar um custo mais abaixo. */
    expect(dre.receitaBruta).toBe(100000);
    expect(dre.availability.receitaBruta).toBe("real");
    expect(dre.totalDeducoes).toBe(15000);
    expect(dre.availability.totalDeducoes).toBe("real");
    expect(dre.receitaLiquida).toBe(85000);
    expect(dre.availability.receitaLiquida).toBe("real");
  });

  it("as despesas operacionais continuam somadas — não dependem do CMV", () => {
    expect(dre.despesasOperacionais).toBe(2000);
    expect(dre.availability.despesasOperacionais).not.toBe("unavailable");
  });

  it("lucro bruto, EBITDA e resultado líquido ficam null — e só esses", () => {
    expect(dre.lucroBruto).toBeNull();
    expect(dre.ebitda).toBeNull();
    expect(dre.resultadoLiquido).toBeNull();
    for (const chave of ["lucroBruto", "ebitda", "resultadoLiquido"]) {
      expect(dre.availability[chave]).toBe("unavailable");
    }
  });

  it("o aviso diz exatamente o que ficou por calcular", () => {
    const w = (dre.warnings || []).find((x) => x.code === "cmv-indisponivel");
    expect(w).toBeDefined();
    expect(w.message).toMatch(/lucro bruto/i);
    expect(w.message).toMatch(/EBITDA/i);
  });
});

/* ==================================================================================== *
 * 3. Um mês não é afetado pelos dados de outro.
 * ==================================================================================== */
describe("INVARIANTE · meses são estanques", () => {
  const junho = {
    orders: [pedido(1, "2026-06-10", 50000)],
    payables: [titulo({ id: 1, categoriaNome: "Aluguel", vencimento: "2026-06-01", valor: 2000 })],
  };
  const agosto = {
    orders: [pedido(2, "2026-08-10", 900000)],
    payables: [titulo({ id: 2, categoriaNome: "Salários", vencimento: "2026-08-05", valor: 400000 })],
  };

  const junhoSozinho = dreDe({ ...junho, monthKey: "2026-06", manualInputs: { cmv: 10000 } });
  const junhoComAgosto = dreDe({
    orders: [...junho.orders, ...agosto.orders],
    payables: [...junho.payables, ...agosto.payables],
    monthKey: "2026-06",
    manualInputs: { cmv: 10000 },
  });

  it("acrescentar dados de agosto não muda um único número de junho", () => {
    for (const chave of ["receitaBruta", "totalDeducoes", "receitaLiquida", "cmv",
      "lucroBruto", "despesasOperacionais", "ebitda", "resultadoLiquido"]) {
      expect(junhoComAgosto[chave], `${chave} mudou`).toBe(junhoSozinho[chave]);
    }
  });

  it("nem uma única disponibilidade de junho muda", () => {
    expect(junhoComAgosto.availability).toEqual(junhoSozinho.availability);
  });

  it("os 400.000 de salários de agosto não aparecem em lado nenhum de junho", () => {
    expect(junhoComAgosto.despesasOperacionais).toBe(2000);
    expect(JSON.stringify(junhoComAgosto)).not.toContain("400000");
  });

  it("um mês SEM títulos dá zeros reais, não os do mês vizinho", () => {
    const julho = dreDe({ ...junho, monthKey: "2026-07", manualInputs: { cmv: 0 } });
    expect(julho.despesasOperacionais).toBe(0);
    expect(julho.receitaBruta).toBe(0);
  });
});

/* ==================================================================================== *
 * 4. A forma de pagamento não classifica nada.
 *
 * Origem: no rebuild de despesas das 02:05 de 2026-08-23, /formas-pagamentos devolveu
 * HTTP 429 e o backend caiu no fallback, deixando `formaPagamento.nome` a null. A
 * pergunta que isso levantou — «isto muda a DRE?» — só tem uma resposta segura se o
 * motor NUNCA olhar para o campo. É isso que se fixa aqui.
 * ==================================================================================== */
describe("INVARIANTE · forma de pagamento não influencia classificação nem DRE", () => {
  const base = { id: 1, categoriaNome: "Aluguel", historico: "Renda do escritório", vencimento: "2026-06-01", valor: 2000, situacao: 2 };

  it("a mesma despesa classifica igual com Pix, com boleto e sem forma nenhuma", () => {
    const grupos = [
      { ...base, formaPagamento: { id: 8879614, nome: "Pix" } },
      { ...base, formaPagamento: { id: 3, nome: "Boleto" } },
      { ...base, formaPagamento: { id: 0, nome: null } },      // o caso do fallback
      { ...base, formaPagamento: null },
      { ...base },                                              // campo ausente
    ].map((p) => classifyPayable(p).group);

    expect(new Set(grupos).size, "a forma de pagamento alterou a classificação").toBe(1);
    expect(grupos[0]).toBe(DRE_GROUPS.FIXAS);
  });

  it("nenhuma linha da DRE muda quando o nome da forma de pagamento se perde", () => {
    const orders = [pedido(1, "2026-06-10", 100000)];
    const comNome = dreDe({
      orders, monthKey: "2026-06", manualInputs: { cmv: 10000 },
      payables: [{ ...base, formaPagamento: { id: 8879614, nome: "Pix" } }],
    });
    const semNome = dreDe({
      orders, monthKey: "2026-06", manualInputs: { cmv: 10000 },
      payables: [{ ...base, formaPagamento: { id: 8879614, nome: null } }],
    });
    expect(semNome.despesasOperacionais).toBe(comNome.despesasOperacionais);
    expect(semNome.ebitda).toBe(comNome.ebitda);
    expect(semNome.resultadoLiquido).toBe(comNome.resultadoLiquido);
    expect(semNome.availability).toEqual(comNome.availability);
    expect(semNome.warnings).toEqual(comNome.warnings);
  });

  it("um nome de forma de pagamento que parece uma categoria não classifica nada", () => {
    /* Guarda contra a tentação de «aproveitar» o campo: um título de aluguel pago por
     * um instrumento chamado "Impostos" continua a ser aluguel. */
    const enganoso = { ...base, formaPagamento: { id: 9, nome: "Impostos sobre vendas" } };
    expect(classifyPayable(enganoso).group).toBe(DRE_GROUPS.FIXAS);
  });

  it("o motor da DRE não menciona formaPagamento em lado nenhum", () => {
    /* Guarda estrutural: a garantia acima é comportamental e passaria se alguém lesse
     * o campo sem o usar. Esta fecha a porta. */
    const fonte = classifyPayable.toString();
    expect(fonte).not.toContain("formaPagamento");
  });
});
