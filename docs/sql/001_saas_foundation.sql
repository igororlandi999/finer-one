-- docs/sql/001_saas_foundation.sql
-- FUNDAÇÃO MULTIEMPRESA DA FINER ONE — utilizadores, empresas, memberships, auditoria.
--
-- ═══════════════════════════════════════════════════════════════════════════════════
-- EXECUTADO em 2026-08-27 no projeto Supabase `finer-one` (ref bysqekhcyrvtiejcupoa).
-- É IDEMPOTENTE: `create ... if not exists`, `create or replace`, `drop policy if
-- exists` e `grant` podem correr de novo sem estragar nada.
--
-- ─── A SECÇÃO DE GRANTS FOI ACRESCENTADA DEPOIS, E POR UMA RAZÃO ───────────────────
-- Na primeira execução este ficheiro ativou a RLS e escreveu sete políticas — e nenhuma
-- delas era alcançável. Faltavam os GRANTs de tabela, e o PostgreSQL verifica o GRANT
-- ANTES da RLS. Ver a secção PRIVILÉGIOS, no fim, e docs/sql/002_grants.sql, que é o
-- incremento aplicado ao projeto que já existia.
--
-- Um ambiente NOVO precisa só deste ficheiro. O 002 é história, não um passo obrigatório.
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- ─── DUAS BARREIRAS INDEPENDENTES ──────────────────────────────────────────────────
-- 1. RLS: protege o acesso DIRETO do browser à base de dados (chave `anon`). Sem ela,
--    qualquer cliente autenticado poderia ler a tabela `companies` inteira.
-- 2. BFF: protege os dados FINANCEIROS, que não vivem aqui. A RLS não os alcança —
--    estão no Apps Script/Drive — e é por isso que `authorizationCore.js` existe.
--
-- Nenhuma substitui a outra. Quem desligar a RLS confiando no BFF abre a base de dados;
-- quem confiar só na RLS deixa os snapshots financeiros sem proteção nenhuma.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- UTILIZADORES
--
-- ─── PORQUE NÃO HÁ TABELA `users` ─────────────────────────────────────────────────
-- O Supabase já tem `auth.users`, gerida por ele: password hash, confirmação de email,
-- OAuth, rotação de tokens. Criar uma tabela `public.users` paralela seria duplicar a
-- identidade em dois sítios que podem divergir — e a pergunta "qual das duas é o
-- utilizador?" não tem boa resposta.
--
-- O que se cria é um PERFIL, ligado por chave estrangeira, para o que é NOSSO (nome de
-- apresentação). A identidade continua a ser dele.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- EMPRESAS
--
-- `id` é TEXTO e não uuid, de propósito: é um slug ("overcel") que aparece no caminho
-- do URL (/api/companies/overcel/...), em registos e em conversas com o cliente. Um
-- uuid no URL é ilegível e não acrescenta segurança nenhuma — a segurança é a
-- membership, não a imprevisibilidade do id. A restrição de forma abaixo é a mesma
-- que `isValidCompanyId` impõe no núcleo de autorização.
--
-- `currency` e `locale` NÃO têm default. Um default de moeda é a diferença entre
-- apresentar 84.300 como reais ou como euros, e nenhum dos dois é seguro adivinhar.
-- São NOT NULL: uma empresa sem moeda não pode existir.
--
-- `integration` DESCONTINUADA. Guardava o que liga esta empresa à sua fonte de dados
-- financeiros. Não pode: a política `companies_select_member`, mais abaixo, devolve a
-- linha INTEIRA a qualquer membro — e "lido só pelo BFF" era uma intenção do lado da
-- aplicação, não uma garantia da base de dados. Qualquer membro podia ler a coluna
-- diretamente, do browser, com a chave `anon`.
--
-- A integração vive em `public.company_integration` (docs/sql/003), que tem RLS sem
-- políticas e nenhum GRANT de browser — e guarda uma referência, não o endereço.
-- A coluna fica vazia, com um check que recusa chaves de segredo.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.companies (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$'),
  name        text        not null,
  currency    char(3)     not null,
  locale      text        not null,
  timezone    text        not null default 'UTC',
  plan        text        not null default 'base',
  status      text        not null default 'ativa' check (status in ('ativa', 'suspensa', 'arquivada')),
  integration jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- MEMBERSHIPS — a tabela de autorização
--
-- Suporta 1 utilizador -> N empresas e 1 empresa -> N utilizadores, que é a definição
-- de multiempresa. A chave primária composta impede duas memberships do mesmo par:
-- duas linhas com papéis diferentes tornariam a pergunta "qual é o papel dele?"
-- ambígua, e uma pergunta de autorização ambígua resolve-se sempre mal.
--
-- Três papéis. A justificação de cada um está em docs/SAAS_AUTH_ARCHITECTURE.md §5 e a
-- tabela de capacidades vive em `authorizationCore.js` — no CÓDIGO, não aqui.
-- Duplicá-la em SQL criaria duas fontes de verdade para a mesma decisão.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.memberships (
  user_id     uuid  not null references auth.users (id)     on delete cascade,
  company_id  text  not null references public.companies (id) on delete cascade,
  role        text  not null check (role in ('owner', 'member', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (user_id, company_id)
);

create index if not exists memberships_company_idx on public.memberships (company_id);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- COBERTURA CONFIRMADA
--
-- A confirmação humana de que os documentos relevantes de despesas de um mês já estão
-- disponíveis. NÃO é fecho contabilístico, não valida a contabilidade e não afirma que
-- os valores estão corretos — ver docs/COBERTURA_CONFIRMADA_CONTRATO.md.
--
-- Uma linha por (empresa, fonte): confirmar de novo CORRIGE a anterior, e por isso a
-- escrita é um upsert. O histórico de quem confirmou o quê e quando vive em `audit_log`,
-- que é o sítio próprio para histórico — esta tabela guarda o ESTADO, não a narrativa.
--
-- `confirmed_by_role` guarda um PAPEL e nunca uma pessoa: mantém-se a regra de o
-- documento de estado financeiro não conter PII. QUEM confirmou está no registo de
-- auditoria, que tem controlo de acesso próprio.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.company_coverage (
  company_id            text        not null references public.companies (id) on delete cascade,
  source                text        not null check (source in ('payables')),
  complete_through_month text       not null check (complete_through_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  confirmed_at          timestamptz not null,
  confirmed_by_role     text        not null default 'user',
  note                  text        check (char_length(note) <= 280),
  primary key (company_id, source)
);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- AUDITORIA
--
-- `actor_user_id` é NULLABLE por uma razão só: registar uma tentativa recusada sem
-- sessão. "Alguém sem token tentou a empresa X" é informação verdadeira e útil;
-- atribuí-la a um utilizador inventado não seria nem uma coisa nem outra.
--
-- NÃO tem chave estrangeira para `auth.users`: um registo de auditoria tem de
-- SOBREVIVER à eliminação da conta que o produziu. Com `on delete cascade`, apagar um
-- utilizador apagaria a prova do que ele fez, que é o oposto de um registo de auditoria.
--
-- `metadata` é jsonb com uma lista de PERMISSÃO aplicada em `auditLog.js`, no código.
-- O texto de notas escritas por pessoas NUNCA entra aqui — só o seu comprimento.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_log (
  id            bigserial primary key,
  company_id    text        references public.companies (id) on delete set null,
  actor_user_id uuid,
  action        text        not null,
  month_key     text        check (month_key is null or month_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  occurred_at   timestamptz not null,
  metadata      jsonb       not null default '{}'::jsonb
);

create index if not exists audit_log_company_time_idx on public.audit_log (company_id, occurred_at desc);
create index if not exists audit_log_actor_idx        on public.audit_log (actor_user_id, occurred_at desc);

-- ═══════════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
--
-- ─── A ORDEM IMPORTA ───────────────────────────────────────────────────────────────
-- `enable row level security` SEM políticas nega tudo. É por isso que se ativa primeiro
-- e se abre depois: se uma política falhar a ser criada, a tabela fica fechada e não
-- aberta. Falhar para o lado seguro não é um acaso — é a razão desta ordem.
--
-- ─── A FUNÇÃO AUXILIAR É `security definer` E ISSO É NECESSÁRIO ────────────────────
-- Uma política em `companies` que consultasse `memberships` acionaria a RLS de
-- `memberships`, que por sua vez... — recursão. `security definer` executa a consulta
-- com os privilégios do dono, quebrando o ciclo. O `search_path` é fixado por segurança:
-- sem isso, uma tabela `memberships` criada num esquema mais à frente no search_path do
-- chamador seria consultada em vez da verdadeira.
-- ═══════════════════════════════════════════════════════════════════════════════════

create or replace function public.is_member_of(target_company text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.company_id = target_company
  );
$$;

alter table public.profiles         enable row level security;
alter table public.companies        enable row level security;
alter table public.memberships      enable row level security;
alter table public.company_coverage enable row level security;
alter table public.audit_log        enable row level security;

-- ── PERFIS: cada um vê e edita o seu ────────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── E COMO É QUE UMA LINHA DE `profiles` PASSA A EXISTIR? ───────────────────────────
--
-- ─── UM DEFEITO REAL DESTE FICHEIRO, APANHADO NA REVISÃO DA FASE 14 ────────────────
-- Havia SELECT e UPDATE e mais nada. Com RLS ativa, "mais nada" significa que ninguém
-- podia inserir: nem o utilizador (sem política de INSERT) nem o Supabase (que não cria
-- perfis por si). Resultado: a tabela ficaria PERMANENTEMENTE VAZIA, `full_name` nunca
-- teria valor, e o `profiles_update_own` acima seria um UPDATE sobre zero linhas — que
-- não dá erro nenhum. Um perfil que nunca se cria e um UPDATE que nunca falha é
-- exatamente o tipo de defeito que sobrevive a uma demonstração.
--
-- ─── DUAS METADES, E AS DUAS SÃO NECESSÁRIAS ───────────────────────────────────────
-- 1. O TRIGGER cria o perfil no ato do registo, do lado do servidor. É o caminho
--    normal e é o que garante que TODA a conta tem perfil, incluindo as criadas pelo
--    painel do Supabase ou por OAuth, onde não há frontend nosso a correr.
--
--    `security definer` porque o trigger corre no contexto de quem faz o registo, que
--    nessa altura ainda não é ninguém. `on conflict do nothing` porque um registo
--    repetido não é um erro que deva impedir a criação da conta.
--
-- 2. A POLÍTICA de INSERT restrita a `id = auth.uid()` cobre o caso em que o perfil
--    falta (conta criada antes desta migração) e o próprio utilizador o cria. Não é
--    redundância: sem ela, uma conta antiga ficaria sem perfil para sempre.
--
-- O que a política NÃO permite é inserir um perfil com o id de OUTRA pessoa — é isso que
-- `with check (id = auth.uid())` impede, e é a única coisa que aqui teria consequência.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    -- O nome que o provider tenha dado. Nunca se inventa: sem nome, fica null e a UI
    -- mostra o email, como `userInitials` e o Sidebar já fazem.
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- ── MEMBERSHIPS: cada um vê as SUAS ─────────────────────────────────────────────────
--
-- Deliberadamente NÃO se permite ver as memberships dos colegas na mesma empresa. Seria
-- defensável (uma página de "equipa"), mas essa página ainda não existe, e uma política
-- mais aberta do que o produto precisa é uma superfície que ninguém está a vigiar.
-- Quando a página existir, a política alarga-se com uma condição explícita.
drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own on public.memberships
  for select using (user_id = auth.uid());

-- NENHUMA política de INSERT/UPDATE/DELETE em `memberships`.
-- Com RLS ativa, isso significa que NINGUÉM as pode alterar a partir do browser, nem o
-- owner. Conceder acesso a uma empresa é uma operação de servidor, feita pelo BFF com a
-- service_role depois de verificar a capacidade `manage_memberships`. É a decisão mais
-- restritiva possível e é a certa para a tabela que decide quem vê dinheiro de quem.

-- ── EMPRESAS: só as minhas, e só leitura ────────────────────────────────────────────
drop policy if exists companies_select_member on public.companies;
create policy companies_select_member on public.companies
  for select using (public.is_member_of(id));

-- ATENÇÃO: esta política deixa um membro ler a linha INTEIRA, incluindo `integration`.
-- Enquanto `integration` contivesse um URL de Web App ANYONE_ANONYMOUS, isso equivalia a
-- publicar a fonte de dados da empresa a todos os seus membros — um `viewer` incluído.
--
-- RESOLVIDO em docs/sql/003_company_integration.sql, e não como estava planeado. A
-- mitigação prevista era uma VIEW sem `integration`; fez-se uma TABELA separada
-- (`company_integration`) com RLS sem políticas e sem GRANTs de browser, porque uma VIEW
-- deixa a tabela original alcançável para quem lhe der um GRANT por engano. `integration`
-- ficou vazia e com um check que recusa chaves de segredo.
--
-- A política em si continua correta: o resto da linha — nome, moeda, locale, plano — é
-- exatamente o que um membro precisa de ver. Ver docs/THREAT_MODEL_MULTIEMPRESA.md,
-- riscos 7 e 7b.

-- ── COBERTURA: leitura por membros; escrita só pelo servidor ────────────────────────
drop policy if exists coverage_select_member on public.company_coverage;
create policy coverage_select_member on public.company_coverage
  for select using (public.is_member_of(company_id));

-- Sem políticas de escrita: a confirmação passa pelo BFF, que verifica a capacidade
-- `write_financial_state`. Uma política de INSERT aqui deixaria um `viewer` confirmar
-- coberturas diretamente contra a base de dados, contornando o papel por completo.

-- ── AUDITORIA: leitura só para owners; escrita só pelo servidor ─────────────────────
drop policy if exists audit_select_owner on public.audit_log;
create policy audit_select_owner on public.audit_log
  for select using (
    exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and m.company_id = audit_log.company_id and m.role = 'owner'
    )
  );

-- Sem política de INSERT. Um registo de auditoria que o próprio ator possa escrever não
-- é um registo de auditoria. Escreve-o o BFF, com a service_role.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PRIVILÉGIOS — a metade sem a qual tudo o que está acima é decorativo
--
-- ─── O DEFEITO QUE ESTA SECÇÃO CORRIGE ─────────────────────────────────────────────
-- Tudo o que vem antes — `enable row level security` e sete políticas — só é avaliado
-- DEPOIS de o PostgreSQL confirmar que o role tem privilégio de tabela. Sem GRANT, a
-- resposta é `42501 permission denied` e a política nunca é consultada.
--
-- No projeto real, as cinco tabelas nasceram com apenas REFERENCES, TRIGGER e TRUNCATE
-- para `anon`, `authenticated` e `service_role`: nenhum privilégio de DADOS para
-- ninguém. O sintoma teria sido cruel — o login funciona, a sessão é válida, e a
-- aplicação fica sem empresa nenhuma, porque `carregarEmpresas()` recebe erro e devolve
-- `[]` por desenho. Um ecrã vazio indistinguível de "esta conta não tem empresas".
--
-- ─── PORQUE `anon` NÃO RECEBE NADA ─────────────────────────────────────────────────
-- Sem GRANT, um anónimo é recusado antes de a RLS opinar. É uma barreira a mais e mais
-- cedo, e não substitui a RLS: protege o caso em que uma política futura seja escrita
-- larga de mais por engano. O `scripts/supabase-check.mjs` distingue as duas recusas de
-- propósito — uma recusa por GRANT não prova nada sobre as políticas.
-- ═══════════════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated, service_role;

-- ── authenticated: lê o que as políticas já filtram; escreve só no próprio perfil ────
-- Repare-se no que NÃO está aqui: nenhum INSERT/UPDATE/DELETE em `memberships`,
-- `companies`, `company_coverage` ou `audit_log`. Conceder acesso a uma empresa,
-- confirmar cobertura e escrever auditoria são operações de SERVIDOR.
grant select, insert, update on public.profiles         to authenticated;
grant select                 on public.companies        to authenticated;
grant select                 on public.memberships      to authenticated;
grant select                 on public.company_coverage to authenticated;
grant select                 on public.audit_log        to authenticated;

-- ── service_role: é o BFF. Ignora a RLS por desenho e é quem escreve ────────────────
grant select, insert, update, delete on public.profiles         to service_role;
grant select, insert, update, delete on public.companies        to service_role;
grant select, insert, update, delete on public.memberships      to service_role;
grant select, insert, update, delete on public.company_coverage to service_role;
grant select, insert, update, delete on public.audit_log        to service_role;
-- `audit_log.id` é bigserial: sem USAGE na sequência, o INSERT falha.
grant usage, select on sequence public.audit_log_id_seq to service_role;

grant execute on function public.is_member_of(text) to authenticated, service_role;

-- ── anon: NADA. Nem um select. É deliberado e não é esquecimento. ───────────────────

-- ═══════════════════════════════════════════════════════════════════════════════════
-- SEMENTE — a Overcel
--
-- COMENTADA de propósito. Executá-la exige o `auth.users.id` real do utilizador, que só
-- existe depois de a conta ser criada no painel do Supabase.
-- Ver docs/ACOES_DO_UTILIZADOR_SUPABASE.md, passo 6.
--
-- ─── O `gasUrl` DEIXOU DE ENTRAR AQUI ──────────────────────────────────────────────
-- Esta semente escrevia `integration = {gasUrl: ...}`. Não pode: a política
-- `companies_select_member` deixa QUALQUER membro ler a linha inteira, e o Web App do
-- Apps Script é ANYONE_ANONYMOUS — quem tem o URL tem os dados, sem token. Era publicar
-- a fonte financeira a todos os membros da empresa, um `viewer` incluído.
--
-- A integração passou para `public.company_integration` (migração 003), que tem RLS sem
-- políticas e nenhum GRANT de browser, e guarda uma REFERÊNCIA e não o endereço. O 003
-- acrescenta ainda um check a `companies.integration` que recusa chaves de segredo, para
-- que este atalho não volte a ser possível nem à mão.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- insert into public.companies (id, name, currency, locale, timezone, plan)
-- values ('overcel', 'Overcel', 'BRL', 'pt-BR', 'America/Sao_Paulo', 'plus');
--
-- insert into public.memberships (user_id, company_id, role)
-- values ('<UUID DO UTILIZADOR>', 'overcel', 'owner');
--
-- -- e, depois de docs/sql/003_company_integration.sql:
-- insert into public.company_integration (company_id, config)
-- values ('overcel', '{"provider":"gas","envKey":"GAS_URL"}'::jsonb);
