# Fundação SaaS — autenticação, sessão, contexto de empresa e autorização

Estado: **desenhada e implementada localmente**. Nada publicado, nada em produção.
Data: 26/08/2026.

---

## 1. A arquitetura encontrada

Auditoria do repositório antes de escrever uma linha.

```
Browser (GitHub Pages)                    Vercel                    Google              Bling
igororlandi999.github.io/finer-one   finer-one-proxy         Apps Script v12
        │                                    │                       │
        │  GET {VITE_API_BASE_URL}/          │                       │
        │      pedidos/vendas?recurso=…      │                       │
        ├───────────────────────────────────►│                       │
        │           SEM TOKEN                │  GET {GAS_URL}?…      │
        │           SEM companyId            ├──────────────────────►│
        │           CORS: *                  │   ANYONE_ANONYMOUS    ├──────►
        │                                    │                       │  OAuth no GAS
        ◄────────────────────────────────────┴───────────────────────┘
```

| Componente | Onde | Estado |
|---|---|---|
| Frontend | `finer-one`, React 18 + Vite, **sem react-router** (navegação por `PlanContext.activeScreen`) | GitHub Pages, `base: "/finer-one/"` |
| Proxy | `finer-one-proxy`, 1 função Vercel (`api/pedidos/vendas.js`) | Vercel, **não é repositório git** — deploy manual |
| Backend de dados | `apps-script/`, Web App `ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING` | Produção v12 |
| Empresa ativa | `src/config/company.js` → `ACTIVE_COMPANY`, **compilada** | 1 empresa |
| Autenticação | **nenhuma** | — |
| `localStorage`/`sessionStorage` | só o handoff de perguntas do Diagnóstico para o Chat | — |

### Onde existia confiança, e onde não existia

| Fronteira | Confiança | Realidade |
|---|---|---|
| Browser → proxy | **nenhuma verificação** | Quem souber o URL tem os dados financeiros completos da Overcel |
| Proxy → Apps Script | `GAS_URL` em env do servidor | Correto: o URL não vai no bundle |
| Apps Script → Bling | OAuth dentro do GAS | Correto: os tokens do Bling nunca saem de lá |
| Apps Script → mundo | `ANYONE_ANONYMOUS` | Quem descobrir o URL do Web App contorna o proxy por completo |
| `companyId` | **não existe** em lado nenhum do protocolo | Não há nada para adulterar porque não há multiempresa |

### Quem conhece `ACTIVE_COMPANY`

- `src/lib/currency.js` — argumento por omissão de `formatMoney`, `formatMoneyCompact`, `formatMoneyOrDash`, `currencySymbol`
- `src/services/blingDataService.js` — `configCoverage` e `currency` do dataset
- `src/services/manualInputsService.js` — validação de `companyId` no documento de ajustes
- `src/pages/Despesas.jsx` — cabeçalho do CSV
- `src/pages/PerformanceFinanceira.jsx` — fallback de cobertura

E, à parte, o **nome** da empresa vinha de `src/data/mockData.js` (`company.name`) na `Sidebar` e no `AppShell` — um segundo sítio codificado que diria "Overcel" para qualquer empresa que viesse a existir. Corrigido nesta sessão.

---

## 2. Provider recomendado: **Supabase**

### Comparação

| Critério | **Supabase** | Clerk | Auth0 | Firebase |
|---|---|---|---|---|
| Auth | Sim | Sim (o melhor DX) | Sim (o mais completo) | Sim |
| Base de dados | **Postgres incluído** | Não | Não | Firestore (NoSQL) |
| Memberships relacionais | Tabela + FK + PK composta | Organizations (modelo próprio) | Organizations (tier pago) | Documentos, sem joins |
| Isolamento na BD | **RLS em SQL** | n/a (a BD é outra) | n/a | Security Rules (linguagem própria) |
| Verificação server-side | `/auth/v1/user` ou JWKS | JWKS + SDK | JWKS + SDK | Admin SDK |
| React/Vite | `supabase-js`, sem atrito | SDK React | SDK React | SDK |
| Vercel | Sim | Sim | Sim | Sim |
| Google/Microsoft login | Incluído | Incluído | Incluído | Incluído |
| Custo MVP | Free generoso; ~25 $/mês no Pro | Free até ~10k MAU; organizations em plano pago | O mais caro a escalar | Free generoso |
| Lock-in | **Baixo-médio**: Postgres é portável; a auth é a parte pegajosa | Alto: o modelo de organizations é dele | Alto | Alto: Firestore não é SQL |
| Testabilidade | Boa (adaptador injetável; SQL local) | Média | Média | Baixa (emuladores pesados) |
| Vendedores a gerir | **1** | 2 (Clerk + BD) | 2 | 1 |

