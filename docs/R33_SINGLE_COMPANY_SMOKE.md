# R-33 — smoke de isolamento FORTE com uma conta de empresa única

> # ⛔ EXECUÇÃO TENTADA E BLOQUEADA — 31/08/2026
>
> **A autorização foi dada. O que falta é um meio, não uma permissão.**
>
> O Igor autorizou explicitamente criar a conta de smoke e dar-lhe membership **só** em
> `finer-teste`. A execução **não avançou** e o motivo é único e concreto:
>
> ### Não existe `SUPABASE_SERVICE_ROLE_KEY` acessível a esta sessão
>
> Verificado nos dois sítios onde é legítimo procurar, e em mais nenhum:
>
> | Onde | Resultado |
> |---|---|
> | `finer-one-proxy/.env.local` | existe, mas tem **uma só** linha: `VERCEL_OIDC_TOKEN`. Nenhuma chave do Supabase |
> | Variáveis de ambiente do processo | **nenhuma** variável `SUPABASE_*` definida |
>
> Sem essa chave não há Admin API, e sem Admin API não há como criar um utilizador nem
> escrever em `public.memberships` (a `anon` key é travada pela RLS, que é precisamente o
> que ela deve fazer).
>
> **Não se procurou o segredo em mais lado nenhum** — nem em históricos de shell, nem em
> ficheiros de browser, nem em gestores de palavras-passe. Foi instrução explícita e é
> também a regra da casa.
>
> **Nada foi criado, nada foi alterado, nada foi escrito.** O estado remoto está
> exatamente como estava.
>
> ### O que se conseguiu confirmar, mesmo sem a chave
>
> - `GET /api/companies/finer-teste/financial-data` **sem token** → **`401`**
> - `GET /api/companies/overcel/financial-data` **sem token** → **`401`**
>
> A guarda está viva nas duas empresas. Falta exercê-la com um token **real sem
> membership** — que é a metade que só a conta nova consegue provar.
>
> ### Ponto da situação — 31/08, depois da conta criada
>
> A conta **foi criada** pelo Igor no Supabase. Faltam duas coisas, e ambas são dele:
>
> | # | O que falta | Porquê não posso fazer eu |
> |---|---|---|
> | 1 | **O `user_id` verdadeiro** | a mensagem trouxe o texto literal `COLOQUE_AQUI_O_UUID` — o placeholder não foi substituído. Não se inventa um UUID |
> | 2 | **Executar o `insert` da membership** | `authenticated` só tem `select` em `memberships` (`002_grants.sql:40`). Escrever exige `service_role`, que não existe nesta máquina, ou o SQL Editor |
>
> **Medido ao vivo a 31/08**, com a chave publicável:
>
> ```
> GET /rest/v1/memberships  (anon)  ->  401  code 42501  permission denied
> GET /rest/v1/  (OpenAPI)          ->  401  "Secret API key required"
> ```
>
> Ou seja: o papel `anon` não tem sequer `select`. **Bate certo, à letra, com
> `002_grants.sql`** — que não dá nada ao `anon`. A defesa em profundidade está confirmada
> por medição, e não só pelo SQL versionado.
>
> Como o esquema real **não é legível** com a chave publicável, tudo o que se segue vem do
> **SQL versionado** (`001_saas_foundation.sql`, `002_grants.sql`), que foi verificado
> contra a base de dados a 29/08 (B-07). Está dito porque a diferença importa.
>
> **O resto deste documento continua exato e por executar.** Foi escrito a partir do
> esquema versionado e do código do BFF, não de memória.

---

## A pergunta que só esta conta consegue responder

A validação de E2, a 30/08, provou que a Finer Teste mostra *"ainda não tem dados
ligados"* e zero números da Overcel. Provou o **isolamento visual**. Não podia provar o
**isolamento forte** — que um utilizador da empresa B não alcança a empresa A — por uma
razão simples e que não tem volta: *a conta usada é membro das duas empresas.* Com essa
conta, um `200` na Overcel é o comportamento correto, e portanto não há resposta errada
possível para observar.

