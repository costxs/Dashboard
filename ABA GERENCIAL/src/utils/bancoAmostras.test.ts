import { describe, expect, it } from 'vitest'
import { agruparAmostras, dimensoes, filtrarAmostras, FILTROS_VAZIOS, fluidoDe, opcoesDeFiltro, tituloPrefixo } from './bancoAmostras'

const A = [
  { codigo: 'RDA101', tipo_amostra: 'disco', prefixo: 'RDA', significado_prefixo: 'Disco para ensaio de RDA', fluidos: 'HCl 0,5M (previsto)', diametro_cm: 3.81, comprimento_cm: 1.2, litologia: 'Indiana Limestone', status: 'disponivel' },
  { codigo: 'IL076', tipo_amostra: 'plug', prefixo: 'IL', significado_prefixo: 'Indiana Limestone', fluidos: 'HCl 15 wt% · EDTA 0,25 M', diametro_cm: 3.79, comprimento_cm: 7.61, litologia: 'Indiana Limestone', status: 'utilizada' },
  { codigo: 'cf102', tipo_amostra: 'plug', prefixo: 'cf', significado_prefixo: null, fluidos: null, diametro_cm: null, comprimento_cm: 7, litologia: 'Morro do Chaves', status: 'disponivel' },
  { codigo: '0042', tipo_amostra: null, prefixo: null, significado_prefixo: null, fluidos: '', diametro_cm: 2, comprimento_cm: 2, litologia: 'Dolomita', status: 'arquivada' },
]

describe('banco de amostras organizado', () => {
  it('agrupa por tipo e por prefixo, com título e contagem', () => {
    const g = agruparAmostras(A)
    expect(g.map((x) => `${x.titulo} (${x.total})`)).toEqual(['Plugs · coreflooding (2)', 'Discos · RDA (1)', 'Outras (1)'])
    expect(g[0].prefixos.map((p) => `${tituloPrefixo(p)} (${p.amostras.length})`))
      .toEqual(['CF — significado não cadastrado (1)', 'IL — Indiana Limestone (1)'])
    expect(tituloPrefixo(g[2].prefixos[0])).toBe('Sem prefixo')
  })

  it('escreve as dimensões em pt-BR, com Ø para disco', () => {
    expect(A.map(dimensoes)).toEqual(['Ø 3,81 × 1,2 cm', '3,79 × 7,61 cm', '—', '2 × 2 cm'])
  })

  it('separa o fluido previsto do realizado', () => {
    expect(fluidoDe(A[0])).toEqual({ texto: 'HCl 0,5M', previsto: true })
    expect(fluidoDe(A[1])).toEqual({ texto: 'HCl 15 wt% · EDTA 0,25 M', previsto: false })
    expect(fluidoDe(A[2])).toBeNull()
  })

  it('filtra por tipo, prefixo, litotipo, status e fluido', () => {
    const cod = (f: Partial<typeof FILTROS_VAZIOS>) => filtrarAmostras(A, { ...FILTROS_VAZIOS, ...f }).map((a) => a.codigo)
    expect(cod({})).toHaveLength(4)
    expect(cod({ tipo: 'plug' })).toEqual(['IL076', 'cf102'])
    expect(cod({ tipo: 'outro' })).toEqual(['0042'])
    expect(cod({ prefixo: 'CF' })).toEqual(['cf102'])
    expect(cod({ litologia: 'Indiana Limestone', status: 'utilizada' })).toEqual(['IL076'])
    expect(cod({ fluido: 'EDTA 0,25 M' })).toEqual(['IL076'])
    expect(opcoesDeFiltro(A)).toEqual({
      prefixos: ['CF', 'IL', 'RDA'],
      litologias: ['Dolomita', 'Indiana Limestone', 'Morro do Chaves'],
      fluidos: ['EDTA 0,25 M', 'HCl 0,5M', 'HCl 15 wt%'],
    })
  })
})
