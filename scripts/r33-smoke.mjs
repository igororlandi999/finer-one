// scripts/r33-smoke.mjs
// R-33 — o smoke de isolamento FORTE, num comando.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// COMO SE CORRE
// ═══════════════════════════════════════════════════════════════════════════════════
// As credenciais da conta de smoke vivem num ficheiro JSON **FORA do repositório**, para
// que não haja sequer a hipótese de entrarem num commit:
//
//   C:\Users\User\.finer-smoke.json
//
//   { "email": "smoke-b@finerone.local", "password": "<a que geraste>" }
//
// Depois:
//
//   node scripts/r33-smoke.mjs
//
// Apagar o ficheiro no fim: `Remove-Item C:\Users\User\.finer-smoke.json`
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O QUE ESTE PROGRAMA NUNCA IMPRIME
// ═══════════════════════════════════════════════════════════════════════════════════
// A palavra-passe, o `access_token`, o `refresh_token`, a `service_role` (que nem usa) e
// o corpo das respostas financeiras. Imprime **códigos de estado**, os `company_id` das
// memberships da própria conta, e o `user_id` — que é um identificador, não uma
// credencial.
//
// Não escreve nada. Não cria nada. Não altera nada. São quatro leituras.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O QUE ELE NÃO CONSEGUE FAZER, E PORQUÊ
// ═══════════════════════════════════════════════════════════════════════════════════
// O TESTE 3 — o `audit_log` — **não cabe aqui**, e não é por preguiça. A linha de recusa
// é escrita com `company_id = NULL` (`negar()` devolve `companyId: null`), e a política
// `audit_select_owner` exige `m.company_id = audit_log.company_id`. Com `NULL` a
// comparação nunca é verdadeira: **nenhum utilizador autenticado lê essa linha.** Só a
// `service_role`. O TESTE 3 corre-se no SQL Editor — o SQL está no runbook.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FICHEIRO = process.env.FINER_SMOKE_FILE || path.join(os.homedir(), ".finer-smoke.json");
const BFF = "https://finer-one-proxy.vercel.app/api/companies";
const OVERCEL = "overcel";
const FINER_TESTE = "finer-teste";

