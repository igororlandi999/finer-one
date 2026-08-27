// EQUIVALÊNCIA ENTRE O TRANSPORTE LEGADO E O PROTEGIDO.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A PERGUNTA
// ═══════════════════════════════════════════════════════════════════════════════════
// `VITE_PROTECTED_DATA_TRANSPORT=true` troca a forma como a aplicação pede os dados:
//
//   legado      GET {API}/pedidos/vendas?recurso=despesas
//   protegido   GET {API}/companies/overcel/financial-data?recurso=despesas
//
// São dois caminhos, dois endpoints, e — o ponto perigoso — DUAS CÓPIAS da tradução
// `recurso -> parâmetro do Apps Script`: uma em `src/services/dataTransport.js`
// (RECURSO_LEGADO) e outra em `api/companies/[companyId]/financial-data.js`
// (RECURSO_UPSTREAM), que vive noutro repositório. Hoje são idênticas. Nada as obriga a
// continuar a sê-lo, e a divergência não daria erro: daria NÚMEROS DIFERENTES.
//
// ─── PORQUE UM ECRÃ IGUAL NÃO CHEGA COMO PROVA ─────────────────────────────────────
// Se o protegido pedisse o recurso errado, o Apps Script devolveria outra coleção — e a
// aplicação mostraria valores plausíveis, com o nome certo da empresa, sem um único
// erro. A única forma de apanhar isso é comparar os DOIS resultados sobre a MESMA fonte.
//
// ─── O QUE ESTE TESTE FAZ ──────────────────────────────────────────────────────────
// Monta um upstream falso que aplica a mesma regra que o Apps Script aplica: sem
// `recurso` na query, serve PEDIDOS. Depois corre `loadFinerData` uma vez por cada
// transporte e exige que o modelo produzido seja IDÊNTICO — não parecido.
//
// Não ativa nada em produção: `VITE_PROTECTED_DATA_TRANSPORT` não é tocada.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  envelopePedidos, envelopeDespesas, envelopeRecebiveis, envelopeAjustesManuais,
} from "./producao.fixtures.js";

const BASE = "https://bff.exemplo/api";
const EMPRESA = "overcel";

/** O que o Apps Script devolve por recurso. UMA fonte, para os dois caminhos. */
function upstream(recurso) {
  switch (recurso) {
    case "pedidos": return envelopePedidos();
    case "despesas": return envelopeDespesas();
    case "recebiveis": return envelopeRecebiveis();
    case "ajustes-manuais": return envelopeAjustesManuais({ companyId: EMPRESA });
    default: return null;
  }
}

/** URLs vistos, para provar que os dois caminhos são mesmo diferentes. */
let vistos;

