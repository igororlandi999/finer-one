// src/auth/uiPermissions.js
// A UI PODE OFERECER ESTA AÇÃO? — puro, sem React.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// ESCONDER NÃO É AUTORIZAR. ESTE FICHEIRO NÃO PROTEGE NADA.
// ═══════════════════════════════════════════════════════════════════════════════════
// A autorização é `authorizeCompanyRequest`, no BFF, sobre um token verificado. Um
// `viewer` que apague este módulo com o inspetor aberto e clique no botão recebe 403 —
// e é esse 403 que é a segurança. Os testes do BFF são a autoridade; estes são cortesia.
//
// ─── ENTÃO PORQUE EXISTE ────────────────────────────────────────────────────────────
// Porque uma ação oferecida e recusada é uma ação PROMETIDA e negada. Um contabilista
// externo que veja "Confirmar cobertura das despesas", leia a frase que vai afirmar,
// clique, e receba "Sem acesso a este recurso" aprendeu três coisas erradas: que podia,
// que a plataforma está avariada, e que não vale a pena voltar a tentar. Um botão que
// não pode funcionar é uma promessa falsa — é a mesma regra que já impede esta
// aplicação de desenhar botões desativados em `AjustesManuais`.
//
// ═══════════════════════════════════════════════════════════════════════════════════
// A SUBTILEZA QUE OBRIGA ESTE MÓDULO A SER UM MÓDULO E NÃO UM `&&`
// ═══════════════════════════════════════════════════════════════════════════════════
// `sessionCan(session, cap)` exige `canMountFinancialApp(session)`, que exige sessão
// AUTENTICADA. No modo atual da aplicação — `AUTH_MODE.DISABLED`, sem Supabase
// configurado — a sessão é ANÓNIMA de propósito (ver `AuthContext`: não se fabrica uma
// sessão falsa). Logo `sessionCan` devolve `false` para tudo.
//
// Ligar a UI diretamente a `sessionCan` faria portanto o CTA de confirmar cobertura
// DESAPARECER na instalação de hoje, que corre sem autenticação e onde o único
// utilizador é o dono dos dados. Seria uma regressão funcional entregue como uma
// melhoria de segurança — e sem nada no ecrã a explicar porquê.
//
// A regra correta tem duas metades, e é por serem duas que isto está aqui e testado:
//
//   autenticação DESLIGADA -> não existem papéis. Não há a quem restringir, e a
//                             restrição não protegeria ninguém. A UI oferece tudo.
//   autenticação LIGADA    -> a capacidade da MEMBERSHIP decide, e o default é NÃO.
//
// Escrito como `requiresAuth ? can(cap) : true` num JSX, isto seria uma linha que
// alguém, um dia, "simplifica" para `can(cap)` — e a simplificação parece uma correção
// de segurança. Aqui é uma função com nome, com um teste por cada metade.

import { sessionCan } from "./sessionContract.js";
import { CAPABILITIES, isKnownCapability } from "./authorizationCore.js";

export { CAPABILITIES };

/** Porque é que a UI decidiu o que decidiu. Para testes, telemetria e para a própria UI
 *  poder explicar-se — um CTA que desaparece sem explicação é um defeito por reportar. */
export const UI_PERMISSION_REASON = {
  /** Não há papéis a aplicar: a aplicação corre sem autenticação. */
  SEM_AUTENTICACAO: "sem_autenticacao",
  /** A membership da empresa ativa concede a capacidade. */
  CONCEDIDA: "concedida",
  /** A membership da empresa ativa NÃO concede a capacidade (tipicamente `viewer`). */
  PAPEL_INSUFICIENTE: "papel_insuficiente",
  /** Sessão autenticada sem empresa ativa utilizável. */
  SEM_EMPRESA: "sem_empresa",
  /** A capacidade pedida não existe. Erro nosso; nega. */
  CAPACIDADE_DESCONHECIDA: "capacidade_desconhecida",
};

/**
 * A UI deve oferecer esta ação?
 *
 * @param {object} args
 * @param {boolean} args.requiresAuth  `useAuth().requiresAuth` — há um provider a sério?
 * @param {object|null} args.session    A sessão (shape de `sessionContract`).
 * @param {string} args.capability      Uma de `CAPABILITIES`.
 * @returns {{allowed: boolean, reason: string}}
 *
 * Devolve um OBJETO e não um booleano de propósito: o motivo é o que permite à UI
 * desenhar um estado read-only explicado em vez de um espaço em branco. "Não vê o botão"
 * e "vê que não pode, e porquê" são produtos diferentes.
 */
export function resolveUiCapability({ requiresAuth, session, capability } = {}) {
  if (!isKnownCapability(capability)) {
    /* Uma capacidade que não existe nega, e nunca concede. Um erro de escrita no nome
     * de uma capacidade não pode ser a forma de abrir uma ação a todos. */
    return { allowed: false, reason: UI_PERMISSION_REASON.CAPACIDADE_DESCONHECIDA };
  }

  /* ── AUTENTICAÇÃO DESLIGADA ────────────────────────────────────────────────────────
   * Ver o cabeçalho. Não há papéis, logo não há restrição que signifique algo.
   *
   * A comparação é `=== false` e NÃO `!== true`. A diferença aparece quando o chamador
   * se esquece do argumento: com `!== true`, um `undefined` valeria "autenticação
   * desligada, oferece tudo" — ou seja, um esquecimento concederia a ação a um `viewer`
   * numa sessão autenticada. Apanhado por teste, e é o único sítio deste módulo onde a
   * escolha do operador tem consequência de autorização.
   *
   * `requiresAuth` tem de ser AFIRMADO como falso. A dúvida cai para o lado restritivo,
   * como em todo o resto desta fundação. */
  if (requiresAuth === false) {
    return { allowed: true, reason: UI_PERMISSION_REASON.SEM_AUTENTICACAO };
  }

  if (sessionCan(session, capability)) {
    return { allowed: true, reason: UI_PERMISSION_REASON.CONCEDIDA };
  }

  /* Distingue-se "sem empresa" de "papel insuficiente" porque são ecrãs diferentes: o
   * primeiro nem devia ter chegado aqui (o portão trata-o), o segundo é o `viewer`
   * legítimo, a quem se deve uma explicação e não um vazio. */
  const semEmpresa = !session || !session.company;
  return {
    allowed: false,
    reason: semEmpresa ? UI_PERMISSION_REASON.SEM_EMPRESA : UI_PERMISSION_REASON.PAPEL_INSUFICIENTE,
  };
}

/** Atalho booleano, para onde o motivo não interessa. */
export function uiCan(args) {
  return resolveUiCapability(args).allowed;
}
