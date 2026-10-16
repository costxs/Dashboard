"""
Importador da planilha BDD_LCPETRO_Reatividade para o banco do LC PETRO
(Supabase por enquanto; funciona igual num PostgreSQL próprio).

A planilha é o banco de dados da LITERATURA GERAL: as publicações vão para
"publicacoes" (categoria geral), as rochas para "lit_rochas" e as medidas para
"lit_dados_rda". Os ensaios do próprio laboratório NÃO entram por aqui: eles
são lançados na amostra, pelo painel.

Roda numa máquina do laboratório: a planilha vai direto para o banco.

Duas etapas, sempre nesta ordem:

  1) Conferir (padrão, não grava nada):
        python importar.py BDD_LCPETRO_Reatividade.xlsx
     -> mostra o resumo e salva relatorio_validacao.xlsx com cada problema
        (aba, linha do Excel, campo, o que está errado).

  2) Gravar:
        python importar.py BDD_LCPETRO_Reatividade.xlsx --aplicar
     -> só grava se não houver ERROS (avisos não bloqueiam). Tudo numa
        transação: ou entra tudo, ou nada.
        Com --pular-erros, grava o que está certo e deixa de fora as linhas
        com erro.

A conexão vem da variável de ambiente DATABASE_URL (Supabase: botão Connect ->
"Session pooler" ou "Direct connection"). Essa senha dá acesso total ao banco:
não coloque no código nem no GitHub. Com --usuario <email>, o histórico registra
quem fez a importação.

Reimportar a planilha é seguro: linhas com o mesmo id são ATUALIZADAS, não
duplicadas. Linhas que sumiram da planilha NÃO são apagadas do banco.

"""
from __future__ import annotations

import argparse
import math
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

# -----------------------------------------------------------------------------
# Regras de padronização (as mesmas descritas na aba LEIA-ME)
# -----------------------------------------------------------------------------

NULOS = {"", "-", "—", "–", "nan", "none", "n/a", "na"}

SINONIMOS_LITOLOGIA = {
    "indiana": "Indiana Limestone",
    "calcário indiana": "Indiana Limestone",
    "cálcario indiana": "Indiana Limestone",
    "calcario indiana": "Indiana Limestone",
    "pink desert": "Pink Desert Limestone",
    "alamaba marble": "Alabama Marble",
}

LISTA_TIPO_VARIAVEL = ["rotação (RDA)", "taxa de cisalhamento", "não informada"]
LISTA_OBTENCAO = ["tabelado", "lido de gráfico", "medida na superfície", "não catalogado"]
UNIDADES_CONC = {"n": "N", "m": "M", "wt%": "wt%", "wt %": "wt%", "%wt": "wt%",
                 "vol%": "vol%", "vol %": "vol%", "%vol": "vol%", "mm": "mM"}

# colunas verdes da aba ensaios: o banco recalcula, o importador ignora
CALCULADAS_ENSAIOS = {
    "litologia", "composicao_rocha", "calcita_pct", "acido", "conc_valor", "conc_unidade",
    "conc_pct", "conc_m", "aditivos", "temperatura_nominal_c", "omega_rad_s",
    "raiz_omega", "taxa_reacao_mol_m2_s",
}

COLS_ENSAIOS_TEXTO = ["id_ensaio", "id_referencia", "id_rocha", "id_sistema",
                      "tipo_variavel", "metodo_coef_difusao", "metodo_quantificacao",
                      "obtencao_dado", "cor_celula", "variavel_original", "sistema_original"]
COLS_ENSAIOS_NUM = ["dim_h_in", "dim_d_in", "temperatura_c", "pressao_psi", "rotacao_rpm",
                    "shear_rate_s1", "taxa_reacao_mol_cm2_s", "coef_difusao_cm2_s"]

