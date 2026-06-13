import { ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle, Lightbulb, Download, FileText } from "lucide-react";

import PageHeader from "../layouts/PageHeader";

import {
  indicatorsTop, operationalKPIs, investmentKPIs,
  indicatorsHighlights, indicatorsWarnings,
} from "../data/mockData";

// ── Mini sparkline gerada por SVG ───────────────────────────
function SparkLine({ color = "#10B981", trend = "up" }) {
  // Pontos sintéticos suaves
  const pts = trend === "down"
    ? "0,5 10,8 20,12 30,15 40,14 50,16 60,18 70,20 80,22"
    : "0,22 10,20 20,18 30,15 40,16 50,12 60,10 70,8 80,5";
  return (
    <svg width="80" height="28" viewBox="0 0 80 28">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

// ── Card de KPI top ─────────────────────────────────────────
function TopIndicator({ item }) {
  const isUp = item.deltaTone === "up";
  return (
    <div className="card p-5 flex flex-col gap-3">
      <span className="label-uppercase">{item.label}</span>
      <div className="text-2xl font-semibold text-slate-900 tabular-nums">{item.value}</div>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-brand-600" : "text-rose-600"}`}>
          {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {item.delta}
        </span>
        <SparkLine color={item.sparkColor} trend={item.deltaTone} />
      </div>
    </div>
  );
}

// ── Linha de tabela de KPI ──────────────────────────────────
function KPIRow({ k }) {
  const isUp = k.trend === "up";
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/60">
      <td className="px-5 py-3">
        <div className="text-sm font-medium text-slate-800">{k.kpi}</div>
        <div className="text-xs text-slate-500">{k.desc}</div>
      </td>
      <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right tabular-nums">{k.valor}</td>
      <td className="px-5 py-3 text-right">
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-brand-600" : "text-rose-600"}`}>
          {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {k.delta}
        </span>
      </td>
      <td className="px-5 py-3 text-right">
        <SparkLine color={isUp ? "#10B981" : "#EF4444"} trend={k.trend} />
      </td>
    </tr>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function Indicadores() {
  return (
    <>
      <PageHeader
        title="Indicadores"
        subtitle="Margem, liquidez, retorno e produtividade — os indicadores que realmente contam para decidir."
        actions={
          <>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Período atual</option>
              <option>Mesmo período ano anterior</option>
            </select>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
            <button className="btn-primary"><FileText size={14} />Extrair PDF</button>
          </>
        }
      />

      {/* Top 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {indicatorsTop.map((i) => <TopIndicator key={i.key} item={i} />)}
      </div>

      {/* KPIs Operacionais + Investimento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">KPIs Operacionais</h3>
              <p className="text-xs text-slate-500 mt-0.5">Indicadores de gestão diária</p>
            </div>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Este ano</option>
              <option>Trimestre</option>
              <option>Mês</option>
            </select>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">KPI</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">vs Ant.</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tendência (6M)</th>
              </tr>
            </thead>
            <tbody>{operationalKPIs.map((k) => <KPIRow key={k.kpi} k={k} />)}</tbody>
          </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">KPIs de Investimento</h3>
              <p className="text-xs text-slate-500 mt-0.5">ROI, ROE, VPL, TIR e Payback</p>
            </div>
            <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
              <option>Este ano</option>
              <option>Trimestre</option>
              <option>Mês</option>
            </select>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">KPI</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">vs Ant.</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tendência (6M)</th>
              </tr>
            </thead>
            <tbody>{investmentKPIs.map((k) => <KPIRow key={k.kpi} k={k} />)}</tbody>
          </table>
          </div>
        </div>
      </div>

      {/* Destaques + Atenção + Recomendação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <CheckCircle2 size={16} />
            </span>
            <h3 className="text-sm font-semibold text-slate-800">Destaques positivos</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-700">
            {indicatorsHighlights.map((h, i) => <li key={i} className="leading-relaxed">{h}</li>)}
          </ul>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle size={16} />
            </span>
            <h3 className="text-sm font-semibold text-slate-800">Pontos de atenção</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-700">
            {indicatorsWarnings.map((w, i) => <li key={i} className="leading-relaxed">{w}</li>)}
          </ul>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Lightbulb size={16} />
            </span>
            <h3 className="text-sm font-semibold text-slate-800">Recomendação</h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            Considere acelerar o ciclo de recebimentos e otimizar o stock para melhorar a liquidez e a rentabilidade. O cenário atual permite reinvestir em crescimento sustentável.
          </p>
        </div>
      </div>
    </>
  );
}
