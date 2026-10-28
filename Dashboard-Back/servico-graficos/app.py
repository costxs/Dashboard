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
import re
import time
from pathlib import Path

from dotenv import load_dotenv

# Carrega as variáveis de ambiente do .env local
load_dotenv(Path(__file__).parent / ".env")

import httpx
import traceback
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from graficos.permeabilidade import PedidoGrafico, gerar_grafico, planilha_para_origin
from graficos.planilha_etapas import PedidoPlanilha, gerar_planilha_etapas
from graficos import acidificacao as acid
from contas import criar_rotas
from acidificacao_salva import router as rotas_acid_salva
from comparacao import router as rotas_comparacao

_ORIGENS = [o.strip() for o in os.getenv("ORIGENS_PERMITIDAS", "http://localhost:5173,http://localhost:5174,http://localhost:5175").split(",") if o.strip()]
# o computador local e os endereços da conta do LC PETRO na Vercel (cada deploy ganha um endereço de preview novo,
# do tipo dashboard-aba-gerencial-<hash>-lcpetro1.vercel.app: não dá para listar um por um em ORIGENS_PERMITIDAS)
_ORIGEM_LOCAL = r"^(?:https?://(?:localhost|127\.0\.0\.1)(?::\d+)?|https://dashboard[a-z0-9-]*-lcpetro1\.vercel\.app)$"

app = FastAPI(title="LC PETRO · gráficos", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ORIGENS,
    allow_origin_regex=_ORIGEM_LOCAL,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(criar_rotas(_ORIGENS, _ORIGEM_LOCAL))
app.include_router(rotas_acid_salva)
app.include_router(rotas_comparacao)


@app.exception_handler(Exception)
async def tratar_excecao_geral(request: Request, exc: Exception):
    traceback.print_exc()
    # só devolve CORS para as mesmas origens liberadas acima (nunca ecoa qualquer origem com credenciais)
    origin = request.headers.get("origin") or ""
    cab = {}
    if origin in _ORIGENS or re.match(_ORIGEM_LOCAL, origin):
        cab = {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin"}
    return JSONResponse(status_code=500, content={"detail": f"Erro interno no serviço de gráficos: {exc}"}, headers=cab)


# tokens aceitos -> instante até quando valem sem perguntar de novo. Recusas não ficam guardadas:
# uma falha passageira (timeout, rede) não pode travar o token até o serviço reiniciar.
_aceitos: dict[str, float] = {}
_VALIDADE_S = 300


def _token_valido(token: str) -> bool:
    """Pergunta ao Supabase se o token é de um usuário logado (funciona com chaves novas e antigas)."""
    agora = time.monotonic()
    if _aceitos.get(token, 0) > agora:
        return True
    url = os.getenv("SUPABASE_URL")
    chave = os.getenv("SUPABASE_ANON_KEY_JWT") or os.getenv("SUPABASE_ANON_KEY", "")
    if not url:
        return False
    try:
        r = httpx.get(f"{url}/auth/v1/user", headers={"Authorization": f"Bearer {token}", "apikey": chave}, timeout=10)
    except httpx.HTTPError:
        return False
    if r.status_code != 200:
        return False
    if len(_aceitos) > 256:
        _aceitos.clear()
    _aceitos[token] = agora + _VALIDADE_S
    return True


_LOCAIS = {"127.0.0.1", "::1", "localhost", "testclient"}


def exigir_login(request: Request, authorization: str | None = Header(default=None)):
    # MODO_DEV só dispensa o login para pedidos da própria máquina: subir com --host 0.0.0.0 não abre o serviço
    if os.getenv("MODO_DEV") == "1" and request.client is not None and request.client.host in _LOCAIS:
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


async def _ler_pedido_acid(arquivo: UploadFile, pedido: str):
    conteudo = await arquivo.read()
    if len(conteudo) > 30 * 1024 * 1024:
        raise HTTPException(413, "arquivo grande demais (máx. 30 MB)")
    try:
        return conteudo, acid.PedidoAcid(**json.loads(pedido))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"pedido inválido: {e}") from e


@app.post("/acidificacao/planilha", dependencies=[Depends(exigir_login)])
async def acidificacao_planilha(arquivo: UploadFile = File(...), pedido: str = Form(...)):
    """Arquivo completo do JBV + fases → a pasta de trabalho do laboratório (abas 0 a 5 com fórmulas + gráficos)."""
    conteudo, p = await _ler_pedido_acid(arquivo, pedido)
    try:
        xlsx = acid.gerar_planilha(conteudo, p)
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, IndexError) as e:
        traceback.print_exc()
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erro ao gerar planilha: {e}") from e
    nome = (arquivo.filename or "ensaio").rsplit(".", 1)[0] + "_acidificacao.xlsx"
    return Response(xlsx, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@app.post("/acidificacao/grafico", dependencies=[Depends(exigir_login)])
async def acidificacao_grafico(arquivo: UploadFile = File(...), pedido: str = Form(...), qual: str = Form("geral")):
    """qual = geral (ΔP e vazão × tempo) | pv (ΔP × PV do ácido) | apos (injeção depois do ácido)."""
    if qual not in ("geral", "pv", "apos"):
        raise HTTPException(422, "qual deve ser geral, pv ou apos")
    conteudo, p = await _ler_pedido_acid(arquivo, pedido)
    try:
        img, tipo = acid.grafico(conteudo, p, qual)  # type: ignore[arg-type]
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, IndexError) as e:
        traceback.print_exc()
        raise HTTPException(422, str(e)) from e
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Erro ao gerar gráfico: {e}") from e
    return Response(img, media_type=tipo, headers={"Content-Disposition": f'inline; filename="acidificacao_{qual}.{p.config.formato}"'})
