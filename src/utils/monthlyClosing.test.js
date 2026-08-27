// Testes do motor de fecho mensal (C7).
// O contrato protegido: completude depende de DISPONIBILIDADE, nunca do ERP nem do
// valor; zero é dado; o mês em curso não gera atraso; e o mês a fechar é decidido pelo
// calendário, não pela presença de movimento.

import { describe, it, expect } from "vitest";
import {
  buildMonthlyClosing,
  CLOSING_REQUIREMENTS,
  CLOSING_STATUS,
  ITEM_STATUS,
} from "./monthlyClosing.js";
import { buildMonthlyDre } from "./dreEngine.js";
import { buildFinancialMetrics } from "./financialMetrics.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Relógio dos testes: 21 de agosto de 2026. Agosto está em curso; julho terminou.
const AGORA = new Date(2026, 7, 21, 12, 0, 0);

/* PREMISSA DE DOMÍNIO EXPLÍCITA (C7B.2).
 *
 * Estas fixtures descrevem um mês COM ATIVIDADE DE VENDA COMPROVADA: receita bruta
 * de 1000, disponibilidade "real". Antes da C7B.2 a receita estava ausente e o motor
 * exigia o CMV na mesma — os testes passavam por acidente, não por premissa.
 *
 * A partir da C7B.2 a Finer One só cobra o CMV quando consegue PROVAR que houve
 * vendas, pelo que qualquer teste que espere "falta informar o CMV" tem de declarar
 * essa venda. É isso que esta receita representa: não é ruído para fazer passar, é
 * a condição de domínio sem a qual a pergunta do teste nem sequer se coloca.
 *
 * Testes que exercitam receita parcial, indisponível ou zero usam `metricsComReceita`.
 */
const VENDA_COMPROVADA = { gross: 1000, grossAvailability: "real" };

/** Métricas de um mês COM vendas, com a availability de CMV que o teste quiser. */
const metricsCom = (availability, value, monthKey = "2026-06") => ({
  monthKey,
  cmv: { value, availability },
  revenue: { ...VENDA_COMPROVADA },
});

/** Métricas com CMV e receita bruta explícitas, para exercitar a aplicabilidade. */
const metricsComReceita = (cmvAvailability, cmvValue, revenueAvailability, revenueGross, monthKey = "2026-06") => ({
  monthKey,
  cmv: { value: cmvValue, availability: cmvAvailability },
  revenue: { gross: revenueGross, grossAvailability: revenueAvailability },
});

describe("buildMonthlyClosing — mês em curso e mês futuro", () => {
  it("T1 — mês atual fica in_progress", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-08"), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
  });

  it("T1b — mês em curso não gera pendência em atraso", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-08"), now: AGORA });
    expect(r.totalMissing).toBe(0);
    expect(r.missingItems).toEqual([]);
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
  });

  it("T9 — mês futuro não gera pendência", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-12"), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(r.totalMissing).toBe(0);
  });

  it("no primeiro dia do mês seguinte, o mês anterior passa a ser verificável", () => {
    const primeiroDeJulho = new Date(2026, 6, 1, 0, 30, 0);
    const junho = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-06"), now: primeiroDeJulho });
    expect(junho.status).toBe(CLOSING_STATUS.INCOMPLETE);
    const julho = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-07"), now: primeiroDeJulho });
    expect(julho.status).toBe(CLOSING_STATUS.IN_PROGRESS);
  });

  it("a viragem do ano não confunde a comparação de meses", () => {
    const janeiro = new Date(2027, 0, 10, 12, 0, 0);
    const dezembro = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2026-12"), now: janeiro });
    expect(dezembro.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });
});

