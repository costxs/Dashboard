-- =============================================================================
-- 0005: views de leitura (o que o front consome) e gatilhos
-- security_invoker = true -> a view respeita as regras de acesso de quem consulta
-- =============================================================================

-- -----------------------------------------------------------------------------
-- BANCO DE AMOSTRAS: uma linha por amostra, com as métricas rápidas do card
-- -----------------------------------------------------------------------------
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
    -- petrofísica mais recente ANTES da acidificação
    pa.porosidade_pct,
    pa.permeabilidade_gas_md        as k_gas_md,
    pa.permeabilidade_liquido_md    as k_liquido_md,
    pa.pressao_confinamento_psi,
    round((pi() * (a.diametro_cm / 2) ^ 2 * a.comprimento_cm * pa.porosidade_pct / 100)::numeric, 3)
                                    as volume_poroso_cm3,
    -- petrofísica mais recente DEPOIS
    pd.permeabilidade_liquido_md    as k_liquido_depois_md,
    -- coreflooding mais recente
    cf.pvbt, cf.breakthrough, cf.razao_dp,
    -- quantas análises de cada tipo (para os ícones da ficha)
    (select count(*) from public.analise_petrofisica x where x.amostra_id = a.id) as n_petrofisica,
    (select count(*) from public.analise_microct x where x.amostra_id = a.id)     as n_microct,
    (select count(*) from public.analise_coreflooding x where x.amostra_id = a.id) as n_coreflooding,
    (select count(*) from public.analise_reatividade_estatica x where x.amostra_id = a.id) as n_reatividade,
    (select count(*) from public.analise_rda x where x.amostra_id = a.id)         as n_rda,
    (select count(*) from public.analise_drx x where x.amostra_id = a.id)         as n_drx,
    (select count(*) from public.analise_petrografia x where x.amostra_id = a.id) as n_petrografia,
    (select count(*) from public.analise_mev x where x.amostra_id = a.id)         as n_mev,
    a.criado_em, a.atualizado_em
from public.amostras a
join public.projetos p  on p.id = a.projeto_id
join public.empresas e  on e.id = p.empresa_id
left join lateral (select * from public.analise_petrofisica x
                   where x.amostra_id = a.id and x.momento = 'antes'
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) pa on true
left join lateral (select * from public.analise_petrofisica x
                   where x.amostra_id = a.id and x.momento = 'depois'
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) pd on true
left join lateral (select * from public.analise_coreflooding x
                   where x.amostra_id = a.id
                   order by x.data_ensaio desc nulls last, x.id desc limit 1) cf on true;

-- -----------------------------------------------------------------------------
-- DASHBOARD GERENCIAL: números por projeto
-- -----------------------------------------------------------------------------
create or replace view public.v_dashboard_projetos
with (security_invoker = true) as
select
    p.id as projeto_id, p.codigo as projeto, p.nome, e.sigla as empresa, e.id as empresa_id,
    count(distinct a.id)                                          as n_amostras,
    count(distinct a.id) filter (where a.status = 'em ensaio')    as n_em_ensaio,
    count(distinct a.id) filter (where a.status = 'utilizada')    as n_utilizadas,
    (select count(*) from public.work_packages w where w.projeto_id = p.id) as n_wps,
    (select round(avg(w.progresso_planejado), 1) from public.work_packages w where w.projeto_id = p.id) as progresso_planejado,
    (select round(avg(w.progresso_realizado), 1) from public.work_packages w where w.projeto_id = p.id) as progresso_realizado
from public.projetos p
join public.empresas e on e.id = p.empresa_id
left join public.amostras a on a.projeto_id = p.id
group by p.id, e.sigla, e.id;

-- -----------------------------------------------------------------------------
-- RDA do laboratório com as mesmas colunas da planilha
-- -----------------------------------------------------------------------------
create or replace view public.v_analise_rda
with (security_invoker = true) as
select r.*, a.codigo as amostra, a.litologia, a.projeto_id,
       s.nome_sistema, s.componente_1 as acido, s.valor_1 as conc_valor, s.unidade_1 as conc_unidade,
       s.conc_m, s.conc_pct, s.aditivos
from public.analise_rda r
join public.amostras a on a.id = r.amostra_id
join public.v_sistemas_acidos s on s.id_sistema = r.id_sistema;

-- -----------------------------------------------------------------------------
-- LITERATURA
-- -----------------------------------------------------------------------------
create or replace view public.v_publicacoes
with (security_invoker = true) as
select pu.*,
       (select count(*) from public.lit_dados_rda d where d.id_referencia = pu.id_referencia) as n_dados_rda,
       (select count(*) from public.publicacao_amostras pa where pa.id_referencia = pu.id_referencia) as n_amostras
from public.publicacoes pu;

