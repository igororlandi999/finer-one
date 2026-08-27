// METADATA DO SNAPSHOT DE DESPESAS — o que o rebuild já sabia e deitava fora.
//
// ─── O PROBLEMA QUE ISTO ATACA ──────────────────────────────────────────────────────
// A meta emitida era `{geradoEm, totalTitulos, hidratadosNestaExecucao, reaproveitados,
// chamadasDetalhe, parcial}`. Auditado em 2026-08-24: nada ali permite distinguir
//
//   frescura            (quando o snapshot foi gerado)      -> `geradoEm`   ✓ existia
//   completude do rebuild (o processo chegou ao fim?)        -> `parcial`   ✓ parcial
//   range dos dados     (que datas vieram?)                  -> AUSENTE
//   cobertura contabilística (o mês fechou?)                 -> IMPOSSÍVEL
//
// O terceiro era barato e faltava. O quarto continua a não existir, e é de propósito:
// nenhum campo de um snapshot sabe se as faturas de um mês já entraram todas.
//
// ─── ESTE FICHEIRO NÃO PUBLICA NADA ─────────────────────────────────────────────────
// Testa a fonte LOCAL. O Apps Script em produção continua na versão 11, sem estes
// campos, e o frontend não depende deles — `lerGeradoEm` e o resto continuam a ler o
// que sempre leram.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = dirname(fileURLToPath(import.meta.url));
const despesas = readFileSync(join(raiz, "Despesasbackend.js"), "utf8");

/* Extrai a função pura da fonte REAL e avalia-a isolada — mesmo padrão de
 * snapshotIntegridade.test.js. Um teste sobre uma cópia da função provaria apenas que
 * a cópia funciona. */
function carregar(nomeFn, fonte) {
  const inicio = fonte.indexOf(`function ${nomeFn}(`);
  expect(inicio, `${nomeFn} não encontrada`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("\n}", inicio);
  const src = fonte.slice(inicio, fim + 2);
  return new Function(src + `\nreturn ${nomeFn};`)();
}

const intervalosDeDatas_ = carregar("intervalosDeDatas_", despesas);

const t = (over = {}) => ({
  vencimento: "2026-07-10", dataEmissao: "2026-07-01", vencimentoOriginal: "2026-07-10", ...over,
});

describe("intervalosDeDatas_ — o RANGE dos dados presentes", () => {
  it("mede min, max e quantos títulos têm cada data", () => {
    const r = intervalosDeDatas_([
      t({ vencimento: "2026-06-05" }),
      t({ vencimento: "2026-07-20" }),
      t({ vencimento: "2027-07-01" }),
    ]);
    expect(r.vencimento.min).toBe("2026-06-05");
    expect(r.vencimento.max).toBe("2027-07-01");
    expect(r.vencimento.comValor).toBe(3);
  });

  it("um vencimento FUTURO alarga o range — e é por isso que range ≠ cobertura", () => {
    /* O caso real da Overcel: `vencimento.max` é 2027-07, um título com vencimento
     * futuro. Derivar cobertura daqui declararia a empresa coberta até 2027 e faria a
     * âncora dos KPIs saltar para um mês que não existe como atividade. Foi
     * exatamente esse o defeito de 2027-07. A meta MEDE; não conclui. */
    const r = intervalosDeDatas_([t({ vencimento: "2026-07-01" }), t({ vencimento: "2027-07-20" })]);
    expect(r.vencimento.max).toBe("2027-07-20");
  });

  it("campo ausente em todos os títulos => min e max null, nunca uma data inventada", () => {
    const r = intervalosDeDatas_([t({ dataEmissao: null }), t({ dataEmissao: null })]);
    expect(r.dataEmissao.min).toBeNull();
    expect(r.dataEmissao.max).toBeNull();
    expect(r.dataEmissao.comValor).toBe(0);
  });

  it("`comValor` mede HIDRATAÇÃO: distingue ausência de dado de ausência de título", () => {
    // Dois títulos, só um com dataEmissao (o outro não foi hidratado pelo detalhe).
    const r = intervalosDeDatas_([t(), t({ dataEmissao: null })]);
    expect(r.dataEmissao.comValor).toBe(1);
    expect(r.vencimento.comValor).toBe(2);
  });

  it("ignora valores que não sejam datas ISO, sem os deixar contaminar o range", () => {
    const r = intervalosDeDatas_([t({ vencimento: "" }), t({ vencimento: 20260710 }), t()]);
    expect(r.vencimento.comValor).toBe(1);
    expect(r.vencimento.min).toBe("2026-07-10");
  });

  it("lista vazia ou ausente não rebenta e não afirma range nenhum", () => {
    for (const entrada of [[], null, undefined]) {
      const r = intervalosDeDatas_(entrada);
      expect(r.vencimento.min).toBeNull();
      expect(r.vencimento.comValor).toBe(0);
    }
  });

  it("é PURA: sem rede, sem relógio, sem Utilities", () => {
    const fonte = despesas.slice(
      despesas.indexOf("function intervalosDeDatas_("),
      despesas.indexOf("\n}", despesas.indexOf("function intervalosDeDatas_(")));
    for (const proibido of ["blingGet_", "new Date", "Utilities", "DriveApp", "PropertiesService"]) {
      expect(fonte).not.toContain(proibido);
    }
  });
});

describe("a meta do rebuild — campos aditivos, nada renomeado", () => {
  it("continua a emitir todos os campos que já emitia", () => {
    /* Os consumidores existentes (`lerGeradoEm`, `check:data`, a faixa de frescura)
     * leem `geradoEm` e `parcial`. Renomear ou remover qualquer um partia produção. */
    for (const campo of ["geradoEm", "totalTitulos", "hidratadosNestaExecucao",
      "reaproveitados", "chamadasDetalhe", "parcial"]) {
      expect(despesas).toContain(`${campo}:`);
    }
  });

  it("acrescenta paginação, filtro declarado e intervalos", () => {
    expect(despesas).toContain("paginasLidas:");
    expect(despesas).toContain("listagemTruncada:");
    // A listagem de /contas/pagar não usa filtro de data. Declará-lo explicitamente
    // impede que alguém a jusante assuma um intervalo pedido que nunca existiu.
    expect(despesas).toContain("filtroData: null");
    expect(despesas).toContain("intervalos: intervalosDeDatas_(data)");
  });

  it("NÃO emite nenhum campo que afirme cobertura contabilística", () => {
    /* A tentação óbvia — e o erro — seria serializar algo como
     * `completeThroughMonth` derivado do `vencimento.max`. Nenhum campo do snapshot
     * sabe se as faturas de um mês já entraram todas. */
    for (const proibido of ["completeThroughMonth", "coberturaAte", "mesCompleto",
      "accountingCoverage", "fechadoAte"]) {
      expect(despesas).not.toContain(proibido);
    }
  });

  it("a listagem passa a assinalar truncamento por MAX_PAGES", () => {
    /* P3.1 do backlog: o teto de MAX_PAGES truncava em silêncio. `parcial` cobria só o
     * orçamento de TEMPO — são dois truncamentos diferentes e um era invisível. */
    expect(despesas).toContain("todos.truncado = truncado;");
    expect(despesas).toContain("todos.paginasLidas = paginasLidas;");
  });
});
