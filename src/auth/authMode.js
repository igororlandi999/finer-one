// src/auth/authMode.js
// QUE ADAPTADOR DE AUTENTICAÇÃO VALE — e, sobretudo, qual NUNCA pode valer.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A REGRA QUE ESTE FICHEIRO EXISTE PARA IMPOR:
// AUTENTICAÇÃO SIMULADA NÃO PODE, EM CIRCUNSTÂNCIA NENHUMA, CORRER EM PRODUÇÃO.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// ─── PORQUE ISTO É UM FICHEIRO E NÃO UM `if` ────────────────────────────────────────
// Um modo de desenvolvimento que concede sessões sem credenciais é, num build de
// produção, uma porta aberta com um aviso a dizer "só para programadores". A variável
// de ambiente que o liga é editável por quem faz o deploy — e quem faz o deploy, um
// dia, vai copiar um `.env` de uma máquina para a outra.
//
// A defesa é em três camadas, e nenhuma delas confia nas outras:
//   1. `resolveAuthMode` NUNCA devolve `dev` quando o ambiente se declara produção,
//      independentemente do que a variável diga (aqui);
//   2. o próprio adaptador simulado recusa-se a ser construído em produção
//      (`devAuthAdapter.js`, guarda no construtor);
//   3. o adaptador simulado só é importado dentro de um ramo `import.meta.env.DEV`,
//      pelo que o Rollup o elimina do bundle de produção (`authAdapters.js`), e há um
//      teste que lê o bundle construído para o confirmar.
//
// A camada 1 chega para o ataque realista (variável mal configurada). As 2 e 3 existem
// porque "chega" é uma palavra que não se usa em autenticação.

/** Modos de autenticação reconhecidos. */
export const AUTH_MODE = {
  /** Provider real (Supabase). O único aceitável em produção. */
  SUPABASE: "supabase",
  /** Sessões simuladas a partir de fixtures compiladas. SÓ em desenvolvimento. */
  DEV: "dev",
  /** Autenticação desligada: a aplicação corre como corria antes desta fundação.
   *  É o que mantém o desenvolvimento sobre os dados reais da Overcel possível sem
   *  depender de nada externo (FASE 19). */
  DISABLED: "disabled",
};

/** Modos que NUNCA podem valer num ambiente de produção. */
export const MODOS_PROIBIDOS_EM_PRODUCAO = [AUTH_MODE.DEV];

/** Motivos de recusa, para telemetria e testes. */
export const AUTH_MODE_REASON = {
  MODO_DEV_EM_PRODUCAO: "modo_dev_em_producao",
  MODO_DESCONHECIDO: "modo_desconhecido",
  SUPABASE_SEM_CONFIGURACAO: "supabase_sem_configuracao",
};

/* ─── TRÊS SINAIS, E QUALQUER UM CHEGA ─────────────────────────────────────────────
 * `PROD` é o sinal natural do Vite, mas NÃO é fiável sozinho: o Vite deriva-o de
 * `process.env.NODE_ENV` quando ela existe, pelo que `NODE_ENV=test vite build` produz
 * um build de produção com `PROD: false`. Foi assim que o adaptador simulado chegou a
 * ser incluído num bundle — ver o cabeçalho de `authAdapters.js`.
 *
 * `MODE === "production"` é o sinal determinista de um `vite build`, e é o que apanha
 * esse caso. `NODE_ENV` fecha o círculo para runners que não definam nenhum dos outros.
 *
 * Um ambiente que se declare produção por QUALQUER das três vias é tratado como
 * produção. Nunca ao contrário: a dúvida resolve-se sempre para o lado restritivo. */
function isProd(env) {
  if (!env) return false;
  return env.PROD === true || env.MODE === "production" || env.NODE_ENV === "production";
}

/** A configuração do Supabase está presente? A chave `anon` é PÚBLICA por desenho
 *  (é ela que as políticas de RLS esperam ver); a `service_role` NUNCA entra aqui —
 *  ver `segredosNoBundle.test.js`, que falha se alguma variável `VITE_*` cheirar a
 *  segredo. */
export function hasSupabaseConfig(env) {
  if (!env) return false;
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  return typeof url === "string" && url.trim().startsWith("https://")
    && typeof key === "string" && key.trim().length > 20;
}

