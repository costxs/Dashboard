-- =============================================================================
-- 022 — Diagrama ternário (água / óleo / tensoativo-cotensoativo) dentro do dashboard
--
-- O aplicativo "Diagrama Ternário LCPETRO" (página HTML única) guardava os dados no navegador ou numa API
-- própria (FastAPI + PostgreSQL). Aqui ele passa a salvar no MESMO Supabase do sistema:
--   ternario_projetos  — um projeto por estudo (ex.: "Mestrado <nome>"), com vários diagramas
--   ternario_diagramas — cada diagrama: vértices, séries de titulação, pontos avulsos e opções (jsonb `dados`,
--                        no formato do próprio aplicativo)
-- Quem usa: só quem o administrador liberar no módulo 'ternario' (tabela modulos_acesso):
--   editor = cria, altera e exclui; leitor = só vê. Administrador vê e altera tudo.
-- O espaço é COMPARTILHADO entre quem tem acesso (como no aplicativo original: o orientador vê os projetos
-- dos orientandos). Excluir um diagrama ou projeto fica registrado no histórico (dá para recuperar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Acesso por módulo (serve para outros aplicativos do laboratório no futuro)
-- -----------------------------------------------------------------------------
create table if not exists public.modulos_acesso (
    usuario_id   uuid not null references public.perfis(id) on delete cascade,
    modulo       text not null check (modulo in ('ternario')),
    papel        text not null check (papel in ('leitor', 'editor')),
    concedido_por uuid default auth.uid() references public.perfis(id),
    concedido_em timestamptz not null default now(),
    primary key (usuario_id, modulo)
);
comment on table public.modulos_acesso is 'Quem usa cada aplicativo do dashboard que não depende de projeto/empresa (ex.: diagrama ternário).';

create or replace function app.papel_no_modulo(p_modulo text)
returns text language sql stable security definer set search_path = public as $$
    select case when app.eh_admin() then 'editor'
                else (select m.papel from public.modulos_acesso m
                       join public.perfis pf on pf.id = m.usuario_id and pf.ativo
                      where m.usuario_id = app.usuario_atual() and m.modulo = p_modulo) end
$$;
create or replace function public.pode_ver_modulo(p_modulo text)
returns boolean language sql stable security invoker set search_path = public as $$
    select app.papel_no_modulo(p_modulo) is not null
$$;
create or replace function public.pode_editar_modulo(p_modulo text)
returns boolean language sql stable security invoker set search_path = public as $$
    select app.papel_no_modulo(p_modulo) = 'editor'
$$;

-- o administrador libera pelo e-mail (a pessoa precisa ter entrado no sistema uma vez)
create or replace function public.conceder_modulo(p_email text, p_modulo text, p_papel text default 'editor')
returns text language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
    if not app.eh_admin() then raise exception 'Só o administrador libera acesso' using errcode = '42501'; end if;
    select id into v from public.perfis where lower(email) = lower(btrim(p_email));
    if v is null then raise exception 'Nenhum usuário com o e-mail %: a pessoa precisa entrar no sistema uma vez', p_email using errcode = '23503'; end if;
    insert into public.modulos_acesso (usuario_id, modulo, papel) values (v, p_modulo, p_papel)
    on conflict (usuario_id, modulo) do update set papel = excluded.papel, concedido_em = now(), concedido_por = auth.uid();
    return p_email || ': ' || p_papel || ' em ' || p_modulo;
end $$;
create or replace function public.revogar_modulo(p_email text, p_modulo text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not app.eh_admin() then raise exception 'Só o administrador retira acesso' using errcode = '42501'; end if;
    delete from public.modulos_acesso m using public.perfis pf
     where pf.id = m.usuario_id and lower(pf.email) = lower(btrim(p_email)) and m.modulo = p_modulo;
end $$;

alter table public.modulos_acesso enable row level security;
drop policy if exists modulos_acesso_ler on public.modulos_acesso;
create policy modulos_acesso_ler on public.modulos_acesso for select
    using (app.eh_admin() or usuario_id = app.usuario_atual());
drop policy if exists modulos_acesso_admin on public.modulos_acesso;
create policy modulos_acesso_admin on public.modulos_acesso for all
    using (app.eh_admin()) with check (app.eh_admin());

-- -----------------------------------------------------------------------------
-- 2. Projetos e diagramas do ternário
-- -----------------------------------------------------------------------------
create table if not exists public.ternario_projetos (
    id            bigint generated always as identity primary key,
    nome          text not null default 'Projeto' check (length(nome) <= 200),
    posicao       integer not null default 0,
    criado_por    uuid default auth.uid() references public.perfis(id),
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create table if not exists public.ternario_diagramas (
    id            bigint generated always as identity primary key,
    projeto_id    bigint not null references public.ternario_projetos(id) on delete cascade,
    nome          text not null default 'Diagrama' check (length(nome) <= 200),
    posicao       integer not null default 0,
    dados         jsonb not null default '{}'::jsonb,
    criado_por    uuid default auth.uid() references public.perfis(id),
    atualizado_por uuid default auth.uid() references public.perfis(id),
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);
create index if not exists ternario_diagramas_projeto_idx on public.ternario_diagramas (projeto_id, posicao);
comment on column public.ternario_diagramas.dados is
    'Formato do aplicativo: {vertices:{top,left,right}, series:[{name,tube,sc,fixed,fixedMass,init,rows:[{total,trans,to,note}]}], free:[], opts:{}}';

create or replace function public.tg_ternario_autor()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;

drop trigger if exists ternario_projetos_atualizado on public.ternario_projetos;
create trigger ternario_projetos_atualizado before update on public.ternario_projetos
    for each row execute function public.tg_atualizado_em();
drop trigger if exists ternario_diagramas_atualizado on public.ternario_diagramas;
create trigger ternario_diagramas_atualizado before update on public.ternario_diagramas
    for each row execute function public.tg_ternario_autor();

-- histórico só de exclusões (o aplicativo salva a cada edição; guardar todas encheria o histórico).
-- Função própria: aqui projeto_id é o projeto do ternário (número), não um projeto do laboratório (uuid).
create or replace function public.tg_historico_ternario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.historico (tabela, chave, projeto_id, operacao, usuario_id, antes, depois)
    values (tg_table_name, old.id::text, null, tg_op, app.usuario_atual(), to_jsonb(old), null);
    return null;
end $$;
drop trigger if exists ternario_projetos_historico on public.ternario_projetos;
create trigger ternario_projetos_historico after delete on public.ternario_projetos
    for each row execute function public.tg_historico_ternario();
drop trigger if exists ternario_diagramas_historico on public.ternario_diagramas;
create trigger ternario_diagramas_historico after delete on public.ternario_diagramas
    for each row execute function public.tg_historico_ternario();

alter table public.ternario_projetos  enable row level security;
alter table public.ternario_diagramas enable row level security;
do $$ declare t text; begin
  foreach t in array array['ternario_projetos', 'ternario_diagramas'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select using (app.papel_no_modulo(''ternario'') is not null)', t);
    execute format('create policy %1$s_escrever on public.%1$s for all using (app.papel_no_modulo(''ternario'') = ''editor'') with check (app.papel_no_modulo(''ternario'') = ''editor'')', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Acesso
-- -----------------------------------------------------------------------------
grant select on public.modulos_acesso to authenticated;
grant insert, update, delete on public.modulos_acesso to authenticated;          -- a regra deixa só o admin
grant select, insert, update, delete on public.ternario_projetos, public.ternario_diagramas to authenticated;
revoke all on public.modulos_acesso, public.ternario_projetos, public.ternario_diagramas from anon;
grant execute on function app.papel_no_modulo(text) to authenticated;
revoke execute on function app.papel_no_modulo(text) from anon, public;
grant execute on function public.pode_ver_modulo(text), public.pode_editar_modulo(text),
                          public.conceder_modulo(text, text, text), public.revogar_modulo(text, text) to authenticated;
revoke execute on function public.pode_ver_modulo(text), public.pode_editar_modulo(text),
                           public.conceder_modulo(text, text, text), public.revogar_modulo(text, text) from anon, public;

notify pgrst, 'reload schema';
