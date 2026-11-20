-- =============================================================================
-- 025 · Reatividade Estática (t50), Sondagem Piloto, 4 Estágios (Triplicata)
--       e Absorção Atômica (Ca²⁺, Mg²⁺ e H⁺ residual)
--
-- Tabelas:
--   - public.reatividade_ensaios
--   - public.reatividade_sondagem_t50
--   - public.reatividade_pontos
--   - public.reatividade_calibracao_aa
--
-- RLS alinhado à 021/024 (InitPlan por projeto/empresa da amostra vinculada).
-- =============================================================================

create sequence if not exists public.seq_reatividade_rea start 1;
create sequence if not exists public.seq_reatividade_rda start 1;

create table if not exists public.reatividade_ensaios (
    id uuid primary key default gen_random_uuid(),
    codigo text unique, -- Gerado automaticamente: REA-0001 ou RDA-0001
    amostra_id uuid references public.amostras(id) on delete cascade,
    id_sistema text references public.sistemas_acidos(id_sistema),
    id_referencia text references public.publicacoes(id_referencia),
    geometria text not null default 'mini_plug' check (geometria in ('mini_plug', 'disco')),
    modalidade text not null default 'estatica' check (modalidade in ('estatica', 'dinamica_rda')),
    litologia text not null default 'calcario' check (litologia in ('calcario', 'dolomita', 'outro')),
    data_ensaio date,
    operador text,

    -- Condições da solução ácida (Entrada do pesquisador)
    ph_inicial numeric,
    h_inicial_mol_l numeric default 4.4,
    volume_solucao_ml numeric,
    temperatura_c numeric default 25,
    rpm_rda numeric,

    -- Teste piloto escolhido para definir o t50
    m0_sondagem_g numeric,
    tempo_sondagem_min numeric,
    mf_sondagem_g numeric,
    t50_min numeric generated always as (
        case
            when m0_sondagem_g > 0 and mf_sondagem_g < m0_sondagem_g and tempo_sondagem_min > 0
            then (m0_sondagem_g * tempo_sondagem_min) / (2.0 * (m0_sondagem_g - mf_sondagem_g))
            else null
        end
    ) stored,

    -- Curva de calibração da Absorção Atômica (ABS = slope * C_mg_L + intercept)
    cal_ca_slope numeric default 0.0383,
    cal_ca_intercept numeric default 0.0037,
    cal_mg_slope numeric,
    cal_mg_intercept numeric,
    massa_molar_ca numeric default 40.078,
    massa_molar_mg numeric default 24.305,

    -- Regressão linear da perda de massa (y = m*x + n)
    modo_calculo_pct text not null default 'media_replicas'
        check (modo_calculo_pct in ('media_replicas', 'razao_medias')),
    taxa_dissolucao_m numeric,
    taxa_dissolucao_n numeric,
    taxa_dissolucao_r2 numeric,

    -- Estilo padrão Origin + posição salva da caixa de legenda [x, y]
    config_grafico jsonb default '{
        "legend_xy": [0.04, 0.94],
        "legend_frame": true,
        "legend_fontsize": 9,
        "font_family": "Arial",
        "show_error_bars": true,
        "show_trendline": true
    }'::jsonb,
    observacoes text,
    created_at timestamptz default now()
);

-- Gera REA-#### ou RDA-#### automaticamente quando codigo vier nulo
create or replace function public.gerar_codigo_reatividade()
returns trigger
language plpgsql
security invoker
as $$
begin
    if new.codigo is null or btrim(new.codigo) = '' then
        if new.modalidade = 'dinamica_rda' then
            new.codigo := 'RDA-' || lpad(nextval('public.seq_reatividade_rda')::text, 4, '0');
        else
            new.codigo := 'REA-' || lpad(nextval('public.seq_reatividade_rea')::text, 4, '0');
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_codigo_reatividade on public.reatividade_ensaios;
create trigger trg_codigo_reatividade
before insert on public.reatividade_ensaios
for each row execute function public.gerar_codigo_reatividade();

-- Testes preliminares de t50 (aumentando tempo de 2 em 2 min em mini-plugues diferentes)
create table if not exists public.reatividade_sondagem_t50 (
    id uuid primary key default gen_random_uuid(),
    ensaio_id uuid not null references public.reatividade_ensaios(id) on delete cascade,
    ordem int not null,
    codigo_mini_plug text,
    massa_inicial_g numeric not null,
    tempo_contato_min numeric not null,
    massa_final_g numeric not null,
    escolhido boolean default false,
    meia_massa_g numeric generated always as (massa_inicial_g / 2.0) stored,
    taxa_g_min numeric generated always as (
        case when tempo_contato_min > 0 then (massa_final_g - massa_inicial_g) / tempo_contato_min else null end
    ) stored,
    t50_estimado_min numeric generated always as (
        case
            when massa_inicial_g > 0 and massa_final_g < massa_inicial_g and tempo_contato_min > 0
            then (massa_inicial_g * tempo_contato_min) / (2.0 * (massa_inicial_g - massa_final_g))
            else null
        end
    ) stored
);

