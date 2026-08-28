# AÇÃO DO UTILIZADOR — o que só o Igor pode fazer

> ## ⚠️ ESTADO REAL — 27/08/2026
>
> Este documento foi escrito **antes** de existir um projeto Supabase. Já existe, e
> grande parte do que ele pede está feito. O que continua verdadeiro é a arquitetura;
> o que mudou são os passos.
>
> | | |
> |---|---|
> | Projeto Supabase | ✅ criado — `finer-one`, ref `bysqekhcyrvtiejcupoa`, região **us-west-2** |
> | Esquema | ✅ 5 tabelas, RLS, 7 políticas, trigger — `001` + `002_grants` |
> | Autenticação | ✅ Email/password; signup público **desligado**; confirm email desligado |
> | Utilizador, profile, Overcel, membership owner | ✅ criados e verificados |
> | Segunda empresa (`finer-teste`, viewer) | ✅ criada — multiempresa validada |
> | SDK `@supabase/supabase-js` | ✅ **já instalado** |
> | Login real local | ✅ validado ponta a ponta, com logout e zero resíduo |
> | Formato das chaves | ⚠️ o projeto usa as **novas** `sb_publishable_` / `sb_secret_`, não as JWT legadas |
> | `SUPABASE_SERVICE_ROLE_KEY` no Vercel | ❌ **por configurar** — é o que falta |
> | BFF publicado | ❌ **não** |
>
> Ver `docs/BFF_PRE_DEPLOY_REPORT.md` para o estado do proxy.


Tudo o que se segue exige criar contas, colar credenciais ou configurar serviços
externos. **Os passos 1 a 7 estão FEITOS** (ver o bloco de estado acima). O que resta é
o passo 8 — a `service_role` no Vercel — e o deploy do BFF.

> ## ⚠️ REGRA DE SEGREDOS
>
> **NUNCA colar no chat, num commit ou num ficheiro versionado:**
> - `SUPABASE_SERVICE_ROLE_KEY`
> - a palavra-passe da base de dados
> - o URL do Web App do Apps Script
>
> **Pode colar sem risco** (são públicos por desenho):
> - `VITE_SUPABASE_URL` (ex.: `https://abcdefghij.supabase.co`)
> - `VITE_SUPABASE_ANON_KEY` — é ela que as políticas de RLS esperam ver e não concede
>   nada por si.
>
> Se um segredo for colado por engano: **rodá-lo** no painel, não apagar a mensagem.
> Apagar não o desfaz.

---

## Passo 1 — Criar o projeto Supabase

1. https://supabase.com → **Sign in with GitHub**
2. **New project**
   - Name: `finer-one`
   - Database password: gerar e guardar num gestor de palavras-passe (**não** no repositório)
   - Region: **South America (São Paulo)** — a Overcel é brasileira; a latência conta
   - Plan: **Free** chega para o MVP e o piloto
3. Esperar ~2 minutos.

## Passo 2 — Recolher as credenciais

**Project Settings → API**

| Onde vai | Nome | Público? |
|---|---|---|
| `.env` do frontend | `VITE_SUPABASE_URL` = *Project URL* | ✅ vai no bundle |
| `.env.local` do frontend | `VITE_SUPABASE_ANON_KEY` = a **publishable** `sb_publishable_…` | ✅ vai no bundle |
| **Vercel, env do servidor** | `SUPABASE_SERVICE_ROLE_KEY` = *service_role* | ❌ **SEGREDO** |

> A `service_role` **ignora a RLS**. No browser seria acesso total à base de dados de
> todas as empresas. Só em `process.env` da função serverless. Nunca `VITE_*`.

## Passo 3 — Criar o esquema

**SQL Editor → New query** → colar `docs/sql/001_saas_foundation.sql` → **Run**.

Verificar: **Table Editor** mostra `profiles`, `companies`, `memberships`,
`company_coverage`, `audit_log` — todas com o cadeado de **RLS enabled**.

## Passo 4 — Configurar a autenticação

**Authentication → Providers**
- **Email**: ligado. Desligar *Confirm email* enquanto for só o piloto interno.
- **Google / Microsoft**: deixar para depois. Não bloqueiam nada.

**Authentication → URL Configuration**
- Site URL: `https://igororlandi999.github.io/finer-one/`
- Redirect URLs: acrescentar também `http://localhost:5173/`

## Passo 5 — Criar a conta do Igor

**Authentication → Users → Add user**
- Email: o seu
- Password: uma sua
- ✅ *Auto Confirm User*

**Copiar o UUID** que aparece na lista. É preciso no passo seguinte e **não é segredo**.

## Passo 6 — Semear a Overcel

**SQL Editor**, substituindo os dois marcadores:

```sql
insert into public.companies (id, name, currency, locale, timezone, plan)
values ('overcel', 'Overcel', 'BRL', 'pt-BR', 'America/Sao_Paulo', 'plus');

insert into public.memberships (user_id, company_id, role)
values ('COLAR_AQUI_O_UUID_DO_PASSO_5', 'overcel', 'owner');
```