describe("buildMonthlyClosing — mês terminado", () => {
  it("T2 — CMV unavailable => incomplete", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(r.totalMissing).toBe(1);
  });

  it("T3 — CMV manual => complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("T4 — CMV real (integração que já o fornece) => complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("real", 500), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("T5 — CMV zero manual => complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 0), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.completedItems[0].value).toBe(0);
  });

  it("T6 — CMV zero real => complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("real", 0), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.completedItems[0].value).toBe(0);
  });

  /* C7B.2 mudou a PREMISSA deste teste, não a sua fixture. Ausência total de dados
   * deixou de ser "incomplete": sem sinal de receita, o motor não consegue provar que
   * houve vendas e por isso não pode cobrar o CMV. O que se protege continua a ser o
   * mesmo — entradas degeneradas não rebentam — mas a resposta honesta passou a ser
   * "não é possível saber", e nunca uma pendência inventada. */
  it("T7 — ausência total de dados => indeterminate, sem rebentar e sem cobrar nada", () => {
    for (const metrics of [null, undefined, {}, { monthKey: "2026-06" }]) {
      const r = buildMonthlyClosing({ metrics, monthKey: "2026-06", now: AGORA });
      expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
      expect(r.totalMissing).toBe(0);
      expect(r.missingItems).toEqual([]);
      expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    }
  });

  it("T8 — CMV unavailable não vira zero", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(r.missingItems[0].value).toBeNull();
    expect(r.missingItems[0].value).not.toBe(0);
    expect(r.missingItems[0].source).toBeNull();
  });

  it("cobertura parcial não conta como completa", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("partial", 500), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });

  it("availability mixed conta como utilizável", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("mixed", 500), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });
});

describe("buildMonthlyClosing — agregação e listas", () => {
  it("T11 — totais coerentes quando falta o dado", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(r.totalRequired).toBe(1);
    expect(r.totalComplete).toBe(0);
    expect(r.totalMissing).toBe(1);
  });

  it("T11b — totais coerentes quando o dado existe", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    expect(r.totalRequired).toBe(1);
    expect(r.totalComplete).toBe(1);
    expect(r.totalMissing).toBe(0);
  });

  it("T10 — a agregação acompanha o catálogo, seja qual for o seu tamanho", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    // Não fixa "1": fixa a relação. Acrescentar uma rubrica ao catálogo não parte isto.
    expect(r.items).toHaveLength(CLOSING_REQUIREMENTS.length);
    /* A invariante correta é sobre OBRIGATÓRIOS, não sobre items.length: esta última só
     * seria verdadeira por acidente, enquanto todo o catálogo for obrigatório. */
    expect(r.totalComplete + r.totalMissing).toBe(r.totalRequired);
    expect(r.completedItems.length + r.missingItems.length).toBe(r.totalRequired);
  });

  it("T12 — mês completo não contém missingItems", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    expect(r.missingItems).toEqual([]);
    expect(r.completedItems.map((i) => i.key)).toEqual(["cmv"]);
  });

  it("T13 — mês incompleto contém o CMV em missingItems, com impacto declarado", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(r.missingItems.map((i) => i.key)).toEqual(["cmv"]);
    expect(r.missingItems[0].priority).toBe("critical");
    expect(r.missingItems[0].impact).toContain("ebitda");
  });

  it("T14 — source manual é preservada", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    expect(r.completedItems[0].source).toBe("manual");
  });

  it("T15 — source real é preservada", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("real", 500), now: AGORA });
    expect(r.completedItems[0].source).toBe("real");
  });

  it("monthKey explícito tem precedência sobre o das métricas", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("manual", 500, "2026-06"), monthKey: "2026-05", now: AGORA });
    expect(r.monthKey).toBe("2026-05");
  });

  it("sem mês nenhum devolve null em vez de inventar um", () => {
    expect(buildMonthlyClosing({ metrics: null, now: AGORA })).toBeNull();
    expect(buildMonthlyClosing({})).toBeNull();
  });
});

describe("fecho ancorado no calendário, não nos dados", () => {
  it("o motor não recebe nem consulta datasets: só disponibilidade e relógio", () => {
    const comDatasets = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null), now: AGORA,
      orders: [{ id: 1, date: "2026-06-10", total: 100 }],
      payables: [{ id: 1, valor: 50 }],
    });
    const semDatasets = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(comDatasets).toEqual(semDatasets);
  });

  /* C7B.2: um mês sem sinal nenhum continua a ENTRAR na janela e a ser avaliado — o
   * que muda é o veredito. Antes dizia-se "falta o CMV" sem saber se houve vendas;
   * agora diz-se "não é possível determinar". O mês não desaparece nem é declarado
   * fechado: fica indeterminado, que é a única afirmação verdadeira disponível. */
  it("um mês sem qualquer movimento continua a ser avaliado, mas o veredito é indeterminado", () => {
    const r = buildMonthlyClosing({ metrics: { monthKey: "2026-06" }, now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(r.status).not.toBe(CLOSING_STATUS.COMPLETE);
    expect(r.missingItems).toEqual([]);
  });

  it("um mês com vendas comprovadas e sem CMV continua a ser uma pendência real", () => {
    const r = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(r.missingItems.map((i) => i.key)).toEqual(["cmv"]);
  });
});

