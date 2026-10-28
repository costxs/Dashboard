import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FlaskConical, Gauge } from 'lucide-react'
import { CabecalhoPagina } from '../components/UI'
import type { FonteDpDCI } from '../importador/lerDCI'
import type { Equipamento } from '../importador/tratamentoAcidificacao'
import { TratamentoAcidificacao } from './tratamento/TratamentoAcidificacao'
import { TratamentoPermeabilidade } from './tratamento/TratamentoPermeabilidade'

// Tratamento de dados de coreflood: o arquivo bruto do equipamento vira resultado na ficha da amostra.
//   Permeabilidade -> etapas de vazão, ΔP estável e k (Darcy)
//   Acidificação   -> fases (garrafa + vazão), breakthrough e PVbt
// O seletor de equipamento (JBV | DCI) vale para as duas abas. Se o arquivo for do outro equipamento, o seletor troca sozinho.
const ABAS = [
  { chave: 'permeabilidade', rotulo: 'Permeabilidade', icone: Gauge },
  { chave: 'acidificacao', rotulo: 'Acidificação', icone: FlaskConical },
]
const EQUIPAMENTOS: Equipamento[] = ['JBV', 'DCI']
const CHAVE_EQUIPAMENTO = 'lcpetro.tratamento.equipamento'

function equipamentoSalvo(): Equipamento {
  try {
    const v = localStorage.getItem(CHAVE_EQUIPAMENTO)
    return v === 'DCI' ? 'DCI' : 'JBV'
  } catch {
    return 'JBV'
  }
}

export const TratamentoCorefloodPage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const pedida = params.get('aba')
  const aba = ABAS.some((a) => a.chave === pedida) ? pedida : ABAS[0].chave
  const [equipamento, setEquipamento] = useState<Equipamento>(equipamentoSalvo)
  // só DCI: de onde vem o ΔP (a soma dos três transdutores ou só os dois primeiros)
  const [dpDCI, setDpDCI] = useState<FonteDpDCI>('total')

  function escolherEquipamento(e: Equipamento) {
    setEquipamento(e)
    try { localStorage.setItem(CHAVE_EQUIPAMENTO, e) } catch { /* navegador sem localStorage: vale só nesta tela */ }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        titulo="Tratamento de dados de coreflood"
        subtitulo="Arquivo exportado pelo equipamento de coreflooding: o app separa as etapas, calcula e só grava na amostra quando você confirma."
        acoes={
          <div className="flex items-center gap-2" role="group" aria-label="Equipamento de aquisição">
            <span className="rotulo">Equipamento</span>
            {EQUIPAMENTOS.map((e) => (
              <button key={e} type="button" aria-pressed={equipamento === e} onClick={() => escolherEquipamento(e)}
                className={`btn btn-sm ${equipamento === e ? 'btn-blue' : 'btn-secondary'}`}>
                {e}
              </button>
            ))}
            {equipamento === 'DCI' && (
              <label className="ml-2 flex items-center gap-2">
                <span className="rotulo">ΔP usado</span>
                <select className="input !w-auto" value={dpDCI} onChange={(e) => setDpDCI(e.target.value as FonteDpDCI)}
                  title="Vale para o próximo arquivo enviado: para trocar depois, envie o arquivo de novo">
                  <option value="total">Total (DP1 + DP2 + DP3)</option>
                  <option value="dp1_dp2">DP1 + DP2</option>
                </select>
              </label>
            )}
          </div>
        }
      />

      <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--color-neutral-300)]">
        {ABAS.map(({ chave, rotulo, icone: Icone }) => (
          <button key={chave} type="button" onClick={() => setParams({ aba: chave })}
            className={`aba ${aba === chave ? 'ativa' : ''}`}>
            <Icone size={15} /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'permeabilidade' && <TratamentoPermeabilidade equipamento={equipamento} dpDCI={dpDCI} aoDetectar={escolherEquipamento} />}
      {aba === 'acidificacao' && <TratamentoAcidificacao equipamento={equipamento} dpDCI={dpDCI} aoDetectar={escolherEquipamento} />}
    </div>
  )
}
