import { useState } from "react";
import {
  Users, Users2, FileText, Plus, Download, AlertTriangle,
} from "lucide-react";

import PageHeader from "../layouts/PageHeader";
import MetricCard from "../components/ui/MetricCard";
import DemoTag   from "../components/ui/DemoTag";
import AlertCard  from "../components/ui/AlertCard";

import {
  customersSuppliersMetrics as mockCustomersSuppliersMetrics,
  topCustomers as mockTopCustomers,
  topSuppliers, openCustomerInvoices, openSupplierInvoices,
} from "../data/mockData";
import { formatEUR } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";

// ── Tabs internas ────────────────────────────────────────────
const TABS = [
  { id: "geral",        label: "Visão Geral" },
  { id: "clientes",     label: "Clientes"    },
  { id: "fornecedores", label: "Fornecedores"},
];

// ── Linha simples para "Top" ────────────────────────────────
function TopRow({ name, openCount, balance, tone, unitLabel = "faturas em aberto" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{name}</p>
        <p className="text-xs text-slate-500">{openCount} {unitLabel}</p>
      </div>
      <div className={`text-sm font-semibold shrink-0 ${tone === "in" ? "text-brand-700" : "text-rose-600"}`}>
        {formatEUR(balance)}
      </div>
    </div>
  );
}

// ── Tabela simples de faturas em aberto ─────────────────────
function OpenInvoicesTable({ rows, partyHeader, partyKey, demo = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/50">
            <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="inline-flex items-center gap-1.5">{partyHeader}{demo && <DemoTag />}</span></th>
            <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nº Fatura</th>
            <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Emissão</th>
            <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vencimento</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
            <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dias em atraso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
              <td className="px-5 py-3 text-sm font-medium text-slate-800">{r[partyKey]}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{r.numero}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{r.dataEmissao}</td>
              <td className="px-5 py-3 text-sm text-slate-600">{r.vencimento}</td>
              <td className="px-5 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums">{formatEUR(r.valor)}</td>
              <td className="px-5 py-3 text-right">
                {r.diasAtraso > 0
                  ? <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                      <AlertTriangle size={12} />{r.diasAtraso} dias
                    </span>
                  : <span className="text-xs text-slate-400">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50/40">
            <td colSpan={4} className="px-5 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500">Total</td>
            <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right tabular-nums">
              {formatEUR(rows.reduce((acc, r) => acc + r.valor, 0))}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function ClientesFornecedores() {
  const [tab, setTab] = useState("geral");

  // Lado clientes a partir de vendas; restante (fornecedores, saldos a receber) fica mock.
  const { sales, source } = useFinerData();
  const customersSuppliersMetrics = { ...mockCustomersSuppliersMetrics, ...(sales?.clientes?.metrics ?? {}) };
  const topCustomers = sales?.clientes?.top ?? mockTopCustomers;

  return (
    <>
      <PageHeader
        title="Clientes e Fornecedores"
        subtitle="Saiba quem lhe deve, a quem deve e quais faturas estão a aproximar-se do vencimento."
        actions={
          <>
            <button className="btn-secondary"><Download size={14} />Exportar</button>
            <button className="btn-primary"><Plus size={14} />Novo registo</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Saldo a Receber"
          value={formatEUR(customersSuppliersMetrics.saldoReceber)}
          delta={customersSuppliersMetrics.saldoReceberDelta}
          icon={Users}
          iconBg="bg-brand-50 text-brand-600"
          tone="success"
        demo={source === "api"}
        />
        <MetricCard
          label="Saldo a Pagar"
          value={formatEUR(customersSuppliersMetrics.saldoPagar)}
          delta={customersSuppliersMetrics.saldoPagarDelta}
          icon={Users2}
          iconBg="bg-purple-50 text-purple-600"
        demo={source === "api"}
        />
        <MetricCard
          label="Faturas em Aberto (Receber)"
          value={customersSuppliersMetrics.faturasAbertasReceber}
          icon={FileText}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${customersSuppliersMetrics.faturasAbertasReceberVencer7} vencem nos próximos 7 dias`}
        demo={source === "api"}
        />
        <MetricCard
          label="Faturas em Aberto (Pagar)"
          value={customersSuppliersMetrics.faturasAbertasPagar}
          icon={FileText}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${customersSuppliersMetrics.faturasAbertasPagarVencer7} vencem nos próximos 7 dias`}
        demo={source === "api"}
        />
      </div>

      {/* Tabs simples */}
      <div className="card overflow-hidden mb-6">
        <div className="border-b border-slate-200 px-5">
          <div className="flex items-center gap-1 -mb-px">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo das tabs */}
        {tab === "geral" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-slate-200">
            {/* Top clientes */}
            <div className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Top Clientes por faturação</h3>
              <p className="text-xs text-slate-500 mb-3">Maior faturação no período</p>
              <div>
                {topCustomers.map((c) => (
                  <TopRow key={c.id} name={c.nome} openCount={c.faturasAbertas} balance={c.saldo} tone="in" unitLabel="pedidos" />
                ))}
              </div>
            </div>
            {/* Top fornecedores */}
            <div className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">Top Fornecedores (saldo a pagar){source === "api" && <DemoTag />}</h3>
              <p className="text-xs text-slate-500 mb-3">Fornecedores com maior valor em aberto</p>
              <div>
                {topSuppliers.map((s) => (
                  <TopRow key={s.id} name={s.nome} openCount={s.faturasAbertas} balance={s.saldo} tone="out" />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "clientes"     && <OpenInvoicesTable rows={openCustomerInvoices} partyHeader="Cliente"     partyKey="cliente"    demo={source === "api"} />}
        {tab === "fornecedores" && <OpenInvoicesTable rows={openSupplierInvoices} partyHeader="Fornecedor" partyKey="fornecedor" demo={source === "api"} />}
      </div>

      {/* Alertas operacionais */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">Alertas operacionais{source === "api" && <DemoTag />}</h3>
        <div className="divide-y divide-slate-100 -mx-1">
          <AlertCard severity="danger"  title="Fatura vencida"      description="Norte Industrial tem fatura FT 2026/119 vencida há 34 dias." timestamp="Hoje" />
          <AlertCard severity="warning" title="A vencer em breve"   description="3 faturas de clientes vencem nos próximos 7 dias." timestamp="Hoje" />
          <AlertCard severity="warning" title="Fornecedor em atraso" description="Vasco & Lemos: 1 fatura vencida há 19 dias." timestamp="Ontem" />
          <AlertCard severity="info"    title="Pagamento a vencer"   description="Contas & Cia: fatura vence em 5 dias." timestamp="Ontem" />
        </div>
      </div>
    </>
  );
}