import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { FlaskConical } from 'lucide-react'
import { CabecalhoPagina } from '../components/UI'
import { DissolucaoEstaticaPanel } from '../components/reatividade/DissolucaoEstaticaPanel'

type AbaReatividade = 'dissolucao-estatica'

export const ReatividadePage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as AbaReatividade) || 'dissolucao-estatica'

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        selo="LC PETRO"
        titulo="Reatividade"
        subtitulo="Tratamento de ensaios de dissolução estática (t₅₀), perda de massa em triplicata, absorção atômica e gráficos padrão Origin."
      />

      {/* Abas da seção Reatividade */}
      <div className="flex flex-wrap gap-6 border-b border-[var(--color-neutral-300)]">
        <button
          type="button"
          onClick={() => setParams({ aba: 'dissolucao-estatica' })}
          className={`flex items-center gap-2 pb-3 text-[13px] font-semibold border-b-[3px] transition-colors cursor-pointer ${
            aba === 'dissolucao-estatica'
              ? 'border-[var(--color-orange)] text-[var(--color-blue-800)]'
              : 'border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)]'
          }`}
        >
          <FlaskConical
            size={15}
            className={aba === 'dissolucao-estatica' ? 'text-[var(--color-red)]' : 'text-[var(--color-neutral-400)]'}
          />
          Dissolução Estática
        </button>
      </div>

      {aba === 'dissolucao-estatica' && <DissolucaoEstaticaPanel />}
    </div>
  )
}
