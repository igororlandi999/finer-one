#!/usr/bin/env node
/****************************************************************************************
 * diagnostico/_coberturaJulho.mjs — READ-ONLY. Só GET. NÃO escreve nada, em lado nenhum.
 * --------------------------------------------------------------------------------------
 * Responde à pergunta da FASE 11 com dados REAIS: o que muda, exatamente, quando alguém
 * confirma a cobertura das despesas de julho de 2026?
 *
 * Constrói o MESMO dataset duas vezes, com a única diferença a ser a confirmação:
 *
 *   ANTES : manualCoverage ausente  -> vale company.js (payables 2026-06)
 *   DEPOIS: manualCoverage 2026-07  -> a confirmação humana escreve o limite
 *
 * E mede as duas coisas que interessam: o que MELHOROU (a cobertura deixa de bloquear) e
 * o que NÃO melhorou (o CMV e os títulos por classificar continuam a bloquear, porque
 * cobertura completa não é classificação completa).
 *
 *   npx vite-node diagnostico/_coberturaJulho.mjs
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSalesDataset, normalizeOrder, normalizePayable, normalizeReceivable } from "../src/services/blingDataService.js";
import { normalizeManualInputs } from "../src/services/manualInputsService.js";
import { buildMonthlyDre } from "../src/utils/dreEngine.js";
import { buildFinancialMetrics } from "../src/utils/financialMetrics.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
function lerBase() {
  for (const f of [".env.local", ".env"]) {
    try {
      const t = readFileSync(join(RAIZ, f), "utf8");
      const l = t.split(/\r?\n/).find((x) => x.trim().startsWith("VITE_API_BASE_URL="));
      if (l) { const v = l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""); if (v) return v; }
    } catch { /* segue */ }
  }
  return process.env.VITE_API_BASE_URL || "";
}
const BASE = lerBase().replace(/\/+$/, "");
if (!BASE) { console.error("sem VITE_API_BASE_URL"); process.exit(2); }

const MES = "2026-07";

async function get(qs) {
  const r = await fetch(`${BASE}/pedidos/vendas${qs}`, { headers: { Accept: "application/json" } });
  return r.json();
}

const [jp, jd, jr, ja] = await Promise.all([
  get(""), get("?recurso=despesas"), get("?recurso=recebiveis"), get("?recurso=ajustes-manuais"),
]);

const orders = (jp.data || []).map(normalizeOrder);
const payables = (jd.data || []).map(normalizePayable).filter(Boolean);
const receivables = (jr.data || []).map(normalizeReceivable).filter(Boolean);
const manualInputsByMonth = normalizeManualInputs(ja);

const meta = {
  orders: jp.meta?.geradoEm ?? null,
  payables: jd.meta?.geradoEm ?? null,
  receivables: jr.meta?.geradoEm ?? null,
  parcial: {
    orders: jp.meta?.parcial ?? null,
    payables: jd.meta?.parcial ?? null,
    receivables: jr.meta?.parcial ?? null,
  },
};

const construir = (manualCoverage) => buildSalesDataset({
  orders, payables, receivables, manualInputsByMonth, manualCoverage, meta,
});

const ANTES = construir(undefined);
const DEPOIS = construir({
  payables: {
    completeThroughMonth: MES,
    confirmedAt: new Date().toISOString(),
    confirmedBy: "user",
    note: null,
  },
});

/* As métricas de JULHO não estão expostas em `financeiro` — o dataset só apura o mês
 * âncora, o anterior e o mês em curso. Constrói-se a DRE de julho pelo caminho OFICIAL
 * (buildMonthlyDre -> buildFinancialMetrics) com cada uma das duas coberturas, para o
 * relatório poder dizer os números e não só os vereditos. Read-only na mesma. */
const dreJulho = (ds) => buildFinancialMetrics(buildMonthlyDre({
  orders, payables, monthKey: MES,
  manualInputs: manualInputsByMonth ? manualInputsByMonth[MES] : undefined,
  coverage: ds.coverage,
  referenceDate: new Date(),
}));

const fechoDe = (ds) => (ds.closings || []).find((c) => c && c.monthKey === MES) || null;
const mDe = (ds) => {
  const f = ds.financeiro;
  if (f?.metrics?.monthKey === MES) return f.metrics;
  if (f?.previous?.monthKey === MES) return f.previous;
  if (f?.emCurso?.monthKey === MES) return f.emCurso;
  return null;
};

