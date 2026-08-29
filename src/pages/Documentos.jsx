import { useEffect, useMemo, useState } from "react";
import {
  FileText, HardDrive, Search, Upload, Plus,
  Download, Mail, Smartphone, Database, FileSpreadsheet, Image, File, FileCheck2, FileClock,
} from "lucide-react";

import PageHeader        from "../layouts/PageHeader";
import MetricCard        from "../components/ui/MetricCard";
import DonutCategoryCard from "../components/charts/DonutCategoryCard";

import { docsMetrics, docsByCategory as mockDocsByCategory, docsList } from "../data/mockData";
import { formatMoney } from "../lib/currency";
import { toDate } from "../utils/financialCalculations";
import {
  documentsByCategory, filterDocuments, canDownload, resolveDocumentView, DOCUMENT_STATUS,
} from "../utils/documentNormalizer";
import { useFinerData } from "../context/FinerDataContext";
import { useCompany } from "../auth/CompanyContext";
import DemoTag from "../components/ui/DemoTag";

// ── Mapa categoria → cor pill ───────────────────────────────
const CAT_STYLE = {
  "Notas Fiscais":            "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Faturas de Fornecedores":  "bg-brand-50 text-brand-700 border-brand-200",
  "Recibos":                  "bg-sky-50   text-sky-700   border-sky-200",
  "Faturas de Clientes":      "bg-purple-50 text-purple-700 border-purple-200",
  "Contratos":                "bg-amber-50 text-amber-700 border-amber-200",
  "Outros":                   "bg-slate-100 text-slate-700 border-slate-200",
};

const ICON_WRAP = "flex h-9 w-9 items-center justify-center rounded-md";

// ── Ícone do ficheiro pela extensão ─────────────────────────
// fileName pode ser null: um documento real é metadata, sem ficheiro associado.
function FileIcon({ fileName }) {
  const nome = typeof fileName === "string" ? fileName : "";
  const ext = nome.includes(".") ? nome.split(".").pop().toLowerCase() : "";
  if (ext === "pdf") return <span className={`${ICON_WRAP} bg-rose-50 text-rose-600`}><FileText size={16} /></span>;
  if (ext === "xlsx" || ext === "csv") return <span className={`${ICON_WRAP} bg-brand-50 text-brand-600`}><FileSpreadsheet size={16} /></span>;
  if (ext === "jpg" || ext === "png" || ext === "jpeg") return <span className={`${ICON_WRAP} bg-sky-50 text-sky-600`}><Image size={16} /></span>;
  return <span className={`${ICON_WRAP} bg-slate-100 text-slate-600`}><File size={16} /></span>;
}

