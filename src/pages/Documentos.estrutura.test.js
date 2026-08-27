// Documentos — o custo de desenhar o catálogo inteiro (FASE 14).
//
// ─── MEDIDO NO BROWSER, com os dados reais da conta ─────────────────────────────────
// A tabela desenhava `rows` na íntegra: 2 316 linhas, ~62 800 nós no DOM e ~730 ms até
// a tabela existir, a cada entrada na página. Depois do limite: 100 linhas, ~2 940 nós,
// ~42 ms.
//
// Não é uma otimização prematura. O catálogo documental cresce com cada pedido e cada
// título — é derivado deles — pelo que a contagem só sobe. A 10× o volume atual seriam
// ~627 000 nós, e a página deixaria simplesmente de abrir. A medição de escala do
// projeto (`diagnostico/_perfEscala.mjs`) cobre `buildSalesDataset`, isto é, a camada de
// DADOS, e continua linear; o que ela nunca mediu foi o custo de DESENHAR o resultado.
//
// ─── O QUE O LIMITE NÃO PODE FAZER ──────────────────────────────────────────────────
// Não pode esconder a existência das linhas. A pesquisa e as tabs continuam a filtrar
// sobre a lista toda, a contagem ao lado da pesquisa é a real, e o rodapé diz quantas
// estão a ser mostradas de quantas — com a forma de ver mais.
//
// Análise sobre a fonte: o projeto não tem ambiente DOM no vitest (ver a nota em
// AjustesManuais.estrutura.test.js).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const bruto = readFileSync(join(raiz, "Documentos.jsx"), "utf8");
const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Documentos — a tabela não desenha o catálogo inteiro", () => {
  it("desenha uma fatia, não `rows`", () => {
    expect(fonte).toContain("linhasVisiveis.map((d) => {");
    expect(fonte).not.toMatch(/\brows\.map\(\(d\) => \{/);
    expect(fonte).toContain("rows.slice(0, limite)");
  });

  it("o limite recomeça quando o filtro ou a pesquisa mudam", () => {
    /* Sem isto, filtrar depois de "mostrar mais" herdava um limite que já não
     * corresponde ao conjunto que se está a ver. */
    expect(fonte).toMatch(/useEffect\(\(\) => \{ setLimite\(PASSO_LINHAS\); \}, \[tab, search, isReal\]\)/);
  });
});

describe("Documentos — o limite é de desenho, nunca de dados", () => {
  it("a contagem ao lado da pesquisa continua a ser a do conjunto filtrado inteiro", () => {
    expect(fonte).toMatch(/\{rows\.length\} documento/);
  });

  it("o rodapé declara quantas se mostram de quantas, e dá a saída", () => {
    expect(fonte).toContain("A mostrar {linhasVisiveis.length} de {rows.length} documentos.");
    expect(fonte).toContain("Mostrar mais {Math.min(PASSO_LINHAS, porMostrar)}");
  });

  it("filtrar e pesquisar continuam a correr sobre a lista toda", () => {
    // O filtro é aplicado ao construir `rows`; a fatia vem depois, e só depois.
    const posFiltro = fonte.indexOf("filterDocuments(view.list");
    const posFatia = fonte.indexOf("rows.slice(0, limite)");
    expect(posFiltro).toBeGreaterThan(-1);
    expect(posFatia).toBeGreaterThan(posFiltro);
  });
});
