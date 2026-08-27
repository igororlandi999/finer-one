// src/utils/closingAlerts.js
// Traduz pendências de fecho em ALERTAS. Domínio separado de propósito:
// `monthlyClosing.js` não conhece o sistema de alertas, e este ficheiro não sabe
// calcular fecho nenhum — recebe resultados já apurados e limita-se a redigi-los.
//
// Não menciona integrações, ERPs, API nem vocabulário técnico de availability: o
// empresário lê "falta informar o CMV", não "cmv unavailable".

import { mesPorExtenso } from "./alertsEngine.js";
import { closedMonthKeys, CLOSING_STATUS } from "./monthlyClosing.js";

/* Categoria própria. As categorias do sistema são rótulos de apresentação livres
 * ("Rentabilidade", "Despesas", "Faturação") e não estão acopladas a filtros — estes
 * são por severidade. Reaproveitar "Rentabilidade" seria enganador: a pendência não
 * diz nada sobre rentabilidade, diz que falta um dado para a poder calcular. */
export const CLOSING_ALERT_CATEGORY = "Fecho mensal";

export const CLOSING_ALERT_ACAO = "Completar dados";

/** Ação de um alerta que o utilizador NÃO resolve no Finer One. "—" é o mesmo
 *  marcador de ausência que alertsEngine já usa: não se inventa um botão. */
export const CLOSING_ALERT_SEM_ACAO = "—";

/** Id determinístico, ancorado no mês. Sem relógio: o mesmo problema não pode gerar
 *  um alerta novo a cada recarregamento da página. */
export function closingAlertId(monthKey) {
  return `closing-${monthKey}`;
}

/** Id do alerta de análise parcial. Prefixo próprio para nunca colidir com o de
 *  pendências: são problemas diferentes e um mês pode, em teoria, ter os dois. */
export function closingAnalysisAlertId(monthKey) {
  return `closing-analise-${monthKey}`;
}

function descricaoDe(missingItems) {
  const n = missingItems.length;
  if (n === 1) {
    return `Falta informar o ${missingItems[0].label} para completar os cálculos financeiros do mês.`;
  }
  return `Existem ${n} dados obrigatórios por preencher para completar o fecho financeiro do mês.`;
}

/**
 * Alertas de fecho, um por mês incompleto.
 *
 * Um alerta por MÊS, não por rubrica: três dados em falta em julho são um problema
 * ("julho não fecha"), não três problemas. Multiplicar linhas afogaria a lista.
 *
 * Severidade: o mês imediatamente anterior tem foco, porque é o que ainda se fecha a
 * tempo; meses mais atrás da janela ficam em atenção. A gradação é por recência e não
 * por número de dias — nenhuma escalada temporal foi aprovada.
 *
 * @param {{closings?: Array, now?: Date}} args `closings` são resultados de
 *   buildMonthlyClosing; meses completos ou em curso são simplesmente ignorados.
 * @returns {Array} alertas no formato do sistema, ordenados do mês mais recente para o
 *   mais antigo.
 */
export function buildClosingAlerts({ closings, now = new Date() } = {}) {
  const lista = Array.isArray(closings) ? closings : [];
  // Mês imediatamente anterior ao atual, calculado a partir do relógio e não da lista:
  // assim a severidade não muda por alguém passar os meses noutra ordem.
  const mesAnterior = closedMonthKeys({ now, count: 1 })[0] || null;

  return [...pendencias(lista, mesAnterior), ...analiseParcial(lista)];
}

/* ══════════════════════════════════════════════════════════════════════════════════
 * DOIS PROBLEMAS DIFERENTES, DOIS ALERTAS DIFERENTES.
 *
 *   pendências     -> falta um dado que o UTILIZADOR tem de introduzir. Acionável,
 *                     com destino (o ecrã de preenchimento) e severidade real.
 *   análise parcial -> o utilizador já fez tudo o que lhe foi pedido, mas as FONTES
 *                     do período ainda não estão completas. Não é acionável no
 *                     produto: resolve-se no ERP, ou com o tempo.
 *
 * Separá-los é o que impede as duas mentiras simétricas: pedir ao utilizador algo
 * que ele não pode resolver, e deixar o mês parecer resolvido quando não está.
 * Antes desta separação, lançar o CMV de um mês fazia o alerta desaparecer por
 * inteiro — e um mês com o EBITDA ainda parcial ficava sem sinal nenhum.
 * ════════════════════════════════════════════════════════════════════════════════ */

