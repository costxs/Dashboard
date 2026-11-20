-- =============================================================================
-- 024 · Otimização de RLS (InitPlan + Segurança de Projetos Externos) e Views
--
-- Corrige erro 500 (statement timeout 57014) e lentidão ao carregar v_amostras
-- para usuários autenticados não-administradores, preservando a visão global da
-- empresa interna LC PETRO com proteção de dados sensíveis de projetos externos.
-- =============================================================================

-- 0. Garantir permissões no schema app
grant usage on schema public, app to authenticated, service_role, postgres;

-- 1. Índices de chave estrangeira e ordenação usados pelas views e RLS
create index if not exists amostras_projeto_idx
    on public.amostras (projeto_id);
create index if not exists analise_petrofisica_amostra_momento_idx
    on public.analise_petrofisica (amostra_id, momento, data_ensaio desc nulls last, id desc);
create index if not exists analise_microct_amostra_idx
    on public.analise_microct (amostra_id);
create index if not exists analise_coreflooding_amostra_idx
    on public.analise_coreflooding (amostra_id, data_ensaio desc nulls last, id desc);
create index if not exists analise_reatividade_estatica_amostra_idx
    on public.analise_reatividade_estatica (amostra_id);
create index if not exists analise_rda_amostra_idx
    on public.analise_rda (amostra_id);
create index if not exists analise_drx_amostra_idx
    on public.analise_drx (amostra_id);
create index if not exists analise_petrografia_amostra_idx
    on public.analise_petrografia (amostra_id);
create index if not exists analise_mev_amostra_idx
    on public.analise_mev (amostra_id);
create index if not exists conferencias_amostra_idx
    on public.conferencias (amostra_id);
create index if not exists curvas_amostra_idx
    on public.curvas (amostra_id);
create index if not exists arquivos_amostra_idx
    on public.arquivos (amostra_id);
create index if not exists membros_usuario_emp_proj_idx
    on public.membros (usuario_id, empresa_id, projeto_id);

-- 2. Funções otimizadas do schema app (SECURITY DEFINER + SQL estável)
create or replace function app.eh_servico_ou_postgres()
returns boolean language sql stable security definer set search_path = public as $$
    select (
        nullif(current_setting('request.jwt.claims', true), '') is null
        or coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        ) = 'service_role'
    )
    and app.usuario_atual() is null
$$;

create or replace function app.membro_lcpetro()
returns boolean language sql stable security definer set search_path = public as $$
    select app.eh_admin() or (
        app.usuario_ativo() and exists (
            select 1
            from public.membros m
            left join public.projetos p on p.id = m.projeto_id
            join public.empresas e on e.id = coalesce(m.empresa_id, p.empresa_id)
            where m.usuario_id = app.usuario_atual()
              and e.sigla = 'LCPETRO'
        )
    )
$$;

