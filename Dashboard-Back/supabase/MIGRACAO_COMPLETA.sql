-- =========================================================
-- MIGRATION: 20261001000001_acesso_base.sql
-- =========================================================

-- =============================================================================
-- Memória Experimental — LC PETRO/UFPA
-- 0001: perfis de usuário, Empresa -> Projeto, permissões
--
-- Versão Supabase: o login é o Supabase Auth (auth.users). Cada usuário ganha
-- automaticamente uma linha em "perfis" com nome e o indicador de administrador.
-- O schema "app" guarda as funções de permissão usadas pelas regras (0006).
-- Para migrar depois para um PostgreSQL próprio, basta trocar app.usuario_atual().
-- =============================================================================

create extension if not exists pgcrypto;
create schema if not exists app;

-- quem está logado (no Supabase: o usuário do token JWT)
create or replace function app.usuario_atual()
returns uuid language sql stable as $$
    select auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Perfis (dados do usuário além do login)
-- -----------------------------------------------------------------------------
create table public.perfis (
    id            uuid primary key references auth.users(id) on delete cascade,
    email         text not null,
    nome          text,
    administrador boolean not null default false,        -- vê tudo, cria empresas e projetos
    ativo         boolean not null default true,
    criado_em     timestamptz not null default now()
);

-- cria o perfil quando alguém se cadastra no Supabase Auth
create or replace function app.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.perfis (id, email, nome)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
    return new;
end $$;

create trigger ao_criar_usuario
    after insert on auth.users
    for each row execute function app.criar_perfil();

-- Garante perfil de administrador para usuários já cadastrados antes da migração
insert into public.perfis (id, email, nome, administrador)
select id, email, coalesce(raw_user_meta_data ->> 'nome', split_part(email, '@', 1)), true
from auth.users
on conflict (id) do update set administrador = true;

-- -----------------------------------------------------------------------------
-- Dois níveis: EMPRESA (TotalEnergies, Petrobras, UFPA/interno...) e PROJETO
-- -----------------------------------------------------------------------------
create table public.empresas (
    id          uuid primary key default gen_random_uuid(),
    sigla       text not null unique,                    -- 'TOTAL', 'PETROBRAS', 'LCPETRO'
    nome        text not null,
    criado_em   timestamptz not null default now()
);

create table public.projetos (
    id          uuid primary key default gen_random_uuid(),
    empresa_id  uuid not null references public.empresas(id),
    codigo      text not null unique,                    -- ex.: 'TOTAL-ACID-2025'
    nome        text not null,
    descricao   text,
    inicio      date,
    fim         date,
    ativo       boolean not null default true,
    criado_em   timestamptz not null default now()
);

-- Acesso em dois níveis:
--   * membro da EMPRESA  -> vê todos os projetos dela (ex.: coordenador do contrato)
--   * membro do PROJETO  -> vê só aquele projeto (ex.: bolsista do projeto)
create table public.membros (
    id          bigint generated always as identity primary key,
    usuario_id  uuid not null references public.perfis(id) on delete cascade,
    empresa_id  uuid references public.empresas(id) on delete cascade,
    projeto_id  uuid references public.projetos(id) on delete cascade,
    papel       text not null check (papel in ('leitor', 'editor')),
    constraint um_nivel check ((empresa_id is null) <> (projeto_id is null))
);
create unique index membros_empresa_uq on public.membros (usuario_id, empresa_id) where empresa_id is not null;
create unique index membros_projeto_uq on public.membros (usuario_id, projeto_id) where projeto_id is not null;

-- Pacotes de trabalho contratuais (dashboard gerencial)
create table public.work_packages (
    id                    bigint generated always as identity primary key,
    projeto_id            uuid not null references public.projetos(id) on delete cascade,
    codigo                text not null,                 -- 'WP1'
    nome                  text not null,                 -- 'Caracterização petrofísica'
    inicio                date,
    fim                   date,
    progresso_planejado   numeric check (progresso_planejado between 0 and 100),
    progresso_realizado   numeric check (progresso_realizado between 0 and 100),
    unique (projeto_id, codigo)
);

-- -----------------------------------------------------------------------------
-- Funções de permissão
-- (security definer: consultam usuarios/membros sem esbarrar nas regras delas)
-- -----------------------------------------------------------------------------
create or replace function app.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select administrador from public.perfis
                     where id = app.usuario_atual() and ativo), false)
$$;

-- papel do usuário num projeto, somando o que vem da empresa e do próprio projeto
-- devolve 'editor', 'leitor' ou null
create or replace function app.papel_no_projeto(p uuid)
returns text language sql stable security definer set search_path = public as $$
    select case
        when app.eh_admin() then 'editor'
        else (select max(m.papel)            -- 'editor' > 'leitor' em ordem alfabética
              from public.membros m
              join public.projetos pr on pr.id = p
              where m.usuario_id = app.usuario_atual()
                and (m.projeto_id = p or m.empresa_id = pr.empresa_id))
    end
