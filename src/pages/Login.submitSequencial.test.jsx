// @vitest-environment happy-dom
//
// R-34 — SUBMITS SEQUENCIAIS: existe algum caminho da APLICAÇÃO que gere um pedido
// de autenticação a mais?
//
// ─── A PERGUNTA QUE ESTE FICHEIRO RESPONDE, E A QUE NÃO RESPONDE ─────────────────────
// `Login.submitUnico.test.jsx` fechou os submits CONCORRENTES: dois eventos no mesmo
// tick produzem um só pedido. Sobrou a outra metade do R-34, que é a que a assinatura
// observada exige — três `400` e depois um `200` **em eventos SEPARADOS no tempo**, com
// o campo de email a mudar sozinho entre eles. A guarda de reentrância não cobre isso
// por construção: ela levanta-se quando o pedido responde, e TEM de se levantar (quem
// errou a palavra-passe tem de poder tentar outra vez).
//
// Então a pergunta passa a ser outra, e é esta: **a aplicação consegue, sozinha, emitir
// um segundo evento de submit?** Um efeito, um re-render, o StrictMode, uma notificação
// de `onAuthStateChange`, um listener duplicado — qualquer coisa que submeta sem que
// alguém (pessoa, browser ou gestor de palavras-passe) o tenha pedido.
//
// A resposta que estes testes fixam é NÃO, e fixam-na pelo invariante mais forte que
// aqui se consegue exprimir:
//
//     nº de pedidos de autenticação === nº de eventos `submit` que o formulário recebeu
//
// Contar os DOIS lados é o que distingue as duas hipóteses. Se um dia sair um pedido sem
// submit correspondente, a causa é NOSSA e este ficheiro fica vermelho. Enquanto os dois
// números forem iguais, cada pedido teve um evento a dar-lhe origem — e a origem desse
// evento está fora deste processo.
//
// ─── PORQUE ISTO NÃO ABSOLVE NEM ACUSA O GESTOR DE PALAVRAS-PASSE ───────────────────
// Não absolve: provar que a aplicação não resubmete não prova QUEM resubmeteu. Não
// acusa: nada aqui observa um gestor de palavras-passe. O que fica provado é a fronteira
// — de que lado dela a causa NÃO está.
//
// ─── O QUE O `happy-dom` NÃO ALCANÇA (medido nesta sessão, não suposto) ─────────────
// Sondado com um formulário nu, antes de escrever estes testes:
//
//   | gesto                  | evento `submit`? |
//   |------------------------|------------------|
//   | `botão.click()`        | SIM — cenário B  |
//   | `form.requestSubmit()` | SIM — cenário D  |
//   | `Enter` num campo      | **NÃO**          |
//   | `form.submit()`        | **NÃO**          |
//
// O `Enter` (submissão implícita) **não** está implementado no `happy-dom`. O cenário C
// fica por cobrir aqui e só se fecha em browser real — mas num browser a submissão
// implícita emite **um** evento `submit`, exatamente o mesmo caminho de B e D, que estes
// testes cobrem.
//
// O `form.submit()` não emitir evento **é a norma, não uma lacuna**: `submit()` salta o
// evento e a validação de propósito. E é por isso que ele NÃO pode explicar o R-34 — sem
// evento não há `submeter`, sem `submeter` não há `signIn`, e o que `form.submit()` faria
// era uma NAVEGAÇÃO nativa do formulário, não um `POST` ao Supabase. Hipótese fechada.
//
// ─── E DO LADO DO SDK: UM `signIn` É UM `POST`, SEM RETRIES ─────────────────────────
// Lido em `@supabase/auth-js@2.112.4` (a versão instalada), porque sem isto o invariante
// acima não chegaria ao fio:
//
//   * `GoTrueClient.signInWithPassword` emite **um** `_request` e mais nenhum
//     (`dist/main/GoTrueClient.js:927` para email, `:939` para telefone — são os dois
//     ramos do mesmo `if`, nunca os dois);
//   * `_request` / `_handleRequest` (`dist/main/lib/fetch.js:99,119`) **não repetem** o
//     pedido. Não há retry, não há backoff;
//   * o único `retryable()` do SDK (`GoTrueClient.js:4012`) está no caminho do
//     `grant_type=refresh_token` (`:4017`) — **outro** `grant_type`. A renovação
//     automática de token NÃO pode aparecer como `grant_type=password`.
//
// Portanto: N pedidos `POST /auth/v1/token?grant_type=password` === N chamadas a
// `signInWithPassword` === N chamadas a `adapter.signIn` === N eventos `submit` que
// passaram a guarda. Os quatro pedidos observados foram quatro submissões, e nenhuma
// nasceu do código desta aplicação.
//
// NUNCA se escreve aqui uma palavra-passe real nem um token: as credenciais destes
// testes são inválidas por construção e o adaptador é um duplo que não fala com a rede.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { AUTH_MODE } from "../auth/authMode.js";
import Login from "./Login.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Um adaptador que conta os pedidos e deixa o teste decidir quando cada um assenta.
 * Guarda uma FILA de resolvers: nos cenários sequenciais há mais do que um pedido ao
 * longo do teste, e resolver só "o último" esconderia um pedido perdido. */
