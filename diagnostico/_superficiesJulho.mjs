/****************************************************************************************
 * diagnostico/_superficiesJulho.mjs — READ-ONLY
 * --------------------------------------------------------------------------------------
 * Mostra o que as SUPERFÍCIES da aplicação dizem sobre julho/2026, com dados reais e
 * pelo MESMO caminho de composição que a app usa: buildSalesDataset. Nada de reconstruir
 * `closings` à mão — seria testar uma suposição em vez do produto.
 *
 * Responde às fases 10 e 11 da auditoria:
 *   - "Dados a completar" mostra julho INCOMPLETE, com CMV por preencher?
 *   - Os 3 títulos não classificados são confundidos com o CMV?
 *   - Resumo declara julho incompleto, sem alegar fecho contabilístico?
 *   - Performance inventa lucro/EBITDA?
 *   - Alertas tem exatamente o alerta de fecho esperado?
 *
 * Só faz GET. Não escreve nada.
 *
 *   npx vite-node diagnostico/_superficiesJulho.mjs
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { buildSalesDataset } from "../src/services/blingDataService.js";
import { normalizeOrder, normalizePayable, normalizeReceivable } from "../src/services/blingDataService.js";
import { normalizeManualInputs } from "../src/services/manualInputsService.js";
import { buildCompletionDataView } from "../src/utils/completionDataView.js";
import { resolveClosingSummary } from "../src/utils/closingSummaryView.js";
import { buildProfitabilityBlock } from "../src/utils/performanceView.js";
import { buildMonthlyDre } from "../src/utils/dreEngine.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";

const MES = "2026-07";
const AGORA = new Date();

const BASE = readFileSync(".env", "utf8")
  .split(/\r?\n/).find((l) => l.trim().startsWith("VITE_API_BASE_URL="))
  .split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

const get = async (params) => {
  const url = new URL(`${BASE}/pedidos/vendas`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  return r.json();
};

const t = (s = "") => console.log(s);
const linha = () => t("-".repeat(88));
const bloco = (titulo) => { linha(); t("  " + titulo); linha(); };

const [cPed, cDesp, cRec, cMan] = await Promise.all([
  get(null), get({ recurso: "despesas" }), get({ recurso: "recebiveis" }), get({ recurso: "ajustes-manuais" }),
]);

const orders = (cPed.data || []).map(normalizeOrder);
const payables = (cDesp.data || []).map(normalizePayable).filter(Boolean);
const receivables = (cRec.data || []).map(normalizeReceivable).filter(Boolean);
const manualInputsByMonth = normalizeManualInputs(cMan);

const sales = buildSalesDataset({ orders, payables, receivables, manualInputsByMonth, meta: {} });

t("=".repeat(88));
t(`  SUPERFÍCIES DA APLICAÇÃO — JULHO/2026   (agora: ${AGORA.toISOString()})`);
t(`  closedThroughMonth (config/company.js) = ${JSON.stringify(ACTIVE_COMPANY.historyCoverage.closedThroughMonth)}`);
t(`  meses na janela de fecho: ${sales.closings.map((c) => c.monthKey).join(", ")}`);
t("=".repeat(88));

/* ── FASE 10 · Dados a completar ─────────────────────────────────────────────────── */
bloco('FASE 10 · PÁGINA "DADOS A COMPLETAR" (AjustesManuais)');
const completion = buildCompletionDataView({ closings: sales.closings, manualInputs: cMan, loading: false });
t(`  estado da vista: ${completion.state}`);
for (const mes of completion.months ?? []) {
  const marca = mes.monthKey === MES ? "   <<<<<< JULHO" : "";
  t(`  · ${mes.monthKey} (${mes.monthLabel})  status=${mes.status}  badge="${mes.badge}"  tom=${mes.tone}${marca}`);
  t(`      resumo        : ${mes.resumo}`);
  t(`      por preencher : ${mes.porPreencher}`);
  for (const i of mes.itens ?? []) {
    t(`      item ${String(i.chave ?? i.key).padEnd(6)} estado=${String(i.estado).padEnd(14)} rótulo="${i.rotulo ?? i.label}"  valor=${i.valorFormatado ?? i.valor ?? "—"}  origem=${i.origem ?? i.fonte ?? "—"}`);
  }
}
t();
t("  VERIFICAÇÃO — os 3 títulos não classificados NÃO podem aparecer como pendência de CMV:");
const txt = JSON.stringify(completion).toLowerCase();
for (const termo of ["não classificad", "nao classificad", "sem categoria", "classificaç", "título"]) {
  t(`    contém "${termo}"? ${txt.includes(termo.toLowerCase()) ? "SIM  <-- investigar" : "não"}`);
}
t(`    alega fecho contabilístico? ${/fechad[oa]|encerrad|contabilisticamente/i.test(JSON.stringify(completion)) ? "SIM  <-- investigar" : "não"}`);

