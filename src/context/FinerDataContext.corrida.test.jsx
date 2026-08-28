// @vitest-environment happy-dom
//
// A CORRIDA ENTRE DUAS EMPRESAS.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A FALHA QUE ESTE FICHEIRO EXISTE PARA IMPEDIR
// ═══════════════════════════════════════════════════════════════════════════════════
// O contexto lia os dados sem se proteger de si próprio. A sequência é curta e não
// precisa de ninguém a tentar provocá-la:
//
//   1. empresa = Overcel  -> leitura começa. Os recebíveis são 1,2 MB: demora.
//   2. o utilizador troca -> empresa = Finer Teste. Nova leitura.
//   3. Finer Teste responde depressa (não tem integração).
//   4. a leitura da OVERCEL chega finalmente e escreve no estado.
//
// Resultado: os números da Overcel no ecrã, com "Finer Teste" na barra. Ninguém viu
// dados a que não tivesse acesso — viu o dinheiro de uma empresa com o nome de outra,
// que num produto multiempresa é a pior forma de estar errado, porque parece certa.
//
// ─── PORQUE ESTE TESTE MONTA REACT ─────────────────────────────────────────────────
// Pela mesma razão de `ProtectedRoute.test.jsx`: a afirmação a provar é sobre o que o
// componente FAZ com uma promessa que chega fora de tempo. Isso não se lê no código —
// pergunta-se ao componente, controlando quando cada leitura resolve.
//
// Sem dependências novas: `happy-dom` já é devDependency e `act` vem do React 18.3.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

/* ─── OS DUPLOS ─────────────────────────────────────────────────────────────────────
 * Substitui-se tudo o que o provider consome. O que se testa é a coreografia do
 * provider, não a autenticação nem o transporte — esses têm testes próprios. */

let empresaAtiva = { id: "overcel", name: "Overcel" };
let leiturasPendentes = [];

/* As referencias tem de ser ESTAVEIS entre renders. O provider poe `getAccessToken` e
 * `signOut` nas dependencias de um `useMemo`; devolver funcoes novas a cada chamada faz
 * o transporte mudar de identidade em todos os renders, o efeito voltar a correr e cada
 * leitura tornar-se obsoleta a seguir — que e exatamente o sintoma que este ficheiro
 * existe para detetar, mas por uma razao que nao e a verdadeira. */
const AUTH = {
  requiresAuth: true,
  getAccessToken: async () => "tok",
  signOut: () => {},
  /* A IDENTIDADE DA SESSÃO. Mutável entre renders, como na aplicação real: é isto que
   * muda no logout — e, na aplicação real, é a ÚNICA coisa que muda quando a empresa
   * ativa é a mesma que a da configuração. */
  status: "authenticated",
  user: { id: "user-1" },
};

vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => AUTH }));

vi.mock("../auth/CompanyContext.jsx", () => ({
  useCompany: () => ({ company: empresaAtiva }),
}));

/* Um transporte POR EMPRESA, criado uma vez e reutilizado: muda de identidade quando a
 * empresa muda — como na aplicacao real — e nao muda quando nada mudou. */
const TRANSPORTES = {};
vi.mock("../services/dataTransport.js", async (original) => {
  const real = await original();
  return {
    ...real,
    resolveDataTransport: ({ companyId }) => {
      if (!TRANSPORTES[companyId]) {
        TRANSPORTES[companyId] = { id: "duplo", protegido: true, companyId, async ler() { return null; } };
      }
      return { transport: TRANSPORTES[companyId], motivo: "pronto" };
    },
  };
});

vi.mock("../services/blingDataService.js", () => ({
  /* Cada leitura devolve uma promessa que SÓ resolve quando o teste mandar. É isso que
   * permite forçar a ordem "a segunda chega primeiro". */
  loadFinerData: vi.fn(({ companyId }) => new Promise((resolve) => {
    leiturasPendentes.push({ companyId, resolve });
  })),
}));

const { FinerDataProvider, useFinerData } = await import("./FinerDataContext.jsx");

/** Sonda: escreve num objeto o que o contexto está a dizer neste render. */
function Sonda({ visto }) {
  const ctx = useFinerData();
  visto.sales = ctx.sales;
  visto.source = ctx.source;
  visto.loading = ctx.loading;
  return null;
}

const ENV = {};

let container;
let root;

