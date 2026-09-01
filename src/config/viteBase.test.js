// O `base` DO VITE — a única coisa do repositório que depende de onde o site é servido.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// DE ONDE VEM ESTE FICHEIRO (R-32)
// ═══════════════════════════════════════════════════════════════════════════════════
// O `base` era `/finer-one/`, fixo. Enquanto o site vivesse só no GitHub Pages isso
// bastava; deixa de bastar quando a aplicação passa a ter origem própria — uma origem
// própria serve na RAIZ, e aí o `base` tem de ser `/`.
//
// O risco de mexer nisto não é o Vercel ficar errado: é o **GitHub Pages** ficar errado
// sem ninguém dar por isso. Um `base` de `/` publicado no subcaminho faz TODOS os assets
// darem 404 — a página abre em branco, sem erro visível na aplicação, porque a aplicação
// nem chega a arrancar.
//
// Por isso a afirmação central deste ficheiro é a mais aborrecida das duas:
// **sem `VITE_BASE`, nada muda.**
//
// ─── E PORQUE HÁ UM MÓDULO EM VEZ DE UMA LINHA ─────────────────────────────────────
// Porque há dois consumidores que TÊM de concordar: o `vite.config.js`, que decide onde
// os assets são escritos, e o `scripts/predeploy-check.mjs`, que bloqueia a publicação se
// o `index.html` não bater certo. Esse segundo tinha `/finer-one/` escrito à mão. Com o
// `base` fixo era duplicação inofensiva; com o `base` dependente do ambiente passaria a
// ser uma verificação capaz de **aprovar um artefacto partido**, que é o pior estado
// possível para uma verificação de pré-deploy.

import { describe, it, expect } from "vitest";
import { resolveBase, prefixoDosAssets, BASE_GITHUB_PAGES } from "../../vite.base.mjs";

describe("resolveBase — sem VITE_BASE, o comportamento publicado não muda", () => {
  /* Estes são os casos que protegem o GitHub Pages. Se algum deles ficar vermelho, uma
   * publicação para `gh-pages` passa a servir uma página em branco. */
  const ausentes = [
    ["variável ausente", {}],
    ["string vazia", { VITE_BASE: "" }],
    ["só espaços", { VITE_BASE: "   " }],
    ["undefined explícito", { VITE_BASE: undefined }],
    ["não é string — número", { VITE_BASE: 0 }],
    ["não é string — null", { VITE_BASE: null }],
    ["ambiente inteiro ausente", undefined],
  ];

  for (const [rotulo, env] of ausentes) {
    it(`${rotulo} -> /finer-one/`, () => {
      expect(resolveBase(env ?? {})).toBe("/finer-one/");
    });
  }

  it("a constante e o default são a mesma coisa — não podem divergir", () => {
    expect(BASE_GITHUB_PAGES).toBe("/finer-one/");
    expect(resolveBase({})).toBe(BASE_GITHUB_PAGES);
  });
});

describe("resolveBase — quem serve na raiz declara-o", () => {
  it("VITE_BASE=/ -> / (é o caso do Vercel e do domínio próprio)", () => {
    expect(resolveBase({ VITE_BASE: "/" })).toBe("/");
  });

  it("espaços à volta são aparados", () => {
    expect(resolveBase({ VITE_BASE: "  /  " })).toBe("/");
  });

  it("um subcaminho qualquer continua a funcionar", () => {
    expect(resolveBase({ VITE_BASE: "/app/" })).toBe("/app/");
  });
});

describe("resolveBase — normalização, para não haver caminhos RELATIVOS", () => {
  /* Um `base` sem barra inicial produz `app/assets/...`, que é relativo: resolve bem na
   * raiz e parte em qualquer subpágina. É o erro que só aparece na segunda rota, e por
   * isso o mais caro de diagnosticar. */
  const normalizacoes = [
    ["sem barra inicial", "app", "/app/"],
    ["sem barra final", "/app", "/app/"],
    ["sem nenhuma das duas", "app", "/app/"],
    ["já normalizado", "/app/", "/app/"],
    ["subcaminho com dois níveis", "a/b", "/a/b/"],
  ];

  for (const [rotulo, entrada, esperado] of normalizacoes) {
    it(`${rotulo}: "${entrada}" -> "${esperado}"`, () => {
      expect(resolveBase({ VITE_BASE: entrada })).toBe(esperado);
    });
  }

  it("o resultado começa e acaba SEMPRE em barra", () => {
    for (const v of ["/", "app", "/app", "app/", "/a/b", "  /x  "]) {
      const r = resolveBase({ VITE_BASE: v });
      expect(r.startsWith("/"), `"${v}" -> "${r}"`).toBe(true);
      expect(r.endsWith("/"), `"${v}" -> "${r}"`).toBe(true);
    }
  });
});

describe("prefixoDosAssets — é isto que a verificação de pré-deploy procura", () => {
  it("GitHub Pages (default) -> /finer-one/assets/", () => {
    expect(prefixoDosAssets({})).toBe("/finer-one/assets/");
  });

  it("raiz -> /assets/", () => {
    expect(prefixoDosAssets({ VITE_BASE: "/" })).toBe("/assets/");
  });

  it("nunca produz barra dupla", () => {
    for (const v of ["/", "/app/", "app", ""]) {
      expect(prefixoDosAssets({ VITE_BASE: v })).not.toMatch(/\/\//);
    }
  });

  /* A razão de ser do módulo: os dois consumidores derivam do MESMO sítio. Se alguém
   * voltar a escrever o prefixo à mão em qualquer um deles, esta relação parte-se. */
  it("o prefixo é o `base` mais `assets/` — e nada mais", () => {
    for (const v of [undefined, "/", "/app/", "sub"]) {
      const env = v === undefined ? {} : { VITE_BASE: v };
      expect(prefixoDosAssets(env)).toBe(`${resolveBase(env)}assets/`);
    }
  });
});
