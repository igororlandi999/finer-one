// HIGIENE DOS REGISTOS DE EXECUÇÃO.
//
// Duas afirmações distintas, e é importante não as confundir:
//
//   1) O caminho AUTOMÁTICO (os três gatilhos diários) não regista dados pessoais.
//      Isto é o que corre sozinho todas as noites, sem ninguém a olhar, e por isso é
//      o que tem de estar coberto por um teste que falha quando alguém acrescentar um
//      log descuidado a um rebuild.
//
//   2) Os diagnósticos MANUAIS podem mostrar mais — é para isso que existem — mas não
//      têm de reter CPF/CNPJ. sanitize_ não os apanha (mascara corridas de 24+
//      alfanuméricos; um CPF tem 11 dígitos), daí mascararDocumentos_.
//
// Como no resto desta pasta, as funções são extraídas da fonte real: renomear ou apagar
// uma delas parte o teste em vez de o deixar passar contra uma cópia.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = (f) => readFileSync(join(raiz, f), "utf8");

const codigo = ler("Código.js");
const despesas = ler("Despesasbackend.js");
const recebiveis = ler("RecebiveisBackend.js");
const contasPagar = ler("TesteContasPagar.js");

function carregar(nomeFn, fonte) {
  const inicio = fonte.indexOf(`function ${nomeFn}(`);
  expect(inicio, `${nomeFn} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", inicio);
  return new Function(fonte.slice(inicio, fim + 2) + `\nreturn ${nomeFn};`)();
}

const mascararDocumentos_ = carregar("mascararDocumentos_", codigo);

describe("mascararDocumentos_", () => {
  it("mascara CPF de 11 dígitos", () => {
    expect(mascararDocumentos_("doc 11122233344 fim")).toBe("doc ***CPF(11)*** fim");
  });

  it("mascara CNPJ de 14 dígitos", () => {
    expect(mascararDocumentos_("doc 11222333000181 fim")).toBe("doc ***CNPJ(14)*** fim");
  });

  it("o CNPJ é tratado ANTES do CPF — senão os 14 dígitos partiam-se em 11+3", () => {
    /* A ordem das duas substituições é o detalhe que faz isto funcionar. Invertida,
     * um CNPJ virava "***CPF(11)***181" e deixava três dígitos do documento no log. */
    const r = mascararDocumentos_("11222333000181");
    expect(r).toBe("***CNPJ(14)***");
    expect(r).not.toContain("181");
  });

  it("preserva o COMPRIMENTO como informação — o diagnóstico continua útil", () => {
    // Quem corre o diagnóstico quer saber se o campo vinha preenchido e com que forma.
    // Isso continua legível; o que desaparece é o número.
    expect(mascararDocumentos_("11122233344")).toContain("11");
    expect(mascararDocumentos_("11222333000181")).toContain("14");
  });

  it("NÃO mascara ids do Bling (7 a 9 dígitos) nem valores com decimal", () => {
    expect(mascararDocumentos_("id 8879614 valor 1250.50")).toBe("id 8879614 valor 1250.50");
    expect(mascararDocumentos_("id 123456789")).toBe("id 123456789");
  });

  it("mascara todas as ocorrências, não só a primeira", () => {
    const r = mascararDocumentos_("a 11122233344 b 55566677788 c");
    expect(r).toBe("a ***CPF(11)*** b ***CPF(11)*** c");
  });

  it("aguenta vazio, null e não-texto", () => {
    for (const v of [null, undefined, "", 0]) expect(mascararDocumentos_(v)).toBe("");
    expect(() => mascararDocumentos_(42)).not.toThrow();
  });

  it("é pura: sem rede, sem Drive, sem relógio", () => {
    const src = codigo.slice(codigo.indexOf("function mascararDocumentos_"));
    const corpo = src.slice(0, src.indexOf("\n}") + 2);
    for (const proibido of ["UrlFetchApp", "DriveApp", "Date.now", "new Date", "Logger"]) {
      expect(corpo, `${proibido} não devia aparecer numa função pura`).not.toContain(proibido);
    }
  });
});

describe("o dump cru de contas a pagar não retém documentos", () => {
  it("a amostra RAW passa por safeLogDiagnostico_, não por safeLog_", () => {
    /* safeLog_ só aplica sanitize_, que deixa passar um CPF inteiro. A amostra crua é
     * o único sítio do projeto que despeja registos completos do Bling num log. */
    expect(contasPagar).toContain("safeLogDiagnostico_('RAW[' + i + ']: '");
    expect(contasPagar).not.toContain("safeLog_('RAW[' + i + ']: '");
  });

  it("safeLogDiagnostico_ combina as duas máscaras", () => {
    const src = codigo.slice(codigo.indexOf("function safeLogDiagnostico_"));
    const corpo = src.slice(0, src.indexOf("\n}") + 2);
    expect(corpo).toContain("mascararDocumentos_");
    expect(corpo).toContain("sanitize_");
  });
});

describe("o caminho AUTOMÁTICO não regista dados pessoais", () => {
  /* Os três rebuilds correm sozinhos por gatilho diário. Um log descuidado aqui grava
   * PII todas as noites sem ninguém reparar — ao contrário de um diagnóstico manual,
   * que alguém teve de mandar correr. É por isso que só esta parte é blindada. */
  for (const [nome, fonte, fn] of [
    ["pedidos", codigo, "rebuildPedidosSnapshot_"],
    ["despesas", despesas, "rebuildDespesasSnapshot_"],
    ["recebíveis", recebiveis, "rebuildRecebiveisSnapshot_"],
  ]) {
    it(`${nome}: nenhum log do rebuild imprime contacto, nome ou documento`, () => {
      const inicio = fonte.indexOf(`function ${fn}(`);
      expect(inicio, `${fn} não encontrada`).toBeGreaterThan(-1);
      const corpo = fonte.slice(inicio, fonte.indexOf("\n}\n", inicio));
      const logs = corpo.split(/\r?\n/).filter((l) => /safeLog_|Logger\.log/.test(l));
      expect(logs.length, "o rebuild devia registar progresso").toBeGreaterThan(0);
      for (const linha of logs) {
        for (const proibido of ["contato", "numeroDocumento", ".nome", "historico"]) {
          expect(linha, `log com '${proibido}' no caminho automático: ${linha.trim()}`)
            .not.toContain(proibido);
        }
      }
    });
  }

  it("o rebuild regista progresso por CONTAGEM, que é o que serve para diagnosticar", () => {
    const inicio = recebiveis.indexOf("function rebuildRecebiveisSnapshot_(");
    const corpo = recebiveis.slice(inicio, recebiveis.indexOf("\n}\n", inicio));
    expect(corpo).toContain("titulos na listagem");
    expect(corpo).toContain("hidratados agora");
  });
});
