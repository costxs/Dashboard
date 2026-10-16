import { describe, expect, it } from 'vitest'
import {
  acharSistemaAcido, condicoesRdaDoControle, descreverCondicoes, marcasDeCoreflooding, rotuloFinalidade,
} from './controleRochas'

const SISTEMAS = [
  { id_sistema: 'SA01', componente_1: 'HCl', valor_1: 15, unidade_1: 'wt%', componente_2: 'IC' },
  { id_sistema: 'SA02', componente_1: 'HCl', valor_1: 15, unidade_1: 'wt%', componente_2: null },
  { id_sistema: 'SA03', componente_1: 'HCl', valor_1: 0.5, unidade_1: 'N', componente_2: null },
  { id_sistema: 'SA04', componente_1: 'Ácido acético', valor_1: 0.5, unidade_1: 'N', componente_2: null },
]

describe('sugestões do controle de rochas na ficha', () => {
  it('RDA102: HCl 15 % · 60 °C · 500 rpm, casando com o sistema sem aditivos', () => {
    const c = condicoesRdaDoControle('Utilização: TR - HCl [15%] - Sillurian - 60 °C @500')!
    expect(descreverCondicoes(c)).toBe('TR · HCl 15 % · 60 °C · 500 rpm')
    expect(acharSistemaAcido(SISTEMAS, c)?.id_sistema).toBe('SA02')
  })

  it('RDA101: HCl 0,5 M · 25 °C · 100 rpm; para HCl, M casa com N', () => {
    const c = condicoesRdaDoControle('disco íntegro · Utilização: TR - HCl [0,5M] - Indiana - 25 °C @100')!
    expect(descreverCondicoes(c)).toBe('TR · HCl 0,5 M · 25 °C · 100 rpm')
    expect([c.rotacao_rpm, c.temperatura_c]).toEqual([100, 25])
    expect(acharSistemaAcido(SISTEMAS, c)?.id_sistema).toBe('SA03')
    expect(acharSistemaAcido(SISTEMAS, { ...c, acido: 'Ácido acético', unidade: 'M' })).toBeNull()
    expect(acharSistemaAcido(SISTEMAS, { ...c, concentracao: 28 })).toBeNull()
  })

  it('sem texto de Utilização não há sugestão', () => {
    expect(condicoesRdaDoControle(null)).toBeNull()
    expect(condicoesRdaDoControle('Acidificada')).toBeNull()
    expect(condicoesRdaDoControle('Utilização: reserva')).toBeNull()
  })

  it('coreflooding: utilizada e/ou acidificada, só para amostra de coreflooding', () => {
    expect(marcasDeCoreflooding({ finalidade: 'coreflooding', status: 'utilizada' }, 'Acidificada')).toBe('utilizada/acidificada')
    expect(marcasDeCoreflooding({ finalidade: 'coreflooding', status: 'disponivel' }, 'acidificado em 2023')).toBe('acidificada')
    expect(marcasDeCoreflooding({ finalidade: 'coreflooding', status: 'disponivel' }, null)).toBeNull()
    expect(marcasDeCoreflooding({ finalidade: 'RDA', status: 'utilizada' }, null)).toBeNull()
    expect([rotuloFinalidade('RDA'), rotuloFinalidade('coreflooding'), rotuloFinalidade(null)]).toEqual(['Disco · RDA', 'Plug · coreflooding', null])
  })
})
