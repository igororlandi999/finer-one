// src/utils/manualCoverage.js
// COBERTURA CONFIRMADA POR UMA PESSOA — puro, sem rede, sem relógio implícito, sem UI.
//
// ─── QUE PERGUNTA ISTO RESPONDE ─────────────────────────────────────────────────────
// "Até que mês é que os documentos relevantes de despesas já estão disponíveis para
// análise, segundo quem conhece a operação?"
//
// E, com igual importância, o que NÃO responde:
//   - não é fecho contabilístico;
//   - não é validação da contabilidade;
//   - não afirma que os valores estão corretos;
//   - não afirma que não existem documentos desconhecidos;
//   - não é aprovação fiscal.
//
// A validação humana da contabilidade continua a viver em `validatedThroughMonth`, na
// configuração, sem efeito nenhum na disponibilidade — e assim se mantém. São dois eixos
// distintos e é preciso que continuem a sê-lo (docs/MONTHLY_CLOSING_CONTRACT.md).
//
// ─── PORQUE EXISTE ──────────────────────────────────────────────────────────────────
// `company.js` tinha `payables.completeThroughMonth: "2026-06"` editado à mão. Todos os
// meses, alguém teria de abrir o código e mudar uma string para o produto deixar de
// tratar o mês anterior como parcial. Isso não é configuração: é uma operação mensal
// disfarçada de constante.
//
// A configuração passa a ser o que sempre devia ter sido — o FALLBACK, o valor de
// partida quando ninguém confirmou nada. Quem manda, havendo, é a confirmação.
//
// ─── O QUE ESTA CAMADA NÃO PODE FAZER ───────────────────────────────────────────────
// Uma confirmação humana NUNCA torna uma fonte tecnicamente incompleta em completa. Se
// o snapshot se declarou parcial (`meta.parcial`), o veto vive em `sourceAvailability`,
// que testa `snapshotPartial` ANTES de olhar para qualquer limite de cobertura. Este
// módulo escreve o limite; não tem forma de contornar aquele veto, e é assim de
// propósito — ver `resolveEffectiveCoverage` e a ordem em `buildSalesDataset`.

/** Fontes cuja cobertura pode ser confirmada. Só as contas a pagar, por agora: os
 *  pedidos derivam do calendário (`completeThroughMonth: null`) e não precisam. */
export const FONTES_COBERTURA_CONFIRMAVEL = ["payables"];

/** Quem confirmou. É um PAPEL, nunca uma pessoa: o documento não guarda PII. */
export const COVERAGE_SOURCE = {
  USER: "user",     // confirmado dentro da Finer One
  CONFIG: "config", // não confirmado: vale o fallback de company.js
};

/** Porque é que uma confirmação foi recusada. Códigos, não frases: a língua vive na UI. */
export const COVERAGE_REJECTION = {
  MES_INVALIDO: "mes_invalido",
  MES_FUTURO: "mes_futuro",
  FONTE_DESCONHECIDA: "fonte_desconhecida",
};

