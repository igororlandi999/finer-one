// AUDITORIA FUNCIONAL DO PLANO PLUS — as dez telas que um cliente Plus paga.
//
// ─── PORQUE ISTO EXISTE ─────────────────────────────────────────────────────────────
// Cada tela tem os seus testes. O que nenhum deles responde é a pergunta comercial:
// *com dados reais ligados, o plano Plus inteiro funciona?* Uma fonte que passe a `null`
// não parte teste nenhum — a página cai para o mock com selo Demo, que é o comportamento
// CORRETO para uma falha e o comportamento ERRADO como estado permanente de um plano
// pago. A diferença não se vê tela a tela; vê-se aqui.
//
// ─── O QUE ISTO AFIRMA, E O QUE NÃO AFIRMA ──────────────────────────────────────────
// Afirma que, para um dataset real e completo, cada tela do Plus recebe a sua fonte
// real, ancorada no mês certo e com a disponibilidade a viajar. NÃO afirma que a tela
// desenha bem — isso é dos testes de cada página e da verificação no browser.
//
// A lista de telas NÃO está escrita à mão: sai de `PLANS.plus.screens`. Acrescentar uma
// tela ao plano sem lhe dar fonte real passa a falhar aqui, que é o ponto.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSalesDataset } from "./blingDataService.js";
import { PLANS, SCREENS } from "../config/planConfig.js";
import { answerQuestion, SUPPORTED_QUESTIONS } from "../utils/chatEngine.js";
import { buildCompletionDataView } from "../utils/completionDataView.js";
import { ACTIVE_COMPANY } from "../config/company.js";

/* 25 de agosto de 2026: julho é o último mês civil encerrado, junho é o último mês que a
 * cobertura das contas a pagar declara completo. É a configuração real de produção. */
const HOJE = new Date(2026, 7, 25, 12, 0, 0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(HOJE); });
afterEach(() => { vi.useRealTimers(); });

const pedido = (id, data, total) => ({
  id, numero: id, date: data, total, status: "recebida",
  client: { id: (id % 3) + 1, name: `Cliente ${(id % 3) + 1}` },
  seller: null, notaFiscalId: 9000 + id, dataSaida: data, frete: 0,
  items: [{ productId: 1, code: "SKU-1", name: "Produto", qty: 1, unitValue: total, total }],
});
const titulo = (id, mes, valor, categoria) => ({
  id, situacao: 2, valor,
  vencimento: `${mes}-15`, dataEmissao: `${mes}-02`, vencimentoOriginal: `${mes}-15`,
  competencia: `${mes}-10`, numeroDocumento: String(id), historico: categoria,
  saldo: 0, categoriaId: 10, categoriaNome: categoria,
  contato: { id: 5, nome: "Fornecedor A" }, formaPagamento: { id: 1, nome: "Pix" },
});
const recebivel = (id, mes, valor) => ({
  id, situacao: 1, valor, vencimento: `${mes}-20`, dataEmissao: `${mes}-01`,
  vencimentoOriginal: `${mes}-20`, numeroDocumento: String(id), historico: "Venda",
  saldo: valor, categoriaId: 20, categoriaNome: "Vendas",
  contato: { id: 1, nome: "Cliente 1" }, formaPagamento: { id: 1, nome: "Boleto" },
});

const MESES = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

function datasetReal() {
  const orders = [];
  const payables = [];
  const receivables = [];
  let oid = 1, pid = 500, rid = 900;
  for (const [n, mes] of MESES.entries()) {
    const base = 100000 + n * 20000;
    orders.push(pedido(oid++, `${mes}-05`, base * 0.6));
    orders.push(pedido(oid++, `${mes}-19`, base * 0.4));
    payables.push(titulo(pid++, mes, 9000, "Salários"));
    payables.push(titulo(pid++, mes, 4200, "Aluguel"));
    payables.push(titulo(pid++, mes, 2500, "Impostos sobre vendas"));
    receivables.push(recebivel(rid++, mes, base * 0.3));
  }
  return buildSalesDataset({
    orders, payables, receivables,
    // CMV lançado para os meses fechados: é o requisito do utilizador, e sem ele
    // nenhuma tela de rentabilidade do Plus tem base.
    manualInputsByMonth: {
      "2026-04": { cmv: 60000 }, "2026-05": { cmv: 72000 },
      "2026-06": { cmv: 84000 }, "2026-07": { cmv: 96000 },
    },
    meta: { geradoEm: "2026-08-25T04:00:00.000Z", parcial: false },
  });
}

/* Cada tela do Plus e a fonte REAL de que depende. Uma tela cuja fonte venha `null` cai
 * para o mock com selo Demo — correto perante uma falha, inaceitável como estado
 * permanente de um plano pago. */
const FONTE_DA_TELA = {
  [SCREENS.RESUMO]:                (s) => s.resumo?.metrics,
  [SCREENS.DIAGNOSTICO]:           (s) => s.diagnostico,
  [SCREENS.RECEITAS]:              (s) => s.receitas?.metrics,
  [SCREENS.DESPESAS]:              (s) => s.despesas?.metrics,
  [SCREENS.CLIENTES_FORNECEDORES]: (s) => s.fornecedores && s.recebiveis,
  [SCREENS.DOCUMENTOS]:            (s) => s.documents,
  [SCREENS.AJUSTES_MANUAIS]:       (s) => s.closings,
  [SCREENS.PERFORMANCE]:           (s) => s.financeiro?.metrics,
  [SCREENS.ALERTAS]:               (s) => s.alertas?.list,
  [SCREENS.CHAT_FINANCEIRO]:       (s) => s.financeiro,
};

