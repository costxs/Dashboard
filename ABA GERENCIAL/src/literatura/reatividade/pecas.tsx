// Peças comuns às telas de reatividade: busca de um registro existente, gráfico de Levich e lista de problemas.
import { useMemo, useState, type ReactNode } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Search, XCircle } from 'lucide-react'
import type { Levich, Problema } from '../../importador/cadastroReatividade'
import { dobra } from '../../importador/planilhaBdd'
import { fmt } from '../../utils/formatacao'

/** Campo de busca que vira um "cartão" com o item escolhido. */
export function Escolher<T>(p: {
  itens: T[]
  chave: (i: T) => string
  titulo: (i: T) => string
  detalhe?: (i: T) => string
  valor: string
  aoEscolher: (id: string) => void
  placeholder: string
  carregando?: boolean
}) {
  const [busca, setBusca] = useState('')
  const escolhido = p.valor ? p.itens.find((i) => p.chave(i) === p.valor) : undefined
  const achados = useMemo(() => {
    const b = dobra(busca)
    const lista = b ? p.itens.filter((i) => dobra(`${p.chave(i)} ${p.titulo(i)} ${p.detalhe?.(i) ?? ''}`).includes(b)) : p.itens
    return lista.slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, p.itens])

  if (p.valor) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--color-blue-200)] bg-[var(--color-blue-50)] px-4 py-3">
        <span className="tag tag-orange">{p.valor}</span>
        <span className="flex-1 min-w-[200px] text-[13px]">
          <strong className="text-[var(--color-blue-800)]">{escolhido ? p.titulo(escolhido) : 'carregando…'}</strong>
          {escolhido && p.detalhe?.(escolhido) && <span className="block text-[12px] text-[var(--color-neutral-600)]">{p.detalhe(escolhido)}</span>}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => p.aoEscolher('')}>Trocar</button>
      </div>
    )
  }
  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-500)]" />
        <input className="input !pl-9" placeholder={p.placeholder} value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="mt-2 max-h-[220px] overflow-auto rounded-[10px] border border-[var(--color-neutral-300)]">
        {p.carregando ? <p className="m-0 px-4 py-3 text-[13px] text-[var(--color-neutral-600)]">Carregando…</p>
          : achados.length === 0 ? <p className="m-0 px-4 py-3 text-[13px] text-[var(--color-neutral-600)]">Nada encontrado{busca ? ` para "${busca}"` : ''}.</p>
            : achados.map((i) => (
              <button key={p.chave(i)} type="button" onClick={() => { p.aoEscolher(p.chave(i)); setBusca('') }}
                className="flex w-full cursor-pointer items-baseline gap-3 border-b border-[var(--color-neutral-200)] px-4 py-2 text-left text-[13px] last:border-b-0 hover:bg-[var(--color-blue-50)]">
                <span className="w-[70px] shrink-0 font-bold text-[var(--color-red)]">{p.chave(i)}</span>
                <span>
                  <span className="font-semibold text-[var(--color-blue-800)]">{p.titulo(i)}</span>
                  {p.detalhe?.(i) && <span className="block text-[12px] text-[var(--color-neutral-600)]">{p.detalhe(i)}</span>}
                </span>
              </button>
            ))}
      </div>
      {!p.carregando && p.itens.length > achados.length && !busca && (
        <p className="m-0 mt-1 text-[11px] text-[var(--color-neutral-500)]">Mostrando {achados.length} de {p.itens.length}: digite para buscar.</p>
      )}
    </div>
  )
}

/** "Escolher existente | Cadastrar novo" */
export function Modo(p: { novo: boolean; aoMudar: (novo: boolean) => void; existente: string; criar: string }) {
  return (
    <div className="flex gap-2" role="radiogroup">
      {([[false, p.existente], [true, p.criar]] as const).map(([v, r]) => (
        <button key={r} type="button" role="radio" aria-checked={p.novo === v} onClick={() => p.aoMudar(v)}
          className={`btn btn-sm ${p.novo === v ? 'btn-blue' : 'btn-secondary'}`}>{r}</button>
      ))}
    </div>
  )
}

export interface PontoXY { x: number; y: number; rotulo?: string }
const COR_NOVO = '#c8102e'
const COR_BANCO = '#2a78d6'