create or replace function app.tem_acesso_direto_projeto(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select p is not null and (
        app.eh_admin() or (
            app.usuario_ativo() and exists (
                select 1
                from public.membros m
                join public.projetos pr on pr.id = p
                where m.usuario_id = app.usuario_atual()
                  and (m.projeto_id = p or m.empresa_id = pr.empresa_id)
            )
        )
    )
$$;

create or replace function app.pode_ver(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select p is not null and (
        app.eh_admin()
        or app.membro_lcpetro()
        or app.tem_acesso_direto_projeto(p)
    )
$$;

create or replace function app.pode_ver_amostra(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
    select a is not null and (
        app.eh_admin() or (
            app.usuario_ativo() and exists (
                select 1
                from public.amostras am
                join public.projetos pr on pr.id = am.projeto_id
                join public.membros m on m.projeto_id = pr.id or m.empresa_id = pr.empresa_id
                where am.id = a
                  and m.usuario_id = app.usuario_atual()
            )
        )
    )
$$;

create or replace function app.empresas_com_papel(p_so_editor boolean)
returns uuid[] language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then (select coalesce(array_agg(id), '{}') from public.empresas)
        when not app.usuario_ativo() then '{}'::uuid[]
        else (
            select coalesce(array_agg(distinct coalesce(m.empresa_id, pr.empresa_id)), '{}')
            from public.membros m
            left join public.projetos pr on pr.id = m.projeto_id
            where m.usuario_id = app.usuario_atual()
              and coalesce(m.empresa_id, pr.empresa_id) is not null
              and (not p_so_editor or m.papel = 'editor')
        )
    end
$$;

create or replace function app.empresas_visiveis_diretas()
returns uuid[] language sql stable as $$ select app.empresas_com_papel(false) $$;

create or replace function app.empresas_editaveis_diretas()
returns uuid[] language sql stable as $$ select app.empresas_com_papel(true) $$;

create or replace function app.amostras_visiveis_diretas()
returns uuid[] language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then (select coalesce(array_agg(id), '{}') from public.amostras)
        when not app.usuario_ativo() then '{}'::uuid[]
        else (
            select coalesce(array_agg(a.id), '{}')
            from public.amostras a
            where a.projeto_id = any (app.projetos_com_papel(false))
        )
    end
$$;

grant execute on function
    app.eh_servico_ou_postgres(),
    app.membro_lcpetro(),
    app.tem_acesso_direto_projeto(uuid),
    app.pode_ver(uuid),
    app.pode_ver_amostra(uuid),
    app.empresas_com_papel(boolean),
    app.empresas_visiveis_diretas(),
    app.empresas_editaveis_diretas(),
    app.amostras_visiveis_diretas()
to authenticated, service_role, postgres;

-- 3. Políticas RLS SELECT com InitPlan ((select ...))
--    a) Tabelas visíveis globalmente pela empresa interna LC PETRO
drop policy if exists empresas_ler on public.empresas;
create policy empresas_ler on public.empresas for select
    using (
        (select app.eh_admin())
        or (select app.membro_lcpetro())
        or id = any ((select app.empresas_visiveis_diretas())::uuid[])
    );

drop policy if exists projetos_ler on public.projetos;
create policy projetos_ler on public.projetos for select
    using (
        (select app.eh_admin())
        or (select app.membro_lcpetro())
        or id = any ((select app.projetos_visiveis())::uuid[])
    );

drop policy if exists amostras_ler on public.amostras;
create policy amostras_ler on public.amostras for select
    using (
        (select app.eh_admin())
        or (select app.membro_lcpetro())
        or projeto_id = any ((select app.projetos_visiveis())::uuid[])
    );

drop policy if exists conferencias_ler on public.conferencias;
create policy conferencias_ler on public.conferencias for select
    using (
        (select app.eh_admin())
        or (select app.membro_lcpetro())
        or amostra_id = any ((select app.amostras_visiveis_diretas())::uuid[])
    );

drop policy if exists analise_petrofisica_ler on public.analise_petrofisica;
create policy analise_petrofisica_ler on public.analise_petrofisica for select
    using (
        (select app.eh_admin())
        or (select app.membro_lcpetro())
        or amostra_id = any ((select app.amostras_visiveis_diretas())::uuid[])
    );

--    b) Demais análises e curvas: restritas a admin ou quem tem acesso direto ao projeto da amostra (InitPlan)
do $$
declare t text;
begin
    foreach t in array array[
        'analise_microct',
        'analise_coreflooding',
        'analise_reatividade_estatica',
        'analise_rda',
        'analise_drx',
        'analise_petrografia',
        'analise_mev',
        'curvas'
    ] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format(
            'create policy %1$s_ler on public.%1$s for select using ((select app.eh_admin()) or amostra_id = any ((select app.amostras_visiveis_diretas())::uuid[]))',
            t
        );
    end loop;
end $$;

--    c) Literatura, PVbt, publicações, prefixos e perfis com InitPlan (sem vazamento de projetos externos)
drop policy if exists publicacoes_ler on public.publicacoes;
create policy publicacoes_ler on public.publicacoes for select
    using (
        (select app.logado())
        and (projeto_id is null or projeto_id = any ((select app.projetos_visiveis())::uuid[]))
        and (empresa_id is null or empresa_id = any ((select app.empresas_visiveis_diretas())::uuid[]))
    );

