"""Gráficos padrão Origin e exportação Excel para Reatividade Estática (t50) e RDA.

Endpoints:
  POST /reatividade/grafico-t50
  POST /reatividade/grafico-perda-massa
  POST /reatividade/grafico-absorcao-atomica
  POST /reatividade/grafico-rda-h-tempo
  POST /reatividade/grafico-rda-levich
  POST /reatividade/exportar-excel
"""
from __future__ import annotations

from io import BytesIO
from typing import List, Literal, Optional, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import AutoMinorLocator, FuncFormatter
import numpy as np
from fastapi import APIRouter, HTTPException, Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/reatividade", tags=["Reatividade e t50"])


class EstiloGraficoOrigin(BaseModel):
    titulo: Optional[str] = None
    eixo_x: Optional[str] = None
    eixo_y: Optional[str] = None
    eixo_y2: Optional[str] = None
    fonte: Literal["Arial", "Times New Roman", "Calibri", "DejaVu Sans"] = "DejaVu Sans"
    tamanho_fonte: int = Field(default=10, ge=6, le=24)
    largura_cm: float = Field(default=16.5, ge=6.0, le=40.0)
    altura_cm: float = Field(default=12.0, ge=5.0, le=30.0)
    dpi: int = Field(default=300, ge=72, le=600)
    formato: Literal["png", "svg", "pdf"] = "png"
    mostrar_barras_erro: bool = True
    mostrar_reta_ajuste: bool = True
    # Coordenada normalizada [0..1] salva pelo drag-and-drop no frontend
    legend_xy: Optional[Tuple[float, float]] = Field(default=(0.04, 0.94))
    legend_loc: str = "upper left"
    legend_frame: bool = True
    legend_fontsize: float = Field(default=9.0, ge=6.0, le=20.0)
    legend_ncol: int = Field(default=1, ge=1, le=4)
    # perda de massa: eixos começando em 0
    eixos_do_zero: bool = False


class PedidoGraficoT50(BaseModel):
    m0_g: float
    tempo_min: float
    mf_g: float
    estilo: EstiloGraficoOrigin = Field(default_factory=EstiloGraficoOrigin)


class SeriePerdaMassa(BaseModel):
    nome: str
    cor: str = "#1f4e78"
    marcador: str = "s"
    estilo_linha: str = "-"
    x_valores: List[float]
    y_medias_pct: List[float]
    y_desvios_pct: List[float]
    incluir_zero_na_reta: bool = False


class PedidoGraficoPerdaMassa(BaseModel):
    series: List[SeriePerdaMassa]
    estilo: EstiloGraficoOrigin = Field(default_factory=EstiloGraficoOrigin)


class PedidoGraficoAA(BaseModel):
    rotulos_x: List[str] = Field(
        default_factory=lambda: ["T1 (0,25·t50)", "T2 (0,50·t50)", "T3 (0,75·t50)", "T4 (1,00·t50)"]
    )
    ca_medias_mol_l: List[float]
    ca_desvios_mol_l: List[float]
    mg_medias_mol_l: Optional[List[float]] = None
    mg_desvios_mol_l: Optional[List[float]] = None
    h_medias_mol_l: List[float]
    h_desvios_mol_l: List[float]
    estilo: EstiloGraficoOrigin = Field(default_factory=EstiloGraficoOrigin)


class SondagemExcel(BaseModel):
    ordem: int = 1
    codigo_mini_plug: Optional[str] = None
    massa_inicial_g: float
    tempo_contato_min: float
    massa_final_g: float
    escolhido: bool = False


class PontoExcel(BaseModel):
    estagio_ordem: int = Field(ge=1, le=4)
    fracao_t50: float = 0.25
    tempo_contato_s: float = 0.0
    replica: int = Field(default=1, ge=1, le=3)
    codigo_mini_plug: Optional[str] = None
    massa_inicial_g: float
    massa_final_g: float
    fator_diluicao_ca: Optional[float] = 2250.0
    abs_ca: Optional[float] = None
    fator_diluicao_mg: Optional[float] = 1.0
    abs_mg: Optional[float] = None


class PedidoExportarExcel(BaseModel):
    codigo: Optional[str] = None
    amostra_codigo: Optional[str] = None
    sistema_acido: Optional[str] = None
    geometria: str = "mini_plug"
    modalidade: str = "estatica"
    litologia: str = "calcario"
    data_ensaio: Optional[str] = None
    operador: Optional[str] = None
    ph_inicial: Optional[float] = None
    h_inicial_mol_l: float = 4.4
    volume_solucao_ml: Optional[float] = 100.0
    temperatura_c: float = 25.0
    cal_ca_slope: float = 0.0383
    cal_ca_intercept: float = 0.0037
    cal_mg_slope: Optional[float] = None
    cal_mg_intercept: Optional[float] = None
    massa_molar_ca: float = 40.078
    massa_molar_mg: float = 24.305
    sondagens: List[SondagemExcel] = Field(default_factory=list)
    pontos: List[PontoExcel] = Field(default_factory=list)


