#!/usr/bin/env node
// scripts/supabase-check.mjs
// VERIFICADOR DA LIGAÇÃO AO SUPABASE — o guião do primeiro dia com credenciais reais.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PARA QUE SERVE
// ═══════════════════════════════════════════════════════════════════════════════════
// Quando o projeto Supabase existir, a pergunta não é "compila?" — é "o isolamento
// entre empresas funciona a sério?". Esse é o tipo de coisa que não se verifica olhando
// para o ecrã: um ecrã com dados pode estar a mostrar os dados certos por acaso.
//
// Este script faz as perguntas por ordem, e cada uma só faz sentido depois da anterior:
//
//   env         as variáveis existem, e nenhuma é um segredo no sítio errado?
//   health      o projeto responde?
//   schema      as tabelas da migração existem?
//   rls         um ANÓNIMO consegue ler dados? (tem de NÃO conseguir)
//   session     as credenciais de um utilizador dão sessão?
//   membership  A vê a empresa A? E a empresa B — recusa? (o teste que conta)
//   integration `company_integration` é ilegível para anon E para authenticated?
//
// ─── NÃO CONTÉM UM ÚNICO VALOR REAL ─────────────────────────────────────────────────
// Tudo vem do ambiente. O script não guarda, não escreve e não imprime chaves nem
// tokens — imprime só se cada um está PRESENTE e o que se conseguiu ou não fazer com
// ele. Um script de diagnóstico que imprima o token que usou passa a ser o problema que
// devia detetar.
//
// ─── NÃO ESCREVE NADA ───────────────────────────────────────────────────────────────
// Só leituras, e uma tentativa de escrita DELIBERADAMENTE ILEGÍTIMA no teste da RLS —
// que tem de ser recusada. Se alguma vez passar, é um alarme e não um sucesso.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// USO
// ═══════════════════════════════════════════════════════════════════════════════════
//   node scripts/supabase-check.mjs env
//   node scripts/supabase-check.mjs all
//
// Sem SDK: só `fetch`, contra a API REST e a API de auth. É de propósito — o script tem
// de correr ANTES de se instalar o `@supabase/supabase-js`.
//
// Variáveis (nenhuma tem default, nenhuma é inventada):
//
//   PÚBLICAS  (podem estar no .env do frontend, com prefixo VITE_)
//     SUPABASE_URL | VITE_SUPABASE_URL
//     SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY
//
//   SECRETAS  (NUNCA com prefixo VITE_, nunca versionadas, só no Vercel / na shell)
//     SUPABASE_SERVICE_ROLE_KEY     opcional; só o passo `schema` a usa
//
//   CREDENCIAIS DE TESTE (só para `session` e `membership`; da sua própria conta)
//     SMOKE_EMAIL
//     SMOKE_PASSWORD
//     SMOKE_COMPANY_ID          a empresa a que TEM acesso        (espera-se 200)
//     SMOKE_FOREIGN_COMPANY_ID  uma empresa a que NÃO tem acesso  (espera-se 403)
//
//   BFF (só para `membership`)
//     API_BASE_URL              ex.: https://o-seu-proxy.vercel.app/api

import { pathToFileURL } from "node:url";

const ENV = process.env;

/* ─────────────────────────────────────────────────────────────────────────────────
 * SAÍDA
 * ───────────────────────────────────────────────────────────────────────────────── */

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  verde: "\x1b[32m", vermelho: "\x1b[31m", amarelo: "\x1b[33m", azul: "\x1b[36m",
};

let falhas = 0;
let avisos = 0;

function titulo(t) {
  console.log(`\n${C.bold}${C.azul}── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}${C.reset}`);
}
function ok(msg, detalhe) {
  console.log(`  ${C.verde}[OK  ]${C.reset} ${msg}${detalhe ? `\n         ${C.dim}${detalhe}${C.reset}` : ""}`);
}
function erro(msg, detalhe) {
  falhas += 1;
  console.log(`  ${C.vermelho}[FALHA]${C.reset} ${msg}${detalhe ? `\n         ${C.dim}${detalhe}${C.reset}` : ""}`);
}
function aviso(msg, detalhe) {
  avisos += 1;
  console.log(`  ${C.amarelo}[AVISO]${C.reset} ${msg}${detalhe ? `\n         ${C.dim}${detalhe}${C.reset}` : ""}`);
}
function salta(msg) {
  console.log(`  ${C.dim}[SALTA] ${msg}${C.reset}`);
}

