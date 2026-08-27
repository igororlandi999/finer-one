// Testes do motor determinístico do Chat Financeiro.
// Contratos centrais: responder com dados reais, limitar-se com honestidade
// e nunca inventar números no fallback.

import { describe, it, expect } from "vitest";
import { answerQuestion, buildWelcome, SUPPORTED_QUESTIONS } from "./chatEngine.js";

const salesFixture = {
  /* CONTRATO REAL de `buildResumo` (24/08/2026): `despesas`, `despesasDelta`,
   * `resultado` e `resultadoDelta` deixaram de ser emitidos com dados reais. A fixture
   * seguia a emitir os campos legados, ou seja: testava um dataset que já não existe.
   * `receitasMonthKey` (último mês com pedidos) e `contasPagarMonthKey` (mês civil) são
   * deliberadamente MESES DIFERENTES — é assim na produção, e é a razão de os cartões
   * terem de nomear cada um o seu mês. */
  resumo: {
    metrics: {
      receitas: 5000, receitasDelta: -50, receitasMonthKey: "2026-06",
      contasPagar: 3500, contasPagarMonthKey: "2026-07",
    },
  },
  diagnostico: {
    estado: "Aten\u00e7\u00e3o", score: 57, scoreLabel: "Regular",
    prioridadeMaxima: "Contas a pagar vencidas",
    resumoExecutivo: "No m\u00eas em an\u00e1lise, a empresa faturou 5000,00 \u20ac...",
    penalizacoes: [
      { pts: 15, motivo: "Quebra de fatura\u00e7\u00e3o face ao m\u00eas anterior" },
      { pts: 15, motivo: "Valor vencido elevado face \u00e0s despesas do m\u00eas" },
    ],
    problemas: [{ id: "pr-vencidas", severidade: "danger", titulo: "Contas a pagar vencidas", descricao: "6 t\u00edtulos...", impacto: -31029.6 }],
    acoes: [{ titulo: "Regularizar contas vencidas", prazo: "15 dias", descricao: "Priorizar o pagamento..." }],
    mudancasUltimoMes: [{ label: "Fatura\u00e7\u00e3o", valor: "-50%", tendencia: "down", detalhe: "vs m\u00eas anterior" }],
  },
  fornecedores: {
    metrics: { saldoPagar: 3500, faturasAbertasPagar: 2 },
    top: [{ nome: "Fornecedor X", faturasAbertas: 2, saldo: 3500 }],
    openInvoices: [{ fornecedor: "Fornecedor X", vencimento: "01/07/2026", valor: 2000, diasAtraso: 14 }],
  },
  despesas: { metrics: { totalMes: 3500 }, byCategory: [{ name: "Compras", value: 3000 }] },
  clientes: { top: [{ nome: "Cliente A", faturasAbertas: 1, saldo: 5000 }], concentracao: 93.3 },
  alertas: { list: [{ severity: "danger", title: "Contas a pagar vencidas", description: "..." }] },
};

describe("pergunta sobre o score", () => {
  it("responde com o score real e as penaliza\u00e7\u00f5es ponto a ponto", () => {
    const r = answerQuestion("Porque \u00e9 que o meu score est\u00e1 baixo?", salesFixture);
    expect(r.content).toContain("57/100");
    expect(r.highlights).toBeDefined();
    expect(r.highlights.some((h) => h.includes("-15 pts") && /Quebra de fatura\u00e7\u00e3o/.test(h))).toBe(true);
    expect(r.highlights).toHaveLength(salesFixture.diagnostico.penalizacoes.length);
  });

  it("sem diagn\u00f3stico dispon\u00edvel responde limita\u00e7\u00e3o, sem inventar score", () => {
    const r = answerQuestion("Porque \u00e9 que o meu score est\u00e1 baixo?", { resumo: salesFixture.resumo, diagnostico: null });
    expect(r.content).toMatch(/contas a pagar reais/i);
    expect(r.content).not.toMatch(/\d+\/100/);
  });
});