O que falta é a experiência com um **negativo**: uma conta que pertence a **uma só**
empresa, e a prova de que a outra lhe é recusada com `403` — pelo servidor, com o token
verificado, e com a recusa registada.

`test/protect.test.mjs` já cobre a negação com duplos. O que os duplos não podem cobrir é
a montagem real: token real, JWKS real, `memberships` real, Production real.

---

## Porquê uma conta nova e não uma alteração à existente

Está decidido e a justificação completa está em `RISK_REGISTER.md` §*R-33 — a saída menos
invasiva*. Em duas linhas: criar é **aditivo** — nenhuma linha existente é tocada e o
rollback é apagar o que se criou. Remover temporariamente uma membership real escreve
numa linha que dá acesso a sério, e faz o rollback depender de alguém se lembrar do
`role` exato se a sessão cair a meio.

**A conta vive na Finer Teste, não na Overcel.** Se algo correr mal, o pior caso é uma
conta a ver uma empresa vazia.

---

## Pré-condições (verificar ANTES de criar seja o que for)

| # | Condição | Como se confirma |
|---|---|---|
| 1 | O BFF em Production é `74a1e0b` | `vercel ls` / painel. Não promover nada para este teste |
| 2 | `ALLOWED_ORIGINS` continua configurada | já verificado 30/08 (B-05) |
| 3 | O endpoint protegido responde `401` sem token | já verificado 30/08 |
| 4 | `overcel` **tem** integração e `finer-teste` **não tem** | `docs/sql/003_company_integration.sql` §230 — a Finer Teste é o caso de controlo, de propósito |
| 5 | `VITE_PROTECTED_DATA_TRANSPORT` continua **vazio** | este teste **não** precisa de E3 e **não** deve ligá-lo |

> **O passo 5 é o que torna este teste seguro de fazer antes de E3.** A metade (b), que é
> a que prova o isolamento, fala com o BFF **por `curl`** e não pelo frontend. Não precisa
> do interruptor ligado, e ligá-lo para isto seria trocar um teste por um rollout.

---

## Os identificadores — e a boa notícia sobre eles

`public.companies.id` é **texto**, não UUID (`001_saas_foundation.sql:71`). Ou seja:

```
company_id da Overcel      = overcel
company_id da Finer Teste  = finer-teste
```

**Não é preciso ir procurá-los.** O único identificador desconhecido é o `user_id` (UUID)
da conta nova, que o Supabase gera no passo 1.

---

## Sequência de execução

### Passo 1 — criar a conta ⛔ EXIGE AUTORIZAÇÃO HUMANA

Supabase → **Authentication → Users → Add user**.

| campo | valor |
|---|---|
| Email | `smoke-b@finerone.local` (ou outro; não precisa de ser entregável) |
| Password | forte, gerada no gestor de palavras-passe |
| Auto Confirm User | **ligado** — sem isto o login falha e o teste responde a outra pergunta |

Anotar o **`user_id`**. É o único valor que os passos seguintes precisam.

> **A palavra-passe não se cola na conversa.** Fica no gestor de palavras-passe. Nada
> neste runbook precisa dela por escrito.

### Passo 2 — a membership, uma só linha

SQL Editor:

```sql
insert into public.memberships (user_id, company_id, role)
values ('<USER_ID_DA_CONTA_NOVA>', 'finer-teste', 'viewer');
```

`viewer` e não `owner`: o teste é sobre alcançar a empresa, não sobre o que se faz lá
dentro. O papel mais fraco que ainda concede `read_financial_data` é o certo.

### Passo 3 — contar antes de testar

É o passo que impede o teste de passar por má razão. Se por engano a conta tiver uma
membership na **Overcel**, ela torna-se mais uma conta multiempresa e o `403` esperado
nunca aparece — mas o teste "passaria" na metade que se olhasse primeiro.

```sql
select company_id, role
from public.memberships
where user_id = '<USER_ID_DA_CONTA_NOVA>';
```

**Tem de devolver exatamente uma linha, e essa linha tem de ser `finer-teste`.** Se
devolver outra coisa, parar e corrigir antes de continuar.

