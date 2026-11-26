// Peças comuns das telas da dissolução dinâmica (RDA): números com vírgula, avisos do cálculo,
// cartões de resultado e os dois gráficos ([H⁺] × tempo e TR × √ω).
import React from 'react'
import { CartesianGrid, ErrorBar, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, XCircle } from 'lucide-react'
import { COR_AZUL, COR_CINZA, COR_LAB, cient, num } from './numeros'

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

const eixo = { stroke: 'var(--grafico-texto)', tick: { fontSize: 11, fill: 'var(--grafico-texto)' } }
const rotuloY = (value: string) => ({ value, angle: -90, position: 'insideLeft' as const, fill: 'var(--grafico-texto)', fontSize: 12, style: { textAnchor: 'middle' as const } })
const rotuloX = (value: string) => ({ value, position: 'insideBottom' as const, offset: -16, fill: 'var(--grafico-texto)', fontSize: 12 })

interface Dica { active?: boolean; payload?: readonly { payload?: Record<string, unknown> }[] }
const DicaPonto = (fx: (p: Record<string, unknown>) => React.ReactNode) => ({ active, payload }: Dica) =>
  active && payload?.length ? (
    <div className="rounded-md border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow">{fx(payload[0].payload ?? {})}</div>
  ) : null

/** [H⁺] × tempo de um disco: pontos da reta em azul, fora da janela em cinza, e a reta ajustada. */
export const GraficoHTempo: React.FC<{
  usados: { x: number; y: number }[]
  fora: { x: number; y: number }[]
  reta: { inclinacao: number; intercepto: number } | null
  rotuloY?: string
  altura?: number
}> = ({ usados, fora, reta, rotuloY: ry = '[H⁺] (mol/L)', altura = 280 }) => {
  const todos = [...usados, ...fora]
  if (!todos.length) return <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-500)]">O gráfico aparece com as leituras.</p>
  const xs = usados.map((p) => p.x)
  const linha = reta && xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)].map((x) => ({ x, y: reta.intercepto + reta.inclinacao * x })) : []
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 22 }}>
          <CartesianGrid stroke="var(--grafico-grade)" />
          <XAxis dataKey="x" type="number" domain={[0, 'auto']} {...eixo} tickFormatter={(v: number) => num(v, 0)} label={rotuloX('Tempo (s)')} />
          <YAxis dataKey="y" type="number" domain={['auto', 'auto']} {...eixo} width={66} tickFormatter={(v: number) => num(v, 4)} label={rotuloY(ry)} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={DicaPonto((p) => <>t = {num(p.x as number, 0)} s · [H⁺] = {num(p.y as number, 5)} mol/L</>)} />
          {linha.length === 2 && <Scatter data={linha} line={{ stroke: COR_LAB, strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} />}
          {fora.length > 0 && <Scatter data={fora} fill={COR_CINZA} isAnimationActive={false} />}
          <Scatter data={usados} fill={COR_AZUL} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

/** TR × √ω: média por rotação com barra de desvio, a reta (slope) e cada disco em cinza claro. */
export const GraficoLevichSerie: React.FC<{
  medias: { x: number; y: number; erro: number; rpm: number; n: number }[]
  discos: { x: number; y: number; codigo?: string }[]
  reta: { inclinacao: number; intercepto: number } | null
  altura?: number
}> = ({ medias, discos, reta, altura = 300 }) => {
  if (!medias.length) return <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-500)]">O gráfico aparece quando a série tiver discos com taxa.</p>
  const xs = medias.map((m) => m.x)
  const linha = reta ? [0, Math.max(...xs) * 1.05].map((x) => ({ x, y: reta.intercepto + reta.inclinacao * x })) : []
  return (
    <figure className="m-0">
      <div style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 22 }}>
            <CartesianGrid stroke="var(--grafico-grade)" />
            <XAxis dataKey="x" type="number" domain={[0, 'auto']} {...eixo} tickFormatter={(v: number) => num(v, 1)} label={rotuloX('√ω (rad/s)^0,5')} />
            <YAxis dataKey="y" type="number" domain={[0, 'auto']} {...eixo} width={66} tickFormatter={(v: number) => (v === 0 ? '0' : cient(v, 1))} label={rotuloY('TR (mol/cm²·s)')} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={DicaPonto((p) => (
              <>{p.codigo ? <>{String(p.codigo)} · </> : p.rpm != null ? <>{String(p.rpm)} rpm (n = {String(p.n)}) · </> : null}√ω = {num(p.x as number, 2)} · TR = {cient(p.y as number)}</>
            ))} />
            {discos.length > 0 && <Scatter data={discos} fill={COR_CINZA} fillOpacity={0.6} isAnimationActive={false} />}
            {linha.length === 2 && <Scatter data={linha} line={{ stroke: COR_LAB, strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} />}
            <Scatter data={medias} fill={COR_AZUL} isAnimationActive={false}>
              <ErrorBar dataKey="erro" direction="y" width={6} stroke={COR_AZUL} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-neutral-700)]">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_AZUL }} /> média por rotação ± desvio</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_CINZA }} /> cada disco</span>
        {linha.length === 2 && <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: COR_LAB }} /> reta TR × √ω</span>}
      </figcaption>
    </figure>
  )
}

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
