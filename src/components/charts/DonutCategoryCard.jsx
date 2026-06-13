import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatEUR } from "../../lib/format";

// Donut com total ao centro e legenda lateral com valores e percentagens.
// Reutilizado em Receitas, Despesas e em qualquer tela com distribuição por categoria.
// Props:
//   - title          (string)
//   - data           (array de { name, value, color })
//   - centerLabel    (string opcional, default: "Total")
//   - action         (ReactNode opcional, ex: seletor de período)
//   - valueFormatter (fn opcional para formatar valores na legenda; default: formatEUR)
//   - centerValue    (string opcional para mostrar no centro; default: total formatado em €)

export default function DonutCategoryCard({
  title,
  data = [],
  centerLabel = "Total",
  action,
  valueFormatter,
  centerValue,
}) {
  const total  = data.reduce((acc, d) => acc + d.value, 0);
  const fmt    = valueFormatter ?? formatEUR;
  const center = centerValue ?? formatEUR(total);

  return (
    <div className="card p-5 h-full">
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-2">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      <div className="flex items-center gap-6 mt-2">
        {/* Donut */}
        <div className="relative w-[180px] h-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Total ao centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-base font-semibold text-slate-900 leading-tight">
              {center}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">{centerLabel}</div>
          </div>
        </div>

        {/* Legenda lateral */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {data.map((d, i) => {
            const pct = total > 0 ? (d.value / total) * 100 : 0;
            return (
              <div key={i} className="flex items-start gap-2.5">
                <span
                  className="h-3 w-3 rounded-sm shrink-0 mt-1 ring-1 ring-black/5"
                  style={{ backgroundColor: d.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-slate-800 leading-snug">
                    {d.name}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="ml-auto text-sm font-semibold text-slate-900 shrink-0 tabular-nums">
                    {fmt(d.value)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
