#!/usr/bin/env node
/* READ-ONLY. Corre classifyPayable sobre TODO o dataset real e reporta:
 *   - distribuição por grupo da DRE
 *   - não classificados por mês (quantidade e valor)
 *   - top categorias/históricos não classificados
 * Uso: node diagnostico/_classificacaoAudit.mjs <dir-snapshots> [mes]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyPayable, isCancelledPayable, DRE_GROUPS } from "../src/utils/dreEngine.js";

const DIR = process.argv[2];
const MES_FILTRO = process.argv[3] || null;
const desp = JSON.parse(readFileSync(join(DIR, "despesas.json"), "utf8")).data;

const mesDe = (p) => {
  const d = p.dataEmissao || p.vencimento;
  return d ? String(d).slice(0, 7) : "sem-data";
};

const porGrupo = {};
const naoClass = [];
let cancelados = 0;

for (const p of desp) {
  if (isCancelledPayable(p)) { cancelados++; continue; }
  const { group } = classifyPayable(p);
  const m = mesDe(p);
  porGrupo[group] = porGrupo[group] || { n: 0, valor: 0 };
  porGrupo[group].n++;
  porGrupo[group].valor += Number(p.valor) || 0;
  if (group === DRE_GROUPS.NAO_CLASSIFICADO) naoClass.push({ ...p, _mes: m });
}

const eur = (v) => v.toFixed(2).padStart(12);
console.log("=== DISTRIBUIÇÃO POR GRUPO DA DRE (títulos não cancelados) ===");
console.log("cancelados excluídos:", cancelados, "| analisados:", desp.length - cancelados);
for (const [g, v] of Object.entries(porGrupo).sort((a, b) => b[1].valor - a[1].valor)) {
  console.log(String(g).padEnd(18), String(v.n).padStart(5), eur(v.valor));
}

console.log("\n=== NÃO CLASSIFICADOS POR MÊS ===");
const porMes = {};
for (const p of naoClass) {
  porMes[p._mes] = porMes[p._mes] || { n: 0, valor: 0 };
  porMes[p._mes].n++;
  porMes[p._mes].valor += Number(p.valor) || 0;
}
for (const [m, v] of Object.entries(porMes).sort()) {
  console.log(m.padEnd(10), String(v.n).padStart(4), eur(v.valor));
}

console.log("\n=== TOP CATEGORIAS NÃO CLASSIFICADAS ===");
const porCat = {};
for (const p of naoClass) {
  const k = p.categoriaNome || "(null)";
  porCat[k] = porCat[k] || { n: 0, valor: 0 };
  porCat[k].n++;
  porCat[k].valor += Number(p.valor) || 0;
}
for (const [k, v] of Object.entries(porCat).sort((a, b) => b[1].valor - a[1].valor)) {
  console.log(String(k).padEnd(34), String(v.n).padStart(4), eur(v.valor));
}

if (MES_FILTRO) {
  console.log(`\n=== DETALHE DOS NÃO CLASSIFICADOS DE ${MES_FILTRO} ===`);
  const doMes = naoClass.filter((p) => p._mes === MES_FILTRO);
  for (const p of doMes) {
    console.log("---");
    console.log("  id            :", p.id);
    console.log("  situacao      :", JSON.stringify(p.situacao));
    console.log("  dataEmissao   :", p.dataEmissao, "| vencimento:", p.vencimento, "| vencOriginal:", p.vencimentoOriginal);
    console.log("  valor         :", p.valor, "| saldo:", p.saldo);
    console.log("  categoriaId   :", p.categoriaId, "| categoriaNome:", JSON.stringify(p.categoriaNome));
    console.log("  historico     :", JSON.stringify(p.historico));
    console.log("  numeroDocumento:", JSON.stringify(p.numeroDocumento));
    console.log("  contato       :", JSON.stringify(p.contato));
    console.log("  formaPagamento:", JSON.stringify(p.formaPagamento));
    console.log("  campos presentes:", Object.keys(p).filter((k) => p[k] !== null && p[k] !== undefined && k[0] !== "_").join(", "));
  }
  console.log("\n  TOTAL do mês não classificado:", doMes.reduce((s, p) => s + (Number(p.valor) || 0), 0).toFixed(2));
}