$$;

create or replace function app.pode_ver(p uuid)
returns boolean language sql stable as $$
    select p is not null and app.papel_no_projeto(p) is not null
$$;

create or replace function app.pode_editar(p uuid)
returns boolean language sql stable as $$
    select p is not null and app.papel_no_projeto(p) = 'editor'
$$;

-- editor em qualquer lugar: pode manter catálogos (litologias, sistemas ácidos)
create or replace function app.eh_editor()
returns boolean language sql stable security definer set search_path = public as $$
    select app.eh_admin() or exists (
        select 1 from public.membros where usuario_id = app.usuario_atual() and papel = 'editor')
$$;


-- =========================================================
-- MIGRATION: 20261001000002_catalogos.sql
-- =========================================================

-- =============================================================================
-- 0002: catálogos compartilhados por amostras do laboratório e literatura
-- =============================================================================

-- Litologia: nome único da rocha. Usada pelas amostras E pela literatura, para
-- que o filtro "Indiana Limestone" traga as duas coisas.
create table public.litologias (
    nome        text primary key,                        -- 'Indiana Limestone'
    tipo        text,                                    -- 'calcário', 'dolomito', 'giz', 'mármore'...
    descricao   text
);

-- Propriedades para converter N / wt% em mol/L (aba fluidos_prop)
create table public.fluidos_prop (
    componente         text primary key,                 -- 'HCl'
    massa_molar_g_mol  numeric check (massa_molar_g_mol > 0),
    coef_densidade     numeric,                          -- rho = 1 + coef x wt%
    n_equivalentes     integer check (n_equivalentes > 0),
    observacao         text
);

-- Sistemas ácidos (aba sistemas_acidos), usados nos ensaios do laboratório e
-- nos dados da literatura. Ex. do quadro: HCl; HCl + IC; retardado; sistemas
-- comerciais.
create table public.sistemas_acidos (
    id_sistema           text primary key,               -- SA01
    nome_sistema         text not null,
    categoria            text,                           -- 'HCl', 'HCl + IC', 'retardado', 'comercial'...
    nome_comercial       text,
    componente_1         text not null,                  -- ácido principal
    valor_1              numeric,
    unidade_1            text,
    componente_2         text,
    valor_2              numeric,
    unidade_2            text,
    componente_3         text,
    valor_3              numeric,
    unidade_3            text,
    componente_4         text,
    valor_4              numeric,
    unidade_4            text,
    composicao_original  text
);

-- -----------------------------------------------------------------------------
-- Conversão de concentração (regras do LEIA-ME)
--   N   -> M : M = N / número de equivalentes
--   wt% -> M : M = 10 x wt% x rho / MM, com rho = 1 + coef x wt%
--   M   -> wt%: inverso da fórmula acima
-- -----------------------------------------------------------------------------
create or replace function public.conc_molar(
    valor numeric, unidade text, mm numeric, coef numeric, n_eq integer)
returns numeric language sql immutable as $$
    select case unidade
        when 'M'   then valor
        when 'N'   then valor / nullif(n_eq, 0)
        when 'wt%' then 10 * valor * (1 + coalesce(coef, 0) * valor) / nullif(mm, 0)
    end
$$;

create or replace function public.conc_massica(
    valor numeric, unidade text, mm numeric, coef numeric, n_eq integer)
returns numeric language plpgsql immutable as $$
declare m numeric;
begin
    if unidade = 'wt%' then return valor; end if;
    m := public.conc_molar(valor, unidade, mm, coef, n_eq);
    if m is null or mm is null then return null; end if;
    if coalesce(coef, 0) = 0 then return m * mm / 10; end if;
    -- coef·w² + w − M·MM/10 = 0
    return (-1 + sqrt(1 + 4 * coef * m * mm / 10)) / (2 * coef);
end $$;

-- sistema ácido com concentração já convertida
create or replace view public.v_sistemas_acidos as
select s.*,
       round(public.conc_molar(s.valor_1, s.unidade_1, f.massa_molar_g_mol,
                               f.coef_densidade, f.n_equivalentes), 4)   as conc_m,
       round(public.conc_massica(s.valor_1, s.unidade_1, f.massa_molar_g_mol,
                                 f.coef_densidade, f.n_equivalentes), 4) as conc_pct,
       nullif(concat_ws(' + ',
           nullif(trim(concat_ws(' ', s.componente_2, s.valor_2, s.unidade_2)), ''),
           nullif(trim(concat_ws(' ', s.componente_3, s.valor_3, s.unidade_3)), ''),
           nullif(trim(concat_ws(' ', s.componente_4, s.valor_4, s.unidade_4)), '')), '') as aditivos
