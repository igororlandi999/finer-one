/****************************************************************************************
 * diagnostico/completudeFinanceiraJulho.mjs — READ-ONLY (Finer One)
 * --------------------------------------------------------------------------------------
 * OBJETIVO (Fase 2/3 da auditoria de "mês financeiramente completo")
 *   Responder, com os MOTORES REAIS sobre DADOS REAIS, a uma só pergunta:
 *
 *     Se o CMV de julho/2026 for informado, mas as despesas operacionais continuarem
 *     PARCIAIS, julho passa a COMPLETE? E vira âncora dos KPIs?
 *
 *   Nenhuma regra é reimplementada aqui. A DRE sai de buildMonthlyDre, as métricas de
 *   buildFinancialMetrics, o fecho de buildMonthlyClosing e a âncora de
 *   latestCompleteMonthKey / buildSalesDataset. Se o motor mudar, isto muda com ele.
 *
 * GARANTIA DE READ-ONLY
 *   - Lê snapshots de ficheiros locais já descarregados (nenhuma chamada de rede).
 *   - Não escreve ficheiro nenhum. Não altera src/, config, testes nem Apps Script.
 *   - O CMV de julho é SINTÉTICO e existe só em memória, dentro deste processo.
 *     Nunca é gravado no documento de ajustes manuais nem enviado a lado nenhum.
 *
 * COMO CORRER
 *   npx vite-node diagnostico/completudeFinanceiraJulho.mjs <dir-com-snapshots>
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildMonthlyDre } from "../src/utils/dreEngine.js";
import { buildFinancialMetrics } from "../src/utils/financialMetrics.js";
import { buildMonthlyClosing, latestCompleteMonthKey } from "../src/utils/monthlyClosing.js";
import { normalizeOrder, normalizePayable, buildSalesDataset } from "../src/services/blingDataService.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";

const MES = "2026-07";
/* Valor claramente FICTÍCIO e marcado como teste: não é uma estimativa de CMV, não
 * pretende ser plausível e não deve ser copiado para lado nenhum. Só serve para o
 * motor deixar de ver `undefined`. */
const CMV_SINTETICO_TESTE = 111111.11;

const DIR = process.argv[2];
if (!DIR) { console.error("uso: npx vite-node diagnostico/completudeFinanceiraJulho.mjs <dir-snapshots>"); process.exit(2); }

const ler = (nome) => JSON.parse(readFileSync(join(DIR, nome), "utf8"));
const linhas = (env) => (Array.isArray(env) ? env : (env && env.data) || []);

const pedidos = linhas(ler("pedidos.json")).map(normalizeOrder);
const despesas = linhas(ler("despesas.json")).map(normalizePayable);
const manualDoc = ler("ajustes-manuais.json");

/* Mapa { "aaaa-mm": { cmv } } tal como manualInputsService o produz — lido do
 * documento REAL, sem inventar meses. */
const manuaisReais = {};
for (const [mk, rubricas] of Object.entries((manualDoc.data && manualDoc.data.months) || {})) {
  if (rubricas && rubricas.cmv && typeof rubricas.cmv.value === "number") {
    manuaisReais[mk] = { cmv: rubricas.cmv.value };
  }
}

const coverage = ACTIVE_COMPANY.historyCoverage;
const referenceDate = new Date();

const val = (n) => (typeof n === "number"
  ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(14)
  : String(n).padStart(14));
const l = (s = "") => console.log(s);
const risca = (c = "─") => c.repeat(94);

function cenario(nome, manuais) {
  const dre = buildMonthlyDre({
    orders: pedidos, payables: despesas, monthKey: MES,
    manualInputs: manuais[MES], coverage, referenceDate,
  });
  const metrics = buildFinancialMetrics(dre);
  const closing = buildMonthlyClosing({ metrics, monthKey: MES, now: referenceDate, coverage });
  const dataset = buildSalesDataset({
    orders: pedidos, payables: despesas, receivables: null,
    manualInputsByMonth: manuais,
  });
  return { nome, dre, metrics, closing, dataset };
}

