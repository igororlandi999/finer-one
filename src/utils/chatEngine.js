// src/utils/chatEngine.js
// Motor determinístico do Chat Financeiro. Sem IA externa: faz matching de
// palavras-chave normalizadas e responde apenas com dados reais de `sales`.
// Regras centrais: nunca inventar números, previsões ou saldo bancário;
// quando falta base real, responder com limitação honesta.
// As respostas usam os shapes que o componente Message já renderiza:
// { content, metrics?, table?, highlights?, followUp? }

// Perguntas suportadas (a UI usa as 5 primeiras como sugestões e as restantes
// como "perguntas recentes" no modo dados reais).
export const SUPPORTED_QUESTIONS = [
  "A minha empresa está saudável?",
  "Qual o maior risco financeiro agora?",
  "Como está o resultado do mês?",
  "Quais contas estão vencidas?",
  /* Entrou quando o Chat deixou de recusar tesouraria: o produto já calculava a
   * variação líquida no Resumo e o assistente dizia não saber. Uma capacidade que
   * existe e não é anunciada é uma capacidade que ninguém usa. */
  "Quanto vou receber e pagar nos próximos 30 dias?",
  "Quais ações devo priorizar?",
  "Porque é que o meu score está baixo?",
  "Quais fornecedores pesam no caixa?",
  "O que mudou desde o mês passado?",
  "Quais são os principais clientes?",
  "Quais alertas estão ativos?",
];

// Chave de handoff one-shot: o Diagnóstico grava aqui a pergunta sugerida e
// o Chat consome-a (e remove-a) assim que os dados resolverem.
export const PENDING_CHAT_QUESTION_KEY = "finerone.chat.pendingQuestion";

const SEV_PT = { danger: "Crítico", warning: "Atenção", info: "Informação", success: "Positivo" };

const NEED_PAYABLES = {
  content:
    "Para responder a isso preciso das contas a pagar reais, que não estão disponíveis nesta sessão. " +
    "Assim que esses dados carregarem, respondo com números reais.",
};

export function buildWelcome(sales) {
  const d = sales?.diagnostico;
  if (d) {
    return {
      content:
        `Estou ligado aos dados reais da empresa. Estado atual: ${d.estado} (score ${d.score}/100). ` +
        "Pode perguntar sobre riscos, score, resultado do mês, contas vencidas, fornecedores, clientes, alertas e ações prioritárias.",
    };
  }
  if (sales) {
    return {
      content:
        "Estou ligado aos dados reais de vendas. Algumas respostas (score, despesas, fornecedores) precisam das contas a pagar, " +
        "que não estão disponíveis nesta sessão. Pode perguntar sobre resultado do mês, clientes e alertas.",
    };
  }
  return { content: "Assistente em modo demonstração." };
}

