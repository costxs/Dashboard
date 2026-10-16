-- =============================================================================
-- 017 · Permeabilidade igual ao Origin do laboratório
-- O k final vem da INCLINAÇÃO da reta ΔP × Q ajustada com intercepto livre (FitLinear do Origin).
-- Guarda a reta usada, para conferir e redesenhar o gráfico sem o arquivo original.
-- Também guarda o volume morto (Dead Volume) informado na planilha, usado na acidificação.
-- =============================================================================
alter table public.analise_petrofisica
    add column if not exists ajuste_modo            text check (ajuste_modo in ('intercepto', 'origem')),
    add column if not exists ajuste_inclinacao      numeric,   -- psi por (cm³/min)
    add column if not exists ajuste_intercepto_psi  numeric,   -- 0 quando 'origem'
    add column if not exists ajuste_r2              numeric check (ajuste_r2 <= 1);

alter table public.analise_coreflooding
    add column if not exists volume_morto_cm3       numeric check (volume_morto_cm3 >= 0);

comment on column public.analise_petrofisica.ajuste_modo is
    'intercepto = ΔP = a·Q + b (FitLinear do Origin, padrão do laboratório); origem = ΔP = a·Q';
comment on column public.analise_coreflooding.volume_morto_cm3 is
    'Dead Volume (ml) das linhas e conexões, informado na planilha do ensaio';

notify pgrst, 'reload schema';
