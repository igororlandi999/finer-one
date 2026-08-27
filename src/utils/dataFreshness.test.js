// Testes da observabilidade da frescura dos dados (C7F.2).
//
// O contrato protegido: a idade dos dados é derivada da data que a FONTE declarou —
// nunca assumida, nunca inventada a partir do relógio local — e a ausência dessa data
// produz "desconhecido", jamais "fresco".

import { describe, it, expect } from "vitest";
import {
  resolveDataFreshness, FRESHNESS, FRESHNESS_THRESHOLDS,
} from "./dataFreshness.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Relógio dos testes: 22/08/2026 às 12:00, hora LOCAL. As datas de referência são
 * construídas a partir dele, e não escritas à mão em UTC, para que o teste não mude de
 * resultado conforme o fuso de quem o corre. */
const AGORA = new Date(2026, 7, 22, 12, 0, 0);

/** ISO de um instante `horas` antes de AGORA. */
const haHoras = (horas) => new Date(AGORA.getTime() - horas * 3600000).toISOString();

const resolver = (geradoEm) => resolveDataFreshness({ geradoEm, now: AGORA });

describe("resolveDataFreshness — dados recentes", () => {
  it("dados de agora mesmo são FRESH", () => {
    const r = resolver(haHoras(0));
    expect(r.estado).toBe(FRESHNESS.FRESH);
    expect(r.conhecida).toBe(true);
    expect(r.label).toBe("Atualizado agora mesmo");
  });

  it("dados de há poucas horas são FRESH, com a idade em horas", () => {
    const r = resolver(haHoras(5));
    expect(r.estado).toBe(FRESHNESS.FRESH);
    expect(r.label).toBe("Atualizado há 5 horas");
    expect(r.ageHours).toBeCloseTo(5, 5);
  });

  it("dados frescos não acrescentam explicação: seria ruído", () => {
    expect(resolver(haHoras(3)).detalhe).toBeNull();
  });

  it("expõe a data e a hora exatas, além da idade relativa", () => {
    const r = resolver(haHoras(2));   // 22/08/2026 às 10:00 local
    expect(r.dateLabel).toBe("22/08/2026");
    expect(r.timeLabel).toBe("10:00");
  });
});

describe("resolveDataFreshness — dados antigos", () => {
  it("a partir de 24h entra em WARNING", () => {
    const r = resolver(haHoras(FRESHNESS_THRESHOLDS.warningHours));
    expect(r.estado).toBe(FRESHNESS.WARNING);
    expect(r.label).toBe("Atualizado há 1 dia");
    expect(r.detalhe).toMatch(/movimentos mais recentes/);
  });

  it("a partir de 72h entra em STALE", () => {
    const r = resolver(haHoras(FRESHNESS_THRESHOLDS.staleHours));
    expect(r.estado).toBe(FRESHNESS.STALE);
    expect(r.detalhe).toMatch(/podem não refletir a atividade mais recente/);
  });

  it("o caso real que originou esta fase: snapshot parado há 8 dias", () => {
    const r = resolver(haHoras(8 * 24));
    expect(r.estado).toBe(FRESHNESS.STALE);
    expect(r.label).toBe("Atualizado há 8 dias");
    expect(Math.round(r.ageDays)).toBe(8);
  });

  it("os limiares são fronteiras fechadas à esquerda, sem zona morta entre estados", () => {
    const { warningHours, staleHours } = FRESHNESS_THRESHOLDS;
    expect(resolver(haHoras(warningHours - 0.01)).estado).toBe(FRESHNESS.FRESH);
    expect(resolver(haHoras(warningHours)).estado).toBe(FRESHNESS.WARNING);
    expect(resolver(haHoras(staleHours - 0.01)).estado).toBe(FRESHNESS.WARNING);
    expect(resolver(haHoras(staleHours)).estado).toBe(FRESHNESS.STALE);
  });

  it("singular e plural corretos: nunca 'há 1 dias' nem 'há 1 horas'", () => {
    expect(resolver(haHoras(1)).label).toBe("Atualizado há 1 hora");
    expect(resolver(haHoras(2)).label).toBe("Atualizado há 2 horas");
    expect(resolver(haHoras(24)).label).toBe("Atualizado há 1 dia");
    expect(resolver(haHoras(48)).label).toBe("Atualizado há 2 dias");
  });
});

