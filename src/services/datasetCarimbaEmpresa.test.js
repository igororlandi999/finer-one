// A QUE EMPRESA PERTENCE O DATASET — o carimbo tem de ser a empresa LIDA.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O DEFEITO QUE ESTE FICHEIRO EXISTE PARA IMPEDIR
// ═══════════════════════════════════════════════════════════════════════════════════
// `buildSalesDataset` carimbava `companyId: ACTIVE_COMPANY.id` — uma constante do
// ficheiro de configuração, fixada em tempo de compilação. Enquanto a leitura foi
// SEMPRE da Overcel, a constante e a verdade coincidiam e nada denunciava a diferença.
//
// Deixam de coincidir no instante em que `VITE_PROTECTED_DATA_TRANSPORT` liga. A partir
// daí a leitura É escopada por empresa:
//
//   1. o utilizador escolhe a empresa B;
//   2. o transporte protegido lê `/api/companies/B/financial-data` — dados de B, certos;
//   3. `buildSalesDataset` carimba o dataset como "overcel", porque é o que está no
//      ficheiro de configuração;
//   4. `resolveCompanyDataScope({ activeCompanyId: "B", datasetCompanyId: "overcel" })`
//      devolve NAO_LIGADA, e o `AppShell` recusa apresentar as páginas.
//
// Ou seja: com o transporte protegido ligado, NENHUMA empresa além da compilada
// consegue mostrar dados — os dados certos são lidos e depois recusados pelo guarda que
// existe para os proteger. Falha fechada, e por isso não é uma fuga; é um bloqueio
// total da funcionalidade que a migração inteira existe para entregar.
//
// E o inverso é pior a prazo: um carimbo que não depende da leitura NUNCA pode detetar
// uma leitura da empresa errada. O guarda `companyDataScope` só acertava por
// coincidência — comparava a configuração consigo própria.
//
// ─── PORQUE O TESTE QUE JÁ EXISTIA NÃO APANHOU ISTO ────────────────────────────────
// `companyDataScope.test.js` afirma `ds.companyId === ACTIVE_COMPANY.id` com um dataset
// construído sem empresa nenhuma. É verdadeiro com o defeito e verdadeiro sem ele: o
// caso que distingue os dois — construir com uma empresa DIFERENTE da configurada — não
// era exercido por teste nenhum. Fica aqui, e o controlo positivo (sem empresa -> a
// configurada) fica ao lado, para que a correção não abra a porta ao contrário.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const { loadFinerData, buildSalesDataset, rebuildComCobertura } = await import("./blingDataService.js");
const { ACTIVE_COMPANY } = await import("../config/company.js");

/** O transporte protegido, tal como `createProtectedDataTransport` o expõe: sabe de que
 *  empresa é, e responde sempre os mesmos envelopes de produção. */
function transporteProtegido(companyId) {
  return {
    id: "protegido",
    protegido: true,
    companyId,
    async ler(recurso) {
      const r = respostas[recurso];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

beforeEach(() => {
  respostas.pedidos = envelopePedidos();
  respostas.despesas = envelopeDespesas();
  respostas.recebiveis = envelopeRecebiveis();
  respostas["ajustes-manuais"] = envelopeAjustesManuais();
});
afterEach(() => { vi.clearAllMocks(); });

describe("o carimbo do dataset é a empresa lida, não a compilada", () => {
  it("buildSalesDataset com uma empresa EXPLÍCITA carimba essa, e não a da configuração", () => {
    const ds = buildSalesDataset({ orders: [], payables: [], receivables: [], companyId: "empresa-b" });
    expect(ds.companyId).toBe("empresa-b");
    expect(ds.companyId).not.toBe(ACTIVE_COMPANY.id);
  });

  it("loadFinerData escopado por empresa carimba a empresa que leu", async () => {
    const { source, sales } = await loadFinerData({
      transport: transporteProtegido("empresa-b"),
      companyId: "empresa-b",
    });
    expect(source).toBe("api");
    expect(sales.companyId).toBe("empresa-b");
  });

  it("e por isso o guarda de escopo deixa passar a leitura protegida de OUTRA empresa", async () => {
    /* A afirmação que importa ao produto: com o transporte protegido ligado, uma empresa
     * que não a compilada consegue de facto mostrar os seus dados. Sem o carimbo certo,
     * isto é NAO_LIGADA e o `AppShell` mostra "empresa sem dados ligados" para sempre. */
    const { sales } = await loadFinerData({
      transport: transporteProtegido("empresa-b"),
      companyId: "empresa-b",
    });
    const escopo = resolveCompanyDataScope({
      activeCompanyId: "empresa-b",
      datasetCompanyId: sales.companyId,
    });
    expect(escopo.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
  });

  it("o guarda continua a RECUSAR quando a empresa ativa não é a do dataset", async () => {
    /* O contrapeso obrigatório. Uma correção que carimbasse sempre a empresa ativa
     * tornaria o guarda incapaz de recusar seja o que for — passaria a comparar a
     * empresa ativa consigo própria, que é a versão nova do mesmo defeito. */
    const { sales } = await loadFinerData({
      transport: transporteProtegido("empresa-b"),
      companyId: "empresa-b",
    });
    const escopo = resolveCompanyDataScope({
      activeCompanyId: "empresa-c",
      datasetCompanyId: sales.companyId,
    });
    expect(escopo.scope).toBe(COMPANY_DATA_SCOPE.NAO_LIGADA);
  });

  it("rebuildComCobertura PRESERVA a empresa do dataset que reconstrói", () => {
    /* Confirmar cobertura não muda de empresa. Reconstruir a partir da configuração
     * faria um dataset da empresa B renascer carimbado como Overcel — e o guarda, que
     * até aí deixava passar, passaria a recusar a meio de uma sessão. */
    const original = buildSalesDataset({
      orders: [], payables: [], receivables: [], companyId: "empresa-b",
    });
    const novo = rebuildComCobertura(original, {
      payables: { completeThroughMonth: "2026-06", confirmedAt: null, confirmedBy: "user", note: null },
    });
    expect(novo).not.toBeNull();
    expect(novo.companyId).toBe("empresa-b");
  });
});

describe("sem empresa declarada, o comportamento de hoje mantém-se byte a byte", () => {
  it("buildSalesDataset sem `companyId` continua a carimbar a empresa configurada", () => {
    const ds = buildSalesDataset({ orders: [], payables: [], receivables: [] });
    expect(ds.companyId).toBe(ACTIVE_COMPANY.id);
  });

  it("loadFinerData pelo transporte LEGADO — que não tem empresa — carimba a configurada", async () => {
    /* O caminho de produção de hoje. O legado é anónimo e serve uma empresa só; o
     * carimbo continua a vir da configuração porque é ali que a verdade está. */
    const { sales } = await loadFinerData();
    expect(sales.companyId).toBe(ACTIVE_COMPANY.id);
  });

  it.each([null, undefined, "", 42, {}, []])(
    "um `companyId` inutilizável (%o) cai na configuração em vez de carimbar lixo",
    (v) => {
      const ds = buildSalesDataset({ orders: [], payables: [], receivables: [], companyId: v });
      expect(ds.companyId).toBe(ACTIVE_COMPANY.id);
    }
  );
});
