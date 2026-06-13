// Wrapper para gráficos com título e ação opcional.
// `height` define o alvo desktop (default 240). Em mobile reduz para ~220px,
// em tablet/sm para ~260px ou o `height` solicitado, o que for menor.

export default function ChartCard({ title, subtitle, action, children, height = 240, className = "" }) {
  const mobileH = Math.min(220, height);
  const tabletH = Math.min(260, height);
  return (
    <div className={`card p-5 flex flex-col ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title    && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div
        className="w-full"
        style={{ "--h-mobile": `${mobileH}px`, "--h-tablet": `${tabletH}px`, "--h-desk": `${height}px` }}
      >
        <div className="h-[var(--h-mobile)] sm:h-[var(--h-tablet)] lg:h-[var(--h-desk)]">
          {children}
        </div>
      </div>
    </div>
  );
}
