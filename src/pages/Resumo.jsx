import { useState, useMemo } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, BarChart3,
  Plus, Upload, Stethoscope, ArrowRight, Building2, FileText, Send,
  CalendarCheck,
} from "lucide-react";

import PageHeader   from "../layouts/PageHeader";
import MetricCard   from "../components/ui/MetricCard";
import DemoTag      from "../components/ui/DemoTag";
import AlertCard    from "../components/ui/AlertCard";
import ChartCard    from "../components/charts/ChartCard";
import StatusBadge  from "../components/ui/StatusBadge";

import { usePlan }     from "../context/PlanContext";
import { SCREENS }     from "../config/planConfig";
import {
  currentUser, diagnostic,
  cashflowForecast, overdueInvoices,
  recentDocuments, bankSync, chatSuggestions,
  monthMetrics as mockMonthMetrics,
  alerts       as mockAlerts,
} from "../data/mockData";
import { formatMoney, formatMoneyCompact, formatMoneyOrDash } from "../lib/currency";
import { useFinerData } from "../context/FinerDataContext";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../auth/CompanyContext";
import { buildCashflowForecast, hasCashflowSource } from "../utils/cashflowForecast";
import { SUPPORTED_QUESTIONS } from "../utils/chatEngine";
import { monthLongLabel } from "../utils/performanceCalculations";
import { resolveClosingSummary, CLOSING_TONE } from "../utils/closingSummaryView";
import { buildAnchorNotice } from "../utils/performanceView";

// ── Tooltip do gráfico de cashflow ──────────────────────────
// valueLabel: "Saldo" no gráfico mock (semântica original); "Variação líquida
// acumulada" com dados reais (base zero, sem saldo bancário).
function CashflowTooltip({ active, payload, label, valueLabel = "Saldo" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">{valueLabel} {formatMoney(payload[0].value)}</div>
    </div>
  );
}

// ── Bloco de destaque do Diagnóstico ────────────────────────
// Frase-síntese derivada do estado do diagnóstico (real ou mock) — sem números inventados.
const FRASE_ESTADO = {
  "Saudável": "A empresa está financeiramente saudável, sem riscos relevantes identificados.",
  "Atenção":  "A empresa está estável, mas existem sinais que pedem atenção.",
  "Crítico":  "A empresa apresenta sinais críticos que pedem ação imediata.",
};

