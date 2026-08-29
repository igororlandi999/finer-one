// UM ECRÃ QUE O UTILIZADOR ALCANÇA E QUE MOSTRA `mockData` TEM DE O DIZER.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A PERGUNTA QUE ESTE FICHEIRO RESPONDE
// ═══════════════════════════════════════════════════════════════════════════════════
// "Existe algum caminho em que o utilizador possa interpretar dado fictício como dado
// real?" — e a resposta era SIM, em três ecrãs do plano por omissão.
//
// `Indicadores`, `Planeamento e Cashflow` e `Benchmarking do Setor` não consumiam o
// dataset de todo: nem sequer importavam `useFinerData`. Cada número neles é `mockData`.
//
// Enquanto não havia fonte real em lado nenhum, isso era inofensivo: a aplicação inteira
// era uma demonstração e o `DemoBanner` global dizia-o em voz alta. Mas o `DemoBanner` só
// aparece FORA do modo API. Com dados reais ligados ele desaparece — e estes três ecrãs
// ficam indistinguíveis do Resumo e da Performance, que mostram números verdadeiros.
//
// O caso mais grave é o `Planeamento e Cashflow`: um saldo previsto a 90 dias e um "risco
// de liquidez" são exatamente o tipo de número sobre o qual se decide adiar um pagamento
// ou pedir crédito.
//
// ─── A REGRA ───────────────────────────────────────────────────────────────────────
// Uma página alcançável a partir da barra lateral (ou seja, listada em `screens` de algum
// plano) que importe `mockData` tem de conseguir distinguir os dois mundos: importa
// `useFinerData` (para saber se a fonte é real) E `DemoTag` (para o dizer).
//
// Isto NÃO prova que o selo aparece no sítio certo — prova que a página tem como saber e
// como dizer. É uma fronteira, não um teste de render: apanha a página nova que nasce a
// ler `mockData` e a esquecer-se do selo, que é como estas três chegaram aqui.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

const { PLANS, SCREENS } = await import("../config/planConfig.js");

/* O ecrã -> o ficheiro da página. O `App.jsx` é quem faz esta ligação de verdade; aqui
 * lê-se de lá, para que uma página renomeada não faça este teste passar em silêncio. */
const APP = readFileSync(join(SRC, "App.jsx"), "utf8");

/** Todos os ecrãs que ALGUM plano oferece na barra lateral. */
function ecransAlcancaveis() {
  const ids = new Set();
  for (const plano of Object.values(PLANS)) {
    for (const id of plano.screens || []) ids.add(id);
  }
  return [...ids];
}

/* O `App.jsx` mapeia `[SCREENS.CHAVE]: Componente,` e importa cada componente de
 * `./pages/Ficheiro`. Lê-se de lá — e não de uma tabela escrita aqui — para que renomear
 * uma página não deixe este teste a examinar ficheiros que já não existem, em silêncio. */
const CHAVE_PARA_COMPONENTE = new Map(
  [...APP.matchAll(/\[SCREENS\.([A-Z0-9_]+)\]\s*:\s*([A-Za-z0-9_]+)\s*,/g)]
    .map((m) => [m[1], m[2]])
);
const COMPONENTE_PARA_FICHEIRO = new Map(
  [...APP.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+"\.\/pages\/([A-Za-z0-9_]+)"/g)]
    .map((m) => [m[1], m[2]])
);
/** `SCREENS.CHAVE` cujo VALOR é este id de ecrã. */
const ID_PARA_CHAVE = new Map(Object.entries(SCREENS).map(([chave, id]) => [id, chave]));

/* Só conta o que o ficheiro FAZ, não o que ele explica sobre si próprio. Sem isto, uma
 * página que perdesse o selo continuaria a passar por ter a palavra `DemoBanner` num
 * comentário — foi exatamente assim que a primeira versão deste teste sobreviveu a uma
 * mutação que lhe removeu o selo. */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/** O ficheiro da página que o `App.jsx` monta para este ecrã. */
function ficheiroDoEcra(screenId) {
  const chave = ID_PARA_CHAVE.get(screenId);
  const componente = chave && CHAVE_PARA_COMPONENTE.get(chave);
  const ficheiro = componente && COMPONENTE_PARA_FICHEIRO.get(componente);
  return ficheiro ? join(SRC, "pages", `${ficheiro}.jsx`) : null;
}

