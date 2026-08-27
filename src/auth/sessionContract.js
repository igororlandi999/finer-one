// src/auth/sessionContract.js
// A SESSÃO, como MÁQUINA DE ESTADOS PURA. Sem React, sem rede, sem storage.
//
// ─── PORQUE ISTO É UM MÓDULO PURO E NÃO LÓGICA DENTRO DO PROVIDER ───────────────────
// O mesmo erro que a C7F corrigiu no dataset repete-se, ipsis verbis, na autenticação:
// arrancar num estado que AFIRMA alguma coisa antes de haver veredito. Um provider que
// comece em `unauthenticated` mostra o ecrã de login a um utilizador que tem sessão
// válida, durante os milissegundos que a leitura demora; um que comece em
// `authenticated` monta a aplicação financeira a quem talvez não tenha sessão nenhuma.
//
// A saída é a mesma de lá: LOADING é a AUSÊNCIA DE VEREDITO, e não é nem um nem outro.
//
// ─── E PORQUE É PURO ────────────────────────────────────────────────────────────────
// Toda a decisão de "que empresa está ativa" é testável sem montar React e sem
// simular um provider de autenticação. É a mesma escolha que já governa
// `manualInputsView`, `closingSummaryView` e `coverageConfirmationView`.

import { ROLES, ROLE_RANK, isKnownRole, isValidCompanyId, normalizeMembership, capabilitiesForRole, roleHasCapability } from "./authorizationCore.js";

export { ROLES, roleHasCapability, capabilitiesForRole };

/* ─────────────────────────────────────────────────────────────────────────────────
 * ESTADOS
 * ───────────────────────────────────────────────────────────────────────────────── */

export const AUTH_STATUS = {
  /** Ainda não há veredito. Não é autenticado nem anónimo. */
  LOADING: "loading",
  /** Há sessão verificada pelo provider. */
  AUTHENTICATED: "authenticated",
  /** Não há sessão. É um facto, não uma avaria. */
  UNAUTHENTICATED: "unauthenticated",
  /** O provider de autenticação falhou (rede, configuração). NÃO é o mesmo que anónimo:
   *  dizer "faça login" a quem não conseguiu sequer perguntar é mentir sobre a causa. */
  ERROR: "error",
};

/** Estado da EMPRESA ativa, dentro de uma sessão autenticada. */
export const COMPANY_STATUS = {
  /** Uma empresa resolvida e autorizada. */
  READY: "ready",
  /** Sessão válida, zero memberships. Conta criada e acesso ainda não configurado. */
  NO_COMPANY: "no_company",
};

/* ─────────────────────────────────────────────────────────────────────────────────
 * NORMALIZAÇÃO
 * ───────────────────────────────────────────────────────────────────────────────── */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Normaliza o utilizador devolvido por um adaptador.
 *
 * O `id` é obrigatório e é o ÚNICO campo com significado de segurança — nome e email
 * são apresentação. Sem id, não há utilizador: devolve `null` em vez de um objeto
 * parcial que passaria por sessão válida.
 */
export function normalizeUser(raw) {
  if (!isPlainObject(raw)) return null;
  const id = raw.id ?? raw.userId ?? raw.sub;
  if (typeof id !== "string" || id === "") return null;
  const email = typeof raw.email === "string" && raw.email !== "" ? raw.email : null;
  const name = typeof raw.name === "string" && raw.name.trim() !== ""
    ? raw.name.trim()
    : (email ? email.split("@")[0] : null);
  return { id, email, name };
}

/**
 * Normaliza a lista de empresas a que o utilizador pertence.
 *
 * Cada entrada junta a membership (autorização) com o mínimo da empresa que a UI
 * precisa para a nomear. O que não passa em `normalizeMembership` é DESCARTADO — uma
 * empresa sem papel reconhecido não aparece no seletor, porque não há nada que o
 * utilizador possa fazer com ela.
 *
 * @returns {Array<{companyId, name, role, currency, locale, timezone, plan}>}
 */
