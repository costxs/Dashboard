"""Gráficos do tratamento de permeabilidade (coreflooding), no padrão do Origin.

Modos:
  por_vazao  -> um gráfico de UMA etapa (ΔP × tempo), na cor escolhida para ela
  painel     -> todas as etapas lado a lado (um quadro por vazão), cada uma na sua cor
  combinado  -> todas as etapas no mesmo eixo de tempo, cada trecho na cor da sua vazão
  darcy      -> ΔP médio × Q de cada etapa, com a reta ajustada (intercepto livre, como no Origin) e o k
"""
from __future__ import annotations

import io
import math
from typing import Literal, Optional

import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
from pydantic import BaseModel, Field

from .estilo import CORES_ORIGIN, acabamento, estilo_origin

CONSTANTE_DARCY = 1000 * 14.696 / 60  # 244,93: k[mD] = C·Q[cm³/min]·μ[cP]·L[cm] / (A[cm²]·ΔP[psi])


def ajuste_darcy(pts: list[tuple[float, float]], modo: str = "intercepto"):
    """Reta ΔP (psi) × Q (cm³/min). 'intercepto' = ΔP = a·Q + b (FitLinear do Origin, padrão do laboratório);
    'origem' = ΔP = a·Q. Devolve (a, b, r2, a_livre, b_livre, a_origem)."""
    n = len(pts)
    mq = sum(q for q, _ in pts) / n
    mp = sum(d for _, d in pts) / n
    sqq = sum((q - mq) ** 2 for q, _ in pts)
    a_l = sum((q - mq) * (d - mp) for q, d in pts) / sqq if sqq else float("nan")
    b_l = mp - a_l * mq
    a_0 = sum(q * d for q, d in pts) / sum(q * q for q, _ in pts)
    a, b = (a_0, 0.0) if modo == "origem" else (a_l, b_l)
    ss_tot = sum((d - mp) ** 2 for _, d in pts)
    r2 = 1 - sum((d - (a * q + b)) ** 2 for q, d in pts) / ss_tot if ss_tot else 1.0
    return a, b, r2, a_l, b_l, a_0


class Leitura(BaseModel):
    t: float          # tempo (s)
    dp: float         # ΔP (psi)
    q: float          # vazão (cm³/min)


class EtapaCfg(BaseModel):
    ordem: int
    q: float
    t_inicio: float
    t_fim: float
    j_inicio: Optional[float] = None     # trecho estável usado no cálculo
    j_fim: Optional[float] = None
    dp_medio: Optional[float] = None
    k_md: Optional[float] = None
    usada: bool = True
    cor: Optional[str] = None            # "#RRGGBB"; vazio = sequência do Origin
    rotulo: Optional[str] = None         # padrão: "Q = 2 cm³/min"
    marcador: Optional[str] = None       # "o", "s", "^", "D", "v" ou vazio (só linha)
    visivel: bool = True


class ConfigGrafico(BaseModel):
    modo: Literal["combinado", "por_vazao", "painel", "darcy"] = "combinado"
    sobrepor: bool = False                        # combinado: todas começando em t = 0, uma sobre a outra
    continuo: bool = True                         # combinado em sequência: onde termina uma vazão começa a outra (sem pausas)
    etapa: Optional[int] = None                   # para modo por_vazao
    formato: Literal["png", "svg", "pdf"] = "png"
    dpi: int = Field(300, ge=72, le=1200)
    largura_cm: float = Field(16, gt=2, le=60)
    altura_cm: float = Field(11, gt=2, le=60)
    fonte: str = "Arial"
    tamanho_fonte: float = Field(12, ge=6, le=40)
    espessura_linha: float = Field(1.5, gt=0, le=8)
    espessura_eixo: float = Field(1.5, gt=0, le=6)
    tamanho_marcador: float = Field(4, gt=0, le=20)
    ticks_para_dentro: bool = True
    titulo: Optional[str] = None
    eixo_x: str = "Tempo (s)"
    eixo_y: str = "ΔP (psi)"
    tempo_relativo: bool = True                   # cada etapa começa em t = 0
    tempo_em_minutos: bool = False
    tempo_em_horas: bool = False                  # DCI: o tempo do equipamento é em horas
    xlim: Optional[tuple[Optional[float], Optional[float]]] = None
    ylim: Optional[tuple[Optional[float], Optional[float]]] = None
    mostrar_janela: bool = True                   # sombreia o trecho estável
    mostrar_media: bool = True                    # linha tracejada no ΔP médio
    mostrar_legenda: bool = True
    mostrar_k: bool = True                        # escreve k no gráfico
    colunas_painel: int = Field(0, ge=0, le=6)    # 0 = automático
    # para o modo darcy
    comprimento_cm: Optional[float] = None
    diametro_cm: Optional[float] = None
    viscosidade_cp: Optional[float] = None
    ajuste: Literal["intercepto", "origem"] = "intercepto"   # reta ΔP × Q (intercepto = como o Origin do laboratório)

    def div_tempo(self) -> float:
        """Segundos por unidade do eixo de tempo: h (DCI) = 3600, min = 60, s = 1."""
        return 3600.0 if self.tempo_em_horas else 60.0 if self.tempo_em_minutos else 1.0