def _r2_seguro(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 2 or np.std(x) == 0 or np.std(y) == 0:
        return 0.0
    c = float(np.corrcoef(x, y)[0, 1])
    return 0.0 if np.isnan(c) else c * c


def _criar_figura_origin(estilo: EstiloGraficoOrigin):
    plt.rcParams.update({
        "font.sans-serif": [estilo.fonte, "DejaVu Sans"],
        "font.size": estilo.tamanho_fonte,
        "axes.linewidth": 1.2,
        "xtick.direction": "in",
        "ytick.direction": "in",
        "xtick.top": True,
        "ytick.right": True,
        "xtick.major.size": 5,
        "ytick.major.size": 5,
        "xtick.minor.visible": True,
        "ytick.minor.visible": True,
        "xtick.minor.size": 3,
        "ytick.minor.size": 3,
    })
    fig, ax = plt.subplots(
        figsize=(estilo.largura_cm / 2.54, estilo.altura_cm / 2.54),
        dpi=estilo.dpi,
    )
    return fig, ax


def _aplicar_legenda(ax, estilo: EstiloGraficoOrigin, handles=None, labels=None):
    kwargs = dict(
        frameon=estilo.legend_frame,
        fontsize=estilo.legend_fontsize,
        ncol=estilo.legend_ncol,
        fancybox=False,
        framealpha=0.96,
        edgecolor="black",
        facecolor="white",
    )
    if estilo.legend_xy is not None:
        kwargs["loc"] = "upper left"
        kwargs["bbox_to_anchor"] = (float(estilo.legend_xy[0]), float(estilo.legend_xy[1]))
    else:
        kwargs["loc"] = estilo.legend_loc

    leg = ax.legend(handles, labels, **kwargs) if (handles and labels) else ax.legend(**kwargs)
    if leg and estilo.legend_frame:
        leg.get_frame().set_linewidth(0.9)
    return leg


def _exportar_figura(fig, estilo: EstiloGraficoOrigin, nome_base: str) -> Response:
    buf = BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format=estilo.formato, dpi=estilo.dpi)
    plt.close(fig)
    media_types = {
        "png": "image/png",
        "svg": "image/svg+xml",
        "pdf": "application/pdf",
    }
    return Response(
        content=buf.getvalue(),
        media_type=media_types[estilo.formato],
        headers={"Content-Disposition": f'inline; filename="{nome_base}.{estilo.formato}"'},
    )


@router.post("/grafico-t50")
def gerar_grafico_t50(pedido: PedidoGraficoT50):
    m0, mf, t = pedido.m0_g, pedido.mf_g, pedido.tempo_min
    if m0 <= 0 or t <= 0 or mf >= m0:
        raise HTTPException(422, "Valores inválidos para cálculo de t50 (exige m0 > 0, tempo > 0 e mf < m0).")

    fig, ax = _criar_figura_origin(pedido.estilo)
    m50 = m0 / 2.0
    slope = (mf - m0) / t
    t50 = (m50 - m0) / slope

    t_max = max(t, t50) * 1.15
    t_line = np.linspace(0, t_max, 100)
    ax.plot(t_line, m0 + slope * t_line, "r--", lw=1.5, label=f"Ajuste: m = {slope:.4g}·t + {m0:.4f}")
    ax.plot([0.0, t], [m0, mf], "ko", ms=7, label="Pontos do teste piloto ($m_0$ e $m_f$)")
    ax.axhline(m50, color="#004c99", ls=":", lw=1.2)
    ax.axvline(t50, color="#004c99", ls=":", lw=1.2)
    ax.plot([t50], [m50], "bs", ms=7, label=f"$t_{{50}}$ = {t50:.2f} min ({t50 * 60:.0f} s)")

    for k in [1, 2, 3, 4]:
        tk = t50 * k / 4.0
        ax.axvline(tk, color="gray", alpha=0.3, ls="--")
        ax.text(tk, m0 * 1.03, f"T{k} ({k * 25}%)\n{tk * 60:.0f} s", ha="center", va="bottom", fontsize=8)

    ax.set_xlim(-t_max * 0.04, t_max)
    ax.set_ylim(min(mf, m50) * 0.65, m0 * 1.15)
    ax.set_xlabel(pedido.estilo.eixo_x or "Tempo de contato (min)")
    ax.set_ylabel(pedido.estilo.eixo_y or "Massa do mini-plug (g)")
    ax.set_title(pedido.estilo.titulo or "Determinação do $t_{50}$ e Estágios de Reação", fontweight="bold", pad=10)
    _aplicar_legenda(ax, pedido.estilo)
    return _exportar_figura(fig, pedido.estilo, "reatividade_t50")


@router.post("/grafico-perda-massa")
def gerar_grafico_perda_massa(pedido: PedidoGraficoPerdaMassa):
    if not pedido.series:
        raise HTTPException(422, "Envie ao menos uma série de perda de massa.")

    fig, ax = _criar_figura_origin(pedido.estilo)
    for s in pedido.series:
        if len(s.x_valores) == 0 or len(s.x_valores) != len(s.y_medias_pct):
            raise HTTPException(422, f"Série '{s.nome}' sem pontos válidos.")
        x = np.array(s.x_valores, dtype=float)
        y = np.array(s.y_medias_pct, dtype=float)
        err = np.array(
            s.y_desvios_pct if len(s.y_desvios_pct) == len(x) else [0.0] * len(x),
            dtype=float,
        )

        mask = np.ones_like(x, dtype=bool) if s.incluir_zero_na_reta else (x > 0)
        x_fit, y_fit = x[mask], y[mask]

        rotulo = s.nome
        if pedido.estilo.mostrar_reta_ajuste and len(x_fit) >= 2 and np.std(x_fit) > 0:
            m, n = np.polyfit(x_fit, y_fit, 1)
            r2 = _r2_seguro(x_fit, y_fit)
            ax.plot(x_fit, m * x_fit + n, s.estilo_linha, color=s.cor, lw=1.5)
            rotulo = f"{s.nome} (y = {m:.4g}x {'+' if n >= 0 else '−'} {abs(n):.4g}, $R^2$ = {r2:.4f})"

        if pedido.estilo.mostrar_barras_erro:
            ax.errorbar(x, y, yerr=err, fmt=s.marcador, color=s.cor, capsize=3, ms=6, label=rotulo,
                        clip_on=not pedido.estilo.eixos_do_zero, zorder=3)
        else:
            ax.plot(x, y, s.marcador, color=s.cor, ms=6, label=rotulo,
                    clip_on=not pedido.estilo.eixos_do_zero, zorder=3)

    ax.set_xlabel(pedido.estilo.eixo_x or "Tempo de contato (s)")
    ax.set_ylabel(pedido.estilo.eixo_y or "Perda de massa (%)")
    ax.set_title(pedido.estilo.titulo or "Cinética de Dissolução Estática", fontweight="bold", pad=10)
    if pedido.estilo.eixos_do_zero:
        ax.set_xlim(left=0)
        ax.set_ylim(bottom=0)
    _aplicar_legenda(ax, pedido.estilo)
    return _exportar_figura(fig, pedido.estilo, "reatividade_perda_massa")


