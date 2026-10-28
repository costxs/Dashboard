"""Comparação de resultados entre amostras (dashboard de visualização), gerada aqui no backend.

O dashboard só escolhe as amostras e pede a imagem; o desenho é feito aqui, no padrão Origin dos outros gráficos.
Os dados são lidos do Supabase com o LOGIN DE QUEM PEDE (token + chave pública): o RLS decide o que a pessoa vê.
Sem login não há gráfico, nem com MODO_DEV. O primeiro tipo é o PVbt (base v_pvbt, fonte LCPETRO).
"""
from __future__ import annotations

import io
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from acidificacao_salva import _ler
from graficos.estilo import CORES_ORIGIN, estilo_origin

import matplotlib.pyplot as plt  # noqa: E402  (o backend Agg já foi escolhido em graficos.estilo)

router = APIRouter(prefix="/comparacao", tags=["comparação"])

MARCADORES = ["o", "s", "^", "D", "v", "P", "X", "*", "<", ">"]


class PedidoComparacao(BaseModel):
    amostras: list[UUID] = Field(min_length=1, max_length=60)
    visao: Literal["barras", "velocidade"] = "barras"
    formato: Literal["png", "svg", "pdf"] = "png"
    dpi: int = Field(150, ge=72, le=600)


def _fmt(v: float, casas: int = 3) -> str:
    t = f"{v:.{casas}f}"
    if "." in t:
        t = t.rstrip("0").rstrip(".")      # só corta zeros da parte decimal: 40 continua 40
    return t.replace(".", ",")


def _rotulo(e: dict) -> str:
    """Rótulo do ensaio: amostra · ensaio (· T · vazão quando houver)."""
    extra = []
    if e.get("temperatura_nominal_c") is not None:
        extra.append(f"{_fmt(float(e['temperatura_nominal_c']), 0)} °C")
    if e.get("vazao_ml_min") is not None:
        extra.append(f"{_fmt(float(e['vazao_ml_min']), 2)} mL/min")
    return " · ".join([f"{e.get('id_amostra')} · {e.get('id_experimento')}", *extra])


def buscar(token: str, amostras: list[UUID]) -> list[dict]:
    """Ensaios com PVbt das amostras pedidas (o RLS esconde as que a pessoa não pode ver)."""
    ids = ",".join(str(a) for a in amostras)
    linhas = _ler(token, "v_pvbt", {
        "fonte": "eq.LCPETRO", "pvbt": "not.is.null", "amostra_uuid": f"in.({ids})",
        "select": "id_experimento,id_amostra,amostra_uuid,pvbt,vazao_ml_min,temperatura_nominal_c,vel_intersticial_cm_min",
        "order": "id_amostra,id_experimento",
    })
    return linhas


def desenhar(ensaios: list[dict], visao: str, formato: str, dpi: int) -> tuple[bytes, str]:
    with estilo_origin("Arial", 12, 1.5, True):
        if visao == "barras":
            n = len(ensaios)
            fig, ax = plt.subplots(figsize=(18 / 2.54, max(8.0, 3.0 + 0.7 * n) / 2.54 * 1.0))
            nomes = [_rotulo(e) for e in ensaios]
            vals = [float(e["pvbt"]) for e in ensaios]
            ypos = list(range(n))[::-1]
            ax.barh(ypos, vals, color="#0000FF", height=0.6, edgecolor="black", linewidth=0.8)
            for y, v in zip(ypos, vals):
                ax.annotate(_fmt(v, 4), (v, y), xytext=(4, 0), textcoords="offset points", va="center", fontsize=10)
            ax.set_yticks(ypos)
            ax.set_yticklabels(nomes, fontsize=10)
            ax.set_xlabel("PVbt (PV)", fontweight="bold")
            ax.set_xlim(0, max(vals) * 1.18 if vals and max(vals) > 0 else 1)
            ax.xaxis.set_minor_locator(plt.matplotlib.ticker.AutoMinorLocator(2))
            ax.tick_params(axis="y", which="both", right=False, left=False)
        else:
            # PVbt × velocidade intersticial (log-log): só entram ensaios com velocidade calculada
            com_v = [e for e in ensaios if (e.get("vel_intersticial_cm_min") or 0) > 0 and (e.get("pvbt") or 0) > 0]
            if not com_v:
                raise ValueError("nenhum ensaio escolhido tem velocidade intersticial (falta a porosidade da amostra): use a visão por amostra")
            fig, ax = plt.subplots(figsize=(16 / 2.54, 13 / 2.54))
            codigos = sorted({e["id_amostra"] for e in com_v})
            for i, cod in enumerate(codigos):
                pts = sorted((float(e["vel_intersticial_cm_min"]), float(e["pvbt"])) for e in com_v if e["id_amostra"] == cod)
                ax.plot([p[0] for p in pts], [p[1] for p in pts], marker=MARCADORES[i % len(MARCADORES)], ms=7,
                        color=CORES_ORIGIN[i % len(CORES_ORIGIN)], lw=1.2, label=cod)
            ax.set_xscale("log"); ax.set_yscale("log")
            ax.margins(x=0.25, y=0.25)
            for eixo in (ax.xaxis, ax.yaxis):   # números simples (0,1 · 0,2 · 0,5) em vez de potências de 10
                eixo.set_major_locator(plt.matplotlib.ticker.LogLocator(base=10, subs=(1, 2, 5), numticks=12))
                eixo.set_major_formatter(plt.matplotlib.ticker.FuncFormatter(lambda v, _: _fmt(v, 4)))
                eixo.set_minor_formatter(plt.matplotlib.ticker.NullFormatter())
            ax.set_xlabel("Interstitial velocity (cm/min)", fontweight="bold")
            ax.set_ylabel("PVbt (PV)", fontweight="bold")
            ax.tick_params(which="both", top=True, right=True)   # escala log: as marcas menores já vêm do eixo
            ax.legend(loc="best", frameon=True, edgecolor="black", fancybox=False, fontsize=10)
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format=formato, dpi=dpi if formato == "png" else None, bbox_inches="tight")
        plt.close(fig)
    return buf.getvalue(), {"png": "image/png", "svg": "image/svg+xml", "pdf": "application/pdf"}[formato]


@router.post("/pvbt")
def grafico_pvbt(p: PedidoComparacao, authorization: Optional[str] = Header(default=None)):
    """Gráfico de PVbt das amostras escolhidas: barras por ensaio ou PVbt × velocidade intersticial."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "faça login para ver os gráficos")
    ensaios = buscar(authorization.split(" ", 1)[1], p.amostras)
    if not ensaios:
        raise HTTPException(404, "nenhuma das amostras escolhidas tem ensaio com PVbt visível para você")
    try:
        img, tipo = desenhar(ensaios, p.visao, p.formato, p.dpi)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return Response(img, media_type=tipo, headers={"Content-Disposition": f'inline; filename="comparacao_pvbt_{p.visao}.{p.formato}"'})
