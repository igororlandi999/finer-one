// src/config/company.js
// Configuração da empresa ativa. Enquanto o backend não a devolver, vive aqui —
// explícita e documentada, nunca embutida na lógica dos motores.

/**
 * Moeda e locale de apresentação. NÃO há conversão de valores em lado nenhum:
 * os montantes são os da fonte; só muda a formatação.
 *   Overcel (Brasil)          -> BRL / pt-BR
 *   Empresas portuguesas      -> EUR / pt-PT
 */
export const ACTIVE_COMPANY = {
  id: "overcel",
  name: "Overcel",
  currency: "BRL",
  locale: "pt-BR",

  /**
   * Cobertura histórica do snapshot de pedidos. Determina se um mês é real,
   * parcial ou indisponível — em vez de fingir que meses incompletos são reais.
   *
   * Estado atual (validado na Fase 1, com o rebuild de 812 pedidos):
   *   jan/fev 2026 -> sem cobertura (o snapshot não alcança esses meses)
   *   mar 2026     -> cobertura parcial
   *   abr 2026 ->   -> cobertura completa (receitas reconciliadas com a DRE manual)
   *
   * Atualizar quando o histórico for alargado. Idealmente passará a derivar de
   * metadados do próprio snapshot (meta.periodoAtualizado / primeiro pedido).
   */
  historyCoverage: {
    firstCompleteMonth: "2026-04",
    partialMonths: ["2026-03"],
    // Último mês FECHADO. Meses posteriores (incluindo o mês civil corrente,
    // ainda aberto) são apresentados como parciais. Atualizar ao fechar o mês;
    // deixar a null faz o motor assumir que só o mês anterior ao atual está fechado.
    closedThroughMonth: "2026-06",

    // Opcional: cobertura própria das CONTAS A PAGAR. Pedidos e contas a pagar
    // vêm de snapshots distintos, com cadências de rebuild próprias — se um dos
    // lados fechar antes do outro, declarar aqui (os campos omitidos são
    // herdados da cobertura acima). Hoje ambos partilham a mesma cobertura.
    // payables: { closedThroughMonth: "2026-05" },
  },
};

/** Perfil para empresas portuguesas (usado quando o multiempresa existir). */
export const PT_COMPANY_DEFAULTS = {
  currency: "EUR",
  locale: "pt-PT",
};