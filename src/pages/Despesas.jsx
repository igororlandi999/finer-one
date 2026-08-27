import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  TrendingDown, Clock, AlertCircle, CreditCard, Plus, Download,
} from "lucide-react";

import PageHeader         from "../layouts/PageHeader";
import MetricCard         from "../components/ui/MetricCard";
import DemoTag           from "../components/ui/DemoTag";
import StatusBadge        from "../components/ui/StatusBadge";
import ChartCard          from "../components/charts/ChartCard";
import DonutCategoryCard  from "../components/charts/DonutCategoryCard";
import DataTable, { RowActionsButton } from "../components/ui/DataTable";

import {
  expenseMetrics as mockExpenseMetrics,
  expenseEvolution as mockExpenseEvolution,
  expenseByCategory as mockExpenseByCategory,
  expenseList as mockExpenseList,
} from "../data/mockData";
/* MOEDA DA EMPRESA ATIVA, não EUR fixo. `lib/format.formatEUR` codifica pt-PT/EUR e
 * fazia esta página inteira mostrar "336 461,88 €" a uma empresa cuja moeda é o BRL —
 * enquanto o Resumo e a Performance, já migrados, mostravam "R$ 336.461,88" para os
 * mesmos títulos. Duas moedas para os mesmos dados, no mesmo produto.
 * `lib/currency` era a migração planeada e por fazer (ver o cabeçalho desse ficheiro);
 * a troca é mecânica — mesma assinatura, mesmo tratamento de null. */
import { formatMoney, formatMoneyCompact, currencySymbol } from "../lib/currency";
import { useCompany } from "../auth/CompanyContext";
import { useFinerData } from "../context/FinerDataContext";
import { downloadCsv, csvMoney } from "../utils/csvExport";
import { monthLongLabel } from "../utils/performanceCalculations";

// ── Tooltip do gráfico de evolução ──────────────────────────
function EvTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="text-slate-300">{label}</div>
      <div className="font-semibold mt-0.5">{formatMoney(payload[0].value)}</div>
    </div>
  );
}

// ── Mapas auxiliares ────────────────────────────────────────
const STATUS_VARIANT = {
  paga:     "paga",
  pendente: "pendente",
  atraso:   "atraso",
};
const STATUS_LABEL = {
  paga:     "Paga",
  pendente: "Pendente",
  atraso:   "Em atraso",
};

/* ── MOVIMENTOS POR CLASSIFICAR ──────────────────────────────────────────────────────
 * Títulos cuja natureza contabilística o motor não reconheceu. Ficam FORA das linhas
 * operacionais da DRE, pelo que a soma dessas linhas passa a ser um mínimo conhecido —
 * e é isso que torna o mês inelegível como âncora dos KPIs.
 *
 * Não apareciam em lado nenhum: Despesas mostra o mês civil (e alguns são de meses
 * anteriores), e "Dados a completar" só mostra requisitos DO UTILIZADOR — classificar
 * não é um deles, resolve-se no ERP. Existiam apenas como um warning interno do motor.
 *
 * DISCRETA E SEM AÇÃO, de propósito:
 *   - não há edição, porque não existe fluxo seguro de classificação no produto;
 *   - não há link para o ERP, porque não há contrato de URL por título que se possa
 *     construir sem o inventar — e um link partido é pior do que nenhum;
 *   - não sugere categoria nenhuma: sugerir é classificar, e classificar é decisão de
 *     quem tem a responsabilidade contabilística.
 *
 * Mostra a categoria QUE A FONTE TRAZ ("Sem categoria", "Taxas pagas") porque é isso
 * que explica ao utilizador porque é que o título não foi reconhecido. */
