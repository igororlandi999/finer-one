// src/services/dataTransport.js
// COMO É QUE OS DADOS FINANCEIROS CHEGAM — a fronteira entre o que a aplicação lê e
// POR ONDE o lê.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O PROBLEMA QUE ISTO RESOLVE (FASE 8)
// ═══════════════════════════════════════════════════════════════════════════════════
// `blingDataService.js` tem ~1300 linhas de normalização, reconciliação e contratos
// financeiros, e três funções lá dentro — `fetchRawSales`, `fetchRawPayables`,
// `fetchRawReceivables` — chamam `apiGet("pedidos/vendas")` DIRETAMENTE. Esse endpoint
// é o proxy anónimo de hoje: sem token, sem empresa, um só conjunto de dados.
//
// Quando o Supabase existir, a leitura passa a ser
// `GET /api/companies/:companyId/financial-data`, com token. Sem esta fronteira, essa
// migração seria uma edição no meio do motor financeiro — que é o sítio do projeto onde
// menos se quer mexer, e o único onde um erro produz números errados em vez de um ecrã
// avariado.
//
// Com esta fronteira, a migração é trocar QUAL transporte se passa a `loadFinerData`.
// Nem uma linha de normalização muda.
//
// ─── A INTERFACE, INTEIRA ───────────────────────────────────────────────────────────
//   { id, protegido: boolean, companyId: string|null, ler(recurso) => Promise<payload> }
//
// `recurso` é um de RECURSOS. O transporte traduz para o protocolo concreto — e é
// PRECISAMENTE essa tradução que difere entre os dois:
//
//   legacy     GET {API}/pedidos/vendas?recurso=despesas        (sem "recurso" p/ pedidos)
//   protegido  GET {API}/companies/{id}/financial-data?recurso=pedidos   + Bearer token
//
// ─── PORQUE O TRANSPORTE PROTEGIDO NÃO SE LIGA SOZINHO ──────────────────────────────
// Porque ligá-lo antes de o BFF existir transformaria uma aplicação que funciona numa
// aplicação que devolve 404 em todas as leituras. `resolveDataTransport` exige TRÊS
// condições simultâneas, e a ausência de qualquer uma devolve o transporte legado —
// que é o comportamento de hoje, byte a byte.
//
// A decisão é uma FUNÇÃO PURA e testada, e não um `if` dentro de um provider, para que
// o dia da troca seja uma mudança de ambiente e não uma alteração de código.

import { apiGet, isApiConfigured } from "./api.js";
import { createAuthorizedApi } from "./authorizedApi.js";
import { isValidCompanyId } from "../auth/authorizationCore.js";

/** Os recursos que a aplicação lê. Nomes do CONTRATO do BFF, não do Apps Script. */
export const RECURSOS = {
  PEDIDOS: "pedidos",
  DESPESAS: "despesas",
  RECEBIVEIS: "recebiveis",
  AJUSTES_MANUAIS: "ajustes-manuais",
};

export const TRANSPORTE = {
  /** O proxy anónimo de hoje. Um só conjunto de dados, sem empresa e sem token. */
  LEGADO: "legado",
  /** `/api/companies/:companyId/financial-data`, com Bearer token. O destino. */
  PROTEGIDO: "protegido",
  /** Sem backend configurado: não há por onde ler. */
  NENHUM: "nenhum",
};

/** Porque é que se escolheu o transporte que se escolheu. Para diagnóstico e testes —
 *  um transporte que cai para legado sem se explicar é uma migração que ninguém
 *  consegue verificar que aconteceu. */
export const TRANSPORTE_MOTIVO = {
  SEM_BACKEND: "sem_backend",
  AUTENTICACAO_DESLIGADA: "autenticacao_desligada",
  SEM_EMPRESA_VALIDA: "sem_empresa_valida",
  SEM_TOKEN: "sem_token",
  PROTEGIDO_NAO_ATIVADO: "protegido_nao_ativado",
  PRONTO: "pronto",
};

/* ═══════════════════════════════════════════════════════════════════════════════════
 * TRANSPORTE LEGADO — o de hoje, sem uma única mudança de comportamento
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/* O protocolo do Apps Script: "pedidos" é o caso por omissão e NÃO leva `?recurso=`.
 * Este mapa é a única cópia dessa peculiaridade no frontend. */
const RECURSO_LEGADO = {
  [RECURSOS.PEDIDOS]: null,
  [RECURSOS.DESPESAS]: "despesas",
  [RECURSOS.RECEBIVEIS]: "recebiveis",
  [RECURSOS.AJUSTES_MANUAIS]: "ajustes-manuais",
};

