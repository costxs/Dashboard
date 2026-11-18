-- =============================================================================
-- 021 — RDA ligado ao banco de amostras
--
-- O que muda e por quê:
--   1. Os DISCOS do laboratório (RDA + número, da planilha de Controle de rochas) já entravam em `amostras`,
--      mas o ensaio descrito na coluna "Utilização" ("TR - HCl [15%] - Formação - 60 °C @500") ficava só no texto
--      das observações. Agora ele vira uma linha de `analise_rda` ligada ao disco (origem_registro = 'controle'),
--      com sistema ácido, temperatura e rotação; a taxa fica vazia até alguém lançar o resultado.
--   2. As medidas da LITERATURA usavam o código RDA-0001, fácil de confundir com o disco RDA###.
--      Passam a ser LIT-0001 (a numeração é a mesma; só troca o prefixo).
--   3. A literatura não tem disco físico (são rochas de artigos de outros grupos), então não entra em `amostras`
--      (o inventário, o status e os projetos continuam só com o que existe no laboratório). Para aparecer no
--      BANCO DE AMOSTRAS do dashboard, a view nova `v_banco_amostras` junta as amostras do laboratório com
--      uma linha por rocha × artigo da literatura, marcada "literatura — sem disco físico".
--   4. Ficha da amostra: `rda_literatura_comparavel(amostra)` lista as medidas da literatura da mesma rocha,
--      dizendo quais têm o mesmo ácido e a mesma temperatura nominal dos ensaios do disco.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. analise_rda: de onde veio a linha + texto original da "Utilização"
-- -----------------------------------------------------------------------------
drop view if exists public.v_rda_comparacao;
drop view if exists public.v_analise_rda;

alter table public.analise_rda
    add column if not exists origem_registro text not null default 'formulario',
    add column if not exists texto_utilizacao text;
alter table public.analise_rda drop constraint if exists analise_rda_origem_registro_check;
alter table public.analise_rda add constraint analise_rda_origem_registro_check
    check (origem_registro in ('controle', 'formulario', 'equipamento'));
comment on column public.analise_rda.origem_registro is
    'controle = criado pela importação da planilha de Controle de rochas (coluna Utilização); formulario = painel; equipamento = arquivo do RDA';
comment on column public.analise_rda.texto_utilizacao is 'texto da coluna "Utilização" da planilha de controle, como estava';

-- um ensaio "previsto pelo controle" por disco: reimportar a planilha atualiza em vez de duplicar
create unique index if not exists analise_rda_um_por_disco_controle
    on public.analise_rda (amostra_id) where origem_registro = 'controle';

create view public.v_analise_rda
with (security_invoker = true) as
select r.*, a.codigo as amostra, a.litologia, a.projeto_id,
       s.nome_sistema, s.componente_1 as acido, s.valor_1 as conc_valor, s.unidade_1 as conc_unidade,
       s.conc_m, s.conc_pct, s.aditivos,
       case when r.taxa_reacao_mol_cm2_s is null then 'aguardando resultado' else 'com resultado' end as situacao
from public.analise_rda r
join public.amostras a on a.id = r.amostra_id
join public.v_sistemas_acidos s on s.id_sistema = r.id_sistema;

-- -----------------------------------------------------------------------------
-- 2. Literatura: RDA-0001 -> LIT-0001 (as anotações de qualidade acompanham)
-- -----------------------------------------------------------------------------
alter table public.lit_qualidade drop constraint if exists lit_qualidade_id_ensaio_fkey;
alter table public.lit_qualidade add constraint lit_qualidade_id_ensaio_fkey
    foreign key (id_ensaio) references public.lit_dados_rda(id_ensaio) on delete cascade on update cascade;

update public.lit_dados_rda set id_ensaio = 'LIT-' || substring(id_ensaio from 5)
 where id_ensaio ~ '^RDA-\d+$'
   and not exists (select 1 from public.lit_dados_rda x where x.id_ensaio = 'LIT-' || substring(lit_dados_rda.id_ensaio from 5));

drop trigger if exists lit_dados_rda_codigo on public.lit_dados_rda;
create trigger lit_dados_rda_codigo before insert on public.lit_dados_rda
    for each row execute function public.tg_codigo_automatico('id_ensaio', 'LIT-', '4');
comment on column public.lit_dados_rda.id_ensaio is 'LIT-0001 (literatura). Os discos do laboratório são RDA### em amostras.';

-- comparação lab × literatura: mesmas colunas; ensaios do lab ainda sem taxa ficam de fora do gráfico
create view public.v_rda_comparacao
with (security_invoker = true) as
select 'literatura'::text     as fonte,
       d.id_ensaio             as id,
       d.referencia_autor || ' (' || coalesce(d.ano::text, '?') || ')' as rotulo,
       null::uuid              as projeto_id,
       d.litologia, d.acido, d.conc_m, d.aditivos, d.temperatura_nominal_c, d.pressao_psi,
       d.rotacao_rpm, d.raiz_omega, d.taxa_reacao_mol_m2_s, d.obtencao_dado,
       d.id_sistema, d.temperatura_c, d.tipo_variavel, d.shear_rate_s1, d.id_referencia as serie, d.conferido
