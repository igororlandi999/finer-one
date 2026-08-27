/****************************************************************************************
 * diagnostico/mesDre.mjs — READ-ONLY (Finer One) — Microfase 5B
 * --------------------------------------------------------------------------------------
 * OBJECTIVO
 *   Descobrir POR QUE o mês actual da DRE está com `classificacaoIncompleta: true`.
 *
 *   Usa o classifyPayable REAL, importado de src/utils/dreEngine.js. Não existe aqui
 *   nenhuma cópia, aproximação ou reimplementação de qualquer regra de negócio: o mês
 *   é escolhido pelos mesmos helpers que o blingDataService usa, a competência sai de
 *   payableCompetenceDate, o cancelamento de isCancelledPayable e a classificação de
 *   classifyPayable. Se o motor mudar, este diagnóstico muda com ele.
 *
 * GARANTIA DE READ-ONLY
 *   - Não escreve nenhum ficheiro (zero writeFile / mkdir / rename).
 *   - Não faz rede.
 *   - Não altera src/, Apps Script, testes, configuração ou build.
 *   - Não muta os objectos lidos do snapshot.
 *   - Vive fora de src/ e não é um ficheiro de teste: `npm test` não o apanha.
 *
 * ENTRADA
 *   O snapshot de contas a pagar exportado do Drive (finer_one_despesas_snapshot.json).
 *   Aceita { data: [...] } ou [...] directamente.
 *
 * COMO CORRER (a partir da raiz do projecto)
 *   node diagnostico/mesDre.mjs diagnostico/despesas_snapshot.json
 *   # se o Node reclamar de ESM/import.meta:
 *   npx vite-node diagnostico/mesDre.mjs diagnostico/despesas_snapshot.json
 ****************************************************************************************/

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyPayable,
  payableCompetenceDate,
  isCancelledPayable,
  availableDreMonths,
  payablesCoverage,
  buildMonthlyDre,
  DRE_GROUPS,
} from "../src/utils/dreEngine.js";

import { latestUsableFinancialMonth } from "../src/utils/financialMetrics.js";

import { monthKey } from "../src/utils/financialCalculations.js";

/* ------------------------------------------------------------------------------------
 * Cobertura: a MESMA da empresa activa. Se o módulo de configuração não carregar neste
 * runtime, o diagnóstico PÁRA — em vez de assumir uma cobertura inventada, que faria o
 * mês escolhido divergir silenciosamente do que a aplicação usa.
 * ---------------------------------------------------------------------------------- */
let ACTIVE_COMPANY = null;
try {
  ({ ACTIVE_COMPANY } = await import("../src/config/company.js"));
} catch (e) {
  console.error("ERRO: não foi possível importar src/config/company.js.");
  console.error("      Corra com `npx vite-node` em vez de `node`.");
  console.error("      Detalhe:", e && e.message ? e.message : e);
  process.exit(1);
}

/* ------------------------------------------------------------------------------------
 * Helpers de apresentação (não são regra de negócio).
 * ---------------------------------------------------------------------------------- */
const SEP = " | ";
const money = (n) => (Number(n) || 0).toFixed(2);
const dash = (v) => (v === null || v === undefined || v === "" ? "-" : String(v));
const line = (s = "") => console.log(s);
const rule = (t) => {
  line("");
  line("=".repeat(78));
  if (t) line(t);
  if (t) line("=".repeat(78));
};

/* Rótulo legível do grupo devolvido por classifyPayable. Puro mapeamento de exibição. */
const GROUP_LABEL = {
  [DRE_GROUPS.COMISSOES]: "COMISSOES (dedução)",
  [DRE_GROUPS.DEVOLUCOES]: "DEVOLUCOES (dedução)",
  [DRE_GROUPS.IMPOSTOS]: "IMPOSTOS (dedução)",
  [DRE_GROUPS.PESSOAL]: "PESSOAL (opex)",
  [DRE_GROUPS.FIXAS]: "FIXAS (opex)",
  [DRE_GROUPS.ADMINISTRATIVAS]: "ADMINISTRATIVAS (opex)",
  [DRE_GROUPS.RETIRADAS]: "RETIRADAS (pós-EBITDA)",
  [DRE_GROUPS.COMPRAS_ESTOQUE]: "COMPRAS_ESTOQUE (excluído de propósito)",
  [DRE_GROUPS.FRETE_PAGO]: "FRETE_PAGO (excluído de propósito)",
  [DRE_GROUPS.NAO_CLASSIFICADO]: "NAO_CLASSIFICADO",
};
const OPEX_GROUPS = new Set([DRE_GROUPS.PESSOAL, DRE_GROUPS.FIXAS, DRE_GROUPS.ADMINISTRATIVAS]);

