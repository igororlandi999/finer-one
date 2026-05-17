import { PlanProvider, usePlan }    from "./context/PlanContext";
import { SCREENS, SCREEN_CATALOG }  from "./config/planConfig";
import AppShell                      from "./layouts/AppShell";
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

export default function App() {
  return (
    <PlanProvider>
      <AppShell>
        <Router />
      </AppShell>
    </PlanProvider>
  );
}
