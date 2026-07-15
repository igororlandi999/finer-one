// src/components/diagnostic/ActionPlanModal.jsx
// Plano de Ação do Diagnóstico Financeiro. Somente leitura, sem persistência:
// exibe as ações já presentes no objeto `diagnostic` (reais ou mock com selo
// Demo). Nenhuma ação, impacto ou status é inventado aqui.

import { X } from "lucide-react";
import StatusBadge from "../ui/StatusBadge";
import DemoTag from "../ui/DemoTag";
import { formatEUR } from "../../lib/format";

export default function ActionPlanModal({ open, onClose, diagnostic, demo }) {
  if (!open) return null;

  const variant =
    diagnostic.estado === "Saudável" ? "saudavel" :
    diagnostic.estado === "Atenção"  ? "atencao"  : "critico";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Plano de Ação</h2>
              {demo && <DemoTag />}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-600">
              <StatusBadge variant={variant}>{diagnostic.estado}</StatusBadge>
              <span>
                Score atual: <strong className="text-slate-800">{diagnostic.score}/100</strong>
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Prioridade máxima: <strong className="text-slate-700">{diagnostic.prioridadeMaxima}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Passos (na ordem de prioridade do diagnóstico) */}
        <div className="p-5 space-y-3">
          {diagnostic.acoes.map((a, i) => (
            <div key={a.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{a.titulo}</p>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{a.descricao}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {a.prazo}
                </span>
              </div>
              {typeof a.impacto === "number" && (
                <p className="mt-2 pl-9 text-xs text-slate-500">
                  Impacto estimado: <strong className="text-brand-700">+{formatEUR(a.impacto)}</strong>
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Rodapé */}
        <div className="border-t border-slate-100 p-5">
          <p className="text-[11px] text-slate-500 mb-3">
            Os prazos são recomendações operacionais, não previsões financeiras.
          </p>
          <button onClick={onClose} className="btn-secondary w-full justify-center">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}