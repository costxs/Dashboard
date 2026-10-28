-- =============================================================================
-- Diagnóstico de memória / carga do banco (só leitura: não altera nada).
-- Rode no SQL Editor do Supabase, uma consulta por vez, e veja o resultado de cada uma.
-- =============================================================================

-- 1. Conexões abertas: cada uma reserva memória. Muitas "idle" = algum app abrindo e não fechando.
select usename, application_name, state, count(*) as conexoes
from pg_stat_activity
where datname = current_database()
group by 1, 2, 3
order by conexoes desc;

-- 2. Tabelas que mais ocupam espaço (dados + índices). curva_pontos e historico costumam ser as maiores.
select c.relname as tabela,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho_total,
       pg_size_pretty(pg_indexes_size(c.oid))        as so_indices,
       c.reltuples::bigint                            as linhas_aprox
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 15;

-- 3. Consultas que mais gastam tempo no total (precisa da extensão pg_stat_statements, que o Supabase já liga).
select left(query, 120) as consulta, calls as vezes,
       round(total_exec_time::numeric / 1000, 1) as segundos_total,
       round(mean_exec_time::numeric, 1)         as ms_por_vez,
       shared_blks_hit + shared_blks_read       as paginas_lidas
from extensions.pg_stat_statements
order by total_exec_time desc
limit 15;

-- 4. Tabelas lidas inteiras com frequência (seq_scan alto e muitas linhas) = índice faltando.
select relname as tabela, seq_scan, seq_tup_read, idx_scan, n_live_tup as linhas
from pg_stat_user_tables
where schemaname = 'public'
order by seq_tup_read desc
limit 15;
