import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import DemoBanner from "../components/ui/DemoBanner";
import PageSkeleton from "../components/ui/PageSkeleton";
import DataUnavailable from "../components/ui/DataUnavailable";
import DataHealth from "../components/ui/DataHealth";
import CompanyDataNotLinked from "../components/ui/CompanyDataNotLinked";
import { useFinerData, DATA_SOURCE } from "../context/FinerDataContext";
import { resolveDataHealth } from "../utils/dataHealth";
import { useCompany } from "../auth/CompanyContext";
import { resolveCompanyDataScope, COMPANY_DATA_SCOPE } from "../auth/companyDataScope";

export default function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  /* GATE ÚNICO E GLOBAL (C7F). Enquanto a leitura decorre, nenhuma página é montada.
   *
   * É aqui e não em cada página porque a regra é do produto, não de um ecrã: 13 das 15
   * telas ignoravam `loading` e caíam em `sales?.x ?? mockData.x` no primeiro render.
   * Corrigir uma a uma seriam 16 pontos de falha e nada impediria a 17.ª de repetir o
   * erro; um gate acima do router fecha a porta de uma vez.
   *
   * A moldura da aplicação (barra lateral, topo) fica visível: é navegação, não dados,
   * e escondê-la faria a app parecer avariada em vez de ocupada.
   *
   * C7F.1 — o gate passou a ter três saídas. UNAVAILABLE também bloqueia as páginas:
   * sem dataset, elas cairiam nos fallbacks `sales?.x ?? mockData.x` e mostrariam
   * números da Overcel fictícia como se fossem da empresa do utilizador. O estado de
   * indisponibilidade é a única resposta honesta a uma avaria. */
  const { loading, source, reload, sales } = useFinerData();
  const indisponivel = source === DATA_SOURCE.UNAVAILABLE;

  /* O nome da empresa vinha do `mockData` — ou seja, a barra de topo dizia "Overcel"
   * fosse qual fosse a empresa carregada, e continuaria a dizê-lo no dia em que
   * houvesse uma segunda. Passa a vir do contexto da empresa ativa, que sabe se a
   * resposta veio da sessão ou da configuração compilada. */
  const { company, companies, switchCompany } = useCompany();

  /* ── A EMPRESA ATIVA É A DO DATASET? (fundação SaaS) ─────────────────────────────
   * Enquanto a leitura não for escopada por empresa — passo D do plano de migração —
   * `loadFinerData()` traz sempre o dataset da empresa configurada. Trocar de empresa
   * no seletor mudaria o NOME na barra lateral e deixaria os NÚMEROS de outra empresa
   * no ecrã, sem que nada o denunciasse.
   *
   * O gate vive aqui, ao lado dos outros dois, porque a regra é da mesma natureza:
   * não apresentar dados que não são o que a interface diz que são. */
  const escopo = resolveCompanyDataScope({
    activeCompanyId: company?.id ?? null,
    datasetCompanyId: sales?.companyId ?? null,
  });
  const empresaSemDados = escopo.scope === COMPANY_DATA_SCOPE.NAO_LIGADA;
  /* Para o botão de regresso: a empresa a que os dados de facto pertencem, se o
   * utilizador tiver membership nela. Sem membership, não se oferece atalho nenhum. */
  const empresaDosDados = (companies || []).find((c) => c.companyId === escopo.datasetCompanyId) || null;

  /* SAÚDE DOS DADOS (C7F.2, alargada na P0.2), num único ponto global. Só com fonte
   * REAL: em modo demonstração os dados não têm idade nem completude que interessem, e
   * em loading/indisponibilidade não há dados nenhuns sobre os quais fazer a afirmação.
   *
   * Passa-se `sales.meta` INTEIRO, e não só `geradoEm`: a completude vive em
   * `meta.parcial`, e era precisamente por a faixa só receber a data que um snapshot
   * incompleto conseguia apresentar-se como saudável.
   *
   * A decisão de que estado mostrar é toda de `resolveDataHealth`; aqui só se escolhe
   * QUANDO perguntar. Nenhum cálculo financeiro é lido nem alterado. */
  const saude = (source === DATA_SOURCE.API && !loading && !empresaSemDados)
    ? resolveDataHealth({ meta: sales?.meta ?? null })
    : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* Top bar mobile/tablet (apenas <lg) */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-sidebar text-white border-b border-sidebar-border">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 rounded-md hover:bg-sidebar-hover"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white font-bold text-sm shrink-0">
              F
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">FINER ONE</div>
              <div className="text-[10px] text-sidebar-muted truncate">{company.name}</div>
            </div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-7 max-w-[1400px] mx-auto">
          {/* O banner afirma alguma coisa sobre a FONTE ("dados reais conectados").
              No ecrã de empresa sem dados ligados não há fonte para esta empresa, e
              deixá-lo visível dizia "dados reais conectados" por cima de um ecrã que
              diz o contrário. Mesma razão de `saude`, logo abaixo. */}
          {!empresaSemDados && <DemoBanner />}
          {saude && <DataHealth saude={saude} />}
          {loading ? <PageSkeleton />
            : indisponivel ? <DataUnavailable onRetry={reload} />
              : empresaSemDados ? (
                <CompanyDataNotLinked
                  companyName={company?.name}
                  backLabel={empresaDosDados?.name}
                  onSwitchBack={empresaDosDados ? () => switchCompany(empresaDosDados.companyId) : undefined}
                />
              )
                : children}
        </div>
      </main>
    </div>
  );
}
