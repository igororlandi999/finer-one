// src/utils/diagnosticsEngine.js
// Diagnósticos derivados de vendas. Criado nesta etapa como parte da camada de
// dados, mas NÃO ligado à tela Diagnóstico Financeiro (essa depende de despesas
// e fica intacta). Pronto a ser consumido numa etapa futura.

import {
  totalRevenue,
  averageTicket,
  monthOverMonthGrowth,
  clientConcentration,
  topClients,
} from "./financialCalculations.js";

function finding(id, status, label, message) {
  // status: 'positivo' | 'atencao' | 'risco' | 'neutro'
  return { id, status, label, message };
}

export function buildSalesDiagnostics(orders) {
  const items = [];

  const growth = monthOverMonthGrowth(orders);
  if (growth !== null) {
    if (growth >= 5) {
      items.push(finding("crescimento", "positivo", "Crescimento de vendas",
        `A faturação subiu ${growth}% face ao mês anterior.`));
    } else if (growth <= -10) {
      items.push(finding("crescimento", "risco", "Quebra de vendas",
        `A faturação caiu ${Math.abs(growth)}% face ao mês anterior.`));
    } else if (growth < 0) {
      items.push(finding("crescimento", "atencao", "Vendas em desaceleração",
        `A faturação recuou ${Math.abs(growth)}% face ao mês anterior.`));
    }
  }

  const conc = clientConcentration(orders);
  const top = topClients(orders, 1)[0];
  if (top && conc >= 40) {
    items.push(finding("concentracao", "risco", "Dependência de cliente",
      `${conc}% da faturação vem de ${top.name}.`));
  } else if (top && conc >= 25) {
    items.push(finding("concentracao", "atencao", "Concentração de clientes",
      `${conc}% da faturação vem de ${top.name}.`));
  } else if (top) {
    items.push(finding("concentracao", "positivo", "Carteira diversificada",
      `Nenhum cliente ultrapassa ${conc}% da faturação.`));
  }

  const ticket = averageTicket(orders);
  if (ticket > 0) {
    items.push(finding("ticket", "neutro", "Ticket médio",
      `Valor médio por pedido: ${ticket.toFixed(2)} €.`));
  }

  return {
    generatedAt: new Date().toISOString(),
    revenue: totalRevenue(orders),
    growth,
    concentration: conc,
    sentiment: sentimentOf(items),
    items,
  };
}

function sentimentOf(items) {
  if (items.some((i) => i.status === "risco")) return "risco";
  if (items.some((i) => i.status === "atencao")) return "atencao";
  if (items.some((i) => i.status === "positivo")) return "positivo";
  return "neutro";
}
