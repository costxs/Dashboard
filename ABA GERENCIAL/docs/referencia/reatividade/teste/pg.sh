#!/usr/bin/env bash
# Sobe um PostgreSQL descartável (local, só para testes) e aplica o stub do Supabase + as migrações.
# Uso: teste/pg.sh <porta> <pasta com TODAS as migrações, 001 a 021>
#   ex.: teste/pg.sh 54365 supabase/migrations   ->   PGPORTA=54365 npx vitest run src/importador/cadastroReatividade.banco.test.ts
# Use um banco VAZIO para cada arquivo de teste de banco (PGPORTA para o cadastro, PGPORTA_BDD para o importador, PGPORTA_RDA para os discos).
set -e
AQUI=$(cd "$(dirname "$0")" && pwd); P=$1; MIG=$2
B=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
D=/tmp/pg_$P; rm -rf $D; mkdir -p $D && chown postgres $D
su postgres -c "$B/initdb -D $D/data -U postgres --auth=trust -E UTF8 >/dev/null && $B/pg_ctl -D $D/data -o '-p $P -k /tmp' -l $D/log start >/dev/null"
sleep 3
export PGHOST=/tmp PGPORT=$P PGUSER=postgres
createdb lcpetro
psql -q -v ON_ERROR_STOP=1 -d lcpetro -f "$AQUI/supabase_stub.sql"
for f in "$MIG"/*.sql; do psql -q -v ON_ERROR_STOP=1 -d lcpetro -f "$f" 2>&1 | grep -iv notice | head -5; done
echo "banco pronto na porta $P"
