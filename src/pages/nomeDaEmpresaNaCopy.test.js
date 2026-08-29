// O NOME DA EMPRESA NÃO PODE ESTAR ESCRITO À MÃO NA INTERFACE.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A JANELA QUE ESTE FICHEIRO FECHA
// ═══════════════════════════════════════════════════════════════════════════════════
// `formatacaoAtiva.test.js` já garante que nenhuma página IMPORTA `ACTIVE_COMPANY`. Essa
// guarda está certa e continua a valer — mas só cobre o caminho pelo qual o nome chega
// como VALOR. Não cobre o caminho pelo qual ele chega como TEXTO:
//
//     subtitle="Centralize faturas, recibos e contratos da Overcel — ..."
//
// A página não lê a configuração, não importa nada, e mesmo assim afirma o nome de uma
// empresa concreta. É a mesma forma do R-18: a guarda existia e estava correta, e o valor
// entrou por outra porta.
//
// ─── PORQUE ISTO É UM DEFEITO E NÃO UMA QUESTÃO DE ESTILO ──────────────────────────
// Com o transporte protegido ligado (E3) e a empresa B ativa, o dataset é de B, o guarda
// de escopo diz LIGADA e as páginas montam. Os NÚMEROS são de B — e o cabeçalho continua
// a dizer "Overcel". Em ecrãs como o FinerScore, cujo próprio subtítulo diz que a nota é
// "útil também para bancos e investidores", isso é uma afirmação falsa sobre uma pessoa
// coletiva identificada pelo nome.
//
// É o R-18 ao contrário: lá eram os dados de A sob o nome de B; aqui são os dados de B
// sob o nome de A.
//
// ─── A REGRA ───────────────────────────────────────────────────────────────────────
// Quem desenha pergunta à empresa ATIVA como ela se chama (`useCompany()`), como o
// `Resumo` já faz:  `company?.name ?? "sua empresa"`.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/** O nome da empresa compilada. Lido da configuração, e não escrito aqui à mão — senão
 *  este teste tinha exatamente o defeito que existe para apanhar. */
const { ACTIVE_COMPANY } = await import("../config/company.js");

function ficheiros(dir, acc = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) { ficheiros(caminho, acc); continue; }
    if (!/\.(js|jsx)$/.test(entrada.name) || /\.test\.jsx?$/.test(entrada.name)) continue;
    acc.push(caminho);
  }
  return acc;
}

/* Só interessa o que fica NO ECRÃ. Os comentários deste projeto falam da Overcel a toda a
 * hora — e devem: descrevem a história real de cada correção. Um teste que os contasse
 * seria ruído puro e seria desligado na primeira semana. */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // blocos
    .replace(/^\s*\/\/.*$/gm, " ");      // linhas inteiras de comentário
}

/* ─── AS EXCEÇÕES, E PORQUE CADA UMA É LEGÍTIMA ──────────────────────────────────────
 * `DemoBanner` é o banner do MODO DEMONSTRAÇÃO. O `mockData` é, por construção, a Overcel
 * fictícia, e o banner existe precisamente para o dizer em voz alta. Trocar ali o nome
 * pelo da empresa ativa faria o banner afirmar que os dados fictícios são da empresa
 * real — que é o oposto do que ele existe para comunicar. */
const EXCECOES = new Set(["components/ui/DemoBanner.jsx"]);

describe("o nome da empresa não está escrito à mão na interface", () => {
  it("nenhuma página, layout ou componente afirma o nome da empresa compilada", () => {
    const infratores = [];

    for (const dir of ["pages", "layouts", "components"]) {
      for (const f of ficheiros(join(SRC, dir))) {
        const rel = relative(SRC, f).replace(/\\/g, "/");
        if (EXCECOES.has(rel)) continue;

        const codigo = semComentarios(readFileSync(f, "utf8"));
        if (!codigo.includes(ACTIVE_COMPANY.name)) continue;

        /* A linha exata, para que a falha diga onde ir — e não só que existe. */
        const linhas = codigo.split("\n")
          .map((l, i) => [i + 1, l])
          .filter(([, l]) => l.includes(ACTIVE_COMPANY.name))
          .map(([n]) => n);
        infratores.push(`${rel}:${linhas.join(",")}`);
      }
    }

    expect(
      infratores,
      `a interface afirma "${ACTIVE_COMPANY.name}" por escrito. Com outra empresa ativa, ` +
      `estes ecrãs atribuem os números dela a uma empresa que não é a sua. ` +
      `Usar useCompany(): company?.name ?? "sua empresa" — como o Resumo já faz.\n  ` +
      infratores.join("\n  ")
    ).toEqual([]);
  });

  it("o `Resumo` continua a ser o exemplo — pergunta o nome à empresa ativa", () => {
    /* O contrapeso. Se alguém "resolvesse" o teste acima apagando os subtítulos em vez de
     * os ligar à empresa ativa, isto continuaria a apontar para a forma certa. */
    const fonte = readFileSync(join(SRC, "pages", "Resumo.jsx"), "utf8");
    expect(fonte).toMatch(/company\?\.name/);
  });
});
