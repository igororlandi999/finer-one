// src/auth/authAdapters.js
// A FÁBRICA: do ambiente para o adaptador. Um sítio só.
//
// ─── A LINHA MAIS IMPORTANTE DESTE FICHEIRO ─────────────────────────────────────────
// É a guarda à volta do import do adaptador simulado.
//
// O Vite substitui `import.meta.env.DEV` e `import.meta.env.MODE` por literais em tempo
// de compilação. A condição torna-se `if (false && ...)`, o Rollup elimina o ramo, e o
// `import()` dinâmico lá dentro deixa de gerar um chunk. O ficheiro `devAuthAdapter.js`
// — fixtures, memberships e tudo — não entra no bundle. Não fica "inacessível": fica
// AUSENTE.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE SÃO DUAS CONDIÇÕES E NÃO SÓ `DEV`
// ═══════════════════════════════════════════════════════════════════════════════════
// Porque `DEV` sozinho NÃO CHEGOU. Descoberto por este teste, a correr contra o
// `dist/` real:
//
//     NODE_ENV=test vite build   ->   dist/assets/devAuthAdapter-XlECL-hX.js
//
// O Vite deriva `isProduction` de `process.env.NODE_ENV` quando ela está definida, e só
// cai no `mode` quando não está. Com `NODE_ENV=test` — que é o que praticamente
// qualquer runner de testes exporta, e o que muitos CI definem globalmente para todo o
// pipeline — `import.meta.env.DEV` fica `true` NUM BUILD DE PRODUÇÃO, e o adaptador de
// autenticação simulada era publicado.
//
// `MODE` não tem esse problema: para `vite build` é "production" a menos que alguém
// passe `--mode` explicitamente. É o sinal determinista dos dois, e por isso é o que
// fecha a porta.
//
// As duas juntas: `DEV` apanha o caso normal, `MODE` apanha o ambiente contaminado.
// `bundleSemAuthSimulada.test.js` constrói e lê o resultado — se alguém trocar isto por
// uma variável, ou puser o import no topo do ficheiro, o teste falha com a sentinela
// na mão.

import { AUTH_MODE, resolveAuthMode, hasSupabaseConfig } from "./authMode.js";
import { createNullAuthAdapter, validateAuthAdapter, SIGN_IN_ERROR } from "./authAdapterPort.js";

/**
 * Constrói o adaptador correspondente ao ambiente.
 *
 * @param {object} env  Tipicamente `import.meta.env`.
 * @returns {Promise<{adapter: object, mode: string, reason: string|null, downgradedFrom: string|null}>}
 *
 * NUNCA lança para o chamador. Uma falha a construir o provider real devolve o
 * adaptador nulo — em que ninguém entra — e não uma aplicação em branco.
 */
export async function createAuthAdapter(env) {
  const resolucao = resolveAuthMode(env);

  if (resolucao.mode === AUTH_MODE.DEV) {
    /* ═══ RAMO ELIMINADO EM PRODUÇÃO ═══
     * A dupla guarda é intencional: `import.meta.env.DEV` decide se o CÓDIGO existe;
     * `resolveAuthMode` decide se ele é USADO. Uma protege o bundle, a outra o runtime,
     * e nenhuma delas depende da outra estar certa. */
    if (import.meta.env.DEV && import.meta.env.MODE !== "production") {
      const { createDevAuthAdapter } = await import("./devAuthAdapter.js");
      const adapter = createDevAuthAdapter({ env });
      return { ...resolucao, adapter, valid: validateAuthAdapter(adapter) };
    }
    /* Cá chegar significa que o modo dev sobreviveu a `resolveAuthMode` num build de
     * produção — o que não é possível hoje, mas se algum dia for, ninguém entra. */
    return {
      ...resolucao,
      mode: AUTH_MODE.DISABLED,
      reason: "modo_dev_sem_codigo_no_bundle",
      adapter: createNullAuthAdapter(),
    };
  }

  if (resolucao.mode === AUTH_MODE.SUPABASE) {
    if (!hasSupabaseConfig(env)) {
      return { ...resolucao, mode: AUTH_MODE.DISABLED, adapter: createNullAuthAdapter() };
    }
    try {
      const { createSupabaseAuthAdapter } = await import("./supabaseAuthAdapter.js");
      const adapter = await createSupabaseAuthAdapter({
        url: env.VITE_SUPABASE_URL,
        anonKey: env.VITE_SUPABASE_ANON_KEY,
      });
      const valido = validateAuthAdapter(adapter);
      if (!valido.ok) {
        /* ─── UM PROVIDER AVARIADO NÃO PODE VIRAR "SEM AUTENTICAÇÃO" ─────────────────
         * Este ramo e o `catch` abaixo devolviam `mode: DISABLED`. Parecia o lado
         * seguro e era o oposto: `modeRequiresAuthentication(DISABLED)` é `false`, o
         * `ProtectedRoute` devolve `children`, e a aplicação financeira inteira passa a
         * ser servida a quem não tem sessão nenhuma — sem erro na consola, porque o
         * `catch` não regista nada. Foi exatamente o que aconteceu no primeiro arranque
         * contra o Supabase real: o import do SDK falhava e o ecrã mostrava a Overcel
         * inteira sem login.
         *
         * Quem pediu `supabase` pediu uma porta. Se a porta se avaria, não se abre —
         * não se retira dos gonzos. O modo mantém-se SUPABASE (logo `requiresAuth`
         * continua `true`) e o que muda é só o adaptador: um que não concede sessão a
         * ninguém. É a mesma regra que `resolveAuthMode` já declara para o caso de
         * `supabase` sem configuração, e que aqui estava a ser contrariada. */
        return { ...resolucao, reason: "adaptador_incompleto", adapter: createNullAuthAdapter() };
      }
      return { ...resolucao, adapter, valid: valido };
    } catch {
      /* SDK por instalar, rede em baixo, URL errado. Ninguém entra — e `mode` fica
       * SUPABASE de propósito, para que `requiresAuth` continue a valer. Ver acima. */
      return {
        ...resolucao,
        reason: "supabase_indisponivel",
        adapter: createNullAuthAdapter({ code: SIGN_IN_ERROR.PROVIDER_INDISPONIVEL }),
      };
    }
  }

  // AUTH_MODE.DISABLED — a aplicação corre sem sessão, como hoje.
  return { ...resolucao, adapter: createNullAuthAdapter() };
}
