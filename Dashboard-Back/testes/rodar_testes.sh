#!/usr/bin/env bash
# Sobe um PostgreSQL descartável, aplica as migrações, importa a planilha
# fictícia, carrega amostras de exemplo e roda os testes de acesso.
# Não toca em nenhum banco real.
# Uso: bash testes/rodar_testes.sh      (PostgreSQL 15+ instalado, initdb no PATH)
set -euo pipefail
cd "$(dirname "$0")"

PORTA=54329
PGD=$(mktemp -d)/pg
initdb -D "$PGD" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$PGD" -o "-p $PORTA -k /tmp" -l "$PGD.log" start >/dev/null
trap 'pg_ctl -D "$PGD" stop >/dev/null' EXIT
sleep 2

export PGHOST=/tmp PGPORT=$PORTA PGUSER=postgres
createdb lcpetro
psql -q -v ON_ERROR_STOP=1 -d lcpetro -f stub_supabase.sql
for f in ../supabase/migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d lcpetro -f "$f"
done

python ../dados_teste/gerar_planilha_ficticia.py
DATABASE_URL="postgresql://postgres@/lcpetro?host=/tmp&port=$PORTA" \
    python ../importador/importar.py ../dados_teste/BDD_ficticio.xlsx --aplicar --pular-erros

psql -q -v ON_ERROR_STOP=1 -d lcpetro -f dados_exemplo.sql
psql -q -d lcpetro -f teste_acesso.sql
