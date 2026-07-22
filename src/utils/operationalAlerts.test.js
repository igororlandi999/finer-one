// Testes de operationalAlerts — cobre ausência, um lado, ambos, vencidos,
// a vencer, agregação, homónimos, ordenação, limite, concentração e dedupe.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildOperationalAlerts, hasOperationalSource } from "./operationalAlerts.js";

const HOJE = new Date(2026, 0, 15, 10, 0, 0); // 15/01/2026
function ddmmaaaa(offsetDias) {
  const d = new Date(2026, 0, 15 + offsetDias);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

// Helpers para montar sales.recebiveis / sales.fornecedores com openInvoices.
function receb(openInvoices, vencer7 = 0, saldoReceber = null, top = null) {
  return {
    metrics: { saldoReceber: saldoReceber ?? 0, faturasAbertasReceber: openInvoices.length, faturasAbertasReceberVencer7: vencer7 },
    top: top ?? [],
    openInvoices,
    allOpenInvoices: openInvoices,
  };
}
function forn(openInvoices, vencer7 = 0, saldoPagar = null, top = null) {
  return {
    metrics: { saldoPagar: saldoPagar ?? 0, faturasAbertasPagar: openInvoices.length, faturasAbertasPagarVencer7: vencer7 },
    top: top ?? [],
    openInvoices,
    allOpenInvoices: openInvoices,
  };
}
const rInv = (o) => ({ id: o.id, cliente: o.cliente, numero: o.numero ?? "FT 1", dataEmissao: "01/01/2026", vencimento: o.vencimento ?? ddmmaaaa(0), valor: o.valor, diasAtraso: o.diasAtraso ?? 0 });
const fInv = (o) => ({ id: o.id, fornecedor: o.fornecedor, numero: o.numero ?? "FC 1", dataEmissao: "01/01/2026", vencimento: o.vencimento ?? ddmmaaaa(0), valor: o.valor, diasAtraso: o.diasAtraso ?? 0 });

describe("buildOperationalAlerts — presença de fontes", () => {
  it("ambos ausentes => lista vazia", () => {
    expect(buildOperationalAlerts({ recebiveis: null, fornecedores: null })).toEqual([]);
    expect(buildOperationalAlerts({})).toEqual([]);
  });

  it("hasOperationalSource reflete presença de qualquer lado", () => {
    expect(hasOperationalSource({ recebiveis: null, fornecedores: null })).toBe(false);
    expect(hasOperationalSource({ recebiveis: receb([]), fornecedores: null })).toBe(true);
    expect(hasOperationalSource({ recebiveis: null, fornecedores: forn([]) })).toBe(true);
  });

  it("lado presente mas openInvoices vazio => sem alertas (não inventa)", () => {
    expect(buildOperationalAlerts({ recebiveis: receb([]), fornecedores: null })).toEqual([]);
  });
});

describe("buildOperationalAlerts — recebíveis", () => {
  it("um cliente com fatura vencida => alerta danger", () => {
    const r = receb([rInv({ id: 1, cliente: "A, Lda", valor: 500, diasAtraso: 10 })]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const venc = out.find((a) => a.type === "vencido");
    expect(venc).toBeTruthy();
    expect(venc.severity).toBe("danger");
    expect(venc.category).toBe("Recebimentos");
    expect(venc.description).toContain("A, Lda");
    expect(venc.days).toBe(10);
  });

  it("cliente com múltiplas vencidas => alerta agregado único", () => {
    const r = receb([
      rInv({ id: 1, cliente: "A, Lda", valor: 500, diasAtraso: 10 }),
      rInv({ id: 2, cliente: "A, Lda", valor: 300, diasAtraso: 20 }),
    ]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const multi = out.filter((a) => a.source === "recebimentos" && (a.type === "vencido" || a.type === "vencido-multiplo"));
    expect(multi).toHaveLength(1);
    expect(multi[0].type).toBe("vencido-multiplo");
    expect(multi[0].amount).toBe(800);
    expect(multi[0].days).toBe(20); // maior atraso
  });

  it("a vencer em 7 dias => warning quando há títulos na janela", () => {
    const r = receb([rInv({ id: 1, cliente: "A", valor: 200, vencimento: ddmmaaaa(3), diasAtraso: 0 })], 1);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const v7 = out.find((a) => a.type === "vence7");
    expect(v7).toBeTruthy();
    expect(v7.severity).toBe("warning");
    expect(v7.amount).toBe(200); // valor só dos títulos ≤7 dias
  });

  it("valor dos 7 dias NÃO inclui títulos além de 7 dias", () => {
    const r = receb([
      rInv({ id: 1, cliente: "A", valor: 200, vencimento: ddmmaaaa(3), diasAtraso: 0 }),   // dentro
      rInv({ id: 2, cliente: "B", valor: 999, vencimento: ddmmaaaa(20), diasAtraso: 0 }),  // fora
    ], 1); // métrica = 1, igual ao nº de títulos dentro de 7 dias => valor conciliável
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const v7 = out.find((a) => a.type === "vence7");
    expect(v7).toBeTruthy();
    expect(v7.amount).toBe(200); // só o de 3 dias, nunca 1199
  });

  // ── Conciliação da quantidade a vencer em 7 dias (regra fixa) ──
  it("vencimento HOJE conta como dentro de 7 dias", () => {
    const r = receb([rInv({ id: 1, cliente: "A", valor: 100, vencimento: ddmmaaaa(0), diasAtraso: 0 })], 1);
    const v7 = buildOperationalAlerts({ recebiveis: r, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7).toBeTruthy();
    expect(v7.amount).toBe(100);
  });

  it("vencimento em EXATAMENTE 7 dias conta (limite inclusivo)", () => {
    const r = receb([rInv({ id: 1, cliente: "A", valor: 150, vencimento: ddmmaaaa(7), diasAtraso: 0 })], 1);
    const v7 = buildOperationalAlerts({ recebiveis: r, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7).toBeTruthy();
    expect(v7.amount).toBe(150);
  });

  it("vencimento em 8 dias NÃO conta (fora da janela)", () => {
    // métrica 0 e nenhum título dentro de 7 dias => sem alerta de 7 dias
    const r = receb([rInv({ id: 1, cliente: "A", valor: 150, vencimento: ddmmaaaa(8), diasAtraso: 0 })], 0);
    const v7 = buildOperationalAlerts({ recebiveis: r, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7).toBeFalsy();
  });

  it("métrica IGUAL à quantidade encontrada: mostra quantidade e valor", () => {
    const r = receb([
      rInv({ id: 1, cliente: "A", valor: 100, vencimento: ddmmaaaa(2), diasAtraso: 0 }),
      rInv({ id: 2, cliente: "B", valor: 200, vencimento: ddmmaaaa(5), diasAtraso: 0 }),
    ], 2); // métrica 2 == dentro7 2
    const v7 = buildOperationalAlerts({ recebiveis: r, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7.description).toContain("2 faturas");
    expect(v7.amount).toBe(300);
    expect(v7.description).toContain("300,00");
  });

  it("métrica MAIOR que a encontrada: usa a métrica e omite o valor", () => {
    const r = receb([
      rInv({ id: 1, cliente: "A", valor: 100, vencimento: ddmmaaaa(2), diasAtraso: 0 }),
    ], 5); // métrica diz 5, só 1 conciliável => usa 5, sem valor
    const v7 = buildOperationalAlerts({ recebiveis: r, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7.description).toContain("5 faturas");
    expect(v7.amount).toBeNull();
    expect(v7.description).not.toContain("€");
  });

  it("métrica AUSENTE: usa dentro7.length e mostra o valor calculado", () => {
    // side sem a chave *Vencer7 nas métricas
    const side = {
      metrics: { saldoReceber: 0, faturasAbertasReceber: 1 }, // sem faturasAbertasReceberVencer7
      top: [],
      openInvoices: [rInv({ id: 1, cliente: "A", valor: 250, vencimento: ddmmaaaa(3), diasAtraso: 0 })],
      allOpenInvoices: [rInv({ id: 1, cliente: "A", valor: 250, vencimento: ddmmaaaa(3), diasAtraso: 0 })],
    };
    const v7 = buildOperationalAlerts({ recebiveis: side, fornecedores: null }).find((a) => a.type === "vence7");
    expect(v7).toBeTruthy();
    expect(v7.description).toContain("1 fatura");
    expect(v7.amount).toBe(250);
  });

  it("concentração usa líder de side.top e saldo total da métrica", () => {
    const r = receb(
      [rInv({ id: 1, cliente: "Grande, Lda", valor: 2000, vencimento: ddmmaaaa(10), diasAtraso: 0 })],
      0,
      10000, // saldoReceber total (métrica) — denominador
      [{ id: 9, nome: "Grande, Lda", faturasAbertas: 3, saldo: 6000 }, { id: 8, nome: "Outro", faturasAbertas: 1, saldo: 4000 }]
    );
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const conc = out.find((a) => a.type === "concentracao");
    expect(conc).toBeTruthy();
    expect(conc.description).toContain("Grande, Lda");
    expect(conc.description).toContain("60"); // 6000/10000 = 60%
  });

  it("concentração >=50% com 2+ entidades => warning", () => {
    const r = receb([
      rInv({ id: 1, cliente: "Grande, Lda", valor: 8000, diasAtraso: 0 }),
      rInv({ id: 2, cliente: "Pequeno, Lda", valor: 1000, diasAtraso: 0 }),
    ]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const conc = out.find((a) => a.type === "concentracao");
    expect(conc).toBeTruthy();
    expect(conc.description).toContain("Grande, Lda");
  });

  it("homónimos com ids distintos não agregam se... (limitação: agrupa por nome)", () => {
    // openInvoices não expõe id da entidade; documenta o comportamento atual (agrupa por nome).
    const r = receb([
      rInv({ id: 1, cliente: "Silva, Lda", valor: 500, diasAtraso: 5 }),
      rInv({ id: 2, cliente: "Silva, Lda", valor: 500, diasAtraso: 8 }),
    ]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const multi = out.filter((a) => a.type === "vencido-multiplo");
    expect(multi).toHaveLength(1); // agrupados por nome (comportamento atual documentado)
  });
});

describe("buildOperationalAlerts — fornecedores e ambos", () => {
  it("fornecedor vencido => danger em Pagamentos", () => {
    const f = forn([fInv({ id: 1, fornecedor: "F, Lda", valor: 400, diasAtraso: 3 })]);
    const out = buildOperationalAlerts({ recebiveis: null, fornecedores: f });
    const venc = out.find((a) => a.type === "vencido");
    expect(venc.category).toBe("Pagamentos");
    expect(venc.severity).toBe("danger");
  });

  it("só um lado presente não gera alertas do outro", () => {
    const r = receb([rInv({ id: 1, cliente: "A", valor: 500, diasAtraso: 10 })]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    expect(out.every((a) => a.source === "recebimentos")).toBe(true);
  });

  it("ambos => alertas dos dois lados, ordenados por prioridade desc", () => {
    const r = receb([rInv({ id: 1, cliente: "A", valor: 500, diasAtraso: 5 })]);
    const f = forn([fInv({ id: 1, fornecedor: "F", valor: 400, diasAtraso: 30 })]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: f });
    // ordenado por priority desc: o vencido há 30 dias vem antes do de 5 dias
    expect(out[0].days).toBeGreaterThanOrEqual(out[1]?.days ?? 0);
  });

  it("sem duplicações de id", () => {
    const r = receb([
      rInv({ id: 1, cliente: "A", valor: 500, diasAtraso: 5 }),
      rInv({ id: 2, cliente: "B", valor: 400, diasAtraso: 8 }),
    ]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    const ids = out.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignora títulos sem nome ou valor <= 0 (não inventa)", () => {
    const r = receb([
      rInv({ id: 1, cliente: "\u2014", valor: 500, diasAtraso: 10 }),
      rInv({ id: 2, cliente: "B", valor: 0, diasAtraso: 10 }),
    ]);
    const out = buildOperationalAlerts({ recebiveis: r, fornecedores: null });
    expect(out).toEqual([]);
  });

  it("consumidor pode limitar a 4 (bloco C&F) — a função devolve ordenado", () => {
    const invs = [];
    for (let i = 1; i <= 10; i++) invs.push(rInv({ id: i, cliente: `C${i}`, valor: 100 * i, diasAtraso: i }));
    const out = buildOperationalAlerts({ recebiveis: receb(invs), fornecedores: null });
    const top4 = out.slice(0, 4);
    expect(top4).toHaveLength(4);
    // prioridade não-crescente
    for (let i = 1; i < top4.length; i++) expect(top4[i - 1].priority).toBeGreaterThanOrEqual(top4[i].priority);
  });
});