# faixas de plausibilidade: fora delas vira AVISO (não bloqueia)
FAIXAS = {
    "temperatura_c": (0, 250, "°C"),
    "pressao_psi": (0, 15000, "psi"),
    "rotacao_rpm": (0, 10000, "rpm"),
    "taxa_reacao_mol_cm2_s": (1e-10, 1e-4, "mol/(cm²·s)"),
    "coef_difusao_cm2_s": (1e-8, 1e-3, "cm²/s"),
}


# -----------------------------------------------------------------------------
# Registro de problemas
# -----------------------------------------------------------------------------

@dataclass
class Problemas:
    itens: list = field(default_factory=list)

    def erro(self, aba, linha, chave, campo, msg):
        self.itens.append(dict(severidade="ERRO", aba=aba, linha_excel=linha,
                               id=chave, campo=campo, mensagem=msg))

    def aviso(self, aba, linha, chave, campo, msg):
        self.itens.append(dict(severidade="AVISO", aba=aba, linha_excel=linha,
                               id=chave, campo=campo, mensagem=msg))

    def correcao(self, aba, linha, chave, campo, msg):
        self.itens.append(dict(severidade="CORRIGIDO", aba=aba, linha_excel=linha,
                               id=chave, campo=campo, mensagem=msg))

    def linhas_com_erro(self, aba):
        return {p["linha_excel"] for p in self.itens
                if p["aba"] == aba and p["severidade"] == "ERRO"}

    def conta(self, sev):
        return sum(1 for p in self.itens if p["severidade"] == sev)


# -----------------------------------------------------------------------------
# Limpeza de células
# -----------------------------------------------------------------------------

