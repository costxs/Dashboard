-- =============================================================================
-- 020 · Reatividade (RDA): o que falta para o cadastro sair da planilha e ir para o painel
--
-- A planilha BDD_LCPETRO_Reatividade faz 5 coisas que o banco ainda não fazia:
--   1. dá o próximo código (RDA-0420, RCH-23, SA145, REF-R11)      -> códigos automáticos
--   2. tem listas suspensas (aba "listas")                         -> tabela lit_listas
--   3. tem a aba "qualidade" com o que precisa de conferência      -> lit_qualidade + v_lit_pendencias
--   4. guarda a procedência de cada número (cor da célula)         -> já existia (obtencao_dado); agora
--      também: onde está na fonte (tabela/figura), quem lançou, se foi conferido, unidade original
--   5. deixa ver sistemas ácidos repetidos                         -> v_sistemas_duplicados
-- E acerta a temperatura nominal para ficar IGUAL à da planilha: 18 ≤ T < 30 → 25 (30 °C fica 30).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Temperatura nominal igual à fórmula da planilha (=IF(AND(T>=18,T<30),25,ROUND(T/5,0)*5)).
--    Antes o banco usava "between 18 and 30" e mandava 30 °C para o grupo de 25 (4 medidas da REF-R03).
--    Coluna calculada não muda de fórmula no PostgreSQL 15/16: sai e volta (as views são recriadas abaixo).
-- -----------------------------------------------------------------------------
create or replace function public.temperatura_nominal(t numeric)
returns numeric language sql immutable as $$
    select case when t is null then null
                when t >= 18 and t < 30 then 25
                else round(t / 5) * 5 end
$$;
grant execute on function public.temperatura_nominal(numeric) to authenticated;

drop view if exists public.v_rda_comparacao;
drop view if exists public.v_lit_conferencia;
drop view if exists public.v_lit_pendencias;
drop view if exists public.v_lit_dados_rda;
drop view if exists public.v_analise_rda;
alter table public.lit_dados_rda drop column if exists temperatura_nominal_c;
alter table public.lit_dados_rda add column temperatura_nominal_c numeric
    generated always as (public.temperatura_nominal(temperatura_c)) stored;
alter table public.analise_rda drop column if exists temperatura_nominal_c;
alter table public.analise_rda add column temperatura_nominal_c numeric
    generated always as (public.temperatura_nominal(temperatura_c)) stored;

-- -----------------------------------------------------------------------------
-- 1. Códigos automáticos: quem insere SEM código recebe o próximo da sequência.
--    (com código informado — caso da importação da planilha — nada muda)
-- -----------------------------------------------------------------------------
create or replace function app.proximo_codigo(p_tabela regclass, p_coluna text, p_prefixo text, p_largura integer)
returns text language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
    -- uma pessoa por vez nesta numeração (evita dois RDA-0420 em cadastros simultâneos)
    perform pg_advisory_xact_lock(hashtext(p_tabela::text || '.' || p_coluna || '.' || p_prefixo));
    execute format('select coalesce(max(substring(%1$I from %2$L)::bigint), 0) + 1 from %3$s where %1$I ~ %4$L',
                   p_coluna, '^' || p_prefixo || '(\d+)$', p_tabela, '^' || p_prefixo || '\d+$')
        into n;
    -- lpad corta texto maior que a largura (145 viraria '14'): a largura é só o mínimo
    return p_prefixo || lpad(n::text, greatest(p_largura, length(n::text)), '0');
end $$;

-- gatilho genérico: argumentos = coluna, prefixo, largura
create or replace function public.tg_codigo_automatico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
    col text := tg_argv[0];
    atual text := to_jsonb(new) ->> tg_argv[0];
begin
    if atual is null or btrim(atual) = '' then
        new := jsonb_populate_record(new, jsonb_build_object(
                   col, app.proximo_codigo(tg_relid::regclass, col, tg_argv[1], tg_argv[2]::integer)));
    end if;
    return new;
end $$;

create or replace function public.tg_codigo_publicacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.id_referencia is null or btrim(new.id_referencia) = '' then
        new.id_referencia := case when new.categoria = 'propria'
            then app.proximo_codigo('public.publicacoes', 'id_referencia', 'LCP-', 4)
            else app.proximo_codigo('public.publicacoes', 'id_referencia', 'REF-R', 2) end;
    end if;
    return new;
