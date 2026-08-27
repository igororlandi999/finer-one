// CONTRATO FIM-A-FIM — o CMV não promove um mês a âncora dos KPIs sozinho.
//
// ─── O DEFEITO, TAL COMO EXISTIA ────────────────────────────────────────────────────
// `buildSalesDataset` escolhia a âncora com `latestCompleteMonthKey(closings)`, que só
// olha para o catálogo de requisitos de fecho. Como o catálogo tem hoje UMA entrada — o
// CMV — lançar o CMV de um mês esgotava-o, o fecho ficava COMPLETE e esse mês virava
// imediatamente a referência de rentabilidade, EBITDA e resultado líquido.
//
// Reproduzido nos dados REAIS de julho/2026 (diagnostico/completudeFinanceiraJulho.mjs),
// com um CMV sintético injetado só em memória:
//   deduções               partial      despesas operacionais   partial
//   EBITDA                 partial      financeiro.monthKey     2026-07  <- defeito
//
// Os testes unitários de financialCompleteness.js protegem a REGRA. Este ficheiro
// protege a LIGAÇÃO: que o serviço usa mesmo o seletor certo. Uma regressão que trocasse
// `latestAnchorEligibleMonthKey` de volta por `latestCompleteMonthKey` passaria em todos
// os testes unitários e falharia aqui — que é exatamente o ponto.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset } from "./blingDataService.js";

const HOJE = new Date(2026, 7, 24, 12, 0, 0);   // 24/08/2026 -> último mês civil: julho

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

const ord = (id, date, total) => ({
  id, date, total, status: "recebida", client: { id: 1, name: "C" }, items: [],
});
const pg = (id, vencimento, valor, categoriaNome) => ({
  id, situacao: 2, dataEmissao: vencimento, vencimento, valor,
  categoriaNome, contato: { id: 1, nome: "Forn" },
});

const ORDERS = [
  ord(1, "2026-06-10", 150000),
  ord(2, "2026-07-10", 172899.4),
];
const PAYABLES = [
  pg(10, "2026-06-05", 11000, "Salários"),
  pg(11, "2026-06-08", 2500, "Comissões"),
  pg(12, "2026-07-05", 12127.28, "Salários"),
  pg(13, "2026-07-08", 3000, "Comissões"),
];

/* A cobertura REAL da Overcel em 24/08/2026: os pedidos derivam do calendário (julho
 * está fechado), as contas a pagar estão declaradas completas só até junho — porque uma
 * fatura de fornecedor de julho pode chegar em agosto. */
const COVERAGE_REAL = {
  firstCompleteMonth: "2026-04",
  partialMonths: [],
  completeThroughMonth: null,
  payables: { completeThroughMonth: "2026-06" },
};

/** A mesma cobertura, mas com as contas a pagar de julho também já fechadas. */
const COVERAGE_JULHO_FECHADO = {
  ...COVERAGE_REAL,
  payables: { completeThroughMonth: "2026-07" },
};

const dataset = (manualInputsByMonth, coverage = COVERAGE_REAL) =>
  buildSalesDataset({ orders: ORDERS, payables: PAYABLES, coverage, manualInputsByMonth });

const CMV_JUNHO = { "2026-06": { cmv: 116039.7 } };
const CMV_JUNHO_E_JULHO = { ...CMV_JUNHO, "2026-07": { cmv: 111111.11 } };

