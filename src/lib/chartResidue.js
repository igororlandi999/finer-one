// src/lib/chartResidue.js
// RESÍDUO DE GRÁFICOS FORA DA ÁRVORE DO REACT — e porque é que ele importa.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// O QUE FOI OBSERVADO (FASE 17), E NÃO ERA UM ARTEFACTO SEM IMPACTO
// ═══════════════════════════════════════════════════════════════════════════════════
// O Recharts cria, no `document.body`, um `<span id="recharts_measurement_span">` para
// MEDIR a largura do texto antes de o desenhar. É um singleton: existe um por página,
// vive FORA de `#root`, e guarda a ÚLTIMA string que mediu.
//
// Consequência, verificada no Chrome com autenticação simulada:
//
//   1. entrar como utilizador da Overcel  -> os gráficos desenham;
//   2. o span fica com o último rótulo medido, por exemplo "-R$ 140 mil" — um valor
//      real do cashflow previsto da Overcel, arredondado;
//   3. TROCAR PARA OUTRA EMPRESA          -> o span mantém o valor da Overcel;
//   4. TERMINAR SESSÃO                    -> o span AINDA mantém o valor da Overcel.
//
// Depois do logout, com a sessão apagada e o ecrã de login à frente,
// `document.body.innerText` continha um valor financeiro de uma empresa real.
//
// ─── PORQUE O REACT NÃO O LIMPA ─────────────────────────────────────────────────────
// Porque não é dele. `ProtectedRoute` devolve outra árvore e o React desmonta tudo o
// que é seu — mas este nó nunca esteve na árvore. Foi criado por uma biblioteca com
// `document.body.appendChild`, e ninguém o desmonta porque ninguém o montou.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// QUAL É EXATAMENTE A GRAVIDADE — dita sem exagerar e sem desvalorizar
// ═══════════════════════════════════════════════════════════════════════════════════
// O QUE NÃO É:
//   - não é visível: `position: absolute; top: -20000px`, e `aria-hidden="true"`, pelo
//     que nem no ecrã aparece nem é anunciado por um leitor de ecrã;
//   - não é um conjunto de dados: é UMA string curta, o último rótulo medido;
//   - não é alcançável por outro sítio: não sai em pedido nenhum, não é persistido.
//
// O QUE É:
//   - um valor financeiro REAL de uma empresa real, legível por `document.body.innerText`,
//     pelo inspetor, ou por qualquer script na página;
//   - legível DEPOIS de terminar sessão;
//   - legível enquanto OUTRA empresa está selecionada — e esse é o pior dos dois. A
//     regra da FASE 3 é explícita: empresa B ativa, zero informação financeira de A. Um
//     "-R$ 140 mil" da Overcel presente no DOM enquanto o ecrã diz "Empresa Exemplo
//     ainda não tem dados ligados" contradiz exatamente a afirmação que esse ecrã faz.
//
// A pergunta da FASE 17 era: "há valor financeiro real acessível após logout?". A
// resposta é SIM. Por isso corrige-se, em vez de se documentar como inofensivo.
//
// ─── PORQUE SE LIMPA O TEXTO E NÃO SE REMOVE O NÓ ───────────────────────────────────
// Porque o Recharts guarda a referência ao elemento e reutiliza-a. Removê-lo faria a
// biblioteca escrever num nó órfão — as medições passariam a devolver zero e os rótulos
// dos eixos ficariam sobrepostos. Esvaziar o texto não parte nada: a próxima medição
// escreve o que precisa. Corrige-se o resíduo sem tocar no funcionamento.

/** O id que o Recharts usa. Fixo na biblioteca; se mudar, o teste abaixo deixa de
 *  encontrar o nó e o pior que acontece é a limpeza não ter efeito. */
export const ID_SPAN_DE_MEDICAO_RECHARTS = "recharts_measurement_span";

/**
 * Ids de nós que vivem fora de `#root`, são criados por bibliotecas de gráficos e
 * retêm texto medido. Uma lista, e não uma constante, para que acrescentar outra
 * biblioteca seja uma linha e não outra função.
 */
const IDS_COM_RESIDUO = [ID_SPAN_DE_MEDICAO_RECHARTS];

/**
 * Esvazia o texto residual dos nós de medição de gráficos.
 *
 * @param {Document} [doc]  Injetável, para ser testável sem browser.
 * @returns {number}        Quantos nós foram limpos. Serve para o teste afirmar que a
 *                          limpeza aconteceu, em vez de assumir.
 *
 * Nunca lança. É chamada em caminhos de logout e de troca de empresa, e uma exceção
 * aqui impediria o logout — trocar uma fuga de um rótulo por uma sessão que não termina
 * seria um mau negócio.
 */
export function limparResiduoDeGraficos(doc) {
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  if (!d || typeof d.getElementById !== "function") return 0;

  let limpos = 0;
  for (const id of IDS_COM_RESIDUO) {
    try {
      const el = d.getElementById(id);
      /* `!= null` e não `!== ""`: um nó já vazio não conta como limpo, e é isso que
       * permite ao teste distinguir "limpou" de "não havia nada". */
      if (el && el.textContent !== "") {
        el.textContent = "";
        limpos += 1;
      }
    } catch { /* um nó indisponível não é motivo para falhar um logout */ }
  }
  return limpos;
}
