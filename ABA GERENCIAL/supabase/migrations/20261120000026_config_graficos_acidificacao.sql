-- =============================================================================
-- 026 · Configuração dos gráficos da acidificação (padrão Origin)
--
-- O tratamento de acidificação grava como a pessoa deixou os gráficos: fonte, tamanho, espessura,
-- cor e legenda de cada fase, cor da vazão e a posição da caixa da legenda de cada gráfico.
-- O serviço de gráficos (/acidificacao/grafico-salvo) usa isso para desenhar no dashboard igual à tela.
--
-- Formato (versão 1):
--   { "versao": 1, "fonte": "Arial", "tamanho_fonte": 12, "espessura_linha": 1.2,
--     "mostrar_vazao": true, "cor_vazao": "#FF8000", "mostrar_legenda": true,
--     "dp_min": null, "dp_max": null,
--     "legenda_pos": { "geral": [0.05, 0.95] },
--     "fases": { "2": { "cor": "#FF0000", "legenda": "BLEND @2 ml/min T40" } } }
-- =============================================================================

alter table public.analise_coreflooding
    add column if not exists config_graficos jsonb;

comment on column public.analise_coreflooding.config_graficos is
    'Gráficos da acidificação como o usuário editou no tratamento (fonte, cores, legendas, posição da legenda).';

-- -----------------------------------------------------------------------------
-- Preferências de gráfico de cada usuário (fonte, tamanho, espessura, cores, posição das legendas...),
-- salvas no banco para valerem em qualquer computador. tipo = 'acidificacao' | 'permeabilidade' | ...
-- -----------------------------------------------------------------------------
create table if not exists public.preferencias_graficos (
    usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    tipo text not null check (tipo ~ '^[a-z_]{1,40}$'),
    config jsonb not null default '{}'::jsonb,
    atualizado_em timestamptz not null default now(),
    primary key (usuario_id, tipo)
);

alter table public.preferencias_graficos enable row level security;

drop policy if exists preferencias_graficos_proprias on public.preferencias_graficos;
create policy preferencias_graficos_proprias on public.preferencias_graficos
    for all to authenticated
    using (usuario_id = (select auth.uid()))
    with check (usuario_id = (select auth.uid()));

grant select, insert, update, delete on public.preferencias_graficos to authenticated;
revoke all on public.preferencias_graficos from anon;

notify pgrst, 'reload schema';
