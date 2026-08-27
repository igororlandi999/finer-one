import { describe, it, expect } from "vitest";
import {
  resolvePerformanceView, PERFORMANCE_MODES,
  buildProfitabilityBlock, buildProfitabilityRows, availabilityLabel,
  buildAnchorNotice,
  PERIODO_POR_VALIDAR,
} from "./performanceView.js";
import { buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const api = (over = {}) => resolvePerformanceView({
  source: "api", temFonteReceitas: true, temMovimentosReceitas: true,
  temMetrics: true, temFonteDespesas: true, ...over,
});
const mock = (over = {}) => resolvePerformanceView({ source: "mock", ...over });

describe("resolvePerformanceView — modo API nunca mostra conteúdo demonstrativo", () => {
  it("com dados reais: modo real, sem nada demonstrativo", () => {
    const v = api();
    expect(v.modo).toBe(PERFORMANCE_MODES.REAL);
    expect(v.real).toBe(true);
    expect(v.mostrarKpisDemo).toBe(false);      // Lucro Líquido, EBITDA, Solvabilidade...
    expect(v.mostrarDemonstracoes).toBe(false); // P&L, Balanço, Cashflow
    expect(v.permiteTextoDemonstrativo).toBe(false);
    expect(v.mostrarDemoTag).toBe(false);       // não há nada a marcar
    expect(v.mostrarNotaDemonstracoes).toBe(true);
  });

  it("fonte real sem movimentos: estado vazio real, nunca mock", () => {
    const v = api({ temMovimentosReceitas: false, temMetrics: false });
    expect(v.modo).toBe(PERFORMANCE_MODES.VAZIO);
    expect(v.vazioReal).toBe(true);
    expect(v.mostrarKpisDemo).toBe(false);
    expect(v.mostrarDemonstracoes).toBe(false);
  });

  it("métricas nulas apesar de haver pedidos: continua estado vazio, não demo", () => {
    const v = api({ temMetrics: false });
    expect(v.modo).toBe(PERFORMANCE_MODES.VAZIO);
    expect(v.mostrarKpisDemo).toBe(false);
  });

  it("sem fonte de receitas em modo API: indisponível, nunca os 5 KPIs mock", () => {
    // Este era o buraco: caía no ramo demonstrativo e mostrava lucro líquido,
    // EBITDA e solvabilidade inventados como se fossem da empresa.
    const v = api({ temFonteReceitas: false, temMovimentosReceitas: false, temMetrics: false });
    expect(v.modo).toBe(PERFORMANCE_MODES.INDISPONIVEL);
    expect(v.fonteIndisponivel).toBe(true);
    expect(v.mostrarKpisDemo).toBe(false);
    expect(v.mostrarDemonstracoes).toBe(false);
    expect(v.permiteTextoDemonstrativo).toBe(false);
    expect(v.mostrarDemoTag).toBe(false);
  });

  it("nenhum estado de API permite conteúdo demonstrativo", () => {
    const estados = [
      api(),
      api({ temMovimentosReceitas: false, temMetrics: false }),
      api({ temFonteReceitas: false, temMovimentosReceitas: false, temMetrics: false }),
      api({ temFonteDespesas: false }),
    ];
    for (const v of estados) {
      expect(v.mostrarKpisDemo).toBe(false);
      expect(v.mostrarDemonstracoes).toBe(false);
      expect(v.permiteTextoDemonstrativo).toBe(false);
      expect(v.mostrarDemoTag).toBe(false);
    }
  });
});

describe("resolvePerformanceView — modo mock preserva a demonstração, marcada", () => {
  it("mostra KPIs, demonstrações e texto demonstrativo, todos com selo", () => {
    const v = mock();
    expect(v.modo).toBe(PERFORMANCE_MODES.DEMO);
    expect(v.mostrarKpisDemo).toBe(true);
    expect(v.mostrarDemonstracoes).toBe(true);
    expect(v.permiteTextoDemonstrativo).toBe(true);
    expect(v.mostrarDemoTag).toBe(true);   // condição antes invertida: nunca aparecia
    expect(v.mostrarNotaDemonstracoes).toBe(false);
    expect(v.real).toBe(false);
    expect(v.vazioReal).toBe(false);
    expect(v.fonteIndisponivel).toBe(false);
  });

  it("fora do modo API é sempre demonstrativo, mesmo com dados presentes", () => {
    const v = mock({ temFonteReceitas: true, temMovimentosReceitas: true, temMetrics: true });
    expect(v.modo).toBe(PERFORMANCE_MODES.DEMO);
    expect(v.mostrarDemoTag).toBe(true);
  });

  /* C7F.3D — a semântica destes dois casos MUDOU de propósito.
   * Antes, qualquer coisa que não fosse "api" caía em DEMO, o que fazia uma fonte em
   * avaria (`unavailable`) e uma leitura ainda sem veredito (`loading`) produzirem os
   * cinco KPIs fictícios. Demonstração passou a exigir o estado "mock" explícito. */
  it("source ausente ou desconhecido NÃO é API nem demonstração", () => {
    for (const source of [undefined, null, "", "demo", "API", "qualquer-coisa"]) {
      const v = resolvePerformanceView({ source });
      expect(v.modoApi).toBe(false);
      expect(v.modo).toBe(PERFORMANCE_MODES.INDETERMINADO);
      expect(v.mostrarDemoTag).toBe(false);
    }
  });

  it("sem argumentos não rebenta e NÃO assume demonstrativo", () => {
    const v = resolvePerformanceView();
    expect(v.modo).toBe(PERFORMANCE_MODES.INDETERMINADO);
    expect(v.mostrarKpisDemo).toBe(false);
  });
});

/* ====================================================================================
 * C7F.3D — UNAVAILABLE e LOADING não são modo demonstração.
 *
 * O AppShell já impede estes dois estados de chegarem à página, e continua a ser a
 * primeira barreira. Estes testes garantem que a camada de BAIXO também está correta:
 * se o portão for removido ou contornado, o view-model não pode responder com números
 * fictícios a uma app que perdeu a ligação.
 * ==================================================================================== */
describe("resolvePerformanceView — avaria e ausência de veredito (C7F.3D)", () => {
  for (const estado of ["unavailable", "loading"]) {
    it(`"${estado}" não produz conteúdo demonstrativo nenhum`, () => {
      const v = resolvePerformanceView({ source: estado, temFonteReceitas: true, temMovimentosReceitas: true, temMetrics: true });
      expect(v.modo).toBe(PERFORMANCE_MODES.INDETERMINADO);
      expect(v.indeterminado).toBe(true);
      expect(v.mostrarKpisDemo).toBe(false);
      expect(v.mostrarDemonstracoes).toBe(false);
      expect(v.permiteTextoDemonstrativo).toBe(false);
      expect(v.mostrarDemoTag).toBe(false);
      // E também não se afirma nada de real:
      expect(v.real).toBe(false);
      expect(v.modoApi).toBe(false);
    });
  }

  it('"mock" continua a ser demonstração deliberada, marcada com selo', () => {
    const v = resolvePerformanceView({ source: "mock" });
    expect(v.modo).toBe(PERFORMANCE_MODES.DEMO);
    expect(v.mostrarKpisDemo).toBe(true);
    expect(v.mostrarDemoTag).toBe(true);
    expect(v.indeterminado).toBe(false);
  });

  it('"api" continua intocado nos três desfechos', () => {
    expect(resolvePerformanceView({ source: "api", temFonteReceitas: true, temMovimentosReceitas: true, temMetrics: true }).modo)
      .toBe(PERFORMANCE_MODES.REAL);
    expect(resolvePerformanceView({ source: "api", temFonteReceitas: true }).modo)
      .toBe(PERFORMANCE_MODES.VAZIO);
    expect(resolvePerformanceView({ source: "api" }).modo)
      .toBe(PERFORMANCE_MODES.INDISPONIVEL);
  });
});

describe("resolvePerformanceView — selo Demo e conteúdo andam juntos", () => {
  it("o selo aparece exatamente quando há conteúdo demonstrativo", () => {
    const casos = [
      api(), api({ temMetrics: false }), api({ temFonteReceitas: false }),
      mock(), mock({ temFonteReceitas: true }),
    ];
    for (const v of casos) {
      expect(v.mostrarDemoTag).toBe(v.mostrarKpisDemo);
      expect(v.mostrarDemoTag).toBe(v.mostrarDemonstracoes);
      expect(v.mostrarDemoTag).toBe(v.permiteTextoDemonstrativo);
    }
  });

  it("temFonteDespesas é repassado sem afetar o modo", () => {
    expect(api({ temFonteDespesas: false }).temFonteDespesas).toBe(false);
    expect(api({ temFonteDespesas: true }).temFonteDespesas).toBe(true);
    expect(api({ temFonteDespesas: false }).modo).toBe(PERFORMANCE_MODES.REAL);
  });
});

describe("moeda: valores reais seguem a empresa ativa", () => {
  it("formatMoney usa a moeda da empresa, formatEUR é fixo em EUR", async () => {
    const { formatMoney, formatMoneyCompact } = await import("../lib/currency.js");
    const { formatEUR } = await import("../lib/format.js");
    const { ACTIVE_COMPANY } = await import("../config/company.js");

    // A Overcel é BRL: nenhum valor real da Performance pode sair em euros.
    expect(ACTIVE_COMPANY.currency).toBe("BRL");
    expect(formatMoney(198010.68)).toContain("R$");
    expect(formatMoney(198010.68)).not.toContain("€");
    expect(formatMoneyCompact(198010.68)).toContain("R$");
    expect(formatEUR(198010.68)).toContain("€"); // fixture demonstrativa continua pt-PT
  });
});

/* ====================================================================================
 * P3 — BLOCO DE RENTABILIDADE (DRE).
 *
 * A página deixa de poder inventar rentabilidade: os valores vêm inteiros de
 * financialMetrics e o mapeamento não faz uma única conta.
 * ==================================================================================== */

// financialMetrics de junho, no formato real de buildFinancialMetrics.
const fmJunho = (over = {}) => ({
  monthKey: "2026-06",
  revenue: { gross: 206227.15, net: 175566.72, netAvailability: "real", ...(over.revenue || {}) },
  profitability: {
    grossProfit: 59527.02, grossMarginPct: 33.9,
    ebitda: 51120.34, ebitdaMarginPct: 29.1,
    netResult: 522.5, netMarginPct: 0.3,
    availability: {
      grossProfit: "real", grossMarginPct: "real",
      ebitda: "real", ebitdaMarginPct: "real",
      netResult: "real", netMarginPct: "real",
      ...(over.availability || {}),
    },
    ...(over.profitability || {}),
  },
  warnings: over.warnings || [],
});

// Estado REAL da Overcel hoje: sem CMV automático, a cascata a partir do lucro bruto cai.
const fmSemCmv = () => fmJunho({
  profitability: {
    grossProfit: null, grossMarginPct: null,
    ebitda: null, ebitdaMarginPct: null,
    netResult: null, netMarginPct: null,
  },
  availability: {
    grossProfit: "unavailable", grossMarginPct: "unavailable",
    ebitda: "unavailable", ebitdaMarginPct: "unavailable",
    netResult: "unavailable", netMarginPct: "unavailable",
  },
});

describe("buildProfitabilityBlock — fonte única e mês próprio", () => {
  it("1. availability real => valor aparece, sem legenda", () => {
    const b = buildProfitabilityBlock({ source: "api", financeiro: { monthKey: "2026-06", metrics: fmJunho() } });
    expect(b.disponivel).toBe(true);
    const ebitda = b.rows.find((r) => r.key === "ebitda");
    expect(ebitda.value).toBe(51120.34);
    expect(availabilityLabel(ebitda.availability)).toBeNull(); // "real" não tem legenda
  });

  it("2 e 6. CMV indisponível => lucro bruto/EBITDA/resultado a null, NUNCA zero", () => {
    const b = buildProfitabilityBlock({ source: "api", financeiro: { monthKey: "2026-06", metrics: fmSemCmv() } });
    for (const key of ["grossProfit", "ebitda", "netResult", "ebitdaMarginPct", "netMarginPct"]) {
      const linha = b.rows.find((r) => r.key === key);
      expect(linha.value).toBeNull();
      expect(linha.value).not.toBe(0);
      expect(availabilityLabel(linha.availability)).toBe("Fonte indisponível");
    }
    // A receita líquida continua real: a ausência é da cascata a partir do CMV.
    expect(b.rows.find((r) => r.key === "revenueNet").value).toBe(175566.72);
  });

  it("3. partial => valor preservado e estado sinalizado", () => {
    const b = buildProfitabilityBlock({
      source: "api",
      financeiro: { metrics: fmJunho({ availability: { ebitda: "partial" } }) },
    });
    const ebitda = b.rows.find((r) => r.key === "ebitda");
    expect(ebitda.value).toBe(51120.34);
    expect(availabilityLabel(ebitda.availability)).toBe("Dados parciais");
  });

  it("4 e 5. manual e mixed preservam a origem", () => {
    const b = buildProfitabilityBlock({
      source: "api",
      financeiro: { metrics: fmJunho({ availability: { grossProfit: "manual", netResult: "mixed" } }) },
    });
    expect(availabilityLabel(b.rows.find((r) => r.key === "grossProfit").availability)).toBe("Valor manual");
    expect(availabilityLabel(b.rows.find((r) => r.key === "netResult").availability)).toBe("Inclui valor manual");
  });

  it("7. o mês da DRE é próprio e não segue o mês operacional", () => {
    // Operacional está em agosto (último mês com receita); a DRE fecha em junho.
    const b = buildProfitabilityBlock({ source: "api", financeiro: { monthKey: "2026-06", metrics: fmJunho() } });
    expect(b.monthKey).toBe("2026-06");
    expect(b.monthKey).not.toBe("2026-08");
  });

  it("8. os valores batem EXATAMENTE com financialMetrics", () => {
    const fm = fmJunho();
    const rows = buildProfitabilityRows(fm);
    const val = (k) => rows.find((r) => r.key === k).value;
    expect(val("revenueNet")).toBe(fm.revenue.net);
    expect(val("grossProfit")).toBe(fm.profitability.grossProfit);
    expect(val("ebitda")).toBe(fm.profitability.ebitda);
    expect(val("ebitdaMarginPct")).toBe(fm.profitability.ebitdaMarginPct);
    expect(val("netResult")).toBe(fm.profitability.netResult);
    expect(val("netMarginPct")).toBe(fm.profitability.netMarginPct);
  });

  it("12. nenhuma conta nova: nenhum valor sai diferente da fonte", () => {
    // Se alguém introduzir uma subtração ou divisão no mapeamento, isto morre.
    const fm = fmJunho();
    const rows = buildProfitabilityRows(fm);
    const origem = [
      fm.revenue.net, fm.profitability.grossProfit, fm.profitability.ebitda,
      fm.profitability.ebitdaMarginPct, fm.profitability.netResult, fm.profitability.netMarginPct,
    ];
    expect(rows.map((r) => r.value)).toEqual(origem);
    // Em particular, nada que se pareça com receita − contas a pagar.
    expect(rows.some((r) => r.value === fm.revenue.gross)).toBe(false);
  });

  it("11. sem financialMetrics em modo API => bloco indisponível, nunca mock", () => {
    for (const financeiro of [null, {}, { monthKey: "2026-06", metrics: null }]) {
      const b = buildProfitabilityBlock({ source: "api", financeiro });
      expect(b.disponivel).toBe(false);
      expect(b.rows).toEqual([]);
      expect(b.monthKey).toBeNull();
    }
  });

  it("9 e 10. modo mock não tem bloco DRE; os KPIs demonstrativos ficam marcados", () => {
    const b = buildProfitabilityBlock({ source: "mock", financeiro: { metrics: fmJunho() } });
    expect(b.modoApi).toBe(false);
    expect(b.disponivel).toBe(false);   // a demonstração tem os seus próprios KPIs
    expect(b.rows).toEqual([]);
    // E em modo API os KPIs mock continuam fora (garantido por resolvePerformanceView).
    const v = resolvePerformanceView({ source: "api", temFonteReceitas: true, temMovimentosReceitas: true, temMetrics: true });
    expect(v.mostrarKpisDemo).toBe(false);
    expect(resolvePerformanceView({ source: "mock" }).mostrarDemoTag).toBe(true);
  });

  it("as seis linhas saem na ordem da cascata da DRE", () => {
    const b = buildProfitabilityBlock({ source: "api", financeiro: { metrics: fmJunho() } });
    expect(b.rows.map((r) => r.key)).toEqual([
      "revenueNet", "grossProfit", "ebitda", "ebitdaMarginPct", "netResult", "netMarginPct",
    ]);
    expect(b.rows.filter((r) => r.kind === "pct").map((r) => r.key))
      .toEqual(["ebitdaMarginPct", "netMarginPct"]);
  });

  it("availabilityLabel: 'real' e valores desconhecidos não inventam legenda", () => {
    expect(availabilityLabel("real")).toBeNull();
    expect(availabilityLabel(null)).toBeNull();
    expect(availabilityLabel("outro")).toBeNull();
  });
});

/* ====================================================================================
 * C7D — CAUSA ACIONÁVEL DE UM INDICADOR BLOQUEADO.
 *
 * "Fonte indisponível" passa a "CMV ainda não informado" QUANDO — e só quando — o
 * motor de fecho do MESMO mês sabe que esse dado falta e declara que ele bloqueia
 * aquele indicador. Tudo o resto mantém a mensagem genérica.
 * ==================================================================================== */
describe("buildProfitabilityBlock — causa do bloqueio vem do fecho (C7D)", () => {
  const AGOSTO = new Date(2026, 7, 21, 12, 0, 0);

  /* Fechos construídos pelo MOTOR REAL. Um fecho escrito à mão podia ter uma
   * combinação impossível (INCOMPLETE com missingItems vazio) e o teste passaria a
   * proteger uma realidade que não existe. */
  const metricsPara = (monthKey, cmvAvail, revAvail, revGross) => ({
    monthKey,
    cmv: { value: cmvAvail === "unavailable" ? null : 100, availability: cmvAvail },
    revenue: { gross: revGross, grossAvailability: revAvail },
  });
  const fechoDe = (monthKey, cmvAvail, revAvail, revGross, now = AGOSTO) =>
    buildMonthlyClosing({ metrics: metricsPara(monthKey, cmvAvail, revAvail, revGross), now });

  // Junho com vendas comprovadas e sem CMV => INCOMPLETE, CMV em missingItems.
  const junhoIncompleto = () => fechoDe("2026-06", "unavailable", "real", 200000);
  // Junho com receita parcial => INDETERMINATE, nada confirmadamente em falta.
  const junhoIndeterminado = () => fechoDe("2026-06", "unavailable", "partial", 200000);
  // Junho resolvido => COMPLETE.
  const junhoCompleto = () => fechoDe("2026-06", "manual", "real", 200000);

  const bloco = (closings, metrics = fmSemCmv()) => buildProfitabilityBlock({
    source: "api", financeiro: { monthKey: "2026-06", metrics }, closings,
  });
  const nota = (b, key) => b.rows.find((r) => r.key === key)?.nota;
  const detalhe = (b, key) => b.rows.find((r) => r.key === key)?.detalhe;

  it("T1 — lucro bruto bloqueado por CMV em falta explica a causa", () => {
    const b = bloco([junhoIncompleto()]);
    expect(nota(b, "grossProfit")).toBe("CMV ainda não informado");
    expect(detalhe(b, "grossProfit")).toBe("Informe o CMV do período para completar este cálculo.");
  });

  it("T2 — EBITDA e a sua margem recebem a mesma explicação", () => {
    const b = bloco([junhoIncompleto()]);
    expect(nota(b, "ebitda")).toBe("CMV ainda não informado");
    expect(nota(b, "ebitdaMarginPct")).toBe("CMV ainda não informado");
  });

  it("T3 — resultado líquido e margem líquida recebem a mesma explicação", () => {
    const b = bloco([junhoIncompleto()]);
    expect(nota(b, "netResult")).toBe("CMV ainda não informado");
    expect(nota(b, "netMarginPct")).toBe("CMV ainda não informado");
  });

  it("T9 / mutation D — os indicadores afetados vêm do `impact` do requisito, não de uma lista local", () => {
    const fecho = junhoIncompleto();
    const impacto = fecho.missingItems[0].impact;
    const b = bloco([fecho]);
    // Todas as linhas cujo `key` está no impact declarado recebem a mensagem...
    for (const r of b.rows.filter((x) => impacto.includes(x.key))) {
      expect(r.nota).toBe("CMV ainda não informado");
    }
    // ...e nenhuma linha fora do impact a recebe.
    for (const r of b.rows.filter((x) => !impacto.includes(x.key))) {
      expect(r.nota).not.toBe("CMV ainda não informado");
    }
  });

  it("T4 / mutation B — indicador fora do impacto do CMV mantém a mensagem genérica", () => {
    /* Receita líquida indisponível por falta de contas a pagar: o CMV não a bloqueia
     * e não está no seu `impact`. Atribuir-lhe o CMV seria um palpite. */
    const semReceita = fmSemCmv();
    semReceita.revenue = { gross: null, net: null, netAvailability: "unavailable" };
    const b = bloco([junhoIncompleto()], semReceita);
    expect(nota(b, "revenueNet")).toBe("Fonte indisponível");
    expect(nota(b, "revenueNet")).not.toBe("CMV ainda não informado");
  });

  it("T11 / mutation B — sem fecho nenhum, `unavailable` continua a ser apenas genérico", () => {
    for (const closings of [null, undefined, []]) {
      const b = bloco(closings);
      expect(nota(b, "grossProfit")).toBe("Fonte indisponível");
      expect(detalhe(b, "grossProfit")).toBeNull();
    }
  });

  it("T5 / mutation A — INDETERMINATE nunca nomeia o CMV", () => {
    const b = bloco([junhoIndeterminado()]);
    for (const r of b.rows) {
      expect(r.nota ?? "").not.toContain("CMV");
    }
    expect(nota(b, "grossProfit")).toBe(PERIODO_POR_VALIDAR);
    expect(nota(b, "netResult")).toBe(PERIODO_POR_VALIDAR);
  });

  it("T5b — INDETERMINATE não pede ação de preenchimento", () => {
    const b = bloco([junhoIndeterminado()]);
    expect(detalhe(b, "grossProfit")).not.toMatch(/informe|preench/i);
  });

  it("T6 — COMPLETE com indicador indisponível por outra causa mantém a mensagem genérica", () => {
    /* O mês fechou (CMV informado), mas nesta fixture a cascata continua sem valores
     * — outra causa qualquer. Não se inventa uma pendência que o fecho não tem. */
    const b = bloco([junhoCompleto()]);
    expect(nota(b, "grossProfit")).toBe("Fonte indisponível");
    expect(nota(b, "netResult")).toBe("Fonte indisponível");
  });

  it("T7 — mês em curso não produz pendência falsa", () => {
    const emCurso = fechoDe("2026-06", "unavailable", "real", 200000, new Date(2026, 5, 10));
    expect(emCurso.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    const b = bloco([emCurso]);
    expect(nota(b, "grossProfit")).toBe("Fonte indisponível");
    expect(nota(b, "grossProfit")).not.toContain("CMV");
  });

  it("T8 / mutation C — o fecho de outro mês não contamina o mês exibido", () => {
    // A janela traz julho e maio incompletos, mas a DRE mostra JUNHO, que não está.
    const b = bloco([
      fechoDe("2026-07", "unavailable", "real", 9000),
      fechoDe("2026-05", "unavailable", "real", 9000),
    ]);
    expect(nota(b, "grossProfit")).toBe("Fonte indisponível");
    expect(nota(b, "grossProfit")).not.toBe("CMV ainda não informado");
  });

  it("mutation C — escolhe o fecho por monthKey, nunca o primeiro da lista", () => {
    // Junho está em último; pegar em closings[0] apanharia julho.
    const b = bloco([fechoDe("2026-07", "manual", "real", 9000), junhoIncompleto()]);
    expect(nota(b, "grossProfit")).toBe("CMV ainda não informado");
  });

  it("T10 / mutation B — um indicador COM valor nunca recebe explicação de pendência", () => {
    const b = bloco([junhoIncompleto()], fmJunho());   // tudo disponível
    for (const r of b.rows) {
      expect(r.nota ?? "").not.toContain("CMV");
      expect(r.detalhe).toBeNull();
    }
  });

  it("availability NÃO é alterada: o fecho só muda a frase", () => {
    const b = bloco([junhoIncompleto()]);
    expect(b.rows.find((r) => r.key === "grossProfit").availability).toBe("unavailable");
    expect(b.rows.find((r) => r.key === "netResult").availability).toBe("unavailable");
    // E os valores continuam intocados — nenhum cálculo aqui.
    expect(b.rows.find((r) => r.key === "grossProfit").value).toBeNull();
  });

  it("vários requisitos em falta sobre o mesmo indicador produzem plural", () => {
    const requisito = (key, label) => ({
      key, label, title: label, required: true, priority: "critical",
      impact: ["grossProfit"],
      resolve: () => ({ availability: "unavailable", value: null }),
    });
    const dois = buildMonthlyClosing({
      metrics: metricsPara("2026-06", "unavailable", "real", 200000), now: AGOSTO,
      requirements: [requisito("cmv", "CMV"), requisito("inv", "Inventário")],
    });
    const b = bloco([dois]);
    expect(nota(b, "grossProfit")).toBe("2 dados ainda não informados");
    expect(detalhe(b, "grossProfit")).toBe("Informe CMV e Inventário do período para completar este cálculo.");
  });

  it("T12 — nenhum termo técnico chega ao utilizador, em nenhum estado", () => {
    const proibidos = [
      "availability", "unavailable", "missingitems", "incomplete", "indeterminate",
      "api", "erp", "bling", "moloni", "primavera", "phc", "sage", "jasmin", "toconline",
      "null", "undefined", "closing", "coverage", "impact",
    ];
    for (const fecho of [junhoIncompleto(), junhoIndeterminado(), junhoCompleto()]) {
      const b = bloco([fecho]);
      const texto = b.rows.map((r) => `${r.nota ?? ""} ${r.detalhe ?? ""}`).join(" ").toLowerCase();
      for (const termo of proibidos) {
        // "Fonte indisponível" é PT-PT e legítima; o termo técnico é "unavailable".
        expect(texto).not.toContain(termo);
      }
    }
  });
});

/* Guarda ESTRUTURAL: a causa tem de continuar a nascer do fecho, e a página não pode
 * voltar a decidir a legenda por conta própria nem recalcular o motor. */
describe("integração na Performance — sem recálculo e sem inferência local (C7D)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const pagina = semComentarios(
    readFileSync(join(raiz, "..", "pages", "PerformanceFinanceira.jsx"), "utf8"));

  it("T10 / mutation E — a página NÃO recalcula o motor de fecho nem a DRE", () => {
    for (const simbolo of ["buildMonthlyClosing", "buildMonthlyDre", "buildFinancialMetrics",
      "CLOSING_REQUIREMENTS", "closedMonthKeys"]) {
      expect(pagina).not.toContain(simbolo);
    }
  });

  it("mutation D — a página não tem lista própria de indicadores bloqueados pelo CMV", () => {
    expect(pagina).not.toContain("CMV ainda não informado");
    expect(pagina).not.toContain("grossProfit");
    expect(pagina).not.toContain("missingItems");
    expect(pagina).not.toContain("CLOSING_STATUS");
  });

  it("a página consome os fechos já apurados e delega a decisão ao view-model", () => {
    expect(pagina).toContain("closings: sales?.closings ?? null");
    expect(pagina).toContain("buildProfitabilityBlock");
    // A legenda passou a vir resolvida; a página já não a decide.
    expect(pagina).toContain("const legenda = r.nota");
    expect(pagina).not.toContain("availabilityLabel(r.availability)");
  });
});
/* ══════════════════════════════════════════════════════════════════════════════════
 * RESSALVA DA ÂNCORA — buildAnchorNotice.
 *
 * `financeiro.monthKey` sai de `mesElegivel || mesUsavel`. O segundo termo aceita o
 * último mês com RECEITA real, sem olhar às contas a pagar nem ao CMV — e chegava ao
 * ecrã com a mesma aparência do primeiro, sob o rótulo tranquilo "Mês de referência".
 * Medido: o recurso podia ser um mês com deduções, EBITDA e resultado `unavailable`.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("buildAnchorNotice — o recurso nunca se disfarça de fecho", () => {
  const fin = (over) => ({ monthKey: "2026-07", metrics: {}, ...over });

  it("âncora ELEGÍVEL não produz ressalva nenhuma", () => {
    expect(buildAnchorNotice(fin({ anchorSource: "eligible" }))).toBeNull();
  });

  it("RECURSO é declarado como análise parcial e diz que não é um fecho", () => {
    const n = buildAnchorNotice(fin({
      anchorSource: "fallback",
      anchorFinancial: {
        blockers: [
          { key: "operatingExpenses", label: "Despesas operacionais", causes: ["cobertura", "classificacao"] },
          { key: "cmv", label: "CMV", causes: ["por_informar"] },
        ],
      },
    }));
    expect(n.badge).toBe("Análise parcial");
    expect(n.nota).toContain("não representam um fecho");
    // As rubricas são nomeadas: "está parcial" sem dizer o quê obriga a adivinhar.
    expect(n.itens).toContain("Despesas operacionais: período por fechar na fonte, títulos por classificar");
    expect(n.itens).toContain("CMV: por preencher");
  });

  it("RECURSO sem veredito do mês âncora continua a ressalvar, sem inventar rubricas", () => {
    const n = buildAnchorNotice(fin({ anchorSource: "fallback", anchorFinancial: null }));
    expect(n.badge).toBe("Análise parcial");
    expect(n.itens).toEqual([]);
  });

  it("NENHUMA âncora diz exatamente isso — nunca um mês inventado", () => {
    const n = buildAnchorNotice(fin({ anchorSource: "none", monthKey: null }));
    expect(n.badge).toBe("Sem mês completo");
    expect(n.nota).toContain("Nenhum período tem dados suficientes");
  });

  it("serviço antigo sem `anchorSource` não produz aviso sem base", () => {
    expect(buildAnchorNotice(fin({}))).toBeNull();
    expect(buildAnchorNotice(null)).toBeNull();
    expect(buildAnchorNotice(undefined)).toBeNull();
  });

  it("buildProfitabilityBlock propaga a ressalva, e só em modo API com métricas", () => {
    const financeiro = { monthKey: "2026-07", anchorSource: "fallback", anchorFinancial: { blockers: [] },
      metrics: { monthKey: "2026-07", profitability: { availability: {} }, revenue: {}, deductions: {}, cmv: {}, operatingExpenses: {} } };
    expect(buildProfitabilityBlock({ source: "api", financeiro }).anchorNotice.badge).toBe("Análise parcial");
    // Sem métricas não há bloco de rentabilidade — nem ressalva sobre coisa nenhuma.
    expect(buildProfitabilityBlock({ source: "api", financeiro: { anchorSource: "fallback" } }).anchorNotice).toBeNull();
    expect(buildProfitabilityBlock({ source: "mock", financeiro }).anchorNotice).toBeNull();
  });
});