@router.post("/grafico-absorcao-atomica")
def gerar_grafico_aa(pedido: PedidoGraficoAA):
    if not pedido.ca_medias_mol_l or len(pedido.ca_medias_mol_l) != len(pedido.h_medias_mol_l):
        raise HTTPException(422, "Dados de Ca²⁺ e H⁺ inválidos ou com tamanhos diferentes.")

    fig, ax = _criar_figura_origin(pedido.estilo)
    ax2 = ax.twinx()
    n_pts = len(pedido.ca_medias_mol_l)
    rotulos = pedido.rotulos_x[:n_pts] if len(pedido.rotulos_x) >= n_pts else [f"T{i + 1}" for i in range(n_pts)]
    x = np.arange(1, n_pts + 1, dtype=float)

    ca = np.array(pedido.ca_medias_mol_l, dtype=float)
    ca_sd = np.array(
        pedido.ca_desvios_mol_l if len(pedido.ca_desvios_mol_l) == n_pts else [0.0] * n_pts,
        dtype=float,
    )
    h = np.array(pedido.h_medias_mol_l, dtype=float)
    h_sd = np.array(
        pedido.h_desvios_mol_l if len(pedido.h_desvios_mol_l) == n_pts else [0.0] * n_pts,
        dtype=float,
    )

    label_ca = "$[\\mathrm{Ca^{2+}}]$ (mol/L)"
    if pedido.estilo.mostrar_reta_ajuste and n_pts >= 2:
        m_ca, n_ca = np.polyfit(x, ca, 1)
        r2_ca = _r2_seguro(x, ca)
        ax.plot(x, m_ca * x + n_ca, "-", color="#005a32", lw=1.4)
        label_ca = f"$[\\mathrm{{Ca^{{2+}}}}]$ ($R^2$={r2_ca:.4f})"

    p1 = ax.errorbar(
        x,
        ca,
        yerr=ca_sd if pedido.estilo.mostrar_barras_erro else None,
        fmt="o",
        color="#005a32",
        capsize=3,
        ms=6,
        label=label_ca,
    )
    handles = [p1]

    if pedido.mg_medias_mol_l and len(pedido.mg_medias_mol_l) == n_pts:
        mg = np.array(pedido.mg_medias_mol_l, dtype=float)
        mg_sd = np.array(
            pedido.mg_desvios_mol_l if (pedido.mg_desvios_mol_l and len(pedido.mg_desvios_mol_l) == n_pts) else [0.0] * n_pts,
            dtype=float,
        )
        label_mg = "$[\\mathrm{Mg^{2+}}]$ (mol/L)"
        if pedido.estilo.mostrar_reta_ajuste and n_pts >= 2:
            m_mg, n_mg = np.polyfit(x, mg, 1)
            r2_mg = _r2_seguro(x, mg)
            ax.plot(x, m_mg * x + n_mg, "-.", color="#2b5c8f", lw=1.3)
            label_mg = f"$[\\mathrm{{Mg^{{2+}}}}]$ ($R^2$={r2_mg:.4f})"

        p_mg = ax.errorbar(
            x,
            mg,
            yerr=mg_sd if pedido.estilo.mostrar_barras_erro else None,
            fmt="^",
            color="#2b5c8f",
            capsize=3,
            ms=6,
            label=label_mg,
        )
        handles.append(p_mg)

    p_h = ax2.errorbar(
        x,
        h,
        yerr=h_sd if pedido.estilo.mostrar_barras_erro else None,
        fmt="s--",
        color="#8c2d04",
        capsize=3,
        ms=6,
        label="$[\\mathrm{H^+}]$ residual (mol/L)",
    )
    handles.append(p_h)

    ax.set_xticks(x)
    ax.set_xticklabels(rotulos)
    ax.set_xlabel(pedido.estilo.eixo_x or "Estágio de reação")
    ax.set_ylabel(pedido.estilo.eixo_y or "Concentração de Cátions (mol/L)", color="#005a32")
    ax2.set_ylabel(pedido.estilo.eixo_y2 or "$[\\mathrm{H^+}]$ residual (mol/L)", color="#8c2d04")
    ax.set_title(pedido.estilo.titulo or "Absorção Atômica e Consumo de $\\mathrm{H^+}$", fontweight="bold", pad=10)

    _aplicar_legenda(ax, pedido.estilo, handles=handles, labels=[h_i.get_label() for h_i in handles])
    return _exportar_figura(fig, pedido.estilo, "reatividade_absorcao_atomica")