/* ── FASE 11a · Resumo ───────────────────────────────────────────────────────────── */
bloco("FASE 11a · RESUMO — resolveClosingSummary");
const resumo = resolveClosingSummary({ closings: sales.closings, now: AGORA });
if (!resumo) {
  t("  (null — o Resumo não mostra cartão de fecho)");
} else {
  t(`  mês      : ${resumo.monthKey} (${resumo.monthLabel})`);
  t(`  tom      : ${resumo.tone}     badge: ${resumo.badge}`);
  t(`  estado   : ${resumo.estado}`);
  t(`  detalhe  : ${resumo.detalhe}`);
  t(`  itens    : ${JSON.stringify(resumo.itens)}`);
  t(`  cta      : ${JSON.stringify(resumo.cta)}`);
  t(`  alega fecho contabilístico? ${/fechad[oa]|encerrad|contabilisticamente/i.test(JSON.stringify(resumo)) ? "SIM  <-- investigar" : "não"}`);
}

/* ── FASE 11b · Performance ──────────────────────────────────────────────────────── */
bloco("FASE 11b · PERFORMANCE — bloco de rentabilidade");
const perf = buildProfitabilityBlock({ source: "api", financeiro: sales.financeiro, closings: sales.closings });
t(`  estado do bloco: ${perf.state ?? "—"}`);
t(`  mês            : ${perf.monthKey ?? sales.financeiro?.metrics?.monthKey ?? "—"}`);
for (const r of perf.rows ?? []) {
  t(`  ${String(r.label).padEnd(24)} valor=${String(r.valueLabel ?? r.value ?? "null").padEnd(18)} disp=${String(r.availability ?? "—").padEnd(12)} nota=${r.note ?? "—"}`);
}
t();
t(`  INVENTA lucro/EBITDA? ${(perf.rows ?? []).some((r) => /lucro|ebitda|resultado/i.test(r.label) && r.value != null && r.availability === "unavailable") ? "SIM  <-- investigar" : "não"}`);

/* ── FASE 11c · Alertas ──────────────────────────────────────────────────────────── */
bloco("FASE 11c · ALERTAS");
const todos = sales.alertas?.list ?? [];
t(`  total de alertas: ${todos.length}`);
for (const a of todos) {
  t(`  · [${a.categoria ?? "—"}] ${a.titulo ?? a.mensagem ?? "—"}`);
  t(`      id=${a.id ?? "—"}  tipo=${a.tipo ?? a.severidade ?? "—"}  acao=${a.acao ?? "—"}`);
  if (a.descricao) t(`      ${a.descricao}`);
}
t();
const deFecho = todos.filter((a) => a.categoria === "Fecho mensal");
t(`  alertas de fecho mensal: ${deFecho.length}  -> ${deFecho.map((a) => a.id).join(", ") || "(nenhum)"}`);
t(`  algum alerta menciona CMV? ${todos.some((a) => /cmv/i.test(JSON.stringify(a))) ? "sim" : "não"}`);
t(`  algum alerta confunde títulos não classificados com CMV? ${todos.some((a) => /cmv/i.test(JSON.stringify(a)) && /classificad/i.test(JSON.stringify(a))) ? "SIM  <-- investigar" : "não"}`);

/* ── Contexto ────────────────────────────────────────────────────────────────────── */
bloco("CONTEXTO — DRE de julho (conferência cruzada)");
const dre = buildMonthlyDre({
  orders, payables, monthKey: MES,
  manualInputs: manualInputsByMonth?.[MES], coverage: ACTIVE_COMPANY.historyCoverage,
});
t(`  receitaBruta          = ${dre.receitaBruta}   (${dre.availability.receitaBruta})`);
t(`  receitaLiquida        = ${dre.receitaLiquida}   (${dre.availability.receitaLiquida})`);
t(`  cmv                   = ${dre.cmv}   (${dre.availability.cmv})`);
t(`  lucroBruto            = ${dre.lucroBruto}   (${dre.availability.lucroBruto})`);
t(`  despesasOperacionais  = ${dre.despesasOperacionais}   (${dre.availability.despesasOperacionais})`);
t(`  ebitda                = ${dre.ebitda}   (${dre.availability.ebitda})`);
t(`  resultadoLiquido      = ${dre.resultadoLiquido}   (${dre.availability.resultadoLiquido})`);
t("  avisos:");
for (const w of dre.warnings ?? []) t(`    · [${w.code}] ${w.message}`);
t("=".repeat(88));

/* ── Anexo: forma bruta do alerta de fecho e dos fechos ─────────────────────────── */
bloco("ANEXO — forma bruta");
const alertaFecho = todos.find((a) => String(a.id).startsWith("closing-"));
t("  alerta de fecho (bruto):");
t(JSON.stringify(alertaFecho, null, 2).split("\n").map((l) => "    " + l).join("\n"));
t();
t("  fechos (bruto):");
for (const c of sales.closings) {
  t(`    ${c.monthKey}  status=${c.status}  required=${c.requiredCount ?? "?"} completos=${c.completedCount ?? "?"}`);
  t(`      items: ${JSON.stringify(c.items)}`);
  t(`      missingItems: ${JSON.stringify(c.missingItems)}   completedItems: ${JSON.stringify(c.completedItems)}`);
}
t();
t("  meses com CMV manual: " + JSON.stringify(Object.keys(manualInputsByMonth ?? {})));
