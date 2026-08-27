// Testes da saúde do dataset em duas dimensões (P0.2).
//
// O contrato protegido: frescura e completude são eixos INDEPENDENTES. Um snapshot
// recente e incompleto não pode apresentar-se como plenamente saudável, e um snapshot
// completo mas velho não pode apresentar-se como atual. Nenhum dos dois eixos pode
// silenciar o outro quando ambos têm algo a dizer.

import { describe, it, expect } from "vitest";
import {
  resolveDataHealth, resolveDataCompleteness, COMPLETENESS, HEALTH_SEVERITY,
} from "./dataHealth.js";
import { FRESHNESS } from "./dataFreshness.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Mesmo relógio de dataFreshness.test.js: 22/08/2026 às 12:00 hora LOCAL, para que os
 * testes não mudem de resultado conforme o fuso de quem os corre. */
const AGORA = new Date(2026, 7, 22, 12, 0, 0);
const haHoras = (horas) => new Date(AGORA.getTime() - horas * 3600000).toISOString();

/** `sales.meta` com o shape REAL que blingDataService emite. */
const meta = ({ geradoEm = haHoras(1), orders = false, payables = false, receivables = false } = {}) => ({
  geradoEm,
  orders: geradoEm,
  payables: geradoEm,
  receivables: geradoEm,
  parcial: { orders, payables, receivables },
  algumParcial: [orders, payables, receivables].some((p) => p === true),
  todasCompletas: [orders, payables, receivables].every((p) => p === false),
});

const saude = (m) => resolveDataHealth({ meta: m, now: AGORA });

/* ── Completude isolada ───────────────────────────────────────────────────────────── */

describe("resolveDataCompleteness", () => {
  it("as três fontes a declararem-se completas dão COMPLETE", () => {
    const c = resolveDataCompleteness({ meta: meta() });
    expect(c.estado).toBe(COMPLETENESS.COMPLETE);
    expect(c.conhecida).toBe(true);
    expect(c.parciais).toEqual([]);
    expect(c.detalhe).toBeNull();
  });

  it("uma única fonte parcial basta para o conjunto ser PARTIAL", () => {
    const c = resolveDataCompleteness({ meta: meta({ receivables: true }) });
    expect(c.estado).toBe(COMPLETENESS.PARTIAL);
    expect(c.parciais).toEqual(["receivables"]);
    expect(c.rotulosParciais).toEqual(["contas a receber"]);
  });

  it("nomeia todas as fontes incompletas, em português corrente", () => {
    const c = resolveDataCompleteness({ meta: meta({ payables: true, receivables: true }) });
    expect(c.detalhe).toBe("Parte dos dados ainda está a ser completada (contas a pagar e contas a receber).");
  });

  it("uma fonte silenciosa (null) impede afirmar que o conjunto está completo", () => {
    const c = resolveDataCompleteness({ meta: meta({ payables: null }) });
    expect(c.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(c.conhecida).toBe(false);
    expect(c.desconhecidas).toEqual(["payables"]);
  });

  it("sem mapa por fonte o veredito é UNKNOWN — nunca COMPLETE", () => {
    expect(resolveDataCompleteness({ meta: { geradoEm: haHoras(1) } }).estado).toBe(COMPLETENESS.UNKNOWN);
    expect(resolveDataCompleteness({ meta: null }).estado).toBe(COMPLETENESS.UNKNOWN);
    expect(resolveDataCompleteness({}).estado).toBe(COMPLETENESS.UNKNOWN);
  });

  it("não deduz completude a partir de algumParcial quando o mapa falta", () => {
    // `algumParcial: false` sem mapa leria-se como "está completo" — e não está: é
    // apenas a ausência de prova em contrário.
    const c = resolveDataCompleteness({ meta: { geradoEm: haHoras(1), algumParcial: false, todasCompletas: true } });
    expect(c.estado).toBe(COMPLETENESS.UNKNOWN);
  });
});

/* ── As quatro combinações que a P0.2 exige ───────────────────────────────────────── */

describe("resolveDataHealth — FRESH + COMPLETE", () => {
  it("é discreto: sem nota de parcialidade e sem detalhes", () => {
    const s = saude(meta({ geradoEm: haHoras(2) }));
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.NEUTRA);
    expect(s.label).toBe("Atualizado há 2 horas");
    expect(s.detalhes).toEqual([]);
  });
});

