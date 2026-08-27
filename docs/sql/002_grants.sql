-- docs/sql/002_grants.sql
-- GRANTS — a metade que faltava ao 001.
--
-- ═══════════════════════════════════════════════════════════════════════════════════
-- EXECUTADO em 2026-08-27 no projeto `finer-one` (SQL Editor). Resultado: sucesso.
--
-- ─── ESTE FICHEIRO É HISTÓRIA, NÃO UM PASSO ────────────────────────────────────────
-- Um ambiente NOVO não precisa dele: os mesmos GRANTs vivem agora na secção
-- PRIVILÉGIOS do `001_saas_foundation.sql`, para que nenhum ambiente volte a nascer com
-- políticas inalcançáveis. Este ficheiro fica como o registo do que foi aplicado ao
-- projeto que JÁ existia quando o defeito foi encontrado.
--
-- As duas cópias são idênticas de propósito e `grant` é idempotente: correr ambas não
-- faz mal. Se divergirem, o 001 é a verdade.
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- ─── O DEFEITO QUE ISTO CORRIGE ─────────────────────────────────────────────────────
-- O `001_saas_foundation.sql` ativa RLS e escreve sete políticas, e nada disso chega a
-- ser avaliado: o PostgreSQL verifica o GRANT de tabela ANTES da RLS. Sem SELECT
-- concedido, a resposta é `42501 permission denied` e a política nunca é consultada.
--
-- No projeto real, as cinco tabelas tinham apenas REFERENCES, TRIGGER e TRUNCATE para
-- `anon`, `authenticated` e `service_role` — ou seja, nenhum privilégio de DADOS para
-- ninguém. O sintoma seria cruel: o login funciona, a sessão é válida, e a aplicação
-- fica sem empresa nenhuma porque `carregarEmpresas()` recebe erro e devolve [] por
-- desenho. Um ecrã vazio que não se distingue de "esta conta não tem empresas".
--
-- ─── PORQUE `anon` NÃO RECEBE NADA ──────────────────────────────────────────────────
-- Sem GRANT, um anónimo é recusado antes de a RLS opinar. É uma barreira a mais, mais
-- cedo, e não substitui a RLS — protege o caso em que uma política futura seja escrita
-- larga de mais por engano.
grant usage on schema public to anon, authenticated, service_role;

-- ── authenticated: lê o que as políticas já filtram; escreve só no próprio perfil ────
-- Note-se o que NÃO está aqui: nenhum INSERT/UPDATE/DELETE em `memberships`,
-- `companies`, `company_coverage` ou `audit_log`. Conceder acesso a uma empresa,
-- confirmar cobertura e escrever auditoria são operações de servidor. Ver 001.
grant select, insert, update on public.profiles         to authenticated;
grant select                 on public.companies        to authenticated;
grant select                 on public.memberships      to authenticated;
grant select                 on public.company_coverage to authenticated;
grant select                 on public.audit_log        to authenticated;

-- ── service_role: é o BFF. Ignora RLS por desenho e é quem escreve ──────────────────
grant select, insert, update, delete on public.profiles         to service_role;
grant select, insert, update, delete on public.companies        to service_role;
grant select, insert, update, delete on public.memberships      to service_role;
grant select, insert, update, delete on public.company_coverage to service_role;
grant select, insert, update, delete on public.audit_log        to service_role;
-- `audit_log.id` é bigserial: sem USAGE na sequência, o INSERT falha.
grant usage, select on sequence public.audit_log_id_seq to service_role;

grant execute on function public.is_member_of(text) to authenticated, service_role;
