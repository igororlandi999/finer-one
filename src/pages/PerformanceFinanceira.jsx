import { useState, useMemo } from "react";
import { Download, Lightbulb, FileText } from "lucide-react";
import {
  ComposedChart, Bar, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

import PageHeader  from "../layouts/PageHeader";
import MetricCard  from "../components/ui/MetricCard";
import ChartCard   from "../components/charts/ChartCard";

import {
  performanceMetrics, profitLossRows, balanceSheetRows, cashflowStatementRows,
} from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";
import DemoTag from "../components/ui/DemoTag";
import {
  buildMonthlyPerformance,
  buildPerformanceMetrics,
  buildExpenseCategoryPerformance,
  buildPerformanceInsights,
  buildAvailableWindows,
  monthLongLabel,
} from "../utils/performanceCalculations";

// Demonstracoes contabilisticas: sem base real (sem plano de contas nem balanco).
const TABS = [
  { id: "pl",      label: "P&L"      },
  { id: "balance", label: "Balanço"  },
  { id: "cf",      label: "Cashflow" },
];

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

function EvolutionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg space-y-0.5">
      <div className="text-slate-300 mb-1">{label}</div>
      <div>Receitas: <span className="font-semibold">{formatEUR(p.receitas)}</span></div>
      {p.despesas != null && <div>Despesas: <span className="font-semibold">{formatEUR(p.despesas)}</span></div>}
      {p.resultado != null && <div>Resultado: <span className="font-semibold">{formatEUR(p.resultado)}</span></div>}
      {p.margem != null && <div className="text-slate-300">Margem: {String(p.margem).replace(".", ",")}%</div>}
    </div>
  );
}

