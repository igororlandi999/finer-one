// src/auth/authorizationCore.js
// NÚCLEO DE AUTORIZAÇÃO — puro, sem React, sem rede, sem relógio implícito, sem imports.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ESTE FICHEIRO É A AUTORIDADE. É AQUI QUE SE DECIDE QUEM VÊ O QUÊ.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ─── PORQUE VIVE NO REPOSITÓRIO DO FRONTEND SE A DECISÃO É DO SERVIDOR ──────────────
// Não vive "no frontend": vive num módulo sem uma única dependência de browser, de
// Node ou de React, e é VENDORADO pelo BFF (ver docs/BFF_CONTRACT.md §2). A razão de
// ser canónico aqui é uma só: aqui existe uma suite de testes. O repositório do proxy
// é um deploy sem runner. Uma regra de autorização sem testes é uma intenção, não uma
// garantia — e a intenção é exatamente o que não serve para isto.
//
// `authorizationCore.sincronizacao.test.js` falha se a cópia do BFF divergir. Não é
// disciplina: é um teste.
//
// ─── O PRINCÍPIO, EM UMA LINHA ──────────────────────────────────────────────────────
// O BROWSER NÃO É CONFIÁVEL. Nada do que o cliente envia identifica o cliente.
//
// Traduzido em regras que este ficheiro impõe:
//   - o utilizador vem SEMPRE do token verificado, nunca do corpo, da query ou de um
//     cabeçalho aplicacional;
//   - o `companyId` vem do CAMINHO (é o pedido, não a autorização) e só serve para
//     procurar uma membership — nunca para conceder nada;
//   - a `role` vem da membership lida do lado do servidor, nunca do cliente;
//   - a configuração da empresa (moeda, locale, integração) resolve-se DEPOIS de
//     autorizar, a partir do id autorizado, nunca do que o cliente descreveu.
//
// ─── AUTENTICAÇÃO != AUTORIZAÇÃO ────────────────────────────────────────────────────
// Um token válido responde "quem és". Não responde "podes ver esta empresa". As duas
// perguntas têm respostas HTTP diferentes de propósito: 401 é "não sei quem és", 403 é
// "sei quem és e não podes". Colapsá-las numa só faria um utilizador legítimo da
// Empresa A receber, ao pedir a Empresa B, uma mensagem que sugere sessão expirada.

/* ─────────────────────────────────────────────────────────────────────────────────
 * DECISÕES
 * ───────────────────────────────────────────────────────────────────────────────── */

/** Resultados possíveis de uma autorização. Códigos, não frases: a língua vive na UI. */
export const AUTHZ = {
  OK: "ok",
  /** Não sabemos quem é: token ausente, malformado, inválido ou expirado. */
  UNAUTHENTICATED: "unauthenticated",
  /** Sabemos quem é e não pode: sem membership, ou com membership insuficiente. */
  FORBIDDEN: "forbidden",
  /** O pedido em si não é interpretável (companyId malformado, payload com identidade). */
  BAD_REQUEST: "bad_request",
};

/** Tradução para HTTP. Um sítio só, para que nenhum handler invente o seu próprio mapa. */
export const AUTHZ_HTTP_STATUS = {
  [AUTHZ.OK]: 200,
  [AUTHZ.UNAUTHENTICATED]: 401,
  [AUTHZ.FORBIDDEN]: 403,
  [AUTHZ.BAD_REQUEST]: 400,
};

/** Motivos, para telemetria e testes. NUNCA para o corpo da resposta ao cliente. */
export const AUTHZ_REASON = {
  TOKEN_AUSENTE: "token_ausente",
  TOKEN_MALFORMADO: "token_malformado",
  TOKEN_INVALIDO: "token_invalido",
  TOKEN_EXPIRADO: "token_expirado",
  TOKEN_SEM_SUJEITO: "token_sem_sujeito",
  COMPANY_ID_INVALIDO: "company_id_invalido",
  CAPACIDADE_DESCONHECIDA: "capacidade_desconhecida",
  SEM_MEMBERSHIP: "sem_membership",
  MEMBERSHIP_INSUFICIENTE: "membership_insuficiente",
  IDENTIDADE_NO_PAYLOAD: "identidade_no_payload",
  FALHA_A_LER_MEMBERSHIPS: "falha_a_ler_memberships",
};

