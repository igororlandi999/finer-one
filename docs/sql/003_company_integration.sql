-- docs/sql/003_company_integration.sql
-- INTEGRAÇÃO POR EMPRESA — a tabela que o browser NUNCA lê.
--
-- ═══════════════════════════════════════════════════════════════════════════════════
-- AINDA NÃO EXECUTADO. Requer autorização explícita antes de correr no projeto
-- `finer-one` (ref bysqekhcyrvtiejcupoa). É IDEMPOTENTE.
--
-- ─── O DEFEITO QUE ISTO FECHA ──────────────────────────────────────────────────────
-- O `001_saas_foundation.sql` já o diz, por extenso, em cima da política
-- `companies_select_member`:
--
--     "esta política deixa um membro ler a linha INTEIRA, incluindo `integration`."
--
-- É o risco 7 de docs/THREAT_MODEL_MULTIEMPRESA.md, e a mitigação estava no plano.
-- Este ficheiro é essa mitigação.
--
-- Enquanto a configuração da integração vivesse em `companies.integration`, qualquer
-- MEMBRO — incluindo um `viewer`, que por desenho não pode escrever nada — podia ler o
-- URL do Web App do Apps Script diretamente da base de dados, com a chave `anon`, a
-- partir do browser. Esse Web App está publicado como ANYONE_ANONYMOUS: quem tem o URL
-- tem os dados, sem token e sem empresa. Ler a configuração era, na prática, receber
-- uma cópia permanente da fonte financeira da empresa.
--
-- Por isso `companies.integration` está `{}` em produção, e por isso as leituras
-- protegidas respondem hoje `{"data": [], "debug": {"fonte": "integracao-nao-configurada"}}`.
-- Não é uma avaria: é o sistema a recusar-se a servir dados por um caminho inseguro.
--
-- ─── A DECISÃO: A BASE DE DADOS GUARDA REFERÊNCIAS, NÃO SEGREDOS ───────────────────
-- Esta tabela NÃO contém o URL do Apps Script. Contém uma declaração:
--
--     { "provider": "gas", "envKey": "GAS_URL" }
--
-- "esta empresa lê por Apps Script, e o endereço está na variável de ambiente GAS_URL".
-- O valor real continua a viver só no Vercel, como Secret, exatamente onde já vivia.
--
-- Isto compra três coisas de uma vez:
--
--   1. não se duplica um segredo (duas cópias divergem, e rodar uma esquece a outra);
--   2. um dump desta tabela não é uma fuga — é uma lista de nomes de variáveis;
--   3. rodar o URL do Web App passa a ser uma alteração no Vercel, e mais nada.
--
-- O custo é real e assume-se: uma empresa nova exige um deploy (nova variável de
-- ambiente), e não apenas uma linha de SQL. Enquanto as empresas se contarem pelos
-- dedos, é o compromisso certo. Quando deixarem de se contar, a saída é guardar aqui um
-- segredo CIFRADO — e a forma da tabela (`config jsonb`) já suporta isso sem migração.
--
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════
-- A TABELA
--
-- `company_id` é a chave primária, e não apenas um índice único: uma empresa tem UMA
-- integração. Duas linhas para a mesma empresa tornariam "de onde é que esta empresa
-- lê?" uma pergunta ambígua, e uma pergunta ambígua sobre a origem de dados financeiros
-- resolve-se sempre mal.
--
-- `on delete cascade`: apagada a empresa, a integração deixa de ter sujeito. Manter uma
-- integração órfã seria guardar a configuração de acesso a dados de uma empresa que já
-- não existe.
-- ═══════════════════════════════════════════════════════════════════════════════════