function DiagnosticHighlight({ onOpen, diag, demo }) {
  const variant =
    diag.estado === "Saudável" ? "saudavel" :
    diag.estado === "Atenção"  ? "atencao"  : "critico";

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-finerblue-deep to-finerblue text-white">
      <div className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
        {/* Ícone */}
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 border border-white/15 shrink-0">
          <Stethoscope size={26} className="text-brand-300" />
        </div>

        {/* Texto */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-brand-300">
              Diagnóstico Financeiro
            </span>
            {demo && <DemoTag />}
            <StatusBadge variant={variant}>{diag.estado}</StatusBadge>
          </div>
          <h3 className="text-lg font-semibold leading-snug">
            {FRASE_ESTADO[diag.estado] ?? FRASE_ESTADO["Atenção"]}
          </h3>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">
            {/* Real: só mostra valor se o motor o quantificou (contas vencidas).
                Mock: preserva impactoFinanceiro (o bloco já leva o selo Demo acima). */}
            {diag.impactIsQuantified === true && typeof diag.impactAmount === "number" ? (
              <>Impacto financeiro identificado de{" "}
              <strong className="text-white">{formatMoney(diag.impactAmount)}</strong>.{" "}</>
            ) : diag.impactIsQuantified === undefined && typeof diag.impactoFinanceiro === "number" ? (
              <>Impacto financeiro identificado de{" "}
              <strong className="text-white">{formatMoney(diag.impactoFinanceiro)}</strong>.{" "}</>
            ) : null}
            Prioridade: {diag.prioridadeMaxima.toLowerCase()}.
          </p>
        </div>

        {/* Score + CTA */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center">
            <div className="text-3xl font-bold leading-none">
              {diag.score}
              <span className="text-base text-slate-400 font-medium">/100</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Finer Score</div>
          </div>
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium transition-colors"
          >
            Ver diagnóstico
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fecho mensal do mês anterior ────────────────────────────
/* Banner horizontal compacto, deliberadamente mais leve que o Diagnóstico: informa
 * sem competir com ele nem empurrar os KPIs para fora da primeira dobra.
 *
 * Toda a decisão (que mês, que estado, que texto, se há ação) vem de
 * resolveClosingSummary. Aqui só se escolhe a cor a partir do TOM já decidido e se
 * desenha — a página não conhece CLOSING_STATUS nem missingItems.
 *
 * Mobile: empilha (flex-col) e o botão passa a largura total; a partir de sm volta a
 * ser uma linha só, com o CTA à direita. */
const TONE_STYLES = {
  [CLOSING_TONE.POSITIVO]:    { badge: "success", icone: "bg-brand-50 text-brand-600" },
  [CLOSING_TONE.ATENCAO]:     { badge: "warning", icone: "bg-amber-50 text-amber-600" },
  [CLOSING_TONE.INFORMATIVO]: { badge: "info",    icone: "bg-sky-50 text-sky-600" },
  [CLOSING_TONE.NEUTRO]:      { badge: "neutral", icone: "bg-slate-100 text-slate-500" },
};

function FechoMensalCard({ fecho, onVerPendencias }) {
  const estilo = TONE_STYLES[fecho.tone] ?? TONE_STYLES[CLOSING_TONE.NEUTRO];

  return (
    <div className="card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${estilo.icone}`}>
          <CalendarCheck size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label-uppercase">Fecho mensal</span>
            <StatusBadge variant={estilo.badge}>{fecho.badge}</StatusBadge>
          </div>
          <p className="text-sm font-semibold text-slate-800 mt-1">{fecho.estado}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {fecho.detalhe}
            {fecho.itens.length > 0 && (
              <span className="text-slate-600"> {fecho.itens.join(" · ")}.</span>
            )}
          </p>
        </div>

        {/* CTA só existe quando há mesmo o que fazer — ver resolveClosingSummary. */}
        {fecho.cta && (
          <button
            onClick={onVerPendencias}
            className="btn-secondary justify-center w-full sm:w-auto shrink-0"
          >
            {fecho.cta.label}
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────
export default function Resumo() {
  const { navigateTo } = usePlan();

  // Fontes reais no Resumo: receita/faturação e alertas (de vendas), despesas/resultado
  // (contas a pagar) e faturas em atraso (contas a receber). O restante fica mock + Demo.
  const { sales, source } = useFinerData();

  /* SUGESTÕES DE PERGUNTA — as que o Chat SABE responder, não as do mock.
   *
   * O cartão "Pergunte à Finer" mostrava três perguntas fixas de `mockData`. Duas delas
   * o Chat recusa por desenho ("previsão de saldo para os próximos 3 meses" exige Open
   * Banking; "posso suportar uma despesa..." é tesouraria prospetiva) e a terceira
   * trazia "4.500 €" a uma empresa cuja moeda é o real. Ou seja: em dados reais, o
   * produto convidava o utilizador a fazer perguntas a que ia responder que não sabe
   * responder — e numa moeda que não é a dele.
   *
   * `SUPPORTED_QUESTIONS` é a lista que o próprio motor publica, e é a MESMA de que a
   * página do Chat já se serve em modo real (`ChatFinanceiro`, `isLive`). Uma só fonte:
   * uma pergunta que deixe de ser suportada desaparece dos dois sítios ao mesmo tempo.
   * Sem dados reais mantém-se o mock, que é o que o selo Demo descreve. */
  const chatSugestoes = source === "api" ? SUPPORTED_QUESTIONS.slice(0, 3) : chatSuggestions;
  const monthMetrics = { ...mockMonthMetrics, ...(sales?.resumo?.metrics ?? {}) };
  const alerts = sales?.alertas?.list ?? mockAlerts;
  // Faturas em atraso: dos recebíveis reais (títulos abertos já vencidos), senão mock.
  // Base COMPLETA (allOpenInvoices) para o total; a exibição limita a 5 linhas.
  const hasReceivables = source === "api" && !!sales?.recebiveis;
  // Camada financeira central (DRE): mesma fonte da Performance Financeira.
  const fin = sales?.financeiro ?? null;
  const fm = fin?.metrics ?? null;
  // Contas a pagar reais presentes: sem elas o card cai no mock (com selo Demo).
  const temContasPagarReais = typeof monthMetrics.contasPagar === "number";

  /* O mês das receitas está EM CURSO? Compara-se com `contasPagarMonthKey`, que o
   * serviço calcula a partir do mês civil — uma só leitura do relógio, feita lá, em vez
   * de uma segunda leitura aqui que pode cair do outro lado da meia-noite do dia 1.
   * Sem contrato real de contas a pagar não se afirma nada: `false` mantém o
   * comportamento demonstrativo intacto. */
  const receitasEmCurso = Boolean(
    monthMetrics.receitasMonthKey
    && monthMetrics.contasPagarMonthKey
    && monthMetrics.receitasMonthKey === monthMetrics.contasPagarMonthKey
  );
  // "agosto de 2026" -> "Agosto de 2026": o rótulo abre a linha do helper.
  const capitalizarMes = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
  const legendaDisp = (a) => (
    a === "unavailable" ? "Fonte indispon\u00edvel"
    : a === "partial" ? "Dados parciais"
    : a === "manual" ? "Valor manual"
    : a === "mixed" ? "Inclui valor manual"
    : null
  );

  /* Fecho do mês civil anterior. Os fechos vêm já apurados no dataset (os MESMOS que
   * originaram os alertas): a página não recalcula o motor nem infere o estado a
   * partir da lista de alertas. Sem fonte real, `sales` é null e o bloco não existe —
   * não há fecho demonstrativo, porque um fecho inventado não é ilustrativo, é falso. */
  const fechoMensal = useMemo(
    () => resolveClosingSummary({ closings: sales?.closings }),
    [sales?.closings]
  );

  /* Ressalva do mês âncora — a MESMA decisão que a Performance usa, importada em vez
   * de reescrita: duas leituras do mesmo facto divergem no dia em que uma for tocada.
   * `null` quando a âncora é elegível, que é o caso normal. */
  const anchorNotice = useMemo(
    () => buildAnchorNotice(sales?.financeiro),
    [sales?.financeiro]
  );

  const overdueRows = hasReceivables
    ? (sales.recebiveis.allOpenInvoices ?? sales.recebiveis.openInvoices ?? [])
        .filter((i) => i.diasAtraso > 0)
        .slice()
        .sort((a, b) => b.diasAtraso - a.diasAtraso)
    : overdueInvoices;
  // Total calculado sobre TODA a lista real; a UI mostra no máximo as 5 mais atrasadas.
  const overdueTotal = overdueRows.reduce((acc, i) => acc + i.valor, 0);
  const overdueVisiveis = overdueRows.slice(0, 5);

  // Cashflow previsto real: variação líquida (base zero, sem saldo bancário) a partir
  // dos títulos abertos. Seletor 30/60 via estado local, sem nova chamada de API.
  const [cashflowDias, setCashflowDias] = useState(30);
  const cashflowSource = hasCashflowSource({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores });
  const cashflow = useMemo(
    () => buildCashflowForecast({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores, dias: cashflowDias }),
    [sales?.recebiveis, sales?.fornecedores, cashflowDias]
  );
  // Série e métrica de destaque conforme a fonte:
  //  - com fonte real: série real (dataKey "saldo" = variação líquida acumulada);
  //  - sem fonte real: mantém o gráfico mock + Demo, sem mascarar.
  const cashflowData = cashflowSource ? cashflow.serie : cashflowForecast;
  const cashflowDestaque = cashflowSource ? cashflow.variacaoLiquida : mockMonthMetrics.cashflowPrevisto30;

  const { user, requiresAuth } = useAuth();
  const { company } = useCompany();
  const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0];
  const saudacao = requiresAuth
    ? (primeiroNome(user?.name) || user?.email || "olá")
    : primeiroNome(currentUser.name);

  return (
    <>
      {/* ─── SAUDAÇÃO E NOME DA EMPRESA (fundação SaaS) ───────────────────────────────
          Ambos vinham do `mockData`: a página dizia "Bom dia, João" e "a saúde
          financeira da Overcel" a QUALQUER pessoa e para QUALQUER empresa. Enquanto
          houve uma empresa e nenhum login, era uma etiqueta certa por acidente. Com
          sessão, era o nome errado a uma pessoa real.

          `saudacao` cai no nome do mockData apenas quando não há autenticação — que é
          o modo atual de desenvolvimento. Ver `Sidebar.jsx`, mesma decisão. */}
      <PageHeader
        title={`Bom dia, ${saudacao}.`}
        subtitle={`Eis a saúde financeira da ${company?.name ?? "sua empresa"} hoje.`}
        actions={
          <>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={15} />Novo registo</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={15} />Enviar documento</button>
          </>
        }
      />

      {/* Diagnóstico em destaque */}
      <div className="mb-6">
        <DiagnosticHighlight
          onOpen={() => navigateTo(SCREENS.DIAGNOSTICO)}
          diag={sales?.diagnostico ?? diagnostic}
          demo={source === "api" && !sales?.diagnostico}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {source === "api" ? (
          <MetricCard
            label="Saldo bancário"
            value="—"
            icon={Wallet}
            iconBg="bg-slate-100 text-slate-400"
            helper="Integração bancária não configurada"
          />
        ) : (
          <MetricCard
            label="Saldo Disponível"
            value={formatMoney(monthMetrics.saldoDisponivel)}
            icon={Wallet}
            iconBg="bg-brand-50 text-brand-600"
            helper={`Atualizado ${monthMetrics.lastSync}`}
          />
        )}
        {/* RECEITAS — O MÊS TEM DE SER DITO, E A VARIAÇÃO TEM DE SER COMPARÁVEL.
            Este card mostrava um valor sem mês e uma variação "vs mês anterior" ao lado
            de dois cards que nomeiam o seu período — e o mês deste é um TERCEIRO: o
            último com pedidos, que não é o mês civil das contas a pagar nem o mês âncora
            da DRE. Quem lesse os três não tinha como o descobrir.

            Pior do que isso: a variação era `monthOverMonthGrowth(orders)`, que compara
            o último mês COM PEDIDOS com o anterior. Estando esse mês em curso, comparava
            25 dias com 31 — e o resultado aparecia no mesmo ecrã que o alerta "a
            faturação caiu X%", que o motor de alertas calcula sobre o par ancorado e
            comparável. Duas frases "vs mês anterior", sobre meses diferentes, a dizer o
            contrário uma da outra.

            A regra aplicada aqui já existia em dois sítios: o card das contas a pagar ao
            lado dispensa o delta pela mesma razão, e o motor de alertas recusa-se a
            afirmar queda ou subida sobre um mês em curso. Mês em curso => valor e mês,
            sem variação. */}
        <MetricCard
          label="Receitas (Mês)"
          value={formatMoney(monthMetrics.receitas)}
          delta={receitasEmCurso ? undefined : monthMetrics.receitasDelta}
          icon={TrendingUp}
          iconBg="bg-brand-50 text-brand-600"
          helper={monthMetrics.receitasMonthKey
            ? `${capitalizarMes(monthLongLabel(monthMetrics.receitasMonthKey))}${receitasEmCurso ? " · mês em curso" : ""}`
            : undefined}
        />
        {/* TESOURARIA, não DRE: títulos que VENCEM no mês civil corrente. Responde a
            "quanto tenho de pagar este mês", não a "qual foi a despesa operacional".
            Sem delta com dados reais: o mês em curso não se compara com um mês
            completo. O modo Demo mantém o delta do mock, que é ilustrativo. */}
        <MetricCard
          label="Contas a pagar este mês"
          value={formatMoney(monthMetrics.contasPagar ?? monthMetrics.despesas)}
          delta={temContasPagarReais ? undefined : monthMetrics.despesasDelta}
          icon={TrendingDown}
          iconBg="bg-rose-50 text-rose-500"
          helper={temContasPagarReais ? `Vencimentos de ${monthLongLabel(monthMetrics.contasPagarMonthKey)}` : undefined}
          demo={source === "api" && !sales?.despesas}
        />
        {/* RESULTADO VEM SÓ DA DRE — ou não vem.
            Até 24/08/2026 este card caía em `monthMetrics.resultado` sempre que a DRE
            não tinha âncora, e esse campo era `receita − contas a pagar` calculado
            sobre dados REAIS: a métrica proibida do projeto, rotulada "Resultado",
            pintada de verde e sem selo Demo (o selo só aparecia quando NÃO havia
            contas a pagar — ou seja, nunca no caso em que o número era falso).
            Sem DRE, o card mostra um travessão e diz porquê. O modo demonstrativo
            continua a mostrar o valor do mock, que é o que a demonstração é. */}
        <MetricCard
          label={fm ? "Receita líquida (DRE)" : "Resultado (Mês)"}
          value={fm ? formatMoneyOrDash(fm.revenue.net)
                    : (source === "api" ? "—" : formatMoney(monthMetrics.resultado))}
          delta={(fm || source === "api") ? undefined : monthMetrics.resultadoDelta}
          helper={fm
            ? (legendaDisp(fm.revenue.netAvailability) || `Mês de referência: ${monthLongLabel(fin.monthKey)}`)
            : (source === "api" ? "Sem DRE apurada para o mês de referência" : undefined)}
          icon={BarChart3}
          iconBg="bg-sky-50 text-sky-600"
          /* Verde é uma afirmação sobre o número. Um travessão não a merece. */
          tone={fm || source !== "api" ? "success" : undefined}
        />
      </div>

      {/* Fecho mensal — logo abaixo dos KPIs: é contexto sobre a fiabilidade dos
          números acima, e por isso vem antes da leitura detalhada da DRE. */}
      {fechoMensal && (
        <div className="mb-6">
          <FechoMensalCard
            fecho={fechoMensal}
            onVerPendencias={() => navigateTo(SCREENS.ALERTAS)}
          />
        </div>
      )}

      {fm && (
        <div className="card p-4 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">Rentabilidade (DRE)</h3>
            <span className="text-xs text-slate-500">
              Mês de referência: {monthLongLabel(fin.monthKey)}{fin.emCurso ? ` \u00b7 ${monthLongLabel(fin.emCurso.monthKey)} em andamento` : ""}
            </span>
          </div>

          {/* RESSALVA DA ÂNCORA — decidida em performanceView, não aqui. Só aparece
              quando o mês acima é um RECURSO e não um fecho: sem ela, um mês com
              EBITDA `unavailable` mostrava-se com o mesmo ar de definitivo que um mês
              inteiro. Ver a matriz em src/services/financialAnchor.test.js. */}
          {anchorNotice && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2">
              <StatusBadge variant="info">{anchorNotice.badge}</StatusBadge>
              <span className="text-xs text-sky-900">
                {anchorNotice.nota}
                {anchorNotice.itens.length > 0 && (
                  <span className="text-sky-800"> {anchorNotice.itens.join(" · ")}.</span>
                )}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { l: "Lucro bruto", v: fm.profitability.grossProfit, a: fm.profitability.availability.grossProfit },
              { l: "EBITDA", v: fm.profitability.ebitda, a: fm.profitability.availability.ebitda },
              { l: "Margem EBITDA", v: fm.profitability.ebitdaMarginPct, a: fm.profitability.availability.ebitdaMarginPct, pct: true },
              { l: "Resultado líquido", v: fm.profitability.netResult, a: fm.profitability.availability.netResult },
            ].map((k) => (
              <div key={k.l}>
                <span className="label-uppercase">{k.l}</span>
                <p className={`mt-1 text-[17px] font-semibold tabular-nums ${k.v == null ? "text-slate-400" : "text-slate-900"}`}>
                  {k.v == null ? "\u2014" : k.pct ? `${String(k.v).replace(".", ",")}%` : formatMoneyOrDash(k.v)}
                </p>
                {legendaDisp(k.a) && (
                  <p className={`text-xs mt-0.5 ${k.v == null ? "text-amber-600" : "text-slate-500"}`}>{legendaDisp(k.a)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cashflow + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Cashflow */}
        <div className="lg:col-span-7">
          <ChartCard
            title={<span className="inline-flex items-center gap-1.5">Cashflow previsto{source === "api" && !cashflowSource && <DemoTag />}</span>}
            subtitle={
              cashflowSource
                ? `Variação líquida prevista em ${cashflowDias} dias: ${formatMoney(cashflowDestaque)}`
                : `Saldo previsto em 30 dias: ${formatMoney(mockMonthMetrics.cashflowPrevisto30)}`
            }
            height={260}
            action={
              cashflowSource ? (
                <select
                  value={cashflowDias}
                  onChange={(e) => setCashflowDias(Number(e.target.value))}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white"
                >
                  <option value={30}>Próximos 30 dias</option>
                  <option value={60}>Próximos 60 dias</option>
                </select>
              ) : (
                // Modo Demo: só 30 dias (não há série mock de 60; não mostrar 30 como se fosse 60).
                <select disabled className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-400 bg-slate-50 cursor-not-allowed">
                  <option>Próximos 30 dias</option>
                </select>
              )
            }
          >
            {cashflowSource && !cashflow.temDados ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-slate-500 px-4">
                Não existem movimentos previstos para este período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashflowData} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10B981" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatMoneyCompact(v)} width={56} />
                  <Tooltip content={<CashflowTooltip valueLabel={cashflowSource ? "Variação líquida acumulada" : "Saldo"} />} />
                  <Area type="monotone" dataKey="saldo" stroke="#10B981" strokeWidth={2.4} fill="url(#cashGrad)" dot={{ r: 0 }} activeDot={{ r: 5, fill: "#10B981" }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Alertas */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Alertas importantes</h3>
              <button onClick={() => navigateTo(SCREENS.ALERTAS)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todos</button>
            </div>
            <div className="flex-1 divide-y divide-slate-100 -mx-1">
              {alerts.slice(0, 4).map((a) => (
                <AlertCard key={a.id} severity={a.severity} title={a.title} description={a.description} timestamp={a.timestamp} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Faturas + Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        {/* Faturas em atraso */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">Faturas em atraso{source === "api" && !sales?.recebiveis && <DemoTag />}</h3>
              <button onClick={() => navigateTo(SCREENS.CLIENTES_FORNECEDORES)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todas</button>
            </div>
            <div className="space-y-3">
              {overdueRows.length > 0 ? (
                overdueVisiveis.map((inv) => (
                  <div key={inv.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{inv.cliente}</p>
                      <p className="text-xs text-slate-500">{inv.numero} · Vencida há {inv.diasAtraso} dias</p>
                    </div>
                    <div className="text-sm font-semibold text-rose-600 shrink-0">{formatMoney(inv.valor)}</div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">Não existem faturas vencidas neste momento.</p>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total em atraso</span>
              <span className="text-sm font-semibold text-rose-600">
                {formatMoney(overdueTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="lg:col-span-7">
          <div className="card p-5 h-full flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Pergunte à Finer</h3>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">IA</span>
              </div>
              <button onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Abrir chat
              </button>
            </div>
            <div className="space-y-2 flex-1">
              {chatSugestoes.map((s, i) => (
                <button
                  key={i}
                  onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)}
                  className="w-full text-left text-sm text-slate-700 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/60">
              <input
                type="text"
                disabled
                title="Escreva a sua pergunta no Chat Financeiro"
                placeholder="Faça uma pergunta sobre a sua empresa..."
                className="flex-1 text-sm outline-none bg-transparent placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => navigateTo(SCREENS.CHAT_FINANCEIRO)}
                title="Abrir o Chat Financeiro"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 hover:bg-brand-600 text-white transition-colors"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Documentos + Banco */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Documentos */}
        <div className="lg:col-span-7">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">Documentos recentes{source === "api" && <DemoTag />}</h3>
              <button onClick={() => navigateTo(SCREENS.DOCUMENTOS)} className="text-xs font-medium text-brand-600 hover:text-brand-700">Ver todos</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recentDocuments.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200/60">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white border border-slate-200 shrink-0">
                    <FileText size={16} className="text-rose-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{d.nome}</p>
                    <p className="text-xs text-slate-500">{d.quando}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Integração bancária — a Finer One ainda não tem Open Banking.
            Com fonte real nunca mostramos banco ligado, saldo nem data de sincronização. */}
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Sincronização bancária</h3>
            {source === "api" ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                    <Building2 size={20} className="text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">Integração bancária não configurada</p>
                    <p className="text-xs text-slate-500">Nenhuma conta ligada</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Ligue uma conta bancária para acompanhar o saldo disponível e reconciliar movimentos.
                </p>
                <button
                  disabled
                  title="Funcionalidade disponível numa fase futura"
                  className="w-full btn-secondary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Ligar conta bancária
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                    <Building2 size={20} className="text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{bankSync.bank}</p>
                    <p className="text-xs text-slate-500">Conta •••• {bankSync.accountTail}</p>
                  </div>
                  <StatusBadge variant="success">{bankSync.status}</StatusBadge>
                </div>
                <p className="text-xs text-slate-500 mb-4">Última sincronização {bankSync.lastSync}</p>
                <button
                  onClick={() => navigateTo(SCREENS.RECEITAS)}
                  className="w-full btn-secondary justify-center"
                >
                  Ver detalhes
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}