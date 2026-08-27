// src/auth/companyDataScope.js
// O DATASET CARREGADO É DESTA EMPRESA? — puro, sem React.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE MÓDULO TEVE DE EXISTIR
// ═══════════════════════════════════════════════════════════════════════════════════
// Apanhado a validar no Chrome, com o utilizador multiempresa. A sequência era esta:
//
//   1. o seletor de empresas passou a funcionar e o utilizador trocou para outra;
//   2. `FinerDataProvider` continua a chamar `loadFinerData()` sem `companyId` — a
//      leitura só passa a ser escopada por empresa no passo D do plano de migração;
//   3. logo, o dataset no ecrã continuava a ser o da Overcel;
//   4. mas a barra lateral já dizia o nome da OUTRA empresa.
//
// Resultado: os números reais de uma empresa apresentados sob o nome de outra. É a
// pior falha possível num produto financeiro — pior do que não mostrar nada, e pior do
// que um erro visível, porque nada no ecrã denuncia o problema.
//
// ─── A REGRA ────────────────────────────────────────────────────────────────────────
// Se a empresa ATIVA não é aquela a que o dataset pertence, não se mostra o dataset.
// Não se mostra outro. Não se mostra zero. Mostra-se que não há dados para esta empresa.
//
// É exatamente o contrato que o projeto já aplica em todos os outros eixos:
// `unavailable` nunca vira zero, e dados ausentes não se inventam. Aqui a ausência é
// de LIGAÇÃO, não de valores — e continua a ser ausência.
//
// ─── ESTE MÓDULO DESAPARECE ─────────────────────────────────────────────────────────
// Quando a leitura passar a ser `GET /api/companies/:companyId/financial-data`, o
// dataset será sempre da empresa ativa por construção e este ficheiro deixa de ter
// razão de ser. Até lá, é a diferença entre uma migração incremental honesta e uma que
// mente durante os passos intermédios.

export const COMPANY_DATA_SCOPE = {
  /** O dataset pertence à empresa ativa. Tudo normal. */
  LIGADA: "ligada",
  /** A empresa ativa não é a do dataset. Não há dados para mostrar. */
  NAO_LIGADA: "nao_ligada",
  /** Não há dataset (a carregar, demonstração, avaria). Outra camada já decide. */
  SEM_DATASET: "sem_dataset",
};

/**
 * @param {object} args
 * @param {string|null} args.activeCompanyId  Empresa ativa (da sessão ou da config).
 * @param {string|null} args.datasetCompanyId `sales.companyId`.
 * @returns {{scope: string, activeCompanyId: string|null, datasetCompanyId: string|null}}
 */
export function resolveCompanyDataScope({ activeCompanyId, datasetCompanyId } = {}) {
  const ativa = typeof activeCompanyId === "string" && activeCompanyId !== "" ? activeCompanyId : null;
  const dados = typeof datasetCompanyId === "string" && datasetCompanyId !== "" ? datasetCompanyId : null;

  if (!dados) {
    return { scope: COMPANY_DATA_SCOPE.SEM_DATASET, activeCompanyId: ativa, datasetCompanyId: null };
  }

  /* Sem empresa ativa identificada, NÃO se bloqueia: é o modo sem autenticação, em que
   * há uma empresa só e é a do dataset. Bloquear aqui partiria a aplicação atual para
   * resolver um problema que ela não tem. */
  if (!ativa) {
    return { scope: COMPANY_DATA_SCOPE.LIGADA, activeCompanyId: null, datasetCompanyId: dados };
  }

  return {
    scope: ativa === dados ? COMPANY_DATA_SCOPE.LIGADA : COMPANY_DATA_SCOPE.NAO_LIGADA,
    activeCompanyId: ativa,
    datasetCompanyId: dados,
  };
}

/** Pode montar-se as páginas financeiras com este dataset? */
export function podeApresentarDados(resultado) {
  return !!resultado && resultado.scope !== COMPANY_DATA_SCOPE.NAO_LIGADA;
}