export function createLegacyDataTransport() {
  return {
    id: TRANSPORTE.LEGADO,
    protegido: false,
    companyId: null,
    async ler(recurso) {
      const upstream = RECURSO_LEGADO[recurso];
      return upstream
        ? apiGet("pedidos/vendas", { params: { recurso: upstream } })
        : apiGet("pedidos/vendas");
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * TRANSPORTE PROTEGIDO — o destino
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} args
 * @param {string} args.companyId                     Da empresa ATIVA (CompanyContext).
 * @param {() => Promise<string|null>} args.getAccessToken  Do AuthAdapter, a cada chamada.
 * @param {Function} [args.onUnauthorized]            401: a sessão morreu do lado do servidor.
 *
 * Nada aqui sabe o que é o Supabase. Recebe uma função que devolve um token; quem a
 * fabrica é a camada de autenticação. É o que mantém `services/` ignorante do provider
 * — ver FASE 9.
 */
export function createProtectedDataTransport({ companyId, getAccessToken, onUnauthorized } = {}) {
  const api = createAuthorizedApi({ getAccessToken, companyId, onUnauthorized });
  return {
    id: TRANSPORTE.PROTEGIDO,
    protegido: true,
    companyId,
    async ler(recurso) {
      /* `financial-data` é o recurso; o `companyId` já vai no caminho, posto lá por
       * `companyPath`. O `recurso` viaja em query, e o BFF valida-o contra a sua
       * própria lista de permissão — não se confia nesta lista para nada. */
      return api.get("financial-data", { params: { recurso } });
    },
  };
}

/** Transporte que não lê nada. Existe para que "sem backend" seja um objeto com a mesma
 *  forma, e não um `null` que cada chamador tenha de lembrar-se de testar. */
export function createNullDataTransport(motivo = TRANSPORTE_MOTIVO.SEM_BACKEND) {
  return {
    id: TRANSPORTE.NENHUM,
    protegido: false,
    companyId: null,
    motivo,
    async ler() { return null; },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════
 * A ESCOLHA
 * ═══════════════════════════════════════════════════════════════════════════════════ */

/**
 * A configuração pediu o transporte protegido?
 *
 * Variável PÚBLICA e booleana — não é um segredo, é um interruptor de migração. O nome
 * diz o que faz para que ninguém a ligue por engano a pensar que é performance.
 */
export function protectedTransportRequested(env) {
  const v = env && env.VITE_PROTECTED_DATA_TRANSPORT;
  return v === true || v === "true" || v === "1";
}

/**
 * Que transporte usar, e porquê.
 *
 * ─── AS TRÊS CONDIÇÕES, E PORQUE SÃO TRÊS ───────────────────────────────────────────
 *   1. autenticação EM VIGOR      sem provider a sério não há token para enviar, e um
 *                                 pedido protegido sem token é um 401 garantido;
 *   2. empresa ATIVA válida       o `companyId` vai no CAMINHO. Sem ele não há URL;
 *   3. interruptor LIGADO         o BFF tem de existir e estar publicado. Enquanto não
 *                                 estiver, ligar isto parte todas as leituras.
 *
 * ─── E O QUE ACONTECE QUANDO FALTA UMA ─────────────────────────────────────────────
 * DEPENDE DE QUAL. Esta função devolvia o transporte LEGADO em todos os casos, e isso
 * era um BYPASS quando o interruptor já estava ligado.
 *
 * O legado é ANÓNIMO: serve os dados financeiros da Overcel sem token e sem membership.
 * Cair para ele com o interruptor LIGADO significa que um utilizador autenticado cuja
 * empresa ativa ainda não resolveu — o estado normal durante o arranque, e o estado
 * PERMANENTE de quem não tem membership nenhuma — recebe os números reais de uma
 * empresa a que pode não pertencer. `companyId` vem de `company?.id ?? null`, portanto
 * `null` não é hipotético: é o valor durante todo o carregamento das memberships.
 *
 * Passa a haver duas famílias:
 *
 *   interruptor DESLIGADO, ou autenticação fora de vigor
 *     -> LEGADO. É o comportamento de hoje, e é uma decisão explícita: quem não pediu
 *        o transporte protegido continua onde estava.
 *
 *   interruptor LIGADO e autenticação em vigor, mas falta empresa ou token
 *     -> NENHUM. Sem dados. Nunca o anónimo.
 *        Quem pediu leituras autenticadas não pode receber, em silêncio, uma leitura
 *        que não é autenticada — e muito menos de outra empresa. "Sem dados" é honesto
 *        e visível; um número errado no ecrã não é nem uma coisa nem outra.
 *
 * O `motivo` continua a dizer exatamente o que faltou, nos dois casos.
 *
 * @returns {{transport: object, motivo: string}}
 */
export function resolveDataTransport({
  env,
  requiresAuth,
  companyId,
  getAccessToken,
  onUnauthorized,
} = {}) {
  if (!isApiConfigured()) {
    return { transport: createNullDataTransport(), motivo: TRANSPORTE_MOTIVO.SEM_BACKEND };
  }

  if (!protectedTransportRequested(env)) {
    return { transport: createLegacyDataTransport(), motivo: TRANSPORTE_MOTIVO.PROTEGIDO_NAO_ATIVADO };
  }
  if (requiresAuth !== true) {
    return { transport: createLegacyDataTransport(), motivo: TRANSPORTE_MOTIVO.AUTENTICACAO_DESLIGADA };
  }
  /* ── DAQUI PARA BAIXO O INTERRUPTOR ESTÁ LIGADO E A AUTENTICAÇÃO EM VIGOR ───────
   * Ou seja: alguém decidiu que as leituras desta instalação são autenticadas. A partir
   * daqui, o legado anónimo deixa de ser uma alternativa aceitável — seria servir dados
   * financeiros reais sem token nem membership a quem pediu o contrário. */
  if (!isValidCompanyId(companyId)) {
    return {
      transport: createNullDataTransport(TRANSPORTE_MOTIVO.SEM_EMPRESA_VALIDA),
      motivo: TRANSPORTE_MOTIVO.SEM_EMPRESA_VALIDA,
    };
  }
  if (typeof getAccessToken !== "function") {
    return {
      transport: createNullDataTransport(TRANSPORTE_MOTIVO.SEM_TOKEN),
      motivo: TRANSPORTE_MOTIVO.SEM_TOKEN,
    };
  }

  return {
    transport: createProtectedDataTransport({ companyId, getAccessToken, onUnauthorized }),
    motivo: TRANSPORTE_MOTIVO.PRONTO,
  };
}
