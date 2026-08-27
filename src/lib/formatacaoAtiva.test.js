// FORMATAÇÃO DA EMPRESA ATIVA — guarda de regressão.
//
// ─── O DEFEITO QUE ESTES TESTES FECHAM ──────────────────────────────────────────────
// `formatMoney(v)` tinha como default `ACTIVE_COMPANY` — a Overcel, COMPILADA. Havia 114
// chamadas assim, em 15 ficheiros. Com o seletor de empresas a funcionar, um utilizador
// multiempresa que trocasse para uma empresa portuguesa via os valores dela apresentados
// com "R$".
//
// É a falha que a FASE 3 proíbe por escrito: empresa B no seletor, configuração
// financeira de A no ecrã. E é da pior espécie — o número está certo, a etiqueta está
// errada, e nada no ecrã denuncia.

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  setActiveFormatting, getActiveFormatting, resetActiveFormatting, FORMATTING_ORIGIN,
} from "./activeFormatting.js";
import { formatMoney, formatMoneyCompact, currencySymbol, formatMoneyOrDash } from "./currency.js";
import { companyForFormatting, resolveCompanyProfile } from "../auth/companyProfile.js";
import { ACTIVE_COMPANY } from "../config/company.js";

beforeEach(() => resetActiveFormatting());

/* ==================================================================================== */
describe("o registo da formatação ativa", () => {
  it("sem nada registado, cai na configuração compilada — o comportamento de hoje", () => {
    const f = getActiveFormatting();
    expect(f.currency).toBe(ACTIVE_COMPANY.currency);
    expect(f.locale).toBe(ACTIVE_COMPANY.locale);
    expect(f.origin).toBe(FORMATTING_ORIGIN.CONFIG);
  });

  it("uma empresa registada passa a governar TODAS as chamadas sem segundo argumento", () => {
    setActiveFormatting({ currency: "EUR", locale: "pt-PT" });
    expect(formatMoney(1234.5)).toContain("€");
    expect(formatMoney(1234.5)).not.toContain("R$");
    expect(currencySymbol()).toBe("€");
    expect(formatMoneyCompact(1250000)).toContain("€");
  });

  it("o argumento EXPLÍCITO vence sempre o registo", () => {
    /* É o que garante que migrar uma página para `formatMoney(v, formatting)` nunca
     * pode piorar nada: o caminho explícito é o destino, e continua a ser o mais forte. */
    setActiveFormatting({ currency: "EUR", locale: "pt-PT" });
    expect(formatMoney(1234.5, { currency: "BRL", locale: "pt-BR" })).toContain("R$");
  });

  it("limpar o registo volta à configuração, e nunca a um estado sem moeda", () => {
    setActiveFormatting({ currency: "EUR", locale: "pt-PT" });
    setActiveFormatting(null);
    expect(getActiveFormatting().origin).toBe(FORMATTING_ORIGIN.CONFIG);
    expect(formatMoney(1234.5)).toContain("R$");
  });

  it("o default é reavaliado a cada chamada — trocar de empresa não exige recarregar", () => {
    setActiveFormatting({ currency: "BRL", locale: "pt-BR" });
    const antes = formatMoney(1000);
    setActiveFormatting({ currency: "EUR", locale: "pt-PT" });
    const depois = formatMoney(1000);
    expect(antes).not.toBe(depois);
    expect(depois).toContain("€");
  });
});

/* ==================================================================================== */
describe("uma empresa sem moeda declarada NÃO herda a moeda de outra", () => {
  it("companyForFormatting não empresta a moeda da configuração a outra empresa", () => {
    /* A regra gémea da cobertura (ver `companyProfile.js`): o que se sabe da Overcel
     * não se aplica a uma empresa diferente só porque está compilado. */
    const perfil = resolveCompanyProfile({
      sessionCompany: { companyId: "empresa-b", name: "Empresa B" },
    });
    const f = companyForFormatting(perfil);
    expect(f.currency).toBeNull();
  });

  it("a MESMA empresa continua a herdar — a configuração é dela", () => {
    const perfil = resolveCompanyProfile({
      sessionCompany: { companyId: ACTIVE_COMPANY.id, name: "Overcel" },
    });
    expect(companyForFormatting(perfil).currency).toBe(ACTIVE_COMPANY.currency);
  });

  it("moeda desconhecida formata SEM SÍMBOLO, e nunca com o símbolo de outra empresa", () => {
    setActiveFormatting({ currency: null, locale: "pt-PT" });
    const saida = formatMoney(84300);
    expect(saida).not.toContain("R$");
    expect(saida).not.toContain("€");
    /* O número continua legível, agrupado e com duas decimais: é incompleto, não é
     * inútil. O separador de milhares NÃO se fixa no teste — em pt-PT o Intl agrupa com
     * espaço e em pt-BR com ponto, e essa escolha é do locale, não deste módulo. */
    expect(saida).toMatch(/^84\D?300,00$/);
  });

  it("currencySymbol devolve o travessão em vez de inventar uma moeda", () => {
    /* Este é o valor que vai para o CABEÇALHO de um CSV exportado. "Valor (—)" é
     * honesto; "Valor (R$)" sobre euros viaja para fora da aplicação com a etiqueta
     * errada colada e nunca mais é corrigido. */
    expect(currencySymbol({ currency: null, locale: "pt-PT" })).toBe("—");
  });

  it("null continua a ser ausência, não zero — mesmo sem moeda conhecida", () => {
    setActiveFormatting({ currency: null, locale: "pt-PT" });
    expect(formatMoneyOrDash(null)).toBe("—");
    expect(formatMoneyOrDash(0)).toContain("0,00");
  });
});

