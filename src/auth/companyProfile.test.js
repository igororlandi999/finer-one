// PERFIL DA EMPRESA ATIVA — e a regra que impede a cobertura de uma empresa de
// contaminar outra.
//
// O teste central deste ficheiro é este: se um utilizador multiempresa trocar da
// Overcel para outra empresa, a cobertura configurada em `company.js` — que descreve os
// snapshots DA OVERCEL — NÃO pode segui-lo. Aplicá-la afirmaria um facto financeiro
// sobre uma empresa com base no que se sabe de outra, o que é o mesmo tipo de defeito
// que os contratos financeiros permanentes proíbem em todos os outros eixos.

import { describe, it, expect } from "vitest";
import { resolveCompanyProfile, companyForFormatting, COMPANY_PROFILE_ORIGIN } from "./companyProfile.js";
import { ACTIVE_COMPANY } from "../config/company.js";
import { ROLES } from "./authorizationCore.js";

const CONFIG = {
  id: "overcel", name: "Overcel", currency: "BRL", locale: "pt-BR",
  historyCoverage: { firstCompleteMonth: "2026-04", payables: { completeThroughMonth: "2026-06" } },
};

describe("sem sessão: vale a configuração compilada", () => {
  it("devolve o perfil da configuração e diz que veio de lá", () => {
    const p = resolveCompanyProfile({ sessionCompany: null, fallback: CONFIG });
    expect(p.id).toBe("overcel");
    expect(p.currency).toBe("BRL");
    expect(p.origin).toBe(COMPANY_PROFILE_ORIGIN.CONFIG);
    expect(p.historyCoverage).toBe(CONFIG.historyCoverage);
    expect(p.complete).toBe(true);
  });

  it("com a configuração REAL do projeto, o perfil está completo", () => {
    /* Guarda contra uma edição de `company.js` que remova moeda ou locale: a aplicação
     * inteira formata dinheiro a partir daqui. */
    const p = resolveCompanyProfile({ sessionCompany: null });
    expect(p.complete).toBe(true);
    expect(p.currency).toBe(ACTIVE_COMPANY.currency);
    expect(p.locale).toBe(ACTIVE_COMPANY.locale);
  });
});

describe("com sessão: vale a empresa da sessão", () => {
  it("a empresa da sessão substitui a configuração", () => {
    const p = resolveCompanyProfile({
      sessionCompany: { companyId: "empresa-x", name: "Empresa X", currency: "EUR", locale: "pt-PT", role: ROLES.OWNER },
      fallback: CONFIG,
    });
    expect(p.id).toBe("empresa-x");
    expect(p.name).toBe("Empresa X");
    expect(p.currency).toBe("EUR");
    expect(p.origin).toBe(COMPANY_PROFILE_ORIGIN.SESSION);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A REGRA QUE IMPEDE CONTAMINAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════════════ */

describe("a cobertura configurada NÃO segue para outra empresa", () => {
  it("empresa diferente -> historyCoverage null", () => {
    const p = resolveCompanyProfile({
      sessionCompany: { companyId: "empresa-x", name: "Empresa X", currency: "EUR", locale: "pt-PT" },
      fallback: CONFIG,
    });
    expect(p.historyCoverage).toBeNull();
    expect(p.coverageOrigin).toBeNull();
  });

  it("MESMA empresa -> herda a cobertura configurada", () => {
    const p = resolveCompanyProfile({
      sessionCompany: { companyId: "overcel", name: "Overcel", currency: "BRL", locale: "pt-BR" },
      fallback: CONFIG,
    });
    expect(p.historyCoverage).toBe(CONFIG.historyCoverage);
    expect(p.coverageOrigin).toBe(COMPANY_PROFILE_ORIGIN.CONFIG);
  });

  it("a moeda também não é herdada por outra empresa", () => {
    /* Herdar BRL para uma empresa portuguesa apresentaria euros como reais e nenhum
     * número no ecrã denunciaria o erro. */
    const p = resolveCompanyProfile({
      sessionCompany: { companyId: "empresa-pt", name: "Empresa PT" },
      fallback: CONFIG,
    });
    expect(p.currency).toBeNull();
    expect(p.locale).toBeNull();
    expect(p.complete).toBe(false);
  });

  it("a MESMA empresa sem moeda na sessão herda-a da configuração", () => {
    const p = resolveCompanyProfile({
      sessionCompany: { companyId: "overcel", name: "Overcel" },
      fallback: CONFIG,
    });
    expect(p.currency).toBe("BRL");
    expect(p.locale).toBe("pt-BR");
    expect(p.complete).toBe(true);
  });
});

describe("companyForFormatting", () => {
  it("usa o perfil quando está completo", () => {
    expect(companyForFormatting({ currency: "EUR", locale: "pt-PT" }, CONFIG))
      .toEqual({ currency: "EUR", locale: "pt-PT" });
  });

  it("um perfil MEIO preenchido cai INTEIRO para o fallback, sem híbridos", () => {
    /* `Intl.NumberFormat(undefined, {currency:"EUR"})` formataria na língua do browser:
     * o valor certo com as separações de milhares de outro país. */
    expect(companyForFormatting({ currency: "EUR", locale: null }, CONFIG))
      .toEqual({ currency: "BRL", locale: "pt-BR" });
    expect(companyForFormatting({ currency: null, locale: "pt-PT" }, CONFIG))
      .toEqual({ currency: "BRL", locale: "pt-BR" });
    expect(companyForFormatting(null, CONFIG))
      .toEqual({ currency: "BRL", locale: "pt-BR" });
  });

  it("o resultado é sempre utilizável pelo Intl", () => {
    const f = companyForFormatting({ currency: null, locale: null });
    expect(() => new Intl.NumberFormat(f.locale, { style: "currency", currency: f.currency }).format(1)).not.toThrow();
  });
});
