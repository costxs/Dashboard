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
