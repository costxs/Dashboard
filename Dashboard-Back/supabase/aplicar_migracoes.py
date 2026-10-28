"""Aplica migrações no banco do Supabase direto pela conexão Postgres (o que as chaves de API não fazem).

Precisa de DATABASE_URL no Dashboard-Back/servico-graficos/.env (Supabase -> Connect -> Session pooler,
com a senha do banco no lugar de [YOUR-PASSWORD]). Essa URL dá acesso total ao banco: nunca no git.

Cada arquivo roda numa transação: se der erro, nada daquele arquivo fica gravado.

Uso (na pasta Dashboard-Back/servico-graficos, com o venv):
    .venv/Scripts/python.exe ../supabase/aplicar_migracoes.py 20261020000019 20261021000020
    .venv/Scripts/python.exe ../supabase/aplicar_migracoes.py --conferir      # só mostra o que falta
"""
from __future__ import annotations

import sys
from pathlib import Path

import psycopg
from dotenv import dotenv_values

AQUI = Path(__file__).parent
PASTA = AQUI / "migrations"
ENV = AQUI.parent / "servico-graficos" / ".env"

# sinais de que cada migração já está no banco (consultas só de estrutura)
SINAIS = {
    "20261020000019": "select has_table_privilege('anon', 'public.amostras', 'select') = false "
                      "and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                      "where n.nspname = 'app' and p.proname = 'usuario_ativo')",
    "20261021000020": "select exists (select 1 from information_schema.columns "
                      "where table_schema = 'public' and table_name = 'perfis' and column_name = 'situacao')",
    "20261021000021": "select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                      "where n.nspname = 'app' and p.proname = 'projetos_com_papel')",
}


def conectar() -> psycopg.Connection:
    url = dotenv_values(ENV).get("DATABASE_URL")
    if not url:
        sys.exit(f"Falta DATABASE_URL em {ENV} (Supabase -> Connect -> Session pooler).")
    return psycopg.connect(url, connect_timeout=15)


def aplicada(con: psycopg.Connection, prefixo: str) -> bool | None:
    sql = SINAIS.get(prefixo)
    if not sql:
        return None
    with con.cursor() as cur:
        cur.execute(sql)
        return bool(cur.fetchone()[0])


def main(args: list[str]) -> None:
    con = conectar()
    con.autocommit = False
    if "--conferir" in args:
        for p in SINAIS:
            print(f"{p}: {'aplicada' if aplicada(con, p) else 'FALTA'}")
        return
    for prefixo in args:
        arqs = sorted(PASTA.glob(f"{prefixo}*.sql"))
        if len(arqs) != 1:
            sys.exit(f"não achei uma migração única começando com {prefixo} em {PASTA}")
        arq = arqs[0]
        if aplicada(con, prefixo):
            print(f"{arq.name}: já estava aplicada, pulei")
            continue
        try:
            with con.cursor() as cur:
                cur.execute(arq.read_text(encoding="utf-8"))
            con.commit()
            print(f"{arq.name}: aplicada")
        except psycopg.Error as e:
            con.rollback()
            sys.exit(f"{arq.name}: ERRO, nada deste arquivo foi gravado -> {e}")


if __name__ == "__main__":
    main(sys.argv[1:])
