// Testes da janela de fecho e dos alertas de fecho mensal (C7B).
// Protege três coisas: a janela é de calendário e tem exatamente 3 meses; o mês em
// curso nunca alerta; e um dado presente — incluindo zero — nunca gera pendência.

import { describe, it, expect } from "vitest";
import { closedMonthKeys, buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import { buildClosingAlerts, closingAlertId, CLOSING_ALERT_CATEGORY } from "./closingAlerts.js";

const AGOSTO = new Date(2026, 7, 21, 12, 0, 0);   // 21/08/2026
const JANEIRO = new Date(2027, 0, 5, 9, 0, 0);    // 05/01/2027

/* PREMISSA DE DOMÍNIO EXPLÍCITA (C7B.2).
 *
 * Todo este ficheiro testa alertas de CMV em falta. A partir da C7B.2, a Finer One
 * só pode cobrar o CMV num mês em que consiga PROVAR que houve vendas — logo, um mês
 * que se espera que alerte tem obrigatoriamente de declarar essa venda. A receita
 * bruta real de 1000 abaixo é essa premissa, não preenchimento para passar: sem ela
 * o alerta não deveria mesmo existir, e o teste estaria a proteger um falso positivo.
 *
 * Meses com receita parcial/indisponível são testados explicitamente no bloco C7B.2
 * no fim do ficheiro, onde o esperado é precisamente a AUSÊNCIA de alerta. */
const VENDA_COMPROVADA = { gross: 1000, grossAvailability: "real" };

const metrics = (monthKey, availability, value = 100) => ({
  monthKey,
  cmv: { value, availability },
  revenue: { ...VENDA_COMPROVADA },
});

/** Fecho de um mês a partir da availability do CMV, pelo caminho oficial. */
const fecho = (monthKey, availability, value = 100, now = AGOSTO) =>
  buildMonthlyClosing({ metrics: metrics(monthKey, availability, value), now });

/** Alertas para uma janela descrita como { mês: availability }. Um mês omitido do
 *  mapa é um mês COM vendas e SEM CMV — o caso que legitimamente alerta. */
const alertasPara = (mapa, now = AGOSTO) => {
  const closings = closedMonthKeys({ now, count: 3 })
    .map((mk) => buildMonthlyClosing({
      metrics: mapa[mk] === undefined
        ? metrics(mk, "unavailable", null)
        : metrics(mk, mapa[mk].a, mapa[mk].v),
      monthKey: mk,
      now,
    }));
  return buildClosingAlerts({ closings, now });
};

describe("closedMonthKeys — janela de calendário", () => {
  it("T1 — em agosto de 2026: julho, junho e maio", () => {
    expect(closedMonthKeys({ now: AGOSTO, count: 3 })).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("T2 — em janeiro de 2027: dezembro, novembro e outubro de 2026", () => {
    expect(closedMonthKeys({ now: JANEIRO, count: 3 })).toEqual(["2026-12", "2026-11", "2026-10"]);
  });

  it("T18 — o mês em curso nunca entra na janela", () => {
    expect(closedMonthKeys({ now: AGOSTO, count: 3 })).not.toContain("2026-08");
    expect(closedMonthKeys({ now: JANEIRO, count: 3 })).not.toContain("2027-01");
  });

  it("no primeiro dia do mês, o mês recém-terminado já está na janela", () => {
    const primeiroDeAgosto = new Date(2026, 7, 1, 0, 5, 0);
    expect(closedMonthKeys({ now: primeiroDeAgosto, count: 3 })[0]).toBe("2026-07");
  });

  it("no último dia do mês, o mês em curso continua fora", () => {
    const trintaEUmDeAgosto = new Date(2026, 7, 31, 23, 55, 0);
    expect(closedMonthKeys({ now: trintaEUmDeAgosto, count: 3 })).not.toContain("2026-08");
  });

  it("a janela tem exatamente o tamanho pedido e vem do mais recente para o mais antigo", () => {
    const janela = closedMonthKeys({ now: AGOSTO, count: 3 });
    expect(janela).toHaveLength(3);
    expect([...janela].sort().reverse()).toEqual(janela);
  });

  it("count inválido não inventa meses", () => {
    expect(closedMonthKeys({ now: AGOSTO, count: 0 })).toEqual([]);
    expect(closedMonthKeys({ now: AGOSTO, count: -1 })).toEqual([]);
    expect(closedMonthKeys({ now: AGOSTO, count: 1.5 })).toEqual([]);
  });
});

describe("buildClosingAlerts — quando existe alerta", () => {
  it("T3 — julho incompleto gera alerta", () => {
    const a = alertasPara({ "2026-07": { a: "unavailable", v: null }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a).toHaveLength(1);
    expect(a[0].monthKey).toBe("2026-07");
    expect(a[0].title).toContain("Fecho de julho de 2026 incompleto");
  });

  it("T4 — julho completo não gera alerta", () => {
    const a = alertasPara({ "2026-07": { a: "manual" }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a).toEqual([]);
  });

  it("T5 — julho completo e junho incompleto: só junho", () => {
    const a = alertasPara({ "2026-07": { a: "manual" }, "2026-06": { a: "unavailable", v: null }, "2026-05": { a: "real" } });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06"]);
  });

  it("T6 — três meses incompletos geram no máximo três alertas", () => {
    const a = alertasPara({});   // nenhum mês tem dados
    expect(a).toHaveLength(3);
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("T7 — um mês fora da janela nunca gera alerta, mesmo incompleto", () => {
    const abril = fecho("2026-04", "unavailable", null);
    expect(abril.status).toBe(CLOSING_STATUS.INCOMPLETE);   // o motor considera-o incompleto
    const a = alertasPara({});                              // mas a janela não o inclui
    expect(a.map((x) => x.monthKey)).not.toContain("2026-04");
    expect(a).toHaveLength(3);
  });

  it("T10 — cobertura parcial gera alerta", () => {
    const a = alertasPara({ "2026-07": { a: "partial", v: 500 }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07"]);
  });

  it("T18b — o mês em curso nunca alerta, mesmo sem dado nenhum", () => {
    const agosto = buildMonthlyClosing({ metrics: { monthKey: "2026-08" }, now: AGOSTO });
    const a = buildClosingAlerts({ closings: [agosto], now: AGOSTO });
    expect(agosto.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(a).toEqual([]);
  });
});

describe("buildClosingAlerts — zero e dado presente não geram alerta", () => {
  it("T8 — CMV manual igual a zero não gera alerta", () => {
    const a = alertasPara({ "2026-07": { a: "manual", v: 0 }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a).toEqual([]);
  });

  it("T9 — CMV real igual a zero não gera alerta", () => {
    const a = alertasPara({ "2026-07": { a: "real", v: 0 }, "2026-06": { a: "real" }, "2026-05": { a: "real" } });
    expect(a).toEqual([]);
  });

  it("zero num mês e ausência noutro: só o mês sem dado alerta", () => {
    const a = alertasPara({ "2026-07": { a: "manual", v: 0 }, "2026-06": { a: "unavailable", v: null }, "2026-05": { a: "manual" } });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06"]);
  });
});

describe("buildClosingAlerts — ordem, severidade e identidade", () => {
  it("T11 — o mês mais recente aparece primeiro, mesmo com entrada desordenada", () => {
    const closings = ["2026-05", "2026-07", "2026-06"].map((mk) => fecho(mk, "unavailable", null));
    const a = buildClosingAlerts({ closings, now: AGOSTO });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("T12 — ids estáveis e ancorados no mês", () => {
    const primeira = alertasPara({});
    const segunda = alertasPara({});
    expect(primeira.map((x) => x.id)).toEqual(["closing-2026-07", "closing-2026-06", "closing-2026-05"]);
    expect(segunda.map((x) => x.id)).toEqual(primeira.map((x) => x.id));
    expect(closingAlertId("2026-07")).toBe("closing-2026-07");
  });

  it("T13 — nenhum id contém relógio, e o timestamp fica a cargo da camada de saída", () => {
    const a = alertasPara({});
    for (const alerta of a) {
      expect(alerta.id).toMatch(/^closing-\d{4}-\d{2}$/);
      expect(alerta.id).not.toMatch(/\d{10,}/);      // sem epoch
      expect(alerta.timestamp).toBeNull();
    }
  });

  it("T16 — mês anterior com requisito crítico em falta => danger", () => {
    const a = alertasPara({});
    expect(a[0].monthKey).toBe("2026-07");
    expect(a[0].severity).toBe("danger");
  });

  it("T17 — meses mais antigos da janela => warning", () => {
    const a = alertasPara({});
    expect(a[1].severity).toBe("warning");
    expect(a[2].severity).toBe("warning");
  });

  it("a severidade vem do relógio, não da posição na lista", () => {
    // Só junho e maio incompletos: junho é o mais recente da lista, mas não é o mês
    // anterior a agosto, logo continua em atenção.
    const a = alertasPara({ "2026-07": { a: "manual" } });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06", "2026-05"]);
    expect(a.every((x) => x.severity === "warning")).toBe(true);
  });

  it("usa a categoria de fecho e não uma categoria financeira existente", () => {
    const a = alertasPara({});
    expect(a[0].category).toBe(CLOSING_ALERT_CATEGORY);
    expect(a[0].acao).toBe("Completar dados");
  });
});

describe("buildClosingAlerts — copy", () => {
  it("T14 — um único dado em falta produz copy específica", () => {
    const a = alertasPara({ "2026-07": { a: "unavailable", v: null }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a[0].description).toBe("Falta informar o CMV para completar os cálculos financeiros do mês.");
  });

  it("T15 — vários dados em falta produzem copy agregada, e um só alerta por mês", () => {
    const requisito = (key, label) => ({
      key, label, title: label, required: true, priority: "critical", impact: [],
      resolve: () => ({ availability: "unavailable", value: null }),
    });
    const closing = buildMonthlyClosing({
      metrics: { monthKey: "2026-07" }, now: AGOSTO,
      requirements: [requisito("cmv", "CMV"), requisito("impostos", "Impostos sobre o lucro")],
    });
    const a = buildClosingAlerts({ closings: [closing], now: AGOSTO });
    expect(a).toHaveLength(1);
    expect(a[0].description).toBe(
      "Existem 2 dados obrigatórios por preencher para completar o fecho financeiro do mês.");
  });

  it("a copy não expõe vocabulário técnico nem integrações", () => {
    const a = alertasPara({});
    const texto = a.map((x) => `${x.title} ${x.description} ${x.acao}`).join(" ").toLowerCase();
    for (const termo of ["unavailable", "availability", "bling", "erp", "api", "manual input", "json"]) {
      expect(texto).not.toContain(termo);
    }
  });

  it("metadata aditiva acompanha o alerta sem substituir os campos do sistema", () => {
    const a = alertasPara({ "2026-07": { a: "unavailable", v: null }, "2026-06": { a: "manual" }, "2026-05": { a: "manual" } });
    expect(a[0].missingKeys).toEqual(["cmv"]);
    for (const campo of ["id", "severity", "category", "title", "description", "timestamp", "acao"]) {
      expect(a[0]).toHaveProperty(campo);
    }
  });
});

/* ====================================================================================
 * C7B.1 — not_applicable e cobertura histórica nunca alertam.
 * ==================================================================================== */
describe("buildClosingAlerts — not_applicable e cobertura histórica (C7B.1)", () => {
  const metricsComReceita = (monthKey, cmvAvailability, cmvValue, revenueAvailability, revenueGross) => ({
    monthKey,
    cmv: { value: cmvValue, availability: cmvAvailability },
    revenue: { gross: revenueGross, grossAvailability: revenueAvailability },
  });

  it("not_applicable (receita real igual a zero) nunca gera alerta", () => {
    const semVendas = buildMonthlyClosing({
      metrics: metricsComReceita("2026-07", "unavailable", null, "real", 0), now: AGOSTO,
    });
    const comVendas = buildMonthlyClosing({
      metrics: metricsComReceita("2026-06", "unavailable", null, "real", 5000), now: AGOSTO,
    });
    const a = buildClosingAlerts({ closings: [semVendas, comVendas], now: AGOSTO });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-06"]);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-07");
  });

  it("mês anterior a firstCompleteMonth nunca gera alerta", () => {
    const foraDaCobertura = buildMonthlyClosing({
      metrics: { monthKey: "2026-05" }, now: AGOSTO,
      coverage: { firstCompleteMonth: "2026-06" },
    });
    const a = buildClosingAlerts({ closings: [foraDaCobertura], now: AGOSTO });
    expect(a).toEqual([]);
  });

  it("janela julho/junho/maio com cobertura a começar em junho: maio não pende, e a janela NÃO puxa abril para compensar", () => {
    const COV_JUNHO = { firstCompleteMonth: "2026-06" };
    const janela = closedMonthKeys({ now: AGOSTO, count: 3 });
    expect(janela).toEqual(["2026-07", "2026-06", "2026-05"]);   // continua com exatamente 3 meses

    /* Os três meses têm vendas comprovadas e nenhum CMV: sem a cobertura, os três
     * alertariam. É a cobertura — e só ela — que cala maio. */
    const closings = janela.map((mk) => buildMonthlyClosing({
      metrics: metrics(mk, "unavailable", null), now: AGOSTO, coverage: COV_JUNHO,
    }));
    const a = buildClosingAlerts({ closings, now: AGOSTO });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07", "2026-06"]);
    expect(a.map((x) => x.monthKey)).not.toContain("2026-05");
    expect(a.map((x) => x.monthKey)).not.toContain("2026-04");   // nunca sequer avaliado
  });

  it("mutation guard: not_applicable não pode entrar em missingItems por essa via", () => {
    const c = buildMonthlyClosing({
      metrics: metricsComReceita("2026-07", "unavailable", null, "real", 0), now: AGOSTO,
    });
    expect(c.missingItems).toEqual([]);
    const a = buildClosingAlerts({ closings: [c], now: AGOSTO });
    expect(a).toEqual([]);
  });
});

/* ====================================================================================
 * C7B.2 — a indeterminação nunca alerta.
 * `closingAlerts` não conhece receita, aplicabilidade nem cobertura: filtra INCOMPLETE
 * com missingItems reais. Estes testes provam que essa filtragem basta — e que
 * continua a bastar sem uma linha nova no ficheiro de alertas.
 * ==================================================================================== */
describe("buildClosingAlerts — aplicabilidade indeterminada (C7B.2)", () => {
  const comReceita = (monthKey, cmvAvail, revAvail, revGross) => buildMonthlyClosing({
    metrics: {
      monthKey,
      cmv: { value: cmvAvail === "unavailable" ? null : 100, availability: cmvAvail },
      revenue: { gross: revGross, grossAvailability: revAvail },
    },
    now: AGOSTO,
  });

  it("receita parcial + CMV em falta => mês INDETERMINATE e NENHUM alerta de CMV", () => {
    const c = comReceita("2026-07", "unavailable", "partial", 500);
    expect(c.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(buildClosingAlerts({ closings: [c], now: AGOSTO })).toEqual([]);
  });

  it("receita indisponível + CMV em falta => mês INDETERMINATE e NENHUM alerta de CMV", () => {
    const c = comReceita("2026-07", "unavailable", "unavailable", null);
    expect(c.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(buildClosingAlerts({ closings: [c], now: AGOSTO })).toEqual([]);
  });

  it("no mesmo lote, só o mês com vendas comprovadas alerta", () => {
    const closings = [
      comReceita("2026-07", "unavailable", "real", 5000),   // vendas provadas -> alerta
      comReceita("2026-06", "unavailable", "partial", 500), // indeterminado   -> calado
      comReceita("2026-05", "unavailable", "real", 0),      // sem vendas      -> calado
    ];
    const a = buildClosingAlerts({ closings, now: AGOSTO });
    expect(a.map((x) => x.monthKey)).toEqual(["2026-07"]);
  });

  it("um mês INDETERMINATE não é silenciado por ser tratado como completo — simplesmente não gera pendência", () => {
    const c = comReceita("2026-07", "unavailable", "partial", 500);
    expect(c.status).not.toBe(CLOSING_STATUS.COMPLETE);
    expect(c.missingItems).toEqual([]);
    expect(buildClosingAlerts({ closings: [c], now: AGOSTO })).toEqual([]);
  });
});

describe("buildClosingAlerts — entradas degeneradas", () => {
  it("sem closings devolve lista vazia", () => {
    expect(buildClosingAlerts({})).toEqual([]);
    expect(buildClosingAlerts({ closings: null, now: AGOSTO })).toEqual([]);
    expect(buildClosingAlerts({ closings: [null, undefined], now: AGOSTO })).toEqual([]);
  });

  it("um fecho incompleto sem missingItems não produz alerta vazio", () => {
    const a = buildClosingAlerts({
      closings: [{ monthKey: "2026-07", status: CLOSING_STATUS.INCOMPLETE, missingItems: [] }],
      now: AGOSTO,
    });
    expect(a).toEqual([]);
  });
});
/* ══════════════════════════════════════════════════════════════════════════════════
 * ANÁLISE PARCIAL — o segundo tipo de alerta de fecho.
 *
 * O caso que o motivou: o utilizador lança o CMV de julho, a pendência desaparece e o
 * mês passava a não ter sinal nenhum — apesar de as despesas operacionais e as
 * deduções continuarem parciais e o EBITDA ser `partial`. O alerta some, o problema
 * fica. Este bloco garante que o mês continua a ser descrito, sem ser cobrado.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("alertas de fecho — análise parcial", () => {
  const comAnalise = (mk, financial) => ({ ...fecho(mk, "manual", 500), financial });

  const PARCIAL_POR_COBERTURA = {
    financialAnalysisStatus: "partial",
    blockers: [{ key: "operatingExpenses", label: "Despesas operacionais", causes: ["cobertura"] }],
  };

  it("mês com requisitos completos e fontes parciais continua a ter sinal", () => {
    const [a] = buildClosingAlerts({ closings: [comAnalise("2026-07", PARCIAL_POR_COBERTURA)], now: AGOSTO });
    expect(a.id).toBe("closing-analise-2026-07");
    expect(a.title).toContain("ainda parcial");
    expect(a.description).toContain("Despesas operacionais");
    expect(a.description).toContain("o período ainda não fechou na origem");
  });

  it("é INFORMATIVO e não oferece ação — não se resolve no Finer One", () => {
    const [a] = buildClosingAlerts({ closings: [comAnalise("2026-07", PARCIAL_POR_COBERTURA)], now: AGOSTO });
    expect(a.severity).toBe("info");
    expect(a.acao).toBe("—");
    expect(a.category).toBe(CLOSING_ALERT_CATEGORY);
  });

  it("distingue cobertura de classificação, e reporta as duas quando coexistem", () => {
    const [a] = buildClosingAlerts({
      closings: [comAnalise("2026-07", {
        financialAnalysisStatus: "partial",
        blockers: [{ key: "operatingExpenses", label: "Despesas operacionais", causes: ["cobertura", "classificacao"] }],
      })],
      now: AGOSTO,
    });
    expect(a.description).toContain("o período ainda não fechou na origem");
    expect(a.description).toContain("há títulos por classificar");
  });

  it("análise completa não gera alerta nenhum", () => {
    const closings = [comAnalise("2026-07", { financialAnalysisStatus: "complete", blockers: [] })];
    expect(buildClosingAlerts({ closings, now: AGOSTO })).toEqual([]);
  });

  it("um mês com PENDÊNCIA não recebe também o alerta de análise — um alerta por mês", () => {
    const comPendencia = { ...fecho("2026-07", "unavailable", null), financial: PARCIAL_POR_COBERTURA };
    const lista = buildClosingAlerts({ closings: [comPendencia], now: AGOSTO });
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(closingAlertId("2026-07"));
  });

  it("mês INDETERMINATE nunca é anunciado como análise parcial", () => {
    /* INDETERMINATE existe precisamente para NÃO se afirmar nada sobre o mês. Dizer-lhe
     * "análise parcial" seria afirmar. Foi um falso positivo real desta implementação,
     * apanhado pelos testes de cobertura histórica do blingDataService. */
    const indeterminado = buildMonthlyClosing({
      metrics: { monthKey: "2026-07", cmv: { value: null, availability: "unavailable" },
        revenue: { gross: 500, grossAvailability: "partial" } },
      now: AGOSTO,
    });
    expect(indeterminado.status).toBe(CLOSING_STATUS.INDETERMINATE);
    const closings = [{ ...indeterminado, financial: { financialAnalysisStatus: "partial", blockers: [] } }];
    expect(buildClosingAlerts({ closings, now: AGOSTO })).toEqual([]);
  });

  it("fecho sem veredito de completude financeira não inventa alerta", () => {
    expect(buildClosingAlerts({ closings: [fecho("2026-07", "manual", 500)], now: AGOSTO })).toEqual([]);
  });
});
