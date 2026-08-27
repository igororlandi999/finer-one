// MINIMIZAÇÃO DE DADOS na resposta pública dos recebíveis.
//
// O Web App está publicado com `access: ANYONE_ANONYMOUS` e é servido através de um
// proxy público cujo URL viaja no bundle do front. Tudo o que o doGet devolve é, na
// prática, legível por quem tiver o endereço.
//
// Medido no snapshot de 2026-08-23: `contato.numeroDocumento` preenchido em 1389 dos
// 1390 títulos — 481 CPF de pessoa singular e 908 CNPJ, sobre 279 contactos distintos.
// O front nunca usa este campo (normalizeReceivable transporta só id e nome), pelo que
// removê-lo da resposta não custa funcionalidade nenhuma.
//
// Estes testes correm a função REAL, extraída da fonte do Apps Script.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeReceivable } from "../src/services/blingDataService.js";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "RecebiveisBackend.js"), "utf8");
const front = readFileSync(join(raiz, "..", "src", "services", "blingDataService.js"), "utf8");

function carregar() {
  const inicio = fonte.indexOf("var CAMPOS_NAO_PUBLICOS_RECEBIVEL");
  expect(inicio, "bloco de redação não encontrado").toBeGreaterThan(-1);
  const marca = "function redigirRecebiveisPublicos_";
  const posFim = fonte.indexOf(marca, inicio);
  const fim = fonte.indexOf("\n}", posFim);
  const src = fonte.slice(inicio, fim + 2);
  return new Function(src + "\nreturn { redigirRecebivelPublico_, redigirRecebiveisPublicos_," +
    " CAMPOS_NAO_PUBLICOS_RECEBIVEL, CAMPOS_PUBLICOS_CONTATO_RECEBIVEL };")();
}
const M = carregar();

/** Título com a forma real do snapshot, com um CPF fictício de 11 dígitos. */
const titulo = (over = {}) => ({
  id: 90001,
  situacao: 1,
  vencimento: "2026-09-10",
  valor: 1250.5,
  saldo: 1250.5,
  dataEmissao: "2026-08-11",
  vencimentoOriginal: "2026-09-10",
  numeroDocumento: "000123456",
  historico: "Venda 4321",
  competencia: "2026-08",
  categoria: { id: 771, nome: "Vendas" },
  categoriaId: 771,
  categoriaNome: "Vendas",
  formaPagamento: { id: 8879614, codigoFiscal: 20, nome: "Pix" },
  contato: { id: 555, nome: "Cliente Exemplo", numeroDocumento: "11122233344", tipo: "F" },
  portador: { id: 9001 },
  vendedor: { id: 42 },
  contaContabil: { id: 9001 },
  borderos: [],
  origem: { id: 1, numero: "4321", tipoOrigem: "pedido", situacao: 9, valor: 1250.5, dataEmissao: "2026-08-11" },
  ocorrencia: { tipo: 1 },
  idOrigem: 1,
  idTransacao: "TX-ABCDEF",
  linkQRCodePix: "https://exemplo/pix/abc",
  linkBoleto: "https://exemplo/boleto/abc",
  detalheCarregado: true,
  ...over,
});