def _gerar_excel_reatividade(pedido: PedidoExportarExcel) -> bytes:
    """Gera pasta de trabalho padronizada em 2 abas com fórmulas reais no Excel."""
    wb = Workbook()

    cor_titulo = PatternFill("solid", fgColor="1F4E78")
    cor_sub = PatternFill("solid", fgColor="D9E1F2")
    cor_entrada = PatternFill("solid", fgColor="FFF2CC")
    cor_calc = PatternFill("solid", fgColor="E2EFDA")
    fonte_titulo = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
    fonte_header = Font(name="Calibri", size=10, bold=True, color="1F4E78")
    fonte_bold = Font(name="Calibri", size=10, bold=True)
    borda_fina = Border(
        left=Side(style="thin", color="BFBFBF"),
        right=Side(style="thin", color="BFBFBF"),
        top=Side(style="thin", color="BFBFBF"),
        bottom=Side(style="thin", color="BFBFBF"),
    )

    # =========================================================================
    # ABA 1: 1_Entrada_Pesquisador (compatível 100% com planilhaReatividade.ts)
    # =========================================================================
    ws1 = wb.active
    ws1.title = "1_Entrada_Pesquisador"
    ws1.views.sheetView[0].showGridLines = True

    ws1.merge_cells("A1:K1")
    ws1["A1"] = "LC PETRO · PLANILHA PADRONIZADA DE REATIVIDADE ESTÁTICA (t50) & ABSORÇÃO ATÔMICA"
    ws1["A1"].fill = cor_titulo
    ws1["A1"].font = fonte_titulo
    ws1["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws1.row_dimensions[1].height = 24

    # Bloco A: Metadados do Ensaio (colunas A..C, linhas 3..14)
    ws1["A3"] = "A · Condições do Ensaio"
    ws1["A3"].font = fonte_header
    ws1["A3"].fill = cor_sub
    ws1.merge_cells("A3:C3")

    meta_rows = [
        ("Código do Ensaio", pedido.codigo or "REA-XXXX"),
        ("Amostra", pedido.amostra_codigo or ""),
        ("Sistema Ácido", pedido.sistema_acido or ""),
        ("Geometria", pedido.geometria),
        ("Modalidade", pedido.modalidade),
        ("Litologia", pedido.litologia),
        ("pH inicial", pedido.ph_inicial),
        ("[H+] inicial (mol/L)", pedido.h_inicial_mol_l),
        ("Volume solução (mL)", pedido.volume_solucao_ml),
        ("Temperatura (°C)", pedido.temperatura_c),
        ("Calibração Ca (slope)", pedido.cal_ca_slope),
        ("Calibração Ca (intercept)", pedido.cal_ca_intercept),
    ]
    for idx, (rot, val) in enumerate(meta_rows, start=4):
        ws1[f"A{idx}"] = rot
        ws1[f"A{idx}"].font = fonte_bold
        ws1[f"A{idx}"].border = borda_fina
        ws1[f"B{idx}"] = val
        ws1[f"B{idx}"].fill = cor_entrada
        ws1[f"B{idx}"].border = borda_fina

    # Bloco B: Sondagem Piloto t50 (linhas 5..14, colunas E..J — índices 4..9 no SheetJS)
    ws1["E3"] = "B · Sondagem Piloto de t50 (Mini-Plugs)"
    ws1["E3"].font = fonte_header
    ws1["E3"].fill = cor_sub
    ws1.merge_cells("E3:J3")

    cab_sond = ["Teste", "Código Mini-Plug", "m0 (g)", "Tempo (min)", "mf (g)", "Escolhido (SIM/NÃO)"]
    for col_i, h in enumerate(cab_sond, start=5):
        cell = ws1.cell(row=5, column=col_i, value=h)
        cell.font = fonte_header
        cell.fill = cor_sub
        cell.border = borda_fina
        cell.alignment = Alignment(horizontal="center")

    sondagens_lista = pedido.sondagens or [
        SondagemExcel(ordem=1, codigo_mini_plug="MP-1", massa_inicial_g=0.0, tempo_contato_min=2, massa_final_g=0.0, escolhido=False),
        SondagemExcel(ordem=2, codigo_mini_plug="MP-2", massa_inicial_g=0.0, tempo_contato_min=4, massa_final_g=0.0, escolhido=False),
        SondagemExcel(ordem=3, codigo_mini_plug="MP-3", massa_inicial_g=0.0, tempo_contato_min=6, massa_final_g=0.0, escolhido=False),
    ]
    for idx, s in enumerate(sondagens_lista[:9], start=6):
        vals = [
            f"Teste {s.ordem}",
            s.codigo_mini_plug or "",
            s.massa_inicial_g if s.massa_inicial_g > 0 else None,
            s.tempo_contato_min,
            s.massa_final_g if s.massa_final_g > 0 else None,
            "SIM" if s.escolhido else "NÃO",
        ]
        for col_i, v in enumerate(vals, start=5):
            c = ws1.cell(row=idx, column=col_i, value=v)
            c.border = borda_fina
            if col_i >= 6:
                c.fill = cor_entrada

    # Bloco C: 4 Estágios × 3 Réplicas (linha 17 cabeçalho, linhas 18..29 dados, colunas B..K — índices 1..10)
    ws1["B16"] = "C · Dissolução de 4 Estágios (Triplicata) e Leituras de Absorção Atômica"
    ws1["B16"].font = fonte_header
    ws1["B16"].fill = cor_sub
    ws1.merge_cells("B16:K16")

    cab_pts = [
        "Estágio", "Fração t50", "Réplica", "Código Mini-Plug",
        "m0 (g)", "mf (g)", "FD Ca", "ABS Ca", "FD Mg", "ABS Mg",
    ]
    for col_i, h in enumerate(cab_pts, start=2):
        c = ws1.cell(row=17, column=col_i, value=h)
        c.font = fonte_header
        c.fill = cor_sub
        c.border = borda_fina
        c.alignment = Alignment(horizontal="center")

    nomes_rep = {1: "Original", 2: "Duplicata", 3: "Triplicata"}
    pontos_mapa = {(p.estagio_ordem, p.replica): p for p in pedido.pontos}
    row_cursor = 18
    for est in (1, 2, 3, 4):
        frac = est * 0.25
        for rep in (1, 2, 3):
            p = pontos_mapa.get((est, rep))
            vals = [
                f"T{est}",
                p.fracao_t50 if p else frac,
                nomes_rep[rep],
                (p.codigo_mini_plug or "") if p else "",
                p.massa_inicial_g if p else None,
                p.massa_final_g if p else None,
                p.fator_diluicao_ca if p and p.fator_diluicao_ca is not None else 2250,
                p.abs_ca if p else None,
                p.fator_diluicao_mg if p and p.fator_diluicao_mg is not None else 1,
                p.abs_mg if p else None,
            ]
            for col_i, v in enumerate(vals, start=2):
                c = ws1.cell(row=row_cursor, column=col_i, value=v)
                c.border = borda_fina
                if col_i >= 5:
                    c.fill = cor_entrada
            row_cursor += 1

    # =========================================================================
    # ABA 2: 2_Calculos_Backend_Resumo (fórmulas Excel reais ligadas à Aba 1)
    # =========================================================================
    ws2 = wb.create_sheet(title="2_Calculos_Backend_Resumo")
    ws2.merge_cells("A1:K1")
    ws2["A1"] = "CÁLCULOS AUTOMÁTICOS · t50, PERDA DE MASSA, REGRESSÃO LINEAR E ABSORÇÃO ATÔMICA"
    ws2["A1"].fill = cor_titulo
    ws2["A1"].font = fonte_titulo
    ws2["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws2.row_dimensions[1].height = 24

    # 1. Sondagem t50
    ws2["A3"] = "1 · Sondagem Piloto (t50)"
    ws2["A3"].font = fonte_header
    ws2["A3"].fill = cor_sub
    ws2.merge_cells("A3:G3")

    for col_i, h in enumerate(["Teste", "m0 (g)", "Tempo (min)", "mf (g)", "m50 (g)", "Taxa (g/min)", "t50 estimado (min)"], start=1):
        c = ws2.cell(row=4, column=col_i, value=h)
        c.font = fonte_header
        c.fill = cor_sub
        c.border = borda_fina

    for idx in range(len(sondagens_lista[:9])):
        r1 = 6 + idx
        r2 = 5 + idx
        ws2[f"A{r2}"] = f"='1_Entrada_Pesquisador'!E{r1}"
        ws2[f"B{r2}"] = f"='1_Entrada_Pesquisador'!G{r1}"
        ws2[f"C{r2}"] = f"='1_Entrada_Pesquisador'!H{r1}"
        ws2[f"D{r2}"] = f"='1_Entrada_Pesquisador'!I{r1}"
        ws2[f"E{r2}"] = f'=IF(B{r2}>0, B{r2}/2, "")'
        ws2[f"F{r2}"] = f'=IF(C{r2}>0, (D{r2}-B{r2})/C{r2}, "")'
        ws2[f"G{r2}"] = f'=IF(AND(B{r2}>0, D{r2}<B{r2}, C{r2}>0), (B{r2}*C{r2})/(2*(B{r2}-D{r2})), "")'
        for col_i in range(1, 8):
            c = ws2.cell(row=r2, column=col_i)
            c.border = borda_fina
            if col_i >= 5:
                c.fill = cor_calc

    # 2. Pontos individuais (linhas 16..27)
    ws2["A15"] = "2 · Perda de Massa Individual e Concentrações de Absorção Atômica"
    ws2["A15"].font = fonte_header
    ws2["A15"].fill = cor_sub
    ws2.merge_cells("A15:K15")

    cab_c2 = [
        "Estágio", "Fração", "Réplica", "m0 (g)", "mf (g)", "Δm (g)",
        "Perda (%)", "[Ca²⁺] (mol/L)", "[Mg²⁺] (mol/L)", "[H⁺] residual (mol/L)", "Tempo (s)",
    ]
    for col_i, h in enumerate(cab_c2, start=1):
        c = ws2.cell(row=16, column=col_i, value=h)
        c.font = fonte_header
        c.fill = cor_sub
        c.border = borda_fina

    for idx in range(12):
        r1 = 18 + idx
        r2 = 17 + idx
        est = idx // 3 + 1
        rep = idx % 3 + 1
        p = pontos_mapa.get((est, rep))
        ws2[f"A{r2}"] = f"='1_Entrada_Pesquisador'!B{r1}"
        ws2[f"B{r2}"] = f"='1_Entrada_Pesquisador'!C{r1}"
        ws2[f"C{r2}"] = f"='1_Entrada_Pesquisador'!D{r1}"
        ws2[f"D{r2}"] = f"='1_Entrada_Pesquisador'!F{r1}"
        ws2[f"E{r2}"] = f"='1_Entrada_Pesquisador'!G{r1}"
        ws2[f"F{r2}"] = f'=IF(AND(ISNUMBER(D{r2}),ISNUMBER(E{r2})), D{r2}-E{r2}, "")'
        ws2[f"G{r2}"] = f'=IF(AND(ISNUMBER(D{r2}),D{r2}>0,ISNUMBER(E{r2})), ((D{r2}-E{r2})/D{r2})*100, "")'
        ws2[f"H{r2}"] = (
            f"=IF(ISNUMBER('1_Entrada_Pesquisador'!I{r1}), "
            f"(('1_Entrada_Pesquisador'!I{r1}-'1_Entrada_Pesquisador'!$B$15)/'1_Entrada_Pesquisador'!$B$14)"
            f"*'1_Entrada_Pesquisador'!H{r1}/({pedido.massa_molar_ca}*1000), \"\")"
        )
        if pedido.cal_mg_slope and pedido.cal_mg_slope != 0:
            mg_int = pedido.cal_mg_intercept or 0.0
            ws2[f"I{r2}"] = (
                f"=IF(ISNUMBER('1_Entrada_Pesquisador'!K{r1}), "
                f"(('1_Entrada_Pesquisador'!K{r1}-{mg_int})/{pedido.cal_mg_slope})"
                f"*'1_Entrada_Pesquisador'!J{r1}/({pedido.massa_molar_mg}*1000), 0)"
            )
        else:
            ws2[f"I{r2}"] = 0
        ws2[f"J{r2}"] = f"=IF(ISNUMBER(H{r2}), '1_Entrada_Pesquisador'!$B$11 - 2*(H{r2}+N(I{r2})), \"\")"
        ws2[f"K{r2}"] = p.tempo_contato_s if p else est * 45
        for col_i in range(1, 12):
            c = ws2.cell(row=r2, column=col_i)
            c.border = borda_fina
            if col_i >= 6:
                c.fill = cor_calc

    # 3. Resumo por Estágio (linhas 31..35) + Regressão Linear (linhas 37..39)
    ws2["A30"] = "3 · Resumo por Estágio (Média ± Desvio Padrão Amostral ddof=1)"
    ws2["A30"].font = fonte_header
    ws2["A30"].fill = cor_sub
    ws2.merge_cells("A30:K30")

    cab_res = [
        "Estágio", "Tempo (s)", "Perda Média (%)", "DP Perda (%)", "Perda Razão Médias (%)",
        "[Ca²⁺] Média", "DP [Ca²⁺]", "[Mg²⁺] Média", "DP [Mg²⁺]", "[H⁺] Média", "DP [H⁺]",
    ]
    for col_i, h in enumerate(cab_res, start=1):
        c = ws2.cell(row=31, column=col_i, value=h)
        c.font = fonte_header
        c.fill = cor_sub
        c.border = borda_fina

    for est_idx in range(4):
        r_ini = 17 + est_idx * 3
        r_fim = r_ini + 2
        r_out = 32 + est_idx
        ws2[f"A{r_out}"] = f"T{est_idx + 1}"
        ws2[f"B{r_out}"] = f"=AVERAGE(K{r_ini}:K{r_fim})"
        ws2[f"C{r_out}"] = f'=IFERROR(AVERAGE(G{r_ini}:G{r_fim}), "")'
        ws2[f"D{r_out}"] = f'=IFERROR(STDEV.S(G{r_ini}:G{r_fim}), 0)'
        ws2[f"E{r_out}"] = f'=IFERROR((AVERAGE(F{r_ini}:F{r_fim})/AVERAGE(D{r_ini}:D{r_fim}))*100, "")'
        ws2[f"F{r_out}"] = f'=IFERROR(AVERAGE(H{r_ini}:H{r_fim}), "")'
        ws2[f"G{r_out}"] = f'=IFERROR(STDEV.S(H{r_ini}:H{r_fim}), 0)'
        ws2[f"H{r_out}"] = f'=IFERROR(AVERAGE(I{r_ini}:I{r_fim}), 0)'
        ws2[f"I{r_out}"] = f'=IFERROR(STDEV.S(I{r_ini}:I{r_fim}), 0)'
        ws2[f"J{r_out}"] = f'=IFERROR(AVERAGE(J{r_ini}:J{r_fim}), "")'
        ws2[f"K{r_out}"] = f'=IFERROR(STDEV.S(J{r_ini}:J{r_fim}), 0)'
        for col_i in range(1, 12):
            c = ws2.cell(row=r_out, column=col_i)
            c.border = borda_fina
            if col_i >= 3:
                c.fill = cor_calc

    ws2["A37"] = "Regressão Linear (Perda % vs Tempo s)"
    ws2["A37"].font = fonte_header
    ws2["A37"].fill = cor_sub
    ws2.merge_cells("A37:C37")
    ws2["A38"] = "Inclinação (m)"
    ws2["B38"] = '=IFERROR(SLOPE(C32:C35, B32:B35), "")'
    ws2["A39"] = "Intercepto (n)"
    ws2["B39"] = '=IFERROR(INTERCEPT(C32:C35, B32:B35), "")'
    ws2["A40"] = "R²"
    ws2["B40"] = '=IFERROR(RSQ(C32:C35, B32:B35), "")'
    for r_reg in (38, 39, 40):
        ws2[f"A{r_reg}"].font = fonte_bold
        ws2[f"A{r_reg}"].border = borda_fina
        ws2[f"B{r_reg}"].fill = cor_calc
        ws2[f"B{r_reg}"].border = borda_fina

    # Largura confortável das colunas
    for ws in (ws1, ws2):
        for col_idx, col_cells in enumerate(ws.columns, start=1):
            col_letter = get_column_letter(col_idx)
            max_len = max((len(str(cell.value or "")) for cell in col_cells if not str(cell.value or "").startswith("=")), default=10)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 28)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.post("/exportar-excel")
def exportar_excel_reatividade(pedido: PedidoExportarExcel):
    xlsx = _gerar_excel_reatividade(pedido)
    nome = f"{(pedido.codigo or 'reatividade_estatica').replace(' ', '_')}.xlsx"
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


class PontoXYRda(BaseModel):
    x: float
    y: float
    rotulo: Optional[str] = None


class PedidoGraficoRdaHTempo(BaseModel):
    usados: List[PontoXYRda] = Field(default_factory=list)
    fora: List[PontoXYRda] = Field(default_factory=list)
    inclinacao: Optional[float] = None
    intercepto: Optional[float] = None
    r2: Optional[float] = None
    taxa_reacao: Optional[float] = None
    codigo_amostra: Optional[str] = None
    sistema_acido: Optional[str] = None
    rotacao_rpm: Optional[float] = None
    temperatura_c: Optional[float] = None
    mostrar_grade: bool = True
    estilo: EstiloGraficoOrigin = Field(default_factory=EstiloGraficoOrigin)


class PontoMediaLevich(BaseModel):
    x: float
    y: float
    erro: float = 0.0
    rpm: Optional[float] = None
    n: int = 1


class PedidoGraficoRdaLevich(BaseModel):
    medias: List[PontoMediaLevich] = Field(default_factory=list)
    discos: List[PontoXYRda] = Field(default_factory=list)
    inclinacao: Optional[float] = None
    intercepto: Optional[float] = None
    r2: Optional[float] = None
    sc: Optional[float] = None
    d_cm2_s: Optional[float] = None
    regime: Optional[str] = None
    nome_serie: Optional[str] = None
    mostrar_grade: bool = True
    estilo: EstiloGraficoOrigin = Field(default_factory=EstiloGraficoOrigin)


def _fmt_virgula(valor: float, casas: int) -> str:
    return f"{valor:.{casas}f}".replace(".", ",")


def _fmt_cient_pt(valor: float, casas: int = 2) -> str:
    if valor == 0:
        return "0"
    exp = int(np.floor(np.log10(abs(valor))))
    mant = valor / (10 ** exp)
    return f"{mant:.{casas}f}".replace(".", "{,}") + f"\\times 10^{{{exp}}}"


def _casas_eixo(valores: np.ndarray) -> int:
    if len(valores) == 0:
        return 4
    span = float(np.max(valores) - np.min(valores))
    if span <= 0:
        span = abs(float(valores[0])) * 0.01 or 1e-4
    passo = span / 5.0
    if passo >= 1:
        return 0
    return int(min(7, max(2, np.ceil(-np.log10(passo)) + 1)))


def _configurar_quadro_origin(ax, mostrar_grade: bool = True):
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_linewidth(1.3)
        spine.set_color("#111827")
    ax.xaxis.set_minor_locator(AutoMinorLocator(5))
    ax.yaxis.set_minor_locator(AutoMinorLocator(5))
    ax.tick_params(axis="both", which="major", direction="in", top=True, right=True, length=6, width=1.15, pad=5)
    ax.tick_params(axis="both", which="minor", direction="in", top=True, right=True, length=3.2, width=0.85)
    if mostrar_grade:
        ax.grid(True, which="major", linestyle="--", linewidth=0.55, color="#cbd5e1", alpha=0.75, zorder=0)


@router.post("/grafico-rda-h-tempo")
def gerar_grafico_rda_h_tempo(pedido: PedidoGraficoRdaHTempo):
    todos = list(pedido.usados) + list(pedido.fora)
    if not todos:
        raise HTTPException(422, "Envie ao menos um ponto para gerar o gráfico [H+] × tempo.")

    fig, ax = _criar_figura_origin(pedido.estilo)
    _configurar_quadro_origin(ax, pedido.mostrar_grade)

    xs_all = np.array([p.x for p in todos], dtype=float)
    ys_all = np.array([p.y for p in todos], dtype=float)

    if pedido.fora:
        xf = np.array([p.x for p in pedido.fora], dtype=float)
        yf = np.array([p.y for p in pedido.fora], dtype=float)
        ax.plot(
            xf, yf, "o",
            markerfacecolor="white", markeredgecolor="#64748b", markeredgewidth=1.35,
            ms=6.5, label=f"Fora da janela (n = {len(pedido.fora)})", zorder=3,
        )

    if pedido.usados:
        xu = np.array([p.x for p in pedido.usados], dtype=float)
        yu = np.array([p.y for p in pedido.usados], dtype=float)
        ax.plot(
            xu, yu, "s",
            color="#0f3d6e", markeredgecolor="#092545", markeredgewidth=0.9,
            ms=6.5, label=f"Janela linear (n = {len(pedido.usados)})", zorder=4,
        )

        inc = pedido.inclinacao
        inter = pedido.intercepto
        if (inc is None or inter is None) and len(xu) >= 2 and np.std(xu) > 0:
            inc_c, inter_c = np.polyfit(xu, yu, 1)
            inc, inter = float(inc_c), float(inter_c)

        if pedido.estilo.mostrar_reta_ajuste and inc is not None and inter is not None and len(xu) >= 2:
            x_lin = np.linspace(float(np.min(xu)), float(np.max(xu)), 100)
            r2_val = pedido.r2 if pedido.r2 is not None else _r2_seguro(xu, yu)
            sinal = "−" if inc < 0 else "+"
            rot_reta = (
                f"Ajuste: y = {_fmt_virgula(inter, 5)} {sinal} ${ _fmt_cient_pt(abs(inc), 2) }$·t"
                f" ($R^2$ = {_fmt_virgula(r2_val, 4)})"
            )
            ax.plot(x_lin, inter + inc * x_lin, "-", color="#c0392b", lw=1.85, label=rot_reta, zorder=5)

    if pedido.taxa_reacao is not None:
        ax.plot([], [], " ", label=f"TR = ${_fmt_cient_pt(pedido.taxa_reacao, 2)}$ mol/(cm²·s)")

    x_min, x_max = float(np.min(xs_all)), float(np.max(xs_all))
    x_span = x_max - x_min if x_max > x_min else max(abs(x_max), 1.0)
    y_min, y_max = float(np.min(ys_all)), float(np.max(ys_all))
    y_span = y_max - y_min if y_max > y_min else max(abs(y_max) * 0.002, 1e-5)

    ax.set_xlim(max(0.0, x_min - 0.05 * x_span) if x_min >= 0 else x_min - 0.05 * x_span, x_max + 0.06 * x_span)
    ax.set_ylim(y_min - 0.16 * y_span, y_max + 0.24 * y_span)

    casas_y = _casas_eixo(ys_all)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: _fmt_virgula(v, 0 if x_span >= 10 else 1)))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: _fmt_virgula(v, casas_y)))

    ax.set_xlabel(pedido.estilo.eixo_x or "Tempo, t (s)", fontweight="bold", labelpad=7)
    ax.set_ylabel(pedido.estilo.eixo_y or "[H⁺] (mol/L)", fontweight="bold", labelpad=8)

    partes_titulo = [p for p in [
        pedido.codigo_amostra,
        pedido.sistema_acido,
        f"{pedido.rotacao_rpm:.0f} rpm" if pedido.rotacao_rpm is not None else None,
        f"{pedido.temperatura_c:g} °C" if pedido.temperatura_c is not None else None,
    ] if p]
    titulo_padrao = " · ".join(partes_titulo) if partes_titulo else None
    if pedido.estilo.titulo or titulo_padrao:
        ax.set_title(pedido.estilo.titulo or titulo_padrao, fontweight="bold", pad=10, fontsize=pedido.estilo.tamanho_fonte + 1)

    _aplicar_legenda(ax, pedido.estilo)
    nome = f"rda_h_tempo_{(pedido.codigo_amostra or 'disco').replace(' ', '_')}"
    return _exportar_figura(fig, pedido.estilo, nome)