end $$;

drop trigger if exists lit_dados_rda_codigo on public.lit_dados_rda;
create trigger lit_dados_rda_codigo before insert on public.lit_dados_rda
    for each row execute function public.tg_codigo_automatico('id_ensaio', 'RDA-', '4');
drop trigger if exists lit_rochas_codigo on public.lit_rochas;
create trigger lit_rochas_codigo before insert on public.lit_rochas
    for each row execute function public.tg_codigo_automatico('id_rocha', 'RCH-', '2');
drop trigger if exists sistemas_acidos_codigo on public.sistemas_acidos;
create trigger sistemas_acidos_codigo before insert on public.sistemas_acidos
    for each row execute function public.tg_codigo_automatico('id_sistema', 'SA', '2');
drop trigger if exists publicacoes_codigo on public.publicacoes;
create trigger publicacoes_codigo before insert on public.publicacoes
    for each row execute function public.tg_codigo_publicacao();

-- -----------------------------------------------------------------------------
-- 2. Medidas: procedência, conferência e observação
-- -----------------------------------------------------------------------------
alter table public.lit_dados_rda
    add column if not exists origem_registro     text not null default 'formulario'
                                                 check (origem_registro in ('planilha', 'formulario')),
    add column if not exists fonte_local         text,       -- onde está na publicação: 'Tabela 3', 'Fig. 7b'
    add column if not exists observacao          text,
    add column if not exists unidades_originais  jsonb,      -- o que a pessoa digitou antes da conversão:
                                                             -- {"temperatura": "200 °F", "pressao": "80 bar"}
    add column if not exists conferido           boolean not null default false,
    add column if not exists conferido_por       uuid references public.perfis(id),
    add column if not exists conferido_em        timestamptz,
    add column if not exists criado_por          uuid default auth.uid() references public.perfis(id);

-- o que já estava no banco veio da planilha
update public.lit_dados_rda set origem_registro = 'planilha'
 where origem_registro = 'formulario' and criado_por is null;

comment on column public.lit_dados_rda.conferido is
    'true = alguém comparou este número com a publicação. Substitui a aba "qualidade" e a cor da célula';
comment on column public.lit_dados_rda.fonte_local is
    'Tabela ou figura da publicação de onde o valor saiu (para quem for conferir)';

-- marcar/desmarcar "conferido" registra quem e quando
create or replace function public.tg_lit_conferencia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.conferido and (tg_op = 'INSERT' or not old.conferido) then
        new.conferido_por := app.usuario_atual();
        new.conferido_em  := now();
    elsif not new.conferido then
        new.conferido_por := null;
        new.conferido_em  := null;
    end if;
    return new;
end $$;
drop trigger if exists lit_dados_rda_conferencia on public.lit_dados_rda;
create trigger lit_dados_rda_conferencia before insert or update of conferido on public.lit_dados_rda
    for each row execute function public.tg_lit_conferencia();

-- as publicações da planilha são grupos de artigos ("Autor et al, 2006-2014"); para o cadastro novo,
-- uma publicação = um artigo, com onde achar a fonte
alter table public.publicacoes
    add column if not exists link text;

-- -----------------------------------------------------------------------------
-- 3. Listas suspensas (aba "listas"): quem é editor acrescenta opção sem mexer no código
-- -----------------------------------------------------------------------------
create table if not exists public.lit_listas (
    lista   text not null check (lista in ('metodo_quantificacao', 'metodo_coef_difusao')),
    valor   text not null check (btrim(valor) <> ''),
    ordem   integer not null default 100,
    ativo   boolean not null default true,
    primary key (lista, valor)
);
insert into public.lit_listas (lista, valor, ordem) values
    ('metodo_quantificacao', 'RDA', 1),
    ('metodo_quantificacao', 'RDA / ICP', 2),
    ('metodo_quantificacao', 'RDA / ICP-AES', 3),
    ('metodo_quantificacao', 'RDA / AAS', 4),
    ('metodo_quantificacao', 'RDA / Coreflooding', 5),
    ('metodo_coef_difusao', 'Newman, J. (1966)', 1),
    ('metodo_coef_difusao', 'Rozieres et al (1994)', 2)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4. Qualidade: anotações de conferência (a aba "qualidade" entra aqui) ...