/* ─────────────────────────────────────────────────────────────────────────────────
 * PAPÉIS E CAPACIDADES
 *
 * Três papéis, duas fronteiras de decisão. Não é um RBAC: é o mínimo que o produto
 * já precisa hoje, e a justificação de cada um está em docs/SAAS_AUTH_ARCHITECTURE.md §5.
 *
 *   owner   quem é dono da conta da empresa. Único que gere quem entra e quem sai.
 *   member  quem opera a empresa: lê tudo e afirma estado financeiro (cobertura, CMV).
 *   viewer  quem consulta: contabilista externo, sócio, investidor. Lê e não escreve.
 *
 * `viewer` não é luxo — é o papel do piloto externo, que chega antes de qualquer
 * gestão de equipas. `member` é o que se poderia dispensar, mas dispensá-lo obrigaria
 * a promover a owner toda a gente que precise de confirmar uma cobertura, e owner pode
 * remover os outros. Um utilizador que só precisa de introduzir o CMV não deve poder
 * apagar o dono da conta.
 * ───────────────────────────────────────────────────────────────────────────────── */

export const ROLES = { OWNER: "owner", MEMBER: "member", VIEWER: "viewer" };

/** Ordem de senioridade. Só para apresentação (ordenar listas); nunca para autorizar —
 *  autorizar por "role >= X" é como se ganham privilégios por acaso ao acrescentar um
 *  papel novo no meio da escala. Aqui autoriza-se por CAPACIDADE explícita. */
export const ROLE_RANK = { [ROLES.OWNER]: 3, [ROLES.MEMBER]: 2, [ROLES.VIEWER]: 1 };

export const CAPABILITIES = {
  /** Ler dados financeiros da empresa (snapshots, DRE, alertas). */
  READ_FINANCIAL_DATA: "read_financial_data",
  /** Afirmar estado financeiro: confirmar cobertura, introduzir CMV, classificar. */
  WRITE_FINANCIAL_STATE: "write_financial_state",
  /** Convidar, remover e mudar o papel de membros. */
  MANAGE_MEMBERSHIPS: "manage_memberships",
};

const CAPACIDADES_POR_PAPEL = {
  [ROLES.OWNER]: [
    CAPABILITIES.READ_FINANCIAL_DATA,
    CAPABILITIES.WRITE_FINANCIAL_STATE,
    CAPABILITIES.MANAGE_MEMBERSHIPS,
  ],
  [ROLES.MEMBER]: [
    CAPABILITIES.READ_FINANCIAL_DATA,
    CAPABILITIES.WRITE_FINANCIAL_STATE,
  ],
  [ROLES.VIEWER]: [
    CAPABILITIES.READ_FINANCIAL_DATA,
  ],
};

/** Papel reconhecido? Um papel desconhecido NÃO é tratado como o mais baixo: é tratado
 *  como inexistente, e uma membership com papel inexistente não autoriza nada. */
export function isKnownRole(role) {
  return typeof role === "string" && Object.prototype.hasOwnProperty.call(CAPACIDADES_POR_PAPEL, role);
}

export function isKnownCapability(capability) {
  return typeof capability === "string" &&
    Object.values(CAPABILITIES).indexOf(capability) !== -1;
}

/** A pergunta de autorização, reduzida ao osso. Falso por omissão, sempre. */
export function roleHasCapability(role, capability) {
  if (!isKnownRole(role) || !isKnownCapability(capability)) return false;
  return CAPACIDADES_POR_PAPEL[role].indexOf(capability) !== -1;
}

/** As capacidades de um papel, para a UI poder esconder o que não é possível.
 *  Esconder é cortesia; a barreira é sempre `authorizeCompanyRequest`, no servidor. */
