// src/components/ui/PageSkeleton.jsx
// Esqueleto genérico mostrado enquanto a leitura de dados não termina.
//
// Existe para responder a uma regra de produto, não a uma preferência estética: até
// haver veredito sobre a fonte, a aplicação não pode mostrar números — nem reais (não
// os tem) nem fictícios (seriam mentira). Um esqueleto diz "estou a carregar" sem
// afirmar valor nenhum.
//
// Deliberadamente NEUTRO: não imita o layout de nenhuma página em particular. Imitar o
// Resumo faria as outras telas piscar ao trocar de esqueleto para conteúdo diferente.

export default function PageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">A carregar os dados da empresa.</span>

      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="h-6 w-56 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-slate-100" />
      </div>

      {/* Faixa de indicadores */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-6 w-32 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Dois blocos largos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        </div>
        <div className="lg:col-span-5">
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
        </div>
      </div>
    </div>
  );
}
