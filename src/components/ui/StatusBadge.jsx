// Badge de estado / severidade

const VARIANTS = {
  // Estados de documento
  paga:      "bg-brand-50 text-brand-700 border-brand-200",
  recebida:  "bg-brand-50 text-brand-700 border-brand-200",
  pendente:  "bg-amber-50 text-amber-700 border-amber-200",
  atraso:    "bg-rose-50  text-rose-700  border-rose-200",
  vencida:   "bg-rose-50  text-rose-700  border-rose-200",
  prevista:  "bg-sky-50   text-sky-700   border-sky-200",
  // Severidades
  danger:    "bg-rose-50  text-rose-700  border-rose-200",
  warning:   "bg-amber-50 text-amber-700 border-amber-200",
  info:      "bg-sky-50   text-sky-700   border-sky-200",
  success:   "bg-brand-50 text-brand-700 border-brand-200",
  neutral:   "bg-slate-100 text-slate-700 border-slate-200",
  // Estado da empresa
  saudavel:  "bg-brand-50 text-brand-700 border-brand-200",
  atencao:   "bg-amber-50 text-amber-700 border-amber-200",
  critico:   "bg-rose-50  text-rose-700  border-rose-200",
};

export default function StatusBadge({ variant = "neutral", children, className = "" }) {
  const style = VARIANTS[variant] ?? VARIANTS.neutral;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style} ${className}`}
    >
      {children}
    </span>
  );
}