/* ------------------------------------------------------------------------------------
 * Carregamento do snapshot.
 * ---------------------------------------------------------------------------------- */
const argPath = process.argv[2] || "diagnostico/despesas_snapshot.json";
const abs = path.resolve(process.cwd(), argPath);

let bruto;
try {
  bruto = JSON.parse(readFileSync(abs, "utf8"));
} catch (e) {
  console.error(`ERRO: não foi possível ler o snapshot em ${abs}`);
  console.error("      Exporte finer_one_despesas_snapshot.json do Drive e indique o caminho.");
  console.error("      Detalhe:", e && e.message ? e.message : e);
  process.exit(1);
}

const payables = Array.isArray(bruto) ? bruto : (bruto && bruto.data) || [];
const meta = (bruto && bruto.meta) || null;

rule("DIAGNÓSTICO 5B — mês da DRE e origem de classificacaoIncompleta");
line("READ-ONLY. Não escreve, não faz rede, não altera produção.");
line("classifyPayable importado de src/utils/dreEngine.js (implementação única).");
line("");
line(`snapshot            : ${abs}`);
line(`títulos             : ${payables.length}`);
if (meta) {
  line(`meta                : gerado ${meta.geradoEm} | parcial ${meta.parcial}`);
  if (meta.parcial) line("ATENÇÃO: snapshot PARCIAL — o inventário abaixo está incompleto.");
}

/* ------------------------------------------------------------------------------------
 * 1) QUAL É O MÊS. Reproduz exactamente a escolha do blingDataService:
 *    payablesCoverage(coverage) -> latestUsableFinancialMonth (fechado)
 *    -> se nenhum fechado, o último parcial.
 * ---------------------------------------------------------------------------------- */
const coverage = ACTIVE_COMPANY.historyCoverage;
const covPayables = payablesCoverage(coverage);

const mesFechado = latestUsableFinancialMonth({ payables, coverage: covPayables });
const mesPayables =
  mesFechado ||
  latestUsableFinancialMonth({ payables, coverage: covPayables, allowPartial: true });

rule("1) MÊS ÂNCORA DAS CONTAS A PAGAR");
line(`coverage.firstCompleteMonth : ${dash(covPayables.firstCompleteMonth)}`);
line(`coverage.closedThroughMonth : ${dash(covPayables.closedThroughMonth)}`);
line(`coverage.partialMonths      : ${(covPayables.partialMonths || []).join(",") || "-"}`);
line(`mês fechado escolhido       : ${dash(mesFechado)}`);
line(`mês efectivamente usado     : ${dash(mesPayables)}${mesFechado ? "" : "  (PARCIAL — não há mês fechado)"}`);

if (!mesPayables) {
  line("");
  line("Sem mês utilizável. Nada mais a analisar.");
  process.exit(0);
}

/* ------------------------------------------------------------------------------------
 * 2) PANORAMA POR MÊS. Responde a "é mesmo este o mês?" e a "junho ainda é relevante?".
 *    Um título por mês de competência, pela regra do motor.
 * ---------------------------------------------------------------------------------- */
const vivos = payables.filter((p) => !isCancelledPayable(p));
const classificados = vivos.map((p) => {
  const comp = payableCompetenceDate(p);
  const { group } = classifyPayable(p);
  return {
    payable: p,
    group,
    mk: comp.date ? monthKey(comp.date) : null,
    dateField: comp.field,
    fallback: comp.fallback,
    valor: Number(p.valor) || 0,
  };
});

const meses = availableDreMonths({ orders: [], payables });

rule("2) PANORAMA POR MÊS (todos os meses presentes na fonte)");
line(["mês", "títulos", "valor", "naoClass_qtd", "naoClass_valor", "semCategoria_qtd", "flag"].join(SEP));

