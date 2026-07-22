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
  topSuppliers as mockTopSuppliers, openCustomerInvoices, openSupplierInvoices,
} from "../data/mockData";
import { formatEUR } from "../lib/format";
import { useFinerData } from "../context/FinerDataContext";
import { downloadCsv, csvMoney } from "../utils/csvExport";
import { buildOperationalAlerts, hasOperationalSource } from "../utils/operationalAlerts";

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

// ── Rodapé da tabela: contagem e total em aberto ────────────
// Cadeia de fallbacks (fora do JSX). `side` = sales.recebiveis | sales.fornecedores.
// metricCountKey/metricValueKey diferem por lado (Receber vs Pagar).
function sumInvoices(list) {
  return (list || []).reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
}

function footerCount(side, rows, metricCountKey) {
  const m = side && side.metrics ? side.metrics[metricCountKey] : null;
  if (m != null) return m;                                    // 1) métrica
  if (side && Array.isArray(side.allOpenInvoices)) return side.allOpenInvoices.length; // 2) base completa
  return rows.length;                                         // 3) linhas visíveis
}

function footerValue(side, rows, metricValueKey) {
  const m = side && side.metrics ? side.metrics[metricValueKey] : null;
  if (m != null) return m;                                    // 1) métrica
  if (side && Array.isArray(side.allOpenInvoices)) return sumInvoices(side.allOpenInvoices); // 2) base completa
  return sumInvoices(rows);                                   // 3) linhas visíveis
}