/* Guarda ESTRUTURAL: o ficheiro do motor não pode passar a ancorar o fecho em dados.
 * Um teste de comportamento sozinho não impediria alguém de importar o último mês com
 * movimento e voltar a introduzir o defeito que já foi corrigido nas Despesas. */
describe("o motor não se ancora em dados nem conhece integrações", () => {
  const fonte = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "monthlyClosing.js"), "utf8");

  it.each(["latestPayableMonth", "latestUsableFinancialMonth", "latestRevenueMonth"])(
    "não usa %s para decidir o mês a fechar",
    (simbolo) => { expect(fonte).not.toContain(simbolo); },
  );

  it.each(["bling", "moloni", "primavera", "phc", "sage", "jasmin", "toconline"])(
    "não menciona o ERP %s em código",
    (erp) => {
      const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(semComentarios.toLowerCase()).not.toContain(erp);
    },
  );
});

describe("independência de ERP", () => {
  it("nenhum requisito conhece a integração de origem", () => {
    for (const req of CLOSING_REQUIREMENTS) {
      expect(Object.keys(req)).not.toContain("integration");
      expect(Object.keys(req)).not.toContain("erp");
    }
  });

  it("a mesma rubrica fecha o mês venha ela de onde vier", () => {
    const automatico = buildMonthlyClosing({ metrics: metricsCom("real", 500), now: AGORA });
    const manual = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    expect(automatico.status).toBe(manual.status);
    expect(automatico.totalMissing).toBe(manual.totalMissing);
    // A origem é preservada para efeitos de transparência, sem alterar a completude.
    expect(automatico.completedItems[0].source).not.toBe(manual.completedItems[0].source);
  });
});

/* Este bloco confronta o `impact` declarado com a realidade das métricas. Sem ele, o
 * catálogo poderia continuar a prometer que o CMV bloqueia o EBITDA muito depois de
 * isso deixar de ser verdade — e a explicação dada ao utilizador ficaria errada sem
 * que nenhum teste se queixasse. */
