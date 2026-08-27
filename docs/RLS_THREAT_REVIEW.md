# Revisão lógica das políticas de RLS — FASE 15

> **Estado: REVISÃO EM PAPEL. A base de dados não existe e nada foi executado.**
> Cada caso abaixo tem de ser **re-verificado contra o projeto real** com
> `npm run check:supabase rls`, que faz os pedidos de verdade. Esta revisão apanha erros
> de raciocínio; só a execução apanha erros de digitação.

Fonte revista: `docs/sql/001_saas_foundation.sql`.

---

## 1. O modelo, em duas frases

A RLS protege o **acesso direto do browser à base de dados**, com a chave `anon` — que é
pública e vai no bundle. O BFF protege os **dados financeiros**, que não estão na base de
dados (estão no Apps Script/Drive) e que a RLS não alcança.

**Nenhuma substitui a outra.** Quem desligar a RLS confiando no BFF abre a base de dados
a qualquer visitante; quem confiar só na RLS deixa os snapshots financeiros sem proteção.

---

## 2. A matriz pedida

| # | Ator | Ação | Esperado | Política que decide | Veredito |
|---|---|---|---|---|---|
| 1 | user A, member de A | `SELECT` companies (A) | **permitido** | `companies_select_member` → `is_member_of(id)` | ✅ |
| 2 | user A | `SELECT` companies (B) | **negado** | idem — `is_member_of('B')` é falso | ✅ |
| 3 | viewer | `SELECT` company_coverage | **permitido** | `coverage_select_member` | ✅ |
| 4 | viewer | `INSERT/UPDATE` company_coverage | **negado** | *nenhuma política de escrita* | ✅ |
| 5 | member | escrita financeira | **negado pela RLS, permitido pelo BFF** | ver §3 | ✅ (por desenho) |
| 6 | anon | qualquer leitura financeira | **negado** | RLS ativa + `auth.uid()` nulo | ✅ |
| 7 | service_role | tudo | **só no servidor** | ignora RLS por definição | ✅ com ressalva §5 |

### Caso 1 e 2 — o isolamento

`is_member_of(target)` faz `select exists(... where user_id = auth.uid() and company_id
= target)`. Com o token de A, `auth.uid()` é A. Para a empresa B não há linha, logo
`false`, logo a linha de B não é devolvida.

**Correto.** E note-se que o resultado é *linha ausente*, não *erro* — que é o
comportamento certo: um erro distinguiria "existe mas não é sua" de "não existe", e isso
é um oráculo para enumerar clientes.

### Caso 4 — o `viewer` e a cobertura

`company_coverage` tem política de `SELECT` e **nenhuma** de `INSERT`/`UPDATE`/`DELETE`.
Com RLS ativa, ausência de política = negação. Portanto **nem o `viewer` nem o `owner`**
conseguem escrever cobertura diretamente contra a base de dados.

Isto é intencional e é mais forte do que parece: se existisse uma política de `INSERT`
para membros, um `viewer` com o inspetor aberto poderia confirmar coberturas **saltando
o BFF por completo** — e com ele saltaria a verificação de capacidade, a validação do
mês contra o relógio do servidor, e o registo de auditoria.

### Caso 5 — porque é que "member não escreve" é o desenho certo

Parece contraditório: o `member` **tem** `write_financial_state`. Mas essa capacidade é
verificada **no BFF**, que escreve com a `service_role`. A base de dados não conhece
capacidades — conhece papéis. Duplicar a tabela de capacidades em SQL criaria duas fontes
de verdade para a mesma decisão, e a que ficasse desatualizada seria a que decide.

Fluxo real: `browser → BFF (verifica token + membership + capacidade) → service_role → tabela`.

### Caso 6 — anónimo

Com `enable row level security` e políticas que exigem `auth.uid()`, um pedido com a
chave `anon` e sem token tem `auth.uid()` nulo. `is_member_of` devolve `false`,
`id = auth.uid()` é falso. Tudo vazio.

`is_member_of` é `security definer` e executável por `public`. **Não é uma fuga**: para
um anónimo devolve sempre `false`, e o valor de retorno é um booleano — não devolve
dados nem confirma a existência de empresa nenhuma (devolve `false` tanto para uma
empresa que existe como para uma que não).

---

## 3. Defeitos encontrados nesta revisão

### 3.1 `profiles` nunca teria uma única linha — **CORRIGIDO**

