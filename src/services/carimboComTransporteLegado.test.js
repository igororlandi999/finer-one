// O CARIMBO NÃO PODE VIR DA EMPRESA ATIVA QUANDO A LEITURA NÃO FOI ESCOPADA.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A JANELA QUE ESTE FICHEIRO FECHA — E PORQUE ELA EXISTE NO MEIO DO ROLLOUT
// ═══════════════════════════════════════════════════════════════════════════════════
// `datasetCarimbaEmpresa.test.js` prova o carimbo com o transporte PROTEGIDO, onde a
// empresa pedida e a empresa lida são a mesma por construção. Falta o outro par, e é o
// par que existe durante a migração:
//
//     autenticação LIGADA  +  VITE_PROTECTED_DATA_TRANSPORT ainda DESLIGADO
//
// Ou seja: a etapa A do rollout faseado — publicar a autenticação primeiro e o transporte
// protegido depois. É a etapa que parece a mais segura das duas, porque não mexe na
// leitura.
//
// ─── O QUE ACONTECIA NESSA ETAPA ───────────────────────────────────────────────────
// `FinerDataProvider` passa `companyId` a `loadFinerData` a partir da EMPRESA ATIVA, e
// passa-o SEMPRE — não pergunta que transporte foi resolvido:
//
//     loadFinerData({ transport, ...(companyId ? { companyId } : {}) })
//
// Com o interruptor desligado, `transport` é o LEGADO: um endpoint ANÓNIMO que serve um
// único conjunto de dados, o da Overcel, independentemente de quem pergunta. Mas o
// `companyId` que viajava ao lado era o da empresa ATIVA. Então:
//
//   1. o utilizador tem membership na Overcel e na Finer Teste;
//   2. troca para a Finer Teste  ->  companyId = "finer-teste";
//   3. o transporte legado lê o endpoint anónimo  ->  dados da OVERCEL;
//   4. `buildSalesDataset` carimba o dataset como "finer-teste", porque foi o que lhe
//      passaram;
//   5. `resolveCompanyDataScope("finer-teste", "finer-teste")` -> LIGADA;
//   6. o `AppShell` monta as páginas.
//
// Resultado: os números REAIS da Overcel no ecrã, sob o nome "Finer Teste", com o guarda
// de escopo a dizer que está tudo bem. O guarda não falhou por ser fraco — falhou porque
// lhe deram um carimbo fabricado a partir da PERGUNTA em vez da RESPOSTA, que é
// exatamente o defeito que `7994255` tinha corrigido no sentido contrário.
//
// ─── A REGRA ───────────────────────────────────────────────────────────────────────
// Só uma leitura ESCOPADA POR EMPRESA pode carimbar o dataset com essa empresa. O
// transporte legado não é escopado: o que ele leu não é da empresa ativa, é da empresa
// da configuração — e é isso que tem de ficar escrito no dataset, para que o guarda de
// escopo tenha alguma coisa verdadeira que comparar.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  envelopePedidos,
  envelopeDespesas,
  envelopeRecebiveis,
  envelopeAjustesManuais,
} from "./producao.fixtures.js";
import { resolveCompanyDataScope, COMPANY_DATA_SCOPE } from "../auth/companyDataScope.js";

const respostas = {};

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      const recurso = opts?.params?.recurso || "pedidos";
      const r = respostas[recurso];
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

const { loadFinerData } = await import("./blingDataService.js");
const { createLegacyDataTransport } = await import("./dataTransport.js");
const { ACTIVE_COMPANY } = await import("../config/company.js");

beforeEach(() => {
  respostas.pedidos = envelopePedidos();
  respostas.despesas = envelopeDespesas();
  respostas.recebiveis = envelopeRecebiveis();
  respostas["ajustes-manuais"] = envelopeAjustesManuais();
});

/* A empresa ativa durante a etapa A do rollout: o utilizador trocou para uma empresa que
 * NÃO é a da configuração, e o transporte continua a ser o legado. */
const OUTRA_EMPRESA = "finer-teste";

