-- =============================================================================
-- 016 · Guarda a configuração dos gráficos (cores por vazão, títulos, eixos...)
-- junto da petrofísica tratada, para o dashboard e quem reabrir verem o mesmo gráfico.
-- =============================================================================
alter table public.analise_petrofisica
    add column if not exists config_graficos jsonb;
