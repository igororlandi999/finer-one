// src/utils/scoreDisclosure.js
// O QUE O SCORE NÃO VIU — puro, sem React.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR
// ═══════════════════════════════════════════════════════════════════════════════════
// O score parte de 100 e só desce. Uma dimensão SEM FONTE não é penalizada — e essa é a
// decisão certa: penalizar por falta de dados confundiria "não sei" com "está mau", que é
// exatamente a confusão que este produto recusa em todos os outros eixos.
//
// Mas a decisão certa tem uma consequência que ninguém tinha fechado. `buildFinancialDiagnostic`
// já regista as dimensões não avaliadas em `naoAvaliados`, com o motivo — e NENHUM
// componente lia esse campo. O ecrã do Diagnóstico mostrava, quando não havia
// penalizações:
//
//     "Sem penalizações — a empresa atingiu o score máximo."
//
// Em julho/2026 o CMV está ausente. A rentabilidade — a dimensão mais importante das
// oito — fica não avaliada, não penaliza, e se mais nada penalizar a aplicação declara
// por escrito que a empresa atingiu o máximo. É uma afirmação sobre a saúde da empresa
// feita a partir de uma dimensão que nunca foi calculada.
//
// E a linha ao lado — "Partimos de 100; os descontos somam −X → score Y" — apresenta o
// cálculo como completo, sem dizer que uma parcela foi saltada.
//
// ─── O QUE ESTE MÓDULO NÃO FAZ ─────────────────────────────────────────────────────
// Não muda o score. Não inventa um denominador ajustado. Não penaliza a ausência. Não
// cria uma métrica nova. Faz uma coisa só: torna legível o que o motor já sabia e
// guardava para ninguém — e impede a única frase que era falsa.
//
// A escolha entre "ajustar o score" e "declarar o que não foi visto" não é arbitrária:
// um score ajustado seria um número NOVO, com uma escala nova, que ninguém pediu e que
// tornaria incomparáveis dois meses com coberturas diferentes. Uma declaração ao lado do
// mesmo número mantém a escala e acrescenta a única coisa que faltava — a verdade sobre
// o que ele mede.

/** Nomes legíveis das dimensões. Só existem os que o motor emite. */
const ROTULO_DIMENSAO = {
  rentabilidade: "Rentabilidade",
};

/**
 * O que se pode afirmar sobre este score, e o que não se pode.
 *
 * @param {object|null} diagnostico  saída de `buildFinancialDiagnostic`
 * @returns {{
 *   temDiagnostico: boolean,
 *   penalizacoes: Array<{pts: number, motivo: string}>,
 *   totalDescontado: number,
 *   naoAvaliadas: Array<{dimensao: string, rotulo: string, motivo: string}>,
 *   completo: boolean,
 *   podeAfirmarMaximo: boolean,
 * }|null}
 */
