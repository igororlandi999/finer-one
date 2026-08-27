// Testes CARACTERIZADORES da cobertura temporal (P0.1-bis).
//
// ─── LEIA ISTO ANTES DE "CORRIGIR" UM TESTE DAQUI ───────────────────────────────────
// Estes testes descrevem o comportamento ATUAL, incluindo um defeito conhecido. Passam
// hoje de propósito: existem para que o defeito deixe de ser invisível e para que
// qualquer correção futura tenha de os alterar DELIBERADAMENTE, em vez de mudar o
// comportamento financeiro sem que nada proteste.
//
// Os blocos marcados «DEFEITO» documentam o que o código faz, não o que deveria fazer.
// Quando a correção chegar, esses blocos mudam de asserção — e é isso que se quer.
//
// ─── O DEFEITO ──────────────────────────────────────────────────────────────────────
// `sourceAvailability` calcula o limite de fecho assim:
//
//     const limiteFechado = cov.closedThroughMonth || previousMonthKey(monthKeyOf(referenceDate));
//     if (limiteFechado && mk > limiteFechado) return "partial";
//
// Com `closedThroughMonth: null` E sem `referenceDate` injetada:
//   monthKeyOf(undefined)   -> null
//   previousMonthKey(null)  -> null
//   limiteFechado           -> null
//   a guarda `if (limiteFechado && …)` é SALTADA POR INTEIRO
//   => TODOS os meses passam a "real", sem limite superior nenhum.
//
// A ausência de configuração é lida como cobertura ILIMITADA em vez de cobertura
// desconhecida. É a inversão exata que o resto do projeto evita em todo o lado: em
// `dataFreshness`, ausência de data dá UNKNOWN e nunca FRESH; em `dataHealth`, uma
// fonte silenciosa nunca autoriza declarar completude. Só aqui a ausência de prova é
// tratada como prova.
//
// E não é um caminho teórico: `buildSalesDataset` chama `latestUsableFinancialMonth`
// SEM `referenceDate` (blingDataService.js). O comentário em `config/company.js` que
// prometia o recuo automático para o mês anterior estava errado e foi corrigido.
//
// ─── CONTRATO PROPOSTO ──────────────────────────────────────────────────────────────
// Ausência de `closedThroughMonth` NÃO pode equivaler a cobertura ilimitada. Duas vias,
// por decidir (nenhuma aplicada aqui):
//
//   A. `buildSalesDataset` injeta `referenceDate`. Mínimo, restaura o documentado.
//      Não resolve o caso de quem chame o motor sem data — continua a haver um caminho
//      em que a ausência vale infinito.
//
//   B. `sourceAvailability` trata `limiteFechado == null` como «nada está fechado»:
//      qualquer mês sem limite conhecido é `partial`, nunca `real`. Seguro por omissão
//      e sem depender de quem chama. Muda o comportamento de `EMPTY_COVERAGE`, por isso
//      exige revisão dos consumidores.
//
// Recomendação: **B**, com A como consequência natural. O motor deve ser seguro sozinho,
// e não por cortesia de quem o chama.
//
// ─── ARQUITETURA ERP-AGNÓSTICA (evolução, não esta sessão) ──────────────────────────
// `firstCompleteMonth` / `partialMonths` / `closedThroughMonth` são hoje configuração
// manual por empresa: uma empresa nova exige editar código, e outro ERP exigiria outra
// semântica. O caminho já esboçado na P2.1:
//   1. cada fonte declara `meta.periodo = { de, ate }` — o rebuild já conhece a janela;
//   2. o fecho contabilístico migra de `company.js` para o documento de ajustes manuais
//      no Drive, onde já existe manutenção humana mensal;
//   3. `meta.parcial === true` VETA declarar qualquer mês como real.
// `sourceAvailability` manteria assinatura e semântica; mudaria só a ORIGEM da cobertura.

import { describe, it, expect } from "vitest";
import { sourceAvailability, monthKeyOf, EMPTY_COVERAGE } from "./dreEngine.js";
import { latestUsableFinancialMonth } from "./financialMetrics.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const COBERTURA = { firstCompleteMonth: "2026-04", partialMonths: ["2026-03"] };
const SEM_LIMITE = { ...COBERTURA, closedThroughMonth: null };
const COM_LIMITE = { ...COBERTURA, closedThroughMonth: "2026-06" };

