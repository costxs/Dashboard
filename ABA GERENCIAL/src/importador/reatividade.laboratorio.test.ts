// Validação dos cálculos de Dissolução Estática contra as planilhas reais do laboratório
// (pasta "pasta reatividade": IL057 Blend, Dissolução Manipueira e calculoT50 Manipueira).
// Os valores esperados foram recalculados de forma independente a partir das massas e
// absorbâncias brutas. Onde a planilha original tem erro de fórmula, o teste documenta
// o valor correto (e não o da planilha).
import { describe, expect, it } from 'vitest'
import {
  calcularLogLog,
  calcularResumoEstagios,
  calcularT50,
  type PontoImportado,
} from './planilhaReatividade'

function pontos(
  massas: Array<Array<[number, number]>>, // [réplica][estágio] = [m0, mf]
  tempos: number[],
  abs?: number[][], // [réplica][estágio]
): PontoImportado[] {
  const out: PontoImportado[] = []
  massas.forEach((rep, r) =>
    rep.forEach(([m0, mf], e) =>
      out.push({
        estagio_ordem: (e + 1) as 1 | 2 | 3 | 4,
        fracao_t50: (e + 1) * 0.25,
        tempo_contato_s: tempos[e],
        replica: (r + 1) as 1 | 2 | 3,
        massa_inicial_g: m0,
        massa_final_g: mf,
        fator_diluicao_ca: 2250,
        abs_ca: abs?.[r]?.[e],
      }),
    ),
  )
  return out
}

describe('t50 — extrapolação linear do teste piloto (igual às planilhas)', () => {
  it('IL057: teste de 3 min dá t50 = 3,067 min e estágios 46/92/138/184 s', () => {
    const c = calcularT50(1.1954, 3, 0.6108)
    expect(c.t50Min).toBeCloseTo(3.0672, 3)
    expect(c.estagios.map((e) => e.tempo_contato_s)).toEqual([46, 92, 138, 184])
    // A planilha escreveu "3 min e 40 seg" para 3,0667 min (o correto é 3 min 04 s)
    // e o T4 foi executado com 220 s.
  })

  it('IL057: teste de 2 min dá t50 = 2,603 min', () => {
    expect(calcularT50(1.1791, 2, 0.7262).t50Min).toBeCloseTo(2.6034, 3)
  })

  it('Manipueira + HCl, HCl C/I e Blend batem com a planilha', () => {
    expect(calcularT50(1.1416, 5, 0.3418).t50Min).toBeCloseTo(3.5675, 2)
    expect(calcularT50(1.0716, 2, 0.525).t50Min).toBeCloseTo(1.9605, 3)
    expect(calcularT50(1.0429, 2, 0.6164).t50Min).toBeCloseTo(2.4447, 2)
  })

  it('usa a inclinação exata, sem o arredondamento do rótulo do Excel', () => {
    // T50 MANIPUEIRA 3 FERM: a planilha usa -0,00009 e dá 5713,33; exato = 5687,00
    const c = calcularT50(1.0284, 960, 0.9416)
    expect(c.taxaGMin).toBeCloseTo(-0.0000904167, 9)
    expect(c.t50Min).toBeCloseTo(5687.005, 3)
    expect(c.estagios[0].tempo_contato_s).toBe(85305)
    // Manipueira 1 FERM: a planilha usa -0,0002 e dá 2718,75
    expect(calcularT50(1.0875, 300, 1.034).t50Min).toBeCloseTo(3049.07, 1)
  })

  it('HCl S/I: a fórmula da planilha tem números errados, o sistema não a reproduz', () => {
    // planilha: (B5-2)/(-1,8) = 0,821; com os dados dela o valor é 1,133 min
    expect(calcularT50(1.043, 2, 0.1226).t50Min).toBeCloseTo(1.1332, 3)
  })
})