def texto(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return None if s.lower() in NULOS else s


def numero(v):
    """Converte célula em número. Aceita '0,1', '5,24E-07', '1.000,5'.
    Devolve None para vazio/'-'. Levanta ValueError se não for número."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = texto(v)
    if s is None:
        return None
    s = s.replace(" ", "")
    if "," in s and "." in s:          # 1.000,5
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    s = s.rstrip(".")                  # '1000.' (formatação do Sheets)
    return float(s)


def inteiro(v):
    n = numero(v)
    return None if n is None else int(round(n))


def ler_planilha(caminho: Path) -> dict[str, pd.DataFrame]:
    abas = pd.read_excel(caminho, sheet_name=None, dtype=object)
    saida = {}
    for nome, df in abas.items():
        df.columns = [str(c).strip().lower() for c in df.columns]
        df = df.dropna(how="all")
        df.index = df.index + 2        # índice = número da linha no Excel
        saida[nome.strip().lower()] = df
    return saida


def normaliza_lista(valor, permitidos):
    """Casa com a lista ignorando maiúsculas/espaços. Devolve o valor oficial ou None."""
    if valor is None:
        return None
    alvo = valor.strip().lower()
    for p in permitidos:
        if p.lower() == alvo:
            return p
    return None


def normaliza_litologia(v):
    if v is None:
        return None
    return SINONIMOS_LITOLOGIA.get(v.lower(), v)


def qualificador(texto_comp, mineral):
    """'[Calcita] > 99 %' -> '>' ;  '[Calcita]= 99%' -> '='"""
    if not texto_comp:
        return None
    m = re.search(rf"\[{mineral}\]\s*(>=|<=|≥|≤|>|<|=|~)", texto_comp, re.I)
    if not m:
        return None
    return {"≥": ">=", "≤": "<="}.get(m.group(1), m.group(1))


# -----------------------------------------------------------------------------
# Processamento de cada aba
# -----------------------------------------------------------------------------

def proc_referencias(df, P):
    linhas = []
    for i, r in df.iterrows():
        rid = texto(r.get("id_referencia"))
        if not rid:
            P.erro("referencias", i, None, "id_referencia", "sem identificador")
            continue
        autor = texto(r.get("autor"))
        if autor:
            novo = re.sub(r"\bat al\b", "et al", autor)
            novo = re.sub(r"\bet al\.", "et al", novo)
            if novo != autor:
                P.correcao("referencias", i, rid, "autor", f"'{autor}' -> '{novo}'")
                autor = novo
        else:
            P.erro("referencias", i, rid, "autor", "autor vazio")
        ano = texto(r.get("ano"))
        if ano and ano.endswith(".0"):
            ano = ano[:-2]
        if ano and not re.fullmatch(r"\d{4}", ano):
            P.aviso("referencias", i, rid, "ano",
                    f"'{ano}' parece agrupar várias publicações; o ideal é uma linha por artigo")
        linhas.append(dict(_linha=i, id_referencia=rid, autor=autor, ano=ano,
                           titulo=texto(r.get("titulo")), periodico=texto(r.get("periodico")),
                           doi=texto(r.get("doi")),
                           _n_digitado=inteiro(r.get("n_ensaios")) if "n_ensaios" in r else None))
    return linhas


def proc_fluidos(df, P):
    linhas = []
    for i, r in df.iterrows():
        comp = texto(r.get("componente"))
        if not comp:
            continue
        d = dict(_linha=i, componente=comp, observacao=texto(r.get("observacao")))
        for c in ("massa_molar_g_mol", "coef_densidade"):
            try:
                d[c] = numero(r.get(c))
            except ValueError:
                P.erro("fluidos_prop", i, comp, c, f"não é número: {r.get(c)!r}")
                d[c] = None
        try:
            d["n_equivalentes"] = inteiro(r.get("n_equivalentes"))
        except ValueError:
            P.erro("fluidos_prop", i, comp, "n_equivalentes", "não é número")
            d["n_equivalentes"] = None
        linhas.append(d)
    return linhas


def proc_rochas(df, P):
    linhas = []
    for i, r in df.iterrows():
        rid = texto(r.get("id_rocha"))
        if not rid:
            P.erro("rochas", i, None, "id_rocha", "sem identificador")
            continue
        lit_orig = texto(r.get("litologia"))
        lit = normaliza_litologia(lit_orig)
        if lit != lit_orig:
            P.correcao("rochas", i, rid, "litologia", f"'{lit_orig}' -> '{lit}'")
        if not lit:
            P.erro("rochas", i, rid, "litologia", "litologia vazia")
        comp = texto(r.get("composicao_texto"))
        d = dict(_linha=i, id_rocha=rid, litologia=lit, composicao_texto=comp)
        for c in ("calcita_pct", "dolomita_pct", "razao_ca_mg"):
            try:
                d[c] = numero(r.get(c))
            except ValueError:
                P.erro("rochas", i, rid, c, f"não é número: {r.get(c)!r}")
                d[c] = None
        d["calcita_qualificador"] = qualificador(comp, "calcita") if d["calcita_pct"] is not None else None
        d["dolomita_qualificador"] = qualificador(comp, "dolomita") if d["dolomita_pct"] is not None else None
        if comp is None and all(d[c] is None for c in ("calcita_pct", "dolomita_pct", "razao_ca_mg")):
            P.aviso("rochas", i, rid, "composicao_texto", "composição não informada pela fonte")
        linhas.append(d)
    return linhas


def proc_sistemas(df, P, fluidos_ok):
    linhas = []
    for i, r in df.iterrows():
        sid = texto(r.get("id_sistema"))
        if not sid:
            P.erro("sistemas_acidos", i, None, "id_sistema", "sem identificador")
            continue
        d = dict(_linha=i, id_sistema=sid, nome_sistema=texto(r.get("nome_sistema")),
                 composicao_original=texto(r.get("composicao_original")))
        for k in range(1, 5):
            d[f"componente_{k}"] = texto(r.get(f"componente_{k}"))
            try:
                d[f"valor_{k}"] = numero(r.get(f"valor_{k}"))
            except ValueError:
                P.erro("sistemas_acidos", i, sid, f"valor_{k}", f"não é número: {r.get(f'valor_{k}')!r}")
                d[f"valor_{k}"] = None
            u = texto(r.get(f"unidade_{k}"))
            if u is not None:
                u_norm = UNIDADES_CONC.get(u.lower(), u)
                if u_norm != u:
                    P.correcao("sistemas_acidos", i, sid, f"unidade_{k}", f"'{u}' -> '{u_norm}'")
                u = u_norm
            d[f"unidade_{k}"] = u
        if not d["nome_sistema"]:
            d["nome_sistema"] = d["componente_1"] or sid
        if not d["componente_1"]:
            P.erro("sistemas_acidos", i, sid, "componente_1", "ácido principal vazio")
        else:
            if d["componente_1"] not in fluidos_ok:
                P.aviso("sistemas_acidos", i, sid, "componente_1",
                        f"'{d['componente_1']}' não está em fluidos_prop: conc_M e conc_pct ficam vazios")
            if d["unidade_1"] not in ("N", "M", "wt%"):
                P.aviso("sistemas_acidos", i, sid, "unidade_1",
                        f"unidade '{d['unidade_1']}' não converte para mol/L")
        linhas.append(d)
    return linhas


def proc_ensaios(df, P, refs_ok, rochas_ok, sistemas_ok):
    ignoradas = sorted(c for c in df.columns if c in CALCULADAS_ENSAIOS)
    linhas, vistos = [], {}
    for i, r in df.iterrows():
        eid = texto(r.get("id_ensaio"))
        if not eid:
            P.erro("ensaios", i, None, "id_ensaio", "sem identificador")
            continue
        if eid in vistos:
            P.erro("ensaios", i, eid, "id_ensaio", f"repetido (já usado na linha {vistos[eid]})")
            continue
        vistos[eid] = i

        d = dict(_linha=i)
        for c in COLS_ENSAIOS_TEXTO:
            d[c] = texto(r.get(c))
        for c in COLS_ENSAIOS_NUM:
            try:
                d[c] = numero(r.get(c))
            except ValueError:
                P.erro("ensaios", i, eid, c, f"não é número: {r.get(c)!r}")
                d[c] = None
        try:
            d["ano"] = inteiro(r.get("ano"))
        except ValueError:
            P.aviso("ensaios", i, eid, "ano", f"ano inválido: {r.get('ano')!r}")
            d["ano"] = None

        # chaves para os catálogos
        if not d["id_referencia"]:
            P.erro("ensaios", i, eid, "id_referencia", "medida sem referência")
        if d["id_referencia"] and d["id_referencia"] not in refs_ok:
            P.erro("ensaios", i, eid, "id_referencia", f"'{d['id_referencia']}' não existe em referencias")
        if d["id_rocha"] not in rochas_ok:
            P.erro("ensaios", i, eid, "id_rocha", f"'{d['id_rocha']}' não existe em rochas")
        if d["id_sistema"] not in sistemas_ok:
            P.erro("ensaios", i, eid, "id_sistema", f"'{d['id_sistema']}' não existe em sistemas_acidos")

        # listas suspensas
        for campo, lista in (("tipo_variavel", LISTA_TIPO_VARIAVEL), ("obtencao_dado", LISTA_OBTENCAO)):
            v = d[campo]
            if v is None:
                continue
            ok = normaliza_lista(v, lista)
            if ok is None:
                P.erro("ensaios", i, eid, campo, f"'{v}' não está na lista ({'; '.join(lista)})")
            elif ok != v:
                P.correcao("ensaios", i, eid, campo, f"'{v}' -> '{ok}'")
                d[campo] = ok
            else:
                d[campo] = ok
        if d["metodo_quantificacao"]:
            novo = re.sub(r"\s*/\s*", " / ", d["metodo_quantificacao"])
            if novo != d["metodo_quantificacao"]:
                P.correcao("ensaios", i, eid, "metodo_quantificacao",
                           f"'{d['metodo_quantificacao']}' -> '{novo}'")
                d["metodo_quantificacao"] = novo

        # coerência
        if d["tipo_variavel"] == "rotação (RDA)" and d["rotacao_rpm"] is None:
            P.aviso("ensaios", i, eid, "rotacao_rpm", "tipo é rotação, mas rotação está vazia")
        if d["tipo_variavel"] == "taxa de cisalhamento" and d["shear_rate_s1"] is None:
            P.aviso("ensaios", i, eid, "shear_rate_s1", "tipo é cisalhamento, mas o valor está vazio")
        if d["taxa_reacao_mol_cm2_s"] is None and f"taxa_reacao_mol_cm2_s" not in \
                {p["campo"] for p in P.itens if p["id"] == eid}:
            P.aviso("ensaios", i, eid, "taxa_reacao_mol_cm2_s", "sem taxa de reação")
        for c, (lo, hi, un) in FAIXAS.items():
            v = d.get(c)
            if v is not None and not (lo <= v <= hi):
                P.aviso("ensaios", i, eid, c, f"{v:g} {un} fora da faixa esperada ({lo:g}–{hi:g}); conferir unidade")

        linhas.append(d)
    return linhas, ignoradas


# -----------------------------------------------------------------------------
# Gravação
# -----------------------------------------------------------------------------

def upsert(cur, tabela, chave, linhas):
    if not linhas:
        return 0
    cols = [c for c in linhas[0] if not c.startswith("_")]
    atualiza = ", ".join(f"{c} = excluded.{c}" for c in cols if c != chave) or f"{chave} = excluded.{chave}"
    sql = (f"insert into public.{tabela} ({', '.join(cols)}) "
           f"values ({', '.join(['%s'] * len(cols))}) "
           f"on conflict ({chave}) do update set {atualiza}")
    cur.executemany(sql, [[l[c] for c in cols] for l in linhas])
    return len(linhas)


def gravar(dsn, dados, usuario_email=None):
    import psycopg
    with psycopg.connect(dsn) as con, con.cursor() as cur:
        if usuario_email:
            cur.execute("select id from public.perfis where lower(email) = lower(%s)", (usuario_email,))
            achou = cur.fetchone()
            if not achou:
                raise SystemExit(f"Usuário '{usuario_email}' não existe no banco.")
            cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(achou[0]),))
        for r in dados["referencias"]:
            r["categoria"] = "geral"
        n = {}
        n["publicacoes"] = upsert(cur, "publicacoes", "id_referencia", dados["referencias"])
        n["fluidos_prop"] = upsert(cur, "fluidos_prop", "componente", dados["fluidos_prop"])
        n["litologias"] = upsert(cur, "litologias", "nome", dados["litologias"])
        n["lit_rochas"] = upsert(cur, "lit_rochas", "id_rocha", dados["rochas"])
        n["sistemas_acidos"] = upsert(cur, "sistemas_acidos", "id_sistema", dados["sistemas_acidos"])
        n["lit_dados_rda"] = upsert(cur, "lit_dados_rda", "id_ensaio", dados["ensaios"])
        con.commit()
    return n


# -----------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Importa a planilha de reatividade (literatura geral) para o banco.")
    ap.add_argument("planilha", type=Path)
    ap.add_argument("--aplicar", action="store_true", help="grava no banco (sem isso, só confere)")
    ap.add_argument("--pular-erros", action="store_true", help="grava deixando de fora linhas com erro")
    ap.add_argument("--usuario", help="e-mail de quem está importando (vai para o histórico)")
    ap.add_argument("--relatorio", type=Path, default=Path("relatorio_validacao.xlsx"))
    a = ap.parse_args(argv)

    abas = ler_planilha(a.planilha)
    faltando = {"ensaios", "rochas", "sistemas_acidos"} - set(abas)
    if faltando:
        raise SystemExit(f"Abas obrigatórias não encontradas: {', '.join(sorted(faltando))}")

    P = Problemas()
    vazio = pd.DataFrame()
    refs = proc_referencias(abas.get("referencias", vazio), P)
    fluidos = proc_fluidos(abas.get("fluidos_prop", vazio), P)
    rochas = proc_rochas(abas["rochas"], P)
    sistemas = proc_sistemas(abas["sistemas_acidos"], P, {f["componente"] for f in fluidos})

    # litologias: lista oficial (aba listas) + as que aparecem em rochas
    lits = []
    if "listas" in abas and "litologia" in abas["listas"]:
        lits = [normaliza_litologia(texto(v)) for v in abas["listas"]["litologia"]]
    lits = [l for l in lits if l]
    for r in rochas:
        if r["litologia"] and r["litologia"] not in lits:
            P.aviso("rochas", r["_linha"], r["id_rocha"], "litologia",
                    f"'{r['litologia']}' não está na lista de litologias; será criada")
            lits.append(r["litologia"])
    litologias = [dict(nome=l) for l in dict.fromkeys(lits)]

    ensaios, ignoradas = proc_ensaios(
        abas["ensaios"], P,
        {r["id_referencia"] for r in refs},
        {r["id_rocha"] for r in rochas},
        {s["id_sistema"] for s in sistemas})

    # n_ensaios digitado x contado
    contagem = Counter(e["id_referencia"] for e in ensaios)
    for r in refs:
        dig = r.pop("_n_digitado", None)
        if dig is not None and dig != contagem.get(r["id_referencia"], 0):
            P.aviso("referencias", r["_linha"], r["id_referencia"], "n_ensaios",
                    f"digitado {dig}, mas há {contagem.get(r['id_referencia'], 0)} ensaios; "
                    "no banco o número é contado automaticamente")

    # ---- resumo
    print(f"\nPlanilha: {a.planilha.name}")
    print(f"  referencias {len(refs):>4}   fluidos {len(fluidos):>3}   litologias {len(litologias):>3}")
    print(f"  rochas      {len(rochas):>4}   sistemas {len(sistemas):>3}   ensaios {len(ensaios):>5}")
    if ignoradas:
        print(f"  colunas calculadas ignoradas (o banco recalcula): {', '.join(ignoradas)}")
    print(f"\n  ERROS {P.conta('ERRO')}   AVISOS {P.conta('AVISO')}   CORRIGIDOS {P.conta('CORRIGIDO')}")
    for p in [p for p in P.itens if p["severidade"] == "ERRO"][:25]:
        print(f"   ERRO  {p['aba']}!linha {p['linha_excel']}  {p['id'] or ''}  {p['campo']}: {p['mensagem']}")

    if P.itens:
        pd.DataFrame(P.itens).sort_values(["severidade", "aba", "linha_excel"]).to_excel(
            a.relatorio, index=False, sheet_name="problemas")
        print(f"\n  Relatório completo: {a.relatorio}")

    if not a.aplicar:
        print("\nNada foi gravado (modo conferência). Use --aplicar para gravar.")
        return 0

    n_erros = P.conta("ERRO")
    if n_erros and not a.pular_erros:
        print(f"\nNÃO gravado: há {n_erros} erro(s). Corrija na planilha ou use --pular-erros.")
        return 1

    # remove linhas com erro (e ensaios que dependem de catálogo removido)
    def sem_erro(lst, aba):
        ruins = P.linhas_com_erro(aba)
        return [x for x in lst if x["_linha"] not in ruins]

    dados = dict(referencias=sem_erro(refs, "referencias"), fluidos_prop=fluidos,
                 litologias=litologias, rochas=sem_erro(rochas, "rochas"),
                 sistemas_acidos=sem_erro(sistemas, "sistemas_acidos"))
    ok_r = {x["id_rocha"] for x in dados["rochas"]}
    ok_s = {x["id_sistema"] for x in dados["sistemas_acidos"]}
    ok_ref = {x["id_referencia"] for x in dados["referencias"]}
    dados["ensaios"] = [e for e in sem_erro(ensaios, "ensaios")
                        if e["id_rocha"] in ok_r and e["id_sistema"] in ok_s
                        and (e["id_referencia"] is None or e["id_referencia"] in ok_ref)]

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("Defina DATABASE_URL com a connection string do banco.")
    n = gravar(dsn, dados, a.usuario)
    print("\nGravado: " + ", ".join(f"{k} {v}" for k, v in n.items()))
    if n_erros:
        print(f"({len(ensaios) - n['lit_dados_rda']} ensaio(s) ficaram de fora por erro — ver relatório)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
