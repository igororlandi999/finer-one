# Inventário de caches e estado — o que sobrevive a uma troca de empresa

> Escrito a 28/08/2026, por leitura do código. Cada linha aponta para o ficheiro.

## Porque este ficheiro existe

Num produto de uma empresa só, uma cache mal escopada é uma otimização. Num produto
multiempresa, é **os números da empresa A apresentados sob o nome da empresa B** — a pior
forma de estar errado, porque parece certa.

A pergunta que este inventário faz a cada guardado é sempre a mesma:

> **Se o utilizador trocar de empresa, ou terminar sessão, este valor continua correto?**

---

## A regra, escrita uma vez

> **Uma resposta pertence a um triplo: `(sessão, empresa, geração)`.**
>
> Só escreve no estado quem ainda é o triplo atual. Uma leitura obsoleta termina em
> silêncio — não há nada de útil a fazer com o resultado dela.

Implementada em `src/context/FinerDataContext.jsx`:
- **geração** — `geracao.current`, incrementada a cada `load()` e no desmonte;
- **empresa** — `companyId`, que é dependência de `load`, logo troca-la relança a leitura;
- **sessão** — `sessaoId = ${status}:${user?.id}`, também dependência de `load`. Existe
  porque no **logout com a mesma empresa ativa nenhuma outra dependência muda**, e sem
  ele uma leitura anterior ao logout aterrava depois dele.

Provado em `src/context/FinerDataContext.corrida.test.jsx` (9 cenários, incluindo
A→B→A e troca de utilizador com a mesma empresa).

---

## Inventário

| # | Guardado | Onde | Chave / escopo | Vida | Isolado por empresa? | Isolado por utilizador? |
|---|---|---|---|---|---|---|
| 1 | `sales`, `manualInputs`, `source`, `loading` | `FinerDataContext` (React state) | o provider | até à leitura seguinte | **sim** — via geração + `sales.companyId` | **sim** — via `sessaoId` |
| 2 | `cobertura` (confirmação da sessão) | `FinerDataContext` (React state) | o provider | a sessão | **não** — ver risco C1 | não |
| 3 | transporte | `FinerDataContext` `useMemo` | `[env, requiresAuth, companyId, getAccessToken, signOut]` | enquanto as deps não mudarem | **sim** — `companyId` é dependência | sim |
| 4 | formatadores `Intl.NumberFormat` | `src/lib/currency.js` (Map de módulo) | `locale\|currency\|compact` | o processo | **sim** — a moeda faz parte da chave | n/a |
| 5 | clientes Supabase | `src/auth/supabaseAuthAdapter.js` (Map de módulo) | url do projeto | o processo | n/a | n/a — o cliente é o mesmo, a sessão é que muda |
| 6 | sessão Supabase (JWT + refresh) | `localStorage` (do SDK) | chave do SDK | até logout / expiração | n/a | **sim** — é a identidade |
| 7 | empresa preferida | `localStorage`, `AuthContext` `CHAVE_EMPRESA_PREFERIDA` | uma chave global | permanente | é *a* preferência | **não** — ver risco C2 |
| 8 | pergunta pendente do Chat | `sessionStorage`, `PENDING_CHAT_QUESTION_KEY` | uma chave global | one-shot (lido e apagado) | **não** — ver risco C3 | não |
| 9 | utilizador de fixture (dev) | `sessionStorage`, `devAuthAdapter` | uma chave | a aba | n/a — nunca existe em produção | n/a |
| 10 | cache de tokens do BFF | `finer-one-proxy/lib/verifyToken.js` (Map de módulo) | **o token** | 15 s, teto 500 | n/a — a chave é o token | **sim** — a chave é o token |
| 11 | cache HTTP | resposta do BFF | — | — | `Cache-Control: private, no-store` nos dois endpoints de dados | idem |

---

## Riscos abertos

### C1 — `cobertura.confirmada` não é reposta na troca de empresa (P3)

`FinerDataContext.jsx` guarda `{ aConfirmar, confirmada }` em estado do provider e **não
o repõe** quando `companyId` muda. Confirmar a cobertura na empresa A e trocar para B
deixa `cobertura.confirmada` a descrever a empresa A.

**Impacto real hoje: nenhum visível.** A única leitura na UI é
`cobertura?.aConfirmar === true` (`pages/AjustesManuais.jsx:307`), um booleano transitório
que é reposto no `finally` da própria confirmação. `confirmada` é escrito e nunca lido —
o efeito da confirmação vive no dataset reconstruído, não neste campo.

**Porque não foi corrigido nesta ronda:** não há defeito demonstrável, e a correção certa
(repor `cobertura` quando a geração muda) é a mesma linha que o eventual leitor futuro de
`confirmada` vai precisar. Corrigir agora sem consumidor seria adivinhar o contrato.
**A pinar quando `confirmada` passar a ser lido.**

### C2 — a empresa preferida é global, não por utilizador (P3)

`localStorage[CHAVE_EMPRESA_PREFERIDA]` é uma chave só. Dois utilizadores no mesmo
browser partilham-na.

**Porque não é uma fuga:** `sessionContract.js` **revalida** o valor guardado contra a
lista de memberships da sessão a cada arranque, e um id sem membership é descartado. O
pior caso é uma preferência ignorada — nunca acesso concedido. Está documentado no
próprio ficheiro (`sessionContract.js:137`).

### C3 — o handoff do Chat é global (P3)

`sessionStorage[PENDING_CHAT_QUESTION_KEY]` guarda uma **pergunta em texto**, escrita pelo
próprio utilizador ao clicar num atalho, e é lida-e-apagada de uma vez
(`pages/ChatFinanceiro.jsx:215`). Não transporta números nem identificadores. Trocar de
empresa entre o clique e a leitura levaria a pergunta para o ecrã da outra empresa — que
responde com os dados *dessa* empresa, corretamente. Sem valor financeiro atravessado.

---

## O que foi verificado e está correto

- **Formatadores de moeda** (#4) — a chave inclui `currency`. Trocar Overcel (BRL) →
  Finer Teste (EUR) → Overcel produz três chaves e nenhuma reutilização errada.
  Coberto por `src/lib/moedaCentralizada.test.js`.
- **Cache de tokens do BFF** (#10) — só o **sucesso** entra. Uma falha de rede nunca é
  guardada: pô-la em cache manteria um utilizador legítimo de fora durante segundos por
  causa de um soluço. E é uma cache de **processo serverless** — não se pode assumir que
  sobrevive entre invocações, o que é aceitável porque só existe para absorver as quatro
  leituras paralelas do arranque.
- **Cache HTTP** (#11) — `private, no-store` nos dois endpoints. Sem isto, uma resposta em
  cache indexada só pelo URL serviria os números da empresa A a quem pedisse a mesma URL
  com o token da empresa B.

---

## Oportunidade não implementada: `AbortController`

A guarda de geração impede o **resultado** de aterrar, mas o pedido obsoleto continua a
consumir rede e quota do Bling. Numa troca A→B→A rápida ficam três leituras de quatro
recursos em voo.

Não foi implementado porque a interface do transporte (`ler(recurso)`) não passa `signal`,
e alargá-la para atravessar `apiGet` → `apiRequest` → `fetch` é uma mudança de assinatura
em quatro camadas para um ganho de quota, não de correção. **O comportamento visível não
muda.** Fica registado como candidato para quando a quota do Bling apertar.
