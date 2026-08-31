# R-33 — smoke de isolamento FORTE com uma conta de empresa única

> # ✅ R-33 FECHADO — 31/08/2026
>
> **Isolamento FORTE entre empresas está provado.** As três metades passaram contra a
> Production real (`74a1e0b`). Foi a última condição de E3 por cumprir.
>
> ## A conta
>
> | | |
> |---|---|
> | `user_id` | `a1a84e5d-99cf-4612-a187-93c676492c42` |
> | email | `igororlandi12@gmail.com` — conta **própria e distinta**, não um alias da principal |
> | membership | **`finer-teste` · `viewer`** — uma, e só uma |
> | membership em `overcel` | **nenhuma** |
>
> **A conta NÃO foi apagada** e é para manter: E4 volta a precisar exatamente desta forma
> de conta, e repetir o smoke durante o rollout de E3 é barato só enquanto ela existir.
>
> ## Pré-condição e testes 1 e 2 — `node scripts/r33-smoke.mjs`
>
> ```
> PRE-CONDICAO   memberships: [{"company_id":"finer-teste","role":"viewer"}]
>                finer-teste SIM · overcel NAO · total 1              OK
>
> TESTE 1        GET finer-teste/financial-data   -> 200              OK
>                debug.fonte: integracao-nao-configurada | 58 bytes
>
> TESTE 2        GET overcel/financial-data       -> 403 FORBIDDEN    OK
>                corpo: {"error":true,"code":"FORBIDDEN",
>                        "message":"Sem acesso a este recurso."}
> ```
>
> ## TESTE 3 — o `audit_log`, corrido no SQL Editor
>
> ```
> 3.C  total_linhas          = 1        delta_exatamente_1 = true
>      company_id_null       = true     action_ok          = true
>      month_key_null        = true     requested_overcel  = true
>      decision_ok           = true     reason_ok          = true
>      capability_ok         = true
>
> 3.D  parece_credencial     = false
>      parece_url            = false
>      parece_financeiro     = false
>      chaves_metadata       = capability, decision, reason, requestedCompanyId
>
> 3.E  memberships           = 1        empresas = ["finer-teste"]
> ```
>
> ## O que cada metade prova — e porque as três eram precisas
>
> | | |
> |---|---|
> | **A pré-condição** | a conta tem **uma** membership e **não** é na Overcel. Sem isto o `403` seguinte não provaria nada: uma conta sem acesso a coisa nenhuma também daria `403`. É o passo 3 do runbook a fazer o seu trabalho |
> | **`200` na Finer Teste** | o servidor **decide**, não recusa tudo. E `integracao-nao-configurada` é a ausência **declarada** — a Finer Teste é o caso de controlo, e *avaria ≠ vazio* até aqui |
> | **`403` na Overcel** | **a prova que faltava desde 30/08.** Não é um duplo nem um teste unitário: é o BFF de Production, com um token real verificado contra o JWKS e as memberships relidas do lado do servidor. Um utilizador que só pertence a B **não alcança** A |
> | **O corpo da recusa** | `FORBIDDEN` e mais nada — não diz se a empresa existe, não diz o motivo |
> | **`delta = 1`** | uma recusa, um registo. Sem duplicação, e sem a linha se perder — que era o R-H, e é a correção que este teste também verificou |
> | **`company_id = NULL` + `requestedCompanyId = overcel`** | o registo distingue *"a empresa a que este registo pertence"* de *"a empresa que foi pedida"*. Numa recusa só a segunda existe |
> | **`reason = sem_membership`** | e não `membership_insuficiente`, que seria papel a menos numa empresa a que se pertence. A recusa é pela razão certa |
> | **3.D tudo `false`** | o registo forense não é um sítio onde vazam segredos: sem token, sem palavra-passe, sem `GAS_URL`, sem números da Overcel. Quatro chaves e mais nada |
>
> `401` teria sido **falha**, não sucesso: significaria token inválido e responderia a
> outra pergunta. Veio `403` — o servidor a dizer *"sei quem és e não podes"*.
>
> ## Estado do sistema depois do teste
>
> - nenhuma membership existente alterada — `overcel` e `finer-teste` intactas;
> - nenhuma configuração remota tocada além da conta e da membership autorizadas;
> - BFF de Production intacto (`74a1e0b`), sem deploy;
> - **E3 continua OFF** (`VITE_PROTECTED_DATA_TRANSPORT` vazio);
> - nenhum segredo residual. O ficheiro `~/.finer-smoke.json` vive **fora** do repositório
>   e deve ser apagado: `Remove-Item $HOME\.finer-smoke.json`.
>
> ---
>
> **O resto deste documento é o procedimento**, e fica como está: é o que se repete durante
> o rollout de E3 e outra vez em E4.
>
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

