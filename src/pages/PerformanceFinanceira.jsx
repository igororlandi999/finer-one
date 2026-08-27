import { useState, useMemo } from "react";
import { Download, Lightbulb, FileText } from "lucide-react";
import {
  ComposedChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

import PageHeader  from "../layouts/PageHeader";
import MetricCard  from "../components/ui/MetricCard";
import ChartCard   from "../components/charts/ChartCard";

import {
  performanceMetrics, profitLossRows, balanceSheetRows, cashflowStatementRows,
} from "../data/mockData";
/* UM SÓ FORMATADOR MONETÁRIO NESTA PÁGINA.
 * Até 24/08/2026 havia dois: `formatMoney` (moeda da empresa) para os números reais e
 * `formatEUR` (pt-PT fixo) para as tabelas demonstrativas de P&L e balanço. A intenção
 * era razoável — a fixture é portuguesa — mas o resultado no ecrã não era: a mesma
 * página mostrava R$ nos cards de cima e € nas tabelas de baixo, e o utilizador não tem
 * como saber que a fronteira entre as duas moedas é a fronteira entre dado real e
 * demonstração. O selo Demo é que diz o que é demonstração; a moeda diz a moeda. */
import { formatMoney, formatMoneyCompact, formatMoneyOrDash } from "../lib/currency";
import { useFinerData } from "../context/FinerDataContext";
import DemoTag from "../components/ui/DemoTag";
import StatusBadge from "../components/ui/StatusBadge";
import {
  buildMonthlyPerformance,
  buildPerformanceMetrics,
  buildExpenseCategoryPerformance,
  buildPerformanceInsights,
  buildAvailableWindows,
  monthLongLabel,
} from "../utils/performanceCalculations";
import { resolvePerformanceView, buildProfitabilityBlock } from "../utils/performanceView";
// Cobertura declarada do histórico (a mesma que o motor usa). Não é uma segunda
// fonte de verdade: é A fonte, lida no único sítio onde vive.
import { useCompany } from "../auth/CompanyContext";

// Demonstracoes contabilisticas: sem base real (sem plano de contas nem balanco).
const TABS = [
  { id: "pl",      label: "P&L"      },
  { id: "balance", label: "Balanço"  },
  { id: "cf",      label: "Cashflow" },
];

function FinancialTable({ rows, header1 = "Período Atual", header2 = "Período Anterior", compact = false }) {
  const padX  = compact ? "px-3" : "px-5";
  const padY  = compact ? "py-2" : "py-2.5";
  const txt   = compact ? "text-xs" : "text-sm";
  const hdrTx = compact ? "text-[10px]" : "text-[11px]";
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/50">
            <th className={`${padX} py-2.5 text-left  ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Rubrica</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>{header1}</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>{header2}</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Variação</th>
            <th className={`${padX} py-2.5 text-right ${hdrTx} font-semibold uppercase tracking-wider text-slate-500`}>Var. %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const positive = r.varAbs > 0;
            const negative = r.varAbs < 0;
            return (
              <tr
                key={i}
                className={`border-b border-slate-100 ${
                  r.header   ? "bg-slate-50/70 font-semibold" :
                  r.bold     ? "font-semibold" :
                  r.highlight? "bg-brand-50/30 font-semibold" : ""
                }`}
              >
                <td className={`${padX} ${padY} ${txt} ${
                  r.header   ? "text-slate-900 uppercase tracking-wider text-[11px]" :
                  r.highlight? "text-brand-700" :
                  r.indent && r.sub ? "text-slate-500 pl-12" :
                  r.indent   ? "text-slate-700 pl-9" :
                  "text-slate-800"
                }`}>
                  {r.rubrica}
                </td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums`}>{formatMoney(r.atual)}</td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums text-slate-600`}>{formatMoney(r.anterior)}</td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums ${
                  positive ? "text-brand-700" : negative ? "text-rose-600" : "text-slate-500"
                }`}>
                  {r.varAbs === 0 ? "—" : formatMoney(r.varAbs)}
                </td>
                <td className={`${padX} ${padY} ${txt} text-right tabular-nums ${
                  r.varPct == null ? "text-slate-300" :
                  positive ? "text-brand-700" : negative ? "text-rose-600" : "text-slate-500"
                }`}>
                  {r.varPct == null ? "—" : `${r.varPct > 0 ? "+" : ""}${r.varPct}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EvolutionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg space-y-0.5">
      <div className="text-slate-300 mb-1">{label}</div>
      <div>Faturação: <span className="font-semibold">{formatMoney(p.receitas)}</span></div>
      {p.despesas != null && <div>Títulos registados: <span className="font-semibold">{formatMoney(p.despesas)}</span></div>}
      {p.despesas == null && <div className="text-slate-400">Títulos: sem cobertura neste mês</div>}
    </div>
  );
}

export default function PerformanceFinanceira() {
  const [tab, setTab] = useState("pl");
  const [meses, setMeses] = useState(12);
  const { sales, source } = useFinerData();
  const { company: empresaAtiva } = useCompany();

  // Fontes reais: pedidos (receitas) e sales.despesas.list (contas a pagar, mesma
  // regra temporal da pagina Despesas: dataEmissao com fallback a vencimento).
  // Distinguimos FONTE disponível de EXISTÊNCIA de movimentos: uma lista real vazia
  // é um estado vazio real, nunca um motivo para cair no mock.
  const orders = sales?.orders ?? null;
  const despesasList = sales?.despesas?.list ?? null;
  const temFonteReceitas = Array.isArray(orders);
  const temMovimentosReceitas = temFonteReceitas && orders.length > 0;
  const temFonteDespesas = Array.isArray(despesasList);
  /* COBERTURA: a do DATASET, que já traz a confirmação humana e o veto do snapshot.
   * Ler `ACTIVE_COMPANY.historyCoverage` aqui fazia desta página um segundo leitor da
   * configuração — e, desde que a cobertura passou a poder ser confirmada dentro do
   * produto, um leitor que discordaria do motor. Sem dataset (modo demonstrativo) cai
   * na configuração, que ali continua a ser a resposta certa. */
  /* Sem dataset, a cobertura vem da EMPRESA ATIVA e não da configuração compilada.
   * `resolveCompanyProfile` só herda a cobertura configurada quando o id BATE CERTO —
   * para outra empresa devolve `null`, que o motor já lê como "indisponível". Ler
   * `ACTIVE_COMPANY.historyCoverage` aqui diria, sobre a empresa B, que os documentos
   * de despesas estão disponíveis até junho, com base no que se sabe da empresa A. */
  const coverage = sales?.coverage ?? empresaAtiva?.historyCoverage ?? null;
  /* BLOCO 2 — rentabilidade. Fonte ÚNICA: financeiro.metrics (financialMetrics).
   * A página não calcula rentabilidade: mapeia. Mês próprio, âncora própria. */
  /* `closings` vêm já apurados no dataset (os mesmos que alimentam alertas e Resumo).
   * A Performance não recalcula o motor de fecho: só usa o fecho do SEU mês para
   * explicar por que razão um indicador está bloqueado. */
  const rentabilidade = buildProfitabilityBlock({
    source,
    financeiro: sales?.financeiro ?? null,
    closings: sales?.closings ?? null,
  });

  const serieCompleta = useMemo(
    () => (temMovimentosReceitas ? buildMonthlyPerformance({ orders, despesasList, coverage }) : []),
    [orders, despesasList, temMovimentosReceitas, coverage]
  );
  const metrics = useMemo(
    () => (temMovimentosReceitas ? buildPerformanceMetrics({ orders, despesasList, coverage }) : null),
    [orders, despesasList, temMovimentosReceitas, coverage]
  );
  const categorias = useMemo(
    () => buildExpenseCategoryPerformance(despesasList, metrics?.mesRef),
    [despesasList, metrics?.mesRef]
  );
  const insights = useMemo(
    () => buildPerformanceInsights(metrics, categorias.categorias),
    [metrics, categorias]
  );

  /* Modo da página decidido num único sítio (performanceView), para a condição de
   * Demo não voltar a viver espalhada por seis ternários. Em modo API nunca há
   * conteúdo demonstrativo; fora dele, o conteúdo demonstrativo é sempre marcado. */
  const vista = resolvePerformanceView({
    source, temFonteReceitas, temMovimentosReceitas, temFonteDespesas,
    temMetrics: !!metrics,
  });
  const { real, vazioReal } = vista;

  const mesesDisponiveis = serieCompleta.length;
  const opcoesMeses = buildAvailableWindows(mesesDisponiveis);
  // A janela selecionada tem de existir sempre nas opções (histórico pode mudar).
  const janela = opcoesMeses.includes(meses)
    ? meses
    : (opcoesMeses.length ? opcoesMeses[opcoesMeses.length - 1] : meses);
  const serie = serieCompleta.slice(-janela);

  const subtituloSerie = serie.length
    ? (serie.length === 1
        ? `Dados disponíveis de ${monthLongLabel(serie[0].monthKey)}`
        : `Dados disponíveis de ${monthLongLabel(serie[0].monthKey)} a ${monthLongLabel(serie[serie.length - 1].monthKey)}`)
    : "Sem dados disponíveis";

  const semAnterior = "Sem período anterior comparável";
  // Mês em curso: não há comparação possível com um mês completo.
  const semComparacao = metrics && metrics.mesEmCurso
    ? "Mês em curso: sem comparação com o mês anterior"
    : semAnterior;

  return (
    <>
      <PageHeader
        title="Performance Financeira"
        subtitle="Atividade operacional e rentabilidade, a partir dos dados reais da Overcel."
        actions={
          <>
            {real ? (
              <select
                value={janela}
                onChange={(e) => setMeses(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
              >
                {opcoesMeses.map((n) => (
                  <option key={n} value={n}>{n === 1 ? "1 mês" : `Últimos ${n} meses`}</option>
                ))}
              </select>
            ) : (
              <select disabled className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-400 bg-slate-50 cursor-not-allowed">
                <option>Sem dados reais</option>
              </select>
            )}
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><FileText size={14} />Extrair PDF</button>
          </>
        }
      />

      {real ? (
        <>
          <h2 className="text-sm font-semibold text-slate-800">Atividade operacional</h2>
          <p className="text-xs text-slate-500 mb-2">Faturação e títulos registados · Mês de referência: {metrics.mesRefLabel}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {/* Só grandezas operacionais. "Resultado" e "Margem" saíram: eram
                faturação − títulos a pagar e o seu rácio. Rentabilidade é o bloco DRE. */}
            <MetricCard
              dense label="Faturação" value={formatMoney(metrics.receitas)}
              delta={metrics.receitasDelta} deltaLabel="vs mês anterior"
              helper={metrics.receitasDelta == null ? semComparacao : "Pedidos faturáveis, por data do pedido"}
              tone="success"
            />
            {temFonteDespesas ? (
              <MetricCard
                dense label="Títulos registados" value={formatMoneyOrDash(metrics.despesas)}
                delta={metrics.despesasDelta} deltaLabel="vs mês anterior"
                helper={metrics.despesasDelta == null ? semComparacao : "Contas a pagar, por data de emissão ou vencimento quando indisponível"}
              />
            ) : (
              <div className="card p-4">
                <span className="label-uppercase">Títulos registados</span>
                <p className="mt-2 text-sm font-semibold text-slate-700">Indisponível</p>
                <p className="text-xs text-slate-500 mt-1">Faltam dados de contas a pagar.</p>
              </div>
            )}
          </div>
        </>
      ) : vazioReal ? (
        // Fonte real disponível mas sem movimentos apresentáveis: estado vazio real.
        // Nunca cair para EBITDA/ativo/solvabilidade demonstrativos neste caso.
        <div className="card p-8 mb-6 text-center">
          <p className="text-sm font-medium text-slate-700">
            Não existem movimentos de receitas disponíveis para apresentar a performance financeira.
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Assim que existirem pedidos faturáveis, os indicadores são calculados automaticamente.
          </p>
        </div>
      ) : vista.fonteIndisponivel ? (
        /* Modo API sem fonte de receitas. Antes caía nos cinco KPIs demonstrativos:
         * o utilizador via lucro líquido, EBITDA e solvabilidade inventados como se
         * fossem da Overcel. Ausência de fonte diz-se, não se preenche. */
        <div className="card p-8 mb-6 text-center">
          <p className="text-sm font-medium text-slate-700">
            Dados de receitas indisponíveis.
          </p>
          <p className="text-xs text-slate-500 mt-1.5">
            Não foi possível obter os pedidos, pelo que os indicadores não podem ser calculados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          <MetricCard dense demo={vista.mostrarDemoTag} label="Lucro Líquido"  value={formatMoney(performanceMetrics.lucroLiquido)}  delta={performanceMetrics.lucroLiquidoDelta} deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={vista.mostrarDemoTag} label="Margem Líquida" value={`${performanceMetrics.margemLiquida}%`}      delta={performanceMetrics.margemLiquidaDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={vista.mostrarDemoTag} label="EBITDA"          value={formatMoney(performanceMetrics.ebitda)}        delta={performanceMetrics.ebitdaDelta} deltaLabel="vs ano anterior" tone="success" />
          <MetricCard dense demo={vista.mostrarDemoTag} label="Ativo Total"     value={formatMoney(performanceMetrics.ativoTotal)}    delta={performanceMetrics.ativoTotalDelta} deltaLabel="vs ano anterior" />
          <MetricCard dense demo={vista.mostrarDemoTag} label="Solvabilidade"   value={`${performanceMetrics.solvabilidade}%`}      delta={performanceMetrics.solvabilidadeDelta} deltaSuffix=" p.p." deltaLabel="vs ano anterior" tone="success" />
        </div>
      )}

      {/* ── BLOCO 2 — RENTABILIDADE (DRE) ─────────────────────────
          Só em modo API. Valores e disponibilidades vêm inteiros de financialMetrics;
          null nunca vira 0. Com o CMV automático ainda por resolver, é esperado que
          lucro bruto, EBITDA e resultado líquido apareçam como "—". */}
      {vista.modoApi && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-800">Rentabilidade (DRE)</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-2">
            {/* "fechado" está deliberadamente FORA desta frase. A Finer One não tem
                ação formal de encerramento contabilístico — closingSummaryView já o
                declara e recusa a palavra pela mesma razão. Dizer "sem mês fechado"
                afirmava a existência de um fecho que o produto não faz, e ainda
                colidia com o vocabulário da âncora ("Sem mês completo"). */}
            {rentabilidade.disponivel
              ? `Regime de competência · Mês de referência: ${monthLongLabel(rentabilidade.monthKey)}`
              : "Nenhum período tem dados suficientes para apurar rentabilidade"}
          </p>

          {/* RESSALVA DA ÂNCORA. Só existe quando o mês NÃO é elegível — ou seja,
              quando "Mês de referência" acima descreve um recurso e não um fecho.
              Sem ela, um mês com EBITDA `unavailable` aparecia sob o mesmo rótulo
              tranquilo de um mês inteiro. */}
          {rentabilidade.anchorNotice && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2">
              <StatusBadge variant="info">{rentabilidade.anchorNotice.badge}</StatusBadge>
              <span className="text-xs text-sky-900">
                {rentabilidade.anchorNotice.nota}
                {rentabilidade.anchorNotice.itens.length > 0 && (
                  <span className="text-sky-800"> {rentabilidade.anchorNotice.itens.join(" · ")}.</span>
                )}
              </span>
            </div>
          )}
          {!rentabilidade.anchorNotice && <div className="mb-4" />}
          {rentabilidade.disponivel ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {rentabilidade.rows.map((r) => {
                // `nota` já vem resolvida pelo view-model: genérica quando não há
                // evidência, específica quando o fecho do mês sabe o que falta.
                const legenda = r.nota;
                const ausente = r.value == null;
                return (
                  <div key={r.key} className="rounded-lg border border-slate-200 p-3">
                    <span className="label-uppercase">{r.label}</span>
                    <p className={`mt-1.5 text-[17px] font-semibold tabular-nums ${ausente ? "text-slate-400" : "text-slate-900"}`}>
                      {ausente
                        ? "\u2014"
                        : r.kind === "pct"
                          ? `${String(r.value).replace(".", ",")}%`
                          : formatMoneyOrDash(r.value)}
                    </p>
                    {legenda && (
                      <p
                        title={r.detalhe || undefined}
                        className={`text-xs mt-0.5 ${ausente ? "text-amber-600" : "text-slate-500"}`}
                      >
                        {legenda}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              Rentabilidade indisponível: não existe um mês financeiro apurado.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          <ChartCard
            title={<span className="inline-flex items-center gap-1.5">Atividade mensal{vista.mostrarDemoTag && <DemoTag />}</span>}
            subtitle={real ? subtituloSerie : vazioReal ? "Sem movimentos de receitas" : "Sem dados reais disponíveis"}
            height={300}
          >
            {real && serie.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatMoneyCompact(v)} width={56} />
                  <Tooltip content={<EvolutionTooltip />} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  {/* Só as duas grandezas medidas. Nenhuma linha derivada: a antiga
                      linha de "Resultado" era a subtração das duas. */}
                  <Bar dataKey="receitas" name="Faturação" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  {temFonteDespesas && <Bar dataKey="despesas" name="Títulos registados" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={26} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-sm text-slate-500 px-4">
                Não existem dados suficientes para apresentar a atividade mensal.
              </div>
            )}
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              Títulos por categoria{vista.mostrarDemoTag && <DemoTag />}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              {real ? `Mês de referência: ${metrics.mesRefLabel}` : vazioReal ? "Sem movimentos no período" : "Sem dados reais disponíveis"}
            </p>
            {real && categorias.categorias.length > 0 ? (
              <>
                <div className="space-y-2.5">
                  {categorias.categorias.slice(0, 6).map((c) => (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-700 truncate">{c.name}</span>
                        <span className="font-semibold text-slate-900 tabular-nums shrink-0 ml-3">{formatMoney(c.value)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums w-11 text-right">
                          {String(c.pct).replace(".", ",")}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {categorias.semCategoria && (
                  <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                    Sem categoria: {formatMoney(categorias.semCategoria.value)} ({String(categorias.semCategoria.pct).replace(".", ",")}% dos títulos do mês)
                  </p>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                {real
                  ? (temFonteDespesas
                      ? "Não existem títulos registados no mês de referência."
                      : "Dados de contas a pagar indisponíveis.")
                  : vazioReal
                    ? "Não existem movimentos para apresentar."
                    : "Sem dados reais disponíveis."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* DEMONSTRAÇÕES CONTABILÍSTICAS.
          Antes as três tabelas renderizavam SEMPRE — inclusive em modo API, com um
          P&L fabricado de 1.250.000 € de receitas ao lado dos números reais da
          Overcel. A nota explicava, mas os números continuavam no ecrã. Em modo API
          fica só a explicação; as tabelas demonstrativas ficam no modo mock. */}
      <div className="card overflow-hidden mb-6">
        {vista.mostrarDemonstracoes ? (
          <>
            <div className="border-b border-slate-200 px-5">
              <div className="flex items-center gap-1 -mb-px overflow-x-auto">
                {TABS.map((t) => {
                  const active = t.id === tab;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                        active ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
                <span className="ml-auto flex items-center py-3"><DemoTag /></span>
              </div>
            </div>
            {tab === "pl"      && <FinancialTable rows={profitLossRows} />}
            {tab === "balance" && <FinancialTable rows={balanceSheetRows} />}
            {tab === "cf"      && <FinancialTable rows={cashflowStatementRows} />}
          </>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700">
              Demonstrações contabilísticas ainda não disponíveis
            </p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-xl mx-auto">
              P&amp;L, Balanço e Cashflow exigem plano de contas, balanço e depreciações,
              que não existem nas fontes atuais.
            </p>
          </div>
        )}
      </div>

      <div className="card p-5 bg-gradient-to-br from-brand-50/60 to-white border-brand-100">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500 text-white shrink-0">
            <Lightbulb size={20} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              Análise rápida{vista.mostrarDemoTag && <DemoTag />}
            </h3>
            {real && insights.length > 0 ? (
              <ul className="text-sm text-slate-700 leading-relaxed space-y-1 list-disc pl-4">
                {insights.map((frase, i) => <li key={i}>{frase}</li>)}
              </ul>
            ) : real || vazioReal ? (
              <p className="text-sm text-slate-600">
                {vazioReal
                  ? "Não existem movimentos suficientes para gerar uma análise."
                  : "Ainda não existem variações suficientes para gerar uma análise."}
              </p>
            ) : vista.permiteTextoDemonstrativo ? (
              // Texto demonstrativo (fixture). Nunca em modo API: os números são inventados.
              <p className="text-sm text-slate-700 leading-relaxed">
                O lucro líquido cresceu 13,7% face ao período homólogo, com melhoria da margem líquida (+1,8 p.p.).
                A posição financeira mantém-se saudável, com rácio de solvabilidade de 53,3% e aumento de caixa de {formatMoney(50500)}.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Sem dados suficientes para gerar uma análise.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}