describe("limita\u00e7\u00f5es honestas", () => {
  /* \u2500\u2500 SALDO BANC\u00c1RIO vs. TESOURARIA PREVISTA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   * Estas duas perguntas tinham a MESMA resposta \u2014 uma recusa \u2014 e s\u00f3 uma delas a
   * merecia. A recusa de tesouraria dizia que faltavam "receb\u00edveis com datas de
   * vencimento, que ainda n\u00e3o est\u00e3o ligados"; est\u00e3o ligados desde a fase 1B, e o
   * cart\u00e3o "Cashflow previsto" do Resumo desenha a varia\u00e7\u00e3o l\u00edquida a partir deles.
   * O produto contradizia-se, e a afirma\u00e7\u00e3o falsa era a do Chat.
   *
   * Saldo banc\u00e1rio continua a n\u00e3o existir e continua a ser recusado: nenhum somat\u00f3rio
   * de t\u00edtulos \u00e9 um saldo. */
  it("saldo banc\u00e1rio continua recusado \u2014 nenhum somat\u00f3rio de t\u00edtulos o substitui", () => {
    for (const q of ["Qual \u00e9 o meu saldo banc\u00e1rio?", "Quanto tenho no banco?"]) {
      const r = answerQuestion(q, salesFixture);
      expect(r.content).toMatch(/integra\u00e7\u00e3o banc\u00e1ria|open banking/i);
      expect(r.content).toMatch(/n\u00e3o tenho saldo banc\u00e1rio/i);
      expect(r.table).toBeUndefined();
      expect(r.metrics).toBeUndefined();
    }
  });

  it("tesouraria prevista \u00e9 respondida a partir dos t\u00edtulos reais, e nunca como saldo", () => {
    const r = answerQuestion("Qual a previs\u00e3o de cashflow?", salesFixture);
    expect(r.content).toContain("30 dias");
    // A ressalva n\u00e3o \u00e9 decorativa: \u00e9 o que distingue varia\u00e7\u00e3o de saldo.
    expect(r.content).toMatch(/varia\u00e7\u00e3o, n\u00e3o saldo/i);
    expect(r.content).toMatch(/n\u00e3o prev\u00ea vendas futuras/i);
    expect(r.metrics.map((m) => m.label).join(" ")).toMatch(/A receber.*A pagar.*Varia\u00e7\u00e3o l\u00edquida/);
  });

  it("pergunta para al\u00e9m da janela responde pela janela e declara o limite", () => {
    /* "Pr\u00f3ximo trimestre" n\u00e3o se extrapola. Responde-se com o que existe (60 dias) e
     * diz-se que para l\u00e1 disso n\u00e3o se projeta \u2014 em vez de recusar tudo ou inventar. */
    const r = answerQuestion("Consegues prever o pr\u00f3ximo trimestre?", salesFixture);
    expect(r.content).toContain("60 dias");
    expect(r.content).toMatch(/n\u00e3o projeto|extrapola\u00e7\u00e3o/i);
  });

  it("sem t\u00edtulos carregados n\u00e3o se projeta nada", () => {
    const r = answerQuestion("Qual a previs\u00e3o de cashflow?", { resumo: salesFixture.resumo });
    expect(r.content).toMatch(/n\u00e3o consigo projetar tesouraria/i);
    expect(r.metrics).toBeUndefined();
  });

  it("IVA e impostos devolvem a limita\u00e7\u00e3o fiscal", () => {
    const r = answerQuestion("Tenho IVA a pagar ou a receber?", salesFixture);
    expect(r.content).toMatch(/dados fiscais/i);
    expect(r.content).toMatch(/n\u00e3o tenho/i);
  });
});

describe("fallback", () => {
  it("pergunta fora do repert\u00f3rio lista o que sabe responder, sem inventar n\u00fameros", () => {
    const r = answerQuestion("Qual \u00e9 a capital de Fran\u00e7a?", salesFixture);
    expect(r.content).toMatch(/n\u00e3o consigo responder/i);
    expect(r.highlights).toEqual(SUPPORTED_QUESTIONS);
    expect(r.content).not.toContain("\u20ac");
    expect(r.table).toBeUndefined();
    expect(r.metrics).toBeUndefined();
  });
});

describe("boas-vindas", () => {
  it("cita o estado real quando h\u00e1 diagn\u00f3stico", () => {
    const w = buildWelcome(salesFixture);
    expect(w.content).toContain("Aten\u00e7\u00e3o");
    expect(w.content).toContain("57/100");
  });

  it("sem diagn\u00f3stico avisa a limita\u00e7\u00e3o em vez de citar score", () => {
    const w = buildWelcome({ resumo: salesFixture.resumo });
    expect(w.content).not.toMatch(/\d+\/100/);
    expect(w.content).toMatch(/contas a pagar/i);
  });
});

