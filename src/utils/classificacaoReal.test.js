// CARACTERIZAÇÃO da classificação sobre as categorias REAIS da conta.
//
// Não é um teste de regras inventadas: as 19 categorias abaixo foram extraídas do
// snapshot de produção de 2026-08-23 (301 títulos, 300 depois de excluir o cancelado).
// Cada linha fixa o grupo da DRE em que a categoria cai HOJE.
//
// ─── PARA QUE SERVE ─────────────────────────────────────────────────────────────────
// Três das entradas caem em NAO_CLASSIFICADO. Isso NÃO está aqui como aprovação: está
// aqui para que qualquer alteração à regra seja deliberada e visível num diff, em vez
// de acontecer por acidente ao mexer noutra coisa. Mudar uma destas expectativas é
// mudar uma linha da DRE, e tem de ser uma decisão tomada com números à frente.
//
// O impacto de cada caso não classificado, e a regra proposta para o resolver, estão
// em docs/CLASSIFICACAO_DESPESAS_AUDITORIA.md.

import { describe, it, expect } from "vitest";
import { classifyPayable, isCancelledPayable, DRE_GROUPS } from "./dreEngine.js";

const G = DRE_GROUPS;
const titulo = (over = {}) => ({ id: 1, categoriaNome: null, historico: null, situacao: 2, valor: 100, ...over });
const grupoDe = (cat, hist = null) => classifyPayable(titulo({ categoriaNome: cat, historico: hist })).group;

/* As 19 categorias tal como o Bling as escreve — acentos, maiúsculas e tudo. */
const CATEGORIAS_REAIS = [
  ["Aluguel", G.FIXAS],
  ["Comissão sobre vendas", G.COMISSOES],
  ["Compra de insumos e matéria prima", G.COMPRAS_ESTOQUE],
  ["Compras de fornecedores", G.COMPRAS_ESTOQUE],
  ["Distribuição de Lucros", G.RETIRADAS],
  ["Fretes e seguros", G.FRETE_PAGO],
  ["Impostos sobre vendas", G.IMPOSTOS],
  ["Material de escritório", G.ADMINISTRATIVAS],
  ["Material de uso e consumo", G.ADMINISTRATIVAS],
  ["Pró-labore", G.PESSOAL],
  ["Salários", G.PESSOAL],
  ["Serviços contábeis", G.FIXAS],
  ["Serviços de terceiros", G.ADMINISTRATIVAS],
  ["Software", G.FIXAS],
  ["Tarifa bancária", G.ADMINISTRATIVAS],
  ["Transferências", G.NAO_CLASSIFICADO],
  // ─── As que NÃO têm regra hoje ───────────────────────────────────────────────────
  ["Sem categoria", G.NAO_CLASSIFICADO],
  ["Custo dos serviços prestados", G.NAO_CLASSIFICADO],
  ["Taxas pagas", G.NAO_CLASSIFICADO],
];

describe("categorias reais da conta — mapa fixado", () => {
  for (const [cat, esperado] of CATEGORIAS_REAIS) {
    it(`"${cat}" -> ${esperado}`, () => {
      expect(grupoDe(cat)).toBe(esperado);
    });
  }

  it("acentos e maiúsculas não alteram a classificação", () => {
    /* A normalização NFD + minúsculas é o que permite escrever o mapa de regras sem
     * acentos. Se alguém a remover, metade das categorias reais deixa de casar. */
    expect(grupoDe("PRÓ-LABORE")).toBe(grupoDe("pro-labore"));
    expect(grupoDe("Serviços Contábeis")).toBe(grupoDe("servicos contabeis"));
    expect(grupoDe("  Software  ")).toBe(G.FIXAS);
  });
});

/* ====================================================================================
 * OS TRÊS TÍTULOS DE JULHO SEM CLASSIFICAÇÃO — dados reais, sanitizados.
 *
 * Valor total: 1.554,35. Nenhum deles bloqueia o fecho de julho: NAO_CLASSIFICADO fica
 * fora das linhas da DRE e o único bloqueio de julho é o CMV ausente. O que estes
 * títulos fazem é ficar de fora de uma linha onde talvez devessem estar.
 * ==================================================================================== */
