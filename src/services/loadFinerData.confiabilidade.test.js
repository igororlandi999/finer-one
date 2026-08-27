// Testes da fase de CONFIABILIDADE DOS DADOS (C7F).
//
// Três garantias, todas verificáveis sem rede:
//   P1. a aplicação nunca mostra dados fictícios antes de haver veredito sobre a fonte;
//   P2. as quatro leituras acontecem em paralelo, sem perder o best-effort por fonte;
//   P3. a data de geração do snapshot deixa de ser deitada fora;
//   P4. essa data é lida do contrato que o backend REALMENTE produz (C7F.3A).
//
// O padrão de mock de api.js é o mesmo de loadFinerData.manualInputs.test.js.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Portão manual: cada chamada regista-se e fica pendente até ser libertada à mão. É
 * isto que permite observar se as quatro partiram ANTES de qualquer uma responder —
 * com respostas imediatas, série e paralelo seriam indistinguíveis. */
const state = { chamadas: [], pendentes: [], falhar: new Set(), meta: {}, envelope: {} };

/* `envelope` sobrepõe-se ao shape sintético e existe por um motivo específico: o mock
 * abaixo é uma SUPOSIÇÃO sobre o backend, e foi essa suposição que deixou a C7F.2 passar
 * verde enquanto estava partida em produção. Com `envelope` é possível injetar o payload
 * verdadeiro, tal como observado, em vez de continuar a testar contra o que se imaginou. */