beforeEach(() => {
  empresaAtiva = { id: "overcel", name: "Overcel" };
  AUTH.status = "authenticated";
  AUTH.user = { id: "user-1" };
  leiturasPendentes = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Resolve a leitura pendente daquela empresa. */
function responder(companyId, payload) {
  const i = leiturasPendentes.findIndex((l) => l.companyId === companyId && !l.respondida);
  if (i === -1) throw new Error(`não há leitura pendente para ${companyId}`);
  leiturasPendentes[i].respondida = true;
  leiturasPendentes[i].resolve(payload);
}

const DADOS_OVERCEL = {
  sales: [{ id: "pedido-overcel", total: 999999.99 }],
  source: "api",
  manualInputs: { origem: "overcel" },
};
const DADOS_FINER_TESTE = { sales: [], source: "api", manualInputs: null };

describe("troca de empresa com uma leitura em voo", () => {
  it("a resposta da empresa ANTERIOR, chegando depois, NÃO entra no estado", async () => {
    const visto = {};
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    /* A leitura da Overcel arrancou e está pendente. */
    expect(leiturasPendentes.map((l) => l.companyId)).toEqual(["overcel"]);

    /* O utilizador troca de empresa. */
    empresaAtiva = { id: "finer-teste", name: "Finer Teste" };
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });
    expect(leiturasPendentes.map((l) => l.companyId)).toEqual(["overcel", "finer-teste"]);

    /* A Finer Teste responde primeiro — não tem integração, é rápida. */
    await act(async () => { responder("finer-teste", DADOS_FINER_TESTE); });
    expect(visto.sales).toEqual([]);

    /* E AGORA a Overcel chega, tarde. É este o momento do defeito. */
    await act(async () => { responder("overcel", DADOS_OVERCEL); });

    expect(visto.sales, "os dados da Overcel entraram sob a Finer Teste").toEqual([]);
    expect(JSON.stringify(visto.sales)).not.toContain("pedido-overcel");
    expect(JSON.stringify(visto)).not.toContain("999999.99");
  });

  it("uma leitura obsoleta também não desliga o `loading` da leitura em curso", async () => {
    const visto = {};
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    empresaAtiva = { id: "finer-teste", name: "Finer Teste" };
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    /* A antiga responde; a nova ainda não. O indicador tem de continuar ligado — senão
     * o ecrã declara-se pronto enquanto a leitura verdadeira ainda vem a caminho. */
    await act(async () => { responder("overcel", DADOS_OVERCEL); });
    expect(visto.loading, "uma leitura obsoleta apagou o indicador de carregamento").toBe(true);

    await act(async () => { responder("finer-teste", DADOS_FINER_TESTE); });
    expect(visto.loading).toBe(false);
    expect(visto.sales).toEqual([]);
  });

  it("sem troca, a leitura normal continua a entrar — a guarda não fechou a porta certa", async () => {
    /* O contrapeso obrigatório: uma guarda demasiado zelosa rejeitaria TODAS as
     * leituras e a aplicação ficava permanentemente vazia, com os testes de recusa
     * todos verdes. */
    const visto = {};
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });
    await act(async () => { responder("overcel", DADOS_OVERCEL); });

    expect(visto.sales).toEqual(DADOS_OVERCEL.sales);
    expect(visto.source).toBe("api");
    expect(visto.loading).toBe(false);
  });

  it("uma leitura obsoleta que FALHA não põe a aplicação em UNAVAILABLE", async () => {
    /* O ramo do `catch` tem a mesma corrida que o do sucesso: uma leitura antiga a
     * rebentar não pode declarar indisponível o que a leitura atual ainda vai dizer. */
    const visto = {};
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    empresaAtiva = { id: "finer-teste", name: "Finer Teste" };
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    await act(async () => { responder("finer-teste", DADOS_FINER_TESTE); });
    expect(visto.source).toBe("api");

    /* A antiga rebenta agora. */
    const antiga = leiturasPendentes.find((l) => l.companyId === "overcel");
    await act(async () => { antiga.resolve(Promise.reject(new Error("rede"))); });

    expect(visto.source, "uma leitura obsoleta declarou a aplicação indisponível").toBe("api");
    expect(visto.sales).toEqual([]);
  });

  it("A -> B -> A de volta: só a geração ATUAL escreve, e as duas antigas calam-se", async () => {
    const visto = {};
    const render = async () => act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    await render();                                              // 1ª leitura: overcel
    empresaAtiva = { id: "finer-teste", name: "Finer Teste" };
    await render();                                              // 2ª leitura: finer-teste
    empresaAtiva = { id: "overcel", name: "Overcel" };
    await render();                                              // 3ª leitura: overcel (a atual)

    expect(leiturasPendentes.map((l) => l.companyId)).toEqual(["overcel", "finer-teste", "overcel"]);

    /* A PRIMEIRA leitura da Overcel chega agora. É da MESMA empresa que a atual — o que
     * a torna obsoleta não é a empresa, é a vez. Um teste que só comparasse `companyId`
     * deixaria esta passar. */
    await act(async () => { responder("overcel", DADOS_OVERCEL); });
    expect(visto.sales, "uma leitura de duas gerações atrás escreveu").toBeNull();
    expect(visto.loading).toBe(true);

    /* A do meio também. */
    await act(async () => { responder("finer-teste", DADOS_FINER_TESTE); });
    expect(visto.sales).toBeNull();
    expect(visto.loading).toBe(true);

    /* E finalmente a atual — o contrapeso: a porta certa ficou aberta. */
    await act(async () => { responder("overcel", DADOS_OVERCEL); });
    expect(visto.sales).toEqual(DADOS_OVERCEL.sales);
    expect(visto.loading).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O LOGOUT — O SEGUNDO VETOR, E O QUE O TORNA DIFERENTE DA TROCA DE EMPRESA
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Na troca de empresa, o `companyId` muda e por isso `load` volta a correr — é isso que
 * incrementa a geração e invalida o que está em voo. No LOGOUT nada disso acontece:
 *
 *   `getAccessToken` e `signOut` são `useCallback([adapter])`  -> estáveis;
 *   `requiresAuth` vem do modo de compilação                   -> estável;
 *   `companyId` volta ao id da CONFIGURAÇÃO quando a sessão cai — e esse id é o da
 *     Overcel, a mesma empresa da sessão que acabou de terminar.
 *
 * Com a Overcel ativa — que é a instalação real — NENHUMA dependência muda. Os testes
 * abaixo reproduzem exatamente isso: a empresa fica IGUAL, e só a sessão cai.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
describe("logout com uma leitura em voo", () => {
  it("o resultado de uma leitura anterior ao logout NÃO reaparece depois dele", async () => {
    const visto = {};
    const render = async () => act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    await render();
    expect(leiturasPendentes.map((l) => l.companyId)).toEqual(["overcel"]);

    /* Termina sessão. A empresa NÃO muda — é o cenário real. */
    AUTH.status = "unauthenticated";
    AUTH.user = null;
    await render();

    /* E AGORA a leitura que partiu com sessão chega, já sem sessão. */
    await act(async () => { responder("overcel", DADOS_OVERCEL); });

    expect(visto.sales, "dados de uma sessão terminada entraram no estado").toBeNull();
    expect(JSON.stringify(visto)).not.toContain("pedido-overcel");
    expect(JSON.stringify(visto)).not.toContain("999999.99");
  });

  it("o logout não deixa a aplicação presa em `loading` — a leitura recomeça", async () => {
    /* A contrapartida de invalidar: se a geração fosse incrementada sem uma leitura
     * nova a segui-la, o indicador de carregamento ficava ligado para sempre — e um
     * `loading` eterno é uma avaria tão visível como os dados errados. */
    const visto = {};
    const render = async () => act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    await render();
    AUTH.status = "unauthenticated";
    AUTH.user = null;
    await render();

    expect(leiturasPendentes.length, "o logout não relançou a leitura").toBe(2);
    await act(async () => { responder("overcel", DADOS_OVERCEL); });   // a antiga: ignorada
    await act(async () => { responder("overcel", DADOS_FINER_TESTE); }); // a nova: manda
    expect(visto.loading).toBe(false);
    expect(visto.sales).toEqual([]);
  });

  it("entrar com OUTRO utilizador invalida a leitura do anterior", async () => {
    const visto = {};
    const render = async () => act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });

    await render();
    AUTH.user = { id: "user-2" };   // mesma empresa, outra pessoa
    await render();

    await act(async () => { responder("overcel", DADOS_OVERCEL); });
    expect(visto.sales, "a leitura do utilizador anterior escreveu").toBeNull();
  });

  it("desmontar invalida o que está em voo, e resolver depois não rebenta", async () => {
    const visto = {};
    await act(async () => {
      root.render(<FinerDataProvider env={ENV}><Sonda visto={visto} /></FinerDataProvider>);
    });
    expect(leiturasPendentes.length).toBe(1);

    await act(async () => { root.unmount(); });
    await act(async () => { responder("overcel", DADOS_OVERCEL); });

    expect(visto.sales).toBeNull();
    /* O `afterEach` desmonta outra vez; um segundo `unmount` é inofensivo. */
    root = createRoot(container);
  });
});