describe("resolveDataHealth — FRESH + PARTIAL", () => {
  it("NÃO pode parecer plenamente saudável", () => {
    const s = saude(meta({ geradoEm: haHoras(0), receivables: true }));
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.PARTIAL);
    // A regra central da P0.2: fresco mas incompleto nunca sai NEUTRA.
    expect(s.severidade).toBe(HEALTH_SEVERITY.ATENCAO);
  });

  it("o rótulo declara as duas coisas ao mesmo tempo", () => {
    const s = saude(meta({ geradoEm: haHoras(0), receivables: true }));
    expect(s.label).toBe("Atualizado agora mesmo · atualização parcial");
    expect(s.detalhes).toEqual([
      "Parte dos dados ainda está a ser completada (contas a receber).",
    ]);
  });

  it("não afirma que os dados estão errados — só que estão incompletos", () => {
    const s = saude(meta({ geradoEm: haHoras(0), orders: true }));
    const texto = [s.label, ...s.detalhes].join(" ").toLowerCase();
    expect(texto).not.toMatch(/errad|incorret|inválid|falso/);
    expect(texto).toContain("completada");
  });
});

describe("resolveDataHealth — WARNING + PARTIAL", () => {
  it("mostra AMBOS os problemas, sem um silenciar o outro", () => {
    const s = saude(meta({ geradoEm: haHoras(30), payables: true }));
    expect(s.freshness.estado).toBe(FRESHNESS.WARNING);
    expect(s.completeness.estado).toBe(COMPLETENESS.PARTIAL);
    expect(s.severidade).toBe(HEALTH_SEVERITY.ATENCAO);
    expect(s.detalhes).toHaveLength(2);
    expect(s.detalhes[0]).toMatch(/movimentos mais recentes/);
    expect(s.detalhes[1]).toMatch(/está a ser completada/);
    expect(s.label).toBe("Atualizado há 1 dia · atualização parcial");
  });
});

describe("resolveDataHealth — STALE + COMPLETE", () => {
  it("dado completo, mas antigo: alerta de idade e nenhuma nota de parcialidade", () => {
    const s = saude(meta({ geradoEm: haHoras(24 * 8) }));
    expect(s.freshness.estado).toBe(FRESHNESS.STALE);
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.ALERTA);
    expect(s.label).toBe("Atualizado há 8 dias");
    expect(s.detalhes).toEqual([
      "Os valores apresentados podem não refletir a atividade mais recente.",
    ]);
  });

  it("STALE + PARTIAL mantém-se ALERTA e acumula os dois detalhes", () => {
    const s = saude(meta({ geradoEm: haHoras(24 * 8), orders: true }));
    expect(s.severidade).toBe(HEALTH_SEVERITY.ALERTA);
    expect(s.detalhes).toHaveLength(2);
  });
});

