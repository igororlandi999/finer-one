import { useState } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { TrendingUp, CalendarDays, Users, Clock, Plus, Download } from "lucide-react";

import PageHeader         from "../layouts/PageHeader";
import MetricCard         from "../components/ui/MetricCard";
import StatusBadge        from "../components/ui/StatusBadge";
import ChartCard          from "../components/charts/ChartCard";
import DonutCategoryCard  from "../components/charts/DonutCategoryCard";
import DataTable, { RowActionsButton } from "../components/ui/DataTable";

import {
  revenueMetrics    as mockRevenueMetrics,
  revenueEvolution  as mockRevenueEvolution,
  revenueByCategory as mockRevenueByCategory,
  revenueList       as mockRevenueList,
} from "../data/mockData";
import { formatEUR, formatEURCompact } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";
import { downloadCsv, csvMoney } from "../utils/csvExport";
import { buildRevenueByCategoryFromOrders } from "../services/blingDataService";

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

// ── Mapas auxiliares para a tabela ──────────────────────────
const STATUS_VARIANT = {
  recebida: "recebida",
  pendente: "pendente",
  atraso:   "atraso",
};
const STATUS_LABEL = {
  recebida: "Recebida",
  pendente: "Pendente",
  atraso:   "Em atraso",
};

// ── Tela ────────────────────────────────────────────────────
export default function Receitas() {
  // Fonte de dados: vendas reais (quando há API) ou fallback ao mock.
  const { sales, source } = useFinerData();
  // Exportação CSV: sempre a lista completa real (tabs/busca são só visualização).
  const canExport = source === "api";
  function exportCsv() {
    if (!canExport) return;
    const rows = (sales?.receitas?.list ?? []).map((r) => [
      r.data, r.cliente, r.documento, r.categoria, csvMoney(r.valor),
      r.recebidoEm ?? "\u2014", STATUS_LABEL[r.status] ?? r.status, r.metodo,
    ]);
    downloadCsv("receitas.csv",
      ["Data", "Cliente", "Documento", "Categoria", "Valor (€)", "Recebido em", "Estado", "Método"], rows);
  }
  const revenueMetrics    = sales?.receitas?.metrics    ?? mockRevenueMetrics;
  const revenueEvolution  = sales?.receitas?.evolution  ?? mockRevenueEvolution;
  const revenueList       = sales?.receitas?.list       ?? mockRevenueList;

  // Período do card "Receitas por Categoria" (mês / trimestre / ano).
  const [catPeriod, setCatPeriod] = useState("mes");
  // Com dados reais, recalcula por família a partir dos pedidos reais (com itens).
  // Sem dados reais (mock), mantém o comportamento atual.
  const revenueByCategory = sales?.orders
    ? buildRevenueByCategoryFromOrders(sales.orders, catPeriod)
    : mockRevenueByCategory;

  // Definição das colunas da tabela
  const columns = [
    { key: "data", header: "Data" },
    { key: "cliente", header: "Cliente",
      render: (r) => <span className="font-medium text-slate-800">{r.cliente}</span> },
    { key: "documento", header: "Fatura" },
    { key: "categoria", header: "Categoria",
      render: (r) => <span className="text-slate-600">{r.categoria}</span> },
    { key: "valor", header: "Valor", align: "right",
      render: (r) => <span className="font-semibold text-brand-700">{formatEUR(r.valor)}</span> },
    { key: "recebidoEm", header: "Recebido em",
      render: (r) => r.recebidoEm ?? <span className="text-slate-400">—</span> },
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

  // Tabs de estado
  const tabs = [
    { id: "todas",    label: "Todas" },
    { id: "recebidas",label: "Recebidas", filter: (r) => r.status === "recebida" },
    { id: "aberto",   label: "Em aberto", filter: (r) => r.status === "pendente" },
  ];

  return (
    <>
      <PageHeader
        title="Receitas"
        subtitle="Veja de onde vem o dinheiro da Overcel e quais categorias mais contribuem para o volume de negócios."
        actions={
          <>
            <button onClick={exportCsv} disabled={!canExport} title={!canExport ? "Exportação disponível apenas com dados reais" : undefined} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={14} />Nova receita</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Receitas (Mês)"
          value={formatEUR(revenueMetrics.totalMes)}
          delta={revenueMetrics.totalDelta}
          icon={TrendingUp}
          iconBg="bg-brand-50 text-brand-600"
        />
        <MetricCard
          label="Receita Média Diária"
          value={formatEUR(revenueMetrics.mediaDiaria)}
          delta={revenueMetrics.mediaDelta}
          icon={CalendarDays}
          iconBg="bg-brand-50 text-brand-600"
        />
        <MetricCard
          label="Clientes Pagos (Mês)"
          value={revenueMetrics.clientesPagos}
          delta={revenueMetrics.clientesDelta}
          deltaSuffix=""
          deltaLabel="novos vs mês anterior"
          icon={Users}
          iconBg="bg-sky-50 text-sky-600"
        />
        <MetricCard
          label="Receitas em Aberto"
          value={formatEUR(revenueMetrics.emAtraso)}
          icon={Clock}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${revenueMetrics.emAtrasoQtd} clientes com faturas em aberto`}
          tone="warning"
        />
      </div>

      {/* Evolução + Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Evolução */}
        <div className="lg:col-span-7">
          <ChartCard
            title="Evolução das Receitas"
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
              <AreaChart data={revenueEvolution} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10B981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatEURCompact(v)} width={56} />
                <Tooltip content={<EvTooltip />} />
                <Area type="monotone" dataKey="valor" stroke="#10B981" strokeWidth={2.4} fill="url(#revGrad)" dot={{ r: 0 }} activeDot={{ r: 5, fill: "#10B981" }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Distribuição por categoria */}
        <div className="lg:col-span-5">
          <DonutCategoryCard
            title="Receitas por Categoria"
            data={revenueByCategory}
            action={
              <select
                value={catPeriod}
                onChange={(e) => setCatPeriod(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
              >
                <option value="mes">Este mês</option>
                <option value="trimestre">Este trimestre</option>
                <option value="ano">Este ano</option>
              </select>
            }
          />
        </div>
      </div>

      {/* Tabela */}
      <DataTable
        columns={columns}
        rows={revenueList}
        tabs={tabs}
        defaultTab="todas"
        searchPlaceholder="Pesquisar cliente, número da fatura..."
        searchableFields={["cliente", "documento", "categoria"]}
        pageSize={8}
      />
    </>
  );
}