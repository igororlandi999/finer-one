// PERMISSÕES NA INTERFACE — FASE 4 e FASE 5.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ESTES TESTES NÃO SÃO TESTES DE SEGURANÇA. A AUTORIDADE É O BFF.
// ═══════════════════════════════════════════════════════════════════════════════════
// Quem impede um `viewer` de escrever é `authorizeCompanyRequest` sobre um token
// verificado, e os testes dessa decisão vivem em `authorizationCore.test.js` e na suite
// do proxy. Um `viewer` que apague o JavaScript desta página e faça o POST à mão recebe
// 403 na mesma.
//
// O que se testa AQUI é outra coisa, e é uma promessa de produto: uma ação que a
// plataforma vai recusar não é oferecida. Um botão que não pode funcionar é uma promessa
// falsa — a mesma regra que já impede esta aplicação de desenhar botões desativados.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { resolveUiCapability, uiCan, UI_PERMISSION_REASON, CAPABILITIES } from "./uiPermissions.js";
import { authenticatedSession, anonymousSession, loadingSession } from "./sessionContract.js";
import { buildCoverageConfirmationCard, COVERAGE_CARD } from "../utils/coverageConfirmationView.js";

const aqui = dirname(fileURLToPath(import.meta.url));

/** Sessão autenticada com um papel numa empresa. */
function sessaoCom(role) {
  return authenticatedSession({
    user: { id: "u1", email: "pessoa@exemplo.pt" },
    companies: [{ companyId: "empresa-a", name: "Empresa A", role }],
  });
}

