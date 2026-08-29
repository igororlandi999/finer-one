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
            aria-label="Pesquisar na tabela"
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
        {/* Os quatro controlos são só ícone. Sem nome acessível, um leitor de ecrã anuncia
            "botão" quatro vezes seguidas e a paginação fica inutilizável — nesta tabela,
            que é onde vivem os títulos, os movimentos e as receitas. */}
        <div className="flex items-center gap-1">
          <button aria-label="Primeira página" onClick={() => goTo(1)}            disabled={currentPage === 1}          className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronsLeft size={14} /></button>
          <button aria-label="Página anterior" onClick={() => goTo(currentPage - 1)} disabled={currentPage === 1}       className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={14} /></button>
          {/* A mudança de página não move o foco: sem `aria-live`, quem não vê o ecrã
              carrega no botão e não recebe confirmação nenhuma de que algo mudou. */}
          <span className="text-xs font-medium text-slate-700 px-2" aria-live="polite">
            {currentPage} / {totalPages}
          </span>
          <button aria-label="Página seguinte" onClick={() => goTo(currentPage + 1)} disabled={currentPage === totalPages} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={14} /></button>
          <button aria-label="Última página"   onClick={() => goTo(totalPages)}    disabled={currentPage === totalPages} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"><ChevronsRight size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/* Ícone de ação (3 pontos) na última coluna das tabelas de Receitas, Despesas e
 * Movimentos — uma vez por linha.
 *
 * NÃO TEM `onClick`, e nunca teve: não há menu de linha em fase nenhuma. Era um botão
 * ativo, focável e sem nome acessível, repetido em cada linha — com a paginação a 25
 * linhas, 25 paragens de teclado seguidas que anunciam "botão" e não fazem nada.
 *
 * Fica DESATIVADO e nomeado, que é o padrão que este projeto já usa para as ações que
 * ainda não existem (o "Carregar" dos Documentos, o "Novo registo" do Resumo): um
 * controlo que não faz nada deve parecer que não faz nada, em vez de mentir sobre isso. */
export function RowActionsButton() {
  return (
    <button
      type="button"
      disabled
      aria-label="Ações da linha"
      title="Ações de linha disponíveis numa fase futura"
      className="p-1 rounded text-slate-400 opacity-40 cursor-not-allowed"
    >
      <MoreHorizontal size={16} />
    </button>
  );
}
