// src/pages/AjustesManuais.jsx
// Ecrã "Dados a completar" — READ-ONLY. A página é deliberadamente fina: toda a
// decisão de estado, de copy e de agrupamento vive em utils/completionDataView.js.
//
// O nome do ficheiro e da rota ("ajustes-manuais") mantêm-se por não haver razão
// técnica para os mudar; o que mudou foi a PERGUNTA que a página responde. Deixou de
// ser um inventário de valores introduzidos à mão e passou a responder "que períodos
// precisam de atenção, e o que falta em cada um".
//
// Não faz fetch. Consome o que loadFinerData já carregou e o FinerDataContext expõe.
//
// Não existe edição: nenhum campo, nenhum botão Guardar, Editar ou Adicionar — nem
// sequer desativado. Um botão que não faz nada é uma promessa falsa.

import { useState } from "react";
import { ClipboardList, Info, ShieldCheck, AlertTriangle } from "lucide-react";

import PageHeader from "../layouts/PageHeader";
import StatusBadge from "../components/ui/StatusBadge";
import { useFinerData } from "../context/FinerDataContext";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../auth/CompanyContext";
import { CAPABILITIES } from "../auth/uiPermissions";
import { formatMoney } from "../lib/currency";
import {
  buildCompletionDataView, COMPLETION_VIEW, COMPLETION_ITEM, COMPLETION_TONE,
} from "../utils/completionDataView";
import { buildCoverageConfirmationCard, COVERAGE_CARD } from "../utils/coverageConfirmationView";

const CARD = "rounded-xl border border-slate-200 bg-white shadow-sm";

/* Tom -> token de cor do projeto. A tradução vive aqui, na camada que desenha; o
 * view-model devolve significado, não paleta. */
const TONE_BADGE = {
  [COMPLETION_TONE.POSITIVO]: "success",
  [COMPLETION_TONE.ATENCAO]: "warning",
  [COMPLETION_TONE.INFORMATIVO]: "info",
  [COMPLETION_TONE.NEUTRO]: "neutral",
};

function EstadoVazio() {
  return (
    <div className={`${CARD} p-10 text-center`}>
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <ClipboardList size={20} />
      </span>
      <p className="text-sm font-medium text-slate-900">
        Ainda não existem períodos a apresentar.
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Assim que houver períodos terminados, aparecem aqui com os dados necessários.
      </p>
    </div>
  );
}

