"""Serviço de gráficos do LC PETRO (padrão Origin).

Recebe os dados já tratados pelo gerencial e devolve a imagem (PNG/SVG/PDF) ou a planilha
para o Origin. Não guarda nada: os dados só passam pela memória durante o pedido.

Variáveis de ambiente:
  SUPABASE_URL          https://<projeto>.supabase.co   (valida o login pelo próprio Supabase)
  ORIGENS_PERMITIDAS    endereços do gerencial e do dashboard, separados por vírgula
  MODO_DEV=1            só para testar na sua máquina: aceita pedido sem login

Rodar:  uvicorn app:app --host 0.0.0.0 --port 8010
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from graficos.permeabilidade import PedidoGrafico, gerar_grafico, planilha_para_origin
from graficos.planilha_etapas import PedidoPlanilha, gerar_planilha_etapas

app = FastAPI(title="LC PETRO · gráficos", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ORIGENS_PERMITIDAS", "http://localhost:5173,http://localhost:5174").split(",") if o.strip()],
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type", "apikey"],
)


@lru_cache(maxsize=256)
def _token_valido(token: str) -> bool:
    """Pergunta ao Supabase se o token é de um usuário logado (funciona com chaves novas e antigas)."""
    url = os.getenv("SUPABASE_URL")
    chave = os.getenv("SUPABASE_ANON_KEY", "")
    if not url:
        return False
    try:
        r = httpx.get(f"{url}/auth/v1/user", headers={"Authorization": f"Bearer {token}", "apikey": chave}, timeout=5)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def exigir_login(authorization: str | None = Header(default=None)):
    if os.getenv("MODO_DEV") == "1":
        return
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "faça login no gerencial")
    if not _token_valido(authorization.split(" ", 1)[1]):
        raise HTTPException(401, "sessão inválida ou expirada")


@app.get("/saude")
def saude():
    return {"ok": True}


@app.post("/permeabilidade/grafico", dependencies=[Depends(exigir_login)])
def grafico_permeabilidade(pedido: PedidoGrafico):
    if len(pedido.leituras) > 200_000:
        raise HTTPException(413, "arquivo grande demais (máx. 200 mil leituras)")
    try:
        conteudo, tipo = gerar_grafico(pedido)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    nome = f"permeabilidade_{pedido.config.modo}.{pedido.config.formato}"
    return Response(conteudo, media_type=tipo, headers={"Content-Disposition": f'inline; filename="{nome}"'})


@app.post("/permeabilidade/origin", dependencies=[Depends(exigir_login)])
def planilha_origin(pedido: PedidoGrafico):
    return Response(planilha_para_origin(pedido),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="permeabilidade_para_origin.xlsx"'})


@app.post("/permeabilidade/planilha-etapas", dependencies=[Depends(exigir_login)])
async def planilha_etapas(arquivo: UploadFile = File(...), pedido: str = Form(...)):
    """Recebe o arquivo exportado pelo equipamento + as etapas (trecho estável de cada uma) e devolve
    a planilha separada no formato do pesquisador (Planilha1 com Tabela2 + aba Resumo)."""
    conteudo = await arquivo.read()
    if len(conteudo) > 30 * 1024 * 1024:
        raise HTTPException(413, "arquivo grande demais (máx. 30 MB)")
    try:
        p = PedidoPlanilha(**json.loads(pedido))
        xlsx = gerar_planilha_etapas(conteudo, p)
    except (ValueError, KeyError) as e:
        raise HTTPException(422, str(e)) from e
    nome = (arquivo.filename or "ensaio").rsplit(".", 1)[0] + "_etapas.xlsx"
    return Response(xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})
