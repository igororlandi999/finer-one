import { useState } from "react";
import { Sparkles, X } from "lucide-react";

// Banner discreto que reforça o contexto de demo/protótipo.
// O utilizador pode fechar — o estado vive na sessão.
export default function DemoBanner() {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50/70 px-4 py-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/15 text-brand-700 shrink-0 mt-0.5">
        <Sparkles size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-brand-700">Modo demonstração.</span>{" "}
          Dados fictícios da empresa Overcel para fins de apresentação. Pode alternar entre planos no rodapé da barra lateral.
        </p>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/60 shrink-0"
        title="Fechar"
      >
        <X size={14} />
      </button>
    </div>
  );
}
