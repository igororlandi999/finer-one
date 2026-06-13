import { useMemo, useState } from "react";
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal,
} from "lucide-react";

// Tabela reutilizável com:
//  - Tabs de filtro rápido (opcionais)
//  - Pesquisa (sobre os campos listados em searchableFields)
//  - Paginação client-side
//  - Colunas configuráveis com render personalizado
//
// Props principais:
//   columns:  [{ key, header, render?(row), align? "left"|"right", className? }]
//   rows:     array de objetos
//   tabs:     [{ id, label, filter?(row) }]   (opcional)
//   defaultTab: id do tab ativo
//   searchPlaceholder, searchableFields
//   pageSize  (default 8)
//   rowKey    (campo único, default "id")
//   actions   (ReactNode renderizado à direita da barra de filtros)

export default function DataTable({
  columns = [],
  rows = [],
  tabs,
  defaultTab,
  searchPlaceholder = "Pesquisar...",
  searchableFields = [],
  pageSize = 8,
  rowKey = "id",
  actions,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs?.[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Aplicação de tab + pesquisa
  const filtered = useMemo(() => {
    let out = rows;
    if (tabs && activeTab) {
      const tab = tabs.find((t) => t.id === activeTab);
      if (tab?.filter) out = out.filter(tab.filter);
    }
    if (query.trim() && searchableFields.length) {
      const q = query.toLowerCase();
      out = out.filter((row) =>
        searchableFields.some((f) => String(row[f] ?? "").toLowerCase().includes(q))
      );
    }
    return out;
  }, [rows, tabs, activeTab, query, searchableFields]);

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const visibleRows = filtered.slice(startIdx, startIdx + pageSize);
  const endIdx = startIdx + visibleRows.length;

  const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  return (
    <div className="card overflow-hidden">
      {/* Tabs */}
      {tabs && tabs.length > 0 && (
        <div className="border-b border-slate-200 px-5">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    setPage(1);
                  }}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
      )}

      {/* Barra de filtros */}
      <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200 placeholder:text-slate-400"
          />
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50/50">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-10 text-center text-sm text-slate-500">
                  Sem resultados para os filtros aplicados.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row[rowKey]}
                  className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                >
                  {columns.map((c) => {
                    const value = c.render ? c.render(row) : row[c.key];
                    return (
                      <td
                        key={c.key}
                        className={`px-5 py-3 text-sm text-slate-700 ${
                          c.align === "right" ? "text-right tabular-nums" : ""
                        } ${c.className ?? ""}`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé com paginação */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-slate-200 bg-slate-50/40">
        <div className="text-xs text-slate-500">
          A mostrar {filtered.length === 0 ? 0 : startIdx + 1} a {endIdx} de {filtered.length} registos
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => goTo(1)}            disabled={currentPage === 1}          className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronsLeft size={14} /></button>
          <button onClick={() => goTo(currentPage - 1)} disabled={currentPage === 1}       className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={14} /></button>
          <span className="text-xs font-medium text-slate-700 px-2">
            {currentPage} / {totalPages}
          </span>
          <button onClick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={14} /></button>
          <button onClick={() => goTo(totalPages)}    disabled={currentPage === totalPages} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronsRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// Pequeno ícone de ação (3 pontos) — útil para colunas de acções
export function RowActionsButton() {
  return (
    <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
      <MoreHorizontal size={16} />
    </button>
  );
}
