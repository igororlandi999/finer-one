// Gauge circular SVG que representa o score financeiro 0-100.
// Cores: vermelho (Crítico 0-49), amarelo (Atenção 50-74), verde (Saudável 75-100)

const BANDS = [
  { max: 49,  color: "#EF4444", label: "Crítico"   },  // Vermelho Risco
  { max: 74,  color: "#F59E0B", label: "Atenção"   },  // Dourado Premium / atenção
  { max: 100, color: "#10B981", label: "Saudável"  },  // Verde Sucesso
];

function getBand(score) {
  return BANDS.find((b) => score <= b.max) ?? BANDS[2];
}

export default function DiagnosticGauge({ score = 0, label, size = 220, thickness = 16 }) {
  const radius  = (size - thickness) / 2;
  const cx      = size / 2;
  const cy      = size / 2;
  const startA  = 135;   // ângulo de início (graus)
  const totalA  = 270;   // amplitude do arco

  // Converte ângulo para ponto na circunferência
  const polar = (angle) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  // Gera path de arco entre dois ângulos
  const arcPath = (a1, a2) => {
    const s    = polar(a1);
    const e    = polar(a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const clamped    = Math.max(0, Math.min(100, score));
  const valueAngle = startA + (clamped / 100) * totalA;
  const band       = getBand(clamped);
  const tip        = polar(valueAngle);
  const svgH       = size * 0.78;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
        {/* Track cinzento */}
        <path d={arcPath(startA, startA + totalA)} fill="none" stroke="#e2e8f0" strokeWidth={thickness} strokeLinecap="round" />

        {/* Zonas de cor subtis */}
        <path d={arcPath(startA,             startA + totalA * 0.50)} fill="none" stroke="#fecaca" strokeWidth={thickness} strokeLinecap="round" opacity={0.5} />
        <path d={arcPath(startA + totalA * 0.50, startA + totalA * 0.75)} fill="none" stroke="#fde68a" strokeWidth={thickness} strokeLinecap="round" opacity={0.5} />
        <path d={arcPath(startA + totalA * 0.75, startA + totalA)}        fill="none" stroke="#a7f3d0" strokeWidth={thickness} strokeLinecap="round" opacity={0.5} />

        {/* Progresso até ao score */}
        <path d={arcPath(startA, valueAngle)} fill="none" stroke={band.color} strokeWidth={thickness} strokeLinecap="round" />

        {/* Ponteiro */}
        <circle cx={tip.x} cy={tip.y} r={thickness / 2 + 3} fill="#fff" />
        <circle cx={tip.x} cy={tip.y} r={thickness / 2 - 1} fill={band.color} />

        {/* Score central */}
        <text x={cx} y={cy - 4}  textAnchor="middle" fill="#0f172a" style={{ fontSize: 44, fontWeight: 700 }}>
          {Math.round(clamped)}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="#64748b" style={{ fontSize: 12, fontWeight: 500 }}>
          {label ?? `${band.label} · /100`}
        </text>
      </svg>

      {/* Escala */}
      <div className="flex justify-between w-full px-2 -mt-2 text-[10px] font-medium text-slate-400">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}