import React, { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Disc, FlaskConical, Library } from 'lucide-react'
import { Card, CabecalhoPagina } from '../components/UI'
import { DissolucaoEstaticaPanel } from '../components/reatividade/DissolucaoEstaticaPanel'
import { SecaoMiniplugsEstatica } from '../components/reatividade/SecaoMiniplugsEstatica'
import { BoletimRdaPanel } from '../components/reatividade/rda/BoletimRdaPanel'
import { SeriesRdaPanel } from '../components/reatividade/rda/SeriesRdaPanel'
import { ViscosidadeFluidoPanel } from '../components/reatividade/rda/ViscosidadeFluidoPanel'
import { SubAbas } from '../components/reatividade/rda/comum'

// REATIVIDADE: três abas, cada uma com as suas seções.
//   Dissolução estática  › Ensaio t₅₀ (triplicata) | Miniplugs
//   Dissolução dinâmica (RDA) › Boletim de disco | Séries e coeficiente de difusão | Viscosidade do fluido
//   Literatura (a base publicada fica em Publicações; aqui só o atalho)
type Aba = 'dissolucao-estatica' | 'rda' | 'literatura'
type SecaoEstatica = 't50' | 'miniplugs'
type SecaoRda = 'boletim' | 'series' | 'viscosidade'

const ABAS: { k: Aba; rotulo: string; icone: React.ElementType }[] = [
  { k: 'dissolucao-estatica', rotulo: 'Dissolução estática', icone: FlaskConical },
  { k: 'rda', rotulo: 'Dissolução dinâmica (RDA)', icone: Disc },
  { k: 'literatura', rotulo: 'Literatura', icone: Library },
]
const SECOES_ESTATICA: [SecaoEstatica, string][] = [['t50', 'Ensaio t₅₀ (triplicata)'], ['miniplugs', 'Miniplugs']]
const SECOES_RDA: [SecaoRda, string][] = [['boletim', 'Boletim de disco'], ['series', 'Séries e coeficiente de difusão'], ['viscosidade', 'Viscosidade do fluido']]
const CHAVE = 'lcp.reatividade.aba'

export const ReatividadePage: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const lembrada = (typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : null) as Aba | null
  const aba: Aba = (ABAS.some((a) => a.k === params.get('aba')) ? params.get('aba') : lembrada && ABAS.some((a) => a.k === lembrada) ? lembrada : 'dissolucao-estatica') as Aba
  const secao = params.get('secao')
  const secaoEstatica: SecaoEstatica = SECOES_ESTATICA.some(([k]) => k === secao) ? (secao as SecaoEstatica) : 't50'
  const secaoRda: SecaoRda = SECOES_RDA.some(([k]) => k === secao) ? (secao as SecaoRda) : 'boletim'

  useEffect(() => { try { localStorage.setItem(CHAVE, aba) } catch { /* sem localStorage */ } }, [aba])

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        selo="LC PETRO"
        titulo="Reatividade"
        subtitulo="Dissolução estática (t₅₀ e miniplugs), dissolução dinâmica em disco rotativo (taxa de reação e coeficiente de difusão) e a literatura."
      />

      <div className="flex flex-wrap gap-6 border-b border-[var(--color-neutral-300)]">
        {ABAS.map(({ k, rotulo, icone: Icone }) => (
          <button
            key={k}
            type="button"
            onClick={() => setParams({ aba: k })}
            className={`flex items-center gap-2 pb-3 text-[13px] font-semibold border-b-[3px] transition-colors cursor-pointer ${
              aba === k ? 'border-[var(--color-orange)] text-[var(--color-blue-800)]' : 'border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)]'
            }`}
          >
            <Icone size={15} className={aba === k ? 'text-[var(--color-red)]' : 'text-[var(--color-neutral-400)]'} />
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'dissolucao-estatica' && (
        <div className="space-y-6">
          <SubAbas abas={SECOES_ESTATICA} ativa={secaoEstatica} aoMudar={(s) => setParams({ aba, secao: s })} />
          {secaoEstatica === 't50' && <DissolucaoEstaticaPanel />}
          {secaoEstatica === 'miniplugs' && <SecaoMiniplugsEstatica />}
        </div>
      )}

      {aba === 'rda' && (
        <div className="space-y-6">
          <SubAbas abas={SECOES_RDA} ativa={secaoRda} aoMudar={(s) => setParams({ aba, secao: s })} />
          {secaoRda === 'boletim' && <BoletimRdaPanel />}
          {secaoRda === 'series' && <SeriesRdaPanel />}
          {secaoRda === 'viscosidade' && <ViscosidadeFluidoPanel />}
        </div>
      )}

      {aba === 'literatura' && (
        <Card titulo="Literatura de reatividade" icone={<BookOpen size={18} />}
          subtitulo="Taxas de reação publicadas (RDA), rochas, sistemas ácidos e referências">
          <p className="m-0 mb-4 text-[13px] text-[var(--color-neutral-700)]">
            A base da literatura continua em Publicações › Geral › Taxa de reação, com o cadastro de séries, a conferência e o gráfico TR × √ω.
            As séries do laboratório gravadas aqui aparecem na comparação (v_rda_comparacao).
          </p>
          <Link to="/publicacoes?aba=geral" className="btn btn-blue">Abrir a literatura de reatividade</Link>
        </Card>
      )}
    </div>
  )
}