export function answerQuestion(question, sales) {
  const q = norm(question);
  const d = sales?.diagnostico ?? null;
  const r = sales?.resumo?.metrics ?? null;
  // Camada financeira central (DRE): mesma verdade da Performance/Resumo/Diagnóstico.
  const fin = sales?.financeiro ?? null;
  const fm = fin?.metrics ?? null;
  const f = sales?.fornecedores ?? null;
  const c = sales?.clientes ?? null;
  const alerts = sales?.alertas?.list ?? null;

  // ── Limitações honestas primeiro: nunca prever, nunca inventar saldo ──
  if (hasAny(q, ["iva", "imposto"])) {
    return {
      content:
        "Ainda não tenho dados fiscais ligados para responder sobre IVA ou impostos. " +
        "Posso ajudar com resultado do mês, despesas, fornecedores, contas vencidas, score e ações recomendadas.",
    };
  }
  /* ── SALDO BANCÁRIO: continua a não existir, e continua a dizer-se ────────────────
   * Sem Open Banking não há saldo, e nenhum somatório de títulos o substitui. Esta
   * recusa é permanente enquanto a integração não existir. */
  if (hasAny(q, ["saldo banc", "saldo dispon", "saldo em banco", "quanto tenho no banco", "banco", "bancar", "extrato"])) {
    return {
      content:
        "Não tenho saldo bancário: isso exige a integração bancária (Open Banking), que ainda não está ligada. " +
        "O que sei sobre tesouraria é o que vence — títulos a pagar e a receber com data.",
    };
  }

  /* ── TESOURARIA PREVISTA: o produto JÁ SABE isto ──────────────────────────────────
   * Esta pergunta caía na mesma recusa do saldo bancário, com a justificação de que
   * faltavam "recebíveis com datas de vencimento, que ainda não estão ligados". Eles
   * estão: o cartão "Cashflow previsto" do Resumo desenha a variação líquida a partir
   * dos títulos abertos reais, com o mesmo `buildCashflowForecast` que se chama aqui.
   *
   * Ou seja, o produto contradizia-se: uma tela mostrava o número e a outra dizia que
   * era impossível calculá-lo. Das duas afirmações, a falsa era a do Chat — e um
   * assistente que subestima o que sabe treina o utilizador a não lhe perguntar.
   *
   * O QUE CONTINUA A NÃO SE FAZER, e é dito na resposta: isto NÃO é um saldo (a série
   * parte de zero, porque não há saldo inicial) e NÃO é uma previsão de vendas futuras
   * — são só os títulos que já existem, colocados na data em que vencem. Uma pergunta
   * por meses à frente ("próximo trimestre") sai daqui pela janela de 30/60 dias e é
   * declarada como tal, em vez de ser extrapolada. */
  if (hasAny(q, ["previs", "prever", "projec", "cashflow", "fluxo de caixa", "tesouraria", "vou receber", "vou pagar"])) {
    if (!hasCashflowSource({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores })) {
      return {
        content:
          "Ainda não tenho títulos a receber nem a pagar carregados nesta sessão, por isso não consigo projetar tesouraria. " +
          "Saldo bancário continua a exigir a integração bancária, que não está ligada.",
      };
    }
    /* Janela de 60 dias quando a pergunta olha para lá do mês; 30 por omissão. São as
     * duas janelas que o Resumo oferece — não se inventa uma terceira aqui. */
    const alemDaJanela = hasAny(q, ["trimestre", "3 meses", "tres meses", "proximos meses", "ano", "semestre"]);
    const dias = (alemDaJanela || hasAny(q, ["60", "dois meses", "2 meses"])) ? 60 : 30;
    const cf = buildCashflowForecast({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores, dias });
    if (!cf.temDados) {
      return { content: `Não há títulos com vencimento nos próximos ${dias} dias, por isso não há variação de tesouraria a projetar nesse período.` };
    }
    return {
      content:
        `Nos próximos ${cf.dias} dias, os títulos que já existem dão uma variação líquida de ${formatMoney(cf.variacaoLiquida)} ` +
        `(${formatMoney(cf.totalEntradas)} a receber, ${formatMoney(cf.totalSaidas)} a pagar). ` +
        "Isto é variação, não saldo: não tenho saldo bancário inicial. E conta apenas títulos já emitidos — não prevê vendas futuras." +
        (alemDaJanela ? ` Para lá de ${cf.dias} dias não projeto: seria extrapolação, não dados.` : ""),
      metrics: [
        { label: `A receber · ${cf.dias} dias`, value: formatMoney(cf.totalEntradas), delta: null, tone: "success" },
        { label: `A pagar · ${cf.dias} dias`, value: formatMoney(cf.totalSaidas), delta: null, tone: "danger" },
        {
          label: `Variação líquida · ${cf.dias} dias`,
          value: formatMoney(cf.variacaoLiquida),
          delta: null,
          tone: cf.variacaoLiquida >= 0 ? "success" : "danger",
          note: "Variação dos títulos existentes. Não é saldo — não há integração bancária ligada.",
        },
      ],
    };
  }

  // ── Contas vencidas (contas a pagar em aberto com vencimento no passado) ──
  if (hasAny(q, ["vencida", "vencid", "atraso", "atrasad"])) {
    if (!f) return NEED_PAYABLES;
    const overdue = (f.openInvoices || []).filter((i) => Number(i.diasAtraso) > 0);
    if (!overdue.length) {
      return { content: "Não há contas a pagar vencidas entre os títulos em aberto. Tudo em dia." };
    }
    const shown = overdue.slice(0, 8);
    const total = overdue.reduce((acc, i) => acc + (Number(i.valor) || 0), 0);
    return {
      content:
        `Contas a pagar vencidas entre os títulos em aberto mais próximos do vencimento` +
        ` (${overdue.length} ${overdue.length === 1 ? "título" : "títulos"}, ${formatMoney(total)}` +
        `${shown.length < overdue.length ? `; a mostrar ${shown.length}` : ""}):`,
      table: {
        headers: ["Fornecedor", "Vencimento", "Valor", "Dias"],
        rows: shown.map((i) => [i.fornecedor, i.vencimento, formatMoney(i.valor), `${i.diasAtraso}`]),
      },
      followUp: "A lista completa está em Clientes e Fornecedores.",
    };
  }

  // ── Score ──
  if (hasAny(q, ["score", "pontuacao"])) {
    if (!d) return NEED_PAYABLES;
    const pens = d.penalizacoes || [];
    return {
      content:
        `O Finer Score atual é ${d.score}/100 (${d.scoreLabel}), estado ${d.estado}.` +
        (pens.length ? " Fatores que penalizaram o score:" : " Não há penalizações ativas."),
      highlights: pens.length ? pens.map((x) => `-${x.pts} pts — ${x.motivo}`) : undefined,
      followUp: pens.length ? 'Para saber o que fazer, pergunta "Quais ações devo priorizar?".' : undefined,
    };
  }

  // ── Maior risco ──
  if (hasAny(q, ["risco", "perigo", "preocup"])) {
    if (!d) return NEED_PAYABLES;
    const probs = d.problemas || [];
    if (!probs.length) {
      return { content: "Não identifiquei riscos relevantes com os dados atuais. O estado da empresa é " + d.estado + "." };
    }
    return {
      content: `O maior risco identificado agora: ${d.prioridadeMaxima}. Problemas em aberto:`,
      highlights: probs.slice(0, 4).map((p) => `[${SEV_PT[p.severidade] ?? p.severidade}] ${p.titulo} — ${p.descricao}`),
      followUp: 'Para o plano de resposta, pergunta "Quais ações devo priorizar?".',
    };
  }

  // ── Saúde / estado geral ──
  if (hasAny(q, ["saudavel", "saude", "como esta a empresa", "situacao da empresa", "diagnostico", "performance"])) {
    if (!d) return NEED_PAYABLES;
    return {
      content: `Estado atual: ${d.estado}, com score ${d.score}/100 (${d.scoreLabel}). ${d.resumoExecutivo}`,
      metrics: monthMetricsCards(sales) || undefined,
    };
  }

  // ── Ações recomendadas ──
  if (hasAny(q, ["priorizar", "prioridade", "acoes", "acao", "o que devo fazer", "o que fazer", "recomend"])) {
    if (!d) return NEED_PAYABLES;
    return {
      content: "Ações recomendadas, por ordem de prioridade:",
      highlights: (d.acoes || []).map((a) => `${a.titulo} (prazo sugerido: ${a.prazo}) — ${a.descricao}`),
      followUp: "Os prazos são recomendações operacionais, não previsões financeiras.",
    };
  }

  // ── O que mudou desde o mês passado ──
  if (hasAny(q, ["mudou", "mes passado", "variacao", "comparac"])) {
    if (!d) return NEED_PAYABLES;
    return {
      content: "O que mudou face ao mês anterior:",
      highlights: (d.mudancasUltimoMes || []).map((m) => `${m.label}: ${m.valor} — ${m.detalhe}`),
    };
  }

  // ── Despesas por categoria ("onde estou a gastar") ──
  if (hasAny(q, ["gastar", "gasto", "categoria"])) {
    const dep = sales?.despesas;
    if (!dep) return NEED_PAYABLES;
    const cats = (dep.byCategory || []).slice(0, 8);
    if (!cats.length) return { content: "Não há despesas registadas no mês em análise." };
    return {
      content: `Despesas do mês por categoria (total ${formatMoney(dep.metrics?.totalMes)}):`,
      table: { headers: ["Categoria", "Valor"], rows: cats.map((x) => [x.name, formatMoney(x.value)]) },
    };
  }

  // ── Fornecedores que pesam no caixa ──
  if (q.includes("fornecedor")) {
    if (!f) return NEED_PAYABLES;
    const top = (f.top || []).slice(0, 6);
    if (!top.length) return { content: "Não há fornecedores com saldo em aberto neste momento." };
    return {
      content:
        `Fornecedores com maior saldo em aberto — total a pagar de ${formatMoney(f.metrics?.saldoPagar)} ` +
        `em ${f.metrics?.faturasAbertasPagar} ${f.metrics?.faturasAbertasPagar === 1 ? "fatura" : "faturas"}:`,
      table: {
        headers: ["Fornecedor", "Faturas em aberto", "Saldo a pagar"],
        rows: top.map((s) => [s.nome, `${s.faturasAbertas}`, formatMoney(s.saldo)]),
      },
    };
  }

  // ── Resultado / receitas / despesas do mês ──
  // ── Mês em curso: só quando a pergunta é explicitamente sobre ele ──
  if (fin?.emCurso && hasAny(q, ["em curso", "andamento", "este mes", "mes atual", "mes corrente"])) {
    const ec = fin.emCurso;
    return {
      content: `${ec.monthKey} ainda está em andamento, por isso os valores são parciais e não são diretamente comparáveis com um mês fechado. ` +
        `Até agora, a receita líquida é de ${valorOuIndisponivel(ec.revenue.net)}.`,
      followUp: `Para números fechados, pergunta pelo mês de referência (${fin.monthKey}).`,
    };
  }

  // ── Contas a pagar (visão financeira/tesouraria, NÃO é despesa operacional da DRE) ──
  if (hasAny(q, ["a pagar", "tenho a pagar", "contas a pagar", "por pagar"])) {
    /* CONTRATO NOVO. Lia-se `r.despesas` — o campo legado, removido em 24/08/2026: contas
     * a pagar somadas por `dataEmissao || vencimento` e ancoradas no último mês COM
     * PEDIDOS. A resposta dizia "do mês em análise" sem nomear mês nenhum, e o mês era
     * um terceiro mês, diferente do mês civil e do mês âncora da DRE.
     *
     * `contasPagar` responde à pergunta que foi feita — "quanto tenho a pagar" — pelo
     * critério que lhe corresponde: títulos que VENCEM no mês civil. E `contasPagarMonthKey`
     * permite dizer de que mês se fala, que era a informação em falta. */
    if (!r || typeof r.contasPagar !== "number") {
      return { content: "Ainda não tenho as contas a pagar reais carregadas nesta sessão." };
    }
    const mesCp = r.contasPagarMonthKey ? monthLongLabel(r.contasPagarMonthKey) : null;
    return {
      content: `${mesCp ? `Contas a pagar com vencimento em ${mesCp}` : "Em contas a pagar"}: ${formatMoney(r.contasPagar)}. ` +
        "Este valor é a visão de tesouraria (títulos a pagar), diferente das despesas operacionais da demonstração de resultados.",
    };
  }

  /* ── Mês NOMEADO na pergunta ────────────────────────────────────────────────────
   * Tem de vir ANTES da DRE: "porque é que julho não aparece na rentabilidade?" contém
   * "rentabilid" e era respondida com a margem do MÊS ÂNCORA — outro mês, sem o dizer.
   * A pergunta era sobre a ausência de julho, e a resposta era o valor de junho. */
  const mkPerg = mesPerguntado_(q, sales);
  if (mkPerg) {
    const rotuloMes = monthLongLabel(mkPerg);
    const explic = porqueNaoSustenta_(sales, mkPerg);

    // "Porque é que <mês> não aparece?" — a pergunta é sobre a AUSÊNCIA, não sobre o valor.
    /* Duas formas da MESMA pergunta, e ambas têm de chegar aqui:
     *   "porque é que julho não aparece na rentabilidade?"  — porquê + ausência
     *   "o que falta para julho estar completo?"            — sem "porquê" nenhum
     * "completo"/"incompleto" entram na lista porque é a palavra que o produto usa nos
     * badges do próprio ecrã — quem lê "Por completar" pergunta com ela. */
    const perguntaAusencia =
      (hasAny(q, ["porque", "por que", "porqu"])
        && hasAny(q, ["nao aparece", "aparece", "nao tem", "sem dados", "falta", "indisponivel",
          "vazio", "traco", "completo", "incomplet", "pendente", "por completar", "fechado"]))
      || hasAny(q, ["o que falta", "o que impede", "que falta em", "o que bloqueia"]);
    if (perguntaAusencia) {
      if (fin && fin.monthKey === mkPerg) {
        /* O mês PERGUNTADO é o mês âncora — mas responder só "é o mês de referência"
         * seria enganador quando a âncora saiu do RECURSO (`anchorSource: fallback`):
         * nesse caso o mês foi o que sobrou, não o que estava completo, e é exatamente
         * por isso que o utilizador vê traços onde esperava números. A regra do
         * projeto é explícita — nenhuma superfície pode tratar um `fallback` como mês
         * oficialmente completo, e calar a diferença aqui era tratá-lo assim. */
        const recurso = fin.anchorEligible === false;
        const finAnc = fin.anchorFinancial || null;
        const linhasAnc = finAnc ? (finAnc.blockers || []).map(descreverBloqueio) : [];
        if (!recurso) {
          return { content: `${capMes_(mkPerg)} é precisamente o mês de referência dos indicadores — os números de rentabilidade que vê são desse mês.` };
        }
        const pesoAnc = materialidade_(sales, mkPerg);
        return {
          content: `${capMes_(mkPerg)} é o mês de referência dos indicadores, mas por recurso: nenhum mês da janela reúne as condições de fecho, ` +
            "por isso há linhas cuja rentabilidade não pode ser apresentada como definitiva." +
            (finAnc && (finAnc.anchorBlockers || []).length
              ? ` Em concreto: ${descreverBloqueiosAncora(finAnc.anchorBlockers).join("; ")}.`
              : "") +
            (pesoAnc ? ` ${pesoAnc}` : ""),
          highlights: linhasAnc.length ? linhasAnc : undefined,
          followUp: linhasAnc.length ? "Estas são as linhas da demonstração de resultados ainda incompletas nesse mês." : undefined,
        };
      }
      if (!explic) {
        return {
          content: `Não tenho um apuramento de fecho para ${rotuloMes} nesta sessão, por isso não consigo dizer com segurança porque é que esse mês não sustenta indicadores de rentabilidade.` +
            (fin?.monthKey ? ` O mês de referência atual é ${monthLongLabel(fin.monthKey)}.` : ""),
        };
      }
      const motivos = [...explic.ancora];
      return {
        content: `${capMes_(mkPerg)} não sustenta indicadores de rentabilidade${motivos.length ? ` porque ${motivos.join("; ")}` : ""}.` +
          (explic.materialidade ? ` ${explic.materialidade}` : "") +
          (explic.cobertura ? ` ${explic.cobertura}` : ""),
        highlights: explic.linhas.length ? explic.linhas : undefined,
        followUp: explic.linhas.length ? "Estas são as linhas da demonstração de resultados ainda incompletas nesse mês." : undefined,
      };
    }

    /* "Como foi julho?" e qualquer pergunta de DRE com um mês nomeado. O mês pedido
     * manda; o mês âncora só entra quando coincidem. */
    const pedeDre = hasAny(q, ["como foi", "como correu", "como ficou", "como esta", "resultado",
      "lucr", "margem", "rentabilid", "ebitda", "receita", "faturacao", "faturou", "vendas"]);
    if (pedeDre) {
      const { metrics: mm, origem } = metricsDoMes_(sales, mkPerg);
      if (mm) {
        const pm = mm.profitability || {};
        const dispM = pm.availability || {};
        if (origem === "emCurso") {
          return {
            content: `${rotuloMes} ainda está a decorrer, por isso os valores são parciais e não são comparáveis com um mês fechado. ` +
              `Até agora, a receita líquida é de ${valorOuIndisponivel(mm.revenue?.net)}.`,
            followUp: fin?.monthKey ? `Para números fechados, pergunta pelo mês de referência (${monthLongLabel(fin.monthKey)}).` : undefined,
          };
        }
        if (pm.netResult == null) {
          return {
            content: `Em ${rotuloMes}, a receita líquida foi de ${valorOuIndisponivel(mm.revenue?.net)}.${ressalva_(mm.revenue?.netAvailability)} ` +
              "O resultado do mês não pode ser apurado com segurança porque o CMV ainda não está disponível.",
          };
        }
        return {
          content: `Em ${rotuloMes}: receita líquida de ${valorOuIndisponivel(mm.revenue?.net)} e resultado líquido de ` +
            `${formatMoney(pm.netResult)}, com margem líquida de ${pctOuIndisponivel(pm.netMarginPct)}.${ressalva_(dispM.netResult)}`,
        };
      }

      /* Mês fora do que o dataset apurou. Diz-se o que não se tem, diz-se porquê
       * quando se sabe, e dá-se só o número que é seguro dar — faturação bruta dos
       * pedidos, nomeada como tal. Nunca uma margem, nunca um resultado. */
      const fat = faturacaoDoMes_(sales, mkPerg);
      const motivos = explic ? explic.ancora : [];
      return {
        content: `Não tenho a demonstração de resultados de ${rotuloMes} nesta sessão` +
          (fin?.monthKey ? ` — os indicadores estão ancorados em ${monthLongLabel(fin.monthKey)}` : "") + "." +
          (motivos.length ? ` Quanto a ${rotuloMes}: ${motivos.join("; ")}.` : "") +
          (fat != null ? ` O que sei desse mês é a faturação bruta dos pedidos: ${formatMoney(fat)} — faturação, não resultado.` : ""),
        highlights: explic && explic.linhas.length ? explic.linhas : undefined,
      };
    }
  }

  /* ── Melhor mês ──────────────────────────────────────────────────────────────────
   * Caía no fallback. Responde-se pela FATURAÇÃO BRUTA dos pedidos, dito no texto:
   * é o único eixo com série mensal completa no dataset. Comparar resultados mensais
   * exigiria uma DRE por mês, e o dataset só apura o mês âncora, o anterior e o mês
   * em curso — dizer "o melhor mês foi X" a partir de três meses seria falso.
   * O mês EM CURSO fica de fora: 25 dias contra 31 não é uma comparação. */
  if (hasAny(q, ["melhor mes", "pior mes", "melhor mês", "pior mês"])) {
    const emCursoMk = fin?.emCurso?.monthKey ?? null;
    const serie = revenueByMonth(sales?.orders || []).filter((m) => m.month !== emCursoMk);
    if (!serie.length) return { content: "Ainda não tenho a série mensal de faturação real nesta sessão." };
    const pior = hasAny(q, ["pior"]);
    const alvo = serie.reduce((a, b) => ((pior ? b.value < a.value : b.value > a.value) ? b : a));
    return {
      content: `Por faturação bruta, o ${pior ? "pior" : "melhor"} mês da série foi ${monthLongLabel(alvo.month)}, com ${formatMoney(alvo.value)}. ` +
        "O critério é a faturação dos pedidos, não o resultado: comparar resultados exigiria a demonstração de resultados de cada mês, que só está apurada para o mês de referência." +
        (emCursoMk ? ` ${capMes_(emCursoMk)} ficou de fora por ainda estar a decorrer.` : ""),
      table: {
        headers: ["Mês", "Faturação bruta"],
        rows: serie.slice(-6).reverse().map((m) => [monthLongLabel(m.month), formatMoney(m.value)]),
      },
    };
  }

  /* ── Despesas do mês (linha da DRE) ──────────────────────────────────────────────
   * "Quanto tivemos de despesas?" caía no ramo da faturação e devolvia um cartão de
   * RECEITAS com uma ressalva sobre contas a pagar — nunca dizia quanto foram as
   * despesas, que o dataset tinha. Só "despesa operacional" no singular exato chegava
   * à DRE; a palavra que o utilizador usa não chegava.
   *
   * "gastar"/"gasto"/"categoria" continuam a ser apanhados ANTES por "despesas por
   * categoria", que é a resposta certa para essa forma da pergunta. */
  if (hasAny(q, ["despesa", "despesas", "gastei", "gastamos", "gastos"])) {
    if (!fm) {
      if (!r) return { content: "Ainda não tenho dados reais carregados nesta sessão." };
      return { content: "Ainda não tenho a demonstração de resultados desta sessão, por isso não posso apurar as despesas operacionais do mês." };
    }
    const op = fm.operatingExpenses || {};
    const mesDre = fin?.monthKey ? monthLongLabel(fin.monthKey) : "mês de referência";
    /* As duas grandezas na mesma resposta, cada uma com o seu mês e o seu nome. Era
     * exatamente esta a confusão que o produto inteiro tenta impedir. */
    const cp = (typeof r?.contasPagar === "number" && r.contasPagarMonthKey)
      ? ` Não confundir com contas a pagar: em ${monthLongLabel(r.contasPagarMonthKey)} vencem ${formatMoney(r.contasPagar)} — isso é tesouraria, não despesa da demonstração de resultados.`
      : "";
    return {
      content: `Em ${mesDre}, as despesas operacionais da demonstração de resultados foram de ${valorOuIndisponivel(op.total)}` +
        `, ou seja ${pctOuIndisponivel(op.pctOfNetRevenue)} da receita líquida.${ressalva_(op.availability)}${cp}`,
    };
  }

  // ── Rentabilidade e linhas da DRE ──
  if (hasAny(q, ["resultado", "lucr", "margem", "rentabilid", "ebitda", "receita liquida", "receita líquida", "cmv", "custo das mercadorias", "despesa operacional", "despesas operacionais"])) {
    if (!fm) {
      if (!r) return { content: "Ainda não tenho dados reais carregados nesta sessão." };
      return {
        content: "Ainda não tenho a demonstração de resultados desta sessão, por isso não posso apurar resultado ou margem com segurança.",
        metrics: monthMetricsCards(sales) || undefined,
      };
    }
    return respostaDre_(q, fm, fin);
  }

  /* ── Faturação (receita bruta) ──
   * "despesa"/"gastei"/"gasto" saíram da lista: a pergunta sobre despesas passou a ter
   * ramo próprio (acima) e era respondida aqui com um cartão de receitas. */
  if (hasAny(q, ["receita", "faturacao", "faturei", "ganh"])) {
    if (!r) return { content: "Ainda não tenho dados reais carregados nesta sessão." };
    const cards = monthMetricsCards(sales);
    /* A ressalva descreve o que os CARTÕES mostram. Passou a ler `contasPagar` (o
     * contrato novo, por vencimento no mês civil) em vez de `despesas` (legado, por
     * data de emissão) — e o cartão já se chama "Contas a pagar", pelo que a frase
     * deixou de ser a única coisa a impedir a confusão com despesas operacionais. */
    const extra = typeof r.contasPagar !== "number"
      ? " As contas a pagar ainda não estão disponíveis nesta sessão, por isso mostro apenas as receitas."
      : " Contas a pagar é tesouraria (o que vence no mês), diferente das despesas operacionais da demonstração de resultados.";
    return {
      content: "Assim está o mês em análise, com base nos dados reais:" + extra,
      metrics: cards || undefined,
      followUp: 'Para rentabilidade, pergunta "qual foi o meu resultado líquido?".',
    };
  }

  // ── Principais clientes ──
  if (q.includes("cliente")) {
    if (!c || !(c.top || []).length) return { content: "Ainda não tenho dados reais de clientes nesta sessão." };
    const conc = typeof c.concentracao === "number" ? ` O maior representa ${pct(c.concentracao)}% do total.` : "";
    return {
      content: `Principais clientes por faturação.${conc}`,
      table: {
        headers: ["#", "Cliente", "Pedidos", "Faturação"],
        rows: c.top.slice(0, 6).map((t, i) => [`${i + 1}`, t.nome, `${t.faturasAbertas}`, formatMoney(t.saldo)]),
      },
    };
  }

  // ── Alertas ativos ──
  if (q.includes("alerta")) {
    if (!alerts) return { content: "Ainda não tenho dados reais carregados nesta sessão." };
    if (!alerts.length) return { content: "Sem alertas ativos com base nos dados reais." };
    return {
      content: `Existem ${alerts.length} alertas gerados a partir dos dados reais:`,
      highlights: alerts.slice(0, 6).map((a) => `[${SEV_PT[a.severity] ?? a.severity}] ${a.title} — ${a.description}`),
      followUp: alerts.length > 6 ? "A lista completa está na tela Alertas." : undefined,
    };
  }

  // ── Fallback honesto ──
  return {
    content: "Ainda não consigo responder a essa pergunta com os dados ligados. Perguntas que sei responder:",
    highlights: SUPPORTED_QUESTIONS,
  };
}

