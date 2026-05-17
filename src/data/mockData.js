// ─── mockData.js ─────────────────────────────────────────────
// Dados mockados da empresa Overcel.
// Todas as páginas importam daqui — nunca inventam dados locais.
// ─────────────────────────────────────────────────────────────

export const company = {
  name: "Overcel",
  legalName: "Overcel — Soluções Empresariais, Lda",
  nif: "509 432 187",
  sector: "Comércio e Serviços",
};

export const currentUser = {
  name: "João Silva",
  role: "Administrador",
  initials: "JS",
  email: "joao.silva@overcel.pt",
};

// KPIs do mês corrente
export const monthMetrics = {
  receitas:              84300,
  receitasDelta:         12.4,
  despesas:              62750,
  despesasDelta:         8.6,
  resultado:             21550,
  resultadoDelta:        24.2,
  saldoDisponivel:       38900,
  cashflowPrevisto30:    26400,
  cashflowPrevistoDelta: 18.0,
  lastSync:              "há 4 min",
};

// Diagnóstico financeiro
export const diagnostic = {
  estado:            "Atenção",   // "Saudável" | "Atenção" | "Crítico"
  score:             78,
  scorePrevious:     71,
  scoreLabel:        "Bom",
  impactoFinanceiro: 18420,
  prioridadeMaxima:  "Liquidez nos próximos 30 dias",
  ultimaAtualizacao: "Hoje às 09:30",

  evolucao: [
    { mes: "Nov 25", score: 58, estado: "Crítico"  },
    { mes: "Dez 25", score: 62, estado: "Atenção"  },
    { mes: "Jan 26", score: 66, estado: "Atenção"  },
    { mes: "Fev 26", score: 71, estado: "Atenção"  },
    { mes: "Mar 26", score: 71, estado: "Atenção"  },
    { mes: "Abr 26", score: 78, estado: "Atenção"  },
  ],

  problemas: [
    {
      id: "p1",
      titulo:     "Margem bruta em queda",
      descricao:  "A margem bruta passou de 28,4% para 22,2% nos últimos dois meses, principalmente devido ao aumento do custo das mercadorias vendidas.",
      severidade: "danger",
      impacto:    -8420,
    },
    {
      id: "p2",
      titulo:     "Atrasos de recebimento a aumentar",
      descricao:  "O prazo médio de recebimento subiu para 38 dias e existem 3 clientes com faturas vencidas há mais de 30 dias.",
      severidade: "warning",
      impacto:    -6200,
    },
    {
      id: "p3",
      titulo:     "Despesas fixas cresceram 18%",
      descricao:  "Custos com serviços externos e fornecedores fixos aumentaram face ao trimestre anterior, sem ajuste na faturação.",
      severidade: "warning",
      impacto:    -3800,
    },
  ],

  acoes: [
    {
      id:        "a1",
      titulo:    "Rever preços de venda",
      descricao: "Ajustar preços nos produtos com margem mais erodida pode recuperar parte significativa da rentabilidade.",
      impacto:   12600,
      prazo:     "30 dias",
    },
    {
      id:        "a2",
      titulo:    "Acelerar cobranças",
      descricao: "Contactar os 3 clientes com faturas em atraso e propor plano de pagamento melhora a tesouraria de imediato.",
      impacto:   4850,
      prazo:     "15 dias",
    },
    {
      id:        "a3",
      titulo:    "Renegociar fornecedores",
      descricao: "Existe espaço para reduzir 5% a 7% nos contratos de fornecedores recorrentes.",
      impacto:   8340,
      prazo:     "60 dias",
    },
  ],

  mudancasUltimoMes: [
    { label: "Score subiu",       valor: "+7 pontos", tendencia: "up",   detalhe: "de 71 para 78"       },
    { label: "Margem líquida",    valor: "+0,6 p.p.", tendencia: "up",   detalhe: "vs mês anterior"     },
    { label: "Prazo recebimento", valor: "+2 dias",   tendencia: "down", detalhe: "piorou face a Mar 26" },
    { label: "Despesas fixas",    valor: "+18%",      tendencia: "down", detalhe: "vs trimestre anterior" },
  ],

  perguntasIA: [
    "Porque é que a minha margem bruta caiu nos últimos 2 meses?",
    "Como posso melhorar o cashflow nos próximos 30 dias?",
    "Que clientes representam maior risco de incumprimento?",
    "Tenho margem para contratar mais um colaborador este trimestre?",
  ],

  resumoExecutivo:
    "A Overcel mantém uma base saudável, mas existem sinais de atenção relacionados com margem, atrasos de recebimento e aumento de despesas fixas. Com ações rápidas e foco na liquidez, é possível recuperar margem, melhorar a tesouraria e reduzir o risco financeiro nos próximos meses.",
};

// Previsão de cashflow (próximos 30 dias)
export const cashflowForecast = [
  { dia: "16 Mai", saldo: 38900 },
  { dia: "20 Mai", saldo: 41200 },
  { dia: "24 Mai", saldo: 43800 },
  { dia: "28 Mai", saldo: 39400 },
  { dia: "01 Jun", saldo: 35200 },
  { dia: "05 Jun", saldo: 32800 },
  { dia: "09 Jun", saldo: 30600 },
  { dia: "13 Jun", saldo: 29400 },
  { dia: "15 Jun", saldo: 26400 },
];

// Alertas do Resumo
export const alerts = [
  { id: "al1", severity: "danger",  title: "Risco de liquidez",          description: "Existe risco de saldo abaixo do limite de segurança em 23 dias.", timestamp: "Hoje"   },
  { id: "al2", severity: "warning", title: "Faturas em atraso",          description: "3 clientes devem 6.420 € há mais de 30 dias.",                    timestamp: "Hoje"   },
  { id: "al3", severity: "info",    title: "Despesa acima do habitual",  description: "Despesas com Fornecedores aumentaram 24% face à média trimestral.", timestamp: "Ontem" },
  { id: "al4", severity: "success", title: "Receitas em crescimento",    description: "O resultado do mês está 24% acima do anterior.",                   timestamp: "Ontem" },
];

// Faturas em atraso (Resumo)
export const overdueInvoices = [
  { id: "ft125", cliente: "Lusitana Distribuição, Lda",    numero: "FT 2026/125", valor: 3200, diasAtraso: 38 },
  { id: "ft126", cliente: "Tagus Comercial, S.A.",         numero: "FT 2026/126", valor: 2150, diasAtraso: 34 },
  { id: "ft127", cliente: "Beira Atlântico, Unipessoal",   numero: "FT 2026/127", valor: 1070, diasAtraso: 31 },
];

// Documentos recentes (Resumo)
export const recentDocuments = [
  { id: "d1", nome: "Fatura_Lusitana_125.pdf",    quando: "Hoje, 10:14"    },
  { id: "d2", nome: "Recibo_Combustivel.jpg",      quando: "Ontem, 17:02"  },
  { id: "d3", nome: "Fatura_Fornecedor_ABC.pdf",   quando: "Ontem, 11:48"  },
  { id: "d4", nome: "Contrato_Arrendamento.pdf",   quando: "13 Mai, 09:30" },
];

// Sincronização bancária
export const bankSync = {
  bank:       "Millennium BCP",
  accountTail: "1284",
  status:     "Sincronizado",
  lastSync:   "há 4 min",
};