// ── Tabela simples de faturas em aberto ─────────────────────
function OpenInvoicesTable({ rows, partyHeader, partyKey, demo = false, totalCount, totalValue }) {
  const shown = rows.length;
  const total = totalCount != null ? totalCount : shown;
  const valor = totalValue != null ? totalValue : sumInvoices(rows);
  const plural = total === 1 ? "fatura" : "faturas";
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
          {rows.length > 0 ? rows.map((r) => (
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
          )) : (
            <tr>
              <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">Não existem faturas em aberto neste momento.</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 px-5 py-3 border-t border-slate-200 bg-slate-50/40">
        <span className="text-xs text-slate-500">
          A mostrar {shown} de {total} {plural}
        </span>
        <span className="text-sm text-slate-600">
          Total em aberto: <span className="font-semibold text-slate-900 tabular-nums">{formatEUR(valor)}</span>
        </span>
      </div>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────
export default function ClientesFornecedores() {
  const [tab, setTab] = useState("geral");

  // Lado clientes a partir de contas a receber reais (sales.recebiveis); lado
  // fornecedores a partir de contas a pagar. Cada lado cai para mock quando ausente.
  const { sales, source } = useFinerData();
  const hasReceivables = source === "api" && !!sales?.recebiveis;
  const hasPayables = source === "api" && !!sales?.fornecedores;
  // Exportação CSV: cada lado real exporta o seu ficheiro (clientes e/ou fornecedores).
  const canExport = hasReceivables || hasPayables;
  function exportCsv() {
    if (hasReceivables) {
      const rows = (sales?.recebiveis?.allOpenInvoices ?? sales?.recebiveis?.openInvoices ?? []).map((i) => [
        i.cliente, i.numero, i.dataEmissao, i.vencimento, csvMoney(i.valor), i.diasAtraso,
      ]);
      downloadCsv("clientes-em-aberto.csv",
        ["Cliente", "Nº documento", "Emissão", "Vencimento", "Valor (€)", "Dias em atraso"], rows);
    }
    if (hasPayables) {
      const rows = (sales?.fornecedores?.allOpenInvoices ?? sales?.fornecedores?.openInvoices ?? []).map((i) => [
        i.fornecedor, i.numero, i.dataEmissao, i.vencimento, csvMoney(i.valor), i.diasAtraso,
      ]);
      downloadCsv("fornecedores-em-aberto.csv",
        ["Fornecedor", "Nº documento", "Emissão", "Vencimento", "Valor (€)", "Dias em atraso"], rows);
    }
  }
  const customersSuppliersMetrics = { ...mockCustomersSuppliersMetrics, ...(sales?.recebiveis?.metrics ?? {}), ...(sales?.fornecedores?.metrics ?? {}) };
  const topCustomers = sales?.recebiveis?.top ?? mockTopCustomers;
  const topSuppliers = sales?.fornecedores?.top ?? mockTopSuppliers;

  // Alertas operacionais reais a partir dos lados disponíveis (recebíveis/fornecedores).
  // Se houver qualquer fonte real, usamos os alertas calculados (mesmo que a lista fique
  // vazia => estado vazio real, sem Demo). Só sem nenhuma fonte é que fica mock + Demo.
  const opSource = hasOperationalSource({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores });
  const operationalAlerts = opSource
    ? buildOperationalAlerts({ recebiveis: sales?.recebiveis, fornecedores: sales?.fornecedores }).slice(0, 4)
    : null;

  return (
    <>
      <PageHeader
        title="Clientes e Fornecedores"
        subtitle="Saiba quem lhe deve, a quem deve e quais faturas estão a aproximar-se do vencimento."
        actions={
          <>
            <button onClick={exportCsv} disabled={!canExport} title={!canExport ? "Exportação disponível apenas com dados reais" : undefined} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Download size={14} />Exportar</button>
            <button disabled title="Funcionalidade disponível numa fase futura" className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={14} />Novo registo</button>
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
        demo={source === "api" && !sales?.recebiveis}
        />
        <MetricCard
          label="Saldo a Pagar"
          value={formatEUR(customersSuppliersMetrics.saldoPagar)}
          delta={customersSuppliersMetrics.saldoPagarDelta}
          icon={Users2}
          iconBg="bg-purple-50 text-purple-600"
        demo={source === "api" && !sales?.fornecedores}
        />
        <MetricCard
          label="Faturas em Aberto (Receber)"
          value={customersSuppliersMetrics.faturasAbertasReceber}
          icon={FileText}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${customersSuppliersMetrics.faturasAbertasReceberVencer7} vencem nos próximos 7 dias`}
        demo={source === "api" && !sales?.recebiveis}
        />
        <MetricCard
          label="Faturas em Aberto (Pagar)"
          value={customersSuppliersMetrics.faturasAbertasPagar}
          icon={FileText}
          iconBg="bg-amber-50 text-amber-600"
          helper={`${customersSuppliersMetrics.faturasAbertasPagarVencer7} vencem nos próximos 7 dias`}
        demo={source === "api" && !sales?.fornecedores}
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
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">Top Clientes (saldo a receber){source === "api" && !sales?.recebiveis && <DemoTag />}</h3>
              <p className="text-xs text-slate-500 mb-3">Clientes com maior valor em aberto</p>
              <div>
                {topCustomers.length > 0 ? (
                  topCustomers.map((c) => (
                    <TopRow key={c.id} name={c.nome} openCount={c.faturasAbertas} balance={c.saldo} tone="in" unitLabel={hasReceivables ? "faturas" : "pedidos"} />
                  ))
                ) : (
                  <p className="py-4 text-sm text-slate-500">Não existem clientes com saldo em aberto.</p>
                )}
              </div>
            </div>
            {/* Top fornecedores */}
            <div className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">Top Fornecedores (saldo a pagar){source === "api" && !sales?.fornecedores && <DemoTag />}</h3>
              <p className="text-xs text-slate-500 mb-3">Fornecedores com maior valor em aberto</p>
              <div>
                {topSuppliers.length > 0 ? (
                  topSuppliers.map((s) => (
                    <TopRow key={s.id} name={s.nome} openCount={s.faturasAbertas} balance={s.saldo} tone="out" />
                  ))
                ) : (
                  <p className="py-4 text-sm text-slate-500">Não existem fornecedores com saldo em aberto.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "clientes"     && <OpenInvoicesTable
          rows={sales?.recebiveis?.openInvoices ?? openCustomerInvoices}
          partyHeader="Cliente" partyKey="cliente"
          demo={source === "api" && !sales?.recebiveis}
          totalCount={footerCount(sales?.recebiveis, sales?.recebiveis?.openInvoices ?? openCustomerInvoices, "faturasAbertasReceber")}
          totalValue={footerValue(sales?.recebiveis, sales?.recebiveis?.openInvoices ?? openCustomerInvoices, "saldoReceber")}
        />}
        {tab === "fornecedores" && <OpenInvoicesTable
          rows={sales?.fornecedores?.openInvoices ?? openSupplierInvoices}
          partyHeader="Fornecedor" partyKey="fornecedor"
          demo={source === "api" && !sales?.fornecedores}
          totalCount={footerCount(sales?.fornecedores, sales?.fornecedores?.openInvoices ?? openSupplierInvoices, "faturasAbertasPagar")}
          totalValue={footerValue(sales?.fornecedores, sales?.fornecedores?.openInvoices ?? openSupplierInvoices, "saldoPagar")}
        />}
      </div>

      {/* Alertas operacionais */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">Alertas operacionais{!opSource && source === "api" && <DemoTag />}</h3>
        <div className="divide-y divide-slate-100 -mx-1">
          {operationalAlerts !== null ? (
            operationalAlerts.length > 0 ? (
              operationalAlerts.map((a) => (
                <AlertCard key={a.id} severity={a.severity} title={a.title} description={a.description} timestamp={a.timestamp} />
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">Não existem alertas operacionais neste momento.</p>
            )
          ) : (
            <>
              <AlertCard severity="danger"  title="Fatura vencida"      description="Norte Industrial tem fatura FT 2026/119 vencida há 34 dias." timestamp="Hoje" />
              <AlertCard severity="warning" title="A vencer em breve"   description="3 faturas de clientes vencem nos próximos 7 dias." timestamp="Hoje" />
              <AlertCard severity="warning" title="Fornecedor em atraso" description="Vasco & Lemos: 1 fatura vencida há 19 dias." timestamp="Ontem" />
              <AlertCard severity="info"    title="Pagamento a vencer"   description="Contas & Cia: fatura vence em 5 dias." timestamp="Ontem" />
            </>
          )}
        </div>
      </div>
    </>
  );
}