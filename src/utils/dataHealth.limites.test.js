// DataHealth — casos de FRONTEIRA que o contrato normal não exercita.
//
// dataHealth.test.js cobre os percursos que o backend produz hoje. Este ficheiro cobre
// o que acontece quando o payload NÃO é o esperado: `meta.parcial` com o tipo errado,
// valores quase-verdadeiros, uma fonte nova que o backend passe a emitir. São entradas
// que ninguém escreve de propósito e que chegam quando alguma coisa muda a montante.
//
// A regra que todos partilham: perante entrada que não se percebe, o veredito é
// UNKNOWN. Nunca COMPLETE. Não saber não pode ser apresentado como estar tudo bem —
// é a mesma inversão que a frescura já teve de corrigir uma vez.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveDataCompleteness, resolveDataHealth, COMPLETENESS, HEALTH_SEVERITY } from "./dataHealth.js";
import { FRESHNESS } from "./dataFreshness.js";

const AGORA = new Date("2026-08-23T15:00:00.000Z");
const FRESCO = "2026-08-23T14:00:00.000Z";
const completude = (parcial) => resolveDataCompleteness({ meta: { parcial } });

describe("meta.parcial com o TIPO errado", () => {
  /* `typeof [] === "object"` — um array passa a verificação de tipo e chega ao
   * Object.keys. Tem de sair UNKNOWN e não rebentar. */
  it("array vazio não é um mapa de fontes: UNKNOWN", () => {
    expect(completude([]).estado).toBe(COMPLETENESS.UNKNOWN);
  });

  it("array com valores NÃO vira uma alegação de completude", () => {
    /* Um array [false, false, false] tem três chaves ("0","1","2") todas a false e,
     * sem a guarda de Array.isArray, saía COMPLETE por acidente aritmético — uma
     * afirmação sobre pedidos, contas a pagar e contas a receber tirada de um payload
     * que não fala de nenhuma delas. */
    const r = completude([false, false, false]);
    expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(r.parciais).toEqual([]);
    expect(r.rotulosParciais).toEqual([]);
  });

  it("string, número, booleano e função: todos UNKNOWN, sem coerção", () => {
    for (const v of ["parcial", "false", 0, 1, true, false, () => {}]) {
      expect(completude(v).estado, `${String(v)} devia ser UNKNOWN`).toBe(COMPLETENESS.UNKNOWN);
    }
  });

  it("null explícito é UNKNOWN, e não COMPLETE", () => {
    expect(completude(null).estado).toBe(COMPLETENESS.UNKNOWN);
    expect(completude(null).conhecida).toBe(false);
  });

  it("meta inteiro com o tipo errado não rebenta nem tranquiliza", () => {
    for (const meta of ["texto", 42, [], true, () => {}]) {
      const r = resolveDataCompleteness({ meta });
      expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
      expect(r.conhecida).toBe(false);
    }
  });

  it("chamada sem argumentos nenhuns também é UNKNOWN", () => {
    expect(resolveDataCompleteness().estado).toBe(COMPLETENESS.UNKNOWN);
  });
});

describe("valores quase-verdadeiros — a comparação é ESTRITA", () => {
  it("a string 'true' NÃO é parcial: é indeterminado", () => {
    /* Um backend que emita strings em vez de booleanos não pode disparar um aviso de
     * parcialidade — mas também não pode ser lido como completo. */
    const r = completude({ orders: "true", payables: false, receivables: false });
    expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(r.parciais).toEqual([]);
    expect(r.desconhecidas).toContain("orders");
  });

  it("a string 'false' NÃO conta como fonte completa", () => {
    const r = completude({ orders: "false", payables: "false", receivables: "false" });
    expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(r.desconhecidas).toHaveLength(3);
  });

  it("1 e 0 não substituem true e false", () => {
    expect(completude({ orders: 1, payables: 0, receivables: 0 }).estado).toBe(COMPLETENESS.UNKNOWN);
  });

  it("undefined numa fonte é silêncio, não completude", () => {
    const r = completude({ orders: undefined, payables: false, receivables: false });
    expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(r.desconhecidas).toEqual(["orders"]);
  });
});

