import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { FlaskConical, Gauge } from 'lucide-react'
import { CabecalhoPagina, Card, Vazio } from '../components/UI'
import { TratamentoPermeabilidade } from './tratamento/TratamentoPermeabilidade'

// Tratamento de dados de coreflood: o arquivo bruto do equipamento vira resultado na ficha da amostra.
//   Permeabilidade -> etapas de vazão, ΔP estável e k (Darcy)
//   Acidificação   -> em breve
const ABAS = [
  { chave: 'permeabilidade', rotulo: 'Permeabilidade', icone: Gauge },
  { chave: 'acidificacao', rotulo: 'Acidificação', icone: FlaskConical },
]

export const TratamentoCorefloodPage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('aba')
  const aba = ABAS.some((a) => a.chave === pedida) ? pedida : ABAS[0].chave

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        titulo="Tratamento de dados de coreflood"
        subtitulo="Arquivo exportado pelo equipamento de coreflooding: o app separa as etapas, calcula e só grava na amostra quando você confirma."
      />

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)]">
        {ABAS.map(({ chave, rotulo, icone: Icone }) => (
          <button key={chave} type="button" onClick={() => setParams({ aba: chave })}
            className={`aba ${aba === chave ? 'ativa' : ''}`}>
            <Icone size={15} /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'permeabilidade' && <TratamentoPermeabilidade />}
      {aba === 'acidificacao' && (
        <Card>
          <Vazio icone={<FlaskConical size={28} />} titulo="Em breve"
            texto="O tratamento dos ensaios de acidificação (PVbt, curva de pressão) ainda não está disponível." />
        </Card>
      )}
    </div>
  )
}
