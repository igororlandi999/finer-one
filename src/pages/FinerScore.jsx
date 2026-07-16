import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  ArrowUpRight, TrendingUp, RefreshCw, Download, Droplets,
  Building2, Clock, BarChart3,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";
import DiagnosticGauge from "../components/diagnostic/DiagnosticGauge";

import { finerScore } from "../data/mockData";
import { useFinerData } from "../context/FinerDataContext";
import DemoTag from "../components/ui/DemoTag";

const FACTOR_ICONS = {
  liquidez:      Droplets,
  rentabilidade: TrendingUp,
  endividamento: Building2,
  crescimento:   BarChart3,
  pontualidade:  Clock,
};

// ── Tooltip da evolução ─────────────────────────────────────
function HistTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{d.mes}</div>
      <div className="font-semibold mt-0.5">Score {d.score} · {d.label}</div>
    </div>
  );
}

// ── Barra horizontal de fator ──────────────────────────────
function FactorRow({ factor }) {
  const Icon = FACTOR_ICONS[factor.key] ?? Droplets;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600 shrink-0">
        <Icon size={15} />
      </span>
      <span className="text-sm text-slate-700 w-36 shrink-0">{factor.label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${factor.score}%`, backgroundColor: factor.color }}
        />
      </div>
      <span className="text-sm font-semibold text-slate-800 tabular-nums w-12 text-right">{factor.score}/100</span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border shrink-0 w-24 justify-center ${
        factor.badge === "Muito Bom" ? "bg-brand-50 text-brand-700 border-brand-200" :
        factor.badge === "Bom"       ? "bg-brand-50 text-brand-700 border-brand-200" :
        factor.badge === "Regular"   ? "bg-amber-50 text-amber-700 border-amber-200" :
        "bg-rose-50 text-rose-700 border-rose-200"
      }`}>
        {factor.badge}
      </span>
    </div>
  );
}

// Mensagem do box de estado derivada do estado real (ou mock) — sem texto fixo contraditório.
const ESTADO_UI = {
  "Saudável": { box: "bg-brand-50 border-brand-100", text: "text-brand-700", headline: "A empresa está financeiramente saudável", sub: "Continue assim. Mantenha o foco e aproveite as oportunidades para crescer ainda mais." },
  "Atenção":  { box: "bg-amber-50 border-amber-100", text: "text-amber-700", headline: "A empresa apresenta sinais que pedem atenção", sub: "Reveja os fatores que penalizam o score e siga as ações recomendadas." },
  "Crítico":  { box: "bg-rose-50 border-rose-100",  text: "text-rose-700",  headline: "A empresa apresenta sinais críticos", sub: "Priorize as ações recomendadas para recuperar a saúde financeira." },
};

// ── Tela ────────────────────────────────────────────────────
export default function FinerScore() {
  const { sales, source } = useFinerData();
  const d = sales?.diagnostico ?? null;

  // Vista: score real quando existir; histórico/fatores continuam mock (selados).
  const view = d
    ? { ...finerScore, score: d.score, label: d.scoreLabel, estado: d.estado, ultimaAtualizacao: d.ultimaAtualizacao, previous: null, variacao: null }
    : finerScore;
  const demoScore = source === "api" && !d;
  const demoHist = source === "api"; // evolução e fatores: sem base real, sempre Demo em api
  const melhorias = d?.acoes?.length
    ? d.acoes.map((a) => ({ id: a.id, titulo: a.titulo, descricao: a.descricao, impacto: null }))
    : finerScore.comoMelhorar;
  const demoMelhorar = source === "api" && !d?.acoes?.length;
  const estadoUI = ESTADO_UI[view.estado] ?? ESTADO_UI["Saudável"];

  return (
    <>
      <PageHeader
        title="Finer Score"
        subtitle="Uma nota única de 0 a 100 que resume a saúde financeira da Overcel — útil também para bancos e investidores."
        actions={
          <>
            <span className="text-xs text-slate-500 mr-1">Atualizado {view.ultimaAtualizacao}</span>
            <button className="btn-secondary"><RefreshCw size={14} />Recalcular</button>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
          </>
        }
      />

      {/* Score principal + evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-5">
          <div className="card p-6 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">Score atual{demoScore && <DemoTag />}</h3>
            <div className="flex-1 flex items-center justify-center py-2">
              <DiagnosticGauge score={view.score} label={view.label} size={240} />
            </div>

            <div className={`mt-4 p-4 rounded-lg border ${estadoUI.box}`}>
              <div className={`flex items-center gap-2 font-semibold ${estadoUI.text}`}>
                <TrendingUp size={16} />
                {estadoUI.headline}
              </div>
              <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                {estadoUI.sub}
              </p>
            </div>

            {typeof view.variacao === "number" && (
              <div className="mt-3 p-4 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">Variação vs mês anterior{source === "api" && <DemoTag />}</div>
                  <div className="text-xl font-semibold text-brand-700 mt-0.5 inline-flex items-center gap-1">
                    <ArrowUpRight size={18} />+{view.variacao} pontos
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  de {view.previous}<br />para {view.score}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">Evolução do Finer Score{demoHist && <DemoTag />}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Últimos 6 meses</p>
              </div>
              <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
                <option>Últimos 6 meses</option>
                <option>Últimos 12 meses</option>
              </select>
            </div>
            <div className="flex-1" style={{ minHeight: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={finerScore.historico} margin={{ top: 20, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} />
                  <Tooltip content={<HistTooltip />} />
                  <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.6} dot={{ r: 4, fill: "#fff", stroke: "#2563eb", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#2563eb" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Histórico em tiles */}
            <div className="grid grid-cols-6 gap-2 mt-4">
              {finerScore.historico.map((h, i) => {
                const isLast = i === finerScore.historico.length - 1;
                return (
                  <div
                    key={h.mes}
                    className={`p-2 rounded-md border text-center ${
                      isLast ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-slate-50/40"
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{h.mes}</div>
                    <div className="text-base font-semibold text-slate-800 mt-0.5">{h.score}</div>
                    <div className={`text-[10px] mt-0.5 ${
                      h.label === "Muito Bom" || h.label === "Bom" ? "text-brand-600" :
                      h.label === "Regular" ? "text-amber-600" : "text-rose-600"
                    }`}>
                      {h.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fatores e como melhorar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">Fatores que mais impactam o seu score{demoHist && <DemoTag />}</h3>
            <p className="text-xs text-slate-500 mb-4">Como cada dimensão contribui</p>
            <div>
              {finerScore.fatores.map((f) => <FactorRow key={f.key} factor={f} />)}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">Como melhorar o seu score{demoMelhorar && <DemoTag />}</h3>
            <p className="text-xs text-slate-500 mb-4">Ações com maior impacto potencial</p>
            <div className="space-y-3">
              {melhorias.map((m) => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200/70">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
                    <TrendingUp size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{m.titulo}</p>
                      {m.impacto && <span className="text-xs font-semibold text-brand-700 shrink-0">{m.impacto}</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{m.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}