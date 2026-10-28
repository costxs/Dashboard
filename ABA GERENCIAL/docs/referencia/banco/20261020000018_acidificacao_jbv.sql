-- =============================================================================
-- 018 · Tratamento de dados de coreflooding — ACIDIFICAÇÃO (equipamento JBV; DCI depois)
-- O resultado vai para analise_coreflooding (vazão, PVbt, ΔP...) e as FASES do ensaio
-- (pré-fluxo, ácido, pós-fluxo), detectadas pela garrafa que estava sendo bombeada, ficam em
-- acidificacao_fases. As curvas ΔP × tempo e ΔP × PV vão para curvas/curva_pontos.
-- =============================================================================
alter table public.analise_coreflooding
    add column if not exists equipamento_aquisicao    text check (equipamento_aquisicao in ('JBV', 'DCI')),
    add column if not exists volume_poroso_usado_cm3  numeric check (volume_poroso_usado_cm3 > 0),
    add column if not exists volume_acido_bt_cm3      numeric check (volume_acido_bt_cm3 >= 0),
    add column if not exists criterio_bt              text,       -- 'ΔP ≤ 3 psi (Set Point) por 3 leituras seguidas'
    add column if not exists pvbt_equipamento         numeric,    -- o que o próprio equipamento calculou
    add column if not exists arquivo_origem           text;

alter table public.analise_petrofisica
    add column if not exists equipamento_aquisicao    text check (equipamento_aquisicao in ('JBV', 'DCI'));

create table if not exists public.acidificacao_fases (
    id               bigint generated always as identity primary key,
    analise_id       bigint not null references public.analise_coreflooding(id) on delete cascade,
    ordem            integer not null,
    garrafa          integer check (garrafa between 1 and 8),   -- vazio se veio só do rótulo do pesquisador
    rotulo           text,                 -- "<fluido> @<Q>", igual à separação do pesquisador
    papel            text not null check (papel in ('pre_fluxo', 'acido', 'pos_fluxo', 'outro')),
    fluido           text,                 -- escolhido pela pessoa (a planilha do JBV não diz)
    t_inicio_s       numeric,
    t_fim_s          numeric,
    n_pontos         integer,
    volume_cm3       numeric,
    vazao_ml_min     numeric,
    dp_inicial_psi   numeric,
    dp_final_psi     numeric,
    dp_max_psi       numeric,
    unique (analise_id, ordem)
);

alter table public.acidificacao_fases enable row level security;
create policy acidificacao_fases_ler on public.acidificacao_fases for select
    using (exists (select 1 from public.analise_coreflooding c
                   where c.id = analise_id and app.pode_ver_amostra(c.amostra_id)));
create policy acidificacao_fases_escrever on public.acidificacao_fases for all
    using (exists (select 1 from public.analise_coreflooding c
                   where c.id = analise_id and app.pode_editar_amostra(c.amostra_id)))
    with check (exists (select 1 from public.analise_coreflooding c
                        where c.id = analise_id and app.pode_editar_amostra(c.amostra_id)));
grant select, insert, update, delete on public.acidificacao_fases to authenticated;
revoke all on public.acidificacao_fases from anon;

notify pgrst, 'reload schema';