describe("âncora dos KPIs — julho não sobe cedo demais", () => {
  it("sem CMV de julho: a âncora é junho e julho é o mês civil por completar", () => {
    const fin = dataset(CMV_JUNHO).financeiro;
    expect(fin.monthKey).toBe("2026-06");
    expect(fin.civilMonthKey).toBe("2026-07");
    expect(fin.referenciaAtrasada).toBe(true);
  });

  it("COM o CMV de julho, mas despesas ainda parciais: a âncora CONTINUA em junho", () => {
    const ds = dataset(CMV_JUNHO_E_JULHO);
    const julho = ds.closings.find((c) => c.monthKey === "2026-07");

    // Os requisitos de julho ESTÃO satisfeitos — é por aqui que o defeito entrava.
    expect(julho.status).toBe("complete");
    expect(julho.missingItems).toEqual([]);

    // Mas a análise financeira do mês não está, e a âncora não se move.
    expect(julho.financial.financialAnalysisStatus).toBe("partial");
    expect(julho.financial.anchorEligible).toBe(false);
    expect(ds.financeiro.monthKey).toBe("2026-06");
    expect(ds.financeiro.referenciaAtrasada).toBe(true);
  });

  it("o EBITDA de julho continua a ser declarado parcial, não real", () => {
    const ds = dataset(CMV_JUNHO_E_JULHO);
    const julho = ds.closings.find((c) => c.monthKey === "2026-07");
    const opex = julho.financial.lines.find((l) => l.key === "operatingExpenses");
    expect(opex.availability).toBe("partial");
    expect(opex.causes).toEqual(["cobertura"]);
  });

  it("quando as despesas de julho TAMBÉM fecham, a âncora passa a julho", () => {
    /* O contrapeso indispensável: a correção não pode ser "julho nunca sobe". Fechada a
     * cobertura das contas a pagar, julho torna-se elegível e assume os KPIs — sem que
     * ninguém mude uma linha de código. */
    const ds = dataset(CMV_JUNHO_E_JULHO, COVERAGE_JULHO_FECHADO);
    const julho = ds.closings.find((c) => c.monthKey === "2026-07");
    expect(julho.financial.anchorEligible).toBe(true);
    expect(ds.financeiro.monthKey).toBe("2026-07");
    expect(ds.financeiro.referenciaAtrasada).toBe(false);
  });

  it("junho é imune ao que acontece em agosto e a julho", () => {
    /* Regressão histórica do projeto: meses futuros e títulos com vencimento à frente
     * já fizeram a âncora saltar. A âncora de junho não pode depender deles. */
    const comAgosto = buildSalesDataset({
      orders: [...ORDERS, ord(3, "2026-08-11", 90000)],
      payables: [...PAYABLES, pg(14, "2027-07-01", 50000, "Salários")],
      coverage: COVERAGE_REAL,
      manualInputsByMonth: CMV_JUNHO,
    });
    expect(comAgosto.financeiro.monthKey).toBe("2026-06");
  });

  it("todo o fecho da janela traz veredito de completude financeira", () => {
    // Um fecho sem o bloco é ignorado pelo seletor; se o serviço deixasse de o
    // produzir, a âncora ficaria null em silêncio em vez de falhar aqui.
    for (const c of dataset(CMV_JUNHO).closings) {
      expect(c.financial).toBeTruthy();
      expect(c.financial.monthKey).toBe(c.monthKey);
      expect(typeof c.financial.anchorEligible).toBe("boolean");
    }
  });
});

describe("os quatro eixos não voltam a colapsar", () => {
  it("requisitos completos, fontes parciais: os dois estados coexistem e dizem-se", () => {
    const julho = dataset(CMV_JUNHO_E_JULHO).closings.find((c) => c.monthKey === "2026-07");
    expect(julho.status).toBe("complete");                            // 1. requisitos
    expect(julho.financial.sourceCompleteness).toBe("partial");       // 2. fontes
    expect(julho.financial.financialAnalysisStatus).toBe("partial");  // 3. análise
    expect(julho.financial.anchorEligible).toBe(false);               // 4. âncora
  });

  it("o CMV não conta para a completude das FONTES — é requisito, não fonte", () => {
    /* Se o CMV entrasse em sourceCompleteness, um mês com as fontes todas fechadas
     * apareceria com fontes incompletas só por o utilizador ainda não ter lançado o
     * CMV — e mandaria procurar no ERP um dado que o ERP não tem. */
    const semCmvJulho = dataset(CMV_JUNHO, COVERAGE_JULHO_FECHADO)
      .closings.find((c) => c.monthKey === "2026-07");
    expect(semCmvJulho.status).toBe("incomplete");
    expect(semCmvJulho.financial.sourceCompleteness).toBe("complete");
    /* A análise fica `unavailable`, não `partial`: o CMV não tem fonte NENHUMA, e
     * ausência de fonte domina cobertura parcial (combineAvailability). É a distinção
     * que faz a ressalva de "Dados a completar" ler `sourceCompleteness` — dizer
     * "faltam fontes do período" aqui seria mandar procurar no ERP um dado que o ERP
     * não tem. */
    expect(semCmvJulho.financial.financialAnalysisStatus).toBe("unavailable");
  });
});