from public.sistemas_acidos s
left join public.fluidos_prop f on f.componente = s.componente_1;


-- =========================================================
-- MIGRATION: 20261001000003_amostras_analises.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20261001000004_literatura.sql
-- =========================================================

-- =============================================================================
-- 0004: LITERATURA — separada dos resultados do laboratório
--
--   GERAL   : publicações externas (Rabie, Taylor, Lund...) e os dados extraídos
--             delas — é aqui que entra a planilha BDD_LCPETRO_Reatividade.
--             Visível para todos os usuários.
--   PRÓPRIA : o que o próprio LC PETRO publicou (artigos, dissertações, TCCs,
--             relatórios). Pode ser aberta a todos ou restrita a um projeto
--             (relatório de WP, por exemplo).
--
-- Os ensaios do laboratório NÃO ficam aqui: ficam em analise_* (0003), ligados
-- à amostra. A comparação lab x literatura é feita pela view v_rda_comparacao.
-- =============================================================================

create table public.publicacoes (
    id_referencia  text primary key,                     -- 'REF-R01' (geral) / 'LCP-0001' (própria)
    categoria      text not null check (categoria in ('geral', 'propria')),
    tipo           text,                                 -- 'artigo', 'dissertação', 'TCC', 'relatório', 'congresso'
    autor          text not null,
    ano            text,                                 -- texto: há faixas como '2006-2014'
    ano_ordem      integer generated always as (substring(ano from '\d{4}')::integer) stored,
    titulo         text,
    periodico      text,
    doi            text,
    resumo         text,
    palavras_chave text[],
    eixos          text[],                               -- 'petrofísica', 'coreflooding', 'RDA'...
    -- própria e sigilosa: restrita a um projeto. Nulo = aberta a todos.
    projeto_id     uuid references public.projetos(id),
    criado_em      timestamptz not null default now(),
    constraint geral_nao_tem_projeto check (categoria = 'propria' or projeto_id is null)
);

-- publicação própria -> amostras cujos dados ela usa (rastreabilidade)
create table public.publicacao_amostras (
    id_referencia  text not null references public.publicacoes(id_referencia) on delete cascade,
    amostra_id     uuid not null references public.amostras(id) on delete cascade,
    primary key (id_referencia, amostra_id)
);

alter table public.arquivos
    add column id_referencia text references public.publicacoes(id_referencia) on delete cascade;

-- -----------------------------------------------------------------------------
-- Dados extraídos da literatura geral (planilha BDD_LCPETRO_Reatividade)
-- Estrutura igual às abas rochas e ensaios.
-- -----------------------------------------------------------------------------

-- aba rochas: a rocha como a referência a descreveu
create table public.lit_rochas (
    id_rocha               text primary key,             -- RCH-01
    litologia              text not null references public.litologias(nome) on update cascade,
    composicao_texto       text,
    calcita_pct            numeric check (calcita_pct between 0 and 100),
    calcita_qualificador   text check (calcita_qualificador in ('=', '>', '>=', '<', '<=', '~')),
    dolomita_pct           numeric check (dolomita_pct between 0 and 100),
    dolomita_qualificador  text check (dolomita_qualificador in ('=', '>', '>=', '<', '<=', '~')),
    razao_ca_mg            numeric check (razao_ca_mg > 0)
);

-- aba ensaios: uma medida de taxa de reação por linha
create table public.lit_dados_rda (
    id_ensaio              text primary key,             -- RDA-0001
    id_referencia          text not null references public.publicacoes(id_referencia),
    ano                    integer,
    id_rocha               text not null references public.lit_rochas(id_rocha),
    dim_h_in               numeric check (dim_h_in > 0),
    dim_d_in               numeric check (dim_d_in > 0),
    id_sistema             text not null references public.sistemas_acidos(id_sistema),
    temperatura_c          numeric,
    temperatura_nominal_c  numeric generated always as (
                               case when temperatura_c between 18 and 30 then 25
                                    else round(temperatura_c / 5) * 5 end) stored,
    pressao_psi            numeric,
    tipo_variavel          text check (tipo_variavel in
                               ('rotação (RDA)', 'taxa de cisalhamento', 'não informada')),
    rotacao_rpm            numeric check (rotacao_rpm >= 0),
    omega_rad_s            numeric generated always as (rotacao_rpm * 2 * pi() / 60) stored,
    raiz_omega             numeric generated always as (sqrt(rotacao_rpm * 2 * pi() / 60)) stored,
    shear_rate_s1          numeric,
    taxa_reacao_mol_cm2_s  double precision,
    taxa_reacao_mol_m2_s   double precision generated always as (taxa_reacao_mol_cm2_s * 10000) stored,
    coef_difusao_cm2_s     double precision,
    metodo_coef_difusao    text,
    metodo_quantificacao   text,
    obtencao_dado          text check (obtencao_dado in
                               ('tabelado', 'lido de gráfico', 'medida na superfície', 'não catalogado')),
    cor_celula             text,
    variavel_original      text,
    sistema_original       text,
    criado_em              timestamptz not null default now(),
    atualizado_em          timestamptz not null default now()
);
create index lit_rda_ref_idx on public.lit_dados_rda (id_referencia);
create index lit_rda_rocha_idx on public.lit_dados_rda (id_rocha);


