-- =============================================================================
-- 029 (pacote "023" de reatividade) — miniplugs na dissolução estática e cálculo
-- completo da dissolução dinâmica (RDA) com coeficiente de difusão (Levich)
--
-- Adaptada ao banco atual:
--  * o miniplug usa o que a 027 já criou: amostras.tipo_amostra = 'mini_plug' e
--    amostras.amostra_mae_id (rocha de onde foi cortado). Não cria colunas novas
--    em amostras e não mexe em v_amostras (que já expõe tipo_amostra,
--    amostra_mae_id e amostra_mae_codigo, com o mascaramento da 024).
--  * RLS no padrão InitPlan da 024.
-- Pode ser rodada de novo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Prefixo MP = miniplug
-- -----------------------------------------------------------------------------
insert into public.prefixos_codigo (prefixo, significado, tipo_amostra)
values ('MP', 'Miniplug (dissolução estática)', 'mini_plug')
on conflict (prefixo) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Dissolução estática: miniplug + ensaio numa operação só
-- -----------------------------------------------------------------------------
alter table public.analise_reatividade_estatica
    add column if not exists area_cm2 numeric,
    add column if not exists taxa_dissolucao_g_cm2_min numeric
        generated always as ((massa_inicial_g - massa_final_g) / nullif(area_cm2, 0) / nullif(tempo_min, 0)) stored;
comment on column public.analise_reatividade_estatica.area_cm2 is 'área exposta ao ácido (cm²); com ela o banco calcula a perda de massa por área e por minuto';