describe("resolveDataHealth — UNKNOWN", () => {
  it("sem data não alega atualização nenhuma", () => {
    const s = saude(meta({ geradoEm: null }));
    expect(s.freshness.estado).toBe(FRESHNESS.UNKNOWN);
    expect(s.severidade).toBe(HEALTH_SEVERITY.DESCONHECIDA);
    expect(s.label).toBe("Data de atualização desconhecida");
    expect(s.label).not.toMatch(/Atualizado/);
    expect(s.dateLabel).toBeNull();
  });

  it("data desconhecida não é contaminada pela nota de parcialidade no rótulo", () => {
    const s = saude(meta({ geradoEm: null, receivables: true }));
    expect(s.label).toBe("Data de atualização desconhecida");
    // …mas a incompletude continua visível onde é uma observação, não uma alegação.
    expect(s.detalhes.some((d) => /está a ser completada/.test(d))).toBe(true);
  });

  it("meta ausente por completo não produz um veredito tranquilizador", () => {
    const s = resolveDataHealth({ meta: null, now: AGORA });
    expect(s.freshness.estado).toBe(FRESHNESS.UNKNOWN);
    expect(s.completeness.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(s.severidade).toBe(HEALTH_SEVERITY.DESCONHECIDA);
  });
});

/* ── Ortogonalidade ──────────────────────────────────────────────────────────────── */

describe("resolveDataHealth — os dois eixos não se confundem", () => {
  it("a completude não altera o veredito de frescura, nem o contrário", () => {
    const completo = saude(meta({ geradoEm: haHoras(2) }));
    const parcial = saude(meta({ geradoEm: haHoras(2), receivables: true }));
    expect(parcial.freshness.estado).toBe(completo.freshness.estado);
    expect(parcial.freshness.ageHours).toBe(completo.freshness.ageHours);
    expect(parcial.completeness.estado).not.toBe(completo.completeness.estado);
  });

  it("não existe enum combinatório: os estados são lidos em dois campos separados", () => {
    const s = saude(meta({ geradoEm: haHoras(30), receivables: true }));
    expect(Object.values(FRESHNESS)).toContain(s.freshness.estado);
    expect(Object.values(COMPLETENESS)).toContain(s.completeness.estado);
    expect(Object.values(HEALTH_SEVERITY)).toContain(s.severidade);
  });
});

/* ── Contrato com o produtor real ─────────────────────────────────────────────────── */

describe("resolveDataHealth — shape emitido por blingDataService", () => {
  it("lê as chaves orders/payables/receivables tal como o serviço as escreve", () => {
    // Se alguém renomear as chaves no produtor sem mexer aqui, este teste cai.
    const c = resolveDataCompleteness({
      meta: { parcial: { orders: true, payables: false, receivables: false } },
    });
    expect(c.rotulosParciais).toEqual(["pedidos"]);
  });

  it("uma fonte que falhou (geradoEm e parcial a null) deixa a completude UNKNOWN", () => {
    // É exatamente o que o serviço emite quando a promessa de uma fonte rejeita.
    const c = resolveDataCompleteness({
      meta: { parcial: { orders: false, payables: null, receivables: false } },
    });
    expect(c.estado).toBe(COMPLETENESS.UNKNOWN);
  });
});

/* ====================================================================================
 * CASOS REAIS (P4) — o conjunto tem TRÊS fontes, e o veredito é do conjunto.
 * ====================================================================================
 * `sales.meta` agrega três fontes independentes. A regra do produtor:
 *   geradoEm = a data MAIS ANTIGA das três (o conjunto vale pela pior fonte);
 *   parcial  = mapa por fonte, com true / false / null.
 * Estes testes constroem `meta` exatamente como `blingDataService` o emite.
 */
describe("casos reais — três fontes (P4)", () => {
  /** Réplica fiel do produtor: agrega como blingDataService.js agrega. */
  const metaDe = ({ orders, payables, receivables }) => {
    const datas = [orders.geradoEm, payables.geradoEm, receivables.geradoEm]
      .filter((d) => typeof d === "string" && d !== "").sort();
    const parcial = {
      orders: orders.parcial, payables: payables.parcial, receivables: receivables.parcial,
    };
    return {
      geradoEm: datas.length ? datas[0] : null,
      orders: orders.geradoEm, payables: payables.geradoEm, receivables: receivables.geradoEm,
      parcial,
      algumParcial: Object.values(parcial).some((x) => x === true),
      todasCompletas: Object.values(parcial).every((x) => x === false),
    };
  };
  const fonte = (horas, parcial = false) => ({
    geradoEm: horas === null ? null : haHoras(horas), parcial,
  });

  it("A · três fontes frescas e completas -> discreto, sem nota nenhuma", () => {
    const s = saude(metaDe({ orders: fonte(1), payables: fonte(2), receivables: fonte(3) }));
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.NEUTRA);
    expect(s.detalhes).toEqual([]);
    // O conjunto vale pela fonte mais ANTIGA das três.
    expect(s.freshness.ageHours).toBeCloseTo(3, 5);
  });

  it("B · uma fonte fresca mas PARCIAL contamina o conjunto", () => {
    const s = saude(metaDe({ orders: fonte(1), payables: fonte(1), receivables: fonte(1, true) }));
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.PARTIAL);
    expect(s.severidade).not.toBe(HEALTH_SEVERITY.NEUTRA);
    expect(s.completeness.rotulosParciais).toEqual(["contas a receber"]);
  });

  it("C · uma fonte VELHA e completa: alerta de idade, sem falar de parcialidade", () => {
    const s = saude(metaDe({ orders: fonte(1), payables: fonte(24 * 5), receivables: fonte(2) }));
    expect(s.freshness.estado).toBe(FRESHNESS.STALE);
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.ALERTA);
    expect(s.label).not.toMatch(/parcial/i);
    // STALE nunca pode ser reportado como PARTIAL: são eixos distintos.
    expect(s.completeness.estado).not.toBe(COMPLETENESS.PARTIAL);
  });

  it("D · uma fonte sem data: o conjunto continua a valer pelas que têm", () => {
    const s = saude(metaDe({ orders: fonte(2), payables: fonte(null), receivables: fonte(1) }));
    // `geradoEmMaisAntigo` ignora nulls; o conjunto tem data conhecida.
    expect(s.freshness.conhecida).toBe(true);
    expect(s.freshness.ageHours).toBeCloseTo(2, 5);
  });

  it("E · duas fontes completas e uma silenciosa -> UNKNOWN, nunca COMPLETE", () => {
    const s = saude(metaDe({ orders: fonte(1), payables: fonte(1), receivables: fonte(1, null) }));
    expect(s.completeness.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(s.completeness.estado).not.toBe(COMPLETENESS.COMPLETE);
    expect(s.completeness.desconhecidas).toEqual(["receivables"]);
    // Não sabendo, não se inventa alarme: a incerteza não vira aviso de parcialidade.
    expect(s.label).not.toMatch(/parcial/i);
  });

  it("F · meta.parcial ausente -> UNKNOWN, e a frescura continua a funcionar", () => {
    const s = resolveDataHealth({ meta: { geradoEm: haHoras(2) }, now: AGORA });
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(s.label).toBe("Atualizado há 2 horas");
  });

  it("G · a camada NÃO lê linhas: um dataset vazio e completo continua completo", () => {
    /* Um array vazio é dado REAL com zero linhas — zeros verdadeiros, não indisponi-
     * bilidade. Esta camada nem sequer tem acesso às linhas: só vê `meta`. O teste
     * fixa esse contrato, para que ninguém passe a inferir saúde a partir de contagens. */
    const s = saude(metaDe({ orders: fonte(1), payables: fonte(1), receivables: fonte(1) }));
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.NEUTRA);
    const fonteDoModulo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "dataHealth.js"), "utf8");
    for (const simbolo of ["data", "rows", "length", "orders.length"]) {
      expect(fonteDoModulo).not.toMatch(new RegExp(`meta\.${simbolo}\b`));
    }
  });

  it("H · avaria: o AppShell não chama esta camada sem fonte real", () => {
    /* `unavailable` e `loading` nunca chegam aqui — o AppShell só resolve a saúde com
     * `source === API`. Mas se alguém contornar esse portão, o pior caso tem de ser
     * honesto, e não tranquilizador. */
    const s = resolveDataHealth({ meta: null, now: AGORA });
    expect(s.severidade).toBe(HEALTH_SEVERITY.DESCONHECIDA);
    expect(s.label).not.toMatch(/Atualizado/);
  });

  it("as garantias em conjunto: unknown≠complete, partial≠erro, stale≠partial", () => {
    const desconhecido = saude(metaDe({ orders: fonte(1), payables: fonte(1, null), receivables: fonte(1) }));
    const parcial = saude(metaDe({ orders: fonte(1, true), payables: fonte(1), receivables: fonte(1) }));
    const velho = saude(metaDe({ orders: fonte(24 * 9), payables: fonte(1), receivables: fonte(1) }));

    expect(desconhecido.completeness.estado).not.toBe(COMPLETENESS.COMPLETE);
    // "Parcial" é incompletude, não avaria: nunca sobe a DESCONHECIDA.
    expect(parcial.severidade).toBe(HEALTH_SEVERITY.ATENCAO);
    expect(parcial.freshness.conhecida).toBe(true);
    // "Velho" é idade, não incompletude.
    expect(velho.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(velho.freshness.estado).toBe(FRESHNESS.STALE);
  });
});

