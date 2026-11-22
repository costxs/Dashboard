-- =============================================================================
-- 027 · Categoria "mini-plug" e ensaios de reatividade gravados nas amostras
--
--  * amostras.tipo_amostra: categoria explícita (plug, disco, mini_plug). Quando
--    preenchida, vale mais que o palpite pela finalidade, prefixo ou comprimento.
--  * amostras.amostra_mae_id: rocha (plug/bloco) de onde o mini-plug foi cortado.
--  * reatividade_sondagem_t50.amostra_id e reatividade_pontos.amostra_id: o mini-plug
--    usado em cada teste piloto e em cada réplica.
--  * v_amostras: n_reatividade e fluidos passam a contar os ensaios novos
--    (reatividade_ensaios), tanto na rocha do ensaio quanto em cada mini-plug.
-- =============================================================================

alter table public.amostras
    add column if not exists tipo_amostra text
        check (tipo_amostra in ('plug', 'disco', 'mini_plug')),
    add column if not exists amostra_mae_id uuid
        references public.amostras(id) on delete set null;

create index if not exists amostras_amostra_mae_idx on public.amostras (amostra_mae_id);

alter table public.prefixos_codigo drop constraint if exists prefixos_codigo_tipo_amostra_check;
alter table public.prefixos_codigo add constraint prefixos_codigo_tipo_amostra_check
    check (tipo_amostra in ('plug', 'disco', 'mini_plug'));

alter table public.reatividade_sondagem_t50
    add column if not exists amostra_id uuid references public.amostras(id) on delete set null;
alter table public.reatividade_pontos
    add column if not exists amostra_id uuid references public.amostras(id) on delete set null;

create index if not exists reatividade_sondagem_t50_amostra_idx on public.reatividade_sondagem_t50 (amostra_id);
create index if not exists reatividade_pontos_amostra_idx on public.reatividade_pontos (amostra_id);

-- Ensaios de reatividade de cada amostra: rocha do ensaio + mini-plugs usados nele.
create or replace view public.v_reatividade_ensaios_amostra
with (security_invoker = true) as
select e.amostra_id, e.id as ensaio_id, 'rocha'::text as papel
from public.reatividade_ensaios e
where e.amostra_id is not null
union
select p.amostra_id, p.ensaio_id, 'mini_plug'::text
from public.reatividade_pontos p
where p.amostra_id is not null
union
select s.amostra_id, s.ensaio_id, 'mini_plug'::text
from public.reatividade_sondagem_t50 s
where s.amostra_id is not null;

grant select on public.v_reatividade_ensaios_amostra to authenticated, service_role;
revoke all on public.v_reatividade_ensaios_amostra from anon;

