// src/auth/authAdapterPort.js
// O PORTO da autenticação: o contrato que qualquer provider tem de cumprir.
//
// ─── PORQUE UM PORTO E NÃO `supabase.auth` ESPALHADO PELA APLICAÇÃO ─────────────────
// A prioridade arquitetural declarada é "não construir autenticação manualmente". Isso
// resolve-se contratando um provider. A consequência de contratar um provider é o
// lock-in — e o lock-in não vem do provider: vem de o importar em quarenta ficheiros.
//
// Com um porto, o SDK do Supabase é importado num único módulo
// (`supabaseAuthAdapter.js`). Trocar de provider é escrever um segundo adaptador. Testar
// autenticação é escrever um terceiro, em memória, sem rede — que é exatamente o que o
// `devAuthAdapter` é.
//
// ─── O QUE UM ADAPTADOR NÃO PODE FAZER ──────────────────────────────────────────────
// Não decide autorização. Devolve quem o utilizador é e a que empresas pertence; quem
// decide o que ele pode fazer é `authorizationCore.js`, e a decisão que conta é a do
// SERVIDOR. Um adaptador comprometido (ou simplesmente mentiroso, como o de
// desenvolvimento) pode enganar a INTERFACE. Não pode enganar o BFF.

/**
 * @typedef {Object} AuthAdapter
 * @property {string} id
 *   Identificador do adaptador ("dev", "supabase"). Aparece na UI em modo não-produção.
 *
 * @property {() => Promise<{user: object|null, companies: Array}|null>} getSession
 *   A sessão atual, ou `null` se não houver. NUNCA lança: um provider inalcançável
 *   devolve `null` ou rejeita, e o provider React traduz isso em ERROR — nunca em
 *   "autenticado".
 *
 * @property {(callback: Function) => Function} onAuthStateChange
 *   Subscreve mudanças (login noutro separador, refresh de token, logout). Devolve a
 *   função de cancelamento. Obrigatório: sem isto, um logout noutro separador deixa
 *   esta aba a mostrar dados financeiros de uma sessão que já não existe.
 *
 * @property {(credenciais: object) => Promise<{ok: boolean, code?: string}>} signIn
 *
 * @property {() => Promise<void>} signOut
 *
 * @property {() => Promise<string|null>} getAccessToken
 *   O token a enviar em `Authorization: Bearer`. `null` quando não há sessão.
 *   É o adaptador que trata da renovação — a aplicação nunca guarda tokens.
 *
 * @property {boolean} [simulated]
 *   `true` só no adaptador de desenvolvimento. A UI usa-o para se identificar como
 *   simulada, de forma bem visível.
 */

/** Códigos de falha de login. Estáveis; a frase vive na UI. */
export const SIGN_IN_ERROR = {
  CREDENCIAIS_INVALIDAS: "credenciais_invalidas",
  CAMPOS_EM_FALTA: "campos_em_falta",
  PROVIDER_INDISPONIVEL: "provider_indisponivel",
  NAO_CONFIGURADO: "nao_configurado",
};

/** Métodos que um adaptador tem de ter para ser aceite. */
export const METODOS_OBRIGATORIOS = [
  "getSession", "onAuthStateChange", "signIn", "signOut", "getAccessToken",
];

/**
 * Valida a forma de um adaptador ANTES de o pôr a decidir sessões.
 *
 * Um adaptador a que falte `onAuthStateChange` não parte nada de imediato: parte três
 * semanas depois, quando alguém faz logout noutro separador e esta aba continua a
 * mostrar a DRE. Falhar no arranque é infinitamente melhor.
 *
 * @returns {{ok: true}|{ok: false, missing: string[]}}
 */
export function validateAuthAdapter(adapter) {
  if (adapter === null || typeof adapter !== "object") {
    return { ok: false, missing: METODOS_OBRIGATORIOS.slice() };
  }
  const missing = METODOS_OBRIGATORIOS.filter((m) => typeof adapter[m] !== "function");
  if (typeof adapter.id !== "string" || adapter.id === "") missing.push("id");
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * Adaptador nulo: nunca há sessão, nunca se pode entrar.
 *
 * É o que se usa quando a autenticação está desligada ou mal configurada. Não é um
 * "modo aberto": é um modo em que NINGUÉM entra. Se algum dia a aplicação exigir
 * sessão e a configuração falhar, o resultado é ninguém passar — nunca toda a gente.
 */
export function createNullAuthAdapter({ code = SIGN_IN_ERROR.NAO_CONFIGURADO } = {}) {
  return {
    id: "null",
    simulated: false,
    async getSession() { return null; },
    onAuthStateChange() { return () => {}; },
    async signIn() { return { ok: false, code }; },
    async signOut() {},
    async getAccessToken() { return null; },
  };
}
