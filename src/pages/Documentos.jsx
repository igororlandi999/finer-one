import { useState } from "react";
import {
  FileText, Calendar, HardDrive, Search, Upload, Plus,
  Download, Mail, Smartphone, MoreHorizontal, FileSpreadsheet, Image, File,
} from "lucide-react";

import PageHeader        from "../layouts/PageHeader";
import MetricCard        from "../components/ui/MetricCard";
import DonutCategoryCard from "../components/charts/DonutCategoryCard";

import { docsMetrics, docsByCategory, docsList } from "../data/mockData";
import { formatEUR } from "../lib/format";

// ── Mapa categoria → cor pill ───────────────────────────────
const CAT_STYLE = {
  "Faturas de Fornecedores": "bg-brand-50 text-brand-700 border-brand-200",
  "Recibos":                  "bg-sky-50   text-sky-700   border-sky-200",
  "Faturas de Clientes":      "bg-purple-50 text-purple-700 border-purple-200",
  "Contratos":                "bg-amber-50 text-amber-700 border-amber-200",
  "Outros":                   "bg-slate-100 text-slate-700 border-slate-200",
};

// ── Ícone do ficheiro pela extensão ─────────────────────────
function FileIcon({ filename }) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf") return <span className="flex h-9 w-9 items-center justify-center rounded-md bg-rose-50  text-rose-600"><FileText size={16} /></span>;
  if (ext === "xlsx" || ext === "csv") return <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-600"><FileSpreadsheet size={16} /></span>;
  if (ext === "jpg" || ext === "png" || ext === "jpeg") return <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-50 text-sky-600"><Image size={16} /></span>;
  return <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-600"><File size={16} /></span>;
}

// ── Origem (badge) ──────────────────────────────────────────
function OriginBadge({ origem }) {
  const map = {
    "Upload":     { icon: Upload,     style: "bg-slate-100 text-slate-700 border-slate-200" },
    "Email":      { icon: Mail,       style: "bg-sky-50    text-sky-700    border-sky-200"  },
    "Mobile App": { icon: Smartphone, style: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  const cfg = map[origem] ?? map.Upload;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.style}`}>
      <Icon size={11} />{origem}
    </span>
  );
}

const CATEGORY_TABS = ["Todos", "Faturas de Fornecedores", "Recibos", "Faturas de Clientes", "Contratos", "Outros"];

// ── Tela ────────────────────────────────────────────────────
export default function Documentos() {
  const [tab, setTab] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = docsList.filter((d) => {
    if (tab !== "Todos" && d.categoria !== tab) return false;
    if (search && !d.nome.toLowerCase().includes(search.toLowerCase()) && !d.contraparte.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const armPct = (docsMetrics.armazenamento.usado / docsMetrics.armazenamento.total) * 100;

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Centralize faturas, recibos e contratos da Overcel — sem perder tempo a procurar."
        actions={
          <>
            <button className="btn-secondary"><Upload size={14} />Carregar</button>
            <button className="btn-primary"><Plus size={14} />Novo documento</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total de Documentos"
          value={docsMetrics.total}
          icon={FileText}
          iconBg="bg-brand-50 text-brand-600"
          helper={`+${docsMetrics.esteMes} este mês`}
        />
        <MetricCard
          label="Documentos este mês"
          value={docsMetrics.esteMes}
          icon={Calendar}
          iconBg="bg-sky-50 text-sky-600"
          delta={docsMetrics.esteMesDelta}
          deltaLabel="vs mês anterior"
          tone="success"
        />
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="label-uppercase">Armazenamento</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <HardDrive size={18} />
            </span>
          </div>
          <div className="text-[22px] font-semibold leading-tight text-slate-900">
            {docsMetrics.armazenamento.usado} {docsMetrics.armazenamento.unit}
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>de {docsMetrics.armazenamento.total} {docsMetrics.armazenamento.unit}</span>
              <span>{armPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${armPct}%` }} />
            </div>
          </div>
        </div>
        <MetricCard
          label="Origem mais frequente"
          value="Email"
          icon={Mail}
          iconBg="bg-amber-50 text-amber-600"
          helper="42% dos documentos"
        />
      </div>

      {/* Categorias + Carregamentos recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          <DonutCategoryCard
            title="Documentos por Categoria"
            data={docsByCategory}
            valueFormatter={(v) => `${v} doc${v === 1 ? "" : "s"}`}
            centerValue={`${docsMetrics.total}`}
            centerLabel="Documentos"
          />
        </div>
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Carregamentos recentes</h3>
            <p className="text-xs text-slate-500 mb-4">Últimos documentos adicionados</p>
            <div className="space-y-2">
              {docsList.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <FileIcon filename={d.nome} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.nome}</p>
                    <p className="text-xs text-slate-500">{d.data} · {d.categoria}</p>
                  </div>
                  <OriginBadge origem={d.origem} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de documentos */}
      <div className="card overflow-hidden">
        {/* Tabs de categoria */}
        <div className="border-b border-slate-200 px-5">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {CATEGORY_TABS.map((t) => {
              const active = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pesquisa */}
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome ou contraparte..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <span className="text-xs text-slate-500 ml-auto">
            {filtered.length} documento{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nome</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contraparte</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Data</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Origem</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Sem documentos para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <FileIcon filename={d.nome} />
                        <span className="text-sm font-medium text-slate-800">{d.nome}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${CAT_STYLE[d.categoria] ?? CAT_STYLE.Outros}`}>
                        {d.categoria}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-600">{d.contraparte}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{d.data}</td>
                    <td className="px-5 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums">
                      {d.valor != null ? formatEUR(d.valor) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3"><OriginBadge origem={d.origem} /></td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Descarregar">
                          <Download size={14} />
                        </button>
                        <button className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Mais opções">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
