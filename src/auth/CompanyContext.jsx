// src/auth/CompanyContext.jsx
// A EMPRESA ATIVA, para quem desenha. Fino: a decisão toda vive em `companyProfile.js`.
//
// ─── COMO SE MIGRA UMA PÁGINA ───────────────────────────────────────────────────────
// Antes:  import { ACTIVE_COMPANY } from "../config/company";
//         formatMoney(v)                     // usa o default compilado
//         ACTIVE_COMPANY.currency            // "BRL", sempre
//
// Depois: const { company, formatting } = useCompany();
//         formatMoney(v, formatting)
//         company.currency
//
// Nada mais muda. A página deixa de saber que existe um ficheiro de configuração, e
// passa a saber que existe uma empresa ativa — que é o que ela sempre quis saber.
//
// ─── E SE NÃO HOUVER PROVIDER? ──────────────────────────────────────────────────────
// `useCompany` devolve o perfil da CONFIGURAÇÃO em vez de lançar. É deliberado e é o
// que torna a migração incremental possível: uma página migrada continua a funcionar
// em qualquer teste, história ou ecrã que não monte a árvore de autenticação inteira.
// O `origin` diz sempre de onde veio, para que ninguém confunda as duas situações.

import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";
import { resolveCompanyProfile, companyForFormatting, COMPANY_PROFILE_ORIGIN } from "./companyProfile.js";
import { setActiveFormatting } from "../lib/activeFormatting.js";

export { COMPANY_PROFILE_ORIGIN };

const CompanyContext = createContext(null);

/** O valor usado quando não há provider — a configuração compilada, e assumida. */
function perfilDeFallback() {
  const company = resolveCompanyProfile({ sessionCompany: null });
  return {
    company,
    formatting: companyForFormatting(company),
    companies: [],
    canSwitch: false,
    switchCompany: () => {},
    fromSession: false,
  };
}

export function CompanyProvider({ children }) {
  const { company: empresaDaSessao, companies, switchCompany } = useAuth();

  const value = useMemo(() => {
    const company = resolveCompanyProfile({ sessionCompany: empresaDaSessao ?? null });
    const formatting = companyForFormatting(company);

    /* ── O ÚNICO ESCRITOR DO REGISTO DE FORMATAÇÃO ─────────────────────────────────
     * Ver `lib/activeFormatting.js` para o porquê de o registo existir. Em resumo: há
     * 114 chamadas a `formatMoney(v)` sem segundo argumento, e o default delas era a
     * Overcel COMPILADA. Registar aqui faz todas seguirem a empresa ativa de uma vez,
     * em vez de o fazerem à medida que cada página for migrada — e é durante essa
     * migração, nas páginas que faltam, que os valores da empresa B apareceriam com o
     * símbolo de A.
     *
     * Escreve-se DENTRO do `useMemo` de propósito, e não num `useEffect`: um efeito
     * corre DEPOIS do render, pelo que o primeiro render após uma troca de empresa
     * ainda formataria com a empresa anterior. Num ecrã de DRE, um render com a moeda
     * errada é exatamente o defeito que se está a fechar.
     *
     * É seguro porque a escrita é IDEMPOTENTE e não toca em estado de React: não agenda
     * renders, não lê nada, e o valor escrito é função pura de `company`. */
    setActiveFormatting(formatting);

    return {
      company,
      /* Pronto a passar a `formatMoney`, `formatMoneyCompact`, `currencySymbol`. O
       * caminho EXPLÍCITO continua a ser o preferido: uma página que passe isto deixa
       * de depender do registo acima. */
      formatting,
      companies: companies ?? [],
      canSwitch: Array.isArray(companies) && companies.length > 1,
      switchCompany,
      fromSession: company.origin === COMPANY_PROFILE_ORIGIN.SESSION,
    };
  }, [empresaDaSessao, companies, switchCompany]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  return ctx === null ? perfilDeFallback() : ctx;
}
