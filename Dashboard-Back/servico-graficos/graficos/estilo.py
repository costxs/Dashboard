"""Estilo "Origin" para matplotlib.

O que dá a cara de gráfico do Origin:
  - moldura fechada (eixos nos 4 lados), linhas de eixo grossas;
  - marcas (ticks) maiores e menores, para DENTRO, espelhadas em cima e à direita;
  - sem grade, fundo branco, fonte Arial, títulos de eixo maiores que os números;
  - cores na sequência padrão do Origin (preto, vermelho, azul, verde, magenta, oliva...).
Tudo pode ser trocado pela configuração enviada pela tela.
"""
from __future__ import annotations

from contextlib import contextmanager

import matplotlib

matplotlib.use("Agg")  # sem janela: só gera arquivos
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.ticker import AutoMinorLocator  # noqa: E402

# sequência de cores parecida com a padrão do Origin
CORES_ORIGIN = ["#000000", "#FF0000", "#0000FF", "#008000", "#FF00FF", "#808000", "#000080", "#800080", "#008080", "#800000"]

FONTES_EQUIVALENTES = {
    "Arial": ["Arial", "Liberation Sans", "Helvetica", "DejaVu Sans"],
    "Times New Roman": ["Times New Roman", "Liberation Serif", "Times", "DejaVu Serif"],
    "Calibri": ["Calibri", "Carlito", "Liberation Sans", "DejaVu Sans"],
}


def fonte_disponivel(nome: str) -> str:
    """Arial nem sempre existe no servidor Linux: usa a equivalente métrica (Liberation Sans)."""
    instaladas = {f.name for f in font_manager.fontManager.ttflist}
    for f in FONTES_EQUIVALENTES.get(nome, [nome, "DejaVu Sans"]):
        if f in instaladas:
            return f
    return "DejaVu Sans"


@contextmanager
def estilo_origin(fonte: str = "Arial", tamanho: float = 12, espessura_eixo: float = 1.5, ticks_para_dentro: bool = True):
    direcao = "in" if ticks_para_dentro else "out"
    rc = {
        "font.family": "sans-serif" if fonte != "Times New Roman" else "serif",
        "font.sans-serif": [fonte_disponivel(fonte)],
        "font.serif": [fonte_disponivel("Times New Roman")],
        "mathtext.fontset": "custom",
        "mathtext.rm": fonte_disponivel(fonte),
        "mathtext.it": fonte_disponivel(fonte) + ":italic",
        "font.size": tamanho,
        "axes.labelsize": tamanho * 1.15,
        "axes.titlesize": tamanho * 1.2,
        "axes.linewidth": espessura_eixo,
        "axes.grid": False,
        "axes.facecolor": "white",
        "figure.facecolor": "white",
        "savefig.facecolor": "white",
        "xtick.direction": direcao, "ytick.direction": direcao,
        "xtick.top": True, "ytick.right": True,
        "xtick.major.size": 6, "ytick.major.size": 6,
        "xtick.minor.size": 3, "ytick.minor.size": 3,
        "xtick.major.width": espessura_eixo, "ytick.major.width": espessura_eixo,
        "xtick.minor.width": espessura_eixo * 0.7, "ytick.minor.width": espessura_eixo * 0.7,
        "xtick.minor.visible": True, "ytick.minor.visible": True,
        "legend.frameon": False,
        "lines.linewidth": 1.5,
        "svg.fonttype": "none",   # texto editável no SVG (abre no Inkscape/Illustrator)
        "pdf.fonttype": 42,       # fontes TrueType embutidas no PDF
    }
    with plt.rc_context(rc):
        yield


def acabamento(ax):
    """Marcas menores entre as maiores, como o Origin faz por padrão."""
    ax.xaxis.set_minor_locator(AutoMinorLocator(2))
    ax.yaxis.set_minor_locator(AutoMinorLocator(2))
    ax.tick_params(which="both", top=True, right=True)