-- =========================================================
-- MIGRATION: 20261001000005_views_e_gatilhos.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20261001000006_regras_de_acesso.sql
-- =========================================================

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


-- =========================================================
-- MIGRATION: 20261001000007_storage_arquivos.sql
-- =========================================================

-- =============================================================================
-- 0007: arquivos no Supabase Storage (bucket privado "arquivos")
--
-- Convenção de caminho:
--   amostras/<amostra_id>/<analise>/<nome>     ex.: amostras/3f2c.../drx/difratograma.pdf
--   publicacoes/<id_referencia>/<nome>        ex.: publicacoes/LCP-0002/relatorio.pdf
-- Quem pode ver/enviar segue a mesma regra da amostra ou da publicação.
-- A tabela public.arquivos guarda os metadados (caminho = name do objeto).
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', false)
on conflict (id) do nothing;

create or replace function app.uuid_ou_nulo(t text)
returns uuid language plpgsql immutable as $$
begin
    return t::uuid;
exception when others then
    return null;
end $$;

create or replace function app.pode_ver_objeto(caminho text)
returns boolean language sql stable as $$
    select case (storage.foldername(caminho))[1]
        when 'amostras' then
            app.pode_ver_amostra(app.uuid_ou_nulo((storage.foldername(caminho))[2]))
        when 'publicacoes' then
            exists (select 1 from public.publicacoes p
                    where p.id_referencia = (storage.foldername(caminho))[2])
        else false
    end
$$;

create or replace function app.pode_editar_objeto(caminho text)
returns boolean language sql stable as $$
    select case (storage.foldername(caminho))[1]
        when 'amostras' then
            app.pode_editar_amostra(app.uuid_ou_nulo((storage.foldername(caminho))[2]))
        when 'publicacoes' then
            exists (select 1 from public.publicacoes p
                    where p.id_referencia = (storage.foldername(caminho))[2]
                      and case when p.projeto_id is null then app.eh_editor()
                               else app.pode_editar(p.projeto_id) end)
        else false
    end
$$;

grant execute on function app.uuid_ou_nulo(text), app.pode_ver_objeto(text),
                          app.pode_editar_objeto(text) to authenticated;

create policy arquivos_ler on storage.objects for select to authenticated
    using (bucket_id = 'arquivos' and app.pode_ver_objeto(name));
create policy arquivos_enviar on storage.objects for insert to authenticated
    with check (bucket_id = 'arquivos' and app.pode_editar_objeto(name));
create policy arquivos_alterar on storage.objects for update to authenticated
    using (bucket_id = 'arquivos' and app.pode_editar_objeto(name));
create policy arquivos_apagar on storage.objects for delete to authenticated
    using (bucket_id = 'arquivos' and app.pode_editar_objeto(name));



-- =========================================================
-- DADOS INICIAIS (EMPRESAS, PROJETOS E USUARIO ADMIN)
-- =========================================================

-- Garante que seu usuário seja administrador
update public.perfis 
set administrador = true 
where email = 'douglascosta12.f@gmail.com';

-- Empresas iniciais
insert into public.empresas (sigla, nome) values
  ('TOTAL', 'TotalEnergies'),
  ('PETROBRAS', 'Petrobras'),
  ('LCPETRO', 'LC PETRO (interno)')
on conflict (sigla) do nothing;

-- Projeto inicial da Total
insert into public.projetos (empresa_id, codigo, nome)
select id, 'TOTAL-2025', 'Acidificação — TotalEnergies'
from public.empresas 
where sigla = 'TOTAL'
on conflict (codigo) do nothing;

-- Projeto inicial do LC Petro
insert into public.projetos (empresa_id, codigo, nome)
select id, 'LCPETRO-PESQ', 'Pesquisa Interna LC PETRO'
from public.empresas 
where sigla = 'LCPETRO'
on conflict (codigo) do nothing;
