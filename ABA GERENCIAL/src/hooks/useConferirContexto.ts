import { useEffect } from 'react'
import { listarEmpresas, listarProjetos } from '../servicos/api'
import { useContexto } from '../store/useContexto'

/**
 * A escolha de Empresa -> Projeto fica guardada no navegador e pode envelhecer: o acesso
 * foi retirado, o projeto foi apagado. Ao abrir o app, confere com o banco (que só devolve
 * o que a pessoa pode ver); se o contexto não existe mais, limpa e a rota volta para /projetos.
 * Falha de rede não limpa nada.
 */
export function useConferirContexto() {
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)
  const limpar = useContexto((s) => s.limpar)

  useEffect(() => {
    if (!empresaId) return
    let vivo = true
    Promise.all([listarEmpresas(), listarProjetos(empresaId)])
      .then(([empresas, projetos]) => {
        if (!vivo) return
        const empresaOk = empresas.some((e) => e.id === empresaId)
        const projetoOk = !projetoId || projetos.some((p) => p.id === projetoId)
        if (!empresaOk || !projetoOk) limpar()
      })
      .catch(() => { /* sem conexão: mantém o contexto e as páginas mostram o erro */ })
    return () => { vivo = false }
  }, [empresaId, projetoId, limpar])
}
