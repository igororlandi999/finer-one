// src/auth/AuthContext.jsx
// O PROVIDER DE SESSÃO. Fino de propósito: toda a decisão vive em `sessionContract.js`,
// que é puro e testável sem montar React.
//
// ─── O QUE ESTE FICHEIRO GARANTE ────────────────────────────────────────────────────
//   1. arranca em LOADING e nunca afirma nada antes de haver veredito;
//   2. reage a mudanças de sessão vindas do adaptador (logout noutro separador,
//      token renovado, sessão expirada) — não só ao que aconteceu neste ecrã;
//   3. a preferência de empresa NARROWS dentro das memberships; nunca concede;
//   4. o token nunca é guardado aqui. Pede-se ao adaptador a cada chamada, porque é
//      ele que sabe se entretanto foi renovado.

import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTH_STATUS, COMPANY_STATUS,
  loadingSession, anonymousSession, erroredSession, authenticatedSession,
  isAuthenticated, isAuthLoading, canMountFinancialApp, sessionCan,
} from "./sessionContract.js";
import { createAuthAdapter } from "./authAdapters.js";
import { AUTH_MODE, modeRequiresAuthentication } from "./authMode.js";
import { createNullAuthAdapter } from "./authAdapterPort.js";
import { resolveUiCapability } from "./uiPermissions.js";
import { limparResiduoDeGraficos } from "../lib/chartResidue.js";

export { AUTH_STATUS, COMPANY_STATUS };

const AuthContext = createContext(null);

/* A empresa preferida vive no `localStorage` porque é uma preferência de INTERFACE:
 * qual das minhas empresas quero ver ao abrir. Sobrevive ao fecho do separador, ao
 * contrário da sessão simulada, que é de propósito por-separador.
 *
 * Não concede acesso a nada. Ver `resolveActiveCompany`. */
const CHAVE_EMPRESA_PREFERIDA = "finer-one.empresa-preferida";

function lerPreferencia() {
  try { return globalThis.localStorage?.getItem(CHAVE_EMPRESA_PREFERIDA) ?? null; }
  catch { return null; }
}
function escreverPreferencia(id) {
  try {
    if (id) globalThis.localStorage?.setItem(CHAVE_EMPRESA_PREFERIDA, id);
    else globalThis.localStorage?.removeItem(CHAVE_EMPRESA_PREFERIDA);
  } catch { /* sem storage: a escolha vale só para esta sessão */ }
}

/**
 * @param {object} props
 * @param {object} [props.env]      Ambiente injetável (testes).
 * @param {object} [props.adapter]  Adaptador injetável (testes). Quando presente,
 *   ignora o ambiente por completo — é o que permite exercer login, logout e troca de
 *   empresa sem provider nenhum.
 */
