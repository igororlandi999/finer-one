// src/auth/companyProfile.js
// O PERFIL DA EMPRESA ATIVA — puro, e o ponto de transição entre `ACTIVE_COMPANY`
// (compilado) e a empresa que vem da sessão.
//
// ─── PORQUE NÃO SE APAGA `ACTIVE_COMPANY` HOJE ──────────────────────────────────────
// Porque a aplicação inteira corre sobre ele e há uma empresa real, com dados reais,
// a ser usada todos os dias. Remover a configuração compilada antes de existir um
// backend que a devolva transformaria a Finer One numa aplicação sem moeda, sem locale
// e sem cobertura — e "sem moeda" não é um estado degradado, é um ecrã de números que
// não se sabe se são reais ou euros.
//
// A transição é por ADAPTADOR: este módulo responde sempre, e diz DE ONDE veio a
// resposta. Página a página, quem lê `ACTIVE_COMPANY` diretamente passa a ler daqui.
// No fim, a configuração fica só como fallback de desenvolvimento e a remoção é uma
// linha, não uma migração.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A REGRA QUE IMPEDE CONTAMINAÇÃO ENTRE EMPRESAS
// ═══════════════════════════════════════════════════════════════════════════════════
// `ACTIVE_COMPANY.historyCoverage` descreve a cobertura dos snapshots DA OVERCEL. Se um
// utilizador multiempresa trocar para outra empresa, aplicar-lhe essa cobertura diria
// que os documentos de despesas de uma empresa estão disponíveis até junho — com base
// no que se sabe de OUTRA. Seria inventar um facto financeiro sobre uma empresa a
// partir dos dados de uma terceira.
//
// Por isso a cobertura só é herdada quando o id BATE CERTO. Para qualquer outra
// empresa, a cobertura é `null` — e `null` já tem significado no motor: indisponível.
// Que é a verdade: ainda não há backend que a saiba responder.
//
// É o mesmo princípio dos contratos financeiros permanentes: `unavailable` nunca vira
// zero, e ausência de dados não se inventa.

import { ACTIVE_COMPANY } from "../config/company.js";

/** De onde veio o perfil que está a ser usado. */
export const COMPANY_PROFILE_ORIGIN = {
  /** Da sessão autenticada — o destino desta arquitetura. */
  SESSION: "session",
  /** Da configuração compilada (`src/config/company.js`) — o estado atual. */
  CONFIG: "config",
};

/**
 * Resolve o perfil da empresa ativa.
 *
 * @param {object} args
 * @param {object|null} args.sessionCompany  A empresa da sessão (shape de `sessionContract`).
 * @param {object} [args.fallback]           Configuração compilada. Injetável para testes.
 * @returns {{
 *   id, name, currency, locale, timezone, plan,
 *   historyCoverage: object|null,
 *   origin: string,
 *   coverageOrigin: string|null,
 *   complete: boolean
 * }}
 *   `complete: false` sinaliza um perfil a que falta moeda ou locale — a camada de
 *   formatação tem de saber que está a usar um fallback, em vez de o descobrir por um
 *   símbolo errado num CSV exportado.
 */
