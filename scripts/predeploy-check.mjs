#!/usr/bin/env node
// scripts/predeploy-check.mjs
// AS PERGUNTAS QUE SE FAZEM ANTES DE PUBLICAR O FRONTEND — e nenhuma delas publica.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE FICHEIRO EXISTE, E PORQUE NÃO É UMA CÓPIA DO DO BFF
// ═══════════════════════════════════════════════════════════════════════════════════
// O irmão em `finer-one-proxy` protege contra publicar do repositório errado. Aqui o
// perigo é outro e é específico deste projeto: **tudo o que começa por `VITE_` é
// substituído LITERALMENTE no bundle**, e o bundle é servido pelo GitHub Pages a partir
// de um repositório PÚBLICO. Uma variável mal posta não é uma configuração errada — é
// uma publicação.
//
// E há um segundo perigo, mais silencioso: `VITE_PROTECTED_DATA_TRANSPORT` decide se as
// leituras financeiras são autenticadas. Ligá-lo por acidente — ou deixá-lo ligado de um
// teste local — publica uma aplicação que não consegue ler nada, ou que lê por um caminho
// que ainda não existe em produção. Por isso o valor dos interruptores é IMPRESSO, sempre,
// mesmo quando está tudo bem: o objetivo não é aprovar, é obrigar a olhar.
//
// ─── O QUE ESTE SCRIPT NUNCA FAZ ────────────────────────────────────────────────────
// Não publica. Não faz deploy. Não fala com o GitHub, com o Vercel ou com o Supabase.
// Não imprime o VALOR de nenhuma variável — só se está definida e o seu comprimento.
//
// Uso:  npm run check:predeploy
// Saída: 0 se tudo passou, 1 se alguma verificação BLOQUEIA.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
/* A MESMA fonte que o `vite.config.js` usa para o `base`. Ver o comentário na verificação
 * do caminho dos assets, mais abaixo. */
import { prefixoDosAssets } from "../vite.base.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** O repositório a que este código pertence. */
const REPO_ESPERADO = "finer-one";
/** O repositório do BFF. Publicar o frontend a partir dele seria o engano simétrico. */
const REPO_PROIBIDO = "finer-one-bff";

const resultados = [];
function registar(nivel, nome, detalhe) { resultados.push({ nivel, nome, detalhe }); }
const ok = (n, d) => registar("ok", n, d);
const aviso = (n, d) => registar("aviso", n, d);
const bloqueio = (n, d) => registar("bloqueio", n, d);

function git(...args) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 1. O REPOSITÓRIO É O CERTO?
 * ═══════════════════════════════════════════════════════════════════════════════════ */