export function AuthProvider({ children, env, adapter: adapterInjetado, mode: modeInjetado }) {
  const ambiente = env ?? import.meta.env;

  const [session, setSession] = useState(loadingSession);
  const [mode, setMode] = useState(modeInjetado ?? null);
  const [modeReason, setModeReason] = useState(null);
  const [adapter, setAdapter] = useState(adapterInjetado ?? null);
  const [signingIn, setSigningIn] = useState(false);

  /* A preferência é guardada numa ref e não no estado: mudá-la não deve, por si só,
   * provocar um render — provoca-o a sessão que dela resulta. */
  const preferenciaRef = useRef(lerPreferencia());

  /** Traduz o que o adaptador devolveu numa sessão. Um sítio só, para que o caminho
   *  do arranque e o das notificações não possam divergir. */
  const aplicar = useCallback((bruta) => {
    if (!bruta) { setSession(anonymousSession()); return; }
    setSession(authenticatedSession({
      user: bruta.user,
      companies: bruta.companies,
      preferredCompanyId: preferenciaRef.current,
    }));
  }, []);

  // ── Arranque: construir o adaptador e perguntar-lhe pela sessão ──
  useEffect(() => {
    let vivo = true;

    async function arrancar() {
      let a = adapterInjetado;
      let m = modeInjetado ?? AUTH_MODE.DISABLED;
      let razao = null;

      if (!a) {
        const criado = await createAuthAdapter(ambiente);
        a = criado.adapter ?? createNullAuthAdapter();
        m = criado.mode;
        razao = criado.reason ?? null;
      }
      if (!vivo) return;
      setAdapter(a);
      setMode(m);
      setModeReason(razao);

      /* AUTENTICAÇÃO DESLIGADA: a aplicação corre como corria antes desta fundação.
       * NÃO se fabrica uma sessão falsa para isso — a sessão fica `unauthenticated` e
       * quem decide montar a aplicação é `requiresAuth`, que é `false` neste modo.
       * Fabricar aqui um utilizador "anónimo autenticado" seria criar exatamente o tipo
       * de estado que mais tarde alguém confundiria com uma sessão a sério. */
      if (!modeRequiresAuthentication(m)) {
        setSession(anonymousSession());
        return;
      }

      try {
        const bruta = await a.getSession();
        if (!vivo) return;
        aplicar(bruta);
      } catch {
        /* O provider não respondeu. ERROR e não `unauthenticated`: dizer "faça login" a
         * quem não conseguimos sequer perguntar mente sobre a causa e leva o utilizador
         * a tentar credenciais que estão certas. */
        if (vivo) setSession(erroredSession("provider_indisponivel"));
      }
    }

    arrancar();
    return () => { vivo = false; };
  }, [ambiente, adapterInjetado, modeInjetado, aplicar]);

  // ── Mudanças de sessão vindas de fora deste ecrã ──
  useEffect(() => {
    if (!adapter || !modeRequiresAuthentication(mode)) return undefined;
    const cancelar = adapter.onAuthStateChange((bruta) => aplicar(bruta));
    return typeof cancelar === "function" ? cancelar : undefined;
  }, [adapter, mode, aplicar]);

  const signIn = useCallback(async (credenciais) => {
    if (!adapter) return { ok: false, code: "nao_configurado" };
    setSigningIn(true);
    try {
      const r = await adapter.signIn(credenciais);
      if (r && r.ok) {
        /* Relê a sessão em vez de a deduzir do sucesso do login. O adaptador é a
         * autoridade sobre o que existe; assumir aqui uma sessão que ele ainda não
         * confirmou seria montar a aplicação sobre uma suposição. */
        try { aplicar(await adapter.getSession()); } catch { setSession(erroredSession("provider_indisponivel")); }
      }
      return r;
    } finally {
      setSigningIn(false);
    }
  }, [adapter, aplicar]);

  const signOut = useCallback(async () => {
    /* A sessão local cai PRIMEIRO. Se o pedido de logout ao provider falhar (rede), a
     * aplicação financeira já não está montada — que é o comportamento certo: a
     * intenção do utilizador foi sair, e ficar a ver a DRE enquanto se tenta contactar
     * um servidor é o oposto do que ele pediu. */
    setSession(anonymousSession());
    /* ── RESÍDUO DE GRÁFICOS (FASE 17) ─────────────────────────────────────────────
     * O Recharts deixa um `<span>` de medição no `document.body`, FORA de `#root`, com
     * o último rótulo que mediu. O React não o desmonta porque nunca o montou — e sem
     * esta linha, um valor financeiro real da empresa continuava legível no DOM depois
     * de terminar sessão. Observado no Chrome. Ver `lib/chartResidue.js`. */
    limparResiduoDeGraficos();
    try { await adapter?.signOut(); } catch { /* a sessão local já caiu */ }
  }, [adapter]);

  /** Troca a empresa ATIVA. Só dentro das memberships — uma troca para uma empresa que
   *  não está na lista é ignorada, e nem sequer é registada como preferência. */
  const switchCompany = useCallback((companyId) => {
    setSession((atual) => {
      if (!isAuthenticated(atual)) return atual;
      const alvo = atual.companies.find((c) => c.companyId === companyId);
      if (!alvo) return atual;
      /* Trocar de empresa também tem de limpar o resíduo: um rótulo da empresa A no DOM
       * enquanto o ecrã diz "empresa B ainda não tem dados ligados" contradiz a própria
       * afirmação desse ecrã. É a regra da FASE 3 — empresa B ativa, zero informação
       * financeira de A. */
      limparResiduoDeGraficos();
      preferenciaRef.current = companyId;
      escreverPreferencia(companyId);
      return authenticatedSession({
        user: atual.user,
        companies: atual.companies,
        preferredCompanyId: companyId,
      });
    });
  }, []);

  /** O token de acesso, pedido ao adaptador NO MOMENTO. Nunca em cache aqui. */
  const getAccessToken = useCallback(async () => {
    if (!adapter) return null;
    try { return await adapter.getAccessToken(); } catch { return null; }
  }, [adapter]);

  const value = useMemo(() => ({
    session,
    status: session.status,
    user: session.user,
    company: session.company,
    companies: session.companies,
    companyStatus: session.companyStatus,
    role: session.role,
    capabilities: session.capabilities,

    mode,
    modeReason,
    /* `true` só quando há um provider a sério a decidir. É isto que o gate de rotas lê,
     * e é isto que mantém o modo de desenvolvimento atual a funcionar (FASE 19). */
    requiresAuth: modeRequiresAuthentication(mode),
    simulated: !!(adapter && adapter.simulated),
    adapterId: adapter ? adapter.id : null,
    fixtures: (adapter && adapter.fixtures) || null,

    loading: isAuthLoading(session),
    authenticated: isAuthenticated(session),
    canMountApp: canMountFinancialApp(session),

    /* ── DUAS PERGUNTAS PARECIDAS QUE NÃO SÃO A MESMA ──────────────────────────────
     * `can`   ESTRITO: a membership da empresa ativa concede? `false` sem sessão, o que
     *         inclui o modo sem autenticação de hoje. É a pergunta certa para telemetria
     *         e para espelhar o que o servidor vai decidir.
     *
     * `uiCan` A pergunta que a INTERFACE deve fazer: devo oferecer esta ação? Com
     *         autenticação desligada não existem papéis, e por isso oferece. Ligar um CTA
     *         a `can` fá-lo-ia desaparecer na instalação atual, que corre sem provider —
     *         uma regressão funcional disfarçada de melhoria de segurança.
     *
     * O porquê, por extenso e com um teste por metade, em `uiPermissions.js`. */
    can: (cap) => sessionCan(session, cap),
    uiCan: (cap) => resolveUiCapability({
      requiresAuth: modeRequiresAuthentication(mode), session, capability: cap,
    }).allowed,
    uiCapability: (cap) => resolveUiCapability({
      requiresAuth: modeRequiresAuthentication(mode), session, capability: cap,
    }),

    signingIn, signIn, signOut, switchCompany, getAccessToken,
  }), [session, mode, modeReason, adapter, signingIn, signIn, signOut, switchCompany, getAccessToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth deve ser usado dentro de <AuthProvider>.");
  return ctx;
}
