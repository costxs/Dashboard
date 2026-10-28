-- =============================================================================
-- 020 · Cadastro pelo dashboard com aprovação do administrador
--
-- Quem se registra no dashboard de visualização entra como PENDENTE e não vê nada até o
-- administrador aprovar (aba Administração › Acessos do gerencial), escolhendo o projeto ou a
-- empresa e o papel. Recusado também não vê nada. Quem já existia fica aprovado.
-- O próprio usuário só muda o nome: situação, administrador, ativo e e-mail só o admin altera
-- (gatilho abaixo), então ninguém se aprova chamando a API direto.
--
-- Precisa da 019 (app.usuario_ativo, app.logado com vínculo). Rode a 019 antes.
-- =============================================================================

alter table public.perfis
    add column if not exists situacao     text not null default 'aprovado'
                                          check (situacao in ('pendente', 'aprovado', 'recusado')),
    add column if not exists instituicao  text,          -- o que a pessoa informou ao se registrar
    add column if not exists motivo       text,
    add column if not exists decidido_por uuid references public.perfis(id),
    add column if not exists decidido_em  timestamptz;
-- quem já existe ficou 'aprovado' pelo default acima; daqui em diante, cadastro novo nasce pendente
alter table public.perfis alter column situacao set default 'pendente';

-- perfil criado no cadastro (Supabase Auth): guarda instituição e motivo do formulário
create or replace function app.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.perfis (id, email, nome, instituicao, motivo)
    values (new.id, new.email,
            coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
            nullif(trim(new.raw_user_meta_data ->> 'instituicao'), ''),
            nullif(trim(new.raw_user_meta_data ->> 'motivo'), ''))
    on conflict (id) do nothing;
    return new;
end $$;

-- ativo = não desativado E aprovado (pendente e recusado não têm acesso a nada)
create or replace function app.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select ativo and situacao = 'aprovado' from public.perfis where id = app.usuario_atual()), false)
$$;

create or replace function app.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select administrador from public.perfis
                     where id = app.usuario_atual() and ativo and situacao = 'aprovado'), false)
$$;

-- o próprio usuário só muda o nome; o resto do perfil é do administrador.
-- Sem usuário na requisição (SQL Editor, chave secreta do backend) não há restrição: é quem administra o banco.
create or replace function app.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if app.usuario_atual() is not null and not app.eh_admin() then
        new.email        := old.email;
        new.administrador:= old.administrador;
        new.ativo        := old.ativo;
        new.situacao     := old.situacao;
        new.instituicao  := old.instituicao;
        new.motivo       := old.motivo;
        new.decidido_por := old.decidido_por;
        new.decidido_em  := old.decidido_em;
    end if;
    return new;
end $$;

drop trigger if exists proteger_perfil on public.perfis;
create trigger proteger_perfil before update on public.perfis
    for each row execute function app.proteger_perfil();

-- aprovar ou recusar um pedido (só admin). Aprovando com escopo, já cria o vínculo.
create or replace function public.decidir_acesso(
    p_usuario uuid, p_aprovar boolean,
    p_empresa uuid default null, p_projeto uuid default null, p_papel text default 'leitor')
returns void language plpgsql security definer set search_path = public as $$
begin
    if not app.eh_admin() then
        raise exception 'só o administrador aprova acessos' using errcode = '42501';
    end if;
    if p_aprovar and p_papel not in ('leitor', 'editor') then
        raise exception 'papel inválido: %', p_papel using errcode = '22023';
    end if;
    if p_aprovar and (p_empresa is not null) = (p_projeto is not null) then
        raise exception 'escolha uma empresa OU um projeto para o acesso' using errcode = '22023';
    end if;
    update public.perfis
       set situacao = case when p_aprovar then 'aprovado' else 'recusado' end,
           decidido_por = app.usuario_atual(), decidido_em = now()
     where id = p_usuario;
    if not found then
        raise exception 'usuário não encontrado' using errcode = 'P0002';
    end if;
    if p_aprovar then
        insert into public.membros (usuario_id, empresa_id, projeto_id, papel)
        values (p_usuario, p_empresa, p_projeto, p_papel)
        on conflict do nothing;
    end if;
end $$;

revoke all on function public.decidir_acesso(uuid, boolean, uuid, uuid, text) from public, anon;
grant execute on function public.decidir_acesso(uuid, boolean, uuid, uuid, text) to authenticated;

-- a própria situação, para o dashboard mostrar "aguardando aprovação" (o perfil próprio já é legível)
create or replace function public.minha_situacao()
returns text language sql stable security definer set search_path = public as $$
    select situacao from public.perfis where id = app.usuario_atual()
$$;
revoke all on function public.minha_situacao() from public, anon;
grant execute on function public.minha_situacao() to authenticated;

notify pgrst, 'reload schema';
