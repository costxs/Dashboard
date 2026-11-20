// Entrada das massas da Dissolução Estática (4 estágios × triplicata), no formato do caderno
// do laboratório: um bloco por estágio, uma linha por réplica, com Δm e perda ao vivo.
import React, { useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatarTempoMinSeg, type ResumoEstagio } from '../../importador/planilhaReatividade'
import type { ModoCalculoPct } from '../../tipos/banco'
import type { CelulaPontoForm } from './DissolucaoEstaticaPanel'

const NOMES = ['Original', 'Duplicata', 'Triplicata'] as const
const CAMPOS = ['massa_inicial_g', 'massa_final_g'] as const
type Campo = (typeof CAMPOS)[number]

type Tempos = [number, number, number, number]

interface Props {
  grade: Record<string, CelulaPontoForm>
  setGrade: React.Dispatch<React.SetStateAction<Record<string, CelulaPontoForm>>>
  tempos: Tempos
  setTempos: React.Dispatch<React.SetStateAction<Tempos>>
  resumo: ResumoEstagio[]
  modo: ModoCalculoPct
}

function num(s: string | undefined): number | null {
  const t = (s ?? '').trim().replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function fmt(v: number | null | undefined, casas: number): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/** Ordem de digitação: T1 Original, T1 Duplicata, T1 Triplicata, T2 Original… */
const ORDEM = ([1, 2, 3, 4] as const).flatMap((est) => ([1, 2, 3] as const).map((rep) => `${est}-${rep}`))

export const GradeDissolucao: React.FC<Props> = ({ grade, setGrade, tempos, setTempos, resumo, modo }) => {
  const caixa = useRef<HTMLDivElement | null>(null)

  const focar = (idx: number, col: number) => {
    const el = caixa.current?.querySelector<HTMLInputElement>(`[data-celula="${idx}-${col}"]`)
    if (el) {
      el.focus()
      el.select()
    }
  }

  const mudar = (chave: string, campo: Campo, valor: string) =>
    setGrade((g) => ({ ...g, [chave]: { ...g[chave], [campo]: valor } }))

  // Colar do Excel: linhas descem pela ordem T1 Orig → T1 Dup → … ; colunas vão m₀ → m_f.
  const colar = (e: React.ClipboardEvent<HTMLInputElement>, idx: number, col: number) => {
    const texto = e.clipboardData.getData('text')
    if (!/[\t\r\n]/.test(texto.trim())) return
    e.preventDefault()
    const linhas = texto.replace(/\r/g, '').replace(/\n+$/, '').split('\n')
    setGrade((g) => {
      const novo = { ...g }
      linhas.forEach((linha, r) => {
        const chave = ORDEM[idx + r]
        if (!chave) return
        linha.split('\t').forEach((valor, c) => {
          const campo = CAMPOS[col + c]
          if (!campo) return
          novo[chave] = { ...novo[chave], [campo]: valor.trim() }
        })
      })
      return novo
    })
  }

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, col: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      focar(e.shiftKey ? idx - 1 : idx + 1, col)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focar(idx - 1, col)
    }
  }

  return (
    <div ref={caixa} className="space-y-3">
      {([1, 2, 3, 4] as const).map((est) => {
        const res = resumo[est - 1]
        const perda = modo === 'razao_medias' ? res.perda_razao_medias_pct : res.perda_media_replicas_pct
        return (
          <div key={est} className="rounded-xl border border-[var(--color-neutral-300)] overflow-hidden">
            {/* Cabeçalho do estágio: tempo de contato e resultado */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-blue-50)]/60 px-3.5 py-2 border-b border-[var(--color-neutral-200)]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-[var(--color-blue-900)]">
                  T{est} <span className="font-normal text-[var(--color-neutral-600)]">· {est * 25}% do t₅₀</span>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-neutral-700)]">
                  Tempo de contato
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tempos[est - 1]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.round(num(e.target.value) ?? 0))
                      setTempos((prev) => {
                        const next: Tempos = [...prev]
                        next[est - 1] = v
                        return next
                      })
                    }}
                    className="input !py-1 !px-2 !w-20 text-sm tabular-nums text-right"
                  />
                  s
                  <span className="text-[var(--color-neutral-500)]">({formatarTempoMinSeg(tempos[est - 1])})</span>
                </label>
              </div>
              <div className="text-sm tabular-nums">
                {res.n_replicas > 0 ? (
                  <>
                    <span className="text-[var(--color-neutral-600)] text-xs mr-1.5">Perda</span>
                    <strong className="text-[var(--color-blue-900)]">{fmt(perda, 2)}%</strong>
                    <span className="text-[var(--color-neutral-600)]"> ± {fmt(res.perda_dp_pct, 2)}%</span>
                    <span className="text-[10px] text-[var(--color-neutral-500)] ml-1.5">(n={res.n_replicas})</span>
                  </>
                ) : (
                  <span className="text-xs text-[var(--color-neutral-500)]">sem dados</span>
                )}
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--color-neutral-500)]">
                  <th className="text-left font-semibold px-3.5 py-1.5 w-[24%]">Réplica</th>
                  <th className="text-left font-semibold px-2 py-1.5">m₀ (g)</th>
                  <th className="text-left font-semibold px-2 py-1.5">m_f (g)</th>
                  <th className="text-right font-semibold px-2 py-1.5">Δm (g)</th>
                  <th className="text-right font-semibold px-3.5 py-1.5">Perda (%)</th>
                </tr>
              </thead>
              <tbody>
                {([1, 2, 3] as const).map((rep) => {
                  const chave = `${est}-${rep}`
                  const idx = ORDEM.indexOf(chave)
                  const cel = grade[chave]
                  const m0 = num(cel?.massa_inicial_g)
                  const mf = num(cel?.massa_final_g)
                  const completo = m0 != null && mf != null
                  const invalido = completo && (m0 <= 0 || mf >= m0)
                  const dm = completo && !invalido ? m0 - mf : null
                  const pct = dm != null ? (dm / m0!) * 100 : null
                  return (
                    <tr key={rep} className="border-t border-[var(--color-neutral-100)]">
                      <td className="px-3.5 py-1.5 text-[var(--color-neutral-700)] font-medium">{NOMES[rep - 1]}</td>
                      {CAMPOS.map((campo, col) => (
                        <td key={campo} className="px-2 py-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            data-celula={`${idx}-${col}`}
                            value={cel?.[campo] ?? ''}
                            onChange={(e) => mudar(chave, campo, e.target.value)}
                            onKeyDown={(e) => teclas(e, idx, col)}
                            onPaste={(e) => colar(e, idx, col)}
                            placeholder="0,0000"
                            className={`input !py-1.5 !px-2.5 text-sm tabular-nums w-full max-w-[140px] ${
                              invalido ? '!border-red-400 !bg-red-50' : ''
                            }`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--color-neutral-700)]">
                        {fmt(dm, 4)}
                      </td>
                      <td className="px-3.5 py-1.5 text-right tabular-nums font-semibold">
                        {invalido ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-red-700"
                            title="m_f precisa ser menor que m₀; esta réplica fica fora do cálculo"
                          >
                            <AlertTriangle size={13} /> m_f ≥ m₀
                          </span>
                        ) : (
                          fmt(pct, 2)
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