function MovimentosPorClassificar({ meses }) {
  return (
    <div className="card p-5 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Movimentos por classificar</h3>
        <StatusBadge variant="info">Fora da análise</StatusBadge>
      </div>
      <p className="text-xs text-slate-500 mt-1">
        Títulos sem categoria reconhecida. Não entram nas despesas operacionais da
        demonstração de resultados, pelo que o total desse período é um mínimo conhecido.
        A categoria resolve-se no sistema de origem.
      </p>

      {meses.map((m) => (
        <div key={m.monthKey} className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-xs font-semibold text-slate-700 first-letter:uppercase">
              {monthLongLabel(m.monthKey)}
            </span>
            <span className="text-xs text-slate-500">
              {m.unclassifiedCount === 1 ? "1 título" : `${m.unclassifiedCount} títulos`}
              {" · "}{formatMoney(m.unclassifiedAmount)}
              {/* Rácio como FACTO, sem veredito: não se diz se é pouco ou muito.
                  Definir um limiar de materialidade é decisão contabilística. */}
              {m.unclassifiedRatio != null && ` · ${String(m.unclassifiedRatio).replace(".", ",")}% dos títulos do mês`}
            </span>
          </div>

          <ul className="mt-2 divide-y divide-slate-100">
            {m.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">
                    {i.description || i.supplier || "Título sem descrição"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {i.supplier && i.description ? `${i.supplier} · ` : ""}
                    {i.sourceCategory || "Sem categoria na origem"}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">
                  {formatMoney(i.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function Despesas() {
  // Lado real (contas a pagar) com fallback ao mock; sem alterar layout.
  const { sales, source } = useFinerData();
  /* A moeda do CABEÇALHO do CSV vem da empresa ATIVA, não da configuração compilada.
   * Um ficheiro exportado sai da aplicação e passa a viver sozinho: a etiqueta errada
   * numa coluna de valores é o defeito que ninguém deteta e toda a gente reencaminha. */
  const { formatting } = useCompany();
  // Exportação CSV: sempre a lista completa real (tabs/busca são só visualização).
  const canExport = source === "api" && !!sales?.despesas;
  function exportCsv() {
    if (!canExport) return;
    const rows = (sales?.despesas?.list ?? []).map((d) => [
      d.data, d.descricao, d.fornecedor, d.categoria, csvMoney(d.valor),
      d.vencimento, STATUS_LABEL[d.status] ?? d.status, d.metodo,
    ]);
    downloadCsv("despesas.csv",
      ["Data", "Descrição", "Fornecedor", "Categoria", `Valor (${currencySymbol(formatting)})`, "Vencimento", "Estado", "Método"], rows);
  }
  const despesasDemo = source === "api" && !sales?.despesas;
  const expenseMetrics    = { ...mockExpenseMetrics, ...(sales?.despesas?.metrics ?? {}) };
  const expenseEvolution  = sales?.despesas?.evolution ?? mockExpenseEvolution;
  const expenseByCategory = sales?.despesas?.byCategory ?? mockExpenseByCategory;
  /* MOVIMENTOS POR CLASSIFICAR. Sem fallback para mock: um mês por classificar é um
   * facto sobre os dados REAIS, e inventá-lo em modo demonstrativo seria mostrar um
   * problema que a empresa não tem. Ausente ou vazio => a secção não existe. */
  const porClassificar = sales?.despesas?.porClassificar ?? [];
  const expenseList       = sales?.despesas?.list ?? mockExpenseList;

  /* PERÍODO EM EXIBIÇÃO (D3). Vem de despesas.metrics.monthKey, a âncora que o
   * serviço já usava para totalMes, mediaDiaria, evolução e donut. Nada aqui
   * escolhe mês: a página limita-se a escrever o que o serviço decidiu.
   * Sem mês (mock ou fonte sem títulos datáveis) o rótulo desaparece — nunca se
   * afirma um período que não se conhece. */
  const mesRefLabel = monthLongLabel(sales?.despesas?.metrics?.monthKey);

  const columns = [
    { key: "data", header: "Data" },
    { key: "descricao", header: "Descrição",
      render: (r) => <span className="font-medium text-slate-800">{r.descricao}</span> },
    { key: "fornecedor", header: "Fornecedor",
      render: (r) => <span className="text-slate-600">{r.fornecedor}</span> },
    { key: "categoria", header: "Categoria",
      render: (r) => <span className="text-slate-600">{r.categoria}</span> },
    { key: "valor", header: "Valor", align: "right",
      render: (r) => <span className="font-semibold text-rose-600">{formatMoney(r.valor)}</span> },
    { key: "vencimento", header: "Vencimento" },
    { key: "status", header: "Estado",
      render: (r) => (
        <StatusBadge variant={STATUS_VARIANT[r.status]}>
          {STATUS_LABEL[r.status]}
        </StatusBadge>
      ) },
    { key: "metodo", header: "Método",
      render: (r) => <span className="text-slate-600">{r.metodo}</span> },
    { key: "_actions", header: "", align: "right",
      render: () => <RowActionsButton /> },
  ];

  const tabs = [
    { id: "todas",     label: "Todas" },
    { id: "pagas",     label: "Pagas",     filter: (r) => r.status === "paga"     },
    { id: "pendentes", label: "Pendentes", filter: (r) => r.status === "pendente" },
    { id: "atraso",    label: "Em atraso", filter: (r) => r.status === "atraso"   },
  ];

  return (
    <>
      <PageHeader
        title="Despesas"
        subtitle={mesRefLabel
          ? `Mês de referência: ${mesRefLabel}. Perceba onde está a gastar mais e identifique categorias que pressionam a margem.`
          : "Perceba onde está a gastar mais e identifique categorias que pressionam a margem."}
        actions={
          <>
            <button onClick={exportCsv} disabled={!canExport} title={!canExport ? "Exportação disponível apenas com dados reais" : undefined} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={14} />Nova despesa</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label={mesRefLabel ? `Total Despesas (${mesRefLabel})` : "Total Despesas (Mês)"}
          value={formatMoney(expenseMetrics.totalMes)}
          delta={expenseMetrics.totalDelta}
          icon={TrendingDown}
          iconBg="bg-rose-50 text-rose-500"
        demo={despesasDemo}
        />
        {/* D5: substitui "Despesa Média Diária". A média dividia pelos dias COM
            lançamento, o que num negócio de compras concentradas (96% de julho num só
            dia) não descrevia gasto nenhum e não desbloqueava decisão alguma.
            "Em atraso" é GLOBAL e até hoje — não segue o mês de referência. Sem delta:
            atraso não se compara mês a mês, resolve-se. */}
        <MetricCard
          label="Contas em Atraso"
          value={formatMoney(expenseMetrics.emAtraso)}
          icon={Clock}
          iconBg="bg-rose-50 text-rose-500"
          helper={expenseMetrics.emAtrasoQtd > 0
            ? `${expenseMetrics.emAtrasoQtd} título${expenseMetrics.emAtrasoQtd === 1 ? "" : "s"} vencido${expenseMetrics.emAtrasoQtd === 1 ? "" : "s"} e por pagar`
            : "Nenhum título vencido"}
          tone={expenseMetrics.emAtrasoQtd > 0 ? "warning" : undefined}
        demo={despesasDemo}
        />
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="label-uppercase flex items-center gap-1.5">Maior Despesa{despesasDemo && <DemoTag />}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
              <AlertCircle size={18} />
            </span>
          </div>
          {/* D-2: valor null = não há despesas no mês de referência. Nunca formatar
              null como 0,00 € — seria afirmar uma despesa que não existe. */}
          <div className="text-[22px] font-semibold leading-tight text-slate-900">
            {expenseMetrics.maiorDespesa.valor == null
              ? "—"
              : formatMoney(expenseMetrics.maiorDespesa.valor)}
          </div>
          <div className="text-xs text-slate-500">
            {expenseMetrics.maiorDespesa.valor == null
              ? (mesRefLabel ? `Sem despesas em ${mesRefLabel}` : "Sem despesas no mês")
              : `${expenseMetrics.maiorDespesa.fornecedor} · ${expenseMetrics.maiorDespesa.data}`}
          </div>
        </div>
        <MetricCard
          label="Pagamentos Pendentes"
          value={formatMoney(expenseMetrics.pagamentosPendentes)}
          icon={CreditCard}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${expenseMetrics.pendentesQtd} títulos em aberto, todos os meses`}
          tone="warning"
        demo={despesasDemo}
        />
      </div>

      {/* Evolução + Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          <ChartCard
            title="Evolução das Despesas"
            /* O cálculo (expenseDailySeries) devolve os dias DO MÊS ÂNCORA, nunca uma
             * janela móvel de 30 dias. O rótulo passa a dizer a verdade. O select de
             * períodos foi removido: não tinha onChange e prometia filtros inexistentes. */
            subtitle={mesRefLabel ? `Dia a dia de ${mesRefLabel}` : "Dia a dia do mês"}
            height={300}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={expenseEvolution} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#EF4444" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => formatMoneyCompact(v)} width={56} />
                <Tooltip content={<EvTooltip />} />
                <Area type="monotone" dataKey="valor" stroke="#EF4444" strokeWidth={2.4} fill="url(#expGrad)" dot={{ r: 0 }} activeDot={{ r: 5, fill: "#EF4444" }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="lg:col-span-5">
          <DonutCategoryCard
            title="Despesas por Categoria"
            data={expenseByCategory}
            /* O donut é partilhado e o seu formatador POR OMISSÃO ainda é o EUR fixo
             * (as outras páginas que o usam não foram migradas). Passa-se o formatador
             * da empresa ativa explicitamente para não ficar meia página em R$ e a
             * outra metade em € — a contradição seria pior do que o bug original. */
            valueFormatter={formatMoney}
            centerValue={formatMoney(expenseByCategory.reduce((a, d) => a + d.value, 0))}
            /* Select inerte removido (não tinha onChange). O donut sempre mostrou o mês
             * âncora e não havia trimestre nem ano por trás das opções. */
            action={
              <span className="text-xs text-slate-500">
                {mesRefLabel || "Mês de referência"}
              </span>
            }
          />
        </div>
      </div>

      {porClassificar.length > 0 && <MovimentosPorClassificar meses={porClassificar} />}

      {/* Tabela */}
      <DataTable
        columns={columns}
        rows={expenseList}
        tabs={tabs}
        defaultTab="todas"
        searchPlaceholder="Pesquisar descrição, fornecedor..."
        searchableFields={["descricao", "fornecedor", "categoria"]}
        pageSize={8}
      />
    </>
  );
}