```
audit_log(id bigserial, company_id text, actor_user_id uuid, action text,
          month_key text, occurred_at timestamptz, metadata jsonb)
```

O `user_id` da conta de smoke, confirmado pelo Igor a 31/08/2026:

```
a1a84e5d-99cf-4612-a187-93c676492c42
```

### 3.A — BASELINE · correr **ANTES** dos testes 1 e 2

```sql
select count(*) as baseline_total
from public.audit_log
where actor_user_id = 'a1a84e5d-99cf-4612-a187-93c676492c42';
```

**Esperado: `0`.** A conta é nova e nunca foi usada. Se não for `0`, anotar o número — o
delta é o que conta, não o total.

> **O TESTE 1 não escreve linha nenhuma.** `protect.js` só audita o caminho da **recusa**
> (`:286`). Um `200` na Finer Teste não produz auditoria. Portanto o delta vem todo do
> TESTE 2, e tem de ser exatamente **1**.

### 3.B — ESPERAR

**Dois minutos sem tráfego nenhum** antes de consultar. Não é superstição: foi assim que
R-H foi apanhado — sob tráfego o registo funcionava, e falhava justamente na sondagem
isolada, porque a instância serverless congelava com a escrita ainda pendente. Está
corrigido (`protect.js` **espera** pela escrita, deixou de ser `void`), e é essa correção
que se está a verificar.

### 3.C — O VEREDITO, numa consulta

Todas as colunas têm de vir `true`, e `chaves_metadata` tem de ser exatamente
`{capability,decision,reason,requestedCompanyId}`.

```sql
with alvo as (
  select *
  from public.audit_log
  where actor_user_id = 'a1a84e5d-99cf-4612-a187-93c676492c42'
),
ultima as (
  select * from alvo order by occurred_at desc limit 1
)
select
  (select count(*) from alvo) = 1                                    as delta_exatamente_1,
  (select company_id is null                       from ultima)      as company_id_null,
  (select action = 'access.denied'                 from ultima)      as action_ok,
  (select month_key is null                        from ultima)      as month_key_null,
  (select metadata->>'requestedCompanyId' = 'overcel'        from ultima) as requested_overcel,
  (select metadata->>'decision'   = 'forbidden'              from ultima) as decision_ok,
  (select metadata->>'reason'     = 'sem_membership'         from ultima) as reason_ok,
  (select metadata->>'capability' = 'read_financial_data'    from ultima) as capability_ok,
  (select array(select jsonb_object_keys(metadata) order by 1) from ultima) as chaves_metadata;
```

**`reason` tem de ser `sem_membership` e não `membership_insuficiente`.** O segundo seria
papel a menos numa empresa a que se pertence — outra pergunta, outra resposta.

### 3.D — QUE NÃO HÁ LÁ NADA QUE NÃO DEVA ESTAR

```sql
select
  id,
  metadata::text                                                   as metadata_completo,
  length(metadata::text)                                           as tamanho,
  metadata::text ~* '(token|bearer|password|secret|service_role|apikey|eyJ|sb_|https?://)'
                                                                   as parece_credencial_ou_url,
  metadata::text ~ '[0-9]{4,}[.,][0-9]{2}'                         as parece_valor_financeiro
from public.audit_log
where actor_user_id = 'a1a84e5d-99cf-4612-a187-93c676492c42'
order by occurred_at desc;
```

| Coluna | Esperado |
|---|---|
| `parece_credencial_ou_url` | **`false`** — sem JWT, sem palavra-passe, sem `service_role`, sem `GAS_URL` |
| `parece_valor_financeiro` | **`false`** — nenhum número da Overcel |
| `metadata_completo` | as quatro chaves e mais nada. É curto de propósito — o `requestedCompanyId` é truncado a 64 caracteres (`protect.js:74`) |

### 3.E — E QUE NADA MAIS FOI TOCADO

```sql
-- a conta de smoke continua com UMA membership, em finer-teste
select company_id, role
from public.memberships
where user_id = 'a1a84e5d-99cf-4612-a187-93c676492c42';

-- e o total de memberships do sistema não mudou por causa deste teste
select company_id, count(*) as membros
from public.memberships
group by company_id
order by company_id;
```

A primeira tem de devolver **uma** linha: `finer-teste | viewer`. A segunda é o retrato de
controlo — a Overcel tem de ter **exatamente** os membros que já tinha.

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