-- -----------------------------------------------------------------------------
create table if not exists public.lit_qualidade (
    id               bigint generated always as identity primary key,
    id_ensaio        text references public.lit_dados_rda(id_ensaio) on delete cascade,   -- vazio = vale para o banco todo
    campo            text not null,
    valor_registrado text,
    valor_calculado  text,
    observacao       text,
    origem           text not null default 'manual' check (origem in ('planilha', 'manual')),
    resolvido        boolean not null default false,
    resolvido_por    uuid references public.perfis(id),
    resolvido_em     timestamptz,
    resolucao        text,                    -- o que foi feito: 'corrigido para 2,5E-6 conforme Tabela 2'
    criado_por       uuid default auth.uid() references public.perfis(id),
    criado_em        timestamptz not null default now(),
    -- mesma anotação importada duas vezes não duplica
    chave            text generated always as
                     (md5(coalesce(id_ensaio, '') || '|' || campo || '|' || coalesce(valor_registrado, ''))) stored unique
);

create or replace function public.tg_lit_qualidade_resolucao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.resolvido and (tg_op = 'INSERT' or not old.resolvido) then
        new.resolvido_por := app.usuario_atual(); new.resolvido_em := now();
    elsif not new.resolvido then
        new.resolvido_por := null; new.resolvido_em := null;
    end if;
    return new;
end $$;
drop trigger if exists lit_qualidade_resolucao on public.lit_qualidade;
create trigger lit_qualidade_resolucao before insert or update of resolvido on public.lit_qualidade
    for each row execute function public.tg_lit_qualidade_resolucao();

-- -----------------------------------------------------------------------------
-- ... e pendências que o banco acha SOZINHO (o que a aba "qualidade" listava à mão)
-- gravidade: 'erro' = número impossível · 'conferir' = provável engano · 'incompleto' = falta dado
-- -----------------------------------------------------------------------------
create or replace view public.v_lit_pendencias
with (security_invoker = true) as
with d as (select * from public.lit_dados_rda)
select id_ensaio, id_referencia, 'taxa_reacao_mol_cm2_s' as campo, 'erro' as gravidade,
       'taxa de ' || taxa_reacao_mol_cm2_s || ' mol/(cm²·s) é fisicamente impossível (esperado entre 1E-10 e 1E-4): provável erro de digitação no expoente' as mensagem
  from d where taxa_reacao_mol_cm2_s is not null and (taxa_reacao_mol_cm2_s <= 0 or taxa_reacao_mol_cm2_s < 1e-10)
union all
select id_ensaio, id_referencia, 'taxa_reacao_mol_cm2_s', 'conferir',
       'taxa de ' || taxa_reacao_mol_cm2_s || ' mol/(cm²·s) está acima de 1E-4, bem acima do resto do banco: conferir na fonte'
  from d where taxa_reacao_mol_cm2_s > 1e-4
union all
select id_ensaio, id_referencia, 'taxa_reacao_mol_cm2_s', 'incompleto', 'medida sem taxa de reação'
  from d where taxa_reacao_mol_cm2_s is null
union all
select id_ensaio, id_referencia, 'temperatura_c', 'conferir',
       'temperatura de ' || temperatura_c || ' °C: confira se a fonte não está em °F (' || temperatura_c || ' °F = ' ||
       round((temperatura_c - 32) * 5 / 9, 1) || ' °C)'
  from d where temperatura_c > 200
union all
select id_ensaio, id_referencia, 'dim_h_in', 'conferir',
       case when seq then 'dimensão do disco ' || dim_h_in || ' in segue a sequência 1, 2, 3… das medidas vizinhas (provável preenchimento arrastado no Excel)'
            else 'disco de ' || greatest(dim_h_in, dim_d_in) || ' in: maior que um disco de RDA (até ~2 in)' end
  from (select id_ensaio, id_referencia, dim_h_in, dim_d_in,
               dim_h_in = trunc(dim_h_in) and (dim_h_in - lag(dim_h_in) over w = 1 or lead(dim_h_in) over w - dim_h_in = 1) as seq
          from d window w as (partition by id_referencia order by id_ensaio)) x
 where seq or greatest(dim_h_in, dim_d_in) > 3