const linha = (rot, a, b) => {
  const mudou = String(a) !== String(b);
  console.log(
    "  " + rot.padEnd(30) +
    String(a ?? "—").padStart(14) + "   ->   " + String(b ?? "—").padEnd(14) +
    (mudou ? "   << MUDOU" : "")
  );
};

console.log("=".repeat(84));
console.log(`  JULHO DE 2026 — cobertura das despesas ANTES vs DEPOIS da confirmação`);
console.log(`  dados reais · pedidos ${orders.length} · contas a pagar ${payables.length} · recebíveis ${receivables.length}`);
console.log(`  meta.parcial: ${JSON.stringify(meta.parcial)}`);
console.log("=".repeat(84));

console.log("\n  COBERTURA EFETIVA (o que o motor usou)");
linha("payables completeThrough", ANTES.coverage?.payables?.completeThroughMonth,
  DEPOIS.coverage?.payables?.completeThroughMonth);
linha("origem", ANTES.coverageOrigem?.source, DEPOIS.coverageOrigem?.source);

const ma = mDe(ANTES) || dreJulho(ANTES);
const mb = mDe(DEPOIS) || dreJulho(DEPOIS);
console.log("\n  DISPONIBILIDADE DAS LINHAS DE JULHO");
if (!ma && !mb) {
  console.log("  (julho não é mês apurado em nenhum dos dois — ver âncora abaixo)");
} else {
  const av = (m, k) => m?.availability?.[k];
  for (const k of ["revenueGross", "revenueNet", "deductions", "cmv", "operatingExpenses", "withdrawals", "payablesCoverage"]) {
    linha(k, av(ma, k), av(mb, k));
  }
  const p = (m, k) => m?.profitability?.[k];
  console.log("\n  VALORES DE JULHO");
  for (const k of ["grossProfit", "ebitda", "netResult", "netMarginPct"]) {
    linha(k, p(ma, k), p(mb, k));
  }
  linha("cmv.value", ma?.cmv?.value, mb?.cmv?.value);
}

const fa = fechoDe(ANTES), fb = fechoDe(DEPOIS);
console.log("\n  FECHO E ELEGIBILIDADE DE JULHO");
linha("closing.status", fa?.status, fb?.status);
linha("sourceCompleteness", fa?.financial?.sourceCompleteness, fb?.financial?.sourceCompleteness);
linha("financialAnalysisStatus", fa?.financial?.financialAnalysisStatus, fb?.financial?.financialAnalysisStatus);
linha("anchorEligible", fa?.financial?.anchorEligible, fb?.financial?.anchorEligible);
linha("anchorBlockers", (fa?.financial?.anchorBlockers || []).join("+"), (fb?.financial?.anchorBlockers || []).join("+"));

const bl = (f) => (f?.financial?.blockers || []).map((l) => `${l.key}[${(l.causes || []).join(",")}]`).join(" ");
console.log("\n  LINHAS BLOQUEADAS");
console.log("  antes : " + (bl(fa) || "—"));
console.log("  depois: " + (bl(fb) || "—"));

console.log("\n  ÂNCORA DOS KPIs (do dataset inteiro)");
linha("financeiro.monthKey", ANTES.financeiro?.monthKey, DEPOIS.financeiro?.monthKey);
linha("anchorSource", ANTES.financeiro?.anchorSource, DEPOIS.financeiro?.anchorSource);
linha("referenciaAtrasada", ANTES.financeiro?.referenciaAtrasada, DEPOIS.financeiro?.referenciaAtrasada);

const pc = (ds) => (ds.despesas?.porClassificar || []).find((c) => c.monthKey === MES);
console.log("\n  TÍTULOS POR CLASSIFICAR EM JULHO (têm de continuar visíveis)");
const ca = pc(ANTES), cb = pc(DEPOIS);
linha("unclassifiedCount", ca?.unclassifiedCount, cb?.unclassifiedCount);
linha("unclassifiedAmount", ca?.unclassifiedAmount, cb?.unclassifiedAmount);
linha("unclassifiedRatio %", ca?.unclassifiedRatio, cb?.unclassifiedRatio);

console.log("\n  DIAGNÓSTICO DE COBERTURA (o alerta de 'por rever')");
linha("payables.needsReview", ANTES.financeiro?.coverageDiagnostics?.payables?.coverageNeedsReview,
  DEPOIS.financeiro?.coverageDiagnostics?.payables?.coverageNeedsReview);
linha("payables.lagMonths", ANTES.financeiro?.coverageDiagnostics?.payables?.coverageLagMonths,
  DEPOIS.financeiro?.coverageDiagnostics?.payables?.coverageLagMonths);
console.log("=".repeat(84));
