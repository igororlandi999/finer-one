// RESÍDUO DE GRÁFICOS — guarda de regressão da FASE 17.
//
// ─── O DEFEITO, TAL COMO FOI OBSERVADO NO CHROME ────────────────────────────────────
//   1. entrar como utilizador da Overcel, com dados reais;
//   2. o Recharts mede rótulos e deixa o último em
//      `<span id="recharts_measurement_span">`, no `document.body`, fora de `#root`;
//   3. TERMINAR SESSÃO;
//   4. `document.body.innerText` continha "-R$ 140 mil" — um valor real do cashflow
//      previsto da Overcel — com a sessão já apagada e o ecrã de login à frente.
//
// E o pior dos dois casos: ao TROCAR PARA OUTRA EMPRESA, o mesmo valor da Overcel
// permanecia no DOM enquanto o ecrã afirmava "Empresa Exemplo ainda não tem dados
// ligados". A afirmação do ecrã e o conteúdo do DOM contradiziam-se.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { limparResiduoDeGraficos, ID_SPAN_DE_MEDICAO_RECHARTS } from "./chartResidue.js";

const aqui = dirname(fileURLToPath(import.meta.url));

/** Um documento mínimo. Evita depender de jsdom para uma função de três linhas. */
function documentoFalso(nos = {}) {
  return {
    getElementById(id) {
      return Object.prototype.hasOwnProperty.call(nos, id) ? nos[id] : null;
    },
  };
}

describe("limparResiduoDeGraficos", () => {
  it("esvazia o span de medição do Recharts", () => {
    const span = { textContent: "-R$ 140 mil" };
    const limpos = limparResiduoDeGraficos(documentoFalso({ [ID_SPAN_DE_MEDICAO_RECHARTS]: span }));
    expect(limpos).toBe(1);
    expect(span.textContent).toBe("");
  });

  it("NÃO remove o nó — só o texto", () => {
    /* O Recharts guarda a referência e reutiliza-a. Remover o nó faria as medições
     * devolverem zero e os rótulos dos eixos ficariam sobrepostos. Corrige-se o resíduo
     * sem partir o funcionamento. */
    const span = { textContent: "-R$ 140 mil", removed: false, remove() { this.removed = true; } };
    limparResiduoDeGraficos(documentoFalso({ [ID_SPAN_DE_MEDICAO_RECHARTS]: span }));
    expect(span.removed).toBe(false);
  });

  it("é idempotente e não conta um nó já vazio", () => {
    const span = { textContent: "R$ 1,00" };
    const doc = documentoFalso({ [ID_SPAN_DE_MEDICAO_RECHARTS]: span });
    expect(limparResiduoDeGraficos(doc)).toBe(1);
    expect(limparResiduoDeGraficos(doc)).toBe(0);
  });

  it("sem o nó, não faz nada e não lança", () => {
    expect(limparResiduoDeGraficos(documentoFalso({}))).toBe(0);
  });

  it("sem documento nenhum, não lança", () => {
    /* É chamada no caminho do logout. Trocar uma fuga de um rótulo por uma sessão que
     * não termina seria um mau negócio. */
    expect(() => limparResiduoDeGraficos(null)).not.toThrow();
    expect(limparResiduoDeGraficos({})).toBe(0);
  });

  it("um nó que rebenta a ser escrito não impede o logout", () => {
    const mau = {
      get textContent() { return "R$ 1,00"; },
      set textContent(_v) { throw new Error("nó indisponível"); },
    };
    expect(() => limparResiduoDeGraficos(documentoFalso({ [ID_SPAN_DE_MEDICAO_RECHARTS]: mau }))).not.toThrow();
  });
});

/* ==================================================================================== */
describe("a limpeza está ligada aos dois caminhos que a exigem", () => {
  const AUTH = readFileSync(join(aqui, "..", "auth", "AuthContext.jsx"), "utf8");

  it("o logout limpa o resíduo", () => {
    const signOut = AUTH.slice(AUTH.indexOf("const signOut ="), AUTH.indexOf("/** Troca a empresa ATIVA"));
    expect(signOut).toMatch(/limparResiduoDeGraficos\(\)/);
  });

  it("a troca de empresa limpa o resíduo", () => {
    const switchCompany = AUTH.slice(AUTH.indexOf("const switchCompany ="), AUTH.indexOf("/** O token de acesso"));
    expect(switchCompany).toMatch(/limparResiduoDeGraficos\(\)/);
  });
});
