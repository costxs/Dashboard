"""Gráficos da acidificação a partir do que foi gravado (dashboard), com o banco simulado."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import acidificacao_salva as salva
from graficos.acidificacao import Dados, detectar_fases

AQUI = Path(__file__).parent


@pytest.fixture
def ambiente(monkeypatch):
    monkeypatch.setenv("MODO_DEV", "1")          # de propósito: estes gráficos exigem login mesmo assim
    d = Dados((AQUI / "acidificacao_ficticio.xlsx").read_bytes())
    fases = detectar_fases(d)
    passo = max(1, -(-len(d.linhas) // 2000))     # como o gerencial grava: no máximo 2.000 pontos
    pontos = [{"x": l[d.c["t"]], "y": d.v(l, "dp")} for l in d.linhas[::passo] if d.v(l, "dp") is not None]
    banco = {
        "analise_coreflooding": [{"id": 7, "amostra_id": "x", "volume_poroso_usado_cm3": 11.59, "volume_morto_cm3": 0.5, "temperatura_c": 40}],
        "acidificacao_fases": [{"ordem": f.ordem, "papel": f.papel, "vazao_ml_min": f.q, "t_inicio_s": f.t_inicio,
                                "t_fim_s": f.t_fim, "fluido": f.fluido} for f in fases],
        "curvas": [{"id": 99}],
        "curva_pontos": pontos,
    }
    pedidos = []

    def ler(token, caminho, params):
        pedidos.append((token, caminho))
        if token != "tok-ok":
            raise salva.HTTPException(401, "sessão inválida ou expirada")
        if caminho == "analise_coreflooding" and params["id"] != "eq.7":
            return []                               # o RLS esconde: para a pessoa, o ensaio não existe
        return banco[caminho]

    monkeypatch.setattr(salva, "_ler", ler)
    from app import app
    return TestClient(app), pedidos


def _post(cliente, token=None, **corpo):
    cab = {"Authorization": f"Bearer {token}"} if token else {}
    return cliente.post("/acidificacao/grafico-salvo", json={"analise_id": 7, **corpo}, headers=cab)


@pytest.mark.parametrize("qual", ["geral", "pv", "apos"])
@pytest.mark.parametrize("formato,inicio", [("png", b"\x89PNG"), ("svg", b"<?xml"), ("pdf", b"%PDF")])
def test_tres_graficos_do_que_foi_gravado(ambiente, qual, formato, inicio):
    cliente, _ = ambiente
    r = _post(cliente, token="tok-ok", qual=qual, formato=formato, dpi=80)
    assert r.status_code == 200, r.text
    assert r.content.startswith(inicio)


def test_sem_pvbt_marcado(ambiente):
    cliente, _ = ambiente
    r = _post(cliente, token="tok-ok", qual="pv", formato="svg")
    assert r.status_code == 200 and b"PVbt" not in r.content


def test_sem_login_nao_le_o_banco(ambiente):
    cliente, pedidos = ambiente
    assert _post(cliente).status_code == 401
    assert pedidos == []


def test_ensaio_de_outro_projeto_nao_aparece(ambiente):
    cliente, _ = ambiente
    r = cliente.post("/acidificacao/grafico-salvo", json={"analise_id": 8}, headers={"Authorization": "Bearer tok-ok"})
    assert r.status_code == 404
