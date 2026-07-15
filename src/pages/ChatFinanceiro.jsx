import { useEffect, useMemo, useState } from "react";
import {
  Send, History, Plus, Sparkles, FileText, Users, BarChart3,
  CalendarRange, ArrowUpRight, ArrowDownRight, MessageSquare,
} from "lucide-react";

import PageHeader  from "../layouts/PageHeader";
import { currentUser } from "../data/mockData";
import {
  chatHistory, chatStartSuggestions, chatInsights, chatRecentQuestions,
} from "../data/mockData";
import { useFinerData } from "../context/FinerDataContext";
import DemoTag from "../components/ui/DemoTag";
import { answerQuestion, buildWelcome, SUPPORTED_QUESTIONS, PENDING_CHAT_QUESTION_KEY } from "../utils/chatEngine";

// ── Avatar IA ────────────────────────────────────────────────
function AIBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ai-500 text-white shrink-0">
      <Sparkles size={14} />
    </div>
  );
}

// ── Avatar utilizador ───────────────────────────────────────
function UserBadge() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shrink-0">
      {currentUser.initials}
    </div>
  );
}

// ── Card de métrica inline (resposta IA) ────────────────────
function InlineMetric({ label, value, delta, tone = "success" }) {
  const color = tone === "success" ? "text-brand-600" : "text-rose-600";
  const Arrow = String(delta ?? "").trim().startsWith("-") ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
      {delta ? (
        <div className={`text-xs font-medium mt-0.5 inline-flex items-center gap-0.5 ${color}`}>
          <Arrow size={11} />{delta}
        </div>
      ) : null}
    </div>
  );
}

