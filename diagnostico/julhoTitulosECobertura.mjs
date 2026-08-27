/****************************************************************************************
 * diagnostico/julhoTitulosECobertura.mjs — READ-ONLY (Finer One)
 * --------------------------------------------------------------------------------------
 * OBJETIVO (Fases 6 e 7 da auditoria de "mês financeiramente completo")
 *   6. Decompor a parcialidade das despesas de julho: cobertura vs. classificação, e
 *      medir o PESO FINANCEIRO dos títulos por classificar.
 *   7. Verificar se os metadados do snapshot permitem DERIVAR a cobertura das contas
 *      a pagar, em vez de a manter à mão em company.js.
 *
 *   Não classifica nada. Não propõe categoria para título nenhum. Só mede.
 *
 * GARANTIA DE READ-ONLY
 *   - Lê ficheiros locais já descarregados. Nenhuma chamada de rede.
 *   - Não escreve ficheiro nenhum. Não altera src/, config, testes nem Apps Script.
 *
 * COMO CORRER
 *   npx vite-node diagnostico/julhoTitulosECobertura.mjs <dir-com-snapshots>
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifyPayable, payableCompetenceDate, isCancelledPayable, DRE_GROUPS,
  buildMonthlyDre, payablesCoverage, sourceAvailability,
} from "../src/utils/dreEngine.js";
import { normalizePayable } from "../src/services/blingDataService.js";
import { monthKey } from "../src/utils/financialCalculations.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";

const MES = "2026-07";
const DIR = process.argv[2];
if (!DIR) { console.error("uso: npx vite-node diagnostico/julhoTitulosECobertura.mjs <dir-snapshots>"); process.exit(2); }

const envelopeDespesas = JSON.parse(readFileSync(join(DIR, "despesas.json"), "utf8"));
const envelopePedidos = JSON.parse(readFileSync(join(DIR, "pedidos.json"), "utf8"));
const despesas = (envelopeDespesas.data || []).map(normalizePayable);

const val = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const l = (s = "") => console.log(s);
const risca = (c = "─") => c.repeat(92);

/* ── FASE 6 — os títulos de julho ──────────────────────────────────────────────── */
l(risca("═"));
l(`  FASE 6 — TÍTULOS DE ${MES}: cobertura vs. classificação`);
l(risca("═"));

const doMes = despesas
  .filter((p) => !isCancelledPayable(p))
  .map((p) => ({ p, comp: payableCompetenceDate(p), ...classifyPayable(p) }))
  .filter((x) => x.comp.date && monthKey(x.comp.date) === MES);

const naoClassificados = doMes.filter((x) => x.group === DRE_GROUPS.NAO_CLASSIFICADO);
const totalMes = doMes.reduce((a, x) => a + (Number(x.p.valor) || 0), 0);
const totalNaoClass = naoClassificados.reduce((a, x) => a + (Number(x.p.valor) || 0), 0);

l(`  títulos de ${MES} (não cancelados):   ${String(doMes.length).padStart(4)}   ${val(totalMes).padStart(14)}`);
l(`  destes, SEM categoria reconhecida:   ${String(naoClassificados.length).padStart(4)}   ${val(totalNaoClass).padStart(14)}`);
l(`  peso dos não classificados:          ${totalMes ? ((totalNaoClass / totalMes) * 100).toFixed(2) : "—"}% do mês`);
l();
l("  Detalhe (sem propor classificação — só o que a fonte diz):");
l(`  ${"id".padEnd(12)} ${"valor".padStart(13)}  ${"competência".padEnd(12)} ${"campo".padEnd(18)} categoria / histórico`);
for (const x of naoClassificados) {
  const cat = x.p.categoriaNome || "(sem categoria)";
  const hist = x.p.historico || "(sem histórico)";
  l(`  ${String(x.p.id).padEnd(12)} ${val(x.p.valor).padStart(13)}  ${String(x.comp.date).slice(0, 10).padEnd(12)} ${String(x.comp.field).padEnd(18)} ${cat} | ${hist}`);
}

