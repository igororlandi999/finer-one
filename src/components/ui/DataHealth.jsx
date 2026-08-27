// src/components/ui/DataHealth.jsx
// Faixa compacta que diz de quando são os dados E se estão completos. Reutilizável:
// recebe a saúde já apurada por utils/dataHealth e limita-se a desenhá-la.
//
// Substitui a antiga DataFreshness, que só sabia falar de idade (P0.2). O defeito não
// era o componente: era ele só ter recebido um dos dois eixos. Um snapshot escrito há
// dois minutos e interrompido a meio aparecia com o mesmo cinzento tranquilo de um
// snapshot íntegro — a faixa afirmava «Atualizado agora» sobre um conjunto incompleto.
//
// Nenhuma regra vive aqui — nem limiares, nem cálculo de idade, nem decisão de quando
// há motivo para alarme. A severidade vem já resolvida do view-model; este ficheiro só
// escolhe cores e ícones para ela.
//
// Deliberadamente DISCRETA quando está tudo bem e visível quando há motivo. Um aviso
// permanente com a mesma intensidade acabaria ignorado, e seria ignorado exatamente no
// dia em que passasse a importar.

import { Clock, AlertTriangle, HelpCircle } from "lucide-react";
import { HEALTH_SEVERITY } from "../../utils/dataHealth";

const ESTILOS = {
  [HEALTH_SEVERITY.NEUTRA]: {
    Icone: Clock,
    caixa: "border-slate-200 bg-white text-slate-500",
    icone: "text-slate-400",
  },
  [HEALTH_SEVERITY.ATENCAO]: {
    Icone: AlertTriangle,
    caixa: "border-amber-200 bg-amber-50/60 text-amber-800",
    icone: "text-amber-600",
  },
  [HEALTH_SEVERITY.ALERTA]: {
    Icone: AlertTriangle,
    caixa: "border-amber-300 bg-amber-50 text-amber-900",
    icone: "text-amber-600",
  },
  [HEALTH_SEVERITY.DESCONHECIDA]: {
    Icone: HelpCircle,
    caixa: "border-slate-200 bg-slate-50 text-slate-600",
    icone: "text-slate-400",
  },
};

/**
 * @param {{saude: object}} props `saude` é o resultado de resolveDataHealth.
 */
export default function DataHealth({ saude }) {
  if (!saude) return null;
  const estilo = ESTILOS[saude.severidade] ?? ESTILOS[HEALTH_SEVERITY.DESCONHECIDA];
  const { Icone } = estilo;

  return (
    <div className={`mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-xs ${estilo.caixa}`}>
      <Icone size={13} className={`shrink-0 ${estilo.icone}`} />

      {/* Já traz a nota de parcialidade agregada quando existe:
          "Atualizado agora mesmo · atualização parcial". */}
      <span className="font-medium">{saude.label}</span>

      {/* Data e hora exatas: "há 8 dias" diz a gravidade, o carimbo diz o facto.
          Sem o carimbo, o utilizador não consegue confrontar com o que sabe. */}
      {saude.dateLabel && (
        <span className="tabular-nums opacity-80">
          · {saude.dateLabel} às {saude.timeLabel}
        </span>
      )}

      {/* Idade e incompletude são problemas distintos e podem coexistir: quando ambos
          estão presentes, mostram-se os dois. Colapsá-los numa frase só obrigaria a
          escolher qual esconder. */}
      {saude.detalhes.map((detalhe) => (
        <span
          key={detalhe}
          className="w-full opacity-90 sm:w-auto sm:before:content-['·'] sm:before:mr-2"
        >
          {detalhe}
        </span>
      ))}
    </div>
  );
}