// ── Auxiliares ───────────────────────────────────────────────
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
import { pct, revenueByMonth } from "./financialCalculations.js";
import { formatMoney } from "../lib/currency.js";
import { monthLongLabel } from "./performanceCalculations.js";
import { descreverBloqueio, descreverBloqueiosAncora } from "./closingSummaryView.js";
import { buildCashflowForecast, hasCashflowSource } from "./cashflowForecast.js";

function hasAny(q, words) {
  return words.some((w) => q.includes(w));
}

/* ────────────────────────────────────────────────────────────────────────────────────
 * MESES NOMEADOS NA PERGUNTA.
 *
 * "Como foi julho?" e "Porque é que julho não aparece na rentabilidade?" caíam ambas
 * no fallback — a segunda só depois de a primeira ter sido respondida sobre OUTRO mês,
 * porque "rentabilidade" apanhava a pergunta e respondia sempre sobre o mês âncora.
 * Com a âncora em junho, perguntar por julho devolvia junho sem o dizer: a pior classe
 * de erro deste produto, um número verdadeiro colado ao mês errado.
 *
 * FRONTEIRAS DE PALAVRA, não `includes`. "Qual o maior risco financeiro agora?" contém
 * "maio" — é uma das perguntas sugeridas do próprio Chat, e um `includes` mandava-a
 * responder sobre maio.
 * ──────────────────────────────────────────────────────────────────────────────────── */