describe("julho 2026 — os três títulos não classificados", () => {
  /* CASO A — regra insuficiente. A categoria existe no Bling e é real; o motor é que
   * não a contempla. Onde deve entrar NÃO é óbvio: o nome diz custo direto de serviço
   * (território de CMV), o histórico diz montagem de mesas de escritório (território
   * administrativo). Classificar sem decisão explícita mudava o lucro bruto. */
  const A = titulo({
    id: 26256508150, valor: 200, dataEmissao: "2026-07-06", vencimento: "2026-07-10",
    categoriaId: 14722444211, categoriaNome: "Custo dos serviços prestados",
    historico: "Ref. montagem mesas escritório.",
  });

  /* CASO B — dado ausente na ORIGEM. categoriaId 0 no Bling significa sem categoria
   * atribuída. Não há nada para o motor inferir e não se inventa: resolve-se
   * categorizando o título no Bling, não em código. */
  const B = titulo({
    id: 26281773247, valor: 1118, dataEmissao: "2026-07-08", vencimento: "2026-07-08",
    categoriaId: 0, categoriaNome: "Sem categoria",
    historico: "Ref. mão de obra alarme + DVR",
  });

  /* CASO C — o dado EXISTE e a regra não lhe chega. "Taxas pagas" + histórico de
   * encargos de prefeitura é um tributo municipal. Mas neste motor IMPOSTOS é uma
   * DEDUÇÃO DA RECEITA (a linha do Simples), e uma taxa municipal não abate receita
   * de venda — logo a regra certa não é "mandar para impostos". */
  const C = titulo({
    id: 26319592678, valor: 236.35, dataEmissao: "2026-07-13", vencimento: "2026-07-13",
    categoriaId: 14722444247, categoriaNome: "Taxas pagas",
    historico: "Ref. Encargos PFSP (prefeitura).",
  });

  it("A · Custo dos serviços prestados continua fora da DRE", () => {
    expect(classifyPayable(A).group).toBe(G.NAO_CLASSIFICADO);
  });

  it("B · categoriaId 0 não é inferido a partir do histórico", () => {
    /* O histórico fala de mão de obra. Deduzir "pessoal" daí seria inventar: é um
     * serviço contratado a terceiros, não folha de pagamento — e a diferença muda o
     * EBITDA na mesma. Sem categoria na origem, fica sem grupo. */
    expect(classifyPayable(B).group).toBe(G.NAO_CLASSIFICADO);
  });

  it("C · Taxas pagas não é lido como dedução da receita", () => {
    /* Guarda contra a correção ingénua: acrescentar "taxa" à regra de impostos punha
     * um encargo municipal a abater a receita bruta. */
    const r = classifyPayable(C);
    expect(r.group).not.toBe(G.IMPOSTOS);
    expect(r.group).toBe(G.NAO_CLASSIFICADO);
  });

  it("nenhum dos três emite warning por título — a ausência é silenciosa", () => {
    /* Quem avisa é a DRE, com o agregado `titulos-nao-classificados`. Fixado para que
     * se perceba onde procurar: não há aviso individual nenhum a que se agarrar. */
    for (const t of [A, B, C]) expect(classifyPayable(t).warnings).toEqual([]);
  });

  it("os três somam 1.554,35 e nenhum é cancelado", () => {
    const soma = [A, B, C].reduce((s, t) => s + t.valor, 0);
    expect(Number(soma.toFixed(2))).toBe(1554.35);
    for (const t of [A, B, C]) expect(isCancelledPayable(t)).toBe(false);
  });
});

/* ====================================================================================
 * PRECEDÊNCIA ENTRE REGRAS. A primeira que casa vence, e a ordem é uma decisão
 * financeira: uma retirada de sócios nunca pode ser somada às despesas operacionais.
 * ==================================================================================== */
describe("precedência — o histórico vence a categoria onde tem de vencer", () => {
  it("histórico de dividendos numa categoria vazia vira retirada, com aviso", () => {
    // Caso real de abril: 13.520 em "Sem categoria" com "Ref. adiantamento de dividendos".
    const r = classifyPayable(titulo({ categoriaNome: "Sem categoria", historico: "Ref. adiantamento de dividendos" }));
    expect(r.group).toBe(G.RETIRADAS);
    expect(r.warnings.map((w) => w.code)).toContain("retirada-por-historico");
  });

  it("pró-labore com histórico de dividendos é retirada, e a contradição é reportada", () => {
    const r = classifyPayable(titulo({ categoriaNome: "Pró-labore", historico: "Distribuição de lucros do trimestre" }));
    expect(r.group).toBe(G.RETIRADAS);
    expect(r.warnings.map((w) => w.code)).toContain("categoria-historico-contraditorios");
  });

  it("a classificação por histórico não inventa retiradas a partir de palavras soltas", () => {
    // "retirada" sozinha (levantamento, retirada de mercadoria) não é retirada de sócios.
    expect(grupoDe("Fretes e seguros", "Retirada de mercadoria no armazém")).toBe(G.FRETE_PAGO);
  });

  it("compras e estoque vencem as despesas operacionais, nunca o contrário", () => {
    /* Uma compra de fornecedores classificada como despesa operacional inflacionaria
     * o EBITDA negativo e duplicaria o custo quando o CMV manual entrasse. */
    expect(grupoDe("Compras de fornecedores para o escritório")).toBe(G.COMPRAS_ESTOQUE);
  });
});

/* ====================================================================================
 * O QUE NÃO É DESPESA OPERACIONAL. Estes três grupos existem precisamente para não
 * contaminarem o EBITDA, e é fácil alguém "arrumá-los" para dentro sem perceber.
 * ==================================================================================== */
describe("grupos que ficam FORA das linhas operacionais", () => {
  it("compras/estoque, frete pago e retiradas são grupos distintos das operacionais", () => {
    const operacionais = [G.PESSOAL, G.FIXAS, G.ADMINISTRATIVAS];
    for (const g of [G.COMPRAS_ESTOQUE, G.FRETE_PAGO, G.RETIRADAS, G.NAO_CLASSIFICADO]) {
      expect(operacionais).not.toContain(g);
    }
  });

  it("'Fretes e seguros' pago NÃO é o frete de venda da DRE", () => {
    /* O frete cobrado ao cliente vem do pedido e está dentro do total. Somar as duas
     * pontas na mesma linha era o erro que o grupo FRETE_PAGO existe para evitar. */
    expect(grupoDe("Fretes e seguros")).toBe(G.FRETE_PAGO);
    expect(grupoDe("Fretes e seguros")).not.toBe(G.ADMINISTRATIVAS);
  });
});