describe("resolveDataFreshness — metadata ausente", () => {
  it("ausência de data é DESCONHECIDO, nunca fresco", () => {
    for (const vazio of [null, undefined, ""]) {
      const r = resolver(vazio);
      expect(r.estado).toBe(FRESHNESS.UNKNOWN);
      expect(r.estado).not.toBe(FRESHNESS.FRESH);
      expect(r.conhecida).toBe(false);
    }
  });

  it("sem argumentos nenhuns também é DESCONHECIDO, sem rebentar", () => {
    expect(resolveDataFreshness().estado).toBe(FRESHNESS.UNKNOWN);
    expect(resolveDataFreshness({}).estado).toBe(FRESHNESS.UNKNOWN);
  });

  it("desconhecido não inventa idade nem carimbo", () => {
    const r = resolver(null);
    expect(r.ageHours).toBeNull();
    expect(r.ageDays).toBeNull();
    expect(r.dateLabel).toBeNull();
    expect(r.timeLabel).toBeNull();
    expect(r.iso).toBeNull();
  });

  it("desconhecido diz o que é, sem alarmar nem tranquilizar", () => {
    const r = resolver(null);
    expect(r.label).toBe("Data de atualização desconhecida");
    expect(r.detalhe).toBe("A fonte não indicou quando os dados foram recolhidos.");
  });
});

describe("resolveDataFreshness — data inválida", () => {
  it("strings que não são datas ficam DESCONHECIDO", () => {
    for (const invalida of ["ontem", "2026-13-45T00:00:00Z", "abc", "//"]) {
      expect(resolver(invalida).estado).toBe(FRESHNESS.UNKNOWN);
    }
  });

  it("tipos que não são string ficam DESCONHECIDO, sem coerção", () => {
    for (const invalida of [0, 123456789, true, {}, [], new Date()]) {
      expect(resolver(invalida).estado).toBe(FRESHNESS.UNKNOWN);
    }
  });

  it("uma data inválida NUNCA vira a data de hoje", () => {
    const r = resolver("não é data");
    expect(r.dateLabel).toBeNull();
    expect(r.dateLabel).not.toBe("22/08/2026");
  });
});

describe("resolveDataFreshness — desvio de relógio", () => {
  it("data no futuro é tratada como frescura máxima, não como erro", () => {
    /* O relógio da fonte pode estar adiantado face ao do utilizador. Isso é desvio de
     * fuso/relógio, não dados do futuro — e o utilizador não tem nada a fazer com essa
     * informação, pelo que um alarme seria ruído. */
    const futuro = new Date(AGORA.getTime() + 3600000).toISOString();
    const r = resolver(futuro);
    expect(r.estado).toBe(FRESHNESS.FRESH);
    expect(r.ageHours).toBe(0);
    expect(r.ageHours).not.toBeLessThan(0);
  });
});

describe("resolveDataFreshness — pureza", () => {
  it("o relógio é injetado: a mesma data com relógios diferentes dá estados diferentes", () => {
    const iso = haHoras(0);
    const maisTarde = new Date(AGORA.getTime() + 10 * 24 * 3600000);
    expect(resolveDataFreshness({ geradoEm: iso, now: AGORA }).estado).toBe(FRESHNESS.FRESH);
    expect(resolveDataFreshness({ geradoEm: iso, now: maisTarde }).estado).toBe(FRESHNESS.STALE);
  });

  it("chamadas repetidas com os mesmos argumentos dão o mesmo resultado", () => {
    expect(resolver(haHoras(30))).toEqual(resolver(haHoras(30)));
  });
});

/* ====================================================================================
 * GUARDA ESTRUTURAL — a observabilidade não pode contaminar nem os cálculos nem o JSX.
 * ==================================================================================== */
describe("integração e fronteiras (C7F.2)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const ler = (...p) => readFileSync(join(raiz, "..", ...p), "utf8");
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const view = semComentarios(ler("utils", "dataFreshness.js"));

  it("a camada pura não conhece finanças nem JSX", () => {
    for (const simbolo of ["buildMonthlyDre", "buildFinancialMetrics", "buildMonthlyClosing",
      "formatMoney", "receita", "cmv", "<div", "React"]) {
      expect(view).not.toContain(simbolo);
    }
  });

  it("os limiares vivem num só sítio, não espalhados em comparações soltas", () => {
    expect(view).toContain("FRESHNESS_THRESHOLDS");
    // Nenhum número mágico de horas fora da constante.
    expect(view).not.toMatch(/>=\s*(24|72)\b/);
  });

  it("a frescura continua a ser consumida por quem compõe a saúde do conjunto", () => {
    /* A faixa deixou de consumir esta camada diretamente: passou a haver um eixo de
     * completude a par do de idade, e quem os compõe é utils/dataHealth.js (P0.2).
     * As guardas do componente e do AppShell mudaram de dono e vivem lá. O que se
     * protege aqui é só que esta camada não foi contornada. */
    const saude = semComentarios(ler("utils", "dataHealth.js"));
    expect(saude).toContain("resolveDataFreshness");
    expect(saude).not.toContain("FRESHNESS_THRESHOLDS");
  });
});