do $$
declare t text;
begin
    foreach t in array array['lit_amostras_pvbt', 'lit_dados_pvbt'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format(
            'create policy %1$s_ler on public.%1$s for select using ((select app.logado()) and (empresa_id is null or empresa_id = any ((select app.empresas_visiveis_diretas())::uuid[])))',
            t
        );
        execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
        execute format(
            'create policy %1$s_escrever on public.%1$s for all
                using (case when empresa_id is null then (select app.eh_editor()) else empresa_id = any ((select app.empresas_editaveis_diretas())::uuid[]) end)
                with check (case when empresa_id is null then (select app.eh_editor()) else empresa_id = any ((select app.empresas_editaveis_diretas())::uuid[]) end)',
            t
        );
    end loop;

    foreach t in array array['lit_listas', 'lit_qualidade', 'prefixos_codigo'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format('create policy %1$s_ler on public.%1$s for select using ((select app.logado()))', t);
        execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
        execute format(
            'create policy %1$s_escrever on public.%1$s for all using ((select app.eh_editor())) with check ((select app.eh_editor()))',
            t
        );
    end loop;
end $$;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select
    using (
        id = (select app.usuario_atual())
        or (select app.eh_admin())
        or app.colega(id)
    );

-- 4. Reescrever v_amostras (security_invoker = false + hash joins em vez de 8 subqueries correlacionadas)
create or replace view public.v_amostras
with (security_invoker = false) as
select
    a.id,
    a.codigo,
    case
        when not perm.ver_sensivel and a.tipo_origem = 'testemunho'::text then 'Rocha de Testemunho (reservado)'::text
        else a.litologia
    end as litologia,
    a.tipo_origem,
    a.status,
    a.finalidade,
    e.sigla as empresa,
    e.id as empresa_id,
    p.codigo as projeto,
    a.projeto_id,
    case when perm.ver_sensivel then a.afloramento_local else null::text end as afloramento_local,
    case when perm.ver_sensivel then a.fornecedor else null::text end as fornecedor,
    case when perm.ver_sensivel then a.bacia else null::text end as bacia,
    case when perm.ver_sensivel then a.campo else null::text end as campo,
    case when perm.ver_sensivel then a.poco else null::text end as poco,
    case when perm.ver_sensivel then a.reservatorio else null::text end as reservatorio,
    case when perm.ver_sensivel then a.profundidade_m else null::numeric end as profundidade_m,
    a.diametro_cm,
    a.comprimento_cm,
    a.massa_seca_g,
    a.permeabilidade_fabricante_md,
    pa.porosidade_pct,
    pa.permeabilidade_gas_md as k_gas_md,
    pa.permeabilidade_liquido_md as k_liquido_md,
    case when perm.ver_sensivel then pa.pressao_confinamento_psi else null::numeric end as pressao_confinamento_psi,
    round((pi() * ((a.diametro_cm / 2::numeric) ^ 2::numeric)::double precision * a.comprimento_cm::double precision * pa.porosidade_pct::double precision / 100::double precision)::numeric, 3) as volume_poroso_cm3,
    case when perm.ver_sensivel then pd.permeabilidade_liquido_md else null::numeric end as k_liquido_depois_md,
    case when perm.ver_sensivel then cf.pvbt else null::numeric end as pvbt,
    case when perm.ver_sensivel then cf.breakthrough else null::boolean end as breakthrough,
    case when perm.ver_sensivel then cf.razao_dp else null::numeric end as razao_dp,
    coalesce(c_petro.n, 0::bigint) as n_petrofisica,
    coalesce(c_mct.n, 0::bigint) as n_microct,
    coalesce(c_cf.n, 0::bigint) as n_coreflooding,
    coalesce(c_reat.n, 0::bigint) as n_reatividade,
    coalesce(c_rda.n, 0::bigint) as n_rda,
    coalesce(c_drx.n, 0::bigint) as n_drx,
    coalesce(c_petr.n, 0::bigint) as n_petrografia,
    coalesce(c_mev.n, 0::bigint) as n_mev,
    a.criado_em,
    a.atualizado_em,
    coalesce(
        case
            when a.finalidade ~~* '%rda%'::text then 'disco'::text
            when a.finalidade ~~* '%core%'::text then 'plug'::text
            else null::text
        end,
        pc.tipo_amostra,
        case
            when a.comprimento_cm < 3::numeric then 'disco'::text
            when a.comprimento_cm >= 3::numeric then 'plug'::text
            else null::text
        end
    ) as tipo_amostra,
    "substring"(a.codigo, '^[A-Za-z]+'::text) as prefixo,
    pc.significado as significado_prefixo,
    case
        when not perm.ver_sensivel then null::text
        else coalesce(
            fl.realizados,
            (
                select ((trim(both from m.m[1]) || ' '::text) || trim(both from m.m[2])) || ' (previsto)'::text
                from regexp_match(a.observacoes, 'Utiliza[cç][aã]o:[^\[]*?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +]*?)\s*\[([^\]]+)\]'::text) m(m)
            )
        )
    end as fluidos,
    a.permeabilidade_fabricante_min_md,
    a.permeabilidade_fabricante_max_md
from public.amostras a
join public.projetos p on p.id = a.projeto_id
join public.empresas e on e.id = p.empresa_id
left join public.prefixos_codigo pc on pc.prefixo = upper("substring"(a.codigo, '^[A-Za-z]+'::text))
cross join lateral (
    select (
        (select app.eh_servico_ou_postgres())
        or (select app.eh_admin())
        or a.projeto_id = any ((select app.projetos_visiveis())::uuid[])
    ) as ver_sensivel
) perm
left join (
    select distinct on (amostra_id)
           amostra_id, porosidade_pct, permeabilidade_gas_md, permeabilidade_liquido_md, pressao_confinamento_psi
    from public.analise_petrofisica
    where momento = 'antes'::text
    order by amostra_id, data_ensaio desc nulls last, id desc
) pa on pa.amostra_id = a.id
left join (
    select distinct on (amostra_id)
           amostra_id, permeabilidade_liquido_md
    from public.analise_petrofisica
    where momento = 'depois'::text
    order by amostra_id, data_ensaio desc nulls last, id desc
) pd on pd.amostra_id = a.id
left join (
    select distinct on (amostra_id)
           amostra_id, pvbt, breakthrough, razao_dp
    from public.analise_coreflooding
    order by amostra_id, data_ensaio desc nulls last, id desc
) cf on cf.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_petrofisica group by amostra_id) c_petro on c_petro.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_microct group by amostra_id) c_mct on c_mct.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_coreflooding group by amostra_id) c_cf on c_cf.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_reatividade_estatica group by amostra_id) c_reat on c_reat.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_rda group by amostra_id) c_rda on c_rda.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_drx group by amostra_id) c_drx on c_drx.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_petrografia group by amostra_id) c_petr on c_petr.amostra_id = a.id
left join (select amostra_id, count(*)::bigint as n from public.analise_mev group by amostra_id) c_mev on c_mev.amostra_id = a.id
left join (
    select u.amostra_id, string_agg(distinct u.f, ' · '::text) as realizados
    from (
        select c.amostra_id,
               coalesce(nullif(trim(both from concat_ws(' '::text, c.acido, c.conc_valor::text, c.conc_unidade)), ''::text), s.nome_sistema) as f
        from public.analise_coreflooding c
        left join public.sistemas_acidos s on s.id_sistema = c.id_sistema
        union all
        select r.amostra_id, s.nome_sistema
        from public.analise_rda r
        join public.sistemas_acidos s on s.id_sistema = r.id_sistema
        union all
        select r.amostra_id, s.nome_sistema
        from public.analise_reatividade_estatica r
        join public.sistemas_acidos s on s.id_sistema = r.id_sistema
    ) u
    where u.f is not null
    group by u.amostra_id
) fl on fl.amostra_id = a.id
where (select app.eh_servico_ou_postgres())
   or (select app.eh_admin())
   or (select app.membro_lcpetro())
   or a.projeto_id = any ((select app.projetos_visiveis())::uuid[]);

