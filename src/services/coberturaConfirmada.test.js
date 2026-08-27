// COBERTURA CONFIRMADA — a LIGAÇÃO, ponta a ponta pelo serviço.
//
// `manualCoverage.test.js` cobre a regra. Este ficheiro cobre o fio: que o serviço lê
// mesmo a confirmação, a aplica na ordem certa (confirmação primeiro, veto do snapshot
// depois) e que o efeito chega ao fecho, à âncora e ao diagnóstico de cobertura.
//
// É a matriz A–E da FASE 8, e o que ela protege é sobretudo isto: **confirmar cobertura
// não é dizer que o mês está pronto**. Cada bloqueio desaparece só quando a SUA causa
// for resolvida, e a cobertura é uma causa entre várias.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset } from "./blingDataService.js";

/* 25 de agosto de 2026 — julho é o último mês civil encerrado. */
const HOJE = new Date(2026, 7, 25, 12, 0, 0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

const COV = {
  firstCompleteMonth: "2026-04",
  partialMonths: [],
  completeThroughMonth: null,
  payables: { completeThroughMonth: "2026-06" },
};

const pedido = (id, data, total) => ({
  id, numero: id, date: data, total, status: "recebida",
  client: { id: 1, name: "Cliente A" }, seller: null,
  notaFiscalId: 9000 + id, dataSaida: data, frete: 0, items: [],
});
const titulo = (id, mes, valor, categoria) => ({
  id, situacao: 2, valor,
  vencimento: `${mes}-15`, dataEmissao: `${mes}-02`, vencimentoOriginal: `${mes}-15`,
  competencia: `${mes}-10`, numeroDocumento: String(id), historico: categoria,
  saldo: 0, categoriaId: 10, categoriaNome: categoria,
  contato: { id: 5, nome: "Fornecedor A" }, formaPagamento: { id: 1, nome: "Pix" },
});

const MESES = ["2026-04", "2026-05", "2026-06", "2026-07"];

/** Dataset com controlo fino sobre o que bloqueia julho. */
function montar({ confirmarJulho = false, cmvJulho = true, classificados = true, snapshotParcial = false } = {}) {
  const orders = [];
  const payables = [];
  let oid = 1, pid = 500;
  for (const mes of MESES) {
    orders.push(pedido(oid++, `${mes}-05`, 120000));
    payables.push(titulo(pid++, mes, 9000, "Salários"));
    payables.push(titulo(pid++, mes, 4200, "Aluguel"));
  }
  // Título por classificar SÓ em julho, quando o cenário o pede.
  if (!classificados) payables.push(titulo(pid++, "2026-07", 1554.35, "Sem categoria"));

  const manualInputsByMonth = {
    "2026-04": { cmv: 60000 }, "2026-05": { cmv: 62000 }, "2026-06": { cmv: 64000 },
  };
  if (cmvJulho) manualInputsByMonth["2026-07"] = { cmv: 66000 };

  return buildSalesDataset({
    orders, payables, receivables: [], coverage: COV, manualInputsByMonth,
    manualCoverage: confirmarJulho
      ? { payables: { completeThroughMonth: "2026-07", confirmedAt: "2026-08-25T20:00:00.000Z", confirmedBy: "user", note: null } }
      : undefined,
    meta: {
      geradoEm: "2026-08-25T04:00:00.000Z",
      parcial: { orders: false, payables: snapshotParcial, receivables: false },
    },
  });
}

const julho = (ds) => (ds.closings || []).find((c) => c.monthKey === "2026-07") || null;
const causasOpex = (ds) => {
  const b = (julho(ds)?.financial?.blockers || []).find((l) => l.key === "operatingExpenses");
  return b ? b.causes : [];
};

describe("A. cobertura NÃO confirmada — o estado de partida", () => {
  it("julho fica bloqueado por cobertura, mesmo com CMV e classificação em ordem", () => {
    const ds = montar({ confirmarJulho: false, cmvJulho: true, classificados: true });
    expect(ds.coverage.payables.completeThroughMonth).toBe("2026-06");
    expect(ds.coverageOrigem.source).toBe("config");
    expect(causasOpex(ds)).toContain("cobertura");
    expect(julho(ds).financial.anchorEligible).toBe(false);
  });

  it("o diagnóstico assinala a cobertura por rever", () => {
    const ds = montar({ confirmarJulho: false });
    expect(ds.financeiro.coverageDiagnostics.payables.coverageNeedsReview).toBe(true);
  });
});

describe("B. cobertura confirmada + CMV em falta — continua incompleto, por OUTRA razão", () => {
  it("a causa de cobertura desaparece e a do CMV fica", () => {
    const ds = montar({ confirmarJulho: true, cmvJulho: false, classificados: true });
    expect(ds.coverage.payables.completeThroughMonth).toBe("2026-07");
    expect(ds.coverageOrigem.source).toBe("user");
    // A cobertura já não bloqueia as operacionais...
    expect(causasOpex(ds)).not.toContain("cobertura");
    // ...mas o CMV continua a bloquear o mês.
    const cmv = (julho(ds).financial.blockers || []).find((l) => l.key === "cmv");
    expect(cmv.causes).toContain("por_informar");
    expect(julho(ds).financial.anchorEligible).toBe(false);
    expect(julho(ds).status).toBe("incomplete");
  });
});

describe("C. cobertura confirmada + CMV presente + títulos por classificar", () => {
  /* É o caso REAL de julho de 2026: 3 títulos, R$ 1 554,35, 0,38% do mês. Cobertura
   * completa não é classificação completa, e o produto não pode fingir que é. */
  it("a análise continua parcial — a classificação é a causa que sobra", () => {
    const ds = montar({ confirmarJulho: true, cmvJulho: true, classificados: false });
    expect(causasOpex(ds)).not.toContain("cobertura");
    expect(causasOpex(ds)).toContain("classificacao");
    expect(julho(ds).financial.anchorEligible).toBe(false);
    expect(julho(ds).financial.financialAnalysisStatus).not.toBe("complete");
  });

  it("os títulos por classificar continuam VISÍVEIS depois da confirmação", () => {
    /* Confirmar cobertura não pode esconder o que ainda impede a análise. */
    const ds = montar({ confirmarJulho: true, cmvJulho: true, classificados: false });
    const pc = (ds.despesas.porClassificar || []).find((c) => c.monthKey === "2026-07");
    expect(pc).toBeDefined();
    expect(pc.unclassifiedCount).toBe(1);
    expect(pc.unclassifiedAmount).toBe(1554.35);
  });
});

describe("D. cobertura confirmada + CMV presente + classificação completa", () => {
  it("julho torna-se elegível como âncora e os KPIs passam a ser dele", () => {
    const ds = montar({ confirmarJulho: true, cmvJulho: true, classificados: true });
    expect(julho(ds).financial.anchorEligible).toBe(true);
    expect(ds.financeiro.monthKey).toBe("2026-07");
    expect(ds.financeiro.anchorSource).toBe("eligible");
    // E deixa de haver mês encerrado por completar.
    expect(ds.financeiro.referenciaAtrasada).toBe(false);
    expect(ds.financeiro.coverageDiagnostics.payables.coverageNeedsReview).toBe(false);
  });

  it("sem a confirmação, o MESMO dataset ancorava em junho", () => {
    // O contraste é o ponto: só a confirmação separa os dois.
    expect(montar({ confirmarJulho: false, cmvJulho: true, classificados: true }).financeiro.monthKey)
      .toBe("2026-06");
  });
});

describe("E. snapshot parcial — a confirmação humana NÃO pode sobrepor-se ao facto técnico", () => {
  it("com `meta.parcial.payables`, julho continua bloqueado por cobertura", () => {
    const ds = montar({ confirmarJulho: true, cmvJulho: true, classificados: true, snapshotParcial: true });
    // O limite confirmado continua registado...
    expect(ds.coverage.payables.completeThroughMonth).toBe("2026-07");
    // ...e mesmo assim a fonte é vetada.
    expect(ds.coverage.payables.snapshotPartial).toBe(true);
    expect(causasOpex(ds)).toContain("cobertura");
    expect(julho(ds).financial.anchorEligible).toBe(false);
  });

  it("o veto vale mesmo para os meses que a configuração já cobria", () => {
    const ds = montar({ confirmarJulho: true, cmvJulho: true, classificados: true, snapshotParcial: true });
    const junho = (ds.closings || []).find((c) => c.monthKey === "2026-06");
    expect(junho.financial.anchorEligible).toBe(false);
  });
});

describe("compatibilidade — nada muda para quem não confirma nada", () => {
  it("dataset sem `manualCoverage` é idêntico ao de antes deste fluxo existir", () => {
    const ds = montar({ confirmarJulho: false, cmvJulho: true, classificados: true });
    expect(ds.coverage.payables.completeThroughMonth).toBe("2026-06");
    expect(ds.coverageOrigem.source).toBe("config");
    expect(ds.financeiro.monthKey).toBe("2026-06");
  });

  it("uma confirmação para um mês FUTURO é ignorada ponta a ponta", () => {
    const ds = buildSalesDataset({
      orders: [pedido(1, "2026-07-05", 120000)],
      payables: [titulo(1, "2026-07", 9000, "Salários")],
      receivables: [], coverage: COV,
      manualCoverage: { payables: { completeThroughMonth: "2026-12", confirmedBy: "user" } },
      meta: { parcial: { orders: false, payables: false, receivables: false } },
    });
    expect(ds.coverage.payables.completeThroughMonth).toBe("2026-06");
    expect(ds.coverageOrigem.source).toBe("config");
  });
});