describe("fontes que o mapa de rótulos ainda não conhece", () => {
  it("uma fonte nova parcial é nomeada pela sua chave, não omitida", () => {
    /* Se o backend passar a emitir uma quarta fonte, o pior desfecho seria a faixa
     * dizer "atualização parcial" sem dizer de quê. A chave crua é feia mas honesta. */
    const r = completude({ orders: false, payables: false, receivables: false, estoque: true });
    expect(r.estado).toBe(COMPLETENESS.PARTIAL);
    expect(r.rotulosParciais).toEqual(["estoque"]);
    expect(r.detalhe).toContain("estoque");
  });

  it("uma fonte nova silenciosa impede afirmar completude do conjunto", () => {
    const r = completude({ orders: false, payables: false, receivables: false, estoque: null });
    expect(r.estado).toBe(COMPLETENESS.UNKNOWN);
    expect(r.desconhecidas).toEqual(["estoque"]);
  });

  it("um mapa só com fontes desconhecidas e completas é COMPLETE — a camada não valida nomes", () => {
    /* Deliberado: esta camada reporta o que a fonte declara; não é o sítio para
     * decidir que fontes deviam existir. Essa decisão é do serviço de leitura. */
    expect(completude({ estoque: false }).estado).toBe(COMPLETENESS.COMPLETE);
  });
});

describe("os dois eixos, nos extremos", () => {
  it("relógio adiantado (dados do futuro) é frescura máxima e não contamina a completude", () => {
    const s = resolveDataHealth({
      meta: { geradoEm: "2026-08-24T00:00:00.000Z", parcial: { orders: false, payables: false, receivables: false } },
      now: AGORA,
    });
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.freshness.ageHours).toBe(0);
    expect(s.completeness.estado).toBe(COMPLETENESS.COMPLETE);
    expect(s.severidade).toBe(HEALTH_SEVERITY.NEUTRA);
  });

  it("data ilegível com completude conhecida: severidade DESCONHECIDA manda", () => {
    /* A idade é o eixo dominante para a severidade — não saber QUANDO é pior do que
     * saber que falta uma parte. */
    const s = resolveDataHealth({
      meta: { geradoEm: "não é uma data", parcial: { orders: true, payables: false, receivables: false } },
      now: AGORA,
    });
    expect(s.severidade).toBe(HEALTH_SEVERITY.DESCONHECIDA);
    expect(s.completeness.estado).toBe(COMPLETENESS.PARTIAL);
    // A parcialidade continua no detalhe, mesmo sem entrar no rótulo.
    expect(s.detalhes.join(" ")).toContain("ainda está a ser completada");
    expect(s.label).not.toContain("parcial");
  });

  it("geradoEm válido e parcial em falta: fresco e indeterminado ao mesmo tempo", () => {
    const s = resolveDataHealth({ meta: { geradoEm: FRESCO }, now: AGORA });
    expect(s.freshness.estado).toBe(FRESHNESS.FRESH);
    expect(s.completeness.estado).toBe(COMPLETENESS.UNKNOWN);
    // Indeterminado não é problema visual: sem prova de incompletude, não se alarma.
    expect(s.severidade).toBe(HEALTH_SEVERITY.NEUTRA);
  });

  it("as três fontes parciais nomeiam-se todas, sem duplicar o detalhe", () => {
    const s = resolveDataHealth({
      meta: { geradoEm: FRESCO, parcial: { orders: true, payables: true, receivables: true } },
      now: AGORA,
    });
    expect(s.completeness.rotulosParciais).toEqual(["pedidos", "contas a pagar", "contas a receber"]);
    expect(s.detalhes).toHaveLength(1);
    expect(s.detalhes[0]).toContain("pedidos, contas a pagar e contas a receber");
  });
});

describe("o portão do AppShell — nem loading nem mock chegam à faixa", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const shell = readFileSync(join(raiz, "..", "layouts", "AppShell.jsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("a saúde só é resolvida com fonte real E fora de loading", () => {
    /* Durante o loading não há `meta` nenhum — resolver a saúde aí produziria
     * "Data de atualização desconhecida" a piscar antes dos dados chegarem. */
    expect(shell).toContain("source === DATA_SOURCE.API");
    expect(shell).toContain("!loading");
  });

  it("a faixa só é montada quando há saúde apurada", () => {
    expect(shell).toMatch(/saude\s*&&\s*<DataHealth/);
  });

  it("modo demonstração não passa pela faixa de saúde", () => {
    /* `source` mock não é API: o portão exclui-o pela mesma condição. O selo de
     * demonstração é outro componente e não se confunde com idade de snapshot. */
    expect(shell).not.toMatch(/DATA_SOURCE\.MOCK[\s\S]{0,80}resolveDataHealth/);
  });
});
