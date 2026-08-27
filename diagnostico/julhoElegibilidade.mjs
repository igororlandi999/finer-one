/****************************************************************************************
 * diagnostico/julhoElegibilidade.mjs — READ-ONLY (Finer One) — auditoria P0.1
 * --------------------------------------------------------------------------------------
 * OBJETIVO
 *   Responder, com os MOTORES REAIS sobre DADOS REAIS, a uma só pergunta:
 *   julho de 2026 já pode substituir junho como mês de referência da DRE?
 *
 *   Nenhuma regra é reimplementada aqui. A disponibilidade sai de sourceAvailability,
 *   a DRE de buildMonthlyDre, as métricas de buildFinancialMetrics e o fecho de
 *   buildMonthlyClosing. Se o motor mudar, este diagnóstico muda com ele.
 *
 * GARANTIA DE READ-ONLY
 *   - Só faz GET aos endpoints. Nunca escreve, nunca força rebuild.
 *   - Não escreve ficheiro nenhum. Não altera src/, config, testes nem Apps Script.
 *   - NÃO altera closedThroughMonth: os cenários são passados como `coverage` local.
 *
 * COMO CORRER
 *   npx vite-node diagnostico/julhoElegibilidade.mjs
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import {
  buildMonthlyDre, sourceAvailability, payablesCoverage, availableDreMonths,
} from "../src/utils/dreEngine.js";
import { buildFinancialMetrics, latestUsableFinancialMonth } from "../src/utils/financialMetrics.js";
import { buildMonthlyClosing, CLOSING_REQUIREMENTS } from "../src/utils/monthlyClosing.js";
import { normalizeOrder, normalizePayable } from "../src/services/blingDataService.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";

const MES = "2026-07";
const ANTERIOR = "2026-06";

const BASE = readFileSync(".env", "utf8")
  .split(/\r?\n/).find((linha) => linha.trim().startsWith("VITE_API_BASE_URL="))
  .split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

const get = async (params) => {
  const url = new URL(`${BASE}/pedidos/vendas`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  return r.json();
};

const val = (n) => (typeof n === "number"
  ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : String(n));
const disp = (d) => ({ real: "real       ", partial: "partial    ", unavailable: "unavailable" }[d] ?? String(d).padEnd(11));
const l = (s = "") => console.log(s);
const risca = (c) => c.repeat(86);

/* ── Recolha ──────────────────────────────────────────────────────────────────────── */

const [rawPed, rawDesp, rawAjustes] = await Promise.all([
  get(null), get({ recurso: "despesas" }), get({ recurso: "ajustes-manuais" }),
]);

const orders = (rawPed?.data ?? []).map(normalizeOrder);
const payables = (rawDesp?.data ?? []).map(normalizePayable);
const manualByMonth = rawAjustes?.data?.months ?? {};

l(risca("="));
l("  AUDITORIA DE ELEGIBILIDADE — JULHO/2026 COMO MES DA DRE (P0.1)");
l(risca("="));
l(`  pedidos: ${orders.length}   contas a pagar: ${payables.length}`);
l(`  meses com ajuste manual: ${Object.keys(manualByMonth).join(", ") || "(nenhum)"}`);
l(`  closedThroughMonth em config/company.js: ${JSON.stringify(ACTIVE_COMPANY.historyCoverage.closedThroughMonth)}`);
l(`  meses presentes nas fontes: ${availableDreMonths({ orders, payables }).join(" ")}`);

/* ── Cenários de cobertura (locais; a configuração NÃO é tocada) ──────────────────── */

const base = ACTIVE_COMPANY.historyCoverage;
const cenarios = [
  { nome: 'ATUAL    closedThroughMonth="2026-06"', cov: { ...base, closedThroughMonth: "2026-06" } },
  { nome: 'PROPOSTO closedThroughMonth="2026-07"', cov: { ...base, closedThroughMonth: "2026-07" } },
  { nome: "AUSENTE  closedThroughMonth=null", cov: { ...base, closedThroughMonth: null } },
];

l("");
l(risca("-"));
l("  1. DISPONIBILIDADE TEMPORAL DE JULHO, POR CENARIO");
l(risca("-"));
l(`  ${"cenario".padEnd(34)} ${"receita".padEnd(13)} ${"pagaveis".padEnd(13)} mes ancora da DRE`);
for (const { nome, cov } of cenarios) {
  const dRec = sourceAvailability(MES, cov);
  const dPag = sourceAvailability(MES, payablesCoverage(cov));
  const ancora = latestUsableFinancialMonth({ orders, payables, coverage: cov });
  l(`  ${nome.padEnd(34)} ${disp(dRec)}   ${disp(dPag)}   ${ancora ?? "(nenhum)"}`);
}

/* ── Matriz de elegibilidade, no cenário PROPOSTO ─────────────────────────────────── */