try {
  const origem = git("remote", "get-url", "origin");
  /* Sem esquema e sem credenciais: um remoto `https://`, um `git@` e um com token no URL
   * apontam para o mesmo sítio, e é o sítio que importa. O URL NÃO é impresso. */
  const nome = origem.replace(/\.git$/, "").split(/[/:]/).slice(-2).join("/");

  if (nome.includes(REPO_PROIBIDO)) {
    bloqueio("repositório", `o remoto aponta para "${nome}" — é o repositório do BFF.`);
  } else if (!nome.endsWith(`/${REPO_ESPERADO}`)) {
    bloqueio("repositório", `o remoto aponta para "${nome}", e esperava-se ".../${REPO_ESPERADO}".`);
  } else {
    ok("repositório", nome);
  }
} catch {
  bloqueio("repositório", "não foi possível ler o remoto `origin`.");
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 2. O `.mcp.json` NÃO ESTÁ PREPARADO PARA COMMIT
 * ═══════════════════════════════════════════════════════════════════════════════════
 * É configuração de MÁQUINA, não do produto: aponta para um servidor MCP local e muda
 * conforme quem está a trabalhar. Já está versionado (veio de `4e8b309`) e não se apaga
 * agora — apagá-lo partiria o ambiente de quem clonar. O que se impede é o passo
 * seguinte: que uma alteração LOCAL dele entre num commit por causa de um `git add -A`
 * distraído, e depois no bundle de outra pessoa.
 *
 * Bloqueia só se estiver EM STAGE. Modificado na árvore é o estado normal. */
try {
  const staged = git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
  if (staged.includes(".mcp.json")) {
    bloqueio(".mcp.json", "está preparado para commit. É configuração de máquina — `git restore --staged .mcp.json`.");
  } else {
    const modificado = git("status", "--porcelain", ".mcp.json") !== "";
    ok(".mcp.json", modificado ? "modificado localmente, fora do stage (normal)" : "sem alterações");
  }
} catch {
  aviso(".mcp.json", "não foi possível verificar.");
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 3. NENHUM `.env` VERSIONADO
 * ═══════════════════════════════════════════════════════════════════════════════════
 * `.env.example` é suposto estar lá: documenta os nomes, nunca os valores. */
try {
  const envs = git("ls-files").split("\n")
    .filter((f) => /(^|\/)\.env($|\.)/.test(f) && !/\.example$/.test(f));
  if (envs.length === 0) ok("ficheiros .env", "nenhum versionado");
  else bloqueio("ficheiros .env", envs.join(", "));
} catch {
  aviso("ficheiros .env", "não foi possível verificar.");
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 4. OS INTERRUPTORES — impressos SEMPRE, mesmo quando está tudo bem
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Não há aqui um valor "certo": depende da etapa do rollout. Ver
 * `docs/FRONTEND_AUTH_RELEASE_PLAN.md`. O que este bloco garante é que ninguém publica
 * sem VER em que etapa está — que é diferente de a escolher.
 *
 * Lê-se `.env` e `.env.local`. O Vite dá precedência ao `.env.local`, e foi por isso que
 * o `.gitignore` teve de o cobrir explicitamente. */
function lerEnv(ficheiro) {
  const caminho = join(RAIZ, ficheiro);
  if (!existsSync(caminho)) return {};
  const out = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    if (/^\s*(#|$)/.test(linha)) continue;
    const i = linha.indexOf("=");
    if (i === -1) continue;
    out[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return out;
}

const env = { ...lerEnv(".env"), ...lerEnv(".env.local") };   // .env.local tem precedência
const INTERRUPTORES = ["VITE_AUTH_MODE", "VITE_PROTECTED_DATA_TRANSPORT", "VITE_API_BASE_URL"];
const SEGREDOS_POR_NOME = /SERVICE_ROLE|SECRET|PASSWORD|PRIVATE|_PAT\b|BYPASS/i;

{
  const linhas = [];
  for (const k of INTERRUPTORES) {
    const v = env[k];
    linhas.push(`${k} = ${v === undefined ? "<ausente>" : v === "" ? "<vazio>" : v}`);
  }
  /* Os valores destes três NÃO são segredos — são configuração pública que já vai no
   * bundle. As chaves do Supabase são outra história e só se diz se existem. */
  for (const k of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    const v = env[k];
    linhas.push(`${k} = ${v ? `<definida: ${v.length} chars>` : "<vazia>"}`);
  }
  ok("interruptores", `o que vai ser compilado no bundle:\n      ${linhas.join("\n      ")}`);

  /* O erro que este projeto não pode cometer: uma VITE_* com nome de segredo vai
   * LITERALMENTE para o bundle público. */
  const perigosas = Object.keys(env).filter((k) => k.startsWith("VITE_") && SEGREDOS_POR_NOME.test(k));
  if (perigosas.length > 0) {
    bloqueio("interruptores", `variável VITE_* com nome de segredo: ${perigosas.join(", ")} — iria LITERALMENTE para o bundle público.`);
  }

  /* `protegido` sem base de API é a combinação que publica uma aplicação que não lê
   * nada: o transporte cai em NENHUM e todos os ecrãs ficam indisponíveis. */
  const protegido = /^(true|1)$/i.test(env.VITE_PROTECTED_DATA_TRANSPORT || "");
  if (protegido && !env.VITE_API_BASE_URL) {
    bloqueio("interruptores", "VITE_PROTECTED_DATA_TRANSPORT ligado sem VITE_API_BASE_URL: nenhuma leitura funcionaria.");
  }
  if (protegido && !/^supabase$/i.test(env.VITE_AUTH_MODE || "")) {
    aviso("interruptores", "transporte protegido ligado sem VITE_AUTH_MODE=supabase: cai no legado por decisão (ver resolveDataTransport).");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 5. NENHUM SEGREDO NOS FICHEIROS VERSIONADOS
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Mesmos padrões e mesma doutrina do BFF: o que torna um valor aceitável é ele DECLARAR-SE
 * falso, onde quer que esteja — e não estar num teste. "Está num teste, logo é seguro"
 * seria o buraco por onde passava o dia em que alguém colasse um valor real para depurar. */
/* ─── DUAS LISTAS, PORQUE SÃO DUAS PERGUNTAS DIFERENTES ─────────────────────────────
 * Nos ficheiros VERSIONADOS, nenhuma chave do Supabase tem o que fazer: mesmo a pública
 * pertence ao `.env`, e uma chave commitada é uma chave que ninguém roda.
 *
 * No BUNDLE a resposta inverte-se para uma delas. A `VITE_SUPABASE_ANON_KEY` — hoje no
 * formato `sb_publishable_` — **é suposta estar lá**: é a chave que as políticas de RLS
 * esperam ver e não concede nada por si (ver `.env.example`). Bloquear por causa dela
 * seria um alarme que dispara sempre, e um alarme que dispara sempre é desligado.
 *
 * O JWT fica em AVISO e não em bloqueio, porque a forma não distingue os dois casos: a
 * anon key ANTIGA é um JWT público, e a `service_role` é um JWT que anula a RLS inteira.
 * São indistinguíveis por regex. Quem publica tem de OLHAR — e é isso que o aviso pede,
 * em vez de fingir que decidiu. */
const PADROES = [
  [/AKfycb[A-Za-z0-9_-]{20,}/, "id de deployment do Apps Script"],
  [/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/, "URL de Web App do Apps Script"],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, "chave secreta do Supabase"],
  [/\bsb_publishable_[A-Za-z0-9_-]{10,}/, "chave publicável do Supabase"],
  [/\beyJhbGciOi[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}/, "JWT"],
  [/\bghp_[A-Za-z0-9]{30,}/, "token do GitHub"],
];

/** No bundle: o que NUNCA lá pode estar. A chave publicável não entra nesta lista. */
const PADROES_BUNDLE = PADROES.filter(([re]) => !/sb_publishable_|eyJhbGciOi/.test(re.source));
/** No bundle: o que exige que alguém olhe, sem bloquear. */
const PADROES_BUNDLE_AVISO = [
  [/\beyJhbGciOi[A-Za-z0-9_=-]{20,}\.[A-Za-z0-9_=-]{20,}/, "JWT — confirmar que é a anon key e NÃO a service_role"],
];

const MARCAS_DE_FALSIDADE = /de_teste|_teste_|exemplo|example|invalid|fixture|fake|dummy|placeholder|nao.?real|não.?real|not.?real|0{8,}|x{8,}|AAAAAAAA/i;

function varrer(textoPorFicheiro, padroes = PADROES) {
  const achados = [];
  for (const [f, texto] of textoPorFicheiro) {
    for (const [re, descricao] of padroes) {
      const g = new RegExp(re.source, "g");
      let m;
      while ((m = g.exec(texto)) !== null) {
        if (MARCAS_DE_FALSIDADE.test(m[0])) continue;
        const linha = texto.slice(0, m.index).split("\n").length;
        /* NUNCA se imprime o valor: só onde está. Um scanner que imprime segredos
         * põe-nos no histórico do terminal e no scrollback. */
        achados.push(`${f}:${linha} — ${descricao}`);
      }
    }
  }
  return achados;
}

try {
  const ficheiros = git("ls-files").split("\n").filter(Boolean);
  const conteudos = [];
  for (const f of ficheiros) {
    if (/\.(png|jpe?g|gif|ico|webp|pdf|zip|woff2?)$/i.test(f)) continue;
    try { conteudos.push([f, readFileSync(join(RAIZ, f), "utf8")]); } catch { /* binário */ }
  }
  const achados = varrer(conteudos);
  if (achados.length === 0) ok("segredos", `${ficheiros.length} ficheiros versionados, nenhum padrão`);
  else bloqueio("segredos", `${achados.length} ocorrência(s):\n      ${achados.join("\n      ")}`);
} catch (e) {
  bloqueio("segredos", `a verificação não correu: ${e.message}`);
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 6. OS TESTES
 * ═══════════════════════════════════════════════════════════════════════════════════ */
/* O relatório por omissão. Não se passa `--reporter`: o `basic` foi removido no Vitest 4
 * e pedir um relatório inexistente faz o processo rebentar ANTES de correr um único
 * teste — que aqui apareceria como "a suite não passou", ou seja, um bloqueio a dizer
 * exatamente a coisa errada. */
try {
  const saida = execFileSync("npx", ["vitest", "run"], {
    cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  });
  const m = /Tests\s+(\d+)\s+passed/.exec(saida);
  ok("testes", m ? `${m[1]} a passar` : "a passar");
} catch (e) {
  const saida = `${e.stdout || ""}${e.stderr || ""}`;
  const m = /Tests\s+(\d+)\s+failed/.exec(saida);
  bloqueio("testes", m ? `${m[1]} a falhar` : "a suite não correu (ver a saída do vitest)");
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * 7. O BUILD, E O QUE FICOU DENTRO DELE
 * ═══════════════════════════════════════════════════════════════════════════════════
 * A verificação que só o frontend precisa. Varrer o CÓDIGO-FONTE não chega: o que é
 * servido é o BUNDLE, e é nele que as `VITE_*` já foram substituídas pelos valores reais.
 * Um segredo que não esteja em nenhum ficheiro versionado — porque veio do `.env.local`,
 * que está corretamente ignorado — aparece na mesma aqui.
 *
 * É o último passo porque é o mais demorado, e porque as verificações baratas devem
 * falhar primeiro. */
try {
  execFileSync("npx", ["vite", "build"], {
    cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  });

  const dist = join(RAIZ, "dist");
  const ficheiros = [];
  (function andar(dir) {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) { andar(p); continue; }
      if (/\.(js|css|html|json|map)$/i.test(nome)) ficheiros.push(p);
    }
  })(dist);

  ok("build", `${ficheiros.length} ficheiros em dist/`);

  /* Os source maps expõem o código-fonte inteiro, com comentários. Não são um segredo,
   * mas são a planta do edifício num repositório onde a planta não precisa de estar. */
  const maps = ficheiros.filter((f) => f.endsWith(".map"));
  if (maps.length === 0) ok("source maps", "nenhum em dist/ (correto para produção)");
  else bloqueio("source maps", `${maps.length} ficheiro(s) .map seriam publicados.`);

  const conteudos = ficheiros.map((f) => [f.slice(dist.length + 1), readFileSync(f, "utf8")]);

  const achados = varrer(conteudos, PADROES_BUNDLE);
  if (achados.length === 0) ok("segredos no bundle", "nenhum padrão proibido");
  else bloqueio("segredos no bundle", `${achados.length} ocorrência(s):\n      ${achados.join("\n      ")}`);

  const aOlhar = varrer(conteudos, PADROES_BUNDLE_AVISO);
  if (aOlhar.length > 0) {
    aviso("bundle — a confirmar", `${aOlhar.length} ocorrência(s):\n      ${aOlhar.join("\n      ")}`);
  }

  /* Os assets têm de sair no caminho que o `base` prometeu. Servir num subcaminho com
   * `base` de raiz — ou o contrário — dá 404 em tudo e a página abre em branco.
   *
   * O prefixo esperado NÃO se escreve aqui: importa-se de `vite.base.mjs`, o mesmo módulo
   * que o `vite.config.js` usa. Enquanto o `base` era fixo, ter `/finer-one/` escrito à
   * mão nos dois sítios era duplicação inofensiva; agora que depende do ambiente, seria
   * uma verificação capaz de aprovar um artefacto partido. */
  const indexHtml = readFileSync(join(dist, "index.html"), "utf8");
  const prefixo = prefixoDosAssets(process.env);
  const alvo = new RegExp(`(src|href)="${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const ondeServe = prefixo === "/assets/" ? "raiz (Vercel / domínio próprio)" : "GitHub Pages";
  if (alvo.test(indexHtml)) ok("caminho dos assets", `${prefixo} — correto para ${ondeServe}`);
  else bloqueio("caminho dos assets", `o index.html não referencia ${prefixo}: os assets dariam 404.`);
} catch (e) {
  bloqueio("build", `falhou: ${String(e.message).split("\n")[0]}`);
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O VEREDITO
 * ═══════════════════════════════════════════════════════════════════════════════════ */
const SIMBOLO = { ok: "  ok  ", aviso: " aviso", bloqueio: "BLOQUEIO" };
console.log("\n  Verificações antes de publicar o frontend — nenhuma delas publica.\n");
for (const r of resultados) {
  console.log(`  [${SIMBOLO[r.nivel]}] ${r.nome}: ${r.detalhe}`);
}

const bloqueios = resultados.filter((r) => r.nivel === "bloqueio");
if (bloqueios.length > 0) {
  console.log(`\n  ${bloqueios.length} verificação(ões) a BLOQUEAR. Não publicar.\n`);
  process.exit(1);
}
console.log("\n  Tudo verde. Publicar continua a ser uma decisão manual e explícita:");
console.log("  npm run deploy   (gh-pages -d dist)");
console.log("  E confirmar antes em que ETAPA do rollout se está — docs/FRONTEND_AUTH_RELEASE_PLAN.md\n");