// Sugestões de chat (Resumo)
export const chatSuggestions = [
  "Porque é que o resultado caiu em comparação com o mês passado?",
  "Posso suportar uma despesa de 4.500 € sem comprometer a tesouraria?",
  "Qual a previsão de saldo para os próximos 3 meses?",
];

// ─── Receitas ────────────────────────────────────────────────

// KPIs principais (Mês corrente)
export const revenueMetrics = {
  totalMes:      84300,
  totalDelta:    12.4,
  mediaDiaria:   2810,
  mediaDelta:    8.1,
  clientesPagos: 28,
  clientesDelta: 4,
  emAtraso:      6420,
  emAtrasoQtd:   3,
};

// Evolução diária (últimos 30 dias) — valor em €
export const revenueEvolution = [
  { dia: "1 Mai",  valor: 1980 }, { dia: "3 Mai",  valor: 2340 },
  { dia: "5 Mai",  valor: 3120 }, { dia: "7 Mai",  valor: 2150 },
  { dia: "9 Mai",  valor: 2680 }, { dia: "11 Mai", valor: 3920 },
  { dia: "13 Mai", valor: 2410 }, { dia: "15 Mai", valor: 5180 },
  { dia: "17 Mai", valor: 3650 }, { dia: "19 Mai", valor: 2890 },
  { dia: "21 Mai", valor: 4720 }, { dia: "23 Mai", valor: 3540 },
  { dia: "25 Mai", valor: 2980 }, { dia: "27 Mai", valor: 4360 },
  { dia: "29 Mai", valor: 3210 }, { dia: "31 Mai", valor: 4180 },
];

// Distribuição por categoria
export const revenueByCategory = [
  { name: "Vendas de Produtos",    value: 41800, color: "#10B981" },
  { name: "Prestação de Serviços", value: 28600, color: "#2563eb" },
  { name: "Outros Rendimentos",     value: 9200,  color: "#7C3AED" },
  { name: "Alugueres",              value: 4700,  color: "#f59e0b" },
];

// Tabela de receitas (com tabs e estados)
export const revenueList = [
  { id: "r1",  data: "30/05/2026", cliente: "Lusitana Distribuição, Lda",   documento: "FT 2026/130", categoria: "Vendas de Produtos",    valor: 4250, recebidoEm: "30/05/2026", status: "recebida", metodo: "Transferência" },
  { id: "r2",  data: "28/05/2026", cliente: "Tagus Comercial, S.A.",        documento: "FT 2026/129", categoria: "Prestação de Serviços", valor: 1800, recebidoEm: "28/05/2026", status: "recebida", metodo: "Transferência" },
  { id: "r3",  data: "27/05/2026", cliente: "Atlântico Norte, Lda",          documento: "FT 2026/128", categoria: "Vendas de Produtos",    valor: 2900, recebidoEm: "27/05/2026", status: "recebida", metodo: "MB Way"        },
  { id: "r4",  data: "25/05/2026", cliente: "Beira Atlântico, Unipessoal",  documento: "FT 2026/127", categoria: "Vendas de Produtos",    valor: 1070, recebidoEm: null,         status: "atraso",   metodo: "—"             },
  { id: "r5",  data: "22/05/2026", cliente: "Estoril Trading, Lda",          documento: "FT 2026/126", categoria: "Outros Rendimentos",    valor:  860, recebidoEm: "23/05/2026", status: "recebida", metodo: "Transferência" },
  { id: "r6",  data: "20/05/2026", cliente: "Tagus Comercial, S.A.",        documento: "FT 2026/125", categoria: "Prestação de Serviços", valor: 3450, recebidoEm: null,         status: "pendente", metodo: "—"             },
  { id: "r7",  data: "18/05/2026", cliente: "Algarve Logística, Lda",       documento: "FT 2026/124", categoria: "Alugueres",             valor: 1180, recebidoEm: "18/05/2026", status: "recebida", metodo: "Débito Direto" },
  { id: "r8",  data: "15/05/2026", cliente: "Lusitana Distribuição, Lda",   documento: "FT 2026/123", categoria: "Vendas de Produtos",    valor: 2150, recebidoEm: null,         status: "atraso",   metodo: "—"             },
  { id: "r9",  data: "12/05/2026", cliente: "Norte Industrial, S.A.",       documento: "FT 2026/122", categoria: "Vendas de Produtos",    valor: 5240, recebidoEm: "12/05/2026", status: "recebida", metodo: "Transferência" },
  { id: "r10", data: "10/05/2026", cliente: "Beira Atlântico, Unipessoal",  documento: "FT 2026/121", categoria: "Prestação de Serviços", valor: 1620, recebidoEm: "10/05/2026", status: "recebida", metodo: "MB Way"        },
];

// ─── Despesas ────────────────────────────────────────────────

export const expenseMetrics = {
  totalMes:     62750,
  totalDelta:   8.6,
  mediaDiaria:  2092,
  mediaDelta:   5.3,
  maiorDespesa: { fornecedor: "Vasco & Lemos, Lda", valor: 4180, data: "27/05/2026" },
  pagamentosPendentes: 8650,
  pendentesQtd: 4,
};

export const expenseEvolution = [
  { dia: "1 Mai",  valor: 1240 }, { dia: "3 Mai",  valor: 1830 },
  { dia: "5 Mai",  valor: 2410 }, { dia: "7 Mai",  valor: 1680 },
  { dia: "9 Mai",  valor: 2960 }, { dia: "11 Mai", valor: 1520 },
  { dia: "13 Mai", valor: 3180 }, { dia: "15 Mai", valor: 2240 },
  { dia: "17 Mai", valor: 1920 }, { dia: "19 Mai", valor: 4180 },
  { dia: "21 Mai", valor: 2380 }, { dia: "23 Mai", valor: 1860 },
  { dia: "25 Mai", valor: 3420 }, { dia: "27 Mai", valor: 4180 },
  { dia: "29 Mai", valor: 2120 }, { dia: "31 Mai", valor: 1840 },
];

export const expenseByCategory = [
  { name: "Fornecedores",   value: 24600, color: "#10B981" },
  { name: "Salários",       value: 14800, color: "#2563eb" },
  { name: "Serviços",       value:  8900, color: "#7C3AED" },
  { name: "Impostos e Taxas", value: 6200, color: "#f59e0b" },
  { name: "Alugueres",      value:  4250, color: "#ef4444" },
  { name: "Outras",         value:  4000, color: "#94a3b8" },
];

