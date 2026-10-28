"""Cadastro de usuários de nível elevado (painel gerencial), feito pelo administrador.

Criar um usuário no Supabase Auth exige a chave SECRETA, que só pode ficar aqui no servidor
(SUPABASE_SECRET_KEY no .env). Por isso o gerencial pede ao backend, e o backend:
  1. confere o token de quem pede (sempre: o MODO_DEV não vale aqui);
  2. confere no banco, com a chave secreta, que essa pessoa é administradora, ativa e aprovada;
  3. manda o convite pelo próprio Supabase (e-mail com link para definir a senha);
  4. deixa o perfil aprovado e dá o nível: administrador, ou editor de uma empresa/projeto.
Quem se registra sozinho no dashboard NÃO passa por aqui: fica pendente até o admin aprovar no gerencial.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

router = APIRouter(prefix="/usuarios", tags=["usuários"])

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Escopo(BaseModel):
    empresa_id: Optional[UUID] = None
    projeto_id: Optional[UUID] = None

    @model_validator(mode="after")
    def _um_so(self):
        if (self.empresa_id is None) == (self.projeto_id is None):
            raise ValueError("cada vínculo é de uma empresa OU de um projeto")
        return self


class Convite(BaseModel):
    email: str
    nome: str = Field(min_length=1, max_length=120)
    nivel: Literal["admin", "editor"]
    empresa_id: Optional[UUID] = None       # editor: de uma empresa (vê todos os projetos dela)...
    projeto_id: Optional[UUID] = None       # ...ou de um projeto
    escopos: list[Escopo] = Field(default_factory=list)   # editor de várias empresas/projetos
    redirect_to: Optional[str] = None       # página do gerencial para definir a senha

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("e-mail inválido")
        return v

    @model_validator(mode="after")
    def _escopo(self):
        # empresa_id/projeto_id continuam valendo para um único vínculo
        if self.empresa_id or self.projeto_id:
            if (self.empresa_id is None) == (self.projeto_id is None):
                raise ValueError("cada vínculo é de uma empresa OU de um projeto")
            self.escopos = [*self.escopos, Escopo(empresa_id=self.empresa_id, projeto_id=self.projeto_id)]
        if self.nivel == "editor" and not self.escopos:
            raise ValueError("editor: escolha ao menos uma empresa ou um projeto")
        return self


def _config() -> tuple[str, str, str]:
    url, secreta = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_SECRET_KEY", "")
    if not url or not secreta:
        raise HTTPException(503, "o backend está sem SUPABASE_URL ou SUPABASE_SECRET_KEY no .env")
    return url, secreta, os.getenv("SUPABASE_ANON_KEY", "")


def _supabase(metodo: str, caminho: str, **kw) -> httpx.Response:
    """Chamada ao Supabase com a chave secreta (passa por cima do RLS: só depois de conferir o admin)."""
    url, secreta, _ = _config()
    cab = {"apikey": secreta, "Authorization": f"Bearer {secreta}", **kw.pop("headers", {})}
    return httpx.request(metodo, f"{url}{caminho}", headers=cab, timeout=15, **kw)


def usuario_do_token(token: str) -> Optional[str]:
    """id do usuário dono do token, perguntando ao próprio Supabase; None se inválido."""
    url, _, anon = _config()
    try:
        r = httpx.get(f"{url}/auth/v1/user", headers={"Authorization": f"Bearer {token}", "apikey": anon}, timeout=10)
    except httpx.HTTPError:
        return None
    return r.json().get("id") if r.status_code == 200 else None


def eh_admin(usuario_id: str) -> bool:
    r = _supabase("GET", f"/rest/v1/perfis?id=eq.{usuario_id}&select=administrador,ativo,situacao")
    if r.status_code != 200 or not r.json():
        return False
    p = r.json()[0]
    # sem a migração 020 não há "situacao": conta como aprovado
    return bool(p.get("administrador")) and bool(p.get("ativo")) and p.get("situacao", "aprovado") == "aprovado"


def exigir_admin(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "faça login no gerencial")
    uid = usuario_do_token(authorization.split(" ", 1)[1])
    if not uid:
        raise HTTPException(401, "sessão inválida ou expirada")
    if not eh_admin(uid):
        raise HTTPException(403, "só o administrador cadastra usuários do painel gerencial")
    return uid


def _redirect_permitido(destino: Optional[str], origens: list[str], origem_local: str) -> Optional[str]:
    """Só aceita voltar para o próprio gerencial (evita que o link do e-mail leve a um site de fora)."""
    if not destino:
        return None
    base = re.match(r"^https?://[^/]+", destino)
    if base and (base.group(0) in origens or re.match(origem_local, base.group(0))):
        return destino
    raise HTTPException(422, "endereço de retorno do convite não permitido")


def criar_rotas(origens: list[str], origem_local: str) -> APIRouter:
    @router.post("/convidar")
    def convidar(c: Convite, authorization: Optional[str] = Header(default=None)):
        admin = exigir_admin(authorization)
        destino = _redirect_permitido(c.redirect_to, origens, origem_local)

        r = _supabase("POST", "/auth/v1/invite", params={"redirect_to": destino} if destino else None,
                      json={"email": c.email, "data": {"nome": c.nome}})
        if r.status_code in (409, 422) or (r.status_code >= 400 and "already" in r.text.lower()):
            raise HTTPException(409, f"já existe uma conta com o e-mail {c.email}: aprove-a ou vincule-a na lista de acessos")
        if r.status_code >= 300:
            raise HTTPException(502, f"o Supabase não aceitou o convite ({r.status_code}): {r.text[:200]}")
        novo = r.json().get("id") or (r.json().get("user") or {}).get("id")
        if not novo:
            raise HTTPException(502, "o Supabase não devolveu o usuário convidado")

        # perfil criado pelo gatilho do cadastro: aprova e define o nível
        perfil = {"nome": c.nome, "situacao": "aprovado", "administrador": c.nivel == "admin",
                  "decidido_por": admin, "decidido_em": datetime.now(timezone.utc).isoformat()}
        r = _supabase("PATCH", f"/rest/v1/perfis?id=eq.{novo}", json=perfil, headers={"Prefer": "return=minimal"})
        if r.status_code >= 300:
            raise HTTPException(502, f"convite enviado, mas não consegui aprovar o perfil: {r.text[:200]}")
        if c.nivel == "editor":
            vistos, vinculos = set(), []
            for e in c.escopos:
                if (e.empresa_id, e.projeto_id) in vistos:
                    continue
                vistos.add((e.empresa_id, e.projeto_id))
                vinculos.append({"usuario_id": novo, "papel": "editor",
                                 "empresa_id": str(e.empresa_id) if e.empresa_id else None,
                                 "projeto_id": str(e.projeto_id) if e.projeto_id else None})
            r = _supabase("POST", "/rest/v1/membros", json=vinculos, headers={"Prefer": "return=minimal"})
            if r.status_code >= 300:
                raise HTTPException(502, f"convite enviado, mas não consegui criar o vínculo: {r.text[:200]}")
        return {"id": novo, "email": c.email, "nivel": c.nivel}

    return router