-- 4 Estágios (T1=0.25, T2=0.50, T3=0.75, T4=1.00 do t50) × 3 Réplicas (Original, Duplicata, Triplicata)
create table if not exists public.reatividade_pontos (
    id uuid primary key default gen_random_uuid(),
    ensaio_id uuid not null references public.reatividade_ensaios(id) on delete cascade,
    estagio_ordem int not null check (estagio_ordem between 1 and 4),
    fracao_t50 numeric not null default 0.25,
    tempo_contato_s numeric not null,
    replica int not null default 1 check (replica between 1 and 3),
    codigo_mini_plug text,
    massa_inicial_g numeric not null,
    massa_final_g numeric not null,
    delta_massa_g numeric generated always as (massa_inicial_g - massa_final_g) stored,
    perda_massa_pct numeric generated always as (
        case when massa_inicial_g > 0 then ((massa_inicial_g - massa_final_g) / massa_inicial_g) * 100.0 else null end
    ) stored,
    fator_diluicao_ca numeric default 2250,
    abs_ca numeric,
    fator_diluicao_mg numeric default 1,
    abs_mg numeric
);

-- Pontos da curva de calibração da Absorção Atômica
create table if not exists public.reatividade_calibracao_aa (
    id uuid primary key default gen_random_uuid(),
    ensaio_id uuid not null references public.reatividade_ensaios(id) on delete cascade,
    elemento text not null default 'Ca' check (elemento in ('Ca', 'Mg')),
    concentracao_mg_l numeric not null,
    absorbancia_med numeric not null
);

-- Índices para FKs e ordenação
create index if not exists reatividade_ensaios_amostra_idx
    on public.reatividade_ensaios (amostra_id, created_at desc);
create index if not exists reatividade_ensaios_sistema_idx
    on public.reatividade_ensaios (id_sistema);
create index if not exists reatividade_sondagem_t50_ensaio_idx
    on public.reatividade_sondagem_t50 (ensaio_id, ordem);
create index if not exists reatividade_pontos_ensaio_idx
    on public.reatividade_pontos (ensaio_id, estagio_ordem, replica);
create index if not exists reatividade_calibracao_aa_ensaio_idx
    on public.reatividade_calibracao_aa (ensaio_id, elemento);

-- Ativa RLS e permissões
alter table public.reatividade_ensaios enable row level security;
alter table public.reatividade_sondagem_t50 enable row level security;
alter table public.reatividade_pontos enable row level security;
alter table public.reatividade_calibracao_aa enable row level security;

revoke all on public.reatividade_ensaios, public.reatividade_sondagem_t50,
              public.reatividade_pontos, public.reatividade_calibracao_aa from anon;
revoke all on sequence public.seq_reatividade_rea, public.seq_reatividade_rda from anon;

grant select, insert, update, delete on
    public.reatividade_ensaios,
    public.reatividade_sondagem_t50,
    public.reatividade_pontos,
    public.reatividade_calibracao_aa
to authenticated, service_role;

grant usage, select on sequence
    public.seq_reatividade_rea,
    public.seq_reatividade_rda
to authenticated, service_role;

-- Políticas RLS (InitPlan — mesmo padrão de analise_* e permeabilidade_etapas)
drop policy if exists reatividade_ensaios_ler on public.reatividade_ensaios;
create policy reatividade_ensaios_ler on public.reatividade_ensaios for select
    using (
        (select app.eh_admin())
        or (amostra_id is null and (select app.logado()))
        or amostra_id = any ((select app.amostras_visiveis_diretas())::uuid[])
    );

drop policy if exists reatividade_ensaios_escrever on public.reatividade_ensaios;
create policy reatividade_ensaios_escrever on public.reatividade_ensaios for all
    using (
        (select app.eh_admin())
        or (amostra_id is null and (select app.eh_editor()))
        or amostra_id in (
            select a.id from public.amostras a
            where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
        )
    )
    with check (
        (select app.eh_admin())
        or (amostra_id is null and (select app.eh_editor()))
        or amostra_id in (
            select a.id from public.amostras a
            where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
        )
    );

-- Tabelas-filhas herdam isolamento do ensaio-pai (hash semi-join, 1 avaliação por consulta)
do $$
declare t text;
begin
    foreach t in array array[
        'reatividade_sondagem_t50',
        'reatividade_pontos',
        'reatividade_calibracao_aa'
    ] loop
        execute format('drop policy if exists %1$s_ler on public.%1$s', t);
        execute format(
            'create policy %1$s_ler on public.%1$s for select using (ensaio_id in (select e.id from public.reatividade_ensaios e))',
            t
        );
        execute format('drop policy if exists %1$s_escrever on public.%1$s', t);
        execute format(
            'create policy %1$s_escrever on public.%1$s for all
                using (ensaio_id in (
                    select e.id from public.reatividade_ensaios e
                    where (select app.eh_admin())
                       or (e.amostra_id is null and (select app.eh_editor()))
                       or e.amostra_id in (
                           select a.id from public.amostras a
                           where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
                       )
                ))
                with check (ensaio_id in (
                    select e.id from public.reatividade_ensaios e
                    where (select app.eh_admin())
                       or (e.amostra_id is null and (select app.eh_editor()))
                       or e.amostra_id in (
                           select a.id from public.amostras a
                           where a.projeto_id = any ((select app.projetos_editaveis())::uuid[])
                       )
                ))',
            t
        );
    end loop;
end $$;

analyze;
notify pgrst, 'reload schema';