const MESES_PT = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/* O "agora" do dataset, sem ler o relógio: um motor puro que consultasse `new Date()`
 * deixaria de ser reproduzível e os testes passariam a depender do dia em que correm.
 * O mês mais avançado que o dataset conhece serve exatamente para o mesmo — desambiguar
 * o ano de um mês dito sem ano. */
function mesMaisRecente_(sales) {
  const fin = sales?.financeiro ?? null;
  const cands = [
    fin?.emCurso?.monthKey, fin?.civilMonthKey, fin?.monthKey,
    sales?.resumo?.metrics?.contasPagarMonthKey, sales?.resumo?.metrics?.receitasMonthKey,
  ].filter((x) => typeof x === "string");
  return cands.length ? cands.sort()[cands.length - 1] : null;
}

/**
 * "como foi julho?" -> "2026-07". Sem mês nomeado -> null (e nada muda no routing).
 *
 * O ANO é o do próprio texto quando lá está. Quando não está, é o do último mês com
 * esse nome que já COMEÇOU — perguntar "como foi dezembro?" em agosto de 2026 refere-se
 * a dezembro de 2025, não a um dezembro que ainda não existe. Inventar o futuro seria
 * a única alternativa, e este motor não inventa.
 */
export function mesPerguntado_(q, sales) {
  const idx = MESES_PT.findIndex((m) => new RegExp(`\\b${m}\\b`).test(q));
  if (idx < 0) return null;
  const mm = String(idx + 1).padStart(2, "0");

  const ano = (q.match(/\b(20\d{2})\b/) || [])[1] || null;
  if (ano) return `${ano}-${mm}`;

  const ref = mesMaisRecente_(sales);
  if (!ref) return null;
  const [refAno, refMes] = ref.split("-");
  // Mês ainda por começar neste ano => o mesmo mês do ano anterior.
  return mm <= refMes ? `${refAno}-${mm}` : `${Number(refAno) - 1}-${mm}`;
}

