import { describe, expect, it } from 'vitest'
import { ensaiosDaFinalidade, finalidadeDosEnsaios, partesDaFinalidade } from './finalidade'
import { marcasDeCoreflooding, rotuloFinalidade } from './controleRochas'

describe('finalidade da amostra com um ou vários ensaios', () => {
  it('ida e volta: chaves -> texto -> chaves, na ordem das abas', () => {
    const texto = finalidadeDosEnsaios(['rda', 'petrofisica', 'coreflooding'])
    expect(texto).toBe('Petrofísica, coreflooding, RDA')
    expect(ensaiosDaFinalidade(texto)).toEqual(['petrofisica', 'coreflooding', 'rda'])
  })

  it('lê o vocabulário antigo do controle de rochas (um só valor)', () => {
    expect(ensaiosDaFinalidade('coreflooding')).toEqual(['coreflooding'])
    expect(ensaiosDaFinalidade('RDA')).toEqual(['rda'])
    expect(ensaiosDaFinalidade('texto livre qualquer')).toEqual([])
    expect(ensaiosDaFinalidade(null)).toEqual([])
    expect(partesDaFinalidade('a; b + c , d')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('rótulo e marcas de coreflooding entendem a lista', () => {
    expect(rotuloFinalidade('Petrofísica, coreflooding, RDA')).toBe('Petrofísica, Plug · coreflooding, Disco · RDA')
    expect(rotuloFinalidade('RDA')).toBe('Disco · RDA')
    expect(marcasDeCoreflooding({ finalidade: 'Petrofísica, coreflooding', status: 'utilizada' }, null)).toBe('utilizada')
    expect(marcasDeCoreflooding({ finalidade: 'Petrofísica, RDA', status: 'utilizada' }, null)).toBeNull()
  })
})
