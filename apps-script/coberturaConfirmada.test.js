// COBERTURA CONFIRMADA — escrita interna, testada contra a fonte REAL.
//
// ─── O QUE ESTA ESCRITA É, E O QUE NÃO É ────────────────────────────────────────────
// Um operador confirma, no editor do Apps Script, que os documentos relevantes de
// despesas de um mês já estão disponíveis. Não é fecho contabilístico, não valida a
// contabilidade e não afirma que os valores estão corretos.
//
// ─── NÃO HÁ HTTP, E ISSO É O TESTE MAIS IMPORTANTE DAQUI ────────────────────────────
// O Web App é `ANYONE_ANONYMOUS`. Um endpoint de escrita alcançável a partir do frontend
// seria um endpoint de escrita ANÓNIMO sobre dados financeiros. Enquanto não houver
// autenticação de utilizador, isto não pode ganhar um `doPost` — e há um teste
// estrutural aqui para o garantir.
//
// As dependências são injetadas (`deps`), o que permite exercer criação, merge, backup,
// corrupção, duplicidade, lock e falha de escrita sem tocar no Drive real e sem gravar
// uma única cobertura verdadeira.
//
// Testa a fonte LOCAL. Produção corre a versão 12, que não tem este bloco.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(join(raiz, "AjustesManuaisBackend.js"), "utf8");

/* Avalia o ficheiro inteiro num sandbox com os globais que o Apps Script fornece. É
 * assim que se testa a fonte REAL em vez de uma cópia que pode divergir dela. */
function carregarBackend() {
  const safeLog_ = vi.fn();
  const Logger = { log: vi.fn() };
  /* `safeParse_` vive em `Código.js`. No runtime do Apps Script todos os ficheiros
   * partilham um só escopo global, pelo que a chamada resolve; aqui carrega-se um
   * ficheiro de cada vez, e sem esta injeção o teste falharia por uma razão que não
   * existe em produção. A implementação é a REAL, copiada de Código.js:825. */
  const safeParse_ = (text) => { try { return JSON.parse(text); } catch { return null; } };
  const ctx = {
    safeLog_, Logger, safeParse_,
    DriveApp: undefined, LockService: undefined, PropertiesService: undefined,
  };
  const nomes = Object.keys(ctx);
  const fn = new Function(...nomes, fonte + `
    return {
      validarCoberturaConfirmada_, aplicarCoberturaNoDocumento_, salvarCoberturaConfirmada_,
      validarAjusteManual_, aplicarAjusteNoDocumento_,
    };`);
  return fn(...nomes.map((n) => ctx[n]));
}

const B = carregarBackend();

/** 25 de agosto de 2026: o último mês encerrado é julho. */
const AGORA = new Date(2026, 7, 25, 12, 0, 0);
const AGORA_ISO = AGORA.toISOString();

/** Drive falso: um mapa de ficheiros em memória. */
function depsFalsas({ ficheiros = [], lockOk = true, falharEscrita = false } = {}) {
  const store = new Map(ficheiros.map((f) => [f.id, { ...f }]));
  let proximoId = 100;
  const props = new Map();
  return {
    _store: store,
    listarPorNome: (nome) => [...store.values()].filter((f) => f.name === nome),
    obterPorId: (id) => store.get(id) || null,
    lerTexto: (id) => (store.get(id) || {}).text,
    escreverTexto: (id, texto) => {
      if (falharEscrita) throw new Error("drive em baixo");
      store.set(id, { ...store.get(id), text: texto });
    },
    criarFicheiro: (nome, texto) => {
      if (falharEscrita) throw new Error("drive em baixo");
      const f = { id: `f${proximoId++}`, name: nome, text: texto };
      store.set(f.id, f);
      return f;
    },
    obterLock: () => (lockOk ? { ok: true, release: () => {} } : { ok: false }),
    getProp: (k) => props.get(k) || null,
    setProp: (k, v) => props.set(k, v),
    deleteProp: (k) => props.delete(k),
    agora: () => AGORA_ISO,
  };
}

const DOC = "finer_one_ajustes_manuais_overcel.json";
const docComCmv = (extra = {}) => JSON.stringify({
  companyId: "overcel",
  updatedAt: "2026-08-21T22:03:05.600Z",
  months: { "2026-06": { cmv: { value: 116039.7, updatedAt: "2026-08-21T22:03:05.600Z", note: "CMV mensal confirmado" } } },
  ...extra,
});

