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

const { loadFinerData, buildSalesDataset } = await import("./blingDataService.js");
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

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A CONFIGURAÇÃO DESCREVE UMA EMPRESA, NÃO TODAS
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O carimbo era a primeira de TRÊS coisas que `buildSalesDataset` ia buscar à
 * configuração compilada. As outras duas seguiam-no de perto, e por isso ficam aqui, ao
 * lado, em vez de num ficheiro próprio: é o mesmo defeito, no mesmo sítio.
 *
 *   coverage  `ACTIVE_COMPANY.historyCoverage` diz até quando os snapshots DA OVERCEL
 *             estão completos. É o que autoriza tratar um mês como REAL em vez de
 *             partial. Aplicá-lo ao dataset da empresa B é afirmar sobre B um facto que
 *             só se sabe de A — e afirmá-lo precisamente sobre a completude dos
 *             documentos de despesas, que é a base da DRE.
 *
 *   currency  a moeda do catálogo documental. A Overcel é BRL e a Finer Teste é EUR:
 *             um catálogo de B rotulado em BRL é uma afirmação sobre dinheiro feita a
 *             partir do ficheiro errado.
 *
 * `PerformanceFinanceira` já se protegia disto — `resolveCompanyProfile` só herda a
 * cobertura quando o id bate certo — mas a página prefere `sales.coverage`, que vinha do
 * motor SEM a mesma guarda. A proteção documentada na página era contornada pelo dataset.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
describe("a cobertura e a moeda da configuração não atravessam para outra empresa", () => {
  const entradas = () => ({
    orders: envelopePedidos().data,
    payables: envelopeDespesas().data,
    receivables: envelopeRecebiveis().data,
  });

  /* A moeda vive em CADA documento do catálogo (`documents.list[].currency`), e não num
   * campo do catálogo. Lê-se daqui para que a forma exata fique num sítio só. */
  const moedasDoCatalogo = (ds) => [...new Set((ds.documents?.list ?? []).map((d) => d.currency))];

  it("a empresa CONFIGURADA continua a herdar — a porta certa ficou aberta", () => {
    /* O contrapeso primeiro, porque é ele que impede a correção de esvaziar a aplicação
     * de hoje: a instalação real é a Overcel, e ela TEM de continuar a receber a
     * cobertura declarada, senão nenhum mês volta a ser real. */
    const ds = buildSalesDataset({ ...entradas(), companyId: ACTIVE_COMPANY.id });

    expect(ds.companyId).toBe(ACTIVE_COMPANY.id);
    expect(ds.coverage, "a empresa configurada deixou de herdar a sua cobertura").toBeTruthy();
    /* O catálogo tem de ter documentos, senão a afirmação sobre a moeda é vazia e
     * passaria com qualquer implementação. */
    expect(moedasDoCatalogo(ds).length, "catálogo vazio: o teste da moeda não prova nada")
      .toBeGreaterThan(0);
    expect(moedasDoCatalogo(ds)).toEqual([ACTIVE_COMPANY.currency]);
  });

  it("sem companyId (legado) herda na mesma — é a empresa da configuração que foi lida", () => {
    const ds = buildSalesDataset(entradas());
    expect(ds.companyId).toBe(ACTIVE_COMPANY.id);
    expect(ds.coverage).toBeTruthy();
    expect(moedasDoCatalogo(ds)).toEqual([ACTIVE_COMPANY.currency]);
  });

  it("OUTRA empresa não herda a cobertura declarada da Overcel", () => {
    const ds = buildSalesDataset({ ...entradas(), companyId: OUTRA_EMPRESA });

    expect(ds.companyId).toBe(OUTRA_EMPRESA);
    /* O limite de cobertura da configuração não pode aparecer aqui. Compara-se contra o
     * valor REAL da configuração, e não contra um literal, para que o teste continue a
     * dizer a verdade se a configuração mudar. */
    const limiteConfigurado = ACTIVE_COMPANY.historyCoverage?.payables?.completeThroughMonth;
    expect(limiteConfigurado, "a fixture perdeu o limite; o teste deixou de provar algo").toBeTruthy();
    expect(
      ds.coverage?.payables?.completeThroughMonth,
      "a empresa B herdou o limite de cobertura declarado para a Overcel: meses dela " +
      "passam a poder apresentar-se como REAIS com base no que se sabe de outra empresa"
    ).not.toBe(limiteConfigurado);
  });

  it("OUTRA empresa não herda a moeda da Overcel", () => {
    const ds = buildSalesDataset({ ...entradas(), companyId: OUTRA_EMPRESA });
    expect(
      moedasDoCatalogo(ds),
      "o catálogo documental da empresa B saiu rotulado com a moeda da Overcel"
    ).not.toContain(ACTIVE_COMPANY.currency);
  });
});
