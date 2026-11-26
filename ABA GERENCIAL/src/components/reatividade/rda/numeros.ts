// Números e cores das telas de RDA (vírgula decimal, notação científica).
import type { Aviso } from '../../../reatividade/calculoRda'

export const COR_LAB = '#eb6834'
export const COR_AZUL = '#2a78d6'
export const COR_CINZA = '#a3aab3'

/** "1,5" | "1.5" | "1e-7" -> número; vazio ou inválido -> null */
export function lerNumero(s: string | null | undefined): number | null {
  const t = (s ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** número -> texto do campo (vírgula decimal) */
export const paraCampo = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : String(v).replace('.', ','))

/** notação científica com vírgula: 5,992e-8 */
export function cient(v: number | null | undefined, casas = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toExponential(casas).replace('.', ',')
}

/** número com vírgula e no máximo `casas` casas */
export function num(v: number | null | undefined, casas = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

export const temErro = (avisos: Aviso[]) => avisos.some((a) => a.severidade === 'ERRO')