/* Relógio fixo: 23/08/2026. Só usado onde a data É injetada — o ponto dos testes é
 * justamente o que acontece quando NÃO é. */
const AGORA = new Date(2026, 7, 23, 12, 0, 0);

/** Pedidos mínimos, um por mês, para o motor ter meses por onde escolher.
 *  `status: "recebida"` porque só os estados contáveis (`recebida` / `em_aberto`)
 *  entram em `billable` — um pedido cancelado não criaria mês nenhum. */
const pedidosNosMeses = (meses) =>
  meses.map((mk, i) => ({ id: i + 1, date: `${mk}-15`, total: 100, status: "recebida" }));

describe("monthKeyOf — a origem do problema", () => {
  it("sem data devolve null, e não a data de hoje", () => {
    expect(monthKeyOf(undefined)).toBeNull();
    expect(monthKeyOf(null)).toBeNull();
    expect(monthKeyOf("")).toBeNull();
  });

  it("com data devolve a chave do mês", () => {
    expect(monthKeyOf(AGORA)).toBe("2026-08");
  });
});

describe("sourceAvailability — comportamento correto quando HÁ limite", () => {
  it("um mês posterior ao fecho é partial", () => {
    expect(sourceAvailability("2026-07", COM_LIMITE)).toBe("partial");
    expect(sourceAvailability("2027-07", COM_LIMITE)).toBe("partial");
  });

  it("um mês até ao fecho é real", () => {
    expect(sourceAvailability("2026-06", COM_LIMITE)).toBe("real");
  });

  it("com referenceDate injetada, o recuo para o mês anterior funciona", () => {
    // É isto que `config/company.js` documentava — e que só acontece com data injetada.
    expect(sourceAvailability("2026-07", SEM_LIMITE, AGORA)).toBe("real");
    expect(sourceAvailability("2026-08", SEM_LIMITE, AGORA)).toBe("partial");
    expect(sourceAvailability("2027-07", SEM_LIMITE, AGORA)).toBe("partial");
  });
});

/* ─── CORRIGIDO em 24/08/2026 — via B aplicada ──────────────────────────────────────
 * Estes quatro testes asseguravam o DEFEITO: sem limite e sem data, tudo era `real`.
 * `sourceAvailability` passou a tratar limite desconhecido como cobertura DESCONHECIDA
 * e devolve `partial`. As asserções foram invertidas DELIBERADAMENTE — é a mudança que
 * o contrato proposto no topo deste ficheiro pedia, não uma regressão. */
describe("CORRIGIDO — sem limite E sem referenceDate, a cobertura é DESCONHECIDA", () => {
  it("o mês civil corrente, ainda ABERTO, nunca é declarado real", () => {
    expect(sourceAvailability("2026-08", SEM_LIMITE)).toBe("partial");
  });

  it("meses no FUTURO nunca são declarados reais", () => {
    // O snapshot de contas a pagar tem vencimentos até 2027-07, e esses meses entram
    // em availableDreMonths: era por aqui que a âncora da DRE saltava para o futuro.
    expect(sourceAvailability("2026-12", SEM_LIMITE)).toBe("partial");
    expect(sourceAvailability("2027-07", SEM_LIMITE)).toBe("partial");
    expect(sourceAvailability("2099-01", SEM_LIMITE)).toBe("partial");
  });

  it("EMPTY_COVERAGE é seguro por omissão: sem limite, nada é real", () => {
    expect(sourceAvailability("2099-01", EMPTY_COVERAGE)).toBe("partial");
  });

  it("nenhum mês escapa à guarda de cobertura por ausência de configuração", () => {
    const meses = ["2026-06", "2026-08", "2027-07", "2099-01"];
    // Sem data e sem limite: nada se pode afirmar sobre nenhum deles.
    expect(meses.map((mk) => sourceAvailability(mk, SEM_LIMITE)))
      .toEqual(["partial", "partial", "partial", "partial"]);
    // Com a data injetada, a mesma lista discrimina corretamente.
    expect(meses.map((mk) => sourceAvailability(mk, SEM_LIMITE, AGORA)))
      .toEqual(["real", "partial", "partial", "partial"]);
  });
});

