import io
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

AQUI = Path(__file__).parent
PEDIDO = json.loads((AQUI / "exemplo_pedido.json").read_text())


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setenv("MODO_DEV", "1")
    from app import app
    return TestClient(app)


def pedido(**config):
    p = json.loads(json.dumps(PEDIDO))
    p["config"].update(config)
    return p


@pytest.mark.parametrize("modo", ["por_vazao", "painel", "combinado", "darcy"])
@pytest.mark.parametrize("formato,inicio", [("png", b"\x89PNG"), ("svg", b"<?xml"), ("pdf", b"%PDF")])
def test_todos_os_modos_e_formatos(cliente, modo, formato, inicio):
    r = cliente.post("/permeabilidade/grafico", json=pedido(modo=modo, formato=formato, etapa=2, dpi=100))
    assert r.status_code == 200, r.text
    assert r.content.startswith(inicio)


def test_cor_escolhida_aparece_no_svg(cliente):
    p = pedido(modo="por_vazao", formato="svg", etapa=1)
    p["etapas"][0]["cor"] = "#C8102E"
    r = cliente.post("/permeabilidade/grafico", json=p)
    assert "#c8102e" in r.text.lower()
    assert "Q = 2 cm³/min" in r.text           # texto editável no SVG


def test_planilha_para_origin(cliente):
    r = cliente.post("/permeabilidade/origin", json=pedido())
    wb = load_workbook(io.BytesIO(r.content))
    ws = wb["Permeabilidade"]
    assert [c.value for c in ws[1]][:2] == ["Tempo", "ΔP"]
    assert [c.value for c in ws[2]][:2] == ["s", "psi"]
    assert ws.max_column == 6                   # 3 vazões x (tempo, ΔP)
    assert wb["Etapas"].max_row == 2 + 3


def test_sem_login_e_recusado(monkeypatch):
    monkeypatch.delenv("MODO_DEV", raising=False)
    from app import app
    r = TestClient(app).post("/permeabilidade/grafico", json=pedido())
    assert r.status_code == 401


def test_nenhuma_etapa_visivel(cliente):
    p = pedido()
    for e in p["etapas"]:
        e["visivel"] = False
    assert cliente.post("/permeabilidade/grafico", json=p).status_code == 422


@pytest.mark.parametrize("sobrepor", [False, True])
def test_grafico_unico_e_o_padrao(cliente, sobrepor):
    p = pedido(formato="svg", sobrepor=sobrepor)
    p["config"].pop("modo", None)
    for i, cor in enumerate(["#000000", "#FF0000", "#0000FF"]):
        p["etapas"][i]["cor"] = cor
    r = cliente.post("/permeabilidade/grafico", json=p)
    assert r.status_code == 200
    svg = r.text.lower()
    assert svg.count("<g id=\"axes_") == 1                     # um gráfico só
    for cor in ("#000000", "#ff0000", "#0000ff"):
        assert cor in svg
    assert all(f"q = {q} cm³/min" in svg for q in (2, 4, 6))


