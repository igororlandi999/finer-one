// TRANSPORTE DE DADOS — FASE 8 e FASE 9.
//
// ─── O QUE ESTES TESTES PROTEGEM ────────────────────────────────────────────────────
// Duas propriedades, e as duas são sobre o DIA DA MIGRAÇÃO:
//
//   1. o transporte protegido NÃO se liga sozinho. Ligá-lo antes de o BFF existir faria
//      as quatro leituras devolverem 404 — e um ecrã sem dados é indistinguível, para
//      quem o vê, de uma empresa que não tem dados;
//   2. quando se ligar, `blingDataService.js` não muda. As ~1300 linhas de normalização
//      e de contratos financeiros são o sítio onde um erro produz NÚMEROS ERRADOS em vez
//      de um ecrã avariado, e é por isso que a fronteira existe.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  RECURSOS, TRANSPORTE, TRANSPORTE_MOTIVO,
  createLegacyDataTransport, createProtectedDataTransport, createNullDataTransport,
  resolveDataTransport, protectedTransportRequested,
} from "./dataTransport.js";

const aqui = dirname(fileURLToPath(import.meta.url));

/* `resolveDataTransport` chama `isApiConfigured()`, que lê a variável de ambiente no
 * momento em que o módulo `api.js` foi carregado. Simula-se o módulo para poder exercer
 * as duas metades sem construir um ambiente. */
vi.mock("./api.js", async (original) => {
  const real = await original();
  return { ...real, isApiConfigured: () => true, apiGet: vi.fn(async () => ({ data: [] })) };
});

let api;
beforeEach(async () => { api = await import("./api.js"); api.apiGet.mockClear(); });
afterEach(() => vi.clearAllMocks());

/* ==================================================================================== */
describe("transporte legado — o de hoje, sem uma mudança de comportamento", () => {
  it("pedidos NÃO leva ?recurso= (é o caso por omissão do Apps Script)", async () => {
    await createLegacyDataTransport().ler(RECURSOS.PEDIDOS);
    expect(api.apiGet).toHaveBeenCalledWith("pedidos/vendas");
  });

  it("as outras três levam o `recurso` na query", async () => {
    const t = createLegacyDataTransport();
    for (const [recurso, esperado] of [
      [RECURSOS.DESPESAS, "despesas"],
      [RECURSOS.RECEBIVEIS, "recebiveis"],
      [RECURSOS.AJUSTES_MANUAIS, "ajustes-manuais"],
    ]) {
      api.apiGet.mockClear();
      await t.ler(recurso);
      expect(api.apiGet).toHaveBeenCalledWith("pedidos/vendas", { params: { recurso: esperado } });
    }
  });

  it("não é protegido e não tem empresa — é o proxy anónimo", () => {
    const t = createLegacyDataTransport();
    expect(t.id).toBe(TRANSPORTE.LEGADO);
    expect(t.protegido).toBe(false);
    expect(t.companyId).toBeNull();
  });
});

/* ==================================================================================== */
describe("transporte protegido — o destino", () => {
  it("lê de /companies/:id/financial-data com o token no cabeçalho", async () => {
    const pedidos = [];
    /* Interceta-se `apiRequest`, que é o que `authorizedApi` usa por baixo. */
    const mod = await import("./api.js");
    const espia = vi.spyOn(mod, "apiRequest").mockImplementation(async (path, opts) => {
      pedidos.push({ path, opts }); return { data: [] };
    });

    const t = createProtectedDataTransport({
      companyId: "empresa-a",
      getAccessToken: async () => "token-abc",
    });
    await t.ler(RECURSOS.DESPESAS);

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].path).toBe("companies/empresa-a/financial-data");
    expect(pedidos[0].opts.params).toEqual({ recurso: "despesas" });
    expect(pedidos[0].opts.headers.Authorization).toBe("Bearer token-abc");
    espia.mockRestore();
  });

  it("sem token não faz o pedido — não se enchem os registos de 401 legítimos", async () => {
    const t = createProtectedDataTransport({
      companyId: "empresa-a",
      getAccessToken: async () => null,
    });
    await expect(t.ler(RECURSOS.PEDIDOS)).rejects.toThrow();
  });

  it("o companyId viaja no CAMINHO e é declarado no transporte", () => {
    const t = createProtectedDataTransport({ companyId: "empresa-b", getAccessToken: async () => "t" });
    expect(t.protegido).toBe(true);
    expect(t.companyId).toBe("empresa-b");
  });
});

