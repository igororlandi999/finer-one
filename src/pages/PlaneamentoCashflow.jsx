import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, ShieldAlert, Plus, Download, FileText,
  AlertTriangle, Info, CheckCircle2,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";
import MetricCard from "../components/ui/MetricCard";
import StatusBadge from "../components/ui/StatusBadge";

import {
  planningMetrics, planningCashflowDaily, planningPeriodSummary, planningRecommendations,
} from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";

// ── Tooltip ─────────────────────────────────────────────────
function CashTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entradas = payload.find((p) => p.dataKey === "entradas")?.value ?? 0;
  const saidas   = payload.find((p) => p.dataKey === "saidas")?.value   ?? 0;
  const saldo    = payload.find((p) => p.dataKey === "saldo")?.value    ?? 0;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg space-y-0.5 min-w-[160px]">
      <div className="text-slate-300 mb-1">{label}</div>
      <div className="flex justify-between gap-3"><span className="text-brand-300">Entradas</span><span>{formatEUR(entradas)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-rose-300">Saídas</span><span>{formatEUR(Math.abs(saidas))}</span></div>
      <div className="flex justify-between gap-3 border-t border-slate-700 mt-1 pt-1 font-semibold"><span>Saldo</span><span>{formatEUR(saldo)}</span></div>
    </div>
  );
}

const REC_STYLE = {
  success: { icon: CheckCircle2, color: "text-brand-600", bg: "bg-brand-50" },
  warning: { icon: AlertTriangle,color: "text-amber-600", bg: "bg-amber-50" },
  info:    { icon: Info,         color: "text-sky-600",   bg: "bg-sky-50"   },
};

// ── Tela ────────────────────────────────────────────────────
export default function PlaneamentoCashflow() {
  const riskVariant =
    planningMetrics.riscoLiquidez === "Baixo" ? "saudavel" :
    planningMetrics.riscoLiquidez === "Médio" ? "atencao"  : "critico";

  return (
    <>
      <PageHeader
        title="Planeamento e Cashflow"
        subtitle="Veja o saldo previsto nos próximos 90 dias e antecipe problemas de tesouraria antes de acontecerem."
        actions={
          <>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><FileText size={14} />Extrair PDF</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={14} />Novo cenário</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Saldo Atual"
          value={formatEUR(planningMetrics.saldoAtual)}
          icon={Wallet}
          iconBg="bg-brand-50 text-brand-600"
          helper="Saldo em 31/05/2026"
        />
        <MetricCard
          label="Saldo Previsto (30 dias)"
          value={formatEUR(planningMetrics.saldoPrevisto30)}
          delta={planningMetrics.saldoPrevisto30D}
          deltaLabel="vs saldo atual"
          icon={TrendingUp}
          iconBg="bg-sky-50 text-sky-600"
          tone="success"
        />
        <MetricCard
          label="Saldo Previsto (90 dias)"
          value={formatEUR(planningMetrics.saldoPrevisto90)}
          delta={planningMetrics.saldoPrevisto90D}
          deltaLabel="vs saldo atual"
          icon={TrendingUp}
          iconBg="bg-purple-50 text-purple-600"
          tone="success"
        />
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="label-uppercase">Risco de Liquidez</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <ShieldAlert size={18} />
            </span>
          </div>
          <div>
            <StatusBadge variant={riskVariant} className="text-sm px-2.5 py-1">
              {planningMetrics.riscoLiquidez}
            </StatusBadge>
          </div>
          <div className="text-xs text-slate-500">
            Aprox. {planningMetrics.diasDeFolga} dias de folga financeira
          </div>
        </div>
      </div>

      {/* Gráfico de Previsão */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Previsão de Cashflow</h3>
            <p className="text-xs text-slate-500 mt-0.5">Entradas, saídas e saldo previstos para os próximos 90 dias</p>
          </div>
          <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
            <option>Próximos 90 dias</option>
            <option>Próximos 60 dias</option>
            <option>Próximos 30 dias</option>
          </select>
        </div>
        <div className="h-[220px] sm:h-[280px] lg:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={planningCashflowDaily} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
              <Tooltip content={<CashTooltip />} />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} iconType="circle" />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar  dataKey="entradas" name="Entradas" fill="#10B981" radius={[3, 3, 0, 0]} barSize={14} />
              <Bar  dataKey="saidas"   name="Saídas"   fill="#EF4444" radius={[3, 3, 0, 0]} barSize={14} />
              <Line dataKey="saldo"    name="Saldo"     type="monotone" stroke="#0f172a" strokeWidth={2.4} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Os valores futuros são projeções e podem variar consoante o comportamento real do negócio.
        </p>
      </div>

      {/* Resumo por período + Recomendações */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <div className="card overflow-hidden">
            <div className="px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-800">Resumo por Período</h3>
              <p className="text-xs text-slate-500 mt-0.5">Real vs previsto, com saldo acumulado</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50/50">
                    <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Período</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Entradas</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saídas</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {planningPeriodSummary.map((p) => (
                    <tr key={p.periodo} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{p.periodo}</td>
                      <td className="px-5 py-3 text-sm text-brand-700 text-right tabular-nums">{formatEUR(p.entradas)}</td>
                      <td className="px-5 py-3 text-sm text-rose-600 text-right tabular-nums">{formatEUR(p.saidas)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums">{formatEUR(p.saldo)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right tabular-nums">{formatEUR(p.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Ações recomendadas</h3>
            <p className="text-xs text-slate-500 mb-4">Com base na previsão</p>
            <div className="space-y-3">
              {planningRecommendations.map((r) => {
                const cfg  = REC_STYLE[r.tone] ?? REC_STYLE.info;
                const Icon = cfg.icon;
                return (
                  <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200/70">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color} shrink-0`}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{r.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
