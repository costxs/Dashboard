-- =============================================================================
-- 008 · Data de cadastro nas medidas da literatura
-- A tabela lit_dados_rda já guarda criado_em; a view passa a expor essa data
-- para o dashboard agrupar as medidas por ano/mês de cadastro.
-- (create or replace view só permite acrescentar colunas no fim)
-- =============================================================================
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
    d.cor_celula, d.variavel_original, d.sistema_original,
    d.criado_em, d.atualizado_em
from public.lit_dados_rda d
join public.publicacoes pu        on pu.id_referencia = d.id_referencia
join public.lit_rochas ro         on ro.id_rocha = d.id_rocha
join public.v_sistemas_acidos s   on s.id_sistema = d.id_sistema;