// ── Origem (badge) ──────────────────────────────────────────
function OriginBadge({ origem }) {
  const map = {
    "Bling":      { icon: Database,   style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "Upload":     { icon: Upload,     style: "bg-slate-100 text-slate-700 border-slate-200" },
    "Email":      { icon: Mail,       style: "bg-sky-50    text-sky-700    border-sky-200"  },
    "Mobile App": { icon: Smartphone, style: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  const cfg = map[origem] ?? map.Upload;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.style}`}>
      <Icon size={11} />{origem}
    </span>
  );
}

const MOCK_CATEGORY_TABS = ["Todos", "Faturas de Fornecedores", "Recibos", "Faturas de Clientes", "Contratos", "Outros"];

function pad(n) { return String(n).padStart(2, "0"); }
// toDate trata "YYYY-MM-DD" como data local: o dia 1 nunca recua de mês.
function formatData(value) {
  const d = toDate(value);
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Vínculo financeiro do documento, em texto. Só existe com ID relacional.
const ENTITY_LABEL = { order: "Pedido", payable: "Conta a pagar", receivable: "Conta a receber" };
function vinculoTexto(doc) {
  const rel = doc && doc.relatedEntity;
  if (!rel) return null;
  const base = ENTITY_LABEL[rel.type] || "Registo";
  if (rel.type === "order" && doc.metadata && doc.metadata.orderNumber != null) {
    return `${base} ${doc.metadata.orderNumber}`;
  }
  return `${base} ${rel.id}`;
}

/* Adapta uma linha do mockData ao shape que a tabela usa para os reais.
 * Os dois mundos NUNCA se misturam na mesma lista: ou a fonte real existe, ou não.
 *
 * A data do mock já vem formatada ("30/05/2026") e é usada TAL E QUAL. Não pode
 * passar por toDate: parseLocalISODate só reconhece "YYYY-MM-DD" e cairia em
 * new Date("30/05/2026"), que devolve Invalid Date (verificado) — a coluna Data
 * mostraria "—" em todas as linhas demonstrativas. Quem formata é o adapter, uma
 * única vez; a tabela apenas imprime displayDate. */
function fromMock(d) {
  return {
    id: d.id,
    label: d.nome,
    fileName: d.nome,
    category: d.categoria,
    counterpartyName: d.contraparte,
    displayDate: d.data,                    // já em DD/MM/AAAA: não reinterpretar
    amount: d.valor,
    origin: d.origem,
    status: DOCUMENT_STATUS.METADATA_ONLY, // o mock também não tem ficheiro real
    link: null,
    file: null,
  };
}

/* Só as datas REAIS ("YYYY-MM-DD", civis) passam pelo parser consolidado. */
function fromReal(d) {
  return {
    id: d.id,
    label: d.label,
    fileName: d.fileName,
    category: d.category,
    counterpartyName: (d.counterparty && d.counterparty.name) || "—",
    displayDate: formatData(d.date),
    amount: d.amount,
    origin: "Bling",
    status: d.status,
    link: vinculoTexto(d),
    file: d.file,
  };
}

// ── Tela ────────────────────────────────────────────────────
export default function Documentos() {
  const { sales } = useFinerData();
  /* O nome vem da empresa ATIVA. Estava escrito à mão — ver `nomeDaEmpresaNaCopy.test.js`. */
  const { company } = useCompany();

  // Catálogo real do dataset. `available` descreve a FONTE: uma fonte presente com
  // zero documentos é um zero real e NÃO faz a tela voltar ao mock.
  const catalog = (sales && sales.documents) || null;
  const view = resolveDocumentView(catalog);
  const { isReal } = view;

  const [tab, setTab] = useState("Todos");
  const [search, setSearch] = useState("");

  const tabs = useMemo(() => {
    if (!isReal) return MOCK_CATEGORY_TABS;
    // Só categorias com documentos: sem tabs vazias herdadas do desenho demonstrativo.
    return ["Todos", ...documentsByCategory(view.list).map((c) => c.name)];
  }, [isReal, view.list]);

  // A fonte pode mudar (mock -> real) e as tabs reais são derivadas dos documentos
  // existentes. Se a categoria escolhida deixar de existir, volta a "Todos" — sem
  // isso a tabela ficaria permanentemente vazia numa tab fantasma. Enquanto a
  // escolha continuar válida, é preservada.
  useEffect(() => {
    if (!tabs.includes(tab)) setTab("Todos");
  }, [tabs, tab]);

  const rows = useMemo(() => {
    if (isReal) {
      return filterDocuments(view.list, { category: tab, search }).map(fromReal);
    }
    const termo = search.toLowerCase();
    return docsList
      .filter((d) => (tab === "Todos" || d.categoria === tab))
      .filter((d) => !termo
        || d.nome.toLowerCase().includes(termo)
        || d.contraparte.toLowerCase().includes(termo))
      .map(fromMock);
  }, [isReal, view.list, tab, search]);

  /* ── QUANTAS LINHAS SE DESENHAM DE FACTO ─────────────────────────────────────────
   * A tabela desenhava a lista INTEIRA. Com os dados reais da conta são 2 316 linhas:
   * medido no browser, ~62 800 nós no DOM e ~730 ms até a tabela existir, a cada
   * entrada na página. O catálogo cresce com cada pedido e cada título, pelo que isto
   * piora sozinho — a 10× o volume atual são ~627 000 nós, e a página deixa de abrir.
   *
   * O projeto já tem paginação em `components/ui/DataTable`, mas esta tabela é própria
   * (tabs, pesquisa e ações desenhadas à volta dela). Em vez de a reescrever agora,
   * limita-se o que se desenha e dá-se ao utilizador a forma de ver mais. A pesquisa e
   * as tabs continuam a filtrar sobre a lista TODA — o limite é de desenho, nunca de
   * dados, e a contagem ao lado da pesquisa continua a ser a real. */
  const PASSO_LINHAS = 100;
  const [limite, setLimite] = useState(PASSO_LINHAS);
  // Filtrar ou pesquisar recomeça a contagem: caso contrário, um filtro aplicado depois
  // de "mostrar mais" herdava um limite que já não corresponde ao que se está a ver.
  useEffect(() => { setLimite(PASSO_LINHAS); }, [tab, search, isReal]);
  const linhasVisiveis = rows.slice(0, limite);
  const porMostrar = Math.max(0, rows.length - linhasVisiveis.length);

  const donutData = isReal ? documentsByCategory(view.list) : mockDocsByCategory;
  const total = isReal ? view.stats.total : docsMetrics.total;
  const recentes = isReal ? view.list.slice(0, 5).map(fromReal) : docsList.slice(0, 5).map(fromMock);
  const vazioReal = view.isEmptyReal;

  const armPct = (docsMetrics.armazenamento.usado / docsMetrics.armazenamento.total) * 100;
  // O upload não existe: não há endpoint de escrita nem storage em fase nenhuma.
  const uploadIndisponivel = "Carregamento de documentos disponível numa fase futura";

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle={`Centralize faturas, recibos e contratos da ${company?.name ?? "sua empresa"} — sem perder tempo a procurar.`}
        actions={
          <>
            <button disabled title={uploadIndisponivel} className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"><Upload size={14} />Carregar</button>
            <button disabled title={uploadIndisponivel} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><Plus size={14} />Novo documento</button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {isReal ? (
          <>
            <MetricCard
              label="Documentos identificados"
              value={view.stats.total}
              icon={FileText}
              iconBg="bg-brand-50 text-brand-600"
              helper="Metadata vinda do Bling"
            />
            <MetricCard
              label="Com ficheiro disponível"
              value={view.stats.withFile}
              icon={FileCheck2}
              iconBg="bg-emerald-50 text-emerald-600"
              helper="Nenhuma fonte devolve ficheiro"
            />
            <MetricCard
              label="Somente metadata"
              value={view.stats.metadataOnly}
              icon={FileClock}
              iconBg="bg-amber-50 text-amber-600"
              helper="Documento identificado, sem ficheiro"
            />
          </>
        ) : (
          <>
            <MetricCard
              demo
              label="Total de Documentos"
              value={docsMetrics.total}
              icon={FileText}
              iconBg="bg-brand-50 text-brand-600"
              helper={`+${docsMetrics.esteMes} este mês`}
            />
            <MetricCard
              demo
              label="Documentos este mês"
              value={docsMetrics.esteMes}
              icon={FileClock}
              iconBg="bg-sky-50 text-sky-600"
              delta={docsMetrics.esteMesDelta}
              deltaLabel="vs mês anterior"
              tone="success"
            />
            <MetricCard
              demo
              label="Origem mais frequente"
              value="Email"
              icon={Mail}
              iconBg="bg-amber-50 text-amber-600"
              helper="42% dos documentos"
            />
          </>
        )}

        {/* Armazenamento: não existe storage em fase nenhuma — permanece Demo sempre. */}
        <div className="card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="label-uppercase flex items-center gap-1.5">Armazenamento<DemoTag /></span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <HardDrive size={18} />
            </span>
          </div>
          <div className="text-[22px] font-semibold leading-tight text-slate-900">
            {docsMetrics.armazenamento.usado} {docsMetrics.armazenamento.unit}
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>de {docsMetrics.armazenamento.total} {docsMetrics.armazenamento.unit}</span>
              <span>{armPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${armPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Categorias + Documentos recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <div className="lg:col-span-7">
          {vazioReal ? (
            <div className="card p-5 h-full flex flex-col items-center justify-center text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400 mb-3">
                <FileText size={20} />
              </span>
              <p className="text-sm font-medium text-slate-700">Sem documentos por categoria</p>
              <p className="text-xs text-slate-500 mt-1">Os pedidos e contas do período não têm documento identificado.</p>
            </div>
          ) : (
            <DonutCategoryCard
              title={<span className="inline-flex items-center gap-1.5">Documentos por Categoria{!isReal && <DemoTag />}</span>}
              data={donutData}
              valueFormatter={(v) => `${v} doc${v === 1 ? "" : "s"}`}
              centerValue={`${total}`}
              centerLabel="Documentos"
            />
          )}
        </div>
        <div className="lg:col-span-5">
          <div className="card p-5 h-full">
            {/* "Carregamentos" implicava upload, que não existe. Em modo real: documentos recentes. */}
            <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
              {isReal ? "Documentos recentes" : "Carregamentos recentes"}{!isReal && <DemoTag />}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isReal ? "Últimos documentos identificados" : "Últimos documentos adicionados"}
            </p>
            {recentes.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">Nenhum documento encontrado.</p>
            ) : (
              <div className="space-y-2">
                {recentes.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                    <FileIcon fileName={d.fileName} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.label}</p>
                      <p className="text-xs text-slate-500">{d.displayDate} · {d.category}</p>
                    </div>
                    <OriginBadge origem={d.origin} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de documentos */}
      <div className="card overflow-hidden">
        {/* Tabs de categoria */}
        <div className="border-b border-slate-200 px-5">
          <div className="flex items-center gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => {
              const active = t === tab;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-brand-500 text-brand-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t}
                </button>
              );
            })}
            {!isReal && <span className="ml-auto flex items-center py-3"><DemoTag /></span>}
          </div>
        </div>

        {/* Pesquisa */}
        <div className="px-5 py-3 flex items-center gap-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isReal ? "Pesquisar por número, pedido ou contraparte..." : "Pesquisar por nome ou contraparte..."}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <span className="text-xs text-slate-500 ml-auto">
            {rows.length} documento{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nome</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Categoria</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contraparte</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Data</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                <th className="px-5 py-2.5 text-left  text-[11px] font-semibold uppercase tracking-wider text-slate-500">Origem</th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    {vazioReal
                      ? "Nenhum documento encontrado para este período."
                      : "Sem documentos para os filtros aplicados."}
                  </td>
                </tr>
              ) : (
                linhasVisiveis.map((d) => {
                  const temFicheiro = canDownload({ file: d.file });
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <FileIcon fileName={d.fileName} />
                          <div className="min-w-0">
                            <span className="block text-sm font-medium text-slate-800 truncate">{d.label}</span>
                            <span className="block text-xs text-slate-400">
                              {d.link ? `${d.link} · ` : ""}
                              {temFicheiro ? "Ficheiro disponível" : "Ficheiro não disponível"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${CAT_STYLE[d.category] ?? CAT_STYLE.Outros}`}>
                          {d.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600">{d.counterpartyName}</td>
                      <td className="px-5 py-3 text-sm text-slate-600">{d.displayDate || "—"}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums">
                        {d.amount != null ? formatMoney(d.amount) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3"><OriginBadge origem={d.origin} /></td>
                      <td className="px-5 py-3 text-right">
                        {/* Com URL real é um link verdadeiro (novo separador, sem
                            janela-mãe exposta). Sem URL, controlo desativado —
                            nunca href="#", nunca botão habilitado sem destino. */}
                        {temFicheiro ? (
                          <a
                            href={d.file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir ficheiro"
                            className="inline-flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          >
                            <Download size={14} />
                          </a>
                        ) : (
                          <button
                            disabled
                            title="Ficheiro não disponível"
                            className="p-1.5 rounded-md text-slate-400 opacity-40 cursor-not-allowed"
                          >
                            <Download size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Nunca se esconde a existência das linhas que faltam: diz-se quantas são e
            dá-se a forma de as ver. Um "1–100 de 2 316" mudo seria o mesmo limite sem
            a saída. */}
        {porMostrar > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              A mostrar {linhasVisiveis.length} de {rows.length} documentos.
            </span>
            <button
              type="button"
              onClick={() => setLimite((n) => n + PASSO_LINHAS)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Mostrar mais {Math.min(PASSO_LINHAS, porMostrar)}
            </button>
          </div>
        )}
      </div>
    </>
  );
}