export function normalizeCompanyMemberships(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const vistos = new Set();
  for (const entrada of raw) {
    if (!isPlainObject(entrada)) continue;
    const m = normalizeMembership({
      userId: entrada.userId ?? entrada.user_id ?? "—",
      companyId: entrada.companyId ?? entrada.company_id ?? entrada.id,
      role: entrada.role,
    });
    if (!m) continue;
    if (vistos.has(m.companyId)) continue;   // duplicado: fica a primeira
    vistos.add(m.companyId);
    out.push({
      companyId: m.companyId,
      role: m.role,
      /* Nome: sem ele, mostra-se o id. Nunca se inventa um nome comercial. */
      name: typeof entrada.name === "string" && entrada.name.trim() !== ""
        ? entrada.name.trim() : m.companyId,
      /* Moeda e locale: NUNCA têm default. Um default de moeda é a diferença entre
       * apresentar 84.300 como R$ ou como €, e nenhum dos dois é seguro adivinhar.
       * `null` faz a camada de formatação cair no fallback explícito e documentado. */
      currency: typeof entrada.currency === "string" && entrada.currency.length === 3
        ? entrada.currency.toUpperCase() : null,
      locale: typeof entrada.locale === "string" && entrada.locale !== "" ? entrada.locale : null,
      timezone: typeof entrada.timezone === "string" && entrada.timezone !== "" ? entrada.timezone : null,
      plan: typeof entrada.plan === "string" && entrada.plan !== "" ? entrada.plan : null,
      status: typeof entrada.status === "string" && entrada.status !== "" ? entrada.status : null,
    });
  }
  /* A LISTA é ordenada por NOME: um seletor de empresas é para procurar, e procura-se
   * pelo nome. A senioridade do papel só desempata homónimas.
   *
   * A ordem da lista NÃO decide qual entra por omissão — isso é `escolhaPorOmissao`,
   * abaixo, e são critérios diferentes de propósito. */
  out.sort((a, b) => {
    const n = a.name.localeCompare(b.name, "pt");
    if (n !== 0) return n;
    return (ROLE_RANK[b.role] ?? 0) - (ROLE_RANK[a.role] ?? 0);
  });
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * QUE EMPRESA ESTÁ ATIVA
 * ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Resolve a empresa ativa a partir das memberships e de uma preferência.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * A PREFERÊNCIA NÃO CONCEDE NADA. SÓ ESCOLHE DENTRO DO QUE JÁ FOI CONCEDIDO.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * `preferredCompanyId` vem tipicamente do `localStorage` — ou seja, de um sítio que o
 * utilizador controla por inteiro e pode editar com o inspetor aberto. Por isso é
 * FILTRADO contra a lista de memberships antes de valer o que quer que seja: uma
 * preferência que não corresponda a uma membership é descartada em silêncio, e não é
 * um erro — é alguém que perdeu o acesso, ou que escreveu lá o que lhe apeteceu.
 *
 * E, mesmo depois disto, a empresa escolhida aqui NÃO autoriza nada: o BFF volta a
 * verificar a membership em cada pedido (`authorizeCompanyRequest`). Esta função
 * decide o que MOSTRAR; aquela decide o que ENTREGAR. São camadas distintas de
 * propósito, e é a de baixo que protege os dados.
 *
 * @returns {{status: string, company: object|null, companies: Array, preferenceHonored: boolean}}
 */
/**
 * Qual entra por omissão, quando há várias e nenhuma preferência válida.
 *
 * ─── PORQUE NÃO É "A PRIMEIRA DA LISTA" ─────────────────────────────────────────────
 * A lista está ordenada por nome, e por isso "a primeira" significa "a que começa por
 * uma letra mais cedo no alfabeto" — que não é uma propriedade com significado nenhum.
 * Apanhado a validar no Chrome: um utilizador que é MEMBER da sua empresa e VIEWER na
 * de um cliente aterrava na do cliente, em modo de consulta, e via os botões que
 * conhece desaparecidos sem explicação.
 *
 * O critério certo é a SENIORIDADE do papel: a empresa que a pessoa gere vem primeiro,
 * a que apenas consulta vem depois. Empate resolve-se pelo nome, para que a escolha
 * seja determinista — uma empresa ativa que mude entre recarregamentos seria pior do
 * que uma escolha errada mas estável.
 *
 * É a ÚNICA vez que a senioridade decide alguma coisa. Autorizar continua a ser por
 * capacidade explícita, nunca por comparação de papéis.
 */
function escolhaPorOmissao(lista) {
  let melhor = lista[0];
  for (const c of lista) {
    const r = ROLE_RANK[c.role] ?? 0;
    const rMelhor = ROLE_RANK[melhor.role] ?? 0;
    if (r > rMelhor) melhor = c;
  }
  return melhor;
}

export function resolveActiveCompany({ companies, preferredCompanyId } = {}) {
  const lista = Array.isArray(companies) ? companies : [];

  if (lista.length === 0) {
    return { status: COMPANY_STATUS.NO_COMPANY, company: null, companies: [], preferenceHonored: false };
  }

  let escolhida = null;
  let honrada = false;
  if (isValidCompanyId(preferredCompanyId)) {
    escolhida = lista.find((c) => c.companyId === preferredCompanyId) || null;
    honrada = escolhida !== null;
  }
  /* Uma só membership entra direta; várias, sem preferência válida, entram na de PAPEL
   * MAIS SÉNIOR. */
  if (!escolhida) escolhida = escolhaPorOmissao(lista);

  return { status: COMPANY_STATUS.READY, company: escolhida, companies: lista, preferenceHonored: honrada };
}

/** Pode este utilizador trocar de empresa? Só com mais do que uma. */
export function canSwitchCompany(companies) {
  return Array.isArray(companies) && companies.length > 1;
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * A SESSÃO INTEIRA
 * ───────────────────────────────────────────────────────────────────────────────── */

/** Sessão em LOADING. É o estado inicial obrigatório de qualquer provider. */
export function loadingSession() {
  return {
    status: AUTH_STATUS.LOADING,
    user: null, companies: [], company: null, companyStatus: null,
    role: null, capabilities: [], error: null,
  };
}

/** Sessão anónima — um FACTO, não uma avaria. */
export function anonymousSession() {
  return {
    status: AUTH_STATUS.UNAUTHENTICATED,
    user: null, companies: [], company: null, companyStatus: null,
    role: null, capabilities: [], error: null,
  };
}

/** O provider não conseguiu responder. Distinto de anónimo (ver AUTH_STATUS.ERROR). */
export function erroredSession(code) {
  return {
    status: AUTH_STATUS.ERROR,
    user: null, companies: [], company: null, companyStatus: null,
    role: null, capabilities: [],
    error: typeof code === "string" && code !== "" ? code : "auth_indisponivel",
  };
}

/**
 * Constrói a sessão autenticada a partir do que o adaptador devolveu.
 *
 * Um `user` que não normalize NÃO produz sessão autenticada: produz sessão anónima.
 * Preferir anónimo a autenticado-sem-id é a escolha certa das duas — a pior falha
 * possível seria montar a aplicação financeira à volta de um utilizador sem identidade.
 */
export function authenticatedSession({ user, companies, preferredCompanyId } = {}) {
  const u = normalizeUser(user);
  if (!u) return anonymousSession();

  const lista = normalizeCompanyMemberships(companies);
  const resolvida = resolveActiveCompany({ companies: lista, preferredCompanyId });

  return {
    status: AUTH_STATUS.AUTHENTICATED,
    user: u,
    companies: resolvida.companies,
    company: resolvida.company,
    companyStatus: resolvida.status,
    /* O papel é SEMPRE o da empresa ativa. Não existe "papel do utilizador": a mesma
     * pessoa pode ser dona da sua empresa e mera consultora na do cliente. */
    role: resolvida.company ? resolvida.company.role : null,
    capabilities: resolvida.company ? capabilitiesForRole(resolvida.company.role) : [],
    error: null,
    preferenceHonored: resolvida.preferenceHonored,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * PERGUNTAS QUE A UI FAZ
 *
 * Todas por função e nenhuma por comparação de string espalhada pelo código. É a lição
 * de `dataSourceStates`: comparar `source === "api"` em quinze sítios fez com que
 * `loading` e `unavailable` fossem tratados como demonstração em catorze deles.
 * ───────────────────────────────────────────────────────────────────────────────── */

export function isAuthenticated(session) {
  return !!session && session.status === AUTH_STATUS.AUTHENTICATED;
}

export function isAuthLoading(session) {
  return !session || session.status === AUTH_STATUS.LOADING;
}

/**
 * A aplicação financeira pode ser montada?
 *
 * Exige as DUAS coisas: sessão autenticada E uma empresa resolvida. Um utilizador
 * autenticado sem memberships não vê a aplicação — vê o ecrã de "acesso não
 * configurado". Não é um detalhe: sem empresa não há dataset, e sem dataset a
 * aplicação cairia nos fallbacks `sales?.x ?? mockData.x` e mostraria os números da
 * Overcel fictícia a um estranho.
 */
export function canMountFinancialApp(session) {
  return isAuthenticated(session)
    && session.companyStatus === COMPANY_STATUS.READY
    && !!session.company;
}

/** Tem a sessão ativa esta capacidade, NA empresa ativa? Cortesia de UI apenas. */
export function sessionCan(session, capability) {
  if (!canMountFinancialApp(session)) return false;
  return roleHasCapability(session.role, capability);
}

/**
 * Iniciais para o avatar. Nunca inventa: sem nome nem email, devolve "?".
 *
 * Do email usa-se SÓ a parte local. "ana.silva@x.com" dá "AS" e não "AC" — o domínio é
 * a empresa, não a pessoa, e num produto onde toda a gente de uma empresa partilha o
 * domínio as iniciais ficariam todas iguais no último caractere.
 */
export function userInitials(user) {
  if (!user) return "?";
  const bruto = user.name || (user.email ? String(user.email).split("@")[0] : "") || "";
  const partes = String(bruto).trim().split(/[\s._-]+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Papel legível. Vive aqui porque é o único sítio que conhece a lista fechada. */
export const ROLE_LABEL = {
  [ROLES.OWNER]: "Proprietário",
  [ROLES.MEMBER]: "Membro",
  [ROLES.VIEWER]: "Consulta",
};

export function roleLabel(role) {
  return isKnownRole(role) ? ROLE_LABEL[role] : "—";
}
