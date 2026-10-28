-- =============================================================================
-- 019 · Endurecer o acesso: o banco decide, sem confiar no front
--
-- Quem chama a API direto (sem passar pelas telas) só tem a chave pública, que fica no
-- navegador de propósito. Quem barra é o RLS deste banco. Esta migração fecha o que sobrava:
--   1. pessoa DESATIVADA (perfis.ativo = false) perde todo o acesso — antes só valia para admin;
--   2. conta SEM VÍNCULO (criada pelo cadastro aberto, sem empresa/projeto) não lê nada:
--      nem catálogos, nem literatura, nem a lista de usuários;
--   3. a lista de usuários (nomes e e-mails) só mostra colegas de projeto/empresa;
--   4. o papel "anon" (sem login) perde qualquer permissão que tenha sobrado, inclusive nas
--      tabelas criadas direto no SQL Editor (ex.: prefixos_codigo) e nas que forem criadas depois.
-- No fim, três consultas de conferência (o SQL Editor mostra a última; rode cada uma se quiser).
--
-- O cadastro aberto fica LIGADO (o dashboard tem "Criar conta"): a conta nova não vê nada até o
-- administrador aprovar (migração 020). Ligue também "Confirm email", para a pessoa provar que o e-mail é dela.
-- =============================================================================

-- 1 e 2. usuário ativo e com vínculo -------------------------------------------------------------
create or replace function app.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select ativo from public.perfis where id = app.usuario_atual()), false)
$$;

-- papel num projeto: desativado não tem papel nenhum
create or replace function app.papel_no_projeto(p uuid)
returns text language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then 'editor'
        when not app.usuario_ativo() then null
        else (select max(m.papel)            -- 'editor' > 'leitor' em ordem alfabética
              from public.membros m
              join public.projetos pr on pr.id = p
              where m.usuario_id = app.usuario_atual()
                and (m.projeto_id = p or m.empresa_id = pr.empresa_id))
    end
$$;

create or replace function app.eh_editor()
returns boolean language sql stable security definer set search_path = public as $$
    select app.eh_admin() or (app.usuario_ativo() and exists (
        select 1 from public.membros where usuario_id = app.usuario_atual() and papel = 'editor'))
$$;

-- "logado" para as regras = ativo E (admin ou com algum vínculo). Uma conta criada pelo
-- cadastro aberto, sem vínculo, não lê catálogos, literatura nem histórico.
create or replace function app.logado()
returns boolean language sql stable security definer set search_path = public as $$
    select app.usuario_atual() is not null and (
        app.eh_admin()
        or (app.usuario_ativo() and exists (select 1 from public.membros where usuario_id = app.usuario_atual())))
$$;

-- 3. lista de usuários: a própria linha, o admin vê todos, e os colegas -------------------------
-- colega = alguém com vínculo num projeto (ou empresa) que eu também vejo
create or replace function app.colega(outro uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select app.logado() and exists (
        select 1 from public.membros ele
        where ele.usuario_id = outro
          and ((ele.projeto_id is not null and app.pode_ver(ele.projeto_id))
               or (ele.empresa_id is not null and exists (
                       select 1 from public.projetos p where p.empresa_id = ele.empresa_id and app.pode_ver(p.id)))))
$$;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select
    using (id = app.usuario_atual() or app.eh_admin() or app.colega(id));

grant execute on function app.usuario_ativo(), app.colega(uuid) to authenticated;

-- 4. sem login, nada -------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke usage on schema app from anon;
-- e nas tabelas que forem criadas depois (o Supabase dá tudo ao anon por padrão)
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

notify pgrst, 'reload schema';

-- =============================================================================
-- Conferência (só leitura)
-- =============================================================================
-- a) tabelas SEM RLS: deveria vir vazio. Se aparecer alguma, ela está aberta para qualquer logado.
select tablename as tabela_sem_rls from pg_tables where schemaname = 'public' and not rowsecurity;

-- b) o que o anon (sem login) ainda pode fazer: deveria vir vazio.
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';

-- c) contas: quem não tem vínculo nem é admin pode ter vindo do cadastro aberto.
--    Confira as "SEM VÍNCULO" e apague em Authentication -> Users as que você não conhece.
select u.email, u.created_at::date as criada_em, u.last_sign_in_at::date as ultimo_login,
       case when p.administrador then 'admin'
            when exists (select 1 from public.membros m where m.usuario_id = u.id) then 'membro'
            else 'SEM VÍNCULO' end as situacao,
       p.ativo
from auth.users u left join public.perfis p on p.id = u.id
order by situacao desc, u.created_at;
