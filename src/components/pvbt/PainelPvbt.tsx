import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Focus } from 'lucide-react'
import { Select } from '../ui/Select'
import { Simbolos } from '../ui/Simbolos'
import { Aviso, Carregando, Cartao } from '../ui/base'
import { fmt } from '../../utils/formatacao'
import type { FontePvbt, PontoPvbt } from '../../tipos/banco'
import { GraficoPvbt } from './GraficoPvbt'
import { COR_FONTE, ROTULO_FONTE, chaveSerie, sistema, subtituloSerie, temperatura, tituloSerie } from './seriesPvbt'

const TODOS = 'Todos'
type Agrup = 'serie' | 'fonte' | 'litologia' | 'acido' | 'temperatura' | 'permeabilidade' | 'geometria'
const AGRUPAMENTOS: [Agrup, string][] = [
  ['serie', 'Série (curva)'], ['fonte', 'Fonte / referência'], ['litologia', 'Litotipo'], ['acido', 'Sistema ácido'],
  ['temperatura', 'Temperatura'], ['permeabilidade', 'Faixa de k'], ['geometria', 'Geometria'],
]

function grupoDe(p: PontoPvbt, a: Agrup): [string, string, string?] {
  switch (a) {
    case 'serie': return [chaveSerie(p), tituloSerie(p), subtituloSerie(p)]
    case 'fonte': return p.fonte === 'LCPETRO' ? ['LCPETRO', 'LC PETRO (bancada)'] : [`${p.fonte}|${p.id_referencia}`, `${p.referencia_autor ?? p.id_referencia}`, `${ROTULO_FONTE[p.fonte]} · ${p.id_referencia}`]
    case 'litologia': return [p.litologia, p.litologia]
    case 'acido': return [sistema(p), sistema(p) || 'Sistema não informado']
    case 'temperatura': return [String(p.temperatura_nominal_c), temperatura(p)]
    case 'permeabilidade': return [p.faixa_permeabilidade ?? '?', p.faixa_permeabilidade ?? 'k não informada']
    case 'geometria': return [p.dimensao_nominal_in ?? '?', p.dimensao_nominal_in ? `${p.dimensao_nominal_in} in (D × L)` : 'Geometria não informada']
  }
}