Havia `SELECT` e `UPDATE` e **nenhum `INSERT`**, e o Supabase não cria perfis por si.
Com RLS ativa, a tabela ficaria permanentemente vazia: `full_name` nunca teria valor e o
`profiles_update_own` seria um `UPDATE` sobre zero linhas — que **não dá erro nenhum**.

Um perfil que nunca se cria e um `UPDATE` que nunca falha é o tipo de defeito que
sobrevive a uma demonstração inteira.

**Corrigido** com as duas metades necessárias: um trigger `on_auth_user_created`
(`security definer`) que cria o perfil no ato do registo — incluindo contas criadas pelo
painel ou por OAuth, onde não há frontend nosso a correr — e uma política de `INSERT`
restrita a `id = auth.uid()` para contas anteriores à migração.

### 3.2 `company_coverage` sem coluna `confirmed_by_user_id` — **CORRIGIDO (no código)**

O `createSupabaseCoverageStore` escrevia `confirmed_by_user_id`. A tabela **não tem essa
coluna** — tem `confirmed_by_role`, e o esquema diz por extenso que este documento de
estado não contém PII.

O `UPSERT` teria falhado com `column ... does not exist`: o **primeiro utilizador a
confirmar uma cobertura, no dia do lançamento**, receberia 503. Nada o apanhava porque
nenhum teste comparava o corpo escrito com o esquema.

Corrigido em `lib/coveragePersistence.js`, com um teste que valida o corpo do `UPSERT`
contra a lista de colunas do esquema.

---

## 4. Riscos aceites, com o gatilho para deixarem de o ser

### 4.1 `companies.integration` é legível por qualquer membro

`companies_select_member` devolve a **linha inteira**, incluindo `integration` — hoje, o
URL do Web App do Apps Script.

- **Hoje é aceitável.** São membros da própria empresa, e o Web App é
  `ANYONE_ANONYMOUS`: quem tem o URL tem os dados, mas são os dados da empresa deles.
- **Deixa de o ser** no instante em que `integration` guardar um segredo por empresa
  (credenciais do Bling, uma chave de API) ou em que exista um papel a quem não se queira
  dar a fonte de dados.
- **Mitigação já desenhada:** uma `VIEW` sem `integration` para o cliente, e a tabela
  acessível só à `service_role`.

**Nota positiva:** o `supabaseAuthAdapter.js` já **não** seleciona `integration` — o
`SELECT_EMPRESAS` lista as colunas explicitamente. A exposição é da política, não do
cliente. Isso torna a mitigação uma mudança de uma linha em SQL, sem tocar no frontend.

### 4.2 `audit_log.company_id` com `on delete set null`

Apagar uma empresa põe `company_id` a `null` nas suas entradas de auditoria. Como
`audit_select_owner` exige correspondência de `company_id`, essas entradas ficam
**ilegíveis por toda a gente** (exceto `service_role`).

É defensável — a auditoria sobrevive, que era o objetivo — mas convém saber que
"sobrevive" aqui significa "só acessível pelo servidor".

### 4.3 As memberships dos colegas não são visíveis

Deliberado e documentado no SQL: não há página de "equipa", e uma política mais aberta do
que o produto precisa é superfície que ninguém está a vigiar. Quando a página existir,
alarga-se com uma condição explícita.

---

## 5. `service_role` — a regra que não pode ser relaxada

A `service_role` **ignora a RLS por completo**. É por isso que:

- vive **exclusivamente** em `process.env` de funções serverless;
- **nunca** numa variável `VITE_*` — que vai literalmente para o bundle público;
- as leituras que a usam são **sempre** filtradas pelo `userId` que saiu da verificação
  do token, e por mais nada (`lib/memberships.js`).

`npm run check:supabase env` falha explicitamente se encontrar uma variável `VITE_*` com
nome de segredo. É a falha mais grave possível nesta arquitetura e a mais fácil de
cometer — basta copiar a linha errada de um painel.

---

## 6. O que esta revisão NÃO prova

- **não prova que o SQL executa.** Um erro de sintaxe, um nome de tabela trocado ou uma
  política que não é criada só aparecem ao executar;
- **não prova que a RLS está ativa.** `enable row level security` pode ser revertido por
  uma migração posterior sem que nada se queixe;
- **não substitui o teste real.** `npm run check:supabase rls` tenta ler as cinco tabelas
  com a chave `anon` e tenta uma escrita anónima em `memberships`. **Uma leitura não
  vazia ou uma escrita bem-sucedida aí é um incidente, não um teste falhado.**