function pendencias(lista, mesAnterior) {
  return lista
    .filter((c) => c && c.status === CLOSING_STATUS.INCOMPLETE && (c.missingItems || []).length > 0)
    .slice()
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0))
    .map((c) => {
      const missing = c.missingItems;
      const temCritico = missing.some((i) => i.priority === "critical");
      const severity = (c.monthKey === mesAnterior && temCritico) ? "danger" : "warning";

      return {
        id: closingAlertId(c.monthKey),
        severity,
        category: CLOSING_ALERT_CATEGORY,
        title: `Fecho de ${mesPorExtenso(c.monthKey) || c.monthKey} incompleto`,
        description: descricaoDe(missing),
        timestamp: null,          // preenchido a jusante, como nos restantes alertas
        acao: CLOSING_ALERT_ACAO,
        // Metadata aditiva: a página de Alertas lê campos nomeados e ignora o resto.
        // Serve para uma futura ligação ao ecrã de preenchimento, sem obrigar a
        // reconstruir o fecho a partir do texto do alerta.
        monthKey: c.monthKey,
        missingKeys: missing.map((i) => i.key),
      };
    });
}

/* Causas por que uma linha essencial ficou incompleta, redigidas para quem lê. Os
 * códigos vêm de financialCompleteness.LINE_CAUSE; a frase vive aqui, como todas as
 * outras deste ficheiro. `por_informar` não aparece de propósito: um requisito por
 * preencher é uma PENDÊNCIA e tem o seu próprio alerta. */
const CAUSA_TEXTO = {
  cobertura: "o período ainda não fechou na origem",
  classificacao: "há títulos por classificar",
  sem_fonte: "a fonte não tem dados do período",
};

function analiseParcial(lista) {
  return lista
    .filter((c) => {
      const fin = c && c.financial;
      if (!fin) return false;
      /* SÓ meses cujos requisitos estão COMPLETOS. Esta é a condição que dá sentido à
       * frase "os dados pedidos foram preenchidos" — e é também a que impede os dois
       * falsos positivos que a suite apanhou:
       *   - INDETERMINATE (receita parcial, ou mês anterior à cobertura histórica): a
       *     plataforma não sabe sequer o que é exigível ali. Anunciar "análise parcial"
       *     seria afirmar sobre um mês que existe para não se afirmar nada.
       *   - IN_PROGRESS: o mês ainda decorre; não está parcial, está a acontecer.
       * Um mês INCOMPLETE fica de fora porque já tem o seu alerta de pendência, e dois
       * alertas para o mesmo mês transformariam a lista em ruído. */
      if (c.status !== CLOSING_STATUS.COMPLETE) return false;
      const estado = fin.financialAnalysisStatus;
      if (estado == null || estado === "complete" || estado === "in_progress") return false;
      return (c.missingItems || []).length === 0;
    })
    .slice()
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0))
    .map((c) => {
      const bloqueios = c.financial.blockers || [];
      const causas = [...new Set(bloqueios.flatMap((b) => b.causes || []))]
        .map((cod) => CAUSA_TEXTO[cod])
        .filter(Boolean);
      const rubricas = bloqueios.map((b) => b.label).join(", ");

      return {
        id: closingAnalysisAlertId(c.monthKey),
        /* `info`, nunca `warning`: nada está errado e nada está em atraso por culpa de
         * ninguém. O mês está a ser descrito, não cobrado. */
        severity: "info",
        category: CLOSING_ALERT_CATEGORY,
        title: `Análise de ${mesPorExtenso(c.monthKey) || c.monthKey} ainda parcial`,
        description: causas.length
          ? `Os dados pedidos foram preenchidos, mas ${rubricas} continua(m) por fechar: ${causas.join(" e ")}. A rentabilidade do mês ainda não é definitiva.`
          : `Os dados pedidos foram preenchidos, mas as fontes do período ainda não estão completas. A rentabilidade do mês ainda não é definitiva.`,
        timestamp: null,
        acao: CLOSING_ALERT_SEM_ACAO,
        monthKey: c.monthKey,
        // Metadata aditiva, no mesmo espírito de `missingKeys`.
        partialKeys: bloqueios.map((b) => b.key),
      };
    });
}