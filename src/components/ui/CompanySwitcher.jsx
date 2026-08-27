// src/components/ui/CompanySwitcher.jsx
// O seletor de empresa da barra lateral.
//
// ─── TRÊS COMPORTAMENTOS, PORQUE SÃO TRÊS SITUAÇÕES ─────────────────────────────────
//   1 membership   -> mostra a empresa e não oferece troca nenhuma. Um menu com uma
//                     opção é ruído que sugere que existe outra coisa algures.
//   N memberships  -> menu. A empresa ativa fica marcada e o papel do utilizador em
//                     CADA uma aparece, porque a mesma pessoa pode ser dona de uma e
//                     mera consulta noutra, e isso muda o que ela pode fazer.
//   0 memberships  -> este componente não chega a ser desenhado: `ProtectedRoute`
//                     encaminha para o ecrã de acesso não configurado.
//
// ─── TROCAR DE EMPRESA NÃO É CONCEDER ACESSO ────────────────────────────────────────
// `switchCompany` só aceita ids que estejam na lista de memberships da sessão, e o
// valor guardado no `localStorage` é revalidado contra essa lista a cada arranque. Um
// utilizador que edite a preferência à mão vê-a descartada em silêncio — e, mesmo que
// não fosse, o BFF recusaria os dados na mesma (`authorizeCompanyRequest`).

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { useCompany } from "../../auth/CompanyContext.jsx";
import { roleLabel } from "../../auth/sessionContract.js";
import PlanBadge from "./PlanBadge.jsx";

/** Inicial do nome da empresa, para o quadradinho. Nunca inventa: sem nome, "?". */
function inicial(nome) {
  const t = String(nome ?? "").trim();
  return t ? t[0].toUpperCase() : "?";
}

export default function CompanySwitcher({ planId, planLabel }) {
  const { company, companies, canSwitch, switchCompany } = useCompany();
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef(null);

  // Fechar ao clicar fora e com Escape — um menu que só fecha ao reclicar prende o rato.
  useEffect(() => {
    if (!aberto) return undefined;
    function fora(e) {
      if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false);
    }
    function escape(e) { if (e.key === "Escape") setAberto(false); }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const nome = company?.name ?? "—";

  const cartao = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-500/20 text-brand-300 text-xs font-bold shrink-0">
        {inicial(nome)}
      </span>
      <span className="flex flex-col items-start min-w-0">
        <span className="text-sm font-medium text-slate-100 truncate max-w-[140px]">{nome}</span>
        {planId && <PlanBadge planId={planId} label={planLabel} className="mt-0.5" />}
      </span>
    </span>
  );

  // ── Uma empresa: um cartão, não um botão. Não há para onde ir. ──
  if (!canSwitch) {
    return (
      <div className="px-3 pb-4">
        <div className="w-full flex items-center px-3 py-2.5 rounded-lg bg-sidebar-hover/60 border border-sidebar-border">
          {cartao}
        </div>
      </div>
    );
  }

  // ── Várias empresas: menu ──
  return (
    <div className="px-3 pb-4 relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label="Mudar de empresa"
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-sidebar-hover/60 hover:bg-sidebar-hover transition-colors border border-sidebar-border"
      >
        {cartao}
        <ChevronsUpDown size={14} className="text-sidebar-muted shrink-0" />
      </button>

      {aberto && (
        <ul
          role="listbox"
          className="absolute left-3 right-3 z-50 mt-1 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar shadow-lg"
        >
          {companies.map((c) => {
            const ativa = c.companyId === company?.id;
            return (
              <li key={c.companyId} role="option" aria-selected={ativa}>
                <button
                  type="button"
                  onClick={() => { switchCompany(c.companyId); setAberto(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                    ativa ? "bg-sidebar-hover" : "hover:bg-sidebar-hover"
                  }`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-brand-500/20 text-brand-300 text-xs font-bold shrink-0">
                    {inicial(c.name)}
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm text-slate-100 truncate">{c.name}</span>
                    {/* O papel POR EMPRESA. É o que explica por que razão um botão que
                        existe numa empresa desaparece noutra. */}
                    <span className="text-[10px] text-sidebar-muted">{roleLabel(c.role)}</span>
                  </span>
                  {ativa && <Check size={14} className="text-brand-400 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
