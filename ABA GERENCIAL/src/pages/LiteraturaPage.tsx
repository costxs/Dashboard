import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { SeloContexto } from '../components/UI'
import { GeralViewer } from '../literatura/GeralViewer'
import { CadastroPublicacoes } from './CadastroPublicacoes'

// Literatura em duas partes, como no dashboard de visualização:
//   GERAL   = publicações externas, dados extraídos (taxa de reação, PVbt), rochas, sistemas ácidos e as referências
//   PRÓPRIA = o que o LC PETRO publicou (artigos, TCCs, relatórios)
// Aqui, além de consultar, é onde se cadastram e editam as publicações (botão "Cadastrar Publicação").
export const LiteraturaPage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') === 'propria' ? 'propria' : 'geral'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <SeloContexto />
        <h1 className="mt-3 text-[27px] leading-[1.2] text-[var(--color-blue-800)]">Literatura</h1>
        <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
          {aba === 'geral'
            ? 'Publicações externas e os dados de taxa de reação e de PVbt extraídos delas, comparados com os ensaios do LC PETRO.'
            : 'Artigos, dissertações, TCCs e relatórios produzidos pelo LC PETRO.'}
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--color-neutral-300)]">
        {([['geral', 'Geral'], ['propria', 'Própria (LC PETRO)']] as const).map(([k, r]) => (
          <button key={k} onClick={() => setParams({ aba: k })} className={`aba ${aba === k ? 'ativa' : ''}`}>{r}</button>
        ))}
      </div>

      {aba === 'geral' ? <GeralViewer /> : <CadastroPublicacoes categoria="propria" />}
    </div>
  )
}
