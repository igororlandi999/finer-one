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

    /* ── EIXO 1: COBERTURA DA FONTE (técnico) ─────────────────────────────────────
     * Até que mês é que o ERP já entregou TUDO o que o mês teve.
     *
     * `null` = deriva do relógio: o último mês civil TERMINADO. Para os PEDIDOS isto
     * é o valor correto e não precisa de manutenção — um pedido nasce no ato da
     * venda, pelo que um mês civil terminado tem os seus pedidos todos no snapshot.
     *
     * `null` só é seguro porque, em 24/08/2026, se corrigiram DUAS coisas ao mesmo
     * tempo (ver docs/MONTHLY_CLOSING_CONTRACT.md):
     *   1. `buildSalesDataset` passou a injetar `referenceDate` — sem ela não há
     *      relógio de onde derivar o mês anterior;
     *   2. `sourceAvailability` passou a devolver `partial` quando não consegue
     *      determinar limite nenhum, em vez de libertar todos os meses como `real`.
     * Antes destas duas, `null` aqui fazia a âncora da DRE saltar para 2027-07.
     */
    completeThroughMonth: null,

    /* ── EIXO 2: VALIDAÇÃO HUMANA (contabilístico) ────────────────────────────────
     * Até que mês é que uma pessoa reviu e validou o fecho. NÃO afeta a
     * disponibilidade das fontes e NÃO impede a plataforma de pedir dados em falta.
     *
     * Era exatamente esta a confusão de `closedThroughMonth`: ao mantê-lo em
     * "2026-06" (validação em atraso), julho — um mês civil terminado, com todos os
     * pedidos no snapshot — aparecia como `partial`. Isso tornava a aplicabilidade
     * do CMV indeterminada e a Finer One deixava de PEDIR o CMV de julho. Só editar
     * este ficheiro quebrava o ciclo, e é isso que deixou de ser preciso.
     *
     * Informativo enquanto não existir uma ação de "validar mês" no produto. Não é
     * lido por nenhum motor — quem o quiser mostrar, lê-o daqui explicitamente.
     */
    validatedThroughMonth: "2026-06",

    /* ── Cobertura própria das CONTAS A PAGAR ─────────────────────────────────────
     * Pedidos e contas a pagar vêm de snapshots distintos e, mais importante, com
     * naturezas distintas: um pedido nasce no ato da venda, uma fatura de fornecedor
     * pode chegar semanas depois do mês a que respeita. Um mês civil terminado tem
     * os pedidos todos, mas não necessariamente as despesas todas.
     *
     * Por isso as despesas mantêm o limite CONSERVADOR e explícito em junho,
     * enquanto a receita passa a derivar do calendário. Consequência desejada: as
     * despesas de julho continuam a apresentar-se como parciais — que é a verdade —
     * sem que isso impeça o pedido do CMV, que depende só da receita.
     *
     * Avançar para "2026-07" quando se confirmar que as faturas de julho entraram
     * todas. Os campos omitidos são herdados da cobertura acima.
     */
    payables: { completeThroughMonth: "2026-06" },
  },
};

/** Perfil para empresas portuguesas (usado quando o multiempresa existir). */
export const PT_COMPANY_DEFAULTS = {
  currency: "EUR",
  locale: "pt-PT",
};