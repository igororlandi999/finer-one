// PROPAGAÇÃO DE AVAILABILITY — o contrato que atravessa a aplicação inteira.
//
// A cadeia é:
//   dreEngine -> financialMetrics -> monthlyClosing -> financialCompleteness -> views -> chat
//
// Cada elo transforma a forma dos dados. Nenhum pode transformar a VERDADE deles. As
// seis regras que este ficheiro protege, em cada elo:
//
//   real         nunca vira manual
//   manual       nunca vira real
//   partial      nunca vira real
//   unavailable  nunca vira zero
//   mixed        nunca vira real
//   null         nunca vira zero
//
// São regras sobre HONESTIDADE, não sobre aritmética. Um valor errado é um bug; um
// valor certo apresentado com a origem errada é uma mentira, e custa mais caro.

import { describe, it, expect } from "vitest";
import { buildMonthlyDre, combineAvailability } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import { buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import { buildFinancialCompleteness, FINANCIAL_COMPLETENESS } from "./financialCompleteness.js";
import { buildProfitabilityRows, availabilityLabel, buildAnchorNotice } from "./performanceView.js";
import { buildCompletionDataView } from "./completionDataView.js";
import { answerQuestion } from "./chatEngine.js";

const NOW = new Date(2026, 7, 24, 12, 0, 0);
const MES = "2026-07";

const ord = (id, date, total) => ({ id, date, total, status: "recebida", client: { id: 1, name: "C" }, items: [] });
const pg = (id, venc, valor, cat) => ({
  id, situacao: 2, dataEmissao: venc, vencimento: venc, valor, categoriaNome: cat, contato: { id: 1, nome: "F" },
});

const PEDIDOS = [ord(1, "2026-07-10", 100000)];
const PAGAR = [pg(10, "2026-07-05", 12000, "Salários"), pg(11, "2026-07-06", 3000, "Comissões")];

const COV_FECHADO = {
  firstCompleteMonth: "2026-04", partialMonths: [],
  completeThroughMonth: "2026-07", payables: { completeThroughMonth: "2026-07" },
};

/** Percorre a cadeia INTEIRA e devolve cada elo, para os testes a inspecionarem. */
function cadeia({ orders = PEDIDOS, payables = PAGAR, coverage = COV_FECHADO, manualInputs, mk = MES } = {}) {
  const dre = buildMonthlyDre({ orders, payables, monthKey: mk, manualInputs, coverage, referenceDate: NOW });
  const metrics = buildFinancialMetrics(dre);
  const closing = buildMonthlyClosing({ monthKey: mk, metrics, now: NOW, coverage });
  const financial = buildFinancialCompleteness({ metrics, closing });
  const rows = buildProfitabilityRows(metrics);
  return { dre, metrics, closing, financial, rows, comFinancial: { ...closing, financial } };
}

/* ══════════════════════════════════════════════════════════════════════════════════
 * AS SEIS REGRAS, elo a elo.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("REGRA — manual nunca vira real", () => {
  it("um CMV manual chega ao fim da cadeia ainda marcado como manual", () => {
    const c = cadeia({ manualInputs: { cmv: 50000 } });
    expect(c.dre.availability.cmv).toBe("manual");
    expect(c.metrics.cmv.availability).toBe("manual");
    expect(c.closing.completedItems[0].source).toBe("manual");
    expect(c.financial.lines.find((l) => l.key === "cmv").availability).toBe("manual");
    // E a etiqueta que o utilizador lê continua a dizê-lo.
    expect(availabilityLabel("manual")).toBe("Valor manual");
  });

  it("as linhas DERIVADAS de um manual ficam `mixed`, nunca `real`", () => {
    /* `mixed` é a legenda honesta: a linha combina automático com manual. Se colapsasse
     * em `real`, a marca do valor manual desaparecia exatamente onde mais importa —
     * no EBITDA e no resultado líquido. */
    const c = cadeia({ manualInputs: { cmv: 50000 } });
    expect(c.dre.availability.lucroBruto).toBe("mixed");
    expect(c.dre.availability.ebitda).toBe("mixed");
    expect(c.dre.availability.resultadoLiquido).toBe("mixed");
    expect(availabilityLabel("mixed")).toBe("Inclui valor manual");
  });

  it("o Chat também não promove um manual a apurado", () => {
    const sales = {
      resumo: { metrics: { receitas: 1, receitasDelta: 0 } },
      financeiro: {
        monthKey: MES,
        metrics: {
          monthKey: MES, revenue: { net: 100 }, deductions: {}, cmv: {}, operatingExpenses: {},
          profitability: { ebitda: 500, ebitdaMarginPct: 5, availability: { ebitda: "mixed" } },
        },
      },
    };
    expect(answerQuestion("qual foi o ebitda?", sales).content).toContain("introduzido manualmente");
  });
});

describe("REGRA — real nunca vira manual", () => {
  it("um mês sem input manual nenhum não ganha marca de manual em lado nenhum", () => {
    const c = cadeia();   // sem manualInputs
    for (const chave of ["receitaBruta", "totalDeducoes", "despesasOperacionais", "retiradasSocios"]) {
      expect(c.dre.availability[chave]).toBe("real");
    }
    expect(JSON.stringify(c.rows)).not.toContain("manual");
  });
});