/* ─── A EXCEÇÃO, E O QUE A SUSTENTA ─────────────────────────────────────────────────
 * `Receitas` importa `mockData` e não tem selo — e está certo, porque o seu recurso ao
 * mock é INALCANÇÁVEL com fonte real:
 *
 *     const revenueMetrics = sales?.receitas?.metrics ?? mockRevenueMetrics;
 *
 * `buildSalesDataset` faz `receitas: buildReceitas(orders)` SEM condição, ao contrário de
 * `despesas`, `fornecedores` e `recebiveis`, que são `hasX ? build(...) : null`. Havendo
 * dataset, `sales.receitas` existe sempre, e o `??` nunca cai para o mock.
 *
 * A exceção não é uma opinião: o teste a seguir verifica a linha que a sustenta. No dia
 * em que `receitas` passar a ser condicional, a exceção deixa de valer e o teste diz-o.
 * ───────────────────────────────────────────────────────────────────────────────────── */
const EXCECOES = new Map([
  ["receitas", "buildReceitas é incondicional em buildSalesDataset — ver o teste abaixo"],
]);

describe("mock alcançável tem de estar identificado", () => {
  it("toda a página de um plano que importa mockData sabe distinguir real de demonstração", () => {
    const infratores = [];

    for (const screenId of ecransAlcancaveis()) {
      const caminho = ficheiroDoEcra(screenId);
      if (!caminho) continue;                       // ecrã sem página própria (Placeholder)

      let fonte;
      try { fonte = semComentarios(readFileSync(caminho, "utf8")); } catch { continue; }

      const usaMock = /from\s+"\.\.\/data\/mockData"/.test(fonte);
      if (!usaMock) continue;
      if (EXCECOES.has(screenId)) continue;

      const sabeAFonte = /useFinerData/.test(fonte);
      /* Tem de USAR o selo, não bastar importá-lo. Um `import DemoTag` órfão não põe nada
       * no ecrã, e este projeto não corre linter que apanhe importações por usar — a
       * primeira versão deste teste dava-se por satisfeita com o import e sobreviveu à
       * mutação que removeu o `<DemoTag />` do título. */
      const sabeDizer = /<\s*DemoTag\b|<\s*DemoBanner\b|\bdemo=\{/.test(fonte);

      if (!sabeAFonte || !sabeDizer) {
        const falta = [!sabeAFonte && "useFinerData", !sabeDizer && "DemoTag"].filter(Boolean);
        infratores.push(`${screenId} (${caminho.split(/[\\/]/).pop()}) — falta: ${falta.join(" e ")}`);
      }
    }

    expect(
      infratores,
      "estas páginas são alcançáveis pela barra lateral, mostram números de `mockData` e " +
      "não têm como dizer que são demonstrativos. Com dados reais ligados o `DemoBanner` " +
      "global desaparece e ficam indistinguíveis das páginas verdadeiras:\n  " +
      infratores.join("\n  ")
    ).toEqual([]);
  });

  it("a exceção das Receitas continua sustentada: `receitas` é incondicional no dataset", () => {
    /* Se isto falhar, a exceção acima caducou: `sales.receitas` passou a poder ser nulo
     * com fonte real, e a página passa a poder mostrar `mockRevenueMetrics` sem selo. */
    const servico = readFileSync(join(SRC, "services", "blingDataService.js"), "utf8");
    expect(
      servico,
      "`receitas` deixou de ser construído incondicionalmente — a exceção das Receitas " +
      "em EXCECOES já não é válida e a página precisa de selo."
    ).toMatch(/receitas:\s*buildReceitas\(orders\),/);
    /* O contraste que torna a afirmação acima significativa: os outros lados SÃO
     * condicionais, e é por isso que as suas páginas têm selo. */
    expect(servico).toMatch(/recebiveis:\s*hasReceivables\s*\?/);
  });

  it("o teste está mesmo a olhar para páginas — senão passaria por não encontrar nada", () => {
    /* O controlo positivo. Se a resolução ecrã -> ficheiro se partir (um `App.jsx`
     * reescrito, um import renomeado), o teste acima ficaria verde por não ter nada que
     * examinar — a pior forma de um teste de fronteira falhar. */
    const resolvidos = ecransAlcancaveis().map(ficheiroDoEcra).filter(Boolean);
    expect(resolvidos.length, "nenhum ecrã foi resolvido para um ficheiro de página").toBeGreaterThan(8);

    const comMock = resolvidos.filter((c) => {
      try { return /from\s+"\.\.\/data\/mockData"/.test(readFileSync(c, "utf8")); }
      catch { return false; }
    });
    expect(comMock.length, "nenhuma página alcançável importa mockData — improvável").toBeGreaterThan(3);
  });
});