-- aba "ensaios" da planilha, completa, com as colunas verdes
create or replace view public.v_lit_dados_rda
with (security_invoker = true) as
select
    d.id_ensaio, d.id_referencia, pu.autor as referencia_autor, d.ano,
    d.id_rocha, ro.litologia, ro.composicao_texto as composicao_rocha,
    ro.calcita_pct, ro.dolomita_pct, ro.razao_ca_mg,
    d.dim_h_in, d.dim_d_in,
    d.id_sistema, s.nome_sistema, s.componente_1 as acido, s.valor_1 as conc_valor,
    s.unidade_1 as conc_unidade, s.conc_pct, s.conc_m, s.aditivos,
    d.temperatura_c, d.temperatura_nominal_c, d.pressao_psi, d.tipo_variavel,
    d.rotacao_rpm, round(d.omega_rad_s, 2) as omega_rad_s, round(d.raiz_omega, 3) as raiz_omega,
    d.shear_rate_s1, d.taxa_reacao_mol_cm2_s, d.taxa_reacao_mol_m2_s,
    d.coef_difusao_cm2_s, d.metodo_coef_difusao, d.metodo_quantificacao, d.obtencao_dado,
    d.cor_celula, d.variavel_original, d.sistema_original
from public.lit_dados_rda d
join public.publicacoes pu        on pu.id_referencia = d.id_referencia
join public.lit_rochas ro         on ro.id_rocha = d.id_rocha
join public.v_sistemas_acidos s   on s.id_sistema = d.id_sistema;

-- -----------------------------------------------------------------------------
-- Comparação LAB x LITERATURA (base dos gráficos de Levich, T, concentração)
-- -----------------------------------------------------------------------------
create or replace view public.v_rda_comparacao
with (security_invoker = true) as
select 'literatura'::text     as fonte,
       d.id_ensaio             as id,
       d.referencia_autor || ' (' || coalesce(d.ano::text, '?') || ')' as rotulo,
       null::uuid              as projeto_id,
       d.litologia, d.acido, d.conc_m, d.aditivos, d.temperatura_nominal_c, d.pressao_psi,
       d.rotacao_rpm, d.raiz_omega, d.taxa_reacao_mol_m2_s, d.obtencao_dado
from public.v_lit_dados_rda d
union all
select 'lcpetro', r.id::text, r.amostra, r.projeto_id,
       r.litologia, r.acido, r.conc_m, r.aditivos, r.temperatura_nominal_c, r.pressao_psi,
       r.rotacao_rpm, round(r.raiz_omega, 3), r.taxa_reacao_mol_m2_s, 'medida no LC PETRO'
from public.v_analise_rda r;

-- -----------------------------------------------------------------------------
-- Gatilhos: atualizado_em e histórico de alterações
-- -----------------------------------------------------------------------------
create table public.historico (
    id          bigint generated always as identity primary key,
    tabela      text not null,
    chave       text not null,
    projeto_id  uuid,                                    -- para filtrar quem pode ver o histórico
    operacao    text not null,
    usuario_id  uuid,
    em          timestamptz not null default now(),
    antes       jsonb,
    depois      jsonb
);
create index historico_chave_idx on public.historico (tabela, chave);

create or replace function public.tg_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create or replace function public.tg_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    chave_col text := tg_argv[0];
    linha     jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    proj      uuid;
begin
    if linha ? 'projeto_id' then
        proj := (linha ->> 'projeto_id')::uuid;
    elsif linha ? 'amostra_id' and linha ->> 'amostra_id' is not null then
        select projeto_id into proj from public.amostras where id = (linha ->> 'amostra_id')::uuid;
    end if;
    insert into public.historico (tabela, chave, projeto_id, operacao, usuario_id, antes, depois)
    values (tg_table_name, linha ->> chave_col, proj, tg_op, app.usuario_atual(),
            case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
            case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
    return null;
end $$;

do $$
declare
    t record;
begin
    for t in select * from (values
        ('amostras', 'codigo'),
        ('analise_petrofisica', 'id'), ('analise_microct', 'id'), ('analise_coreflooding', 'id'),
        ('analise_reatividade_estatica', 'id'), ('analise_rda', 'id'), ('analise_drx', 'id'),
        ('analise_petrografia', 'id'), ('analise_mev', 'id'),
        ('conferencias', 'id'), ('projetos', 'codigo'), ('work_packages', 'id'),
        ('publicacoes', 'id_referencia'), ('lit_rochas', 'id_rocha'), ('lit_dados_rda', 'id_ensaio'),
        ('sistemas_acidos', 'id_sistema'), ('fluidos_prop', 'componente'), ('litologias', 'nome')
    ) as v(tabela, chave)
    loop
        execute format('create trigger %1$s_historico after insert or update or delete on public.%1$s
                        for each row execute function public.tg_historico(%2$L)', t.tabela, t.chave);
    end loop;

    for t in select table_name as tabela from information_schema.columns
             where table_schema = 'public' and column_name = 'atualizado_em'
               and table_name in (select table_name from information_schema.tables
                                  where table_schema = 'public' and table_type = 'BASE TABLE')
    loop
        execute format('create trigger %1$s_atualizado_em before update on public.%1$s
                        for each row execute function public.tg_atualizado_em()', t.tabela);
    end loop;
end $$;