describe("o que NUNCA pode sair na resposta pública", () => {
  it("remove o CPF/CNPJ do contacto", () => {
    const r = M.redigirRecebivelPublico_(titulo());
    expect(r.contato).not.toHaveProperty("numeroDocumento");
    expect(JSON.stringify(r)).not.toContain("11122233344");
  });

  it("remove os links de pagamento e o id de transação", () => {
    /* Hoje vêm sempre vazios (0/1390). Saem à mesma: são instrumentos de pagamento por
     * construção, e uma mudança do lado do Bling não pode publicá-los sem ninguém dar
     * por isso. */
    const r = M.redigirRecebivelPublico_(titulo());
    for (const campo of ["idTransacao", "linkQRCodePix", "linkBoleto"]) {
      expect(r, `${campo} não devia sair`).not.toHaveProperty(campo);
    }
  });

  it("a lista de campos proibidos é explícita e não vazia", () => {
    expect(M.CAMPOS_NAO_PUBLICOS_RECEBIVEL).toEqual(["idTransacao", "linkQRCodePix", "linkBoleto"]);
  });

  it("o contacto é allow-list: campo pessoal NOVO cai por omissão", () => {
    /* A regressão que isto trava: o Bling passa a devolver telefone/email/morada no
     * contacto, o normalizador é alargado para os guardar, e uma deny-list publicá-los-ia
     * sem ninguém reparar. Com allow-list, entram na resposta só se alguém os acrescentar
     * a CAMPOS_PUBLICOS_CONTATO_RECEBIVEL — ou seja, deliberadamente. */
    const r = M.redigirRecebivelPublico_(titulo({
      contato: {
        id: 555, nome: "Cliente Exemplo", tipo: "F", numeroDocumento: "11122233344",
        telefone: "+351910000000", celular: "+351910000001", email: "pessoa@exemplo.pt",
        endereco: { logradouro: "Rua X", cep: "1000-001", municipio: "Lisboa" },
        inscricaoEstadual: "IE-77788899",
      },
    }));
    expect(Object.keys(r.contato).sort()).toEqual(["id", "nome", "tipo"]);
    const texto = JSON.stringify(r);
    // Sentinelas distintos de propósito: "123456" seria substring do numeroDocumento
    // legítimo do título ("000123456") e daria um falso positivo.
    for (const fuga of ["910000000", "exemplo.pt", "Rua X", "1000-001", "IE-77788899", "11122233344"]) {
      expect(texto, `${fuga} não devia sair`).not.toContain(fuga);
    }
  });

  it("a allow-list do contacto não cresce sem alguém decidir", () => {
    expect(M.CAMPOS_PUBLICOS_CONTATO_RECEBIVEL).toEqual(["id", "nome", "tipo"]);
  });
});

describe("a fronteira a montante: o que o snapshot sequer guarda", () => {
  /* Segunda linha de defesa. A redação protege a SAÍDA; isto fixa a ENTRADA. Se alguém
   * alargar o normalizador para guardar um campo pessoal novo, este teste falha e obriga
   * a decidir o que fazer na camada pública — em vez de o campo aparecer lá sozinho. */
  it("normalizeContaReceberBasico_ só conhece id, nome, numeroDocumento e tipo no contacto", () => {
    const base = fonte.slice(fonte.indexOf("function baseContaReceber_"));
    const corpo = base.slice(0, base.indexOf("\n}"));
    const linha = corpo.split(/\r?\n/).find((l) => l.trim().startsWith("contato:"));
    expect(linha, "forma do contacto não encontrada em baseContaReceber_").toBeTruthy();
    const chaves = [...linha.matchAll(/(\w+)\s*:/g)].map((m) => m[1]).filter((k) => k !== "contato");
    expect(chaves.sort()).toEqual(["id", "nome", "numeroDocumento", "tipo"]);
  });

  it("nenhum campo pessoal óbvio entra no snapshot de recebíveis", () => {
    const base = fonte.slice(fonte.indexOf("function baseContaReceber_"));
    const corpo = base.slice(0, base.indexOf("\n}"));
    for (const proibido of ["telefone", "celular", "email", "endereco", "logradouro", "cep", "municipio"]) {
      expect(corpo, `${proibido} não devia ser recolhido`).not.toContain(proibido);
    }
  });
});

describe("o que TEM de continuar a sair — senão o produto parte", () => {
  const r = M.redigirRecebivelPublico_(titulo());

  it("mantém identidade, valores e datas", () => {
    for (const campo of ["id", "situacao", "vencimento", "valor", "saldo", "dataEmissao",
      "vencimentoOriginal", "competencia", "historico"]) {
      expect(r, `${campo} desapareceu`).toHaveProperty(campo);
    }
    expect(r.valor).toBe(1250.5);
  });

  it("mantém `numeroDocumento` do TÍTULO — não confundir com o do contacto", () => {
    /* São dois campos com o mesmo nome em níveis diferentes. O do título é o número do
     * documento fiscal e é usado pelo documentNormalizer; o do contacto é o CPF/CNPJ.
     * Apagar o errado partia a normalização de documentos. */
    expect(r.numeroDocumento).toBe("000123456");
  });

  it("mantém o contacto identificável pelo que o front usa: id e nome", () => {
    expect(r.contato.id).toBe(555);
    expect(r.contato.nome).toBe("Cliente Exemplo");
    expect(r.contato.tipo).toBe("F");
  });

  it("mantém categoria e forma de pagamento intactas", () => {
    expect(r.categoria).toEqual({ id: 771, nome: "Vendas" });
    expect(r.categoriaNome).toBe("Vendas");
    expect(r.formaPagamento.nome).toBe("Pix");
  });
});

