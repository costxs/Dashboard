import React from 'react'
import { create } from 'zustand'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './UI'

// Aviso de confirmação dentro do app (no lugar do popup do navegador).
// Uso:  if (!(await confirmar('Apagar a amostra X?'))) return
interface Pedido { mensagem: string; titulo: string; textoSim: string; resolver: (sim: boolean) => void }
const useConfirmacao = create<{ pedido: Pedido | null }>(() => ({ pedido: null }))

export function confirmar(mensagem: string, opcoes: { titulo?: string; textoSim?: string } = {}): Promise<boolean> {
  return new Promise((resolver) => {
    // um aviso novo encerra o anterior como "não"
    useConfirmacao.getState().pedido?.resolver(false)
    useConfirmacao.setState({
      pedido: { mensagem, titulo: opcoes.titulo ?? 'Confirmar', textoSim: opcoes.textoSim ?? 'Confirmar', resolver },
    })
  })
}

/** Monte uma vez, na raiz do app. */
export const ConfirmarHost: React.FC = () => {
  const pedido = useConfirmacao((s) => s.pedido)
  const responder = (sim: boolean) => {
    pedido?.resolver(sim)
    useConfirmacao.setState({ pedido: null })
  }
  return (
    <Modal isOpen={pedido != null} onClose={() => responder(false)} titulo={pedido?.titulo ?? ''} maxWidth="max-w-md">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[var(--color-orange)]" />
        <p className="m-0 whitespace-pre-line text-[14px] text-[var(--color-neutral-800)]">{pedido?.mensagem}</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => responder(false)}>Cancelar</button>
        <button type="button" className="btn btn-blue" autoFocus onClick={() => responder(true)}>{pedido?.textoSim}</button>
      </div>
    </Modal>
  )
}
