-- =============================================================================
-- 015 · Tratamento de dados de coreflooding — PERMEABILIDADE
-- O resultado do tratamento vira uma petrofísica da amostra (k em fluxo) e guarda:
--   * as ETAPAS por vazão (Q, trecho estável usado, ΔP médio, volumes, k da etapa)
--   * a curva ΔP × tempo (em curvas/curva_pontos, já existentes)
-- =============================================================================
alter table public.analise_petrofisica
    add column if not exists viscosidade_cp  numeric check (viscosidade_cp > 0),
    add column if not exists fluido          text,            -- 'KCl 2%'
    add column if not exists metodo_k        text,            -- 'ajuste ΔP × Q' | 'média das etapas' | 'manual'
    add column if not exists arquivo_origem  text;            -- nome do arquivo do equipamento

create table if not exists public.permeabilidade_etapas (
    id                   bigint generated always as identity primary key,
    analise_id           bigint not null references public.analise_petrofisica(id) on delete cascade,
    ordem                integer not null,
    vazao_ml_min         numeric not null check (vazao_ml_min > 0),
    t_inicio_s           numeric,
    t_fim_s              numeric,
    janela_inicio_s      numeric,                          -- trecho estável usado no cálculo
    janela_fim_s         numeric,
    n_pontos             integer,
    dp_medio_psi         numeric,
    dp_desvio_psi        numeric,
    volume_injetado_cm3  numeric,                          -- Q × duração
    volume_bombeado_cm3  numeric,                          -- pela bomba
    k_md                 numeric,
    k_equipamento_md     numeric,
    estavel              boolean,
    usada                boolean not null default true,    -- entrou no k final?
    unique (analise_id, ordem)
);

alter table public.permeabilidade_etapas enable row level security;
create policy permeabilidade_etapas_ler on public.permeabilidade_etapas for select
    using (exists (select 1 from public.analise_petrofisica a
                   where a.id = analise_id and app.pode_ver_amostra(a.amostra_id)));
create policy permeabilidade_etapas_escrever on public.permeabilidade_etapas for all
    using (exists (select 1 from public.analise_petrofisica a
                   where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)))
    with check (exists (select 1 from public.analise_petrofisica a
                        where a.id = analise_id and app.pode_editar_amostra(a.amostra_id)));
grant select, insert, update, delete on public.permeabilidade_etapas to authenticated;
revoke all on public.permeabilidade_etapas from anon;
