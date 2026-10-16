-- =============================================================================
-- 013 · Permeabilidade do fabricante em FAIXA
-- A planilha de controle de rochas traz a permeabilidade do fornecedor como faixa
-- ("30-50", "70-115", "2 - 4 md"), nas duas tabelas (coreflooding e RDA).
-- Guardamos mínimo e máximo; valor único = mínimo e máximo iguais.
-- =============================================================================
alter table public.amostras
    add column if not exists permeabilidade_fabricante_min_md numeric check (permeabilidade_fabricante_min_md >= 0),
    add column if not exists permeabilidade_fabricante_max_md numeric check (permeabilidade_fabricante_max_md >= 0);
alter table public.amostras drop constraint if exists perm_fabricante_faixa_ordem;
alter table public.amostras add constraint perm_fabricante_faixa_ordem
    check (permeabilidade_fabricante_min_md is null or permeabilidade_fabricante_max_md is null
           or permeabilidade_fabricante_min_md <= permeabilidade_fabricante_max_md);

-- quem já tinha um valor único passa a ter min = max = valor
update public.amostras
   set permeabilidade_fabricante_min_md = permeabilidade_fabricante_md,
       permeabilidade_fabricante_max_md = permeabilidade_fabricante_md
 where permeabilidade_fabricante_md is not null and permeabilidade_fabricante_min_md is null;

create or replace view public.v_amostras
with (security_invoker = true) as
select
    a.id, a.codigo, a.litologia, a.tipo_origem, a.status, a.finalidade,
    e.sigla                         as empresa,
    e.id                            as empresa_id,
    p.codigo                        as projeto,
    a.projeto_id,
    a.afloramento_local, a.fornecedor, a.bacia, a.campo, a.poco, a.reservatorio, a.profundidade_m,
    a.diametro_cm, a.comprimento_cm, a.massa_seca_g, a.permeabilidade_fabricante_md,
    pa.porosidade_pct,
    pa.permeabilidade_gas_md        as k_gas_md,
    pa.permeabilidade_liquido_md    as k_liquido_md,
    pa.pressao_confinamento_psi,
    round((pi() * (a.diametro_cm / 2) ^ 2 * a.comprimento_cm * pa.porosidade_pct / 100)::numeric, 3)
                                    as volume_poroso_cm3,
    pd.permeabilidade_liquido_md    as k_liquido_depois_md,
    cf.pvbt, cf.breakthrough, cf.razao_dp,
    (select count(*) from public.analise_petrofisica x where x.amostra_id = a.id) as n_petrofisica,
    (select count(*) from public.analise_microct x where x.amostra_id = a.id)     as n_microct,
    (select count(*) from public.analise_coreflooding x where x.amostra_id = a.id) as n_coreflooding,
    (select count(*) from public.analise_reatividade_estatica x where x.amostra_id = a.id) as n_reatividade,
    (select count(*) from public.analise_rda x where x.amostra_id = a.id)         as n_rda,
    (select count(*) from public.analise_drx x where x.amostra_id = a.id)         as n_drx,
    (select count(*) from public.analise_petrografia x where x.amostra_id = a.id) as n_petrografia,
    (select count(*) from public.analise_mev x where x.amostra_id = a.id)         as n_mev,
    a.criado_em, a.atualizado_em,
    -- ---- novas (011) ----
    coalesce(
        case when a.finalidade ilike '%rda%' then 'disco'
             when a.finalidade ilike '%core%' then 'plug' end,
        pc.tipo_amostra,
        case when a.comprimento_cm < 3 then 'disco' when a.comprimento_cm >= 3 then 'plug' end
    )                               as tipo_amostra,
    substring(a.codigo from '^[A-Za-z]+') as prefixo,
    pc.significado                  as significado_prefixo,
    coalesce(fl.realizados,
             (select trim(m[1]) || ' ' || trim(m[2]) || ' (previsto)'
              from regexp_match(a.observacoes, 'Utiliza[cç][aã]o:[^\[]*?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +]*?)\s*\[([^\]]+)\]') m)
    )                               as fluidos,
    -- ---- novas (013) ----
    a.permeabilidade_fabricante_min_md,
    a.permeabilidade_fabricante_max_md
from public.amostras a
join public.projetos p  on p.id = a.projeto_id
join public.empresas e  on e.id = p.empresa_id
left join public.prefixos_codigo pc on pc.prefixo = upper(substring(a.codigo from '^[A-Za-z]+'))
left join lateral (select * from public.analise_petrofisica x
                   where x.amostra_id = a.id and x.momento = 'antes'
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) pa on true
left join lateral (select * from public.analise_petrofisica x
                   where x.amostra_id = a.id and x.momento = 'depois'
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) pd on true
left join lateral (select * from public.analise_coreflooding x
                   where x.amostra_id = a.id
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) cf on true
left join lateral (
    select string_agg(distinct f, ' · ') as realizados
    from (
        select coalesce(nullif(trim(concat_ws(' ', c.acido, c.conc_valor::text, c.conc_unidade)), ''), s.nome_sistema) as f
        from public.analise_coreflooding c left join public.sistemas_acidos s on s.id_sistema = c.id_sistema
        where c.amostra_id = a.id
        union all
        select s.nome_sistema from public.analise_rda r join public.sistemas_acidos s on s.id_sistema = r.id_sistema
        where r.amostra_id = a.id
        union all
        select s.nome_sistema from public.analise_reatividade_estatica r join public.sistemas_acidos s on s.id_sistema = r.id_sistema
        where r.amostra_id = a.id
    ) u where f is not null
) fl on true;
