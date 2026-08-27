// ESCOPO DOS DADOS — os números de uma empresa nunca aparecem sob o nome de outra.
//
// Este ficheiro existe por causa de um defeito REAL, encontrado a validar no Chrome:
// o seletor de empresas passou a funcionar antes de a leitura ser escopada por empresa,
// e trocar de empresa mudava o nome na barra lateral mantendo os números da Overcel.

import { describe, it, expect } from "vitest";
import { resolveCompanyDataScope, podeApresentarDados, COMPANY_DATA_SCOPE } from "./companyDataScope.js";

describe("empresa ativa vs. empresa do dataset", () => {
  it("iguais -> ligada", () => {
    const r = resolveCompanyDataScope({ activeCompanyId: "overcel", datasetCompanyId: "overcel" });
    expect(r.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
    expect(podeApresentarDados(r)).toBe(true);
  });

  it("diferentes -> NÃO ligada, e os dados não podem ser apresentados", () => {
    const r = resolveCompanyDataScope({ activeCompanyId: "empresa-exemplo", datasetCompanyId: "overcel" });
    expect(r.scope).toBe(COMPANY_DATA_SCOPE.NAO_LIGADA);
    expect(podeApresentarDados(r)).toBe(false);
  });

  it("o resultado diz QUAIS são as duas, para a UI poder oferecer o regresso", () => {
    const r = resolveCompanyDataScope({ activeCompanyId: "empresa-exemplo", datasetCompanyId: "overcel" });
    expect(r.activeCompanyId).toBe("empresa-exemplo");
    expect(r.datasetCompanyId).toBe("overcel");
  });
});

describe("ausências não bloqueiam", () => {
  it("sem dataset -> SEM_DATASET (outra camada já decide)", () => {
    const r = resolveCompanyDataScope({ activeCompanyId: "overcel", datasetCompanyId: null });
    expect(r.scope).toBe(COMPANY_DATA_SCOPE.SEM_DATASET);
    expect(podeApresentarDados(r)).toBe(true);
  });

  it("sem empresa ativa -> ligada (é o modo sem autenticação, com uma empresa só)", () => {
    /* Bloquear aqui partiria a aplicação atual para resolver um problema que ela não
     * tem: sem sessão há uma empresa, e é a do dataset. */
    const r = resolveCompanyDataScope({ activeCompanyId: null, datasetCompanyId: "overcel" });
    expect(r.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
    expect(podeApresentarDados(r)).toBe(true);
  });

  it.each([undefined, "", 42, {}])("empresa ativa %o é tratada como ausente, não como diferente", (v) => {
    const r = resolveCompanyDataScope({ activeCompanyId: v, datasetCompanyId: "overcel" });
    expect(r.scope).toBe(COMPANY_DATA_SCOPE.LIGADA);
  });

  it("entrada completamente vazia não rebenta", () => {
    expect(resolveCompanyDataScope().scope).toBe(COMPANY_DATA_SCOPE.SEM_DATASET);
    expect(podeApresentarDados(null)).toBe(false);
  });
});

describe("o dataset diz a que empresa pertence", () => {
  it("buildSalesDataset carimba companyId", async () => {
    /* Sem este campo, o gate não teria contra o que comparar — e a única alternativa
     * seria confiar que "o dataset é sempre da empresa ativa", que é precisamente a
     * suposição que deixou de ser verdade. */
    const { buildSalesDataset } = await import("../services/blingDataService.js");
    const { ACTIVE_COMPANY } = await import("../config/company.js");
    const ds = buildSalesDataset({ orders: [], payables: [], receivables: [] });
    expect(ds.companyId).toBe(ACTIVE_COMPANY.id);
  });
});
