"""Testes automatizados dos endpoints de Reatividade Estática (t50), gráficos Origin e Excel."""
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

import app as modulo_app


@pytest.fixture
def cliente_logado(monkeypatch):
    monkeypatch.delenv("MODO_DEV", raising=False)
    monkeypatch.setattr(modulo_app, "_token_valido", lambda tok: tok == "tok-valido")
    return TestClient(modulo_app.app)


def _headers(token="tok-valido"):
    return {"Authorization": f"Bearer {token}"} if token else {}


@pytest.mark.parametrize("formato,inicio", [("png", b"\x89PNG"), ("svg", b"<?xml"), ("pdf", b"%PDF")])
def test_grafico_t50_formatos(cliente_logado, formato, inicio):
    r = cliente_logado.post(
        "/reatividade/grafico-t50",
        json={
            "m0_g": 4.20,
            "tempo_min": 4.0,
            "mf_g": 2.40,
            "estilo": {"formato": formato, "dpi": 100, "legend_xy": [0.30, 0.28]},
        },
        headers=_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.content.startswith(inicio)
    if formato == "svg":
        # t50 = (4.2 * 4) / (2 * (4.2 - 2.4)) = 4.6667 min (280 s)
        assert b"4.67" in r.content or b"280" in r.content


def test_grafico_t50_recusa_valores_invalidos(cliente_logado):
    r = cliente_logado.post(
        "/reatividade/grafico-t50",
        json={"m0_g": 4.0, "tempo_min": 4.0, "mf_g": 4.2},
        headers=_headers(),
    )
    assert r.status_code == 422


@pytest.mark.parametrize("formato,inicio", [("png", b"\x89PNG"), ("svg", b"<?xml"), ("pdf", b"%PDF")])
def test_grafico_perda_massa_e_legenda_xy(cliente_logado, formato, inicio):
    corpo_a = {
        "series": [
            {
                "nome": "HCl 15%",
                "cor": "#1f4e78",
                "marcador": "s",
                "x_valores": [70, 140, 210, 280],
                "y_medias_pct": [12.5, 25.1, 38.0, 49.8],
                "y_desvios_pct": [0.6, 0.9, 1.1, 1.4],
            }
        ],
        "estilo": {"formato": formato, "dpi": 100, "legend_xy": [0.30, 0.28], "legend_frame": True},
    }
    r_a = cliente_logado.post("/reatividade/grafico-perda-massa", json=corpo_a, headers=_headers())
    assert r_a.status_code == 200, r_a.text
    assert r_a.content.startswith(inicio)

    if formato == "png":
        corpo_b = {**corpo_a, "estilo": {**corpo_a["estilo"], "legend_xy": [0.05, 0.92]}}
        r_b = cliente_logado.post("/reatividade/grafico-perda-massa", json=corpo_b, headers=_headers())
        assert r_b.status_code == 200
        # Mover a legenda altera efetivamente a imagem renderizada
        assert r_a.content != r_b.content


def test_grafico_absorcao_atomica_dolomita(cliente_logado):
    r = cliente_logado.post(
        "/reatividade/grafico-absorcao-atomica",
        json={
            "ca_medias_mol_l": [0.42, 0.85, 1.24, 1.61],
            "ca_desvios_mol_l": [0.02, 0.03, 0.04, 0.05],
            "mg_medias_mol_l": [0.18, 0.36, 0.52, 0.70],
            "mg_desvios_mol_l": [0.01, 0.02, 0.02, 0.03],
            "h_medias_mol_l": [3.20, 1.98, 0.88, 0.12],
            "h_desvios_mol_l": [0.05, 0.07, 0.08, 0.06],
            "estilo": {"formato": "svg", "dpi": 100, "legend_xy": [0.30, 0.28]},
        },
        headers=_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"<?xml")


def test_exportar_excel_duas_abas_com_formulas(cliente_logado):
    r = cliente_logado.post(
        "/reatividade/exportar-excel",
        json={
            "codigo": "REA-0001",
            "amostra_codigo": "IL-TESTE",
            "sistema_acido": "HCl 15%",
            "litologia": "calcario",
            "h_inicial_mol_l": 4.4,
            "sondagens": [
                {"ordem": 1, "codigo_mini_plug": "MP-1", "massa_inicial_g": 4.2, "tempo_contato_min": 4, "massa_final_g": 2.4, "escolhido": True}
            ],
            "pontos": [
                {"estagio_ordem": 1, "fracao_t50": 0.25, "tempo_contato_s": 70, "replica": 1, "massa_inicial_g": 4.1, "massa_final_g": 3.6, "fator_diluicao_ca": 2250, "abs_ca": 0.21},
                {"estagio_ordem": 1, "fracao_t50": 0.25, "tempo_contato_s": 70, "replica": 2, "massa_inicial_g": 4.0, "massa_final_g": 3.5, "fator_diluicao_ca": 2250, "abs_ca": 0.22},
            ],
        },
        headers=_headers(),
    )
    assert r.status_code == 200, r.text
    wb = load_workbook(BytesIO(r.content), data_only=False)
    assert wb.sheetnames == ["1_Entrada_Pesquisador", "2_Calculos_Backend_Resumo"]
    ws2 = wb["2_Calculos_Backend_Resumo"]
    assert str(ws2["G5"].value).startswith("=IF(")
    assert str(ws2["G17"].value).startswith("=IF(")
    assert str(ws2["B38"].value).startswith("=IFERROR(SLOPE(")


@pytest.mark.parametrize(
    "rota,corpo",
    [
        ("/reatividade/grafico-t50", {"m0_g": 4.2, "tempo_min": 4.0, "mf_g": 2.4}),
        ("/reatividade/grafico-perda-massa", {"series": [{"nome": "A", "x_valores": [10, 20], "y_medias_pct": [5, 10], "y_desvios_pct": [0.1, 0.2]}]}),
        ("/reatividade/grafico-absorcao-atomica", {"ca_medias_mol_l": [0.5, 1.0], "ca_desvios_mol_l": [0.01, 0.02], "h_medias_mol_l": [3.4, 2.4], "h_desvios_mol_l": [0.02, 0.03]}),
        ("/reatividade/exportar-excel", {}),
    ],
)
def test_recusa_sem_login(cliente_logado, rota, corpo):
    assert cliente_logado.post(rota, json=corpo).status_code == 401
    assert cliente_logado.post(rota, json=corpo, headers=_headers("tok-invalido")).status_code == 401
