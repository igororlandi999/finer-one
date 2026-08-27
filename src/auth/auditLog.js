// src/auth/auditLog.js
// REGISTO DE AUDITORIA de ações financeiras — puro, e construído SÓ com o que o
// servidor sabe.
//
// ─── PORQUE O AUTOR NÃO PODE VIR DO CLIENTE ─────────────────────────────────────────
// Um registo de auditoria em que o autor é escolhido por quem age não é um registo de
// auditoria: é um campo de texto. Se o browser pudesse enviar `actorUserId`, um
// utilizador poderia confirmar a cobertura de julho em nome de outra pessoa, e a única
// prova do que aconteceu diria o nome errado.
//
// `buildAuditEntry` recebe `actorUserId` como argumento OBRIGATÓRIO e recusa-se a
// construir a entrada sem ele. No BFF, esse argumento vem sempre do retorno de
// `authorizeCompanyRequest`, que por sua vez o tira do token verificado. Não há outro
// caminho: `assertNoClientSuppliedIdentity` rejeita qualquer payload que o traga.
//
// ─── O QUE NUNCA ENTRA NA METADATA ──────────────────────────────────────────────────
// PII e conteúdo livre do utilizador. O Apps Script já vive sob esta regra
// (`redacaoPublica.test.js`, `logSemPII.test.js`) e não faz sentido que o registo que
// a substitui seja mais permissivo. A `note` de uma confirmação é escrita por uma
// pessoa e pode conter o que lhe apetecer — por isso guarda-se o seu COMPRIMENTO e se
// existia, nunca o texto. Quem quiser lê-la, lê-a no documento; o registo diz que
// existiu.

/** Ações auditáveis. Lista FECHADA: uma ação nova entra por acrescento explícito, o
 *  que obriga a decidir o que é seguro registar antes de haver registos dela. */
export const AUDIT_ACTION = {
  COVERAGE_CONFIRMED: "manual_coverage.confirmed",
  COVERAGE_REVOKED: "manual_coverage.revoked",
  CMV_UPSERTED: "manual_input.cmv.upserted",
  CMV_DELETED: "manual_input.cmv.deleted",
  MEMBERSHIP_GRANTED: "membership.granted",
  MEMBERSHIP_REVOKED: "membership.revoked",
  /** Tentativa recusada. Registar as recusas é o que permite ver um ataque a acontecer
   *  — uma sequência de 403 do mesmo utilizador contra empresas diferentes é
   *  exatamente o padrão de quem anda a testar ids. */
  ACCESS_DENIED: "access.denied",
};

const ACOES_CONHECIDAS = new Set(Object.values(AUDIT_ACTION));

const RE_MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/* Chaves de metadata permitidas, por ação. Uma lista de permissão e não de proibição:
 * o que não está aqui não é registado, e por isso um campo novo nunca chega ao registo
 * por acidente — chega por decisão. */
const METADATA_PERMITIDA = {
  [AUDIT_ACTION.COVERAGE_CONFIRMED]: ["source", "previousMonthKey", "noteLength"],
  [AUDIT_ACTION.COVERAGE_REVOKED]: ["source", "previousMonthKey"],
  [AUDIT_ACTION.CMV_UPSERTED]: ["previousValue", "value"],
  [AUDIT_ACTION.CMV_DELETED]: ["previousValue"],
  [AUDIT_ACTION.MEMBERSHIP_GRANTED]: ["targetUserId", "role"],
  [AUDIT_ACTION.MEMBERSHIP_REVOKED]: ["targetUserId", "previousRole"],
  [AUDIT_ACTION.ACCESS_DENIED]: ["decision", "reason", "requestedCompanyId", "capability"],
};

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Só o que é seguro e reconhecido. Valores não escalares são descartados: um objeto
 *  aninhado é uma porta por onde entra o que ninguém reviu. */
