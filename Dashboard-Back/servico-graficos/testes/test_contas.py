"""Cadastro de usuários do painel gerencial (contas.py), com o Supabase simulado: nada vai para o banco real."""
import pytest
from fastapi.testclient import TestClient

import contas

ADMIN, OUTRO, NOVO = "a" * 8 + "-0000-0000-0000-000000000001", "b" * 8 + "-0000-0000-0000-000000000002", "c" * 8 + "-0000-0000-0000-000000000003"
PROJETO = "20000000-0000-0000-0000-00000000000a"


class Resposta:
    def __init__(self, status, corpo=None, texto=""):
        self.status_code, self._corpo, self.text = status, corpo, texto

    def json(self):
        return self._corpo


@pytest.fixture
def ambiente(monkeypatch):
    """MODO_DEV ligado de propósito: o cadastro de usuários tem que exigir login mesmo assim."""
    monkeypatch.setenv("MODO_DEV", "1")
    chamadas = []
    tokens = {"tok-admin": ADMIN, "tok-outro": OUTRO}
    monkeypatch.setattr(contas, "usuario_do_token", lambda t: tokens.get(t))
    monkeypatch.setattr(contas, "eh_admin", lambda uid: uid == ADMIN)

    def falso(metodo, caminho, **kw):
        chamadas.append((metodo, caminho, kw.get("json"), kw.get("params")))
        if caminho == "/auth/v1/invite":
            if kw["json"]["email"] == "existe@lab.br":
                return Resposta(422, {}, "A user with this email address has already been registered")
            return Resposta(200, {"id": NOVO})
        return Resposta(204)

    monkeypatch.setattr(contas, "_supabase", falso)
    from app import app
    return TestClient(app), chamadas


def _post(cliente, token=None, **corpo):
    base = {"email": "Nova@Lab.br", "nome": "Nova", "nivel": "editor", "projeto_id": PROJETO}
    cab = {"Authorization": f"Bearer {token}"} if token else {}
    return cliente.post("/usuarios/convidar", json={**base, **corpo}, headers=cab)


def test_sem_login_e_recusado_mesmo_em_modo_dev(ambiente):
    cliente, chamadas = ambiente
    assert _post(cliente).status_code == 401
    assert _post(cliente, token="inventado").status_code == 401
    assert chamadas == []


def test_quem_nao_e_admin_e_recusado(ambiente):
    cliente, chamadas = ambiente
    r = _post(cliente, token="tok-outro")
    assert r.status_code == 403
    assert chamadas == []                                # nada foi pedido ao Supabase


def test_admin_convida_editor_de_projeto(ambiente):
    cliente, chamadas = ambiente
    r = _post(cliente, token="tok-admin", redirect_to="http://localhost:5174/redefinir-senha")
    assert r.status_code == 200, r.text
    convite, perfil, vinculo = chamadas
    assert convite[1] == "/auth/v1/invite" and convite[2]["email"] == "nova@lab.br"
    assert convite[3] == {"redirect_to": "http://localhost:5174/redefinir-senha"}
    assert perfil[0] == "PATCH" and perfil[2]["situacao"] == "aprovado" and perfil[2]["administrador"] is False
    assert perfil[2]["decidido_por"] == ADMIN
    assert vinculo[1] == "/rest/v1/membros" and vinculo[2] == [{"usuario_id": NOVO, "papel": "editor", "empresa_id": None, "projeto_id": PROJETO}]


def test_editor_de_varias_empresas(ambiente):
    cliente, chamadas = ambiente
    e1, e2 = "10000000-0000-0000-0000-000000000001", "10000000-0000-0000-0000-000000000002"
    r = _post(cliente, token="tok-admin", projeto_id=None,
              escopos=[{"empresa_id": e1}, {"empresa_id": e2}, {"empresa_id": e1}])
    assert r.status_code == 200, r.text
    vinculos = chamadas[-1][2]
    assert chamadas[-1][1] == "/rest/v1/membros"
    assert [v["empresa_id"] for v in vinculos] == [e1, e2]          # repetido é ignorado
    assert all(v["papel"] == "editor" and v["projeto_id"] is None for v in vinculos)


def test_admin_convida_admin_sem_vinculo(ambiente):
    cliente, chamadas = ambiente
    r = _post(cliente, token="tok-admin", nivel="admin", projeto_id=None)
    assert r.status_code == 200, r.text
    assert [c[1].split("?")[0] for c in chamadas] == ["/auth/v1/invite", "/rest/v1/perfis"]
    assert chamadas[1][2]["administrador"] is True


def test_editor_precisa_de_escopo(ambiente):
    cliente, _ = ambiente
    assert _post(cliente, token="tok-admin", projeto_id=None).status_code == 422


def test_link_do_convite_nao_leva_para_fora(ambiente):
    cliente, chamadas = ambiente
    r = _post(cliente, token="tok-admin", redirect_to="https://site-malicioso.com/entrar")
    assert r.status_code == 422 and chamadas == []


def test_email_ja_cadastrado(ambiente):
    cliente, _ = ambiente
    r = _post(cliente, token="tok-admin", email="existe@lab.br")
    assert r.status_code == 409 and "já existe" in r.json()["detail"]


@pytest.mark.parametrize("origem,vale", [
    ("https://dashboard-aba-gerencial-20ogdct7s-lcpetro1.vercel.app", True),
    ("https://dashboard-aba-gerencial-git-main-lcpetro1.vercel.app", True),
    ("http://localhost:5174", True),
    ("https://dashboard-aba-gerencial-20ogdct7s-outra-conta.vercel.app", False),
    ("https://dashboard-lcpetro1.vercel.app.site-malicioso.com", False),
    ("https://malicioso.vercel.app", False),
])
def test_cors_aceita_so_as_origens_do_lcpetro(ambiente, origem, vale):
    cliente, _ = ambiente
    r = cliente.get("/saude", headers={"Origin": origem})
    assert (r.headers.get("access-control-allow-origin") == origem) is vale
