// Peças comuns das telas da dissolução dinâmica (RDA): números com vírgula, avisos do cálculo,
// cartões de resultado e os dois gráficos padrão Origin ([H⁺] × tempo e TR × √ω) com exportação PNG/SVG/PDF/CSV.
import React from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { URL_GRAFICOS } from '../../../visualizacao/servicos/graficos'
import {
  GraficoOriginHTempo,
  GraficoOriginLevich,
  type PontoMediaLevichGrafico,
  type PontoRdaGrafico,
} from './GraficoOriginRda'
import { COR_AZUL, COR_LAB } from './numeros'

export type { PontoRdaGrafico, PontoMediaLevichGrafico }

async function obterTokenSessao(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export const ListaAvisos: React.FC<{ avisos: { severidade: 'ERRO' | 'AVISO'; mensagem: string }[] }> = ({ avisos }) =>
  avisos.length ? (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {avisos.map((a, i) => (
        <li key={i} className={`flex items-start gap-2 text-[13px] ${a.severidade === 'ERRO' ? 'text-[var(--color-red-700)]' : 'text-[var(--color-orange-700)]'}`}>
          {a.severidade === 'ERRO' ? <XCircle size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{a.mensagem}</span>
        </li>
      ))}
    </ul>
  ) : null

export const CartaoNumero: React.FC<{ rotulo: React.ReactNode; valor: React.ReactNode; detalhe?: React.ReactNode; destaque?: boolean }> = ({ rotulo, valor, detalhe, destaque }) => (
  <div className={`rounded-[10px] border px-4 py-3 ${destaque ? 'border-[var(--color-orange)] bg-[var(--color-orange-50,#fff4ee)]' : 'border-[var(--color-neutral-300)] bg-white'}`}>
    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-neutral-600)]">{rotulo}</div>
    <div className="mt-1 font-mono text-[18px] font-bold text-[var(--color-blue-800)]">{valor}</div>
    {detalhe && <div className="mt-0.5 text-[12px] text-[var(--color-neutral-600)]">{detalhe}</div>}
  </div>
)

/** Abas internas (sub-seções) com o mesmo visual das abas do sistema */
export function SubAbas<T extends string>(p: { abas: [T, string][]; ativa: T; aoMudar: (a: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--color-neutral-300)]">
      {p.abas.map(([k, r]) => (
        <button key={k} type="button" onClick={() => p.aoMudar(k)} className={`aba ${p.ativa === k ? 'ativa' : ''}`}>{r}</button>
      ))}
    </div>
  )
}

/** [H⁺] × tempo padrão Origin: pontos da janela linear, pontos fora da janela, reta ajustada, seletor Y e exportação. */
export const GraficoHTempo: React.FC<{
  usados: PontoRdaGrafico[]
  fora: PontoRdaGrafico[]
  reta: { inclinacao: number; intercepto: number } | null
  rotuloY?: string
  altura?: number
  c0MolL?: number | null
  taxaReacao?: number | null
  r2?: number | null
  codigoAmostra?: string | null
  sistemaAcido?: string | null
  rotacaoRpm?: number | null
  temperaturaC?: number | null
  mineral?: 'calcita' | 'dolomita' | string | null
  pontosCompletos?: PontoRdaGrafico[]
}> = (props) => (
  <GraficoOriginHTempo
    {...props}
    obterToken={obterTokenSessao}
    urlGraficos={URL_GRAFICOS}
  />
)

/** TR × √ω padrão Origin: média por rotação ± DP, discos individuais, reta de Levich e exportação. */
export const GraficoLevichSerie: React.FC<{
  medias: PontoMediaLevichGrafico[]
  discos: { x: number; y: number; codigo?: string }[]
  reta: { inclinacao: number; intercepto: number } | null
  altura?: number
  r2?: number | null
  sc?: number | null
  dCm2S?: number | null
  regime?: string | null
  nomeSerie?: string | null
}> = (props) => (
  <GraficoOriginLevich
    {...props}
    obterToken={obterTokenSessao}
    urlGraficos={URL_GRAFICOS}
  />
)

export const SeloRegime: React.FC<{ regime: string | null | undefined }> = ({ regime }) => {
  if (!regime) return <span className="text-[var(--color-neutral-500)]">—</span>
  const cor = regime === 'transporte' ? COR_AZUL : regime === 'misto' ? COR_LAB : '#6b7380'
  return (
    <span className="inline-flex flex-col">
      <span className="inline-block rounded-full px-2.5 py-0.5 text-[12px] font-bold text-white" style={{ background: cor }}>{regime}</span>
      {regime === 'reação de superfície' && <span className="mt-0.5 text-[11px] text-[var(--color-neutral-600)]">D de Levich sem significado</span>}
    </span>
  )
}
