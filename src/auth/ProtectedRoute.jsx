// src/auth/ProtectedRoute.jsx
// O PORTÃO. Nada da aplicação financeira é MONTADO sem sessão.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// MONTADO, não "escondido". A diferença é a totalidade da proteção que este ficheiro dá.
// ═══════════════════════════════════════════════════════════════════════════════════
//
// Esconder um componente com `display:none`, com uma classe, ou com um `hidden` deixa
// o componente EXISTIR: ele monta, corre os seus efeitos, faz os seus pedidos, e o
// conteúdo está no DOM à distância de um inspetor. Num ecrã de DRE isso significa que
// os números foram buscados, calculados e escritos — e que basta apagar uma regra de
// CSS para os ler.
//
// Aqui devolve-se outra árvore. `children` nunca é avaliado, nenhum `useEffect` corre,
// nenhum pedido sai, e não há nada no DOM para revelar.
//
// ─── E MESMO ASSIM, ISTO NÃO É A SEGURANÇA ──────────────────────────────────────────
// É a INTERFACE a comportar-se corretamente. A segurança é o BFF recusar 401/403 ao
// pedido que este portão nem chegou a deixar fazer. Um atacante não passa por aqui:
// passa ao lado, com `curl`. É por isso que `authorizationCore.js` existe e é por isso
// que a proteção do frontend nunca é o argumento.
//
// ─── QUATRO SAÍDAS, PORQUE SÃO QUATRO SITUAÇÕES DIFERENTES ──────────────────────────
//   loading         ainda não há veredito           -> esqueleto, sem afirmar nada
//   error           não conseguimos perguntar       -> avaria, NÃO "faça login"
//   unauthenticated não há sessão                   -> Login
//   sem empresa     sessão válida, zero memberships -> acesso não configurado
//
// Colapsar `error` em `unauthenticated` mandaria um utilizador com credenciais certas
// tentar credenciais certas outra vez. É o mesmo erro que a C7F.1 corrigiu quando uma
// quebra de rede aparecia como "Modo demonstração".

import { ShieldAlert, Building2, RefreshCw } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { AUTH_STATUS, COMPANY_STATUS } from "./sessionContract.js";
import Login from "../pages/Login.jsx";
import PageSkeleton from "../components/ui/PageSkeleton.jsx";

/** Moldura neutra dos estados terminais. Sem números, sem dados, sem barra lateral. */
function EcraDeEstado({ icone: Icone, tom, titulo, texto, acao }) {
  const tons = {
    aviso: "bg-amber-50 text-amber-600",
    erro: "bg-red-50 text-red-600",
    neutro: "bg-slate-100 text-slate-500",
  };
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
        <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${tons[tom] ?? tons.neutro}`}>
          <Icone size={22} />
        </span>
        <p className="text-base font-semibold text-slate-900">{titulo}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{texto}</p>
        {acao}
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const { requiresAuth, status, companyStatus, user, signOut } = useAuth();

  /* ── MODO SEM AUTENTICAÇÃO (FASE 19) ─────────────────────────────────────────────
   * Sem provider configurado, a aplicação corre como corria antes desta fundação. NÃO
   * é uma brecha nova: é o estado de hoje, preservado de propósito para que o
   * desenvolvimento sobre os dados reais da Overcel continue possível enquanto o
   * Supabase não existe. Deixa de o ser no instante em que `VITE_SUPABASE_URL` for
   * definido — e é isso que a FASE 24 pede ao utilizador. */
  if (!requiresAuth) return children;

  if (status === AUTH_STATUS.LOADING) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-10">
        <div className="mx-auto max-w-[1400px]"><PageSkeleton /></div>
      </div>
    );
  }

  if (status === AUTH_STATUS.ERROR) {
    return (
      <EcraDeEstado
        icone={ShieldAlert}
        tom="erro"
        titulo="Não foi possível verificar a sua sessão."
        texto={
          "O serviço de autenticação não respondeu. As suas credenciais não estão em causa. " +
          "Nenhuma informação financeira é apresentada enquanto a sessão não for confirmada."
        }
        acao={
          <button onClick={() => globalThis.location?.reload()} className="btn-secondary mt-5 inline-flex justify-center">
            <RefreshCw size={15} />
            Tentar novamente
          </button>
        }
      />
    );
  }

  if (status !== AUTH_STATUS.AUTHENTICATED) return <Login />;

  /* ── AUTENTICADO E SEM EMPRESA ───────────────────────────────────────────────────
   * Uma conta existe e não tem membership nenhuma. Montar a aplicação aqui seria pior
   * do que inútil: sem empresa não há dataset, e sem dataset as páginas caem nos
   * fallbacks `sales?.x ?? mockData.x` — ou seja, mostrariam os números da Overcel
   * fictícia a alguém que não devia estar a ver empresa nenhuma. */
  if (companyStatus === COMPANY_STATUS.NO_COMPANY) {
    return (
      <EcraDeEstado
        icone={Building2}
        tom="neutro"
        titulo="Acesso ainda não configurado."
        texto={
          `A conta ${user?.email ?? ""} está ativa, mas ainda não está associada a nenhuma empresa. ` +
          "Peça a quem administra a conta da sua empresa para lhe dar acesso."
        }
        acao={
          <button onClick={signOut} className="btn-secondary mt-5 inline-flex justify-center">
            Terminar sessão
          </button>
        }
      />
    );
  }

  return children;
}
