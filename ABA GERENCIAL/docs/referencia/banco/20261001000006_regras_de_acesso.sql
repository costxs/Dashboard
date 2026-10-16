-- =============================================================================
-- 0006: regras de acesso (Row Level Security)
--
--   * sem login: não vê nada
--   * catálogos e LITERATURA GERAL: todo usuário logado lê
--   * LITERATURA PRÓPRIA: aberta a todos, ou só ao projeto dela
--   * AMOSTRAS e todas as ANÁLISES: só quem tem acesso ao projeto da amostra
--     (direto no projeto ou pela empresa)
--   * escrever: 'editor' do projeto; catálogos e literatura: editor de qualquer projeto
--   * empresas, projetos e membros: só administrador
-- =============================================================================

create or replace function app.logado()
returns boolean language sql stable as $$ select app.usuario_atual() is not null $$;

-- amostra -> projeto, sem esbarrar na regra da própria tabela amostras
create or replace function app.projeto_da_amostra(a uuid)
returns uuid language sql stable security definer set search_path = public as $$
    select projeto_id from public.amostras where id = a
$$;

create or replace function app.pode_ver_amostra(a uuid)
returns boolean language sql stable as $$ select app.pode_ver(app.projeto_da_amostra(a)) $$;

create or replace function app.pode_editar_amostra(a uuid)
returns boolean language sql stable as $$ select app.pode_editar(app.projeto_da_amostra(a)) $$;

-- para o front saber se mostra os botões de editar (a regra de verdade é a RLS)
create or replace function public.meu_papel(p_projeto uuid)
returns text language sql stable as $$ select app.papel_no_projeto(p_projeto) $$;

create or replace function public.sou_editor()
returns boolean language sql stable as $$ select app.eh_editor() $$;

create or replace function public.sou_admin()
returns boolean language sql stable as $$ select app.eh_admin() $$;

-- liga RLS em todas as tabelas
do $$
declare t text;
begin
    for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', t);
    end loop;
end $$;

-- -----------------------------------------------------------------------------
-- usuários, empresas, projetos, membros, WPs
-- -----------------------------------------------------------------------------
-- todo usuário logado lê nomes (para mostrar responsáveis); só admin altera
create policy perfis_ler on public.perfis for select using (app.logado());
create policy perfis_proprio_nome on public.perfis for update
    using (id = app.usuario_atual())
    with check (id = app.usuario_atual() and administrador = app.eh_admin());  -- não se promove
create policy perfis_admin on public.perfis for all
    using (app.eh_admin()) with check (app.eh_admin());

create policy empresas_ler on public.empresas for select
    using (app.eh_admin()
           or exists (select 1 from public.membros m
                      where m.empresa_id = empresas.id and m.usuario_id = app.usuario_atual())
           or exists (select 1 from public.projetos p where p.empresa_id = empresas.id));
create policy empresas_admin on public.empresas for all
    using (app.eh_admin()) with check (app.eh_admin());

create policy projetos_ler on public.projetos for select using (app.pode_ver(id));
create policy projetos_admin on public.projetos for all
    using (app.eh_admin()) with check (app.eh_admin());

create policy membros_ler on public.membros for select
    using (usuario_id = app.usuario_atual() or app.eh_admin());
create policy membros_admin on public.membros for all
    using (app.eh_admin()) with check (app.eh_admin());

create policy wp_ler on public.work_packages for select using (app.pode_ver(projeto_id));
create policy wp_escrever on public.work_packages for all
    using (app.pode_editar(projeto_id)) with check (app.pode_editar(projeto_id));

