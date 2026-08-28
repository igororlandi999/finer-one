// UMA AVARIA NUNCA SE APRESENTA COMO MODO DEMONSTRAÇÃO.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A DISTINÇÃO QUE ESTE FICHEIRO DEFENDE
// ═══════════════════════════════════════════════════════════════════════════════════
// `source` tem quatro valores e dois deles parecem-se o suficiente para terem sido a
// mesma coisa até à C7F.1:
//
//   "mock"         NÃO há backend configurado. É uma ESCOLHA de quem instalou, e a
//                  aplicação pode dizer, com verdade, que os números são de exemplo.
//   "unavailable"  HÁ backend configurado e a leitura falhou. É uma AVARIA.
//
// Confundi-los tem uma consequência concreta e má: perante uma quebra de rede, um 502
// do upstream ou uma sessão recusada, a aplicação mostrava dados fictícios da Overcel e
// declarava por escrito "Modo demonstração" — ou seja, afirmava que os números no ecrã
// eram intencionais, quando o que tinha acontecido era perder o acesso aos verdadeiros.
//
// ─── PORQUE ESTE FICHEIRO É SEPARADO DOS OUTROS ────────────────────────────────────
// Os testes existentes exercem falhas ao nível de `api.js` — o transporte LEGADO. Este
// exerce a fronteira que a migração vai atravessar: o transporte PROTEGIDO, com o
// catálogo completo dos seus modos de falha (`AuthorizedApiError`), incluindo os que
// ainda não existem em produção porque a bandeira está desligada.
//
// A afirmação é uma só e é a mesma para todos: com backend configurado, NENHUMA falha
// produz "mock". Se algum dia produzir, o utilizador vê números de uma empresa fictícia
// apresentados como uma decisão deliberada — que é a pior forma de estar errado.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizedApiError, AUTHORIZED_API_ERROR } from "./authorizedApi.js";

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return { ...actual, isApiConfigured: () => true, apiGet: vi.fn(async () => { throw new Error("legado indisponivel"); }) };
});

const { loadFinerData } = await import("./blingDataService.js");

/** Um transporte protegido que falha SEMPRE, do modo que se lhe mandar. */
function transporteQueFalha(erro) {
  return {
    id: "protegido",
    protegido: true,
    companyId: "empresa-b",
    async ler() { throw erro; },
  };
}

/* O catálogo inteiro de falhas do cliente autenticado, mais as que vêm da rede e da
 * plataforma. Cada uma corresponde a uma situação real e distinta:
 *
 *   SEM_SESSAO         o token não chegou a existir — sessão a arrancar, ou já caída;
 *   NAO_AUTENTICADO    401 do BFF: a sessão morreu do lado do servidor;
 *   SEM_ACESSO         403: a sessão é boa, a empresa é que não é desta pessoa;
 *   EMPRESA_INVALIDA   erro nosso: empresa ativa em falta ou malformada;
 *   REDE               o pedido não chegou a lado nenhum;
 *   BACKEND            502/503/500 — incluindo o 502 em que o BFF traduz uma avaria do
 *                      Apps Script, que é precisamente o caso que não pode deslogar
 *                      ninguém nem apagar dados. */