describe("REGRA — partial nunca vira real", () => {
  it("uma fonte parcial contamina todas as linhas que dela dependem", () => {
    const c = cadeia({
      coverage: { ...COV_FECHADO, payables: { completeThroughMonth: "2026-06" } },
      manualInputs: { cmv: 50000 },
    });
    // A receita vem de outra fonte e mantém-se real...
    expect(c.dre.availability.receitaBruta).toBe("real");
    // ...mas tudo o que passa pelas contas a pagar fica parcial, até ao fim.
    for (const chave of ["totalDeducoes", "receitaLiquida", "lucroBruto",
      "despesasOperacionais", "ebitda", "resultadoLiquido"]) {
      expect(c.dre.availability[chave]).toBe("partial");
    }
    expect(c.financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.PARTIAL);
    expect(c.financial.anchorEligible).toBe(false);
  });

  it("combineAvailability nunca deixa `partial` sair como `real`", () => {
    expect(combineAvailability("real", "partial")).toBe("partial");
    expect(combineAvailability("manual", "partial")).toBe("partial");
    expect(combineAvailability("mixed", "partial")).toBe("partial");
    expect(combineAvailability("real", "real", "partial", "real")).toBe("partial");
  });

  it("uma linha parcial é declarada como tal na Performance", () => {
    const c = cadeia({
      coverage: { ...COV_FECHADO, payables: { completeThroughMonth: "2026-06" } },
      manualInputs: { cmv: 50000 },
    });
    const ebitda = c.rows.find((r) => r.key === "ebitda");
    expect(ebitda.availability).toBe("partial");
    expect(availabilityLabel("partial")).toBe("Dados parciais");
  });
});

describe("REGRA — unavailable nunca vira zero", () => {
  it("sem fonte de contas a pagar, as linhas são null e não 0", () => {
    const c = cadeia({ payables: null, manualInputs: { cmv: 50000 } });
    expect(c.dre.totalDeducoes).toBeNull();
    expect(c.dre.despesasOperacionais).toBeNull();
    expect(c.dre.ebitda).toBeNull();
    expect(c.dre.resultadoLiquido).toBeNull();
    // E nunca 0 — que afirmaria "não houve despesas", uma coisa que não se sabe.
    expect(c.dre.totalDeducoes).not.toBe(0);
    expect(c.dre.despesasOperacionais).not.toBe(0);
  });

  it("um rácio sem base é null, nunca 0%, nunca NaN, nunca Infinity", () => {
    const c = cadeia({ payables: null, manualInputs: { cmv: 50000 } });
    expect(c.metrics.profitability.ebitdaMarginPct).toBeNull();
    expect(c.metrics.operatingExpenses.pctOfNetRevenue).toBeNull();
    expect(Number.isNaN(c.metrics.profitability.ebitdaMarginPct)).toBe(false);
  });

  it("o Chat responde o LIMITE, nunca um número substituto", () => {
    const sales = {
      resumo: { metrics: { receitas: 1, receitasDelta: 0 } },
      financeiro: {
        monthKey: MES,
        metrics: { monthKey: MES, revenue: { net: null }, deductions: {}, cmv: { value: null },
          operatingExpenses: {}, profitability: { netResult: null, availability: {} } },
      },
    };
    const r = answerQuestion("qual foi o meu resultado?", sales).content;
    expect(r).toContain("não pode ser apurado");
    expect(r).not.toMatch(/\b0,00\b/);
  });
});

