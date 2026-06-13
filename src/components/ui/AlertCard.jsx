import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";

// Card de alerta com barra lateral colorida por severidade
// Severidades: danger | warning | info | success

const SEVERITY = {
  danger:  { icon: AlertCircle,  iconColor: "text-rose-500",  iconBg: "bg-rose-50",  bar: "bg-rose-500"  },
  warning: { icon: AlertTriangle,iconColor: "text-amber-500", iconBg: "bg-amber-50", bar: "bg-amber-500" },
  info:    { icon: Info,         iconColor: "text-sky-500",   iconBg: "bg-sky-50",   bar: "bg-sky-500"   },
  success: { icon: CheckCircle2, iconColor: "text-brand-500", iconBg: "bg-brand-50", bar: "bg-brand-500" },
};

export default function AlertCard({ severity = "info", title, description, timestamp }) {
  const cfg = SEVERITY[severity] ?? SEVERITY.info;
  const Icon = cfg.icon;

  return (
    <div className="relative pl-3">
      {/* Barra lateral */}
      <div className={`absolute left-0 top-1 bottom-1 w-1 rounded-full ${cfg.bar}`} aria-hidden />

      <div className="flex items-start gap-3 py-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg} ${cfg.iconColor}`}>
          <Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
            {timestamp && <span className="text-xs text-slate-400 shrink-0">{timestamp}</span>}
          </div>
          {description && (
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