union all
-- mesma condição medida mais de uma vez: réplica é normal; só pede conferência se as taxas diferem mais de 2×
select id_ensaio, id_referencia, 'taxa_reacao_mol_cm2_s', 'conferir',
       'réplica da mesma condição (referência, rocha, sistema, temperatura, pressão e rotação) com taxa ' ||
       round((mx / nullif(mn, 0))::numeric, 1) || '× diferente entre as medidas: conferir se não é lançamento trocado'
  from (select id_ensaio, id_referencia,
               max(taxa_reacao_mol_cm2_s) over g as mx, min(taxa_reacao_mol_cm2_s) over g as mn, count(*) over g as n
          from d where (rotacao_rpm is not null or shear_rate_s1 is not null) and taxa_reacao_mol_cm2_s > 0
        window g as (partition by id_referencia, id_rocha, id_sistema, temperatura_c, pressao_psi, rotacao_rpm, shear_rate_s1)) y
 where n > 1 and mx > 2 * mn
union all
select id_ensaio, id_referencia, 'rotacao_rpm', 'incompleto',
       'sem rotação nem taxa de cisalhamento: a medida não entra no gráfico de Levich'
  from d where rotacao_rpm is null and shear_rate_s1 is null
union all
select id_ensaio, id_referencia, 'pressao_psi', 'incompleto', 'sem pressão: verificar se o ensaio foi à pressão ambiente'
  from d where pressao_psi is null
union all
select id_ensaio, id_referencia, 'metodo_quantificacao', 'incompleto', 'sem método de quantificação'
  from d where metodo_quantificacao is null
union all
select id_ensaio, id_referencia, 'obtencao_dado', 'incompleto',
       'procedência do valor não catalogada (tabelado, lido de gráfico ou medida na superfície?)'
  from d where obtencao_dado is null or obtencao_dado = 'não catalogado'
union all
select d.id_ensaio, d.id_referencia, 'id_rocha', 'incompleto', 'rocha sem composição informada (' || r.litologia || ')'
  from d join public.lit_rochas r on r.id_rocha = d.id_rocha
 where r.composicao_texto is null and r.calcita_pct is null and r.dolomita_pct is null and r.razao_ca_mg is null
union all
select d.id_ensaio, d.id_referencia, 'conc_m', 'incompleto',
       'concentração em ' || coalesce(s.unidade_1, '?') || ' de ' || s.componente_1 || ' não converte para mol/L (falta massa molar ou unidade)'
  from d join public.v_sistemas_acidos s on s.id_sistema = d.id_sistema
 where s.conc_m is null;

-- resumo por publicação: o que falta conferir
create or replace view public.v_lit_conferencia
with (security_invoker = true) as
select pu.id_referencia, pu.autor, pu.ano,
       count(d.id_ensaio)                                              as n_medidas,
       count(d.id_ensaio) filter (where d.conferido)                   as n_conferidas,
       count(d.id_ensaio) filter (where d.origem_registro = 'formulario') as n_pelo_painel,
       (select count(*) from public.v_lit_pendencias p
         where p.id_referencia = pu.id_referencia and p.gravidade in ('erro', 'conferir')) as n_a_conferir,
       (select count(*) from public.v_lit_pendencias p
         where p.id_referencia = pu.id_referencia and p.gravidade = 'incompleto')          as n_incompletas
from public.publicacoes pu
left join public.lit_dados_rda d on d.id_referencia = pu.id_referencia
where pu.categoria = 'geral'
group by pu.id_referencia, pu.autor, pu.ano;

-- -----------------------------------------------------------------------------
-- 5. Sistemas ácidos com a MESMA composição cadastrados com códigos diferentes
-- -----------------------------------------------------------------------------
create or replace function public.assinatura_sistema(s public.sistemas_acidos)
returns text language sql immutable as $$
    -- ordem dos componentes não importa ("HCl + IC" = "IC + HCl"); 15 = 15.0
    select string_agg(parte, ';' order by parte collate "C")
      from (select lower(btrim(c)) || '=' || coalesce(trim_scale(v)::text, '') || coalesce(lower(btrim(u)), '') as parte
      from (values (1, s.componente_1, s.valor_1, s.unidade_1), (2, s.componente_2, s.valor_2, s.unidade_2),
                   (3, s.componente_3, s.valor_3, s.unidade_3), (4, s.componente_4, s.valor_4, s.unidade_4)) as x(k, c, v, u)
     where c is not null) as partes
