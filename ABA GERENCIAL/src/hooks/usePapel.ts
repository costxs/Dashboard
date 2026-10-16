import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { meuPapel } from '../servicos/api'
import type { Papel } from '../tipos/banco'

// Papel do usuário em cada projeto, pela RPC meu_papel do banco. Serve só para mostrar
// ou esconder botões: quem bloqueia de verdade é a regra de acesso do banco (RLS).

const memoria = new Map<string, Promise<Papel | null>>()

function papelDe(usuarioId: string, projetoId: string): Promise<Papel | null> {
  const chave = `${usuarioId}:${projetoId}`
  let p = memoria.get(chave)
  if (!p) {
    p = meuPapel(projetoId).catch(() => {
      memoria.delete(chave)
      return null
    })
    memoria.set(chave, p)
  }
  return p
}

/** Papéis nos projetos informados: { [projetoId]: 'editor' | 'leitor' | null }. */
export function usePapeis(projetoIds: string[]): Record<string, Papel | null> {
  const { usuario } = useAuth()
  const [papeis, setPapeis] = useState<Record<string, Papel | null>>({})
  const ids = [...new Set(projetoIds)].sort().join(',')

  useEffect(() => {
    let vivo = true
    const lista = ids ? ids.split(',') : []
    if (!usuario || lista.length === 0) {
      setPapeis({})
      return
    }
    Promise.all(lista.map((id) => papelDe(usuario.id, id))).then((r) => {
      if (vivo) setPapeis(Object.fromEntries(lista.map((id, i) => [id, r[i]])))
    })
    return () => { vivo = false }
  }, [usuario, ids])

  return papeis
}

/**
 * Pode gravar no projeto? Sem projeto (contexto "todos os projetos da empresa"),
 * vale "é editor em algum lugar" (RPC sou_editor).
 */
export function usePodeEditar(projetoId: string | null | undefined): boolean {
  const { editor } = useAuth()
  const papeis = usePapeis(projetoId ? [projetoId] : [])
  return projetoId ? papeis[projetoId] === 'editor' : editor
}
