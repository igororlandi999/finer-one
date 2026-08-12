// Testes do parsing de datas civis (YYYY-MM-DD) sem deslocamento de fuso.
//
// O bug original: new Date("2026-06-01") é meia-noite UTC, que em São Paulo
// (UTC-3) cai em 31/05 21:00, empurrando o primeiro dia do mês para o mês
// anterior. As asserções abaixo verificam os COMPONENTES LOCAIS da data, pelo
// que são válidas em qualquer fuso — e falham com a implementação antiga
// sempre que a suite corre num fuso de offset negativo.

import { describe, it, expect } from "vitest";
import { parseLocalISODate, toDate, monthKey, revenueByMonth } from "./financialCalculations.js";

const order = (id, dateStr, total, status = "recebida") => ({
  id: String(id), date: dateStr, total, status,
  client: { id: 1, name: "C" }, items: [],
});

describe("parseLocalISODate — data civil permanece no dia correto", () => {
  it("2026-06-01 permanece em 1 de junho (nunca 31 de maio)", () => {
    const d = parseLocalISODate("2026-06-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // junho (0-based)
    expect(d.getDate()).toBe(1);
  });

  it("2026-05-01 permanece em 1 de maio (nunca 30 de abril)", () => {
    const d = parseLocalISODate("2026-05-01");
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
  });

  it("último dia do mês permanece no mês correto", () => {
    const d = parseLocalISODate("2026-06-30");
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(30);
    const fev = parseLocalISODate("2026-02-28");
    expect(fev.getMonth()).toBe(1);
    expect(fev.getDate()).toBe(28);
  });

  it("primeiro dia de janeiro não recua para o ano anterior", () => {
    const d = parseLocalISODate("2026-01-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it("fixa a hora ao meio-dia local (imune a horário de verão)", () => {
    expect(parseLocalISODate("2026-06-01").getHours()).toBe(12);
  });

  it("data ISO com horário continua válida", () => {
    const d = parseLocalISODate("2026-06-10T15:30:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it("aceita Date e devolve-a inalterada", () => {
    const orig = new Date(2026, 5, 10, 8, 0, 0);
    expect(parseLocalISODate(orig).getTime()).toBe(orig.getTime());
  });

  it("data inválida ou vazia devolve null", () => {
    expect(parseLocalISODate(null)).toBeNull();
    expect(parseLocalISODate("")).toBeNull();
    expect(parseLocalISODate(undefined)).toBeNull();
    expect(parseLocalISODate("não é data")).toBeNull();
    expect(parseLocalISODate(new Date("lixo"))).toBeNull();
  });

  it("toDate delega em parseLocalISODate (ponto único)", () => {
    expect(toDate("2026-06-01").getMonth()).toBe(5);
    expect(toDate("2026-06-01").getDate()).toBe(1);
  });
});

describe("agrupamento mensal não desloca o primeiro dia", () => {
  it("monthKey do dia 1 fica no próprio mês", () => {
    expect(monthKey("2026-06-01")).toBe("2026-06");
    expect(monthKey("2026-05-01")).toBe("2026-05");
    expect(monthKey("2026-01-01")).toBe("2026-01");
  });

  it("monthKey do último dia fica no próprio mês", () => {
    expect(monthKey("2026-06-30")).toBe("2026-06");
    expect(monthKey("2026-12-31")).toBe("2026-12");
  });

  it("receita do dia 1 de junho é contabilizada em junho, não em maio", () => {
    const orders = [
      order(1, "2026-05-28", 1000),
      order(2, "2026-06-01", 6799), // o caso que contaminava maio
      order(3, "2026-06-15", 2000),
    ];
    const meses = new Map(revenueByMonth(orders).map((m) => [m.month, m.value]));
    expect(meses.get("2026-06")).toBe(8799); // 6799 + 2000
    expect(meses.get("2026-05")).toBe(1000); // maio não recebe os 6799
  });

  it("cenário de junho/2026: 6.799 do dia 1 pertencem a junho", () => {
    // Reproduz a evidência numérica: pedidos de 01/06 somando 6.799,00.
    const orders = [
      order(10, "2026-06-01", 3399.5),
      order(11, "2026-06-01", 3399.5),
      order(12, "2026-05-31", 500),
    ];
    const meses = new Map(revenueByMonth(orders).map((m) => [m.month, m.value]));
    expect(meses.get("2026-06")).toBe(6799);
    expect(meses.get("2026-05")).toBe(500);
  });
});