export function capabilitiesForRole(role) {
  return isKnownRole(role) ? CAPACIDADES_POR_PAPEL[role].slice() : [];
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * IDENTIFICADORES
 * ───────────────────────────────────────────────────────────────────────────────── */

/* Um id de empresa é um slug ou um UUID. A forma é restrita de propósito: o valor
 * chega do CAMINHO do URL e vai ser usado para procurar registos. Aceitar qualquer
 * string é oferecer a superfície de injeção de graça — mesmo que hoje o consumidor
 * seja parametrizado, o consumidor de amanhã pode não ser. */
/* 2 a 64 caracteres: começa e acaba em alfanumérico, hífenes só no meio. Um id de um
 * só caractere é recusado por não ser um identificador razoável de empresa nenhuma. */
const RE_COMPANY_ID = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

export function isValidCompanyId(id) {
  return typeof id === "string" && RE_COMPANY_ID.test(id);
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * TOKEN
 * ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Extrai o token de `Authorization: Bearer <token>`.
 *
 * Devolve `{ ok: true, token }` ou `{ ok: false, reason }`. Nunca lança: um cabeçalho
 * disparatado é um pedido não autenticado, não uma avaria do servidor.
 *
 * O esquema é comparado sem distinção de maiúsculas porque o RFC 7235 assim o define,
 * e um cliente que envie "bearer" não está a atacar ninguém.
 */
export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string" || authorizationHeader.trim() === "") {
    return { ok: false, reason: AUTHZ_REASON.TOKEN_AUSENTE };
  }
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  if (!m) return { ok: false, reason: AUTHZ_REASON.TOKEN_MALFORMADO };
  return { ok: true, token: m[1] };
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * PAYLOAD DE ESCRITA
 * ───────────────────────────────────────────────────────────────────────────────── */

/* Campos que o cliente NUNCA pode enviar. Não é uma lista de coisas que ignoramos: é
 * uma lista de coisas que fazem o pedido ser REJEITADO.
 *
 * Ignorar em silêncio seria defensável, e é o que a maioria das APIs faz. Rejeitar é
 * melhor por duas razões concretas:
 *   1. um cliente nosso que comece a enviar `actorUserId` tem um erro de programação,
 *      e falhar alto é como se descobre no dia em que acontece e não seis meses depois;
 *   2. um cliente que NÃO é nosso a enviar `actorUserId` está a tentar personificar
 *      alguém, e isso merece um registo de auditoria, não um encolher de ombros. */
export const CAMPOS_DE_IDENTIDADE_PROIBIDOS = [
  "actorUserId", "userId", "user_id", "actor", "sub",
  "role", "papel", "companyId", "company_id", "memberships", "membership",
];

/**
 * Um payload de escrita não pode trazer identidade nem autorização.
 *
 * @returns {{ok: true}|{ok: false, reason: string, campo: string}}
 */
export function assertNoClientSuppliedIdentity(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: true }; // não é um objeto: não tem campos para proibir
  }
  for (const campo of CAMPOS_DE_IDENTIDADE_PROIBIDOS) {
    if (Object.prototype.hasOwnProperty.call(payload, campo)) {
      return { ok: false, reason: AUTHZ_REASON.IDENTIDADE_NO_PAYLOAD, campo };
    }
  }
  return { ok: true };
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * MEMBERSHIPS
 * ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Normaliza uma membership vinda da base de dados. Defensiva: o que não se reconhece
 * não se aproveita em parte nenhuma.
 *
 * @returns {null|{userId: string, companyId: string, role: string}}
 */
export function normalizeMembership(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const userId = raw.userId ?? raw.user_id;
  const companyId = raw.companyId ?? raw.company_id;
  const role = raw.role;
  if (typeof userId !== "string" || userId === "") return null;
  if (!isValidCompanyId(companyId)) return null;
  if (!isKnownRole(role)) return null;
  return { userId, companyId, role };
}

/** A membership do utilizador NESTA empresa, ou null. Sem correspondência parcial:
 *  ou o id é igual, ou não há membership. */