function instalarFetch() {
  vistos = [];
  globalThis.fetch = vi.fn(async (url) => {
    const u = new URL(String(url));
    vistos.push(u.pathname + u.search);

    /* A REGRA DO APPS SCRIPT, replicada: ausência de `recurso` significa `pedidos`.
     * É exatamente aqui que uma divergência entre as duas tabelas apareceria — um dos
     * transportes pediria uma coleção e o outro pediria outra. */
    const recurso = u.searchParams.get("recurso") || "pedidos";
    const corpo = upstream(recurso);

    if (corpo === null) {
      return new Response(JSON.stringify({ error: true, message: "recurso desconhecido" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(corpo), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  });
}

async function carregarCom(qualTransporte) {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", BASE);

  const { createLegacyDataTransport, createProtectedDataTransport } = await import("./dataTransport.js");
  const { loadFinerData } = await import("./blingDataService.js");

  const transport = qualTransporte === "legado"
    ? createLegacyDataTransport()
    : createProtectedDataTransport({
      companyId: EMPRESA,
      getAccessToken: async () => "token-de-teste",
    });

  const dados = await loadFinerData({ transport, companyId: EMPRESA });
  return { dados, urls: [...vistos] };
}

describe("os dois transportes produzem o MESMO modelo", () => {
  beforeEach(() => { instalarFetch(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("os caminhos são mesmo diferentes — senão este teste não provava nada", async () => {
    instalarFetch();
    const legado = await carregarCom("legado");
    instalarFetch();
    const protegido = await carregarCom("protegido");

    expect(legado.urls.every((u) => u.includes("/pedidos/vendas"))).toBe(true);
    expect(protegido.urls.every((u) => u.includes(`/companies/${EMPRESA}/financial-data`))).toBe(true);
    // E o legado NÃO manda `recurso` para os pedidos; o protegido manda sempre.
    expect(legado.urls.some((u) => !u.includes("recurso="))).toBe(true);
    expect(protegido.urls.every((u) => u.includes("recurso="))).toBe(true);
  });

  it("source é `api` nos dois — nenhum cai para mock ou unavailable", async () => {
    instalarFetch();
    const { dados: a } = await carregarCom("legado");
    instalarFetch();
    const { dados: b } = await carregarCom("protegido");
    expect(a.source).toBe("api");
    expect(b.source).toBe("api");
  });

  it("o modelo COMPLETO é idêntico, não apenas parecido", async () => {
    instalarFetch();
    const { dados: a } = await carregarCom("legado");
    instalarFetch();
    const { dados: b } = await carregarCom("protegido");
    // Se as duas tabelas de tradução divergirem, é AQUI que rebenta — e rebenta com a
    // diferença à frente, em vez de aparecer como um número estranho num ecrã.
    expect(b).toEqual(a);
  });
});

describe("as grandezas que alguém compararia à mão", () => {
  beforeEach(() => { instalarFetch(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("contagens, meta e mês de referência coincidem", async () => {
    instalarFetch();
    const { dados: a } = await carregarCom("legado");
    instalarFetch();
    const { dados: b } = await carregarCom("protegido");

    const resumo = (d) => ({
      pedidos: d.sales?.orders?.length ?? null,
      despesas: d.sales?.payables?.length ?? null,
      recebiveis: d.sales?.receivables?.length ?? null,
      meta: d.sales?.meta ?? null,
      mesReferencia: d.sales?.referenceMonth ?? d.sales?.meta?.referenceMonth ?? null,
      ajustesManuais: d.manualInputs ?? null,
    });

    const ra = resumo(a);
    const rb = resumo(b);
    expect(rb).toEqual(ra);

    // E não é um empate de dois nulos: houve mesmo dados a atravessar.
    expect(ra.pedidos).toBeGreaterThan(0);
  });

  it("nenhum dos dois inventa dados quando o upstream falha", async () => {
    // Uma divergência perigosa seria um transporte degradar para mock e o outro não:
    // o ecrã continuaria a mostrar números, com outra proveniência.
    instalarFetch();
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 502 }));

    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", BASE);
    const { createLegacyDataTransport, createProtectedDataTransport } = await import("./dataTransport.js");
    const { loadFinerData } = await import("./blingDataService.js");

    const a = await loadFinerData({ transport: createLegacyDataTransport(), companyId: EMPRESA });
    const b = await loadFinerData({
      transport: createProtectedDataTransport({ companyId: EMPRESA, getAccessToken: async () => "t" }),
      companyId: EMPRESA,
    });

    expect(b.source).toBe(a.source);
    expect(a.source).not.toBe("api");
  });
});

describe("a tradução recurso -> upstream, fixada de um lado", () => {
  it("o mapeamento do frontend é o contrato que o BFF tem de espelhar", async () => {
    // O BFF tem a sua própria cópia, noutro repositório
    // (api/companies/[companyId]/financial-data.js, RECURSO_UPSTREAM). Não é importável
    // daqui. O que se faz é FIXAR este lado: se alguém mexer aqui, este teste falha e
    // obriga a olhar para o outro. `test/cors.test.mjs` faz o simétrico no proxy.
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", BASE);
    instalarFetch();
    const { createLegacyDataTransport, RECURSOS } = await import("./dataTransport.js");

    const t = createLegacyDataTransport();
    await t.ler(RECURSOS.PEDIDOS);
    await t.ler(RECURSOS.DESPESAS);
    await t.ler(RECURSOS.RECEBIVEIS);
    await t.ler(RECURSOS.AJUSTES_MANUAIS);

    expect(vistos.map((u) => new URL(BASE + u.replace("/api", "")).searchParams.get("recurso")))
      .toEqual([null, "despesas", "recebiveis", "ajustes-manuais"]);
    vi.unstubAllEnvs();
  });
});
