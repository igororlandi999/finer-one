// O CLASSIFICADOR DO check:supabase.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O TESTE NASCEU DE UM VERDE FALSO
// ═══════════════════════════════════════════════════════════════════════════════════
// Contra o projeto Supabase real, o passo `rls` imprimiu seis linhas verdes:
//
//     [OK] `profiles`: anónimo recusado.        HTTP 401
//     [OK] `companies`: anónimo recusado.       HTTP 401
//     ...
//
// e a conclusão que qualquer pessoa tira disso é "a RLS está a funcionar". Não estava a
// ser exercida sequer. As cinco tabelas não tinham GRANT nenhum para `anon`, e o
// PostgreSQL verifica o GRANT ANTES da RLS: as sete políticas escritas em
// `001_saas_foundation.sql` nunca chegaram a ser avaliadas. O teste passava com as
// políticas todas erradas.
//
// O código HTTP não distingue nada: chave inválida, GRANT em falta e política a recusar
// uma escrita chegam todos como 401 ou 403. O que distingue é o SQLSTATE e a mensagem.
//
// ─── PORQUE ISTO IMPORTA MAIS DO QUE PARECE ────────────────────────────────────────
// "Está protegido" e "está protegido por acidente" produzem hoje o mesmo ecrã. Só o
// segundo se desfaz no dia em que alguém escrever `grant select on companies to anon` —
// uma linha, fácil de escrever sem querer, e a partir daí a única barreira é a RLS que
// este teste nunca exerceu.

import { describe, it, expect } from "vitest";
import { classificar, MOTIVO } from "./supabase-check.mjs";

/** A forma que `pedir` devolve. */
const resposta = (status, payload) => ({ status, ok: status >= 200 && status < 300, payload });

describe("classificar — as quatro negações não são a mesma negação", () => {
  it("chave inválida: a API rejeita antes de haver SQL nenhum", () => {
    expect(classificar(resposta(401, { message: "Invalid API key" }))).toBe(MOTIVO.CHAVE_INVALIDA);
    expect(classificar(resposta(401, { message: "No API key found in request" }))).toBe(MOTIVO.CHAVE_INVALIDA);
    expect(classificar(resposta(401, { code: "PGRST301", message: "JWT expired" }))).toBe(MOTIVO.CHAVE_INVALIDA);
  });

  it("sem privilégio SQL: o GRANT falta e a RLS nem é consultada", () => {
    // A resposta LITERAL que o projeto real devolveu, e que estava a ser lida como verde.
    const real = resposta(401, {
      code: "42501",
      details: null,
      hint: "Grant the required privileges to the current role with: GRANT SELECT ON public.companies TO anon;",
      message: "permission denied for table companies",
    });
    expect(classificar(real)).toBe(MOTIVO.SEM_PRIVILEGIO_SQL);
  });

  it("RLS a negar uma ESCRITA: o GRANT existe, a política é que recusa", () => {
    const r = resposta(403, {
      code: "42501",
      message: 'new row violates row-level security policy for table "memberships"',
    });
    expect(classificar(r)).toBe(MOTIVO.RLS_NEGOU_ESCRITA);
  });

  it("RLS a FILTRAR uma leitura: 200 com conjunto vazio", () => {
    // A RLS nega escondendo linhas, não recusando o pedido. Quem espera 403 numa
    // leitura não autorizada não o encontra — e conclui que não há barreira.
    expect(classificar(resposta(200, []))).toBe(MOTIVO.RLS_FILTROU);
  });

  it("a mesma SQLSTATE 42501 significa coisas diferentes conforme a mensagem", () => {
    const grant = resposta(401, { code: "42501", message: "permission denied for table companies" });
    const rls = resposta(403, { code: "42501", message: "new row violates row-level security policy" });
    expect(classificar(grant)).not.toBe(classificar(rls));
  });
});

describe("classificar — o que é sucesso e o que é incidente", () => {
  it("leitura com linhas é LEU_DADOS, e num teste anónimo isso é um incidente", () => {
    expect(classificar(resposta(200, [{ id: "overcel" }]))).toBe(MOTIVO.LEU_DADOS);
  });

  it("uma escrita aceite (201/204) é LEU_DADOS, nunca uma negação", () => {
    expect(classificar(resposta(201, null))).toBe(MOTIVO.LEU_DADOS);
    expect(classificar(resposta(204, null))).toBe(MOTIVO.LEU_DADOS);
  });

  it("tabela inexistente distingue-se de tabela protegida", () => {
    expect(classificar(resposta(404, { code: "PGRST205", message: "Could not find the table" })))
      .toBe(MOTIVO.TABELA_INEXISTENTE);
  });
});

describe("classificar — falhas de transporte não são veredictos de segurança", () => {
  it("timeout ou rede em baixo é INDISPONIVEL, não 'protegido'", () => {
    expect(classificar({ status: 0, ok: false, erro: "timeout" })).toBe(MOTIVO.INDISPONIVEL);
    expect(classificar({ status: 0, ok: false, erro: "rede" })).toBe(MOTIVO.INDISPONIVEL);
    expect(classificar(null)).toBe(MOTIVO.INDISPONIVEL);
  });

  it("uma resposta que não se reconhece diz-se DESCONHECIDO em vez de se assumir", () => {
    expect(classificar(resposta(418, { message: "sou um bule" }))).toBe(MOTIVO.DESCONHECIDO);
    expect(classificar(resposta(500, "erro interno"))).toBe(MOTIVO.DESCONHECIDO);
  });
});

describe("health — o falso negativo do endpoint raiz", () => {
  it("'Secret API key required' NÃO é uma chave inválida", () => {
    // `/rest/v1/` passou a exigir chave secreta. O script lia esse 401 como "a API REST
    // recusou a anon key" e dava FALHA num projeto saudável. A chave estava certa.
    const raiz = resposta(401, {
      message: "Secret API key required",
      hint: "Only secret API keys can be used for this endpoint.",
    });
    expect(classificar(raiz)).not.toBe(MOTIVO.CHAVE_INVALIDA);
  });

  it("um 42501 PROVA que a chave foi aceite — só se chega ao GRANT depois de autenticar", () => {
    const r = resposta(401, { code: "42501", message: "permission denied for table profiles" });
    expect(classificar(r)).toBe(MOTIVO.SEM_PRIVILEGIO_SQL);
    expect(classificar(r)).not.toBe(MOTIVO.CHAVE_INVALIDA);
  });
});