const covProposto = cenarios[1].cov;
const dre = buildMonthlyDre({ orders, payables, monthKey: MES, manualInputs: manualByMonth[MES], coverage: covProposto });
const metrics = buildFinancialMetrics(dre);
const dreJun = buildMonthlyDre({ orders, payables, monthKey: ANTERIOR, manualInputs: manualByMonth[ANTERIOR], coverage: covProposto });

l("");
l(risca("-"));
l('  2. MATRIZ DE ELEGIBILIDADE DE JULHO  (cenario closedThroughMonth="2026-07")');
l(risca("-"));

const linhas = [
  ["RECEITA", null],
  ["  receita bruta", "receitaBruta"],
  ["  frete de venda (informativo)", "freteVenda"],
  ["DEDUCOES", null],
  ["  comissoes", "comissoes"],
  ["  devolucoes", "devolucoes"],
  ["  Simples Nacional", "simplesNacional"],
  ["  total de deducoes", "totalDeducoes"],
  ["  receita liquida", "receitaLiquida"],
  ["CMV", null],
  ["  CMV", "cmv"],
  ["  lucro bruto", "lucroBruto"],
  ["DESPESAS OPERACIONAIS", null],
  ["  pessoal", "pessoal"],
  ["  fixas", "fixas"],
  ["  administrativas", "administrativas"],
  ["  total operacionais", "despesasOperacionais"],
  ["RESULTADO", null],
  ["  EBITDA", "ebitda"],
  ["  retiradas de socios", "retiradasSocios"],
  ["  resultado liquido", "resultadoLiquido"],
];
l(`  ${"linha".padEnd(32)} ${"disponibilidade".padEnd(13)} ${"julho".padStart(16)} ${"junho".padStart(16)}`);
for (const [rot, campo] of linhas) {
  if (!campo) { l(`  ${rot}`); continue; }
  const d = dre.availability[campo] ?? "—";
  const vJul = dre[campo];
  const vJun = dreJun[campo];
  l(`  ${rot.padEnd(32)} ${disp(d)}   ${(vJul == null ? "null" : val(vJul)).padStart(16)} ${(vJun == null ? "null" : val(vJun)).padStart(16)}`);
}

l("");
l("  CMV — origem do valor:");
l(`    ajuste manual para ${MES}:    ${manualByMonth[MES] ? JSON.stringify(manualByMonth[MES]) : "(ausente)"}`);
l(`    ajuste manual para ${ANTERIOR}:    ${manualByMonth[ANTERIOR] ? "presente" : "(ausente)"}`);
l(`    dre.cmv = ${dre.cmv == null ? "null" : val(dre.cmv)}   availability = ${dre.availability.cmv}`);

if (dre.warnings.length) {
  l("");
  l("  AVISOS EMITIDOS PELO MOTOR PARA JULHO:");
  for (const w of dre.warnings) l(`    · [${w.code}] ${w.message}`);
} else {
  l("");
  l("  (o motor nao emitiu avisos para julho)");
}

/* ── Fecho mensal ─────────────────────────────────────────────────────────────────── */

const fecho = buildMonthlyClosing({ metrics, monthKey: MES, coverage: covProposto });
l("");
l(risca("-"));
l("  3. FECHO MENSAL DE JULHO");
l(risca("-"));
l(`  status: ${fecho.status}`);
l(`  obrigatorios: ${fecho.totalRequired}   completos: ${fecho.totalComplete}   em falta: ${fecho.totalMissing}`);
l(`  requisitos declarados: ${CLOSING_REQUIREMENTS.map((r) => r.key).join(", ")}`);
l("");
l("  itens:");
for (const it of fecho.items) {
  l(`    ${String(it.key).padEnd(12)} status=${String(it.status).padEnd(14)} source=${String(it.source ?? "—").padEnd(12)} value=${it.value == null ? "null" : val(it.value)}`);
}
l("");
l(`  missingItems:   ${fecho.missingItems.map((i) => i.key).join(", ") || "(nenhum)"}`);
l(`  completedItems: ${fecho.completedItems.map((i) => i.key).join(", ") || "(nenhum)"}`);

/* ── Meta das fontes ──────────────────────────────────────────────────────────────── */

l("");
l(risca("-"));
l("  4. META DAS FONTES");
l(risca("-"));
for (const [rot, env] of [["pedidos", rawPed], ["despesas", rawDesp]]) {
  const m = env?.meta ?? {};
  l(`  ${rot.padEnd(10)} geradoEm=${m.geradoEm ?? "(ausente)"}  parcial=${JSON.stringify(m.parcial ?? null)}`);
}
l(`  ${"ajustes".padEnd(10)} documento=${rawAjustes?.data ? "presente" : "ausente"}  fonte=${rawAjustes?.debug?.fonte ?? "—"}`);
l(risca("="));
