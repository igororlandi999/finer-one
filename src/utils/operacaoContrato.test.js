// Guarda contra DIVERGÊNCIA entre a app e a ferramenta de operação (P1.4).
//
// ─── PORQUE ISTO EXISTE ─────────────────────────────────────────────────────────────
// `scripts/check-data-pipeline.mjs` duplica, de propósito, regras que também vivem em
// `src/utils/`. A duplicação é uma decisão consciente: a ferramenta de operação tem de
// correr sem importar nada da aplicação — se importasse, deixaria de poder diagnosticar
// uma app que não arranca, que é precisamente quando mais faz falta.
//
// O preço dessa decisão é o risco de as duas cópias divergirem em silêncio: alguém afina
// os limiares em `dataFreshness.js`, o script continua com os antigos, e a partir daí a
// app e a operação dão vereditos diferentes sobre os mesmos dados. Ninguém repara,
// porque nenhuma das duas está errada isoladamente.
//
// Estes testes não removem a duplicação — removê-la seria desfazer a decisão. Fazem o
// que a duplicação exige para ser segura: tornam a divergência RUIDOSA.
//
// Se um destes testes falhar, a correção não é editar o teste: é alinhar as duas cópias.

import { describe, it, expect } from "vitest";
import { FRESHNESS_THRESHOLDS, FRESHNESS } from "./dataFreshness.js";
import { COMPLETENESS } from "./dataHealth.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(join(raiz, "..", "..", "scripts", "check-data-pipeline.mjs"), "utf8");

/** Valor de uma constante `const NOME = <número>;` declarada no script. */
const constanteDoScript = (nome) => {
  const m = script.match(new RegExp(`const\\s+${nome}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : null;
};

describe("limiares de frescura — app vs. script de operação", () => {
  it("o limiar de AVISO é o mesmo nos dois sítios", () => {
    expect(constanteDoScript("AVISO_HORAS")).toBe(FRESHNESS_THRESHOLDS.warningHours);
  });

  it("o limiar de VELHO é o mesmo nos dois sítios", () => {
    expect(constanteDoScript("VELHO_HORAS")).toBe(FRESHNESS_THRESHOLDS.staleHours);
  });

  it("a duplicação continua assinalada no script, para quem lá mexer saber", () => {
    // Um comentário que aponte para a origem é o que impede a divergência silenciosa
    // de ser descoberta só quando já causou confusão.
    expect(script).toMatch(/dataFreshness\.js/);
  });
});

describe("vocabulário de estados — app vs. script", () => {
  it("o script usa exatamente os mesmos nomes de estado de frescura", () => {
    for (const estado of Object.values(FRESHNESS)) {
      expect(script).toContain(`"${estado}"`);
    }
  });

  it("o script usa exatamente os mesmos nomes de estado de completude", () => {
    for (const estado of Object.values(COMPLETENESS)) {
      expect(script).toContain(`"${estado}"`);
    }
  });
});

describe("regra de completude — o script replica a da app", () => {
  /* A regra de `resolveDataCompleteness`, em prosa:
   *   basta UMA fonte parcial            -> partial
   *   TODAS explicitamente não-parciais  -> complete
   *   qualquer outra situação            -> unknown
   * O script tem de a aplicar da mesma maneira, incluindo o pessimismo. */

  it("declara PARTIAL quando alguma fonte é parcial", () => {
    expect(script).toMatch(/parciais\.length\s*\?\s*"partial"/);
  });

  it("só declara COMPLETE quando ninguém ficou sem veredito nem falhou", () => {
    expect(script).toMatch(/semVeredito\.length === 0/);
    expect(script).toMatch(/comErro\.length === 0/);
  });

  it("o caso por omissão é UNKNOWN — nunca COMPLETE", () => {
    // A ordem importa: o ternário tem de terminar em "unknown".
    const trecho = script.match(/const completude = [\s\S]*?;/)[0];
    expect(trecho.trimEnd().endsWith('"unknown";')).toBe(true);
  });
});

describe("o script não promete o que não pode saber", () => {
  it("chama ao seu veredito 'estado técnico', não 'pronto para a DRE'", () => {
    expect(script).toContain("ESTADO TÉCNICO DO PIPELINE");

    /* A verificação incide sobre o que é IMPRESSO, não sobre o ficheiro inteiro: os
     * comentários do script discutem a expressão "pronto para a DRE" precisamente para
     * explicar porque NÃO a usa, e proibir a palavra no código-fonte apagaria essa
     * explicação — que é a parte que impede alguém de a reintroduzir. */
    const linhasImpressas = script.split(/\r?\n/).filter((linha) => /^\s*l\(/.test(linha));
    const saida = linhasImpressas.join("\n");
    expect(saida).not.toMatch(/pronto para (a )?DRE/i);
    expect(saida).not.toMatch(/pronto para análise financeira/i);
    expect(saida).not.toMatch(/pode fechar|pode ser fechad[ao]s?(?!.*NÃO)/i);
  });

  it("declara explicitamente que não afirma nada sobre contabilidade", () => {
    expect(script).toMatch(/NÃO afirma que a DRE pode ser fechada/);
  });

  it("os três códigos de saída estão documentados no cabeçalho", () => {
    expect(script).toMatch(/0\s+saudável/);
    expect(script).toMatch(/1\s+atenção/);
    expect(script).toMatch(/2\s+indisponível/);
  });

  it("um aviso (saída 1) não é apresentado como dado errado", () => {
    expect(script).toMatch(/1 NÃO significa dado errado/);
  });
});

describe("garantias de segurança da ferramenta de operação", () => {
  it("só faz GET — nunca escreve nem força rebuild", () => {
    expect(script).toMatch(/method:\s*"GET"/);
    for (const proibido of ["method: \"POST\"", "method: \"PUT\"", "method: \"DELETE\"", "writeFileSync", "rmSync", "unlinkSync"]) {
      expect(script).not.toContain(proibido);
    }
  });

  it("não imprime a query string, que poderia conter credenciais", () => {
    // Imprimir `url` completo seria o descuido óbvio; imprime-se só a BASE.
    expect(script).not.toMatch(/console\.log\([^)]*\burl\b[^)]*\)/);
  });
});
