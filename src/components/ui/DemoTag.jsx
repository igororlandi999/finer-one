// src/components/ui/DemoTag.jsx
// Selo discreto para marcar dados ainda demonstrativos quando o resto é real.
// Pequeno, neutro, não desloca layout: encaixa-se ao lado de um label/título.
export default function DemoTag({ className = "" }) {
  return (
    <span
      title="Dados demonstrativos"
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200 ${className}`}
    >
      Demo
    </span>
  );
}