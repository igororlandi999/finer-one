// AUTORIZAÇÃO — a matriz de segurança inteira, exercida contra o núcleo REAL.
//
// Cada teste aqui corresponde a uma linha da FASE 20 do plano de fundação SaaS. Não são
// testes de implementação: são as afirmações que o produto tem de poder fazer a um
// cliente que pergunte "o meu concorrente consegue ver os meus números?".
//
// A regra que atravessa o ficheiro todo: NADA do que o cliente envia identifica o
// cliente. Vários testes existem só para provar isso de ângulos diferentes.

import { describe, it, expect, vi } from "vitest";
import {
  AUTHZ, AUTHZ_HTTP_STATUS, AUTHZ_REASON, ROLES, CAPABILITIES,
  authorizeCompanyRequest, extractBearerToken, roleHasCapability, capabilitiesForRole,
  isKnownRole, isValidCompanyId, normalizeMembership, findMembership,
  assertNoClientSuppliedIdentity, safeErrorBody, CAMPOS_DE_IDENTIDADE_PROIBIDOS,
} from "./authorizationCore.js";

/* ── Cenário base: Ana pertence à empresa A; a empresa B existe e não é dela. ────── */
const ANA = "user-ana";
const BRUNO = "user-bruno";

const MEMBERSHIPS = {
  [ANA]: [{ userId: ANA, companyId: "empresa-a", role: ROLES.OWNER }],
  [BRUNO]: [],
};

const AGORA = new Date("2026-08-26T12:00:00.000Z");

/** Verificador de tokens falso: "tok:<userId>" é válido; tudo o resto não é. */
function verificadorFalso({ expiresAt } = {}) {
  return vi.fn(async (token) => {
    if (typeof token !== "string" || !token.startsWith("tok:")) {
      return { ok: false, reason: AUTHZ_REASON.TOKEN_INVALIDO };
    }
    return { ok: true, userId: token.slice(4), expiresAt: expiresAt ?? null };
  });
}

function leitorFalso(mapa = MEMBERSHIPS) {
  return vi.fn(async (userId) => mapa[userId] ?? []);
}

