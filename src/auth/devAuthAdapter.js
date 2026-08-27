// src/auth/devAuthAdapter.js
// AUTENTICAÇÃO SIMULADA — EXCLUSIVAMENTE PARA DESENVOLVIMENTO.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ESTE FICHEIRO CONCEDE SESSÕES SEM VERIFICAR CREDENCIAIS.
// SE ELE CORRER EM PRODUÇÃO, NÃO HÁ AUTENTICAÇÃO NENHUMA.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ─── AS TRÊS BARREIRAS ──────────────────────────────────────────────────────────────
//   1. `assertDevAuthAllowed` LANÇA se o ambiente se declarar de produção. É a primeira
//      instrução do construtor, antes de existir sequer um objeto.
//   2. `resolveAuthMode` nunca devolve `dev` em produção, pelo que o construtor não
//      chega a ser chamado (`authMode.js`).
//   3. `authAdapters.js` só o importa dentro de `import.meta.env.DEV`, ramo que o
//      Rollup elimina do bundle de produção. `bundleSemAuthSimulada.test.js` lê o
//      bundle construído e falha se a sentinela abaixo lá aparecer.
//
// ─── O QUE ISTO NÃO FAZ, DE PROPÓSITO ───────────────────────────────────────────────
// Não guarda autorização no browser. As memberships são CONSTANTES COMPILADAS neste
// ficheiro. O `sessionStorage` guarda um id de utilizador de fixture e mais nada — e
// esse id é validado contra as fixtures antes de valer o que quer que seja. Editar o
// `sessionStorage` para "sou dono da empresa-b" não faz nada, porque não existe caminho
// nenhum entre o storage e a lista de memberships.
//
// E, mais importante: mesmo em desenvolvimento, o BFF volta a verificar tudo. Esta
// camada engana a interface, nunca o servidor.

import { assertDevAuthAllowed } from "./authMode.js";
import { SIGN_IN_ERROR } from "./authAdapterPort.js";
import { ROLES } from "./authorizationCore.js";

/* SENTINELA. Uma cadeia improvável, única neste ficheiro, que o teste do bundle
 * procura. Se este texto aparecer num `dist/` de produção, o ramo morto não foi
 * eliminado e a autenticação simulada foi enviada para o mundo. */
export const SENTINELA_AUTH_SIMULADA = "FINER_ONE__AUTENTICACAO_SIMULADA__NAO_PODE_IR_PARA_PRODUCAO";

/* ─────────────────────────────────────────────────────────────────────────────────
 * FIXTURES
 *
 * `overcel` espelha a empresa real APENAS na identificação (id, nome, moeda, locale) —
 * o que é preciso para que a aplicação corra sobre os dados reais durante o
 * desenvolvimento, como corre hoje.
 *
 * `empresa-exemplo` NÃO é uma segunda empresa real e não pretende sê-lo. Existe para um
 * fim só: exercer o seletor de empresas e provar que o isolamento funciona. Não tem
 * integração, não tem dados e o nome di-lo por extenso.
 * ───────────────────────────────────────────────────────────────────────────────── */

export const EMPRESAS_FIXTURE = {
  overcel: {
    companyId: "overcel",
    name: "Overcel",
    currency: "BRL",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    plan: "plus",
    status: "ativa",
  },
  "empresa-exemplo": {
    companyId: "empresa-exemplo",
    name: "Empresa Exemplo (fixture)",
    currency: "EUR",
    locale: "pt-PT",
    timezone: "Europe/Lisbon",
    plan: "base",
    status: "ativa",
  },
};

/**
 * Utilizadores de desenvolvimento. Cada um existe para exercer um estado do produto que
 * de outra forma só apareceria em produção — e que é preciso poder ver antes disso.
 */
export const UTILIZADORES_FIXTURE = [
  {
    id: "dev-user-overcel",
    email: "dev@finer.local",
    name: "Programador Overcel",
    descricao: "Uma empresa. Entra direto, sem seletor.",
    memberships: [{ companyId: "overcel", role: ROLES.OWNER }],
  },
  {
    id: "dev-user-multi",
    email: "multi@finer.local",
    name: "Utilizador Multiempresa",
    descricao: "Duas empresas. Exercita o seletor e o isolamento.",
    memberships: [
      { companyId: "overcel", role: ROLES.MEMBER },
      { companyId: "empresa-exemplo", role: ROLES.VIEWER },
    ],
  },
  {
    id: "dev-user-viewer",
    email: "consulta@finer.local",
    name: "Contabilista Externo",
    descricao: "Só consulta. Não pode confirmar cobertura nem introduzir CMV.",
    memberships: [{ companyId: "overcel", role: ROLES.VIEWER }],
  },
  {
    id: "dev-user-sem-acesso",
    email: "sem-acesso@finer.local",
    name: "Conta Sem Empresa",
    descricao: "Autenticado e sem memberships. Exercita o ecrã de acesso não configurado.",
    memberships: [],
  },
];

const POR_EMAIL = new Map(UTILIZADORES_FIXTURE.map((u) => [u.email.toLowerCase(), u]));
const POR_ID = new Map(UTILIZADORES_FIXTURE.map((u) => [u.id, u]));

/** Expande as memberships de uma fixture para o shape que o contrato de sessão espera. */
function empresasDe(fixture) {
  return fixture.memberships
    .map((m) => {
      const empresa = EMPRESAS_FIXTURE[m.companyId];
      if (!empresa) return null;          // membership para empresa que não existe: descartada
      return { ...empresa, role: m.role, userId: fixture.id };
    })
    .filter(Boolean);
}

const CHAVE_SESSAO = "finer-one.dev-auth.user-id";

