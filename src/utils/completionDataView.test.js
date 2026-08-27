// Testes do ecrã "Dados a completar" (C7E).
//
// O contrato protegido: a pendência nasce do FECHO e nunca do documento de ajustes
// manuais; um valor manual só é chamado manual quando o motor o diz; e um período que
// não foi possível validar nunca pede preenchimento.

import { describe, it, expect } from "vitest";
import {
  buildCompletionDataView, COMPLETION_VIEW, COMPLETION_ITEM, COMPLETION_TONE,
} from "./completionDataView.js";
import { buildMonthlyClosing, CLOSING_STATUS } from "./monthlyClosing.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AGOSTO = new Date(2026, 7, 21, 12, 0, 0);   // julho, junho e maio já terminaram

/* Fechos construídos pelo MOTOR REAL. Um fecho escrito à mão podia ter uma combinação
 * impossível (INCOMPLETE sem missingItems) e o teste passaria a proteger uma
 * realidade que não existe. */
const metricsPara = (monthKey, cmvAvail, cmvValue, revAvail, revGross) => ({
  monthKey,
  cmv: { value: cmvValue, availability: cmvAvail },
  revenue: { gross: revGross, grossAvailability: revAvail },
});
const fechoDe = (monthKey, cmvAvail, cmvValue, revAvail, revGross, now = AGOSTO, coverage) =>
  buildMonthlyClosing({
    metrics: metricsPara(monthKey, cmvAvail, cmvValue, revAvail, revGross), now, coverage,
  });

/** Vendas comprovadas, CMV em falta => INCOMPLETE. */
const incompleto = (mk = "2026-07") => fechoDe(mk, "unavailable", null, "real", 90000);
/** Vendas comprovadas, CMV manual informado => COMPLETE, origem manual. */
const completoManual = (mk = "2026-06", valor = 116039.7) =>
  fechoDe(mk, "manual", valor, "real", 200000);
/** Vendas comprovadas, CMV vindo da integração => COMPLETE, origem real. */
const completoReal = (mk = "2026-06") => fechoDe(mk, "real", 80000, "real", 200000);
/** Receita parcial => INDETERMINATE, nada confirmadamente em falta. */
const indeterminado = (mk = "2026-05") => fechoDe(mk, "unavailable", null, "partial", 5000);
/** Receita real zero => CMV não aplicável, mês COMPLETE. */
const semVendas = (mk = "2026-05") => fechoDe(mk, "unavailable", null, "real", 0);

/** Envelope de ajustes manuais no formato real do serviço. */
const docManual = (monthKey, rubrica) => ({
  status: "documento",
  document: { months: { [monthKey]: { cmv: rubrica } } },
});

const vista = (closings, manualInputs = null, loading = false) =>
  buildCompletionDataView({ closings, manualInputs, loading });
const mesDe = (v, mk) => v.months.find((m) => m.monthKey === mk);
const itemDe = (v, mk, key = "cmv") => mesDe(v, mk).itens.find((i) => i.key === key);

describe("buildCompletionDataView — estados de ecrã", () => {
  it("em carregamento não mostra períodos", () => {
    const v = vista([incompleto()], null, true);
    expect(v.state).toBe(COMPLETION_VIEW.LOADING);
    expect(v.months).toEqual([]);
  });

  it("sem fechos não inventa períodos", () => {
    for (const closings of [null, undefined, [], [null], [{}]]) {
      expect(vista(closings).state).toBe(COMPLETION_VIEW.EMPTY);
    }
  });

  it("T9 — fechos sem documento manual continuam renderizáveis", () => {
    for (const manual of [null, undefined, { status: "fonte-indisponivel", document: null }]) {
      const v = vista([completoManual()], manual);
      expect(v.state).toBe(COMPLETION_VIEW.MONTHS);
      // O valor vem do FECHO, não do documento: sobrevive à falha do documento.
      expect(itemDe(v, "2026-06").value).toBe(116039.7);
      // O que se perde é só o enriquecimento.
      expect(itemDe(v, "2026-06").atualizadoEm).toBeNull();
      expect(itemDe(v, "2026-06").nota).toBeNull();
    }
  });
});