const respostaPara = (recurso) => {
  const meta = state.meta[recurso] ? { meta: state.meta[recurso] } : {};
  const extra = state.envelope[recurso] ?? {};
  if (recurso === "despesas") return { data: PAYABLES, ...meta, ...extra };
  if (recurso === "recebiveis") return { data: [], debug: { fonte: "snapshot" }, ...meta, ...extra };
  if (recurso === "ajustes-manuais") return { data: null, debug: { fonte: "documento-vazio" } };
  return { data: ORDERS, ...meta, ...extra };
};

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn((path, opts) => {
      const recurso = opts?.params?.recurso || "pedidos";
      state.chamadas.push(recurso);
      return new Promise((resolve, reject) => {
        state.pendentes.push(() => (state.falhar.has(recurso)
          ? reject(new Error(`falha simulada em ${recurso}`))
          : resolve(respostaPara(recurso))));
      });
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

/** Deixa a fila de microtarefas correr, sem libertar nenhuma resposta. */
const respirar = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
/** Liberta todas as respostas pendentes e espera o desfecho. */
const libertar = async (promessa) => {
  while (state.pendentes.length) state.pendentes.shift()();
  await respirar();
  while (state.pendentes.length) state.pendentes.shift()();
  return promessa;
};

beforeEach(() => {
  state.chamadas = [];
  state.pendentes = [];
  state.falhar = new Set();
  state.meta = {};
  state.envelope = {};
});
afterEach(() => { vi.clearAllMocks(); });

/* ====================================================================================
 * P2 — PARALELIZAÇÃO
 * ==================================================================================== */
describe("loadFinerData — leitura em paralelo (C7F)", () => {
  it("dispara as quatro fontes ANTES de qualquer uma responder", async () => {
    const promessa = loadFinerData();
    await respirar();

    // Nenhuma resposta foi libertada e mesmo assim as quatro já partiram: em série,
    // só a primeira teria sido feita.
    expect(state.chamadas).toHaveLength(4);
    expect(new Set(state.chamadas)).toEqual(
      new Set(["pedidos", "despesas", "recebiveis", "ajustes-manuais"]));

    await libertar(promessa);
  });

  it("cada fonte é lida uma única vez", async () => {
    const promessa = loadFinerData();
    await respirar();
    await libertar(promessa);
    for (const recurso of ["pedidos", "despesas", "recebiveis", "ajustes-manuais"]) {
      expect(state.chamadas.filter((c) => c === recurso)).toHaveLength(1);
    }
  });

  it("o dataset continua completo e correto depois de paralelizar", async () => {
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("api");
    expect(sales).not.toBeNull();
    expect(sales.despesas).not.toBeNull();
    expect(sales.receitas).toBeTruthy();
  });
});

describe("loadFinerData — falha isolada por fonte (preservado)", () => {
  it("despesas em falha não derrubam pedidos", async () => {
    state.falhar.add("despesas");
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("api");
    expect(sales.despesas).toBeNull();     // gating: cai no mock com selo Demo
    expect(sales.receitas).toBeTruthy();   // pedidos intactos
  });

  it("recebíveis em falha não derrubam o resto", async () => {
    state.falhar.add("recebiveis");
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("api");
    expect(sales.recebiveis).toBeNull();
    expect(sales.despesas).not.toBeNull();
  });

  it("ajustes manuais em falha não derrubam o resto", async () => {
    state.falhar.add("ajustes-manuais");
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("api");
    expect(sales).not.toBeNull();
  });

  it("duas fontes secundárias em falha em simultâneo: as restantes sobrevivem", async () => {
    state.falhar.add("despesas");
    state.falhar.add("recebiveis");
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("api");
    expect(sales.despesas).toBeNull();
    expect(sales.recebiveis).toBeNull();
    expect(sales.receitas).toBeTruthy();
  });

  it("pedidos em falha continuam a derrubar o dataset inteiro", async () => {
    /* Os pedidos são a fonte primária: sem eles não há nada a construir.
     * C7F.1 mudou o VEREDITO, não o comportamento: continua sem dataset, mas o estado
     * passou de "mock" (que dizia ao utilizador que os exemplos eram intencionais)
     * para "unavailable" (que diz que houve avaria). */
    state.falhar.add("pedidos");
    const promessa = loadFinerData();
    await respirar();
    const { source, sales, manualInputs } = await libertar(promessa);
    expect(source).toBe("unavailable");
    expect(sales).toBeNull();
    expect(manualInputs).toBeNull();
  });
});

/* ====================================================================================
 * C7F.1 — AVARIA NUNCA É DEMONSTRAÇÃO.
 *
 * `mock` significa uma coisa só: não há backend configurado, o que é uma decisão de
 * quem instalou. Tudo o resto que corra mal com backend configurado é `unavailable`.
 * ==================================================================================== */
describe("loadFinerData — falha nunca vira modo demonstração (C7F.1)", () => {
  it("falha dos pedidos => unavailable, NUNCA mock", async () => {
    state.falhar.add("pedidos");
    const promessa = loadFinerData();
    await respirar();
    const { source } = await libertar(promessa);
    expect(source).toBe("unavailable");
    expect(source).not.toBe("mock");
  });

  it("falha de TODAS as fontes => unavailable, NUNCA mock", async () => {
    for (const r of ["pedidos", "despesas", "recebiveis", "ajustes-manuais"]) state.falhar.add(r);
    const promessa = loadFinerData();
    await respirar();
    const { source, sales } = await libertar(promessa);
    expect(source).toBe("unavailable");
    expect(source).not.toBe("mock");
    expect(sales).toBeNull();
  });

  it("um insucesso nunca entrega dataset: não há como uma tela cair em números de exemplo sem aviso", async () => {
    state.falhar.add("pedidos");
    const promessa = loadFinerData();
    await respirar();
    const { sales, manualInputs } = await libertar(promessa);
    expect(sales).toBeNull();
    expect(manualInputs).toBeNull();
  });

  it("sucesso continua a devolver api, sem contaminação dos estados novos", async () => {
    const promessa = loadFinerData();
    await respirar();
    const { source } = await libertar(promessa);
    expect(source).toBe("api");
    expect(["mock", "unavailable", "loading"]).not.toContain(source);
  });
});

describe("loadFinerData — mock só com intenção explícita (C7F.1)", () => {
  it("SEM backend configurado => mock: é a demonstração deliberada de quem instalou", async () => {
    /* .env.example documenta que deixar VITE_API_BASE_URL vazio faz a app correr com
     * os dados de exemplo. É o ÚNICO caminho que produz "mock". */
    const api = await import("../services/api.js");
    api.isApiConfigured.mockReturnValueOnce?.(false);
    const espia = vi.spyOn(api, "isApiConfigured").mockReturnValue(false);

    const { source, sales } = await loadFinerData();
    expect(source).toBe("mock");
    expect(sales).toBeNull();
    // E nem sequer se tentou ler: sem backend não há falha a reportar.
    expect(state.chamadas).toHaveLength(0);

    espia.mockRestore();
  });
});

/* ====================================================================================
 * P3 — METADATA DE FRESCURA
 * ==================================================================================== */
describe("loadFinerData — data de geração do snapshot (C7F)", () => {
  it("preserva meta.geradoEm de cada fonte, em vez de a deitar fora", async () => {
    state.meta = {
      pedidos: { geradoEm: "2026-08-14T01:48:56.518Z" },
      despesas: { geradoEm: "2026-08-15T03:00:00.000Z" },
      recebiveis: { geradoEm: "2026-08-16T03:00:00.000Z" },
    };
    const promessa = loadFinerData();
    await respirar();
    const { sales } = await libertar(promessa);
    expect(sales.meta.orders).toBe("2026-08-14T01:48:56.518Z");
    expect(sales.meta.payables).toBe("2026-08-15T03:00:00.000Z");
    expect(sales.meta.receivables).toBe("2026-08-16T03:00:00.000Z");
  });

  it("geradoEm do conjunto é a data MAIS ANTIGA: o dataset não é mais fresco que a pior fonte", async () => {
    state.meta = {
      pedidos: { geradoEm: "2026-08-16T00:00:00.000Z" },
      despesas: { geradoEm: "2026-08-10T00:00:00.000Z" },   // a mais velha
      recebiveis: { geradoEm: "2026-08-18T00:00:00.000Z" },
    };
    const promessa = loadFinerData();
    await respirar();
    const { sales } = await libertar(promessa);
    expect(sales.meta.geradoEm).toBe("2026-08-10T00:00:00.000Z");
  });

  it("fonte sem meta fica a null e NUNCA herda a data de outra fonte", async () => {
    state.meta = { despesas: { geradoEm: "2026-08-15T03:00:00.000Z" } };
    const promessa = loadFinerData();
    await respirar();
    const { sales } = await libertar(promessa);
    expect(sales.meta.orders).toBeNull();
    expect(sales.meta.receivables).toBeNull();
    expect(sales.meta.geradoEm).toBe("2026-08-15T03:00:00.000Z");
  });

  it("fonte que falhou não declara data nenhuma", async () => {
    state.falhar.add("despesas");
    state.meta = { pedidos: { geradoEm: "2026-08-14T00:00:00.000Z" } };
    const promessa = loadFinerData();
    await respirar();
    const { sales } = await libertar(promessa);
    expect(sales.meta.payables).toBeNull();
  });

  it("sem meta em fonte nenhuma, geradoEm é null — nunca o relógio local", async () => {
    const antes = new Date().toISOString();
    const promessa = loadFinerData();
    await respirar();
    const { sales } = await libertar(promessa);
    expect(sales.meta.geradoEm).toBeNull();
    expect(sales.meta.geradoEm).not.toBe(antes);
  });

  it("meta inválida ou vazia não vira data", async () => {
    for (const invalido of [{ geradoEm: "" }, { geradoEm: 12345 }, { geradoEm: null }, {}]) {
      state.chamadas = []; state.pendentes = [];
      state.meta = { pedidos: invalido };
      const promessa = loadFinerData();
      await respirar();
      const { sales } = await libertar(promessa);
      expect(sales.meta.orders).toBeNull();
    }
  });

  it("a metadata não altera cálculo nenhum: o dataset é idêntico com e sem ela", async () => {
    const semMeta = await (async () => {
      const p = loadFinerData(); await respirar(); return libertar(p);
    })();
    state.chamadas = []; state.pendentes = [];
    state.meta = { pedidos: { geradoEm: "2026-08-14T00:00:00.000Z" } };
    const comMeta = await (async () => {
      const p = loadFinerData(); await respirar(); return libertar(p);
    })();

    // Tudo o que é financeiro tem de coincidir; só `meta` difere.
    expect(comMeta.sales.financeiro).toEqual(semMeta.sales.financeiro);
    expect(comMeta.sales.receitas).toEqual(semMeta.sales.receitas);
    expect(comMeta.sales.closings).toEqual(semMeta.sales.closings);
    expect(comMeta.sales.meta).not.toEqual(semMeta.sales.meta);
  });
});

/* ====================================================================================
 * P4 — O CONTRATO REAL DO BACKEND (C7F.3A)
 *
 * A C7F.2 leu `meta.geradoEm` e testou-o contra um mock que produzia `meta.geradoEm`.
 * O teste era circular: confirmava que o código lia aquilo que o próprio teste acabara
 * de escrever. Em produção nenhuma das três fontes emite esse caminho — e a frescura
 * ficou permanentemente UNKNOWN sem que uma única asserção protestasse.
 *
 * Estes testes fecham essa porta: pelo menos um corre contra o envelope VERDADEIRO,
 * copiado da resposta de produção, e não contra o shape que se imaginou.
 * ==================================================================================== */

/* Envelope REAL de recebíveis — GET {BASE}/pedidos/vendas?recurso=recebiveis, observado
 * em 2026-08-22. Reproduzido tal como veio, com os dois pormenores que são o cerne desta
 * microfase: NÃO existe chave `meta`, e a data vive em `debug.snapshotMeta.geradoEm`.
 * O título é um real, com todos os campos que o Bling devolve — para o teste não passar
 * apenas porque foi alimentado com um objeto conveniente. */
const RECEBIVEL_REAL = {
  id: 26195191559,
  idOrigem: 26195191495,
  situacao: 1,
  vencimento: "2026-08-28",
  valor: 48,
  dataEmissao: "2026-06-29",
  idTransacao: "",
  linkQRCodePix: "",
  linkBoleto: "",
  contato: { id: 17898835677, nome: "62.214.973 RAFAEL CASTANHO PIGNATARO", numeroDocumento: "62214973000180", tipo: "J" },
  formaPagamento: { id: 8879614, codigoFiscal: 20, nome: "Pix" },
  contaContabil: { id: 14893037382 },
  origem: { id: 26195191495, numero: "978", dataEmissao: "2026-06-29", situacao: 1, tipoOrigem: "venda", valor: 48 },
  numeroDocumento: "000001026",
  vencimentoOriginal: "2026-08-28",
  competencia: "2026-06-29",
  historico: "Ref. ao pedido de venda nº 978",
  saldo: 48,
  borderos: [],
  categoria: { id: 14722444194, nome: "Vendas de mercadorias" },
  portador: { id: 14893037382 },
  vendedor: { id: 0 },
  ocorrencia: { tipo: 1 },
  categoriaId: 14722444194,
  categoriaNome: "Vendas de mercadorias",
  detalheCarregado: true,
};

/* O bloco `debug` real, na íntegra. `snapshotMeta.geradoEm` é a única data que o backend
 * declara hoje, em qualquer das três fontes. */
const DEBUG_REAL = {
  totalItens: 1108,
  situacoesDistintas: { 1: 48, 2: 1060 },
  periodoConsultado: "completo (sem filtro de data, como em despesas)",
  vencimentoMin: "2026-01-23",
  vencimentoMax: "2026-09-18",
  fonte: "snapshot",
  snapshotMeta: {
    geradoEm: "2026-07-21T01:42:51.487Z",
    totalTitulos: 1108,
    hidratadosNestaExecucao: 215,
    reaproveitados: 893,
    chamadasDetalhe: 215,
    parcial: false,
  },
};

/** Uma leitura completa, com todas as respostas libertadas. */
const carregar = async () => {
  state.chamadas = []; state.pendentes = [];
  const p = loadFinerData();
  await respirar();
  return libertar(p);
};

describe("lerGeradoEm — os dois contratos (C7F.3A)", () => {
  it("T1 — meta.geradoEm continua a ser lido (contrato canónico, preservado)", async () => {
    state.meta = { recebiveis: { geradoEm: "2026-08-20T03:00:00.000Z" } };
    const { sales } = await carregar();
    expect(sales.meta.receivables).toBe("2026-08-20T03:00:00.000Z");
  });

  it("T2 — debug.snapshotMeta.geradoEm passa a ser reconhecido", async () => {
    state.envelope = { recebiveis: {
      debug: { fonte: "snapshot", snapshotMeta: { geradoEm: "2026-07-21T01:42:51.487Z" } },
    } };
    const { sales } = await carregar();
    expect(sales.meta.receivables).toBe("2026-07-21T01:42:51.487Z");
  });

  it("T3 — com os dois presentes, meta.geradoEm tem precedência", async () => {
    state.meta = { recebiveis: { geradoEm: "2026-08-20T03:00:00.000Z" } };
    state.envelope = { recebiveis: {
      debug: { fonte: "snapshot", snapshotMeta: { geradoEm: "2026-07-21T01:42:51.487Z" } },
    } };
    const { sales } = await carregar();
    expect(sales.meta.receivables).toBe("2026-08-20T03:00:00.000Z");
  });

  it("T4 — debug sem snapshotMeta não produz data nenhuma", async () => {
    state.envelope = { recebiveis: { debug: { fonte: "snapshot" } } };
    const { sales } = await carregar();
    expect(sales.meta.receivables).toBeNull();
  });

  it("T5 — geradoEm vazio é ausência, nos DOIS caminhos", async () => {
    state.envelope = { recebiveis: {
      debug: { fonte: "snapshot", snapshotMeta: { geradoEm: "" } },
    } };
    expect((await carregar()).sales.meta.receivables).toBeNull();

    state.envelope = {};
    state.meta = { recebiveis: { geradoEm: "" } };
    expect((await carregar()).sales.meta.receivables).toBeNull();
  });

  it("T6 — geradoEm não-string é ausência, nos DOIS caminhos", async () => {
    for (const invalido of [12345, null, true, { quando: "ontem" }, ["2026-07-21"]]) {
      state.envelope = { recebiveis: {
        debug: { fonte: "snapshot", snapshotMeta: { geradoEm: invalido } },
      } };
      expect((await carregar()).sales.meta.receivables).toBeNull();
    }
    for (const invalido of [12345, null, true, { quando: "ontem" }]) {
      state.envelope = {};
      state.meta = { recebiveis: { geradoEm: invalido } };
      expect((await carregar()).sales.meta.receivables).toBeNull();
    }
  });
});

describe("payload REAL de produção (C7F.3A)", () => {
  it("T7 — a data do envelope real propaga até sales.meta.receivables", async () => {
    state.envelope = { recebiveis: { data: [RECEBIVEL_REAL], debug: DEBUG_REAL } };
    const { sales } = await carregar();
    expect(sales.meta.receivables).toBe("2026-07-21T01:42:51.487Z");
  });

  it("T8 — sales.meta.geradoEm passa a usar essa data (hoje a única fonte que a declara)", async () => {
    /* Retrato fiel da produção em 2026-08-22: pedidos e despesas SEM metadata nenhuma
     * (chaves de topo: apenas `data`), recebíveis com a data enterrada no debug. */
    state.envelope = { recebiveis: { data: [RECEBIVEL_REAL], debug: DEBUG_REAL } };
    const { sales } = await carregar();
    expect(sales.meta.orders).toBeNull();
    expect(sales.meta.payables).toBeNull();
    expect(sales.meta.geradoEm).toBe("2026-07-21T01:42:51.487Z");
  });

  it("a política da fonte mais ANTIGA não é suavizada pela mais recente", async () => {
    /* Se um dia os pedidos declararem uma data fresca, o conjunto continua a valer pela
     * pior fonte. Escolher a mais recente daria um número mais simpático e falso. */
    state.meta = { pedidos: { geradoEm: "2026-08-22T00:00:00.000Z" } };
    state.envelope = { recebiveis: { data: [RECEBIVEL_REAL], debug: DEBUG_REAL } };
    const { sales } = await carregar();
    expect(sales.meta.orders).toBe("2026-08-22T00:00:00.000Z");
    expect(sales.meta.geradoEm).toBe("2026-07-21T01:42:51.487Z");
  });

  it("T9 — a metadata não move um único número: mesmos dados, com e sem debug", async () => {
    state.envelope = { recebiveis: { data: [RECEBIVEL_REAL] } };
    const sem = await carregar();
    state.envelope = { recebiveis: { data: [RECEBIVEL_REAL], debug: DEBUG_REAL } };
    const com = await carregar();

    expect(com.sales.financeiro).toEqual(sem.sales.financeiro);
    expect(com.sales.receitas).toEqual(sem.sales.receitas);
    expect(com.sales.despesas).toEqual(sem.sales.despesas);
    expect(com.sales.recebiveis).toEqual(sem.sales.recebiveis);
    expect(com.sales.closings).toEqual(sem.sales.closings);
    // A ÚNICA diferença admissível entre as duas leituras é a própria metadata.
    expect(sem.sales.meta.geradoEm).toBeNull();
    expect(com.sales.meta.geradoEm).toBe("2026-07-21T01:42:51.487Z");
  });
});

/* ====================================================================================
 * P1 — NUNCA MOSTRAR DADOS FICTÍCIOS POR OMISSÃO.
 *
 * O projeto não tem ambiente DOM nem testing-library (ver AjustesManuais.estrutura),
 * pelo que a garantia se verifica sobre o código-fonte. É grosseiro, mas apanha
 * exatamente a regressão que interessa: alguém voltar a pôr o contexto a arrancar em
 * modo demonstração, ou a remover o gate.
 * ==================================================================================== */
describe("arranque sem dados fictícios (C7F)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const ler = (...p) => readFileSync(join(raiz, "..", ...p), "utf8");
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const contexto = semComentarios(ler("context", "FinerDataContext.jsx"));
  const shell = semComentarios(ler("layouts", "AppShell.jsx"));
  const banner = semComentarios(ler("components", "ui", "DemoBanner.jsx"));

  it("o contexto NÃO arranca em modo demonstração", () => {
    expect(contexto).toContain("useState(DATA_SOURCE.LOADING)");
    expect(contexto).not.toMatch(/useState\(\s*["']mock["']\s*\)/);
  });

  it("existe um estado de origem distinto de real e de demonstração", () => {
    /* C7F.3D: os quatro valores passaram para utils/dataSourceStates.js — um módulo
     * PURO, para que os view-models os possam importar sem arrastar React. O contexto
     * reexporta-os, pelo que nenhum consumidor mudou. */
    const estados = ler("utils", "dataSourceStates.js");
    expect(estados).toContain("LOADING:");
    expect(estados).toContain("API:");
    expect(estados).toContain("MOCK:");
    /* IMPORT + reexport, e NUNCA a forma agregadora `export { X } from "..."`.
     * A agregadora não cria binding local: o provider usa DATA_SOURCE.LOADING no corpo
     * e a app arrancava em branco com "DATA_SOURCE is not defined". A suite inteira
     * ficou verde nesse estado, porque este projeto não monta componentes — daí a
     * guarda ser sobre o texto do ficheiro, que é o que se consegue verificar aqui. */
    expect(contexto).toContain('import { DATA_SOURCE } from "../utils/dataSourceStates.js"');
    expect(contexto).toContain("export { DATA_SOURCE }");
    expect(contexto.includes('export { DATA_SOURCE } from')).toBe(false);
  });

  it("o AppShell bloqueia as páginas enquanto a leitura decorre", () => {
    expect(shell).toContain("useFinerData()");
    expect(shell).toContain("loading ? <PageSkeleton />");
  });

  it("o banner não declara demonstração antes de haver veredito", () => {
    expect(banner).toContain("if (source === DATA_SOURCE.LOADING) return null;");
    // E a frase de demonstração continua a existir, para quando ela for verdade.
    expect(ler("components", "ui", "DemoBanner.jsx")).toContain("Modo demonstração");
  });

  it("o esqueleto não mostra número nem valor nenhum", () => {
    const skeleton = ler("components", "ui", "PageSkeleton.jsx");
    expect(skeleton).not.toContain("mockData");
    expect(skeleton).not.toContain("formatMoney");
    expect(skeleton).not.toMatch(/R\$|€/);
  });

  it("mockData continua a existir para o modo demonstração explícito", () => {
    // A regra é não o mostrar por omissão — não é apagá-lo.
    expect(ler("components", "ui", "DemoBanner.jsx")).toContain("Dados fictícios");
  });
});

describe("indisponibilidade tem ecrã próprio (C7F.1)", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const ler = (...p) => readFileSync(join(raiz, "..", ...p), "utf8");
  const semComentarios = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const contexto = semComentarios(ler("context", "FinerDataContext.jsx"));
  const shell = semComentarios(ler("layouts", "AppShell.jsx"));
  const banner = semComentarios(ler("components", "ui", "DemoBanner.jsx"));
  const servico = semComentarios(ler("services", "blingDataService.js"));
  const ecra = ler("components", "ui", "DataUnavailable.jsx");

  it("existem os quatro estados de origem", () => {
    const estados = ler("utils", "dataSourceStates.js");
    for (const estado of ["LOADING:", "API:", "MOCK:", "UNAVAILABLE:"]) {
      expect(estados).toContain(estado);
    }
  });

  it("o contexto trata falha como avaria, não como demonstração", () => {
    expect(contexto).toContain("setSource(DATA_SOURCE.UNAVAILABLE)");
    expect(contexto).not.toContain("setSource(DATA_SOURCE.MOCK)");
  });

  it("no serviço, o ÚNICO caminho para mock é não haver backend configurado", () => {
    // Uma só ocorrência de `source: "mock"`, e tem de ser a do isApiConfigured.
    const ocorrenciasMock = servico.match(/source:\s*"mock"/g) || [];
    expect(ocorrenciasMock).toHaveLength(1);
    expect(servico).toMatch(/if\s*\(!isApiConfigured\(\)\)\s*\{[\s\S]{0,200}?source:\s*"mock"/);
    // E os dois caminhos de insucesso devolvem unavailable.
    expect((servico.match(/source:\s*"unavailable"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("o AppShell não monta páginas quando os dados estão indisponíveis", () => {
    expect(shell).toContain("DATA_SOURCE.UNAVAILABLE");
    expect(shell).toContain("<DataUnavailable");
  });

  it("o ecrã de indisponibilidade não mostra número, valor nem dados de exemplo", () => {
    /* A garantia real não é "não contém dígitos" — o ficheiro está cheio de classes
     * como `p-10` e `size={22}`, que não são montantes. A garantia é que o componente
     * não tem forma NENHUMA de obter um valor: não importa dados de exemplo, não
     * importa o formatador de moeda, e não recebe dataset por props. */
    expect(ecra).not.toContain("mockData");
    expect(ecra).not.toContain("formatMoney");
    expect(ecra).not.toContain("useFinerData");
    expect(ecra).not.toMatch(/from ["'].*\/(data|lib)\//);
    expect(ecra).not.toMatch(/R\$|€/);
    /* Sobre o código SEM comentários: o cabeçalho do componente explica precisamente
     * que uma avaria não pode ser apresentada como demonstração, e proibir a palavra
     * no comentário proibiria documentar a decisão — o oposto do que se pretende. */
    expect(semComentarios(ecra)).not.toContain("demonstração");
  });

  it("o ecrã de indisponibilidade explica e oferece uma ação que existe mesmo", () => {
    expect(ecra).toContain("Não foi possível carregar os dados da empresa.");
    expect(ecra).toContain("Tentar novamente");
    expect(shell).toContain("onRetry={reload}");     // ligado à releitura real
  });

  it("o banner distingue avaria de demonstração, sem vocabulário técnico", () => {
    expect(banner).toContain("DATA_SOURCE.UNAVAILABLE");
    expect(ler("components", "ui", "DemoBanner.jsx"))
      .toContain("Sem ligação ao serviço de dados.");
    const texto = ler("components", "ui", "DemoBanner.jsx").toLowerCase();
    for (const termo of ["unavailable\"", "timeout", "http", "erro 500", "api base"]) {
      expect(texto).not.toContain(termo);
    }
  });
});