export const expenseList = [
  { id: "e1",  data: "30/05/2026", descricao: "Material de embalagem",        fornecedor: "Vasco & Lemos, Lda",   categoria: "Fornecedores",    valor: 2180, vencimento: "30/05/2026", status: "paga",     metodo: "Transferência" },
  { id: "e2",  data: "29/05/2026", descricao: "Salários Maio",                 fornecedor: "—",                    categoria: "Salários",        valor: 14800, vencimento: "29/05/2026", status: "paga",     metodo: "Transferência" },
  { id: "e3",  data: "27/05/2026", descricao: "Compra de Stock",                fornecedor: "Vasco & Lemos, Lda",   categoria: "Fornecedores",    valor: 4180, vencimento: "27/05/2026", status: "paga",     metodo: "Transferência" },
  { id: "e4",  data: "25/05/2026", descricao: "Renda do escritório",           fornecedor: "ImoCentral, Lda",      categoria: "Alugueres",       valor: 1450, vencimento: "25/05/2026", status: "paga",     metodo: "MB Way"        },
  { id: "e5",  data: "23/05/2026", descricao: "Serviços de Contabilidade",     fornecedor: "Contas & Cia, Lda",    categoria: "Serviços",        valor:  860, vencimento: "23/05/2026", status: "paga",     metodo: "Transferência" },
  { id: "e6",  data: "22/05/2026", descricao: "Eletricidade",                  fornecedor: "EDP Comercial",        categoria: "Serviços",        valor:  340, vencimento: "22/05/2026", status: "paga",     metodo: "Débito Direto" },
  { id: "e7",  data: "20/05/2026", descricao: "IVA Periódica",                 fornecedor: "Autoridade Tributária", categoria: "Impostos e Taxas", valor: 3850, vencimento: "20/05/2026", status: "paga",     metodo: "Transferência" },
  { id: "e8",  data: "18/05/2026", descricao: "Combustível",                   fornecedor: "BP Portugal",          categoria: "Outras",          valor:  186, vencimento: "18/05/2026", status: "paga",     metodo: "Cartão"        },
  { id: "e9",  data: "15/05/2026", descricao: "Material de Escritório",       fornecedor: "Staples Portugal",     categoria: "Outras",          valor:  124, vencimento: "15/05/2026", status: "pendente", metodo: "—"             },
  { id: "e10", data: "12/05/2026", descricao: "Software & Licenças",           fornecedor: "Acme Software, Lda",   categoria: "Serviços",        valor:  680, vencimento: "12/06/2026", status: "pendente", metodo: "—"             },
  { id: "e11", data: "08/05/2026", descricao: "Pagamento Fornecedor Atrasado", fornecedor: "Norte Industrial, S.A.", categoria: "Fornecedores", valor: 1980, vencimento: "08/05/2026", status: "atraso",   metodo: "—"             },
  { id: "e12", data: "05/05/2026", descricao: "Seguros",                       fornecedor: "Fidelidade, S.A.",     categoria: "Serviços",        valor:  720, vencimento: "05/06/2026", status: "pendente", metodo: "—"             },
];

// ─── Movimentos (extrato consolidado) ────────────────────────

export const movementsMetrics = {
  totalEntradas:    84300,
  entradasDelta:    12.4,
  totalSaidas:      62750,
  saidasDelta:      8.6,
  saldoLiquido:     21550,
  saldoDelta:       24.2,
  totalTransacoes:  142,
  transacoesDelta:  6.1,
};

// Saldo inicial e final do período em análise
export const movementsPeriod = {
  inicio:         "01/05/2026",
  fim:            "31/05/2026",
  saldoInicial:   17350,
  saldoFinal:     38900,
};

export const movementsList = [
  { id: "m1",  data: "30/05/2026", descricao: "Recebimento Lusitana Distribuição",   categoria: "Vendas",        conta: "Conta Principal", entrada: 4250, saida:   0,    saldo: 38900, origem: "Banco" },
  { id: "m2",  data: "30/05/2026", descricao: "Pagamento Vasco & Lemos, Lda",         categoria: "Fornecedores",  conta: "Conta Principal", entrada: 0,    saida: 2180,  saldo: 34650, origem: "Banco" },
  { id: "m3",  data: "29/05/2026", descricao: "Salários Maio",                        categoria: "Salários",      conta: "Conta Principal", entrada: 0,    saida: 14800, saldo: 36830, origem: "Banco" },
  { id: "m4",  data: "28/05/2026", descricao: "Recebimento Tagus Comercial",          categoria: "Serviços",      conta: "Conta Principal", entrada: 1800, saida:    0,  saldo: 51630, origem: "Banco" },
  { id: "m5",  data: "27/05/2026", descricao: "Pagamento Stock Vasco & Lemos",        categoria: "Fornecedores",  conta: "Conta Principal", entrada: 0,    saida: 4180,  saldo: 49830, origem: "Banco" },
  { id: "m6",  data: "27/05/2026", descricao: "Recebimento Atlântico Norte, Lda",     categoria: "Vendas",        conta: "Conta Principal", entrada: 2900, saida:    0,  saldo: 54010, origem: "MB Way"},
  { id: "m7",  data: "25/05/2026", descricao: "Renda do escritório",                  categoria: "Alugueres",     conta: "Conta Principal", entrada: 0,    saida: 1450,  saldo: 51110, origem: "Banco" },
  { id: "m8",  data: "23/05/2026", descricao: "Serviços Contabilidade Contas & Cia",  categoria: "Serviços",      conta: "Conta Principal", entrada: 0,    saida:  860,  saldo: 52560, origem: "Banco" },
  { id: "m9",  data: "23/05/2026", descricao: "Recebimento Estoril Trading",          categoria: "Outros",        conta: "Conta Principal", entrada:  860, saida:    0,  saldo: 53420, origem: "Banco" },
  { id: "m10", data: "22/05/2026", descricao: "Eletricidade EDP Comercial",           categoria: "Serviços",      conta: "Conta Principal", entrada: 0,    saida:  340,  saldo: 52560, origem: "Débito Direto" },
  { id: "m11", data: "20/05/2026", descricao: "IVA Periódica",                        categoria: "Impostos",      conta: "Conta Principal", entrada: 0,    saida: 3850,  saldo: 52900, origem: "Banco" },
  { id: "m12", data: "20/05/2026", descricao: "Transferência para Poupança",          categoria: "Transferências",conta: "Conta Principal", entrada: 0,    saida: 3000,  saldo: 56750, origem: "Interna" },
  { id: "m13", data: "18/05/2026", descricao: "Combustível BP Portugal",              categoria: "Despesas Gerais",conta: "Conta Principal", entrada: 0,    saida:  186,  saldo: 59750, origem: "Cartão" },
  { id: "m14", data: "18/05/2026", descricao: "Recebimento Algarve Logística",        categoria: "Alugueres",     conta: "Conta Principal", entrada: 1180, saida:    0,  saldo: 59936, origem: "Débito Direto" },
  { id: "m15", data: "15/05/2026", descricao: "Material Escritório Staples",          categoria: "Despesas Gerais",conta: "Conta Principal", entrada: 0,    saida:  124,  saldo: 58756, origem: "Cartão" },
  { id: "m16", data: "12/05/2026", descricao: "Recebimento Norte Industrial",         categoria: "Vendas",        conta: "Conta Principal", entrada: 5240, saida:    0,  saldo: 58880, origem: "Banco" },
  { id: "m17", data: "10/05/2026", descricao: "Recebimento Beira Atlântico",          categoria: "Serviços",      conta: "Conta Principal", entrada: 1620, saida:    0,  saldo: 53640, origem: "MB Way"},
  { id: "m18", data: "08/05/2026", descricao: "Pagamento Norte Industrial (atraso)",   categoria: "Fornecedores",  conta: "Conta Principal", entrada: 0,    saida: 1980,  saldo: 52020, origem: "Banco" },
  { id: "m19", data: "05/05/2026", descricao: "Seguros Fidelidade",                    categoria: "Serviços",      conta: "Conta Principal", entrada: 0,    saida:  720,  saldo: 54000, origem: "Débito Direto" },
  { id: "m20", data: "03/05/2026", descricao: "Recebimento cliente recorrente",        categoria: "Vendas",        conta: "Conta Principal", entrada: 3120, saida:    0,  saldo: 54720, origem: "Banco" },
];

// ─── Clientes e Fornecedores ─────────────────────────────────