/** Taxa × √ω: pontos da série (vermelho) + reta do ajuste; pontos já cadastrados (azul) para comparar. */
export function GraficoLevich(p: { pontos: PontoXY[]; existentes?: PontoXY[]; levich: Levich | null; altura?: number; rotuloExistentes?: string }) {
  const reta = useMemo(() => {
    if (!p.levich || p.pontos.length < 2) return []
    const xs = p.pontos.map((d) => d.x)
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    return [x0, x1].map((x) => ({ x, y: p.levich!.inclinacao * x + p.levich!.intercepto }))
  }, [p.levich, p.pontos])

  if (!p.pontos.length && !p.existentes?.length) {
    return <p className="m-0 rounded-[10px] border border-dashed border-[var(--color-neutral-300)] px-4 py-10 text-center text-[13px] text-[var(--color-neutral-600)]">
      O gráfico de Levich (taxa × √ω) aparece quando houver pontos com rotação e taxa.
    </p>
  }
  return (
    <figure className="m-0">
      <div style={{ height: p.altura ?? 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 22 }}>
            <CartesianGrid stroke="var(--grafico-grade)" />
            <XAxis dataKey="x" type="number" domain={[0, 'auto']} stroke="var(--grafico-texto)" tick={{ fontSize: 11, fill: 'var(--grafico-texto)' }}
              tickFormatter={(v: number) => fmt(v, 1)}
              label={{ value: '√ω (rad/s)^0,5', position: 'insideBottom', offset: -16, fill: 'var(--grafico-texto)', fontSize: 12 }} />
            <YAxis dataKey="y" type="number" domain={[0, 'auto']} stroke="var(--grafico-texto)" width={62}
              tick={{ fontSize: 11, fill: 'var(--grafico-texto)' }} tickFormatter={(v: number) => (v === 0 ? '0' : v.toExponential(1))}
              label={{ value: 'Taxa (mol/cm²·s)', angle: -90, position: 'insideLeft', fill: 'var(--grafico-texto)', fontSize: 12, style: { textAnchor: 'middle' } }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<DicaXY />} />
            {!!p.existentes?.length && <Scatter name="já cadastrados" data={p.existentes} fill={COR_BANCO} fillOpacity={0.75} isAnimationActive={false} />}
            {reta.length === 2 && (
              <Scatter name="ajuste" data={reta} line={{ stroke: COR_NOVO, strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} />
            )}
            <Scatter name="esta série" data={p.pontos} fill={COR_NOVO} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-neutral-700)]">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_NOVO }} /> esta série e a reta do ajuste</span>
        {!!p.existentes?.length && (
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_BANCO }} /> {p.rotuloExistentes ?? 'já cadastrados (mesma rocha e sistema)'}</span>
        )}
      </figcaption>
      {p.levich ? (
        <p className="m-0 mt-2 text-[12px] text-[var(--color-neutral-700)]">
          <strong className="text-[var(--color-blue-800)]">R² = {fmt(p.levich.r2, 3)}</strong> ({p.levich.n} pontos) · {p.levich.texto}.
        </p>
      ) : (
        <p className="m-0 mt-2 text-[12px] text-[var(--color-neutral-500)]">O ajuste de Levich precisa de pelo menos 3 pontos com rotação e taxa.</p>
      )}
    </figure>
  )
}

function DicaXY(p: { active?: boolean; payload?: { payload: PontoXY }[] }) {
  if (!p.active || !p.payload?.length) return null
  const d = p.payload[0].payload
  return (
    <div className="rounded-[10px] border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-lg">
      {d.rotulo && <div className="font-bold text-[var(--color-blue-800)]">{d.rotulo}</div>}
      <div>√ω {fmt(d.x, 3)} · taxa <strong>{fmt(d.y, 3, true)}</strong> mol/(cm²·s)</div>
    </div>
  )
}

/** Lista de ERROS (vermelho, bloqueiam) e AVISOS (laranja, só mostram). */
export function ListaProblemas({ problemas, vazio }: { problemas: Problema[]; vazio?: ReactNode }) {
  if (!problemas.length) return <>{vazio ?? null}</>
  const ordenados = [...problemas].sort((a, b) => Number(b.severidade === 'ERRO') - Number(a.severidade === 'ERRO'))
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
      {ordenados.map((pr, i) => {
        const erro = pr.severidade === 'ERRO'
        return (
          <li key={i} className="flex items-start gap-2" style={{ color: erro ? 'var(--color-red-700)' : 'var(--color-orange-700)' }}>
            {erro ? <XCircle size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
            <span>
              {pr.ponto != null && <strong>Ponto {pr.ponto}: </strong>}
              <span className="text-[var(--color-neutral-800)]">{pr.mensagem}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
