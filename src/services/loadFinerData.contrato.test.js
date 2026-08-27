// Testes de CONTRATO contra o shape REAL de produção (C7F.3F).
//
// A diferença face aos outros ficheiros de teste é deliberada e é toda: aqui os mocks
// não são inventados. Vêm de `producao.fixtures.js`, que reproduz o que o backend
// devolve — observado, não imaginado. Foi exatamente um mock imaginado que deixou a
// camada de frescura passar meses partida em produção com os testes a verde.
//
// Cobre: metadata presente, metadata ausente, envelope legado (só `debug`), `data` [],
// zero real vs ausência, `parcial` em ambos os caminhos, e a fonte em avaria.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  envelopePedidos,
  envelopeDespesas,
  envelopeRecebiveis,
  envelopeRecebiveisLegado,
  envelopeRecebiveisVazio,
  envelopeSemMeta,
  envelopeAjustesManuais,
  envelopeAjustesManuaisVazio,
  PEDIDO,
  DESPESA,
  RECEBIVEL,
} from "./producao.fixtures.js";

/* Cada recurso responde com o envelope que o teste puser em `respostas`. Uma falha
 * simula-se pondo um Error — o transporte real rejeita, e queremos o mesmo caminho. */
const respostas = {};

vi.mock("../services/api.js", async () => {
  const actual = await vi.importActual("../services/api.js");
  return {
    ...actual,
    isApiConfigured: () => true,
    apiGet: vi.fn(async (path, opts) => {
      const recurso = opts?.params?.recurso || "pedidos";
      const r = respostas[recurso];
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import { loadFinerData } from "./blingDataService.js";

const padrao = () => {
  respostas.pedidos = envelopePedidos();
  respostas.despesas = envelopeDespesas();
  respostas.recebiveis = envelopeRecebiveis();
  respostas["ajustes-manuais"] = envelopeAjustesManuais();
};

beforeEach(padrao);
afterEach(() => { vi.clearAllMocks(); });

/* ==================================================================================== */
describe("contrato de produção — metadata (C7F.3F)", () => {
  it("as três fontes declaram data e ela chega inteira ao dataset", async () => {
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.meta.orders).toBe("2026-08-22T15:21:55.483Z");
    expect(sales.meta.payables).toBe("2026-08-22T15:23:31.106Z");
    expect(sales.meta.receivables).toBe("2026-08-22T15:32:06.571Z");
    // O conjunto vale pela fonte mais antiga — aqui, os pedidos.
    expect(sales.meta.geradoEm).toBe("2026-08-22T15:21:55.483Z");
  });

  it("envelope LEGADO dos recebíveis (só debug.snapshotMeta) continua a ser lido", async () => {
    respostas.recebiveis = envelopeRecebiveisLegado({ geradoEm: "2026-07-21T01:42:51.487Z" });
    const { sales } = await loadFinerData();
    expect(sales.meta.receivables).toBe("2026-07-21T01:42:51.487Z");
    // E passa a ser a fonte mais antiga do conjunto.
    expect(sales.meta.geradoEm).toBe("2026-07-21T01:42:51.487Z");
  });

  it("envelope SEM metadata nenhuma dá null — nunca o relógio local", async () => {
    const antes = new Date().toISOString();
    respostas.pedidos = envelopeSemMeta([PEDIDO]);
    respostas.despesas = envelopeSemMeta([DESPESA]);
    respostas.recebiveis = envelopeSemMeta([RECEBIVEL]);
    const { sales } = await loadFinerData();
    expect(sales.meta.orders).toBeNull();
    expect(sales.meta.payables).toBeNull();
    expect(sales.meta.receivables).toBeNull();
    expect(sales.meta.geradoEm).toBeNull();
    expect(sales.meta.geradoEm).not.toBe(antes);
  });

  it("metadata parcial entre fontes: quem não declara fica null e não herda", async () => {
    respostas.pedidos = envelopeSemMeta([PEDIDO]);
    const { sales } = await loadFinerData();
    expect(sales.meta.orders).toBeNull();
    expect(sales.meta.payables).toBe("2026-08-22T15:23:31.106Z");
    expect(sales.meta.geradoEm).toBe("2026-08-22T15:23:31.106Z");
  });
});

/* ==================================================================================== */
describe("contrato de produção — completude (C7F.3E/F)", () => {
  it("parcial=false nas três: conjunto declarado completo", async () => {
    const { sales } = await loadFinerData();
    expect(sales.meta.parcial).toEqual({ orders: false, payables: false, receivables: false });
    expect(sales.meta.algumParcial).toBe(false);
    expect(sales.meta.todasCompletas).toBe(true);
  });

  it("uma fonte parcial contamina o conjunto — frescura não é completude", async () => {
    respostas.recebiveis = envelopeRecebiveis({ parcial: true });
    const { sales } = await loadFinerData();
    expect(sales.meta.parcial.receivables).toBe(true);
    expect(sales.meta.algumParcial).toBe(true);
    expect(sales.meta.todasCompletas).toBe(false);
    // ...e a data continua recente: é exatamente esse o par enganador.
    expect(sales.meta.receivables).toBe("2026-08-22T15:32:06.571Z");
  });

  it("parcial também é lido do envelope legado (debug.snapshotMeta)", async () => {
    respostas.recebiveis = envelopeRecebiveisLegado({ parcial: true });
    const { sales } = await loadFinerData();
    expect(sales.meta.parcial.receivables).toBe(true);
    expect(sales.meta.algumParcial).toBe(true);
  });

  it("fonte que não se pronuncia fica null — ausência não é completude", async () => {
    respostas.pedidos = envelopeSemMeta([PEDIDO]);
    const { sales } = await loadFinerData();
    expect(sales.meta.parcial.orders).toBeNull();
    expect(sales.meta.algumParcial).toBe(false);   // null não é `true`
    expect(sales.meta.todasCompletas).toBe(false); // ...mas também não é `false`
  });
});

/* ==================================================================================== */
describe("contrato de produção — listas vazias e ausência (C7F.3F)", () => {
  it("recebíveis com data:[] e fonte snapshot é ZERO REAL, não ausência", async () => {
    respostas.recebiveis = envelopeRecebiveis({ linhas: [] });
    const { sales } = await loadFinerData();
    expect(sales.meta.receivables).toBe("2026-08-22T15:32:06.571Z");
    expect(sales.recebiveis).not.toBeUndefined();
  });

  it('fonte "snapshot-vazio" é AUSÊNCIA e não derruba o resto', async () => {
    respostas.recebiveis = envelopeRecebiveisVazio();
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.recebiveis).toBeNull();          // gating: cai no mock com selo Demo
    expect(sales.meta.receivables).toBeNull();    // fonte ausente não declara data
    expect(sales.despesas).not.toBeNull();        // as outras seguem intactas
  });

  it("despesas em falha não derrubam pedidos, e não inventam metadata", async () => {
    respostas.despesas = new Error("falha simulada");
    const { source, sales } = await loadFinerData();
    expect(source).toBe("api");
    expect(sales.despesas).toBeNull();
    expect(sales.meta.payables).toBeNull();
    expect(sales.meta.parcial.payables).toBeNull();
  });

  it("pedidos em falha são avaria: unavailable, nunca demonstração", async () => {
    respostas.pedidos = new Error("falha simulada");
    const { source, sales } = await loadFinerData();
    expect(source).toBe("unavailable");
    expect(sales).toBeNull();
  });
});

/* ==================================================================================== */
describe("contrato de produção — ajustes manuais (C7F.3F)", () => {
  it("documento válido entra como mapa por mês", async () => {
    const { manualInputs } = await loadFinerData();
    expect(manualInputs).toBeTruthy();
    expect(manualInputs.valuesByMonth).toEqual({ "2026-06": { cmv: 1000 } });
  });

  it('"documento-vazio" é ausência declarada, sem derrubar a leitura', async () => {
    respostas["ajustes-manuais"] = envelopeAjustesManuaisVazio();
    const { source, manualInputs } = await loadFinerData();
    expect(source).toBe("api");
    expect(manualInputs.valuesByMonth).toBeUndefined();
  });

  it("documento de OUTRA empresa é rejeitado por inteiro", async () => {
    respostas["ajustes-manuais"] = envelopeAjustesManuais({ companyId: "outra-empresa" });
    const { manualInputs } = await loadFinerData();
    expect(manualInputs.valuesByMonth).toBeUndefined();
  });

  it("0 é valor manual REAL e não se confunde com ausência", async () => {
    respostas["ajustes-manuais"] = envelopeAjustesManuais({
      meses: { "2026-06": { cmv: { value: 0, updatedAt: "2026-08-21T22:03:05.600Z" } } },
    });
    const { manualInputs } = await loadFinerData();
    expect(manualInputs.valuesByMonth).toEqual({ "2026-06": { cmv: 0 } });
  });
});

/* ==================================================================================== */
describe("fixtures de produção — higiene (C7F.3F)", () => {
  it("nenhum fixture transporta dados pessoais ou de pagamento", () => {
    const texto = JSON.stringify([PEDIDO, DESPESA, RECEBIVEL, envelopeAjustesManuais()]);
    // Campos que existem em produção e foram deliberadamente removidos.
    expect(texto).not.toContain("linkBoleto");
    expect(texto).not.toContain("linkQRCodePix");
    // CNPJ/CPF vivem em contato.numeroDocumento — o contato não pode ter esse campo.
    expect(RECEBIVEL.contato.numeroDocumento).toBeUndefined();
    expect(PEDIDO.contato.numeroDocumento).toBeUndefined();
    expect(DESPESA.contato.numeroDocumento).toBeUndefined();
    // Nenhuma sequência longa de dígitos que pareça um documento fiscal.
    expect(texto).not.toMatch(/\d{11,}/);
  });
});