export const customersSuppliersMetrics = {
  saldoReceber:        18750,
  saldoReceberDelta:   8.2,
  clientesAtivos:      28,
  saldoPagar:          12640,
  saldoPagarDelta:    -4.1,
  fornecedoresAtivos:  14,
  faturasAbertasReceber: 9,
  faturasAbertasReceberVencer7: 3,
  faturasAbertasPagar: 6,
  faturasAbertasPagarVencer7: 2,
};

export const topCustomers = [
  { id: "c1", nome: "Lusitana Distribuição, Lda",   faturasAbertas: 3, saldo: 5420 },
  { id: "c2", nome: "Norte Industrial, S.A.",       faturasAbertas: 2, saldo: 4180 },
  { id: "c3", nome: "Tagus Comercial, S.A.",        faturasAbertas: 2, saldo: 3450 },
  { id: "c4", nome: "Beira Atlântico, Unipessoal",  faturasAbertas: 1, saldo: 2150 },
  { id: "c5", nome: "Algarve Logística, Lda",       faturasAbertas: 1, saldo: 1980 },
  { id: "c6", nome: "Estoril Trading, Lda",         faturasAbertas: 1, saldo: 1570 },
];

export const topSuppliers = [
  { id: "s1", nome: "Vasco & Lemos, Lda",      faturasAbertas: 2, saldo: 4860 },
  { id: "s2", nome: "Contas & Cia, Lda",       faturasAbertas: 1, saldo: 2480 },
  { id: "s3", nome: "Acme Software, Lda",      faturasAbertas: 1, saldo: 1720 },
  { id: "s4", nome: "ImoCentral, Lda",         faturasAbertas: 1, saldo: 1450 },
  { id: "s5", nome: "Fidelidade, S.A.",        faturasAbertas: 1, saldo: 1280 },
  { id: "s6", nome: "EDP Comercial",           faturasAbertas: 1, saldo:  850 },
];

export const openCustomerInvoices = [
  { id: "oc1", cliente: "Lusitana Distribuição, Lda",   numero: "FT 2026/130", dataEmissao: "30/05/2026", vencimento: "29/06/2026", valor: 4250, diasAtraso: 0   },
  { id: "oc2", cliente: "Lusitana Distribuição, Lda",   numero: "FT 2026/125", dataEmissao: "20/04/2026", vencimento: "20/05/2026", valor: 1070, diasAtraso: 11  },
  { id: "oc3", cliente: "Tagus Comercial, S.A.",        numero: "FT 2026/128", dataEmissao: "10/05/2026", vencimento: "09/06/2026", valor: 1800, diasAtraso: 0   },
  { id: "oc4", cliente: "Tagus Comercial, S.A.",        numero: "FT 2026/120", dataEmissao: "01/04/2026", vencimento: "01/05/2026", valor: 1650, diasAtraso: 30  },
  { id: "oc5", cliente: "Norte Industrial, S.A.",       numero: "FT 2026/127", dataEmissao: "08/05/2026", vencimento: "07/06/2026", valor: 2900, diasAtraso: 0   },
  { id: "oc6", cliente: "Norte Industrial, S.A.",       numero: "FT 2026/119", dataEmissao: "28/03/2026", vencimento: "27/04/2026", valor: 1280, diasAtraso: 34  },
];

export const openSupplierInvoices = [
  { id: "os1", fornecedor: "Vasco & Lemos, Lda",   numero: "FT V/452",  dataEmissao: "28/05/2026", vencimento: "27/06/2026", valor: 3180, diasAtraso: 0   },
  { id: "os2", fornecedor: "Vasco & Lemos, Lda",   numero: "FT V/440",  dataEmissao: "12/04/2026", vencimento: "12/05/2026", valor: 1680, diasAtraso: 19  },
  { id: "os3", fornecedor: "Contas & Cia, Lda",    numero: "FT C/189",  dataEmissao: "01/05/2026", vencimento: "31/05/2026", valor: 2480, diasAtraso: 0   },
  { id: "os4", fornecedor: "Acme Software, Lda",   numero: "FT A/0231", dataEmissao: "15/05/2026", vencimento: "14/06/2026", valor: 1720, diasAtraso: 0   },
];

// ─── Alertas (vista completa) ────────────────────────────────

export const alertsMetrics = {
  criticos:    2,
  atencao:     4,
  informativos: 5,
  resolvidos:  12,
};

export const alertsList = [
  { id: "ax1", severity: "danger",  category: "Liquidez",      title: "Risco de liquidez",                  description: "Existe risco de saldo abaixo do limite de segurança em 23 dias.", timestamp: "Hoje, 09:14",  acao: "Antecipar recebimentos pendentes" },
  { id: "ax2", severity: "danger",  category: "Receitas",      title: "Cliente com atraso recorrente",      description: "A Lusitana Distribuição tem 2 faturas vencidas há mais de 30 dias.", timestamp: "Hoje, 08:42",  acao: "Contactar cliente e propor plano" },
  { id: "ax3", severity: "warning", category: "Despesas",      title: "Despesa acima do habitual",          description: "Despesas com Fornecedores aumentaram 24% face à média trimestral.", timestamp: "Ontem, 17:21", acao: "Rever contratos de fornecimento" },
  { id: "ax4", severity: "warning", category: "Margem",        title: "Margem bruta em queda",              description: "Margem bruta passou de 28,4% para 22,2% nos últimos 2 meses.",      timestamp: "Ontem, 11:08", acao: "Rever preços de venda" },
  { id: "ax5", severity: "warning", category: "Recebimentos",  title: "Prazo médio a aumentar",             description: "Prazo médio de recebimento subiu para 38 dias.",                   timestamp: "13/05/2026",  acao: "Reforçar cobranças" },
  { id: "ax6", severity: "warning", category: "Tesouraria",    title: "Pico de pagamentos em breve",        description: "Concentração de 8.650 € em pagamentos entre 5 e 15 Junho.",         timestamp: "12/05/2026",  acao: "Negociar prazos com fornecedores" },
  { id: "ax7", severity: "info",    category: "Fiscal",        title: "Próxima entrega de IVA",             description: "Entrega de IVA periódica em 10 Junho 2026.",                       timestamp: "11/05/2026",  acao: "Preparar documentos" },
  { id: "ax8", severity: "info",    category: "Crescimento",   title: "Cliente novo recorrente",            description: "Norte Industrial tornou-se cliente top neste mês.",                timestamp: "08/05/2026",  acao: "Avaliar oportunidades adicionais" },
  { id: "ax9", severity: "info",    category: "Recebimentos",  title: "Recebimento confirmado",             description: "Lusitana Distribuição liquidou fatura FT 2026/130.",               timestamp: "07/05/2026",  acao: "Atualizar plano de tesouraria" },
  { id: "ax10",severity: "success", category: "Resultado",     title: "Resultado em crescimento",           description: "Resultado mensal 24% acima do mês anterior.",                      timestamp: "Ontem, 09:30",acao: "Manter estratégia atual" },
  { id: "ax11",severity: "success", category: "Liquidez",      title: "Saldo confortável",                  description: "Saldo atual acima do limite de segurança.",                        timestamp: "06/05/2026",  acao: "—" },
];

// ─── Chat Financeiro ─────────────────────────────────────────