describe("validação — o que não se pode confirmar", () => {
  it("aceita o último mês ENCERRADO", () => {
    const r = B.validarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, AGORA);
    expect(r.ok).toBe(true);
    expect(r.data.monthKey).toBe("2026-07");
  });

  /* Confirmar um mês em curso é afirmar sobre dias que ainda não aconteceram. */
  it("recusa o mês CORRENTE e qualquer mês futuro", () => {
    for (const mk of ["2026-08", "2026-09", "2027-03"]) {
      const r = B.validarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: mk }, AGORA);
      expect(r.ok).toBe(false);
      expect(r.error.code).toBe("FUTURE_MONTH");
    }
  });

  it("aceita meses ANTERIORES — é assim que se corrige uma confirmação a mais", () => {
    expect(B.validarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-04" }, AGORA).ok)
      .toBe(true);
  });

  it("recusa fonte que não seja as contas a pagar", () => {
    const r = B.validarCoberturaConfirmada_({ source: "orders", action: "upsert", monthKey: "2026-07" }, AGORA);
    expect(r.error.code).toBe("INVALID_SOURCE");
  });

  it("recusa mês malformado e payload que não é objeto", () => {
    expect(B.validarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-13" }, AGORA).error.code)
      .toBe("INVALID_MONTH");
    expect(B.validarCoberturaConfirmada_(null, AGORA).error.code).toBe("INVALID_PAYLOAD");
    expect(B.validarCoberturaConfirmada_([], AGORA).error.code).toBe("INVALID_PAYLOAD");
  });

  it("delete não precisa de mês", () => {
    expect(B.validarCoberturaConfirmada_({ source: "payables", action: "delete" }, AGORA).ok).toBe(true);
  });
});

describe("merge — a cobertura não toca no CMV, e o CMV não toca na cobertura", () => {
  it("escrever cobertura preserva `months` intacto", () => {
    const doc = JSON.parse(docComCmv());
    B.aplicarCoberturaNoDocumento_(doc, { source: "payables", action: "upsert", monthKey: "2026-07", note: null }, AGORA_ISO);
    expect(doc.months["2026-06"].cmv.value).toBe(116039.7);
    expect(doc.coverage.payables.completeThroughMonth).toBe("2026-07");
    expect(doc.coverage.payables.confirmedBy).toBe("user");
    expect(doc.coverage.payables.confirmedAt).toBe(AGORA_ISO);
  });

  it("escrever CMV preserva a cobertura intacta", () => {
    const doc = JSON.parse(docComCmv({ coverage: { payables: { completeThroughMonth: "2026-07" } } }));
    B.aplicarAjusteNoDocumento_(doc, { monthKey: "2026-07", key: "cmv", action: "upsert", value: 99, note: null }, AGORA_ISO);
    expect(doc.coverage.payables.completeThroughMonth).toBe("2026-07");
    expect(doc.months["2026-07"].cmv.value).toBe(99);
  });

  it("campos desconhecidos do bloco de cobertura são preservados, não substituídos", () => {
    const doc = JSON.parse(docComCmv({ coverage: { payables: { completeThroughMonth: "2026-06", futuro: "x" } } }));
    B.aplicarCoberturaNoDocumento_(doc, { source: "payables", action: "upsert", monthKey: "2026-07", note: null }, AGORA_ISO);
    expect(doc.coverage.payables.futuro).toBe("x");
  });

  /* REVOGAR: a cobertura volta a ser a de company.js. */
  it("delete remove o bloco e não deixa um `coverage: {}` órfão", () => {
    const doc = JSON.parse(docComCmv({ coverage: { payables: { completeThroughMonth: "2026-07" } } }));
    const r = B.aplicarCoberturaNoDocumento_(doc, { source: "payables", action: "delete" }, AGORA_ISO);
    expect(r.alterado).toBe(true);
    expect(doc.coverage).toBeUndefined();
    // E o CMV sobrevive à revogação.
    expect(doc.months["2026-06"].cmv.value).toBe(116039.7);
  });

  it("delete sobre cobertura inexistente é idempotente — não escreve nada", () => {
    const doc = JSON.parse(docComCmv());
    expect(B.aplicarCoberturaNoDocumento_(doc, { source: "payables", action: "delete" }, AGORA_ISO).alterado)
      .toBe(false);
  });
});

