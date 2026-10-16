import type { FontePvbt, PontoPvbt } from '../../tipos/banco'
import { fmt } from '../../utils/formatacao'

export const COR_FONTE: Record<FontePvbt, string> = {
  Literatura: 'var(--grafico-serie-1)',
  LCPETRO: 'var(--grafico-serie-2)',
  Petrobras: 'var(--grafico-serie-3)',
}
export const ROTULO_FONTE: Record<FontePvbt, string> = { Literatura: 'Literatura', LCPETRO: 'LC PETRO', Petrobras: 'Petrobras' }

export const sistema = (p: PontoPvbt) =>
  [p.acido, p.conc_valor != null ? `${fmt(p.conc_valor, 3)} ${p.conc_unidade ?? ''}`.trim() : null,
   p.aditivo ? `+ ${p.aditivo}${p.aditivo_valor != null ? ` ${fmt(p.aditivo_valor, 3)} ${p.aditivo_unidade ?? ''}` : ''}` : null]
    .filter(Boolean).join(' ')

export const temperatura = (p: PontoPvbt) =>
  p.temperatura_nominal_c == null ? 'T não informada' : `${fmt(p.temperatura_nominal_c, 0)} °C`

/** Série = pontos da mesma curva PVbt × velocidade: mesma fonte/referência, rocha,
 *  sistema ácido, temperatura nominal, geometria nominal e faixa de permeabilidade. */
export function chaveSerie(p: PontoPvbt) {
  const origem = p.fonte === 'LCPETRO' ? `LCPETRO|${p.estudo ?? ''}` : `${p.fonte}|${p.id_referencia ?? ''}`
  return [origem, p.litologia, sistema(p), p.temperatura_nominal_c, p.dimensao_nominal_in, p.faixa_permeabilidade].join('|')
}

export function tituloSerie(p: PontoPvbt) {
  return `${p.litologia} · ${sistema(p)} · ${temperatura(p)}`
}

export function subtituloSerie(p: PontoPvbt) {
  const origem = p.fonte === 'LCPETRO' ? `LC PETRO${p.estudo ? ` · ${p.estudo}` : ''}`
    : `${p.id_referencia ?? ''} · ${p.referencia_autor ?? ''}`
  return [origem, p.dimensao_nominal_in ? `${p.dimensao_nominal_in} in` : null, p.faixa_permeabilidade, p.faixa_porosidade ? `φ ${p.faixa_porosidade}` : null]
    .filter(Boolean).join(' · ')
}