describe("robustez", () => {
  it("não muta o objeto de entrada", () => {
    const original = titulo();
    M.redigirRecebivelPublico_(original);
    expect(original.contato.numeroDocumento).toBe("11122233344");
    expect(original.idTransacao).toBe("TX-ABCDEF");
  });

  it("aguenta título sem contacto", () => {
    const r = M.redigirRecebivelPublico_(titulo({ contato: null }));
    expect(r.contato).toBeNull();
  });

  it("aguenta null, undefined e valores que não são objeto", () => {
    for (const v of [null, undefined, 42, "texto"]) {
      expect(() => M.redigirRecebivelPublico_(v)).not.toThrow();
    }
  });

  it("lista vazia e ausente devolvem lista", () => {
    expect(M.redigirRecebiveisPublicos_([])).toEqual([]);
    expect(M.redigirRecebiveisPublicos_(null)).toEqual([]);
  });

  it("redige a lista inteira, não só o primeiro", () => {
    const lista = [titulo({ id: 1 }), titulo({ id: 2 }), titulo({ id: 3 })];
    const r = M.redigirRecebiveisPublicos_(lista);
    expect(r).toHaveLength(3);
    for (const item of r) expect(item.contato).not.toHaveProperty("numeroDocumento");
  });
});

describe("integração — a redação está no caminho de saída", () => {
  it("serveRecebiveis_ redige antes de responder", () => {
    const fn = fonte.slice(fonte.indexOf("function serveRecebiveis_"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toContain("redigirRecebiveisPublicos_(snap.data)");
    // O payload entregue não pode voltar a ser snap.data cru.
    expect(corpo).not.toContain("data: snap.data,");
  });

  it("o debug descreve os MESMOS dados que foram entregues", () => {
    /* Se o debug corresse sobre snap.data e a resposta sobre a versão redigida, os
     * contadores descreveriam um conjunto que ninguém recebeu. */
    const fn = fonte.slice(fonte.indexOf("function serveRecebiveis_"));
    const corpo = fn.slice(0, fn.indexOf("\n}\n"));
    expect(corpo).toContain("debugRecebiveis_(publico, 'snapshot'");
  });

  it("PROVA: o front produz exatamente o mesmo com e sem os campos redigidos", () => {
    /* O argumento textual (o normalizador não menciona o campo) é indireto. Este é o
     * direto: correr o normalizador REAL do front sobre o título cru e sobre o título
     * redigido tem de dar objetos idênticos. Se algum dia passar a dar diferente, a
     * redação começou a custar funcionalidade e este teste falha antes do deploy. */
    const cru = titulo();
    const redigido = M.redigirRecebivelPublico_(cru);
    expect(normalizeReceivable(redigido)).toEqual(normalizeReceivable(cru));
    // E o resultado do front continua sem qualquer vestígio do CPF.
    expect(JSON.stringify(normalizeReceivable(redigido))).not.toContain("11122233344");
  });

  it("normalizeClient — a única função que leria um taxId de contacto — não está ligada a nada", () => {
    /* Existe e mapeia raw.numeroDocumento -> taxId, o que à primeira vista parece uma
     * dependência do campo removido. Não é: não tem chamadores e `taxId` não é lido em
     * lado nenhum. Fica aqui fixado para que, se alguém a ligar aos recebíveis, apanhe
     * este teste e perceba que receberia null — em vez de descobrir em produção. */
    const usos = front.split(/\r?\n/).filter((l) => l.includes("normalizeClient"));
    expect(usos, "normalizeClient passou a ter chamadores: rever o impacto da redação").toHaveLength(1);
    expect(usos[0]).toContain("export const normalizeClient");
  });

  it("o front nunca dependeu do campo removido", () => {
    /* A prova de que isto não custa funcionalidade: o normalizador de recebíveis do
     * front transporta apenas id e nome do contacto. */
    const inicio = front.indexOf("function normalizeReceivable");
    expect(inicio).toBeGreaterThan(-1);
    const corpo = front.slice(inicio, front.indexOf("\n}", inicio));
    expect(corpo).toContain("contato:");
    expect(corpo).not.toContain("contato.numeroDocumento");
    expect(corpo).not.toContain("linkQRCodePix");
    expect(corpo).not.toContain("linkBoleto");
  });
});