function adaptadorQueConta() {
  const chamadas = [];
  const fila = [];
  return {
    id: "conta",
    simulated: false,
    chamadas,
    async getSession() { return null; },
    onAuthStateChange() { return () => {}; },
    async signIn() {
      chamadas.push(true);
      return new Promise((res) => fila.push(res));
    },
    async signOut() {},
    async getAccessToken() { return null; },
    responder(r) { const f = fila.shift(); if (f) f(r); },
    pendentes() { return fila.length; },
  };
}

const CREDENCIAIS_INVALIDAS = { ok: false, code: "credenciais_invalidas" };

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

/** Um contador de eventos `submit` ligado ao FORMULÁRIO, em fase de captura.
 *  Captura porque tem de contar o evento mesmo que alguém, um dia, o pare a meio. */
function contarSubmits(form) {
  const contador = { n: 0 };
  form.addEventListener("submit", () => { contador.n += 1; }, true);
  return contador;
}

/* Uma casca com estado próprio: é o que permite forçar um re-render do `Login` a partir
 * de fora, sem lhe tocar — o cenário G. */
function fazerCasca() {
  const ref = { forcar: null };
  function Casca() {
    const [n, setN] = React.useState(0);
    ref.forcar = () => setN((v) => v + 1);
    return <div data-render={n}><Login /></div>;
  }
  return { Casca, forcar: () => ref.forcar && ref.forcar() };
}

async function montar(adapter, { strict = false, Filho = Login } = {}) {
  const arvore = (
    <AuthProvider adapter={adapter} mode={AUTH_MODE.SUPABASE} env={{ DEV: false, PROD: true }}>
      <Filho />
    </AuthProvider>
  );
  await act(async () => {
    root.render(strict ? <React.StrictMode>{arvore}</React.StrictMode> : arvore);
  });
  const form = container.querySelector("form");
  return {
    form,
    email: container.querySelector("#email"),
    password: container.querySelector("#current-password"),
    botao: container.querySelector('button[type="submit"]'),
    submits: contarSubmits(form),
  };
}

