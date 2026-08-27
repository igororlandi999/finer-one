// src/components/ui/CompanyDataNotLinked.jsx
// A empresa ATIVA não é aquela a que o dataset carregado pertence.
//
// Irmão de `DataUnavailable`, e pela mesma razão: não há um único número neste ecrã.
// Nem reais (são de outra empresa), nem de exemplo (seriam mentira). Há o que se passa
// e o que se pode fazer a seguir.
//
// A diferença para `DataUnavailable` é a causa, e a causa muda o que se diz: ali houve
// uma avaria; aqui não há avaria nenhuma — a ligação desta empresa aos dados
// simplesmente ainda não existe.

import { Building2 } from "lucide-react";

export default function CompanyDataNotLinked({ companyName, onSwitchBack, backLabel }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Building2 size={22} />
      </span>

      <p className="text-base font-semibold text-slate-900">
        {companyName ? `${companyName} ainda não tem dados ligados.` : "Esta empresa ainda não tem dados ligados."}
      </p>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        A integração financeira desta empresa ainda não está configurada. Para não
        apresentar números de outra empresa, nenhuma informação financeira é mostrada.
      </p>

      {onSwitchBack && backLabel && (
        <button onClick={onSwitchBack} className="btn-secondary mt-5 inline-flex justify-center">
          Voltar a {backLabel}
        </button>
      )}
    </div>
  );
}