export function resolveCompanyProfile({ sessionCompany, fallback = ACTIVE_COMPANY } = {}) {
  const cfg = fallback || {};

  if (!sessionCompany || typeof sessionCompany.companyId !== "string") {
    return {
      id: cfg.id ?? null,
      name: cfg.name ?? null,
      currency: cfg.currency ?? null,
      locale: cfg.locale ?? null,
      timezone: cfg.timezone ?? null,
      plan: cfg.plan ?? null,
      historyCoverage: cfg.historyCoverage ?? null,
      origin: COMPANY_PROFILE_ORIGIN.CONFIG,
      coverageOrigin: cfg.historyCoverage ? COMPANY_PROFILE_ORIGIN.CONFIG : null,
      complete: !!(cfg.currency && cfg.locale),
    };
  }

  /* A empresa da sessão pode não trazer moeda nem locale (uma linha de `companies`
   * incompleta). Nesse caso herda-se da configuração — mas SÓ se for a mesma empresa.
   * Herdar a moeda da Overcel para uma empresa portuguesa apresentaria euros como
   * reais, e nenhum número no ecrã denunciaria o erro. */
  const mesmaEmpresa = cfg.id != null && sessionCompany.companyId === cfg.id;

  const currency = sessionCompany.currency ?? (mesmaEmpresa ? cfg.currency ?? null : null);
  const locale = sessionCompany.locale ?? (mesmaEmpresa ? cfg.locale ?? null : null);

  return {
    id: sessionCompany.companyId,
    name: sessionCompany.name ?? sessionCompany.companyId,
    currency,
    locale,
    timezone: sessionCompany.timezone ?? (mesmaEmpresa ? cfg.timezone ?? null : null),
    plan: sessionCompany.plan ?? null,
    /* Ver o cabeçalho: só a MESMA empresa herda a cobertura configurada. */
    historyCoverage: mesmaEmpresa ? (cfg.historyCoverage ?? null) : null,
    origin: COMPANY_PROFILE_ORIGIN.SESSION,
    coverageOrigin: mesmaEmpresa && cfg.historyCoverage ? COMPANY_PROFILE_ORIGIN.CONFIG : null,
    complete: !!(currency && locale),
  };
}

/**
 * O perfil no shape que `lib/currency.js` já consome (`{currency, locale}`).
 *
 * Existe para que a migração das páginas seja uma troca de argumento e não uma
 * reescrita: `formatMoney(v)` passa a `formatMoney(v, companyForFormatting(perfil))`.
 *
 * Um perfil meio preenchido não produz um híbrido. `Intl.NumberFormat(undefined,
 * {currency:"BRL"})` formata na língua do browser — o valor certo com as separações de
 * milhares de outro país, que é o tipo de erro que ninguém repara e toda a gente exporta.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * A MOEDA DA CONFIGURAÇÃO NÃO SE EMPRESTA A OUTRA EMPRESA
 * ═══════════════════════════════════════════════════════════════════════════════════
 * É a mesma regra que já governa a COBERTURA, acima, e por exatamente a mesma razão.
 *
 * Antes, qualquer perfil incompleto caía na configuração inteira. Consequência: um
 * utilizador multiempresa que trocasse para uma empresa cuja linha de `companies` não
 * declara moeda via os valores dessa empresa apresentados em REAIS, com o símbolo da
 * Overcel — porque a Overcel é que está compilada aqui. É a FASE 3 ao contrário:
 * empresa B no seletor, moeda de A no ecrã.
 *
 * Agora só a MESMA empresa herda. Para outra empresa sem moeda declarada devolve-se
 * `currency: null`, e `lib/currency.js` formata sem símbolo — um número incompleto, que
 * se vê que está incompleto. É o mesmo princípio de `unavailable` nunca virar zero:
 * ausência apresenta-se como ausência.
 *
 * O `locale` é mais brando de propósito: herdá-lo afeta onde vai o ponto e onde vai a
 * vírgula, não que moeda se afirma. Um agrupamento de dígitos à brasileira num valor sem
 * símbolo não afirma nada de falso; um "R$" afirma.
 */
export function companyForFormatting(perfil, fallback = ACTIVE_COMPANY) {
  const cfg = fallback || {};

  if (perfil && perfil.currency && perfil.locale) {
    return { currency: perfil.currency, locale: perfil.locale };
  }

  /* Uma empresa IDENTIFICADA e diferente da configuração: não herda a moeda. */
  const outraEmpresa = perfil && perfil.id != null && cfg.id != null && perfil.id !== cfg.id;
  if (outraEmpresa) {
    return {
      currency: perfil.currency ?? null,
      locale: perfil.locale ?? cfg.locale ?? null,
    };
  }

  return { currency: cfg.currency ?? null, locale: cfg.locale ?? null };
}