### Passo 4 — obter um `access_token` da conta nova

```bash
# a chave é a PUBLISHABLE (pública por desenho), não a service_role
curl -s -X POST "https://bysqekhcyrvtiejcupoa.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke-b@finerone.local","password":"'"$SMOKE_PASSWORD"'"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

Guardar em `TOKEN_SMOKE_B` **na shell**, nunca num ficheiro e nunca na conversa.
Alternativa sem `curl`: entrar na aplicação com a conta nova e ler a sessão do browser.

> **O token não se imprime.** O comando acima escreve-o no terminal por necessidade de o
> capturar; preferir `TOKEN_SMOKE_B=$(...)` e nunca `echo`.

---

## O teste de aceitação

### (a) No produto montado — o que se vê

Login com a conta nova, com E3 **desligado**:

- [ ] o seletor de empresas mostra **só a Finer Teste**;
- [ ] não há caminho na interface até à Overcel — nem por preferência guardada:
      `sessionContract.js` descarta um `companyId` sem membership (R-10). Vale a pena
      forçá-lo: pôr `finer-one:empresa-preferida` a `overcel` no `localStorage`, recarregar,
      e confirmar que a aplicação **não** ativa a Overcel;
- [ ] nenhum nome, número ou rótulo da Overcel no DOM (`Ctrl+F` por "Overcel" no
      inspetor, com todas as páginas visitadas).

### (b) Ao nível da rede — a prova que falta

É esta a metade que prova isolamento **forte**, e é o caminho que E3 vai usar.

```bash
BFF=https://finer-one-proxy.vercel.app/api/companies

# 1. a empresa a que NÃO pertence  ->  403
curl -s -o /dev/null -w "overcel      -> %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_SMOKE_B" \
  "$BFF/overcel/financial-data?recurso=pedidos"

# 2. a empresa a que pertence      ->  200
curl -s -o /dev/null -w "finer-teste  -> %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN_SMOKE_B" \
  "$BFF/finer-teste/financial-data?recurso=pedidos"