describe("o impacto declarado corresponde ao que o motor financeiro faz", () => {
  const ordens = [{ id: 1, date: "2026-06-10", total: 1000, status: "recebida", client: { id: 1, name: "C" }, items: [] }];
  const COV = { firstCompleteMonth: "2026-01", partialMonths: [], closedThroughMonth: "2026-06" };
  const REF = new Date(2026, 6, 15);

  const metricasDe = (manualInputs) => buildFinancialMetrics(buildMonthlyDre({
    orders: ordens, payables: [], monthKey: "2026-06", manualInputs, coverage: COV, referenceDate: REF,
  }));

  it("sem CMV, os indicadores declarados ficam mesmo indisponíveis", () => {
    const metrics = metricasDe(undefined);
    const fecho = buildMonthlyClosing({ metrics, now: AGORA });
    expect(fecho.status).toBe(CLOSING_STATUS.INCOMPLETE);
    for (const indicador of fecho.missingItems[0].impact) {
      expect(metrics.profitability.availability[indicador]).toBe("unavailable");
    }
  });

  it("com CMV manual, esses mesmos indicadores passam a estar disponíveis", () => {
    const metrics = metricasDe({ cmv: 400 });
    const fecho = buildMonthlyClosing({ metrics, now: AGORA });
    expect(fecho.status).toBe(CLOSING_STATUS.COMPLETE);
    for (const indicador of CLOSING_REQUIREMENTS[0].impact) {
      expect(metrics.profitability.availability[indicador]).not.toBe("unavailable");
    }
  });

  it("com CMV manual igual a zero, o mês fecha e os indicadores existem", () => {
    const metrics = metricasDe({ cmv: 0 });
    const fecho = buildMonthlyClosing({ metrics, now: AGORA });
    expect(fecho.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(fecho.completedItems[0].value).toBe(0);
    expect(metrics.profitability.grossProfit).not.toBeNull();
  });
});

/* ====================================================================================
 * OBRIGATÓRIOS vs OPCIONAIS.
 * O catálogo real só tem rubricas obrigatórias hoje, pelo que estes testes compõem um
 * catálogo próprio via `requirements`. Sem isso, a distinção só seria descoberta no dia
 * em que a primeira rubrica opcional entrasse — e já com o defeito instalado.
 * ==================================================================================== */
describe("buildMonthlyClosing — requisitos opcionais não decidem o fecho", () => {
  const req = (key, required, availability, value = 100) => ({
    key, label: key.toUpperCase(), title: key, required,
    priority: required ? "critical" : "warning", impact: [],
    resolve: () => ({ availability, value }),
  });
  const fecho = (requirements, now = AGORA) =>
    buildMonthlyClosing({ metrics: { monthKey: "2026-06" }, requirements, now });

  it("T1 — obrigatório completo + opcional em falta => mês complete", () => {
    const r = fecho([req("cmv", true, "manual"), req("inventario", false, "unavailable", null)]);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("T2 — obrigatório em falta + opcional completo => incomplete", () => {
    const r = fecho([req("cmv", true, "unavailable", null), req("inventario", false, "real")]);
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(r.missingItems.map((i) => i.key)).toEqual(["cmv"]);
  });

  it("T3 — opcional em falta não aparece em missingItems", () => {
    const r = fecho([req("cmv", true, "manual"), req("inventario", false, "unavailable", null)]);
    expect(r.missingItems).toEqual([]);
    expect(r.items.map((i) => i.key)).toEqual(["cmv", "inventario"]);
    // O opcional continua visível em `items`, com o seu estado real.
    expect(r.items[1].status).toBe(ITEM_STATUS.MISSING);
  });

  it("T4 — opcional completo não aumenta totalComplete", () => {
    const r = fecho([req("cmv", true, "manual"), req("inventario", false, "real")]);
    expect(r.totalComplete).toBe(1);
    expect(r.completedItems.map((i) => i.key)).toEqual(["cmv"]);
  });

  it("T5 — totalRequired ignora os opcionais", () => {
    const r = fecho([
      req("cmv", true, "manual"),
      req("inventario", false, "unavailable", null),
      req("extraordinarios", false, "real"),
    ]);
    expect(r.totalRequired).toBe(1);
    expect(r.items).toHaveLength(3);
  });

  it("T6 — mês terminado: totalComplete + totalMissing === totalRequired", () => {
    const r = fecho([
      req("cmv", true, "unavailable", null),
      req("impostos", true, "real"),
      req("inventario", false, "unavailable", null),
    ]);
    expect(r.totalComplete + r.totalMissing).toBe(r.totalRequired);
    expect(r.totalRequired).toBe(2);
    expect(r.totalMissing).toBe(1);
  });

  it("T7 — mês em curso: obrigatório pending não conta como completo nem em falta", () => {
    const r = fecho([req("cmv", true, "unavailable", null)], AGORA);
    const emCurso = buildMonthlyClosing({
      metrics: { monthKey: "2026-08" }, requirements: [req("cmv", true, "unavailable", null)], now: AGORA,
    });
    expect(r.totalMissing).toBe(1);                       // junho terminou
    expect(emCurso.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(emCurso.totalRequired).toBe(1);
    expect(emCurso.totalComplete).toBe(0);
    expect(emCurso.totalMissing).toBe(0);
    // A soma NÃO fecha em meses em curso, e isso é correto: o item está pending.
    expect(emCurso.totalComplete + emCurso.totalMissing).not.toBe(emCurso.totalRequired);
    expect(emCurso.items[0].status).toBe(ITEM_STATUS.PENDING);
  });

  it("T8 — sem `requirements`, o comportamento do CMV é exatamente o anterior", () => {
    const semParam = buildMonthlyClosing({ metrics: metricsCom("manual", 500), now: AGORA });
    const comCatalogoReal = buildMonthlyClosing({
      metrics: metricsCom("manual", 500), now: AGORA, requirements: CLOSING_REQUIREMENTS,
    });
    expect(semParam).toEqual(comCatalogoReal);
    expect(semParam.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(semParam.totalRequired).toBe(1);

    const emFalta = buildMonthlyClosing({ metrics: metricsCom("unavailable", null), now: AGORA });
    expect(emFalta.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(emFalta.totalMissing).toBe(1);
  });

  it("todo o catálogo pode ser opcional: o mês fecha na mesma", () => {
    const r = fecho([req("inventario", false, "unavailable", null)]);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.totalRequired).toBe(0);
    expect(r.totalMissing).toBe(0);
  });

  it("catálogo vazio não rebenta", () => {
    const r = fecho([]);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.items).toEqual([]);
  });
});

/* ====================================================================================
 * C7B.1 — ELEGIBILIDADE HISTÓRICA E NOT_APPLICABLE.
 *
 * Duas perguntas distintas, que este bloco mantém deliberadamente separadas:
 *   1. O mês está dentro da cobertura histórica confiável? (`coverage.firstCompleteMonth`)
 *      Se não estiver, os obrigatórios ficam PENDING — não é dado em falta, é um
 *      período sobre o qual o motor não tem base para exigir nada.
 *   2. Dentro de um mês coberto, o CMV é exigível? Só o é quando a receita BRUTA
 *      prova que houve venda (availability "real" e valor ≠ 0). Zero real prova o
 *      contrário: not_applicable. Parcial ou indisponível não provam nada em nenhum
 *      sentido — a aplicabilidade fica INDETERMINADA (C7B.2) e o dado não é cobrado.
 * ==================================================================================== */
describe("buildMonthlyClosing — aplicabilidade do CMV pela receita (C7B.1/C7B.2)", () => {
  it("coberto + receita > 0 (real) + CMV unavailable => incomplete", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 1000), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.MISSING);
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });

  it("coberto + receita > 0 (real) + CMV manual => complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("manual", 400, "real", 1000), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.COMPLETE);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("CMV manual 0 num mês aplicável (receita > 0) continua complete", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("manual", 0, "real", 1000), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.completedItems[0].value).toBe(0);
  });

  it("receita real igual a zero => CMV not_applicable", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 0), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.NOT_APPLICABLE);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
  });

  it("receita real igual a zero não exige introduzir CMV 0: not_applicable mesmo sem nenhum CMV informado", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 0), now: AGORA });
    expect(r.missingItems).toEqual([]);
    expect(r.status).not.toBe(CLOSING_STATUS.INCOMPLETE);
  });

  it("not_applicable nunca aparece em missingItems nem em completedItems", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 0), now: AGORA });
    expect(r.missingItems.map((i) => i.key)).not.toContain("cmv");
    expect(r.completedItems.map((i) => i.key)).not.toContain("cmv");
  });

  it("totalRequired exclui os not_applicable: obrigatório e aplicável, não só obrigatório", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 0), now: AGORA });
    expect(r.totalRequired).toBe(0);
    expect(r.totalMissing).toBe(0);
    expect(r.totalComplete).toBe(0);
  });

  /* ── C7B.2: receita parcial ou indisponível => aplicabilidade INDETERMINADA ──────
   * A C7B.1 mantinha o CMV exigível nestes casos, o que produzia "Falta informar o
   * CMV" em meses onde a plataforma nem sequer sabia se tinha havido vendas. Os três
   * testes abaixo substituem essa decisão: não se cobra, não se declara inaplicável,
   * e o mês assume-se indeterminado. */
  it("receita indisponível + CMV unavailable => item PENDING, mês INDETERMINATE, nada cobrado", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "unavailable", null), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(r.missingItems).toEqual([]);
  });

  it("receita parcial + CMV unavailable => item PENDING, mês INDETERMINATE, nada cobrado", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "partial", 500), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(r.missingItems).toEqual([]);
  });

  it("receita parcial igual a zero: nem cobrada nem declarada inaplicável", () => {
    /* "partial" significa histórico incompleto no mês: um zero aqui pode ser lacuna
     * de cobertura, não ausência de venda. Não prova que houve vendas (logo não se
     * cobra) nem que não houve (logo não é not_applicable). */
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "partial", 0), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
    expect(r.items[0].status).not.toBe(ITEM_STATUS.MISSING);
  });

  it("receita ausente do shape não vira zero: indeterminado, nunca not_applicable", () => {
    const r = buildMonthlyClosing({ metrics: { monthKey: "2026-06", cmv: { value: null, availability: "unavailable" } }, now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
  });

  it("receita `real` sem valor numérico é contradição da camada de métricas: indeterminado, nunca zero", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", null), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
  });

  it("um dado presente fecha o requisito mesmo com receita indeterminada", () => {
    // A indeterminação impede COBRAR o dado; não invalida um dado que já existe.
    const r = buildMonthlyClosing({ metrics: metricsComReceita("manual", 400, "partial", 500), now: AGORA });
    expect(r.items[0].status).toBe(ITEM_STATUS.COMPLETE);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.totalRequired).toBe(1);
    expect(r.totalComplete).toBe(1);
  });

  /* ── MUTATION GUARDS (C7B.2) ───────────────────────────────────────────────── */
  it("mutation A — receita partial NUNCA pode gerar MISSING de CMV", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "partial", 500), now: AGORA });
    expect(r.items[0].status).not.toBe(ITEM_STATUS.MISSING);
    expect(r.totalMissing).toBe(0);
  });

  it("mutation B — receita unavailable NUNCA pode gerar MISSING de CMV", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "unavailable", null), now: AGORA });
    expect(r.items[0].status).not.toBe(ITEM_STATUS.MISSING);
    expect(r.totalMissing).toBe(0);
  });

  it("mutation C — receita partial NUNCA pode virar NOT_APPLICABLE", () => {
    for (const gross of [0, 500, null]) {
      const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "partial", gross), now: AGORA });
      expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
    }
  });

  it("mutation E — INDETERMINATE não pode virar COMPLETE só porque missingItems está vazio", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "partial", 500), now: AGORA });
    expect(r.missingItems).toEqual([]);            // vazio, como num mês completo
    expect(r.status).not.toBe(CLOSING_STATUS.COMPLETE);
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
  });

  it("mutation G — vendas reais + CMV unavailable NUNCA pode deixar de ser INCOMPLETE", () => {
    const r = buildMonthlyClosing({ metrics: metricsComReceita("unavailable", null, "real", 1000), now: AGORA });
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(r.status).not.toBe(CLOSING_STATUS.COMPLETE);
    expect(r.status).not.toBe(CLOSING_STATUS.INDETERMINATE);
  });
});