// ── Tabela inline (resposta IA) ─────────────────────────────
function InlineTable({ table }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 mt-2">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50">
            {table.headers.map((h, i) => (
              <th key={i} className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className="border-t border-slate-100">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 text-sm text-slate-700 ${ci >= 2 ? "text-right tabular-nums" : ""} ${ci === 1 ? "font-medium text-slate-800" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {table.totals && (
            <tr className="border-t border-slate-200 bg-slate-50/60">
              {table.totals.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 text-sm font-semibold text-slate-900 ${ci >= 2 ? "text-right tabular-nums" : ""}`}>{cell}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Mensagem ────────────────────────────────────────────────
function Message({ msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-slate-100 px-4 py-2.5">
          <div className="text-xs text-slate-500 mb-0.5">Eu · {msg.timestamp}</div>
          <p className="text-sm text-slate-800">{msg.content}</p>
        </div>
        <UserBadge />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <AIBadge />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 mb-1">Finer IA · {msg.timestamp}</div>
        <p className="text-sm text-slate-800 leading-relaxed">{msg.content}</p>

        {msg.metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {msg.metrics.map((m, i) => (
              <InlineMetric key={i} {...m} />
            ))}
          </div>
        )}

        {msg.highlights && (
          <ul className="mt-3 space-y-1 text-sm text-slate-700 list-disc pl-5">
            {msg.highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}

        {msg.table && <InlineTable table={msg.table} />}

        {msg.followUp && (
          <p className="text-sm text-slate-700 mt-3">{msg.followUp}</p>
        )}
      </div>
    </div>
  );
}

// ── Ação rápida (lateral) ───────────────────────────────────
function QuickAction({ icon: Icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-slate-200/70 hover:border-brand-300 hover:bg-slate-50 transition-colors"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{description}</p>
      </div>
    </button>
  );
}

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Ações rápidas: no modo dados reais só sugerimos perguntas que o motor sabe responder.
const QUICK_MOCK = [
  { icon: FileText,      title: "Resumo executivo",     description: "Obtenha um resumo do mês",          q: "Resumo executivo do mês." },
  { icon: Users,         title: "Análise de clientes",  description: "Top clientes e contribuição",       q: "Quais os meus principais clientes?" },
  { icon: BarChart3,     title: "Análise de despesas",  description: "Onde está a gastar mais",           q: "Onde estou a gastar mais?" },
  { icon: CalendarRange, title: "Previsão de cashflow", description: "Projete cashflow futuro",           q: "Qual a previsão de cashflow nos próximos 60 dias?" },
];
const QUICK_LIVE = [
  { icon: FileText,      title: "Saúde da empresa",     description: "Estado e score atuais",             q: "A minha empresa está saudável?" },
  { icon: BarChart3,     title: "Resultado do mês",     description: "Receitas, despesas e resultado",    q: "Como está o resultado do mês?" },
  { icon: Users,         title: "Fornecedores",         description: "Quem pesa mais no caixa",           q: "Quais fornecedores pesam no caixa?" },
  { icon: CalendarRange, title: "Ações prioritárias",   description: "O que fazer primeiro",              q: "Quais ações devo priorizar?" },
];

// ── Tela ────────────────────────────────────────────────────
export default function ChatFinanceiro() {
  const { sales, source, loading } = useFinerData();
  const isLive = source === "api";
  const [input, setInput] = useState("");
  const [sent, setSent] = useState([]); // mensagens desta sessão (modo dados reais)

  // `source` resolve de forma assíncrona, por isso a conversa é derivada e não fixada no mount.
  const welcome = useMemo(
    () => ({ id: "w1", role: "ai", timestamp: nowHM(), ...buildWelcome(sales) }),
    [sales]
  );
  const thread = isLive ? [welcome, ...sent] : chatHistory;
  const suggestions = isLive ? SUPPORTED_QUESTIONS.slice(0, 5) : chatStartSuggestions;
  const recentes = isLive ? SUPPORTED_QUESTIONS.slice(5) : chatRecentQuestions;
  const insights = isLive && sales?.diagnostico
    ? sales.diagnostico.mudancasUltimoMes.map((m) => `${m.label}: ${m.valor} (${m.detalhe}).`)
    : chatInsights;

  function handleSend() {
    const text = input.trim();
    if (!text || !isLive) return; // no modo demo a conversa é estática
    const reply = answerQuestion(text, sales);
    setSent((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", timestamp: nowHM(), content: text },
      { id: `a-${Date.now()}`, role: "ai", timestamp: nowHM(), ...reply },
    ]);
    setInput("");
  }

  // Pergunta vinda do Diagnóstico (handoff one-shot via sessionStorage).
  // Só consome quando o source já resolveu; em modo demo descarta em silêncio.
  useEffect(() => {
    if (loading) return;
    let pending = null;
    try {
      pending = sessionStorage.getItem(PENDING_CHAT_QUESTION_KEY);
      if (pending) sessionStorage.removeItem(PENDING_CHAT_QUESTION_KEY);
    } catch { return; }
    if (!pending || !isLive) return;
    const reply = answerQuestion(pending, sales);
    setSent((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", timestamp: nowHM(), content: pending },
      { id: `a-${Date.now()}`, role: "ai", timestamp: nowHM(), ...reply },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isLive]);

  return (
    <>
      <PageHeader
        title="Chat Financeiro"
        subtitle="Pergunte em linguagem natural sobre a Overcel — obtenha respostas com números reais em segundos."
        actions={
          <>
            <button className="btn-secondary"><History size={14} />Histórico</button>
            <button className="btn-primary"><Plus size={14} />Nova conversa</button>
          </>
        }
      />

      {/* Sugestões para começar */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 mr-1">
          Sugestões:
        </span>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => setInput(s)}
            className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-brand-300 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Conversa */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="card flex flex-col flex-1">
            <div className="flex-1 p-5 space-y-5 overflow-y-auto" style={{ maxHeight: 580 }}>
              {thread.map((m) => <Message key={m.id} msg={m} />)}
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 p-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-200">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                  placeholder="Faça uma pergunta sobre a Overcel..."
                  className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
                />
                <button onClick={handleSend} className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 text-white transition-colors">
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                O assistente pode cometer erros. Confirme sempre a informação importante.
              </p>
            </div>
          </div>
        </div>

        {/* Coluna lateral */}
        <div className="lg:col-span-4 space-y-4">
          {/* Ações rápidas */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Ações rápidas</h3>
            <div className="space-y-2">
              {(isLive ? QUICK_LIVE : QUICK_MOCK).map((qa) => (
                <QuickAction key={qa.title} icon={qa.icon} title={qa.title} description={qa.description} onClick={() => setInput(qa.q)} />
              ))}
            </div>
          </div>

          {/* Insights */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">Insights inteligentes{source === "api" && !sales?.diagnostico && <DemoTag />}</h3>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">Novo</span>
            </div>
            <ul className="space-y-2.5">
              {insights.map((ins, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Sparkles size={14} className="text-brand-500 mt-0.5 shrink-0" />
                  <span className="leading-relaxed">{ins}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Perguntas recentes */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Perguntas recentes</h3>
            <ul className="space-y-1.5">
              {recentes.map((q, i) => (
                <li key={i}>
                  <button
                    onClick={() => setInput(q)}
                    className="w-full flex items-start gap-2 text-left text-sm text-slate-600 hover:text-brand-700 transition-colors py-1"
                  >
                    <MessageSquare size={13} className="text-slate-400 mt-1 shrink-0" />
                    <span className="line-clamp-1">{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}