create table if not exists public.company_integration (
  company_id text        primary key references public.companies (id) on delete cascade,
  config     jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── O CHECK QUE FAZ DA POLÍTICA UMA REGRA ─────────────────────────────────────────
-- "a base de dados guarda referências, não segredos" é uma intenção enquanto for só uma
-- frase num comentário. Aqui passa a ser uma restrição: um INSERT que traga `gasUrl`,
-- um token ou uma chave é REJEITADO pelo PostgreSQL, venha de onde vier — incluindo do
-- SQL Editor, à pressa, com a melhor das intenções.
--
-- A lista espelha `CAMPOS_DE_INTEGRACAO_PROIBIDOS` em lib/companyIntegration.js. As
-- duas existem de propósito: esta apanha o que entra na TABELA, aquela apanha o que
-- entra pelo PEDIDO HTTP. São fronteiras diferentes e nenhuma cobre a outra.
--
-- `jsonb_exists_any(config, array[...])` é "o objeto tem ALGUMA destas chaves?". É a
-- forma de FUNÇÃO do operador `?|`, e usa-se a função de propósito: `?` é o marcador de
-- parâmetro de vários clientes SQL, e um `?|` dentro de uma definição de restrição já
-- partiu migrações em ferramentas que fazem essa substituição antes de enviar. A função
-- diz exatamente o mesmo e não tem essa aresta.

do $bloco$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_integration_config_e_objeto'
  ) then
    alter table public.company_integration
      add constraint company_integration_config_e_objeto
      check (jsonb_typeof(config) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'company_integration_sem_segredos'
  ) then
    alter table public.company_integration
      add constraint company_integration_sem_segredos
      check (not jsonb_exists_any(config, array[
        'gasUrl', 'gas_url', 'GAS_URL', 'url',
        'token', 'secret', 'password', 'apiKey', 'api_key',
        'serviceRoleKey', 'service_role_key', 'anonKey', 'anon_key',
        'blingClientId', 'blingClientSecret', 'blingRefreshToken',
        'webhookSecret', 'spreadsheetId'
      ]));
  end if;
end
$bloco$;

comment on table public.company_integration is
  'Integracao por empresa. SERVER-ONLY: sem grants para anon/authenticated e sem politicas de RLS. Guarda referencias declarativas ({provider, envKey}), nunca segredos.';

comment on column public.company_integration.config is
  'Declaracao da integracao. Ex.: {"provider":"gas","envKey":"GAS_URL"}. O valor real da variavel vive no Vercel.';

-- ─── `updated_at` ──────────────────────────────────────────────────────────────────
-- Mantido por trigger e não pela aplicação. Uma alteração feita à mão pelo SQL Editor
-- também tem de deixar rasto: se `updated_at` dependesse de o BFF se lembrar de o
-- escrever, a coluna mentiria exatamente nas alterações menos vigiadas.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists company_integration_touch on public.company_integration;
create trigger company_integration_touch
  before update on public.company_integration
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — ATIVA, E DELIBERADAMENTE SEM UMA ÚNICA POLÍTICA
--
-- Nas outras tabelas, ativar a RLS foi o primeiro passo para depois abrir o que era
-- preciso. Aqui é o passo TODO. `enable row level security` sem políticas nega tudo a
-- toda a gente. Não há política nenhuma para escrever porque não há ninguém, do lado do
-- browser, que deva ler isto:
--
--   owner  -> NÃO. Ser dono da empresa não é razão para receber o endereço da fonte.
--   member -> NÃO.
--   viewer -> NÃO.
--   anon   -> NÃO.
--
-- `service_role` passa por cima da RLS por desenho do PostgreSQL, e é o único caminho.
-- É o BFF, depois de verificar o token e a membership.
--
-- Se um dia alguém escrever aqui uma política de SELECT "só para o owner", o defeito
-- que este ficheiro fecha reabre — com a agravante de parecer restritivo.
-- ═══════════════════════════════════════════════════════════════════════════════════

alter table public.company_integration enable row level security;

-- Cinto e suspensórios: `force` faz a RLS aplicar-se também ao DONO da tabela. Sem
-- isto, uma consulta feita como `postgres` (por exemplo, do SQL Editor) ignora a RLS em
-- silêncio. Não muda nada para o `service_role`, que a contorna por privilégio.
alter table public.company_integration force row level security;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- PRIVILÉGIOS — E PORQUE O `revoke` NÃO É DECORATIVO
--
-- O 002 existiu porque faltavam GRANTs. Aqui o perigo é o SIMÉTRICO: o Supabase tem
-- `alter default privileges` no esquema `public` a conceder privilégios a `anon` e
-- `authenticated` em tabelas NOVAS. Uma tabela criada e deixada em paz nasce, portanto,
-- com SELECT concedido a quem quer que tenha a chave `anon`.
--
-- A RLS sem políticas já bastaria para devolver zero linhas. O `revoke` é a segunda
-- barreira, e é a que falha para o lado certo: recusa ANTES de a RLS ser avaliada, e
-- continua a recusar mesmo que alguém, um dia, escreva aqui uma política larga demais.
-- ═══════════════════════════════════════════════════════════════════════════════════

revoke all on public.company_integration from anon;
revoke all on public.company_integration from authenticated;
revoke all on public.company_integration from public;