for (const mk of meses) {
  const doMes = classificados.filter((c) => c.mk === mk);
  const nc = doMes.filter((c) => c.group === DRE_GROUPS.NAO_CLASSIFICADO);
  const sc = nc.filter((c) => Number(c.payable.categoriaId) === 0 || c.payable.categoriaId == null);
  line(
    [
      mk,
      doMes.length,
      money(doMes.reduce((a, c) => a + c.valor, 0)),
      nc.length,
      money(nc.reduce((a, c) => a + c.valor, 0)),
      sc.length,
      nc.length ? "classificacaoIncompleta" : "-",
    ].join(SEP)
  );
}

const semMes = classificados.filter((c) => !c.mk);
if (semMes.length) {
  line("");
  line(`ATENÇÃO: ${semMes.length} título(s) sem qualquer data de competência — ficam fora`);
  line("de TODOS os meses e não geram warning (defeito H da auditoria).");
  line(`valor fora da DRE por esta via: ${money(semMes.reduce((a, c) => a + c.valor, 0))}`);
}

/* ------------------------------------------------------------------------------------
 * 3) O MÊS ANALISADO, agrupado por categoria e com a classificação real.
 * ---------------------------------------------------------------------------------- */
const doMes = classificados.filter((c) => c.mk === mesPayables);

const porCategoria = new Map();
for (const c of doMes) {
  const id = c.payable.categoriaId;
  const chave = id === null || id === undefined ? "ausente" : String(Number(id));
  if (!porCategoria.has(chave)) {
    porCategoria.set(chave, {
      categoriaId: chave,
      categoriaNome: c.payable.categoriaNome || null,
      grupos: new Map(),
      qtd: 0,
      valor: 0,
    });
  }
  const g = porCategoria.get(chave);
  if (!g.categoriaNome && c.payable.categoriaNome) g.categoriaNome = c.payable.categoriaNome;
  g.qtd += 1;
  g.valor += c.valor;
  g.grupos.set(c.group, (g.grupos.get(c.group) || 0) + 1);
}

const linhas = [...porCategoria.values()].sort((a, b) => b.valor - a.valor);
const ehSemCategoriaErp = (l) => l.categoriaId === "0" || l.categoriaId === "ausente";
const ehNaoClass = (l) => l.grupos.has(DRE_GROUPS.NAO_CLASSIFICADO);

const bucket1 = linhas.filter((l) => !ehNaoClass(l));
const bucket2 = linhas.filter((l) => ehNaoClass(l) && !ehSemCategoriaErp(l));
const bucket3 = linhas.filter((l) => ehNaoClass(l) && ehSemCategoriaErp(l));

const imprimirBucket = (titulo, arr) => {
  line("");
  line(`--- ${titulo} (${arr.length} categoria(s)) ---`);
  if (!arr.length) {
    line("(nenhuma)");
    return;
  }
  line(["categoriaId", "categoriaNome", "qtd", "valor", "classifyPayable"].join(SEP));
  for (const l of arr) {
    const grupos = [...l.grupos.entries()]
      .map(([g, n]) => `${GROUP_LABEL[g] || g}${l.grupos.size > 1 ? `×${n}` : ""}`)
      .join(" + ");
    line([l.categoriaId, dash(l.categoriaNome), l.qtd, money(l.valor), grupos].join(SEP));
  }
  line(`subtotal: ${arr.reduce((a, l) => a + l.qtd, 0)} título(s) | ${money(arr.reduce((a, l) => a + l.valor, 0))}`);
};

rule(`3) MÊS ${mesPayables} — TÍTULOS POR CATEGORIA (cancelados já excluídos)`);
line(`títulos no mês: ${doMes.length} | valor: ${money(doMes.reduce((a, c) => a + c.valor, 0))}`);
imprimirBucket("1. CLASSIFICADOS", bucket1);
imprimirBucket("2. NAO_CLASSIFICADO com categoriaId > 0", bucket2);
imprimirBucket("3. SEM CATEGORIA NO ERP (categoriaId = 0 ou ausente)", bucket3);

/* ------------------------------------------------------------------------------------
 * 4) OS TÍTULOS NÃO CLASSIFICADOS, UM A UM.
 *    Sem fornecedor e sem número de documento, por pedido explícito.
 * ---------------------------------------------------------------------------------- */
const naoClass = doMes
  .filter((c) => c.group === DRE_GROUPS.NAO_CLASSIFICADO)
  .sort((a, b) => b.valor - a.valor);

