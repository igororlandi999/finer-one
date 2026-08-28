// O SCORE NÃO PODE AFIRMAR MAIS DO QUE VIU.
//
// O caso que motivou o módulo é o de julho/2026: CMV ausente -> rentabilidade não
// avaliada -> nenhuma penalização -> a aplicação declarava "a empresa atingiu o score
// máximo". Uma afirmação sobre a saúde da empresa a partir de uma dimensão que nunca foi
// calculada.

import { describe, it, expect } from "vitest";
import { resolveScoreDisclosure, explicarCalculoDoScore } from "./scoreDisclosure.js";

const SEM_CMV = {
  score: 100,
  penalizacoes: [],
  naoAvaliados: [{
    dimensao: "rentabilidade",
    motivo: "Resultado líquido sem fonte completa (CMV indisponível): dimensão não avaliada.",
  }],
};

const TUDO_VISTO_E_LIMPO = { score: 100, penalizacoes: [], naoAvaliados: [] };

const COM_DESCONTOS = {
  score: 68,
  penalizacoes: [
    { pts: 25, motivo: "Resultado líquido do mês negativo" },
    { pts: 7, motivo: "Existem contas a pagar vencidas" },
  ],
  naoAvaliados: [],
};

describe("o máximo exige que TUDO tenha sido avaliado", () => {
  it("sem penalizações E sem dimensões em falta: o máximo pode ser afirmado", () => {
    const d = resolveScoreDisclosure(TUDO_VISTO_E_LIMPO);
    expect(d.podeAfirmarMaximo).toBe(true);
    expect(d.completo).toBe(true);
    expect(explicarCalculoDoScore(d, 100)).toBe("Sem penalizações — a empresa atingiu o score máximo.");
  });

  it("sem penalizações MAS com uma dimensão por avaliar: o máximo NÃO pode ser afirmado", () => {
    /* O defeito, exatamente. Score 100, nada a descontar, e a dimensão mais importante
     * nunca foi calculada — a aplicação dizia que a empresa tinha atingido o máximo. */
    const d = resolveScoreDisclosure(SEM_CMV);
    expect(d.podeAfirmarMaximo, "declarou o máximo com uma dimensão por avaliar").toBe(false);
    expect(d.completo).toBe(false);
    const frase = explicarCalculoDoScore(d, 100);
    expect(frase).not.toContain("máximo");
    expect(frase).toContain("não foi avaliada");
  });

  it("com penalizações e uma dimensão em falta, a explicação diz as duas coisas", () => {
    const d = resolveScoreDisclosure({ ...COM_DESCONTOS, naoAvaliados: SEM_CMV.naoAvaliados });
    const frase = explicarCalculoDoScore(d, 68);
    expect(frase).toContain("−32 pts");
    expect(frase).toContain("não foi avaliada");
    expect(frase).toContain("não desconta nem confirma nada");
  });

  it("com penalizações e nada em falta, a explicação é a de sempre, sem ressalva", () => {
    /* O contrapeso: quando o cálculo É completo, não se acrescenta ruído. Uma ressalva
     * permanente ensina o utilizador a ignorá-la. */
    const d = resolveScoreDisclosure(COM_DESCONTOS);
    const frase = explicarCalculoDoScore(d, 68);
    expect(frase).toBe("Partimos de 100; os descontos somam −32 pts → score 68.");
    expect(frase).not.toContain("não foi avaliada");
  });
});

describe("a dimensão em falta é apresentável, com o motivo que o motor deu", () => {
  it("traz rótulo legível e o motivo original", () => {
    const d = resolveScoreDisclosure(SEM_CMV);
    expect(d.naoAvaliadas).toHaveLength(1);
    expect(d.naoAvaliadas[0].rotulo).toBe("Rentabilidade");
    expect(d.naoAvaliadas[0].motivo).toContain("CMV indisponível");
  });

  it("uma dimensão que o motor venha a emitir sem rótulo conhecido não desaparece", () => {
    /* Um mapa de rótulos incompleto não pode APAGAR uma dimensão do ecrã: o utilizador
     * ficaria a ver um score que não avaliou uma coisa que a interface não menciona. */
    const d = resolveScoreDisclosure({
      score: 100, penalizacoes: [],
      naoAvaliados: [{ dimensao: "liquidez", motivo: "Sem extrato bancário." }],
    });
    expect(d.naoAvaliadas[0].rotulo).toBe("liquidez");
    expect(d.podeAfirmarMaximo).toBe(false);
  });

  it("uma dimensão sem motivo recebe um motivo genérico, e não `undefined` no ecrã", () => {
    const d = resolveScoreDisclosure({ score: 100, penalizacoes: [], naoAvaliados: [{ dimensao: "rentabilidade" }] });
    expect(d.naoAvaliadas[0].motivo).toBe("Sem fonte para avaliar esta dimensão.");
  });

  it("duas dimensões em falta usam o plural", () => {
    const d = resolveScoreDisclosure({
      score: 100, penalizacoes: [],
      naoAvaliados: [{ dimensao: "rentabilidade", motivo: "a" }, { dimensao: "liquidez", motivo: "b" }],
    });
    expect(explicarCalculoDoScore(d, 100)).toContain("2 dimensões não foram avaliadas");
  });
});