/* Decomposição A/B/C pedida na Fase 6, medida com o motor real. */
const coverage = ACTIVE_COMPANY.historyCoverage;
const refDate = new Date();
const dre = buildMonthlyDre({
  orders: (envelopePedidos.data || []), payables: despesas, monthKey: MES, coverage, referenceDate: refDate,
});
const coberturaTemporal = dre.availability.coberturaPayables;
const opex = dre.availability.despesasOperacionais;
l();
l(`  A. parcial por COBERTURA da fonte:   ${coberturaTemporal !== "real" ? "SIM" : "não"}   (coberturaPayables = ${coberturaTemporal})`);
l(`  B. parcial por CLASSIFICAÇÃO:        ${naoClassificados.length ? "SIM" : "não"}   (${naoClassificados.length} título(s))`);
l(`  C. availability final da linha:      ${opex}`);
l();
l("  CONSEQUÊNCIAS (medidas, não opinadas):");
l(`   - impedem análise financeira completa?  ${opex !== "real" ? "SIM" : "não"}`);
l(`   - impedem elegibilidade como âncora?    ${opex !== "real" ? "SIM" : "não"}`);
l("   - são apenas warning?                    NÃO — a soma da linha exclui-os, logo é um mínimo.");
l("   - devem aparecer em Despesas?            SIM (a página lista títulos, não linhas da DRE).");
l("   - devem aparecer em Dados a completar?   NÃO — não são requisito do utilizador; a");
l("     classificação resolve-se no ERP, não num campo do Finer One.");

/* ── FASE 7 — metadados de cobertura ───────────────────────────────────────────── */
l();
l(risca("═"));
l("  FASE 7 — os metadados permitem DERIVAR a cobertura das contas a pagar?");
l(risca("═"));

const meta = envelopeDespesas.meta || {};
l(`  meta declarada pelo snapshot de despesas: ${JSON.stringify(meta)}`);
l();
const campos = ["geradoEm", "parcial", "totalTitulos", "periodoAtualizado", "periodoInicio", "periodoFim"];
for (const c of campos) {
  const presente = Object.prototype.hasOwnProperty.call(meta, c);
  l(`   ${presente ? "✓" : "✗"} meta.${c.padEnd(20)} ${presente ? JSON.stringify(meta[c]) : "AUSENTE"}`);
}

/* O que se pode e o que NÃO se pode concluir dos campos existentes. */
const ultimaCompetencia = despesas
  .filter((p) => !isCancelledPayable(p))
  .map((p) => payableCompetenceDate(p).date)
  .filter(Boolean)
  .map((d) => monthKey(d))
  .sort()
  .pop();

l();
l(`  última competência PRESENTE nos títulos:  ${ultimaCompetencia}`);
l(`  cobertura DECLARADA à mão em company.js:  ${coverage.payables.completeThroughMonth}`);
l();
l("  VEREDITO:");
l("   - `geradoEm` mede FRESCURA (quando o snapshot foi gerado), não cobertura.");
l("   - `parcial` mede se o REBUILD terminou, não se o mês está contabilisticamente");
l("     completo. Um rebuild completo de um mês incompleto tem parcial:false.");
l("   - a última competência presente NÃO é cobertura: é o último título que JÁ chegou.");
l("     Derivar cobertura dela reintroduziria o defeito de 2027-07 (um vencimento");
l("     futuro criava a âncora) e declararia julho completo cedo demais.");
l("   - NÃO existe hoje campo que diga 'todas as faturas deste mês já entraram'. Isso");
l("     é um facto CONTABILÍSTICO, não um facto do snapshot.");
l();
l("  => `payables.completeThroughMonth` continua manual por falta de sinal, não por");
l("     falta de código. Separar freshness / data range / accounting completeness é");
l("     possível, mas o terceiro eixo depende de uma decisão de negócio.");
l(risca("═"));
