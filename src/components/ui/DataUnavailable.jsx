// src/components/ui/DataUnavailable.jsx
// Ecrã mostrado quando existe backend configurado mas a leitura falhou.
//
// A regra que este componente serve: uma avaria não pode ser apresentada como modo
// demonstração. Até à C7F.1, uma quebra de rede punha a aplicação a mostrar os números
// fictícios da Overcel com um banner a dizer "Modo demonstração" — o utilizador via
// dados de outra empresa e era informado de que isso era intencional.
//
// Aqui não há um único número. Nem real (não existe), nem de exemplo (seria mentira).
// Há o que aconteceu e o que se pode fazer a seguir.
//
// O botão NÃO é uma promessa vazia: `reload` é a mesma função que o contexto usa no
// arranque, e repete a leitura de verdade.

import { CloudOff, RefreshCw } from "lucide-react";

export default function DataUnavailable({ onRetry }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <CloudOff size={22} />
      </span>

      <p className="text-base font-semibold text-slate-900">
        Não foi possível carregar os dados da empresa.
      </p>

      {/* Diz o que NÃO está a acontecer, porque a alternativa — mostrar exemplos sem
          avisar — é precisamente o defeito que este ecrã existe para impedir. */}
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        A ligação ao serviço de dados falhou. Para não apresentar valores incorretos,
        nenhuma informação financeira é mostrada até a ligação ser reposta.
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary mt-5 inline-flex justify-center"
        >
          <RefreshCw size={15} />
          Tentar novamente
        </button>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Se o problema persistir, contacte o suporte.
      </p>
    </div>
  );
}
