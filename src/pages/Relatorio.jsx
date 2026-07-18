import {
  FileText, Scale, ArrowLeftRight, Activity, TrendingUp,
  CalendarRange, ClipboardList, Download, ChevronRight,
} from "lucide-react";

import PageHeader  from "../layouts/PageHeader";
import MetricCard  from "../components/ui/MetricCard";

import { reportMetrics, reportForecast, reportBudget, reportSections } from "../data/mockData";
import { formatEUR } from "../lib/format";

// Mapa string → componente ícone
const ICONS = { FileText, Scale, ArrowLeftRight, Activity, TrendingUp, CalendarRange, ClipboardList };

// ── Linha de tabela de previsão/orçamento ──────────────────
function ForecastRow({ row, isBudget = false }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60">
      <td className="px-5 py-3 text-sm font-medium text-slate-800">{row.mes}</td>
      <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-700">{formatEUR(row.receitas)}</td>
      <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-700">{formatEUR(row.ebitda)}</td>
      <td className="px-5 py-3 text-sm text-right tabular-nums font-semibold text-slate-900">{formatEUR(row.lucro)}</td>
      <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-700">{formatEUR(row.caixa)}</td>
      {!isBudget && (
        <td className="px-5 py-3 text-right">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
            row.confianca >= 95 ? "bg-brand-50 text-brand-700 border-brand-200" :
            row.confianca >= 85 ? "bg-sky-50 text-sky-700 border-sky-200" :
            "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            {row.confianca}%
          </span>
        </td>
      )}
    </tr>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function Relatorio() {
  return (
    <>
      <PageHeader
        title="Relatório"
        subtitle="Gere um relatório completo e profissional pronto a apresentar a bancos, investidores ou na assembleia."
        actions={
          <>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>01/01/2026 — 31/12/2026</option>
              <option>YTD</option>
            </select>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar PDF</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 mb-6">
        <MetricCard label="Receitas Totais"  value={formatEUR(reportMetrics.receitas)} delta={reportMetrics.receitasDelta} deltaLabel="vs 2025" tone="success" />
        <MetricCard label="Lucro Líquido"    value={formatEUR(reportMetrics.lucro)}    delta={reportMetrics.lucroDelta}    deltaLabel="vs 2025" tone="success" />
        <MetricCard label="EBITDA"            value={formatEUR(reportMetrics.ebitda)}   delta={reportMetrics.ebitdaDelta}   deltaLabel="vs 2025" tone="success" />
        <MetricCard label="Margem Líquida"   value={`${reportMetrics.margem}%`}        delta={reportMetrics.margemDelta}   deltaSuffix=" p.p." deltaLabel="vs 2025" tone="success" />
        <MetricCard label="Saldo Final"       value={formatEUR(reportMetrics.caixaFim)} delta={reportMetrics.caixaDelta}    deltaLabel="vs 2025" tone="success" />
        <MetricCard label="ROI"               value={`${reportMetrics.roi}%`}           delta={reportMetrics.roiDelta}      deltaSuffix=" p.p." deltaLabel="vs 2025" tone="success" />
      </div>

      {/* Forecast + Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-800">Forecast — Ano corrente (2026)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real vs previsto com nível de confiança</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Período</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Receitas</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">EBITDA</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lucro Líq.</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Confiança</th>
              </tr>
            </thead>
            <tbody>{reportForecast.map((r) => <ForecastRow key={r.mes} row={r} />)}</tbody>
          </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-800">Budget — Ano seguinte (2027)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Orçamento previsional para o próximo exercício</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Período</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Receitas</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">EBITDA</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lucro Líq.</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saldo</th>
              </tr>
            </thead>
            <tbody>{reportBudget.map((r) => <ForecastRow key={r.mes} row={r} isBudget />)}</tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Secções do relatório */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Secções do relatório</h3>
            <p className="text-xs text-slate-500 mt-0.5">Aceda a cada análise detalhada</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {reportSections.map((s) => {
            const Icon = ICONS[s.icon] ?? FileText;
            return (
              <button
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200/70 hover:border-brand-300 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
                  <Icon size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                  <p className="text-xs text-slate-500">{s.desc}</p>
                </div>
                <ChevronRight size={15} className="text-slate-400" />
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA exportação */}
      <div className="card p-6 flex flex-col md:flex-row items-start md:items-center gap-4 bg-gradient-to-br from-finerblue-deep to-finerblue text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 border border-white/15 shrink-0">
          <FileText size={22} className="text-brand-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">Exportação profissional</h3>
          <p className="text-sm text-slate-300 mt-1">
            Gere um relatório completo pronto a apresentar a bancos ou investidores: P&L, Balanço, Cashflow, KPIs, gráficos e forecast.
          </p>
        </div>
        <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
          <Download size={15} />
          Exportar Relatório Completo
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-3 text-center">
        Os relatórios são gerados com base nos dados atualizados até 31/05/2026 às 09:30. Valores podem variar após fecho contabilístico.
      </p>
    </>
  );
}
