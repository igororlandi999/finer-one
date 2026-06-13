import { useState } from "react";
import { Download, Lightbulb, FileText } from "lucide-react";

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
function FinancialTable({ rows, header1 = "Período Atual", header2 = "Período Anterior", compact = false }) {
  const padX  = compact ? "px-3" : "px-5";
  const padY  = compact ? "py-2" : "py-2.5";
  const txt   = compact ? "text-xs" : "text-sm";
  const hdrTx = compact ? "text-[10px]" : "text-[11px]";
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/50">
            <th className={`${padX} py-2.5 text-left  ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Rubrica</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>{header1}</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>{header2}</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Variação</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Var. %</th>
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
                <td className={`${padX} ${padY} ${txt} ${
                  r.header   ? "text-slate-900 uppercase tracking-wider text-[11px]" :
                  r.highlight? "text-brand-700" :
                  r.indent && r.sub ? "text-slate-500 pl-12" :
                  r.indent   ? "text-slate-700 pl-9" :
                  "text-slate-800"
                }`}>
                  {r.rubrica}
                </td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums`}>{formatEUR(r.atual)}</td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums text-slate-600`}>{formatEUR(r.anterior)}</td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums ${
                  positive ? "text-brand-700" : negative ? "text-rose-600" : "text-slate-500"
                }`}>
                  {r.varAbs === 0 ? "—" : formatEUR(r.varAbs)}
                </td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums ${
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
        subtitle="P&L, balanço e cashflow num formato claro e profissional, útil para empresários, contabilistas e investidores."
        actions={
          <>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Ano 2026 vs 2025</option>
              <option>2026 YTD</option>
            </select>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
            <button className="btn-primary"><FileText size={14} />Extrair PDF</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <MetricCard dense label="Lucro Líquido"  value={formatEUR(performanceMetrics.lucroLiquido)}  delta={performanceMetrics.lucroLiquidoDelta} deltaLabel="vs ano anterior" tone="success" />
        <MetricCard dense label="Margem Líquida" value={`${performanceMetrics.margemLiquida}%`}      delta={performanceMetrics.margemLiquidaDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
        <MetricCard dense label="EBITDA"          value={formatEUR(performanceMetrics.ebitda)}        delta={performanceMetrics.ebitdaDelta} deltaLabel="vs ano anterior" tone="success" />
        <MetricCard dense label="Ativo Total"     value={formatEUR(performanceMetrics.ativoTotal)}    delta={performanceMetrics.ativoTotalDelta} deltaLabel="vs ano anterior" />
        <MetricCard dense label="Solvabilidade"   value={`${performanceMetrics.solvabilidade}%`}      delta={performanceMetrics.solvabilidadeDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
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
              <div className="px-3 py-3"><h3 className="text-sm font-semibold text-slate-800">P&L (Resumo)</h3></div>
              <FinancialTable compact rows={profitLossRows.filter((r) => r.bold || r.highlight)} />
            </div>
            <div>
              <div className="px-3 py-3"><h3 className="text-sm font-semibold text-slate-800">Balanço (Resumo)</h3></div>
              <FinancialTable compact rows={balanceSheetRows.filter((r) => r.header)} header2="Período Anterior" />
            </div>
            <div>
              <div className="px-3 py-3"><h3 className="text-sm font-semibold text-slate-800">Cashflow (Resumo)</h3></div>
              <FinancialTable compact rows={cashflowStatementRows.filter((r) => r.header || r.bold)} />
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
