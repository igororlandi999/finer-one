// src/pages/Login.jsx
// O primeiro ecrã da Finer One com autenticação. Coerente com a identidade e sem
// investimento de design a mais: é uma porta, não um produto.
//
// ─── O QUE ESTE ECRÃ NÃO FAZ ────────────────────────────────────────────────────────
// Não regista contas, não recupera palavras-passe, não faz MFA e não vende nada. Tudo
// isso vem depois e nenhum deles bloqueia a fundação.
//
// ─── UMA SÓ MENSAGEM DE ERRO PARA CREDENCIAIS ───────────────────────────────────────
// "Email ou palavra-passe incorretos" — nunca "esse email não existe". Distinguir os
// dois casos permite a um estranho descobrir QUEM são os clientes da Finer One, uma
// pergunta por email. Num produto financeiro, a lista de clientes é ela própria
// informação comercial, antes ainda de qualquer número.

import { useState } from "react";
import { LogIn, AlertCircle, FlaskConical } from "lucide-react";
import { useAuth } from "../auth/AuthContext.jsx";
import { SIGN_IN_ERROR } from "../auth/authAdapterPort.js";

const MENSAGENS = {
  [SIGN_IN_ERROR.CREDENCIAIS_INVALIDAS]: "Email ou palavra-passe incorretos.",
  [SIGN_IN_ERROR.CAMPOS_EM_FALTA]: "Preencha o email e a palavra-passe.",
  [SIGN_IN_ERROR.PROVIDER_INDISPONIVEL]: "Não foi possível contactar o serviço de autenticação. Tente novamente.",
  [SIGN_IN_ERROR.NAO_CONFIGURADO]: "A autenticação ainda não está configurada nesta instalação.",
};

export default function Login() {
  const { signIn, signingIn, simulated, fixtures } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState(null);

  async function submeter(e) {
    e.preventDefault();
    setErro(null);
    const r = await signIn({ email, password });
    if (!r || !r.ok) {
      setErro(MENSAGENS[r?.code] ?? "Não foi possível entrar.");
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Identidade */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white text-2xl font-bold">
            F
          </div>
          <h1 className="mt-3 text-lg font-bold tracking-tight text-slate-900">FINER ONE</h1>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">
            Financial Intelligence PME
          </p>
        </div>

        <form
          onSubmit={submeter}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-card"
        >
          {/* ── `id` E `name` NÃO SÃO DECORAÇÃO NESTE FORMULÁRIO (FASE 20) ─────────────
              Um campo sem `name` nem `id` é um campo que os GESTORES DE PALAVRAS-PASSE
              não conseguem identificar: o 1Password, o Bitwarden e o próprio Chrome
              usam-nos (com o `autocomplete`) para decidir o que preencher e o que
              guardar. Sem eles, o utilizador não recebe a proposta de guardar as
              credenciais — e num produto financeiro, isso empurra as pessoas para
              palavras-passe que conseguem decorar.

              O Chrome já o assinalava: "A form field element should have an id or name
              attribute". Apanhado na validação desta sessão, com a consola aberta.

              O `htmlFor` torna a associação do rótulo EXPLÍCITA. O `<label>` a envolver
              o campo já a criava implicitamente, mas a forma explícita é a que as
              ferramentas de acessibilidade reconhecem sem ambiguidade. */}
          <label className="block" htmlFor="email">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              /* Um teclado de telemóvel que capitaliza a primeira letra transforma
                 "ana@x.pt" em "Ana@x.pt". O servidor compara sem distinção de
                 maiúsculas, mas o campo não devia criar o problema. */
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder="nome@empresa.com"
            />
          </label>

          <label className="mt-4 block" htmlFor="current-password">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Palavra-passe</span>
            <input
              id="current-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
              placeholder="••••••••"
            />
          </label>

          {erro && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-px shrink-0" />
              <span>{erro}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            <LogIn size={16} />
            {signingIn ? "A entrar…" : "Entrar"}
          </button>
        </form>

        {/* ── MODO SIMULADO ──────────────────────────────────────────────────────────
            Só aparece quando o adaptador o é. Escrito por extenso, com as fixtures à
            vista: um ecrã de desenvolvimento que se disfarça de produção é como um
            botão de teste que ninguém desliga. */}
        {simulated && Array.isArray(fixtures) && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <FlaskConical size={14} />
              Autenticação simulada — apenas em desenvolvimento
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
              A palavra-passe é ignorada. Estas contas são fixtures compiladas e não
              existem em produção.
            </p>
            <div className="mt-3 space-y-1.5">
              {fixtures.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setEmail(f.email); setPassword("dev"); setErro(null); }}
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left transition-colors hover:border-amber-400"
                >
                  <span className="block text-xs font-medium text-slate-800">{f.name}</span>
                  <span className="block text-[10px] text-slate-500">{f.email} · {f.descricao}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