/* ==================================================================================== */
describe("a escolha do transporte — nenhuma condição em falta é ignorada", () => {
  const base = {
    env: { VITE_PROTECTED_DATA_TRANSPORT: "true" },
    requiresAuth: true,
    companyId: "empresa-a",
    getAccessToken: async () => "t",
  };

  it("com as três condições, escolhe o PROTEGIDO", () => {
    const r = resolveDataTransport(base);
    expect(r.transport.protegido).toBe(true);
    expect(r.motivo).toBe(TRANSPORTE_MOTIVO.PRONTO);
  });

  it("interruptor desligado -> LEGADO. É o estado de hoje.", () => {
    const r = resolveDataTransport({ ...base, env: {} });
    expect(r.transport.id).toBe(TRANSPORTE.LEGADO);
    expect(r.motivo).toBe(TRANSPORTE_MOTIVO.PROTEGIDO_NAO_ATIVADO);
  });

  it("autenticação desligada -> LEGADO, e nunca um pedido protegido sem token", () => {
    const r = resolveDataTransport({ ...base, requiresAuth: false });
    expect(r.transport.protegido).toBe(false);
    expect(r.motivo).toBe(TRANSPORTE_MOTIVO.AUTENTICACAO_DESLIGADA);
  });

  /* ═══════════════════════════════════════════════════════════════════════════════
   * O BYPASS QUE ESTES DOIS TESTES DESCREVIAM
   * ═══════════════════════════════════════════════════════════════════════════════
   * Diziam "-> LEGADO", e o legado é ANÓNIMO: serve os dados financeiros da Overcel
   * sem token e sem membership. Com o interruptor LIGADO — que é o próximo passo do
   * projeto — isso significava que um utilizador autenticado cuja empresa ativa ainda
   * não tinha resolvido recebia os números reais de uma empresa a que pode não
   * pertencer.
   *
   * E `companyId` vem de `company?.id ?? null` no `FinerDataProvider`: `null` não é um
   * caso de laboratório, é o valor durante todo o carregamento das memberships, e o
   * valor PERMANENTE de quem não tem membership nenhuma.
   *
   * Passam a devolver NENHUM. Sem dados, visivelmente. Ver o cabeçalho de
   * `resolveDataTransport`.
   * ═══════════════════════════════════════════════════════════════════════════════ */

  it("interruptor LIGADO + empresa inválida -> NENHUM, nunca o legado anónimo", () => {
    for (const companyId of [null, undefined, "", "A", "Empresa Maiúscula", "-comeca-com-hifen"]) {
      const r = resolveDataTransport({ ...base, companyId });
      expect(r.transport.id, String(companyId)).toBe(TRANSPORTE.NENHUM);
      expect(r.transport.protegido, String(companyId)).toBe(false);
      expect(r.motivo).toBe(TRANSPORTE_MOTIVO.SEM_EMPRESA_VALIDA);
    }
  });

  it("interruptor LIGADO + sem função de token -> NENHUM, nunca o legado anónimo", () => {
    const r = resolveDataTransport({ ...base, getAccessToken: undefined });
    expect(r.transport.id).toBe(TRANSPORTE.NENHUM);
    expect(r.motivo).toBe(TRANSPORTE_MOTIVO.SEM_TOKEN);
  });

  it("o transporte NENHUM não lê nada — não há caminho alternativo escondido", async () => {
    const r = resolveDataTransport({ ...base, companyId: null });
    for (const recurso of Object.values(RECURSOS)) {
      await expect(r.transport.ler(recurso)).resolves.toBeNull();
    }
  });

  it("com o interruptor DESLIGADO, tudo continua a cair para o legado", () => {
    /* O contrapeso: a correção não pode transformar a instalação de hoje — que ainda
     * lê pelo legado — numa aplicação sem dados. */
    const desligado = { ...base, env: {} };
    for (const extra of [{}, { companyId: null }, { getAccessToken: undefined }, { requiresAuth: false }]) {
      const r = resolveDataTransport({ ...desligado, ...extra });
      expect(r.transport.id, JSON.stringify(extra)).toBe(TRANSPORTE.LEGADO);
    }
  });

  it("o interruptor só liga com um valor afirmativo explícito", () => {
    for (const v of [true, "true", "1"]) {
      expect(protectedTransportRequested({ VITE_PROTECTED_DATA_TRANSPORT: v }), String(v)).toBe(true);
    }
    for (const v of [undefined, null, "", "false", "0", "sim", "yes"]) {
      expect(protectedTransportRequested({ VITE_PROTECTED_DATA_TRANSPORT: v }), String(v)).toBe(false);
    }
  });

  it("o transporte nulo tem a MESMA FORMA e não lê nada", async () => {
    /* Para que "sem backend" não seja um `null` que cada chamador tenha de lembrar-se
     * de testar — a lição de `dataSourceStates`. */
    const t = createNullDataTransport();
    expect(t.id).toBe(TRANSPORTE.NENHUM);
    expect(typeof t.ler).toBe("function");
    await expect(t.ler(RECURSOS.PEDIDOS)).resolves.toBeNull();
  });
});