const RE_MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** "aaaa-mm" do mês anterior ao de `date`. O mês civil corrente nunca está encerrado. */
export function lastClosedCivilMonth(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Normaliza o bloco `coverage` do documento de ajustes manuais.
 *
 * Espelha `normalizeManualInputs`: defensiva, silenciosa perante o que não reconhece, e
 * incapaz de inventar. Devolve `undefined` para AUSÊNCIA — nunca um objeto de defaults,
 * que afirmaria uma confirmação que ninguém fez.
 *
 * Shape aceite:
 *   { payables: { completeThroughMonth: "aaaa-mm", confirmedAt: iso, confirmedBy, note } }
 *
 * @returns {undefined|{payables?: {completeThroughMonth, confirmedAt, confirmedBy, note}}}
 */
export function normalizeManualCoverage(coverageDoc) {
  if (!isPlainObject(coverageDoc)) return undefined;

  const out = {};
  for (const fonte of FONTES_COBERTURA_CONFIRMAVEL) {
    const bloco = coverageDoc[fonte];
    if (!isPlainObject(bloco)) continue;

    const mk = bloco.completeThroughMonth;
    // Só "aaaa-mm". Uma chave malformada é ignorada em vez de derrubar o documento —
    // e ignorar significa cair no fallback, que é o lado seguro.
    if (typeof mk !== "string" || !RE_MONTH_KEY.test(mk)) continue;

    out[fonte] = {
      completeThroughMonth: mk,
      /* Metadata de auditoria. Ausente ou malformada NÃO invalida a confirmação: o que
       * decide a cobertura é o mês, e perder a data da confirmação degrada o que se
       * mostra, nunca o que o motor calcula. */
      confirmedAt: typeof bloco.confirmedAt === "string" ? bloco.confirmedAt : null,
      confirmedBy: bloco.confirmedBy === COVERAGE_SOURCE.USER ? COVERAGE_SOURCE.USER : null,
      note: typeof bloco.note === "string" && bloco.note.trim() !== "" ? bloco.note.trim() : null,
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Valida um pedido de confirmação ANTES de o persistir.
 *
 * Função pura: a data de referência é injetada. Devolve `{ ok }` ou `{ ok:false, code }`.
 *
 * ─── PORQUE UM MÊS FUTURO É RECUSADO ────────────────────────────────────────────────
 * Confirmar a cobertura de um mês que ainda não terminou é uma afirmação que ninguém
 * pode fazer: faltam-lhe dias. Aceitá-la libertaria como `real` um mês em curso, e o
 * produto passaria a apresentar como fechado um período que ainda está a acontecer —
 * exatamente o defeito que a separação entre cobertura e validação veio corrigir.
 *
 * O limite é o último mês civil ENCERRADO. Confirmar meses antigos é legítimo (é como
 * se corrige uma confirmação feita a mais — ver FASE 9 / `revogar`).
 */
export function validarConfirmacaoCobertura({ fonte, monthKey, referenceDate } = {}) {
  if (FONTES_COBERTURA_CONFIRMAVEL.indexOf(fonte) === -1) {
    return { ok: false, code: COVERAGE_REJECTION.FONTE_DESCONHECIDA };
  }
  if (typeof monthKey !== "string" || !RE_MONTH_KEY.test(monthKey)) {
    return { ok: false, code: COVERAGE_REJECTION.MES_INVALIDO };
  }
  const limite = lastClosedCivilMonth(referenceDate);
  if (!limite) return { ok: false, code: COVERAGE_REJECTION.MES_INVALIDO };
  // Lexicográfico: "aaaa-mm" ordena-se como texto, sem parsing de datas.
  if (monthKey > limite) return { ok: false, code: COVERAGE_REJECTION.MES_FUTURO };
  return { ok: true };
}

/**
 * A COBERTURA EFETIVA: a configurada, com a confirmação humana por cima.
 *
 * ─── A REGRA, EM UMA LINHA ──────────────────────────────────────────────────────────
 * Havendo confirmação válida, é ela que vale. Não havendo, vale a configuração.
 *
 * ─── PORQUE A CONFIRMAÇÃO PODE RECUAR ───────────────────────────────────────────────
 * Não se exige que a confirmação seja POSTERIOR à configuração. Uma pessoa que confirme
 * julho por engano tem de poder voltar a junho, e um valor que só sobe é um valor que
 * não se corrige. O caminho de correção é o mesmo do avanço: confirmar outro mês.
 *
 * ─── O QUE ISTO NÃO CONSEGUE FAZER, POR CONSTRUÇÃO ──────────────────────────────────
 * Não consegue tornar `partial` em `real` quando o snapshot se declarou incompleto.
 * `sourceAvailability` testa `snapshotPartial` ANTES do limite de cobertura, e em
 * `buildSalesDataset` o veto do snapshot é aplicado DEPOIS desta função. A ordem não é
 * decorativa: é o que garante que nenhuma confirmação humana passa por cima de um facto
 * técnico. Testado em `manualCoverage.test.js`.
 *
 * @param {{configCoverage?: object|null, manualCoverage?: object|null, referenceDate?: Date}} args
 * @returns {object} cobertura pronta a entrar no motor. A MESMA referência da
 *   configurada quando não há nada a sobrepor — nenhum consumidor muda de
 *   comportamento por esta função existir.
 */
export function resolveEffectiveCoverage({ configCoverage, manualCoverage, referenceDate } = {}) {
  const base = configCoverage || {};
  const manual = normalizeManualCoverage(manualCoverage);
  if (!manual) return base;

  const payables = manual.payables;
  if (!payables) return base;

  /* Uma confirmação para um mês ainda não encerrado é ignorada mesmo depois de
   * persistida. O documento pode ter sido escrito por uma versão anterior, à mão, ou
   * num fuso diferente; a leitura tem de se defender na mesma. Sem `referenceDate` não
   * há calendário contra o qual validar — e então não se sobrepõe nada, que é o lado
   * seguro. */
  const valido = validarConfirmacaoCobertura({
    fonte: "payables",
    monthKey: payables.completeThroughMonth,
    referenceDate,
  });
  if (!valido.ok) return base;

  return {
    ...base,
    payables: {
      ...(base.payables || {}),
      completeThroughMonth: payables.completeThroughMonth,
      /* Rasto de PROVENIÊNCIA. Nenhum motor o lê — `sourceAvailability` só quer o mês.
       * Existe para a UI poder dizer "confirmado por si a 25/08" em vez de apresentar
       * uma cobertura confirmada e uma configurada com o mesmo aspeto. */
      coverageSource: COVERAGE_SOURCE.USER,
      coverageConfirmedAt: payables.confirmedAt,
      coverageNote: payables.note,
    },
  };
}

/**
 * De onde veio a cobertura das contas a pagar, pronta a mostrar.
 *
 * `null` quando não há cobertura nenhuma — nem configurada nem confirmada. Nunca se
 * inventa uma proveniência para um limite que não existe.
 */
export function describeCoverageSource(effectiveCoverage) {
  const cov = effectiveCoverage || {};
  const p = cov.payables || {};
  const mes = p.completeThroughMonth || p.closedThroughMonth
    || cov.completeThroughMonth || cov.closedThroughMonth || null;
  if (!mes) return null;
  return {
    completeThroughMonth: mes,
    source: p.coverageSource === COVERAGE_SOURCE.USER ? COVERAGE_SOURCE.USER : COVERAGE_SOURCE.CONFIG,
    confirmedAt: p.coverageConfirmedAt || null,
    note: p.coverageNote || null,
  };
}