```

| # | Esperado | Se der outra coisa |
|---|---|---|
| 1 | **`403`** | `401` **não serve** — significa token inválido e responde a outra pergunta. Um **`200` é uma paragem imediata**: é dado cruzado entre empresas |
| 2 | **`200`** com `debug.fonte: "integracao-nao-configurada"` | A Finer Teste não tem integração de propósito (o caso de controlo). **`403` aqui significa que a membership do passo 2 não pegou** |

O `200` do caso 2 é o que distingue "o servidor recusa tudo" de "o servidor decide". Sem
ele, um `403` no caso 1 não prova nada.

### (c) O `audit_log` — que a recusa ficou registada, e sem nada dentro

Esperar **dois minutos sem tráfego nenhum** antes de consultar. Não é superstição: R-H foi
apanhado exatamente assim — sob tráfego o registo funcionava e na sondagem isolada
perdia-se, porque a instância serverless congelava com a escrita ainda pendente. Está
corrigido (`protect.js` espera pela escrita), e é essa correção que se está a verificar.

Colunas reais, lidas de `001_saas_foundation.sql:146` — **as do
`BFF_POST_PRODUCTION_SMOKE.md` estão desatualizadas (R-36) e dão erro de SQL**:

```sql
select id, company_id, actor_user_id, action, occurred_at, metadata
from public.audit_log
where actor_user_id = '<USER_ID_DA_CONTA_NOVA>'
order by occurred_at desc
limit 10;
```

O que tem de estar lá — a forma vem de `protect.js:287-303`:

> ⚠️ **CORRIGIDO a 31/08.** A versão anterior desta tabela dizia que `company_id` seria
> `overcel`. **É falso, e vale a pena perceber porquê.** `negar()` devolve
> `companyId: null` (`authorizationCore.js:274`) — o `companyId` da decisão é o da
> **membership**, e numa recusa por ausência de membership não há membership nenhuma de
> onde o tirar. `protect.js:288` escreve `decisao.companyId ?? null`. Logo:
>
> **`company_id` da linha é `NULL`. O `overcel` vive só em `metadata.requestedCompanyId`.**
>
> Não é um defeito — é a distinção entre "a empresa a que este registo pertence" e "a
> empresa que foi pedida". Numa recusa, só a segunda existe.

| Verificação | Esperado |
|---|---|
| Número de linhas | **exatamente uma** para esta experiência |
| `action` | `access.denied` |
| `actor_user_id` | o `user_id` da conta nova |
| `company_id` | **`NULL`** — ver a nota acima |
| `month_key` | `NULL` |
| `metadata.requestedCompanyId` | **`overcel`** — é aqui que a empresa pedida aparece |
| `metadata.capability` | `read_financial_data` |
| `metadata.decision` | `forbidden` |
| `metadata.reason` | `sem_membership` — e **não** `membership_insuficiente`, que seria papel a menos numa empresa a que se pertence |
| **Sem segredo** | nenhum token, nenhuma `GAS_URL`, nenhum cabeçalho |
| **Sem conteúdo financeiro** | nenhum valor, nenhum número da Overcel |

> ⛔ **E uma consequência operacional do `company_id = NULL`:** a política
> `audit_select_owner` (`001_saas_foundation.sql:303`) exige
> `m.company_id = audit_log.company_id` com `role = 'owner'`. Com `company_id` a `NULL`, a
> comparação nunca é verdadeira. **Nenhum utilizador autenticado consegue ler esta linha —
> nem o Igor, nem a conta de smoke.** Só a `service_role` a vê.
>
> Portanto o TESTE 3 **tem** de ser corrido no **SQL Editor** do painel, ou com a
> `service_role` fornecida localmente. Não há terceira via, e isto não é uma limitação
> desta sessão: é assim para toda a gente.

> **O acesso com `200` à Finer Teste NÃO gera linha.** `protect.js` só audita o caminho da
> **recusa**. Duas linhas aqui significa que algo foi pedido duas vezes — verificar antes
> de concluir seja o que for.

---

## Pós-condições

- [ ] `403` na Overcel, `200` na Finer Teste, com o mesmo token;
- [ ] exatamente uma linha de `access.denied`, com o actor e o `requestedCompanyId` certos;
- [ ] nenhuma membership pré-existente alterada (o passo 3, corrido outra vez, dá o mesmo);
- [ ] `VITE_PROTECTED_DATA_TRANSPORT` continua vazio;
- [ ] o BFF em Production continua `74a1e0b`.

## Rollback / limpeza

Duas linhas, por esta ordem:

```sql
delete from public.memberships
where user_id = '<USER_ID_DA_CONTA_NOVA>' and company_id = 'finer-teste';
```

Depois: **Authentication → Users → apagar a conta nova.**

**Nada mais foi tocado, portanto não há mais nada a repor.**

Duas notas:

- **a linha do `audit_log` fica, e é suposto.** Não há FK para `auth.users` justamente
  para que o registo sobreviva à eliminação da conta (`001_saas_foundation.sql:138`).
  Apagar a prova do que se testou seria o oposto de um registo de auditoria;
- **se a conta for para reutilizar em E4, não se apaga — desativa-se.** E4 vai voltar a
  precisar exatamente desta forma de conta.

## Risco

**Baixo, e limitado ao que se criou.** Uma conta a mais no Supabase não altera dados
financeiros, não passa pelo BFF e não afeta nenhum utilizador existente. O único cenário
mau é o do passo 3 — dar por engano à conta nova uma membership na Overcel — e o passo 3
existe para o apanhar antes de o teste correr.

---

## Tempo estimado, quando houver autorização

| Passo | Minutos |
|---|---|
| 1–3 · criar conta, membership, contar | 5 |
| 4 · token | 2 |
| (b) · rede — a prova | 2 |
| (c) · `audit_log` (inclui os 2 min de silêncio) | 5 |
| (a) · produto montado | 10 |
| rollback | 2 |
| **Total** | **~25 min** |
