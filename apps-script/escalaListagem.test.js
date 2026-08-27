// ESCALA — o teto do rebuild de recebíveis, medido em vez de descoberto.
//
// ─── O FACTO ────────────────────────────────────────────────────────────────────────
// `/contas/receber` é listado INTEGRALMENTE: não há filtro de data confirmado para este
// endpoint, e a listagem recomeça na página 1 em cada execução — não existe cursor de
// continuação. Medido em 2026-08-23: 14 páginas em ~27 s (~1,9 s/página), contra um
// `REBUILD_TIME_BUDGET_MS` de 300 s.
//
// A ~5–6× o volume atual a listagem sozinha esgota o orçamento. O que acontece então
// não é um erro visível: a hidratação parte imediatamente em `parcial`, o snapshot sai
// com nomes por resolver, e a execução seguinte recomeça na página 1 outra vez. O
// rebuild deixa de convergir **em silêncio**.
//
// ─── O QUE ESTES TESTES TRAVAM ──────────────────────────────────────────────────────
// Que o custo da listagem seja MEDIDO e viaje na meta, ao lado do orçamento em que tem
// de caber. Não travam nenhum limiar, porque não há nenhum: corrigir o teto exige um
// cursor de continuação — mudar esta fonte de "substitui" para "consolida", com
// consequências próprias sobre títulos apagados no ERP. É decisão de arquitetura, e
// está por tomar.
//
// O FRONT não tem este problema: 10× dados → ×10,7 tempo (linear) e a profundidade do
// histórico é gratuita (60 meses custam o mesmo que 19). Medido em
// `diagnostico/_perfEscala.mjs`, re-medido em 2026-08-25.
//
// Este ficheiro testa a fonte LOCAL e não publica nada.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const recebiveis = readFileSync(join(raiz, "RecebiveisBackend.js"), "utf8");

describe("o custo da listagem de recebíveis é medido e publicado na meta", () => {
  it("mede o tempo da fase de listagem, isolado da hidratação", () => {
    /* Isolado importa: o tempo total do rebuild já era registado, e nele a listagem é
     * indistinguível da hidratação. É exatamente a listagem que não converge, porque é
     * a única fase que recomeça do zero em cada execução. */
    expect(recebiveis).toContain("var listagemMs = Date.now() - inicio;");
    const posFetch = recebiveis.indexOf("fetchContasReceberLista_({ sondarFim: true })");
    const posMedida = recebiveis.indexOf("var listagemMs =");
    expect(posFetch).toBeGreaterThan(-1);
    expect(posMedida).toBeGreaterThan(posFetch);
  });

  it("a meta leva o custo E o orçamento — dois números, para a razão ser calculável", () => {
    /* Só o tempo não diz nada: 27 s é confortável num orçamento de 300 s e é fatal num
     * de 30. Publicar os dois evita que quem leia tenha de saber a constante de cor. */
    expect(recebiveis).toContain("listagemMs: listagemMs,");
    expect(recebiveis).toContain("orcamentoMs: REBUILD_TIME_BUDGET_MS,");
  });

  it("o log nomeia páginas, tempo e orçamento na mesma linha", () => {
    expect(recebiveis).toMatch(/paginas: ' \+ lista\.paginasLidas/);
    expect(recebiveis).toContain("de um orcamento de ");
  });

  /* A fronteira que este ficheiro existe para manter: medir não é decidir. */
  it("não aborta nem degrada por lentidão — não há limiar de tempo na listagem", () => {
    const inicio = recebiveis.indexOf("function fetchContasReceberLista_");
    const corpo = recebiveis.slice(inicio, recebiveis.indexOf("\n}", inicio) + 2);
    // O paginador não conhece o relógio: sem orçamento, sem `Date.now`, sem abortos.
    expect(corpo).not.toContain("Date.now");
    expect(corpo).not.toContain("REBUILD_TIME_BUDGET_MS");
  });
});
