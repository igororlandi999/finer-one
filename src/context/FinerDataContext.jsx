// src/context/FinerDataContext.jsx
// Fornece o dataset de vendas às telas, mantendo a regra de negócio fora do JSX.
//
// ─── NUNCA MOSTRAR DADOS FICTÍCIOS POR OMISSÃO (C7F) ────────────────────────────────
// Antes desta fase o contexto arrancava com `source: "mock"` e `sales: null`, e `null`
// é — por contrato documentado — o sinal para as telas usarem mockData. Durante os
// segundos que a leitura demorava, a aplicação era indistinguível de uma app em modo
// demonstração: mostrava números da Overcel fictícia e o banner declarava por escrito
// "Modo demonstração", para depois se desmentir.
//
// O estado inicial passou a ser LOADING, que não é nem real nem demo — é a ausência de
// veredito. Enquanto durar, o AppShell não renderiza páginas nenhumas. Dados
// demonstrativos só aparecem depois de a leitura terminar e concluir que não há fonte.

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { loadFinerData } from "../services/blingDataService.js";
import { resolveDataTransport, TRANSPORTE } from "../services/dataTransport.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCompany } from "../auth/CompanyContext.jsx";

/* Origem do dataset — quatro estados, porque são quatro situações diferentes e
 * confundir duas delas foi exatamente o defeito que esta camada teve de corrigir.
 *
 *   LOADING      ainda não há veredito. Não é real nem demonstração.
 *   API          fonte real ligada e a responder.
 *   MOCK         modo demonstração ESCOLHIDO — não há backend configurado, o que é
 *                uma decisão deliberada de quem instalou (ver .env.example).
 *   UNAVAILABLE  há backend configurado, mas falhou: rede, timeout, ou fonte sem
 *                dados. É uma AVARIA, não uma escolha.
 *
 * MOCK e UNAVAILABLE eram o mesmo valor até à C7F.1, e por isso uma falha de
 * integração aparecia ao utilizador como "Modo demonstração" — a app dizia que estava
 * a mostrar dados de exemplo de propósito quando na verdade tinha perdido a ligação.
 *
 * As telas comparam `source === "api"` para decidir se há dados reais; nenhuma precisa
 * de mudar, porque nem LOADING nem UNAVAILABLE são "api" — e em qualquer um desses
 * estados o AppShell não as chega a montar. */
/* Os quatro valores vivem agora em utils/dataSourceStates.js — um módulo PURO, para
 * que os view-models os possam importar sem arrastar React.
 *
 * IMPORTA-SE e depois reexporta-se, em vez de `export { X } from "..."`: a forma
 * agregadora NÃO cria binding local, e este ficheiro usa DATA_SOURCE.LOADING dentro do
 * provider. Com a agregadora, a app arrancava em branco com "DATA_SOURCE is not
 * defined" — e nenhum teste apanhava, porque o projeto não monta componentes. */
import { DATA_SOURCE } from "../utils/dataSourceStates.js";
export { DATA_SOURCE };

const FinerDataContext = createContext(null);

/* ═══════════════════════════════════════════════════════════════════════════════════
 * FASE 9 — AS DEPENDÊNCIAS ENTRAM, O PROVIDER NÃO AS VAI BUSCAR
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Este provider é a camada de DADOS. Não sabe o que é o Supabase, não importa SDK
 * nenhum, e não vai passar a saber: recebe uma EMPRESA (de `useCompany`) e uma função
 * que devolve um TOKEN (de `useAuth`), e entrega ambas a `resolveDataTransport`, que
 * decide por onde ler.
 *
 * A separação que isto preserva, e que é a razão de a FASE 9 existir:
 *
 *     Auth conhece auth.   Company conhece company.   A camada de dados RECEBE.
 *
 * Se algum dia `services/` ou `context/` importarem o SDK do Supabase, a fronteira
 * partiu-se — e há um teste que o impede (`transporteDeDados.test.js`).
 *
 * `env` e `auth` são injetáveis para que a decisão do transporte seja exercível em
 * teste sem montar a árvore de autenticação inteira.
 * ═══════════════════════════════════════════════════════════════════════════════════ */