export const chatHistory = [
  {
    id: "ch1", role: "user", timestamp: "10:14",
    content: "Como está a performance da Overcel este mês?",
  },
  {
    id: "ch2", role: "ai", timestamp: "10:14",
    content: "A performance da Overcel em Maio 2026 apresenta crescimento positivo face a Abril.",
    metrics: [
      { label: "Receitas",       value: "84.300 €", delta: "+12,4% vs Abr",  tone: "success" },
      { label: "Lucro Líquido",  value: "21.550 €", delta: "+24,2% vs Abr",  tone: "success" },
      { label: "Margem Líquida", value: "25,6%",    delta: "+2,3 p.p.",      tone: "success" },
      { label: "EBITDA",         value: "26.420 €", delta: "+18,1% vs Abr",  tone: "success" },
    ],
    highlights: [
      "Receitas cresceram 12,4%, principalmente em Vendas de Produtos.",
      "Despesas operacionais subiram 8,6%, mantendo margem em crescimento.",
      "Cashflow operacional positivo em 26.420 €.",
    ],
    followUp: "Posso aprofundar algum destes indicadores ou comparar com o mesmo período do ano passado?",
  },
  {
    id: "ch3", role: "user", timestamp: "10:16",
    content: "Quais os meus 5 maiores clientes este ano?",
  },
  {
    id: "ch4", role: "ai", timestamp: "10:16",
    content: "Aqui estão os 5 clientes que mais faturaram de Janeiro a Maio de 2026:",
    table: {
      headers: ["#", "Cliente", "Faturação", "% do Total"],
      rows: [
        ["1", "Lusitana Distribuição, Lda",  "32.450 €", "24,1%"],
        ["2", "Norte Industrial, S.A.",       "21.780 €", "16,2%"],
        ["3", "Tagus Comercial, S.A.",        "17.950 €", "13,4%"],
        ["4", "Algarve Logística, Lda",       "12.430 €", "9,3%"],
        ["5", "Atlântico Norte, Lda",          "9.640 €",  "7,2%"],
      ],
      totals: ["", "TOTAL", "94.250 €", "70,2%"],
    },
  },
];

export const chatStartSuggestions = [
  "Como está a performance da empresa este mês?",
  "Qual o meu cashflow disponível?",
  "Quais são os meus principais clientes?",
  "Tenho IVA a pagar ou a receber?",
  "Qual a margem bruta dos produtos e serviços?",
];

export const chatInsights = [
  "A sua margem líquida melhorou 0,6 p.p. este mês. Continue assim!",
  "As receitas estão 18,7% acima do mês anterior.",
  "O prazo médio de recebimento aumentou 2 dias face ao mês passado.",
];

export const chatRecentQuestions = [
  "Como está a performance da empresa este mês?",
  "Quais os meus 5 maiores clientes?",
  "Tenho IVA a pagar ou a receber?",
  "Qual a previsão de saldo para os próximos 3 meses?",
];

// ─── Planeamento e Cashflow ──────────────────────────────────

export const planningMetrics = {
  saldoAtual:       38900,
  saldoPrevisto30:  46180,
  saldoPrevisto30D: 18.7,
  saldoPrevisto90:  42350,
  saldoPrevisto90D: 8.9,
  riscoLiquidez:    "Médio",
  diasDeFolga:      48,
};

// Cashflow previsto (próximos 90 dias) — barras + linha
export const planningCashflow = [
  { mes: "Mai 26",  entradas: 84300,  saidas: 62750, saldo: 38900 },
  { mes: "Jun 26",  entradas: 81500,  saidas: 67200, saldo: 53200 },
  { mes: "Jul 26",  entradas: 88200,  saidas: 64800, saldo: 76600 },
  { mes: "Ago 26",  entradas: 76400,  saidas: 70650, saldo: 82350 },
];

export const planningCashflowDaily = [
  { dia: "16 Mai", entradas: 2800,  saidas: -2100, saldo: 38900 },
  { dia: "23 Mai", entradas: 4200,  saidas: -3450, saldo: 39650 },
  { dia: "30 Mai", entradas: 3500,  saidas: -2800, saldo: 40350 },
  { dia: "06 Jun", entradas: 5100,  saidas: -2400, saldo: 43050 },
  { dia: "13 Jun", entradas: 3800,  saidas: -4200, saldo: 42650 },
  { dia: "20 Jun", entradas: 4400,  saidas: -3100, saldo: 43950 },
  { dia: "27 Jun", entradas: 5200,  saidas: -2900, saldo: 46250 },
  { dia: "04 Jul", entradas: 4800,  saidas: -3300, saldo: 47750 },
  { dia: "11 Jul", entradas: 4100,  saidas: -2700, saldo: 49150 },
  { dia: "18 Jul", entradas: 5600,  saidas: -3500, saldo: 51250 },
  { dia: "25 Jul", entradas: 4900,  saidas: -3000, saldo: 53150 },
  { dia: "01 Ago", entradas: 4200,  saidas: -4500, saldo: 52850 },
];

export const planningPeriodSummary = [
  { periodo: "Mai 2026 (Real)",     entradas: 84300, saidas: 62750, saldo: 21550, acumulado: 38900 },
  { periodo: "Jun 2026 (Previsto)", entradas: 81500, saidas: 67200, saldo: 14300, acumulado: 53200 },
  { periodo: "Jul 2026 (Previsto)", entradas: 88200, saidas: 64800, saldo: 23400, acumulado: 76600 },
  { periodo: "Ago 2026 (Previsto)", entradas: 76400, saidas: 70650, saldo:  5750, acumulado: 82350 },
];

export const planningRecommendations = [
  { id: "pr1", tone: "success", title: "Manter controlo de despesas",      description: "Prevemos um aumento de saídas em Agosto. Monitorize gastos não essenciais." },
  { id: "pr2", tone: "warning", title: "Acompanhar clientes em atraso",    description: "2 clientes representam 6.420 € em risco. Reforce cobranças." },
  { id: "pr3", tone: "info",    title: "Oportunidade de investimento",     description: "Cenário otimista mostra folga acima de 90 dias em Julho." },
];

// ─── Indicadores ─────────────────────────────────────────────

export const indicatorsTop = [
  { key: "margemBruta",  label: "Margem Bruta",       value: "46,0%",     delta: "+2,1 p.p.", deltaTone: "up",   sparkColor: "#10B981" },
  { key: "ebitda",       label: "EBITDA Margin",      value: "16,8%",     delta: "+0,4 p.p.", deltaTone: "up",   sparkColor: "#2563eb" },
  { key: "liquidez",     label: "Liquidez Corrente",  value: "1,42",      delta: "+0,18",     deltaTone: "up",   sparkColor: "#7C3AED" },
  { key: "custoCliente", label: "Custo por Cliente",  value: "125,00 €",  delta: "-8,7%",     deltaTone: "down", sparkColor: "#f59e0b" },
  { key: "roi",          label: "ROI (Investimentos)",value: "18,7%",     delta: "+2,6 p.p.", deltaTone: "up",   sparkColor: "#10B981" },
  { key: "payback",      label: "Payback Médio",      value: "3,2 anos",  delta: "-0,4 anos", deltaTone: "down", sparkColor: "#0ea5e9" },
];