### Recomendação

**Supabase.** Sim — resolve Auth **+** BD **+** memberships **+** RLS num só sítio, e é essa a razão decisiva.

O raciocínio, e não só a conclusão:

- **O Clerk tem melhor DX de autenticação.** Se a decisão fosse só "autenticação", era ele. Mas o problema não é autenticação: é *multiempresa com dados financeiros isolados*. Isso exige uma base de dados relacional. Com Clerk seriam dois fornecedores, duas faturas, dois modelos de identidade a manter em sincronia, e o `userId` do Clerk como chave estrangeira numa BD que ele não conhece.
- **Auth0** é a escolha certa para requisitos empresariais (SAML, SSO corporativo). Nenhum desses está no caminho até ao piloto externo, e o custo e a configuração são os mais altos dos quatro.
- **Firebase** falha no ponto central: memberships são um problema relacional (`1 user → N empresas`, `1 empresa → N users`, com papel na aresta), e resolvê-lo em Firestore significa desnormalizar e manter a coerência à mão. Além disso, o Postgres é portável; o Firestore não.
- **Postgres é a apólice de seguro do lock-in.** Se um dia se sair do Supabase, os dados saem num `pg_dump`. O que fica preso é a autenticação — e é exatamente por isso que ela está atrás de um porto (`authAdapterPort.js`), com um único ficheiro a conhecer o SDK.

A prioridade declarada era **não construir autenticação manualmente**. Foi respeitada de forma literal: nenhum código deste projeto faz hash de palavras-passe, emite tokens ou verifica assinaturas JWT. A verificação server-side delega em `GET /auth/v1/user` do próprio Supabase (ver §8).

---

## 3. Modelo de dados

`docs/sql/001_saas_foundation.sql` — comentado linha a linha. Resumo:

```
auth.users (do Supabase)
    │
    ├── profiles         (id → auth.users, full_name)
    │
    └── memberships      (user_id, company_id, role)   PK composta
              │
              └── companies (id slug, name, currency, locale, timezone, plan, status, integration)
                       │
                       ├── company_coverage  (company_id, source, complete_through_month, …)
                       └── audit_log         (company_id, actor_user_id, action, month_key, …)
```

Decisões que não são óbvias:

- **Não há `public.users`.** `auth.users` é do Supabase; duplicar identidade em dois sítios cria a pergunta "qual das duas é o utilizador?", que não tem boa resposta. `profiles` guarda só o que é nosso.
- **`companies.id` é texto (slug), não uuid.** Aparece no caminho do URL, em registos e em conversas com o cliente. Um uuid não acrescenta segurança — a segurança é a membership, não a imprevisibilidade do id.
- **`currency` e `locale` são NOT NULL sem default.** Um default de moeda é a diferença entre apresentar 84.300 como reais ou como euros.
- **`memberships` tem PK composta `(user_id, company_id)`.** Duas linhas com papéis diferentes tornariam "qual é o papel dele?" ambígua — e uma pergunta de autorização ambígua resolve-se sempre mal.
- **`audit_log.actor_user_id` não tem FK.** Um registo de auditoria tem de sobreviver à eliminação da conta que o produziu.
- **A tabela de capacidades não está em SQL.** Vive em `authorizationCore.js`. Duplicá-la criaria duas fontes de verdade para a mesma decisão.

---

## 4. Papéis

`owner` · `member` · `viewer`. Duas fronteiras de decisão, três papéis.

| Capacidade | owner | member | viewer |
|---|:--:|:--:|:--:|
| `read_financial_data` | ✅ | ✅ | ✅ |
| `write_financial_state` (cobertura, CMV, classificação) | ✅ | ✅ | ❌ |
| `manage_memberships` | ✅ | ❌ | ❌ |

Porque cada um:

- **`owner`** — alguém tem de poder dar e tirar acesso. Sem ele, adicionar um utilizador é um ticket de suporte para sempre.
- **`viewer`** — é o papel do **piloto externo** e do contabilista, e chega antes de qualquer gestão de equipas. É o mais fácil de justificar: uma pessoa que consulta a DRE não deve poder afirmar que a cobertura de julho está completa.
- **`member`** — o dispensável dos três, e mesmo assim justifica-se: sem ele, toda a gente que precise de confirmar uma cobertura teria de ser `owner`, e `owner` pode remover os outros. Quem introduz o CMV não deve poder apagar o dono da conta.

O que **não** se fez: permissões por recurso, papéis personalizados, herança, grupos. Não há necessidade e cada um deles é uma superfície nova.

A autorização é sempre **por capacidade explícita**, nunca por `role >= X`. Comparar senioridade é como se ganham privilégios por acaso ao acrescentar um papel novo no meio da escala.

---

## 5. A fronteira de confiança

```
┌─ NÃO CONFIÁVEL ─────────────────────┐   ┌─ CONFIÁVEL ──────────────────────────┐
│ Browser                             │   │ BFF (Vercel)                          │
│                                     │   │                                       │
│  companyId (localStorage)           │   │  1. extractBearerToken                │
│  role, capabilities (memória)       │   │  2. verifySupabaseToken   → userId    │
│  perfil da empresa (memória)        │   │  3. loadMemberships(userId)           │
│  token assinado ─────────────────────►│  4. findMembership(companyId) → 403    │
│                                     │   │  5. roleHasCapability     → 403       │
│  ↑ tudo isto é DESENHO.             │   │  6. loadCompanyConfig(id AUTORIZADO)  │
│    Nada disto autoriza.             │   │  7. fetch à integração DESSA empresa  │
└─────────────────────────────────────┘   └───────────────────────────────────────┘
```

A regra, em uma linha: **nada do que o cliente envia identifica o cliente.**

- o `userId` vem sempre do token verificado;
- o `companyId` vem do caminho — é o **pedido**, não a **autorização** — e só serve para procurar uma membership;
- a `role` vem da membership lida no servidor;
- a configuração da empresa (moeda, locale, **integração**) resolve-se depois de autorizar, a partir do id autorizado.

O passo 6 é o que faz o isolamento: o cliente pode pedir a empresa que quiser, mas o que determina a fonte de dados é a linha de `companies` da empresa **autorizada**.

Um payload de escrita que traga `actorUserId`, `userId`, `role`, `companyId` ou `memberships` é **rejeitado com 400**, não ignorado. Ignorar em silêncio esconde um bug nosso durante meses e trata uma tentativa de personificação como um encolher de ombros.

---

## 6. O que foi implementado

### `src/auth/` — a fundação

| Ficheiro | O quê |
|---|---|
| `authorizationCore.js` | **A autoridade.** Puro, zero imports, vendorado pelo BFF. Papéis, capacidades, `authorizeCompanyRequest`. |
| `sessionContract.js` | Máquina de estados da sessão. `loading` ≠ `unauthenticated` ≠ `error`. Resolução da empresa ativa. |
| `authMode.js` | Que adaptador vale. Três camadas de guarda contra autenticação simulada em produção. |
| `authAdapterPort.js` | O contrato de um provider + adaptador nulo (ninguém entra). |
| `devAuthAdapter.js` | Sessões simuladas a partir de fixtures compiladas. Recusa-se a existir em produção. |
| `supabaseAuthAdapter.js` | O único ficheiro que conhece o Supabase. Import dinâmico: a dependência ainda não está instalada e o build continua verde. |
| `authAdapters.js` | A fábrica. O `if (import.meta.env.DEV)` que elimina o adaptador simulado do bundle. |
| `AuthContext.jsx` | `AuthProvider` / `useAuth`. Fino: a decisão vive nos módulos puros. |
| `companyProfile.js` | Adaptador `ACTIVE_COMPANY` → empresa da sessão. Impede contaminação de cobertura entre empresas. |
| `CompanyContext.jsx` | `CompanyProvider` / `useCompany`. Responde mesmo sem provider. |
| `ProtectedRoute.jsx` | O portão. Quatro saídas. |
| `auditLog.js` | Construtor de entradas de auditoria. Autor obrigatório, metadata por lista de permissão. |

### Outros

- `src/pages/Login.jsx` — primeiro ecrã de autenticação.
- `src/components/ui/CompanySwitcher.jsx` — 1 empresa: cartão; N: menu com o papel em cada uma.
- `src/services/authorizedApi.js` — cliente com `Bearer`, caminhos escopados, tradução de 401/403.
- `src/services/coverageWriteClient.js` — a escrita protegida da cobertura.
- `src/services/api.js` — ganhou `apiRequest` (método + corpo). `apiGet` inalterado.
- `src/App.jsx`, `src/layouts/Sidebar.jsx`, `src/layouts/AppShell.jsx` — ligação.