grant select, insert, update, delete on public.company_integration to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════
-- E `companies.integration` PASSA A SER TERRA QUEIMADA
--
-- A coluna fica. Removê-la obrigaria a coordenar um deploy do BFF com a migração, e uma
-- coluna vazia não faz mal a ninguém. O que NÃO pode voltar a acontecer é alguém lá pôr
-- um segredo "só por agora" — porque essa coluna é legível por qualquer membro.
--
-- O check garante que não volta. É a mesma lista de cima, pela mesma razão, no sítio
-- onde o erro seria mais fácil de cometer e mais difícil de ver.
--
-- Nota: o `add constraint` valida as linhas EXISTENTES. Em produção, `integration` está
-- `{}` nas duas empresas, portanto passa. Se falhar, é porque há um segredo lá dentro —
-- e isso é a restrição a fazer exatamente o seu trabalho.
-- ═══════════════════════════════════════════════════════════════════════════════════

do $bloco$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'companies_integration_sem_segredos'
  ) then
    alter table public.companies
      add constraint companies_integration_sem_segredos
      check (not jsonb_exists_any(integration, array[
        'gasUrl', 'gas_url', 'GAS_URL', 'url',
        'token', 'secret', 'password', 'apiKey', 'api_key',
        'serviceRoleKey', 'service_role_key', 'anonKey', 'anon_key',
        'blingClientId', 'blingClientSecret', 'blingRefreshToken',
        'webhookSecret', 'spreadsheetId'
      ]));
  end if;
end
$bloco$;

comment on column public.companies.integration is
  'DESCONTINUADA. Legivel por qualquer membro (politica companies_select_member) e por isso incapaz de guardar configuracao de integracao. A integracao real vive em public.company_integration. Ver docs/sql/003_company_integration.sql.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- OS DADOS — NÃO ESTÃO AQUI
--
-- A linha da Overcel insere-se DEPOIS desta migração, num passo separado e autorizado à
-- parte. Fica aqui a forma, comentada, para que ninguém tenha de a adivinhar:
--
--   insert into public.company_integration (company_id, config)
--   values ('overcel', '{"provider":"gas","envKey":"GAS_URL"}'::jsonb)
--   on conflict (company_id) do update set config = excluded.config;
--
-- `finer-teste` NÃO leva linha. É o caso de controlo: uma empresa autorizada, sem
-- integração, tem de continuar a responder `data: []` com
-- `fonte: integracao-nao-configurada` — ausência declarada, e nunca um zero financeiro.
-- ═══════════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════════
-- E QUE O PostgREST SAIBA QUE A TABELA EXISTE
--
-- O PostgREST serve a partir de uma cache de esquema. O Supabase recarrega-a sozinho
-- depois de um DDL, mas nem sempre de imediato — e a janela em que ainda não recarregou
-- parece-se com "a tabela não existe" (PGRST205, HTTP 404). Como o BFF trata um 404
-- desta tabela como AVARIA e responde 503, essa janela seria uma indisponibilidade real
-- e confusa. Uma linha evita-a. Fica no FIM, depois de todo o DDL.
-- ═══════════════════════════════════════════════════════════════════════════════════

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (correr depois, e LER o resultado)
--
--   -- 1. RLS ativa, forçada, e SEM políticas:
--   select relrowsecurity, relforcerowsecurity from pg_class
--    where oid = 'public.company_integration'::regclass;                  -- t | t
--   select count(*) from pg_policies
--    where schemaname = 'public' and tablename = 'company_integration';   -- 0
--
--   -- 2. anon e authenticated sem UM ÚNICO privilégio:
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'company_integration'
--    order by grantee;                       -- só service_role (e o dono da tabela)
--
--   -- 3. o check recusa segredos (tem de FALHAR):
--   insert into public.company_integration (company_id, config)
--   values ('overcel', '{"gasUrl":"https://exemplo"}'::jsonb);
--
-- ─── ROLLBACK ──────────────────────────────────────────────────────────────────────
--   drop trigger if exists company_integration_touch on public.company_integration;
--   drop table if exists public.company_integration;
--   drop function if exists public.touch_updated_at();
--   alter table public.companies drop constraint if exists companies_integration_sem_segredos;
--
-- O `drop table` apaga a configuração da Overcel — que é uma linha de dez palavras,
-- reinserível de cor, e NÃO contém segredo nenhum. Nada de financeiro se perde: esta
-- tabela não guarda números, guarda o nome de uma variável de ambiente.
--
-- Depois do rollback, as leituras protegidas voltam a `integracao-nao-configurada`. O
-- legado anónimo `GET /api/pedidos/vendas` não é tocado por nada disto e continua a
-- servir o frontend atual.
-- ═══════════════════════════════════════════════════════════════════════════════════