/* ==================================================================================== */
describe("o registo tem UM ÚNICO escritor", () => {
  /* A propriedade que torna o estado de módulo aceitável. Se qualquer ficheiro puder
   * registar a formatação, o registo deixa de ter dono e passa a ser uma variável
   * global — que é exatamente o que este desenho está a tentar não ser. */

  const aqui = dirname(fileURLToPath(import.meta.url));
  const SRC = join(aqui, "..");

  function ficheirosDeCodigo(dir = SRC, acc = []) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) { ficheirosDeCodigo(caminho, acc); continue; }
      if (!/\.(js|jsx)$/.test(entrada.name)) continue;
      if (/\.test\.jsx?$/.test(entrada.name)) continue;
      acc.push(caminho);
    }
    return acc;
  }

  const CODIGO = ficheirosDeCodigo().map((f) => ({
    caminho: relative(SRC, f).replace(/\\/g, "/"),
    fonte: readFileSync(f, "utf8"),
  }));

  it("só o CompanyProvider chama setActiveFormatting", () => {
    const escritores = CODIGO
      .filter((f) => f.caminho !== "lib/activeFormatting.js")
      .filter((f) => /\bsetActiveFormatting\s*\(/.test(f.fonte))
      .map((f) => f.caminho);

    expect(escritores, `escrevem a formatação ativa: ${escritores.join(", ")}`)
      .toEqual(["auth/CompanyContext.jsx"]);
  });

  it("nenhum motor financeiro importa o registo", () => {
    /* O registo é APRESENTAÇÃO. Um cálculo que dependa dele passaria a depender de
     * quem está autenticado — e o mesmo dataset daria números diferentes conforme a
     * sessão. Os motores vivem em `utils/` e em `services/`. */
    const infratores = CODIGO
      .filter((f) => f.caminho.startsWith("utils/") || f.caminho.startsWith("services/"))
      .filter((f) => /activeFormatting/.test(f.fonte))
      .map((f) => f.caminho);

    expect(infratores, `motores a ler a formatação ativa: ${infratores.join(", ")}`).toEqual([]);
  });
});

/* ==================================================================================== */
describe("nenhuma página lê a configuração da empresa diretamente", () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const SRC = join(aqui, "..");

  function ficheiros(dir, acc = []) {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) { ficheiros(caminho, acc); continue; }
      if (!/\.(js|jsx)$/.test(entrada.name) || /\.test\.jsx?$/.test(entrada.name)) continue;
      acc.push(caminho);
    }
    return acc;
  }

  it("ACTIVE_COMPANY não é importado por páginas, layouts nem componentes", () => {
    /* FASE 2. A camada VISUAL deixou de assumir a Overcel por compilação. Quem ainda o
     * importa são `lib/currency.js` (o fallback documentado), `auth/companyProfile.js`
     * (o adaptador que faz a transição) e a camada de dados — todos fora da UI, e todos
     * classificados como compatibilidade legítima no relatório da FASE 2. */
    const infratores = [];
    for (const dir of ["pages", "layouts", "components"]) {
      for (const f of ficheiros(join(SRC, dir))) {
        const fonte = readFileSync(f, "utf8");
        if (/import\s*\{[^}]*\bACTIVE_COMPANY\b[^}]*\}\s*from/.test(fonte)) {
          infratores.push(relative(SRC, f).replace(/\\/g, "/"));
        }
      }
    }
    expect(infratores, `assumem a empresa compilada: ${infratores.join(", ")}`).toEqual([]);
  });
});
