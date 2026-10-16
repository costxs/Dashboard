-- =============================================================================
-- 0003: BANCO DE AMOSTRAS e ANÁLISES / RESULTADOS do laboratório
--
-- A amostra (plug) é o centro. Cada análise é uma tabela ligada a ela, na
-- ordem combinada na reunião:
--   1 Petrofísica   2 Micro-CT   3 Coreflooding   4 Reatividade estática
--   5 RDA           6 DRX        7 Petrografia    8 MEV
-- Uma amostra pode ter várias linhas de cada análise (ex.: petrofísica antes e
-- depois da acidificação, ou em pressões de confinamento diferentes).
-- O sigilo vem do projeto da amostra: quem não vê o projeto não vê a amostra
-- nem nenhuma análise dela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Amostras
-- -----------------------------------------------------------------------------
create table public.amostras (
    id                  uuid primary key default gen_random_uuid(),
    codigo              text not null unique,            -- 'IL076', 'RDA002'
    projeto_id          uuid not null references public.projetos(id),
    litologia           text not null references public.litologias(nome) on update cascade,

    -- ORIGEM: afloramento (outcrop) ou testemunho (de poço)
    tipo_origem         text not null check (tipo_origem in ('afloramento', 'testemunho')),
    -- afloramento
    afloramento_local   text,                            -- pedreira / localidade
    fornecedor          text,                            -- ex.: Kocurek
    bloco               text,                            -- bloco de onde o plug foi cortado
    -- testemunho
    bacia               text,
    campo               text,
    poco                text,
    reservatorio        text,
    profundidade_m      numeric,

    -- geometria e estado
    diametro_cm         numeric check (diametro_cm > 0),
    comprimento_cm      numeric check (comprimento_cm > 0),
    massa_seca_g        numeric check (massa_seca_g > 0),
    permeabilidade_fabricante_md numeric,
    finalidade          text,                            -- 'coreflooding', 'RDA', 'reatividade estática'...
    status              text not null default 'cadastrada'
                        check (status in ('cadastrada', 'em ensaio', 'utilizada', 'arquivada')),
    responsavel         text,
    data_coleta         date,
    observacoes         text,

    criado_por          uuid default auth.uid() references public.perfis(id),
    criado_em           timestamptz not null default now(),
    atualizado_em       timestamptz not null default now(),

    constraint testemunho_tem_poco check (tipo_origem <> 'testemunho' or poco is not null)
);
create index amostras_projeto_idx on public.amostras (projeto_id);
create index amostras_litologia_idx on public.amostras (litologia);

-- Conferência física das amostras (substitui a coluna "Conferência 11/08/26 - Heitor e Dulcidio")
create table public.conferencias (
    id            bigint generated always as identity primary key,
    amostra_id    uuid not null references public.amostras(id) on delete cascade,
    data          date not null,
    responsaveis  text not null,
    resultado     text not null default 'ok',            -- 'ok', 'não localizada', 'danificada'...
    observacao    text
);

-- colunas comuns a toda análise (repetidas em cada tabela abaixo):
--   id, amostra_id, data_ensaio, responsavel, observacoes, criado_por, criado_em, atualizado_em