E, **depois de correr `docs/sql/003_company_integration.sql`**, a integração:

```sql
insert into public.company_integration (company_id, config)
values ('overcel', '{"provider":"gas","envKey":"GAS_URL"}'::jsonb)
on conflict (company_id) do update set config = excluded.config;
```

> ⚠️ **Não há nenhum URL para colar aqui.** A versão anterior deste passo mandava pôr o
> `gasUrl` em `companies.integration` — e essa coluna é legível por **qualquer membro**
> da empresa a partir do browser (política `companies_select_member`). Como o Web App do
> Apps Script é `ANYONE_ANONYMOUS`, isso equivalia a entregar a fonte financeira a todos
> os membros, `viewer` incluído.
>
> A tabela guarda agora uma **referência**: "esta empresa lê por Apps Script, e o
> endereço está na variável `GAS_URL`". O URL real continua onde já estava — Secret no
> Vercel — e não passa por aqui, nem pelo chat, nem por um commit. O `check`
> `company_integration_sem_segredos` recusa a escrita se alguém tentar.
>
> `finer-teste` **não** leva linha: é o caso de controlo, e tem de continuar a responder
> `data: []` com `fonte: integracao-nao-configurada`.

## Passo 7 — Instalar o SDK e configurar o frontend ✅ FEITO

`@supabase/supabase-js` está em `package.json` (`^2.112.4`) desde 27/08. O comando
abaixo já não é preciso; fica pelo registo.

```bash
npm i @supabase/supabase-js   # já executado
```

> ⚠️ **Uma correção que este passo exigiu e o documento não previa.**
> `supabaseAuthAdapter.js` importava o SDK com o especificador numa VARIÁVEL e
> `@vite-ignore` — desenho correto enquanto o pacote não existia. Instalado o pacote,
> o browser passou a receber o nome cru e o import rebentava; o `catch` de
> `authAdapters.js` engolia o erro e a aplicação corria **sem autenticação nenhuma**.
> A frase "este ficheiro passa a funcionar sem uma linha de alteração" era falsa.
> Ver `src/auth/providerAvariadoNaoAbre.test.js`.

`.env` (já em `.gitignore`):

```
VITE_API_BASE_URL=https://finer-one-proxy.vercel.app/api
VITE_SUPABASE_URL=https://<o-seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<a anon key>
VITE_AUTH_MODE=supabase
```

`supabaseAuthAdapter.js` já está escrito e passa a funcionar **sem uma linha de
alteração** — o import é dinâmico de propósito.

## Passo 8 — Configurar o BFF na Vercel

**Vercel → finer-one-proxy → Settings → Environment Variables**

| Variável | Valor | Nota |
|---|---|---|
| `SUPABASE_URL` | o Project URL | |
| `SUPABASE_ANON_KEY` | a anon key | usada só para verificar tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | a service_role | 🔒 **SEGREDO** |
| `ALLOWED_ORIGINS` | `https://igororlandi999.github.io,http://localhost:5173` | lista, sem `*` |
| `GAS_URL` | (já existe) | mantém `/api/pedidos/vendas` a funcionar |

Depois, `vercel deploy` a partir de `C:\Users\User\Documents\VS Code\finer-one-proxy`.

> ⚠️ **`finer-one-proxy` não é um repositório git.** Não há deploy automático: o deploy
> é sempre manual. Vale a pena `git init` + repositório privado antes de o pôr a servir
> escritas financeiras — hoje, o único sítio onde este código existe é este disco.

## Passo 9 — Ligar a persistência da cobertura ✅ CÓDIGO FEITO, FALTA CONFIGURAR

**Este passo está desatualizado.** As funções não estão por implementar:
`lib/coveragePersistence.js` traz `createSupabaseCoverageStore` completo, com upsert por
`on_conflict`, e `resolveCoverageStoreFromEnv` a escolher a loja a partir do ambiente.

O que falta é **configuração**, não código:

```js
resolveCoverageStoreFromEnv(env)
  → env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY  ? loja real
                                                       : createUnavailableCoverageStore()
```

Sem as duas variáveis, o endpoint devolve **503 "Não foi possível guardar"** — que é a
verdade, e não um 200 falso.

> ⚠️ **Pôr a `service_role` no Vercel LIGA a escrita de cobertura da Overcel.** Se quiser
> separar os dois momentos, publique primeiro **sem** ela: a autenticação só precisa de
> `SUPABASE_URL` + `SUPABASE_ANON_KEY`.

---

## Decisões que ficam para si

| Decisão | Recomendação | Porquê |
|---|---|---|
| Região | São Paulo | latência para a Overcel |
| Confirmação de email | desligada no piloto | evita fricção sem risco relevante entre utilizadores conhecidos |
| `git init` no proxy | **fazer** | é o único sítio onde esse código existe |
| Domínio próprio | depois | permite CSP por cabeçalho e cookies, mas não bloqueia nada |
| Plano Supabase | Free | o Pro justifica-se com backups diários, no piloto externo |
