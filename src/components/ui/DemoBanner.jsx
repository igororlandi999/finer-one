import { useState } from "react";
import { Sparkles, X, CloudOff } from "lucide-react";
import { useFinerData, DATA_SOURCE } from "../../context/FinerDataContext";

// Banner discreto que reforça o contexto de demo/protótipo.
// A mensagem reflete a fonte dos dados: API real (Bling) vs mock/fallback.
// O utilizador pode fechar — o estado vive na sessão.
export default function DemoBanner() {
  const [open, setOpen] = useState(true);
  const { source } = useFinerData();
  if (!open) return null;

  /* SEM VEREDITO, SEM AFIRMAÇÃO (C7F). Enquanto a leitura decorre não se anuncia nada:
   * antes desta fase o banner declarava "Modo demonstração — dados fictícios" durante
   * o carregamento e trocava para "Dados reais conectados" segundos depois. Dizer ao
   * utilizador que está em demonstração e desmentir-se a seguir é pior do que calar. */
  if (source === DATA_SOURCE.LOADING) return null;

  const isReal = source === DATA_SOURCE.API;
  /* AVARIA tem moldura própria (âmbar, ícone de ligação perdida). Reutilizar a moldura
   * da demonstração — que é convidativa, de marca — faria uma falha parecer uma
   * funcionalidade. */
  const indisponivel = source === DATA_SOURCE.UNAVAILABLE;

  return (
    <div className={`mb-5 flex items-start gap-3 rounded-lg border px-4 py-2.5 ${
      indisponivel ? "border-amber-200 bg-amber-50/70" : "border-brand-200 bg-brand-50/70"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 mt-0.5 ${
        indisponivel ? "bg-amber-500/15 text-amber-700" : "bg-brand-500/15 text-brand-700"}`}>
        {indisponivel ? <CloudOff size={13} /> : <Sparkles size={13} />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          {indisponivel ? (
            <>
              <span className="font-semibold text-amber-700">Sem ligação ao serviço de dados.</span>{" "}
              Não é possível mostrar informação financeira neste momento. Os valores apresentados
              anteriormente podem não estar atualizados.
            </>
          ) : isReal ? (
            <>
              <span className="font-semibold text-brand-700">Dados reais conectados ao Bling.</span>{" "}
              Algumas secções ainda usam dados demonstrativos enquanto os módulos financeiros não forem integrados.
            </>
          ) : (
            <>
              <span className="font-semibold text-brand-700">Modo demonstração.</span>{" "}
              Dados fictícios da empresa Overcel para fins de apresentação. Pode alternar entre planos no rodapé da barra lateral.
            </>
          )}
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