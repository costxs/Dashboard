-- =============================================================================
-- 021 · Desempenho: menos trabalho (CPU, memória, leitura de disco) por consulta
--
-- Não muda QUEM vê o quê: as mesmas regras, calculadas de um jeito mais barato.
--
-- 1. ÍNDICES em toda coluna de ligação (chave estrangeira) que ainda não tinha.
--    Sem eles, as regras de acesso, os contadores da lista de amostras (v_amostras) e as exclusões
--    em cascata leem a tabela inteira a cada vez.
-- 2. REGRAS DE ACESSO calculadas UMA vez por consulta, e não uma vez por linha.
--    Antes: cada linha chamava app.pode_ver_amostra(amostra_id), que refazia a busca do projeto e do
--    papel; abrir uma curva de 2.000 pontos refazia isso 2.000 vezes. Agora a lista de projetos que a
--    pessoa vê sai uma vez ((select app.projetos_visiveis())) e cada linha só é comparada com ela.
--    É a forma recomendada pelo Supabase para RLS ("wrap functions in select").
--
-- Precisa da 019 e da 020 (app.usuario_ativo). Rode depois delas.
-- =============================================================================

-- 1. índices nas chaves estrangeiras ------------------------------------------------------------
-- cria um índice para cada chave estrangeira de uma coluna só que ainda não é a primeira coluna
-- de algum índice (inclui tabelas criadas pelo SQL Editor fora destas migrações)
do $$
declare r record;
begin
    for r in
        select c.conrelid::regclass as tabela, a.attname as coluna, cl.relname as nome_tabela
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid
        join pg_namespace n on n.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
          and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
    loop
        execute format('create index if not exists %I on %s (%I)',
                       left(r.nome_tabela || '_' || r.coluna || '_idx', 63), r.tabela, r.coluna);
    end loop;
end $$;

-- 2. listas calculadas uma vez por consulta ------------------------------------------------------
-- projetos em que a pessoa tem papel (vê) e em que é editora; mesmas regras de app.papel_no_projeto
create or replace function app.projetos_com_papel(p_so_editor boolean)
returns uuid[] language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then (select coalesce(array_agg(id), '{}') from public.projetos)
        when not app.usuario_ativo() then '{}'::uuid[]
        else (select coalesce(array_agg(distinct pr.id), '{}')
              from public.membros m
              join public.projetos pr on pr.id = m.projeto_id or pr.empresa_id = m.empresa_id
              where m.usuario_id = app.usuario_atual() and (not p_so_editor or m.papel = 'editor'))
    end
$$;
create or replace function app.projetos_visiveis()  returns uuid[] language sql stable as $$ select app.projetos_com_papel(false) $$;
create or replace function app.projetos_editaveis() returns uuid[] language sql stable as $$ select app.projetos_com_papel(true) $$;
grant execute on function app.projetos_com_papel(boolean), app.projetos_visiveis(), app.projetos_editaveis() to authenticated;

-- 3. regras reescritas (mesmo significado) ---------------------------------------------------------
-- projetos e work packages
drop policy if exists projetos_ler on public.projetos;
create policy projetos_ler on public.projetos for select using (id = any ((select app.projetos_visiveis())::uuid[]));
drop policy if exists projetos_admin on public.projetos;
create policy projetos_admin on public.projetos for all using ((select app.eh_admin())) with check ((select app.eh_admin()));

drop policy if exists wp_ler on public.work_packages;
create policy wp_ler on public.work_packages for select using (projeto_id = any ((select app.projetos_visiveis())::uuid[]));
drop policy if exists wp_escrever on public.work_packages;
create policy wp_escrever on public.work_packages for all
    using (projeto_id = any ((select app.projetos_editaveis())::uuid[])) with check (projeto_id = any ((select app.projetos_editaveis())::uuid[]));

