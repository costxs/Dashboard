import { useMemo, useState } from 'react'
import {
  CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { PontoRdaComparacao } from '../../tipos/banco'
import { escalaLog, formatarLog } from './escalaLog'
import { fmt } from '../../utils/formatacao'

const COR = {
  literatura: 'var(--grafico-serie-1)',
  lcpetro: 'var(--grafico-serie-2)',
}
const GRADE = 'var(--grafico-grade)'
const TEXTO = 'var(--grafico-texto)'
const FUNDO = 'var(--grafico-fundo)'
const ESCURO = '#0a1a38'

// Confiabilidade do ponto (obtencao_dado) vira o FORMATO do marcador, não a cor:
// assim a cor fica só para "literatura x LC PETRO".
const FORMA: Record<string, 'circle' | 'triangle' | 'diamond' | 'square'> = {
  'tabelado': 'circle',
  'medida no LC PETRO': 'circle',
  'medida na superfície': 'square',
  'lido de gráfico': 'triangle',
  'não catalogado': 'diamond',
}

type EixoX = 'raiz_omega' | 'temperatura_nominal_c' | 'conc_m'
const EIXOS_X: Record<EixoX, string> = {
  raiz_omega: '√ω (rad/s)^0,5 — gráfico de Levich',
  temperatura_nominal_c: 'Temperatura nominal (°C)',
  conc_m: 'Concentração do ácido (mol/L)',
}

// Taxa de reação (mol/m²·s) contra √ω, temperatura ou concentração.
// Literatura e ensaios do laboratório no mesmo gráfico, cada um com sua cor.
export function GraficoRda(p: {
  pontos: PontoRdaComparacao[]; altura?: number
  /** rótulo (código da amostra) dos pontos LC PETRO em destaque; os demais ficam esmaecidos */
  destacarRotulo?: string | null
}) {
  const [eixoX, setEixoX] = useState<EixoX>('raiz_omega')
  const [log, setLog] = useState(true)

  const series = useMemo(() => {
    const validos = p.pontos.filter((d) => d[eixoX] != null && d.taxa_reacao_mol_m2_s != null && d.taxa_reacao_mol_m2_s > 0)
    const grupos: { chave: string; fonte: 'literatura' | 'lcpetro'; forma: string; nome: string; meu: boolean; dados: typeof validos }[] = []
    for (const d of validos) {
      const forma = FORMA[d.obtencao_dado ?? ''] ?? 'circle'
      const meu = p.destacarRotulo != null && d.fonte === 'lcpetro' && d.rotulo === p.destacarRotulo
      const chave = `${d.fonte}|${forma}${meu ? '|meu' : ''}`
      let g = grupos.find((x) => x.chave === chave)
      if (!g) {
        const nome = meu ? `Esta amostra (${d.rotulo})` : d.fonte === 'lcpetro' ? 'LC PETRO' : `Literatura — ${d.obtencao_dado ?? 'sem informação'}`
        g = { chave, fonte: d.fonte, forma, nome, meu, dados: [] }
        grupos.push(g)
      }
      g.dados.push(d)
    }
    // LC PETRO por último: fica desenhado por cima da literatura
    return grupos.sort((a, b) => Number(a.meu) - Number(b.meu) || (a.fonte === b.fonte ? a.nome.localeCompare(b.nome) : a.fonte === 'lcpetro' ? 1 : -1))
  }, [p.pontos, eixoX, p.destacarRotulo])

  const semDados = p.pontos.length - series.reduce((s, g) => s + g.dados.length, 0)

  const escala = escalaLog(series.flatMap((g) => g.dados.map((d) => d.taxa_reacao_mol_m2_s as number)))

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--color-neutral-700)]">
        <label className="flex items-center gap-2 font-semibold">Eixo X
          <select className="input !w-auto !py-1.5" value={eixoX}
            onChange={(e) => setEixoX(e.target.value as EixoX)}>
            {Object.entries(EIXOS_X).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> taxa em escala log
        </label>
        {semDados > 0 && <span className="text-[12px] text-[var(--color-neutral-500)]">{semDados} ponto(s) sem valor neste eixo não aparecem</span>}
      </div>
      <div style={{ height: p.altura ?? 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 32, left: 24 }}>
            <CartesianGrid stroke={GRADE} />
            <XAxis dataKey={eixoX} type="number" name={EIXOS_X[eixoX]} domain={['auto', 'auto']}
              stroke={TEXTO} tick={{ fontSize: 12, fill: TEXTO }}
              label={{ value: EIXOS_X[eixoX], position: 'insideBottom', offset: -20, fill: TEXTO, fontSize: 12 }} />
            <YAxis dataKey="taxa_reacao_mol_m2_s" type="number" scale={log ? 'log' : 'linear'}
              domain={log ? escala.dominio : [0, 'auto']} ticks={log ? escala.marcas : undefined}
              tickFormatter={(v: number) => (log ? formatarLog(v) : v.toExponential(1))} stroke={TEXTO} width={64}
              tick={{ fontSize: 12, fill: TEXTO }}
              label={{ value: 'Taxa de reação (mol/m²·s)', angle: -90, position: 'insideLeft', fill: TEXTO, fontSize: 12, style: { textAnchor: 'middle' } }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<Dica />} />
            <Legend verticalAlign="top" height={36} content={() => <Legenda series={series} />} />
            {series.map((g) => (
              <Scatter key={g.chave} name={g.nome} data={g.dados} fill={COR[g.fonte]}
                fillOpacity={p.destacarRotulo != null && !g.meu ? 0.4 : 1}
                shape={g.meu
                  ? (m: { cx?: number; cy?: number }) => (
                    <g transform={`translate(${m.cx ?? 0},${m.cy ?? 0}) scale(1.6)`}><Simbolo forma={g.forma} cor={COR[g.fonte]} contorno={ESCURO} /></g>
                  )
                  : g.forma as 'circle'}
                stroke={FUNDO} strokeWidth={1} isAnimationActive={false} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-[12px] text-[var(--color-neutral-600)]">
        Cor: azul = literatura, laranja = LC PETRO. Formato: ● tabelado/medido, ■ medida na superfície,
        ▲ lido de gráfico (menos confiável), ◆ não catalogado.
      </figcaption>
    </figure>
  )
}

// legenda com o formato real de cada marcador; texto em cor neutra (a cor fica no símbolo)
function Legenda({ series }: { series: { chave: string; fonte: 'literatura' | 'lcpetro'; forma: string; nome: string; meu: boolean }[] }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-[var(--color-neutral-700)]">
      {series.map((g) => (
        <li key={g.chave} className="flex items-center gap-1">
          {g.meu
            ? <svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden><g transform="scale(1.4)"><Simbolo forma={g.forma} cor={COR[g.fonte]} contorno={ESCURO} /></g></svg>
            : <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden><Simbolo forma={g.forma} cor={COR[g.fonte]} /></svg>}
          {g.nome}
        </li>
      ))}
    </ul>
  )
}

function Simbolo({ forma, cor, contorno }: { forma: string; cor: string; contorno?: string }) {
  if (forma === 'square') return <rect x={-4} y={-4} width={8} height={8} fill={cor} stroke={contorno} />
  if (forma === 'triangle') return <path d="M0,-5 L5,4 L-5,4 Z" fill={cor} stroke={contorno} />
  if (forma === 'diamond') return <path d="M0,-5 L5,0 L0,5 L-5,0 Z" fill={cor} stroke={contorno} />
  return <circle r={4.5} fill={cor} stroke={contorno} />
}

function Dica(p: { active?: boolean; payload?: { payload: PontoRdaComparacao }[] }) {
  if (!p.active || !p.payload?.length) return null
  const d = p.payload[0].payload
  return (
    <div className="rounded-[10px] border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-lg">
      <div className="font-bold" style={{ color: d.fonte === 'lcpetro' ? 'var(--color-orange-700)' : 'var(--color-blue)' }}>{d.rotulo}</div>
      <div>{d.litologia} · {d.acido} {fmt(d.conc_m, 3)} M{d.aditivos ? ` + ${d.aditivos}` : ''}</div>
      <div>T nominal {fmt(d.temperatura_nominal_c, 0)} °C · {fmt(d.rotacao_rpm, 0)} rpm · √ω {fmt(d.raiz_omega, 3)}</div>
      <div>Taxa: <strong>{fmt(d.taxa_reacao_mol_m2_s, 3, true)}</strong> mol/(m²·s)</div>
      <div className="text-[var(--color-neutral-500)]">{d.obtencao_dado}</div>
    </div>
  )
}