describe("Chat — respostas a partir da DRE central", () => {
  const finDe = (over = {}) => ({
    monthKey: "2026-06",
    metrics: {
      monthKey: "2026-06",
      revenue: { net: 175566.72, gross: 206227.15 },
      cmv: { value: 116039.70, pctOfNetRevenue: 66.09 },
      operatingExpenses: { total: 8406.68, pctOfNetRevenue: 4.79 },
      profitability: {
        netResult: 522.50, netMarginPct: 0.30,
        ebitda: 51120.34, ebitdaMarginPct: 29.12,
        grossProfit: 59527.02, grossMarginPct: 33.91,
        availability: {},
      },
      ...over,
    },
    previous: null, comparable: false, emCurso: null,
  });
  const salesCom = (fin) => ({ ...salesFixture, financeiro: fin });

  it("A. 'qual foi o meu resultado?' responde o netResult da DRE e informa o mês", () => {
    const r = answerQuestion("qual foi o meu resultado?", salesCom(finDe()));
    // Mes por extenso, como no resto do produto — nunca a chave crua "2026-06".
    expect(r.content).toContain("junho de 2026");
    expect(r.content).toContain("522,50");
    expect(r.content).toContain("resultado líquido");
  });

  it("B. sem CMV não responde pseudo-resultado e explica o limite", () => {
    const semCmv = finDe({ profitability: { netResult: null, netMarginPct: null, ebitda: null, availability: {} } });
    const r = answerQuestion("qual foi o meu lucro?", salesCom(semCmv));
    expect(r.content).toContain("não pode ser apurado");
    expect(r.content).toContain("CMV");
    expect(r.content).toContain("175.566,72"); // dá o que sabe: receita líquida
    expect(r.content).not.toMatch(/resultado líquido foi de/);
  });

  it("C. 'qual a minha margem?' usa netMarginPct", () => {
    const r = answerQuestion("qual a minha margem?", salesCom(finDe()));
    expect(r.content).toContain("margem líquida");
    expect(r.content).toContain("0,3%");
  });

  it("D. 'qual o meu ebitda?' usa o EBITDA da DRE", () => {
    const r = answerQuestion("qual o meu ebitda?", salesCom(finDe()));
    expect(r.content).toContain("51.120,34");
    expect(r.content).toContain("29,12%");
  });

  it("E. 'qual a minha receita líquida?' usa a receita líquida", () => {
    const r = answerQuestion("qual a minha receita liquida?", salesCom(finDe()));
    expect(r.content).toContain("175.566,72");
  });

  it("F. 'quanto tenho a pagar?' usa contas a pagar, não a DRE", () => {
    const r = answerQuestion("quanto tenho a pagar?", salesCom(finDe()));
    expect(r.content).toMatch(/contas a pagar/i);
    expect(r.content).toContain("tesouraria");
    expect(r.content).not.toContain("8.406,68"); // não é a despesa operacional da DRE
    // O mês é o CIVIL, por vencimento — não o mês âncora da DRE (junho de 2026).
    expect(r.content).toContain("3.500,00");
    expect(r.content).toContain("julho de 2026");
    expect(r.content).not.toContain("junho de 2026");
  });

  it("G. 'quanto gastei?' deixa explícito o conceito usado", () => {
    const r = answerQuestion("quanto gastei?", salesCom(finDe()));
    expect(r.content).toMatch(/contas a pagar|despesas operacionais/);
  });

  it("G2. 'qual a minha despesa operacional?' usa a DRE e dá o peso", () => {
    const r = answerQuestion("qual a minha despesa operacional?", salesCom(finDe()));
    expect(r.content).toContain("8.406,68");
    expect(r.content).toContain("4,79%");
  });

  it("H. pergunta sobre o mês em curso identifica que está em andamento", () => {
    const fin = { ...finDe(), emCurso: { monthKey: "2026-07", revenue: { net: 30000 }, profitability: {} } };
    const r = answerQuestion("como está o mês atual?", salesCom(fin));
    expect(r.content).toContain("2026-07");
    expect(r.content).toContain("andamento");
    expect(r.content).toContain("não são diretamente comparáveis");
  });

  it("I. não afirma queda categórica com mês parcial", () => {
    const fin = { ...finDe(), emCurso: { monthKey: "2026-07", revenue: { net: 30000 }, profitability: {} } };
    const r = answerQuestion("como está o mês em curso?", salesCom(fin));
    expect(r.content).not.toMatch(/caiu \d|desceu \d|queda de \d/);
  });

  it("J. moeda em R$, sem qualquer €", () => {
    const perguntas = ["qual foi o meu resultado?", "qual a minha margem?", "qual o meu ebitda?", "quanto tenho a pagar?"];
    for (const p of perguntas) {
      const r = answerQuestion(p, salesCom(finDe()));
      expect(r.content).not.toContain("€");
    }
    expect(answerQuestion("qual foi o meu resultado?", salesCom(finDe())).content).toContain("R$");
  });

  it("K. null nunca vira zero", () => {
    const nulo = finDe({ revenue: { net: null, gross: null }, profitability: { netResult: null, netMarginPct: null, ebitda: null, availability: {} } });
    const r = answerQuestion("qual a minha receita liquida?", salesCom(nulo));
    expect(r.content).toContain("indisponível");
    expect(r.content).not.toMatch(/R\$\s*0,00/);
  });

  it("sem camada financeira não inventa resultado", () => {
    const r = answerQuestion("qual foi o meu resultado?", { ...salesFixture, financeiro: null });
    expect(r.content).toContain("não posso apurar");
  });
});
/* ══════════════════════════════════════════════════════════════════════════════════
 * RESSALVA DE DISPONIBILIDADE.
 *
 * O Chat era a única superfície do produto que afirmava um número sem dizer de que
 * material é feito. A Performance marca "Dados parciais" e "Inclui valor manual"; o
 * Chat dizia "o EBITDA foi de X" e ficava por aí — sobre um EBITDA que podia ser um
 * mínimo conhecido, ou assentar num CMV escrito à mão pelo utilizador.
 *
 * Ganhou urgência com a separação de "mês completo" e "mês elegível como âncora": a
 * âncora ficou mais exigente, pelo que o caminho de recurso (um mês com linhas
 * parciais, quando nenhum é elegível) passou a ser percorrido com mais frequência.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — ressalva de disponibilidade", () => {
  const finComDisp = (disp) => ({
    monthKey: "2026-06",
    metrics: {
      monthKey: "2026-06",
      revenue: { net: 175566.72, gross: 206227.15, netAvailability: disp },
      cmv: { value: 116039.70, pctOfNetRevenue: 66.09, availability: disp },
      operatingExpenses: { total: 8406.68, pctOfNetRevenue: 4.79, availability: disp },
      profitability: {
        netResult: 522.50, netMarginPct: 0.30,
        ebitda: 51120.34, ebitdaMarginPct: 29.12,
        grossProfit: 59527.02, grossMarginPct: 33.91,
        availability: { ebitda: disp, netResult: disp, netMarginPct: disp },
      },
    },
    previous: null, comparable: false, emCurso: null,
  });
  const perguntar = (q, disp) => answerQuestion(q, { ...salesFixture, financeiro: finComDisp(disp) }).content;

  it("linha PARCIAL é declarada como mínimo conhecido, não como o valor do mês", () => {
    expect(perguntar("qual foi o ebitda?", "partial")).toContain("mínimo conhecido");
    expect(perguntar("qual foi o meu resultado?", "partial")).toContain("mínimo conhecido");
    expect(perguntar("quais as despesas operacionais?", "partial")).toContain("mínimo conhecido");
  });

  it("valor que inclui CMV manual nunca é apresentado como apurado pela integração", () => {
    for (const disp of ["manual", "mixed"]) {
      expect(perguntar("qual foi o ebitda?", disp)).toContain("introduzido manualmente");
      expect(perguntar("qual foi o meu resultado?", disp)).toContain("introduzido manualmente");
    }
  });

  it("linha REAL não ganha ressalva nenhuma — não se avisa do que não há", () => {
    const r = perguntar("qual foi o ebitda?", "real");
    expect(r).not.toContain("mínimo conhecido");
    expect(r).not.toContain("introduzido manualmente");
    expect(r).toContain("51.120,34");
  });

  it("availability ausente não inventa ressalva", () => {
    const r = answerQuestion("qual foi o ebitda?", { ...salesFixture, financeiro: finComDisp(undefined) }).content;
    expect(r).not.toContain("mínimo conhecido");
    expect(r).not.toContain("introduzido manualmente");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * CARTÕES DO MÊS — migração do contrato legado de `resumo.metrics`.
 *
 * O cartão "Resultado (mês)" mostrava `receita − contas a pagar`: a métrica que o
 * projeto proíbe explicitamente, banida do Diagnóstico e do texto do Chat — e que
 * continuava a sair pelos cartões, com um tom verde/vermelho a dar-lhe autoridade.
 * O cartão "Despesas (mês)" chamava despesas a contas a pagar. E nenhum dizia de que
 * mês era — nem eram sequer todos do mesmo mês.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — cartões do mês", () => {
  const salesCartoes = (over = {}) => ({
    ...salesFixture,
    diagnostico: { estado: "Atenção", score: 57, scoreLabel: "Razoável", resumoExecutivo: "—" },
    resumo: {
      metrics: {
        receitas: 355053.57, receitasDelta: 105.4, receitasMonthKey: "2026-08",
        contasPagar: 344124.44, contasPagarMonthKey: "2026-08",
        // Campos LEGADO ainda presentes no serviço (o Resumo usa-os no modo demo).
        despesas: 336461.88, despesasDelta: -79.44,
        resultado: 18591.69, resultadoDelta: 12.3,
      },
    },
    financeiro: {
      monthKey: "2026-06",
      metrics: {
        monthKey: "2026-06",
        revenue: {}, deductions: {}, cmv: {}, operatingExpenses: {},
        profitability: { netResult: 19114.59, availability: { netResult: "mixed" } },
      },
    },
    ...over,
  });
  const cartoes = (sales) => answerQuestion("a minha empresa está saudável?", sales).metrics;

  it("NUNCA mostra o pseudo-resultado `receita − contas a pagar`", () => {
    const cs = cartoes(salesCartoes());
    // 18.591,69 é o valor legado. Não pode aparecer em cartão nenhum.
    expect(JSON.stringify(cs)).not.toContain("18.591,69");
    // E não existe cartão com o rótulo nu "Resultado (mês)".
    expect(cs.map((c) => c.label)).not.toContain("Resultado (mês)");
  });

  it("o resultado vem da DRE, com o mês âncora e a ressalva de disponibilidade", () => {
    const c = cartoes(salesCartoes()).find((x) => x.label.startsWith("Resultado líquido"));
    expect(c.label).toBe("Resultado líquido · junho de 2026");
    expect(c.value).toContain("19.114,59");
    expect(c.note).toBe("Inclui o CMV introduzido manualmente.");
  });

  it("sem resultado calculável, o cartão simplesmente não existe", () => {
    /* Ausência de base diz-se calando o cartão — nunca com um número parecido. Era
     * exatamente aqui que o pseudo-resultado entrava a preencher o buraco. */
    const semDre = salesCartoes({
      financeiro: { monthKey: "2026-06", metrics: { monthKey: "2026-06", profitability: { netResult: null, availability: {} } } },
    });
    expect(cartoes(semDre).map((c) => c.label).some((l) => l.startsWith("Resultado"))).toBe(false);
  });

  it("contas a pagar são chamadas pelo nome, com o mês civil e sem delta", () => {
    const c = cartoes(salesCartoes()).find((x) => x.label.startsWith("Contas a pagar"));
    expect(c.label).toBe("Contas a pagar · agosto de 2026");
    expect(c.tone).toBe("neutral");     // não é boa nem má notícia
    expect(c.delta).toBeNull();          // mês em curso vs. mês completo não é variação
  });

  it("todos os cartões nomeiam o seu mês — e podem ser meses diferentes", () => {
    const cs = cartoes(salesCartoes());
    for (const c of cs) expect(c.label).toMatch(/ · [a-zç]+ de \d{4}$/);
    // Receitas em agosto, resultado em junho: meses distintos, ambos declarados.
    expect(cs.find((c) => c.label.startsWith("Receitas")).label).toContain("agosto de 2026");
    expect(cs.find((c) => c.label.startsWith("Resultado")).label).toContain("junho de 2026");
  });

  it("sem `receitasMonthKey` o rótulo degrada, nunca inventa mês", () => {
    const semMes = salesCartoes({
      resumo: { metrics: { receitas: 100, receitasDelta: 0 } },
      financeiro: null,
    });
    expect(cartoes(semMes)[0].label).toBe("Receitas");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * MESES NOMEADOS NA PERGUNTA — FASE 4.
 *
 * Três das nove perguntas do guião caíam no fallback ("Como foi julho?", "Estamos
 * lucrando?", "Qual foi o melhor mês?") e uma respondia sobre o MÊS ERRADO sem o
 * dizer: "porque é que julho não aparece na rentabilidade?" contém "rentabilid" e era
 * atendida pelo ramo da DRE, que responde sempre sobre o mês âncora. Com a âncora em
 * junho, a resposta a uma pergunta sobre julho era o valor de junho — um número
 * verdadeiro colado ao mês errado, que é a pior classe de erro deste produto.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — meses nomeados na pergunta", () => {
  const metricsDe = (mk, over = {}) => ({
    monthKey: mk,
    revenue: { net: 175566.72, gross: 206227.15, netAvailability: "real" },
    deductions: {}, cmv: { value: 116039.70, availability: "manual" },
    operatingExpenses: { total: 8406.68, pctOfNetRevenue: 4.79, availability: "real" },
    profitability: {
      netResult: 522.50, netMarginPct: 0.30, ebitda: 51120.34, ebitdaMarginPct: 29.12,
      availability: { netResult: "real", netMarginPct: "real", ebitda: "real" },
    },
    ...over,
  });

  /* Âncora em JUNHO. Julho existe como mês civil encerrado, está na janela de fechos,
   * e não é âncora — a configuração exata em que a pergunta por julho era respondida
   * com junho. */
  const base = {
    ...salesFixture,
    orders: [
      { date: "2026-04-10", total: 100000, status: "recebida" },
      { date: "2026-05-10", total: 120000, status: "recebida" },
      { date: "2026-06-10", total: 175566.72, status: "recebida" },
      { date: "2026-07-10", total: 160000, status: "recebida" },
      { date: "2026-08-10", total: 90000, status: "recebida" },
    ],
    financeiro: {
      monthKey: "2026-06",
      civilMonthKey: "2026-07",
      anchorEligible: true,
      anchorSource: "eligible",
      anchorFinancial: { monthKey: "2026-06", anchorBlockers: [], blockers: [] },
      metrics: metricsDe("2026-06"),
      previous: metricsDe("2026-05", {
        revenue: { net: 120000, gross: 130000, netAvailability: "real" },
        profitability: { netResult: 4000, netMarginPct: 3.33, availability: { netResult: "real" } },
      }),
      emCurso: metricsDe("2026-08", {
        revenue: { net: 90000, gross: 95000, netAvailability: "partial" },
        profitability: { netResult: null, netMarginPct: null, availability: {} },
      }),
      comparable: false,
    },
    closings: [
      {
        monthKey: "2026-07",
        financial: {
          monthKey: "2026-07",
          anchorEligible: false,
          anchorBlockers: ["requisitos_por_preencher", "analise_incompleta"],
          blockers: [
            { key: "cmv", label: "CMV", causes: ["por_informar"] },
            { key: "operatingExpenses", label: "Despesas operacionais", causes: ["cobertura", "classificacao"] },
          ],
        },
      },
      { monthKey: "2026-06", financial: { monthKey: "2026-06", anchorEligible: true, anchorBlockers: [], blockers: [] } },
    ],
  };
  const perguntar = (q, sales = base) => answerQuestion(q, sales);

  /* A armadilha que obrigou a fronteiras de palavra: "maior" contém "maio", e esta é
   * uma das perguntas SUGERIDAS pelo próprio Chat. Um `includes` mandava-a responder
   * sobre maio de 2026. */
  it("'maior' não é lido como 'maio'", () => {
    const r = perguntar("Qual o maior risco financeiro agora?");
    expect(r.content).toContain("maior risco identificado");
    expect(r.content).not.toContain("maio de 2026");
  });

  it("'Como foi julho?' responde sobre JULHO — não sobre o mês âncora", () => {
    /* Julho não tem DRE apurada no dataset: diz-se isso, diz-se porquê, e o único
     * número dado é faturação bruta — nomeada como faturação, nunca como resultado. */
    const r = perguntar("Como foi julho?");
    expect(r.content).toContain("julho de 2026");
    expect(r.content).toContain("faturação bruta");
    expect(r.content).toContain("160.000,00");
    // O valor de junho NUNCA pode aparecer numa resposta sobre julho.
    expect(r.content).not.toContain("175.566,72");
    expect(r.content).not.toMatch(/margem líquida/);
  });

  it("mês nomeado que TEM métricas responde com as desse mês", () => {
    const r = perguntar("qual foi o resultado de maio?");
    expect(r.content).toContain("maio de 2026");
    expect(r.content).toContain("4.000,00");
    expect(r.content).not.toContain("522,50"); // o resultado de junho, o mês âncora
  });

  it("mês em curso nomeado é declarado como em curso, sem comparação", () => {
    const r = perguntar("como foi agosto?");
    expect(r.content).toContain("agosto de 2026");
    expect(r.content).toMatch(/ainda está a decorrer|parciais/);
    expect(r.content).not.toMatch(/resultado líquido foi de/);
  });

  it("mês ainda por começar refere-se ao ANO ANTERIOR, nunca ao futuro", () => {
    // Perguntado em agosto de 2026, "dezembro" só pode ser dezembro de 2025.
    const r = perguntar("como foi dezembro?");
    expect(r.content).toContain("dezembro de 2025");
  });

  it("'porque é que julho não aparece' explica a AUSÊNCIA — não devolve a margem de junho", () => {
    const r = perguntar("Por que julho não aparece na rentabilidade?");
    expect(r.content).toContain("Julho de 2026");
    expect(r.content).toContain("não sustenta indicadores de rentabilidade");
    // A redação das causas é a MESMA do Resumo (closingSummaryView.descreverBloqueio).
    expect(r.highlights).toContain("CMV: por preencher");
    expect(r.highlights).toContain("Despesas operacionais: período ainda por fechar na fonte, títulos por classificar");
    // Nada de junho: nem o valor, nem a margem, nem o nome do mês como resposta.
    expect(r.content).not.toContain("0,3%");
    expect(r.content).not.toContain("175.566,72");
  });

  it("âncora obtida por RECURSO nunca é apresentada como mês completo", () => {
    /* `anchorSource: fallback` significa que o mês foi o que sobrou, não o que estava
     * completo. Responder apenas "é o mês de referência" apresentaria um recurso como
     * fecho — precisamente o que a regra do projeto proíbe. */
    const recurso = {
      ...base,
      financeiro: {
        ...base.financeiro,
        monthKey: "2026-07",
        anchorEligible: false,
        anchorSource: "fallback",
        anchorFinancial: base.closings[0].financial,
        metrics: metricsDe("2026-07"),
      },
    };
    const r = perguntar("porque é que julho não aparece na rentabilidade?", recurso);
    expect(r.content).toContain("por recurso");
    expect(r.content).toContain("não pode ser apresentada como definitiva");
    expect(r.highlights).toContain("CMV: por preencher");
  });

  it("mês sem fecho apurado admite o limite em vez de o inventar", () => {
    const semFechos = { ...base, closings: [] };
    const r = perguntar("porque é que julho não aparece na rentabilidade?", semFechos);
    expect(r.content).toMatch(/não consigo dizer com segurança/);
    expect(r.content).toContain("junho de 2026"); // diz qual É o mês de referência
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * AS RESTANTES PERGUNTAS DO GUIÃO DA FASE 4.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — despesas, lucro e melhor mês", () => {
  const finReal = (dispResultado = "real") => ({
    monthKey: "2026-06",
    metrics: {
      monthKey: "2026-06",
      revenue: { net: 175566.72, gross: 206227.15, netAvailability: "real" },
      deductions: {}, cmv: { value: 116039.70, availability: "manual" },
      operatingExpenses: { total: 8406.68, pctOfNetRevenue: 4.79, availability: "real" },
      profitability: {
        netResult: 522.50, netMarginPct: 0.30, ebitda: 51120.34, ebitdaMarginPct: 29.12,
        availability: { netResult: dispResultado, netMarginPct: dispResultado, ebitda: dispResultado },
      },
    },
    previous: null, comparable: false, emCurso: null,
  });
  const com = (fin) => ({ ...salesFixture, financeiro: fin });

  /* "Quanto tivemos de despesas?" caía no ramo da FATURAÇÃO e devolvia um cartão de
   * receitas com uma ressalva sobre contas a pagar. Nunca dizia quanto foram as
   * despesas — que o dataset tinha, apurado, na linha da DRE. */
  it("'quanto tivemos de despesas?' dá a linha da DRE, e separa-a da tesouraria", () => {
    const r = answerQuestion("Quanto tivemos de despesas?", com(finReal()));
    expect(r.content).toContain("despesas operacionais");
    expect(r.content).toContain("8.406,68");
    expect(r.content).toContain("junho de 2026");
    // As contas a pagar entram como CONTRASTE, com o seu próprio mês e o seu nome.
    expect(r.content).toContain("Não confundir com contas a pagar");
    expect(r.content).toContain("3.500,00");
    expect(r.content).toContain("julho de 2026");
    // E não se responde a "despesas" com um cartão de receitas.
    expect(r.metrics).toBeUndefined();
  });

  it("'estamos lucrando?' é respondida — e com base firme dá o veredito", () => {
    const r = answerQuestion("Estamos lucrando?", com(finReal("real")));
    expect(r.content).toMatch(/^Sim\. /);
    expect(r.content).toContain("522,50");
    expect(r.highlights).toBeUndefined(); // não é o fallback
  });

  it("prejuízo com base firme responde NÃO, sem eufemismo", () => {
    const fin = finReal("real");
    fin.metrics.profitability.netResult = -12000;
    const r = answerQuestion("Estamos lucrando?", com(fin));
    expect(r.content).toMatch(/^Não\. /);
  });

  /* Um resultado `partial` é um MÍNIMO CONHECIDO: faltam linhas de custo, pelo que um
   * mínimo positivo pode ficar negativo quando o mês fechar. "Sim" seria a primeira
   * palavra da frase a ser desmentida pela última. */
  it("com dados parciais dá o número e a ressalva, mas NÃO o veredito", () => {
    const r = answerQuestion("Estamos lucrando?", com(finReal("partial")));
    expect(r.content).not.toMatch(/^Sim\./);
    expect(r.content).not.toMatch(/^Não\./);
    expect(r.content).toContain("mínimo conhecido");
    expect(r.content).toContain("522,50");
  });

  it("'qual foi o melhor mês?' responde por faturação, diz o critério e exclui o mês em curso", () => {
    const sales = {
      ...salesFixture,
      orders: [
        { date: "2026-05-10", total: 120000, status: "recebida" },
        { date: "2026-06-10", total: 175000, status: "recebida" },
        { date: "2026-07-10", total: 160000, status: "recebida" },
        { date: "2026-08-10", total: 900000, status: "recebida" }, // em curso: não pode vencer
      ],
      financeiro: { ...finReal(), emCurso: { monthKey: "2026-08", revenue: {}, profitability: {} } },
    };
    const r = answerQuestion("Qual foi o melhor mês?", sales);
    expect(r.content).toContain("junho de 2026");
    expect(r.content).toContain("faturação bruta");
    expect(r.content).toContain("não o resultado");
    expect(r.content).toContain("Agosto de 2026 ficou de fora");
    expect(r.content).not.toContain("900.000,00");
    expect(r.table.rows.some((row) => row[0] === "agosto de 2026")).toBe(false);
  });

  it("sem série mensal real não inventa um melhor mês", () => {
    const r = answerQuestion("Qual foi o melhor mês?", { ...salesFixture, orders: [] });
    expect(r.content).toMatch(/ainda não tenho a série mensal/i);
    expect(r.table).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * MATERIALIDADE — O FACTO, NUNCA A POLÍTICA (FASE 8).
 *
 * "Títulos por classificar" respondia PORQUÊ sem responder QUANTO. Um título de R$ 1 e
 * um de R$ 100 000 produzem o mesmo bloqueio, e a frase era idêntica nos dois casos:
 * quem a lesse não sabia se estava a olhar para uma formalidade ou para um buraco.
 *
 * O que estes testes travam é a fronteira: o Chat passa a dizer o PESO e continua a
 * NÃO ter limiar. Não existe percentagem a partir da qual o produto passe a ignorar um
 * título — isso é decisão contabilística e continua por tomar.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — materialidade dos títulos por classificar", () => {
  const salesCom = (porClassificar) => ({
    ...salesFixture,
    financeiro: {
      monthKey: "2026-06",
      anchorEligible: true,
      metrics: {
        monthKey: "2026-06",
        revenue: { net: 175566.72 }, deductions: {}, cmv: {}, operatingExpenses: {},
        profitability: { netResult: 522.5, netMarginPct: 0.3, availability: { netResult: "real" } },
      },
      previous: null, emCurso: null, comparable: false,
    },
    closings: [{
      monthKey: "2026-07",
      financial: {
        monthKey: "2026-07",
        anchorEligible: false,
        anchorBlockers: ["analise_incompleta"],
        blockers: [{ key: "operatingExpenses", label: "Despesas operacionais", causes: ["classificacao"] }],
      },
    }],
    despesas: { ...salesFixture.despesas, porClassificar },
  });

  const JULHO = [{
    monthKey: "2026-07",
    unclassifiedCount: 3,
    unclassifiedAmount: 1554.35,
    unclassifiedRatio: 0.38,
    items: [],
  }];

  it("diz quantos títulos, quanto pesam e que percentagem do mês são", () => {
    const r = answerQuestion("porque é que julho não aparece na rentabilidade?", salesCom(JULHO));
    expect(r.content).toContain("3 títulos por classificar");
    expect(r.content).toContain("0,38% dos títulos do mês");
    expect(r.content).toContain("1.554,35");
  });

  /* A frase tem de deixar claro que o valor NÃO é o critério — senão o utilizador
   * infere um limiar que não existe ("0,38% é pouco, portanto não bloqueia"). */
  it("não insinua limiar nenhum: declara que qualquer título bloqueia", () => {
    const r = answerQuestion("porque é que julho não aparece na rentabilidade?", salesCom(JULHO));
    expect(r.content).toContain("Qualquer título por classificar");
    expect(r.content).toContain("seja qual for o valor");
    // Nenhum juízo de valor sobre a grandeza medida.
    expect(r.content).not.toMatch(/irrelevante|insignificante|aceitável|desprezável|pouco significativ/i);
  });

  it("um único título usa o singular — a contagem é lida, não presumida", () => {
    const r = answerQuestion("porque é que julho não aparece na rentabilidade?", salesCom([
      { monthKey: "2026-07", unclassifiedCount: 1, unclassifiedAmount: 1, unclassifiedRatio: 0.01, items: [] },
    ]));
    expect(r.content).toContain("1 título por classificar");
    expect(r.content).not.toContain("1 títulos");
  });

  it("sem medição para o mês, a explicação sai sem peso — nunca com um zero inventado", () => {
    const r = answerQuestion("porque é que julho não aparece na rentabilidade?", salesCom([]));
    expect(r.content).toContain("não sustenta indicadores de rentabilidade");
    expect(r.content).not.toContain("por classificar,");
    expect(r.content).not.toMatch(/0 títulos|R\$ 0,00/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * COBERTURA: CADA CAUSA CAI SOZINHA (FASES 13 e 14).
 *
 * Confirmar cobertura não é dizer que o mês está pronto. Um alerta desaparece quando a
 * SUA causa for resolvida, e a cobertura é uma causa entre várias — se confirmar a
 * cobertura calasse também o alerta do CMV, o produto estaria a trocar uma pergunta
 * respondida por uma pergunta escondida.
 *
 * E, para quem lê, "o período ainda não fechou na origem" são DUAS coisas diferentes:
 *   - a cobertura não foi confirmada  -> o utilizador resolve, em dez segundos;
 *   - a leitura do ERP não terminou   -> não há nada que ele possa fazer.
 * Dizer o mesmo nos dois casos manda-o esperar quando podia agir.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("Chat — porque é que o mês ainda não está completo", () => {
  const fecho = (causasOpex, comCmv) => ({
    monthKey: "2026-07",
    financial: {
      monthKey: "2026-07",
      anchorEligible: false,
      anchorBlockers: ["analise_incompleta"],
      blockers: [
        ...(comCmv ? [] : [{ key: "cmv", label: "CMV", causes: ["por_informar"] }]),
        { key: "operatingExpenses", label: "Despesas operacionais", causes: causasOpex },
      ],
    },
  });

  const salesCom = ({ causasOpex = ["cobertura"], comCmv = false, snapshotParcial = false } = {}) => ({
    ...salesFixture,
    financeiro: {
      monthKey: "2026-06",
      anchorEligible: true,
      metrics: {
        monthKey: "2026-06",
        revenue: { net: 100000 }, deductions: {}, cmv: {}, operatingExpenses: {},
        profitability: { netResult: 5000, netMarginPct: 5, availability: { netResult: "real" } },
      },
      previous: null, emCurso: null, comparable: false,
    },
    closings: [fecho(causasOpex, comCmv)],
    coverage: { payables: { completeThroughMonth: "2026-06", snapshotPartial: snapshotParcial } },
    despesas: { ...salesFixture.despesas, porClassificar: [] },
  });

  const perguntar = (q, sales) => answerQuestion(q, sales).content;

  it("'o que falta para julho estar completo?' é reconhecida — sem 'porquê' nenhum", () => {
    const r = perguntar("O que falta para julho estar completo?", salesCom());
    expect(r).toContain("Julho de 2026");
    expect(r).not.toMatch(/não consigo responder a essa pergunta/i);
  });

  it("cobertura por confirmar é apresentada como ACIONÁVEL, e diz onde", () => {
    const r = perguntar("Por que julho ainda não está completo?", salesCom({ snapshotParcial: false }));
    expect(r).toContain("ainda não foi confirmada");
    expect(r).toContain("Dados a completar");
  });

  /* O oposto: aqui o utilizador não pode fazer nada, e mandá-lo confirmar seria pior
   * do que não dizer nada — confirmar não teria efeito, porque o veto do snapshot
   * prevalece sobre a cobertura. */
  it("leitura incompleta NÃO é apresentada como acionável", () => {
    const r = perguntar("Por que julho ainda não está completo?", salesCom({ snapshotParcial: true }));
    expect(r).toContain("não chegou ao fim");
    expect(r).toMatch(/atualização automática/);
    expect(r).not.toContain("Dados a completar");
  });

  it("sem causa de cobertura, não se fala de cobertura nenhuma", () => {
    /* Só a classificação bloqueia: explicar cobertura seria inventar um obstáculo. */
    const r = perguntar("Por que julho ainda não está completo?",
      salesCom({ causasOpex: ["classificacao"], comCmv: true }));
    expect(r).not.toContain("cobertura das despesas");
    expect(r).not.toContain("não chegou ao fim");
  });

  it("o CMV continua a ser nomeado à parte da cobertura", () => {
    /* São duas pendências distintas, e uma não pode absorver a outra na frase. */
    const r = answerQuestion("Por que julho ainda não está completo?", salesCom({ comCmv: false }));
    expect(r.highlights).toContain("CMV: por preencher");
    expect(r.content).toContain("ainda não foi confirmada");
  });
});