describe("orquestração — as mesmas garantias da escrita do CMV", () => {
  it("cria o documento quando não existe nenhum", () => {
    const d = depsFalsas();
    const r = B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d);
    expect(r.ok).toBe(true);
    expect(r.data.completeThroughMonth).toBe("2026-07");
    const gravado = JSON.parse([...d._store.values()][0].text);
    expect(gravado.companyId).toBe("overcel");
    expect(gravado.coverage.payables.completeThroughMonth).toBe("2026-07");
  });

  it("grava BACKUP do estado anterior antes de escrever por cima", () => {
    const d = depsFalsas({ ficheiros: [{ id: "f1", name: DOC, text: docComCmv() }] });
    B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d);
    const bak = [...d._store.values()].find((f) => f.name === "finer_one_ajustes_manuais_overcel.bak.json");
    expect(bak).toBeDefined();
    // O backup tem o estado ANTERIOR: sem cobertura.
    expect(JSON.parse(bak.text).coverage).toBeUndefined();
  });

  it("documento de OUTRA empresa não é escrito", () => {
    const d = depsFalsas({ ficheiros: [{ id: "f1", name: DOC, text: JSON.stringify({ companyId: "outra", months: {} }) }] });
    const r = B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d);
    expect(r.ok).toBe(false);
    expect(r.error.code).toBe("DOCUMENT_COMPANY_MISMATCH");
  });

  it("documento ilegível aborta sem escrever", () => {
    const d = depsFalsas({ ficheiros: [{ id: "f1", name: DOC, text: "{ nao e json" }] });
    const r = B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d);
    expect(r.error.code).toBe("DOCUMENT_CORRUPTED");
  });

  it("duplicados do documento abortam — não se escolhe um deles às cegas", () => {
    const d = depsFalsas({ ficheiros: [
      { id: "f1", name: DOC, text: docComCmv() }, { id: "f2", name: DOC, text: docComCmv() },
    ] });
    const r = B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d);
    expect(r.error.code).toBe("DOCUMENT_AMBIGUOUS");
  });

  it("sem lock não escreve", () => {
    const d = depsFalsas({ lockOk: false });
    expect(B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d).error.code)
      .toBe("BUSY");
  });

  it("falha de escrita nunca é reportada como sucesso", () => {
    const d = depsFalsas({ falharEscrita: true });
    expect(B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07" }, d).error.code)
      .toBe("WRITE_FAILED");
  });

  it("um mês futuro não chega sequer ao Drive", () => {
    const d = depsFalsas();
    const r = B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-12" }, d);
    expect(r.error.code).toBe("FUTURE_MONTH");
    expect(d._store.size).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════
 * A FRONTEIRA DE SEGURANÇA. Enquanto o Web App for ANYONE_ANONYMOUS, esta escrita não
 * pode ser alcançável por HTTP: seria escrita anónima sobre dados financeiros.
 * ════════════════════════════════════════════════════════════════════════════════ */
describe("segurança — a escrita não é alcançável pela web", () => {
  it("não existe doPost em ficheiro nenhum do Apps Script", () => {
    const ficheiros = ["AjustesManuaisBackend.js", "Código.js", "Despesasbackend.js", "RecebiveisBackend.js"];
    for (const f of ficheiros) {
      const src = readFileSync(join(raiz, f), "utf8");
      expect(src, `${f} ganhou um doPost`).not.toMatch(/function\s+doPost/);
    }
  });

  it("o doGet não encaminha para a escrita de cobertura", () => {
    const codigo = readFileSync(join(raiz, "Código.js"), "utf8");
    const i = codigo.indexOf("function doGet");
    const corpo = codigo.slice(i, codigo.indexOf("\n}", i) + 2);
    expect(corpo).not.toContain("salvarCoberturaConfirmada_");
    expect(corpo).not.toContain("salvarAjusteManual_");
  });

  it("o documento não guarda quem confirmou — sem PII", () => {
    const d = depsFalsas();
    B.salvarCoberturaConfirmada_({ source: "payables", action: "upsert", monthKey: "2026-07", note: "faturas recebidas" }, d);
    const texto = [...d._store.values()][0].text;
    expect(JSON.parse(texto).coverage.payables.confirmedBy).toBe("user");
    expect(texto).not.toMatch(/@|email|nome|utilizador/i);
  });
});