/** Base de PVbt: filtros, gráfico PVbt × velocidade e os ensaios agrupados. */
export function PainelPvbt({ pontos, carregando, erro, fontesIniciais, aoAbrirAmostra }: {
  pontos: PontoPvbt[] | null; carregando: boolean; erro: string | null
  /** fontes marcadas ao abrir (padrão: todas) */
  fontesIniciais?: Partial<Record<FontePvbt, boolean>>
  aoAbrirAmostra?: (amostraUuid: string) => void
}) {
  const [fontes, setFontes] = useState<Record<FontePvbt, boolean>>({ LCPETRO: true, Literatura: true, Petrobras: true, ...fontesIniciais })
  const [f, setF] = useState({ litologia: TODOS, acido: TODOS, temperatura: TODOS, permeabilidade: TODOS, geometria: TODOS })
  const [agrup, setAgrup] = useState<Agrup>('serie')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [destaque, setDestaque] = useState<string | null>(null)

  const todos = useMemo(() => pontos ?? [], [pontos])
  const opcoes = (fn: (p: PontoPvbt) => string | null) => [...new Set(todos.map(fn).filter((x): x is string => !!x))].sort()
  const filtrados = useMemo(() => todos.filter((p) => fontes[p.fonte]
    && (f.litologia === TODOS || p.litologia === f.litologia)
    && (f.acido === TODOS || p.acido === f.acido)
    && (f.temperatura === TODOS || String(p.temperatura_nominal_c) === f.temperatura)
    && (f.permeabilidade === TODOS || p.faixa_permeabilidade === f.permeabilidade)
    && (f.geometria === TODOS || p.dimensao_nominal_in === f.geometria)), [todos, fontes, f])

  const grupos = useMemo(() => {
    const m = new Map<string, { chave: string; titulo: string; sub?: string; linhas: PontoPvbt[] }>()
    for (const p of filtrados) {
      const [chave, titulo, sub] = grupoDe(p, agrup)
      const g = m.get(chave) ?? { chave, titulo, sub, linhas: [] }
      g.linhas.push(p); m.set(chave, g)
    }
    const lista = [...m.values()]
    for (const g of lista) g.linhas.sort((a, b) => (a.vel_intersticial_cm_min ?? 0) - (b.vel_intersticial_cm_min ?? 0))
    return lista.sort((a, b) => b.linhas.length - a.linhas.length || a.titulo.localeCompare(b.titulo))
  }, [filtrados, agrup])

  if (carregando && !pontos) return <Carregando />
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  const temp = opcoes((p) => (p.temperatura_nominal_c == null ? null : String(p.temperatura_nominal_c))).sort((a, b) => Number(a) - Number(b))
  const alternar = (k: string) => setAbertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div className="flex flex-col gap-6">
      <Cartao titulo="PVbt × velocidade de injeção" subtitulo="Ensaios de coreflooding do LC PETRO, da literatura e da Petrobras (esta só para quem tem acesso)"
        acoes={filtrados.length > 0 ? <button className="btn btn-secondary" onClick={() => baixarCsv(filtrados)}><Download size={14} /> CSV</button> : undefined}>
        <div className="flex flex-wrap items-center gap-4 px-6 pt-5 text-[13px]">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-neutral-600)]">Fontes</span>
          {(['LCPETRO', 'Literatura', 'Petrobras'] as FontePvbt[]).map((x) => {
            const n = todos.filter((p) => p.fonte === x).length
            if (!n) return null
            return (
              <label key={x} className="flex items-center gap-1.5 font-semibold text-[var(--color-neutral-700)]">
                <input type="checkbox" checked={fontes[x]} onChange={(e) => setFontes({ ...fontes, [x]: e.target.checked })} />
                <svg width="10" height="10" viewBox="-5 -5 10 10" aria-hidden><circle r={4.5} fill={COR_FONTE[x]} /></svg>
                {ROTULO_FONTE[x]} ({n})
              </label>
            )
          })}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 px-6 pt-4">
          <Select label="Litotipo" value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })} options={[TODOS, ...opcoes((p) => p.litologia)]} />
          <Select label="Ácido" value={f.acido} onChange={(v) => setF({ ...f, acido: v })} options={[TODOS, ...opcoes((p) => p.acido)]} />
          <Select label="Temperatura nominal" value={f.temperatura} onChange={(v) => setF({ ...f, temperatura: v })}
            options={[TODOS, ...temp]} rotulos={Object.fromEntries(temp.map((t) => [t, `${t} °C`]))} />
          <Select label="Permeabilidade" value={f.permeabilidade} onChange={(v) => setF({ ...f, permeabilidade: v })} options={[TODOS, ...opcoes((p) => p.faixa_permeabilidade)]} />
          <Select label="Geometria (D×L in)" value={f.geometria} onChange={(v) => setF({ ...f, geometria: v })} options={[TODOS, ...opcoes((p) => p.dimensao_nominal_in)]} />
        </div>
        <div className="p-6">
          {filtrados.length ? <GraficoPvbt pontos={filtrados} destaque={destaque} aoAbrirAmostra={aoAbrirAmostra} /> : <p className="m-0 py-10 text-center text-[13px] text-[var(--color-neutral-600)]">Nenhum ensaio com esses filtros.</p>}
        </div>

        <div className="border-t border-[var(--color-neutral-300)] px-6 pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--color-neutral-600)] mr-1">Agrupar por</span>
            {AGRUPAMENTOS.map(([k, r]) => (
              <button key={k} onClick={() => { setAgrup(k); setAbertos(new Set()); setDestaque(null) }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${agrup === k
                  ? 'bg-[var(--color-orange)] border-[var(--color-orange)] text-white'
                  : 'bg-white border-[var(--color-neutral-300)] text-[var(--color-neutral-700)] hover:border-[var(--color-orange)] hover:text-[#a85200]'}`}>{r}</button>
            ))}
          </div>
          <p className="m-0 mb-3 text-[12px] text-[var(--color-neutral-600)]">
            <strong className="text-[var(--color-blue-800)]">{grupos.length}</strong> grupo(s) · <strong className="text-[var(--color-blue-800)]">{filtrados.length}</strong> ensaio(s).
            {agrup === 'serie' && ' Cada série é uma curva: mesma rocha, sistema ácido, temperatura e geometria, variando a velocidade. Use "destacar" para vê-la no gráfico.'}
          </p>
          <div className="flex flex-col gap-2.5">
            {grupos.map((g) => (
              <Grupo key={g.chave} g={g} serie={agrup === 'serie'} aberto={abertos.has(g.chave)} onAlternar={() => alternar(g.chave)} aoAbrirAmostra={aoAbrirAmostra}
                destacada={destaque === g.chave} onDestacar={() => setDestaque(destaque === g.chave ? null : g.chave)} />
            ))}
          </div>
        </div>
      </Cartao>
    </div>
  )
}

function Grupo({ g, serie, aberto, onAlternar, destacada, onDestacar, aoAbrirAmostra }: {
  g: { chave: string; titulo: string; sub?: string; linhas: PontoPvbt[] }; serie: boolean
  aberto: boolean; onAlternar: () => void; destacada: boolean; onDestacar: () => void
  aoAbrirAmostra?: (amostraUuid: string) => void
}) {
  const comPvbt = g.linhas.filter((l) => l.pvbt != null && l.vel_intersticial_cm_min != null)
  const otimo = comPvbt.reduce<PontoPvbt | null>((m, l) => (!m || (l.pvbt as number) < (m.pvbt as number) ? l : m), null)
  const vs = g.linhas.map((l) => l.vel_intersticial_cm_min).filter((v): v is number => v != null)
  const fontes = [...new Set(g.linhas.map((l) => l.fonte))]
  return (
    <div className={`border rounded-[12px] bg-white ${destacada ? 'border-[var(--color-orange)] shadow-sm' : aberto ? 'border-[var(--color-blue-200)]' : 'border-[var(--color-neutral-300)]'}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <button onClick={onAlternar} className="flex flex-1 min-w-[260px] items-center gap-3 text-left">
          <span className="text-[var(--color-blue)]">{aberto ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</span>
          <span>
            <span className="flex items-center gap-2 text-[14px] font-bold text-[var(--color-blue-800)]">
              {fontes.map((f) => <svg key={f} width="10" height="10" viewBox="-5 -5 10 10" aria-label={ROTULO_FONTE[f]}><circle r={4.5} fill={COR_FONTE[f]} /></svg>)}
              {g.titulo}
            </span>
            {g.sub && <span className="block mt-0.5 text-[12px] text-[var(--color-neutral-600)]">{g.sub}</span>}
          </span>
        </button>
        <Resumo rotulo="ensaios" valor={String(g.linhas.length)} />
        <Resumo rotulo="v intersticial (cm/min)" valor={vs.length ? (vs.length === 1 ? fmt(vs[0], 3) : `${fmt(Math.min(...vs), 3)}–${fmt(Math.max(...vs), 3)}`) : '—'} />
        <Resumo rotulo={serie ? 'PVbt mínimo (ótimo)' : 'menor PVbt'} valor={otimo ? `${fmt(otimo.pvbt, 3)} @ ${fmt(otimo.vel_intersticial_cm_min, 3)}` : '—'} />
        {serie && <MiniCurva linhas={comPvbt} cor={COR_FONTE[g.linhas[0].fonte]} />}
        {serie && (
          <button onClick={onDestacar} className={`btn !py-1.5 ${destacada ? 'btn-blue' : 'btn-secondary'}`}><Focus size={14} /> {destacada ? 'destacada' : 'destacar'}</button>
        )}
      </div>
      {aberto && (
        <div className="border-t border-[var(--color-neutral-300)] px-4 pb-2 overflow-x-auto">
          <table className="table text-[12px]">
            <thead><tr>{['Ensaio', 'Amostra', ...(serie ? [] : ['Rocha', 'Sistema', 'T']), 'φ (%)', 'k (mD)', 'Vazão (mL/min)', 'v interst. (cm/min)', 'PVbt', 'Condição', 'Lwh (cm)', 'Dado'].map((c) => <th key={c}><Simbolos>{c}</Simbolos></th>)}</tr></thead>
            <tbody>
              {g.linhas.map((l) => (
                <tr key={l.id_experimento} className="lcp-row">
                  <td className="!py-1.5 whitespace-nowrap font-bold text-[var(--color-blue-800)]">{l.id_experimento}</td>
                  <td className="!py-1.5 whitespace-nowrap">
                    {aoAbrirAmostra && l.amostra_uuid
                      ? <button className="font-semibold text-[var(--color-blue)] underline-offset-2 hover:underline" title="Abrir amostra" onClick={() => aoAbrirAmostra(l.amostra_uuid as string)}>{l.id_amostra}</button>
                      : l.id_amostra}
                  </td>
                  {!serie && <><td className="!py-1.5">{l.litologia}</td><td className="!py-1.5 whitespace-nowrap">{sistema(l)}</td><td className="!py-1.5 whitespace-nowrap">{temperatura(l)}</td></>}
                  <td className="!py-1.5 tabular-nums">{fmt(l.porosidade_pct, 2)}</td>
                  <td className="!py-1.5 tabular-nums">{fmt(l.k_inicial_md, 3)}</td>
                  <td className="!py-1.5 tabular-nums">{fmt(l.vazao_ml_min, 3)}</td>
                  <td className="!py-1.5 tabular-nums">{fmt(l.vel_intersticial_cm_min, 4)}</td>
                  <td className="!py-1.5 tabular-nums font-bold">{fmt(l.pvbt, 3)}</td>
                  <td className="!py-1.5">{l.pvbt_condicao ?? '—'}</td>
                  <td className="!py-1.5 tabular-nums whitespace-nowrap">{l.comprimento_wormhole_uct_cm != null || l.comprimento_wormhole_cm != null
                    ? `${fmt(l.comprimento_wormhole_uct_cm ?? l.comprimento_wormhole_cm, 2)}${l.lwh_referencia ? ` (${l.lwh_referencia})` : ''}` : '—'}</td>
                  <td className="!py-1.5">{l.obtencao_dado ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[90px]">
      <div className="font-heading font-bold text-[15px] text-[var(--color-blue-800)] tabular-nums whitespace-nowrap">{valor}</div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--color-neutral-600)]">{rotulo}</div>
    </div>
  )
}

/** mini-gráfico log-log PVbt × v da série, com o ponto ótimo marcado */
function MiniCurva({ linhas, cor }: { linhas: PontoPvbt[]; cor: string }) {
  const pts = linhas.map((l) => ({ x: Math.log10(l.vel_intersticial_cm_min as number), y: Math.log10(l.pvbt as number) })).sort((a, b) => a.x - b.x)
  const L = 120, A = 36, m = 4
  if (pts.length < 2) return <div className="w-[120px] text-center text-[11px] text-[var(--color-neutral-500)]">{pts.length ? '1 ponto' : 'sem PVbt'}</div>
  const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))]
  const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))]
  const px = (x: number) => m + ((x - x0) / (x1 - x0 || 1)) * (L - 2 * m)
  const py = (y: number) => A - m - ((y - y0) / (y1 - y0 || 1)) * (A - 2 * m)
  const imin = pts.reduce((k, p, i) => (p.y < pts[k].y ? i : k), 0)
  return (
    <svg width={L} height={A} viewBox={`0 0 ${L} ${A}`} aria-label="curva PVbt × velocidade">
      <rect width={L} height={A} rx="6" fill="#f1f5fb" />
      <polyline fill="none" stroke={cor} strokeWidth="1.5" strokeOpacity="0.6" points={pts.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')} />
      {pts.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={i === imin ? 3.6 : 2.6} fill={cor} stroke={i === imin ? '#0a1a38' : 'none'} />)}
    </svg>
  )
}

function baixarCsv(linhas: PontoPvbt[]) {
  const cols = Object.keys(linhas[0]) as (keyof PontoPvbt)[]
  const esc = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)
  const csv = [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c])).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'base_pvbt.csv'; a.click()
  URL.revokeObjectURL(url)
}