export const operationalKPIs = [
  { kpi: "Margem Bruta",         desc: "Lucro bruto / Receitas",            valor: "46,0%",    delta: "+2,1 p.p.", trend: "up"   },
  { kpi: "Margem EBITDA",        desc: "EBITDA / Receitas",                 valor: "16,8%",    delta: "+0,4 p.p.", trend: "up"   },
  { kpi: "Liquidez Corrente",    desc: "Ativo Corrente / Passivo Corrente", valor: "1,42",     delta: "+0,18",     trend: "up"   },
  { kpi: "Custo por Cliente",    desc: "Custos Operacionais / Nº Clientes", valor: "125,00 €", delta: "-8,7%",     trend: "down" },
  { kpi: "Retenção de Clientes", desc: "Clientes Retidos / Total",          valor: "87,5%",    delta: "+3,2 p.p.", trend: "up"   },
  { kpi: "Prazo M. Recebimentos",desc: "Clientes",                          valor: "32 dias",  delta: "-6 dias",   trend: "down" },
  { kpi: "Prazo M. Pagamentos",  desc: "Fornecedores",                      valor: "28 dias",  delta: "+4 dias",   trend: "up"   },
  { kpi: "Rotação de Inventário",desc: "CMV / Inventário Médio",            valor: "5,2x",     delta: "+0,6x",     trend: "up"   },
];

export const investmentKPIs = [
  { kpi: "ROI",                  desc: "Return on Investment",   valor: "18,7%",     delta: "+2,6 p.p.", trend: "up"   },
  { kpi: "ROE",                  desc: "Return on Equity",       valor: "20,8%",     delta: "+2,9 p.p.", trend: "up"   },
  { kpi: "EBITDA Margin (Inv.)", desc: "Investimentos",          valor: "16,8%",     delta: "+0,4 p.p.", trend: "up"   },
  { kpi: "Payback Period",       desc: "Período de retorno",     valor: "3,2 anos",  delta: "-0,4 anos", trend: "down" },
  { kpi: "VPL",                  desc: "Valor Presente Líquido", valor: "245.300 €", delta: "+18,5%",    trend: "up"   },
  { kpi: "TIR",                  desc: "Taxa Interna de Retorno",valor: "22,4%",     delta: "+2,1 p.p.", trend: "up"   },
  { kpi: "Índice Rentabilidade", desc: "VPL / Investimento",     valor: "1,85",      delta: "-0,12",     trend: "down" },
];

export const indicatorsHighlights = [
  "Margem bruta aumentou 2,1 p.p. face ao ano anterior.",
  "ROI dos investimentos cresceu 2,6 p.p., acima do benchmark do setor.",
  "Liquidez corrente melhorou 0,18, aumentando a capacidade de curto prazo.",
];

export const indicatorsWarnings = [
  "Custo por cliente reduziu (bom sinal), mas continue a monitorizar.",
  "Prazo médio de pagamentos aumentou 4 dias.",
  "Rotação de inventário ainda abaixo do benchmark (6,0x).",
];

// ─── Performance Financeira (P&L, Balanço, Cashflow) ─────────

export const performanceMetrics = {
  lucroLiquido:     142500, lucroLiquidoDelta: 13.7,
  margemLiquida:    11.4,   margemLiquidaDelta: 1.8,
  ebitda:           210000, ebitdaDelta: 13.5,
  ativoTotal:       1282600, ativoTotalDelta: 14.8,
  solvabilidade:    53.3,   solvabilidadeDelta: 2.4,
};

export const profitLossRows = [
  { rubrica: "Receitas",                  atual: 1250000, anterior: 1054000, varAbs:  196000, varPct: 18.7,  highlight: true },
  { rubrica: "Custo das Vendas",          atual: -675000, anterior: -565000, varAbs: -110000, varPct: 19.5 },
  { rubrica: "Margem Bruta",              atual:  575000, anterior:  489000, varAbs:   86000, varPct: 17.6,  bold: true },
  { rubrica: "Despesas Operacionais",     atual: -295000, anterior: -254000, varAbs:  -41000, varPct: 16.1 },
  { rubrica: "Fornecimentos e Serviços",  atual: -165000, anterior: -142000, varAbs:  -23000, varPct: 16.2,  indent: true },
  { rubrica: "Gastos com Pessoal",        atual:  -95000, anterior:  -83000, varAbs:  -12000, varPct: 14.5,  indent: true },
  { rubrica: "Outros Gastos",             atual:  -35000, anterior:  -29000, varAbs:   -6000, varPct: 20.7,  indent: true },
  { rubrica: "EBITDA",                    atual:  210000, anterior:  185000, varAbs:   25000, varPct: 13.5,  bold: true },
  { rubrica: "Depreciações e Amort.",     atual:  -32000, anterior:  -29000, varAbs:   -3000, varPct: 10.3 },
  { rubrica: "EBIT",                      atual:  178000, anterior:  156000, varAbs:   22000, varPct: 14.1,  bold: true },
  { rubrica: "Resultados Financeiros",    atual:  -12500, anterior:  -10200, varAbs:   -2300, varPct: 22.5 },
  { rubrica: "Lucro Antes de Impostos",   atual:  165500, anterior:  145800, varAbs:   19700, varPct: 13.5 },
  { rubrica: "Imposto sobre o Lucro",     atual:  -23000, anterior:  -20500, varAbs:   -2500, varPct: 12.2 },
  { rubrica: "Lucro Líquido",             atual:  142500, anterior:  125300, varAbs:   17200, varPct: 13.7,  highlight: true },
];

export const balanceSheetRows = [
  { rubrica: "ATIVO",                  atual: 1282600, anterior: 1117800, varAbs: 164800, header: true },
  { rubrica: "Ativo Não Corrente",     atual:  410000, anterior:  365000, varAbs:  45000, indent: true },
  { rubrica: "Ativo Corrente",         atual:  872600, anterior:  752800, varAbs: 119800, indent: true },
  { rubrica: "Caixa e Equivalentes",   atual:  296500, anterior:  246000, varAbs:  50500, indent: true, sub: true },
  { rubrica: "CAPITAL PRÓPRIO",        atual:  684300, anterior:  602800, varAbs:  81500, header: true },
  { rubrica: "Capital",                atual:  250000, anterior:  250000, varAbs:      0, indent: true },
  { rubrica: "Reservas",               atual:  302800, anterior:  260300, varAbs:  42500, indent: true },
  { rubrica: "Resultado do Período",   atual:  131500, anterior:   92500, varAbs:  39000, indent: true },
  { rubrica: "PASSIVO",                atual:  598300, anterior:  515000, varAbs:  83300, header: true },
  { rubrica: "Passivo Não Corrente",   atual:  198000, anterior:  175000, varAbs:  23000, indent: true },
  { rubrica: "Passivo Corrente",       atual:  400300, anterior:  340000, varAbs:  60300, indent: true },
];

export const cashflowStatementRows = [
  { rubrica: "Atividades Operacionais",      atual:  236400, anterior: 198700, varAbs:  37700, header: true },
  { rubrica: "Recebimentos de Clientes",     atual: 1280000, anterior: 1054000, varAbs: 226000, indent: true },
  { rubrica: "Pagamentos a Fornecedores",    atual: -675000, anterior: -560000, varAbs: -115000, indent: true },
  { rubrica: "Pagamentos ao Pessoal",        atual:  -95000, anterior:  -83000, varAbs:  -12000, indent: true },
  { rubrica: "Atividades de Investimento",   atual: -145000, anterior: -120000, varAbs:  -25000, header: true },
  { rubrica: "Atividades de Financiamento",  atual:  -41300, anterior:  -35000, varAbs:   -6300, header: true },
  { rubrica: "Variação Líquida de Caixa",    atual:   50100, anterior:  43700, varAbs:    6400, bold: true },
];