-- v_amostras: mesma definição da 024, com três mudanças (tipo_amostra explícito,
-- contagem/fluidos dos ensaios novos e as colunas novas no fim).
create or replace view public.v_amostras
with (security_invoker = false) as
 SELECT a.id,
    a.codigo,
        CASE
            WHEN NOT perm.ver_sensivel AND a.tipo_origem = 'testemunho'::text THEN 'Rocha de Testemunho (reservado)'::text
            ELSE a.litologia
        END AS litologia,
    a.tipo_origem,
    a.status,
    a.finalidade,
    e.sigla AS empresa,
    e.id AS empresa_id,
    p.codigo AS projeto,
    a.projeto_id,
        CASE WHEN perm.ver_sensivel THEN a.afloramento_local ELSE NULL::text END AS afloramento_local,
        CASE WHEN perm.ver_sensivel THEN a.fornecedor ELSE NULL::text END AS fornecedor,
        CASE WHEN perm.ver_sensivel THEN a.bacia ELSE NULL::text END AS bacia,
        CASE WHEN perm.ver_sensivel THEN a.campo ELSE NULL::text END AS campo,
        CASE WHEN perm.ver_sensivel THEN a.poco ELSE NULL::text END AS poco,
        CASE WHEN perm.ver_sensivel THEN a.reservatorio ELSE NULL::text END AS reservatorio,
        CASE WHEN perm.ver_sensivel THEN a.profundidade_m ELSE NULL::numeric END AS profundidade_m,
    a.diametro_cm,
    a.comprimento_cm,
    a.massa_seca_g,
    a.permeabilidade_fabricante_md,
    pa.porosidade_pct,
    pa.permeabilidade_gas_md AS k_gas_md,
    pa.permeabilidade_liquido_md AS k_liquido_md,
        CASE WHEN perm.ver_sensivel THEN pa.pressao_confinamento_psi ELSE NULL::numeric END AS pressao_confinamento_psi,
    round((pi() * ((a.diametro_cm / 2::numeric) ^ 2::numeric)::double precision * a.comprimento_cm::double precision * pa.porosidade_pct::double precision / 100::double precision)::numeric, 3) AS volume_poroso_cm3,
        CASE WHEN perm.ver_sensivel THEN pd.permeabilidade_liquido_md ELSE NULL::numeric END AS k_liquido_depois_md,
        CASE WHEN perm.ver_sensivel THEN cf.pvbt ELSE NULL::numeric END AS pvbt,
        CASE WHEN perm.ver_sensivel THEN cf.breakthrough ELSE NULL::boolean END AS breakthrough,
        CASE WHEN perm.ver_sensivel THEN cf.razao_dp ELSE NULL::numeric END AS razao_dp,
    COALESCE(c_petro.n, 0::bigint) AS n_petrofisica,
    COALESCE(c_mct.n, 0::bigint) AS n_microct,
    COALESCE(c_cf.n, 0::bigint) AS n_coreflooding,
    COALESCE(c_reat.n, 0::bigint) AS n_reatividade,
    COALESCE(c_rda.n, 0::bigint) AS n_rda,
    COALESCE(c_drx.n, 0::bigint) AS n_drx,
    COALESCE(c_petr.n, 0::bigint) AS n_petrografia,
    COALESCE(c_mev.n, 0::bigint) AS n_mev,
    a.criado_em,
    a.atualizado_em,
    COALESCE(
        a.tipo_amostra,
        CASE
            WHEN a.finalidade ~~* '%rda%'::text THEN 'disco'::text
            WHEN a.finalidade ~~* '%core%'::text THEN 'plug'::text
            ELSE NULL::text
        END, pc.tipo_amostra,
        CASE
            WHEN a.comprimento_cm < 3::numeric THEN 'disco'::text
            WHEN a.comprimento_cm >= 3::numeric THEN 'plug'::text
            ELSE NULL::text
        END) AS tipo_amostra,
    "substring"(a.codigo, '^[A-Za-z]+'::text) AS prefixo,
    pc.significado AS significado_prefixo,
        CASE
            WHEN NOT perm.ver_sensivel THEN NULL::text
            ELSE COALESCE(fl.realizados, ( SELECT ((TRIM(BOTH FROM m.m[1]) || ' '::text) || TRIM(BOTH FROM m.m[2])) || ' (previsto)'::text
               FROM regexp_match(a.observacoes, 'Utiliza[cç][aã]o:[^\[]*?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 +]*?)\s*\[([^\]]+)\]'::text) m(m)))
        END AS fluidos,
    a.permeabilidade_fabricante_min_md,
    a.permeabilidade_fabricante_max_md,
    a.amostra_mae_id,
    mae.codigo AS amostra_mae_codigo
   FROM amostras a
     JOIN projetos p ON p.id = a.projeto_id
     JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN amostras mae ON mae.id = a.amostra_mae_id
     LEFT JOIN prefixos_codigo pc ON pc.prefixo = upper("substring"(a.codigo, '^[A-Za-z]+'::text))
     CROSS JOIN LATERAL ( SELECT ( SELECT app.eh_servico_ou_postgres() AS eh_servico_ou_postgres) OR ( SELECT app.eh_admin() AS eh_admin) OR (a.projeto_id = ANY ((( SELECT app.projetos_visiveis() AS projetos_visiveis))::uuid[])) AS ver_sensivel) perm
     LEFT JOIN ( SELECT DISTINCT ON (analise_petrofisica.amostra_id) analise_petrofisica.amostra_id,
            analise_petrofisica.porosidade_pct,
            analise_petrofisica.permeabilidade_gas_md,
            analise_petrofisica.permeabilidade_liquido_md,
            analise_petrofisica.pressao_confinamento_psi
           FROM analise_petrofisica
          WHERE analise_petrofisica.momento = 'antes'::text
          ORDER BY analise_petrofisica.amostra_id, analise_petrofisica.data_ensaio DESC NULLS LAST, analise_petrofisica.id DESC) pa ON pa.amostra_id = a.id
     LEFT JOIN ( SELECT DISTINCT ON (analise_petrofisica.amostra_id) analise_petrofisica.amostra_id,
            analise_petrofisica.permeabilidade_liquido_md
           FROM analise_petrofisica
          WHERE analise_petrofisica.momento = 'depois'::text
          ORDER BY analise_petrofisica.amostra_id, analise_petrofisica.data_ensaio DESC NULLS LAST, analise_petrofisica.id DESC) pd ON pd.amostra_id = a.id
     LEFT JOIN ( SELECT DISTINCT ON (analise_coreflooding.amostra_id) analise_coreflooding.amostra_id,
            analise_coreflooding.pvbt,
            analise_coreflooding.breakthrough,
            analise_coreflooding.razao_dp
           FROM analise_coreflooding
          ORDER BY analise_coreflooding.amostra_id, analise_coreflooding.data_ensaio DESC NULLS LAST, analise_coreflooding.id DESC) cf ON cf.amostra_id = a.id
     LEFT JOIN ( SELECT analise_petrofisica.amostra_id, count(*) AS n
           FROM analise_petrofisica GROUP BY analise_petrofisica.amostra_id) c_petro ON c_petro.amostra_id = a.id
     LEFT JOIN ( SELECT analise_microct.amostra_id, count(*) AS n
           FROM analise_microct GROUP BY analise_microct.amostra_id) c_mct ON c_mct.amostra_id = a.id
     LEFT JOIN ( SELECT analise_coreflooding.amostra_id, count(*) AS n
           FROM analise_coreflooding GROUP BY analise_coreflooding.amostra_id) c_cf ON c_cf.amostra_id = a.id
     LEFT JOIN ( SELECT r.amostra_id, count(*) AS n
           FROM ( SELECT analise_reatividade_estatica.amostra_id, 'a'::text || analise_reatividade_estatica.id::text AS k
                   FROM analise_reatividade_estatica
                UNION
                 SELECT re.amostra_id, 'e'::text || re.ensaio_id::text
                   FROM v_reatividade_ensaios_amostra re) r
          GROUP BY r.amostra_id) c_reat ON c_reat.amostra_id = a.id
     LEFT JOIN ( SELECT analise_rda.amostra_id, count(*) AS n
           FROM analise_rda GROUP BY analise_rda.amostra_id) c_rda ON c_rda.amostra_id = a.id
     LEFT JOIN ( SELECT analise_drx.amostra_id, count(*) AS n
           FROM analise_drx GROUP BY analise_drx.amostra_id) c_drx ON c_drx.amostra_id = a.id
     LEFT JOIN ( SELECT analise_petrografia.amostra_id, count(*) AS n
           FROM analise_petrografia GROUP BY analise_petrografia.amostra_id) c_petr ON c_petr.amostra_id = a.id
     LEFT JOIN ( SELECT analise_mev.amostra_id, count(*) AS n
           FROM analise_mev GROUP BY analise_mev.amostra_id) c_mev ON c_mev.amostra_id = a.id
     LEFT JOIN ( SELECT u.amostra_id,
            string_agg(DISTINCT u.f, ' · '::text) AS realizados
           FROM ( SELECT c.amostra_id,
                    COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' '::text, c.acido, c.conc_valor::text, c.conc_unidade)), ''::text), s.nome_sistema) AS f
                   FROM analise_coreflooding c
                     LEFT JOIN sistemas_acidos s ON s.id_sistema = c.id_sistema
                UNION ALL
                 SELECT r.amostra_id, s.nome_sistema
                   FROM analise_rda r
                     JOIN sistemas_acidos s ON s.id_sistema = r.id_sistema
                UNION ALL
                 SELECT r.amostra_id, s.nome_sistema
                   FROM analise_reatividade_estatica r
                     JOIN sistemas_acidos s ON s.id_sistema = r.id_sistema
                UNION ALL
                 SELECT re.amostra_id, s.nome_sistema
                   FROM v_reatividade_ensaios_amostra re
                     JOIN reatividade_ensaios en ON en.id = re.ensaio_id
                     JOIN sistemas_acidos s ON s.id_sistema = en.id_sistema) u
          WHERE u.f IS NOT NULL
          GROUP BY u.amostra_id) fl ON fl.amostra_id = a.id
  WHERE ( SELECT app.eh_servico_ou_postgres() AS eh_servico_ou_postgres) OR ( SELECT app.eh_admin() AS eh_admin) OR ( SELECT app.membro_lcpetro() AS membro_lcpetro) OR (a.projeto_id = ANY ((( SELECT app.projetos_visiveis() AS projetos_visiveis))::uuid[]));

notify pgrst, 'reload schema';
