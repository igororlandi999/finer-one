// Testes do bloco de fecho mensal do Resumo (C7C).
//
// O que se protege: o Resumo mostra o mês civil ANTERIOR (nunca o último mês com
// dados), lê o estado do fecho já apurado (nunca dos alertas), e diz a verdade em
// cada um dos quatro estados — em particular, não cobra nada num mês que o motor
// não conseguiu validar.

import { describe, it, expect } from "vitest";
import { resolveClosingSummary, CLOSING_TONE } from "./closingSummaryView.js";
import { buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AGOSTO = new Date(2026, 7, 21, 12, 0, 0);   // 21/08/2026 -> mês anterior: julho
const JANEIRO = new Date(2027, 0, 5, 9, 0, 0);    // 05/01/2027 -> mês anterior: dezembro/2026

/* Os fechos são construídos pelo MOTOR REAL, não escritos à mão. Um fecho falso
 * poderia ter uma combinação impossível (status COMPLETE com missingItems cheios) e
 * o teste passaria a proteger uma realidade que não existe. */
const metrics = (monthKey, cmvAvail, revAvail, revGross) => ({
  monthKey,
  cmv: { value: cmvAvail === "unavailable" ? null : 100, availability: cmvAvail },
  revenue: { gross: revGross, grossAvailability: revAvail },
});

const fechoDe = (monthKey, cmvAvail, revAvail, revGross, now = AGOSTO, coverage) =>
  buildMonthlyClosing({ metrics: metrics(monthKey, cmvAvail, revAvail, revGross), now, coverage });

/** Mês completo: vendas comprovadas e CMV informado. */
const completo = (mk = "2026-07") => fechoDe(mk, "manual", "real", 5000);
/** Mês incompleto: vendas comprovadas e CMV em falta. */
const incompleto = (mk = "2026-07") => fechoDe(mk, "unavailable", "real", 5000);
/** Mês indeterminado: receita parcial, nada que se possa exigir. */
const indeterminado = (mk = "2026-07") => fechoDe(mk, "unavailable", "partial", 500);

describe("resolveClosingSummary — escolha do mês", () => {
  it("T7 — em agosto mostra julho", () => {
    const r = resolveClosingSummary({ closings: [completo("2026-07")], now: AGOSTO });
    expect(r.monthKey).toBe("2026-07");
  });

  it("T7b — atravessa a viragem do ano: em janeiro/2027 mostra dezembro/2026", () => {
    const r = resolveClosingSummary({ closings: [completo("2026-12")], now: JANEIRO });
    expect(r.monthKey).toBe("2026-12");
    expect(r.estado).toContain("Dezembro de 2026");
  });

  it("mutation C — escolhe o mês CIVIL anterior, não o mês mais recente com dados", () => {
    /* A lista traz junho e maio (com dados) mas NÃO julho. O mês certo é julho, que
     * não está: a resposta honesta é não mostrar nada, e nunca cair para junho só
     * porque é o mais recente que existe. */
    const r = resolveClosingSummary({
      closings: [incompleto("2026-06"), incompleto("2026-05")], now: AGOSTO,
    });
    expect(r).toBeNull();
  });

  it("mutation C — não usa o primeiro elemento da lista: procura por monthKey", () => {
    // Julho está em ÚLTIMO. Pegar em closings[0] devolveria maio.
    const r = resolveClosingSummary({
      closings: [incompleto("2026-05"), incompleto("2026-06"), completo("2026-07")], now: AGOSTO,
    });
    expect(r.monthKey).toBe("2026-07");
    expect(r.tone).toBe(CLOSING_TONE.POSITIVO);
  });

  it("sem fechos, ou sem o mês alvo, não inventa secção", () => {
    for (const closings of [null, undefined, [], [null], [incompleto("2026-03")]]) {
      expect(resolveClosingSummary({ closings, now: AGOSTO })).toBeNull();
    }
  });
});

describe("resolveClosingSummary — COMPLETE", () => {
  it("T1 — produz copy de concluído", () => {
    const r = resolveClosingSummary({ closings: [completo()], now: AGOSTO });
    expect(r.estado).toBe("Julho de 2026 concluído");
    expect(r.detalhe).toBe("Os dados necessários para os cálculos financeiros do período estão completos.");
    expect(r.tone).toBe(CLOSING_TONE.POSITIVO);
  });

  it("T6 / mutation B — COMPLETE não oferece pendência nem ação de correção", () => {
    const r = resolveClosingSummary({ closings: [completo()], now: AGOSTO });
    expect(r.cta).toBeNull();
    expect(r.itens).toEqual([]);
    expect(r.detalhe).not.toMatch(/falta|complet[ae]r|pendênc/i);
  });

  it("não promete encerramento contabilístico que o produto não faz", () => {
    const r = resolveClosingSummary({ closings: [completo()], now: AGOSTO });
    const texto = `${r.estado} ${r.detalhe} ${r.badge}`.toLowerCase();
    expect(texto).not.toContain("contabilístic");
    expect(texto).not.toContain("encerrad");
    expect(texto).not.toContain("fechado");
  });

  /* ── REQUISITOS SATISFEITOS != ANÁLISE COMPLETA ───────────────────────────────────
   * O caso real de julho/2026: o utilizador lança o CMV, o catálogo de requisitos
   * esgota-se e o fecho fica COMPLETE — mas as deduções e as despesas operacionais do
   * mês continuam parciais e o EBITDA que o motor produz é `partial`. Anunciar
   * "Julho de 2026 concluído — os dados necessários estão completos" era uma
   * afirmação falsa, dita com o tom mais tranquilizador da secção. */
  it("análise parcial NÃO é anunciada como concluída", () => {
    const comAnalisePartial = {
      ...completo(),
      financial: {
        financialAnalysisStatus: "partial",
        blockers: [
          { key: "operatingExpenses", label: "Despesas operacionais", causes: ["cobertura", "classificacao"] },
          { key: "deductions", label: "Deduções", causes: ["cobertura"] },
        ],
      },
    };
    const r = resolveClosingSummary({ closings: [comAnalisePartial], now: AGOSTO });
    expect(r.badge).toBe("Análise parcial");
    expect(r.estado).toBe("Julho de 2026 com análise parcial");
    expect(r.tone).toBe(CLOSING_TONE.INFORMATIVO);
    // Reconhece o que o utilizador fez, sem prometer o que não está feito.
    expect(r.detalhe).toContain("Os dados pedidos foram preenchidos");
    expect(r.estado).not.toContain("concluído");
    // As causas chegam decompostas: tempo e classificação são problemas diferentes.
    expect(r.itens).toContain("Despesas operacionais: período ainda por fechar na fonte, títulos por classificar");
    expect(r.itens).toContain("Deduções: período ainda por fechar na fonte");
    // Nada disto se resolve no ecrã de preenchimento: não se oferece ação falsa.
    expect(r.cta).toBeNull();
  });

  it("análise COMPLETA mantém a copy de concluído", () => {
    const comAnaliseCompleta = { ...completo(), financial: { financialAnalysisStatus: "complete", blockers: [] } };
    const r = resolveClosingSummary({ closings: [comAnaliseCompleta], now: AGOSTO });
    expect(r.badge).toBe("Concluído");
    expect(r.tone).toBe(CLOSING_TONE.POSITIVO);
  });

  it("sem veredito de completude financeira, não se inventa parcialidade", () => {
    // Fecho sem o bloco `financial` (ex.: consumidor antigo): comporta-se como antes.
    const r = resolveClosingSummary({ closings: [completo()], now: AGOSTO });
    expect(r.badge).toBe("Concluído");
  });

  it("T8 — mês sem vendas (CMV não aplicável) é respeitado como concluído, sem aviso de CMV", () => {
    // Receita real ZERO: o motor devolve COMPLETE porque o CMV não se aplica.
    const semVendas = fechoDe("2026-07", "unavailable", "real", 0);
    expect(semVendas.status).toBe(CLOSING_STATUS.COMPLETE);

    const r = resolveClosingSummary({ closings: [semVendas], now: AGOSTO });
    expect(r.estado).toBe("Julho de 2026 concluído");
    expect(r.cta).toBeNull();
    expect(`${r.estado} ${r.detalhe} ${r.itens.join(" ")}`).not.toContain("CMV");
  });
});

describe("resolveClosingSummary — INCOMPLETE", () => {
  it("T2 / mutation F — um dado em falta usa o SINGULAR", () => {
    const r = resolveClosingSummary({ closings: [incompleto()], now: AGOSTO });
    expect(r.estado).toBe("Julho de 2026 tem dados por completar");
    expect(r.detalhe).toBe("Falta 1 dado obrigatório para completar os cálculos financeiros do período.");
    expect(r.detalhe).not.toContain("Faltam");
  });

  it("T3 / mutation F — dois dados em falta usam o PLURAL", () => {
    const requisito = (key, label) => ({
      key, label, title: label, required: true, priority: "critical", impact: [],
      resolve: () => ({ availability: "unavailable", value: null }),
    });
    const dois = buildMonthlyClosing({
      metrics: metrics("2026-07", "unavailable", "real", 5000), now: AGOSTO,
      requirements: [requisito("cmv", "CMV"), requisito("impostos", "Impostos sobre o lucro")],
    });
    const r = resolveClosingSummary({ closings: [dois], now: AGOSTO });
    expect(r.detalhe).toBe("Faltam 2 dados obrigatórios para completar os cálculos financeiros do período.");
    expect(r.itens).toEqual(["CMV por preencher", "Impostos sobre o lucro por preencher"]);
  });

  it("nomeia as rubricas em falta de forma curta", () => {
    const r = resolveClosingSummary({ closings: [incompleto()], now: AGOSTO });
    expect(r.itens).toEqual(["CMV por preencher"]);
  });

  it("oferece ação, com tom de atenção", () => {
    const r = resolveClosingSummary({ closings: [incompleto()], now: AGOSTO });
    expect(r.cta).toEqual({ label: "Ver pendências" });
    expect(r.tone).toBe(CLOSING_TONE.ATENCAO);
  });
});

describe("resolveClosingSummary — INDETERMINATE", () => {
  it("T4 — não afirma que falta o CMV nem nomeia rubrica nenhuma", () => {
    const r = resolveClosingSummary({ closings: [indeterminado()], now: AGOSTO });
    const texto = `${r.estado} ${r.detalhe} ${r.itens.join(" ")}`;
    expect(texto).not.toContain("CMV");
    expect(texto).not.toMatch(/falta/i);
    expect(r.itens).toEqual([]);
  });

  it("T5 / mutation A — não oferece CTA de completar, e não se confunde com INCOMPLETE", () => {
    const r = resolveClosingSummary({ closings: [indeterminado()], now: AGOSTO });
    expect(r.cta).toBeNull();
    expect(r.detalhe).not.toMatch(/complete os dados|preench/i);
    // Tom informativo, distinto do tom de atenção de um mês com pendência real.
    expect(r.tone).toBe(CLOSING_TONE.INFORMATIVO);
    expect(r.tone).not.toBe(CLOSING_TONE.ATENCAO);
  });

  it("diz o que sabe: que não foi possível validar", () => {
    const r = resolveClosingSummary({ closings: [indeterminado()], now: AGOSTO });
    expect(r.estado).toBe("Não foi possível validar todos os dados de julho de 2026");
    expect(r.detalhe).toBe("Ainda não existem informações suficientes para confirmar se o período está completo.");
  });

  it("um mês fora da cobertura histórica também é apresentado como por validar", () => {
    const foraDaCobertura = buildMonthlyClosing({
      metrics: metrics("2026-07", "unavailable", "unavailable", null), now: AGOSTO,
      coverage: { firstCompleteMonth: "2026-08" },
    });
    expect(foraDaCobertura.status).toBe(CLOSING_STATUS.INDETERMINATE);
    const r = resolveClosingSummary({ closings: [foraDaCobertura], now: AGOSTO });
    expect(r.tone).toBe(CLOSING_TONE.INFORMATIVO);
    expect(r.cta).toBeNull();
  });
});

describe("resolveClosingSummary — IN_PROGRESS (defensivo)", () => {
  it("não rebenta e não inventa pendência num mês ainda em curso", () => {
    // Relógio deslocado: o fecho foi construído como se julho ainda decorresse.
    const emCurso = fechoDe("2026-07", "unavailable", "real", 5000, new Date(2026, 6, 10));
    expect(emCurso.status).toBe(CLOSING_STATUS.IN_PROGRESS);

    const r = resolveClosingSummary({ closings: [emCurso], now: AGOSTO });
    expect(r.cta).toBeNull();
    expect(r.itens).toEqual([]);
    expect(r.tone).toBe(CLOSING_TONE.NEUTRO);
    expect(r.detalhe).not.toMatch(/falta/i);
  });
});

describe("resolveClosingSummary — o estado vem do fecho, nunca dos alertas", () => {
  it("T9 / mutation D — INDETERMINATE e COMPLETE não geram alerta, e mesmo assim são distinguidos", () => {
    /* Este é o teste que justifica a arquitetura. Nenhum destes dois meses produz
     * alerta: contar alertas para inferir o estado tornaria-os idênticos. Só ler o
     * fecho os distingue. */
    const semAlerta = [completo(), indeterminado()];
    const vistas = semAlerta.map((c) => resolveClosingSummary({ closings: [c], now: AGOSTO }));
    expect(vistas[0].tone).toBe(CLOSING_TONE.POSITIVO);
    expect(vistas[1].tone).toBe(CLOSING_TONE.INFORMATIVO);
    expect(vistas[0].estado).not.toBe(vistas[1].estado);
  });

  it("a função não recebe nem consulta alertas", () => {
    const comAlertas = resolveClosingSummary({
      closings: [completo()], now: AGOSTO,
      alertas: [{ id: "closing-2026-07", severity: "danger" }],
    });
    const semAlertas = resolveClosingSummary({ closings: [completo()], now: AGOSTO });
    expect(comAlertas).toEqual(semAlertas);
  });
});

describe("resolveClosingSummary — copy de produto", () => {
  it("T12 — nenhum termo técnico chega ao utilizador, em nenhum estado", () => {
    const estados = [completo(), incompleto(), indeterminado()];
    const proibidos = [
      "incomplete", "indeterminate", "in_progress", "complete", "not_applicable",
      "missingitems", "availability", "firstcompletemonth", "coverage", "closing",
      "api", "erp", "bling", "moloni", "primavera", "phc", "sage", "jasmin", "toconline",
      "unavailable", "partial", "gross", "cmv unavailable", "null", "undefined",
    ];
    for (const fecho of estados) {
      const r = resolveClosingSummary({ closings: [fecho], now: AGOSTO });
      const texto = `${r.badge} ${r.estado} ${r.detalhe} ${r.itens.join(" ")} ${r.cta?.label ?? ""}`.toLowerCase();
      for (const termo of proibidos) {
        expect(texto).not.toContain(termo);
      }
    }
  });

  it("os quatro estados produzem textos distintos entre si", () => {
    const emCurso = fechoDe("2026-07", "unavailable", "real", 5000, new Date(2026, 6, 10));
    const textos = [completo(), incompleto(), indeterminado(), emCurso]
      .map((c) => resolveClosingSummary({ closings: [c], now: AGOSTO }).estado);
    expect(new Set(textos).size).toBe(4);
  });
});

/* ====================================================================================
 * GUARDA ESTRUTURAL — a camada de apresentação não pode ganhar lógica financeira.
 * O projeto não tem ambiente DOM nem testing-library (ver AjustesManuais.estrutura),
 * pelo que a integração se verifica sobre o código-fonte. É grosseiro, mas apanha
 * exatamente as regressões que interessam.
 * ==================================================================================== */
describe("integração no Resumo — sem recálculo e sem regra financeira duplicada", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const resumo = semComentarios(readFileSync(join(raiz, "..", "pages", "Resumo.jsx"), "utf8"));
  const view = semComentarios(readFileSync(join(raiz, "closingSummaryView.js"), "utf8"));

  it("T10 / mutation E — o Resumo NÃO recalcula o motor de fecho", () => {
    expect(resumo).not.toContain("buildMonthlyClosing");
    expect(resumo).not.toContain("CLOSING_REQUIREMENTS");
    expect(resumo).not.toContain("buildMonthlyDre");
    expect(resumo).not.toContain("buildFinancialMetrics");
  });

  it("T10 — o view-model também não recalcula: só lê fechos já apurados", () => {
    expect(view).not.toContain("buildMonthlyClosing");
    expect(view).not.toContain("buildMonthlyDre");
    expect(view).not.toContain("buildFinancialMetrics");
  });

  it("T9 — o Resumo alimenta o card com os closings, nunca com a lista de alertas", () => {
    expect(resumo).toContain("resolveClosingSummary({ closings: sales?.closings })");
    expect(resumo).not.toMatch(/resolveClosingSummary\([^)]*alert/i);
  });

  it("o Resumo não conhece os estados internos do motor de fecho: a decisão fica no view-model", () => {
    /* Restrito ao vocabulário DO FECHO. `availability` não entra na lista porque o
     * Resumo já o usava antes desta microfase, no bloco de rentabilidade (DRE), e
     * proibi-lo aqui seria esta microfase a legislar sobre código que não tocou. */
    for (const termo of ["CLOSING_STATUS", "INDETERMINATE", "missingItems", "not_applicable"]) {
      expect(resumo).not.toContain(termo);
    }
  });

  it("T11 — o CTA de pendências navega para Alertas, pelo mecanismo já existente", () => {
    expect(resumo).toContain("onVerPendencias={() => navigateTo(SCREENS.ALERTAS)}");
    // Nunca para Ajustes manuais: nem toda a pendência futura será manual.
    expect(resumo).not.toContain("SCREENS.AJUSTES_MANUAIS");
  });

  it("o view-model não faz contas nem conhece navegação", () => {
    expect(view).not.toContain("SCREENS");
    expect(view).not.toContain("navigateTo");
    expect(view).not.toContain("formatMoney");
    // Nenhuma aritmética financeira: o único número que toca é o tamanho da lista.
    expect(view).not.toMatch(/[-+*/]\s*(receita|gross|cmv|valor)/i);
  });

  it("o dataset expõe os MESMOS fechos que alimentam os alertas", () => {
    const servico = semComentarios(
      readFileSync(join(raiz, "..", "services", "blingDataService.js"), "utf8"));
    // Uma só variável `closings`, passada aos alertas e devolvida no dataset.
    expect(servico).toContain("buildAlertas(orders, payables, financeiro, closings)");
    expect(servico).toMatch(/^\s*closings,\s*$/m);
    // Construída uma só vez.
    expect(servico.match(/const closings =/g) || []).toHaveLength(1);
  });
});