describe("DEFEITO — consequência medida na âncora da DRE", () => {
  const meses = ["2026-05", "2026-06", "2026-07", "2026-08", "2027-07"];
  const orders = pedidosNosMeses(meses);

  it("com o limite declarado, a âncora é o último mês FECHADO", () => {
    expect(latestUsableFinancialMonth({ orders, coverage: COM_LIMITE })).toBe("2026-06");
  });

  it("sem limite e sem data, a âncora NÃO escolhe mês nenhum", () => {
    /* HISTÓRICO desta asserção, em três passos:
     *   1. devolvia "2027-07" — um mês que ainda nem começou, dado como fechado;
     *   2. 23/08/2026, teto civil: passou a "2026-08" — o mês corrente, ainda ABERTO.
     *      Menos mau, mas ainda falso: o teto reduziu o dano sem remover a causa;
     *   3. 24/08/2026, via B: `sourceAvailability` deixou de ler ausência de limite
     *      como cobertura ilimitada. Nenhum mês é `real`, logo não há âncora.
     *
     * `null` é a resposta honesta: sem cobertura declarada e sem relógio, a plataforma
     * não sabe que mês está fechado — e diz isso, em vez de escolher um. */
    expect(latestUsableFinancialMonth({ orders, coverage: SEM_LIMITE })).toBeNull();
  });

  it("a mesma chamada COM referenceDate devolve o mês esperado", () => {
    expect(
      latestUsableFinancialMonth({ orders, coverage: SEM_LIMITE, referenceDate: AGORA }),
    ).toBe("2026-07");
  });
});

describe("DEFEITO — o caminho de produção não injeta referenceDate", () => {
  const raiz = dirname(fileURLToPath(import.meta.url));
  const servico = readFileSync(join(raiz, "..", "services", "blingDataService.js"), "utf8");

  it("TODAS as chamadas de buildSalesDataset injetam referenceDate", () => {
    /* Via A, aplicada em 24/08/2026. Este teste era o inverso — exigia a AUSÊNCIA de
     * `referenceDate` — e o seu próprio comentário previa que falhasse quando a via
     * fosse aplicada. Foi. A asserção inverteu-se de propósito.
     *
     * Continua a ser um teste de ficheiro, e não de comportamento, porque é a única
     * forma de provar que NENHUMA chamada ficou para trás: uma que escapasse voltaria
     * a ler o relógio implicitamente e reabriria o buraco só nesse caminho. */
    const chamadas = servico.match(/latestUsableFinancialMonth\(\{[^}]*\}\)/g) || [];
    expect(chamadas.length).toBeGreaterThan(0);
    for (const chamada of chamadas) {
      expect(chamada).toContain("referenceDate");
    }
  });

  it("a proteção deixou de depender de um valor escrito à mão em company.js", () => {
    const company = readFileSync(join(raiz, "..", "config", "company.js"), "utf8");
    /* ANTES: `closedThroughMonth` tinha de ser uma data literal, e o ficheiro trazia
     * um aviso a dizer «NUNCA deixar a null» — porque null desarmava a guarda inteira.
     * A segurança do sistema dependia de alguém não se enganar a editar config.
     *
     * AGORA: o motor é seguro sozinho (limite desconhecido => partial), pelo que a
     * cobertura dos PEDIDOS pode e deve ser `null` — deriva do calendário. É isso que
     * elimina a edição mensal deste ficheiro. */
    expect(company).toMatch(/completeThroughMonth:\s*null/);
    expect(company).not.toMatch(/NUNCA deixar a null/);
    // A validação humana continua declarada, mas noutro eixo — e sem poder calar
    // pendências. É a separação inteira, num par de asserções.
    expect(company).toMatch(/validatedThroughMonth:\s*"\d{4}-\d{2}"/);
  });
});