-- -----------------------------------------------------------------------------
-- 1. PETROFÍSICA — entrada: pressão de confinamento; saída: porosidade, permeabilidade
-- -----------------------------------------------------------------------------
create table public.analise_petrofisica (
    id                        bigint generated always as identity primary key,
    amostra_id                uuid not null references public.amostras(id) on delete cascade,
    data_ensaio               date,
    momento                   text not null default 'antes'
                              check (momento in ('antes', 'depois')),   -- da acidificação
    pressao_confinamento_psi  numeric,
    porosidade_pct            numeric check (porosidade_pct between 0 and 100),
    permeabilidade_gas_md     numeric check (permeabilidade_gas_md >= 0),
    permeabilidade_liquido_md numeric check (permeabilidade_liquido_md >= 0),  -- "em fluxo"
    densidade_grao_g_cm3      numeric,
    densidade_bulk_g_cm3      numeric,
    densidade_aparente_g_cm3  numeric,
    massa_g                   numeric,
    equipamento               text,
    responsavel               text,
    observacoes               text,
    criado_por                uuid default auth.uid() references public.perfis(id),
    criado_em                 timestamptz not null default now(),
    atualizado_em             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. MICRO-CT
-- -----------------------------------------------------------------------------
create table public.analise_microct (
    id                     bigint generated always as identity primary key,
    amostra_id             uuid not null references public.amostras(id) on delete cascade,
    data_ensaio            date,
    momento                text not null default 'antes' check (momento in ('antes', 'depois')),
    resolucao_um_voxel     numeric check (resolucao_um_voxel > 0),
    porosidade_ct_pct      numeric check (porosidade_ct_pct between 0 and 100),
    volume_dissolvido_mm3  numeric,
    equipamento            text,
    responsavel            text,
    observacoes            text,
    criado_por             uuid default auth.uid() references public.perfis(id),
    criado_em              timestamptz not null default now(),
    atualizado_em          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. COREFLOODING (injeção dinâmica)
-- -----------------------------------------------------------------------------
create table public.analise_coreflooding (
    id                        bigint generated always as identity primary key,
    amostra_id                uuid not null references public.amostras(id) on delete cascade,
    data_ensaio               date,
    id_sistema                text references public.sistemas_acidos(id_sistema),
    vazao_ml_min              numeric check (vazao_ml_min > 0),
    temperatura_c             numeric,
    pressao_confinamento_psi  numeric,
    contrapressao_psi         numeric,
    breakthrough              boolean,                   -- o wormhole atravessou o plug?
    pvbt                      numeric check (pvbt > 0),  -- volumes porosos até o breakthrough
    dp_inicial_psi            numeric,
    dp_final_psi              numeric,
    -- razão de queda de pressão: indicador mais estável que k_f/k_i quando há breakthrough
    razao_dp                  numeric generated always as (dp_inicial_psi / nullif(dp_final_psi, 0)) stored,
    morfologia_wormhole       text check (morfologia_wormhole in
                              ('dissolução de face', 'cônico', 'dominante', 'ramificado', 'uniforme')),
    massa_apos_g              numeric,
    porosidade_apos_pct       numeric,
    responsavel               text,
    observacoes               text,
    criado_por                uuid default auth.uid() references public.perfis(id),
    criado_em                 timestamptz not null default now(),
    atualizado_em             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. REATIVIDADE ESTÁTICA (banho, sem fluxo -> não tem PVbt)
-- -----------------------------------------------------------------------------
create table public.analise_reatividade_estatica (
    id                 bigint generated always as identity primary key,
    amostra_id         uuid not null references public.amostras(id) on delete cascade,
    data_ensaio        date,
    id_sistema         text references public.sistemas_acidos(id_sistema),
    temperatura_c      numeric,
    pressao_psi        numeric,
    volume_acido_ml    numeric,
    tempo_min          numeric,
    massa_inicial_g    numeric check (massa_inicial_g > 0),
    massa_final_g      numeric check (massa_final_g >= 0),
    perda_massa_g      numeric generated always as (massa_inicial_g - massa_final_g) stored,
    perda_massa_pct    numeric generated always as
                       (100 * (massa_inicial_g - massa_final_g) / nullif(massa_inicial_g, 0)) stored,
    responsavel        text,
    observacoes        text,
    criado_por         uuid default auth.uid() references public.perfis(id),
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. RDA — Rotating Disk Apparatus. Entradas: rotação, pressão, temperatura
-- (mesmos campos e cálculos da planilha de reatividade, para comparar com a literatura)
-- -----------------------------------------------------------------------------
create table public.analise_rda (
    id                     bigint generated always as identity primary key,
    amostra_id             uuid not null references public.amostras(id) on delete cascade,
    data_ensaio            date,
    id_sistema             text not null references public.sistemas_acidos(id_sistema),
    rotacao_rpm            numeric check (rotacao_rpm >= 0),
    pressao_psi            numeric,
    temperatura_c          numeric,
    temperatura_nominal_c  numeric generated always as (
                               case when temperatura_c between 18 and 30 then 25
                                    else round(temperatura_c / 5) * 5 end) stored,
    omega_rad_s            numeric generated always as (rotacao_rpm * 2 * pi() / 60) stored,
    raiz_omega             numeric generated always as (sqrt(rotacao_rpm * 2 * pi() / 60)) stored,
    dim_h_in               numeric,
    dim_d_in               numeric,
    tempo_min              numeric,
    taxa_reacao_mol_cm2_s  double precision,
    taxa_reacao_mol_m2_s   double precision generated always as (taxa_reacao_mol_cm2_s * 10000) stored,
    coef_difusao_cm2_s     double precision,
    metodo_quantificacao   text,                         -- 'RDA / ICP-AES'...
    responsavel            text,
    observacoes            text,
    criado_por             uuid default auth.uid() references public.perfis(id),
    criado_em              timestamptz not null default now(),
    atualizado_em          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. DRX — difração de raios X (fases em linhas: uma por mineral)
-- -----------------------------------------------------------------------------
create table public.analise_drx (
    id             bigint generated always as identity primary key,
    amostra_id     uuid not null references public.amostras(id) on delete cascade,
    data_ensaio    date,
    metodo         text check (metodo in ('Rietveld', 'XRF', 'semiquantitativo')),
    responsavel    text,
    observacoes    text,
    criado_por     uuid default auth.uid() references public.perfis(id),
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now()
);
create table public.drx_fases (
    analise_id  bigint not null references public.analise_drx(id) on delete cascade,
    mineral     text not null,                           -- 'Calcita', 'Dolomita', 'Quartzo'...
    pct         numeric check (pct between 0 and 100),
    primary key (analise_id, mineral)
);

-- -----------------------------------------------------------------------------
-- 7. PETROGRAFIA
-- -----------------------------------------------------------------------------
create table public.analise_petrografia (
    id                 bigint generated always as identity primary key,
    amostra_id         uuid not null references public.amostras(id) on delete cascade,
    data_ensaio        date,
    lamina             text,                             -- código da lâmina delgada
    aumento            text,
    tipo_porosidade    text,                             -- 'interpartícula', 'móldica', 'vugular'...
    granulometria      text,
    descricao_textural text,
    responsavel        text,
    observacoes        text,
    criado_por         uuid default auth.uid() references public.perfis(id),
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now()
);
create table public.petrografia_componentes (
    analise_id  bigint not null references public.analise_petrografia(id) on delete cascade,
    componente  text not null,
    pct         numeric check (pct between 0 and 100),
    primary key (analise_id, componente)
);

-- -----------------------------------------------------------------------------
-- 8. MEV — microscopia eletrônica de varredura (+ EDS)
-- -----------------------------------------------------------------------------
create table public.analise_mev (
    id             bigint generated always as identity primary key,
    amostra_id     uuid not null references public.amostras(id) on delete cascade,
    data_ensaio    date,
    momento        text check (momento in ('antes', 'depois')),
    aumento        text,
    detector       text,
    descricao      text,
    responsavel    text,
    observacoes    text,
    criado_por     uuid default auth.uid() references public.perfis(id),
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now()
);
create table public.mev_eds (
    analise_id   bigint not null references public.analise_mev(id) on delete cascade,
    ponto        text not null default '1',
    elemento     text not null,                          -- 'C', 'O', 'Ca', 'Mg', 'Si'
    pct_massa    numeric,
    pct_atomico  numeric,
    primary key (analise_id, ponto, elemento)
);

-- -----------------------------------------------------------------------------
-- Curvas (ΔP x PV do coreflooding, massa x tempo da reatividade, difratograma...)
-- Ficam em linhas próprias porque podem ter milhares de pontos.
-- -----------------------------------------------------------------------------
create table public.curvas (
    id              bigint generated always as identity primary key,
    amostra_id      uuid not null references public.amostras(id) on delete cascade,
    analise_tabela  text not null,                       -- 'analise_coreflooding'...
    analise_id      bigint not null,
    nome            text not null,                       -- 'ΔP x PV injetado'
    x_grandeza      text not null,
    x_unidade       text,
    y_grandeza      text not null,
    y_unidade       text,
    criado_em       timestamptz not null default now()
);
create index curvas_analise_idx on public.curvas (analise_tabela, analise_id);

create table public.curva_pontos (
    curva_id  bigint not null references public.curvas(id) on delete cascade,
    ordem     integer not null,
    x         double precision not null,
    y         double precision not null,
    primary key (curva_id, ordem)
);

-- -----------------------------------------------------------------------------
-- Arquivos (.opju, PDFs de difratograma, imagens de MEV, volumes de micro-CT)
-- O arquivo fica no disco do servidor; o banco guarda onde está e o hash.
-- -----------------------------------------------------------------------------
create table public.arquivos (
    id              bigint generated always as identity primary key,
    amostra_id      uuid references public.amostras(id) on delete cascade,
    analise_tabela  text,
    analise_id      bigint,
    tipo            text,                                -- 'imagem', 'opju', 'pdf', 'volume_ct', 'planilha'
    nome_original   text not null,
    caminho         text not null unique,                -- relativo à pasta de arquivos do servidor
    tamanho_bytes   bigint,
    sha256          text,
    enviado_por     uuid default auth.uid() references public.perfis(id),
    enviado_em      timestamptz not null default now()
);
create index arquivos_analise_idx on public.arquivos (analise_tabela, analise_id);