export function FinerDataProvider({ children, env }) {
  const [sales, setSales] = useState(null);
  const [loading, setLoading] = useState(true);
  // NUNCA "mock" à partida: sem leitura feita, não há base para afirmar demonstração.
  const [source, setSource] = useState(DATA_SOURCE.LOADING);
  // Envelope dos ajustes manuais: { status, valuesByMonth, document }. Carregado na
  // MESMA leitura que alimenta o motor — nenhuma página deve refazer este fetch.
  const [manualInputs, setManualInputs] = useState(null);

  /* A sessão e a empresa ativa. Lidas AQUI e passadas para baixo — nenhuma camada
   * abaixo desta as vai buscar sozinha. */
  const { requiresAuth, authResolved, getAccessToken, signOut, status, user } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id ?? null;

  /* ════════════════════════════════════════════════════════════════════════════════
   * A IDENTIDADE DA SESSÃO, E PORQUE PRECISA DE ESTAR AQUI
   * ════════════════════════════════════════════════════════════════════════════════
   * Uma leitura pertence a um par (sessão, empresa). O contador de geração já impedia
   * o resultado de uma EMPRESA antiga de aterrar — mas só porque trocar de empresa
   * muda `companyId` e faz `load` correr de novo. No LOGOUT isso não acontece:
   *
   *   `getAccessToken` e `signOut` são `useCallback([adapter])`  -> não mudam;
   *   `requiresAuth` vem do modo de compilação                   -> não muda;
   *   `companyId` volta ao id da CONFIGURAÇÃO quando a sessão cai
   *     (`resolveCompanyProfile({sessionCompany: null})`)        -> e esse id é o da
   *     Overcel, que é precisamente a empresa da sessão que acabou de terminar.
   *
   * Ou seja: com a Overcel ativa, NENHUMA dependência de `load` muda ao terminar
   * sessão. O efeito não volta a correr, a geração não é incrementada, e uma leitura
   * que partiu antes do logout aterra depois dele — a escrever números de uma sessão
   * que já não existe num ecrã que já não devia tê-los.
   *
   * `sessaoId` fecha isso. Não é usado DENTRO de `load`: é usado como identidade da
   * leitura, e é essa a sua função. Muda no login, no logout e na troca de utilizador.
   * ════════════════════════════════════════════════════════════════════════════════ */
  const sessaoId = `${status}:${user?.id ?? ""}`;

  /* O transporte. Recalculado quando a empresa ou o modo de autenticação mudam: trocar
   * de empresa tem de trocar o URL de onde os dados vêm, e não só o nome na barra. */
  const { transport, motivoTransporte } = useMemo(() => {
    const r = resolveDataTransport({
      env: env ?? import.meta.env,
      requiresAuth,
      /* Enquanto isto for `false`, o modo ainda não se pronunciou e NENHUMA leitura
       * anónima pode sair. Sem ele, a janela de arranque servia o legado. */
      authResolved,
      companyId,
      getAccessToken,
      /* 401 durante o uso: a sessão morreu do lado do servidor. Cai-se para fora em vez
       * de deixar a aplicação a mostrar dados de uma sessão que já não existe. */
      onUnauthorized: () => { try { signOut(); } catch { /* a sessão local já caiu */ } },
    });
    return { transport: r.transport, motivoTransporte: r.motivo };
    /* `authResolved` é dependência e não decoração: é a passagem de "ainda não sei"
     * para o veredito que TEM de recalcular o transporte. Sem ela, a janela de arranque
     * fechava e nunca mais reabria — a aplicação ficava sem ler nada. */
  }, [env, requiresAuth, authResolved, companyId, getAccessToken, signOut]);

  /* ════════════════════════════════════════════════════════════════════════════════
   * A CORRIDA ENTRE DUAS EMPRESAS
   * ════════════════════════════════════════════════════════════════════════════════
   * `load` não cancelava nada e não se protegia de si próprio. A sequência que isso
   * permitia é curta e acontece sozinha:
   *
   *   1. empresa = Overcel  -> load() começa. Os recebíveis são 1,2 MB: demora.
   *   2. o utilizador troca -> empresa = Finer Teste. Novo load(), novo LOADING.
   *   3. Finer Teste responde depressa (não tem integração): ecrã vazio, correto.
   *   4. a leitura da OVERCEL chega finalmente e faz `setSales(...)`.
   *
   * Resultado: os números da Overcel no ecrã, com "Finer Teste" na barra. Ninguém viu
   * dados a que não tivesse acesso — mas viu o dinheiro de uma empresa com o nome de
   * outra, que num produto multiempresa é a pior forma de estar errado: parece certo.
   *
   * A defesa é um contador de geração. Cada leitura recebe o número da sua vez, e só
   * escreve no estado se ainda for a vez dela. Uma leitura obsoleta termina em
   * silêncio — não há nada de útil a fazer com o resultado dela.
   *
   * Não se usa `AbortController` porque o que é preciso não é parar o pedido (esse já
   * partiu, e o transporte legado nem o expõe): é impedir que o resultado ATERRE.
   * ════════════════════════════════════════════════════════════════════════════════ */
  const geracao = useRef(0);

  const load = useCallback(async () => {
    const minhaVez = ++geracao.current;
    const aindaSouEu = () => geracao.current === minhaVez;

    setLoading(true);
    /* Numa recarga, o source volta a LOADING: enquanto a nova leitura decorre, o que
     * está no ecrã pertence à leitura anterior e não deve ser apresentado como o
     * veredito da atual. */
    setSource(DATA_SOURCE.LOADING);
    try {
      const { sales, source, manualInputs } = await loadFinerData({
        transport,
        ...(companyId ? { companyId } : {}),
      });
      /* Chegou tarde: entretanto começou outra leitura, provavelmente de outra empresa.
       * Não se escreve NADA — nem os dados, nem o `source`, nem sequer `loading`, que a
       * leitura em curso está a gerir. */
      if (!aindaSouEu()) return;
      setSales(sales);
      setSource(source);
      setManualInputs(manualInputs ?? null);
    } catch {
      /* Falha total e inesperada da leitura (loadFinerData já absorve as previsíveis).
       * UNAVAILABLE e nunca MOCK: uma exceção aqui é uma avaria, e apresentá-la como
       * modo demonstração diria ao utilizador que os números de exemplo no ecrã são
       * intencionais — quando o que aconteceu foi perder-se o acesso aos verdadeiros. */
      if (!aindaSouEu()) return;
      setSales(null);
      setSource(DATA_SOURCE.UNAVAILABLE);
      setManualInputs(null);
    } finally {
      /* Também aqui: uma leitura obsoleta a desligar o `loading` apagaria o indicador
       * da leitura que ainda está a decorrer. */
      if (aindaSouEu()) setLoading(false);
    }
    /* `sessaoId` está aqui de propósito, e não por engano: uma leitura pertence a uma
     * SESSÃO tanto como a uma empresa. Ver o bloco A IDENTIDADE DA SESSÃO. */
  }, [transport, companyId, sessaoId]);

  useEffect(() => {
    load();
    /* Desmontar invalida o que está em voo. Isto é defesa a mais e diz-se que é: o React
     * já descarta uma escrita de estado num componente desmontado, portanto não há aqui
     * um defeito observável a corrigir. Custa uma linha e torna a regra — "só a geração
     * atual escreve" — verdadeira sem depender do comportamento do React. */
    return () => { geracao.current++; };
  }, [load]);

  /* ════════════════════════════════════════════════════════════════════════════════
   * CONFIRMAR COBERTURA DAS DESPESAS — aplicada NESTA SESSÃO, ainda não persistida.
   *
   * ─── PORQUE PARA AQUI, E NÃO UM PASSO À FRENTE ─────────────────────────────────
   * O Web App do Apps Script é `ANYONE_ANONYMOUS` e o URL do proxy vai no bundle.
   * Qualquer endpoint de escrita alcançável a partir deste frontend é, por definição,
   * um endpoint de escrita ANÓNIMO: sem autenticação de utilizador não há forma de
   * distinguir quem chama, e um segredo dentro do bundle não é um segredo.
   *
   * Ou seja: persistir a confirmação a partir do browser depende de autenticação que
   * ainda não existe. Ver `docs/COBERTURA_CONFIRMADA_CONTRATO.md` §4.
   *
   * O que se faz em vez disso — e é uma escolha, não uma limitação encoberta:
   *   - a confirmação é REAL no motor: o dataset é reconstruído com ela, e todos os
   *     estados (fecho, âncora, alertas, Chat) recalculam de verdade;
   *   - dura o que durar a sessão. Uma recarga volta ao valor da configuração;
   *   - a UI diz que foi confirmada NESTA SESSÃO. Não promete persistência.
   *
   * A persistência definitiva existe hoje pelo caminho do CMV: um operador executa
   * `salvarCoberturaConfirmada_` no editor do Apps Script, autenticado pela sua conta
   * Google. É o mesmo padrão de `salvarAjusteManual_`, pela mesma razão.
   * ════════════════════════════════════════════════════════════════════════════════ */
  const [cobertura, setCobertura] = useState({ aConfirmar: false, confirmada: null });

  const confirmarCobertura = useCallback(async (monthKey) => {
    setCobertura((c) => ({ ...c, aConfirmar: true }));
    try {
      const confirmada = {
        payables: {
          completeThroughMonth: monthKey,
          confirmedAt: new Date().toISOString(),
          confirmedBy: "user",
          note: null,
        },
      };
      /* Reconstrói o dataset com a confirmação. NÃO se refaz a leitura da rede: os
       * dados são os mesmos, o que mudou foi só a cobertura — e voltar a pedir quatro
       * snapshots para aplicar uma string seria gastar a quota do Bling por nada. */
      const { rebuildComCobertura } = await import("../services/blingDataService.js");
      const novo = rebuildComCobertura(sales, confirmada);
      if (novo) setSales(novo);
      setCobertura({ aConfirmar: false, confirmada });
    } catch {
      // Falhar a confirmar não pode derrubar o dataset que já está no ecrã.
      setCobertura((c) => ({ ...c, aConfirmar: false }));
    }
  }, [sales]);

  return (
    <FinerDataContext.Provider value={{
      sales, loading, source, manualInputs, reload: load,
      cobertura, confirmarCobertura,
      /* Diagnóstico do transporte. Exposto para que a UI e os testes possam AFIRMAR por
       * onde os dados vieram, em vez de o deduzirem. Sem isto, uma migração para o
       * transporte protegido seria indistinguível, no ecrã, de uma que não aconteceu. */
      transporte: transport?.id ?? TRANSPORTE.NENHUM,
      transporteProtegido: transport?.protegido === true,
      motivoTransporte,
    }}>
      {children}
    </FinerDataContext.Provider>
  );
}

export function useFinerData() {
  const ctx = useContext(FinerDataContext);
  if (ctx === null) {
    throw new Error("useFinerData deve ser usado dentro de <FinerDataProvider>.");
  }
  return ctx;
}
