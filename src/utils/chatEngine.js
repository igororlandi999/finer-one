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
  if (hasAny(q, ["previs", "prever", "projec", "cashflow", "fluxo de caixa", "saldo banc", "saldo dispon", "banco", "bancar"])) {
    return {
      content:
        "Ainda não consigo responder sobre cashflow, previsões ou saldo bancário: isso requer dados bancários (Open Banking) " +
        "e recebíveis com datas de vencimento, que ainda não estão ligados. " +
        "Posso ajudar com resultado do mês, despesas, fornecedores, contas vencidas, score e ações recomendadas.",
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
        ` (${overdue.length} ${overdue.length === 1 ? "título" : "títulos"}, ${eur(total)}` +
        `${shown.length < overdue.length ? `; a mostrar ${shown.length}` : ""}):`,
      table: {
        headers: ["Fornecedor", "Vencimento", "Valor", "Dias"],
        rows: shown.map((i) => [i.fornecedor, i.vencimento, eur(i.valor), `${i.diasAtraso}`]),
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
      metrics: monthMetricsCards(r) || undefined,
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
      content: `Despesas do mês por categoria (total ${eur(dep.metrics?.totalMes)}):`,
      table: { headers: ["Categoria", "Valor"], rows: cats.map((x) => [x.name, eur(x.value)]) },
    };
  }

  // ── Fornecedores que pesam no caixa ──
  if (q.includes("fornecedor")) {
    if (!f) return NEED_PAYABLES;
    const top = (f.top || []).slice(0, 6);
    if (!top.length) return { content: "Não há fornecedores com saldo em aberto neste momento." };
    return {
      content:
        `Fornecedores com maior saldo em aberto — total a pagar de ${eur(f.metrics?.saldoPagar)} ` +
        `em ${f.metrics?.faturasAbertasPagar} ${f.metrics?.faturasAbertasPagar === 1 ? "fatura" : "faturas"}:`,
      table: {
        headers: ["Fornecedor", "Faturas em aberto", "Saldo a pagar"],
        rows: top.map((s) => [s.nome, `${s.faturasAbertas}`, eur(s.saldo)]),
      },
    };
  }

  // ── Resultado / receitas / despesas do mês ──
  if (hasAny(q, ["resultado", "lucro", "receita", "faturacao", "faturei", "ganh", "despesa"])) {
    if (!r) return { content: "Ainda não tenho dados reais carregados nesta sessão." };
    const cards = monthMetricsCards(r);
    const extra = typeof r.despesas !== "number"
      ? " As despesas reais ainda não estão disponíveis nesta sessão, por isso mostro apenas as receitas."
      : "";
    return {
      content: "Assim está o mês em análise, com base nos dados reais:" + extra,
      metrics: cards || undefined,
      followUp: 'Para contexto completo, pergunta "A minha empresa está saudável?".',
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
        rows: c.top.slice(0, 6).map((t, i) => [`${i + 1}`, t.nome, `${t.faturasAbertas}`, eur(t.saldo)]),
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
function hasAny(q, words) {
  return words.some((w) => q.includes(w));
}
function eur(n) {
  return (Number(n) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function pct(n) {
  return String(n).replace(".", ",");
}
function deltaStr(dlt) {
  return typeof dlt === "number" ? `${dlt > 0 ? "+" : ""}${pct(dlt)}% vs mês anterior` : null;
}
// Cards do mês: só campos reais; deltas null são omitidos (o componente esconde).
function monthMetricsCards(r) {
  if (!r) return null;
  const cards = [{
    label: "Receitas (mês)", value: eur(r.receitas),
    delta: deltaStr(r.receitasDelta), tone: (r.receitasDelta ?? 0) >= 0 ? "success" : "danger",
  }];
  if (typeof r.despesas === "number") {
    cards.push({
      label: "Despesas (mês)", value: eur(r.despesas),
      delta: deltaStr(r.despesasDelta), tone: typeof r.despesasDelta === "number" && r.despesasDelta > 0 ? "danger" : "success",
    });
  }
  if (typeof r.resultado === "number") {
    cards.push({
      label: "Resultado (mês)", value: eur(r.resultado),
      delta: deltaStr(r.resultadoDelta), tone: r.resultado >= 0 ? "success" : "danger",
    });
  }
  return cards;
}