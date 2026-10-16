import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buscarPerfilAtual, loginComEmail, logout, souAdmin, souEditor } from '../servicos/api'
import { useContexto } from '../store/useContexto'
import type { Perfil } from '../tipos/banco'

interface AuthContextData {
  usuario: any | null
  perfil: Perfil | null
  carregando: boolean
  /** Administrador (RPC sou_admin). Só para mostrar/esconder itens: a regra real é a do banco. */
  isAdmin: boolean
  /** Editor em algum projeto ou administrador (RPC sou_editor): pode manter catálogos e importar. */
  editor: boolean
  entrar: (email: string, pass: string) => Promise<void>
  sair: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<any | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editor, setEditor] = useState(false)
  const [carregando, setCarregando] = useState(true)
  // enquanto as RPCs de papel não respondem, as rotas esperam: senão quem recarrega a página
  // em /importar ou /administracao é mandado embora antes de o app saber que é editor
  const [papeisProntos, setPapeisProntos] = useState(false)

  async function carregarPapeis() {
    try {
      const p = await buscarPerfilAtual()
      setPerfil(p)
      // se a RPC falhar, cai no que o perfil diz (e o banco continua bloqueando o que não pode)
      const [admin, ed] = await Promise.all([
        souAdmin().catch(() => Boolean(p?.administrador)),
        souEditor().catch(() => Boolean(p?.administrador)),
      ])
      setIsAdmin(admin)
      setEditor(ed)
    } finally {
      setPapeisProntos(true)
    }
  }

  function semSessao() {
    setUsuario(null)
    setPerfil(null)
    setIsAdmin(false)
    setEditor(false)
    setPapeisProntos(false)
  }

  async function carregarDados() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUsuario(session.user)
        await carregarPapeis()
      } else {
        semSessao()
      }
    } catch (err) {
      console.error('Erro ao carregar sessão:', err)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUsuario(session.user)
        // fora do callback: chamar o Supabase de dentro dele pode travar o cliente de autenticação
        setTimeout(() => {
          carregarPapeis().catch((err) => console.error('Erro ao carregar perfil:', err))
        }, 0)
      } else {
        semSessao()
        useContexto.getState().limpar()   // a escolha de empresa/projeto é de quem estava logado
      }
      setCarregando(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function entrar(email: string, pass: string) {
    setCarregando(true)
    try {
      await loginComEmail(email, pass)
      await carregarDados()
    } finally {
      setCarregando(false)
    }
  }

  async function sair() {
    await logout()
    semSessao()
    useContexto.getState().limpar()
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        perfil,
        carregando: carregando || (Boolean(usuario) && !papeisProntos),
        isAdmin,
        editor,
        entrar,
        sair,
        recarregarPerfil: carregarDados
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