-- 5. Reescrever v_banco_amostras (sem subconsulta correlacionada em analise_rda)
create or replace view public.v_banco_amostras
with (security_invoker = false) as
select 'laboratorio'::text as fonte,
       a.id::text as chave,
       a.id as amostra_id,
       a.codigo, a.litologia, a.tipo_origem, a.status, a.finalidade, a.tipo_amostra,
       a.empresa, a.projeto, a.projeto_id,
       a.diametro_cm, a.comprimento_cm, a.porosidade_pct, a.k_gas_md, a.fluidos,
       a.n_rda,
       coalesce(rc.n_com_res, 0::bigint) as n_rda_com_resultado,
       null::text as id_referencia,
       null::text as referencia,
       null::text as id_rocha,
       null::text as composicao_rocha,
       null::numeric as temperatura_min_c,
       null::numeric as temperatura_max_c
from public.v_amostras a
left join (
    select amostra_id, count(*)::bigint as n_com_res
    from public.analise_rda
    where taxa_reacao_mol_cm2_s is not null
    group by amostra_id
) rc on rc.amostra_id = a.id
union all
select 'literatura'::text as fonte,
       (d.id_rocha || '@'::text) || d.id_referencia as chave,
       null::uuid as amostra_id,
       (d.id_rocha || ' · '::text) || d.id_referencia as codigo,
       min(d.litologia) as litologia,
       'literatura'::text as tipo_origem,
       'sem disco físico'::text as status,
       'RDA'::text as finalidade,
       'disco'::text as tipo_amostra,
       null::text as empresa,
       null::text as projeto,
       null::uuid as projeto_id,
       round(avg(d.dim_h_in) * 2.54, 2) as diametro_cm,
       null::numeric as comprimento_cm,
       null::numeric as porosidade_pct,
       null::numeric as k_gas_md,
       string_agg(distinct d.acido, ', '::text order by d.acido) as fluidos,
       count(*) as n_rda,
       count(d.taxa_reacao_mol_cm2_s) as n_rda_com_resultado,
       d.id_referencia,
       ((min(d.referencia_autor) || ' ('::text) || coalesce(min(d.ano)::text, '?'::text)) || ')'::text as referencia,
       d.id_rocha,
       min(d.composicao_rocha) as composicao_rocha,
       min(d.temperatura_c) as temperatura_min_c,
       max(d.temperatura_c) as temperatura_max_c