$$;

create or replace view public.v_sistemas_duplicados
with (security_invoker = true) as
select public.assinatura_sistema(s)                as assinatura,
       min(s.id_sistema)                            as id_principal,
       array_agg(s.id_sistema order by s.id_sistema) as ids,
       count(*)                                     as quantidade
from public.sistemas_acidos s
group by 1
having count(*) > 1;

-- -----------------------------------------------------------------------------
-- 6. v_lit_dados_rda ganha as colunas novas (no fim, para não quebrar quem já lê)
-- -----------------------------------------------------------------------------
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
    d.criado_em, d.atualizado_em,
    d.origem_registro, d.fonte_local, d.observacao, d.unidades_originais,
    d.conferido, d.conferido_em, d.criado_por,
    (select count(*) from public.v_lit_pendencias p
      where p.id_ensaio = d.id_ensaio and p.gravidade in ('erro', 'conferir')) as n_a_conferir
from public.lit_dados_rda d
join public.publicacoes pu        on pu.id_referencia = d.id_referencia
join public.lit_rochas ro         on ro.id_rocha = d.id_rocha
join public.v_sistemas_acidos s   on s.id_sistema = d.id_sistema;

-- -----------------------------------------------------------------------------
-- 6b. Ensaios RDA do PRÓPRIO laboratório (analise_rda, ligados à amostra/disco): mesmos campos da
--     literatura, para o mesmo formulário de série servir aos dois e a comparação lab x literatura ficar completa
-- -----------------------------------------------------------------------------
alter table public.analise_rda
    add column if not exists serie                text,     -- agrupa os pontos de uma mesma curva (Levich): 'IL-HCl15-T50'
    add column if not exists tipo_variavel        text not null default 'rotação (RDA)'
                                                  check (tipo_variavel in ('rotação (RDA)', 'taxa de cisalhamento', 'não informada')),
    add column if not exists shear_rate_s1        numeric,
    add column if not exists metodo_coef_difusao  text,
    add column if not exists volume_acido_ml      numeric check (volume_acido_ml > 0),   -- volume no reator (para a taxa pela curva de Ca²⁺)
    add column if not exists area_cm2             numeric check (area_cm2 > 0),          -- face do disco exposta ao ácido
    add column if not exists taxa_calculada       boolean not null default false;        -- true = taxa saiu da curva [Ca²⁺] × tempo
create index if not exists analise_rda_serie_idx on public.analise_rda (serie);

create or replace view public.v_analise_rda
with (security_invoker = true) as
select r.*, a.codigo as amostra, a.litologia, a.projeto_id,
       s.nome_sistema, s.componente_1 as acido, s.valor_1 as conc_valor, s.unidade_1 as conc_unidade,
       s.conc_m, s.conc_pct, s.aditivos
from public.analise_rda r
join public.amostras a on a.id = r.amostra_id
join public.v_sistemas_acidos s on s.id_sistema = r.id_sistema;

-- comparação lab x literatura: mesmas colunas de antes + as novas no fim
create or replace view public.v_rda_comparacao
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
       r.id_sistema, r.temperatura_c, r.tipo_variavel, r.shear_rate_s1, r.serie, true
from public.v_analise_rda r;

-- -----------------------------------------------------------------------------
-- 7. Acesso: ler = qualquer usuário logado; escrever = editor (igual aos outros catálogos)
-- -----------------------------------------------------------------------------
alter table public.lit_listas    enable row level security;
alter table public.lit_qualidade enable row level security;

drop policy if exists lit_listas_ler on public.lit_listas;
drop policy if exists lit_listas_escrever on public.lit_listas;
create policy lit_listas_ler on public.lit_listas for select using (app.logado());
create policy lit_listas_escrever on public.lit_listas for all using (app.eh_editor()) with check (app.eh_editor());

