import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, BarChart3,
  Plus, Upload, Stethoscope, ArrowRight, Building2, FileText, Send,
} from "lucide-react";

import PageHeader   from "../layouts/PageHeader";
import MetricCard   from "../components/ui/MetricCard";
import AlertCard    from "../components/ui/AlertCard";
import ChartCard    from "../components/charts/ChartCard";
import StatusBadge  from "../components/ui/StatusBadge";

import { usePlan }     from "../context/PlanContext";
import { SCREENS }     from "../config/planConfig";
import {
  currentUser, diagnostic,
  cashflowForecast, overdueInvoices,
  recentDocuments, bankSync, chatSuggestions,
  monthMetrics as mockMonthMetrics,
  alerts       as mockAlerts,
} from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";

// ── Tooltip do gráfico de cashflow ──────────────────────────
function CashflowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">Saldo {formatEUR(payload[0].value)}</div>
    </div>
  );
}

// ── Bloco de destaque do Diagnóstico ────────────────────────
function DiagnosticHighlight({ onOpen }) {
  const variant =
    diagnostic.estado === "Saudável" ? "saudavel" :
    diagnostic.estado === "Atenção"  ? "atencao"  : "critico";

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-finerblue-deep to-finerblue text-white">
      <div className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
        {/* Ícone */}
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 border border-white/15 shrink-0">
          <Stethoscope size={26} className="text-brand-300" />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-brand-300">
              Diagnóstico Financeiro
            </span>
            <StatusBadge variant={variant}>{diagnostic.estado}</StatusBadge>
          </div>
          <h3 className="text-lg font-semibold leading-snug">
            A empresa está estável, mas existem sinais de atenção em margem e tesouraria.
          </h3>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
            Impacto financeiro identificado de{" "}
            <strong className="text-white">{formatEUR(diagnostic.impactoFinanceiro)}</strong>.{" "}
            Prioridade: {diagnostic.prioridadeMaxima.toLowerCase()}.
          </p>
        </div>

        {/* Score + CTA */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <div className="text-3xl font-bold leading-none">
              {diagnostic.score}
              <span className="text-base text-slate-400 font-medium">/100</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Finer Score</div>
          </div>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium transition-colors"
          >
            Ver diagnóstico
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────
export default function Resumo() {
  const { navigateTo } = usePlan();

  // Apenas receita/faturação e alertas comerciais vêm de vendas; o resto fica mock.
  const { sales, source } = useFinerData();
  const monthMetrics = { ...mockMonthMetrics, ...(sales?.resumo?.metrics ?? {}) };
  const alerts = sales?.alertas?.list ?? mockAlerts;

  return (
    <>
      <PageHeader
        title={`Bom dia, ${currentUser.name.split(" ")[0]}.`}
        subtitle="Eis a saúde financeira da Overcel hoje."
        actions={
          <>
            <button className="btn-secondary"><Plus size={15} />Novo registo</button>
            <button className="btn-secondary"><Upload size={15} />Enviar documento</button>
          </>
        }
      />

      {/* Diagnóstico em destaque */}
      <div className="mb-6">
        <DiagnosticHighlight onOpen={() => navigateTo(SCREENS.DIAGNOSTICO)} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Saldo Disponível"
          value={formatEUR(monthMetrics.saldoDisponivel)}
          icon={Wallet}
          iconBg="bg-brand-50 text-brand-600"
          helper={`Atualizado ${monthMetrics.lastSync}`}
          demo={source === "api"}
        />
        <MetricCard
          label="Receitas (Mês)"
          value={formatEUR(monthMetrics.receitas)}
          delta={monthMetrics.receitasDelta}
          icon={TrendingUp}
          iconBg="bg-brand-50 text-brand-600"
        />
        <MetricCard
          label="Despesas (Mês)"
          value={formatEUR(monthMetrics.despesas)}
          delta={monthMetrics.despesasDelta}
          icon={TrendingDown}
          iconBg="bg-rose-50 text-rose-500"
          demo={source === "api"}
        />
        <MetricCard
          label="Resultado (Mês)"
          value={formatEUR(monthMetrics.resultado)}
          delta={monthMetrics.resultadoDelta}
          icon={BarChart3}
          iconBg="bg-sky-50 text-sky-600"
          tone="success"
          demo={source === "api"}
        />
      </div>

      {/* Cashflow + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Cashflow */}
        <div className="lg:col-span-7">
          <ChartCard
            title="Cashflow previsto"
            subtitle={`Saldo previsto em 30 dias: ${formatEUR(monthMetrics.cashflowPrevisto30)}`}
            height={260}
            action={
              <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
                <option>Próximos 30 dias</option>
                <option>Próximos 60 dias</option>
              </select>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowForecast} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
                <Tooltip content={<CashflowTooltip />} />
                <Area type="monotone" dataKey="saldo" stroke="#10B981" strokeWidth={2.4} fill="url(#cashGrad)" dot={{ r: 0 }} activeDot={{ r: 5, fill: "#10B981" }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Alertas */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Alertas importantes</h3>
              <button className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todos</button>
            </div>
            <div className="flex-1 divide-y divide-slate-100 -mx-1">
              {alerts.slice(0, 4).map((a) => (
                <AlertCard key={a.id} severity={a.severity} title={a.title} description={a.description} timestamp={a.timestamp} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Faturas + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Faturas em atraso */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Faturas em atraso</h3>
              <button className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todas</button>
            </div>
            <div className="space-y-3">
              {overdueInvoices.map((inv) => (
                <div key={inv.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{inv.cliente}</p>
                    <p className="text-xs text-slate-500">{inv.numero} · Vencida há {inv.diasAtraso} dias</p>
                  </div>
                  <div className="text-sm font-semibold text-rose-600 shrink-0">{formatEUR(inv.valor)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total em atraso</span>
              <span className="text-sm font-semibold text-rose-600">
                {formatEUR(overdueInvoices.reduce((acc, i) => acc + i.valor, 0))}
              </span>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="lg:col-span-7">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Pergunte à Finer</h3>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">IA</span>
              </div>
              <button onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Abrir chat
              </button>
            </div>
            <div className="space-y-2 flex-1">
              {chatSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)}
                  className="w-full text-left text-sm text-slate-700 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200">
              <input
                type="text"
                placeholder="Faça uma pergunta sobre a sua empresa..."
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400"
              />
              <button className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 text-white transition-colors">
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Documentos + Banco */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Documentos */}
        <div className="lg:col-span-7">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Documentos recentes</h3>
              <button className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todos</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentDocuments.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200/60 hover:bg-slate-100 transition-colors cursor-pointer">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white border border-slate-200 shrink-0">
                    <FileText size={16} className="text-rose-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.nome}</p>
                    <p className="text-xs text-slate-500">{d.quando}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sincronização bancária */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Sincronização bancária</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                <Building2 size={20} className="text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{bankSync.bank}</p>
                <p className="text-xs text-slate-500">Conta •••• {bankSync.accountTail}</p>
              </div>
              <StatusBadge variant="success">{bankSync.status}</StatusBadge>
            </div>
            <p className="text-xs text-slate-500 mb-4">Última sincronização {bankSync.lastSync}</p>
            <button
              onClick={() => navigateTo(SCREENS.RECEITAS)}
              className="w-full btn-secondary justify-center"
            >
              Ver detalhes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}