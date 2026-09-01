// vite.base.mjs
// O `base` do Vite, resolvido num sítio só.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ISTO É UM MÓDULO E NÃO UMA LINHA DENTRO DO `vite.config.js`
// ═══════════════════════════════════════════════════════════════════════════════════
// Porque há DOIS consumidores, e eles têm de concordar:
//
//   vite.config.js              decide onde os assets são escritos
//   scripts/predeploy-check.mjs bloqueia a publicação se o `index.html` não bater certo
//
// A verificação de pré-deploy tinha `/finer-one/` escrito à mão. Enquanto o `base` também
// era fixo, isso era duplicação inofensiva. No dia em que o `base` passa a depender do
// ambiente, passa a ser uma armadilha: mudar um e esquecer o outro dá ou uma publicação
// bloqueada sem razão, ou — pior — uma verificação que aprova um artefacto partido.
//
// Uma função, dois importadores, zero hipótese de divergirem.
//
// ─── PORQUE O DEFAULT É `/finer-one/` E NÃO `/` ─────────────────────────────────────
// Porque o default é o que está EM PRODUÇÃO. O GitHub Pages serve em
// `https://igororlandi999.github.io/finer-one/`, e um `base` de `/` ali faz os assets
// darem 404 e a página abrir em branco.
//
// Quem quiser outra coisa di-lo por `VITE_BASE`. É o Vercel que o dirá — serve na raiz,
// portanto `VITE_BASE=/`. Esta ordem — o comportamento publicado é o default, o novo é
// que se declara — é o que torna o patch inerte para o GitHub Pages: sem a variável,
// não muda absolutamente nada.

// ─── UMA ARMADILHA, DITA ANTES DE ALGUÉM LHE CAIR ──────────────────────────────────
// `VITE_BASE` tem de ser uma variável de ambiente A SÉRIO — `process.env`. **Pô-la no
// `.env.local` NÃO funciona.** O Vite carrega os ficheiros `.env` para `import.meta.env`,
// que é o ambiente do BUNDLE; não escreve em `process.env`, que é o ambiente do PROCESSO
// de build. E o `base` é decidido pelo processo de build, antes de existir bundle nenhum.
//
// Na prática:
//     Vercel      Environment Variables -> chega como process.env. Funciona.
//     local       VITE_BASE=/ npm run build                        Funciona.
//     .env.local  VITE_BASE=/                                      NÃO faz nada.
//
// (E em Git Bash no Windows, `VITE_BASE=/` é convertido para um caminho Windows pelo
// MSYS. Usar `MSYS_NO_PATHCONV=1 VITE_BASE=/ npm run build`. Apanhado a testar isto.)

/** O que o GitHub Pages precisa. É o comportamento em produção hoje. */
export const BASE_GITHUB_PAGES = "/finer-one/";

/**
 * Resolve o `base` a partir do ambiente.
 *
 * @param {Record<string, string|undefined>} [env]  Tipicamente `process.env`.
 * @returns {string} Sempre começado e terminado em `/`.
 */
export function resolveBase(env = process.env) {
  const bruto = env && typeof env.VITE_BASE === "string" ? env.VITE_BASE.trim() : "";
  if (bruto === "") return BASE_GITHUB_PAGES;

  /* Normaliza para a forma que o Vite espera: barra no início e no fim. Sem isto,
   * `VITE_BASE=app` produzia `app/assets/...` — um caminho RELATIVO, que funciona na raiz
   * e parte em qualquer subpágina. É o tipo de erro que só aparece na segunda rota. */
  let base = bruto.startsWith("/") ? bruto : `/${bruto}`;
  if (!base.endsWith("/")) base += "/";
  return base;
}

/**
 * O prefixo que os assets terão no `index.html` construído com este `base`.
 * É o que a verificação de pré-deploy procura.
 */
export function prefixoDosAssets(env = process.env) {
  return `${resolveBase(env)}assets/`;
}
