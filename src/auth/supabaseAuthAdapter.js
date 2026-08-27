// src/auth/supabaseAuthAdapter.js
// O ÚNICO ficheiro da aplicação que conhece o Supabase.
//
// ─── PORQUE O IMPORT É DINÂMICO MAS O ESPECIFICADOR É LITERAL ───────────────────────
// Enquanto `@supabase/supabase-js` não estava instalado, o especificador vivia numa
// VARIÁVEL com `@vite-ignore` para que o Rollup não tentasse resolvê-lo e o build se
// mantivesse verde sem a dependência. Isso deixou de ser inofensivo no dia em que o
// pacote foi instalado: com o especificador em variável, nem o Vite nem o Rollup o
// reescrevem, e o BROWSER recebe o nome cru `@supabase/supabase-js`, que não sabe
// resolver. O import rebentava com
//     TypeError: Failed to resolve module specifier
// e o `catch` de `authAdapters.js` engolia-o: o modo caía para DISABLED e a aplicação
// inteira era servida SEM AUTENTICAÇÃO, sem um erro na consola.
//
// O especificador é agora LITERAL. O import continua dinâmico — o que mantém o SDK fora
// do chunk de arranque para quem corre sem Supabase — mas passa a ser analisável, e é
// por isso que resolve.
//
// ─── O QUE ESTE ADAPTADOR DEVOLVE, E O QUE ISSO VALE ────────────────────────────────
// Devolve o utilizador e a lista de empresas a que ele pertence, lida da tabela
// `memberships` através de RLS. Isso serve para DESENHAR a interface: que empresas
// mostrar no seletor, que nome pôr na barra lateral, que botões esconder.
//
// NÃO serve para autorizar nada. Um cliente com o inspetor aberto pode devolver a si
// próprio a lista que quiser. A autorização acontece no BFF, com o token verificado
// contra o JWKS do projeto e as memberships relidas do lado do servidor
// (`authorizationCore.js`). Esta camada é conveniência; aquela é a barreira.

import { SIGN_IN_ERROR } from "./authAdapterPort.js";

/** Clientes já construídos, por `url|anonKey`. Ver o comentário em `createSupabaseAuthAdapter`. */
const clientesPorProjeto = new Map();

/* A consulta das empresas do utilizador. Uma linha por membership, com o mínimo da
 * empresa que a UI precisa. É a RLS que garante que só voltam as do próprio — ver
 * docs/sql/001_saas_foundation.sql, política `memberships_select_own`. */
const SELECT_EMPRESAS =
  "role, companies:company_id ( id, name, currency, locale, timezone, plan, status )";

/**
 * @param {{url: string, anonKey: string, createClient?: Function}} opts
 *   `createClient` INJETÁVEL: é o que permite testar este adaptador sem instalar o SDK
 *   e sem tocar na rede.
 */
export async function createSupabaseAuthAdapter({ url, anonKey, createClient } = {}) {
  if (typeof url !== "string" || !url.startsWith("https://") || typeof anonKey !== "string" || anonKey === "") {
    throw new Error("[finer-one] Supabase sem configuração válida (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }

  let factory = createClient;
  const injetada = typeof createClient === "function";
  if (!factory) {
    const mod = await import("@supabase/supabase-js");
    factory = mod.createClient;
  }

  /* ─── UM CLIENTE POR PROJETO, E NÃO UM POR MONTAGEM ────────────────────────────────
   * O `AuthProvider` reconstrói o adaptador sempre que o efeito de arranque corre —
   * e em desenvolvimento o StrictMode monta duas vezes de propósito. Cada construção
   * criava um GoTrueClient novo sobre a MESMA chave de `localStorage`, e o próprio SDK
   * avisa porquê:
   *     "Multiple GoTrueClient instances detected in the same browser context ...
   *      may produce undefined behavior when used concurrently under the same
   *      storage key"
   * Duas instâncias a renovar o mesmo token competem pela escrita: a que perde a
   * corrida guarda um refresh token já gasto, e a sessão cai sozinha mais tarde, num
   * sítio sem relação nenhuma com a causa.
   *
   * A cache NÃO se aplica quando `createClient` é injetado: cada teste tem de receber
   * exatamente o duplo que passou, e não o de um teste anterior com o mesmo URL. */
  const cached = injetada ? null : clientesPorProjeto.get(url + "|" + anonKey);
  const client = cached || factory(url, anonKey, {
    auth: {
      /* A sessão persiste no `localStorage` — é o próprio SDK que o faz e é aceitável:
       * o que lá fica é um token ASSINADO, que o servidor verifica. Adulterá-lo produz
       * um token inválido, não um token com mais poderes. É a diferença entre guardar
       * uma credencial e guardar uma afirmação: guardar `{"role":"owner"}` seria
       * inaceitável; guardar um JWT que o servidor valida não é. */
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  if (!injetada && !cached) clientesPorProjeto.set(url + "|" + anonKey, client);

  /** Lê as empresas do utilizador. Falha => lista vazia, nunca uma lista inventada. */
  async function carregarEmpresas() {
    try {
      const { data, error } = await client.from("memberships").select(SELECT_EMPRESAS);
      if (error || !Array.isArray(data)) return [];
      return data
        .map((linha) => {
          const c = linha.companies;
          if (!c || typeof c.id !== "string") return null;
          return {
            companyId: c.id,
            name: c.name,
            currency: c.currency,
            locale: c.locale,
            timezone: c.timezone,
            plan: c.plan,
            status: c.status,
            role: linha.role,
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async function montarSessao(sessaoSupabase) {
    if (!sessaoSupabase || !sessaoSupabase.user) return null;
    const u = sessaoSupabase.user;
    return {
      user: {
        id: u.id,
        email: u.email ?? null,
        name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || null,
      },
      companies: await carregarEmpresas(),
    };
  }

  return {
    id: "supabase",
    simulated: false,

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error("supabase_indisponivel");
      return montarSessao(data ? data.session : null);
    },

    onAuthStateChange(cb) {
      if (typeof cb !== "function") return () => {};
      const { data } = client.auth.onAuthStateChange(async (_evento, sessao) => {
        try { cb(await montarSessao(sessao)); } catch { cb(null); }
      });
      return () => {
        try { data.subscription.unsubscribe(); } catch { /* já cancelada */ }
      };
    },

    async signIn({ email, password } = {}) {
      if (!email || !password) return { ok: false, code: SIGN_IN_ERROR.CAMPOS_EM_FALTA };
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        /* Todas as falhas de credenciais colapsam num só código. Distinguir
         * "email não existe" de "palavra-passe errada" é um oráculo de enumeração de
         * contas — e num SaaS financeiro a lista de clientes é ela própria informação
         * comercial. */
        if (error) return { ok: false, code: SIGN_IN_ERROR.CREDENCIAIS_INVALIDAS };
        return { ok: true };
      } catch {
        return { ok: false, code: SIGN_IN_ERROR.PROVIDER_INDISPONIVEL };
      }
    },

    async signOut() {
      try { await client.auth.signOut(); } catch { /* a sessão local cai na mesma */ }
    },

    async getAccessToken() {
      try {
        const { data } = await client.auth.getSession();
        return (data && data.session && data.session.access_token) || null;
      } catch {
        return null;
      }
    },
  };
}
