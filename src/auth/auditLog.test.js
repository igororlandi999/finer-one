// REGISTO DE AUDITORIA — o autor não se inventa, e o texto do utilizador não entra.

import { describe, it, expect } from "vitest";
import { buildAuditEntry, buildAccessDeniedEntry, AUDIT_ACTION } from "./auditLog.js";
import { AUTHZ, AUTHZ_REASON, CAPABILITIES } from "./authorizationCore.js";

const AGORA = new Date("2026-08-26T14:30:00.000Z");

const BASE = {
  companyId: "overcel",
  actorUserId: "user-ana",
  action: AUDIT_ACTION.COVERAGE_CONFIRMED,
  monthKey: "2026-07",
  now: AGORA,
};

describe("o autor é obrigatório e nunca se inventa", () => {
  it.each([undefined, null, "", 42, {}])("actorUserId %o -> recusa", (actorUserId) => {
    const r = buildAuditEntry({ ...BASE, actorUserId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("actor_em_falta");
  });

  it("não existe autor por omissão — nada de 'sistema' ou 'unknown'", () => {
    const r = buildAuditEntry({ ...BASE, actorUserId: undefined });
    expect(r.entry).toBeUndefined();
    /* Um registo com autor inventado é pior do que não haver registo: parece uma prova. */
  });

  it("com autor, a entrada é construída", () => {
    const r = buildAuditEntry(BASE);
    expect(r.ok).toBe(true);
    expect(r.entry.actorUserId).toBe("user-ana");
    expect(r.entry.companyId).toBe("overcel");
    expect(r.entry.action).toBe(AUDIT_ACTION.COVERAGE_CONFIRMED);
    expect(r.entry.monthKey).toBe("2026-07");
    expect(r.entry.occurredAt).toBe("2026-08-26T14:30:00.000Z");
  });
});

describe("relógio injetado", () => {
  it.each([undefined, null, "2026-08-26", new Date("nada")])("relógio %o -> recusa", (now) => {
    expect(buildAuditEntry({ ...BASE, now }).reason).toBe("relogio_em_falta");
  });
});

describe("lista fechada de ações", () => {
  it("uma ação desconhecida é recusada", () => {
    expect(buildAuditEntry({ ...BASE, action: "apagar_tudo" }).reason).toBe("acao_desconhecida");
    expect(buildAuditEntry({ ...BASE, action: undefined }).reason).toBe("acao_desconhecida");
  });

  it("todas as ações declaradas são aceites", () => {
    for (const acao of Object.values(AUDIT_ACTION)) {
      expect(buildAuditEntry({ ...BASE, action: acao }).ok).toBe(true);
    }
  });
});

describe("monthKey", () => {
  it.each(["julho", "2026-13", "2026-7", "", null, 202607])("%o vira null em vez de entrar cru", (mk) => {
    expect(buildAuditEntry({ ...BASE, monthKey: mk }).entry.monthKey).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * METADATA: LISTA DE PERMISSÃO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("metadata", () => {
  it("só as chaves permitidas para a ação entram", () => {
    const r = buildAuditEntry({
      ...BASE,
      metadata: { source: "payables", previousMonthKey: "2026-06", segredo: "x", ip: "1.2.3.4" },
    });
    expect(r.entry.metadata).toEqual({ source: "payables", previousMonthKey: "2026-06" });
  });

  it("valores não escalares são descartados", () => {
    const r = buildAuditEntry({ ...BASE, metadata: { source: { a: 1 }, previousMonthKey: ["x"] } });
    expect(r.entry.metadata).toEqual({});
  });

  it("o TEXTO da nota nunca entra — só o seu comprimento", () => {
    /* A nota é escrita por uma pessoa e pode conter o que lhe apetecer. O Apps Script
     * já vive sob esta regra (`logSemPII.test.js`); o registo que o substitui não pode
     * ser mais permissivo. */
    const r = buildAuditEntry({
      ...BASE,
      metadata: { noteLength: 18, note: "faturas do José Silva, NIF 123456789" },
    });
    expect(r.entry.metadata).toEqual({ noteLength: 18 });
    expect(JSON.stringify(r.entry)).not.toContain("José");
    expect(JSON.stringify(r.entry)).not.toContain("123456789");
  });

  it("sem metadata, a entrada tem um objeto vazio e não `undefined`", () => {
    expect(buildAuditEntry(BASE).entry.metadata).toEqual({});
    expect(buildAuditEntry({ ...BASE, metadata: "x" }).entry.metadata).toEqual({});
  });

  it("null é preservado (é uma afirmação: não havia valor anterior)", () => {
    const r = buildAuditEntry({
      ...BASE, action: AUDIT_ACTION.CMV_UPSERTED, metadata: { previousValue: null, value: 12000 },
    });
    expect(r.entry.metadata).toEqual({ previousValue: null, value: 12000 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * RECUSAS
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("registo de acessos recusados", () => {
  it("uma recusa anónima é registada com autor null, e isso é correto", () => {
    const decisao = { decision: AUTHZ.UNAUTHENTICATED, reason: AUTHZ_REASON.TOKEN_AUSENTE, userId: null, companyId: null };
    const r = buildAccessDeniedEntry({ decision: decisao, companyId: "empresa-b", now: AGORA });
    expect(r.ok).toBe(true);
    expect(r.entry.actorUserId).toBeNull();
    expect(r.entry.action).toBe(AUDIT_ACTION.ACCESS_DENIED);
  });

  it("guarda o companyId PEDIDO, que é o padrão que interessa detetar", () => {
    /* Uma sequência de 403 do mesmo utilizador contra ids diferentes é exatamente o
     * padrão de quem anda a testar empresas. */
    const decisao = {
      decision: AUTHZ.FORBIDDEN, reason: AUTHZ_REASON.SEM_MEMBERSHIP,
      userId: "user-ana", companyId: null, capability: CAPABILITIES.READ_FINANCIAL_DATA,
    };
    const r = buildAccessDeniedEntry({ decision: decisao, companyId: "empresa-do-concorrente", now: AGORA });
    expect(r.entry.actorUserId).toBe("user-ana");
    expect(r.entry.metadata.requestedCompanyId).toBe("empresa-do-concorrente");
    expect(r.entry.metadata.reason).toBe(AUTHZ_REASON.SEM_MEMBERSHIP);
    expect(r.entry.metadata.capability).toBe(CAPABILITIES.READ_FINANCIAL_DATA);
  });

  it("sem relógio, recusa", () => {
    expect(buildAccessDeniedEntry({ decision: {}, now: null }).ok).toBe(false);
  });
});