### A ordem dos providers

```jsx
<AuthProvider>            {/* quem é, e a que empresas pertence   */}
  <CompanyProvider>       {/* qual está ativa                     */}
    <ProtectedRoute>      {/* O PORTÃO                            */}
      <PlanProvider>
        <FinerDataProvider>   {/* ← leitura financeira, DENTRO do portão */}
```

`FinerDataProvider` está dentro do portão de propósito: fora dele, o `useEffect` de arranque dispararia a leitura dos quatro snapshots antes de haver sessão.

`CompanyProvider` está fora porque o próprio portão desenha ecrãs que beneficiam de saber a empresa, e `useCompany` tem de responder em qualquer sítio da árvore.

---

## 7. Modo de desenvolvimento

Três modos, resolvidos por `resolveAuthMode(import.meta.env)`:

| `VITE_AUTH_MODE` | Ambiente | Resultado |
|---|---|---|
| (vazio) | com config Supabase | `supabase` |
| (vazio) | sem config | **`disabled`** — a aplicação corre como corria antes desta fundação |
| `dev` | desenvolvimento | `dev` (fixtures) |
| `dev` | **produção** | **despromovido**, com motivo registado |
| `supabase` | sem config | `disabled` (nunca `dev`) |
| desconhecido | qualquer | `supabase` se houver config, senão `disabled` |

**Nenhum caminho de resolução devolve `dev` num ambiente de produção.** Há um teste que percorre todas as combinações de variável × forma de declarar produção.

### As três barreiras contra autenticação simulada em produção

1. **Runtime, resolução** — `resolveAuthMode` despromove.
2. **Runtime, construção** — `assertDevAuthAllowed` **lança** como primeira instrução do construtor. Testado: nem o storage é tocado.
3. **Compilação** — `authAdapters.js` só importa o adaptador dentro de `import.meta.env.DEV`, que o Vite substitui por `false` em produção. O Rollup elimina o ramo e o ficheiro **não entra no bundle**.

`bundleSemAuthSimulada.test.js` lê o `dist/` construído e falha se lá encontrar a sentinela, um email de fixture, o id da empresa-fixture ou o prefixo dos tokens simulados. Verificado nesta sessão: **ausentes**.

O `sessionStorage` do modo dev guarda **um id de fixture e mais nada** — nem papel, nem empresa, nem token. Um id inventado não produz sessão nenhuma.

---

## 8. Verificação do token no servidor

`finer-one-proxy/lib/verifyToken.js` chama `GET {SUPABASE_URL}/auth/v1/user` com o token.

Porque não se verifica o JWT localmente: escrever verificação de JWT é escrever criptografia, e os erros típicos não parecem erros (aceitar `alg: none`, comparar assinaturas com `===`, esquecer o `aud`, aceitar uma chave rodada). Delegar resolve também revogação e rotação, que uma verificação local não resolve.

O custo é uma ida à rede por pedido, mitigada por uma cache de **15 segundos** com o token como chave — suficiente para absorver as quatro leituras paralelas do arranque, curta de mais para manter viva uma sessão revogada. Só se guarda o **sucesso**: pôr uma falha de rede em cache manteria um utilizador legítimo de fora por um soluço.

Migrar para JWKS (com `jose`, nunca à mão) quando a latência incomodar.

---

## 9. O que continua igual

- **Contratos financeiros permanentes**: intocados. Nenhum motor foi alterado.
- **Apps Script**: `ANYONE_ANONYMOUS`, v12, sem `doPost`. Não foi tocado.
- **Modo atual de desenvolvimento**: com `VITE_AUTH_MODE` vazio e sem Supabase, a aplicação corre exatamente como antes.
- **`ACTIVE_COMPANY`**: continua a existir e a ser o fallback. Nada foi removido.

Um contrato **novo**, na mesma família dos existentes: a cobertura configurada em `company.js` descreve os snapshots **da Overcel**, e por isso só é herdada quando o id da empresa ativa bate certo. Para qualquer outra empresa é `null` — indisponível, que é a verdade. Aplicá-la seria afirmar um facto financeiro sobre uma empresa com base no que se sabe de outra.