/* ==================================================================================== */
describe("resolveUiCapability — as duas metades da regra", () => {
  it("sem autenticação não há papéis: a UI oferece tudo", () => {
    /* A metade que impede uma regressão funcional entregue como melhoria de segurança.
     * A instalação de hoje corre em AUTH_MODE.DISABLED, com sessão ANÓNIMA de propósito.
     * Ligar a UI a `sessionCan` faria o CTA desaparecer para o dono dos dados. */
    const r = resolveUiCapability({
      requiresAuth: false,
      session: anonymousSession(),
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(UI_PERMISSION_REASON.SEM_AUTENTICACAO);
  });

  it("com autenticação ligada, o viewer NÃO pode escrever", () => {
    const r = resolveUiCapability({
      requiresAuth: true,
      session: sessaoCom("viewer"),
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(UI_PERMISSION_REASON.PAPEL_INSUFICIENTE);
  });

  it("o viewer PODE ler — é um papel de leitura, não de menos informação", () => {
    expect(uiCan({
      requiresAuth: true,
      session: sessaoCom("viewer"),
      capability: CAPABILITIES.READ_FINANCIAL_DATA,
    })).toBe(true);
  });

  it("member escreve estado financeiro e NÃO gere memberships", () => {
    const s = sessaoCom("member");
    expect(uiCan({ requiresAuth: true, session: s, capability: CAPABILITIES.WRITE_FINANCIAL_STATE })).toBe(true);
    expect(uiCan({ requiresAuth: true, session: s, capability: CAPABILITIES.MANAGE_MEMBERSHIPS })).toBe(false);
  });

  it("owner pode tudo o que existe hoje", () => {
    const s = sessaoCom("owner");
    for (const cap of Object.values(CAPABILITIES)) {
      expect(uiCan({ requiresAuth: true, session: s, capability: cap }), cap).toBe(true);
    }
  });

  it("sessão em LOADING não concede nada — ausência de veredito não é autorização", () => {
    expect(uiCan({
      requiresAuth: true, session: loadingSession(), capability: CAPABILITIES.READ_FINANCIAL_DATA,
    })).toBe(false);
  });

  it("sessão autenticada sem empresa não concede, e diz porquê", () => {
    const semEmpresa = authenticatedSession({ user: { id: "u1" }, companies: [] });
    const r = resolveUiCapability({
      requiresAuth: true, session: semEmpresa, capability: CAPABILITIES.READ_FINANCIAL_DATA,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(UI_PERMISSION_REASON.SEM_EMPRESA);
  });

  it("uma capacidade que não existe NEGA — nunca concede por engano", () => {
    /* Um erro de escrita no nome de uma capacidade não pode ser a forma de abrir uma
     * ação a toda a gente. */
    const r = resolveUiCapability({
      requiresAuth: true, session: sessaoCom("owner"), capability: "write_tudo",
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(UI_PERMISSION_REASON.CAPACIDADE_DESCONHECIDA);
  });

  it("`requiresAuth` só desliga a regra quando é EXATAMENTE `false`", () => {
    /* `undefined` — um chamador que se esqueça do argumento — não pode valer "sem
     * autenticação, oferece tudo". A dúvida resolve-se para o lado restritivo. */
    expect(uiCan({ session: sessaoCom("viewer"), capability: CAPABILITIES.WRITE_FINANCIAL_STATE }))
      .toBe(false);
  });
});

/* ==================================================================================== */
describe("FASE 5 — a página da cobertura respeita o papel", () => {
  /** Dataset mínimo com uma cobertura por confirmar. */
  const salesPorConfirmar = {
    companyId: "empresa-a",
    coverage: { payables: { snapshotPartial: false } },
    coverageOrigem: { source: "config", completeThroughMonth: "2026-06" },
    financeiro: {
      coverageDiagnostics: {
        lastClosedCivilMonth: "2026-07",
        payables: { coverageNeedsReview: true },
      },
    },
    despesas: { porClassificar: [] },
    meta: {},
  };

  it("member/owner vêem o CTA de confirmar", () => {
    const card = buildCoverageConfirmationCard({ sales: salesPorConfirmar, source: "api", canWrite: true });
    expect(card.state).toBe(COVERAGE_CARD.POR_CONFIRMAR);
    expect(card.cta).toBe("Confirmar cobertura");
    expect(card.confirmText).toContain("Confirmo que");
    expect(card.readOnly).toBe(false);
  });

  it("viewer NÃO vê CTA nenhum, nem a frase de confirmação", () => {
    const card = buildCoverageConfirmationCard({ sales: salesPorConfirmar, source: "api", canWrite: false });
    expect(card.state).toBe(COVERAGE_CARD.POR_CONFIRMAR_SEM_PERMISSAO);
    expect(card.cta).toBeNull();
    expect(card.confirmText).toBeNull();
    expect(card.ressalva).toBeNull();
    expect(card.readOnly).toBe(true);
  });

  it("o viewer continua a VER que o mês está por confirmar", () => {
    /* Esconder o cartão fá-lo-ia ler os números do mês como definitivos, sem nada no
     * ecrã a dizer que não são. `viewer` é o papel do contabilista externo: é
     * exatamente quem precisa desta informação. */
    const card = buildCoverageConfirmationCard({ sales: salesPorConfirmar, source: "api", canWrite: false });
    expect(card).not.toBeNull();
    expect(card.monthKey).toBe("2026-07");
    expect(card.explicacao).toContain("julho");
  });

  it("o viewer vê os MESMOS números de contexto que o owner", () => {
    const comEscrita = buildCoverageConfirmationCard({ sales: salesPorConfirmar, source: "api", canWrite: true });
    const semEscrita = buildCoverageConfirmationCard({ sales: salesPorConfirmar, source: "api", canWrite: false });
    expect(semEscrita.contexto).toEqual(comEscrita.contexto);
  });

  it("sem pendência, o papel não muda nada", () => {
    const emDia = {
      ...salesPorConfirmar,
      financeiro: {
        coverageDiagnostics: {
          lastClosedCivilMonth: "2026-07",
          payables: { coverageNeedsReview: false },
        },
      },
    };
    for (const canWrite of [true, false]) {
      expect(buildCoverageConfirmationCard({ sales: emDia, source: "api", canWrite }).state)
        .toBe(COVERAGE_CARD.EM_DIA);
    }
  });

  it("sem dados reais não há cartão, com qualquer papel", () => {
    for (const canWrite of [true, false]) {
      expect(buildCoverageConfirmationCard({ sales: null, source: "mock", canWrite })).toBeNull();
    }
  });
});

/* ==================================================================================== */
describe("a página não pode ESQUECER-SE de perguntar", () => {
  /* `canWrite` tem default `true` — ver o porquê em `coverageConfirmationView.js`. O que
   * impede o esquecimento não é o default: é este teste, que lê o código da página.
   * Mesmo padrão de `moedaCentralizada.test.js`. */

  const PAGINA = readFileSync(join(aqui, "..", "pages", "AjustesManuais.jsx"), "utf8");

  it("AjustesManuais pergunta pela capacidade de escrita", () => {
    expect(PAGINA).toMatch(/uiCan\s*\(\s*CAPABILITIES\.WRITE_FINANCIAL_STATE\s*\)/);
  });

  it("e passa a resposta ao construtor do cartão", () => {
    expect(PAGINA).toMatch(/buildCoverageConfirmationCard\s*\(\s*\{[^}]*canWrite/);
  });

  it("não usa `can` estrito, que apagaria o CTA no modo sem autenticação", () => {
    /* A troca de `uiCan` por `can` parece uma correção de segurança e é uma regressão.
     * Ver o cabeçalho de `uiPermissions.js`. */
    expect(PAGINA).not.toMatch(/(?<!ui)\bcan\s*\(\s*CAPABILITIES\./);
  });
});