/* ====================================================================================
 * DEFEITO IRMÃO — "mês em curso" resolve para o mês mais TARDIO, não para o corrente.
 * ====================================================================================
 * Descoberto em 23/08/2026 ao validar a DataHealth na app real. A página Resumo mostrava:
 *
 *     "Mês de referência: 2026-06 · 2027-07 em andamento"
 *
 * 2027-07 está onze meses no futuro. Não é o mês em curso de coisa nenhuma.
 *
 * A causa é distinta da P0.1-bis e NÃO é resolvida por injetar `referenceDate`:
 * `latestUsableFinancialMonth({ allowPartial: true })` percorre os meses do fim para o
 * princípio e devolve o primeiro que seja `real` OU `partial`. Como tudo depois do fecho
 * é `partial` — incluindo meses que só existem por causa de vencimentos futuros de
 * contas a pagar —, o primeiro candidato encontrado é sempre o mês mais tardio do
 * dataset.
 *
 * "Em curso" é uma afirmação sobre o CALENDÁRIO, não sobre a existência de dados. O
 * motor de fecho (`monthlyClosing`) já usa a âncora civil correta e chama-lhe, nos seus
 * próprios comentários, «âncora de CIVIL, não de dados». Aqui essa distinção perdeu-se.
 *
 * CORRIGIDO em 23/08/2026: `latestUsableFinancialMonth` ganhou um TETO CIVIL — meses
 * posteriores ao mês de referência nunca são candidatos. Verificado sobre dados reais
 * que o mês FECHADO não mudou (2026-06 antes e depois), e que os restantes 1117 testes
 * da suíte continuaram verdes: o raio de ação da correção é exatamente o pretendido.
 */
describe("P0.3 CORRIGIDO — allowPartial já não devolve um mês futuro", () => {
  const meses = ["2026-05", "2026-06", "2026-07", "2026-08", "2027-07"];
  const orders = pedidosNosMeses(meses);

  it("com o limite CORRETO declarado, o mês fechado continua certo", () => {
    expect(latestUsableFinancialMonth({ orders, coverage: COM_LIMITE })).toBe("2026-06");
  });

  it("o 'mês em curso' é agora o mês civil corrente, não um mês do futuro", () => {
    /* CORRIGIDO em 23/08/2026 (P0.3). Antes: "2027-07" — um vencimento futuro de conta
     * a pagar criava a chave e `allowPartial` aceitava-a, porque tudo depois do fecho é
     * "partial". O Resumo chegou a exibir «2027-07 em andamento» com dados reais. */
    expect(
      latestUsableFinancialMonth({ orders, coverage: COM_LIMITE, allowPartial: true }),
    ).toBe("2026-08");
  });

  it("com referenceDate injetada o resultado é o mesmo — o teto é civil, não de dados", () => {
    expect(
      latestUsableFinancialMonth({
        orders, coverage: COM_LIMITE, allowPartial: true, referenceDate: AGORA,
      }),
    ).toBe("2026-08");
  });

  it("o teto NÃO afrouxa o mês fechado: continua a exigir cobertura", () => {
    // A garantia que autorizou a correção: nenhuma linha da DRE fechada muda.
    expect(latestUsableFinancialMonth({ orders, coverage: COM_LIMITE })).toBe("2026-06");
    expect(
      latestUsableFinancialMonth({ orders, coverage: COM_LIMITE, referenceDate: AGORA }),
    ).toBe("2026-06");
  });

  it("um mês futuro nunca é devolvido, mesmo declarado real pela cobertura", () => {
    const tudoReal = { firstCompleteMonth: "2026-04", partialMonths: [], closedThroughMonth: "2099-12" };
    // A cobertura diz que 2027-07 está fechado; o calendário diz que ainda não chegou.
    expect(latestUsableFinancialMonth({ orders, coverage: tudoReal, referenceDate: AGORA })).toBe("2026-08");
  });

  it("sem meses futuros no dataset, o resultado é o esperado", () => {
    // Prova que o defeito vem dos meses futuros, e não da lógica de partial em si.
    const semFuturo = pedidosNosMeses(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(
      latestUsableFinancialMonth({
        orders: semFuturo, coverage: COM_LIMITE, allowPartial: true, referenceDate: AGORA,
      }),
    ).toBe("2026-08");
  });
});