from public.v_lit_dados_rda d
where (select app.eh_servico_ou_postgres())
   or (select app.logado())
group by d.id_rocha, d.id_referencia;

revoke all on public.v_amostras, public.v_banco_amostras from anon;
grant select on public.v_amostras, public.v_banco_amostras to authenticated, service_role;

-- 6. Otimizar views de literatura (substituir subconsultas correlacionadas por hash joins GROUP BY)
create or replace view public.v_lit_dados_rda
with (security_invoker = true) as
select
    d.id_ensaio,
    d.id_referencia,
    pu.autor as referencia_autor,
    d.ano,
    d.id_rocha,
    ro.litologia,
    ro.composicao_texto as composicao_rocha,
    ro.calcita_pct,
    ro.dolomita_pct,
    ro.razao_ca_mg,
    d.dim_h_in,
    d.dim_d_in,
    d.id_sistema,
    s.nome_sistema,
    s.componente_1 as acido,
    s.valor_1 as conc_valor,
    s.unidade_1 as conc_unidade,
    s.conc_pct,
    s.conc_m,
    s.aditivos,
    d.temperatura_c,
    d.temperatura_nominal_c,
    d.pressao_psi,
    d.tipo_variavel,
    d.rotacao_rpm,
    round(d.omega_rad_s, 2) as omega_rad_s,
    round(d.raiz_omega, 3) as raiz_omega,
    d.shear_rate_s1,
    d.taxa_reacao_mol_cm2_s,
    d.taxa_reacao_mol_m2_s,
    d.coef_difusao_cm2_s,
    d.metodo_coef_difusao,
    d.metodo_quantificacao,
    d.obtencao_dado,
    d.cor_celula,
    d.variavel_original,
    d.sistema_original,
    d.criado_em,
    d.atualizado_em,
    d.origem_registro,
    d.fonte_local,
    d.observacao,
    d.unidades_originais,
    d.conferido,
    d.conferido_em,
    d.criado_por,
    coalesce(pen.n_a_conferir, 0::bigint) as n_a_conferir