function filtrarMetadata(action, metadata) {
  const permitidas = METADATA_PERMITIDA[action] || [];
  const out = {};
  if (!isPlainObject(metadata)) return out;
  for (const chave of permitidas) {
    if (!Object.prototype.hasOwnProperty.call(metadata, chave)) continue;
    const v = metadata[chave];
    if (v === null) { out[chave] = null; continue; }
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") out[chave] = v;
  }
  return out;
}

/**
 * Constrói uma entrada de auditoria.
 *
 * @param {object} args
 * @param {string} args.companyId      A empresa AUTORIZADA (retorno da autorização).
 * @param {string} args.actorUserId    O utilizador do TOKEN. Obrigatório.
 * @param {string} args.action         Uma de AUDIT_ACTION.
 * @param {string|null} [args.monthKey]
 * @param {object} [args.metadata]
 * @param {Date} args.now              Relógio INJETADO. Sem relógio não há carimbo, e
 *   um carimbo derivado de um relógio implícito é o tipo de coisa que só se descobre
 *   estar errada quando é preciso provar quando algo aconteceu.
 * @param {string} [args.id]           Id injetável (o gerador vive na camada de escrita).
 * @returns {{ok: true, entry: object}|{ok: false, reason: string}}
 */
export function buildAuditEntry({ companyId, actorUserId, action, monthKey, metadata, now, id } = {}) {
  if (typeof companyId !== "string" || companyId === "") {
    return { ok: false, reason: "company_id_em_falta" };
  }
  if (typeof actorUserId !== "string" || actorUserId === "") {
    /* Sem autor não se escreve o registo. NÃO se usa "sistema", "anónimo" ou "unknown":
     * um registo com autor inventado é pior do que não haver registo, porque parece
     * uma prova. */
    return { ok: false, reason: "actor_em_falta" };
  }
  if (!ACOES_CONHECIDAS.has(action)) {
    return { ok: false, reason: "acao_desconhecida" };
  }
  if (!(now instanceof Date) || isNaN(now.getTime())) {
    return { ok: false, reason: "relogio_em_falta" };
  }
  const mk = typeof monthKey === "string" && RE_MONTH_KEY.test(monthKey) ? monthKey : null;

  return {
    ok: true,
    entry: {
      id: typeof id === "string" && id !== "" ? id : null,
      companyId,
      actorUserId,
      action,
      monthKey: mk,
      occurredAt: now.toISOString(),
      metadata: filtrarMetadata(action, metadata),
    },
  };
}

/**
 * A entrada de uma RECUSA, a partir do retorno de `authorizeCompanyRequest`.
 *
 * Ao contrário das outras, esta pode não ter autor — uma recusa por token ausente é
 * anónima por definição. Nesse caso a entrada é construída com `actorUserId: null`
 * explícito, e é o único sítio de todo o módulo onde isso é permitido: registar que
 * "alguém sem sessão tentou" é informação verdadeira e útil; atribuí-la a alguém não
 * seria nem uma coisa nem outra.
 */
export function buildAccessDeniedEntry({ decision, companyId, now, id } = {}) {
  if (!decision || !(now instanceof Date) || isNaN(now.getTime())) {
    return { ok: false, reason: "relogio_em_falta" };
  }
  return {
    ok: true,
    entry: {
      id: typeof id === "string" && id !== "" ? id : null,
      companyId: decision.companyId ?? null,
      actorUserId: decision.userId ?? null,
      action: AUDIT_ACTION.ACCESS_DENIED,
      monthKey: null,
      occurredAt: now.toISOString(),
      metadata: filtrarMetadata(AUDIT_ACTION.ACCESS_DENIED, {
        decision: decision.decision ?? null,
        reason: decision.reason ?? null,
        /* O id PEDIDO, que pode ser diferente do autorizado (é justamente esse o
         * padrão que interessa detetar). */
        requestedCompanyId: typeof companyId === "string" ? companyId : null,
        capability: decision.capability ?? null,
      }),
    },
  };
}
