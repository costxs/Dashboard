-- =============================================================================
-- Memória Experimental — LC PETRO/UFPA
-- 0001: perfis de usuário, Empresa -> Projeto, permissões
--
-- Versão Supabase: o login é o Supabase Auth (auth.users). Cada usuário ganha
-- automaticamente uma linha em "perfis" com nome e o indicador de administrador.
-- O schema "app" guarda as funções de permissão usadas pelas regras (0006).
-- Para migrar depois para um PostgreSQL próprio, basta trocar app.usuario_atual().
-- =============================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- quem está logado (no Supabase: o usuário do token JWT)
create or replace function app.usuario_atual()
returns uuid language sql stable as $$
    select auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Perfis (dados do usuário além do login)
-- -----------------------------------------------------------------------------
create table public.perfis (
    id            uuid primary key references auth.users(id) on delete cascade,
    email         text not null,
    nome          text,
    administrador boolean not null default false,        -- vê tudo, cria empresas e projetos
    ativo         boolean not null default true,
    criado_em     timestamptz not null default now()
);

-- cria o perfil quando alguém se cadastra no Supabase Auth
create or replace function app.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.perfis (id, email, nome)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
    return new;
end $$;

create trigger ao_criar_usuario
    after insert on auth.users
    for each row execute function app.criar_perfil();

-- Garante perfil de administrador para usuários já cadastrados antes da migração
insert into public.perfis (id, email, nome, administrador)
select id, email, coalesce(raw_user_meta_data ->> 'nome', split_part(email, '@', 1)), true
from auth.users
on conflict (id) do update set administrador = true;

-- -----------------------------------------------------------------------------
-- Dois níveis: EMPRESA (TotalEnergies, Petrobras, UFPA/interno...) e PROJETO
-- -----------------------------------------------------------------------------
create table public.empresas (
    id          uuid primary key default gen_random_uuid(),
    sigla       text not null unique,                    -- 'TOTAL', 'PETROBRAS', 'LCPETRO'
    nome        text not null,
    criado_em   timestamptz not null default now()
);

create table public.projetos (
    id          uuid primary key default gen_random_uuid(),
    empresa_id  uuid not null references public.empresas(id),
    codigo      text not null unique,                    -- ex.: 'TOTAL-ACID-2025'
    nome        text not null,
    descricao   text,
    inicio      date,
    fim         date,
    ativo       boolean not null default true,
    criado_em   timestamptz not null default now()
);

-- Acesso em dois níveis:
--   * membro da EMPRESA  -> vê todos os projetos dela (ex.: coordenador do contrato)
--   * membro do PROJETO  -> vê só aquele projeto (ex.: bolsista do projeto)
create table public.membros (
    id          bigint generated always as identity primary key,
    usuario_id  uuid not null references public.perfis(id) on delete cascade,
    empresa_id  uuid references public.empresas(id) on delete cascade,
    projeto_id  uuid references public.projetos(id) on delete cascade,
    papel       text not null check (papel in ('leitor', 'editor')),
    constraint um_nivel check ((empresa_id is null) <> (projeto_id is null))
);
create unique index membros_empresa_uq on public.membros (usuario_id, empresa_id) where empresa_id is not null;
create unique index membros_projeto_uq on public.membros (usuario_id, projeto_id) where projeto_id is not null;

-- Pacotes de trabalho contratuais (dashboard gerencial)
create table public.work_packages (
    id                    bigint generated always as identity primary key,
    projeto_id            uuid not null references public.projetos(id) on delete cascade,
    codigo                text not null,                 -- 'WP1'
    nome                  text not null,                 -- 'Caracterização petrofísica'
    inicio                date,
    fim                   date,
    progresso_planejado   numeric check (progresso_planejado between 0 and 100),
    progresso_realizado   numeric check (progresso_realizado between 0 and 100),
    unique (projeto_id, codigo)
);

-- -----------------------------------------------------------------------------
-- Funções de permissão
-- (security definer: consultam usuarios/membros sem esbarrar nas regras delas)
-- -----------------------------------------------------------------------------
create or replace function app.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select administrador from public.perfis
                     where id = app.usuario_atual() and ativo), false)
$$;

-- papel do usuário num projeto, somando o que vem da empresa e do próprio projeto
-- devolve 'editor', 'leitor' ou null
create or replace function app.papel_no_projeto(p uuid)
returns text language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then 'editor'
        else (select max(m.papel)            -- 'editor' > 'leitor' em ordem alfabética
              from public.membros m
              join public.projetos pr on pr.id = p
              where m.usuario_id = app.usuario_atual()
                and (m.projeto_id = p or m.empresa_id = pr.empresa_id))
    end
$$;

create or replace function app.pode_ver(p uuid)
returns boolean language sql stable as $$
    select p is not null and app.papel_no_projeto(p) is not null
$$;

create or replace function app.pode_editar(p uuid)
returns boolean language sql stable as $$
    select p is not null and app.papel_no_projeto(p) = 'editor'
$$;

-- editor em qualquer lugar: pode manter catálogos (litologias, sistemas ácidos)
create or replace function app.eh_editor()
returns boolean language sql stable security definer set search_path = public as $$
    select app.eh_admin() or exists (
        select 1 from public.membros where usuario_id = app.usuario_atual() and papel = 'editor')
$$;