/* ====================================================================================
 * GUARDA ESTRUTURAL — herdada da C7F.2, agora sobre os dois eixos.
 * ==================================================================================== */
describe("integração e fronteiras (P0.2)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const ler = (...p) => readFileSync(join(raiz, "..", ...p), "utf8");
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const view = semComentarios(ler("utils", "dataHealth.js"));
  const componente = semComentarios(ler("components", "ui", "DataHealth.jsx"));
  const shell = semComentarios(ler("layouts", "AppShell.jsx"));

  it("a camada pura não conhece finanças nem JSX", () => {
    for (const simbolo of ["buildMonthlyDre", "buildFinancialMetrics", "buildMonthlyClosing",
      "formatMoney", "receita", "cmv", "<div", "React"]) {
      expect(view).not.toContain(simbolo);
    }
  });

  it("a camada pura reutiliza a frescura em vez de a reimplementar", () => {
    expect(view).toContain("resolveDataFreshness");
    // Nenhum limiar de horas duplicado aqui: continuam a viver só em dataFreshness.
    expect(view).not.toMatch(/>=\s*(24|72)/);
    expect(view).not.toContain("MS_POR_HORA");
  });

  it("o componente não decide regra nenhuma: recebe a saúde já apurada", () => {
    expect(componente).toContain("saude");
    expect(componente).not.toContain("resolveDataHealth");
    expect(componente).not.toContain("resolveDataFreshness");
    expect(componente).not.toContain("Date");
    expect(componente).not.toContain("THRESHOLDS");
  });

  it("a integração é global e só com fonte real", () => {
    expect(shell).toContain("resolveDataHealth");
    expect(shell).toContain("source === DATA_SOURCE.API");
  });

  it("o AppShell passa meta INTEIRO — era a raiz da P0.2 receber só a data", () => {
    expect(shell).toContain("sales?.meta");
    expect(shell).not.toContain("sales?.meta?.geradoEm");
  });

  it("a saúde não toca em cálculo nenhum: só lê meta", () => {
    for (const simbolo of ["financeiro", "closings", "profitability", "receitas"]) {
      expect(shell).not.toContain(simbolo);
    }
  });
});
