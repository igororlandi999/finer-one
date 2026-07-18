import {
  Building2, TrendingUp, Clock, Scale, ArrowUpRight, ArrowDownRight,
  Lightbulb, CheckCircle2, Info, Download,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";

import { benchmarkMetrics, benchmarkComparison, benchmarkInsights, benchmarkPosition } from "../data/mockData";

// ── Card de KPI vs setor (topo) ─────────────────────────────
function KPICompareCard({ label, icon: Icon, empresa, setor, melhor, posicao, unit = "", inverse = false }) {
  // Para "inverse" (menor = melhor): empresa abaixo do setor é positivo
  const isBetter = inverse ? empresa < setor : empresa > setor;
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span className="label-uppercase">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isBetter ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600"}`}>
          <Icon size={18} />
        </span>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <div className="text-[22px] font-semibold leading-tight text-slate-900">
            {empresa}{unit}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-0.5">A sua empresa</div>
        </div>
        <div className="pb-1">
          <div className="text-base font-semibold text-slate-500">{setor}{unit}</div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mt-0.5">Média setor</div>
        </div>
      </div>
      <div className={`text-xs font-medium inline-flex items-center gap-1 ${isBetter ? "text-brand-700" : "text-amber-700"}`}>
        {isBetter ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        {posicao}
      </div>
    </div>
  );
}

// ── Barra de comparação (3 valores) ────────────────────────
function CompareBar({ row }) {
  // Para escalar: pega no máximo dos três valores
  const maxVal = Math.max(row.empresa, row.setor, row.melhor);
  const pct = (val) => maxVal > 0 ? (val / maxVal) * 100 : 0;

  return (
    <tr className="border-b border-slate-100">
      <td className="px-5 py-3 align-top">
        <div className="text-sm font-medium text-slate-800">{row.kpi}</div>
        <div className="text-xs text-slate-500">{row.desc}</div>
      </td>
      <td className="px-5 py-3 min-w-[160px]">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct(row.empresa)}%` }} />
        </div>
        <div className="text-xs font-semibold text-slate-800 mt-1 tabular-nums">{row.empresa}{row.unit}</div>
      </td>
      <td className="px-5 py-3 min-w-[140px]">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-slate-400 rounded-full transition-all" style={{ width: `${pct(row.setor)}%` }} />
        </div>
        <div className="text-xs text-slate-600 mt-1 tabular-nums">{row.setor}{row.unit}</div>
      </td>
      <td className="px-5 py-3 min-w-[140px]">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct(row.melhor)}%` }} />
        </div>
        <div className="text-xs text-emerald-700 mt-1 tabular-nums">{row.melhor}{row.unit}</div>
      </td>
    </tr>
  );
}

const INSIGHT_STYLE = {
  success: { icon: CheckCircle2, color: "text-brand-600", bg: "bg-brand-50" },
  info:    { icon: Info,         color: "text-sky-600",   bg: "bg-sky-50"   },
};