@router.post("/grafico-rda-levich")
def gerar_grafico_rda_levich(pedido: PedidoGraficoRdaLevich):
    if not pedido.medias:
        raise HTTPException(422, "Envie as médias por rotação para gerar o gráfico de Levich.")

    fig, ax = _criar_figura_origin(pedido.estilo)
    _configurar_quadro_origin(ax, pedido.mostrar_grade)

    xm = np.array([m.x for m in pedido.medias], dtype=float)
    ym = np.array([m.y for m in pedido.medias], dtype=float)
    em = np.array([m.erro for m in pedido.medias], dtype=float)

    if pedido.discos:
        xd = np.array([d.x for d in pedido.discos], dtype=float)
        yd = np.array([d.y for d in pedido.discos], dtype=float)
        ax.plot(
            xd, yd, "o",
            markerfacecolor="white", markeredgecolor="#64748b", markeredgewidth=1.2,
            ms=5.8, alpha=0.85, label=f"Discos individuais (n = {len(pedido.discos)})", zorder=2,
        )

    inc = pedido.inclinacao
    inter = pedido.intercepto
    if (inc is None or inter is None) and len(xm) >= 2 and np.std(xm) > 0:
        inc_c, inter_c = np.polyfit(xm, ym, 1)
        inc, inter = float(inc_c), float(inter_c)

    if pedido.estilo.mostrar_reta_ajuste and inc is not None and inter is not None:
        x_lin = np.linspace(0.0, float(np.max(xm)) * 1.08, 100)
        r2_val = pedido.r2 if pedido.r2 is not None else _r2_seguro(xm, ym)
        ax.plot(
            x_lin, inter + inc * x_lin, "-", color="#c0392b", lw=1.85,
            label=f"Ajuste Levich: slope = ${_fmt_cient_pt(inc, 2)}$ ($R^2$ = {_fmt_virgula(r2_val, 4)})",
            zorder=3,
        )

    if pedido.estilo.mostrar_barras_erro and np.any(em > 0):
        ax.errorbar(
            xm, ym, yerr=em, fmt="s", color="#0f3d6e", ecolor="#0f3d6e",
            elinewidth=1.2, capsize=4, capthick=1.2, ms=6.5,
            label="Média por rotação ± DP", zorder=4,
        )
    else:
        ax.plot(xm, ym, "s", color="#0f3d6e", ms=6.5, label="Média por rotação", zorder=4)

    if pedido.d_cm2_s is not None:
        sc_txt = f"Sc = {_fmt_virgula(pedido.sc, 1)} · " if pedido.sc is not None else ""
        ax.plot([], [], " ", label=f"{sc_txt}D = ${_fmt_cient_pt(pedido.d_cm2_s, 2)}$ cm²/s")

    todos_y = np.concatenate([ym + em, ym - em, np.array([d.y for d in pedido.discos], dtype=float) if pedido.discos else ym])
    y_max = float(np.max(todos_y)) if len(todos_y) else 1e-6
    ax.set_xlim(0.0, float(np.max(xm)) * 1.12 if len(xm) else 10.0)
    ax.set_ylim(0.0, y_max * 1.25 if y_max > 0 else 1e-6)

    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: _fmt_virgula(v, 1)))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: "0" if v == 0 else f"{v:.2e}".replace(".", ",")))

    ax.set_xlabel(pedido.estilo.eixo_x or "√ω (rad/s)^0,5", fontweight="bold", labelpad=7)
    ax.set_ylabel(pedido.estilo.eixo_y or "Taxa de reação, TR (mol/cm²·s)", fontweight="bold", labelpad=8)
    if pedido.estilo.titulo or pedido.nome_serie:
        ax.set_title(pedido.estilo.titulo or f" Ajuste de Levich — {pedido.nome_serie}", fontweight="bold", pad=10)

    _aplicar_legenda(ax, pedido.estilo)
    nome = f"rda_levich_{(pedido.nome_serie or 'serie').replace(' ', '_')}"
    return _exportar_figura(fig, pedido.estilo, nome)
