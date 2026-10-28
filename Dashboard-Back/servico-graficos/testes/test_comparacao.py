"""Comparação de resultados (comparacao.py): gráfico de PVbt gerado no backend, com o Supabase simulado."""
import pytest
from fastapi.testclient import TestClient

import comparacao

A1, A2 = "10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002"
ENSAIOS = [
    {"id_experimento": "CF-1", "id_amostra": "IL001", "amostra_uuid": A1, "pvbt": 0.11715126, "vazao_ml_min": 2, "temperatura_nominal_c": 40, "vel_intersticial_cm_min": 1.24},
    {"id_experimento": "CF-2", "id_amostra": "IL002", "amostra_uuid": A2, "pvbt": 0.31, "vazao_ml_min": 4, "temperatura_nominal_c": 60, "vel_intersticial_cm_min": 2.5},
]


@pytest.fixture
def cliente(monkeypatch):
    pedidos = []

    def falso(token, caminho, params):
        pedidos.append((token, caminho, params))
        return ENSAIOS if token == "bom" else []

    monkeypatch.setattr(comparacao, "_ler", falso)
    from app import app
    return TestClient(app), pedidos


def _post(c, token="bom", **corpo):
    cab = {"Authorization": f"Bearer {token}"} if token else {}
    return c.post("/comparacao/pvbt", json={"amostras": [A1, A2], **corpo}, headers=cab)


@pytest.mark.parametrize("visao", ["barras", "velocidade"])
def test_gera_png_nas_duas_visoes(cliente, visao):
    c, pedidos = cliente
    r = _post(c, visao=visao)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png" and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    token, caminho, params = pedidos[0]
    assert caminho == "v_pvbt" and params["fonte"] == "eq.LCPETRO" and params["pvbt"] == "not.is.null"
    assert params["amostra_uuid"] == f"in.({A1},{A2})"


def test_sem_login_e_recusado(cliente):
    c, pedidos = cliente
    assert _post(c, token=None).status_code == 401
    assert pedidos == []


def test_sem_ensaio_visivel_da_404(cliente):
    c, _ = cliente
    assert _post(c, token="outro").status_code == 404


def test_velocidade_sem_porosidade_explica(cliente, monkeypatch):
    c, _ = cliente
    sem_v = [{**e, "vel_intersticial_cm_min": None} for e in ENSAIOS]
    monkeypatch.setattr(comparacao, "_ler", lambda *a: sem_v)
    r = _post(c, visao="velocidade")
    assert r.status_code == 422 and "porosidade" in r.json()["detail"]


def test_pedido_vazio_ou_invalido_e_rejeitado(cliente):
    c, _ = cliente
    assert c.post("/comparacao/pvbt", json={"amostras": []}, headers={"Authorization": "Bearer bom"}).status_code == 422
    assert c.post("/comparacao/pvbt", json={"amostras": ["x"]}, headers={"Authorization": "Bearer bom"}).status_code == 422