drop policy if exists lit_qualidade_ler on public.lit_qualidade;
drop policy if exists lit_qualidade_escrever on public.lit_qualidade;
create policy lit_qualidade_ler on public.lit_qualidade for select using (app.logado());
create policy lit_qualidade_escrever on public.lit_qualidade for all using (app.eh_editor()) with check (app.eh_editor());

drop trigger if exists lit_qualidade_historico on public.lit_qualidade;
create trigger lit_qualidade_historico after insert or update or delete on public.lit_qualidade
    for each row execute function public.tg_historico('id');

grant select, insert, update, delete on public.lit_listas, public.lit_qualidade to authenticated;
grant select on public.v_lit_pendencias, public.v_lit_conferencia, public.v_sistemas_duplicados, public.v_lit_dados_rda,
                public.v_analise_rda, public.v_rda_comparacao to authenticated;
grant execute on function public.assinatura_sistema(public.sistemas_acidos) to authenticated;
revoke all on public.lit_listas, public.lit_qualidade from anon;
revoke all on public.v_lit_pendencias, public.v_lit_conferencia, public.v_sistemas_duplicados, public.v_lit_dados_rda,
              public.v_analise_rda, public.v_rda_comparacao from anon;

-- -----------------------------------------------------------------------------
-- 8. Cadastro de uma SÉRIE pelo painel, tudo ou nada (é assim que a planilha é preenchida: uma condição
--    — referência, rocha, sistema, temperatura, pressão, disco — repetida em várias rotações).
--    Cria publicação / rocha / sistema novos se vierem sem código; os códigos saem dos gatilhos.
--    security invoker: as regras de acesso valem normalmente (só editor grava).
--
--    p = { "id_referencia": "REF-R03" | null, "publicacao": {autor, ano, titulo, periodico, doi, link},
--          "id_rocha": "RCH-04" | null,      "rocha": {litologia, composicao_texto, calcita_pct, ...},
--          "id_sistema": "SA01" | null,      "sistema": {nome_sistema, componente_1, valor_1, unidade_1, ...},
--          "condicao": {ano, dim_h_in, dim_d_in, temperatura_c, pressao_psi, tipo_variavel, metodo_quantificacao,
--                       metodo_coef_difusao, obtencao_dado, fonte_local, unidades_originais, observacao},
--          "pontos": [{rotacao_rpm, shear_rate_s1, taxa_reacao_mol_cm2_s, coef_difusao_cm2_s, observacao}, ...] }
-- -----------------------------------------------------------------------------
create or replace function public.lit_cadastrar_serie(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
    v_ref text := nullif(btrim(p ->> 'id_referencia'), '');
    v_rocha text := nullif(btrim(p ->> 'id_rocha'), '');
    v_sis text := nullif(btrim(p ->> 'id_sistema'), '');
    v_ano integer;
    c jsonb := coalesce(p -> 'condicao', '{}'::jsonb);
    ids text[];
begin
    if not app.eh_editor() then
        raise exception 'Sem permissão: só editor ou administrador cadastra dados da literatura' using errcode = '42501';
    end if;
    if jsonb_array_length(coalesce(p -> 'pontos', '[]'::jsonb)) = 0 then
        raise exception 'A série não tem pontos (rotação + taxa)' using errcode = '22023';
    end if;

    if v_ref is null then
        if p -> 'publicacao' is null then raise exception 'Informe a publicação (id_referencia ou publicacao)' using errcode = '22023'; end if;
        insert into publicacoes (categoria, autor, ano, titulo, periodico, doi, link)
        select 'geral', x.autor, x.ano, x.titulo, x.periodico, x.doi, x.link
          from jsonb_to_record(p -> 'publicacao') as x(autor text, ano text, titulo text, periodico text, doi text, link text)
        returning id_referencia into v_ref;
    end if;

    if v_rocha is null then
        if p -> 'rocha' is null then raise exception 'Informe a rocha (id_rocha ou rocha)' using errcode = '22023'; end if;
        insert into litologias (nome) values (p -> 'rocha' ->> 'litologia') on conflict do nothing;
        insert into lit_rochas (litologia, composicao_texto, calcita_pct, calcita_qualificador, dolomita_pct,
                                dolomita_qualificador, razao_ca_mg)
        select x.litologia, x.composicao_texto, x.calcita_pct, x.calcita_qualificador, x.dolomita_pct,
               x.dolomita_qualificador, x.razao_ca_mg
          from jsonb_to_record(p -> 'rocha') as x(litologia text, composicao_texto text, calcita_pct numeric,
               calcita_qualificador text, dolomita_pct numeric, dolomita_qualificador text, razao_ca_mg numeric)
        returning id_rocha into v_rocha;
    end if;

    if v_sis is null then
        if p -> 'sistema' is null then raise exception 'Informe o sistema ácido (id_sistema ou sistema)' using errcode = '22023'; end if;
        -- mesma composição já cadastrada? usa a existente em vez de criar outra repetida
        select s.id_sistema into v_sis
          from sistemas_acidos s
         where public.assinatura_sistema(s) = public.assinatura_sistema(
                   jsonb_populate_record(null::sistemas_acidos, p -> 'sistema' || '{"id_sistema": "x"}'))
         order by s.id_sistema limit 1;
        if v_sis is null then
            insert into sistemas_acidos (nome_sistema, categoria, nome_comercial,
                componente_1, valor_1, unidade_1, componente_2, valor_2, unidade_2,
                componente_3, valor_3, unidade_3, componente_4, valor_4, unidade_4, composicao_original)
            select x.nome_sistema, x.categoria, x.nome_comercial, x.componente_1, x.valor_1, x.unidade_1,
                   x.componente_2, x.valor_2, x.unidade_2, x.componente_3, x.valor_3, x.unidade_3,
                   x.componente_4, x.valor_4, x.unidade_4, x.composicao_original
              from jsonb_populate_record(null::sistemas_acidos, p -> 'sistema') as x
            returning id_sistema into v_sis;
        end if;
    end if;

    v_ano := coalesce((c ->> 'ano')::integer,
                      (select substring(ano from '\d{4}')::integer from publicacoes where id_referencia = v_ref));

    with novos as (
        insert into lit_dados_rda (id_referencia, ano, id_rocha, id_sistema, dim_h_in, dim_d_in, temperatura_c,
                                   pressao_psi, tipo_variavel, rotacao_rpm, shear_rate_s1, taxa_reacao_mol_cm2_s,
                                   coef_difusao_cm2_s, metodo_coef_difusao, metodo_quantificacao, obtencao_dado,
                                   fonte_local, unidades_originais, observacao, origem_registro)
        select v_ref, v_ano, v_rocha, v_sis, (c ->> 'dim_h_in')::numeric, (c ->> 'dim_d_in')::numeric,
               (c ->> 'temperatura_c')::numeric, (c ->> 'pressao_psi')::numeric,
               coalesce(c ->> 'tipo_variavel', case when pt.shear_rate_s1 is not null then 'taxa de cisalhamento'
                                                    when pt.rotacao_rpm is not null then 'rotação (RDA)' else 'não informada' end),
               pt.rotacao_rpm, pt.shear_rate_s1, pt.taxa_reacao_mol_cm2_s, pt.coef_difusao_cm2_s,
               c ->> 'metodo_coef_difusao', c ->> 'metodo_quantificacao', coalesce(c ->> 'obtencao_dado', 'tabelado'),
               coalesce(pt.fonte_local, c ->> 'fonte_local'), c -> 'unidades_originais',
               concat_ws(' · ', nullif(c ->> 'observacao', ''), nullif(pt.observacao, '')), 'formulario'
          from jsonb_array_elements(p -> 'pontos') with ordinality as e(j, n)
          cross join lateral jsonb_to_record(e.j) as pt(rotacao_rpm numeric, shear_rate_s1 numeric,
               taxa_reacao_mol_cm2_s double precision, coef_difusao_cm2_s double precision, fonte_local text,
               observacao text)
         order by e.n
        returning id_ensaio)
    select array_agg(id_ensaio order by id_ensaio) into ids from novos;

    return jsonb_build_object('id_referencia', v_ref, 'id_rocha', v_rocha, 'id_sistema', v_sis, 'ids', to_jsonb(ids));
end $$;
grant execute on function public.lit_cadastrar_serie(jsonb) to authenticated;
revoke execute on function public.lit_cadastrar_serie(jsonb) from anon, public;

notify pgrst, 'reload schema';
