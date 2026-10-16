import { useMemo, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { FontePvbt, PontoPvbt } from '../../tipos/banco'
import { escalaLog, formatarLog } from '../charts/escalaLog'
import { fmt } from '../../utils/formatacao'
import { COR_FONTE, ROTULO_FONTE, chaveSerie, sistema, subtituloSerie, temperatura } from './seriesPvbt'

const GRADE = 'var(--grafico-grade)'
const TEXTO = 'var(--grafico-texto)'
const FUNDO = 'var(--grafico-fundo)'
const ESCURO = '#0a1a38'

type EixoX = 'vel_intersticial_cm_min' | 'vel_darcy_cm_min' | 'vazao_ml_min'
const EIXOS_X: Record<EixoX, string> = {
  vel_intersticial_cm_min: 'Velocidade intersticial (cm/min)',
  vel_darcy_cm_min: 'Velocidade de Darcy (cm/min)',
  vazao_ml_min: 'Vazão (mL/min)',
}
type EixoY = 'pvbt' | 'pvbt_por_darcy' | 'pvbt_por_uct'
const EIXOS_Y: Record<EixoY, string> = { pvbt: 'PVbt registrado', pvbt_por_darcy: 'PVbt com Lwh por Darcy', pvbt_por_uct: 'PVbt com Lwh por microCT' }

// condição do PVbt vira o FORMATO do marcador (a cor fica para a fonte)
const FORMA: Record<string, 'circle' | 'triangle' | 'diamond'> = { completo: 'circle', parcial: 'triangle' }
const FONTES: FontePvbt[] = ['Literatura', 'Petrobras', 'LCPETRO']   // LC PETRO desenhado por último (por cima)

/** PVbt × velocidade (log-log): uma série por curva, cor pela fonte, formato pela condição. */
export function GraficoPvbt(p: {
  pontos: PontoPvbt[]; destaque?: string | null; altura?: number
  /** id_amostra (código) cujos ensaios ficam em destaque; as outras séries ficam esmaecidas */
  destacarAmostra?: string | null
  /** clique num ponto LC PETRO abre a ficha da amostra */
  aoAbrirAmostra?: (amostraUuid: string) => void
}) {
  const [eixoX, setEixoX] = useState<EixoX>('vel_intersticial_cm_min')
  const [eixoY, setEixoY] = useState<EixoY>('pvbt')
  const [ligar, setLigar] = useState(true)

  const { series, validos } = useMemo(() => {
    const validos = p.pontos.filter((d) => (d[eixoX] ?? 0) > 0 && (d[eixoY] ?? 0) > 0)
    const mapa = new Map<string, { chave: string; fonte: FontePvbt; forma: string; daAmostra: boolean; dados: (PontoPvbt & { x: number; y: number })[] }>()
    for (const d of validos) {
      const forma = FORMA[d.pvbt_condicao ?? ''] ?? 'diamond'
      const daAmostra = p.destacarAmostra != null && d.fonte === 'LCPETRO' && d.id_amostra === p.destacarAmostra
      const chave = `${chaveSerie(d)}|${forma}${daAmostra ? '|amostra' : ''}`
      const s = mapa.get(chave) ?? { chave, fonte: d.fonte, forma, daAmostra, dados: [] }
      s.dados.push({ ...d, x: d[eixoX] as number, y: d[eixoY] as number })
      mapa.set(chave, s)
    }
    const series = [...mapa.values()]
    for (const s of series) s.dados.sort((a, b) => a.x - b.x)
    series.sort((a, b) => Number(a.daAmostra) - Number(b.daAmostra) || FONTES.indexOf(a.fonte) - FONTES.indexOf(b.fonte))
    return { series, validos }
  }, [p.pontos, eixoX, eixoY, p.destacarAmostra])

  const ex = escalaLog(validos.map((d) => d[eixoX] as number))
  const ey = escalaLog(validos.map((d) => d[eixoY] as number))
  const fora = p.pontos.length - validos.length
  const fontesPresentes = FONTES.filter((f) => validos.some((d) => d.fonte === f))
  const formas = [...new Set(series.map((s) => s.forma))]

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-neutral-700)]">
        <label className="flex items-center gap-2 font-semibold">Eixo X
          <select className="input !w-auto !py-1.5" value={eixoX} onChange={(e) => setEixoX(e.target.value as EixoX)}>
            {Object.entries(EIXOS_X).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-semibold">Eixo Y
          <select className="input !w-auto !py-1.5" value={eixoY} onChange={(e) => setEixoY(e.target.value as EixoY)}>
            {Object.entries(EIXOS_Y).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={ligar} onChange={(e) => setLigar(e.target.checked)} /> ligar pontos da mesma série
        </label>
        {fora > 0 && <span className="text-[12px] text-[var(--color-neutral-500)]">{fora} ensaio(s) sem valor nestes eixos não aparecem</span>}
      </div>

      <ul className="m-0 p-0 list-none flex flex-wrap justify-center gap-x-5 gap-y-1 text-[12px] text-[var(--color-neutral-700)]">
        {fontesPresentes.map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden><circle r={4.5} fill={COR_FONTE[f]} /></svg>
            {ROTULO_FONTE[f]} ({validos.filter((d) => d.fonte === f).length})
          </li>
        ))}
        {series.some((s) => s.daAmostra) && (
          <li className="flex items-center gap-1.5 font-semibold">
            <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden><circle r={6.5} fill={COR_FONTE.LCPETRO} stroke={ESCURO} /></svg>
            esta amostra ({p.destacarAmostra})
          </li>
        )}
        <li className="text-[var(--color-neutral-400)]">|</li>
        {formas.map((f) => (
          <li key={f} className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden><Simbolo forma={f} cor="var(--color-neutral-600)" /></svg>
            {f === 'circle' ? 'breakthrough completo' : f === 'triangle' ? 'parcial (normalizado pelo trecho)' : 'outra condição'}
          </li>
        ))}
      </ul>

      <div style={{ height: p.altura ?? 440 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 32, left: 24 }}>
            <CartesianGrid stroke={GRADE} />
            <XAxis dataKey="x" type="number" scale="log" domain={ex.dominio} ticks={ex.marcas} tickFormatter={formatarLog}
              stroke={TEXTO} tick={{ fontSize: 12, fill: TEXTO }} allowDataOverflow
              label={{ value: EIXOS_X[eixoX], position: 'insideBottom', offset: -20, fill: TEXTO, fontSize: 12 }} />
            <YAxis dataKey="y" type="number" scale="log" domain={ey.dominio} ticks={ey.marcas} tickFormatter={formatarLog}
              stroke={TEXTO} width={56} tick={{ fontSize: 12, fill: TEXTO }} allowDataOverflow
              label={{ value: EIXOS_Y[eixoY], angle: -90, position: 'insideLeft', fill: TEXTO, fontSize: 12, style: { textAnchor: 'middle' } }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<Dica eixoX={eixoX} eixoY={eixoY} comLink={!!p.aoAbrirAmostra} />} />
            {series.map((s) => {
              const apagada = p.destaque != null && !s.chave.startsWith(p.destaque)
              const esmaecida = p.destacarAmostra != null && !s.daAmostra
              const abre = p.aoAbrirAmostra && s.fonte === 'LCPETRO' ? p.aoAbrirAmostra : null
              return (
                <Scatter key={s.chave} data={s.dados} fill={COR_FONTE[s.fonte]} fillOpacity={apagada ? 0.18 : esmaecida ? 0.4 : 1}
                  shape={s.daAmostra
                    ? (m: { cx?: number; cy?: number }) => (
                      <g transform={`translate(${m.cx ?? 0},${m.cy ?? 0}) scale(1.6)`}><Simbolo forma={s.forma} cor={COR_FONTE[s.fonte]} contorno={ESCURO} /></g>
                    )
                    : s.forma as 'circle'}
                  stroke={FUNDO} strokeWidth={1} isAnimationActive={false}
                  className={abre ? 'cursor-pointer' : undefined}
                  onClick={abre ? (m: { payload?: PontoPvbt }) => { if (m.payload?.amostra_uuid) abre(m.payload.amostra_uuid) } : undefined}
                  line={ligar && s.dados.length > 1 ? { stroke: COR_FONTE[s.fonte], strokeWidth: 1.5, strokeOpacity: apagada ? 0.15 : esmaecida ? 0.3 : 0.6 } : false} />
              )
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-[12px] text-[var(--color-neutral-600)]">
        Eixos em escala log. Cada linha liga os ensaios de uma mesma série (mesma rocha, sistema ácido, temperatura e geometria):
        o mínimo da curva indica a velocidade ótima de injeção.
      </figcaption>
    </figure>
  )
}

function Simbolo({ forma, cor, contorno }: { forma: string; cor: string; contorno?: string }) {
  if (forma === 'triangle') return <path d="M0,-5 L5,4 L-5,4 Z" fill={cor} stroke={contorno} />
  if (forma === 'diamond') return <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={cor} stroke={contorno} />
  return <circle r={4.5} fill={cor} stroke={contorno} />
}

function Dica(p: { active?: boolean; payload?: { payload: PontoPvbt }[]; eixoX: EixoX; eixoY: EixoY; comLink?: boolean }) {
  if (!p.active || !p.payload?.length) return null
  const d = p.payload[0].payload
  return (
    <div className="rounded-[10px] border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-lg max-w-[320px]">
      <div className="font-bold text-[var(--color-blue-800)]">{d.id_experimento} · {d.id_amostra} <span className="font-normal text-[var(--color-neutral-600)]">({ROTULO_FONTE[d.fonte]})</span></div>
      <div>{d.litologia} · {sistema(d)} · {temperatura(d)}</div>
      <div className="text-[var(--color-neutral-600)]">{subtituloSerie(d)}</div>
      <div className="mt-1">{EIXOS_X[p.eixoX]}: <strong>{fmt(d[p.eixoX], 4)}</strong></div>
      <div>{EIXOS_Y[p.eixoY]}: <strong>{fmt(d[p.eixoY], 3)}</strong> {d.pvbt_condicao ? `(${d.pvbt_condicao})` : ''}</div>
      {d.obtencao_dado && <div className="text-[var(--color-neutral-500)]">dado: {d.obtencao_dado}</div>}
      {p.comLink && d.fonte === 'LCPETRO' && d.amostra_uuid && (
        <div className="mt-1"><span className="font-semibold text-[var(--color-blue)] underline">abrir amostra</span> <span className="text-[var(--color-neutral-500)]">(clique no ponto)</span></div>
      )}
    </div>
  )
}