/**
 * Decide o modo de autenticação a partir do ambiente.
 *
 * @param {object} env  Tipicamente `import.meta.env`. INJETADO, para ser testável
 *   contra um ambiente de produção sem construir um.
 * @returns {{mode: string, reason: string|null, downgradedFrom: string|null}}
 *
 * ─── PORQUE UM PEDIDO INVÁLIDO NÃO REBENTA ──────────────────────────────────────────
 * Lançar aqui deixaria a aplicação em branco. O que se faz em vez disso é DESPROMOVER
 * para o modo mais restritivo que o ambiente suporta, registando de onde se veio
 * (`downgradedFrom`) para que a UI possa dizê-lo em voz alta. Uma aplicação que arranca
 * a pedir credenciais é um incidente de configuração; uma aplicação em branco é um
 * incidente de configuração que ninguém sabe diagnosticar.
 */
export function resolveAuthMode(env) {
  const producao = isProd(env);
  const pedido = env && typeof env.VITE_AUTH_MODE === "string"
    ? env.VITE_AUTH_MODE.trim().toLowerCase()
    : "";

  // ── Sem pedido explícito: o ambiente decide, sempre pelo lado seguro ──
  if (pedido === "") {
    if (hasSupabaseConfig(env)) return { mode: AUTH_MODE.SUPABASE, reason: null, downgradedFrom: null };
    /* Sem configuração de provider, a aplicação corre SEM autenticação — exatamente
     * como corre hoje. Não é uma falha de segurança nova: é o estado atual, preservado
     * de propósito para que o desenvolvimento sobre os dados reais continue possível.
     * Em produção isto é visível (o banner do modo) e é o que a FASE 24 pede ao
     * utilizador para resolver. */
    return { mode: AUTH_MODE.DISABLED, reason: null, downgradedFrom: null };
  }

  // ── O ataque realista: VITE_AUTH_MODE=dev num deploy de produção ──
  if (MODOS_PROIBIDOS_EM_PRODUCAO.indexOf(pedido) !== -1 && producao) {
    return {
      mode: hasSupabaseConfig(env) ? AUTH_MODE.SUPABASE : AUTH_MODE.DISABLED,
      reason: AUTH_MODE_REASON.MODO_DEV_EM_PRODUCAO,
      downgradedFrom: AUTH_MODE.DEV,
    };
  }

  if (pedido === AUTH_MODE.DEV) {
    return { mode: AUTH_MODE.DEV, reason: null, downgradedFrom: null };
  }

  if (pedido === AUTH_MODE.SUPABASE) {
    if (!hasSupabaseConfig(env)) {
      /* Pediu-se o provider real e não há configuração. NÃO se cai para `dev` — cair
       * para sessões simuladas por falta de configuração seria transformar um erro de
       * ambiente numa porta aberta. Cai-se para DISABLED, que não concede sessão
       * nenhuma a ninguém. */
      return {
        mode: AUTH_MODE.DISABLED,
        reason: AUTH_MODE_REASON.SUPABASE_SEM_CONFIGURACAO,
        downgradedFrom: AUTH_MODE.SUPABASE,
      };
    }
    return { mode: AUTH_MODE.SUPABASE, reason: null, downgradedFrom: null };
  }

  if (pedido === AUTH_MODE.DISABLED) {
    return { mode: AUTH_MODE.DISABLED, reason: null, downgradedFrom: null };
  }

  // ── Modo escrito à mão que ninguém reconhece ──
  return {
    mode: hasSupabaseConfig(env) ? AUTH_MODE.SUPABASE : AUTH_MODE.DISABLED,
    reason: AUTH_MODE_REASON.MODO_DESCONHECIDO,
    downgradedFrom: pedido,
  };
}

/**
 * A guarda dura, para o construtor do adaptador simulado.
 *
 * Lança. É o único sítio de toda a fundação onde lançar é a resposta certa: se este
 * código correr, alguém contornou `resolveAuthMode` e está a instanciar autenticação
 * falsa num ambiente de produção. Não há degradação elegante para isso.
 */
export function assertDevAuthAllowed(env) {
  if (isProd(env)) {
    throw new Error(
      "[finer-one] Autenticação simulada bloqueada: o ambiente declara-se de produção. " +
      "Ver src/auth/authMode.js."
    );
  }
  return true;
}

/** A aplicação exige sessão para montar? Só quando há um provider a sério a decidir. */
export function modeRequiresAuthentication(mode) {
  return mode === AUTH_MODE.SUPABASE || mode === AUTH_MODE.DEV;
}