// ─── Relatório (overview) ────────────────────────────────────

export const reportMetrics = {
  receitas: 1250000, receitasDelta: 18.7,
  lucro:    142500,  lucroDelta:    24.3,
  ebitda:   210300,  ebitdaDelta:   21.5,
  margem:   11.4,    margemDelta:   1.8,
  caixaFim: 187600,  caixaDelta:    15.2,
  roi:      18.7,    roiDelta:      2.6,
};

export const reportForecast = [
  { mes: "Jan-Jun (Real)",   receitas: 612500, ebitda: 98400, lucro: 66500, caixa: 187600, confianca: 100 },
  { mes: "Jul-Dez (Forecast)", receitas: 637500, ebitda: 111900, lucro: 76000, caixa: 295400, confianca: 85 },
  { mes: "Total 2026",       receitas: 1250000, ebitda: 210300, lucro: 142500, caixa: 295400, confianca: 92 },
];

export const reportBudget = [
  { mes: "Jan-Jun 2027", receitas: 675000, ebitda: 117000, lucro:  79000, caixa: 215000 },
  { mes: "Jul-Dez 2027", receitas: 725000, ebitda: 135000, lucro:  92000, caixa: 335000 },
  { mes: "Ano 2027",     receitas: 1400000, ebitda: 252000, lucro: 171000, caixa: 335000 },
];

export const reportSections = [
  { id: "pl",      label: "Demonstração de Resultados",  desc: "P&L completo com variações",       icon: "FileText"     },
  { id: "balance", label: "Balanço",                     desc: "Ativo, Capital Próprio e Passivo", icon: "Scale"        },
  { id: "cf",      label: "Cashflow",                    desc: "Fluxos de caixa por atividade",    icon: "ArrowLeftRight"},
  { id: "kpi",     label: "KPIs Operacionais",            desc: "Indicadores de gestão",            icon: "Activity"     },
  { id: "inv",     label: "KPIs de Investimento",         desc: "ROI, ROE, VPL, TIR",                icon: "TrendingUp"   },
  { id: "fc",      label: "Forecast",                    desc: "Projeção do ano corrente",          icon: "CalendarRange"},
  { id: "bd",      label: "Budget",                      desc: "Orçamento do ano seguinte",         icon: "ClipboardList"},
];

// ─── Finer Score ─────────────────────────────────────────────

export const finerScore = {
  score:     78,
  previous:  71,
  label:     "Bom",
  estado:    "Saudável",
  ultimaAtualizacao: "30/05/2026 às 09:30",
  variacao:  +7,
  historico: [
    { mes: "Nov 25", score: 58, label: "Regular" },
    { mes: "Dez 25", score: 62, label: "Regular" },
    { mes: "Jan 26", score: 66, label: "Bom"     },
    { mes: "Fev 26", score: 71, label: "Bom"     },
    { mes: "Mar 26", score: 71, label: "Bom"     },
    { mes: "Abr 26", score: 78, label: "Bom"     },
  ],
  fatores: [
    { key: "liquidez",       label: "Liquidez",        score: 82, badge: "Muito Bom", color: "#10B981" },
    { key: "rentabilidade",  label: "Rentabilidade",   score: 75, badge: "Bom",       color: "#10B981" },
    { key: "endividamento",  label: "Endividamento",   score: 68, badge: "Regular",   color: "#f59e0b" },
    { key: "crescimento",    label: "Crescimento",     score: 87, badge: "Muito Bom", color: "#10B981" },
    { key: "pontualidade",   label: "Pontualidade",    score: 78, badge: "Bom",       color: "#10B981" },
  ],
  comoMelhorar: [
    { id: "fm1", titulo: "Reduzir prazo médio de recebimento", descricao: "Melhore o cashflow e a liquidez.",       impacto: "+8 pts" },
    { id: "fm2", titulo: "Aumentar margem de lucro",            descricao: "Foque nos produtos e serviços mais rentáveis.", impacto: "+6 pts" },
    { id: "fm3", titulo: "Reduzir nível de endividamento",      descricao: "Menos dívida significa mais solidez.",          impacto: "+5 pts" },
  ],
};

// ─── IA Financeira ───────────────────────────────────────────

export const aiInsights = [
  {
    id: "ai1", tone: "danger",
    title: "Queda de margem bruta",
    description: "A margem bruta caiu 6,2 p.p. nos últimos 2 meses.",
    cta: "Ver análise",
  },
  {
    id: "ai2", tone: "warning",
    title: "Aumento de despesas fixas",
    description: "Despesas fixas subiram 18% face ao período anterior.",
    cta: "Ver detalhes",
  },
  {
    id: "ai3", tone: "info",
    title: "Melhoria de prazo médio",
    description: "Prazo médio de recebimento melhorou 9 dias face a Abril.",
    cta: "Ver impacto",
  },
  {
    id: "ai4", tone: "success",
    title: "Liquidez saudável",
    description: "A sua posição de tesouraria está estável e acima do limite.",
    cta: "Ver resumo",
  },
];

export const aiDetail = {
  titulo:   "Queda de margem bruta",
  resumo:   "A margem bruta passou de 28,4% para 22,2% nos últimos 2 meses, principalmente devido ao aumento do custo das mercadorias vendidas.",
  impacto:  -18420,
  prazo:    "Próximos 3 meses",
  evolucao: [
    { mes: "Fev 26", valor: 28.4 },
    { mes: "Mar 26", valor: 26.7 },
    { mes: "Abr 26", valor: 22.2 },
  ],
  fatores: [
    { label: "Custo das mercadorias vendidas", delta: "+14,3%", tone: "down" },
    { label: "Descontos concedidos",            delta: "+8,7%",  tone: "down" },
    { label: "Preço médio de venda",            delta: "-2,1%",  tone: "down" },
  ],
};

export const aiRecommendations = [
  { id: "rec1", title: "Rever preços de venda",       desc: "Ajustar preços pode recuperar margem perdida.",                     impact: 12600 },
  { id: "rec2", title: "Negociar com fornecedores",   desc: "Existe oportunidade de reduzir custos em até 7%.",                  impact: 8340 },
  { id: "rec3", title: "Otimizar prazos de cobrança", desc: "Melhorar a tesouraria em até 15.000 € nos próximos 30 dias.",   impact: 15000 },
];

export const aiConversation = [
  { id: "c1", timestamp: "Hoje, 09:30",  preview: "Notei uma queda de margem bruta de 6,2 p.p. nos últimos 2 meses." },
  { id: "c2", timestamp: "Hoje, 08:45",  preview: "O prazo médio de recebimento melhorou 9 dias. Excelente trabalho!" },
  { id: "c3", timestamp: "Ontem, 17:20", preview: "As despesas fixas aumentaram 18%. Devo continuar a monitorizar." },
];

export const aiQuestions = [
  "Porque é que a minha margem bruta caiu?",
  "Como posso melhorar o cashflow nos próximos 30 dias?",
  "Quais são os meus maiores custos fixos?",
  "E se as vendas caírem 15% no próximo trimestre?",
];

// ─── Alertas Preditivos ──────────────────────────────────────

export const predictiveSummary = {
  riscoElevado:  2,
  atencao:       3,
  informativos:  4,
  sobControle:   12,
};

