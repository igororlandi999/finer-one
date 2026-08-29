// @vitest-environment happy-dom
//
// OS CONTROLOS SÓ COM ÍCONE TÊM NOME. E AGORA HÁ QUEM O VERIFIQUE.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// PORQUE ESTE FICHEIRO EXISTE — UMA MUTAÇÃO QUE SOBREVIVEU
// ═══════════════════════════════════════════════════════════════════════════════════
// O R-24 (`ebdfce6`) nomeou os controlos que só têm ícone: os quatro botões de paginação
// da `DataTable`, a pesquisa, o campo e o botão do Chat, e o `RowActionsButton`. A
// correção estava certa — e ficou sem uma única linha de regressão.
//
// Provado, não suposto. Na FASE H removeram-se de uma vez TODOS os `aria-label` e o
// `aria-live` deste ficheiro e correu-se a suite inteira:
//
//     2329 testes, 95 ficheiros — todos verdes.
//
// Ou seja: a próxima pessoa a mexer neste componente podia desfazer o R-24 por inteiro e
// nada lhe dizia. Uma correção sem regressão é uma correção com data de validade.
//
// ─── PORQUE MONTA, EM VEZ DE LER A FONTE ───────────────────────────────────────────
// Pela mesma razão do `ActionPlanModal.dialogo.test.jsx`: o que interessa não é "o
// ficheiro contém a string `aria-label`" — é "cada botão que chega ao DOM tem NOME".
// A diferença não é académica. Um teste sobre a fonte não distingue o `aria-label` que
// está no botão do que está no `<div>` ao lado, não sabe quantos botões a paginação
// desenha, e passa a verde num ficheiro onde alguém acrescentou o quinto botão sem nome.
// Montado, a regra é sobre TODOS os botões — inclusive os que ainda não existem.
//
// ─── A REGRA DE NOME ACESSÍVEL USADA AQUI ──────────────────────────────────────────
// Nome = `aria-label` | texto visível | `title`. Um `placeholder` NÃO é nome acessível:
// desaparece assim que se escreve, que é precisamente quando faz falta.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import DataTable, { RowActionsButton } from "./DataTable.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Linhas que cheguem para haver mais do que uma página — sem paginação visível, um teste
 * de paginação passa a verde sem verificar nada. */
const COLUNAS = [
  { key: "nome", header: "Nome" },
  { key: "valor", header: "Valor", align: "right" },
  { key: "acoes", header: "", render: () => <RowActionsButton /> },
];
const LINHAS = Array.from({ length: 20 }, (_, i) => ({
  id: `l-${i + 1}`, nome: `Cliente ${i + 1}`, valor: (i + 1) * 100,
}));

let container = null;
let root = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<DataTable columns={COLUNAS} rows={LINHAS} searchableFields={["nome"]} pageSize={8} />);
  });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  container = null;
  root = null;
});

/** Nome acessível de um controlo, pelas três vias que este projeto usa. */
function nomeAcessivel(el) {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const texto = el.textContent.trim();
  if (texto) return texto;
  const title = el.getAttribute("title");
  if (title && title.trim()) return title.trim();
  return "";
}

/** Descrição legível de um controlo anónimo, para a mensagem de falha valer de mapa. */
function descrever(el) {
  return `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") || "").slice(0, 60)}">`;
}

describe("DataTable — nenhum controlo é anónimo", () => {
  it("todos os botões desenhados têm nome acessível", () => {
    /* A regra generalizada, e a razão de este teste montar: apanha o botão que ainda não
     * existe. As tabs, a paginação, as ações de linha — e o próximo. */
    const anonimos = [...container.querySelectorAll("button")]
      .filter((b) => nomeAcessivel(b) === "")
      .map(descrever);

    expect(
      anonimos,
      "estes botões chegam ao DOM sem nome: um leitor de ecrã anuncia apenas \"botão\". " +
      "Nome = aria-label, texto visível ou title.\n  " + anonimos.join("\n  "),
    ).toEqual([]);
  });

  it("todos os campos de formulário têm nome acessível — e `placeholder` não conta", () => {
    const campos = [...container.querySelectorAll("input, select, textarea")];
    expect(campos.length).toBeGreaterThan(0);

    for (const campo of campos) {
      const aria = (campo.getAttribute("aria-label") || "").trim();
      const rotulado = campo.id && container.querySelector(`label[for="${campo.id}"]`);
      expect(
        aria !== "" || !!rotulado,
        `${descrever(campo)} não tem nome acessível. O placeholder "${campo.getAttribute("placeholder") || ""}" ` +
        "não serve: desaparece assim que se escreve.",
      ).toBe(true);
    }
  });
});

