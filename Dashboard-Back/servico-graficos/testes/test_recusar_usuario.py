"""Recusar um pedido apaga a conta, mas nunca uma conta aprovada ou de administrador."""
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import contas

ADMIN = str(uuid4())


class Resp:
    def __init__(self, status_code=200, dados=None):
        self.status_code, self._dados, self.text = status_code, dados, ""

    def json(self):
        return self._dados


@pytest.fixture()
def cenario(monkeypatch):
    app = FastAPI()
    app.include_router(contas.criar_rotas([], r"^$"))
    estado = {"perfil": [], "apagados": [], "status_delete": 200}

    def falso(metodo, caminho, **_):
        if metodo == "GET":
            return Resp(200, estado["perfil"])
        estado["apagados"].append(caminho)
        return Resp(estado["status_delete"], {})

    monkeypatch.setattr(contas, "_supabase", falso)
    monkeypatch.setattr(contas, "exigir_admin", lambda _: ADMIN)
    return TestClient(app), estado


def pedir(cliente, alvo):
    return cliente.post("/usuarios/recusar", json={"usuario_id": alvo}, headers={"Authorization": "Bearer t"})


@pytest.mark.parametrize("situacao", ["pendente", "recusado"])
def test_apaga_pedido(cenario, situacao):
    cliente, estado = cenario
    alvo = str(uuid4())
    estado["perfil"] = [{"email": "a@b.co", "situacao": situacao, "administrador": False}]
    assert pedir(cliente, alvo).status_code == 200
    assert estado["apagados"] == [f"/auth/v1/admin/users/{alvo}"]


@pytest.mark.parametrize("perfil", [
    {"email": "a@b.co", "situacao": "aprovado", "administrador": False},
    {"email": "a@b.co", "situacao": "pendente", "administrador": True},
])
def test_nao_apaga_conta_aprovada_nem_admin(cenario, perfil):
    cliente, estado = cenario
    estado["perfil"] = [perfil]
    assert pedir(cliente, str(uuid4())).status_code == 409
    assert estado["apagados"] == []


def test_nao_apaga_a_propria_conta(cenario):
    cliente, estado = cenario
    assert pedir(cliente, ADMIN).status_code == 422
    assert estado["apagados"] == []


def test_conta_com_dados_ligados_avisa(cenario):
    cliente, estado = cenario
    estado["perfil"] = [{"email": "a@b.co", "situacao": "pendente", "administrador": False}]
    estado["status_delete"] = 500
    assert pedir(cliente, str(uuid4())).status_code == 409
