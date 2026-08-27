import { PlanProvider, usePlan }    from "./context/PlanContext";
import { SCREENS, SCREEN_CATALOG }  from "./config/planConfig";
import AppShell                      from "./layouts/AppShell";
import { FinerDataProvider }         from "./context/FinerDataContext";
import { AuthProvider }              from "./auth/AuthContext";
import { CompanyProvider }           from "./auth/CompanyContext";
import ProtectedRoute                from "./auth/ProtectedRoute";
import Resumo                        from "./pages/Resumo";
import DiagnosticoFinanceiro         from "./pages/DiagnosticoFinanceiro";
import Receitas                      from "./pages/Receitas";
import Despesas                      from "./pages/Despesas";
import Movimentos                    from "./pages/Movimentos";
import ClientesFornecedores          from "./pages/ClientesFornecedores";
import Alertas                       from "./pages/Alertas";
import ChatFinanceiro                from "./pages/ChatFinanceiro";
import PlaneamentoCashflow           from "./pages/PlaneamentoCashflow";
import Indicadores                   from "./pages/Indicadores";
import PerformanceFinanceira         from "./pages/PerformanceFinanceira";
import Relatorio                     from "./pages/Relatorio";
import FinerScore                    from "./pages/FinerScore";
import IAFinanceira                  from "./pages/IAFinanceira";
import AlertasPreditivos             from "./pages/AlertasPreditivos";
import Documentos                    from "./pages/Documentos";
import AjustesManuais                from "./pages/AjustesManuais";
import BenchmarkingSetor             from "./pages/BenchmarkingSetor";
import Placeholder                   from "./pages/Placeholder";

// Mapa tela → componente (apenas telas implementadas nesta etapa)
const PAGES = {
  [SCREENS.RESUMO]:                Resumo,
  [SCREENS.DIAGNOSTICO]:           DiagnosticoFinanceiro,
  [SCREENS.RECEITAS]:              Receitas,
  [SCREENS.DESPESAS]:              Despesas,
  [SCREENS.MOVIMENTOS]:            Movimentos,
  [SCREENS.CLIENTES_FORNECEDORES]: ClientesFornecedores,
  [SCREENS.ALERTAS]:               Alertas,
  [SCREENS.CHAT_FINANCEIRO]:       ChatFinanceiro,
  [SCREENS.PLANEAMENTO]:           PlaneamentoCashflow,
  [SCREENS.INDICADORES]:           Indicadores,
  [SCREENS.PERFORMANCE]:           PerformanceFinanceira,
  [SCREENS.RELATORIO]:             Relatorio,
  [SCREENS.FINER_SCORE]:           FinerScore,
  [SCREENS.IA_FINANCEIRA]:         IAFinanceira,
  [SCREENS.ALERTAS_PREDITIVOS]:    AlertasPreditivos,
  [SCREENS.DOCUMENTOS]:            Documentos,
  [SCREENS.AJUSTES_MANUAIS]:       AjustesManuais,
  [SCREENS.BENCHMARKING]:          BenchmarkingSetor,
};

function Router() {
  const { activeScreen } = usePlan();
  const Page = PAGES[activeScreen];
  if (Page) return <Page />;

  // Telas ainda não implementadas mostram Placeholder
  const meta = SCREEN_CATALOG[activeScreen];
  return <Placeholder title={meta?.label ?? "Tela"} />;
}

/* ─── A ORDEM DOS PROVIDERS NÃO É ARBITRÁRIA ──────────────────────────────────────
 *
 *   AuthProvider          quem é o utilizador e a que empresas pertence
 *     CompanyProvider     qual delas está ativa (lê a sessão)
 *       ProtectedRoute    o PORTÃO: nada abaixo é montado sem sessão
 *         PlanProvider    navegação
 *           FinerDataProvider   ← LEITURA DOS DADOS FINANCEIROS
 *
 * `FinerDataProvider` está DENTRO do portão de propósito. Fora dele, o seu `useEffect`
 * de arranque dispararia a leitura dos quatro snapshots antes de haver sessão — e um
 * utilizador não autenticado, ou autenticado sem empresa, faria a aplicação ir buscar
 * dados financeiros que não vai poder ver. Não seria uma fuga (o BFF recusa), mas seria
 * um pedido inútil por cada carregamento de um ecrã de login.
 *
 * `CompanyProvider` está FORA do portão porque o próprio portão desenha ecrãs que
 * beneficiam de saber a empresa, e porque `useCompany` tem de continuar a responder em
 * qualquer sítio da árvore — inclusive onde não há sessão nenhuma. */
export default function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <ProtectedRoute>
          <PlanProvider>
            <FinerDataProvider>
              <AppShell>
                <Router />
              </AppShell>
            </FinerDataProvider>
          </PlanProvider>
        </ProtectedRoute>
      </CompanyProvider>
    </AuthProvider>
  );
}