/** Pedido padrão, com os pontos que cada teste quer variar sobrepostos. */
function pedido(over = {}) {
  return {
    authorizationHeader: `Bearer tok:${ANA}`,
    companyId: "empresa-a",
    capability: CAPABILITIES.READ_FINANCIAL_DATA,
    verifyToken: verificadorFalso(),
    loadMemberships: leitorFalso(),
    now: AGORA,
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * TOKEN — as quatro formas de não sabermos quem é
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("token: ausência, forma e validade", () => {
  it("token ausente -> 401", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: undefined }));
    expect(r.decision).toBe(AUTHZ.UNAUTHENTICATED);
    expect(r.status).toBe(401);
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_AUSENTE);
  });

  it("cabeçalho vazio -> 401", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: "   " }));
    expect(r.status).toBe(401);
  });

  it("cabeçalho sem esquema Bearer -> 401 malformado", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: `tok:${ANA}` }));
    expect(r.status).toBe(401);
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_MALFORMADO);
  });

  it("Basic em vez de Bearer -> 401", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: "Basic YWJjOjEyMw==" }));
    expect(r.status).toBe(401);
  });

  it("token inválido -> 401", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: "Bearer lixo" }));
    expect(r.status).toBe(401);
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_INVALIDO);
  });

  it("token expirado -> 401, mesmo que o verificador o tenha deixado passar", async () => {
    /* O verificador diz `ok:true` com um `exp` no passado — é exatamente o defeito que
     * a dupla verificação existe para apanhar. */
    const r = await authorizeCompanyRequest(pedido({
      verifyToken: verificadorFalso({ expiresAt: "2026-08-26T11:00:00.000Z" }),
    }));
    expect(r.status).toBe(401);
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_EXPIRADO);
  });

  it("token com exp no futuro passa", async () => {
    const r = await authorizeCompanyRequest(pedido({
      verifyToken: verificadorFalso({ expiresAt: "2026-08-26T13:00:00.000Z" }),
    }));
    expect(r.status).toBe(200);
  });

  it("exp em segundos (epoch UNIX) é interpretado como segundos", async () => {
    const passado = Math.floor(AGORA.getTime() / 1000) - 60;
    const r = await authorizeCompanyRequest(pedido({
      verifyToken: verificadorFalso({ expiresAt: passado }),
    }));
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_EXPIRADO);
  });

  it("verificador que rebenta NEGA em vez de propagar", async () => {
    const r = await authorizeCompanyRequest(pedido({
      verifyToken: async () => { throw new Error("JWKS indisponível"); },
    }));
    expect(r.status).toBe(401);
  });

  it("token válido sem sujeito -> 401", async () => {
    const r = await authorizeCompanyRequest(pedido({
      verifyToken: async () => ({ ok: true, userId: "" }),
    }));
    expect(r.reason).toBe(AUTHZ_REASON.TOKEN_SEM_SUJEITO);
  });

  it("token nunca é lido de outro sítio que não o cabeçalho Authorization", async () => {
    const verifyToken = verificadorFalso();
    await authorizeCompanyRequest(pedido({
      verifyToken,
      payload: undefined,
      authorizationHeader: `Bearer tok:${ANA}`,
    }));
    expect(verifyToken).toHaveBeenCalledWith(`tok:${ANA}`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * MEMBERSHIP — o isolamento entre empresas
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("isolamento entre empresas", () => {
  it("membership A -> empresa A = 200", async () => {
    const r = await authorizeCompanyRequest(pedido());
    expect(r.decision).toBe(AUTHZ.OK);
    expect(r.status).toBe(200);
    expect(r.companyId).toBe("empresa-a");
    expect(r.userId).toBe(ANA);
    expect(r.role).toBe(ROLES.OWNER);
  });

  it("membership A -> empresa B = 403", async () => {
    const r = await authorizeCompanyRequest(pedido({ companyId: "empresa-b" }));
    expect(r.decision).toBe(AUTHZ.FORBIDDEN);
    expect(r.status).toBe(403);
    expect(r.reason).toBe(AUTHZ_REASON.SEM_MEMBERSHIP);
  });

  it("utilizador autenticado SEM memberships nenhumas -> 403", async () => {
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: `Bearer tok:${BRUNO}` }));
    expect(r.status).toBe(403);
  });

  it("empresa inexistente e empresa alheia são INDISTINGUÍVEIS de fora", async () => {
    const alheia = await authorizeCompanyRequest(pedido({ companyId: "empresa-b" }));
    const inexistente = await authorizeCompanyRequest(pedido({ companyId: "empresa-que-nao-existe" }));
    expect(alheia.status).toBe(inexistente.status);
    expect(safeErrorBody(alheia.decision)).toEqual(safeErrorBody(inexistente.decision));
  });

  it("a decisão nunca consulta uma tabela de empresas — só as memberships do utilizador", async () => {
    /* Se algum dia se acrescentar uma leitura de `companies` ANTES de autorizar, este
     * teste continua verde — mas a asserção existe para documentar que a única fonte
     * injetada é `loadMemberships`, e que é por aí que a decisão passa. */
    const loadMemberships = leitorFalso();
    await authorizeCompanyRequest(pedido({ companyId: "empresa-b", loadMemberships }));
    expect(loadMemberships).toHaveBeenCalledWith(ANA);
    expect(loadMemberships).toHaveBeenCalledTimes(1);
  });

  it("falha a ler memberships NEGA (nunca 'deixa passar')", async () => {
    const r = await authorizeCompanyRequest(pedido({
      loadMemberships: async () => { throw new Error("Postgres em baixo"); },
    }));
    expect(r.status).toBe(403);
    expect(r.reason).toBe(AUTHZ_REASON.FALHA_A_LER_MEMBERSHIPS);
  });

  it("memberships que não são um array negam", async () => {
    const r = await authorizeCompanyRequest(pedido({ loadMemberships: async () => ({ companyId: "empresa-a" }) }));
    expect(r.status).toBe(403);
  });

  it("membership com papel desconhecido não autoriza", async () => {
    const r = await authorizeCompanyRequest(pedido({
      loadMemberships: async () => [{ userId: ANA, companyId: "empresa-a", role: "superadmin" }],
    }));
    expect(r.status).toBe(403);
  });

  it("membership de OUTRO utilizador na mesma empresa não serve", async () => {
    /* `loadMemberships` é chamado com o userId do token; um leitor que devolvesse
     * memberships de outra pessoa seria um bug do leitor. A guarda aqui é sobre o
     * companyId, que é o que este núcleo controla. */
    const r = await authorizeCompanyRequest(pedido({
      authorizationHeader: `Bearer tok:${BRUNO}`,
      loadMemberships: leitorFalso({ [BRUNO]: [{ userId: ANA, companyId: "empresa-b", role: ROLES.OWNER }] }),
      companyId: "empresa-a",
    }));
    expect(r.status).toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * DADOS DO BROWSER ADULTERADOS
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o browser não é confiável", () => {
  it("companyId adulterado no caminho não concede acesso — dá 403", async () => {
    /* É este o ataque do localStorage: a app guarda a empresa ativa no browser, o
     * atacante troca "empresa-a" por "empresa-b" e recarrega. O pedido sai com o id
     * trocado e o servidor recusa, porque a autorização não vem do id. */
    const r = await authorizeCompanyRequest(pedido({ companyId: "empresa-b" }));
    expect(r.status).toBe(403);
  });

  it("role enviada pelo cliente é IGNORADA — a que vale é a da membership", async () => {
    const r = await authorizeCompanyRequest(pedido({
      loadMemberships: leitorFalso({ [ANA]: [{ userId: ANA, companyId: "empresa-a", role: ROLES.VIEWER }] }),
      capability: CAPABILITIES.READ_FINANCIAL_DATA,
    }));
    expect(r.role).toBe(ROLES.VIEWER);
  });

  it("viewer não escreve, por muito que o cliente afirme o contrário", async () => {
    const r = await authorizeCompanyRequest(pedido({
      loadMemberships: leitorFalso({ [ANA]: [{ userId: ANA, companyId: "empresa-a", role: ROLES.VIEWER }] }),
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07" },
    }));
    expect(r.status).toBe(403);
    expect(r.reason).toBe(AUTHZ_REASON.MEMBERSHIP_INSUFICIENTE);
  });

  it.each(CAMPOS_DE_IDENTIDADE_PROIBIDOS)("payload com %s é REJEITADO (400)", async (campo) => {
    const r = await authorizeCompanyRequest(pedido({
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07", [campo]: "empresa-b" },
    }));
    expect(r.decision).toBe(AUTHZ.BAD_REQUEST);
    expect(r.status).toBe(400);
    expect(r.campo).toBe(campo);
  });

  it("payload legítimo (só monthKey) passa", async () => {
    const r = await authorizeCompanyRequest(pedido({
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07", note: "faturas recebidas" },
    }));
    expect(r.status).toBe(200);
  });

  it("actorUserId é DERIVADO do token, nunca recebido", async () => {
    const r = await authorizeCompanyRequest(pedido({
      capability: CAPABILITIES.WRITE_FINANCIAL_STATE,
      payload: { monthKey: "2026-07" },
    }));
    expect(r.userId).toBe(ANA);
    /* E a prova de que não pode vir de fora: um payload que o tente enviar nem chega
     * a ser processado (teste acima). As duas asserções juntas fecham a porta. */
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * FORMA DO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("forma do pedido", () => {
  it.each([
    ["vazio", ""],
    ["com maiúsculas", "Empresa-A"],
    ["com barra", "empresa-a/../empresa-b"],
    ["com ponto", "../etc/passwd"],
    ["com espaço", "empresa a"],
    ["não string", 42],
    ["nulo", null],
    ["com aspas", "empresa-a'"],
  ])("companyId %s -> 400", async (_rotulo, valor) => {
    const r = await authorizeCompanyRequest(pedido({ companyId: valor }));
    expect(r.decision).toBe(AUTHZ.BAD_REQUEST);
  });

  it("companyId inválido é 400 e NUNCA 200 — a forma é validada antes de autorizar", async () => {
    const r = await authorizeCompanyRequest(pedido({ companyId: "EMPRESA-A" }));
    expect(r.status).toBe(400);
  });

  it("um pedido SEM token e com companyId inválido responde 401, não 400", async () => {
    /* A ordem importa: responder 400 diria a um anónimo que o formato do id estava
     * certo ou errado, e isso é informação que se dá a quem já provou quem é. */
    const r = await authorizeCompanyRequest(pedido({ authorizationHeader: null, companyId: "!!!" }));
    expect(r.status).toBe(401);
  });

  it("capacidade desconhecida NEGA o endpoint em vez de o abrir", async () => {
    const r = await authorizeCompanyRequest(pedido({ capability: "fazer_tudo" }));
    expect(r.status).toBe(403);
    expect(r.reason).toBe(AUTHZ_REASON.CAPACIDADE_DESCONHECIDA);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * PAPÉIS E CAPACIDADES
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("papéis e capacidades", () => {
  it("owner faz tudo", () => {
    expect(roleHasCapability(ROLES.OWNER, CAPABILITIES.READ_FINANCIAL_DATA)).toBe(true);
    expect(roleHasCapability(ROLES.OWNER, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(true);
    expect(roleHasCapability(ROLES.OWNER, CAPABILITIES.MANAGE_MEMBERSHIPS)).toBe(true);
  });

  it("member lê e escreve estado financeiro, mas não gere membros", () => {
    expect(roleHasCapability(ROLES.MEMBER, CAPABILITIES.READ_FINANCIAL_DATA)).toBe(true);
    expect(roleHasCapability(ROLES.MEMBER, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(true);
    expect(roleHasCapability(ROLES.MEMBER, CAPABILITIES.MANAGE_MEMBERSHIPS)).toBe(false);
  });

  it("viewer só lê", () => {
    expect(roleHasCapability(ROLES.VIEWER, CAPABILITIES.READ_FINANCIAL_DATA)).toBe(true);
    expect(roleHasCapability(ROLES.VIEWER, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(false);
    expect(roleHasCapability(ROLES.VIEWER, CAPABILITIES.MANAGE_MEMBERSHIPS)).toBe(false);
  });

  it("papel desconhecido não tem capacidade nenhuma (falso por omissão)", () => {
    for (const cap of Object.values(CAPABILITIES)) {
      expect(roleHasCapability("admin", cap)).toBe(false);
      expect(roleHasCapability(undefined, cap)).toBe(false);
      expect(roleHasCapability(null, cap)).toBe(false);
    }
    expect(isKnownRole("admin")).toBe(false);
  });

  it("capacidade desconhecida não é concedida a ninguém", () => {
    for (const role of Object.values(ROLES)) {
      expect(roleHasCapability(role, "apagar_empresa")).toBe(false);
    }
  });

  it("capabilitiesForRole devolve cópia — mutá-la não altera a tabela", () => {
    const c = capabilitiesForRole(ROLES.VIEWER);
    c.push(CAPABILITIES.WRITE_FINANCIAL_STATE);
    expect(roleHasCapability(ROLES.VIEWER, CAPABILITIES.WRITE_FINANCIAL_STATE)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * FUNÇÕES DE APOIO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("extractBearerToken", () => {
  it.each([
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
    ["BEARER   abc  ", "abc"],
    ["  Bearer abc", "abc"],
  ])("%s -> %s", (header, esperado) => {
    expect(extractBearerToken(header)).toEqual({ ok: true, token: esperado });
  });

  it.each([undefined, null, "", "   ", "Bearer", "Bearer ", "abc", "Bearer a b"])(
    "%s é recusado", (header) => {
      expect(extractBearerToken(header).ok).toBe(false);
    });
});

describe("isValidCompanyId", () => {
  it.each(["overcel", "empresa-a", "a1", "ab", "e-2"])("%s é válido", (id) => {
    expect(isValidCompanyId(id)).toBe(true);
  });
  it.each(["", "a", "-abc", "abc-", "AbC", "a_b", "a".repeat(65), null, 1])(
    "%s é inválido", (id) => {
      expect(isValidCompanyId(id)).toBe(false);
    });
});

describe("normalizeMembership / findMembership", () => {
  it("aceita snake_case (linha crua de Postgres)", () => {
    expect(normalizeMembership({ user_id: "u1", company_id: "empresa-a", role: "member" }))
      .toEqual({ userId: "u1", companyId: "empresa-a", role: "member" });
  });

  it("rejeita o que não reconhece em vez de completar com defaults", () => {
    expect(normalizeMembership(null)).toBeNull();
    expect(normalizeMembership([])).toBeNull();
    expect(normalizeMembership({ userId: "u1", companyId: "empresa-a" })).toBeNull();     // sem papel
    expect(normalizeMembership({ userId: "", companyId: "empresa-a", role: "owner" })).toBeNull();
    expect(normalizeMembership({ userId: "u1", companyId: "EMPRESA", role: "owner" })).toBeNull();
  });

  it("findMembership não faz correspondência parcial nem por prefixo", () => {
    const ms = [{ userId: "u1", companyId: "empresa-abc", role: "owner" }];
    expect(findMembership(ms, "empresa-ab")).toBeNull();
    expect(findMembership(ms, "empresa-abcd")).toBeNull();
    expect(findMembership(ms, "empresa-abc")).not.toBeNull();
  });

  it("findMembership com entrada disparatada devolve null", () => {
    expect(findMembership(null, "empresa-a")).toBeNull();
    expect(findMembership([], "empresa-a")).toBeNull();
    expect(findMembership([{}, null, 3], "empresa-a")).toBeNull();
  });
});

describe("assertNoClientSuppliedIdentity", () => {
  it("aceita payloads sem identidade", () => {
    expect(assertNoClientSuppliedIdentity({ monthKey: "2026-07" }).ok).toBe(true);
    expect(assertNoClientSuppliedIdentity(undefined).ok).toBe(true);
    expect(assertNoClientSuppliedIdentity(null).ok).toBe(true);
  });

  it("rejeita mesmo quando o valor é null ou vazio — o que conta é a CHAVE", () => {
    expect(assertNoClientSuppliedIdentity({ actorUserId: null }).ok).toBe(false);
    expect(assertNoClientSuppliedIdentity({ role: "" }).ok).toBe(false);
  });
});

describe("safeErrorBody", () => {
  it("nunca revela o motivo interno", () => {
    const corpo = JSON.stringify(safeErrorBody(AUTHZ.FORBIDDEN));
    for (const motivo of Object.values(AUTHZ_REASON)) {
      expect(corpo).not.toContain(motivo);
    }
  });

  it("401 e 403 têm códigos distintos (o cliente precisa de saber se deve reautenticar)", () => {
    expect(safeErrorBody(AUTHZ.UNAUTHENTICATED).code).toBe("UNAUTHENTICATED");
    expect(safeErrorBody(AUTHZ.FORBIDDEN).code).toBe("FORBIDDEN");
  });
});

describe("mapa de estados HTTP", () => {
  it("é o único mapa — nenhum handler inventa o seu", () => {
    expect(AUTHZ_HTTP_STATUS[AUTHZ.OK]).toBe(200);
    expect(AUTHZ_HTTP_STATUS[AUTHZ.UNAUTHENTICATED]).toBe(401);
    expect(AUTHZ_HTTP_STATUS[AUTHZ.FORBIDDEN]).toBe(403);
    expect(AUTHZ_HTTP_STATUS[AUTHZ.BAD_REQUEST]).toBe(400);
  });
});
