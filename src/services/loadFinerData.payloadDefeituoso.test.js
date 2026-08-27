// O Apps Script responde HTTP 200 mesmo quando falha — o veredito está no CORPO.
//
// Antes, `rows` era extraído com `res?.data ?? res ?? []`. Perante um payload de erro
// (`{ error: true }`), `data` é indefinido, o `??` caía para o próprio objeto de erro,
// e o `.map()` seguinte rebentava com TypeError FORA do allSettled — apanhado só pelo
// catch global do loadFinerData. Uma falha em DESPESAS derrubava pedidos, recebíveis e
// ajustes manuais para `unavailable`, anulando o best-effort por fonte.
//
// Estes testes fixam o comportamento correto: a fonte defeituosa cai sozinha.

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Payload devolvido por recurso. Cada teste escreve aqui o que quer simular. */
const respostas = {};

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      const recurso = opts?.params?.recurso || "pedidos";
      if (!(recurso in respostas)) throw new Error(`recurso não simulado: ${recurso}`);
      const r = respostas[recurso];
      if (typeof r === "function") return r();
      return r;
    }),
  };
});

import { loadFinerData } from "../services/blingDataService.js";

const ord = (id, data, total) => ({
  id, numero: id, data, total,
  situacao: { id: 9, valor: 9 }, contato: { id: 1, nome: "Cliente A" }, itens: [],
});
const ORDERS = [ord(1, "2026-05-10", 40000), ord(2, "2026-06-10", 60000)];
const pag = (id, data, valor) => ({
  id, situacao: 2, vencimento: data, dataEmissao: data,
  valor, categoriaNome: "Aluguel", contato: { id: 7, nome: "Fornecedor F" },
});
const PAYABLES = [pag(1, "2026-05-08", 1000), pag(2, "2026-06-08", 2000)];

beforeEach(() => {
  respostas.pedidos = { data: ORDERS, meta: { geradoEm: "2026-08-23T04:00:00.000Z", parcial: false } };
  respostas.despesas = { data: PAYABLES, meta: { geradoEm: "2026-08-23T05:00:00.000Z", parcial: false } };
  respostas.recebiveis = { data: [], debug: { fonte: "snapshot" } };
  respostas["ajustes-manuais"] = { data: null, debug: { fonte: "documento-vazio" } };
});

describe("payload de erro numa fonte SECUNDÁRIA não derruba o dataset", () => {
  it("despesas com { error: true } deixa o dataset vivo", async () => {
    respostas.despesas = { error: true, message: "Erro inesperado.", details: "" };
    const r = await loadFinerData();
    expect(r.source).toBe("api");     // e não "unavailable"
    expect(r.sales).not.toBeNull();
  });

  it("despesas com RECURSO_DESCONHECIDO também não derruba o dataset", async () => {
    // Forma nova, introduzida pela guarda de recurso desconhecido do doGet.
    respostas.despesas = {
      error: true, code: "RECURSO_DESCONHECIDO", message: "Recurso nao reconhecido.",
      recursosSuportados: ["pedidos", "despesas", "recebiveis", "ajustes-manuais"],
    };
    const r = await loadFinerData();
    expect(r.source).toBe("api");
    expect(r.sales).not.toBeNull();
  });

  it("despesas com data que não é lista é falha, não dataset", async () => {
    // O caso perverso: HTTP 200, campo `data` presente, mas um objeto. Sem guarda,
    // isto chegava ao .map() como se fosse uma coleção.
    respostas.despesas = { data: { titulos: 301 } };
    const r = await loadFinerData();
    expect(r.source).toBe("api");
    expect(r.sales).not.toBeNull();
  });

  it("a frescura da fonte que falhou não é herdada das outras", async () => {
    respostas.despesas = { error: true, message: "Erro." };
    const r = await loadFinerData();
    expect(r.sales.meta.payables).toBeNull();
    expect(r.sales.meta.orders).toBe("2026-08-23T04:00:00.000Z");
  });

  it("a completude da fonte que falhou fica indeterminada, não completa", async () => {
    respostas.despesas = { error: true, message: "Erro." };
    const r = await loadFinerData();
    expect(r.sales.meta.parcial.payables).toBeNull();
    // Uma fonte que não se pronunciou impede afirmar que está tudo completo.
    expect(r.sales.meta.todasCompletas).toBe(false);
  });
});

describe("payload de erro na fonte PRIMÁRIA é avaria declarada", () => {
  it("pedidos com { error: true } dá unavailable, nunca mock", async () => {
    // A distinção que o produto inteiro assenta: sem pedidos não há dataset, e um
    // backend configurado que falha é avaria — jamais modo demonstração.
    respostas.pedidos = { error: true, message: "Erro inesperado." };
    const r = await loadFinerData();
    expect(r.source).toBe("unavailable");
    expect(r.sales).toBeNull();
  });

  it("pedidos sem campo data nenhum dá unavailable", async () => {
    respostas.pedidos = { meta: { geradoEm: "2026-08-23T04:00:00.000Z" } };
    const r = await loadFinerData();
    expect(r.source).toBe("unavailable");
  });
});

describe("o que continua a passar — zero é um facto, não uma falha", () => {
  it("data: [] é aceite como dataset legítimo de zero registos", async () => {
    respostas.despesas = { data: [], meta: { parcial: false } };
    const r = await loadFinerData();
    expect(r.source).toBe("api");
    expect(r.sales.meta.parcial.payables).toBe(false);
  });

  it("array cru (sem envelope) continua a ser aceite", async () => {
    // Contrato tolerado desde sempre: o backend pode devolver a lista sem envelope.
    respostas.despesas = PAYABLES;
    const r = await loadFinerData();
    expect(r.source).toBe("api");
    expect(r.sales).not.toBeNull();
  });

  it("recebíveis com fonte snapshot-vazio continua a ser ausência, não zero", async () => {
    respostas.recebiveis = { data: [], debug: { fonte: "snapshot-vazio" } };
    const r = await loadFinerData();
    expect(r.source).toBe("api");
    expect(r.sales.meta.receivables).toBeNull();
  });
});