/** "julho de 2026" -> "Julho de 2026". Só a primeira letra — o mesmo tratamento que o
 *  Resumo já dá ao mês quando ele abre a frase. */
function capMes_(mk) {
  const t = monthLongLabel(mk);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** As métricas de UM mês concreto, e de onde vieram. Só os meses que o dataset
 *  realmente apurou — nunca um mês reconstruído aqui a partir de dados crus. */
function metricsDoMes_(sales, mk) {
  const fin = sales?.financeiro ?? null;
  if (!fin || !mk) return { metrics: null, origem: null };
  if (fin.metrics && fin.monthKey === mk) return { metrics: fin.metrics, origem: "ancora" };
  if (fin.previous && fin.previous.monthKey === mk) return { metrics: fin.previous, origem: "anterior" };
  if (fin.emCurso && fin.emCurso.monthKey === mk) return { metrics: fin.emCurso, origem: "emCurso" };
  return { metrics: null, origem: null };
}

/** Faturação BRUTA de um mês, direto dos pedidos. É o único número que o Chat pode
 *  afirmar sobre um mês fora da DRE — e diz sempre no texto que é faturação, nunca
 *  receita líquida e muito menos resultado. */
function faturacaoDoMes_(sales, mk) {
  const linha = revenueByMonth(sales?.orders || []).find((m) => m.month === mk);
  return linha ? linha.value : null;
}

/** Porque é que um mês não sustenta rentabilidade, na redação já usada pelo Resumo. */
function porqueNaoSustenta_(sales, mk) {
  const fecho = (sales?.closings || []).find((c) => c && c.monthKey === mk) || null;
  const fin = fecho?.financial ?? null;
  if (!fin) return null;
  return {
    ancora: descreverBloqueiosAncora(fin.anchorBlockers),
    linhas: (fin.blockers || []).map(descreverBloqueio),
    materialidade: materialidade_(sales, mk),
    cobertura: cobertura_(sales, fin),
  };
}

/* ── "PERÍODO POR FECHAR NA FONTE" SÃO DUAS COISAS DIFERENTES ────────────────────────
 * O motor emite uma só causa — `cobertura` — para dois estados que, para quem lê, não
 * têm nada a ver um com o outro:
 *
 *   a) a cobertura ainda não foi CONFIRMADA. O utilizador resolve isto em dez segundos,
 *      no ecrã "Dados a completar", e é a única coisa desta lista que depende dele.
 *   b) a última LEITURA do ERP não chegou ao fim (`meta.parcial`). Nada que o utilizador
 *      faça resolve isto; resolve-se sozinho na próxima atualização automática.
 *
 * Dizer "o período ainda não fechou na origem" nos dois casos manda o utilizador esperar
 * quando ele podia agir, ou agir quando não há nada a fazer. A distinção não é cosmética:
 * é a diferença entre uma pendência acionável e uma que não é.
 *
 * `null` quando a cobertura não é causa nenhuma neste mês — não se explica o que não
 * está a bloquear. */
function cobertura_(sales, fin) {
  const temCausaCobertura = (fin.blockers || [])
    .some((l) => (l.causes || []).indexOf("cobertura") !== -1);
  if (!temCausaCobertura) return null;

  if (sales?.coverage?.payables?.snapshotPartial === true) {
    return "A última leitura das contas a pagar não chegou ao fim, por isso ainda faltam títulos por carregar. " +
      "Isto resolve-se na próxima atualização automática — não há nada a fazer do seu lado.";
  }
  return "A cobertura das despesas deste mês ainda não foi confirmada: em \"Dados a completar\" pode confirmar que " +
    "os documentos relevantes já estão disponíveis, e o mês deixa de ser tratado como incompleto por essa razão.";
}

/* ── MATERIALIDADE: O FACTO, NUNCA A POLÍTICA ────────────────────────────────────────
 * "Títulos por classificar" respondia PORQUÊ sem responder QUANTO. Um título de R$ 1 e
 * um de R$ 100 000 produzem hoje o mesmo bloqueio, e a frase era idêntica nos dois
 * casos — o utilizador não tinha como saber se estava a olhar para uma formalidade ou
 * para um buraco. Em produção são 0,38% de julho: um facto que muda inteiramente a
 * leitura da mesma frase.
 *
 * NÃO SE CRIA AQUI NENHUM LIMIAR DE MATERIALIDADE, e a frase é redigida para não
 * insinuar um: diz-se o peso e diz-se que QUALQUER título por classificar bloqueia —
 * que é a regra em vigor. Decidir a partir de que percentagem se pode ignorar é uma
 * decisão CONTABILÍSTICA, e continua por tomar (docs/FINANCIAL_COMPLETENESS_CONTRACT.md,
 * secção 10).
 *
 * Os números vêm de `despesas.porClassificar` — a mesma medição que a página Despesas
 * já mostra, sem uma segunda contagem em lado nenhum. */
function materialidade_(sales, mk) {
  const c = (sales?.despesas?.porClassificar || []).find((x) => x && x.monthKey === mk);
  if (!c || !(c.unclassifiedCount > 0)) return null;
  const quantos = c.unclassifiedCount === 1 ? "1 título" : `${c.unclassifiedCount} títulos`;
  const peso = c.unclassifiedRatio != null
    ? `, ${String(c.unclassifiedRatio).replace(".", ",")}% dos títulos do mês`
    : "";
  return `São ${quantos} por classificar${peso}, no total de ${formatMoney(c.unclassifiedAmount)}. ` +
    "Qualquer título por classificar deixa a linha de despesas operacionais incompleta, seja qual for o valor.";
}
function deltaStr(dlt) {
  return typeof dlt === "number" ? `${dlt > 0 ? "+" : ""}${pct(dlt)}% vs mês anterior` : null;
}
// Cards do mês: só campos reais; deltas null são omitidos (o componente esconde).
/* ────────────────────────────────────────────────────────────────────────────────────
 * CARTÕES DO MÊS — migrados do contrato legado de `resumo.metrics` (24/08/2026).
 *
 * O QUE ESTAVA ERRADO, e não era pouco:
 *
 *   1. O cartão "Resultado (mês)" mostrava `resumo.metrics.resultado`, que é
 *      `receita − contas a pagar`. É a métrica que o projeto proíbe explicitamente
 *      ("nunca revenue − payables = resultado"), banida do Diagnóstico e das respostas
 *      de texto do Chat — e continuava a sair daqui, rotulada como "Resultado",
 *      formatada como um KPI e com um tom verde/vermelho a dar-lhe autoridade.
 *
 *   2. O cartão "Despesas (mês)" somava contas a pagar por `dataEmissao || vencimento`
 *      e chamava-lhes despesas. Contas a pagar são tesouraria; despesas operacionais
 *      são uma linha da DRE. O texto ao lado explicava a diferença — o cartão não.
 *
 *   3. Nenhum cartão dizia DE QUE MÊS era. E os três não eram sequer do mesmo mês:
 *      as receitas vinham do último mês com pedidos, as contas a pagar de outro.
 *
 * O QUE PASSA A SER:
 *   - Receitas       -> contrato de receitas, com o mês nomeado.
 *   - Contas a pagar -> contrato NOVO (`contasPagar`/`contasPagarMonthKey`: mês civil,
 *                       por vencimento), com o nome que descreve o que é.
 *   - Resultado      -> SÓ da DRE central (`financeiro.metrics`), com o mês âncora e a
 *                       ressalva de disponibilidade. Ausente quando não é calculável —
 *                       nunca substituído por um número que se lhe assemelhe.
 *
 * `resumo.metrics.despesas` e `.resultado` continuam a existir no serviço porque o
 * Resumo os usa no caminho DEMONSTRATIVO (sem dados reais). Deixaram é de ter um único
 * leitor em modo real.
 * ──────────────────────────────────────────────────────────────────────────────────── */
function monthMetricsCards(sales) {
  const r = sales?.resumo?.metrics ?? null;
  if (!r) return null;
  const fin = sales?.financeiro ?? null;
  const fm = fin?.metrics ?? null;

  const comMes = (rotulo, mk) => (mk ? `${rotulo} · ${monthLongLabel(mk)}` : rotulo);

  const cards = [{
    label: comMes("Receitas", r.receitasMonthKey),
    value: formatMoney(r.receitas),
    delta: deltaStr(r.receitasDelta),
    tone: (r.receitasDelta ?? 0) >= 0 ? "success" : "danger",
  }];

  if (typeof r.contasPagar === "number") {
    cards.push({
      label: comMes("Contas a pagar", r.contasPagarMonthKey),
      value: formatMoney(r.contasPagar),
      // Sem delta: o mês civil está em curso e o anterior está completo. É a mesma
      // decisão já tomada no card do Resumo — comparar 14 dias com 31 não é variação.
      delta: null,
      tone: "neutral",
    });
  }

  /* O resultado só entra quando a DRE o produz. `null` é ausência de base, e a ausência
   * diz-se calando o cartão — não com um número parecido. */
  const netResult = fm?.profitability?.netResult ?? null;
  if (netResult != null) {
    const disp = fm?.profitability?.availability?.netResult ?? null;
    cards.push({
      label: comMes("Resultado líquido", fm.monthKey || fin?.monthKey),
      value: formatMoney(netResult),
      delta: null,
      tone: netResult >= 0 ? "success" : "danger",
      // Nota curta e só quando há algo a ressalvar — ver `ressalva_`.
      note: ressalva_(disp).trim() || undefined,
    });
  }

  return cards;
}

/* ====================================================================================
 * Respostas determinísticas a partir da DRE central. Nunca recalculam finanças.
 * null é ausência de fonte: responde-se o limite, nunca um número substituto.
 * ==================================================================================== */
function valorOuIndisponivel(v) {
  return v == null ? "indisponível" : formatMoney(v);
}

function pctOuIndisponivel(v) {
  return v == null ? "indisponível" : `${String(v).replace(".", ",")}%`;
}

/* RESSALVA DE DISPONIBILIDADE — o Chat não pode ser a única superfície que afirma um
 * número sem dizer de que material é feito.
 *
 * O resto do produto marca estas linhas ("Dados parciais", "Inclui valor manual"); o
 * Chat afirmava-as a seco. Um EBITDA `partial` é um MÍNIMO CONHECIDO, não o EBITDA do
 * mês, e um EBITDA `mixed` assenta num CMV que o utilizador escreveu à mão — chamar-lhe
 * apenas "o EBITDA foi de X" viola a regra do projeto de nunca apresentar um valor
 * manual como se fosse apurado pela integração.
 *
 * Ganhou urgência com a separação de "mês completo" e "mês elegível" (24/08/2026): a
 * âncora ficou mais exigente, pelo que o caminho de recurso — `latestUsableFinancialMonth`,
 * que aceita um mês com linhas parciais quando nenhum mês é elegível — passou a ser
 * percorrido com mais frequência. Sem ressalva, é exatamente aí que o Chat mentiria.
 *
 * String vazia para `real`: nada a ressalvar não deve produzir texto nenhum. */
function ressalva_(availability) {
  if (availability === "partial") {
    return " Os dados do período ainda estão incompletos, por isso este valor é um mínimo conhecido.";
  }
  if (availability === "manual" || availability === "mixed") {
    return " Inclui o CMV introduzido manualmente.";
  }
  return "";
}

function respostaDre_(q, fm, fin) {
  /* Nome por extenso, não a chave crua: "Em 2026-06, o EBITDA foi de..." é a forma como
   * a base de dados fala, não a forma como se responde a um empresário. É o mesmo
   * `monthLongLabel` que a Performance e o Resumo já usam. */
  const mes = fin && fin.monthKey ? monthLongLabel(fin.monthKey) : "mês de referência";
  const p = fm.profitability || {};
  const dispP = p.availability || {};

  const pedeMargem = hasAny(q, ["margem", "rentabilid"]);
  const pedeEbitda = hasAny(q, ["ebitda"]);
  const pedeReceitaLiq = hasAny(q, ["receita liquida", "receita líquida"]);
  const pedeCmv = hasAny(q, ["cmv", "custo das mercadorias", "peso dos custos"]);
  const pedeOpex = hasAny(q, ["despesa operacional", "despesas operacionais"]);

  if (pedeReceitaLiq) {
    return { content: `Em ${mes}, a receita líquida foi de ${valorOuIndisponivel(fm.revenue.net)}.${ressalva_(fm.revenue.netAvailability)}` };
  }
  if (pedeEbitda) {
    if (p.ebitda == null) {
      return { content: `Em ${mes}, o EBITDA não pode ser apurado com segurança porque o CMV ainda não está disponível. A receita líquida do período foi de ${valorOuIndisponivel(fm.revenue.net)}.` };
    }
    return { content: `Em ${mes}, o EBITDA foi de ${formatMoney(p.ebitda)}, com margem EBITDA de ${pctOuIndisponivel(p.ebitdaMarginPct)}.${ressalva_(dispP.ebitda)}` };
  }
  if (pedeCmv) {
    if (fm.cmv.value == null) {
      return { content: "O CMV ainda não tem fonte automática, por isso o peso dos custos não pode ser apurado nesta sessão." };
    }
    return { content: `Em ${mes}, o CMV foi de ${formatMoney(fm.cmv.value)}, o que representa ${pctOuIndisponivel(fm.cmv.pctOfNetRevenue)} da receita líquida.${ressalva_(fm.cmv.availability)}` };
  }
  if (pedeOpex) {
    return { content: `Em ${mes}, as despesas operacionais da demonstração de resultados foram de ${valorOuIndisponivel(fm.operatingExpenses.total)}, ou seja ${pctOuIndisponivel(fm.operatingExpenses.pctOfNetRevenue)} da receita líquida.${ressalva_(fm.operatingExpenses.availability)}` };
  }
  if (pedeMargem) {
    if (p.netMarginPct == null) {
      return { content: `Em ${mes}, a margem líquida não pode ser apurada com segurança porque o CMV ainda não está disponível. A receita líquida do período foi de ${valorOuIndisponivel(fm.revenue.net)}.` };
    }
    return { content: `Em ${mes}, a margem líquida foi de ${pctOuIndisponivel(p.netMarginPct)}, sobre uma receita líquida de ${valorOuIndisponivel(fm.revenue.net)}.${ressalva_(dispP.netMarginPct)}` };
  }

  // resultado / lucro
  if (p.netResult == null) {
    return {
      content: `Em ${mes}, o resultado líquido não pode ser apurado com segurança porque o CMV ainda não está disponível. ` +
        `A receita líquida do período foi de ${valorOuIndisponivel(fm.revenue.net)}.`,
    };
  }
  /* ── "Estamos lucrando?" é uma pergunta de SIM OU NÃO ────────────────────────────
   * Caía no fallback: a lista de palavras tinha "lucro", e "lucrando"/"lucramos" não
   * contêm "lucro". Corrigido para o radical "lucr", como já se fazia com "rentabilid".
   *
   * O SIM/NÃO só se afirma sobre base utilizável. Com `partial`, o resultado é um
   * MÍNIMO CONHECIDO: faltam linhas de custo, pelo que um mínimo positivo pode ficar
   * negativo quando o mês fechar. Dizer "sim, estão a lucrar" sobre isso seria a
   * ressalva a desmentir a primeira palavra da frase. Nesse caso dá-se o número com a
   * ressalva e nenhuma sentença. */
  const simNao = hasAny(q, ["estamos lucr", "estou a lucr", "estamos a lucr", "damos lucro", "temos lucro",
    "estamos tendo lucro", "estamos com lucro", "da lucro", "tem lucro"]);
  const baseFirme = ["real", "manual", "mixed"].includes(dispP.netResult);
  const veredito = (simNao && baseFirme)
    ? (p.netResult >= 0 ? "Sim. " : "Não. ")
    : "";
  return {
    content: `${veredito}Em ${mes}, o resultado líquido foi de ${formatMoney(p.netResult)}, com margem líquida de ${pctOuIndisponivel(p.netMarginPct)}.${ressalva_(dispP.netResult)}`,
  };
}