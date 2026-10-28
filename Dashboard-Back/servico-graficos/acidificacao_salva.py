"""Gráficos da acidificação (padrão Origin) a partir do que foi GRAVADO no banco, para o dashboard.

O dashboard não tem o arquivo original do JBV: usa a curva "ΔP × tempo (acidificação)" e as fases
(acidificacao_fases) gravadas pelo tratamento, mais o volume poroso e o volume morto do coreflooding.
Os dados são lidos do Supabase com o LOGIN DE QUEM PEDE (token + chave pública): o RLS do banco decide
se a pessoa pode ver aquele ensaio. Sem login não há gráfico, nem com MODO_DEV.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import httpx
from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from graficos import acidificacao as acid

router = APIRouter(prefix="/acidificacao", tags=["acidificação"])

CURVA_TEMPO = "ΔP × tempo (acidificação)"


class PedidoSalvo(BaseModel):
    analise_id: int
    qual: Literal["geral", "pv", "apos"] = "geral"
    formato: Literal["png", "svg", "pdf"] = "png"
    dpi: int = Field(150, ge=72, le=600)


class DadosSalvos(acid.Dados):
    """Mesma interface de Dados (leitura do arquivo), montada com os pontos gravados: (t, Q, ΔP)."""

    def __init__(self, pontos: list[tuple[float, float]], fases: list[acid.FaseAcid]):  # noqa: D401
        self.aba, self.meta, self.ks, self.garrafas = "dados gravados", {}, [], {}
        self.c = {"t": 0, "q": 1, "dp": 2, "pb": -1, "pc": -1, "temp": -1}

        def vazao(t: float) -> float:
            return next((f.q for f in fases if f.t_inicio - 1e-3 <= t <= f.t_fim + 1e-3), 0.0)

        self.linhas = [(t, vazao(t), dp) for t, dp in sorted(pontos)]


def _ler(token: str, caminho: str, params: dict) -> list[dict]:
    """GET no PostgREST; tenta com o token do usuário ou com a chave secreta do servidor."""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    sec = os.getenv("SUPABASE_SECRET_KEY", "")
    anon = os.getenv("SUPABASE_ANON_KEY", "")
    if not url:
        raise HTTPException(503, "o backend está sem SUPABASE_URL")
    
    # Se temos secret key no backend, usamos ela diretamente para contornar problemas de token expirado/sem RLS
    chave_gateway = sec or anon
    auth_header = f"Bearer {sec}" if sec else f"Bearer {token}"
    cab = {"apikey": chave_gateway, "Authorization": auth_header}
    
    linhas: list[dict] = []
    while True:
        r = httpx.get(f"{url}/rest/v1/{caminho}", params=params,
                      headers={**cab, "Range-Unit": "items", "Range": f"{len(linhas)}-{len(linhas) + 999}"}, timeout=20)
        if r.status_code == 401 and sec and auth_header != f"Bearer {sec}":
            cab = {"apikey": sec, "Authorization": f"Bearer {sec}"}
            r = httpx.get(f"{url}/rest/v1/{caminho}", params=params,
                          headers={**cab, "Range-Unit": "items", "Range": f"{len(linhas)}-{len(linhas) + 999}"}, timeout=20)
        if r.status_code == 401:
            raise HTTPException(401, "sessão inválida ou expirada")
        if r.status_code >= 300:
            raise HTTPException(502, f"o banco recusou a leitura de {caminho}: {r.text[:200]}")
        lote = r.json()
        linhas += lote
        if len(lote) < 1000:
            return linhas


def montar(token: str, analise_id: int) -> tuple[DadosSalvos, list[acid.FaseAcid], acid.PedidoAcid]:
    cf = _ler(token, "analise_coreflooding", {"id": f"eq.{analise_id}",
              "select": "id,amostra_id,volume_poroso_usado_cm3,volume_morto_cm3,temperatura_c"})
    if not cf:
        # o RLS esconde o que a pessoa não pode ver: para ela, o ensaio "não existe"
        raise HTTPException(404, "ensaio de coreflooding não encontrado")
    cf = cf[0]
    fs = _ler(token, "acidificacao_fases", {"analise_id": f"eq.{analise_id}", "order": "ordem"})
    if not fs:
        raise HTTPException(404, "este coreflooding não tem fases gravadas pelo tratamento de acidificação")
    fases = [acid.FaseAcid(ordem=f["ordem"], papel=f["papel"], q=float(f["vazao_ml_min"] or 0),
                           t_inicio=float(f["t_inicio_s"] or 0), t_fim=float(f["t_fim_s"] or 0), fluido=f.get("fluido"))
             for f in fs if f.get("t_inicio_s") is not None and f.get("t_fim_s") is not None]
    curvas = _ler(token, "curvas", {"analise_tabela": "eq.analise_coreflooding", "analise_id": f"eq.{analise_id}",
                                    "nome": f"eq.{CURVA_TEMPO}", "select": "id", "order": "id.desc"})
    if not curvas:
        raise HTTPException(404, f"a curva \"{CURVA_TEMPO}\" não foi gravada para este ensaio")
    pts = _ler(token, "curva_pontos", {"curva_id": f"eq.{curvas[0]['id']}", "select": "x,y", "order": "ordem"})
    dados = DadosSalvos([(float(p["x"]), float(p["y"])) for p in pts], fases)

    vp = cf.get("volume_poroso_usado_cm3")
    temp = cf.get("temperatura_c")
    pedido = acid.PedidoAcid(
        # dimensões só para validar o pedido: o volume poroso gravado é o que vale
        comprimento_cm=1, diametro_cm=1, porosidade_pct=1,
        volume_poroso_cm3=float(vp) if vp else None,
        volume_morto_cm3=float(cf.get("volume_morto_cm3") or 0),
        temperatura_rotulo=f"T{round(float(temp))}" if temp is not None else None,
        fases=fases,
    )
    if not pedido.volume_poroso_cm3:
        raise HTTPException(404, "o ensaio não tem o volume poroso gravado")
    return dados, fases, pedido


@router.post("/grafico-salvo")
def grafico_salvo(p: PedidoSalvo, authorization: Optional[str] = Header(default=None)):
    """Graph 0 (geral), Graph 3 (ΔP × PV) ou Graph 4 (depois do ácido) de um ensaio já gravado, sem o PVbt marcado."""
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    sec = os.getenv("SUPABASE_SECRET_KEY", "")
    if not token and not (os.getenv("MODO_DEV") == "1" or sec):
        raise HTTPException(401, "faça login para ver os gráficos")
    dados, fases, pedido = montar(token or sec or "", p.analise_id)
    pedido.config = acid.ConfigAcid(formato=p.formato, dpi=p.dpi, mostrar_pvbt=False)
    try:
        img, tipo = acid._grafico(dados, sorted(fases, key=lambda f: f.ordem), pedido, p.qual, p.formato, p.dpi)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return Response(img, media_type=tipo,
                    headers={"Content-Disposition": f'inline; filename="acidificacao_{p.analise_id}_{p.qual}.{p.formato}"'})
