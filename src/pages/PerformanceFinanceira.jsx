import { useState } from "react";
import { Download, Lightbulb } from "lucide-react";

import PageHeader  from "../layouts/PageHeader";
import MetricCard  from "../components/ui/MetricCard";

import {
  performanceMetrics, profitLossRows, balanceSheetRows, cashflowStatementRows,
} from "../data/mockData";
import { formatEUR } from "../lib/format";

// ── Tabs ────────────────────────────────────────────────────
const TABS = [
  { id: "geral",   label: "Visão Geral" },
  { id: "pl",      label: "P&L"         },
  { id: "balance", label: "Balanço"     },
  { id: "cf",      label: "Cashflow"    },
];

// ── Tabela financeira reutilizável ─────────────────────────
function FinancialTable({ rows, header1 = "Período Atual", header2 = "Período Anterior" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/50">
            <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Rubrica</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{header1}</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">{header2}</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Variação</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Var. %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const positive = r.varAbs > 0;
            const negative = r.varAbs < 0;
            return (
              <tr
                key={i}
                className={`border-b border-slate-100 ${
                  r.header   ? "bg-slate-50/70 font-semibold" :
                  r.bold     ? "font-semibold" :
                  r.highlight? "bg-brand-50/30 font-semibold" : ""
                }`}
              >
                <td className={`px-5 py-2.5 text-sm ${
                  r.header   ? "text-slate-900 uppercase tracking-wider text-xs" :
                  r.highlight? "text-brand-700" :
                  r.indent && r.sub ? "text-slate-500 pl-12" :
                  r.indent   ? "text-slate-700 pl-9" :
                  "text-slate-800"
                }`}>
                  {r.rubrica}
                </td>
                <td className="px-5 py-2.5 text-sm text-right tabular-nums">{formatEUR(r.atual)}</td>
                <td className="px-5 py-2.5 text-sm text-right tabular-nums text-slate-600">{formatEUR(r.anterior)}</td>
                <td className={`px-5 py-2.5 text-sm text-right tabular-nums ${
                  positive ? "text-brand-700" : negative ? "text-rose-600" : "text-slate-500"
                }`}>
                  {r.varAbs === 0 ? "—" : formatEUR(r.varAbs)}
                </td>
                <td className={`px-5 py-2.5 text-sm text-right tabular-nums ${
                  r.varPct == null ? "text-slate-300" :
                  positive ? "text-brand-700" : negative ? "text-rose-600" : "text-slate-500"
                }`}>
                  {r.varPct == null ? "—" : `${r.varPct > 0 ? "+" : ""}${r.varPct}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function PerformanceFinanceira() {
  const [tab, setTab] = useState("geral");

  return (
    <>
      <PageHeader
        title="Performance Financeira"
        subtitle="P&L, balanço e cashflow num formato que o empresário entende — sem precisar de ser contabilista."
        actions={
          <>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Ano 2026 vs 2025</option>
              <option>2026 YTD</option>
            </select>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <MetricCard label="Lucro Líquido"  value={formatEUR(performanceMetrics.lucroLiquido)}  delta={performanceMetrics.lucroLiquidoDelta} deltaLabel="vs ano anterior" tone="success" />
        <MetricCard label="Margem Líquida" value={`${performanceMetrics.margemLiquida}%`}      delta={performanceMetrics.margemLiquidaDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
        <MetricCard label="EBITDA"          value={formatEUR(performanceMetrics.ebitda)}        delta={performanceMetrics.ebitdaDelta} deltaLabel="vs ano anterior" tone="success" />
        <MetricCard label="Ativo Total"     value={formatEUR(performanceMetrics.ativoTotal)}    delta={performanceMetrics.ativoTotalDelta} deltaLabel="vs ano anterior" />
        <MetricCard label="Solvabilidade"   value={`${performanceMetrics.solvabilidade}%`}      delta={performanceMetrics.solvabilidadeDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden mb-6">
        <div className="border-b border-slate-200 px-5">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "geral" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 xl:divide-x divide-slate-200 divide-y xl:divide-y-0">
            <div>
              <div className="px-5 py-3"><h3 className="text-sm font-semibold text-slate-800">P&L (Resumo)</h3></div>
              <FinancialTable rows={profitLossRows.filter((r) => r.bold || r.highlight)} />
            </div>
            <div>
              <div className="px-5 py-3"><h3 className="text-sm font-semibold text-slate-800">Balanço (Resumo)</h3></div>
              <FinancialTable rows={balanceSheetRows.filter((r) => r.header)} header2="Período Anterior" />
            </div>
            <div>
              <div className="px-5 py-3"><h3 className="text-sm font-semibold text-slate-800">Cashflow (Resumo)</h3></div>
              <FinancialTable rows={cashflowStatementRows.filter((r) => r.header || r.bold)} />
            </div>
          </div>
        )}

        {tab === "pl"      && <FinancialTable rows={profitLossRows} />}
        {tab === "balance" && <FinancialTable rows={balanceSheetRows} />}
        {tab === "cf"      && <FinancialTable rows={cashflowStatementRows} />}
      </div>

      {/* Análise rápida */}
      <div className="card p-5 bg-gradient-to-br from-brand-50/60 to-white border-brand-100">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white shrink-0">
            <Lightbulb size={20} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Análise rápida</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              O lucro líquido cresceu 13,7% face ao período homólogo, com melhoria da margem líquida (+1,8 p.p.).
              A posição financeira mantém-se saudável, com rácio de solvabilidade de 53,3% e aumento de caixa de 50.500 €.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