from public.v_lit_dados_rda d
union all
select 'lcpetro', r.id::text, r.amostra, r.projeto_id,
       r.litologia, r.acido, r.conc_m, r.aditivos, r.temperatura_nominal_c, r.pressao_psi,
       r.rotacao_rpm, round(r.raiz_omega, 3), r.taxa_reacao_mol_m2_s, 'medida no LC PETRO',
       r.id_sistema, r.temperatura_c, r.tipo_variavel, r.shear_rate_s1, coalesce(r.serie, r.amostra), true
from public.v_analise_rda r
where r.taxa_reacao_mol_cm2_s is not null;

-- -----------------------------------------------------------------------------
-- 3. Banco de amostras com a literatura (só leitura; nada é criado em `amostras`)
-- -----------------------------------------------------------------------------
create or replace view public.v_banco_amostras
with (security_invoker = true) as
select 'laboratorio'::text                      as fonte,
       a.id::text                               as chave,
       a.id                                     as amostra_id,
       a.codigo, a.litologia, a.tipo_origem, a.status, a.finalidade, a.tipo_amostra,
       a.empresa, a.projeto, a.projeto_id,
       a.diametro_cm, a.comprimento_cm, a.porosidade_pct, a.k_gas_md, a.fluidos,
       a.n_rda,
       (select count(*) from public.analise_rda x where x.amostra_id = a.id and x.taxa_reacao_mol_cm2_s is not null) as n_rda_com_resultado,
       null::text                               as id_referencia,
       null::text                               as referencia,
       null::text                               as id_rocha,
       null::text                               as composicao_rocha,
       null::numeric                            as temperatura_min_c,
       null::numeric                            as temperatura_max_c
from public.v_amostras a
union all
select 'literatura',
       d.id_rocha || '@' || d.id_referencia,
       null::uuid,
       d.id_rocha || ' · ' || d.id_referencia,
       min(d.litologia), 'literatura', 'sem disco físico', 'RDA', 'disco',
       null, null, null::uuid,
       round(avg(d.dim_h_in) * 2.54, 2), null::numeric, null::numeric, null::numeric,
       string_agg(distinct d.acido, ', ' order by d.acido),
       count(*), count(d.taxa_reacao_mol_cm2_s),
       d.id_referencia,
       min(d.referencia_autor) || ' (' || coalesce(min(d.ano)::text, '?') || ')',
       d.id_rocha,
       min(d.composicao_rocha),
       min(d.temperatura_c), max(d.temperatura_c)
from public.v_lit_dados_rda d
group by d.id_rocha, d.id_referencia;

comment on view public.v_banco_amostras is
    'Banco de amostras do dashboard: amostras do laboratório (fonte laboratorio) + uma linha por rocha × artigo da literatura (fonte literatura, sem disco físico). Contagens do inventário continuam em v_amostras.';

-- -----------------------------------------------------------------------------
-- 4. Ficha da amostra: literatura comparável (mesma rocha; marca mesmo ácido / mesma temperatura)
-- -----------------------------------------------------------------------------
create or replace function public.rda_literatura_comparavel(p_amostra uuid)
returns table (id_ensaio text, id_referencia text, referencia text, litologia text, acido text, conc_m numeric,
               temperatura_nominal_c numeric, rotacao_rpm numeric, raiz_omega numeric,
               taxa_reacao_mol_m2_s double precision, obtencao_dado text, conferido boolean,
               mesmo_acido boolean, mesma_temperatura boolean)
language sql stable security invoker set search_path = public as $$
    with am as (select a.litologia from amostras a where a.id = p_amostra),
         ens as (select r.acido, r.temperatura_nominal_c from v_analise_rda r where r.amostra_id = p_amostra)
    select d.id_ensaio, d.id_referencia, d.referencia_autor || ' (' || coalesce(d.ano::text, '?') || ')',
           d.litologia, d.acido, d.conc_m, d.temperatura_nominal_c, d.rotacao_rpm, d.raiz_omega,
           d.taxa_reacao_mol_m2_s, d.obtencao_dado, d.conferido,
           exists (select 1 from ens where lower(ens.acido) = lower(d.acido)),
           exists (select 1 from ens where ens.temperatura_nominal_c = d.temperatura_nominal_c)
      from v_lit_dados_rda d, am
     where d.litologia = am.litologia
     order by 13 desc, 14 desc, d.id_referencia, d.rotacao_rpm
$$;

-- -----------------------------------------------------------------------------
-- 5. Acesso
-- -----------------------------------------------------------------------------
grant select on public.v_analise_rda, public.v_rda_comparacao, public.v_banco_amostras to authenticated;
revoke all on public.v_analise_rda, public.v_rda_comparacao, public.v_banco_amostras from anon;
grant execute on function public.rda_literatura_comparavel(uuid) to authenticated;
revoke execute on function public.rda_literatura_comparavel(uuid) from anon, public;

notify pgrst, 'reload schema';
