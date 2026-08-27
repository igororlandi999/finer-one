// VEREDITO DO check:data.
//
// Este script é a ferramenta que responde "o pipeline está bom?" antes e depois de cada
// publicação. Se ele mentir, mente no momento em que alguém está a decidir se avança.
//
// O teste nasceu de uma mentira concreta, observada em 23/08/2026: `ajustes-manuais`
// devolveu HTTP 502, a listagem imprimiu `[FALHA] AJUSTES MANUAIS`, e três linhas abaixo
// apareceu `ESTADO TÉCNICO DO PIPELINE: SAUDÁVEL`. A causa era o filtro de erro correr
// sobre as coleções, que excluem ajustes-manuais de propósito (não tem `geradoEm` nem
// `parcial`) — exclusão certa para frescura e completude, errada para "respondeu?".

import { describe, it, expect } from "vitest";
import { calcularConsolidado } from "./check-data-pipeline.mjs";

/** Coleção saudável, com a forma que analisarColecao produz. */
const colecao = (chave, over = {}) => ({
  chave,
  rotulo: chave.toUpperCase(),
  estado: "fresh",
  geradoEm: "2026-08-23T04:00:00.000Z",
  idadeHoras: 2,
  parcial: false,
  ...over,
});

/** Documento de ajustes manuais, que não tem `parcial` nem `geradoEm` comparável. */
const ajustes = (over = {}) => ({
  chave: "ajustes-manuais",
  rotulo: "AJUSTES MANUAIS",
  estado: "fresh",
  ...over,
});

const tresColecoes = () => [colecao("pedidos"), colecao("despesas"), colecao("recebiveis")];

describe("o caso saudável", () => {
  it("três coleções frescas e completas + ajustes OK = SAUDÁVEL", () => {
    const { consolidado } = calcularConsolidado([...tresColecoes(), ajustes()]);
    expect(consolidado.estadoTecnico).toBe("saudavel");
    expect(consolidado.frescura).toBe("fresh");
    expect(consolidado.completude).toBe("complete");
    expect(consolidado.fontesComErro).toEqual([]);
  });
});

describe("REGRESSÃO — uma fonte em baixo nunca pode ler-se SAUDÁVEL", () => {
  it("ajustes-manuais em erro torna o pipeline INDISPONÍVEL", () => {
    // O bug exato: isto devolvia "saudavel".
    const { consolidado } = calcularConsolidado([
      ...tresColecoes(),
      ajustes({ estado: "erro", erro: "HTTP 502" }),
    ]);
    expect(consolidado.estadoTecnico).toBe("indisponivel");
    expect(consolidado.fontesComErro).toEqual(["AJUSTES MANUAIS"]);
  });

  it("qualquer coleção em erro também torna INDISPONÍVEL", () => {
    for (const alvo of ["pedidos", "despesas", "recebiveis"]) {
      const fontes = tresColecoes().map((c) => (c.chave === alvo ? { ...c, estado: "erro" } : c));
      const { consolidado } = calcularConsolidado([...fontes, ajustes()]);
      expect(consolidado.estadoTecnico, `${alvo} em erro`).toBe("indisponivel");
    }
  });

  it("erro tem precedência sobre tudo — nem fresco nem completo o salvam", () => {
    const { consolidado } = calcularConsolidado([
      ...tresColecoes(),
      ajustes({ estado: "erro" }),
    ]);
    expect(consolidado.frescura).toBe("fresh");
    expect(consolidado.completude).not.toBe("complete");
    expect(consolidado.estadoTecnico).toBe("indisponivel");
  });

  it("a fonte em erro aparece nomeada, para se saber qual é", () => {
    const { consolidado } = calcularConsolidado([
      colecao("pedidos"),
      colecao("despesas", { estado: "erro" }),
      colecao("recebiveis"),
      ajustes({ estado: "erro" }),
    ]);
    expect(consolidado.fontesComErro.sort()).toEqual(["AJUSTES MANUAIS", "DESPESAS"]);
  });
});

describe("as exclusões que CONTINUAM certas", () => {
  it("ajustes-manuais não entra no cálculo da fonte mais antiga", () => {
    /* Não tem `geradoEm` comparável com o das coleções. Se entrasse, dominava o
     * veredito de frescura com um dado que não é da mesma natureza. */
    const { conjunto } = calcularConsolidado([
      colecao("pedidos", { geradoEm: "2026-08-23T04:00:00.000Z" }),
      colecao("despesas", { geradoEm: "2026-08-23T05:00:00.000Z" }),
      colecao("recebiveis", { geradoEm: "2026-08-23T06:00:00.000Z" }),
      ajustes({ geradoEm: "2020-01-01T00:00:00.000Z" }),
    ]);
    expect(conjunto.recurso).toBe("PEDIDOS");
    expect(conjunto.iso).toBe("2026-08-23T04:00:00.000Z");
  });

  it("ajustes-manuais não conta para completude — não tem `parcial`", () => {
    const { consolidado } = calcularConsolidado([...tresColecoes(), ajustes()]);
    expect(consolidado.completude).toBe("complete");
    expect(consolidado.algumaSemVeredito).toBe(false);
  });
});

describe("os outros eixos continuam a funcionar", () => {
  it("uma coleção parcial torna a completude `partial` e o estado ATENÇÃO", () => {
    const fontes = tresColecoes();
    fontes[1].parcial = true;
    const { consolidado } = calcularConsolidado([...fontes, ajustes()]);
    expect(consolidado.completude).toBe("partial");
    expect(consolidado.estadoTecnico).toBe("atencao");
    expect(consolidado.fontesParciais).toEqual(["DESPESAS"]);
  });

  it("um snapshot velho torna o estado ATENÇÃO, mesmo completo", () => {
    const fontes = tresColecoes();
    fontes[0].estado = "stale";
    const { consolidado } = calcularConsolidado([...fontes, ajustes()]);
    expect(consolidado.frescura).toBe("stale");
    expect(consolidado.estadoTecnico).toBe("atencao");
  });

  it("`parcial` indefinido é falta de veredito, não completude", () => {
    // Afirmar COMPLETO exige que todas as fontes se pronunciem.
    const fontes = tresColecoes();
    delete fontes[2].parcial;
    const { consolidado } = calcularConsolidado([...fontes, ajustes()]);
    expect(consolidado.completude).toBe("unknown");
    expect(consolidado.algumaSemVeredito).toBe(true);
    expect(consolidado.estadoTecnico).toBe("atencao");
  });

  it("lista vazia não rebenta e não afirma saúde", () => {
    const { consolidado } = calcularConsolidado([]);
    expect(consolidado.estadoTecnico).not.toBe("saudavel");
  });
});

describe("importar o script não dispara a verificação", () => {
  it("o import deste teste já é a prova — chegou aqui sem rede nem process.exit", () => {
    // Sem a guarda `invocadoDiretamente`, o import no topo do ficheiro teria corrido
    // principal(), feito 4 pedidos HTTP e terminado o processo antes deste teste.
    expect(typeof calcularConsolidado).toBe("function");
  });
});
