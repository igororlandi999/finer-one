import { ChevronsUpDown, LogOut, X } from "lucide-react";
import { usePlan } from "../context/PlanContext";
import { company, currentUser } from "../data/mockData";
import PlanBadge from "../components/ui/PlanBadge";

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { visibleScreens, activeScreen, navigateTo, plan, planList, changePlan } = usePlan();

  // No mobile: navegar + fechar drawer
  const handleNavigate = (id) => {
    navigateTo(id);
    onClose();
  };

  return (
    <>
      {/* Overlay (apenas <lg quando aberto) */}
      {open && (
        <button
          onClick={onClose}
          className="lg:hidden fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm"
          aria-label="Fechar menu"
        />
      )}

      <aside
        className={`
          bg-sidebar text-slate-100 flex flex-col h-screen shrink-0 w-72
          fixed top-0 left-0 z-40 transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:sticky lg:w-64 lg:z-auto
        `}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white font-bold text-lg">
              F
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight">FINER ONE</div>
              <div className="text-[10px] text-sidebar-muted uppercase tracking-wider">
                Financial Intelligence PME
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-sidebar-muted hover:text-white hover:bg-sidebar-hover"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Empresa + plano */}
        <div className="px-3 pb-4">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-sidebar-hover/60 hover:bg-sidebar-hover transition-colors border border-sidebar-border"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-500/20 text-brand-300 text-xs font-bold shrink-0">
                O
              </span>
              <span className="flex flex-col items-start min-w-0">
                <span className="text-sm font-medium text-slate-100 truncate max-w-[140px]">
                  {company.name}
                </span>
                <PlanBadge planId={plan.id} label={plan.label} className="mt-0.5" />
              </span>
            </span>
            <ChevronsUpDown size={14} className="text-sidebar-muted shrink-0" />
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {visibleScreens.map((screen) => {
            const Icon     = screen.icon;
            const isActive = activeScreen === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => handleNavigate(screen.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "text-slate-300 hover:bg-sidebar-hover hover:text-white"
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="truncate text-left">{screen.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Seletor de plano */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-sidebar-muted block mb-1.5">
            Plano (demo)
          </label>
          <select
            value={plan.id}
            onChange={(e) => changePlan(e.target.value)}
            className="w-full bg-sidebar-hover text-slate-100 text-sm rounded-md px-2.5 py-1.5 border border-sidebar-border outline-none"
          >
            {planList.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-800">
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Utilizador */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-semibold shrink-0">
              {currentUser.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-100 truncate">{currentUser.name}</div>
              <div className="text-[11px] text-sidebar-muted truncate">{currentUser.role}</div>
            </div>
            <button className="p-1.5 rounded-md text-sidebar-muted hover:text-slate-100 hover:bg-sidebar-hover transition-colors" aria-label="Sair">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
