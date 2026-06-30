import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import DemoTag from "./DemoTag";

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
  dense       = false,
  demo        = false,
}) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const positive = hasDelta && delta > 0;
  const negative = hasDelta && delta < 0;
  const padding  = dense ? "p-4" : "p-5";
  const valueTxt = dense ? "text-[20px]" : "text-[26px]";
  const iconBox  = dense ? "h-8 w-8" : "h-9 w-9";
  const iconSize = dense ? 16 : 18;

  return (
    <div className={`card ${padding} flex flex-col ${dense ? "gap-2" : "gap-3"}`}>
      {/* Linha topo: label + ícone */}
      <div className="flex items-start justify-between gap-3">
        <span className="label-uppercase flex items-center gap-1.5">{label}{demo && <DemoTag />}</span>
        {Icon && (
          <span className={`flex ${iconBox} items-center justify-center rounded-lg ${iconBg}`}>
            <Icon size={iconSize} />
          </span>
        )}
      </div>

      {/* Valor principal */}
      <div className={`${valueTxt} font-semibold leading-tight ${TONE_VALUE[tone]}`}>
        {value}
      </div>

      {/* Delta ou helper */}
      <div className={`flex items-center gap-2 ${dense ? "text-[11px]" : "text-xs"}`}>
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