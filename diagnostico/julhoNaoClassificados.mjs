/****************************************************************************************
 * diagnostico/julhoNaoClassificados.mjs — READ-ONLY (Finer One) — auditoria P0.1
 * --------------------------------------------------------------------------------------
 * OBJETIVO
 *   Identificar os títulos de julho/2026 que `classifyPayable` devolve como
 *   NAO_CLASSIFICADO, e responder se são um problema de NORMALIZAÇÃO (o dado existe mas
 *   não é reconhecido) ou de DADO INCOMPLETO na origem (não há categoria no Bling).
 *
 *   Usa o `classifyPayable` REAL. Nenhuma regra é reimplementada e nenhuma categoria é
 *   atribuída: o diagnóstico observa, não decide.
 *
 * SANITIZAÇÃO
 *   NÃO imprime nomes de fornecedores nem documentos. Os IDs são impressos porque são
 *   a única forma de o utilizador localizar o título no Bling, e não identificam pessoas.
 *
 * GARANTIA DE READ-ONLY
 *   - Só faz GET. Não escreve ficheiro nenhum. Não altera src/, config nem Apps Script.
 *
 * COMO CORRER
 *   npx vite-node diagnostico/julhoNaoClassificados.mjs
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import {
  classifyPayable, payableCompetenceDate, payableCompetenceMonth,
  isCancelledPayable, buildMonthlyDre, DRE_GROUPS,
} from "../src/utils/dreEngine.js";
import { normalizePayable, normalizeOrder } from "../src/services/blingDataService.js";
import { ACTIVE_COMPANY } from "../src/config/company.js";

const MES = "2026-07";

const BASE = readFileSync(".env", "utf8")
  .split(/\r?\n/).find((l) => l.trim().startsWith("VITE_API_BASE_URL="))
  .split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");

const get = async (params) => {
  const url = new URL(`${BASE}/pedidos/vendas`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return (await fetch(url, { headers: { Accept: "application/json" } })).json();
};

const val = (n) => (typeof n === "number"
  ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : String(n));
const l = (s = "") => console.log(s);
const risca = (c) => c.repeat(86);

const [rawPed, rawDesp] = await Promise.all([get(null), get({ recurso: "despesas" })]);
const orders = (rawPed?.data ?? []).map(normalizeOrder);
const brutos = rawDesp?.data ?? [];
const payables = brutos.map(normalizePayable);

l(risca("="));
l("  TITULOS DE JULHO/2026 SEM CATEGORIA RECONHECIDA");
l(risca("="));
l(`  contas a pagar na fonte: ${payables.length}`);

/* ── Universo do mês ──────────────────────────────────────────────────────────────── */

const doMes = payables.filter((p) => !isCancelledPayable(p) && payableCompetenceMonth(p) === MES);
l(`  títulos de ${MES} (não cancelados): ${doMes.length}`);

const porGrupo = {};
for (const p of doMes) {
  const { group } = classifyPayable(p);
  (porGrupo[group] ??= []).push(p);
}
l("");
l("  distribuição por grupo da DRE:");
for (const [g, lista] of Object.entries(porGrupo).sort()) {
  const soma = lista.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  l(`    ${String(g).padEnd(22)} ${String(lista.length).padStart(3)} título(s)   ${val(soma).padStart(14)}`);
}

/* ── Os não classificados ─────────────────────────────────────────────────────────── */

const naoClass = porGrupo[DRE_GROUPS.NAO_CLASSIFICADO] ?? [];
l("");
l(risca("-"));
l(`  DETALHE DOS ${naoClass.length} NAO CLASSIFICADOS`);
l(risca("-"));

if (!naoClass.length) {
  l("  (nenhum)");
} else {
  for (const p of naoClass) {
    const comp = payableCompetenceDate(p);
    // Procura o registo BRUTO para ver o que o backend entregou, antes da normalização.
    const bruto = brutos.find((b) => b.id === p.id) ?? {};
    l("");
    l(`  id ${p.id}`);
    l(`    valor            : ${val(Number(p.valor) || 0)}`);
    l(`    competência      : ${comp.date} (campo: ${comp.field}${comp.fallback ? ", FALLBACK" : ""})`);
    l(`    situacao         : ${p.situacao}`);
    l(`    categoriaId      : ${bruto.categoriaId ?? "(ausente)"}`);
    l(`    categoriaNome    : ${JSON.stringify(p.categoriaNome ?? bruto.categoriaNome ?? null)}`);
    l(`    historico        : ${JSON.stringify(p.historico ?? bruto.historico ?? null)}`);
    l(`    numeroDocumento  : ${JSON.stringify(bruto.numeroDocumento ?? null)}`);
    // Veredito sobre a NATUREZA da falha, sem propor categoria.
    const temCat = !!(p.categoriaNome && String(p.categoriaNome).trim());
    const temHist = !!(p.historico && String(p.historico).trim());
    l(`    -> natureza      : ${temCat
      ? "categoria PRESENTE mas não reconhecida pelas regras (problema de regra/normalização)"
      : temHist
        ? "SEM categoria; há histórico (dado incompleto na origem, com pista)"
        : "SEM categoria e SEM histórico (dado incompleto na origem, sem pista)"}`);
  }
}

/* ── Impacto ──────────────────────────────────────────────────────────────────────── */

const somaNaoClass = naoClass.reduce((s, p) => s + (Number(p.valor) || 0), 0);
const cov = ACTIVE_COMPANY.historyCoverage;
const dre = buildMonthlyDre({ orders, payables, monthKey: MES, coverage: { ...cov, closedThroughMonth: "2026-07" } });

l("");
l(risca("-"));
l("  IMPACTO");
l(risca("-"));
l(`  valor total fora da DRE      : ${val(somaNaoClass)}`);
l(`  despesas operacionais do mês : ${val(dre.despesasOperacionais)}`);
l(`  peso relativo                : ${dre.despesasOperacionais ? ((somaNaoClass / dre.despesasOperacionais) * 100).toFixed(1) + "%" : "n/d"}`);
l("");
l(`  availability.despesasOperacionais : ${dre.availability.despesasOperacionais}`);
l(`  availability.coberturaPayables    : ${dre.availability.coberturaPayables}   <- eixo TEMPORAL`);
l(`  availability.ebitda               : ${dre.availability.ebitda}`);
l(`  availability.resultadoLiquido     : ${dre.availability.resultadoLiquido}`);
l("");
l("  Leitura: `coberturaPayables` é o eixo temporal e `despesasOperacionais` combina-o");
l("  com a completude da classificação. São eixos distintos de propósito — um mês pode");
l("  estar FECHADO no tempo e mesmo assim ter classificação incompleta.");
l(risca("="));
