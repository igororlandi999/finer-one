// FACTOS DE CLASSIFICAÇÃO — números para uma política futura, nunca a política.
//
// O que isto NÃO faz, e é o ponto: não decide se 0,38% de títulos por classificar é
// aceitável. Não tem limiar, não tem constante de materialidade, não devolve veredito.
//
// Porque existe: hoje um título de R$ 1 e um de R$ 100 000 produzem exatamente o mesmo
// efeito — `operatingExpenses` passa a `partial` e o mês perde a elegibilidade como
// âncora — e nada na aplicação permitia distinguir os dois casos. O bloqueio continua
// igual; o que muda é que deixa de ser cego.

import { describe, it, expect } from "vitest";
import { buildClassificationCompleteness } from "./classificationCompleteness.js";

const pg = (id, valor, categoriaNome, over = {}) => ({
  id, situacao: 2, valor, categoriaNome,
  vencimentoOriginal: "2026-07-10",
  contato: { id: 1, nome: "Fornecedor A" },
  historico: null,
  ...over,
});

const MES = "2026-07";

/* Um mês realista: dois títulos reconhecidos, um deliberadamente excluído (compras) e
 * um por classificar. */
const PAYABLES = [
  pg(1, 12000, "Salários"),
  pg(2, 3000, "Comissões"),
  pg(3, 80000, "Compras de fornecedores"),          // exclusão DELIBERADA, não lacuna
  pg(4, 1118, "Sem categoria", { historico: "Ref. mão de obra alarme" }),
];

describe("buildClassificationCompleteness — contagens e montantes", () => {
  it("mede o que está por classificar sem opinar sobre se é muito", () => {
    const c = buildClassificationCompleteness({ payables: PAYABLES, monthKey: MES });
    expect(c.unclassifiedCount).toBe(1);
    expect(c.unclassifiedAmount).toBe(1118);
    expect(c.totalRelevantAmount).toBe(96118);
    expect(c.classifiedAmount).toBe(95000);
    // Nenhum campo diz "aceitável", "material", "ok" ou equivalente.
    expect(Object.keys(c)).not.toContain("material");
    expect(Object.keys(c)).not.toContain("acceptable");
  });

  it("separa o que é EXCLUÍDO de propósito do que é lacuna", () => {
    /* Compras/estoque e frete pago saem das linhas operacionais por decisão (viram CMV
     * quando vendidas; a integração do frete é fase própria). Metê-los no mesmo saco
     * dos títulos por reconhecer faria o denominador de qualquer rácio de materialidade
     * depender de uma escolha que este módulo não pode fazer. */
    const c = buildClassificationCompleteness({ payables: PAYABLES, monthKey: MES });
    expect(c.deliberatelyExcludedAmount).toBe(80000);
    // E o excluído continua a contar como classificado: é conhecido, não é lacuna.
    expect(c.classifiedAmount).toBe(95000);
  });

  it("dois títulos de peso MUITO diferente ficam distinguíveis", () => {
    const barato = buildClassificationCompleteness({
      payables: [pg(1, 100000, "Salários"), pg(2, 1, "Sem categoria")], monthKey: MES,
    });
    const caro = buildClassificationCompleteness({
      payables: [pg(1, 100000, "Salários"), pg(2, 100000, "Sem categoria")], monthKey: MES,
    });
    // O bloqueio é o mesmo nos dois (é o motor da DRE que o decide, não este módulo)...
    expect(barato.unclassifiedCount).toBe(1);
    expect(caro.unclassifiedCount).toBe(1);
    // ...mas o peso deixou de ser invisível.
    expect(barato.unclassifiedRatio).toBeCloseTo(0, 1);
    expect(caro.unclassifiedRatio).toBe(50);
  });

  it("rácio é null num mês sem títulos — nunca 0%, nunca NaN, nunca Infinity", () => {
    const c = buildClassificationCompleteness({ payables: [], monthKey: MES });
    expect(c.unclassifiedRatio).toBeNull();
    expect(c.totalRelevantAmount).toBe(0);
    expect(c.unclassifiedCount).toBe(0);
  });

  it("sem fonte devolve null — não um objeto de zeros", () => {
    /* Zeros afirmariam "medi e não há nada por classificar" sobre uma fonte que nem
     * sequer existe. É a mesma regra do resto do projeto: ausência ≠ zero. */
    expect(buildClassificationCompleteness({ payables: null, monthKey: MES })).toBeNull();
    expect(buildClassificationCompleteness({ payables: undefined, monthKey: MES })).toBeNull();
    expect(buildClassificationCompleteness({ payables: PAYABLES, monthKey: null })).toBeNull();
  });
});

describe("buildClassificationCompleteness — os títulos concretos", () => {
  it("expõe o que a FONTE traz, e nunca sugere categoria", () => {
    const c = buildClassificationCompleteness({ payables: PAYABLES, monthKey: MES });
    const i = c.items[0];
    expect(i.id).toBe(4);
    expect(i.amount).toBe(1118);
    expect(i.sourceCategory).toBe("Sem categoria");   // a categoria não reconhecida
    expect(i.description).toBe("Ref. mão de obra alarme");
    expect(i.supplier).toBe("Fornecedor A");
    expect(i.competenceField).toBe("vencimentoOriginal");
    // Sugerir uma categoria seria classificar — e classificar é decisão do utilizador.
    expect(i).not.toHaveProperty("suggestedCategory");
    expect(i).not.toHaveProperty("group");
  });

  it("ordena por valor descendente: o que mais pesa aparece primeiro", () => {
    const c = buildClassificationCompleteness({
      payables: [pg(1, 200, "Sem categoria"), pg(2, 1118, "Sem categoria"), pg(3, 236.35, "Taxas pagas")],
      monthKey: MES,
    });
    expect(c.items.map((i) => i.amount)).toEqual([1118, 236.35, 200]);
  });

  it("títulos CANCELADOS nunca entram — nem na contagem nem no total", () => {
    const c = buildClassificationCompleteness({
      payables: [...PAYABLES, pg(9, 50000, "Sem categoria", { situacao: 5 })], monthKey: MES,
    });
    expect(c.unclassifiedCount).toBe(1);
    expect(c.totalRelevantAmount).toBe(96118);
  });

  it("só conta títulos cuja COMPETÊNCIA cai no mês pedido", () => {
    const c = buildClassificationCompleteness({
      payables: [
        pg(1, 1118, "Sem categoria"),                                        // julho
        pg(2, 9999, "Sem categoria", { vencimentoOriginal: "2026-06-10" }),  // junho
      ],
      monthKey: MES,
    });
    expect(c.unclassifiedCount).toBe(1);
    expect(c.unclassifiedAmount).toBe(1118);
  });

  it("um título sem data nenhuma não pertence a mês nenhum", () => {
    const semData = { id: 7, situacao: 2, valor: 500, categoriaNome: "Sem categoria", contato: {} };
    const c = buildClassificationCompleteness({ payables: [semData], monthKey: MES });
    expect(c.unclassifiedCount).toBe(0);
  });
});