def test_planilha_etapas_no_formato_do_pesquisador(cliente):
    etapas = [{**{k: e[k] for k in ("ordem", "q", "j_inicio", "j_fim", "dp_medio", "k_md", "usada")}, "n_pontos": 75}
              for e in PEDIDO["etapas"]]
    corpo = {"etapas": etapas, "comprimento_cm": 7.32, "diametro_cm": 3.79, "viscosidade_cp": 0.89}
    with open(AQUI / "permeabilidade_ficticio.xlsx", "rb") as f:
        r = cliente.post("/permeabilidade/planilha-etapas", files={"arquivo": ("ensaio.xlsx", f)}, data={"pedido": json.dumps(corpo)})
    assert r.status_code == 200, r.text
    wb = load_workbook(io.BytesIO(r.content))
    ws = wb["Planilha1"]
    assert list(ws.tables.keys()) == ["Tabela2"] and ws.tables["Tabela2"].ref.startswith("B2:")
    cab = [c.value for c in ws[2]][1:]
    assert cab == ["Tempo (s)", "PAH1 (psi)", "PAH2 (psi)", "dPH1 (psi)", "dPH1 (P2H1-P1H1) (psi)", "dPH2 (psi)",
                   "dPH2 (P2H2-P1H2) (psi)", "PC (psi)", "PBH1 (psi)", "PBH2 (psi)", "T. Estufa (oC)", "Q (cm³/min)",
                   "Nome G2", "Volume atual G2 (cm³)", "Volume bomb. parcial G2 (cm³)", "Nome G3", "Volume atual G3 (cm³)",
                   "Volume bomb. parcial G3 (cm³)", "Permeabilidade H1 (mD)", "Seleção do holder para PVBT", "Etapa"]
    rotulos = [ws.cell(row=i, column=len(cab) + 1).value for i in range(3, ws.max_row + 1)]
    assert sorted(set(rotulos)) == ["Permeabilidade 1", "Permeabilidade 2", "Permeabilidade 3"]
    assert ws.max_row - 2 == 225                         # 75 leituras estáveis por vazão
    assert wb["Resumo"]["B2"].value == "Permeabilidade por etapas de vazão"
    # Resumo traz todas as leituras extraídas de cada vazão: Tempo, ΔP e Volume, lado a lado
    rs = wb["Resumo"]
    titulos = [c.value for row in rs.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("Q = ")]
    assert titulos == ["Q = 2 cm³/min (Permeabilidade 1)", "Q = 4 cm³/min (Permeabilidade 2)", "Q = 6 cm³/min (Permeabilidade 3)"]
    lin_cab = next(c.row for row in rs.iter_rows() for c in row if c.value == "Tempo (s)")
    for c0 in (2, 6, 10):
        assert [rs.cell(row=lin_cab, column=c0 + k).value for k in range(3)] == ["Tempo (s)", "ΔP (psi)", "Volume (cm³)"]
        col = [rs.cell(row=i, column=c0).value for i in range(lin_cab + 1, rs.max_row + 1)]
        assert sum(v is not None for v in col) == 75
        vol = [rs.cell(row=i, column=c0 + 2).value for i in range(lin_cab + 1, lin_cab + 76)]
        assert vol == sorted(vol) and vol[-1] > vol[0]   # volume bombeado acumulado cresce


def test_planilha_etapas_com_graficos(cliente):
    etapas = [{k: e[k] for k in ("ordem", "q", "j_inicio", "j_fim", "dp_medio", "k_md", "usada")} for e in PEDIDO["etapas"]]
    corpo = {"etapas": etapas, "comprimento_cm": 7.32, "diametro_cm": 3.79, "viscosidade_cp": 0.89, "grafico": pedido()}
    with open(AQUI / "permeabilidade_ficticio.xlsx", "rb") as f:
        r = cliente.post("/permeabilidade/planilha-etapas", files={"arquivo": ("ensaio.xlsx", f)}, data={"pedido": json.dumps(corpo)})
    assert r.status_code == 200, r.text
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["Planilha1", "Resumo", "Gráficos"]
    ws = wb["Gráficos"]
    assert len(ws._images) == 2                          # gráfico único e ΔP × Q
    assert [ws.cell(row=c.row, column=2).value for c in ws["B"] if c.value in ("ΔP × tempo", "ΔP × Q")] == ["ΔP × tempo", "ΔP × Q"]


def test_planilha_etapas_sem_grafico_nao_tem_aba(cliente):
    etapas = [{k: e[k] for k in ("ordem", "q", "j_inicio", "j_fim", "dp_medio", "k_md", "usada")} for e in PEDIDO["etapas"]]
    with open(AQUI / "permeabilidade_ficticio.xlsx", "rb") as f:
        r = cliente.post("/permeabilidade/planilha-etapas", files={"arquivo": ("ensaio.xlsx", f)}, data={"pedido": json.dumps({"etapas": etapas})})
    assert r.status_code == 200, r.text
    assert "Gráficos" not in load_workbook(io.BytesIO(r.content)).sheetnames


def test_ajuste_igual_ao_origin():
    """O k final do laboratório usa a inclinação da reta com intercepto (FitLinear do Origin). Valores fictícios."""
    from graficos.planilha_etapas import ajuste_darcy
    a, b, r2, *_ = ajuste_darcy([(2, 30.0), (4, 57.0), (6, 84.0)])
    assert abs(a - 13.5) < 1e-9 and abs(b - 3) < 1e-9 and abs(r2 - 1) < 1e-12
    a0, b0, *_ = ajuste_darcy([(2, 30.0), (4, 57.0), (6, 84.0)], "origem")
    assert b0 == 0 and abs(a0 - 14.1428571) < 1e-6
