// Testes ESTRUTURAIS da página de Ajustes manuais (C6D).
//
// O projeto não tem infraestrutura de testes de componente — não há ambiente DOM
// configurado no vitest nem testing-library. Em vez de introduzir dependências novas
// nesta microfase, a página foi mantida deliberadamente fina (toda a decisão vive em
// utils/manualInputsView.js, coberto por testes de comportamento) e aqui verifica-se
// o que resta e importa: que a página não faz leitura própria, não formata moeda à
// mão, não expõe infraestrutura e não oferece ações que não existem.
//
// A análise é sobre o código-fonte. É um teste grosseiro por natureza, mas apanha
// exatamente as regressões que interessam, e apanha-as sem montar meio React.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonteBruta = readFileSync(join(raiz, "AjustesManuais.jsx"), "utf8");

/* Remove comentários antes de analisar. Um comentário que EXPLICA por que razão não
 * existe botão Guardar não é um botão Guardar; sem esta limpeza, o teste proibiria
 * documentar a decisão, que é o oposto do que se pretende. */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const fonte = semComentarios(fonteBruta);
const planConfig = readFileSync(join(raiz, "..", "config", "planConfig.js"), "utf8");
const app = readFileSync(join(raiz, "..", "App.jsx"), "utf8");

describe("AjustesManuais — leitura única", () => {
  it("consome o contexto e não faz fetch próprio", () => {
    expect(fonte).toContain("useFinerData()");
    expect(fonte).not.toMatch(/\bfetch\s*\(/);
    expect(fonte).not.toContain("apiGet");
    expect(fonte).not.toContain("fetchManualInputs");
    expect(fonte).not.toContain("loadFinerData");
  });

  it("não tem useEffect: nada a carregar depois da montagem", () => {
    expect(fonte).not.toContain("useEffect");
  });

  it("delega a decisão de estado ao util puro", () => {
    expect(fonte).toContain("buildCompletionDataView");
  });

  /* C7E: a página passou a ser orientada a PERÍODOS. A pendência tem de continuar a
   * nascer do motor de fecho — se algum dia esta página começar a decidir o que falta
   * a partir do documento de ajustes manuais, passa a haver duas verdades. */
  it("consome os fechos já apurados e não recalcula o motor", () => {
    expect(fonte).toContain("closings: sales?.closings ?? null");
    for (const simbolo of ["buildMonthlyClosing", "buildMonthlyDre", "buildFinancialMetrics",
      "closedMonthKeys", "CLOSING_STATUS", "missingItems"]) {
      expect(fonte).not.toContain(simbolo);
    }
  });
});

describe("AjustesManuais — sem escrita e sem falsas ações", () => {
  it.each(["Guardar", "Editar", "Adicionar", "Eliminar", "Remover"])(
    "não oferece a ação %s",
    (rotulo) => { expect(fonte).not.toContain(rotulo); },
  );

  it("não contém verbos HTTP de escrita", () => {
    expect(fonte).not.toContain("POST");
    expect(fonte).not.toContain("doPost");
  });

  it("não tem formulários nem campos de entrada", () => {
    expect(fonte).not.toMatch(/<form|<input|<textarea|<select/);
  });
});

describe("AjustesManuais — apresentação", () => {
  it("usa formatMoney e nunca escreve o símbolo da moeda à mão", () => {
    expect(fonte).toContain("formatMoney");
    expect(fonte).not.toContain("R$");
    expect(fonte).not.toContain("€");
  });

  it("não escreve rótulos de origem à mão: o rótulo vive num só sítio", () => {
    /* C7E: o rótulo "Valor manual" mudou de camada — passou a ser decidido em
     * completionDataView, que o importa de AVAILABILITY_LABELS. A página não pode
     * voltar a escrevê-lo literalmente, nem inventar um rótulo de origem paralelo. */
    expect(fonte).not.toContain('"Valor manual"');
    expect(fonte).not.toContain('"Real"');
    expect(fonteBruta).not.toMatch(/>\s*Real\s*</);
  });

  it("o texto explicativo não depende de um rótulo técnico de availability", () => {
    // `mixed` é estado interno do motor. A Performance pode formular a sua própria copy,
    // e esta página não deve prometer uma frase que não controla.
    expect(fonte).not.toContain("AVAILABILITY_LABELS.mixed");
    expect(fonte).toContain("incluindo dados manuais");
  });

  it("tem os estados de ecrã e as frases de produto certas", () => {
    expect(fonte).toContain("Ainda não existem períodos a apresentar.");
    expect(fonte).toContain("COMPLETION_VIEW.LOADING");
    expect(fonte).toContain("COMPLETION_VIEW.EMPTY");
    expect(fonte).toContain("COMPLETION_VIEW.MONTHS");
  });

  it("não expõe infraestrutura ao utilizador", () => {
    for (const termo of ["Drive", "Apps Script", "fileId", "companyId", ".json",
      "documento-corrompido", "documento-ambiguo", "fonte-indisponivel", "debug"]) {
      expect(fonte).not.toContain(termo);
    }
  });
});

describe("AjustesManuais — navegação", () => {
  it("o ecrã existe no catálogo com o rótulo de produto", () => {
    /* C7E: o rótulo passou a "Dados a completar" — nem toda a pendência futura será
     * manual, e a página representa o processo de completar o fecho, não a tecnologia
     * de origem do dado. A ROTA interna não mudou: não havia razão técnica para o
     * fazer, e mudá-la partiria ligações guardadas sem benefício nenhum. */
    expect(planConfig).toContain('AJUSTES_MANUAIS:       "ajustes-manuais"');
    expect(planConfig).toContain('label: "Dados a completar"');
    expect(planConfig).not.toContain('label: "Ajustes manuais"');
  });

  it("aparece nos três planos, sem ser tratado como benefício premium", () => {
    // Só as entradas dos arrays `screens` (linha própria, indentada), nunca a linha
    // do catálogo, que também menciona a constante.
    const entradas = planConfig.match(/^\s+SCREENS\.AJUSTES_MANUAIS,\s*$/gm) || [];
    expect(entradas).toHaveLength(3);
  });

  it("está mapeado no router", () => {
    expect(app).toContain("[SCREENS.AJUSTES_MANUAIS]:       AjustesManuais");
  });

  it("nenhum comentário fixa o número de planos", () => {
    // Um comentário que conta planos envelhece mal: já dizia "4" quando existiam 3.
    expect(planConfig).not.toMatch(/Defini\u00e7\u00e3o dos \d+ planos/);
  });
});