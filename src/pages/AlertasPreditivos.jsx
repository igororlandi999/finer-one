import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2, Sparkles,
  CalendarRange, Target, Download, RefreshCw,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";

import { predictiveSummary, predictiveAlerts, predictiveForecast } from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";

const SEV = {
  danger:  { icon: AlertCircle,   color: "text-rose-600",  bg: "bg-rose-50",  border: "border-rose-200",  bar: "bg-rose-500",  label: "Risco Elevado" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500", label: "Atenção" },
  info:    { icon: Info,          color: "text-sky-600",   bg: "bg-sky-50",   border: "border-sky-200",   bar: "bg-sky-500",   label: "Informativo" },
  success: { icon: CheckCircle2,  color: "text-brand-600", bg: "bg-brand-50", border: "border-brand-200", bar: "bg-brand-500", label: "Sob controlo" },
};

// ── Cards de resumo (topo) ──────────────────────────────────
function SummaryCard({ severity, count, description }) {
  const cfg = SEV[severity];
  const Icon = cfg.icon;
  return (
    <div className="card p-5 flex items-start gap-4">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${cfg.bg} ${cfg.color}`}>
        <Icon size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</div>
        <div className="text-[26px] font-semibold text-slate-900 leading-tight mt-0.5">{count}</div>
        <div className="text-xs text-slate-500 mt-1">{description}</div>
      </div>
    </div>
  );
}

// ── Tooltip da previsão ─────────────────────────────────────
function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const zoneLabel = d.zone === "danger" ? "Zona crítica" : d.zone === "warn" ? "Zona de atenção" : "Zona segura";
  const zoneColor = d.zone === "danger" ? "text-rose-300" : d.zone === "warn" ? "text-amber-300" : "text-brand-300";
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">{formatEUR(d.saldo)}</div>
      <div className={`mt-0.5 ${zoneColor}`}>{zoneLabel}</div>
    </div>
  );
}

// ── Linha de alerta preditivo ───────────────────────────────
function PredictiveRow({ alert }) {
  const cfg  = SEV[alert.severity];
  const Icon = cfg.icon;
  return (
    <div className="relative pl-3">
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${cfg.bar}`} aria-hidden />
      <div className="flex items-start gap-3 py-4 px-1">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color} shrink-0`}>
          <Icon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {alert.daysAhead != null && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                <CalendarRange size={11} />em {alert.daysAhead} dias
              </span>
            )}
            <span className="text-xs text-slate-400 ml-auto inline-flex items-center gap-1">
              <Target size={11} />Confiança {alert.confidence}%
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{alert.title}</p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.description}</p>
          <div className="mt-2 text-xs text-slate-500">
            <span className="text-slate-400">Data de impacto:</span>{" "}
            <span className="font-medium text-slate-700">{alert.impactDate}</span>
          </div>
        </div>
        <button className="btn-secondary shrink-0 hidden sm:inline-flex">Ver plano</button>
      </div>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function AlertasPreditivos() {
  const minSaldo = Math.min(...predictiveForecast.map((p) => p.saldo));
  const maxSaldo = Math.max(...predictiveForecast.map((p) => p.saldo));

  return (
    <>
      <PageHeader
        title="Alertas Preditivos"
        subtitle="A IA analisa o histórico da Overcel e avisa-o antes de problemas de tesouraria, margem ou cobranças acontecerem."
        actions={
          <>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-1 rounded border border-brand-200">
              <Sparkles size={12} />Análise preditiva
            </span>
            <button className="btn-secondary"><RefreshCw size={14} />Recalcular</button>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
          </>
        }
      />

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SummaryCard severity="danger"  count={predictiveSummary.riscoElevado} description="Requerem ação imediata" />
        <SummaryCard severity="warning" count={predictiveSummary.atencao}      description="A monitorizar de perto" />
        <SummaryCard severity="info"    count={predictiveSummary.informativos} description="Oportunidades detetadas" />
        <SummaryCard severity="success" count={predictiveSummary.sobControle}  description="Indicadores positivos" />
      </div>

      {/* Previsão de saldo */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Previsão de saldo (60 dias)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Zonas: segura · atenção · crítica</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" />Segura</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Atenção</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Crítica</span>
          </div>
        </div>
        <div className="h-[220px] sm:h-[270px] lg:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={predictiveForecast} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="zoneGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#10B981" stopOpacity={0.22} />
                  <stop offset="55%"  stopColor="#f59e0b" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0.22} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
              <Tooltip content={<ForecastTooltip />} />
              <ReferenceLine y={0}     stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: "Limite 0 €",     position: "right", fill: "#94a3b8", fontSize: 10 }} />
              <ReferenceLine y={15000} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: "Limite segurança", position: "right", fill: "#d97706", fontSize: 10 }} />
              <Area type="monotone" dataKey="saldo" stroke="#0f172a" strokeWidth={2.4} fill="url(#zoneGrad)" dot={(props) => {
                const { cx, cy, payload, index } = props;
                const color = payload.zone === "danger" ? "#EF4444" : payload.zone === "warn" ? "#f59e0b" : "#10B981";
                return <circle key={`pt-${index}`} cx={cx} cy={cy} r={4} fill="#fff" stroke={color} strokeWidth={2} />;
              }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-xs text-slate-500">Saldo máximo previsto</div>
            <div className="text-base font-semibold text-brand-700 mt-0.5">{formatEUR(maxSaldo)}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-xs text-slate-500">Saldo mínimo previsto</div>
            <div className="text-base font-semibold text-rose-600 mt-0.5">{formatEUR(minSaldo)}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/70">
            <div className="text-xs text-slate-500">Dias até zona crítica</div>
            <div className="text-base font-semibold text-amber-600 mt-0.5">~37 dias</div>
          </div>
        </div>
      </div>

      {/* Lista de alertas preditivos */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Alertas preditivos detetados</h3>
            <p className="text-xs text-slate-500 mt-0.5">Ordenados por gravidade</p>
          </div>
          <span className="text-xs text-slate-500">{predictiveAlerts.length} alertas</span>
        </div>
        <div className="divide-y divide-slate-100 px-4">
          {predictiveAlerts.map((a) => <PredictiveRow key={a.id} alert={a} />)}
        </div>
      </div>
    </>
  );
}