/** Uma chave nunca se imprime. Diz-se se existe e que comprimento tem. */
function presenca(valor) {
  if (typeof valor !== "string" || valor.trim() === "") return "ausente";
  return `presente (${valor.trim().length} caracteres)`;
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * CONFIGURAÇÃO
 * ───────────────────────────────────────────────────────────────────────────────── */

const url = (ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const anon = (ENV.SUPABASE_ANON_KEY || ENV.VITE_SUPABASE_ANON_KEY || "").trim();
const serviceRole = (ENV.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const TIMEOUT_MS = 10000;

async function pedir(caminho, { method = "GET", key = anon, token, body, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${caminho}`, {
      method,
      headers: {
        apikey: key,
        /* Sem token de utilizador, o `Authorization` leva a própria chave — é o que a
         * API REST espera para um pedido anónimo. Com token, leva o token: é o que faz
         * a RLS ver `auth.uid()`. */
        Authorization: `Bearer ${token || key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    let payload = null;
    const texto = await res.text();
    if (texto) { try { payload = JSON.parse(texto); } catch { payload = texto; } }
    return { status: res.status, ok: res.ok, payload };
  } catch (err) {
    return { status: 0, ok: false, erro: err && err.name === "AbortError" ? "timeout" : "rede" };
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * CLASSIFICADOR — porque "deu erro" não é uma resposta
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Este script chegou a dar VERDE pela razão errada. O passo `rls` aceitava qualquer
 * 401/403 como "a RLS está a proteger", e o projeto real devolvia 401 porque o role
 * `anon` não tinha GRANT nenhum — a RLS nem sequer era consultada. As políticas podiam
 * estar todas erradas que o teste passava na mesma.
 *
 * O código HTTP não distingue nada aqui: uma chave inválida, um GRANT em falta e uma
 * política de RLS a recusar uma escrita chegam todos como 401 ou 403. O que distingue é
 * o SQLSTATE e a mensagem do PostgREST:
 *
 *   chave inválida        "Invalid API key" / "No API key found" / PGRST301
 *   GRANT em falta        42501 + "permission denied for table X"
 *   RLS a negar escrita   42501 + "violates row-level security policy"
 *   RLS a filtrar         200 + []          (nega escondendo, não recusando)
 *   tabela inexistente    PGRST205 / 404
 *
 * A diferença entre as duas primeiras e as duas últimas é a diferença entre "está
 * protegido" e "está protegido POR ACIDENTE, e a proteção que escrevi não corre".
 */

export const MOTIVO = {
  LEU_DADOS: "leu_dados",
  RLS_FILTROU: "rls_filtrou",
  RLS_NEGOU_ESCRITA: "rls_negou_escrita",
  SEM_PRIVILEGIO_SQL: "sem_privilegio_sql",
  CHAVE_INVALIDA: "chave_invalida",
  TABELA_INEXISTENTE: "tabela_inexistente",
  INDISPONIVEL: "indisponivel",
  DESCONHECIDO: "desconhecido",
};

/** Descrição curta para o ecrã. Nunca inclui chaves nem tokens. */
export const MOTIVO_TEXTO = {
  leu_dados: "leu dados",
  rls_filtrou: "RLS filtrou (200 com conjunto vazio)",
  rls_negou_escrita: "RLS recusou a escrita",
  sem_privilegio_sql: "sem privilégio SQL (GRANT em falta)",
  chave_invalida: "chave rejeitada pela API",
  tabela_inexistente: "tabela inexistente ou não exposta",
  indisponivel: "não respondeu",
  desconhecido: "resposta não reconhecida",
};

export function classificar(r) {
  if (!r || r.status === 0) return MOTIVO.INDISPONIVEL;

  const p = r.payload;
  const objeto = p && typeof p === "object" && !Array.isArray(p) ? p : {};
  const codigo = String(objeto.code || "");
  const mensagem = String(objeto.message || (typeof p === "string" ? p : "")).toLowerCase();

  if (r.status === 200 || r.status === 201 || r.status === 204) {
    if (Array.isArray(p)) return p.length > 0 ? MOTIVO.LEU_DADOS : MOTIVO.RLS_FILTROU;
    return MOTIVO.LEU_DADOS;
  }

  if (/invalid api key|no api key found/.test(mensagem) || codigo === "PGRST301") {
    return MOTIVO.CHAVE_INVALIDA;
  }
  if (codigo === "PGRST205" || codigo === "PGRST202" || r.status === 404) {
    return MOTIVO.TABELA_INEXISTENTE;
  }
  if (/row-level security|row level security/.test(mensagem)) {
    return MOTIVO.RLS_NEGOU_ESCRITA;
  }
  if (codigo === "42501" || /permission denied/.test(mensagem)) {
    return MOTIVO.SEM_PRIVILEGIO_SQL;
  }
  return MOTIVO.DESCONHECIDO;
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 1 — ENV
 * ═══════════════════════════════════════════════════════════════════════════════════ */

function passoEnv() {
  titulo("ENV — as variáveis existem e estão do lado certo");

  if (!url) erro("SUPABASE_URL / VITE_SUPABASE_URL ausente.");
  else if (!url.startsWith("https://")) erro("O URL do Supabase tem de começar por https://", url);
  else ok("URL do projeto", url);

  if (!anon) erro("SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY ausente.");
  else if (anon.length < 20) erro("A anon key parece demasiado curta.", presenca(anon));
  else ok("anon key", presenca(anon));

  if (serviceRole) ok("service_role key", `${presenca(serviceRole)} — só usada pelo passo \`schema\``);
  else salta("service_role key ausente: o passo `schema` será saltado (não é um erro).");

  /* ── A VERIFICAÇÃO QUE MAIS IMPORTA DESTE PASSO ─────────────────────────────────
   * Uma service_role key numa variável `VITE_*` vai LITERALMENTE para o bundle, que é
   * público e servido pelo GitHub Pages. Deixaria de haver RLS: qualquer visitante
   * poderia ler e escrever qualquer tabela de qualquer empresa.
   *
   * É a falha mais grave possível nesta arquitetura e a mais fácil de cometer — basta
   * copiar a linha errada de um painel. */
  const suspeitas = Object.keys(ENV).filter((k) =>
    k.startsWith("VITE_") && /SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|_JWT_SECRET/i.test(k));
  if (suspeitas.length > 0) {
    erro(
      "SEGREDO NUMA VARIÁVEL PÚBLICA — parar e corrigir antes de qualquer build.",
      `${suspeitas.join(", ")}\n         Tudo o que começa por VITE_ é substituído no bundle e é público.\n         Uma service_role no bundle anula a RLS por completo.`,
    );
  } else {
    ok("Nenhuma variável VITE_* com nome de segredo.");
  }

  if (serviceRole && anon && serviceRole === anon) {
    erro("A service_role key e a anon key são iguais — uma delas está no sítio errado.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 2 — HEALTH
 * ═══════════════════════════════════════════════════════════════════════════════════ */

async function passoHealth() {
  titulo("HEALTH — o projeto responde");
  if (!url || !anon) { salta("sem URL ou anon key."); return; }

  const r = await pedir("/auth/v1/health");
  if (r.status === 0) erro("Não foi possível contactar o projeto.", r.erro);
  else if (r.ok) ok("API de autenticação responde.", `HTTP ${r.status}`);
  else aviso("A API de autenticação respondeu com erro.", `HTTP ${r.status}`);

  /* ─── PORQUE NÃO SE SONDA `/rest/v1/` ─────────────────────────────────────────────
   * A raiz da API REST devolve o documento OpenAPI, e o Supabase passou a exigir uma
   * chave SECRETA para o servir: com uma publishable key responde
   *     401 {"message":"Secret API key required",
   *          "hint":"Only secret API keys can be used for this endpoint."}
   * Este script lia esse 401 como "a API REST recusou a anon key" e dava FALHA num
   * projeto perfeitamente saudável — um falso negativo que ensina a ignorar o script.
   *
   * Sonda-se antes uma TABELA. Qualquer resposta que não seja "chave rejeitada" prova
   * que o PostgREST está vivo e que a chave foi aceite: um `42501` só se obtém DEPOIS
   * de a chave autenticar como `anon`. */
  const rest = await pedir(`/rest/v1/${TABELAS[0]}?select=*&limit=1`);
  const motivo = classificar(rest);

  if (motivo === MOTIVO.INDISPONIVEL) {
    erro("A API REST não respondeu.", rest.erro);
  } else if (motivo === MOTIVO.CHAVE_INVALIDA) {
    erro("A API REST rejeitou a chave.", "A chave está errada ou é de outro projeto.");
  } else if (motivo === MOTIVO.TABELA_INEXISTENTE) {
    aviso("A API REST responde, mas a tabela da sondagem não existe.", "Correr a migração 001. A chave em si foi aceite.");
  } else {
    ok("API REST responde e aceita a chave.", `HTTP ${rest.status} · ${MOTIVO_TEXTO[motivo]}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 3 — SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

const TABELAS = ["profiles", "companies", "memberships", "company_coverage", "audit_log"];

async function passoSchema() {
  titulo("SCHEMA — as tabelas da migração 001 existem");
  if (!url) { salta("sem URL."); return; }
  if (!serviceRole) {
    salta("sem service_role key: não é possível distinguir 'tabela inexistente' de 'RLS a negar'.");
    return;
  }

  for (const t of TABELAS) {
    /* `limit=0` e `Prefer: count=exact`: pergunta-se pela EXISTÊNCIA, não pelo conteúdo.
     * Não se leem dados financeiros de ninguém para verificar um esquema. */
    const r = await pedir(`/rest/v1/${t}?select=*&limit=0`, {
      key: serviceRole,
      headers: { Prefer: "count=exact" },
    });
    if (r.status === 200) ok(`tabela \`${t}\``);
    else if (r.status === 404 || (r.payload && r.payload.code === "42P01")) {
      erro(`tabela \`${t}\` NÃO existe.`, "Executar docs/sql/001_saas_foundation.sql no SQL Editor.");
    } else {
      aviso(`tabela \`${t}\`: resposta inesperada.`, `HTTP ${r.status}`);
    }
  }

  /* `company_integration` vem da migração 003 e é verificada à parte porque a sua
   * AUSÊNCIA não é o mesmo tipo de problema: as tabelas do 001 em falta significam que
   * nada funciona; esta em falta significa que as leituras protegidas respondem
   * `integracao-nao-configurada` — o produto está de pé, e vazio. O passo `integration`
   * é que a examina a sério. */
  const integracao = await pedir("/rest/v1/company_integration?select=*&limit=0", {
    key: serviceRole,
    headers: { Prefer: "count=exact" },
  });
  if (integracao.status === 200) ok("tabela `company_integration` (migração 003)");
  else if (integracao.status === 404 || (integracao.payload && integracao.payload.code === "42P01")) {
    aviso(
      "tabela `company_integration` NÃO existe — migração 003 por aplicar.",
      "As leituras protegidas vão responder 503 (avaria) até ela existir. Ver docs/sql/003_company_integration.sql.",
    );
  } else {
    aviso("tabela `company_integration`: resposta inesperada.", `HTTP ${integracao.status}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 4 — RLS
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O passo mais importante do script. Verifica que um ANÓNIMO — alguém com a anon key,
 * que é pública e vai no bundle — NÃO consegue ler nada.
 *
 * Um 200 com uma lista NÃO VAZIA aqui é um incidente de segurança, não um teste falhado.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

async function passoRls() {
  titulo("RLS — um anónimo não lê nada, E PELA RAZÃO CERTA");
  if (!url || !anon) { salta("sem URL ou anon key."); return; }

  /* Uma recusa por GRANT em falta é uma recusa verdadeira — o anónimo não lê — mas NÃO
   * prova nada sobre as políticas. Reporta-se como AVISO, não como sucesso: o dia em
   * que alguém conceder `grant select ... to anon` (uma linha, fácil de escrever por
   * engano), a única barreira passa a ser a RLS, que este teste nunca chegou a exercer. */
  let porGrant = 0;

  for (const t of TABELAS) {
    const r = await pedir(`/rest/v1/${t}?select=*&limit=1`, { key: anon });
    const motivo = classificar(r);

    if (motivo === MOTIVO.LEU_DADOS) {
      erro(
        `ANÓNIMO LEU \`${t}\` — a RLS não está a proteger esta tabela.`,
        "A anon key é pública (vai no bundle). Verificar `enable row level security` e as políticas.",
      );
    } else if (motivo === MOTIVO.RLS_FILTROU) {
      ok(`\`${t}\`: RLS filtrou — 200 com conjunto vazio.`, "É a negação que a RLS faz: esconde linhas, não recusa o pedido.");
    } else if (motivo === MOTIVO.SEM_PRIVILEGIO_SQL) {
      porGrant += 1;
      aviso(
        `\`${t}\`: recusado ANTES da RLS — sem GRANT para \`anon\`.`,
        `HTTP ${r.status} · 42501. O anónimo não lê, mas as políticas desta tabela NÃO foram exercidas por este teste.`,
      );
    } else if (motivo === MOTIVO.CHAVE_INVALIDA) {
      erro(`\`${t}\`: a chave foi rejeitada — este teste não provou nada.`, "Corrigir a chave antes de interpretar o resto.");
    } else if (motivo === MOTIVO.TABELA_INEXISTENTE) {
      erro(`\`${t}\`: tabela inexistente ou não exposta.`, "Correr a migração 001.");
    } else {
      aviso(`\`${t}\`: resposta não reconhecida.`, `HTTP ${r.status} · ${MOTIVO_TEXTO[motivo]}`);
    }
  }

  /* Escrita anónima. Deliberadamente ilegítima: TEM de ser recusada — e aqui também
   * interessa saber QUEM a recusou. */
  const escrita = await pedir("/rest/v1/memberships", {
    method: "POST",
    key: anon,
    body: { user_id: "00000000-0000-0000-0000-000000000000", company_id: "empresa-inexistente", role: "owner" },
  });
  const motivoEscrita = classificar(escrita);

  if (escrita.status >= 200 && escrita.status < 300) {
    erro(
      "ANÓNIMO CONSEGUIU ESCREVER EM `memberships` — parar tudo.",
      "Conceder memberships é uma operação de servidor. Não deve existir política de INSERT.",
    );
  } else if (motivoEscrita === MOTIVO.RLS_NEGOU_ESCRITA) {
    ok("Escrita anónima recusada PELA RLS.", `HTTP ${escrita.status}`);
  } else if (motivoEscrita === MOTIVO.SEM_PRIVILEGIO_SQL) {
    ok("Escrita anónima recusada por falta de GRANT.", `HTTP ${escrita.status} · 42501. Barreira anterior à RLS, e é a desejada em \`memberships\`.`);
  } else if (motivoEscrita === MOTIVO.CHAVE_INVALIDA) {
    erro("A chave foi rejeitada — a recusa da escrita não prova nada.", "Corrigir a chave.");
  } else {
    aviso("Escrita anónima recusada, por motivo não reconhecido.", `HTTP ${escrita.status} · ${MOTIVO_TEXTO[motivoEscrita]}`);
  }

  if (porGrant === TABELAS.length) {
    aviso(
      "TODAS as tabelas recusaram por GRANT, nenhuma pela RLS.",
      "O anónimo está barrado — mas nenhuma política foi exercida. Para as exercer é preciso um pedido AUTENTICADO: ver `membership`.",
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 5 — SESSION
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/** Autentica e devolve o access token. Nunca o imprime. */
async function autenticar() {
  const email = (ENV.SMOKE_EMAIL || "").trim();
  const password = ENV.SMOKE_PASSWORD || "";
  if (!email || !password) return { ok: false, motivo: "sem_credenciais" };

  const r = await pedir("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anon,
    body: { email, password },
  });
  if (r.status === 0) return { ok: false, motivo: "rede" };
  if (!r.ok) return { ok: false, motivo: `http_${r.status}` };
  const token = r.payload && r.payload.access_token;
  if (typeof token !== "string" || token === "") return { ok: false, motivo: "resposta_sem_token" };
  return { ok: true, token, userId: r.payload.user && r.payload.user.id };
}

async function passoSession() {
  titulo("SESSION — as credenciais dão sessão");
  if (!url || !anon) { salta("sem URL ou anon key."); return null; }
  if (!ENV.SMOKE_EMAIL || !ENV.SMOKE_PASSWORD) {
    salta("SMOKE_EMAIL / SMOKE_PASSWORD ausentes.");
    return null;
  }

  const s = await autenticar();
  if (!s.ok) {
    erro("Não foi possível obter sessão.", `motivo: ${s.motivo}`);
    return null;
  }
  ok("Sessão obtida.", `utilizador ${s.userId}`);

  /* O token serve para o que o BFF vai fazer com ele: perguntar quem é. */
  const user = await pedir("/auth/v1/user", { key: anon, token: s.token });
  if (user.ok && user.payload && user.payload.id === s.userId) {
    ok("`GET /auth/v1/user` confirma o token.", "É exatamente o que `lib/verifyToken.js` faz no BFF.");
  } else {
    erro("O token não foi aceite por `/auth/v1/user`.", `HTTP ${user.status}`);
  }

  /* Um token adulterado NÃO pode ser aceite. */
  const falso = await pedir("/auth/v1/user", { key: anon, token: `${s.token}x` });
  if (falso.status === 401 || falso.status === 403) ok("Token adulterado recusado.", `HTTP ${falso.status}`);
  else erro("Um token adulterado NÃO foi recusado.", `HTTP ${falso.status}`);

  /* As memberships do próprio, através da RLS. */
  const minhas = await pedir("/rest/v1/memberships?select=company_id,role", { key: anon, token: s.token });
  if (minhas.ok && Array.isArray(minhas.payload)) {
    ok(`O utilizador vê ${minhas.payload.length} membership(s).`,
      minhas.payload.map((m) => `${m.company_id} (${m.role})`).join(", ") || "nenhuma — ver FASE 6");
  } else {
    erro("Não foi possível ler as memberships do próprio utilizador.", `HTTP ${minhas.status}`);
  }

  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 6 — MEMBERSHIP (A -> A e A -> B)
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O teste que justifica a arquitetura toda: o mesmo token, contra duas empresas, tem de
 * dar respostas diferentes.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

async function passoMembership(sessao) {
  titulo("MEMBERSHIP — A vê A; A NÃO vê B");

  const apiBase = (ENV.API_BASE_URL || "").trim().replace(/\/+$/, "");
  const minha = (ENV.SMOKE_COMPANY_ID || "").trim();
  const alheia = (ENV.SMOKE_FOREIGN_COMPANY_ID || "").trim();

  if (!sessao) { salta("sem sessão (ver o passo SESSION)."); return; }
  if (!apiBase) { salta("API_BASE_URL ausente: não há BFF para interrogar."); return; }
  if (!minha) { salta("SMOKE_COMPANY_ID ausente."); return; }

  async function pedirAoBff(companyId, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${apiBase}/companies/${encodeURIComponent(companyId)}/financial-data?recurso=pedidos`, {
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      return { status: res.status, ok: res.ok };
    } catch (err) {
      return { status: 0, erro: err && err.name === "AbortError" ? "timeout" : "rede" };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── sem token -> 401 ──
  const semToken = await pedirAoBff(minha, null);
  if (semToken.status === 401) ok("Sem token: 401.");
  else erro("Sem token, o BFF devia responder 401.", `veio HTTP ${semToken.status}`);

  // ── token válido + empresa própria -> 200 ──
  const propria = await pedirAoBff(minha, sessao.token);
  if (propria.status === 200) ok(`A -> A (\`${minha}\`): 200.`);
  else erro(`A -> A (\`${minha}\`) devia ser 200.`, `veio HTTP ${propria.status}`);

  // ── token válido + empresa alheia -> 403 ──
  if (!alheia) {
    salta("SMOKE_FOREIGN_COMPANY_ID ausente: o teste de ISOLAMENTO não foi feito.");
    aviso("O isolamento entre empresas ficou por verificar.",
      "Criar uma segunda empresa SEM membership e definir SMOKE_FOREIGN_COMPANY_ID.");
  } else {
    const outra = await pedirAoBff(alheia, sessao.token);
    if (outra.status === 403) {
      ok(`A -> B (\`${alheia}\`): 403. O isolamento funciona.`);
    } else if (outra.status === 200) {
      erro(
        `A -> B (\`${alheia}\`) DEVOLVEU 200 — FUGA ENTRE EMPRESAS.`,
        "Parar. Um utilizador está a receber dados de uma empresa a que não pertence.",
      );
    } else {
      aviso(`A -> B (\`${alheia}\`): esperado 403.`, `veio HTTP ${outra.status}`);
    }

    /* Uma empresa que NÃO EXISTE tem de ser indistinguível de uma que não é sua —
     * senão o código de estado é um oráculo para enumerar clientes. */
    const inexistente = await pedirAoBff("empresa-que-nao-existe-xyz", sessao.token);
    if (inexistente.status === 403) ok("Empresa inexistente: 403, igual a 'não é sua'.");
    else aviso("Empresa inexistente devia dar 403.", `veio HTTP ${inexistente.status}`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PASSO 7 — INTEGRATION (migração 003)
 * ═══════════════════════════════════════════════════════════════════════════════════
 * `public.company_integration` é a tabela que guarda, por empresa, de onde se leem os
 * dados financeiros. É a ÚNICA tabela do esquema que nenhum papel de browser pode ler —
 * nem `anon`, nem `authenticated`, nem sequer o `owner` da própria empresa.
 *
 * ─── PORQUE É MAIS FECHADA DO QUE TODAS AS OUTRAS ──────────────────────────────────
 * `companies` tem a política `companies_select_member`: um membro lê a linha inteira. Se
 * a configuração da integração vivesse lá — como viveu — qualquer membro leria o URL do
 * Web App do Apps Script a partir do browser. Esse Web App está publicado como
 * ANYONE_ANONYMOUS: quem tem o URL tem os dados, sem token e sem empresa.
 *
 * Por isso a tabela nova tem RLS ativa e ZERO políticas, e zero GRANTs para `anon` e
 * `authenticated`. Este passo verifica isso contra o Supabase REAL — porque um teste
 * unitário não sabe nada sobre o que está mesmo configurado no projeto.
 *
 * ─── E VERIFICA QUE A LINHA NÃO TEM SEGREDOS ───────────────────────────────────────
 * A tabela guarda `{"provider":"gas","envKey":"GAS_URL"}` — uma REFERÊNCIA. O endereço
 * vive no Vercel. Se um dia alguém "resolver o problema" colando lá o URL, este passo
 * grita. O check `company_integration_sem_segredos` já o impede no SQL; isto é a
 * verificação do lado de fora, que não depende de a restrição ter sido aplicada.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/** Chaves que NUNCA podem estar numa linha de `company_integration`. Espelha o check. */
const CHAVES_PROIBIDAS_NA_CONFIG = [
  "gasUrl", "gas_url", "GAS_URL", "url", "token", "secret", "password",
  "apiKey", "api_key", "serviceRoleKey", "service_role_key", "anonKey", "anon_key",
  "blingClientId", "blingClientSecret", "blingRefreshToken", "webhookSecret", "spreadsheetId",
];

async function passoIntegracao(sessao) {
  titulo("INTEGRATION — a tabela que NENHUM browser lê");
  if (!url || !anon) { salta("sem URL ou anon key."); return; }

  const caminho = "/rest/v1/company_integration?select=company_id,config&limit=5";

  /* ── 1. ANÓNIMO ──────────────────────────────────────────────────────────────── */
  const anonimo = await pedir(caminho, { key: anon });
  const motivoAnon = classificar(anonimo);
  if (motivoAnon === MOTIVO.LEU_DADOS) {
    erro(
      "ANÓNIMO LEU `company_integration` — a fonte de dados de todas as empresas está pública.",
      "Parar. Verificar `revoke all ... from anon` e `enable row level security` em docs/sql/003.",
    );
  } else if (motivoAnon === MOTIVO.SEM_PRIVILEGIO_SQL) {
    ok("anon: recusado por falta de GRANT.", "É a barreira desejada — anterior à RLS.");
  } else if (motivoAnon === MOTIVO.RLS_FILTROU) {
    /* 200 com lista vazia significa que o GRANT existe e foi a RLS a esconder tudo.
     * O anónimo não lê — mas a primeira barreira não está lá. */
    aviso(
      "anon: 200 com conjunto vazio — a RLS negou, mas o GRANT NÃO foi revogado.",
      "Correr `revoke all on public.company_integration from anon;`. A tabela está protegida por uma barreira só.",
    );
  } else if (motivoAnon === MOTIVO.TABELA_INEXISTENTE) {
    erro("`company_integration` não existe.", "Executar docs/sql/003_company_integration.sql no SQL Editor.");
  } else {
    aviso("anon: resposta não reconhecida.", `HTTP ${anonimo.status} · ${MOTIVO_TEXTO[motivoAnon]}`);
  }

  /* ── 2. AUTENTICADO ──────────────────────────────────────────────────────────────
   * O caso que distingue esta tabela de todas as outras. Em `companies` e
   * `company_coverage`, um membro autenticado LÊ (e deve). Aqui não pode — e o token
   * usado é o de um utilizador que é `owner` de uma empresa real, que é o papel com
   * mais privilégios que existe no produto. Se o owner não lê, ninguém lê. */
  if (!sessao) {
    salta("sem sessão: o teste do AUTENTICADO — o que realmente conta — não foi feito.");
    aviso("A leitura por um utilizador autenticado ficou por verificar.",
      "Definir SMOKE_EMAIL e SMOKE_PASSWORD e correr `node scripts/supabase-check.mjs integration`.");
  } else {
    const autenticado = await pedir(caminho, { key: anon, token: sessao.token });
    const motivoAuth = classificar(autenticado);
    if (motivoAuth === MOTIVO.LEU_DADOS) {
      erro(
        "UM UTILIZADOR AUTENTICADO LEU `company_integration` — parar tudo.",
        "Um membro (mesmo owner, mesmo viewer) não pode ver de onde vêm os dados. Verificar que NÃO existe nenhuma política de SELECT e que `authenticated` não tem GRANT.",
      );
    } else if (motivoAuth === MOTIVO.SEM_PRIVILEGIO_SQL) {
      ok("authenticated: recusado por falta de GRANT.", "Nem o owner da empresa lê a sua própria integração. É o desejado.");
    } else if (motivoAuth === MOTIVO.RLS_FILTROU) {
      aviso(
        "authenticated: 200 com conjunto vazio — a RLS negou, mas o GRANT NÃO foi revogado.",
        "Correr `revoke all on public.company_integration from authenticated;`.",
      );
    } else {
      aviso("authenticated: resposta não reconhecida.", `HTTP ${autenticado.status} · ${MOTIVO_TEXTO[motivoAuth]}`);
    }
  }

  /* ── 3. SERVICE_ROLE ─────────────────────────────────────────────────────────────
   * O BFF TEM de conseguir ler. Uma tabela perfeitamente fechada que nem o servidor lê
   * não protege nada — só quebra o produto, e quebra-o de uma forma que se parece com
   * "esta empresa não tem integração". */
  if (!serviceRole) {
    salta("sem service_role key: não é possível confirmar que o BFF consegue ler.");
    return;
  }

  const servidor = await pedir(caminho, { key: serviceRole });
  if (servidor.status !== 200 || !Array.isArray(servidor.payload)) {
    erro(
      "A service_role NÃO conseguiu ler `company_integration` — o BFF vai responder 503.",
      `HTTP ${servidor.status}. Verificar o GRANT para \`service_role\` em docs/sql/003.`,
    );
    return;
  }
  ok(`service_role: leu ${servidor.payload.length} linha(s).`, "É o único caminho de leitura, e funciona.");

  /* ── 4. AS LINHAS SÃO REFERÊNCIAS, NÃO SEGREDOS ──────────────────────────────── */
  for (const linha of servidor.payload) {
    const config = linha && linha.config;
    const id = (linha && linha.company_id) || "?";

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      aviso(`\`${id}\`: \`config\` não é um objeto.`, "O BFF trata isto como avaria e responde 503.");
      continue;
    }

    const proibidas = CHAVES_PROIBIDAS_NA_CONFIG.filter((k) => Object.prototype.hasOwnProperty.call(config, k));
    if (proibidas.length > 0) {
      erro(
        `\`${id}\`: a linha contém um SEGREDO — ${proibidas.join(", ")}.`,
        "A tabela guarda referências ({provider, envKey}), não valores. Um segredo aqui é uma segunda cópia que ninguém vai lembrar-se de rodar.",
      );
      continue;
    }

    /* Imprimem-se `provider` e `envKey` de propósito: são NOMES, não valores. Saber que
     * a Overcel lê por `gas` a partir de `GAS_URL` não dá acesso a nada — é preciso ter
     * a variável, que vive no Vercel. */
    if (config.provider === "gas" && typeof config.envKey === "string") {
      ok(`\`${id}\`: provider=gas, envKey=${config.envKey}.`, "Referência declarativa — o endereço não está na base de dados.");
    } else {
      aviso(`\`${id}\`: declaração que o BFF não sabe usar.`, `provider=${JSON.stringify(config.provider)}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PRINCIPAL
 * ═══════════════════════════════════════════════════════════════════════════════════ */

const PASSOS = {
  env: passoEnv,
  health: passoHealth,
  schema: passoSchema,
  rls: passoRls,
  session: passoSession,
};

async function main() {
  const pedido = (process.argv[2] || "all").toLowerCase();

  console.log(`${C.bold}Finer One — verificação da ligação ao Supabase${C.reset}`);
  console.log(`${C.dim}Nenhuma chave nem token é impressa. Nada é escrito na base de dados.${C.reset}`);

  const COM_SESSAO = ["membership", "integration"];

  if (pedido !== "all" && !PASSOS[pedido] && !COM_SESSAO.includes(pedido)) {
    console.log(`\nPasso desconhecido: "${pedido}".`);
    console.log(`Passos: ${Object.keys(PASSOS).join(", ")}, ${COM_SESSAO.join(", ")}, all`);
    process.exit(2);
  }

  if (pedido === "all") {
    passoEnv();
    await passoHealth();
    await passoSchema();
    await passoRls();
    const s = await passoSession();
    await passoMembership(s);
    await passoIntegracao(s);
  } else if (COM_SESSAO.includes(pedido)) {
    /* Estes passos precisam de sessão: corre-se o anterior por dependência, não por
     * conveniência. `integration` sem sessão continua a verificar `anon` e
     * `service_role` — só o teste do AUTENTICADO fica por fazer, e diz que ficou. */
    const s = await passoSession();
    if (pedido === "membership") await passoMembership(s);
    else await passoIntegracao(s);
  } else {
    await PASSOS[pedido]();
  }

  titulo("RESUMO");
  if (falhas === 0 && avisos === 0) {
    console.log(`  ${C.verde}${C.bold}Tudo verificado, sem falhas.${C.reset}`);
  } else {
    console.log(`  falhas: ${falhas === 0 ? C.verde : C.vermelho}${falhas}${C.reset}   avisos: ${avisos === 0 ? C.verde : C.amarelo}${avisos}${C.reset}`);
  }
  console.log(`  ${C.dim}Este script afirma sobre a LIGAÇÃO e o ISOLAMENTO. Não afirma nada sobre\n  a correção dos números financeiros — isso é \`npm run check:data\`.${C.reset}\n`);

  process.exit(falhas === 0 ? 0 : 1);
}

/* Só corre quando invocado como programa (`node scripts/supabase-check.mjs`).
 * Sem esta guarda, importar o ficheiro para testar `classificar` disparava a
 * verificação inteira — rede, chaves e `process.exit` incluídos. É o mesmo padrão de
 * `check-data-pipeline.mjs`, e pela mesma razão. */
const invocadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoDiretamente) {
  main().catch((err) => {
    console.error(`\n${C.vermelho}O verificador rebentou:${C.reset} ${err && err.message}`);
    process.exit(1);
  });
}