/* ==================================================================================== */
describe("FASE 9 — a camada de dados não conhece o provider de autenticação", () => {
  function ficheiros(dir, acc = []) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) { ficheiros(caminho, acc); continue; }
      if (!/\.(js|jsx)$/.test(entrada.name) || /\.test\.jsx?$/.test(entrada.name)) continue;
      acc.push(caminho);
    }
    return acc;
  }

  const SRC = join(aqui, "..");

  it("nem services/ nem utils/ nem context/ importam o SDK do Supabase", () => {
    /* A fronteira da FASE 9, por teste. `Auth conhece auth; a camada de dados RECEBE.`
     * O único ficheiro do projeto autorizado a falar com o SDK é
     * `auth/supabaseAuthAdapter.js`, que é o adaptador e existe para isso. */
    const infratores = [];
    for (const dir of ["services", "utils", "context"]) {
      for (const f of ficheiros(join(SRC, dir))) {
        const fonte = readFileSync(f, "utf8");
        if (/@supabase\/|from\s+["']@supabase/.test(fonte)) {
          infratores.push(relative(SRC, f).replace(/\\/g, "/"));
        }
      }
    }
    expect(infratores, `importam o SDK do Supabase: ${infratores.join(", ")}`).toEqual([]);
  });

  it("blingDataService não constrói URLs de empresa nem lê tokens", () => {
    const fonte = readFileSync(join(SRC, "services", "blingDataService.js"), "utf8");
    /* Afirma-se sobre IMPORTS e sobre identificadores que só existem em código — nunca
     * sobre um caminho de URL em texto livre. O caminho `/api/companies/:companyId/
     * financial-data` está CITADO num comentário deste ficheiro, a explicar para onde a
     * leitura vai migrar, e uma asserção sobre a string apagaria a explicação em vez do
     * defeito. É o mesmo tropeço que `moedaCentralizada.test.js` documenta. */
    expect(fonte).not.toMatch(/getAccessToken/);
    expect(fonte).not.toMatch(/Authorization/);
    expect(fonte).not.toMatch(/from\s+["']\.\/authorizedApi/);
  });

  it("blingDataService lê pelo TRANSPORTE e já não importa o cliente HTTP de leitura", () => {
    const fonte = readFileSync(join(SRC, "services", "blingDataService.js"), "utf8");
    /* Afirma-se sobre o IMPORT e não sobre uma chamada. Uma expressão regular à procura
     * de `apiGet("pedidos/vendas")` no corpo do ficheiro apanhava a PRÓPRIA prosa que
     * documenta a migração — o mesmo tropeço que `moedaCentralizada.test.js` descreve.
     * Sem o import, a chamada é impossível: é a afirmação mais forte e a mais estável. */
    expect(fonte).not.toMatch(/import\s*\{[^}]*apiGet[^}]*\}\s*from/);
    expect(fonte).toMatch(/transport\.ler\(|transporte\.ler\(/);
  });
});
