// A CHAVE DO MÊS NÃO PODE DEPENDER DO FUSO DE QUEM ABRE O BROWSER.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A ARMADILHA
// ═══════════════════════════════════════════════════════════════════════════════════
// `new Date("2026-07-01")` é meia-noite **UTC**. `getMonth()` é **local**. Em
// `America/Sao_Paulo` (UTC−3) isso é 30/06 às 21:00, e o mês devolvido é JUNHO.
//
// Consequência, se alguma vez chegasse uma string de calendário a `monthKeyOf`: o
// primeiro dia de cada mês atribuído ao mês anterior — uma venda de 1 de julho contada
// como receita de junho.
//
// O que torna isto especialmente mau é onde NÃO aparece. Em Lisboa (UTC+0/+1) o desvio é
// positivo e o resultado sai certo, sempre. Os testes passariam na máquina de quem
// programa e o defeito só existiria no browser do cliente brasileiro — que é onde o
// produto corre.
//
// ─── PORQUE ESTE FICHEIRO NÃO MUDA O FUSO DO PROCESSO ──────────────────────────────
// Mudar `TZ` a meio de um processo Node não afeta um `Intl`/`Date` já inicializado de
// forma fiável, e um teste que dependesse disso seria instável por construção.
//
// A afirmação exercida é mais forte e não precisa de fuso nenhum: a chave do mês de uma
// data de calendário tem de sair dos COMPONENTES da string, sem nunca passar por um
// instante. Uma implementação que respeite isso é correta em todos os fusos, e é isso
// que se prova — comparando com os componentes, e não com o relógio.

import { describe, it, expect } from "vitest";
import { monthKeyOf } from "./dreEngine.js";
import { monthKey } from "./financialCalculations.js";

describe("uma data de calendário produz o mês que está escrito nela", () => {
  it.each([
    ["2026-01-01", "2026-01"],
    ["2026-07-01", "2026-07"],   // o caso que falhava em UTC−3
    ["2026-07-31", "2026-07"],
    ["2026-12-01", "2026-12"],   // e este cairia em 2026-11
    ["2027-01-01", "2027-01"],   // mudança de ANO: cairia em 2026-12
    ["2024-02-29", "2024-02"],   // bissexto
    ["2026-03-01", "2026-03"],
  ])("%s -> %s, seja qual for o fuso de quem executa", (entrada, esperado) => {
    expect(monthKeyOf(entrada)).toBe(esperado);
  });

  it("o PRIMEIRO dia de cada mês de 2026 fica no seu próprio mês", () => {
    /* O primeiro dia é o único que o defeito atinge, e atinge-o em todos os meses. */
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      expect(monthKeyOf(`2026-${mm}-01`), `2026-${mm}-01 escorregou para o mês anterior`).toBe(`2026-${mm}`);
    }
  });

  it("`monthKeyOf` e `monthKey` concordam — não há duas regras", () => {
    /* Havia duas cópias da mesma regra de fronteira no mesmo grafo de imports, e a que
     * divergia era a mais frouxa. É o padrão que já obrigou a criar `lib/cors.js` e
     * `lib/contratoUpstream.js` no BFF. */
    for (const v of ["2026-07-01", "2026-12-31", "2024-02-29", "2026-01-01", null, undefined, "", "lixo"]) {
      expect(monthKeyOf(v), `divergiram em ${JSON.stringify(v)}`).toBe(monthKey(v));
    }
  });
});

describe("um objeto Date continua a ser lido como um INSTANTE", () => {
  it("um Date local devolve o mês local — nada mudou para os chamadores atuais", () => {
    /* Os três chamadores de `monthKeyOf` passam sempre um `Date` (o `referenceDate`, que
     * é `new Date()`). Este teste é o contrapeso: a correção da string não podia mudar
     * uma vírgula do que já funcionava. */
    const d = new Date(2026, 6, 15, 10, 30);   // 15 de julho, local
    expect(monthKeyOf(d)).toBe("2026-07");
  });

  it("um Date no primeiro instante local de um mês fica nesse mês", () => {
    const d = new Date(2026, 6, 1, 0, 0, 0);
    expect(monthKeyOf(d)).toBe("2026-07");
  });

  it("um Date no ÚLTIMO instante local de um mês fica nesse mês", () => {
    const d = new Date(2026, 6, 31, 23, 59, 59);
    expect(monthKeyOf(d)).toBe("2026-07");
  });
});

describe("o que não é uma data não vira uma chave de mês", () => {
  it.each([null, undefined, "", 0, false, NaN, "lixo", {}, []])(
    "%o devolve null",
    (v) => { expect(monthKeyOf(v)).toBeNull(); }
  );

  it("um Date inválido devolve null, e não `NaN-NaN`", () => {
    expect(monthKeyOf(new Date("nada disto"))).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A ARESTA QUE FICA — E QUE FICA DECLARADA
 * ═══════════════════════════════════════════════════════════════════════════════════
 * `parseLocalISODate` só trata pelos COMPONENTES o que corresponde exatamente a
 * `AAAA-MM-DD`. Tudo o resto cai num `new Date(valor)`, que é UTC para formas ISO — e
 * isso é CORRETO para um instante (`2026-07-01T00:00:00Z` é mesmo 30/06 21:00 em São
 * Paulo, e é o que o próprio ficheiro documenta), mas é ERRADO para `AAAA-MM`, que é
 * uma forma de calendário e não um instante.
 *
 * Não foi corrigido nesta ronda por uma razão explícita: `parseLocalISODate` é o ponto
 * único de conversão de datas de todo o motor financeiro, e não há nenhum chamador
 * demonstrado que lhe passe `AAAA-MM`. Alargá-la sem esse chamador seria mudar a
 * fundação para um problema que ninguém tem — e a fundação é o sítio onde um erro
 * produz números errados em vez de um ecrã avariado.
 *
 * O que se faz em vez disso é o que este projeto faz sempre com o que não corrige: pôr
 * a aresta por escrito, com um teste que FALHA no dia em que o comportamento mudar — nas
 * duas direções. Quem lhe passar uma chave de mês encontra este ficheiro.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
describe("aresta declarada: `AAAA-MM` não é tratada como calendário", () => {
  it("uma chave de mês passada como data recua um mês em fusos negativos", () => {
    /* Este teste é sensível ao fuso de propósito, e é a única coisa neste ficheiro que
     * é. Corre em `America/Sao_Paulo` — o fuso da Overcel, e o desta máquina. */
    const offsetNegativo = new Date(2026, 6, 1).getTimezoneOffset() > 0;
    const resultado = monthKeyOf("2026-07");
    if (offsetNegativo) {
      expect(resultado, "a aresta foi corrigida — atualizar este teste e o registo de riscos").toBe("2026-06");
    } else {
      expect(resultado).toBe("2026-07");
    }
  });

  it("um instante ISO completo continua a ser lido como instante", () => {
    /* Não é aresta: é o contrato. `2026-07-01T00:00:00Z` É 30/06 às 21:00 em São Paulo,
     * e um instante lê-se no fuso de quem o lê. */
    const esperado = new Date("2026-07-01T00:00:00Z");
    expect(monthKeyOf("2026-07-01T00:00:00Z"))
      .toBe(`${esperado.getFullYear()}-${String(esperado.getMonth() + 1).padStart(2, "0")}`);
  });
});
