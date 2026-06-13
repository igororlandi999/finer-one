import {
  LineChart, Line, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Stethoscope, Target, TrendingDown, ArrowUpRight, ArrowDownRight,
  AlertCircle, AlertTriangle, Lightbulb, RefreshCw, Download,
  Sparkles, Send,
} from "lucide-react";

import PageHeader        from "../layouts/PageHeader";
import MetricCard        from "../components/ui/MetricCard";
import StatusBadge       from "../components/ui/StatusBadge";
import DiagnosticGauge   from "../components/diagnostic/DiagnosticGauge";

import { usePlan }       from "../context/PlanContext";
import { SCREENS }       from "../config/planConfig";
import { diagnostic }    from "../data/mockData";
import { formatEUR }     from "../lib/format";

// ── helpers visuais por severidade ──────────────────────────
const SEV_BG   = { danger: "bg-rose-50  text-rose-600  border-rose-100",  warning: "bg-amber-50 text-amber-600 border-amber-100" };
const SEV_TEXT = { danger: "text-rose-700", warning: "text-amber-700" };
const SEV_ICON = { danger: AlertCircle, warning: AlertTriangle };

// ── Tooltip da evolução ──────────────────────────────────────
function EvTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{d.mes}</div>
      <div className="font-semibold mt-0.5">Score {d.score} · {d.estado}</div>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function DiagnosticoFinanceiro() {
  const { navigateTo }  = usePlan();
  const scoreDelta      = diagnostic.score - diagnostic.scorePrevious;
  const totalAcoes      = diagnostic.acoes.reduce((acc, a) => acc + a.impacto, 0);

  const stateVariant =
    diagnostic.estado === "Saudável" ? "saudavel" :
    diagnostic.estado === "Atenção"  ? "atencao"  : "critico";

  return (
    <>
      <PageHeader
        title="Diagnóstico Financeiro"
        subtitle="Uma leitura clara da situação financeira da Overcel, sem precisar interpretar dezenas de gráficos."
        actions={
          <>
            <span className="text-xs text-slate-500 mr-1">Atualizado {diagnostic.ultimaAtualizacao}</span>
            <button className="btn-secondary"><RefreshCw size={14} />Recalcular</button>
            <button className="btn-secondary"><Download size={14} />Exportar PDF</button>
          </>
        }
      />

      {/* KPIs topo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">

        {/* Estado */}
        <div className="card p-5">
          <span className="label-uppercase">Estado da Empresa</span>
          <div className="mt-3">
            <StatusBadge variant={stateVariant} className="text-sm px-2.5 py-1">
              {diagnostic.estado}
            </StatusBadge>
          </div>
          <p className="text-xs text-slate-500 mt-3">Avaliação global de saúde financeira</p>
        </div>

        {/* Score */}
        <MetricCard
          label="Finer Score"
          value={`${diagnostic.score}/100`}
          delta={scoreDelta}
          deltaSuffix=" pts"
          deltaLabel={`de ${diagnostic.scorePrevious} para ${diagnostic.score}`}
          icon={Sparkles}
          iconBg="bg-brand-50 text-brand-600"
          tone="success"
        />

        {/* Impacto */}
        <MetricCard
          label="Impacto Identificado"
          value={formatEUR(diagnostic.impactoFinanceiro)}
          icon={TrendingDown}
          iconBg="bg-amber-50 text-amber-600"
          helper="A recuperar com ações sugeridas"
          tone="warning"
        />

        {/* Prioridade */}
        <div className="card p-5">
          <span className="label-uppercase">Prioridade Máxima</span>
          <div className="flex items-start gap-3 mt-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-500 shrink-0">
              <Target size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-snug">{diagnostic.prioridadeMaxima}</p>
              <p className="text-xs text-slate-500 mt-1">Agir nos próximos 30 dias</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gauge + Evolução */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">

        {/* Gauge */}
        <div className="lg:col-span-5">
          <div className="card p-6 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-slate-800">Score de Saúde Financeira</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">Avaliação global em tempo real</p>
            <div className="flex-1 flex items-center justify-center py-2">
              <DiagnosticGauge score={diagnostic.score} label={diagnostic.scoreLabel} size={240} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 pt-4 border-t border-slate-100 text-center">
              <div><div className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider">0 - 40</div><div className="text-xs text-slate-500 mt-0.5">Crítico</div></div>
              <div><div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">41 - 65</div><div className="text-xs text-slate-500 mt-0.5">Atenção</div></div>
              <div><div className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider">66 - 100</div><div className="text-xs text-slate-500 mt-0.5">Saudável</div></div>
            </div>
          </div>
        </div>

        {/* Evolução */}
        <div className="lg:col-span-7">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Evolução do Diagnóstico</h3>
                <p className="text-xs text-slate-500 mt-0.5">Últimos 6 meses</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Variação 6M</div>
                <div className="text-sm font-semibold text-brand-600 inline-flex items-center gap-0.5">
                  <ArrowUpRight size={14} />+20 pts
                </div>
              </div>
            </div>
            <div className="flex-1" style={{ minHeight: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={diagnostic.evolucao} margin={{ top: 20, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} />
                  <Tooltip content={<EvTooltip />} />
                  <ReferenceLine y={65} stroke="#cbd5e1" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2.6} dot={{ r: 4, fill: "#fff", stroke: "#10B981", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#10B981" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo executivo */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-brand-50/60 to-white border-brand-100">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white shrink-0">
            <Stethoscope size={20} />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-sm font-semibold text-slate-800">Resumo executivo</h3>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-700 bg-white px-1.5 py-0.5 rounded border border-brand-200">
                Linguagem simples
              </span>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-700">{diagnostic.resumoExecutivo}</p>
          </div>
        </div>
      </div>

      {/* Problemas + Ações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Problemas */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Principais problemas identificados</h3>
          <p className="text-xs text-slate-500 mb-4">O que está a impactar o seu negócio agora</p>
          <div className="space-y-3">
            {diagnostic.problemas.map((p, i) => {
              const Icon = SEV_ICON[p.severidade] ?? AlertCircle;
              return (
                <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200/70">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 ${SEV_BG[p.severidade]}`}>
                    <Icon size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{i + 1}. {p.titulo}</p>
                      <span className={`text-xs font-semibold shrink-0 ${SEV_TEXT[p.severidade]}`}>
                        {formatEUR(p.impacto)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{p.descricao}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ações */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">Ações recomendadas</h3>
          <p className="text-xs text-slate-500 mb-4">
            Impacto estimado se agir agora:{" "}
            <strong className="text-brand-700">+{formatEUR(totalAcoes)}</strong>
          </p>
          <div className="space-y-3">
            {diagnostic.acoes.map((a, i) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200/70 hover:border-brand-300 transition-colors">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 border border-brand-100 shrink-0">
                  <Lightbulb size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{i + 1}. {a.titulo}</p>
                    <span className="text-xs font-semibold text-brand-700 shrink-0">+{formatEUR(a.impacto)}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{a.descricao}</p>
                  <p className="text-[11px] text-slate-500 mt-2">Prazo sugerido: <strong>{a.prazo}</strong></p>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full btn-primary justify-center">Ver plano de ação completo</button>
        </div>
      </div>

      {/* O que mudou + Perguntas IA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* O que mudou */}
        <div className="lg:col-span-7">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-800">O que mudou desde o mês passado</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">Diferenças relevantes face a Mar 26</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {diagnostic.mudancasUltimoMes.map((m, i) => {
                const isUp = m.tendencia === "up";
                return (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-200/60">
                    <div className="text-xs text-slate-500">{m.label}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-base font-semibold ${isUp ? "text-brand-700" : "text-rose-600"}`}>{m.valor}</span>
                      {isUp
                        ? <ArrowUpRight size={15} className="text-brand-600" />
                        : <ArrowDownRight size={15} className="text-rose-500" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{m.detalhe}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Perguntas IA */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-slate-800">Pergunte à Finer</h3>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">IA</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Sugestões com base no seu diagnóstico</p>
            <div className="space-y-2 flex-1">
              {diagnostic.perguntasIA.map((q, i) => (
                <button
                  key={i}
                  onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)}
                  className="w-full text-left text-sm text-slate-700 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)}
              className="mt-3 w-full btn-secondary justify-center"
            >
              <Send size={14} />Abrir chat financeiro
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
