// src/utils/classificationCompleteness.js
// COMPLETUDE DA CLASSIFICAÇÃO das contas a pagar — puro, read-only, sem UI.
//
// ─── FACTOS, NUNCA POLÍTICA ─────────────────────────────────────────────────────────
// Este módulo NÃO decide se 0,38% de títulos por classificar é aceitável. Não tem
// limiar, não tem constante de materialidade, e não devolve veredito nenhum: devolve
// contagens e montantes, para que uma política futura — que é uma decisão
// CONTABILÍSTICA, não técnica — se possa escrever com números à frente.
//
// A razão de existir é concreta: hoje um título de R$ 1 e um título de R$ 100 000
// produzem exatamente o mesmo efeito (`operatingExpenses` passa a `partial`, o mês
// perde a elegibilidade como âncora) e nada na aplicação permitia distinguir os dois
// casos. O bloqueio continua igual — o que muda é que deixa de ser cego.
//
// ─── NÃO REIMPLEMENTA CLASSIFICAÇÃO ─────────────────────────────────────────────────
// A classificação sai de `dreEngine.classifyPayable`, a competência de
// `payableCompetenceDate` e o cancelamento de `isCancelledPayable`. Se a regra mudar
// no motor, muda aqui — não há aqui uma segunda tabela de categorias.

import {
  classifyPayable, payableCompetenceDate, isCancelledPayable, DRE_GROUPS,
} from "./dreEngine.js";
import { monthKey, round2 } from "./financialCalculations.js";

/* Grupos que estão fora das linhas operacionais da DRE por DECISÃO, não por lacuna:
 * compras/estoque viram CMV quando vendidas, e o frete pago é uma saída financeira
 * cuja integração económica é fase própria. Separá-los importa porque o denominador de
 * qualquer rácio de materialidade depende de os incluir ou não — e essa escolha é da
 * política futura, não deste módulo. Por isso são MEDIDOS, não descontados. */
const EXCLUIDOS_DELIBERADAMENTE = [DRE_GROUPS.COMPRAS_ESTOQUE, DRE_GROUPS.FRETE_PAGO];

/**
 * Factos de classificação das contas a pagar de UM mês.
 *
 * @param {{payables?: Array|null, monthKey?: string|null}} args
 * @returns {null|{
 *   monthKey: string,
 *   unclassifiedCount: number,
 *   unclassifiedAmount: number,
 *   classifiedAmount: number,
 *   totalRelevantAmount: number,
 *   deliberatelyExcludedAmount: number,
 *   unclassifiedRatio: number|null,
 *   items: Array<{id, amount, competenceDate, competenceField, competenceFallback,
 *                 supplier, description, sourceCategory}>
 * }}
 *   `null` sem mês ou sem fonte — nunca um objeto de zeros, que afirmaria "medi e não
 *   há nada por classificar" sobre uma fonte que nem sequer existe.
 */
export function buildClassificationCompleteness({ payables, monthKey: mk } = {}) {
  if (!mk || !Array.isArray(payables)) return null;

  const doMes = payables
    .filter((p) => p && !isCancelledPayable(p))
    .map((p) => {
      const comp = payableCompetenceDate(p);
      return { p, comp, mk: comp.date ? monthKey(comp.date) : null, group: classifyPayable(p).group };
    })
    .filter((x) => x.mk === mk);

  const soma = (lista) => round2(lista.reduce((a, x) => a + (Number(x.p.valor) || 0), 0));

  const naoClassificados = doMes.filter((x) => x.group === DRE_GROUPS.NAO_CLASSIFICADO);
  const excluidos = doMes.filter((x) => EXCLUIDOS_DELIBERADAMENTE.includes(x.group));

  const totalRelevantAmount = soma(doMes);
  const unclassifiedAmount = soma(naoClassificados);

  return {
    monthKey: mk,
    unclassifiedCount: naoClassificados.length,
    unclassifiedAmount,
    classifiedAmount: round2(totalRelevantAmount - unclassifiedAmount),
    totalRelevantAmount,
    deliberatelyExcludedAmount: soma(excluidos),
    /* `null` e não 0 quando o mês não tem títulos: um mês sem títulos não tem 0% por
     * classificar — não tem rácio nenhum. Dividir por zero devolveria Infinity ou NaN,
     * e um 0 inventado faria um mês vazio parecer perfeitamente classificado. */
    unclassifiedRatio: totalRelevantAmount === 0
      ? null
      : round2((unclassifiedAmount / totalRelevantAmount) * 100),
    /* Os títulos concretos, para o produto os poder MOSTRAR. Campos deliberadamente
     * neutros e só os que a fonte já tem: nada aqui sugere uma categoria, porque
     * sugerir uma categoria é classificar, e classificar é decisão do utilizador. */
    items: naoClassificados
      .slice()
      .sort((a, b) => (Number(b.p.valor) || 0) - (Number(a.p.valor) || 0))
      .map((x) => ({
        id: x.p.id,
        amount: Number(x.p.valor) || 0,
        competenceDate: x.comp.date,
        competenceField: x.comp.field,
        competenceFallback: x.comp.fallback,
        supplier: (x.p.contato && x.p.contato.nome) || null,
        description: x.p.historico || null,
        /* A categoria QUE A FONTE TRAZ, quando traz. Não é a classificação da DRE — é
         * precisamente a que o motor não reconheceu, e mostrá-la é o que permite ao
         * utilizador perceber porquê. `null` quando o título vem sem categoria. */
        sourceCategory: x.p.categoriaNome || null,
      })),
  };
}
