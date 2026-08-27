// @vitest-environment happy-dom
//
// O PORTÃO, MONTADO A SÉRIO.
//
// ─── PORQUE ESTES TESTES MONTAM REACT, AO CONTRÁRIO DOS OUTROS DO PROJETO ───────────
// O projeto testa páginas de forma ESTRUTURAL (ver `AjustesManuais.estrutura.test.js`):
// analisa-se o código-fonte em vez de montar componentes, porque a decisão vive toda em
// view-models puros e montar meio React não acrescentaria nada.
//
// Aqui é o contrário, e por uma razão específica: a afirmação que interessa provar é
// "o componente protegido NÃO É MONTADO". Isso não se lê no código-fonte — lê-se
// perguntando ao componente se ele correu. Um teste estrutural veria um `if` e teria de
// acreditar nele.
//
// A sonda é um componente que regista quando monta e quando corre o seu efeito. Se o
// portão falhar, ela regista — e o teste falha com a prova na mão.
//
// Sem dependências novas: `happy-dom` já é devDependency (usada por `csvExport.test.js`)
// e `act` vem do próprio React 18.3.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./AuthContext.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { AUTH_MODE } from "./authMode.js";
import { ROLES } from "./authorizationCore.js";

/* React 18 avisa se `act` correr sem esta bandeira, e o aviso polui a saída de forma
 * que esconde falhas verdadeiras. */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ─────────────────────────────────────────────────────────────────────────────────
 * A SONDA
 * ───────────────────────────────────────────────────────────────────────────────── */

const espia = { montou: 0, efeitoCorreu: 0 };