describe("buildCompletionDataView — estado do mês", () => {
  it("T1 — mês INCOMPLETE mostra 'Por completar'", () => {
    const m = mesDe(vista([incompleto()]), "2026-07");
    expect(m.badge).toBe("Por completar");
    expect(m.tone).toBe(COMPLETION_TONE.ATENCAO);
    expect(m.resumo).toBe("1 dado por preencher.");
    expect(m.porPreencher).toBe(1);
  });

  it("mês COMPLETE mostra 'Concluído' e não anuncia pendências", () => {
    const m = mesDe(vista([completoManual()]), "2026-06");
    expect(m.badge).toBe("Concluído");
    expect(m.tone).toBe(COMPLETION_TONE.POSITIVO);
    expect(m.porPreencher).toBe(0);
    /* A frase fala do que foi PEDIDO, e só disso. Era "Todos os dados necessários
     * estão disponíveis" — uma garantia sobre a DRE inteira que esta página não tem
     * como dar: num mês com as contas a pagar ainda por fechar, prometia completude
     * que o motor marcava como parcial. O estado das fontes viaja em `analise`. */
    expect(m.resumo).toBe("Todos os dados pedidos foram preenchidos.");
    // Sem veredito de completude financeira, não se inventa ressalva nenhuma.
    expect(m.analise).toBeNull();
  });

  it("mês com requisitos completos mas ANÁLISE parcial traz a ressalva", () => {
    const base = completoManual();
    const m = mesDe(vista([{ ...base, financial: { sourceCompleteness: "partial" } }]), "2026-06");
    // O que o utilizador fez continua reconhecido...
    expect(m.badge).toBe("Concluído");
    expect(m.porPreencher).toBe(0);
    expect(m.resumo).toBe("Todos os dados pedidos foram preenchidos.");
    // ...e o que ainda falta do lado das fontes deixa de ser silenciado.
    expect(m.analise.badge).toBe("Análise parcial");
    expect(m.analise.status).toBe("partial");
  });

  it("análise financeira completa não acrescenta ressalva nenhuma", () => {
    const base = completoManual();
    const m = mesDe(vista([{ ...base, financial: { sourceCompleteness: "complete" } }]), "2026-06");
    expect(m.analise).toBeNull();
  });

  it("mês INDETERMINATE mostra 'Por validar'", () => {
    const m = mesDe(vista([indeterminado()]), "2026-05");
    expect(m.badge).toBe("Por validar");
    expect(m.tone).toBe(COMPLETION_TONE.INFORMATIVO);
    expect(m.porPreencher).toBe(0);
  });

  it("mês em curso é tratado defensivamente, sem pendência falsa", () => {
    const emCurso = fechoDe("2026-07", "unavailable", null, "real", 90000, new Date(2026, 6, 10));
    expect(emCurso.status).toBe(CLOSING_STATUS.IN_PROGRESS);
    const m = mesDe(vista([emCurso]), "2026-07");
    expect(m.badge).toBe("Em curso");
    expect(m.porPreencher).toBe(0);
    expect(m.resumo).toBe("O período ainda não terminou.");
  });

  it("plural correto quando há mais do que uma pendência", () => {
    const requisito = (key, label) => ({
      key, label, title: label, required: true, priority: "critical", impact: [],
      resolve: () => ({ availability: "unavailable", value: null }),
    });
    const dois = buildMonthlyClosing({
      metrics: metricsPara("2026-07", "unavailable", null, "real", 90000), now: AGOSTO,
      requirements: [requisito("cmv", "CMV"), requisito("inv", "Inventário")],
    });
    const m = mesDe(vista([dois]), "2026-07");
    expect(m.resumo).toBe("2 dados por preencher.");
    expect(m.porPreencher).toBe(2);
  });

  it("T12 / mutation F — meses do mais recente para o mais antigo, seja qual for a ordem de entrada", () => {
    const v = vista([indeterminado("2026-05"), incompleto("2026-07"), completoManual("2026-06")]);
    expect(v.months.map((m) => m.monthKey)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });
});

describe("buildCompletionDataView — rubricas", () => {
  it("T2 — requisito em falta mostra 'Por preencher' e explica porquê", () => {
    const i = itemDe(vista([incompleto()]), "2026-07");
    expect(i.estado).toBe(COMPLETION_ITEM.POR_PREENCHER);
    expect(i.badge).toBe("Por preencher");
    expect(i.detalhe).toBe("Necessário para completar os cálculos financeiros do período.");
    expect(i.value).toBeNull();
    expect(i.discreto).toBe(false);
  });

  it("T3 / T11 — valor manual aparece com o valor, o rótulo, a data e a nota do documento", () => {
    const manual = docManual("2026-06", {
      value: 116039.7, updatedAt: "2026-08-19T10:00:00.000Z", note: "Fecho contabilístico de junho",
    });
    const i = itemDe(vista([completoManual()], manual), "2026-06");
    expect(i.estado).toBe(COMPLETION_ITEM.CONCLUIDO);
    expect(i.badge).toBe("Valor manual");
    expect(i.origemManual).toBe(true);
    expect(i.value).toBe(116039.7);
    expect(i.atualizadoEm).toBe("19/08/2026");
    expect(i.nota).toBe("Fecho contabilístico de junho");
  });

  it("T11 / mutation A — o documento de OUTRO mês não enriquece este", () => {
    // Documento tem maio; o fecho manual é de junho. A data não pode migrar.
    const manual = docManual("2026-05", { value: 999, updatedAt: "2026-08-19T10:00:00.000Z" });
    const i = itemDe(vista([completoManual()], manual), "2026-06");
    expect(i.value).toBe(116039.7);      // continua a vir do fecho
    expect(i.atualizadoEm).toBeNull();   // e não herda a data de maio
  });

  it("T4 / mutation B — valor vindo da integração NÃO é chamado manual", () => {
    const i = itemDe(vista([completoReal()]), "2026-06");
    expect(i.estado).toBe(COMPLETION_ITEM.CONCLUIDO);
    expect(i.badge).toBe("Concluído");
    expect(i.badge).not.toBe("Valor manual");
    expect(i.origemManual).toBe(false);
  });

  it("mutation B — um valor real não recebe data nem nota, mesmo que o documento as tenha", () => {
    /* Se o motor diz que a origem é a integração, uma nota manual do mesmo mês não lhe
     * pertence: mostrá-la seria atribuir ao utilizador um número que não é dele. */
    const manual = docManual("2026-06", {
      value: 1, updatedAt: "2026-08-19T10:00:00.000Z", note: "nota antiga",
    });
    const i = itemDe(vista([completoReal()], manual), "2026-06");
    expect(i.atualizadoEm).toBeNull();
    expect(i.nota).toBeNull();
  });

  it("T10 / mutation E — o valor manual ZERO sobrevive e não desaparece por truthiness", () => {
    const zero = completoManual("2026-06", 0);
    const manual = docManual("2026-06", { value: 0, updatedAt: "2026-08-19T10:00:00.000Z" });
    const i = itemDe(vista([zero], manual), "2026-06");
    expect(i.value).toBe(0);
    expect(i.value).not.toBeNull();
    expect(i.badge).toBe("Valor manual");
    expect(i.atualizadoEm).toBe("19/08/2026");
  });

  it("T5 / T6 / mutation C — num mês por validar não se pede preenchimento", () => {
    const i = itemDe(vista([indeterminado()]), "2026-05");
    expect(i.estado).toBe(COMPLETION_ITEM.POR_VALIDAR);
    expect(i.estado).not.toBe(COMPLETION_ITEM.POR_PREENCHER);
    expect(i.badge).toBeNull();
    expect(i.detalhe).toBe("Ainda não foi possível validar este dado.");
    expect(i.detalhe).not.toMatch(/preench|informe/i);
  });

  it("T7 / mutation D — 'Não aplicável' não é pendência e fica discreto", () => {
    const v = vista([semVendas()]);
    const m = mesDe(v, "2026-05");
    const i = itemDe(v, "2026-05");
    expect(i.estado).toBe(COMPLETION_ITEM.NAO_APLICAVEL);
    expect(i.badge).toBe("Não aplicável");
    expect(i.discreto).toBe(true);
    // Não conta como pendência, e o mês continua concluído.
    expect(m.porPreencher).toBe(0);
    expect(m.badge).toBe("Concluído");
  });

  it("requisitos opcionais não aparecem: não são exigíveis, logo não são pendências", () => {
    const opcional = {
      key: "extra", label: "Extra", title: "Extra", required: false,
      priority: "warning", impact: [],
      resolve: () => ({ availability: "unavailable", value: null }),
    };
    const c = buildMonthlyClosing({
      metrics: metricsPara("2026-07", "unavailable", null, "real", 90000), now: AGOSTO,
      requirements: [opcional],
    });
    expect(mesDe(vista([c]), "2026-07").itens).toEqual([]);
  });
});

describe("buildCompletionDataView — o fecho é a fonte de verdade", () => {
  it("T8 / mutation A — rubrica ausente do documento manual NUNCA vira pendência", () => {
    /* O mês está completo com CMV manual, mas o documento não o tem (falhou, ou foi
     * limpo). Inferir "falta" a partir dessa ausência seria inverter a dependência. */
    const semDoc = vista([completoManual()], { status: "documento", document: { months: {} } });
    const i = itemDe(semDoc, "2026-06");
    expect(i.estado).toBe(COMPLETION_ITEM.CONCLUIDO);
    expect(i.estado).not.toBe(COMPLETION_ITEM.POR_PREENCHER);
    expect(mesDe(semDoc, "2026-06").porPreencher).toBe(0);
  });

  it("T13 / mutation A — um documento manual cheio não fecha um mês que o motor diz incompleto", () => {
    const manual = docManual("2026-07", { value: 50, updatedAt: "2026-08-19T10:00:00.000Z" });
    const v = vista([incompleto()], manual);
    expect(mesDe(v, "2026-07").badge).toBe("Por completar");
    expect(itemDe(v, "2026-07").estado).toBe(COMPLETION_ITEM.POR_PREENCHER);
    // E o valor do documento não é mostrado: o motor não o reconheceu.
    expect(itemDe(v, "2026-07").value).toBeNull();
  });

  it("documento malformado não altera o que o fecho diz", () => {
    for (const doc of [{ status: "documento", document: { months: null } },
      { status: "documento", document: { months: { "2026-06": { cmv: { value: "x" } } } } },
      { status: "corrompido", document: null }]) {
      const v = vista([completoManual()], doc);
      expect(itemDe(v, "2026-06").value).toBe(116039.7);
      expect(mesDe(v, "2026-06").badge).toBe("Concluído");
    }
  });
});

describe("buildCompletionDataView — copy de produto", () => {
  it("T14 — nenhum termo técnico chega ao utilizador, em nenhum estado", () => {
    const proibidos = [
      "availability", "unavailable", "missingitems", "incomplete", "indeterminate",
      "in_progress", "not_applicable", "coverage", "firstcompletemonth", "closing",
      "api", "erp", "bling", "moloni", "primavera", "phc", "sage", "jasmin", "toconline",
      "json", "source manual", "null", "undefined", "monthkey",
    ];
    const manual = docManual("2026-06", { value: 1, updatedAt: "2026-08-19T10:00:00.000Z" });
    const v = vista([incompleto(), completoManual(), completoReal("2026-04"),
      indeterminado(), semVendas("2026-03")], manual);

    const texto = v.months.map((m) => [
      m.monthLabel, m.badge, m.resumo,
      ...m.itens.map((i) => `${i.label} ${i.badge ?? ""} ${i.detalhe ?? ""}`),
    ].join(" ")).join(" ").toLowerCase();

    for (const termo of proibidos) expect(texto).not.toContain(termo);
  });

  it("os quatro estados de mês produzem rótulos distintos", () => {
    const emCurso = fechoDe("2026-04", "unavailable", null, "real", 90000, new Date(2026, 3, 10));
    const v = vista([incompleto(), completoManual(), indeterminado(), emCurso]);
    expect(new Set(v.months.map((m) => m.badge)).size).toBe(4);
  });
});

/* ====================================================================================
 * GUARDA ESTRUTURAL — a página não pode ganhar escrita nem lógica de domínio.
 * O projeto não tem ambiente DOM nem testing-library, pelo que se analisa a fonte.
 * ==================================================================================== */
describe("integração na página — sem escrita e sem regra de domínio (C7E)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const pagina = semComentarios(
    readFileSync(join(raiz, "..", "pages", "AjustesManuais.jsx"), "utf8"));
  const view = semComentarios(readFileSync(join(raiz, "completionDataView.js"), "utf8"));

  /* ── T15 REESCRITO EM 26/08/2026 ──────────────────────────────────────────────────
   * A guarda original dizia "nenhuma ação de escrita, nem sequer desativada". Protegia
   * uma coisa certa — um botão que não faz nada é uma promessa falsa — e a página
   * cumpria-a por não ter ação nenhuma.
   *
   * O ecrã passou a ter UMA ação, e ela é real: "Confirmar cobertura" reconstrói o
   * dataset, e todos os estados a jusante recalculam. A guarda não desaparece; muda de
   * contrato, e o que continua a proibir é o que continua a ser verdade:
   *
   *   - NÃO há campo de introdução de valores. O CMV continua sem edição aqui, porque
   *     continua a não haver caminho de escrita seguro a partir do browser.
   *   - NÃO há vocabulário de fecho contabilístico.
   *   - NÃO há ação desativada a fingir uma funcionalidade futura.
   *
   * `disabled` passa a ser permitido num único caso, e por uma razão oposta à antiga: o
   * botão desativa-se ENQUANTO confirma, para não haver duplo envio. É estado
   * transitório de uma ação que existe, não a promessa de uma que não existe. */
  it("T15 — não há campo de introdução de valores nem vocabulário de fecho", () => {
    expect(pagina).not.toMatch(/<form|<input|<textarea|<select/);
    for (const termo of ["Guardar", "Editar", "Adicionar", "Eliminar", "Remover",
      "POST", "doPost", "onSubmit", "mutation",
      // A confirmação de cobertura NÃO é um fecho, e o ecrã não pode sugeri-lo.
      "fechar mês", "fecho contabilístico", "encerramento"]) {
      expect(pagina).not.toContain(termo);
    }
  });

  it("T15b — a única ação é a confirmação de cobertura, e faz mesmo alguma coisa", () => {
    expect(pagina).toContain("confirmarCobertura");
    /* O único `disabled` da página é o do envio em curso. O lookahead exclui a variante
     * do Tailwind (`disabled:opacity-50`), que é estilo do mesmo botão e não um segundo
     * controlo desativado. */
    const todos = pagina.match(/\bdisabled(?!:)[^\s>]*/g) || [];
    expect(todos).toEqual(["disabled={aConfirmar}"]);
  });

  it("T15c — a confirmação é em dois passos: o primeiro clique não confirma nada", () => {
    /* Uma afirmação sobre a contabilidade de um mês não pode custar o mesmo que fechar
     * um banner. O primeiro clique abre a frase; o segundo é que confirma. */
    expect(pagina).toContain("setAberto(true)");
    expect(pagina).toContain("card.confirmText");
    expect(pagina).toContain("card.ressalva");
  });

  it("T13 — a página não decide o que falta: delega ao view-model", () => {
    expect(pagina).toContain("buildCompletionDataView");
    expect(pagina).not.toContain("ITEM_STATUS");
    expect(pagina).not.toContain("required");
  });

  it("o view-model não formata moeda nem conhece navegação", () => {
    expect(view).not.toContain("formatMoney");
    expect(view).not.toContain("SCREENS");
    expect(view).not.toContain("navigateTo");
    expect(view).not.toContain("R$");
    expect(view).not.toContain("€");
  });

  it("o view-model não recalcula o motor de fecho", () => {
    for (const simbolo of ["buildMonthlyClosing", "buildMonthlyDre", "buildFinancialMetrics",
      "closedMonthKeys"]) {
      expect(view).not.toContain(simbolo);
    }
  });
});