// ── Tela ────────────────────────────────────────────────────
export default function BenchmarkingSetor() {
  return (
    <>
      <PageHeader
        title="Benchmarking do Setor"
        subtitle={`Como é que a Overcel se compara com outras empresas do setor de ${benchmarkMetrics.setor}? Veja em segundos.`}
        actions={
          <>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>{benchmarkMetrics.setor}</option>
              <option>Indústria Transformadora</option>
              <option>Serviços B2B</option>
            </select>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Últimos 12 meses</option>
              <option>YTD 2026</option>
            </select>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
          </>
        }
      />

      {/* KPIs vs setor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPICompareCard
          label="Margem EBITDA"
          icon={TrendingUp}
          empresa={benchmarkMetrics.margemEbitda.empresa}
          setor={benchmarkMetrics.margemEbitda.setor}
          melhor={benchmarkMetrics.margemEbitda.melhor}
          posicao={benchmarkMetrics.margemEbitda.posicao}
          unit="%"
        />
        <KPICompareCard
          label="Liquidez Corrente"
          icon={Scale}
          empresa={benchmarkMetrics.liquidezCorr.empresa}
          setor={benchmarkMetrics.liquidezCorr.setor}
          melhor={benchmarkMetrics.liquidezCorr.melhor}
          posicao={benchmarkMetrics.liquidezCorr.posicao}
        />
        <KPICompareCard
          label="Prazo Médio Recebimento"
          icon={Clock}
          empresa={benchmarkMetrics.prazoRec.empresa}
          setor={benchmarkMetrics.prazoRec.setor}
          melhor={benchmarkMetrics.prazoRec.melhor}
          posicao={benchmarkMetrics.prazoRec.posicao}
          unit=" dias"
          inverse
        />
        <KPICompareCard
          label="Endividamento"
          icon={Building2}
          empresa={benchmarkMetrics.endividamento.empresa}
          setor={benchmarkMetrics.endividamento.setor}
          melhor={benchmarkMetrics.endividamento.melhor}
          posicao={benchmarkMetrics.endividamento.posicao}
          unit="%"
          inverse
        />
      </div>

      {/* Comparação detalhada + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Tabela de comparação */}
        <div className="lg:col-span-8">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Comparação de indicadores</h3>
                <p className="text-xs text-slate-500 mt-0.5">A Overcel vs média do setor vs melhores 25%</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-500" />A sua empresa</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />Média do setor</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Melhores 25%</span>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50/50">
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Indicador</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">A sua empresa</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Média setor</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Melhores 25%</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkComparison.map((row) => <CompareBar key={row.kpi} row={row} />)}
              </tbody>
            </table>
          </div>
        </div>

        {/* Insights */}
        <div className="lg:col-span-4">
          <div className="card p-5 h-full">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Insights do desempenho</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border bg-brand-50 text-brand-700 border-brand-200 uppercase tracking-wider">
                Muito bom
              </span>
            </div>
            <div className="space-y-3">
              {benchmarkInsights.map((ins, i) => {
                const cfg = INSIGHT_STYLE[ins.tone] ?? INSIGHT_STYLE.info;
                const Icon = cfg.icon;
                return (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-md ${cfg.bg} ${cfg.color} shrink-0`}>
                      <Icon size={14} />
                    </span>
                    <p className="leading-relaxed">{ins.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Posição no setor */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Posição da Overcel no setor</h3>
            <p className="text-xs text-slate-500 mt-0.5">Com base no desempenho global dos principais indicadores</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-slate-900 tabular-nums">{benchmarkPosition}%</div>
            <div className="text-xs text-slate-500">acima das empresas do setor</div>
          </div>
        </div>
        {/* Barra colorida */}
        <div className="relative">
          <div
            className="h-3 rounded-full"
            style={{ background: "linear-gradient(to right, #ef4444 0%, #f59e0b 25%, #facc15 50%, #84cc16 75%, #10b981 100%)" }}
          />
          {/* Marcador */}
          <div className="absolute top-0 -mt-1.5" style={{ left: `${benchmarkPosition}%`, transform: "translateX(-50%)" }}>
            <div className="h-6 w-1 bg-slate-900 rounded-full mx-auto" />
            <div className="text-xs font-semibold text-slate-900 mt-1 px-2 py-0.5 bg-white rounded border border-slate-200 whitespace-nowrap">
              {benchmarkPosition}%
            </div>
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 mt-7">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>

        <div className="mt-5 p-4 rounded-lg bg-brand-50/60 border border-brand-100 flex items-start gap-3">
          <Lightbulb size={16} className="text-brand-600 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-700 leading-relaxed">
            A Overcel tem um desempenho melhor que <span className="font-semibold text-brand-700">{benchmarkPosition}%</span> das empresas do setor.
            Mantenha o foco em rentabilidade e prazos de recebimento para continuar a subir no ranking.
          </p>
        </div>
      </div>
    </>
  );
}
