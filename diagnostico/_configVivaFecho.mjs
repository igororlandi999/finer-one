/****************************************************************************************
 * diagnostico/_configVivaFecho.mjs — READ-ONLY
 * --------------------------------------------------------------------------------------
 * Corre o caminho REAL de produção (buildSalesDataset) sobre os dados REAIS, com a
 * config VIVA de company.js — sem cenários inventados. Responde a:
 *
 *   1. que disponibilidade tem cada mês, agora que os eixos estão separados;
 *   2. o fecho de julho já pede o CMV?
 *   3. o mês de referência dos KPIs saltou para julho? (não pode, sem CMV)
 *   4. o que é que "Dados a completar", o Resumo e os Alertas passam a mostrar.
 *
 * Não escreve nada. Não altera config. Só GET.
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { revenueAvailability, payablesCoverage, sourceAvailability } from "../src/utils/dreEngine.js";
import { normalizeOrder, normalizePayable, buildSalesDataset } from "../src/services/blingDataService.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";
import { normalizeManualInputs } from "../src/services/manualInputsService.js";
import { buildCompletionDataView } from "../src/utils/completionDataView.js";
import { resolveClosingSummary } from "../src/utils/closingSummaryView.js";

const BASE = readFileSync(".env", "utf8")
  .split(/\r?\n/).find((linha) => linha.trim().startsWith("VITE_API_BASE_URL="))
  .split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

const get = async (params) => {
  const url = new URL(`${BASE}/pedidos/vendas`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return (await fetch(url, { headers: { Accept: "application/json" } })).json();
};

const [rawPed, rawDesp, rawAjustes] = await Promise.all([
  get(null), get({ recurso: "despesas" }), get({ recurso: "ajustes-manuais" }),
]);

const orders = (rawPed?.data ?? []).map(normalizeOrder);
const payables = (rawDesp?.data ?? []).map(normalizePayable);
const manualInputsByMonth = normalizeManualInputs(rawAjustes) ?? {};

const cov = ACTIVE_COMPANY.historyCoverage;
const covPag = payablesCoverage(cov);
const REF = new Date();
const L = (...a) => console.log(...a);

L("=".repeat(86));
L("  CONFIG VIVA:", JSON.stringify({
  firstCompleteMonth: cov.firstCompleteMonth,
  partialMonths: cov.partialMonths,
  completeThroughMonth: cov.completeThroughMonth,
  validatedThroughMonth: cov.validatedThroughMonth,
  payables: cov.payables,
}));
L("  relogio:", REF.toISOString());
L("  ajustes manuais por mes:", JSON.stringify(manualInputsByMonth));
L("=".repeat(86));

L("");
L("  1. DISPONIBILIDADE POR MES (config viva + referenceDate injetada)");
L("     mes        receita(pedidos)   despesas(payables)");
for (const mk of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2027-07"]) {
  L("     " + mk.padEnd(10),
    String(revenueAvailability(mk, cov, REF)).padEnd(18),
    String(sourceAvailability(mk, covPag, REF)));
}

const ds = buildSalesDataset({ orders, payables, receivables: [], manualInputsByMonth });

L("");
L("  2. ANCORAS EXPOSTAS AO UI");
L("     financeiro.monthKey          :", ds.financeiro.monthKey, " <- KPIs (ultimo mes COMPLETO)");
L("     financeiro.civilMonthKey     :", ds.financeiro.civilMonthKey, " <- ultimo mes ENCERRADO");
L("     financeiro.referenciaAtrasada:", ds.financeiro.referenciaAtrasada);
L("     financeiro.emCurso           :", ds.financeiro.emCurso?.monthKey ?? "(nenhum)");
L("     financeiro.payables.monthKey :", ds.financeiro.payables?.monthKey ?? "(nenhum)");
L("     closingPendente              :", ds.financeiro.closingPendente
  ? `${ds.financeiro.closingPendente.monthKey}=${ds.financeiro.closingPendente.status}`
    + ` missing=[${ds.financeiro.closingPendente.missingItems.map((i) => i.key).join(",")}]`
  : "(nenhum)");

L("");
L("  3. FECHO MENSAL — janela dos meses civis terminados");
for (const c of ds.closings || []) {
  L(`     ${c.monthKey}  status=${c.status.padEnd(14)}`
    + ` obrig=${c.totalRequired} completos=${c.totalComplete} faltam=${c.totalMissing}`
    + `  missing=[${c.missingItems.map((i) => i.key).join(",") || "-"}]`
    + `  itens=[${c.items.map((i) => `${i.key}:${i.status}`).join(" ")}]`);
}

L("");
L("  4. DADOS A COMPLETAR (buildCompletionDataView)");
const vista = buildCompletionDataView({ closings: ds.closings, manualInputs: rawAjustes });
L("     state:", vista.state, "| meses:", (vista.months || []).length);
for (const m of vista.months || []) {
  L(`     - ${m.monthKey} "${m.monthLabel}"  badge="${m.badge}"  tone=${m.tone}  porPreencher=${m.porPreencher}`);
  L(`        resumo: ${m.resumo}`);
  for (const it of m.itens || []) {
    L(`         · ${String(it.label).padEnd(6)} estado=${String(it.estado).padEnd(14)} "${it.estadoLabel ?? ""}"  valor=${it.value}  impacto=${(it.impacto||[]).length}`);
  }
}

L("");
L("  5. RESUMO DE FECHO (resolveClosingSummary)");
L("     " + JSON.stringify(resolveClosingSummary({ closings: ds.closings, now: REF })));

L("");
L("  6. ALERTAS DE FECHO");
const lista = Array.isArray(ds.alertas) ? ds.alertas : (ds.alertas?.list ?? []);
const alertas = lista.filter((a) => String(a.category || "").includes("fecho")
  || /fecho/i.test(String(a.title || "")));
if (!alertas.length) L("     (nenhum)");
for (const a of alertas) {
  L(`     · [${a.severity}] ${a.title}`);
  L(`         ${a.description}`);
  L(`         monthKey=${a.monthKey} missingKeys=[${(a.missingKeys || []).join(",")}]`);
}
L("=".repeat(86));