export function findMembership(memberships, companyId) {
  if (!Array.isArray(memberships)) return null;
  if (!isValidCompanyId(companyId)) return null;
  for (const m of memberships) {
    const n = normalizeMembership(m);
    if (n && n.companyId === companyId) return n;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * A DECISÃO
 * ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Uma negação.
 *
 * ─── PORQUE `conhecido` EXISTE ──────────────────────────────────────────────────────
 * Todas as negações devolviam `userId: null`, incluindo as que acontecem DEPOIS de o
 * token ter sido verificado — ou seja, depois de sabermos exatamente quem é.
 *
 * Isso esvaziava o registo de auditoria das recusas. `protect.js` escreve uma entrada
 * `access.denied` por cada 403 e o seu próprio comentário diz porquê: "uma sequência de
 * 403 do mesmo utilizador contra empresas diferentes é o padrão de quem anda a testar
 * ids, e sem registo ninguém o vê". Com `actorUserId: null` em todas as linhas, esse
 * padrão era precisamente o que continuava invisível — o registo existia e não servia
 * para a única coisa que justificava escrevê-lo.
 *
 * Agora as negações POSTERIORES à verificação do token levam o `userId` verificado. As
 * ANTERIORES continuam com `null`, porque aí não se sabe mesmo — e inventar seria pior.
 *
 * NÃO há risco de fuga: o corpo que chega ao cliente é `safeErrorBody(decision)`, que só
 * lê a decisão. O `userId` devolvido aqui vive no servidor, para o registo.
 */
function negar(decision, reason, conhecido) {
  return {
    decision,
    status: AUTHZ_HTTP_STATUS[decision],
    reason,
    userId: (conhecido && typeof conhecido.userId === "string" && conhecido.userId !== "")
      ? conhecido.userId
      : null,
    companyId: null,
    role: null,
  };
}

/**
 * AUTORIZA UM PEDIDO A UMA EMPRESA. É esta a função que o BFF chama antes de tocar
 * em qualquer dado financeiro.
 *
 * Tudo o que é efeito colateral entra INJETADO (`verifyToken`, `loadMemberships`), o
 * que torna a função testável sem rede, sem base de dados e sem relógio real — e é o
 * que permite exercer aqui a matriz inteira de FASE 20.
 *
 * ─── A ORDEM DAS VERIFICAÇÕES NÃO É DECORATIVA ──────────────────────────────────────
 * 1. token            — sem saber quem é, não há pergunta seguinte que faça sentido;
 * 2. forma do pedido  — companyId ilegível é 400, não 403: não é uma negação de acesso;
 * 3. membership       — a única fonte de autorização;
 * 4. capacidade       — o papel chega para esta ação em concreto?
 *
 * Trocar 1 com 3 seria um oráculo: um pedido sem token que devolvesse 403 para
 * empresas existentes e 401 para as outras diria a um anónimo quais os ids válidos.
 *
 * ─── EMPRESA INEXISTENTE E EMPRESA SEM MEMBERSHIP SÃO A MESMA RESPOSTA ──────────────
 * 403 nas duas. `loadMemberships` devolve as memberships do UTILIZADOR; uma empresa que
 * não existe simplesmente não aparece lá. Nunca se consulta a tabela de empresas antes
 * de autorizar — e por isso não há como distinguir, do lado de fora, "não existe" de
 * "não é seu". Enumerar clientes de um SaaS financeiro pelo código de estado é uma
 * fuga de informação comercial, mesmo sem um único número financeiro à mistura.
 *
 * @param {object} args
 * @param {string} args.authorizationHeader  Cabeçalho HTTP cru.
 * @param {string} args.companyId            Vindo do CAMINHO do URL.
 * @param {string} args.capability           Capacidade exigida por este endpoint.
 * @param {function} args.verifyToken        async (token) => {ok, userId, expiresAt?}|{ok:false}
 * @param {function} args.loadMemberships    async (userId) => Array
 * @param {Date} [args.now]                  Relógio injetado. Sem ele, não se avalia expiração aqui.
 * @param {object} [args.payload]            Corpo do pedido, nas escritas.
 * @returns {Promise<{decision, status, reason, userId, companyId, role, capability?}>}
 */
export async function authorizeCompanyRequest({
  authorizationHeader,
  companyId,
  capability,
  verifyToken,
  loadMemberships,
  now,
  payload,
} = {}) {
  // ── 1. QUEM É ──────────────────────────────────────────────────────────────────
  const bearer = extractBearerToken(authorizationHeader);
  if (!bearer.ok) return negar(AUTHZ.UNAUTHENTICATED, bearer.reason);

  let verificado;
  try {
    verificado = await verifyToken(bearer.token);
  } catch {
    /* Uma verificação que rebenta NÃO é um utilizador autenticado. O `catch` existe
     * para que uma falha do verificador (JWKS em baixo, rede) negue em vez de propagar
     * um 500 — negar é o lado seguro, e um 500 aqui seria indistinguível de um bug que
     * deixasse passar. */
    return negar(AUTHZ.UNAUTHENTICATED, AUTHZ_REASON.TOKEN_INVALIDO);
  }
  if (!verificado || verificado.ok !== true) {
    const reason = (verificado && verificado.reason) || AUTHZ_REASON.TOKEN_INVALIDO;
    return negar(AUTHZ.UNAUTHENTICATED, reason);
  }
  if (typeof verificado.userId !== "string" || verificado.userId === "") {
    return negar(AUTHZ.UNAUTHENTICATED, AUTHZ_REASON.TOKEN_SEM_SUJEITO);
  }

  /* Expiração verificada AQUI TAMBÉM, e não só dentro do verificador. Não é
   * redundância inútil: o verificador é injetado, e um verificador que se esqueça do
   * `exp` (ou que o valide contra o relógio errado) é o tipo de defeito que só se
   * descobre depois de um token velho ter aberto uma porta. Só se avalia quando há
   * relógio E há `expiresAt` — inventar um dos dois seria pior do que não verificar. */
  if (now instanceof Date && !isNaN(now.getTime()) && verificado.expiresAt != null) {
    const exp = verificado.expiresAt instanceof Date
      ? verificado.expiresAt.getTime()
      : (typeof verificado.expiresAt === "number"
        ? (verificado.expiresAt < 1e12 ? verificado.expiresAt * 1000 : verificado.expiresAt)
        : Date.parse(String(verificado.expiresAt)));
    if (Number.isFinite(exp) && exp <= now.getTime()) {
      return negar(AUTHZ.UNAUTHENTICATED, AUTHZ_REASON.TOKEN_EXPIRADO);
    }
  }

  const userId = verificado.userId;

  // ── 2. O PEDIDO É INTERPRETÁVEL? ───────────────────────────────────────────────
  if (!isValidCompanyId(companyId)) {
    return negar(AUTHZ.BAD_REQUEST, AUTHZ_REASON.COMPANY_ID_INVALIDO, { userId });
  }
  if (!isKnownCapability(capability)) {
    /* Endpoint mal configurado do NOSSO lado. Nega — um endpoint que exige uma
     * capacidade que não existe não pode ser um endpoint aberto a toda a gente. */
    return negar(AUTHZ.FORBIDDEN, AUTHZ_REASON.CAPACIDADE_DESCONHECIDA, { userId });
  }
  if (payload !== undefined) {
    const limpo = assertNoClientSuppliedIdentity(payload);
    if (!limpo.ok) {
      return { ...negar(AUTHZ.BAD_REQUEST, limpo.reason, { userId }), campo: limpo.campo };
    }
  }

  // ── 3. TEM MEMBERSHIP NESTA EMPRESA? ───────────────────────────────────────────
  let memberships;
  try {
    memberships = await loadMemberships(userId);
  } catch {
    // Não conseguir ler as memberships nunca pode significar "então deixa passar".
    return negar(AUTHZ.FORBIDDEN, AUTHZ_REASON.FALHA_A_LER_MEMBERSHIPS, { userId });
  }
  const membership = findMembership(memberships, companyId);
  if (!membership) return negar(AUTHZ.FORBIDDEN, AUTHZ_REASON.SEM_MEMBERSHIP, { userId });

  // ── 4. O PAPEL CHEGA PARA ESTA AÇÃO? ───────────────────────────────────────────
  if (!roleHasCapability(membership.role, capability)) {
    return negar(AUTHZ.FORBIDDEN, AUTHZ_REASON.MEMBERSHIP_INSUFICIENTE, { userId });
  }

  return {
    decision: AUTHZ.OK,
    status: 200,
    reason: null,
    /* O `userId` devolvido é o do TOKEN. É este que os handlers usam como `actorUserId`
     * no registo de auditoria — e é a razão de o cliente não poder enviar o seu. */
    userId,
    /* O `companyId` devolvido é o da MEMBERSHIP, não o do caminho. São iguais por
     * construção; devolver o da membership é o que garante que continuam a sê-lo se
     * algum dia a procura deixar de ser por igualdade exata. */
    companyId: membership.companyId,
    role: membership.role,
    capability,
  };
}

/**
 * Corpo de erro seguro, pronto a devolver ao cliente.
 *
 * NÃO inclui o `reason`. O motivo interno distingue "sem membership" de "papel
 * insuficiente" e distinguir isso ao cliente diz-lhe se a empresa existe. Ao cliente
 * chega o estado HTTP e uma frase estável; o motivo vai para os registos.
 */
export function safeErrorBody(decision) {
  if (decision === AUTHZ.UNAUTHENTICATED) {
    return { error: true, code: "UNAUTHENTICATED", message: "Autenticação necessária." };
  }
  if (decision === AUTHZ.FORBIDDEN) {
    return { error: true, code: "FORBIDDEN", message: "Sem acesso a este recurso." };
  }
  if (decision === AUTHZ.BAD_REQUEST) {
    return { error: true, code: "BAD_REQUEST", message: "Pedido inválido." };
  }
  return { error: true, code: "ERRO", message: "Erro." };
}
