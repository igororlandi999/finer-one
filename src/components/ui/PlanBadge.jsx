// Badge pequeno do plano ativo — usado na sidebar

const STYLES = {
  plus:       "bg-slate-700/60 text-slate-100 border-slate-500/40",
  pro:        "bg-brand-700/40 text-brand-100 border-brand-500/40",
  team:       "bg-brand-500/30 text-brand-100 border-brand-400/50",
  enterprise: "bg-amber-500/20 text-amber-100 border-amber-400/40",
};

export default function PlanBadge({ planId, label, className = "" }) {
  const style = STYLES[planId] ?? STYLES.team;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${style} ${className}`}
    >
      {label}
    </span>
  );
}