-- catálogos e literatura geral
do $$
declare t text;
begin
    foreach t in array array['litologias', 'fluidos_prop', 'sistemas_acidos', 'lit_rochas', 'lit_dados_rda'] loop
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format('create policy %1$s_ler on public.%1$s for select using ((select app.logado()))', t);
        execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
        execute format('create policy %1$s_escrever on public.%1$s for all
                        using ((select app.eh_editor())) with check ((select app.eh_editor()))', t);
    end loop;
end $$;

-- publicações
drop policy if exists publicacoes_ler on public.publicacoes;
create policy publicacoes_ler on public.publicacoes for select
    using ((select app.logado()) and (projeto_id is null or projeto_id = any ((select app.projetos_visiveis())::uuid[])));
drop policy if exists publicacoes_escrever on public.publicacoes;
create policy publicacoes_escrever on public.publicacoes for all
    using (case when projeto_id is null then (select app.eh_editor()) else projeto_id = any ((select app.projetos_editaveis())::uuid[]) end)
    with check (case when projeto_id is null then (select app.eh_editor()) else projeto_id = any ((select app.projetos_editaveis())::uuid[]) end);

-- amostras
drop policy if exists amostras_ler on public.amostras;
create policy amostras_ler on public.amostras for select using (projeto_id = any ((select app.projetos_visiveis())::uuid[]));
drop policy if exists amostras_escrever on public.amostras;
create policy amostras_escrever on public.amostras for all
    using (projeto_id = any ((select app.projetos_editaveis())::uuid[])) with check (projeto_id = any ((select app.projetos_editaveis())::uuid[]));

-- tudo que pertence a uma amostra: a amostra tem que estar num projeto visível / editável
-- (a subconsulta em amostras é feita uma vez e comparada por hash, não por linha)
do $$
declare t text;
begin
    foreach t in array array['conferencias', 'analise_petrofisica', 'analise_microct', 'analise_coreflooding',
                             'analise_reatividade_estatica', 'analise_rda', 'analise_drx', 'analise_petrografia',
                             'analise_mev', 'curvas', 'publicacao_amostras'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format('create policy %1$s_ler on public.%1$s for select using (amostra_id in (
                            select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_visiveis())::uuid[]))%2$s)',
                       t, case when t = 'publicacao_amostras' then
                           ' and exists (select 1 from public.publicacoes p where p.id_referencia = publicacao_amostras.id_referencia)' else '' end);
        execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
        execute format('create policy %1$s_escrever on public.%1$s for all
                        using (amostra_id in (select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))
                        with check (amostra_id in (select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))', t);
    end loop;
end $$;
-- nomes antigos da 006 para publicacao_amostras
drop policy if exists pub_amostras_ler on public.publicacao_amostras;
drop policy if exists pub_amostras_escrever on public.publicacao_amostras;

-- tabelas-filhas de uma análise: seguem a análise-mãe (cujo RLS já filtra)
do $$
declare r record;
begin
    for r in select * from (values
        ('drx_fases', 'analise_drx', 'drx_fases'), ('petrografia_componentes', 'analise_petrografia', 'petro_comp'),
        ('mev_eds', 'analise_mev', 'mev_eds'), ('permeabilidade_etapas', 'analise_petrofisica', 'permeabilidade_etapas'),
        ('acidificacao_fases', 'analise_coreflooding', 'acidificacao_fases')
    ) as v(filha, mae, prefixo) loop
        if to_regclass('public.' || r.filha) is null then continue; end if;
        execute format('drop policy if exists %1$s_ler on public.%2$s', r.prefixo, r.filha);
        execute format('create policy %1$s_ler on public.%2$s for select using (analise_id in (select m.id from public.%3$s m))',
                       r.prefixo, r.filha, r.mae);
        execute format('drop policy if exists %1$s_escrever on public.%2$s', r.prefixo, r.filha);
        execute format('create policy %1$s_escrever on public.%2$s for all
                        using (analise_id in (select m.id from public.%3$s m join public.amostras a on a.id = m.amostra_id
                                              where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))
                        with check (analise_id in (select m.id from public.%3$s m join public.amostras a on a.id = m.amostra_id
                                                   where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))',
                       r.prefixo, r.filha, r.mae);
    end loop;
end $$;

-- pontos das curvas: a curva tem que ser visível (uma busca por consulta, não por ponto)
drop policy if exists curva_pontos_ler on public.curva_pontos;
create policy curva_pontos_ler on public.curva_pontos for select using (curva_id in (select c.id from public.curvas c));
drop policy if exists curva_pontos_escrever on public.curva_pontos;
create policy curva_pontos_escrever on public.curva_pontos for all
    using (curva_id in (select c.id from public.curvas c join public.amostras a on a.id = c.amostra_id
                        where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))
    with check (curva_id in (select c.id from public.curvas c join public.amostras a on a.id = c.amostra_id
                             where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])));

-- arquivos (de amostra ou de publicação)
drop policy if exists arquivos_ler on public.arquivos;
create policy arquivos_ler on public.arquivos for select
    using ((amostra_id is not null and amostra_id in (select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_visiveis())::uuid[])))
        or (id_referencia is not null and exists (select 1 from public.publicacoes p where p.id_referencia = arquivos.id_referencia)));
drop policy if exists arquivos_escrever on public.arquivos;
create policy arquivos_escrever on public.arquivos for all
    using ((amostra_id is not null and amostra_id in (select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))
        or (amostra_id is null and (select app.eh_editor())))
    with check ((amostra_id is not null and amostra_id in (select a.id from public.amostras a where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])))
        or (amostra_id is null and (select app.eh_editor())));

-- histórico
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select
    using ((select app.eh_admin()) or ((select app.logado()) and (projeto_id is null or projeto_id = any ((select app.projetos_visiveis())::uuid[]))));

-- perfis e membros: o "é admin?" uma vez por consulta
drop policy if exists perfis_admin on public.perfis;
create policy perfis_admin on public.perfis for all using ((select app.eh_admin())) with check ((select app.eh_admin()));
drop policy if exists membros_ler on public.membros;
create policy membros_ler on public.membros for select using (usuario_id = (select app.usuario_atual()) or (select app.eh_admin()));
drop policy if exists membros_admin on public.membros;
create policy membros_admin on public.membros for all using ((select app.eh_admin())) with check ((select app.eh_admin()));
drop policy if exists empresas_admin on public.empresas;
create policy empresas_admin on public.empresas for all using ((select app.eh_admin())) with check ((select app.eh_admin()));

-- estatísticas atualizadas para o planejador usar os índices novos
analyze;

notify pgrst, 'reload schema';