/** Armazenamento seguro: um browser sem storage (modo privado, iframe) não deve
 *  impedir o desenvolvimento — degrada para memória. */
function storageSeguro(storage) {
  if (storage) return storage;
  try {
    if (typeof globalThis !== "undefined" && globalThis.sessionStorage) return globalThis.sessionStorage;
  } catch { /* acesso negado: cai para memória */ }
  const memoria = new Map();
  return {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => { memoria.set(k, String(v)); },
    removeItem: (k) => { memoria.delete(k); },
  };
}

/**
 * Cria o adaptador simulado.
 *
 * @param {{env?: object, storage?: object}} opts  `env` INJETADO para que o teste possa
 *   apresentar um ambiente de produção e verificar que isto se recusa a existir.
 * @throws  Se o ambiente se declarar de produção.
 */
export function createDevAuthAdapter({ env, storage } = {}) {
  // BARREIRA 1. Antes de tudo o resto, e sem degradação elegante possível.
  assertDevAuthAllowed(env);

  const store = storageSeguro(storage);
  const ouvintes = new Set();

  /* O id lido do storage é SÓ uma pista. Vale se — e apenas se — corresponder a uma
   * fixture compilada. Um id inventado à mão não produz sessão nenhuma. */
  function fixtureAtual() {
    let id = null;
    try { id = store.getItem(CHAVE_SESSAO); } catch { id = null; }
    if (typeof id !== "string" || id === "") return null;
    return POR_ID.get(id) || null;
  }

  function sessaoDe(fixture) {
    if (!fixture) return null;
    return {
      user: { id: fixture.id, email: fixture.email, name: fixture.name },
      companies: empresasDe(fixture),
    };
  }

  function notificar() {
    const sessao = sessaoDe(fixtureAtual());
    for (const cb of ouvintes) {
      try { cb(sessao); } catch { /* um ouvinte partido não derruba os outros */ }
    }
  }

  return {
    id: "dev",
    simulated: true,
    /* A sentinela viaja no objeto para que não possa ser eliminada por engano sem que
     * o teste do bundle deixe de a procurar por engano também. */
    sentinela: SENTINELA_AUTH_SIMULADA,

    /** As fixtures, para o ecrã de login as poder listar. Só existe no adaptador dev. */
    fixtures: UTILIZADORES_FIXTURE.map((u) => ({
      id: u.id, email: u.email, name: u.name, descricao: u.descricao,
      empresas: u.memberships.length,
    })),

    async getSession() {
      return sessaoDe(fixtureAtual());
    },

    onAuthStateChange(cb) {
      if (typeof cb !== "function") return () => {};
      ouvintes.add(cb);
      return () => { ouvintes.delete(cb); };
    },

    /**
     * "Login" simulado: a palavra-passe é IGNORADA e isso está escrito no ecrã.
     * O email tem de corresponder a uma fixture — não porque valide alguém, mas porque
     * um email qualquer produziria um utilizador sem memberships e faria parecer que a
     * aplicação está avariada.
     */
    async signIn({ email } = {}) {
      if (typeof email !== "string" || email.trim() === "") {
        return { ok: false, code: SIGN_IN_ERROR.CAMPOS_EM_FALTA };
      }
      const fixture = POR_EMAIL.get(email.trim().toLowerCase());
      if (!fixture) return { ok: false, code: SIGN_IN_ERROR.CREDENCIAIS_INVALIDAS };
      try { store.setItem(CHAVE_SESSAO, fixture.id); } catch { /* memória */ }
      notificar();
      return { ok: true };
    },

    async signOut() {
      try { store.removeItem(CHAVE_SESSAO); } catch { /* memória */ }
      notificar();
    },

    /**
     * Token simulado. Formato deliberadamente NÃO-JWT: um token que se parecesse com um
     * JWT poderia ser aceite por engano por um verificador mal configurado. Este só é
     * aceite por `createDevTokenVerifier`, que por sua vez também se recusa a existir
     * em produção.
     */
    async getAccessToken() {
      const fixture = fixtureAtual();
      return fixture ? `dev-token:${fixture.id}` : null;
    },
  };
}

/** Prefixo dos tokens simulados. Exportado para o verificador do BFF em desenvolvimento. */
export const PREFIXO_TOKEN_DEV = "dev-token:";

/**
 * Verificador de tokens simulados, para o BFF em desenvolvimento.
 *
 * Existe para que a cadeia completa (browser -> BFF -> autorização) seja exercível
 * localmente sem provider externo. Tem a MESMA guarda de produção que o adaptador: um
 * verificador que aceite `dev-token:qualquer-coisa` num servidor de produção é uma
 * personificação universal.
 */
export function createDevTokenVerifier({ env } = {}) {
  assertDevAuthAllowed(env);
  return async function verifyDevToken(token) {
    if (typeof token !== "string" || !token.startsWith(PREFIXO_TOKEN_DEV)) {
      return { ok: false, reason: "token_invalido" };
    }
    const id = token.slice(PREFIXO_TOKEN_DEV.length);
    if (!POR_ID.has(id)) return { ok: false, reason: "token_invalido" };
    return { ok: true, userId: id, expiresAt: null };
  };
}

/** Memberships de uma fixture, no shape que `authorizeCompanyRequest` espera.
 *  É o `loadMemberships` do BFF em desenvolvimento. */
export function createDevMembershipLoader({ env } = {}) {
  assertDevAuthAllowed(env);
  return async function loadDevMemberships(userId) {
    const fixture = POR_ID.get(userId);
    if (!fixture) return [];
    return fixture.memberships.map((m) => ({ userId, companyId: m.companyId, role: m.role }));
  };
}
