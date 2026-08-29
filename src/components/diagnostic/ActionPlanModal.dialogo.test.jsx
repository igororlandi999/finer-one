// @vitest-environment happy-dom
//
// O PLANO DE AÇÃO ABRE COMO DIÁLOGO — E DIZ COMO SE CHAMA.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE TESTE MONTA REACT, AO CONTRÁRIO DA MAIORIA
// ═══════════════════════════════════════════════════════════════════════════════════
// O projeto testa páginas de forma ESTRUTURAL (ver `AjustesManuais.estrutura.test.js`):
// lê-se o código-fonte, porque a decisão vive em view-models puros. Aqui não serve, pela
// mesma razão pela qual `ProtectedRoute.test.jsx` também monta: a afirmação a provar não
// é "o ficheiro contém `role="dialog"`" — é "o DOM que chega à tecnologia de apoio tem um
// diálogo COM NOME". Um teste estrutural veria o atributo `aria-labelledby` e teria de
// ACREDITAR que o `id` do outro lado existe. É exatamente esse o erro que se comete a
// escrever `aria-labelledby` à mão, e é exatamente esse que um teste sobre a fonte não vê.
//
// Sem dependências novas: `happy-dom` já é devDependency e `act` vem do próprio React 18.
//
// ─── O DEFEITO QUE ISTO FECHA ──────────────────────────────────────────────────────
// O painel era um `<div>` liso dentro do overlay. Para um leitor de ecrã não abria
// diálogo nenhum: o conteúdo — o plano de ação sobre as finanças da empresa, com valores
// de impacto em dinheiro — aparecia no meio da página anterior, sem nome, sem fronteira e
// sem forma de saber que ali estava outra coisa. O título "Plano de Ação" existia como
// `<h2>` mas não estava LIGADO a nada, portanto não era o nome do diálogo.
//
// ─── O QUE ESTE TESTE DELIBERADAMENTE NÃO AFIRMA ───────────────────────────────────
// `aria-modal`, armadilha de foco, fecho com Escape, foco inicial e devolução do foco ao
// fechar são comportamento em tempo de execução com teclado real. Não estão implementados
// e este ficheiro não finge que estão — estão registados em R-28 e precisam de browser.
// A única coisa que se afirma sobre eles aqui é a coerência: enquanto a contenção não
// existir, `aria-modal` NÃO pode ser declarado (ver o último teste, e o porquê lá).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ActionPlanModal from "./ActionPlanModal.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Forma fiel à que `diagnosticsEngine.js` produz (`acoes`, `estado`, `score`,
 * `prioridadeMaxima`) — inclui uma ação com `impacto` numérico para exercer também o
 * caminho que formata dinheiro. */
const DIAGNOSTICO = {
  estado: "Atenção",
  score: 62,
  prioridadeMaxima: "Contas a receber vencidas",
  acoes: [
    { id: "ac-1", titulo: "Cobrar o que está vencido", descricao: "Contactar os clientes com faturas vencidas.", impacto: 12500, prazo: "7 dias" },
    { id: "ac-2", titulo: "Rever custos do mês", descricao: "Analisar as categorias que mais subiram.", impacto: null, prazo: "30 dias" },
  ],
};

let container = null;
let root = null;

function montar(props) {
  act(() => { root.render(<ActionPlanModal {...props} />); });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  container = null;
  root = null;
});

describe("ActionPlanModal — fechado não existe", () => {
  it("com `open` falso não desenha diálogo nenhum", () => {
    montar({ open: false, onClose: () => {}, diagnostic: DIAGNOSTICO, demo: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("ActionPlanModal — o painel é um diálogo com nome", () => {
  beforeEach(() => {
    montar({ open: true, onClose: () => {}, diagnostic: DIAGNOSTICO, demo: false });
  });

  it("existe exatamente um `role=\"dialog\"`", () => {
    const dialogos = document.querySelectorAll('[role="dialog"]');
    expect(dialogos.length).toBe(1);
  });

  it("o `role` está no PAINEL, não no véu que fecha ao clique", () => {
    /* O `<div>` exterior é o fundo escurecido: tem `onClick={onClose}` e ocupa o ecrã
     * todo. Se o `role="dialog"` lá estivesse, o diálogo anunciado seria a página inteira
     * e clicar "dentro dele" fechá-lo-ia. O painel é o filho que trava a propagação. */
    const dialogo = document.querySelector('[role="dialog"]');
    expect(dialogo.className).toContain("max-w-lg");
    expect(dialogo.className).not.toContain("fixed inset-0");
  });

  it("o nome acessível resolve mesmo — o `id` apontado EXISTE e tem texto", () => {
    /* O coração deste ficheiro. `aria-labelledby` que aponta para um `id` inexistente
     * deixa o diálogo sem nome e não dá erro nenhum: o ecrã continua igual. */
    const dialogo = document.querySelector('[role="dialog"]');
    const idDoNome = dialogo.getAttribute("aria-labelledby");
    expect(idDoNome, "o diálogo não declara nome acessível").toBeTruthy();

    const rotulo = document.getElementById(idDoNome);
    expect(
      rotulo,
      `aria-labelledby="${idDoNome}" aponta para um id que não existe no DOM — o diálogo fica sem nome`,
    ).not.toBeNull();
    expect(rotulo.textContent.trim()).toBe("Plano de Ação");
  });

  it("o `id` do nome é único no documento", () => {
    const idDoNome = document.querySelector('[role="dialog"]').getAttribute("aria-labelledby");
    expect(document.querySelectorAll(`[id="${idDoNome}"]`).length).toBe(1);
  });

  it("o botão de fechar só com ícone tem nome acessível (R-24)", () => {
    const dialogo = document.querySelector('[role="dialog"]');
    const fechar = dialogo.querySelector('button[aria-label="Fechar"]');
    expect(fechar, "o `X` do cabeçalho voltou a ser um botão anónimo").not.toBeNull();
  });

  it("desenha as ações que recebeu, e só essas", () => {
    /* Contrapeso: se alguém "arrumasse" o diálogo cortando conteúdo, os testes de
     * semântica acima continuariam verdes sobre um painel vazio. */
    const dialogo = document.querySelector('[role="dialog"]');
    for (const a of DIAGNOSTICO.acoes) expect(dialogo.textContent).toContain(a.titulo);
  });
});

describe("ActionPlanModal — não se declara uma contenção que não existe", () => {
  it("`aria-modal` fica de fora enquanto não houver armadilha de foco", () => {
    /* NÃO é uma omissão por esquecer. `aria-modal="true"` AFIRMA à tecnologia de apoio
     * que o resto da página está inerte, e o leitor de ecrã deixa de o oferecer. Aqui o
     * fundo não é `inert`, não há armadilha de foco e o Tab sai do painel para os botões
     * da página de trás. Declarar a contenção sem a construir é PIOR do que não a
     * declarar: esconde o fundo de quem lê e continua a mandar lá o teclado de quem
     * navega — o utilizador fica com o foco num sítio que já não lhe é anunciado.
     *
     * Este teste falha no dia em que alguém acrescentar `aria-modal` sozinho. Quando a
     * contenção for construída e verificada em browser (R-28), é aqui que se inverte. */
    montar({ open: true, onClose: () => {}, diagnostic: DIAGNOSTICO, demo: false });
    const dialogo = document.querySelector('[role="dialog"]');
    expect(
      dialogo.hasAttribute("aria-modal"),
      "`aria-modal` só pode ser declarado depois de existir armadilha de foco, fundo inerte " +
      "e devolução do foco — ver R-28 no RISK_REGISTER.md",
    ).toBe(false);
  });
});