describe("DataTable — a paginação é operável sem ver o ecrã", () => {
  it("os quatro controlos existem e têm nomes DISTINTOS", () => {
    /* Distintos e não só presentes: quatro botões todos chamados "Página" seriam tão
     * inúteis quanto quatro sem nome nenhum. */
    const nomes = ["Primeira página", "Página anterior", "Página seguinte", "Última página"]
      .map((n) => container.querySelector(`button[aria-label="${n}"]`));

    for (const [i, botao] of nomes.entries()) {
      expect(botao, `falta o controlo de paginação n.º ${i + 1}`).not.toBeNull();
    }
    expect(new Set(nomes.map((b) => b.getAttribute("aria-label"))).size).toBe(4);
  });

  it("o indicador de página é anunciado quando muda", () => {
    /* Mudar de página NÃO move o foco. Sem `aria-live`, quem não vê o ecrã carrega no
     * botão e não recebe confirmação nenhuma de que alguma coisa aconteceu. */
    const indicador = [...container.querySelectorAll("[aria-live]")]
      .find((el) => /\d+\s*\/\s*\d+/.test(el.textContent));

    expect(
      indicador,
      "o \"página X / Y\" perdeu o `aria-live`: a paginação passa a mudar em silêncio",
    ).toBeTruthy();
    expect(indicador.getAttribute("aria-live")).toBe("polite");
    expect(indicador.textContent.replace(/\s/g, "")).toBe("1/3");
  });

  it("carregar em `Página seguinte` muda mesmo a página anunciada", () => {
    /* Contrapeso: sem isto, os testes acima ficariam verdes sobre uma paginação que
     * anuncia bem e não navega. */
    const seguinte = container.querySelector('button[aria-label="Página seguinte"]');
    act(() => { seguinte.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    const indicador = [...container.querySelectorAll("[aria-live]")]
      .find((el) => /\d+\s*\/\s*\d+/.test(el.textContent));
    expect(indicador.textContent.replace(/\s/g, "")).toBe("2/3");
    expect(container.textContent).toContain("Cliente 9");
  });
});

describe("RowActionsButton — nomeado E desativado", () => {
  it("aparece uma vez por linha, sempre desativado e sempre nomeado", () => {
    /* As duas metades do R-24 na mesma afirmação, porque separá-las permitia "resolver"
     * uma desfazendo a outra. O botão não tem `onClick` e nunca teve: com 8 linhas por
     * página seriam 8 paragens de teclado que anunciam "botão" e não fazem nada. */
    const botoes = [...container.querySelectorAll('button[aria-label="Ações da linha"]')];
    expect(botoes.length).toBe(8); // pageSize

    for (const b of botoes) {
      expect(b.disabled, "um controlo que não faz nada tem de parecer que não faz nada").toBe(true);
      expect(nomeAcessivel(b)).not.toBe("");
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
 * O RESTO DO R-24 — os controlos que vivem em PÁGINAS
 * ═══════════════════════════════════════════════════════════════════════════════════
 * O Chat e os Documentos são páginas: montá-las arrasta o contexto de dados, o de
 * autenticação e o da empresa ativa, e o que se ganharia com isso é nada — não há aqui
 * relação entre elementos a resolver (como o `aria-labelledby` do diálogo), há um
 * atributo num controlo. Sobre a fonte chega, e é proporcional.
 *
 * O que NÃO chega é confiar na palavra: sem estas quatro linhas, a metade do R-24 que
 * vive fora da `DataTable` continuava sem regressão nenhuma. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PAGES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "pages");
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("R-24 fora da DataTable — os controlos principais das páginas continuam nomeados", () => {
  it("o campo e o botão de enviar do Chat têm nome", () => {
    const fonte = semComentarios(readFileSync(join(PAGES, "ChatFinanceiro.jsx"), "utf8"));
    expect(fonte, "o campo de pergunta é a ação principal da página").toContain('aria-label="Escreva a sua pergunta"');
    expect(fonte, "o botão de enviar só tem ícone").toContain('aria-label="Enviar pergunta"');
  });

  it("a pesquisa dos Documentos tem nome", () => {
    const fonte = semComentarios(readFileSync(join(PAGES, "Documentos.jsx"), "utf8"));
    expect(fonte).toContain('aria-label="Pesquisar documentos"');
  });
});