rule(`4) TÍTULOS NÃO CLASSIFICADOS DE ${mesPayables}, INDIVIDUALMENTE`);
if (!naoClass.length) {
  line("Nenhum. Este mês NÃO tem classificacaoIncompleta.");
} else {
  line(["id", "categoriaId", "categoriaNome", "valor", "dataCompetencia", "campoOrigem"].join(SEP));
  for (const c of naoClass) {
    line(
      [
        dash(c.payable.id),
        dash(c.payable.categoriaId),
        dash(c.payable.categoriaNome),
        money(c.valor),
        dash(c.payable[c.dateField]),
        `${dash(c.dateField)}${c.fallback ? " (FALLBACK)" : ""}`,
      ].join(SEP)
    );
  }
}

/* ------------------------------------------------------------------------------------
 * 5) IMPACTO. O motor real, no mês real. Sem manualInputs: o CMV é manual e não faz
 *    parte desta pergunta. As linhas que dele dependem sairão null — é o esperado.
 * ---------------------------------------------------------------------------------- */
const dre = buildMonthlyDre({
  orders: null,
  payables,
  monthKey: mesPayables,
  coverage,
  referenceDate: new Date(),
});

const valorNaoClass = naoClass.reduce((a, c) => a + c.valor, 0);
const opex = dre.despesasOperacionais;

rule(`5) IMPACTO EM ${mesPayables}`);
line(`pessoal                       : ${dash(dre.pessoal === null ? null : money(dre.pessoal))}`);
line(`fixas                         : ${dash(dre.fixas === null ? null : money(dre.fixas))}`);
line(`administrativas               : ${dash(dre.administrativas === null ? null : money(dre.administrativas))}`);
line(`despesasOperacionais          : ${dash(opex === null ? null : money(opex))}`);
line(`availability.despesasOperacionais : ${dre.availability.despesasOperacionais}`);
line(`availability.coberturaPayables    : ${dre.availability.coberturaPayables}`);
line(`retiradasSocios               : ${dash(dre.retiradasSocios === null ? null : money(dre.retiradasSocios))}`);
line("");
line(`valor NÃO CLASSIFICADO no mês  : ${money(valorNaoClass)}`);
if (opex !== null && opex > 0) {
  line(`  em % da OPEX conhecida       : ${((valorNaoClass / opex) * 100).toFixed(2)}%`);
}
line("");
line("LIMITE SUPERIOR DO ERRO (não é uma estimativa — é o pior caso):");
line("  se TODOS os não classificados fossem despesa operacional,");
line(`  OPEX   estaria entre ${money(opex)} e ${money((opex || 0) + valorNaoClass)}`);
line(`  EBITDA estaria sobreavaliado em, no máximo, ${money(valorNaoClass)}`);
line("  se forem compras/estoque ou transferências, o impacto real em OPEX é ZERO");
line("  e só a marca `partial` está a mais. A natureza real é desconhecida por design.");

line("");
line("--- warnings do motor neste mês ---");
for (const w of dre.warnings) line(`  [${w.code}] ${w.message}`);

/* ------------------------------------------------------------------------------------
 * 6) RESPOSTA DIRECTA
 * ---------------------------------------------------------------------------------- */
const comCategoriaReal = naoClass.filter((c) => Number(c.payable.categoriaId) > 0);
const semCategoriaErp = naoClass.filter(
  (c) => c.payable.categoriaId == null || Number(c.payable.categoriaId) === 0
);

rule("6) RESPOSTA DIRECTA");
line(`1. mês que causa classificacaoIncompleta : ${naoClass.length ? mesPayables : "nenhum"}`);
line(`2. títulos não classificados nesse mês    : ${naoClass.length}`);
line(`3. valor                                  : ${money(valorNaoClass)}`);
line(`4. destes, com categoria real (id > 0)    : ${comCategoriaReal.length} | ${money(comCategoriaReal.reduce((a, c) => a + c.valor, 0))}`);
line(`   destes, sem categoria no ERP (id = 0)  : ${semCategoriaErp.length} | ${money(semCategoriaErp.reduce((a, c) => a + c.valor, 0))}`);
line(`5. limite superior do erro no EBITDA      : ${money(valorNaoClass)}`);
line(`7. warning é material?                    : ver rácio acima contra a OPEX conhecida`);
line("");
line("Nada foi alterado. Diagnóstico apenas.");