function lerEnvLocal() {
  const txt = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const g = (k) => (txt.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim() || "";
  return { url: g("VITE_SUPABASE_URL").replace(/\/+$/, ""), anon: g("VITE_SUPABASE_ANON_KEY") };
}

let falhou = false;
const linha = (r, e, real) => {
  const ok = String(e) === String(real);
  if (!ok) falhou = true;
  console.log(`  ${ok ? "OK  " : "FALHA"}  ${r.padEnd(46)} esperado ${e}, obtido ${real}`);
};

async function main() {
  if (!fs.existsSync(FICHEIRO)) {
    console.error(`Ficheiro de credenciais em falta: ${FICHEIRO}`);
    console.error('Formato: { "email": "...", "password": "..." }  — ver o cabeçalho.');
    process.exitCode = 2;
    return;
  }
  /* `Set-Content -Encoding utf8` no Windows PowerShell 5.1 escreve um BOM, e `JSON.parse`
   * rebenta com ele. Tirar o BOM aqui é mais barato do que pedir a alguém que reescreva
   * um ficheiro que está correto em tudo menos num carácter invisível. */
  const cred = JSON.parse(fs.readFileSync(FICHEIRO, "utf8").replace(/^﻿/, ""));
  const { url, anon } = lerEnvLocal();
  if (!url || !anon) { console.error("VITE_SUPABASE_URL / ANON_KEY em falta no .env.local"); process.exitCode = 2; return; }

  console.log("R-33 — smoke de isolamento forte");
  console.log("projeto:", new URL(url).host);
  console.log("conta:  ", String(cred.email || "").replace(/(^.).*(@.*$)/, "$1***$2"), "\n");

  // ── 0. autenticar. O token fica em memória e não sai daqui. ──
  const rTok = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cred.email, password: cred.password }),
  });
  if (!rTok.ok) {
    /* O código de erro distingue causas que se resolvem de maneiras diferentes, e não
     * traz nada de sensível. Sem ele, "400" manda toda a gente verificar a palavra-passe
     * — inclusive quando o problema é o email por confirmar. */
    const b = await rTok.json().catch(() => ({}));
    const code = b.error_code || b.error || "(sem código)";
    console.error(`\nlogin falhou: ${rTok.status} · ${code}`);
    if (code === "email_not_confirmed") {
      console.error("  A conta existe mas o email não está confirmado.");
      console.error("  Supabase → Authentication → Users → a conta → Confirm email.");
    } else if (code === "invalid_credentials") {
      console.error("  O par email/palavra-passe não corresponde a nenhuma conta.");
      console.error("  O Supabase devolve este MESMO código para 'conta não existe' e para");
      console.error("  'palavra-passe errada', de propósito — não se pode distinguir daqui.");
      console.error("  Confirmar o email exato em Authentication → Users, e em caso de dúvida");
      console.error("  redefinir a palavra-passe pelo painel e reescrever o ficheiro.");
    }
    /* Higiene dos campos, sem revelar valores: apanha o erro mais chato de todos, que é
     * um espaço ou um \r a mais vindos de um copiar-colar ou de um ficheiro CRLF. */
    const e = String(cred.email || ""), pw = String(cred.password || "");
    console.error(`  campos: email ${e.length} chars (espaços nas pontas: ${e !== e.trim()})` +
      ` · password ${pw.length} chars (espaços: ${pw !== pw.trim()}, CR/LF: ${/[\r\n]/.test(pw)})`);
    console.error("\n  NÃO se repete o pedido automaticamente: cada tentativa gasta o rate");
    console.error("  limit de autenticação do Supabase, e esgotá-lo põe fora quem tem as");
    console.error("  credenciais certas (é a lição do R-34).");
    process.exitCode = 1;
    return;
  }
  const sessao = await rTok.json();
  const token = sessao.access_token;
  const userId = sessao.user && sessao.user.id;
  if (!token || !userId) { console.error("resposta de login sem token ou sem utilizador."); process.exitCode = 1; return; }
  console.log("login: OK (token em memória, não impresso)");
  console.log("user_id:", userId, "\n");

  const H = { apikey: anon, Authorization: `Bearer ${token}` };

  // ── PRÉ-CONDIÇÃO: as memberships da própria conta, lidas sob RLS ──
  console.log("PRE-CONDICAO — memberships da conta (RLS: só vê as suas)");
  const rM = await fetch(`${url}/rest/v1/memberships?select=company_id,role`, { headers: H });
  if (!rM.ok) {
    console.error(`  não foi possível ler memberships: ${rM.status}`);
    process.exitCode = 1;
    return;
  }
  const ms = await rM.json();
  console.log("  memberships:", JSON.stringify(ms));
  const temFiner = ms.some((m) => m.company_id === FINER_TESTE);
  const temOvercel = ms.some((m) => m.company_id === OVERCEL);
  linha("membership em finer-teste", true, temFiner);
  linha("membership em overcel (tem de ser false)", false, temOvercel);
  linha("total de memberships", 1, ms.length);

  if (!temFiner || temOvercel || ms.length !== 1) {
    console.error("\n  PRE-CONDICAO FALHOU. Nao se corre o smoke assim: o resultado nao provaria nada.");
    process.exitCode = 1;
    return;
  }

  // ── TESTE 1 — a empresa a que pertence ──
  console.log("\nTESTE 1 — finer-teste (a que pertence)");
  const r1 = await fetch(`${BFF}/${FINER_TESTE}/financial-data?recurso=pedidos`, { headers: { Authorization: `Bearer ${token}` } });
  linha("GET finer-teste/financial-data", 200, r1.status);
  if (r1.ok) {
    const t = await r1.text();
    /* Só a FORMA, nunca os números. A Finer Teste é o caso de controlo e não tem
     * integração, portanto o esperado é a ausência declarada. */
    let fonte = "(sem debug)";
    try { fonte = (JSON.parse(t).debug || {}).fonte || fonte; } catch { /* corpo não-JSON */ }
    console.log("        debug.fonte:", fonte, "| bytes:", t.length);
  }

  // ── TESTE 2 — CRÍTICO — a empresa a que NÃO pertence ──
  console.log("\nTESTE 2 — overcel (a que NAO pertence) — CRITICO");
  const r2 = await fetch(`${BFF}/${OVERCEL}/financial-data?recurso=pedidos`, { headers: { Authorization: `Bearer ${token}` } });
  linha("GET overcel/financial-data", 403, r2.status);

  if (r2.status === 200) {
    console.error("\n  ############################################################");
    console.error("  #  PARAR. 200 NA OVERCEL COM UM TOKEN SEM MEMBERSHIP.      #");
    console.error("  #  Isto e dado cruzado entre empresas. Incidente P1.       #");
    console.error("  #  Nao corrigir automaticamente. Escalar.                  #");
    console.error("  ############################################################");
    process.exitCode = 1;
    return;
  }
  if (r2.status === 401) {
    console.error("\n  401 nao serve: significa token invalido e responde a outra pergunta.");
    process.exitCode = 1;
    return;
  }

  /* O corpo da recusa não pode dizer o motivo: distinguir "sem membership" de "papel
   * insuficiente" diria ao cliente se a empresa existe. O motivo vive no audit_log. */
  try {
    const corpo = JSON.parse(await r2.text());
    console.log("        corpo:", JSON.stringify(corpo));
    linha("corpo da recusa nao revela o motivo", "FORBIDDEN", corpo.code);
  } catch { /* sem corpo JSON */ }

  console.log("\n" + "=".repeat(64));
  if (falhou) {
    console.log("RESULTADO: FALHOU. Nao fechar o R-33.");
    process.exitCode = 1;
  } else {
    console.log("RESULTADO: 200/403 PROVADOS.");
    console.log("");
    console.log("Falta o TESTE 3 (audit_log), que NAO cabe aqui: a linha de recusa tem");
    console.log("company_id = NULL e a politica audit_select_owner nunca a deixa passar.");
    console.log("Correr no SQL Editor, com este user_id:");
    console.log("");
    console.log(`  ${userId}`);
    console.log("");
    console.log("O SQL esta em docs/R33_SINGLE_COMPANY_SMOKE.md, TESTE 3.");
  }
  console.log("=".repeat(64));
}

main().catch((e) => { console.error("erro:", e.message); process.exitCode = 1; });
