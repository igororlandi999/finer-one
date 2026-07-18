import { useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2, Filter, Download,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";
import DemoTag  from "../components/ui/DemoTag";

import { alertsMetrics as mockAlertsMetrics, alertsList as mockAlertsList } from "../data/mockData";
import { useFinerData } from "../context/FinerDataContext";
import { severityCounts } from "../utils/alertsEngine";
import { downloadCsv } from "../utils/csvExport";

// Categorias que NÃO derivam de vendas — mantêm-se sempre em mock.
const NON_SALES_CATEGORIES = ["Liquidez", "Margem", "Recebimentos", "Tesouraria", "Fiscal", "Documentos"];
function composeAlerts(salesList, mockList) {
  if (!salesList) return mockList;
  return [...salesList, ...mockList.filter((a) => NON_SALES_CATEGORIES.includes(a.category))];
}

// ── Metadata por severidade ─────────────────────────────────
const SEV = {
  danger:  { icon: AlertCircle,    color: "text-rose-600",  bg: "bg-rose-50",  bar: "bg-rose-500",  ring: "ring-rose-100",  label: "Crítico" },
  warning: { icon: AlertTriangle,  color: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500", ring: "ring-amber-100", label: "Atenção" },
  info:    { icon: Info,           color: "text-sky-600",   bg: "bg-sky-50",   bar: "bg-sky-500",   ring: "ring-sky-100",   label: "Informativo" },
  success: { icon: CheckCircle2,   color: "text-brand-600", bg: "bg-brand-50", bar: "bg-brand-500", ring: "ring-brand-100", label: "Positivo" },
};

// Card resumo por severidade (no topo)
function SeverityCard({ severity, count, description, demo = false }) {
  const cfg = SEV[severity];
  const Icon = cfg.icon;
  return (
    <div className="card p-5 flex items-start gap-4">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${cfg.bg} ${cfg.color} ring-4 ${cfg.ring}`}>
        <Icon size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold uppercase tracking-wider ${cfg.color} flex items-center gap-1.5`}>{cfg.label}{demo && <DemoTag />}</div>
        <div className="text-[26px] font-semibold text-slate-900 leading-tight mt-0.5">{count}</div>
        <div className="text-xs text-slate-500 mt-1">{description}</div>
      </div>
    </div>
  );
}

// Linha de alerta detalhada
function AlertRow({ alert }) {
  const cfg  = SEV[alert.severity];
  const Icon = cfg.icon;

  return (
    <div className="relative pl-3">
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${cfg.bar}`} aria-hidden />
      <div className="flex items-start gap-3 py-4 px-1">
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${cfg.bg} ${cfg.color} shrink-0`}>
          <Icon size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              {alert.category}
            </span>
            <span className="text-xs text-slate-400 ml-auto">{alert.timestamp}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{alert.title}</p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.description}</p>
          {alert.acao && alert.acao !== "—" && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-700 font-medium">
              <span className="text-slate-400">Ação sugerida:</span>
              {alert.acao}
            </div>
          )}
        </div>
        <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary shrink-0 hidden sm:inline-flex disabled:opacity-50 disabled:cursor-not-allowed">
          Ver detalhes
        </button>
      </div>
    </div>
  );
}

// Filtros (botões por severidade)
const FILTERS = [
  { id: "todos",   label: "Todos" },
  { id: "danger",  label: "Críticos" },
  { id: "warning", label: "Atenção" },
  { id: "info",    label: "Informativos" },
  { id: "success", label: "Positivos" },
];

// ── Tela ────────────────────────────────────────────────────
export default function Alertas() {
  const [filter, setFilter] = useState("todos");

  // Alertas de vendas (quando há API) somados aos não-comerciais em mock.
  const { sales, source } = useFinerData();
  // Exportação CSV: só os alertas reais puros — a lista composta da tela inclui mock não-comercial.
  const canExport = source === "api" && !!sales?.alertas?.list?.length;
  function exportCsv() {
    if (!canExport) return;
    const SEV_CSV = { danger: "Crítico", warning: "Atenção", info: "Informação", success: "Positivo" };
    const rows = (sales?.alertas?.list ?? []).map((a) => [
      SEV_CSV[a.severity] ?? a.severity, a.category, a.title, a.description, a.acao ?? "\u2014",
    ]);
    downloadCsv("alertas.csv",
      ["Severidade", "Categoria", "Título", "Descrição", "Ação sugerida"], rows);
  }
  const salesList = sales?.alertas?.list ?? null;
  const alertsList = composeAlerts(salesList, mockAlertsList);
  const alertsMetrics = salesList
    ? severityCounts(alertsList, mockAlertsMetrics.resolvidos)
    : mockAlertsMetrics;

  const filtered = useMemo(
    () => filter === "todos" ? alertsList : alertsList.filter((a) => a.severity === filter),
    [filter, alertsList]
  );

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle="Tudo o que precisa de atenção na Overcel hoje — para não ser apanhado de surpresa."
        actions={
          <>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Filter size={14} />Filtros</button>
            <button onClick={exportCsv} disabled={!canExport} title={!canExport ? "Exportação disponível apenas com dados reais" : undefined} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
          </>
        }
      />

      {/* Resumo por severidade */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SeverityCard severity="danger"  count={alertsMetrics.criticos}    description="Requerem ação imediata" demo={source === "api"} />
        <SeverityCard severity="warning" count={alertsMetrics.atencao}     description="Devem ser monitorizados" demo={source === "api"} />
        <SeverityCard severity="info"    count={alertsMetrics.informativos} description="Informações relevantes" demo={source === "api"} />
        <SeverityCard severity="success" count={alertsMetrics.resolvidos}  description="Indicadores positivos" demo={source === "api"} />
      </div>

      {/* Lista de alertas */}
      <div className="card overflow-hidden">
        {/* Filtros rápidos */}
        <div className="border-b border-slate-200 px-5 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 mr-2">Filtrar:</span>
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-slate-500">
            {filtered.length} alerta{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="divide-y divide-slate-100 px-4">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Sem alertas para o filtro selecionado.
            </div>
          ) : (
            filtered.map((a) => <AlertRow key={a.id} alert={a} />)
          )}
        </div>
      </div>
    </>
  );
}