/* ====================================================================================
 * C7B.2 — PRECEDÊNCIA DOS ESTADOS DO MÊS.
 * ==================================================================================== */
describe("buildMonthlyClosing — precedência de estados (C7B.2)", () => {
  /** Requisito sintético com aplicabilidade fixa, para compor cenários mistos. */
  const req = (key, availability, applicability) => ({
    key, label: key.toUpperCase(), title: key, required: true, priority: "critical", impact: [],
    resolve: () => ({ availability, value: availability === "unavailable" ? null : 100 }),
    applicability: () => applicability,
  });
  const fecho = (requirements, monthKey = "2026-06") =>
    buildMonthlyClosing({ metrics: { monthKey }, requirements, now: AGORA });

  it("mês atual continua IN_PROGRESS, acima de tudo o resto", () => {
    const r = fecho([req("cmv", "unavailable", "applicable")], "2026-08");
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
  });

  it("mês futuro continua IN_PROGRESS", () => {
    const r = fecho([req("cmv", "unavailable", "applicable")], "2026-12");
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
  });

  it("mutation F — INCOMPLETE ganha a INDETERMINATE quando ambos existem", () => {
    const r = fecho([
      req("cmv", "unavailable", "applicable"),        // MISSING confirmado
      req("impostos", "unavailable", "indeterminate"), // PENDING por indeterminação
    ]);
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
    expect(r.status).not.toBe(CLOSING_STATUS.INDETERMINATE);
    expect(r.missingItems.map((i) => i.key)).toEqual(["cmv"]);
  });

  it("sem MISSING mas com indeterminação => INDETERMINATE", () => {
    const r = fecho([
      req("cmv", "manual", "applicable"),              // COMPLETE
      req("impostos", "unavailable", "indeterminate"), // PENDING
    ]);
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
  });

  it("todos os aplicáveis resolvidos e nada pendente => COMPLETE", () => {
    const r = fecho([
      req("cmv", "manual", "applicable"),
      req("impostos", "real", "applicable"),
      req("inventario", "unavailable", "not_applicable"),
    ]);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);
    expect(r.totalRequired).toBe(2);       // inventario não se aplica: não conta
    expect(r.totalComplete).toBe(2);
    expect(r.totalMissing).toBe(0);
  });

  it("um mês INDETERMINATE nunca parece completo pelos totais", () => {
    const r = fecho([req("cmv", "unavailable", "indeterminate")]);
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
    expect(r.totalRequired).toBe(0);   // não se sabe se é exigível: não se afirma que é
    expect(r.totalComplete).toBe(0);   // e sobretudo: nada é dado como satisfeito
    expect(r.totalMissing).toBe(0);
    expect(r.completedItems).toEqual([]);
  });

  it("totalComplete só cresce com dados realmente presentes, nunca com not_applicable", () => {
    const r = fecho([req("cmv", "unavailable", "not_applicable")]);
    expect(r.totalComplete).toBe(0);
    expect(r.totalRequired).toBe(0);
    expect(r.completedItems).toEqual([]);
    expect(r.status).toBe(CLOSING_STATUS.COMPLETE);   // nada por apurar, nada em falta
  });
});