create or replace function public.estatica_cadastrar(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    am jsonb := coalesce(p -> 'amostra', '{}'::jsonb);
    en jsonb := coalesce(p -> 'ensaio', '{}'::jsonb);
    v_codigo text := nullif(upper(btrim(am ->> 'codigo')), '');
    v_amostra uuid; v_proj uuid; v_origem uuid; v_nova boolean := false; v_ensaio bigint;
begin
    if v_codigo is not null then
        select id, projeto_id into v_amostra, v_proj from amostras where upper(codigo) = v_codigo;
    end if;
    if v_amostra is null then
        if am ->> 'projeto_id' is null or am ->> 'litologia' is null then
            raise exception 'Miniplug novo: informe projeto e litologia' using errcode = '22023';
        end if;
        if not ((select app.eh_admin()) or (am ->> 'projeto_id')::uuid = any ((select app.projetos_editaveis())::uuid[])) then
            raise exception 'Sem permissão: é preciso ser editor do projeto' using errcode = '42501';
        end if;
        if nullif(btrim(am ->> 'amostra_origem'), '') is not null then
            select id into v_origem from amostras where upper(codigo) = upper(btrim(am ->> 'amostra_origem'));
            if v_origem is null then
                raise exception 'Amostra de origem % não encontrada', am ->> 'amostra_origem' using errcode = '23503';
            end if;
        end if;
        insert into amostras (codigo, projeto_id, litologia, tipo_origem, tipo_amostra, finalidade, amostra_mae_id,
                              diametro_cm, comprimento_cm, massa_seca_g, observacoes, status)
        values (coalesce(v_codigo, app.proximo_codigo('public.amostras', 'codigo', 'MP', 3)),
                (am ->> 'projeto_id')::uuid, am ->> 'litologia', coalesce(am ->> 'tipo_origem', 'afloramento'),
                'mini_plug', 'reatividade estática', v_origem,
                (am ->> 'diametro_cm')::numeric, (am ->> 'comprimento_cm')::numeric, (am ->> 'massa_seca_g')::numeric,
                am ->> 'observacoes', 'utilizada')
        returning id, codigo into v_amostra, v_codigo;
        v_nova := true;
    elsif am ->> 'projeto_id' is not null and v_proj <> (am ->> 'projeto_id')::uuid then
        raise exception 'O código % já existe em outro projeto', v_codigo using errcode = '23505';
    end if;

    insert into analise_reatividade_estatica (amostra_id, data_ensaio, id_sistema, temperatura_c, pressao_psi,
        volume_acido_ml, tempo_min, massa_inicial_g, massa_final_g, area_cm2, responsavel, observacoes)
    select v_amostra, x.data_ensaio, x.id_sistema, x.temperatura_c, x.pressao_psi, x.volume_acido_ml, x.tempo_min,
           x.massa_inicial_g, x.massa_final_g, x.area_cm2, x.responsavel, x.observacoes
      from jsonb_to_record(en) as x(data_ensaio date, id_sistema text, temperatura_c numeric, pressao_psi numeric,
           volume_acido_ml numeric, tempo_min numeric, massa_inicial_g numeric, massa_final_g numeric, area_cm2 numeric,
           responsavel text, observacoes text)
    returning id into v_ensaio;
    return jsonb_build_object('amostra_id', v_amostra, 'codigo', v_codigo, 'amostra_nova', v_nova, 'ensaio_id', v_ensaio);
end $$;

create or replace function public.proximo_codigo_miniplug()
returns text language sql stable security invoker set search_path = public as $$
    select 'MP' || lpad((coalesce(max(substring(codigo from '^MP(\d+)$')::bigint), 0) + 1)::text, 3, '0')
      from amostras where codigo ~ '^MP\d+$'
$$;

-- -----------------------------------------------------------------------------
-- 3. RDA: boletim completo em analise_rda + leituras
-- -----------------------------------------------------------------------------
alter table public.analise_rda
    add column if not exists mineral text check (mineral in ('calcita', 'dolomita')),
    add column if not exists porosidade_pct numeric,
    add column if not exists massa_antes_g numeric,
    add column if not exists massa_depois_g numeric,
    add column if not exists conc_inicial_mol_l numeric,
    add column if not exists area_corrigida_cm2 numeric,
    add column if not exists taxa_so_ca double precision,
    add column if not exists taxa_ca_mg double precision,
    add column if not exists inclinacao_h double precision,
    add column if not exists r2_h numeric,
    add column if not exists n_pontos integer,
    add column if not exists tempo_maximo_s numeric,
    add column if not exists calibracao_ca jsonb,
    add column if not exists calibracao_mg jsonb,
    add column if not exists estudo text,
    add column if not exists operadores text,
    add column if not exists data_inicio date,
    add column if not exists data_fim date,
    add column if not exists metodo_taxa text;
alter table public.analise_rda
    add column if not exists perda_massa_pct numeric
        generated always as (100 * (massa_antes_g - massa_depois_g) / nullif(massa_antes_g, 0)) stored;
comment on column public.analise_rda.metodo_taxa is 'como a taxa foi obtida, ex.: "boletim: 2·|d[H+]/dt| / área corrigida (0–1800 s)"';
comment on column public.analise_rda.calibracao_ca is '{inclinacao, diluicao, massaMolar, data} da curva Abs = k·[Ca²⁺]';

drop view if exists public.v_rda_comparacao;
drop view if exists public.v_analise_rda;
create view public.v_analise_rda
with (security_invoker = true) as
select r.*, a.codigo as amostra, a.litologia, a.projeto_id,
       s.nome_sistema, s.componente_1 as acido, s.valor_1 as conc_valor, s.unidade_1 as conc_unidade,
       s.conc_m, s.conc_pct, s.aditivos,
       case when r.taxa_reacao_mol_cm2_s is null then 'aguardando resultado' else 'com resultado' end as situacao
from public.analise_rda r
join public.amostras a on a.id = r.amostra_id
join public.v_sistemas_acidos s on s.id_sistema = r.id_sistema;

create view public.v_rda_comparacao
with (security_invoker = true) as
select 'literatura'::text     as fonte,
       d.id_ensaio             as id,
       d.referencia_autor || ' (' || coalesce(d.ano::text, '?') || ')' as rotulo,
       null::uuid              as projeto_id,
       d.litologia, d.acido, d.conc_m, d.aditivos, d.temperatura_nominal_c, d.pressao_psi,
       d.rotacao_rpm, d.raiz_omega, d.taxa_reacao_mol_m2_s, d.obtencao_dado,
       d.id_sistema, d.temperatura_c, d.tipo_variavel, d.shear_rate_s1, d.id_referencia as serie, d.conferido
from public.v_lit_dados_rda d
union all
select 'lcpetro', r.id::text, r.amostra, r.projeto_id,
       r.litologia, r.acido, r.conc_m, r.aditivos, r.temperatura_nominal_c, r.pressao_psi,
       r.rotacao_rpm, round(r.raiz_omega, 3), r.taxa_reacao_mol_m2_s, 'medida no LC PETRO',
       r.id_sistema, r.temperatura_c, r.tipo_variavel, r.shear_rate_s1, coalesce(r.serie, r.amostra), true
from public.v_analise_rda r
where r.taxa_reacao_mol_cm2_s is not null;
grant select on public.v_analise_rda, public.v_rda_comparacao to authenticated, service_role;
revoke all on public.v_analise_rda, public.v_rda_comparacao from anon;

create table if not exists public.rda_leituras (
    analise_id  bigint not null references public.analise_rda(id) on delete cascade,
    ordem       integer not null,
    rotulo      text,
    tempo_s     numeric not null,
    abs_ca      numeric,
    abs_mg      numeric,
    ca_mol_l    double precision,
    mg_mol_l    double precision,
    h_mol_l     double precision,
    usado       boolean not null default true,
    primary key (analise_id, ordem)
);

-- -----------------------------------------------------------------------------
-- 4. Viscosidade do fluido (literatura) e séries RDA (Levich → Sc → D)
-- -----------------------------------------------------------------------------
create table if not exists public.viscosidade_fluido (
    id_sistema      text not null references public.sistemas_acidos(id_sistema) on update cascade,
    temperatura_c   numeric not null,
    viscosidade_cinematica_cm2_s numeric not null check (viscosidade_cinematica_cm2_s > 0),
    fonte           text,
    criado_por      uuid default auth.uid() references public.perfis(id),
    criado_em       timestamptz not null default now(),
    primary key (id_sistema, temperatura_c)
);

create table if not exists public.rda_series (
    id              bigint generated always as identity primary key,
    projeto_id      uuid not null references public.projetos(id),
    nome            text not null,
    litologia       text references public.litologias(nome) on update cascade,
    id_sistema      text references public.sistemas_acidos(id_sistema) on update cascade,
    temperatura_c   numeric,
    c0_mol_cm3      double precision,
    viscosidade_cm2_s double precision,
    fonte_viscosidade text,
    diametro_cm     numeric,
    modo_omega      text not null default 'exato' check (modo_omega in ('exato', 'planilha')),
    slope           double precision,
    intercepto      double precision,
    r2              numeric,
    sc              double precision,
    d_cm2_s         double precision,
    residuo_levich  numeric,
    reynolds_max    numeric,
    regime          text,
    avisos          jsonb,
    calculado_em    timestamptz,
    observacoes     text,
    criado_por      uuid default auth.uid() references public.perfis(id),
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now(),
    unique (projeto_id, nome)
);
create index if not exists rda_series_projeto_idx on public.rda_series (projeto_id);

drop trigger if exists rda_series_atualizado on public.rda_series;
create trigger rda_series_atualizado before update on public.rda_series for each row execute function public.tg_atualizado_em();
drop trigger if exists rda_series_historico on public.rda_series;
create trigger rda_series_historico after insert or update or delete on public.rda_series
    for each row execute function public.tg_historico('id');

create or replace view public.v_rda_series
with (security_invoker = true) as
select
    s.*,
    coalesce(cnt.n_discos, 0::bigint) as n_discos,
    rot.por_rotacao
from public.rda_series s
left join (
    select a.projeto_id, r.serie, count(*)::bigint as n_discos
    from public.analise_rda r
    join public.amostras a on a.id = r.amostra_id
    where r.serie is not null
    group by a.projeto_id, r.serie
) cnt on cnt.projeto_id = s.projeto_id and cnt.serie = s.nome
left join (
    select
        g.projeto_id,
        g.serie,
        jsonb_agg(
            jsonb_build_object(
                'rotacao_rpm', g.rotacao_rpm,
                'n', g.n,
                'taxa_media', g.media,
                'taxa_desvio', g.desvio,
                'discos', g.discos
            )
            order by g.rotacao_rpm
        ) as por_rotacao
    from (
        select
            a.projeto_id,
            r.serie,
            r.rotacao_rpm,
            count(*) as n,
            avg(r.taxa_reacao_mol_cm2_s) as media,
            stddev_samp(r.taxa_reacao_mol_cm2_s) as desvio,
            array_agg(a.codigo order by a.codigo) as discos
        from public.analise_rda r
        join public.amostras a on a.id = r.amostra_id
        where r.serie is not null and r.taxa_reacao_mol_cm2_s is not null
        group by a.projeto_id, r.serie, r.rotacao_rpm
    ) g
    group by g.projeto_id, g.serie
) rot on rot.projeto_id = s.projeto_id and rot.serie = s.nome;

-- -----------------------------------------------------------------------------
-- 5. Acesso (RLS com InitPlan alinhado à 024)
-- -----------------------------------------------------------------------------
alter table public.rda_leituras enable row level security;
alter table public.viscosidade_fluido enable row level security;
alter table public.rda_series enable row level security;

drop policy if exists rda_leituras_ler on public.rda_leituras;
drop policy if exists rda_leituras_escrever on public.rda_leituras;
create policy rda_leituras_ler on public.rda_leituras for select
    using (analise_id in (select r.id from public.analise_rda r));
create policy rda_leituras_escrever on public.rda_leituras for all
    using (
        analise_id in (
            select r.id from public.analise_rda r
            join public.amostras a on a.id = r.amostra_id
            where (select app.eh_admin())
               or a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
        )
    )
    with check (
        analise_id in (
            select r.id from public.analise_rda r
            join public.amostras a on a.id = r.amostra_id
            where (select app.eh_admin())
               or a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
        )
    );

drop policy if exists viscosidade_fluido_ler on public.viscosidade_fluido;
drop policy if exists viscosidade_fluido_escrever on public.viscosidade_fluido;
create policy viscosidade_fluido_ler on public.viscosidade_fluido for select
    using ((select app.logado()));
create policy viscosidade_fluido_escrever on public.viscosidade_fluido for all
    using ((select app.eh_editor()))
    with check ((select app.eh_editor()));

drop policy if exists rda_series_ler on public.rda_series;
drop policy if exists rda_series_escrever on public.rda_series;
create policy rda_series_ler on public.rda_series for select
    using (
        (select app.eh_admin())
        or projeto_id = any ((select app.projetos_visiveis())::uuid[])
    );
create policy rda_series_escrever on public.rda_series for all
    using (
        (select app.eh_admin())
        or projeto_id = any ((select app.projetos_editaveis())::uuid[])
    )
    with check (
        (select app.eh_admin())
        or projeto_id = any ((select app.projetos_editaveis())::uuid[])
    );

grant select, insert, update, delete on public.rda_leituras, public.viscosidade_fluido, public.rda_series to authenticated, service_role;
grant select on public.v_rda_series to authenticated, service_role;
revoke all on public.rda_leituras, public.viscosidade_fluido, public.rda_series, public.v_rda_series from anon;
grant execute on function public.estatica_cadastrar(jsonb), public.proximo_codigo_miniplug() to authenticated, service_role;
revoke execute on function public.estatica_cadastrar(jsonb), public.proximo_codigo_miniplug() from anon, public;

analyze;
notify pgrst, 'reload schema';