function SondaFinanceira() {
  useEffect(() => { espia.efeitoCorreu += 1; }, []);
  espia.montou += 1;
  return <div data-testid="app-financeira">DRE: 84.300,00</div>;
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * ADAPTADOR CONTROLÁVEL
 * ───────────────────────────────────────────────────────────────────────────────── */

const OVERCEL = { companyId: "overcel", name: "Overcel", currency: "BRL", locale: "pt-BR", role: ROLES.OWNER };

function adaptadorFalso({ sessaoInicial = null, falhar = false } = {}) {
  let sessao = sessaoInicial;
  const ouvintes = new Set();
  return {
    id: "falso",
    simulated: false,
    async getSession() {
      if (falhar) throw new Error("provider em baixo");
      return sessao;
    },
    onAuthStateChange(cb) { ouvintes.add(cb); return () => ouvintes.delete(cb); },
    async signIn({ email } = {}) {
      if (email !== "ana@overcel.com.br") return { ok: false, code: "credenciais_invalidas" };
      sessao = { user: { id: "u1", email, name: "Ana" }, companies: [OVERCEL] };
      for (const cb of ouvintes) cb(sessao);
      return { ok: true };
    },
    async signOut() { sessao = null; for (const cb of ouvintes) cb(null); },
    async getAccessToken() { return sessao ? "token-falso" : null; },
    _forcar(nova) { sessao = nova; for (const cb of ouvintes) cb(nova); },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────────
 * MONTAGEM
 * ───────────────────────────────────────────────────────────────────────────────── */

let container = null;
let root = null;

beforeEach(() => {
  espia.montou = 0;
  espia.efeitoCorreu = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  container = null;
  root = null;
});

async function montar({ adapter, mode = AUTH_MODE.DEV }) {
  await act(async () => {
    root.render(
      <AuthProvider adapter={adapter} mode={mode} env={{ DEV: true, PROD: false }}>
        <ProtectedRoute><SondaFinanceira /></ProtectedRoute>
      </AuthProvider>
    );
  });
}

const texto = () => container.textContent;
const temApp = () => !!container.querySelector('[data-testid="app-financeira"]');

/* ═══════════════════════════════════════════════════════════════════════════════════
 * NÃO AUTENTICADO -> A APLICAÇÃO PROTEGIDA NÃO EXISTE
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("não autenticado", () => {
  it("mostra o Login e a aplicação financeira NÃO É MONTADA", async () => {
    await montar({ adapter: adaptadorFalso({ sessaoInicial: null }) });

    expect(temApp()).toBe(false);
    expect(texto()).toContain("Entrar");

    /* O ponto do teste: não foi escondida — nunca chegou a existir. */
    expect(espia.montou).toBe(0);
    expect(espia.efeitoCorreu).toBe(0);
  });

  it("nenhum número financeiro chega ao DOM", async () => {
    await montar({ adapter: adaptadorFalso({ sessaoInicial: null }) });
    expect(container.innerHTML).not.toContain("84.300");
    expect(container.innerHTML).not.toContain("DRE");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * AUTENTICADO -> A APLICAÇÃO ESTÁ DISPONÍVEL
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("autenticado", () => {
  it("com sessão e uma empresa, a aplicação monta", async () => {
    await montar({
      adapter: adaptadorFalso({ sessaoInicial: { user: { id: "u1", email: "ana@overcel.com.br" }, companies: [OVERCEL] } }),
    });
    expect(temApp()).toBe(true);
    expect(espia.montou).toBeGreaterThan(0);
  });

  it("login a partir do ecrã de Login abre a aplicação", async () => {
    const adapter = adaptadorFalso({ sessaoInicial: null });
    await montar({ adapter });
    expect(temApp()).toBe(false);

    await act(async () => { await adapter.signIn({ email: "ana@overcel.com.br" }); });
    expect(temApp()).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * LOGOUT -> A ROTA PROTEGIDA FECHA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("logout", () => {
  it("desmonta a aplicação e volta ao Login", async () => {
    const adapter = adaptadorFalso({
      sessaoInicial: { user: { id: "u1", email: "ana@overcel.com.br" }, companies: [OVERCEL] },
    });
    await montar({ adapter });
    expect(temApp()).toBe(true);

    await act(async () => { await adapter.signOut(); });

    expect(temApp()).toBe(false);
    expect(texto()).toContain("Entrar");
    expect(container.innerHTML).not.toContain("84.300");
  });

  it("um logout NOUTRO SEPARADOR também fecha esta aba", async () => {
    /* É para isto que `onAuthStateChange` é obrigatório no porto: sem ele, esta aba
     * continuaria a mostrar a DRE de uma sessão que já não existe. */
    const adapter = adaptadorFalso({
      sessaoInicial: { user: { id: "u1", email: "ana@overcel.com.br" }, companies: [OVERCEL] },
    });
    await montar({ adapter });
    expect(temApp()).toBe(true);

    await act(async () => { adapter._forcar(null); });
    expect(temApp()).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * SESSÃO VÁLIDA, ZERO MEMBERSHIPS
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("autenticado sem empresa", () => {
  it("mostra acesso não configurado e NÃO monta a aplicação", async () => {
    await montar({
      adapter: adaptadorFalso({ sessaoInicial: { user: { id: "u9", email: "novo@exemplo.com" }, companies: [] } }),
    });
    expect(temApp()).toBe(false);
    expect(espia.montou).toBe(0);
    expect(texto()).toContain("Acesso ainda não configurado");
    /* Sem esta saída, as páginas cairiam em `sales?.x ?? mockData.x` e mostrariam os
     * números da Overcel fictícia a alguém sem empresa nenhuma. */
    expect(container.innerHTML).not.toContain("84.300");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * AVARIA != ANÓNIMO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("o provider falhou", () => {
  it("mostra avaria e NÃO diz ao utilizador para fazer login", async () => {
    await montar({ adapter: adaptadorFalso({ falhar: true }) });
    expect(temApp()).toBe(false);
    expect(texto()).toContain("Não foi possível verificar a sua sessão");
    expect(texto()).not.toContain("Palavra-passe");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * MODO SEM AUTENTICAÇÃO (FASE 19)
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("autenticação desligada", () => {
  it("a aplicação monta como antes desta fundação", async () => {
    /* É o que mantém o desenvolvimento sobre os dados reais da Overcel possível
     * enquanto o provider externo não existe. */
    await montar({ adapter: adaptadorFalso({ sessaoInicial: null }), mode: AUTH_MODE.DISABLED });
    expect(temApp()).toBe(true);
  });

  it("e não fabrica uma sessão falsa para isso", async () => {
    const adapter = adaptadorFalso({ sessaoInicial: null });
    const espiaSessao = vi.spyOn(adapter, "getSession");
    await montar({ adapter, mode: AUTH_MODE.DISABLED });
    /* Nem se pergunta ao adaptador: sem exigência de sessão, não há sessão a resolver. */
    expect(espiaSessao).not.toHaveBeenCalled();
  });
});