describe("buildMonthlyClosing — cobertura histórica (C7B.1/C7B.2)", () => {
  it("mês terminado mas anterior a firstCompleteMonth: pending, nunca missing", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-03"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
    expect(r.missingItems).toEqual([]);
    expect(r.status).not.toBe(CLOSING_STATUS.INCOMPLETE);
  });

  /* C7B.2: não possuir histórico suficiente não autoriza a afirmar que o mês está
   * completo. Antes, um mês fora da cobertura caía em COMPLETE por `missingItems`
   * vazio — a mesma desonestidade que a C7B.2 corrigiu do lado da receita. */
  it("mês terminado fora da cobertura => INDETERMINATE, nunca COMPLETE", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-03"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.status).toBe(CLOSING_STATUS.INDETERMINATE);
  });

  it("mutation D — mês fora da cobertura NUNCA pode virar COMPLETE", () => {
    // Mesmo com o dado presente noutro requisito, e mesmo com missingItems vazio.
    for (const cmv of ["unavailable", "partial"]) {
      const r = buildMonthlyClosing({
        metrics: metricsCom(cmv, null, "2026-03"), now: AGORA,
        coverage: { firstCompleteMonth: "2026-04" },
      });
      expect(r.missingItems).toEqual([]);
      expect(r.status).not.toBe(CLOSING_STATUS.COMPLETE);
    }
  });

  it("sem cobertura não é a mesma coisa que receita zero: o item fica pending, nunca not_applicable", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-03"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
  });

  it("mês na fronteira (igual a firstCompleteMonth) já está coberto", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-04"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.items[0].status).toBe(ITEM_STATUS.MISSING);
    expect(r.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });

  it("mês dentro da cobertura continua a exigir CMV normalmente", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-06"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.items[0].status).toBe(ITEM_STATUS.MISSING);
  });

  it("sem `coverage`, nenhum mês tem limite — comportamento anterior a esta microfase", () => {
    const semCoverage = buildMonthlyClosing({ metrics: metricsCom("unavailable", null, "2020-01"), now: AGORA });
    expect(semCoverage.items[0].status).toBe(ITEM_STATUS.MISSING);
    expect(semCoverage.status).toBe(CLOSING_STATUS.INCOMPLETE);
  });

  it("mês em curso continua pending mesmo com coverage — o mês atual nunca é avaliado", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-08"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    expect(r.items[0].status).toBe(ITEM_STATUS.PENDING);
  });

  it("mês futuro continua pending mesmo com coverage", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-12"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.status).toBe(CLOSING_STATUS.IN_PROGRESS);
  });

  it("mutation guard: ausência de coverage nunca deve virar receita zero (not_applicable)", () => {
    const r = buildMonthlyClosing({
      metrics: metricsCom("unavailable", null, "2026-03"), now: AGORA,
      coverage: { firstCompleteMonth: "2026-04" },
    });
    expect(r.items[0].status).not.toBe(ITEM_STATUS.NOT_APPLICABLE);
  });
});