function preencher(campo, valor) {
  const setter = Object.getOwnPropertyDescriptor(campo.constructor.prototype, "value").set;
  setter.call(campo, valor);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

async function preencherCredenciaisInvalidas(email, password) {
  await act(async () => {
    preencher(email, "nao-existe@invalido.test");
    preencher(password, "credencial-invalida-de-teste");
  });
}

describe("R-34 — nenhum caminho da aplicação gera um submit a mais", () => {
  it("B · um clique único no botão produz UM submit e UM pedido", async () => {
    const adapter = adaptadorQueConta();
    const { email, password, botao, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { botao.click(); });

    expect(submits.n).toBe(1);
    expect(adapter.chamadas.length).toBe(1);
  });

  it("D · um `requestSubmit()` único — o gesto do gestor de palavras-passe — produz UM pedido", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { form.requestSubmit(); });

    expect(submits.n).toBe(1);
    expect(adapter.chamadas.length).toBe(1);
  });

  it("E · dois eventos ESPAÇADOS produzem dois pedidos — e é o comportamento correto", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { form.requestSubmit(); });
    await act(async () => { adapter.responder(CREDENCIAIS_INVALIDAS); });
    await act(async () => { form.requestSubmit(); });

    /* Dois submits, dois pedidos. A guarda é de REENTRÂNCIA, não um limite de tentativas:
     * uma guarda que não se levantasse deixava de fora quem errou a palavra-passe. O que
     * importa é que os dois números continuem IGUAIS. */
    expect(submits.n).toBe(2);
    expect(adapter.chamadas.length).toBe(2);
  });

  it("G · um re-render ENQUANTO o pedido está em voo não gera submit nem pedido novo", async () => {
    const adapter = adaptadorQueConta();
    const { Casca, forcar } = fazerCasca();
    const { form, email, password, submits } = await montar(adapter, { Filho: Casca });
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { form.requestSubmit(); });
    expect(adapter.chamadas.length).toBe(1);

    /* O pedido continua pendente de propósito: é exatamente a janela em que o R-34 foi
     * observado — entre o `400` e o pedido seguinte. */
    expect(adapter.pendentes()).toBe(1);
    await act(async () => { forcar(); });
    await act(async () => { forcar(); });

    expect(submits.n).toBe(1);
    expect(adapter.chamadas.length).toBe(1);
  });

  it("H · erro → nova tentativa: cada tentativa é um submit, e nunca mais do que isso", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    /* Três falhas seguidas — a forma exata da assinatura observada (três `400`). Se a
     * aplicação acrescentasse um pedido em qualquer ponto deste ciclo, é aqui que
     * apareceria. */
    for (let i = 0; i < 3; i += 1) {
      await act(async () => { form.requestSubmit(); });
      await act(async () => { adapter.responder(CREDENCIAIS_INVALIDAS); });
    }

    expect(submits.n).toBe(3);
    expect(adapter.chamadas.length).toBe(3);
  });

  it("um erro pintado no ecrã não desencadeia um pedido novo", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { form.requestSubmit(); });
    await act(async () => { adapter.responder(CREDENCIAIS_INVALIDAS); });

    /* O `role="alert"` aparece e o React repinta. Nenhum efeito pendurado nesse render
     * pode voltar a submeter. */
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(submits.n).toBe(1);
    expect(adapter.chamadas.length).toBe(1);
  });

  it("montar — inclusive sob StrictMode, que monta duas vezes — não autentica nada", async () => {
    const adapter = adaptadorQueConta();
    const { submits } = await montar(adapter, { strict: true });

    /* O StrictMode duplica renders e efeitos de propósito. Duplicar um EFEITO que
     * autenticasse seria um pedido fantasma — um sem submit nenhum a dar-lhe origem. */
    expect(submits.n).toBe(0);
    expect(adapter.chamadas.length).toBe(0);
  });

  it("mudar o email entre tentativas não submete por si só", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    await act(async () => { form.requestSubmit(); });
    await act(async () => { adapter.responder(CREDENCIAIS_INVALIDAS); });

    /* No R-34 o campo de email mudou SOZINHO entre o pedido que falhou e o que passou.
     * Seja quem for que o mudou, a mudança em si não pode submeter: se preencher um campo
     * bastasse para autenticar, a aplicação teria um caminho próprio para o quarto
     * pedido — e é essa possibilidade que este teste elimina. */
    await act(async () => { preencher(email, "outra-conta@invalido.test"); });

    expect(submits.n).toBe(1);
    expect(adapter.chamadas.length).toBe(1);
  });

  it("`form.submit()` não emite evento — e por isso não pode explicar o R-34", async () => {
    const adapter = adaptadorQueConta();
    const { form, email, password, submits } = await montar(adapter);
    await preencherCredenciaisInvalidas(email, password);

    /* Por norma, `submit()` salta o evento e a validação. Sem evento não há `submeter`,
     * sem `submeter` não há `signIn`. O que `submit()` faria num browser é uma NAVEGAÇÃO
     * do formulário — visível, e nada parecida com um `POST` silencioso ao Supabase. */
    await act(async () => { form.submit(); });

    expect(submits.n).toBe(0);
    expect(adapter.chamadas.length).toBe(0);
  });
});
