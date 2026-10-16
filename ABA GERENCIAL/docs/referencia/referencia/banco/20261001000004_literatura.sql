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