function imprimirDre(c) {
  const a = c.dre.availability;
  const linha = (rot, v, disp) => l(`  ${rot.padEnd(26)} ${val(v)}   ${String(disp)}`);
  l(`  ${"linha".padEnd(26)} ${"value".padStart(14)}   availability`);
  l(`  ${risca("·").slice(0, 60)}`);
  linha("receita bruta", c.dre.receitaBruta, a.receitaBruta);
  linha("deduções (total)", c.dre.totalDeducoes, a.totalDeducoes);
  linha("receita líquida", c.dre.receitaLiquida, a.receitaLiquida);
  linha("CMV", c.dre.cmv, a.cmv);
  linha("lucro bruto", c.dre.lucroBruto, a.lucroBruto);
  linha("despesas operacionais", c.dre.despesasOperacionais, a.despesasOperacionais);
  linha("EBITDA", c.dre.ebitda, a.ebitda);
  linha("retiradas de sócios", c.dre.retiradasSocios, a.retiradasSocios);
  linha("resultado líquido", c.dre.resultadoLiquido, a.resultadoLiquido);
  l(`  ${"cobertura payables".padEnd(26)} ${"".padStart(14)}   ${a.coberturaPayables}`);
}

function imprimirFecho(c) {
  const cl = c.closing;
  const fin = c.dataset.financeiro;
  l(`  closing.status            ${cl.status}`);
  l(`  missingItems              [${cl.missingItems.map((i) => i.key).join(", ")}]`);
  const pend = cl.items.filter((i) => i.status === "pending").map((i) => i.key);
  l(`  pendingItems              [${pend.join(", ")}]`);
  l(`  totalRequired             ${cl.totalRequired}`);
  l(`  totalComplete             ${cl.totalComplete}`);
  l(`  totalMissing              ${cl.totalMissing}`);
  l(`  items[cmv].status/source  ${cl.items[0].status} / ${cl.items[0].source}`);
  l("");
  l(`  latestCompleteMonthKey    ${latestCompleteMonthKey(c.dataset.closings)}`);
  l(`  financeiro.monthKey       ${fin.monthKey}`);
  l(`  financeiro.civilMonthKey  ${fin.civilMonthKey}`);
  l(`  referenciaAtrasada        ${fin.referenciaAtrasada}`);
  l(`  closingPendente.status    ${fin.closingPendente ? fin.closingPendente.status : null}`);
  l(`  payables.monthKey         ${fin.payables.monthKey}`);
  l(`  payables.availability     ${fin.payables.availability}`);
  l(`  payables.partial          ${fin.payables.partial}`);
  l(`  payables.classifIncompl.  ${fin.payables.classificacaoIncompleta}`);
}

l(risca("═"));
l(`  COMPLETUDE FINANCEIRA DE ${MES} — simulação em memória (nada é gravado)`);
l(`  referenceDate: ${referenceDate.toISOString().slice(0, 10)}   pedidos: ${pedidos.length}   contas a pagar: ${despesas.length}`);
l(`  CMV manual REAL no documento: ${Object.keys(manuaisReais).join(", ") || "(nenhum)"}`);
l(risca("═"));

const antes = cenario("ANTES — CMV de julho ausente", manuaisReais);
const depois = cenario("DEPOIS — CMV de julho SINTÉTICO (teste)", {
  ...manuaisReais,
  [MES]: { cmv: CMV_SINTETICO_TESTE },
});

for (const c of [antes, depois]) {
  l();
  l(risca());
  l(`  ${c.nome}`);
  l(risca());
  imprimirDre(c);
  l();
  imprimirFecho(c);
}

l();
l(risca("═"));
l("  VEREDITO DA FASE 3");
l(risca("═"));
const opexDepois = depois.dre.availability.despesasOperacionais;
l(`  1. julho vira COMPLETE?                 ${depois.closing.status === "complete" ? "SIM" : "NÃO"}  (${depois.closing.status})`);
l(`  2. latestCompleteMonthKey escolhe julho? ${latestCompleteMonthKey(depois.dataset.closings) === MES ? "SIM" : "NÃO"}  (${latestCompleteMonthKey(depois.dataset.closings)})`);
l(`  3. Performance/KPIs passam a julho?      ${depois.dataset.financeiro.monthKey === MES ? "SIM" : "NÃO"}  (${depois.dataset.financeiro.monthKey})`);
l(`  4. EBITDA availability                   ${depois.dre.availability.ebitda}  (valor: ${depois.dre.ebitda})`);
l(`  5. resultado líquido availability        ${depois.dre.availability.resultadoLiquido}  (valor: ${depois.dre.resultadoLiquido})`);
l(`  6. despesas operacionais availability    ${opexDepois}`);
l(`  7. alerta de fecho de julho existe?      ${depois.dataset.alertas.list.some((x) => x.id === "closing-2026-07") ? "SIM" : "NÃO"}`);
l();
l(`  REGRA DE PRODUTO: um mês com componente material da DRE ainda "${opexDepois}"`);
l("  NÃO pode ser considerado financeiramente completo para rentabilidade/EBITDA.");
l(risca("═"));