describe("REGRA — zero REAL continua a ser um dado, não uma ausência", () => {
  it("um mês sem títulos tem deduções 0 com availability real", () => {
    const c = cadeia({ payables: [], manualInputs: { cmv: 50000 } });
    expect(c.dre.totalDeducoes).toBe(0);
    expect(c.dre.availability.totalDeducoes).toBe("real");
    // E um zero real não impede o mês de ser âncora.
    expect(c.financial.anchorEligible).toBe(true);
  });

  it("um CMV manual ZERO é um valor informado e completa o requisito", () => {
    const c = cadeia({ manualInputs: { cmv: 0 } });
    expect(c.dre.cmv).toBe(0);
    expect(c.dre.availability.cmv).toBe("manual");
    expect(c.closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(c.financial.anchorEligible).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * EDGE CASES — a lista completa.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("EDGE CASES da completude financeira", () => {
  it("1+2. receita zero real => CMV not_applicable, e não se pede nada", () => {
    const c = cadeia({ orders: [] });
    expect(c.dre.receitaBruta).toBe(0);
    expect(c.dre.availability.receitaBruta).toBe("real");
    expect(c.closing.items[0].status).toBe("not_applicable");
    expect(c.financial.lines.find((l) => l.key === "cmv").notApplicable).toBe(true);
    expect(c.financial.blockers.map((b) => b.key)).not.toContain("cmv");
  });

  it("3+4+5. despesas, retiradas e deduções a zero REAL não bloqueiam", () => {
    const c = cadeia({ payables: [], manualInputs: { cmv: 1 } });
    expect(c.dre.despesasOperacionais).toBe(0);
    expect(c.dre.retiradasSocios).toBe(0);
    expect(c.dre.totalDeducoes).toBe(0);
    expect(c.financial.sourceCompleteness).toBe(FINANCIAL_COMPLETENESS.COMPLETE);
  });

  it("6. partial COM valor calculado continua a ser partial", () => {
    /* O caso mais traiçoeiro: há um número, e é um número correto — mas é um MÍNIMO
     * conhecido, não o total do mês. Ter valor não é estar completo. */
    const c = cadeia({
      coverage: { ...COV_FECHADO, payables: { completeThroughMonth: "2026-06" } },
      manualInputs: { cmv: 50000 },
    });
    expect(c.dre.despesasOperacionais).toBe(12000);          // há valor
    expect(c.dre.availability.despesasOperacionais).toBe("partial");   // e é parcial
  });

  it("7. unavailable com value null nunca aparece como completo", () => {
    const c = cadeia({ payables: null });
    expect(c.financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.UNAVAILABLE);
    expect(c.financial.anchorEligible).toBe(false);
  });

  it("10. mês sem atividade nenhuma fecha, mas nunca é âncora", () => {
    const c = cadeia({ orders: [], payables: [] });
    expect(c.closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(c.closing.totalComplete).toBe(0);
    expect(c.financial.anchorBlockers).toContain("sem_atividade");
  });

  it("11. mês FUTURO fica IN_PROGRESS e nunca é âncora", () => {
    const c = cadeia({ mk: "2027-07" });
    expect(c.closing.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(c.financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.IN_PROGRESS);
    expect(c.financial.anchorEligible).toBe(false);
  });

  it("12. mês ANTERIOR à cobertura histórica não pende nem alerta", () => {
    const c = cadeia({ mk: "2026-02" });
    // Fora da cobertura: o requisito fica pendente, não em falta.
    expect(c.closing.missingItems).toEqual([]);
    expect(c.financial.anchorEligible).toBe(false);
  });

  it("13. mês com APENAS movimentos por classificar => despesas parciais", () => {
    const c = cadeia({
      payables: [pg(20, "2026-07-05", 900, "Categoria XPTO")],
      manualInputs: { cmv: 50000 },
    });
    expect(c.dre.availability.coberturaPayables).toBe("real");     // o período fechou
    expect(c.dre.availability.despesasOperacionais).toBe("partial"); // mas falta natureza
    expect(c.financial.anchorEligible).toBe(false);
    const opex = c.financial.lines.find((l) => l.key === "operatingExpenses");
    expect(opex.causes).toEqual(["classificacao"]);
  });

  it("14. CMV manual + despesas partial => requisitos completos, análise não", () => {
    const c = cadeia({
      coverage: { ...COV_FECHADO, payables: { completeThroughMonth: "2026-06" } },
      manualInputs: { cmv: 50000 },
    });
    expect(c.closing.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(c.financial.financialAnalysisStatus).toBe(FINANCIAL_COMPLETENESS.PARTIAL);
    expect(c.financial.anchorEligible).toBe(false);
  });

  it("15. sem âncora elegível, a UI declara-o em vez de promover um mês parcial", () => {
    const n = buildAnchorNotice({ anchorSource: "fallback", anchorFinancial: { blockers: [] } });
    expect(n.badge).toBe("Análise parcial");
    expect(buildAnchorNotice({ anchorSource: "none" }).badge).toBe("Sem mês completo");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * A availability sobrevive às camadas de APRESENTAÇÃO.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("as views não apagam a availability", () => {
  it("'Dados a completar' distingue valor manual de valor da integração", () => {
    const manual = cadeia({ manualInputs: { cmv: 50000 } });
    const vManual = buildCompletionDataView({ closings: [manual.comFinancial] });
    const item = vManual.months[0].itens.find((i) => i.key === "cmv");
    expect(item.origemManual).toBe(true);
    expect(item.badge).toBe("Valor manual");
  });

  it("a ressalva de fontes parciais chega ao ecrã em vez de ser engolida", () => {
    const parcial = cadeia({
      coverage: { ...COV_FECHADO, payables: { completeThroughMonth: "2026-06" } },
      manualInputs: { cmv: 50000 },
    });
    const v = buildCompletionDataView({ closings: [parcial.comFinancial] });
    expect(v.months[0].analise.badge).toBe("Análise parcial");
    expect(v.months[0].analise.status).toBe("partial");
  });

  it("nenhuma etiqueta visível chama 'real' a coisa nenhuma", () => {
    /* `real` é vocabulário do MOTOR. No produto, "dados reais" significa outra coisa
     * (fonte ligada vs. demonstração) e as duas não podem colidir no mesmo ecrã. Por
     * isso AVAILABILITY_LABELS só nomeia os estados NÃO-reais. */
    expect(availabilityLabel("real")).toBeNull();
  });
});