class PedidoGrafico(BaseModel):
    leituras: list[Leitura]
    etapas: list[EtapaCfg]
    config: ConfigGrafico = ConfigGrafico()


# ---------------------------------------------------------------------------
def _cor(e: EtapaCfg, i: int) -> str:
    return e.cor or CORES_ORIGIN[i % len(CORES_ORIGIN)]


def _rotulo(e: EtapaCfg) -> str:
    q = f"{e.q:g}".replace(".", ",")
    return e.rotulo or f"Q = {q} cm³/min"


def _num(v: float, casas: int = 2) -> str:
    return f"{v:.{casas}f}".replace(".", ",")


def _desenhar_etapa(ax, leituras: list[Leitura], e: EtapaCfg, cor: str, cfg: ConfigGrafico, deslocar: bool,
                    sombrear: bool = True, t0: Optional[float] = None, ligar_em: Optional[tuple[float, float]] = None):
    """Desenha uma etapa. x = (t - t0); t0 padrão: início da etapa (deslocar) ou 0 (tempo real).
    ligar_em: último ponto da etapa anterior, para a curva continuar sem buraco. Devolve o último ponto."""
    pts = [l for l in leituras if e.t_inicio <= l.t <= e.t_fim]
    if not pts:
        return ligar_em
    if t0 is None:
        t0 = e.t_inicio if deslocar else 0.0
    div = cfg.div_tempo()
    xs = [(p.t - t0) / div for p in pts]
    ys = [p.dp for p in pts]
    if ligar_em is not None:
        xs.insert(0, ligar_em[0]); ys.insert(0, ligar_em[1])
    ax.plot(xs, ys, color=cor, lw=cfg.espessura_linha, label=_rotulo(e),
            marker=e.marcador or None, markersize=cfg.tamanho_marcador, markevery=max(1, len(xs) // 25))
    if sombrear and cfg.mostrar_janela and e.j_inicio is not None and e.j_fim is not None:
        ax.axvspan((e.j_inicio - t0) / div, (e.j_fim - t0) / div, color=cor, alpha=0.10, lw=0)
    if cfg.mostrar_media and e.dp_medio is not None and e.j_inicio is not None and e.j_fim is not None:
        ax.hlines(e.dp_medio, (e.j_inicio - t0) / div, (e.j_fim - t0) / div, colors=cor, linestyles="--", lw=cfg.espessura_linha * 0.8)
    return xs[-1], ys[-1]


def _limites(ax, cfg: ConfigGrafico):
    if cfg.xlim:
        ax.set_xlim(left=cfg.xlim[0], right=cfg.xlim[1])
    if cfg.ylim:
        ax.set_ylim(bottom=cfg.ylim[0], top=cfg.ylim[1])


def _formato_tempo(ax, cfg: ConfigGrafico):
    """Tempo em horas: números do eixo X com 2 casas e vírgula (0,90; 1,80...)."""
    if cfg.tempo_em_horas and cfg.eixo_x == "Tempo (s)":
        ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:.2f}".replace(".", ",")))


def _eixo_x(cfg: ConfigGrafico) -> str:
    if cfg.eixo_x == "Tempo (s)":
        if cfg.tempo_em_horas:
            return "Tempo (h)"
        if cfg.tempo_em_minutos:
            return "Tempo (min)"
    return cfg.eixo_x


def gerar_grafico(p: PedidoGrafico) -> tuple[bytes, str]:
    cfg = p.config
    etapas = [e for e in p.etapas if e.visivel]
    if not etapas:
        raise ValueError("nenhuma etapa visível para desenhar")
    tam = (cfg.largura_cm / 2.54, cfg.altura_cm / 2.54)
    with estilo_origin(cfg.fonte, cfg.tamanho_fonte, cfg.espessura_eixo, cfg.ticks_para_dentro):
        if cfg.modo == "por_vazao":
            e = next((x for x in etapas if x.ordem == cfg.etapa), etapas[0])
            i = [x.ordem for x in p.etapas].index(e.ordem)
            fig, ax = plt.subplots(figsize=tam)
            _desenhar_etapa(ax, p.leituras, e, _cor(e, i), cfg, cfg.tempo_relativo)
            ax.set_xlabel(_eixo_x(cfg)); ax.set_ylabel(cfg.eixo_y)
            ax.set_title(cfg.titulo or _rotulo(e))
            if cfg.mostrar_k and e.k_md is not None:
                ax.text(0.97, 0.06, f"k = {_num(e.k_md)} mD", transform=ax.transAxes, ha="right", va="bottom")
            _limites(ax, cfg); acabamento(ax); _formato_tempo(ax, cfg)
            if cfg.mostrar_legenda and cfg.titulo:   # sem título próprio, o título já diz a vazão
                ax.legend(loc="best")
        elif cfg.modo == "painel":
            n = len(etapas)
            cols = cfg.colunas_painel or min(n, 3)
            linhas = math.ceil(n / cols)
            fig, eixos = plt.subplots(linhas, cols, figsize=tam, squeeze=False)
            for j, e in enumerate(etapas):
                ax = eixos[j // cols][j % cols]
                i = [x.ordem for x in p.etapas].index(e.ordem)
                _desenhar_etapa(ax, p.leituras, e, _cor(e, i), cfg, cfg.tempo_relativo)
                ax.set_title(_rotulo(e), fontsize=cfg.tamanho_fonte)
                if cfg.mostrar_k and e.k_md is not None:
                    ax.text(0.95, 0.06, f"k = {_num(e.k_md)} mD", transform=ax.transAxes, ha="right", va="bottom", fontsize=cfg.tamanho_fonte * 0.85)
                if j // cols == linhas - 1 or j + cols >= n:
                    ax.set_xlabel(_eixo_x(cfg))
                if j % cols == 0:
                    ax.set_ylabel(cfg.eixo_y)
                _limites(ax, cfg); acabamento(ax); _formato_tempo(ax, cfg)
            for j in range(n, linhas * cols):
                eixos[j // cols][j % cols].axis("off")
            if cfg.titulo:
                fig.suptitle(cfg.titulo)
        elif cfg.modo == "combinado":
            # todas as vazões num gráfico só: em sequência no tempo do ensaio, ou sobrepostas (t = 0)
            fig, ax = plt.subplots(figsize=tam)
            div = cfg.div_tempo()
            acumulado = 0.0                  # tempo já desenhado (modo contínuo)
            ultimo: Optional[tuple[float, float]] = None
            for e in etapas:
                i = [x.ordem for x in p.etapas].index(e.ordem)
                if cfg.sobrepor:
                    t0 = e.t_inicio
                elif cfg.continuo:
                    t0 = e.t_inicio - acumulado  # encosta esta vazão no fim da anterior
                else:
                    t0 = 0.0
                ultimo = _desenhar_etapa(ax, p.leituras, e, _cor(e, i), cfg, deslocar=False, sombrear=not cfg.sobrepor,
                                         t0=t0, ligar_em=ultimo if (cfg.continuo and not cfg.sobrepor) else None)
                acumulado += e.t_fim - e.t_inicio
                if cfg.mostrar_k and e.k_md is not None and e.dp_medio is not None and not cfg.sobrepor:
                    x = (((e.j_inicio if e.j_inicio is not None else e.t_inicio) + e.t_fim) / 2 - t0) / div
                    ax.annotate(f"k = {_num(e.k_md, 1)} mD", (x, e.dp_medio), xytext=(0, 8), textcoords="offset points",
                                ha="center", va="bottom", fontsize=cfg.tamanho_fonte * 0.8, color=_cor(e, i))
            if cfg.sobrepor and cfg.mostrar_janela:
                # sobrepostas: um sombreado neutro só, para as cores não se misturarem
                js = [(e.j_inicio - e.t_inicio, e.j_fim - e.t_inicio) for e in etapas if e.j_inicio is not None and e.j_fim is not None]
                if js:
                    ax.axvspan(min(a for a, _ in js) / div, max(b for _, b in js) / div, color="#808080", alpha=0.12, lw=0)
            ax.set_xlabel(_eixo_x(cfg)); ax.set_ylabel(cfg.eixo_y)
            if cfg.titulo:
                ax.set_title(cfg.titulo)
            ax.margins(y=0.12)
            _limites(ax, cfg); acabamento(ax); _formato_tempo(ax, cfg)
            if cfg.mostrar_legenda:
                ax.legend(loc="upper left" if not cfg.sobrepor else "center right")
        else:  # darcy
            fig, ax = plt.subplots(figsize=tam)
            usadas = [e for e in etapas if e.usada and e.dp_medio is not None]
            for e in etapas:
                if e.dp_medio is None:
                    continue
                i = [x.ordem for x in p.etapas].index(e.ordem)
                ax.plot([e.q], [e.dp_medio], linestyle="none", marker=e.marcador or "s", markersize=cfg.tamanho_marcador * 2,
                        color=_cor(e, i), markerfacecolor=_cor(e, i) if e.usada else "white", label=_rotulo(e))
            # com intercepto precisa de duas vazões diferentes
            if len(usadas) >= 2 and (cfg.ajuste == "origem" or len({e.q for e in usadas}) >= 2):
                a, b, r2, *_ = ajuste_darcy([(e.q, e.dp_medio) for e in usadas], cfg.ajuste)
                qmax = max(e.q for e in etapas) * 1.1
                # com intercepto a reta começa na metade da menor vazão, não no zero
                q0 = 0 if cfg.ajuste == "origem" else min(e.q for e in usadas) * 0.5
                nome = "Ajuste pela origem" if cfg.ajuste == "origem" else "Ajuste linear"
                ax.plot([q0, qmax], [a * q0 + b, a * qmax + b], color="#000000", lw=cfg.espessura_linha,
                        label=f"{nome} (R² = {r2:.4f})".replace(".", ","))
                if cfg.mostrar_k and cfg.comprimento_cm and cfg.diametro_cm and cfg.viscosidade_cp:
                    area = math.pi * cfg.diametro_cm ** 2 / 4
                    k = CONSTANTE_DARCY * cfg.viscosidade_cp * cfg.comprimento_cm / (area * a)
                    ax.text(0.04, 0.94, f"k = {_num(k)} mD", transform=ax.transAxes, ha="left", va="top")
            ax.set_xlim(left=0); ax.set_ylim(bottom=0)
            ax.set_xlabel("Q (cm³/min)" if cfg.eixo_x == "Tempo (s)" else cfg.eixo_x)
            ax.set_ylabel(cfg.eixo_y)
            if cfg.titulo:
                ax.set_title(cfg.titulo)
            _limites(ax, cfg); acabamento(ax)
            if cfg.mostrar_legenda:
                ax.legend(loc="lower right")
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format=cfg.formato, dpi=cfg.dpi if cfg.formato == "png" else None, bbox_inches="tight")
        plt.close(fig)
    tipo = {"png": "image/png", "svg": "image/svg+xml", "pdf": "application/pdf"}[cfg.formato]
    return buf.getvalue(), tipo


def planilha_para_origin(p: PedidoGrafico) -> bytes:
    """Planilha .xlsx pronta para colar/importar no Origin: duas colunas por vazão (tempo, ΔP),
    com as 3 linhas de cabeçalho que o Origin usa (Long Name, Units, Comments)."""
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Permeabilidade"
    cab_nome, cab_unid, cab_coment = [], [], []
    colunas = []
    for e in p.etapas:
        if not e.visivel:
            continue
        pts = [l for l in p.leituras if e.t_inicio <= l.t <= e.t_fim]
        t0 = e.t_inicio if p.config.tempo_relativo else 0.0
        cab_nome += ["Tempo", "ΔP"]
        cab_unid += ["s", "psi"]
        cab_coment += [_rotulo(e), _rotulo(e)]
        colunas.append([round(l.t - t0, 3) for l in pts])
        colunas.append([l.dp for l in pts])
    ws.append(cab_nome); ws.append(cab_unid); ws.append(cab_coment)
    for i in range(max((len(c) for c in colunas), default=0)):
        ws.append([c[i] if i < len(c) else None for c in colunas])
    # resumo por etapa numa segunda aba
    r = wb.create_sheet("Etapas")
    r.append(["Etapa", "Q", "Início", "Fim", "Início estável", "Fim estável", "ΔP médio", "k"])
    r.append(["", "cm³/min", "s", "s", "s", "s", "psi", "mD"])
    for e in p.etapas:
        r.append([e.ordem, e.q, e.t_inicio, e.t_fim, e.j_inicio, e.j_fim, e.dp_medio, e.k_md])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
