import { ArrowUpRight, ArrowDownRight } from "lucide-react";

// Card padrão de KPI
// Props: label, value, delta (número), deltaSuffix, deltaLabel,
//        icon (Lucide), iconBg, helper, tone

const TONE_VALUE = {
  default: "text-slate-900",
  danger:  "text-rose-600",
  warning: "text-amber-600",
  success: "text-brand-600",
};

export default function MetricCard({
  label,
  value,
  delta,
  deltaSuffix = "%",
  deltaLabel  = "vs mês anterior",
  icon: Icon,
  iconBg      = "bg-brand-50 text-brand-600",
  helper,
  tone        = "default",
}) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const positive = hasDelta && delta > 0;
  const negative = hasDelta && delta < 0;

  return (
    <div className="card p-5 flex flex-col gap-3">
      {/* Linha topo: label + ícone */}
      <div className="flex items-start justify-between gap-3">
        <span className="label-uppercase">{label}</span>
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon size={18} />
          </span>
        )}
      </div>

      {/* Valor principal */}
      <div className={`text-[26px] font-semibold leading-tight ${TONE_VALUE[tone]}`}>
        {value}
      </div>

      {/* Delta ou helper */}
      <div className="flex items-center gap-2 text-xs">
        {hasDelta && (
          <span className={`inline-flex items-center gap-0.5 font-medium ${
            positive ? "text-brand-600" : negative ? "text-rose-600" : "text-slate-500"
          }`}>
            {positive && <ArrowUpRight size={13} />}
            {negative && <ArrowDownRight size={13} />}
            {Math.abs(delta).toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            {deltaSuffix}
          </span>
        )}
        {hasDelta && <span className="text-slate-400">{deltaLabel}</span>}
        {!hasDelta && helper && <span className="text-slate-500">{helper}</span>}
      </div>
    </div>
  );
}