function EstadoCarregamento() {
  return (
    <div className={`${CARD} p-10`}>
      <div className="mx-auto h-3 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mx-auto mt-3 h-3 w-64 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

/* Uma rubrica. Empilha em mobile (flex-col) e alinha numa linha a partir de sm, com o
 * valor à direita — sem tabela, logo sem scroll horizontal em ecrã pequeno. */
/* A data/hora na LOCALIZAÇÃO da empresa ativa. Estava `toLocaleString("pt-BR")` escrito
 * à mão em três sítios desta página: um carimbo de data à brasileira sob o nome de uma
 * empresa portuguesa é o mesmo defeito de apresentação que o símbolo da moeda, só menos
 * visível. Sem locale conhecido usa-se o do browser, que é a resposta honesta — não se
 * inventa o de outra empresa. */
function dataHora(valor, formatting) {
  return new Date(valor).toLocaleString(formatting?.locale || undefined);
}

function Rubrica({ item, formatting }) {
  return (
    <li className={`flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${item.discreto ? "opacity-70" : ""}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{item.label}</span>
          {item.badge && (
            <StatusBadge variant={item.estado === COMPLETION_ITEM.POR_PREENCHER ? "warning"
              : item.estado === COMPLETION_ITEM.CONCLUIDO ? "success" : "neutral"}>
              {item.badge}
            </StatusBadge>
          )}
        </div>
        {item.detalhe && <p className="mt-0.5 text-xs text-slate-500">{item.detalhe}</p>}
        {item.nota && <p className="mt-0.5 text-xs text-slate-500">{item.nota}</p>}
      </div>

      <div className="shrink-0 sm:text-right">
        {item.value != null && (
          <p className="text-sm font-medium tabular-nums text-slate-900">
            {formatMoney(item.value, formatting)}
          </p>
        )}
        {item.atualizadoEm && (
          <p className="text-xs tabular-nums text-slate-500">
            Atualizado em {item.atualizadoEm}
          </p>
        )}
      </div>
    </li>
  );
}

function BlocoMes({ mes, formatting }) {
  return (
    <section className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* `first-letter:uppercase`, não `capitalize`: em português só a inicial do
            mês leva maiúscula. `capitalize` aplica-a a TODAS as palavras e escrevia
            "Julho De 2026". O rótulo chega em minúsculas de `monthLongLabel`. */}
        <h2 className="text-sm font-semibold first-letter:uppercase text-slate-900">{mes.monthLabel}</h2>
        <StatusBadge variant={TONE_BADGE[mes.tone] ?? "neutral"}>{mes.badge}</StatusBadge>
      </div>
      <p className="mt-1 text-xs text-slate-500">{mes.resumo}</p>

      {/* RESSALVA DAS FONTES — eixo distinto do que se pede ao utilizador.
          Ter preenchido tudo o que foi pedido não torna a análise do mês definitiva:
          as contas a pagar de um mês podem continuar a chegar depois de ele acabar.
          Só aparece quando `buildCompletionDataView` a apurou; nunca se desenha uma
          ressalva sem veredito. */}
      {mes.analise && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2">
          <StatusBadge variant="info">{mes.analise.badge}</StatusBadge>
          <span className="text-xs text-sky-900">{mes.analise.nota}</span>
        </div>
      )}

      {mes.itens.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {mes.itens.map((item) => <Rubrica key={item.key} item={item} formatting={formatting} />)}
        </ul>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════
 * CONFIRMAR COBERTURA — o segundo tipo de pendência deste ecrã.
 *
 * O primeiro tipo pede um VALOR que a plataforma não conhece (o CMV): "Introduzir
 * valor". Este pede a afirmação de um ESTADO que a plataforma não consegue apurar
 * sozinha: "Confirmar cobertura". Não há campo, porque não há número a introduzir.
 *
 * A confirmação é em DOIS PASSOS de propósito. O primeiro clique não confirma nada:
 * abre a frase exata que vai ser afirmada, com o que ela não significa por baixo. Um
 * clique único num botão chamado "confirmar cobertura" seria uma afirmação sobre a
 * contabilidade de um mês obtida com o mesmo esforço de fechar um banner.
 * ════════════════════════════════════════════════════════════════════════════════════ */
function CartaoCobertura({ card, onConfirmar, aConfirmar, formatting }) {
  const [aberto, setAberto] = useState(false);
  if (!card) return null;

  /* O tom é o do ESTADO do mês, não o do papel de quem vê. Um mês por confirmar é
   * âmbar para toda a gente — o `viewer` precisa de o notar tanto quanto o `owner`. */
  const tomBorda = (card.state === COVERAGE_CARD.POR_CONFIRMAR
    || card.state === COVERAGE_CARD.POR_CONFIRMAR_SEM_PERMISSAO)
    ? "border-amber-200 bg-amber-50/40"
    : card.state === COVERAGE_CARD.BLOQUEADO_POR_SNAPSHOT
      ? "border-slate-200 bg-slate-50/60"
      : "border-slate-200 bg-white";

  const Icone = card.state === COVERAGE_CARD.BLOQUEADO_POR_SNAPSHOT ? AlertTriangle : ShieldCheck;

  return (
    <section className={`${CARD} ${tomBorda} p-5 mb-4`}>
      <div className="flex flex-wrap items-start gap-3">
        <Icone size={18} className="mt-0.5 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">{card.titulo}</h3>
            {card.state === COVERAGE_CARD.POR_CONFIRMAR && (
              <StatusBadge variant="warning">Por confirmar</StatusBadge>
            )}
            {card.state === COVERAGE_CARD.EM_DIA && (
              <StatusBadge variant="success">Em dia</StatusBadge>
            )}
            {card.state === COVERAGE_CARD.BLOQUEADO_POR_SNAPSHOT && (
              <StatusBadge variant="info">A aguardar dados</StatusBadge>
            )}
            {/* `viewer`: o ESTADO é o mesmo (por confirmar) e a ação não existe. O
                distintivo diz "por confirmar" e não "sem permissão" — o que importa a
                quem lê é o estado do mês, não o seu próprio papel na conta. */}
            {card.state === COVERAGE_CARD.POR_CONFIRMAR_SEM_PERMISSAO && (
              <StatusBadge variant="warning">Por confirmar</StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{card.explicacao}</p>

          {/* CONTEXTO ANTES DA DECISÃO. Pedir uma confirmação sem mostrar sobre o quê
              é pedir uma assinatura em branco. */}
          {card.contexto.length > 0 && (
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {card.contexto.map((c) => (
                <div key={c.rotulo} className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-[11px] uppercase tracking-wider text-slate-500">{c.rotulo}</dt>
                  <dd className="text-xs font-semibold tabular-nums text-slate-700">
                    {c.tipo === "moeda" ? formatMoney(c.valor, formatting)
                      : c.tipo === "data" ? dataHora(c.valor, formatting)
                      : String(c.valor)}
                    {c.detalhe && <span className="ml-1 font-normal text-slate-500">· {c.detalhe}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {card.state === COVERAGE_CARD.POR_CONFIRMAR && !aberto && (
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="mt-4 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              {card.cta}
            </button>
          )}

          {card.state === COVERAGE_CARD.POR_CONFIRMAR && aberto && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm leading-relaxed text-slate-800">{card.confirmText}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{card.ressalva}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={aConfirmar}
                  onClick={() => onConfirmar(card.monthKey)}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {aConfirmar ? "A confirmar..." : card.cta}
                </button>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* PROVENIÊNCIA. Uma cobertura confirmada e uma de origem não podem ter o
              mesmo aspeto — e uma confirmação feita por engano tem de ser visível para
              poder ser corrigida. */}
          {card.origem?.source === "user" && card.origem.confirmedAt && (
            <p className="mt-3 text-[11px] text-slate-500">
              Cobertura confirmada nesta sessão em{" "}
              {dataHora(card.origem.confirmedAt, formatting)}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function AjustesManuais() {
  const { sales, manualInputs, loading, source, confirmarCobertura, cobertura } = useFinerData();

  /* ── QUEM PODE AFIRMAR ESTADO FINANCEIRO ──────────────────────────────────────────
   * `uiCan` e NÃO `can`: com autenticação desligada — o modo da instalação de hoje —
   * não existem papéis, e ligar isto a `can` faria o CTA desaparecer para o único
   * utilizador que existe. A distinção está documentada em `auth/uiPermissions.js`.
   *
   * Isto ESCONDE a ação; não a impede. Quem a forçar recebe 403 do BFF
   * (`WRITE_FINANCIAL_STATE` em `api/companies/[companyId]/manual-coverage.js`), e é
   * esse 403 que é a segurança. */
  const { uiCan } = useAuth();
  const podeEscrever = uiCan(CAPABILITIES.WRITE_FINANCIAL_STATE);

  /* Formatação da empresa ATIVA, passada explicitamente. Esta página deixa assim de
   * depender do registo global de `lib/activeFormatting.js`. */
  const { formatting } = useCompany();

  /* Os fechos vêm já apurados no dataset — os mesmos que alimentam os alertas, o
   * Resumo e a Performance. Esta página não recalcula o motor: apenas o apresenta.
   * O documento de ajustes manuais entra só para acrescentar data e nota. */
  const { state, months } = buildCompletionDataView({
    closings: sales?.closings ?? null,
    manualInputs,
    loading,
  });

  /* O cartão de cobertura é derivado do MESMO dataset — nenhuma leitura própria e
   * nenhum estado duplicado. Quando não há nada a dizer, é `null` e a secção não
   * existe, em vez de existir vazia. */
  const cartaoCobertura = buildCoverageConfirmationCard({ sales, source, canWrite: podeEscrever });

  return (
    <div>
      <PageHeader
        title="Dados a completar"
        subtitle="Consulte os dados necessários para completar os cálculos financeiros de cada período."
      />

      {/* A cobertura vem ANTES da lista de meses: é o único bloqueio deste ecrã que
          não se resolve preenchendo um campo, e resolvê-lo muda o que a lista abaixo
          diz. Pô-la no fim faria o utilizador preencher primeiro e descobrir depois. */}
      <CartaoCobertura
        card={cartaoCobertura}
        onConfirmar={confirmarCobertura}
        aConfirmar={cobertura?.aConfirmar === true}
        formatting={formatting}
      />

      {state === COMPLETION_VIEW.LOADING && <EstadoCarregamento />}
      {state === COMPLETION_VIEW.EMPTY && <EstadoVazio />}
      {state === COMPLETION_VIEW.MONTHS && (
        <>
          <div className="space-y-4">
            {months.map((mes) => <BlocoMes key={mes.monthKey} mes={mes} formatting={formatting} />)}
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <Info size={14} className="mt-0.5 shrink-0" />
            Os valores introduzidos manualmente são utilizados nos cálculos financeiros.
            Os indicadores afetados são identificados como incluindo dados manuais.
            Confirmar cobertura é diferente: não introduz nenhum valor, apenas diz à
            plataforma que o período já pode ser analisado.
          </p>
        </>
      )}
    </div>
  );
}
