// @vitest-environment happy-dom
//
// UM SUBMIT DE CADA VEZ — a guarda de reentrância do formulário de login.
//
// ─── DE ONDE VEM ESTE TESTE (R-34) ──────────────────────────────────────────────────
// Na validação de E2 em browser real, um único clique em "Entrar" foi seguido de QUATRO
// `POST /auth/v1/token?grant_type=password` — três `400` e depois um `200` sem novo
// clique. Os corpos não se abriram para depurar, porque levam credenciais. Ficaram duas
// hipóteses: a aplicação a resubmeter, ou o gestor de palavras-passe a fazê-lo.
//
// Este teste NÃO decide essa questão — ela vive no browser e no gestor de palavras-passe.
// Decide a metade que é NOSSA e que se pode provar aqui: se dois eventos de submit
// chegarem ao formulário antes de o React ter pintado o botão desativado, quantos
// pedidos de autenticação saem?
//
// ─── PORQUE `disabled={signingIn}` NÃO É A RESPOSTA ─────────────────────────────────
// `signingIn` é ESTADO do React. Entre o clique e o commit que desativa o botão há uma
// janela; e um submit programático — `form.requestSubmit()`, que é o que um gestor de
// palavras-passe usa — nem sequer passa pelo botão. O `disabled` é uma affordance visual,
// não uma guarda.
//
// Cada submit a mais é uma tentativa de autenticação a mais a gastar o rate limit do
// Supabase. Numa página de login é onde esse limite mais custa: quem o esgota fica de
// fora com credenciais certas.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { AUTH_MODE } from "../auth/authMode.js";
import Login from "./Login.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Um adaptador que CONTA os pedidos de autenticação e não os resolve sozinho: o teste
 * decide quando a promessa assenta, que é o que permite reproduzir a janela real —
 * dois submits enquanto o primeiro ainda está em voo. */
function adaptadorQueConta() {
  const chamadas = [];
  let resolver = null;
  return {
    id: "conta",
    simulated: false,
    chamadas,
    async getSession() { return null; },
    onAuthStateChange() { return () => {}; },
    async signIn(credenciais) {
      chamadas.push(credenciais);
      return new Promise((res) => { resolver = res; });
    },
    async signOut() {},
    async getAccessToken() { return null; },
    responder(r) { const f = resolver; resolver = null; if (f) f(r); },
  };
}

let container = null;
let root = null;

beforeEach(() => {
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

async function montarLogin(adapter) {
  await act(async () => {
    root.render(
      <AuthProvider adapter={adapter} mode={AUTH_MODE.SUPABASE} env={{ DEV: false, PROD: true }}>
        <Login />
      </AuthProvider>
    );
  });
  const form = container.querySelector("form");
  const email = container.querySelector("#email");
  const password = container.querySelector("#current-password");
  return { form, email, password };
}

function preencher(campo, valor) {
  const setter = Object.getOwnPropertyDescriptor(campo.constructor.prototype, "value").set;
  setter.call(campo, valor);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

function submeter(form) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("R-34 — o formulário de login não resubmete", () => {
  it("dois submits no MESMO tick produzem UM só pedido de autenticação", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password } = await montarLogin(adapter);

    await act(async () => {
      preencher(email, "ana@overcel.com.br");
      preencher(password, "seja-o-que-for");
    });

    /* A janela real: os dois submits chegam antes de o React ter pintado seja o que for
     * a partir do primeiro. É o cenário que o `disabled` do botão não cobre. */
    await act(async () => {
      submeter(form);
      submeter(form);
    });

    expect(adapter.chamadas.length).toBe(1);
  });

  it("um submit enquanto o anterior ainda está EM VOO é ignorado", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password } = await montarLogin(adapter);

    await act(async () => {
      preencher(email, "ana@overcel.com.br");
      preencher(password, "seja-o-que-for");
    });

    await act(async () => { submeter(form); });
    expect(adapter.chamadas.length).toBe(1);

    /* O primeiro pedido ainda não respondeu. Um submit programático — o que um gestor de
     * palavras-passe dispara — não passa pelo botão e por isso não vê o `disabled`. */
    await act(async () => { submeter(form); });
    expect(adapter.chamadas.length).toBe(1);
  });

  it("depois de o pedido responder, um novo submit VOLTA a ser aceite", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password } = await montarLogin(adapter);

    await act(async () => {
      preencher(email, "ana@overcel.com.br");
      preencher(password, "errada");
    });

    await act(async () => { submeter(form); });
    await act(async () => { adapter.responder({ ok: false, code: "credenciais_invalidas" }); });

    /* A guarda não pode transformar-se num bloqueio permanente: quem errou a
     * palavra-passe tem de poder tentar outra vez. */
    await act(async () => { submeter(form); });
    expect(adapter.chamadas.length).toBe(2);
  });
});