describe("entradas defeituosas não rebentam nem inventam", () => {
  it("sem diagnóstico devolve null — e um array vazio conta como sem diagnóstico", () => {
    /* `[]` é `typeof "object"` e é verdadeiro. Sem a verificação de array, a ausência de
     * diagnóstico nenhum produzia um objeto que afirmava `podeAfirmarMaximo` — ou seja,
     * "não há dados" virava "atingiu o máximo", que é o defeito original outra vez, uma
     * camada acima. Escrito em ciclo e não em `it.each`, porque `it.each` ESPALHA um
     * elemento que seja array e o caso `[]` deixaria de ser exercido. */
    for (const v of [null, undefined, 0, "", [], "diagnostico", NaN, false]) {
      expect(resolveScoreDisclosure(v), `${JSON.stringify(v)} produziu um diagnóstico`).toBeNull();
    }
    expect(explicarCalculoDoScore(null, 100)).toBeNull();
    expect(explicarCalculoDoScore(undefined, 100)).toBeNull();
  });

  it("AUSENTE não é VAZIO: um diagnóstico que não se pronuncia não autoriza o máximo", () => {
    /* Apanhado a rever o próprio diff desta sessão. A primeira versão tratava
     * `penalizacoes` ausente como `[]` e concluía `podeAfirmarMaximo: true` — ou seja,
     * um diagnóstico com uma forma que não reconhecemos produzia "a empresa atingiu o
     * score máximo", que é a afirmação mais forte que este ecrã sabe fazer, a partir de
     * nada. Era o defeito original outra vez, uma camada acima.
     *
     * `penalizacoes: []` é o motor a DIZER que não há nada a descontar.
     * `penalizacoes` ausente é o motor a não dizer nada. */
    const semNada = resolveScoreDisclosure({ score: 100 });
    expect(semNada.penalizacoes).toEqual([]);
    expect(semNada.naoAvaliadas).toEqual([]);
    expect(semNada.completo, "afirmou completude sem o motor se pronunciar").toBe(false);
    expect(semNada.podeAfirmarMaximo, "afirmou o máximo a partir de nada").toBe(false);
    expect(explicarCalculoDoScore(semNada, 100)).not.toContain("máximo");

    /* Cada metade em falta, isolada. */
    const semNaoAvaliados = resolveScoreDisclosure({ score: 100, penalizacoes: [] });
    expect(semNaoAvaliados.podeAfirmarMaximo).toBe(false);

    const semPenalizacoes = resolveScoreDisclosure({ score: 100, naoAvaliados: [] });
    expect(semPenalizacoes.podeAfirmarMaximo).toBe(false);

    /* E o contrapeso: DECLARAR as duas vazias é o máximo legítimo. */
    const declarouTudo = resolveScoreDisclosure({ score: 100, penalizacoes: [], naoAvaliados: [] });
    expect(declarouTudo.podeAfirmarMaximo).toBe(true);
  });

  it("penalizações malformadas são descartadas, e não somadas como NaN", () => {
    /* Um NaN no total sobrevive a `typeof === "number"` e chega ao ecrã como "−NaN pts".
     * Pior: `JSON.stringify` transforma-o em `null` e o erro passa a parecer ausência. */
    const d = resolveScoreDisclosure({
      score: 90,
      penalizacoes: [{ pts: 10, motivo: "real" }, { pts: "10", motivo: "string" }, { pts: NaN }, null, { motivo: "sem pts" }],
      naoAvaliados: [],
    });
    expect(d.totalDescontado).toBe(10);
    expect(Number.isFinite(d.totalDescontado)).toBe(true);
    expect(d.penalizacoes).toHaveLength(1);
  });

  it("`naoAvaliados` com entradas inválidas não gera linhas fantasma no ecrã", () => {
    const d = resolveScoreDisclosure({
      score: 100, penalizacoes: [],
      naoAvaliados: [null, {}, { dimensao: "" }, { dimensao: 42 }, { dimensao: "rentabilidade", motivo: "ok" }],
    });
    expect(d.naoAvaliadas).toHaveLength(1);
    expect(d.naoAvaliadas[0].dimensao).toBe("rentabilidade");
  });
});
