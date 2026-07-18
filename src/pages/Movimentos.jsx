import {
  ArrowUpRight, ArrowDownRight, Wallet, ArrowLeftRight,
  Download, MoreHorizontal, Building2,
} from "lucide-react";

import PageHeader  from "../layouts/PageHeader";
import MetricCard  from "../components/ui/MetricCard";
import DataTable, { RowActionsButton } from "../components/ui/DataTable";

import { movementsMetrics, movementsPeriod, movementsList } from "../data/mockData";
import { formatEUR } from "../lib/format";

// ── Mapa categoria → cor de badge ───────────────────────────
const CAT_STYLE = {
  "Vendas":           "bg-brand-50 text-brand-700 border-brand-200",
  "Serviços":         "bg-sky-50   text-sky-700   border-sky-200",
  "Fornecedores":     "bg-rose-50  text-rose-700  border-rose-200",
  "Salários":         "bg-purple-50 text-purple-700 border-purple-200",
  "Alugueres":        "bg-amber-50 text-amber-700 border-amber-200",
  "Impostos":         "bg-orange-50 text-orange-700 border-orange-200",
  "Despesas Gerais":  "bg-slate-100 text-slate-700 border-slate-200",
  "Transferências":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Outros":           "bg-slate-100 text-slate-700 border-slate-200",
};

function CategoryPill({ category }) {
  const style = CAT_STYLE[category] ?? CAT_STYLE.Outros;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style}`}>
      {category}
    </span>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function Movimentos() {
  const columns = [
    { key: "data", header: "Data" },
    { key: "descricao", header: "Descrição",
      render: (r) => <span className="font-medium text-slate-800">{r.descricao}</span> },
    { key: "categoria", header: "Categoria",
      render: (r) => <CategoryPill category={r.categoria} /> },
    { key: "conta", header: "Conta",
      render: (r) => <span className="text-slate-600">{r.conta}</span> },
    { key: "entrada", header: "Entrada", align: "right",
      render: (r) => r.entrada > 0
        ? <span className="font-semibold text-brand-600">{formatEUR(r.entrada)}</span>
        : <span className="text-slate-300">—</span> },
    { key: "saida", header: "Saída", align: "right",
      render: (r) => r.saida > 0
        ? <span className="font-semibold text-rose-600">{formatEUR(r.saida)}</span>
        : <span className="text-slate-300">—</span> },
    { key: "saldo", header: "Saldo", align: "right",
      render: (r) => <span className="text-slate-700">{formatEUR(r.saldo)}</span> },
    { key: "origem", header: "Origem",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <Building2 size={13} className="text-slate-400" />
          {r.origem}
        </span>
      ) },
    { key: "_actions", header: "", align: "right",
      render: () => <RowActionsButton /> },
  ];

  const tabs = [
    { id: "todas",       label: "Todas" },
    { id: "entradas",    label: "Entradas",       filter: (r) => r.entrada > 0 && r.categoria !== "Transferências" },
    { id: "saidas",      label: "Saídas",         filter: (r) => r.saida > 0   && r.categoria !== "Transferências" },
    { id: "transferencias", label: "Transferências", filter: (r) => r.categoria === "Transferências" },
  ];

  return (
    <>
      <PageHeader
        title="Movimentos"
        subtitle={`Todas as entradas e saídas das suas contas entre ${movementsPeriod.inicio} e ${movementsPeriod.fim} num único sítio.`}
        actions={
          <>
            <span className="text-xs text-slate-500 mr-1">
              {movementsPeriod.inicio} — {movementsPeriod.fim}
            </span>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button className="btn-secondary"><MoreHorizontal size={14} />Mais opções</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Entradas"
          value={formatEUR(movementsMetrics.totalEntradas)}
          delta={movementsMetrics.entradasDelta}
          icon={ArrowUpRight}
          iconBg="bg-brand-50 text-brand-600"
        />
        <MetricCard
          label="Total Saídas"
          value={formatEUR(movementsMetrics.totalSaidas)}
          delta={movementsMetrics.saidasDelta}
          icon={ArrowDownRight}
          iconBg="bg-rose-50 text-rose-500"
        />
        <MetricCard
          label="Saldo Líquido"
          value={formatEUR(movementsMetrics.saldoLiquido)}
          delta={movementsMetrics.saldoDelta}
          icon={Wallet}
          iconBg="bg-sky-50 text-sky-600"
          tone="success"
        />
        <MetricCard
          label="Transações"
          value={movementsMetrics.totalTransacoes}
          delta={movementsMetrics.transacoesDelta}
          icon={ArrowLeftRight}
          iconBg="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Tabela */}
      <div className="mb-4">
        <DataTable
          columns={columns}
          rows={movementsList}
          tabs={tabs}
          defaultTab="todas"
          searchPlaceholder="Pesquisar descrição, categoria..."
          searchableFields={["descricao", "categoria", "conta", "origem"]}
          pageSize={10}
        />
      </div>

      {/* Rodapé com resumo do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <span className="label-uppercase">Saldo Inicial</span>
          <div className="text-lg font-semibold text-slate-700 mt-1">
            {formatEUR(movementsPeriod.saldoInicial)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{movementsPeriod.inicio}</div>
        </div>
        <div className="card p-4">
          <span className="label-uppercase">Total Entradas</span>
          <div className="text-lg font-semibold text-brand-600 mt-1">
            {formatEUR(movementsMetrics.totalEntradas)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">no período</div>
        </div>
        <div className="card p-4">
          <span className="label-uppercase">Total Saídas</span>
          <div className="text-lg font-semibold text-rose-600 mt-1">
            {formatEUR(movementsMetrics.totalSaidas)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">no período</div>
        </div>
        <div className="card p-4">
          <span className="label-uppercase">Saldo Final</span>
          <div className="text-lg font-semibold text-slate-900 mt-1">
            {formatEUR(movementsPeriod.saldoFinal)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{movementsPeriod.fim}</div>
        </div>
      </div>
    </>
  );
}
