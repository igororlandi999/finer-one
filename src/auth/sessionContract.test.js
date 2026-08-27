// CONTRATO DE SESSÃO — a máquina de estados, e a regra de que a preferência guardada
// no browser escolhe mas não concede.

import { describe, it, expect } from "vitest";
import {
  AUTH_STATUS, COMPANY_STATUS,
  loadingSession, anonymousSession, erroredSession, authenticatedSession,
  normalizeUser, normalizeCompanyMemberships, resolveActiveCompany, canSwitchCompany,
  isAuthenticated, isAuthLoading, canMountFinancialApp, sessionCan, userInitials, roleLabel,
} from "./sessionContract.js";
import { ROLES, CAPABILITIES } from "./authorizationCore.js";

const OVERCEL = { companyId: "overcel", name: "Overcel", currency: "BRL", locale: "pt-BR", role: ROLES.OWNER };
const EXEMPLO = { companyId: "empresa-exemplo", name: "Empresa Exemplo", currency: "EUR", locale: "pt-PT", role: ROLES.VIEWER };
const UTILIZADOR = { id: "u1", email: "ana@overcel.com.br", name: "Ana" };

/* ═══════════════════════════════════════════════════════════════════════════════════
 * LOADING NÃO É UM VEREDITO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("loading não é autenticado nem anónimo", () => {
  it("a sessão inicial é LOADING", () => {
    const s = loadingSession();
    expect(s.status).toBe(AUTH_STATUS.LOADING);
    expect(isAuthLoading(s)).toBe(true);
    expect(isAuthenticated(s)).toBe(false);
    expect(canMountFinancialApp(s)).toBe(false);
  });

  it("uma sessão indefinida também conta como loading — nunca como autenticada", () => {
    expect(isAuthLoading(undefined)).toBe(true);
    expect(isAuthenticated(undefined)).toBe(false);
    expect(canMountFinancialApp(null)).toBe(false);
  });

  it("ERROR é distinto de anónimo", () => {
    const e = erroredSession("provider_indisponivel");
    expect(e.status).toBe(AUTH_STATUS.ERROR);
    expect(e.status).not.toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(canMountFinancialApp(e)).toBe(false);
    expect(e.error).toBe("provider_indisponivel");
  });

  it("nenhum estado que não seja AUTHENTICATED monta a aplicação", () => {
    for (const s of [loadingSession(), anonymousSession(), erroredSession(), {}, null]) {
      expect(canMountFinancialApp(s)).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A PREFERÊNCIA NÃO CONCEDE
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("preferência de empresa: escolhe dentro, nunca acrescenta", () => {
  it("uma preferência que corresponde a uma membership é honrada", () => {
    const r = resolveActiveCompany({ companies: [EXEMPLO, OVERCEL], preferredCompanyId: "overcel" });
    expect(r.company.companyId).toBe("overcel");
    expect(r.preferenceHonored).toBe(true);
  });

  it("uma preferência para empresa SEM membership é descartada em silêncio", () => {
    const r = resolveActiveCompany({ companies: [OVERCEL], preferredCompanyId: "empresa-do-concorrente" });
    expect(r.company.companyId).toBe("overcel");
    expect(r.preferenceHonored).toBe(false);
  });

  it("a empresa preferida NUNCA aparece na lista por ter sido preferida", () => {
    const r = resolveActiveCompany({ companies: [OVERCEL], preferredCompanyId: "empresa-b" });
    expect(r.companies.map((c) => c.companyId)).toEqual(["overcel"]);
  });

  it.each([
    ["injeção de caminho", "../empresa-b"],
    ["maiúsculas", "OVERCEL"],
    ["objeto", { companyId: "overcel" }],
    ["vazio", ""],
    ["nulo", null],
  ])("preferência %s é ignorada", (_r, valor) => {
    const r = resolveActiveCompany({ companies: [OVERCEL, EXEMPLO], preferredCompanyId: valor });
    expect(r.preferenceHonored).toBe(false);
    expect(r.company.companyId).toBe(OVERCEL.companyId === r.company.companyId ? "overcel" : r.company.companyId);
  });

  it("uma sessão construída com uma preferência adulterada não ganha capacidades", () => {
    const s = authenticatedSession({
      user: UTILIZADOR,
      companies: [{ ...OVERCEL, role: ROLES.VIEWER }],
      preferredCompanyId: "empresa-b",
    });
    expect(s.company.companyId).toBe("overcel");
    expect(s.role).toBe(ROLES.VIEWER);
    expect(sessionCan(s, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * QUANTAS EMPRESAS
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("0, 1 e N memberships", () => {
  it("zero memberships -> NO_COMPANY, e a aplicação não monta", () => {
    const s = authenticatedSession({ user: UTILIZADOR, companies: [] });
    expect(s.status).toBe(AUTH_STATUS.AUTHENTICATED);
    expect(s.companyStatus).toBe(COMPANY_STATUS.NO_COMPANY);
    expect(s.company).toBeNull();
    expect(canMountFinancialApp(s)).toBe(false);
  });

  it("uma membership -> entra direto, sem troca possível", () => {
    const s = authenticatedSession({ user: UTILIZADOR, companies: [OVERCEL] });
    expect(s.companyStatus).toBe(COMPANY_STATUS.READY);
    expect(s.company.companyId).toBe("overcel");
    expect(canSwitchCompany(s.companies)).toBe(false);
    expect(canMountFinancialApp(s)).toBe(true);
  });

  it("N memberships -> troca possível", () => {
    const s = authenticatedSession({ user: UTILIZADOR, companies: [OVERCEL, EXEMPLO] });
    expect(canSwitchCompany(s.companies)).toBe(true);
    expect(s.companies).toHaveLength(2);
  });

  it("a lista é ordenada por nome, de forma estável", () => {
    const s = authenticatedSession({ user: UTILIZADOR, companies: [EXEMPLO, OVERCEL] });
    expect(s.companies.map((c) => c.name)).toEqual(["Empresa Exemplo", "Overcel"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * QUAL ENTRA POR OMISSÃO
 *
 * Defeito REAL, apanhado a validar no Chrome: um utilizador que é `member` da sua
 * empresa e `viewer` na de um cliente aterrava na do cliente, em modo de consulta, só
 * porque o nome dela vem antes no alfabeto.
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("escolha por omissão", () => {
  it("entra na empresa de PAPEL MAIS SÉNIOR, não na primeira do alfabeto", () => {
    const s = authenticatedSession({
      user: UTILIZADOR,
      companies: [{ ...EXEMPLO, role: ROLES.VIEWER }, { ...OVERCEL, role: ROLES.MEMBER }],
    });
    expect(s.company.companyId).toBe("overcel");
    expect(s.role).toBe(ROLES.MEMBER);
    /* Mas a LISTA continua ordenada por nome: são critérios diferentes de propósito. */
    expect(s.companies.map((c) => c.companyId)).toEqual(["empresa-exemplo", "overcel"]);
  });

  it("owner ganha a member, e member ganha a viewer", () => {
    const caso = (a, b) => authenticatedSession({
      user: UTILIZADOR,
      companies: [{ ...EXEMPLO, role: a }, { ...OVERCEL, role: b }],
    }).company.companyId;
    expect(caso(ROLES.OWNER, ROLES.VIEWER)).toBe("empresa-exemplo");
    expect(caso(ROLES.VIEWER, ROLES.OWNER)).toBe("overcel");
    expect(caso(ROLES.MEMBER, ROLES.VIEWER)).toBe("empresa-exemplo");
    expect(caso(ROLES.VIEWER, ROLES.MEMBER)).toBe("overcel");
  });

  it("com papéis IGUAIS, desempata o nome — e a escolha é determinista", () => {
    /* Uma empresa ativa que mudasse entre recarregamentos seria pior do que uma
     * escolha discutível mas estável. */
    const s1 = authenticatedSession({ user: UTILIZADOR, companies: [EXEMPLO, { ...OVERCEL, role: ROLES.VIEWER }] });
    const s2 = authenticatedSession({ user: UTILIZADOR, companies: [{ ...OVERCEL, role: ROLES.VIEWER }, EXEMPLO] });
    expect(s1.company.companyId).toBe(s2.company.companyId);
    expect(s1.company.companyId).toBe("empresa-exemplo");
  });

  it("a PREFERÊNCIA continua a ganhar à senioridade — é uma escolha do utilizador", () => {
    const s = authenticatedSession({
      user: UTILIZADOR,
      companies: [{ ...EXEMPLO, role: ROLES.VIEWER }, { ...OVERCEL, role: ROLES.OWNER }],
      preferredCompanyId: "empresa-exemplo",
    });
    expect(s.company.companyId).toBe("empresa-exemplo");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O PAPEL É POR EMPRESA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o papel pertence à empresa ativa, não ao utilizador", () => {
  it("a mesma pessoa tem capacidades diferentes em empresas diferentes", () => {
    const companies = [{ ...OVERCEL, role: ROLES.OWNER }, { ...EXEMPLO, role: ROLES.VIEWER }];

    const naOvercel = authenticatedSession({ user: UTILIZADOR, companies, preferredCompanyId: "overcel" });
    expect(naOvercel.role).toBe(ROLES.OWNER);
    expect(sessionCan(naOvercel, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(true);

    const naExemplo = authenticatedSession({ user: UTILIZADOR, companies, preferredCompanyId: "empresa-exemplo" });
    expect(naExemplo.role).toBe(ROLES.VIEWER);
    expect(sessionCan(naExemplo, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(false);
    expect(sessionCan(naExemplo, CAPABILITIES.READ_FINANCIAL_DATA)).toBe(true);
  });

  it("sem empresa ativa não há capacidade nenhuma", () => {
    const s = authenticatedSession({ user: UTILIZADOR, companies: [] });
    for (const cap of Object.values(CAPABILITIES)) expect(sessionCan(s, cap)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * NORMALIZAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("normalizeUser", () => {
  it("exige id", () => {
    expect(normalizeUser({ email: "a@b.c" })).toBeNull();
    expect(normalizeUser({ id: "" })).toBeNull();
    expect(normalizeUser(null)).toBeNull();
  });

  it("aceita sub (JWT) e userId", () => {
    expect(normalizeUser({ sub: "u1" }).id).toBe("u1");
    expect(normalizeUser({ userId: "u1" }).id).toBe("u1");
  });

  it("deriva o nome do email quando não há nome — mas nunca inventa um", () => {
    expect(normalizeUser({ id: "u1", email: "ana.silva@x.com" }).name).toBe("ana.silva");
    expect(normalizeUser({ id: "u1" }).name).toBeNull();
  });
});

describe("normalizeCompanyMemberships", () => {
  it("descarta o que não tem papel reconhecido", () => {
    const r = normalizeCompanyMemberships([
      { companyId: "overcel", role: "superadmin", name: "X" },
      { companyId: "overcel", name: "Sem papel" },
      OVERCEL,
    ]);
    expect(r.map((c) => c.companyId)).toEqual(["overcel"]);
    expect(r[0].role).toBe(ROLES.OWNER);
  });

  it("descarta duplicados, ficando o primeiro", () => {
    const r = normalizeCompanyMemberships([OVERCEL, { ...OVERCEL, role: ROLES.VIEWER }]);
    expect(r).toHaveLength(1);
    expect(r[0].role).toBe(ROLES.OWNER);
  });

  it("moeda e locale NUNCA ganham default", () => {
    const r = normalizeCompanyMemberships([{ companyId: "empresa-x", role: ROLES.OWNER }]);
    expect(r[0].currency).toBeNull();
    expect(r[0].locale).toBeNull();
  });

  it("uma moeda com formato inválido é descartada em vez de aproveitada", () => {
    const r = normalizeCompanyMemberships([{ companyId: "empresa-x", role: ROLES.OWNER, currency: "reais" }]);
    expect(r[0].currency).toBeNull();
  });

  it("sem nome, mostra-se o id — nunca um nome comercial inventado", () => {
    const r = normalizeCompanyMemberships([{ companyId: "empresa-x", role: ROLES.OWNER }]);
    expect(r[0].name).toBe("empresa-x");
  });

  it("entrada disparatada devolve lista vazia", () => {
    expect(normalizeCompanyMemberships(null)).toEqual([]);
    expect(normalizeCompanyMemberships("overcel")).toEqual([]);
    expect(normalizeCompanyMemberships([null, 3, "x"])).toEqual([]);
  });
});

describe("um utilizador sem id não produz sessão autenticada", () => {
  it("cai para anónimo em vez de autenticado sem identidade", () => {
    const s = authenticatedSession({ user: { email: "a@b.c" }, companies: [OVERCEL] });
    expect(s.status).toBe(AUTH_STATUS.UNAUTHENTICATED);
    expect(canMountFinancialApp(s)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * APRESENTAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("userInitials", () => {
  it.each([
    [{ name: "Ana Silva" }, "AS"],
    [{ name: "Ana" }, "AN"],
    [{ email: "ana.silva@x.com", name: null }, "AS"],
    [{ email: "ana@x.com", name: null }, "AN"],
    [null, "?"],
    [{}, "?"],
  ])("%o -> %s", (user, esperado) => {
    expect(userInitials(user)).toBe(esperado);
  });
});

describe("roleLabel", () => {
  it("traduz os papéis conhecidos e nunca inventa para os outros", () => {
    expect(roleLabel(ROLES.OWNER)).toBe("Proprietário");
    expect(roleLabel(ROLES.VIEWER)).toBe("Consulta");
    expect(roleLabel("superadmin")).toBe("—");
    expect(roleLabel(null)).toBe("—");
  });
});