describe('Perda de massa — IL057 (triplicata)', () => {
  const massas: Array<Array<[number, number]>> = [
    [[1.1852, 0.9775], [1.1602, 0.7921], [1.2058, 0.6939], [1.2222, 0.5084]],
    [[1.1854, 0.9843], [1.1298, 0.7838], [1.1881, 0.6894], [1.1298, 0.4705]],
    [[1.1031, 0.9062], [1.1179, 0.759], [1.1776, 0.6787], [1.1928, 0.484]],
  ]
  const abs = [
    [0.0417626761, 0.0583844632, 0.0742382035, 0.118718266],
    [0.0385114588, 0.0547003932, 0.0748465583, 0.0899505615],
    [0.046951171, 0.0562651679, 0.0787058845, 0.0984256715],
  ]
  const res = calcularResumoEstagios(pontos(massas, [45, 91, 137, 220], abs), {
    hInicialMolL: 4.4,
    calCaSlope: 0.0383,
    calCaIntercept: 0.0037,
    massaMolarCa: 40.8, // valor usado na planilha (o correto é 40,078)
  })

  it('razão das médias = coluna "%" da planilha (ΣΔm/Σm0)', () => {
    expect(res.map((r) => r.perda_razao_medias_pct)).toEqual([
      expect.closeTo(17.4367, 3),
      expect.closeTo(31.4857, 3),
      expect.closeTo(42.2652, 3),
      expect.closeTo(58.7311, 3),
    ])
  })

  it('desvio padrão é das perdas % individuais (a planilha usa DP de Δm em g × 100)', () => {
    expect(res.map((r) => r.perda_dp_pct)).toEqual([
      expect.closeTo(0.4476, 3),
      expect.closeTo(0.769, 3),
      expect.closeTo(0.2549, 3),
      expect.closeTo(0.6032, 3),
    ])
  })

  it('[Ca²⁺] e [H⁺] por estágio batem com a aba "Ca e H+"', () => {
    const ca = [0.05574, 0.07595, 0.104, 0.14206]
    const h = [4.2885, 4.2481, 4.192, 4.1159]
    res.forEach((r, i) => {
      expect(r.ca_media_mol_l).toBeCloseTo(ca[i], 4)
      expect(r.h_media_mol_l).toBeCloseTo(h[i], 3)
    })
    expect(res[0].ca_dp_mol_l).toBeCloseTo(0.00613, 4)
    expect(res[3].h_dp_mol_l).toBeCloseTo(0.0426, 3)
  })
})

describe('Perda de massa — Manipueira + HCl (média das réplicas, como na planilha)', () => {
  const massas: Array<Array<[number, number]>> = [
    [[1.0215, 0.8052], [1.0219, 0.6636], [1.034, 0.5247], [1.0439, 0.4224]],
    [[1.048, 0.8325], [1.0414, 0.6624], [1.038, 0.5175], [1.0269, 0.3836]],
    [[1.0693, 0.8604], [1.0385, 0.6536], [1.0257, 0.5154], [1.062, 0.4183]],
  ]
  const res = calcularResumoEstagios(pontos(massas, [53, 106, 159, 212]), {
    hInicialMolL: 4.4,
    calCaSlope: 0.0383,
    calCaIntercept: 0.0037,
  })

  it('média das perdas individuais = AVERAGE da planilha', () => {
    expect(res.map((r) => r.perda_media_replicas_pct)).toEqual([
      expect.closeTo(20.4246, 3),
      expect.closeTo(36.1728, 3),
      expect.closeTo(49.7171, 3),
      expect.closeTo(60.9311, 3),
    ])
  })

  it('DP do T1 é 0,83 % (a planilha dá 10,2 % por causa da vírgula extra em STDEV.S(K5,K14,K23,))', () => {
    expect(res[0].perda_dp_pct).toBeCloseTo(0.828, 3)
    expect(res[1].perda_dp_pct).toBeCloseTo(1.0185, 3)
  })
})

describe('Gráfico log-log', () => {
  it('faz a média por estágio e o log10 de cada média', () => {
    const base = { estagio_ordem: 1 as const, fracao_t50: 0.25 }
    const [p] = calcularLogLog([
      { ...base, tempo_contato_s: 100, massa_inicial_g: 1, massa_final_g: 0.8 },
      { ...base, tempo_contato_s: 100, massa_inicial_g: 1.2, massa_final_g: 0.9 },
    ])
    expect(p.n).toBe(2)
    expect(p.m0_media_g).toBeCloseTo(1.1, 8)
    expect(p.mf_media_g).toBeCloseTo(0.85, 8)
    expect(p.log_tempo).toBeCloseTo(2, 8)
    expect(p.log_m0).toBeCloseTo(Math.log10(1.1), 8)
    expect(p.log_mf).toBeCloseTo(Math.log10(0.85), 8)
  })
})