describe("Plano Plus — todas as telas têm fonte real", () => {
  it("nenhuma tela do Plus fica em modo demonstração com dados reais ligados", () => {
    const sales = datasetReal();
    const semFonte = PLANS.plus.screens.filter((tela) => {
      const ler = FONTE_DA_TELA[tela];
      // Uma tela no plano sem entrada aqui é um buraco na auditoria, não um sucesso.
      if (!ler) return true;
      const fonte = ler(sales);
      return fonte == null || (Array.isArray(fonte) && fonte.length === 0 && tela !== SCREENS.ALERTAS);
    });
    expect(semFonte, `telas do Plus sem fonte real: ${semFonte.join(", ")}`).toEqual([]);
  });

  it("a auditoria cobre o plano INTEIRO — nenhuma tela fica por auditar", () => {
    /* Se alguém acrescentar uma tela ao Plus e não a auditar, o teste acima podia
     * passar por omissão. Este fecha essa porta. */
    const porAuditar = PLANS.plus.screens.filter((t) => !FONTE_DA_TELA[t]);
    expect(porAuditar).toEqual([]);
  });
});

describe("Plano Plus — o mês certo em cada superfície", () => {
  const sales = () => datasetReal();

  it("a DRE ancora num mês FECHADO, nunca no mês civil em curso", () => {
    const s = sales();
    expect(s.financeiro.monthKey).toBeTruthy();
    expect(s.financeiro.monthKey < "2026-08").toBe(true);
    // E o mês em curso existe à parte, marcado como tal — nunca misturado.
    expect(s.financeiro.emCurso?.monthKey).toBe("2026-08");
  });

  it("as contas a pagar do Resumo são do mês CIVIL, por vencimento — outro mês, de propósito", () => {
    const s = sales();
    expect(s.resumo.metrics.contasPagarMonthKey).toBe("2026-08");
    // Tesouraria e DRE respondem a perguntas diferentes e não partilham âncora.
    expect(s.resumo.metrics.contasPagarMonthKey).not.toBe(s.financeiro.monthKey);
  });

  it("o contrato legado continua fora do dataset — nada de `receita − contas a pagar`", () => {
    const s = sales();
    expect(s.resumo.metrics.despesas).toBeUndefined();
    expect(s.resumo.metrics.resultado).toBeUndefined();
    expect(s.resumo.metrics.despesasDelta).toBeUndefined();
    expect(s.resumo.metrics.resultadoDelta).toBeUndefined();
  });

  it("«Dados a completar» fala do mês civil encerrado, com os requisitos apurados", () => {
    const s = sales();
    const { state, months } = buildCompletionDataView({
      closings: s.closings, manualInputs: null, now: HOJE,
    });
    expect(state).toBeTruthy();
    expect(months.some((m) => m.monthKey === "2026-07")).toBe(true);
  });
});

describe("Plano Plus — disponibilidade e moeda viajam até à ponta", () => {
  it("cada linha essencial da DRE traz a sua disponibilidade", () => {
    const disp = datasetReal().financeiro.metrics.availability;
    for (const linha of ["revenueGross", "revenueNet", "cmv", "operatingExpenses", "netResult"]) {
      expect(disp[linha], `sem availability para ${linha}`).toBeTruthy();
    }
  });

  it("o Chat responde com a moeda da empresa e nunca com a de outra", () => {
    const s = datasetReal();
    const r = answerQuestion("qual foi o meu resultado?", s);
    expect(ACTIVE_COMPANY.currency).toBe("BRL");
    expect(r.content).not.toContain("€");
  });

  /* O Chat é a superfície mais fácil de degradar sem ninguém dar por isso: responde
   * sempre alguma coisa. Uma pergunta central do plano cair no fallback é uma
   * funcionalidade paga a deixar de funcionar, em silêncio. */
  it("as perguntas centrais do Chat não caem no fallback", () => {
    const s = datasetReal();
    const perguntas = [
      "Qual foi o resultado?", "Qual foi o EBITDA?", "Qual a margem?",
      "Quanto tivemos de despesas?", "Quanto temos a pagar?", "Como foi julho?",
      "Estamos lucrando?", "Qual foi o melhor mês?",
      "Por que julho não aparece na rentabilidade?",
    ];
    const caidas = perguntas.filter(
      (p) => /não consigo responder a essa pergunta/i.test(answerQuestion(p, s).content)
    );
    expect(caidas, `perguntas sem resposta: ${caidas.join(" | ")}`).toEqual([]);
  });

  /* O CATÁLOGO TEM DE SER VERDADE. `SUPPORTED_QUESTIONS` é o que o produto ANUNCIA:
   * alimenta as sugestões do Chat, as "perguntas recentes", o cartão "Pergunte à
   * Finer" do Resumo e a própria mensagem de fallback ("perguntas que sei responder").
   * Uma entrada dessa lista a cair no fallback é o produto a recomendar uma pergunta e
   * a responder logo a seguir que não a sabe responder. */
  it("todas as perguntas que o produto ANUNCIA são efetivamente respondidas", () => {
    const s = datasetReal();
    const falham = SUPPORTED_QUESTIONS.filter(
      (p) => /não consigo responder a essa pergunta/i.test(answerQuestion(p, s).content)
    );
    expect(falham, `anunciadas mas sem resposta: ${falham.join(" | ")}`).toEqual([]);
  });
});
