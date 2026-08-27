// src/lib/activeFormatting.js
// A FORMATAÇÃO DA EMPRESA ATIVA, num registo com UM ÚNICO ESCRITOR.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE EXISTE ESTADO DE MÓDULO NUM PROJETO QUE O EVITA EM TODO O RESTO
// ═══════════════════════════════════════════════════════════════════════════════════
// Porque a alternativa era pior, e a diferença é medível.
//
// `formatMoney(v, company)` já aceita a empresa. O problema é o DEFAULT: era
// `ACTIVE_COMPANY`, a configuração compilada da Overcel. Havia 114 chamadas em 15
// ficheiros sem segundo argumento — e cada uma delas afirmava "R$" fosse qual fosse a
// empresa ativa. Com o seletor de empresas a funcionar, isso deixou de ser um detalhe
// de migração e passou a ser o defeito que a FASE 3 proíbe por escrito:
//
//     empresa B selecionada + qualquer label financeira de A = inaceitável.
//
// Havia dois caminhos:
//
//   1. passar `formatting` a 114 sítios. Explícito, e é o destino. Mas até o último
//      estar feito, os que faltam continuam a mentir — e "os que faltam" é precisamente
//      onde os defeitos vivem. Uma migração que resolve 90% de um problema de
//      APRESENTAÇÃO DE MOEDA não resolve 90% do problema: deixa 10% de ecrãs a dizer
//      reais sobre euros, que é o mesmo risco com menos sítios onde procurar.
//
//   2. mudar o DEFAULT, de "a Overcel compilada" para "a empresa ativa". Todas as 114
//      chamadas passam a seguir a empresa no mesmo instante, e as que já passam
//      `formatting` explicitamente continuam a ganhar — o argumento explícito tem
//      sempre precedência.
//
// Escolheu-se 2, e 1 continua a ser o destino: cada página que passe a receber
// `formatting` de `useCompany()` é uma página que deixa de depender deste registo.
//
// ─── AS REGRAS QUE TORNAM ISTO SEGURO ───────────────────────────────────────────────
//   - UM escritor: `CompanyProvider`, e mais nenhum. Há um teste que o impõe
//     (`formatacaoAtiva.test.js`), por leitura do código-fonte;
//   - o registo NUNCA é lido para decidir nada — só para APRESENTAR. Nenhum motor
//     financeiro o importa, e nenhum cálculo depende dele;
//   - sem nada registado, cai na configuração compilada, que é o comportamento de hoje.
//     Nenhum teste existente muda de resultado;
//   - `reset` é exportado para os testes, para que nenhum teste possa herdar a empresa
//     que outro registou.
//
// ─── E SE A EMPRESA ATIVA NÃO TIVER MOEDA? ──────────────────────────────────────────
// Então não se inventa uma. Ver `companyForFormatting` em `auth/companyProfile.js`:
// uma empresa que não é a da configuração e que não declara moeda produz
// `currency: null`, e `lib/currency.js` formata o número SEM SÍMBOLO nenhum.
//
// Um número sem símbolo é incompleto e vê-se que é. "R$ 84.300,00" sobre euros é
// completo, errado, e não se vê — que é a diferença entre um ecrã que pede atenção e um
// ecrã que engana.

import { ACTIVE_COMPANY } from "../config/company.js";

/** De onde veio a formatação em uso. Para a UI o poder dizer, e para os testes o poderem
 *  afirmar sem espiar o estado interno. */
export const FORMATTING_ORIGIN = {
  /** Registada pelo `CompanyProvider` a partir da empresa ativa. */
  COMPANY: "company",
  /** Nenhuma registada: a configuração compilada (`config/company.js`). */
  CONFIG: "config",
};

/* O estado. Privado ao módulo — não é exportado, e as únicas portas são as funções
 * abaixo. Uma variável exportada seria escrevível por qualquer importador. */
let registada = null;

/** A formatação da configuração compilada. O fallback, explícito e documentado. */
function daConfiguracao() {
  return {
    currency: ACTIVE_COMPANY.currency ?? null,
    locale: ACTIVE_COMPANY.locale ?? null,
    origin: FORMATTING_ORIGIN.CONFIG,
  };
}

/**
 * REGISTA a formatação da empresa ativa. Chamado SÓ por `CompanyProvider`.
 *
 * @param {{currency: string|null, locale: string|null}|null} formatting
 *   `null` limpa o registo (logout, sessão perdida) — e limpar faz voltar ao fallback
 *   da configuração, nunca a um estado sem moeda nenhuma.
 *
 * Aceita `currency: null` de propósito: é assim que uma empresa sem moeda declarada
 * chega aqui, e é isso que faz os valores aparecerem sem símbolo em vez de aparecerem
 * com o símbolo de outra empresa.
 */
export function setActiveFormatting(formatting) {
  if (formatting === null || formatting === undefined) { registada = null; return; }
  if (typeof formatting !== "object") { registada = null; return; }

  const currency = typeof formatting.currency === "string" && formatting.currency.length === 3
    ? formatting.currency.toUpperCase()
    : null;
  const locale = typeof formatting.locale === "string" && formatting.locale !== ""
    ? formatting.locale
    : null;

  /* Nem moeda nem locale não é uma empresa: é um objeto vazio. Trata-se como limpar,
   * para que um perfil totalmente vazio não bloqueie a aplicação num estado sem
   * formatação nenhuma. */
  if (currency === null && locale === null) { registada = null; return; }

  registada = { currency, locale, origin: FORMATTING_ORIGIN.COMPANY };
}

/** A formatação em uso. Nunca devolve `null`: há sempre uma resposta. */
export function getActiveFormatting() {
  return registada ?? daConfiguracao();
}

/** Limpa o registo. Para os testes, e para o logout. */
export function resetActiveFormatting() {
  registada = null;
}