from public.lit_dados_rda d
join public.publicacoes pu on pu.id_referencia = d.id_referencia
join public.lit_rochas ro on ro.id_rocha = d.id_rocha
join public.v_sistemas_acidos s on s.id_sistema = d.id_sistema
left join (
    select p.id_ensaio, count(*)::bigint as n_a_conferir
    from public.v_lit_pendencias p
    where p.gravidade = any (array['erro'::text, 'conferir'::text])
    group by p.id_ensaio
) pen on pen.id_ensaio = d.id_ensaio;

create or replace view public.v_lit_conferencia
with (security_invoker = true) as
select
    pu.id_referencia,
    pu.autor,
    pu.ano,
    coalesce(m.n_medidas, 0::bigint) as n_medidas,
    coalesce(m.n_conferidas, 0::bigint) as n_conferidas,
    coalesce(m.n_pelo_painel, 0::bigint) as n_pelo_painel,
    coalesce(pen.n_a_conferir, 0::bigint) as n_a_conferir,
    coalesce(pen.n_incompletas, 0::bigint) as n_incompletas
from public.publicacoes pu
left join (
    select
        d.id_referencia,
        count(d.id_ensaio)::bigint as n_medidas,
        count(d.id_ensaio) filter (where d.conferido)::bigint as n_conferidas,
        count(d.id_ensaio) filter (where d.origem_registro = 'formulario'::text)::bigint as n_pelo_painel
    from public.lit_dados_rda d
    group by d.id_referencia
) m on m.id_referencia = pu.id_referencia
left join (
    select
        p.id_referencia,
        count(*) filter (where p.gravidade = any (array['erro'::text, 'conferir'::text]))::bigint as n_a_conferir,
        count(*) filter (where p.gravidade = 'incompleto'::text)::bigint as n_incompletas
    from public.v_lit_pendencias p
    group by p.id_referencia
) pen on pen.id_referencia = pu.id_referencia
where pu.categoria = 'geral'::text;

create or replace view public.v_publicacoes
with (security_invoker = true) as
select
    p.id_referencia,
    p.categoria,
    p.tipo,
    p.autor,
    p.ano,
    p.ano_ordem,
    p.titulo,
    p.periodico,
    p.doi,
    p.resumo,
    p.palavras_chave,
    p.eixos,
    p.projeto_id,
    p.criado_em,
    p.empresa_id,
    coalesce(r.n_dados_rda, 0::bigint) as n_dados_rda,
    coalesce(a.n_amostras, 0::bigint) as n_amostras,
    coalesce(pv.n_dados_pvbt, 0::bigint) as n_dados_pvbt
from public.publicacoes p
left join (
    select id_referencia, count(*)::bigint as n_dados_rda
    from public.lit_dados_rda
    group by id_referencia
) r on r.id_referencia = p.id_referencia
left join (
    select id_referencia, count(*)::bigint as n_amostras
    from public.publicacao_amostras
    group by id_referencia
) a on a.id_referencia = p.id_referencia
left join (
    select id_referencia, count(*)::bigint as n_dados_pvbt
    from public.lit_dados_pvbt
    group by id_referencia
) pv on pv.id_referencia = p.id_referencia;

analyze;
notify pgrst, 'reload schema';