export function resolveScoreDisclosure(diagnostico) {
  /* `Array.isArray` também: um array é `typeof "object"` e é verdadeiro, e sem esta
   * verificação um `[]` produzia um diagnóstico vazio que afirmava `podeAfirmarMaximo`.
   * Ou seja: a ausência de diagnóstico nenhum passava a "atingiu o máximo". */
  if (!diagnostico || typeof diagnostico !== "object" || Array.isArray(diagnostico)) return null;

  /* ── AUSENTE NÃO É VAZIO ────────────────────────────────────────────────────────
   * `penalizacoes: []` é o motor a DIZER que não há nada a descontar.
   * `penalizacoes` ausente é o motor a não dizer nada — um diagnóstico com uma forma
   * que não reconhecemos.
   *
   * Tratar os dois como a mesma coisa era o defeito original outra vez, uma camada
   * acima: um diagnóstico malformado produziria "a empresa atingiu o score máximo",
   * que é a afirmação mais forte que este ecrã sabe fazer, a partir de nada.
   *
   * As listas continuam vazias para o desenho — não se inventa uma penalização nem uma
   * dimensão em falta. O que muda é o que se pode AFIRMAR sobre elas. */
  const declarouPenalizacoes = Array.isArray(diagnostico.penalizacoes);
  const declarouNaoAvaliados = Array.isArray(diagnostico.naoAvaliados);

  const penalizacoes = declarouPenalizacoes
    ? diagnostico.penalizacoes.filter((p) => p && typeof p.pts === "number" && Number.isFinite(p.pts))
    : [];

  const naoAvaliadas = (declarouNaoAvaliados ? diagnostico.naoAvaliados : [])
    .filter((n) => n && typeof n.dimensao === "string" && n.dimensao !== "")
    .map((n) => ({
      dimensao: n.dimensao,
      rotulo: ROTULO_DIMENSAO[n.dimensao] || n.dimensao,
      motivo: typeof n.motivo === "string" && n.motivo !== "" ? n.motivo : "Sem fonte para avaliar esta dimensão.",
    }));

  /* `completo` é a pergunta que importa: o score olhou para tudo o que devia?
   * NÃO é o mesmo que "não há penalizações". E exige que o motor se tenha PRONUNCIADO:
   * um diagnóstico que não declara `naoAvaliados` não autoriza afirmar completude. */
  const completo = declarouNaoAvaliados && naoAvaliadas.length === 0;

  return {
    temDiagnostico: true,
    penalizacoes,
    totalDescontado: penalizacoes.reduce((acc, p) => acc + p.pts, 0),
    naoAvaliadas,
    completo,
    /* A frase "atingiu o score máximo" exige TRÊS condições: nada a descontar, nada por
     * avaliar, e o motor a ter dito ambas as coisas. Nada a descontar com uma dimensão
     * por avaliar não é um máximo — é um máximo entre o que se conseguiu ver. E não
     * saber se há dimensões por avaliar também não é um máximo. */
    podeAfirmarMaximo: declarouPenalizacoes && penalizacoes.length === 0 && completo,
  };
}

/**
 * A frase que explica o cálculo, sem prometer completude que não existe.
 *
 * Devolve `null` quando não há nada a explicar — o chamador decide o que mostrar.
 */
export function explicarCalculoDoScore(disclosure, score) {
  if (!disclosure) return null;
  const { penalizacoes, totalDescontado, naoAvaliadas, podeAfirmarMaximo } = disclosure;

  /* ── A RESSALVA CONTA DIMENSÕES, LOGO EXIGE DIMENSÕES ───────────────────────────
   * Isto pendurava-se em `completo`, e desde que `completo` passou a exigir que o motor
   * se tenha PRONUNCIADO, ele pode ser falso com a lista vazia — um diagnóstico de forma
   * desconhecida. A frase saía "0 dimensões não foram avaliadas", que conta uma coisa
   * que ninguém contou. A ressalva pertence às dimensões NOMEADAS, e a nenhuma outra. */
  const ressalva = naoAvaliadas.length === 0
    ? ""
    : ` ${naoAvaliadas.length === 1 ? "Uma dimensão não foi avaliada" : `${naoAvaliadas.length} dimensões não foram avaliadas`}` +
      " por falta de fonte, e por isso não desconta nem confirma nada.";

  if (penalizacoes.length === 0) {
    /* ── A FRASE SAI DO MESMO JUÍZO QUE A FLAG ────────────────────────────────────
     * Isto lia `completo`, e `completo` não é a condição do máximo. Com `penalizacoes`
     * AUSENTE e `naoAvaliados: []` declarado, `podeAfirmarMaximo` era falso — e esta
     * linha escrevia na mesma "a empresa atingiu o score máximo". A flag ficou certa e
     * o texto continuou errado, que é o defeito que a flag existe para impedir, um
     * `if` mais à frente. É esta frase que a UI mostra; a flag só pinta a cor. */
    return podeAfirmarMaximo
      ? "Sem penalizações — a empresa atingiu o score máximo."
      : `Sem penalizações nas dimensões avaliadas.${ressalva}`;
  }
  return `Partimos de 100; os descontos somam −${totalDescontado} pts → score ${score}.${ressalva}`;
}