describe("transporte LEGADO com uma empresa ativa diferente da configurada", () => {
  it("o dataset NÃO é carimbado com a empresa ativa — a leitura não foi escopada", async () => {
    /* É a reprodução exata do que o provider faz hoje: passa o transporte legado E o
     * companyId da empresa ativa, porque não distingue os dois casos. */
    const { sales } = await loadFinerData({
      transport: createLegacyDataTransport(),
      companyId: OUTRA_EMPRESA,
    });

    expect(sales).not.toBeNull();
    expect(
      sales.companyId,
      "o dataset anónimo foi carimbado com a empresa ATIVA: os números da empresa " +
      "configurada passam a poder ser apresentados sob o nome de outra"
    ).not.toBe(OUTRA_EMPRESA);
    /* O que resta é a única verdade disponível neste caminho: a empresa da configuração,
     * que é de quem o endpoint anónimo serve os dados. */
    expect(sales.companyId).toBe(ACTIVE_COMPANY.id);
  });

  it("e por isso o guarda de escopo RECUSA apresentar — que é o desfecho honesto", async () => {
    /* A consequência que importa. Sem a correção, isto dava LIGADA e o AppShell montava
     * as páginas financeiras da Overcel com "Finer Teste" na barra. */
    const { sales } = await loadFinerData({
      transport: createLegacyDataTransport(),
      companyId: OUTRA_EMPRESA,
    });

    const escopo = resolveCompanyDataScope({
      activeCompanyId: OUTRA_EMPRESA,
      datasetCompanyId: sales.companyId,
    });

    expect(
      escopo.scope,
      "o guarda de escopo deixou passar dados de uma empresa sob o nome de outra"
    ).toBe(COMPANY_DATA_SCOPE.NAO_LIGADA);
  });

  it("com a empresa ativa IGUAL à configurada, continua a apresentar — a porta certa ficou aberta", async () => {
    /* O contrapeso obrigatório. Uma correção que carimbasse sempre `null`, ou que
     * recusasse sempre, bloquearia a aplicação de hoje inteira: a instalação atual tem
     * autenticação e a empresa ativa É a da configuração. */
    const { sales } = await loadFinerData({
      transport: createLegacyDataTransport(),
      companyId: ACTIVE_COMPANY.id,
    });

    const escopo = resolveCompanyDataScope({
      activeCompanyId: ACTIVE_COMPANY.id,
      datasetCompanyId: sales.companyId,
    });

    expect(escopo.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
    expect(sales.companyId).toBe(ACTIVE_COMPANY.id);
  });

  it("sem companyId nenhum — o comportamento de hoje, byte a byte", async () => {
    const { sales } = await loadFinerData({ transport: createLegacyDataTransport() });
    expect(sales.companyId).toBe(ACTIVE_COMPANY.id);
  });
});

describe("o transporte PROTEGIDO continua a carimbar com a empresa lida", () => {
  /* O contrapeso do outro lado: a correção não pode ter desfeito `7994255`. Sem isto,
   * fechar esta janela reabria a anterior — nenhuma empresa além da compilada
   * conseguiria mostrar dados com o transporte protegido ligado. */
  function transporteProtegido(companyId) {
    return {
      id: "protegido",
      protegido: true,
      companyId,
      async ler(recurso) {
        const r = respostas[recurso === "pedidos" ? "pedidos" : recurso];
        if (r instanceof Error) throw r;
        return r;
      },
    };
  }

  it("uma leitura escopada carimba com a empresa PEDIDA, mesmo não sendo a configurada", async () => {
    const { sales } = await loadFinerData({
      transport: transporteProtegido(OUTRA_EMPRESA),
      companyId: OUTRA_EMPRESA,
    });

    expect(sales.companyId).toBe(OUTRA_EMPRESA);
    const escopo = resolveCompanyDataScope({
      activeCompanyId: OUTRA_EMPRESA,
      datasetCompanyId: sales.companyId,
    });
    expect(escopo.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
  });
});