-- -----------------------------------------------------------------------------
-- catálogos e dados da literatura geral
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array['litologias', 'fluidos_prop', 'sistemas_acidos', 'lit_rochas', 'lit_dados_rda']
    loop
        execute format('create policy %1$s_ler on public.%1$s for select using (app.logado())', t);
        execute format('create policy %1$s_escrever on public.%1$s for all
                        using (app.eh_editor()) with check (app.eh_editor())', t);
    end loop;
end $$;

-- publicações
create policy publicacoes_ler on public.publicacoes for select
    using (app.logado() and (projeto_id is null or app.pode_ver(projeto_id)));
create policy publicacoes_escrever on public.publicacoes for all
    using (case when projeto_id is null then app.eh_editor() else app.pode_editar(projeto_id) end)
    with check (case when projeto_id is null then app.eh_editor() else app.pode_editar(projeto_id) end);

create policy pub_amostras_ler on public.publicacao_amostras for select
    using (app.pode_ver_amostra(amostra_id)
           and exists (select 1 from public.publicacoes p where p.id_referencia = publicacao_amostras.id_referencia));
create policy pub_amostras_escrever on public.publicacao_amostras for all
    using (app.pode_editar_amostra(amostra_id)) with check (app.pode_editar_amostra(amostra_id));

-- -----------------------------------------------------------------------------
-- amostras e análises: o acesso vem do projeto da amostra
-- -----------------------------------------------------------------------------
create policy amostras_ler on public.amostras for select using (app.pode_ver(projeto_id));
create policy amostras_escrever on public.amostras for all
    using (app.pode_editar(projeto_id)) with check (app.pode_editar(projeto_id));

do $$
declare t text;
begin
    foreach t in array array['conferencias', 'analise_petrofisica', 'analise_microct',
        'analise_coreflooding', 'analise_reatividade_estatica', 'analise_rda', 'analise_drx',
        'analise_petrografia', 'analise_mev', 'curvas']
    loop
        execute format('create policy %1$s_ler on public.%1$s for select
                        using (app.pode_ver_amostra(amostra_id))', t);
        execute format('create policy %1$s_escrever on public.%1$s for all
                        using (app.pode_editar_amostra(amostra_id))
                        with check (app.pode_editar_amostra(amostra_id))', t);
    end loop;
end $$;

-- tabelas-filhas: seguem a análise-mãe
create policy drx_fases_ler on public.drx_fases for select
    using (exists (select 1 from public.analise_drx a where a.id = analise_id));
create policy drx_fases_escrever on public.drx_fases for all
    using (exists (select 1 from public.analise_drx a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)))
    with check (exists (select 1 from public.analise_drx a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)));

create policy petro_comp_ler on public.petrografia_componentes for select
    using (exists (select 1 from public.analise_petrografia a where a.id = analise_id));
create policy petro_comp_escrever on public.petrografia_componentes for all
    using (exists (select 1 from public.analise_petrografia a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)))
    with check (exists (select 1 from public.analise_petrografia a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)));

create policy mev_eds_ler on public.mev_eds for select
    using (exists (select 1 from public.analise_mev a where a.id = analise_id));
create policy mev_eds_escrever on public.mev_eds for all
    using (exists (select 1 from public.analise_mev a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)))
    with check (exists (select 1 from public.analise_mev a where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)));

create policy curva_pontos_ler on public.curva_pontos for select
    using (exists (select 1 from public.curvas c where c.id = curva_id));
create policy curva_pontos_escrever on public.curva_pontos for all
    using (exists (select 1 from public.curvas c where c.id = curva_id and app.pode_editar_amostra(c.amostra_id)))
    with check (exists (select 1 from public.curvas c where c.id = curva_id and app.pode_editar_amostra(c.amostra_id)));

-- arquivos: de amostra ou de publicação
create policy arquivos_ler on public.arquivos for select
    using ((amostra_id is not null and app.pode_ver_amostra(amostra_id))
        or (id_referencia is not null and exists (
                select 1 from public.publicacoes p where p.id_referencia = arquivos.id_referencia)));
create policy arquivos_escrever on public.arquivos for all
    using ((amostra_id is not null and app.pode_editar_amostra(amostra_id))
        or (amostra_id is null and app.eh_editor()))
    with check ((amostra_id is not null and app.pode_editar_amostra(amostra_id))
        or (amostra_id is null and app.eh_editor()));

-- histórico: só leitura; linhas de projeto só para quem vê o projeto
create policy historico_ler on public.historico for select
    using (app.eh_admin() or (app.logado() and (projeto_id is null or app.pode_ver(projeto_id))));

-- -----------------------------------------------------------------------------
-- permissões do papel "authenticated" do Supabase (usuário logado)
-- -----------------------------------------------------------------------------
grant usage on schema public, app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
grant execute on function public.meu_papel(uuid), public.sou_editor(), public.sou_admin() to authenticated;
revoke insert, update, delete on public.historico from authenticated;
-- visitante sem login não acessa nada
revoke all on all tables in schema public from anon;
grant usage on schema app to anon;