const FALHAS = [
  ["sem sessão", new AuthorizedApiError(AUTHORIZED_API_ERROR.SEM_SESSAO, "Sessão não disponível.")],
  ["401 do BFF", new AuthorizedApiError(AUTHORIZED_API_ERROR.NAO_AUTENTICADO, "Sessão inválida.", { status: 401 })],
  ["403 do BFF", new AuthorizedApiError(AUTHORIZED_API_ERROR.SEM_ACESSO, "Sem acesso.", { status: 403 })],
  ["empresa inválida", new AuthorizedApiError(AUTHORIZED_API_ERROR.EMPRESA_INVALIDA, "Empresa inválida.")],
  ["falha de rede", new AuthorizedApiError(AUTHORIZED_API_ERROR.REDE, "Falha de rede.", { status: 0 })],
  ["502 upstream", new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Falha upstream.", { status: 502 })],
  ["503 indisponível", new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Indisponível.", { status: 503 })],
  ["500 interno", new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Erro interno.", { status: 500 })],
  ["429 excesso", new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Demasiados pedidos.", { status: 429 })],
  ["erro genérico", new Error("qualquer coisa inesperada")],
  ["rejeição sem Error", "uma string atirada"],
];

beforeEach(() => { vi.clearAllMocks(); });

describe("com backend configurado, nenhuma falha vira modo demonstração", () => {
  it.each(FALHAS)("%s -> unavailable, nunca mock", async (_nome, erro) => {
    const r = await loadFinerData({ transport: transporteQueFalha(erro), companyId: "empresa-b" });
    expect(r.source).toBe("unavailable");
    expect(r.source).not.toBe("mock");
    expect(r.sales).toBeNull();
    expect(r.manualInputs).toBeNull();
  });

  it("o transporte NENHUM — sem empresa válida com o protegido ligado — também é avaria", async () => {
    /* `createNullDataTransport` devolve `null` em vez de rejeitar. É a forma que
     * `resolveDataTransport` usa quando a bandeira está ligada e falta a empresa ou o
     * token: fail closed, e nunca o legado anónimo. Um `null` que fosse lido como
     * "resposta vazia" produziria um dataset de zeros — o inverso do que se quer. */
    const nenhum = { id: "nenhum", protegido: false, companyId: null, async ler() { return null; } };
    const r = await loadFinerData({ transport: nenhum, companyId: "empresa-b" });
    expect(r.source).toBe("unavailable");
    expect(r.sales).toBeNull();
  });

  it("o contrapeso: uma leitura BOA continua a produzir `api` e um dataset", async () => {
    /* Sem isto, uma guarda que devolvesse `unavailable` para tudo passaria os onze
     * testes acima e partiria a aplicação inteira em silêncio. */
    const bom = {
      id: "protegido", protegido: true, companyId: "empresa-b",
      async ler(recurso) {
        if (recurso === "recebiveis") return { data: [], debug: { fonte: "snapshot" } };
        if (recurso === "ajustes-manuais") return { data: null, debug: { fonte: "documento-vazio" } };
        return { data: [] };
      },
    };
    const r = await loadFinerData({ transport: bom, companyId: "empresa-b" });
    expect(r.source).toBe("api");
    expect(r.sales).not.toBeNull();
    expect(r.sales.companyId).toBe("empresa-b");
  });
});

describe("uma fonte SECUNDÁRIA em falha não derruba as que responderam", () => {
  /* O best-effort por fonte. Uma falha nas despesas não pode apagar os pedidos: apagá-los
   * transformaria uma indisponibilidade parcial numa indisponibilidade total, e o
   * utilizador perderia acesso a dados que estão perfeitamente disponíveis. */
  function transporteParcial(recursoQueFalha, erro) {
    return {
      id: "protegido", protegido: true, companyId: "empresa-b",
      async ler(recurso) {
        if (recurso === recursoQueFalha) throw erro;
        if (recurso === "recebiveis") return { data: [], debug: { fonte: "snapshot" } };
        if (recurso === "ajustes-manuais") return { data: null, debug: { fonte: "documento-vazio" } };
        return { data: [] };
      },
    };
  }

  it.each([
    ["despesas", "payables"],
    ["recebiveis", "receivables"],
  ])("%s em 502 deixa o dataset de pé, com a fonte marcada como ausente", async (recurso) => {
    const erro = new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Falha upstream.", { status: 502 });
    const r = await loadFinerData({ transport: transporteParcial(recurso, erro), companyId: "empresa-b" });
    expect(r.source, `${recurso} em falha derrubou o dataset inteiro`).toBe("api");
    expect(r.sales).not.toBeNull();
  });

  it("os PEDIDOS em falha derrubam o dataset — são a fonte primária, e não há o que construir", async () => {
    const erro = new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Falha upstream.", { status: 502 });
    const r = await loadFinerData({ transport: transporteParcial("pedidos", erro), companyId: "empresa-b" });
    expect(r.source).toBe("unavailable");
    expect(r.sales).toBeNull();
  });

  it("uma fonte AUSENTE não se confunde com uma fonte a zero", async () => {
    /* A regra central do produto, exercida na fronteira: `null` é ausência de fonte e
     * `[]` é uma fonte real com zero títulos. Colapsá-los faria a aplicação afirmar
     * "esta empresa não tem contas a pagar" quando o que houve foi um 502. */
    const erro = new AuthorizedApiError(AUTHORIZED_API_ERROR.BACKEND, "Falha upstream.", { status: 502 });
    const comFalha = await loadFinerData({ transport: transporteParcial("despesas", erro), companyId: "empresa-b" });
    const comZero = await loadFinerData({
      transport: {
        id: "protegido", protegido: true, companyId: "empresa-b",
        async ler(recurso) {
          if (recurso === "recebiveis") return { data: [], debug: { fonte: "snapshot" } };
          if (recurso === "ajustes-manuais") return { data: null, debug: { fonte: "documento-vazio" } };
          return { data: [] };
        },
      },
      companyId: "empresa-b",
    });

    expect(comFalha.sales.payables, "uma fonte em falha apresentou-se como fonte vazia").toBeNull();
    expect(comZero.sales.payables, "uma fonte real com zero títulos apresentou-se como ausente").toEqual([]);
  });
});