export default function PerformanceFinanceira() {
  const [tab, setTab] = useState("pl");
  const [meses, setMeses] = useState(12);
  const { sales, source } = useFinerData();

  // Fontes reais: pedidos (receitas) e sales.despesas.list (contas a pagar, mesma
  // regra temporal da pagina Despesas: dataEmissao com fallback a vencimento).
  // Distinguimos FONTE disponível de EXISTÊNCIA de movimentos: uma lista real vazia
  // é um estado vazio real, nunca um motivo para cair no mock.
  const orders = sales?.orders ?? null;
  const despesasList = sales?.despesas?.list ?? null;
  const temFonteReceitas = Array.isArray(orders);
  const temMovimentosReceitas = temFonteReceitas && orders.length > 0;
  const temFonteDespesas = Array.isArray(despesasList);

  const serieCompleta = useMemo(
    () => (temMovimentosReceitas ? buildMonthlyPerformance({ orders, despesasList }) : []),
    [orders, despesasList, temMovimentosReceitas]
  );
  const metrics = useMemo(
    () => (temMovimentosReceitas ? buildPerformanceMetrics({ orders, despesasList }) : null),
    [orders, despesasList, temMovimentosReceitas]
  );
  const categorias = useMemo(
    () => buildExpenseCategoryPerformance(despesasList, metrics?.mesRef),
    [despesasList, metrics?.mesRef]
  );
  const insights = useMemo(
    () => buildPerformanceInsights(metrics, categorias.categorias),
    [metrics, categorias]
  );

  // real  = há fonte E movimentos E mês de referência apurável.
  // vazio = há fonte real mas sem movimentos apresentáveis => estado vazio real.
  const real = temMovimentosReceitas && !!metrics;
  const vazioReal = temFonteReceitas && !real;

  const mesesDisponiveis = serieCompleta.length;
  const opcoesMeses = buildAvailableWindows(mesesDisponiveis);
  // A janela selecionada tem de existir sempre nas opções (histórico pode mudar).
  const janela = opcoesMeses.includes(meses)
    ? meses
    : (opcoesMeses.length ? opcoesMeses[opcoesMeses.length - 1] : meses);
  const serie = serieCompleta.slice(-janela);

  const subtituloSerie = serie.length
    ? (serie.length === 1
        ? `Dados disponíveis de ${monthLongLabel(serie[0].monthKey)}`
        : `Dados disponíveis de ${monthLongLabel(serie[0].monthKey)} a ${monthLongLabel(serie[serie.length - 1].monthKey)}`)
    : "Sem dados disponíveis";

  const semAnterior = "Sem período anterior comparável";

  return (
    <>
      <PageHeader
        title="Performance Financeira"
        subtitle="Receitas, despesas, resultado e margem a partir dos dados reais da Overcel."
        actions={
          <>
            {real ? (
              <select
                value={janela}
                onChange={(e) => setMeses(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
              >
                {opcoesMeses.map((n) => (
                  <option key={n} value={n}>{n === 1 ? "1 mês" : `Últimos ${n} meses`}</option>
                ))}
              </select>
            ) : (
              <select disabled className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-400 bg-slate-50 cursor-not-allowed">
                <option>Sem dados reais</option>
              </select>
            )}
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><FileText size={14} />Extrair PDF</button>
          </>
        }
      />

      {real ? (
        <>
          <p className="text-xs text-slate-500 mb-2">Mês de referência: {metrics.mesRefLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <MetricCard
              dense label="Receitas" value={formatEUR(metrics.receitas)}
              delta={metrics.receitasDelta} deltaLabel="vs mês anterior"
              helper={metrics.receitasDelta == null ? semAnterior : undefined}
              tone="success"
            />
            {temFonteDespesas ? (
              <MetricCard
                dense label="Despesas" value={formatEUR(metrics.despesas)}
                delta={metrics.despesasDelta} deltaLabel="vs mês anterior"
                helper={metrics.despesasDelta == null ? semAnterior : undefined}
              />
            ) : (
              <div className="card p-4">
                <span className="label-uppercase">Despesas</span>
                <p className="mt-2 text-sm font-semibold text-slate-700">Indisponível</p>
                <p className="text-xs text-slate-500 mt-1">Faltam dados de contas a pagar.</p>
              </div>
            )}
            {temFonteDespesas ? (
              <MetricCard
                dense label="Resultado" value={formatEUR(metrics.resultado)}
                delta={metrics.resultadoDelta} deltaLabel="vs mês anterior"
                helper={metrics.resultadoDelta == null ? semAnterior : undefined}
                tone={metrics.resultado >= 0 ? "success" : "danger"}
              />
            ) : (
              <div className="card p-4">
                <span className="label-uppercase">Resultado</span>
                <p className="mt-2 text-sm font-semibold text-slate-700">Indisponível</p>
                <p className="text-xs text-slate-500 mt-1">Faltam dados de contas a pagar.</p>
              </div>
            )}
            {metrics.margemCalculavel ? (
              <MetricCard
                dense label="Margem" value={`${String(metrics.margem).replace(".", ",")}%`}
                delta={metrics.margemDelta} deltaSuffix=" p.p." deltaLabel="vs mês anterior"
                helper={metrics.margemDelta == null ? semAnterior : undefined}
                tone={metrics.margem >= 0 ? "success" : "danger"}
              />
            ) : (
              <div className="card p-4">
                <span className="label-uppercase">Margem</span>
                <p className="mt-2 text-sm font-semibold text-slate-700">Não calculável</p>
                <p className="text-xs text-slate-500 mt-1">
                  {temFonteDespesas ? "Sem receitas no mês de referência." : "Faltam dados de contas a pagar."}
                </p>
              </div>
            )}
          </div>
        </>
      ) : vazioReal ? (
        // Fonte real disponível mas sem movimentos apresentáveis: estado vazio real.
        // Nunca cair para EBITDA/ativo/solvabilidade demonstrativos neste caso.
        <div className="card p-8 mb-6 text-center">
          <p className="text-sm font-medium text-slate-700">
            Não existem movimentos de receitas disponíveis para apresentar a performance financeira.
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Assim que existirem pedidos faturáveis, os indicadores são calculados automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          <MetricCard dense demo={source === "api"} label="Lucro Líquido"  value={formatEUR(performanceMetrics.lucroLiquido)}  delta={performanceMetrics.lucroLiquidoDelta} deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={source === "api"} label="Margem Líquida" value={`${performanceMetrics.margemLiquida}%`}      delta={performanceMetrics.margemLiquidaDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={source === "api"} label="EBITDA"          value={formatEUR(performanceMetrics.ebitda)}        delta={performanceMetrics.ebitdaDelta} deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={source === "api"} label="Ativo Total"     value={formatEUR(performanceMetrics.ativoTotal)}    delta={performanceMetrics.ativoTotalDelta} deltaLabel="vs ano anterior" />
          <MetricCard dense demo={source === "api"} label="Solvabilidade"   value={`${performanceMetrics.solvabilidade}%`}      delta={performanceMetrics.solvabilidadeDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          <ChartCard
            title={<span className="inline-flex items-center gap-1.5">Evolução financeira{!real && !vazioReal && source === "api" && <DemoTag />}</span>}
            subtitle={real ? subtituloSerie : vazioReal ? "Sem movimentos de receitas" : "Sem dados reais disponíveis"}
            height={300}
          >
            {real && serie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
                  <Tooltip content={<EvolutionTooltip />} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <Bar dataKey="receitas" name="Receitas" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  {temFonteDespesas && <Bar dataKey="despesas" name="Despesas" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={26} />}
                  {temFonteDespesas && <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#12344D" strokeWidth={2.4} dot={{ r: 3 }} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-sm text-slate-500 px-4">
                Não existem dados suficientes para apresentar a evolução financeira.
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              Despesas por categoria{!real && !vazioReal && source === "api" && <DemoTag />}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              {real ? `Mês de referência: ${metrics.mesRefLabel}` : vazioReal ? "Sem movimentos no período" : "Sem dados reais disponíveis"}
            </p>
            {real && categorias.categorias.length > 0 ? (
              <>
                <div className="space-y-2.5">
                  {categorias.categorias.slice(0, 6).map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 truncate">{c.name}</span>
                        <span className="font-semibold text-slate-900 tabular-nums shrink-0 ml-3">{formatEUR(c.value)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums w-11 text-right">
                          {String(c.pct).replace(".", ",")}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {categorias.semCategoria && (
                  <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                    Sem categoria: {formatEUR(categorias.semCategoria.value)} ({String(categorias.semCategoria.pct).replace(".", ",")}% das despesas do mês)
                  </p>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                {real
                  ? (temFonteDespesas
                      ? "Não existem despesas registadas no mês de referência."
                      : "Dados de contas a pagar indisponíveis.")
                  : vazioReal
                    ? "Não existem movimentos para apresentar."
                    : "Sem dados reais disponíveis."}
              </p>
            )}
          </div>
        </div>
      </div>

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
                    active ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
            {source === "api" && <span className="ml-auto flex items-center py-3"><DemoTag /></span>}
          </div>
        </div>
        {source === "api" && (
          <p className="px-5 py-2.5 text-xs text-slate-500 bg-slate-50/60 border-b border-slate-200">
            Demonstrações contabilísticas ainda não integradas: exigem plano de contas, balanço e
            depreciações, que não estão disponíveis nas fontes atuais.
          </p>
        )}
        {tab === "pl"      && <FinancialTable rows={profitLossRows} />}
        {tab === "balance" && <FinancialTable rows={balanceSheetRows} />}
        {tab === "cf"      && <FinancialTable rows={cashflowStatementRows} />}
      </div>

      <div className="card p-5 bg-gradient-to-br from-brand-50/60 to-white border-brand-100">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white shrink-0">
            <Lightbulb size={20} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              Análise rápida{!real && !vazioReal && source === "api" && <DemoTag />}
            </h3>
            {real && insights.length > 0 ? (
              <ul className="text-sm text-slate-700 leading-relaxed space-y-1 list-disc pl-4">
                {insights.map((frase, i) => <li key={i}>{frase}</li>)}
              </ul>
            ) : real || vazioReal ? (
              <p className="text-sm text-slate-600">
                {vazioReal
                  ? "Não existem movimentos suficientes para gerar uma análise."
                  : "Ainda não existem variações suficientes para gerar uma análise."}
              </p>
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed">
                O lucro líquido cresceu 13,7% face ao período homólogo, com melhoria da margem líquida (+1,8 p.p.).
                A posição financeira mantém-se saudável, com rácio de solvabilidade de 53,3% e aumento de caixa de 50.500 €.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}