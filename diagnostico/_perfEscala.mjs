/****************************************************************************************
 * diagnostico/_perfEscala.mjs — READ-ONLY, sem rede.
 * --------------------------------------------------------------------------------------
 * Mede o custo de buildSalesDataset em função do VOLUME e do HISTÓRICO, para responder
 * à fase 18 com números em vez de intuição:
 *
 *   - 10x pedidos / 10x recebíveis  -> o custo cresce linear ou quadraticamente?
 *   - vários anos de histórico      -> o número de MESES multiplica o trabalho?
 *
 * Os dados são sintéticos e derivados dos volumes reais de 2026-08-23
 * (1071 pedidos, 301 contas a pagar, 1390 recebíveis).
 *
 *   npx vite-node diagnostico/_perfEscala.mjs
 ****************************************************************************************/

import { buildSalesDataset } from "../src/services/blingDataService.js";
import { buildMonthlyDre } from "../src/utils/dreEngine.js";
import { classifyPayable } from "../src/utils/dreEngine.js";

const CATEGORIAS = [
  "Aluguel", "Comissão sobre vendas", "Compras de fornecedores", "Fretes e seguros",
  "Impostos sobre vendas", "Material de escritório", "Pró-labore", "Salários",
  "Serviços contábeis", "Software", "Tarifa bancária", "Sem categoria",
];

/** Gera N registos distribuídos por `meses` meses a contar para trás de 2026-08. */
function gerar(n, meses, molde) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const recuo = i % meses;
    const m = 8 - (recuo % 12);
    const ano = 2026 - Math.floor(recuo / 12);
    const mk = `${ano}-${String(m > 0 ? m : m + 12).padStart(2, "0")}`;
    const dia = String((i % 27) + 1).padStart(2, "0");
    out.push(molde(i, `${mk}-${dia}`));
  }
  return out;
}

const pedidoMolde = (i, data) => ({
  id: 100000 + i, numero: i, data, total: 500 + (i % 900),
  situacao: { id: 9, valor: 9 }, contato: { id: i % 300, nome: `Cliente ${i % 300}` },
  itens: [{ descricao: "Item", quantidade: 1, valor: 500 }], frete: i % 7,
});

const pagarMolde = (i, data) => ({
  id: 200000 + i, situacao: 2, vencimento: data, dataEmissao: data,
  valor: 100 + (i % 500), categoriaId: i % 20,
  categoriaNome: CATEGORIAS[i % CATEGORIAS.length],
  historico: `Documento ${i}`, contato: { id: i % 200, nome: `Fornecedor ${i % 200}` },
  formaPagamento: { id: 1, nome: "Pix" },
});

const receberMolde = (i, data) => ({
  id: 300000 + i, situacao: 1, vencimento: data, dataEmissao: data,
  valor: 300 + (i % 800), saldo: 0, numeroDocumento: String(i),
  categoria: { id: 1, nome: "Vendas" }, categoriaId: 1, categoriaNome: "Vendas",
  contato: { id: i % 279, nome: `Cliente ${i % 279}` },
  formaPagamento: { id: 1, nome: "Pix" },
});

function medir(rotulo, fn, repeticoes = 3) {
  fn(); // aquecimento
  let melhor = Infinity;
  for (let i = 0; i < repeticoes; i++) {
    const t0 = performance.now();
    fn();
    melhor = Math.min(melhor, performance.now() - t0);
  }
  console.log(`  ${rotulo.padEnd(52)} ${melhor.toFixed(1).padStart(9)} ms`);
  return melhor;
}

const cenarios = [
  { nome: "1x   real          ", ped: 1071, pag: 301, rec: 1390, meses: 19 },
  { nome: "2x                 ", ped: 2142, pag: 602, rec: 2780, meses: 19 },
  { nome: "5x                 ", ped: 5355, pag: 1505, rec: 6950, meses: 19 },
  { nome: "10x                ", ped: 10710, pag: 3010, rec: 13900, meses: 19 },
  { nome: "10x + 3 anos hist. ", ped: 10710, pag: 3010, rec: 13900, meses: 36 },
  { nome: "10x + 5 anos hist. ", ped: 10710, pag: 3010, rec: 13900, meses: 60 },
];

console.log("=".repeat(76));
console.log("  CUSTO DE buildSalesDataset POR ESCALA (melhor de 3, sem rede)");
console.log("=".repeat(76));
const medidas = [];
for (const c of cenarios) {
  const orders = gerar(c.ped, c.meses, pedidoMolde);
  const payables = gerar(c.pag, c.meses, pagarMolde);
  const receivables = gerar(c.rec, c.meses, receberMolde);
  const ms = medir(`${c.nome} ped=${c.ped} pag=${c.pag} rec=${c.rec} meses=${c.meses}`,
    () => buildSalesDataset({ orders, payables, receivables, manualInputsByMonth: {}, meta: {} }));
  medidas.push({ ...c, ms, n: c.ped + c.pag + c.rec });
}

console.log();
console.log("  CRESCIMENTO relativo ao cenário 1x (mesmo nº de meses):");
const base = medidas[0];
for (const m of medidas.slice(0, 4)) {
  const fatorN = m.n / base.n;
  const fatorT = m.ms / base.ms;
  const veredito = fatorT <= fatorN * 1.6 ? "linear" : (fatorT >= fatorN * fatorN * 0.6 ? "QUADRÁTICO" : "super-linear");
  console.log(`    dados ×${fatorN.toFixed(1).padStart(5)}  ->  tempo ×${fatorT.toFixed(1).padStart(5)}   ${veredito}`);
}

console.log();
console.log("  EFEITO DO HISTÓRICO (mesmo volume, mais meses):");
for (const m of medidas.slice(3)) {
  console.log(`    meses=${String(m.meses).padStart(3)}  ->  ${m.ms.toFixed(1).padStart(8)} ms   (×${(m.ms / medidas[3].ms).toFixed(2)} face a 19 meses)`);
}

/* ── Onde é que o tempo é gasto ───────────────────────────────────────────────────── */
console.log();
console.log("=".repeat(76));
console.log("  DECOMPOSIÇÃO — buildMonthlyDre isolado, 10x contas a pagar");
console.log("=".repeat(76));
const pag10 = gerar(3010, 19, pagarMolde);
const ped10 = gerar(10710, 19, pedidoMolde);
medir("buildMonthlyDre para UM mês (3010 títulos na fonte)",
  () => buildMonthlyDre({ orders: ped10, payables: pag10, monthKey: "2026-06", coverage: { closedThroughMonth: "2026-06" } }));
medir("classifyPayable × 3010 (uma passagem)",
  () => { for (const p of pag10) classifyPayable(p); });
medir("classifyPayable × 3010 × 19 meses (o que 19 DREs custam)",
  () => { for (let m = 0; m < 19; m++) for (const p of pag10) classifyPayable(p); });
console.log("=".repeat(76));
