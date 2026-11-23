import { describe, expect, it } from 'vitest'
import { faixaDeTamanhos, filtrarAmostras, FILTROS_VAZIOS } from './bancoAmostras'

const lista = [
  { codigo: 'A', diametro_cm: 3.81, comprimento_cm: 7.6 },
  { codigo: 'B', diametro_cm: '2.54', comprimento_cm: 1.2 },
  { codigo: 'C', diametro_cm: null, comprimento_cm: null },
]
const cod = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarAmostras(lista, { ...FILTROS_VAZIOS, ...f }).map((a) => a.codigo)

describe('filtro de tamanho da amostra', () => {
  it('sem limite mantém todas, inclusive sem medida', () => expect(cod({})).toEqual(['A', 'B', 'C']))
  it('filtra por faixa de diâmetro, aceitando vírgula e limites inclusivos', () => {
    expect(cod({ diametroMin: '3,81' })).toEqual(['A'])
    expect(cod({ diametroMax: '2,54' })).toEqual(['B'])
  })
  it('combina diâmetro e comprimento e tira quem não tem a medida', () => {
    expect(cod({ diametroMin: '2', comprimentoMax: '5' })).toEqual(['B'])
  })
  it('informa a menor e a maior medida', () => {
    expect(faixaDeTamanhos(lista).diametro).toEqual({ min: 2.54, max: 3.81 })
  })
})