export const predictiveAlerts = [
  {
    id: "pa1", severity: "danger",
    title: "Risco de problema de tesouraria",
    description: "Dentro de 37 dias poderá ter um saldo negativo de 8.650 €.",
    impactDate: "25/06/2026", confidence: 92, daysAhead: 37,
  },
  {
    id: "pa2", severity: "danger",
    title: "Aumento significativo de despesas",
    description: "As despesas operacionais aumentaram 18% nos últimos 30 dias.",
    impactDate: "Contínuo", confidence: 89,
  },
  {
    id: "pa3", severity: "warning",
    title: "Pico de pagamentos em breve",
    description: "Concentração de 24.300 € em pagamentos entre 15 e 25 Junho.",
    impactDate: "15 — 25 Jun 2026", confidence: 75,
  },
  {
    id: "pa4", severity: "warning",
    title: "Cliente com atraso recorrente",
    description: "O cliente Lusitana Distribuição tem atrasos médios de 23 dias.",
    impactDate: "Contínuo", confidence: 72,
  },
  {
    id: "pa5", severity: "info",
    title: "Oportunidade de melhorar margem",
    description: "Pode aumentar a margem em até 4,2% otimizando custos de fornecedores.",
    impactDate: "30 — 60 dias", confidence: 68,
  },
];

export const predictiveForecast = [
  { dia: "01 Mai", saldo: 32400, zone: "neutral" },
  { dia: "08 Mai", saldo: 38900, zone: "neutral" },
  { dia: "15 Mai", saldo: 42100, zone: "neutral" },
  { dia: "22 Mai", saldo: 34800, zone: "neutral" },
  { dia: "29 Mai", saldo: 28900, zone: "neutral" },
  { dia: "05 Jun", saldo: 18400, zone: "warn"    },
  { dia: "12 Jun", saldo:  8200, zone: "warn"    },
  { dia: "19 Jun", saldo:  -800, zone: "danger"  },
  { dia: "25 Jun", saldo: -8650, zone: "danger"  },
  { dia: "30 Jun", saldo: -6100, zone: "danger"  },
];

// ─── Documentos ──────────────────────────────────────────────

export const docsMetrics = {
  total:        248,
  esteMes:      34,
  esteMesDelta: 12,
  armazenamento:{ usado: 2.45, total: 10, unit: "GB" },
};

export const docsByCategory = [
  { name: "Faturas de Fornecedores", value: 95, color: "#10B981" },
  { name: "Recibos",                 value: 67, color: "#2563eb" },
  { name: "Faturas de Clientes",     value: 45, color: "#7C3AED" },
  { name: "Contratos",               value: 24, color: "#f59e0b" },
  { name: "Outros",                  value: 17, color: "#94a3b8" },
];

export const docsList = [
  { id: "d1",  nome: "Fatura FT 2026/130.pdf",    categoria: "Faturas de Clientes",     contraparte: "Lusitana Distribuição",  data: "30/05/2026", valor: 4250, origem: "Upload"     },
  { id: "d2",  nome: "Recibo Combustível.jpg",     categoria: "Recibos",                 contraparte: "BP Portugal",            data: "28/05/2026", valor:  186, origem: "Mobile App" },
  { id: "d3",  nome: "Fatura V/452.pdf",           categoria: "Faturas de Fornecedores", contraparte: "Vasco & Lemos, Lda",     data: "28/05/2026", valor: 3180, origem: "Email"      },
  { id: "d4",  nome: "Recibo Almoço Equipa.jpg",    categoria: "Recibos",                 contraparte: "—",                       data: "27/05/2026", valor:   45, origem: "Mobile App" },
  { id: "d5",  nome: "Contrato Serviços.pdf",      categoria: "Contratos",               contraparte: "Contas & Cia, Lda",      data: "25/05/2026", valor: null, origem: "Upload"     },
  { id: "d6",  nome: "Fatura FT 2026/128.pdf",     categoria: "Faturas de Clientes",     contraparte: "Tagus Comercial, S.A.",  data: "25/05/2026", valor: 1800, origem: "Email"      },
  { id: "d7",  nome: "Recibo Eletricidade.pdf",    categoria: "Recibos",                 contraparte: "EDP Comercial",          data: "22/05/2026", valor:  340, origem: "Email"      },
  { id: "d8",  nome: "Fatura V/440.pdf",           categoria: "Faturas de Fornecedores", contraparte: "Vasco & Lemos, Lda",     data: "12/04/2026", valor: 1680, origem: "Email"      },
  { id: "d9",  nome: "Declaração IRC 2025.pdf",    categoria: "Outros",                  contraparte: "—",                       data: "10/05/2026", valor: null, origem: "Upload"     },
  { id: "d10", nome: "Relatório Despesas Mai.xlsx", categoria: "Outros",                  contraparte: "—",                       data: "08/05/2026", valor: null, origem: "Upload"     },
  { id: "d11", nome: "Fatura A/0231.pdf",           categoria: "Faturas de Fornecedores", contraparte: "Acme Software, Lda",     data: "15/05/2026", valor: 1720, origem: "Email"      },
  { id: "d12", nome: "Contrato Arrendamento.pdf",   categoria: "Contratos",               contraparte: "ImoCentral, Lda",        data: "01/04/2026", valor: 1450, origem: "Upload"     },
];

// ─── Benchmarking do Setor ───────────────────────────────────

export const benchmarkMetrics = {
  setor: "Comércio a Retalho",
  margemEbitda:   { empresa: 12.4, setor:  7.8, melhor: 15.2, posicao: "Acima de 68% das empresas" },
  liquidezCorr:   { empresa: 1.68, setor: 1.23, melhor: 2.35, posicao: "Acima de 72% das empresas" },
  prazoRec:       { empresa:   32, setor:   45, melhor:   28, posicao: "Melhor que 71% das empresas" },
  endividamento:  { empresa: 48.2, setor: 56.7, melhor: 38.1, posicao: "Melhor que 65% das empresas" },
};

export const benchmarkComparison = [
  { kpi: "Margem de Lucro Líquido", desc: "Resultado líquido / Receitas",        empresa:  7.6, setor: 4.8, melhor:  9.6, unit: "%"    },
  { kpi: "Margem EBITDA",            desc: "EBITDA / Receitas",                   empresa:  7.8, setor: 7.8, melhor: 15.2, unit: "%"    },
  { kpi: "Liquidez Corrente",        desc: "Ativo corrente / Passivo corrente",   empresa: 1.68, setor: 1.23, melhor: 2.35, unit: ""     },
  { kpi: "Prazo Médio Recebimento",  desc: "Contas a receber / Vendas diárias",   empresa:   32, setor:  45, melhor:   28, unit: " dias",inverse: true },
  { kpi: "Prazo Médio Pagamento",    desc: "Contas a pagar / Compras diárias",    empresa:   35, setor:  35, melhor:   52, unit: " dias" },
  { kpi: "Endividamento",            desc: "Passivo total / Ativo total",         empresa: 48.2, setor: 56.7, melhor: 38.1, unit: "%",   inverse: true },
];

export const benchmarkInsights = [
  { tone: "success", text: "A sua Margem EBITDA está acima da média do setor, demonstrando boa eficiência operacional." },
  { tone: "success", text: "O prazo médio de recebimento é melhor que a média, o que beneficia o cashflow." },
  { tone: "info",    text: "O endividamento está ligeiramente abaixo da média — pode existir espaço para alavancagem estratégica." },
  { tone: "success", text: "A liquidez corrente está acima da média do setor. Excelente capacidade de cumprir obrigações." },
];

export const benchmarkPosition = 68;
