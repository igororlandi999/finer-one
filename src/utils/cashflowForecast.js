// src/utils/cashflowForecast.js
// Projeção de tesouraria (variação líquida prevista) a partir dos títulos abertos
// reais em sales.recebiveis.openInvoices (entradas) e sales.fornecedores.openInvoices
// (saídas). Sem React, sem saldo bancário inventado.
//
// IMPORTANTE — base zero: o projeto ainda NÃO tem saldo bancário real. Por isso a
// série acumula a VARIAÇÃO LÍQUIDA (entradas − saídas) a partir de zero, e o rótulo
// deve deixar isto explícito na UI ("Variação líquida prevista"). Não é "saldo futuro".
//
// Vencidos (diasAtraso > 0) entram no dia atual como pendente acumulado — não são
// redistribuídos por datas futuras. Só openInvoices (títulos abertos) é usado.
//
// vencimento vem como string dd/mm/aaaa (formatPtDate do serviço). Parse por
// componentes para ser seguro a timezone (evita new Date("dd/mm/yyyy")).

import { round2, MONTHS_PT } from "./financialCalculations.js";

// Converte "dd/mm/aaaa" numa Date local à meia-noite. Devolve null se inválida.
// Exportada para reutilização (alertas) e teste direto.
export function parsePtDate(s) {
  if (s == null) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(yyyy, mm - 1, dd);
  // rejeita datas "normalizadas" (ex.: 31/02 -> 03/03)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function daysBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function labelFor(date) {
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS_PT[date.getMonth()]}`;
}

// Aloca um conjunto de openInvoices num mapa offset(dias a partir de hoje) -> soma.
// Vencidos (diasAtraso > 0) e qualquer vencimento <= hoje caem no offset 0.
function allocate(invoices, today, dias, acc) {
  for (const inv of invoices || []) {
    const valor = Number(inv && inv.valor) || 0;
    if (valor <= 0) continue;

    let offset;
    if (Number(inv.diasAtraso) > 0) {
      offset = 0; // vencido: pendente acumulado no dia atual
    } else {
      const d = parsePtDate(inv.vencimento);
      if (!d) continue; // data inválida: não inventa, ignora o título
      offset = daysBetween(today, d);
      if (offset < 0) offset = 0; // vencimento já passado sem diasAtraso: trata como hoje
    }
    if (offset > dias) continue; // fora da janela
    acc[offset] = round2((acc[offset] || 0) + valor);
  }
}

/**
 * Projeção de variação líquida prevista para os próximos `dias`.
 * @param {{recebiveis: object|null, fornecedores: object|null, dias?: number}} args
 * @returns {{
 *   serie: Array<{dia:string, entradas:number, saidas:number, liquidoDia:number, saldo:number}>,
 *   totalEntradas:number, totalSaidas:number, variacaoLiquida:number, temDados:boolean, dias:number
 * }}
 * saldo = variação líquida ACUMULADA desde hoje (base zero), não saldo bancário.
 */
export function buildCashflowForecast({ recebiveis, fornecedores, dias = 30 } = {}) {
  const janela = dias === 60 ? 60 : 30;
  const today = startOfToday();

  const entradasAcc = {};
  const saidasAcc = {};
  const recebOpen = recebiveis && (recebiveis.allOpenInvoices ?? recebiveis.openInvoices);
  const fornOpen = fornecedores && (fornecedores.allOpenInvoices ?? fornecedores.openInvoices);
  allocate(recebOpen, today, janela, entradasAcc);
  allocate(fornOpen, today, janela, saidasAcc);

  // Série diária contínua (0..janela) para continuidade visual do gráfico.
  const serie = [];
  let saldo = 0, totalEntradas = 0, totalSaidas = 0;
  for (let off = 0; off <= janela; off++) {
    const entradas = round2(entradasAcc[off] || 0);
    const saidas = round2(saidasAcc[off] || 0);
    const liquidoDia = round2(entradas - saidas);
    saldo = round2(saldo + liquidoDia);
    totalEntradas = round2(totalEntradas + entradas);
    totalSaidas = round2(totalSaidas + saidas);

    const date = new Date(today);
    date.setDate(date.getDate() + off);
    serie.push({
      dia: off === 0 ? "Hoje" : labelFor(date),
      entradas, saidas, liquidoDia, saldo,
    });
  }

  return {
    serie,
    totalEntradas,
    totalSaidas,
    variacaoLiquida: round2(totalEntradas - totalSaidas),
    temDados: totalEntradas > 0 || totalSaidas > 0,
    dias: janela,
  };
}

/** Há alguma fonte real para o cashflow? (decide dados reais vs mock+Demo no JSX) */
export function hasCashflowSource({ recebiveis, fornecedores } = {}) {
  return !!recebiveis || !!fornecedores;
}