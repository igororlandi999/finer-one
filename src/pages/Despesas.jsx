import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  TrendingDown, CalendarDays, AlertCircle, CreditCard, Plus, Download,
} from "lucide-react";

import PageHeader         from "../layouts/PageHeader";
import MetricCard         from "../components/ui/MetricCard";
import DemoTag           from "../components/ui/DemoTag";
import StatusBadge        from "../components/ui/StatusBadge";
import ChartCard          from "../components/charts/ChartCard";
import DonutCategoryCard  from "../components/charts/DonutCategoryCard";
import DataTable, { RowActionsButton } from "../components/ui/DataTable";

import {
  expenseMetrics as mockExpenseMetrics,
  expenseEvolution as mockExpenseEvolution,
  expenseByCategory as mockExpenseByCategory,
  expenseList as mockExpenseList,
} from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";

// ── Tooltip do gráfico de evolução ──────────────────────────
function EvTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">{formatEUR(payload[0].value)}</div>
    </div>
  );
}

// ── Mapas auxiliares ────────────────────────────────────────
const STATUS_VARIANT = {
  paga:     "paga",
  pendente: "pendente",
  atraso:   "atraso",
};
const STATUS_LABEL = {
  paga:     "Paga",
  pendente: "Pendente",
  atraso:   "Em atraso",
};

// ── Tela ────────────────────────────────────────────────────
export default function Despesas() {
  // Lado real (contas a pagar) com fallback ao mock; sem alterar layout.
  const { sales, source } = useFinerData();
  const despesasDemo = source === "api" && !sales?.despesas;
  const expenseMetrics    = { ...mockExpenseMetrics, ...(sales?.despesas?.metrics ?? {}) };
  const expenseEvolution  = sales?.despesas?.evolution ?? mockExpenseEvolution;
  const expenseByCategory = sales?.despesas?.byCategory ?? mockExpenseByCategory;
  const expenseList       = sales?.despesas?.list ?? mockExpenseList;

  const columns = [
    { key: "data", header: "Data" },
    { key: "descricao", header: "Descrição",
      render: (r) => <span className="font-medium text-slate-800">{r.descricao}</span> },
    { key: "fornecedor", header: "Fornecedor",
      render: (r) => <span className="text-slate-600">{r.fornecedor}</span> },
    { key: "categoria", header: "Categoria",
      render: (r) => <span className="text-slate-600">{r.categoria}</span> },
    { key: "valor", header: "Valor", align: "right",
      render: (r) => <span className="font-semibold text-rose-600">{formatEUR(r.valor)}</span> },
    { key: "vencimento", header: "Vencimento" },
    { key: "status", header: "Estado",
      render: (r) => (
        <StatusBadge variant={STATUS_VARIANT[r.status]}>
          {STATUS_LABEL[r.status]}
        </StatusBadge>
      ) },
    { key: "metodo", header: "Método",
      render: (r) => <span className="text-slate-600">{r.metodo}</span> },
    { key: "_actions", header: "", align: "right",
      render: () => <RowActionsButton /> },
  ];

  const tabs = [
    { id: "todas",     label: "Todas" },
    { id: "pagas",     label: "Pagas",     filter: (r) => r.status === "paga"     },
    { id: "pendentes", label: "Pendentes", filter: (r) => r.status === "pendente" },
    { id: "atraso",    label: "Em atraso", filter: (r) => r.status === "atraso"   },
  ];

  return (
    <>
      <PageHeader
        title="Despesas"
        subtitle="Perceba onde está a gastar mais e identifique categorias que pressionam a margem."
        actions={
          <>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
            <button className="btn-primary"><Plus size={14} />Nova despesa</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Despesas (Mês)"
          value={formatEUR(expenseMetrics.totalMes)}
          delta={expenseMetrics.totalDelta}
          icon={TrendingDown}
          iconBg="bg-rose-50 text-rose-500"
        demo={despesasDemo}
        />
        <MetricCard
          label="Despesa Média Diária"
          value={formatEUR(expenseMetrics.mediaDiaria)}
          delta={expenseMetrics.mediaDelta}
          icon={CalendarDays}
          iconBg="bg-amber-50 text-amber-600"
        demo={despesasDemo}
        />
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="label-uppercase flex items-center gap-1.5">Maior Despesa{despesasDemo && <DemoTag />}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
              <AlertCircle size={18} />
            </span>
          </div>
          <div className="text-[22px] font-semibold leading-tight text-slate-900">
            {formatEUR(expenseMetrics.maiorDespesa.valor)}
          </div>
          <div className="text-xs text-slate-500">
            {expenseMetrics.maiorDespesa.fornecedor} · {expenseMetrics.maiorDespesa.data}
          </div>
        </div>
        <MetricCard
          label="Pagamentos Pendentes"
          value={formatEUR(expenseMetrics.pagamentosPendentes)}
          icon={CreditCard}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${expenseMetrics.pendentesQtd} faturas por pagar`}
          tone="warning"
        demo={despesasDemo}
        />
      </div>

      {/* Evolução + Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          <ChartCard
            title="Evolução das Despesas"
            subtitle="Últimos 30 dias"
            height={300}
            action={
              <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
                <option>Últimos 30 dias</option>
                <option>Últimos 60 dias</option>
                <option>Últimos 90 dias</option>
              </select>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseEvolution} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#EF4444" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
                <Tooltip content={<EvTooltip />} />
                <Area type="monotone" dataKey="valor" stroke="#EF4444" strokeWidth={2.4} fill="url(#expGrad)" dot={{ r: 0 }} activeDot={{ r: 5, fill: "#EF4444" }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <DonutCategoryCard
            title="Despesas por Categoria"
            data={expenseByCategory}
            action={
              <select className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white">
                <option>Este mês</option>
                <option>Este trimestre</option>
                <option>Este ano</option>
              </select>
            }
          />
        </div>
      </div>

      {/* Tabela */}
      <DataTable
        columns={columns}
        rows={expenseList}
        tabs={tabs}
        defaultTab="todas"
        searchPlaceholder="Pesquisar descrição, fornecedor..."
        searchableFields={["descricao", "fornecedor", "categoria"]}
        pageSize={8}
      />
    </>
  );
}