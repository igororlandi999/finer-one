import {
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from "recharts";
import {
  Sparkles, AlertCircle, AlertTriangle, Info, CheckCircle2,
  TrendingUp, TrendingDown, Handshake, CalendarRange, Send, MessageSquare,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";

import { aiInsights, aiDetail, aiRecommendations, aiConversation, aiQuestions } from "../data/mockData";
import { formatEUR } from "../lib/format";

const TONE_STYLE = {
  danger:  { icon: AlertCircle,   bg: "bg-rose-50",  text: "text-rose-700",  border: "border-rose-200",  cta: "text-rose-600"  },
  warning: { icon: AlertTriangle, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", cta: "text-amber-600" },
  info:    { icon: Info,          bg: "bg-sky-50",   text: "text-sky-700",   border: "border-sky-200",   cta: "text-sky-600"   },
  success: { icon: CheckCircle2,  bg: "bg-brand-50", text: "text-brand-700", border: "border-brand-200", cta: "text-brand-600" },
};

const REC_ICON = [TrendingUp, Handshake, CalendarRange];

// ── Insight card (4 colunas no topo) ────────────────────────
function InsightCard({ insight }) {
  const cfg = TONE_STYLE[insight.tone];
  const Icon = cfg.icon;
  return (
    <div className={`card p-5 border ${cfg.border} ${cfg.bg}`}>
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${cfg.text}`}>
        <Icon size={14} />
        {insight.tone === "danger" ? "Alerta Importante" :
         insight.tone === "warning"? "Atenção" :
         insight.tone === "info"   ? "Oportunidade" : "Tudo sob controlo"}
      </div>
      <h3 className="text-base font-semibold text-slate-900 mt-2">{insight.title}</h3>
      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{insight.description}</p>
      <button className={`mt-3 text-xs font-semibold ${cfg.cta} hover:underline inline-flex items-center gap-1`}>
        {insight.cta} →
      </button>
    </div>
  );
}

// ── Tooltip ─────────────────────────────────────────────────
function MarginTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">Margem {payload[0].value}%</div>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function IAFinanceira() {
  return (
    <>
      <PageHeader
        title="IA Financeira"
        subtitle="O seu CFO digital: identifica padrões, encontra oportunidades e sugere ações concretas — em linguagem clara."
        actions={
          <>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-1 rounded border border-brand-200">
              <Sparkles size={12} />Análise 24/7
            </span>
            <button className="btn-primary"><MessageSquare size={14} />Falar com a IA</button>
          </>
        }
      />

      {/* O que a IA identificou hoje */}
      <div className="mb-2">
        <h2 className="text-base font-semibold text-slate-800">O que a IA identificou hoje</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {aiInsights.map((i) => <InsightCard key={i.id} insight={i} />)}
      </div>

      {/* Detalhe + Recomendações */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Detalhe */}
        <div className="lg:col-span-8">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Insight em detalhe</h3>
                <p className="text-xs text-slate-500 mt-0.5">{aiDetail.titulo}</p>
              </div>
              <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
                <option>Últimos 3 meses</option>
                <option>Últimos 6 meses</option>
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Resumo */}
              <div className="lg:col-span-1 p-4 rounded-lg bg-rose-50/40 border border-rose-100">
                <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-rose-700">
                  <AlertCircle size={12} />Queda de margem
                </span>
                <p className="text-xs text-slate-700 leading-relaxed mt-2">{aiDetail.resumo}</p>
                <div className="mt-3 pt-3 border-t border-rose-200">
                  <div className="text-xs text-slate-500">Impacto estimado</div>
                  <div className="text-xl font-semibold text-rose-600 mt-0.5">{formatEUR(aiDetail.impacto)}</div>
                  <div className="text-xs text-slate-500 mt-1">no resultado líquido — {aiDetail.prazo}</div>
                </div>
              </div>

              {/* Gráfico */}
              <div className="lg:col-span-1 h-[180px] sm:h-[200px] lg:h-[220px]">
                <div className="text-xs text-slate-500 mb-2">Evolução da Margem Bruta (%)</div>
                <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={aiDetail.evolucao} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="margGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#EF4444" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 40]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={32} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<MarginTooltip />} />
                    <Area type="monotone" dataKey="valor" stroke="#EF4444" strokeWidth={2.4} fill="url(#margGrad)" dot={{ r: 4, fill: "#fff", stroke: "#EF4444", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Fatores */}
              <div className="lg:col-span-1">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">Principais fatores</div>
                <div className="space-y-2">
                  {aiDetail.fatores.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-slate-50 border border-slate-200/60">
                      <span className="text-xs text-slate-700">{f.label}</span>
                      <span className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                        f.tone === "up" ? "text-brand-600" : "text-rose-600"
                      }`}>
                        {f.tone === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {f.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-brand-50/60 border border-brand-100 flex items-start gap-2">
              <Sparkles size={14} className="text-brand-600 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-brand-700">Sugestão da IA:</span>{" "}
                Rever preços de venda e renegociar condições com fornecedores para recuperar margem.
              </p>
            </div>
          </div>
        </div>

        {/* Recomendações */}
        <div className="lg:col-span-4">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Recomendações da IA</h3>
            <p className="text-xs text-slate-500 mb-4">Impacto estimado em €</p>
            <div className="space-y-3">
              {aiRecommendations.map((r, i) => {
                const Icon = REC_ICON[i % REC_ICON.length];
                return (
                  <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200/70 hover:border-brand-300 transition-colors">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
                      <Icon size={15} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.desc}</p>
                      <div className="text-xs font-semibold text-brand-700 mt-1.5">+ {formatEUR(r.impact)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Conversa recente + perguntas sugeridas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Conversa recente com a IA</h3>
          <div className="space-y-2.5">
            {aiConversation.map((c) => (
              <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ai-500 text-white shrink-0">
                  <Sparkles size={13} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500">{c.timestamp}</div>
                  <p className="text-sm text-slate-700 mt-0.5">{c.preview}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Perguntas que pode fazer à IA</h3>
          <div className="space-y-2">
            {aiQuestions.map((q, i) => (
              <button
                key={i}
                className="w-full text-left text-sm text-slate-700 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
          <button className="mt-4 w-full btn-primary justify-center">
            <Send size={14} />Fazer uma pergunta à IA
          </button>
        </div>
      </div>
    </>
  );
}
