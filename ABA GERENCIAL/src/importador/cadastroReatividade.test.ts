// Testes da lógica de cadastro de reatividade (sem banco). Valores fictícios.
import { describe, expect, it } from 'vitest'
import {
  acharSistemaIgual, ajusteLevich, concMassica, concMolar, lerComposicaoRocha, lerComposicaoSistema, paraCelsius,
  paraMolCm2s, paraPolegada, paraPsi, raizOmega, sistemaDosComponentes, taxaPelaCurvaCalcio, temperaturaNominal, validarSerie,
} from './cadastroReatividade'

const HCL = { massa_molar_g_mol: 36.46, coef_densidade: 0.005, n_equivalentes: 1 }

describe('unidades', () => {
  it('converte para °C, psi, polegada e mol/(cm²·s)', () => {
    expect(paraCelsius(212, '°F')).toBeCloseTo(100)
    expect(paraCelsius(323.15, 'K')).toBeCloseTo(50)
    expect(paraPsi(10, 'bar')).toBeCloseTo(145.04, 1)
    expect(paraPsi(1, 'MPa')).toBeCloseTo(145.04, 1)
    expect(paraPolegada(3.81, 'cm')).toBeCloseTo(1.5)
    expect(paraPolegada(25.4, 'mm')).toBeCloseTo(1)
    expect(paraMolCm2s(5e-2, 'mol/(m²·s)')).toBeCloseTo(5e-6)
    expect(paraMolCm2s(6e-4, 'mol/(cm²·min)')).toBeCloseTo(1e-5)
  })
})

describe('contas iguais às do banco', () => {
  it('temperatura nominal: 18 ≤ T < 30 vira 25, 30 fica 30', () => {
    expect([17, 18, 25.6, 29.9, 30, 62, 87.5, 93].map(temperaturaNominal)).toEqual([15, 25, 25, 25, 30, 60, 90, 95])
    expect(temperaturaNominal(null)).toBeNull()
  })
  it('concentração molar e mássica', () => {
    expect(concMolar(0.5, 'N', { ...HCL, n_equivalentes: 2 })).toBe(0.25)
    expect(concMolar(1, 'M', null)).toBe(1)
    const m = concMolar(15, 'wt%', HCL)!
    expect(m).toBeCloseTo((10 * 15 * (1 + 0.005 * 15)) / 36.46, 10)
    expect(concMassica(m, 'M', HCL)).toBeCloseTo(15, 8)          // ida e volta exata
    expect(concMolar(1, 'wt%', null)).toBeNull()                  // sem propriedades do fluido
  })
  it('√ω a partir da rotação', () => expect(raizOmega(100)).toBeCloseTo(3.236, 3))
})

describe('texto da composição', () => {
  it('formato da planilha com colchetes', () => {
    const r = lerComposicaoSistema('[HCl]=0,5 N [IC-A]= 1wt% [Solv-X]= 5 vol%')
    expect(r.componentes).toEqual([
      { componente: 'HCl', valor: 0.5, unidade: 'N' },
      { componente: 'IC-A', valor: 1, unidade: 'wt%' },
      { componente: 'Solv-X', valor: 5, unidade: 'vol%' },
    ])
    expect(r.problemas).toEqual([])
  })
  it('formato de artigo e avisos', () => {
    const r = lerComposicaoSistema('15 wt% HCl + IC 0.5 vol% + agente Y')
    expect(r.componentes.slice(0, 2)).toEqual([{ componente: 'HCl', valor: 15, unidade: 'wt%' }, { componente: 'IC', valor: 0.5, unidade: 'vol%' }])
    expect(r.componentes[2]).toMatchObject({ valor: null, unidade: null })
    expect(r.problemas.map((p) => p.severidade)).toEqual(['AVISO'])
    expect(lerComposicaoSistema('[HCl] = 10 %').problemas[0].mensagem).toMatch(/wt% ou vol%/)
    expect(lerComposicaoSistema('[A]=1 M [B]=1 M [C]=1 M [D]=1 M [E]=1 M').problemas.some((p) => p.severidade === 'ERRO')).toBe(true)
  })
  it('rocha com qualificador', () => {
    expect(lerComposicaoRocha('[Calcita] > 99 %')).toMatchObject({ calcita_pct: 99, calcita_qualificador: '>', dolomita_pct: null })
    expect(lerComposicaoRocha('[Dolomita] = 85% | [Calcita] = 15%')).toMatchObject({ calcita_pct: 15, dolomita_pct: 85, dolomita_qualificador: '=' })
    expect(lerComposicaoRocha('Dolomita ≈ 60,5 %, Ca/Mg 1,3')).toMatchObject({ dolomita_pct: 60.5, dolomita_qualificador: '~', razao_ca_mg: 1.3 })
  })
  it('acha sistema já cadastrado com a mesma composição (ordem e grafia diferentes)', () => {
    const existentes = [
      { id_sistema: 'SA01', ...sistemaDosComponentes([{ componente: 'HCl', valor: 15, unidade: 'wt%' }, { componente: 'IC', valor: 0.5, unidade: 'vol%' }]) },
    ]
    const novo = sistemaDosComponentes(lerComposicaoSistema('[IC]=0,5 vol% [hcl]=15 wt%').componentes)
    expect(acharSistemaIgual(existentes, novo)).toBe('SA01')
    expect(acharSistemaIgual(existentes, sistemaDosComponentes([{ componente: 'HCl', valor: 28, unidade: 'wt%' }]))).toBeNull()
  })
})

describe('validação da série', () => {
  const ids = { id_referencia: 'REF-R01', id_rocha: 'RCH-01', id_sistema: 'SA01' }
  const cond = { temperatura_c: 50, pressao_psi: 1000, tipo_variavel: 'rotação (RDA)' as const, metodo_quantificacao: 'RDA / ICP-AES', obtencao_dado: 'tabelado' as const, dim_h_in: 1.5, dim_d_in: 0.5 }
  it('série boa não tem problema', () => {
    expect(validarSerie(ids, cond, [{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 2e-6 }, { rotacao_rpm: 400, taxa_reacao_mol_cm2_s: 4e-6 }])).toEqual([])
  })
  it('acusa os casos que aparecem na planilha', () => {
    const pr = validarSerie(ids, { ...cond, temperatura_c: 250, dim_h_in: 5, obtencao_dado: 'lido de gráfico' },
      [{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 3e-66 }, { rotacao_rpm: null, taxa_reacao_mol_cm2_s: 2e-6 }, { rotacao_rpm: 100, taxa_reacao_mol_cm2_s: -1 }],
      [{ id_ensaio: 'LIT-0007', ...ids, temperatura_c: 250, rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 3e-66 }])
    const t = pr.map((p) => `${p.severidade}:${p.campo}:${p.ponto ?? ''}`)
    expect(t).toContain('AVISO:temperatura_c:')            // 250 °C → °F?
    expect(t).toContain('AVISO:dim_h_in:')                 // 5 in
    expect(t).toContain('AVISO:fonte_local:')              // lido de gráfico sem figura
    expect(t).toContain('AVISO:taxa_reacao_mol_cm2_s:1')   // 3e-66 fora da faixa
    expect(t).toContain('ERRO:taxa_reacao_mol_cm2_s:1')    // igual a LIT-0007
    expect(t).toContain('ERRO:rotacao_rpm:2')              // tipo rotação sem rotação
    expect(t).toContain('ERRO:taxa_reacao_mol_cm2_s:3')    // negativa
    expect(t).toContain('AVISO:rotacao_rpm:3')             // réplica de 100 rpm
  })
  it('a 2ª dimensão maior que a 1ª gera aviso de ordem', () => {
    expect(validarSerie(ids, { ...cond, dim_h_in: 0.4, dim_d_in: 1.5 }, [{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 2e-6 }]).map((p) => p.campo)).toEqual(['dim_d_in'])
  })
})

describe('Levich', () => {
  const rpms = [100, 200, 400, 800, 1600]
  it('taxa ∝ √ω pela origem = transporte', () => {
    const l = ajusteLevich(rpms.map((r) => ({ rotacao_rpm: r, taxa_reacao_mol_cm2_s: 1e-6 * raizOmega(r) })))!
    expect(l.regime).toBe('transporte'); expect(l.r2).toBeCloseTo(1); expect(l.intercepto).toBeCloseTo(0, 12)
  })
  it('taxa constante = reação de superfície; com intercepto grande = misto', () => {
    expect(ajusteLevich(rpms.map((r, i) => ({ rotacao_rpm: r, taxa_reacao_mol_cm2_s: 5e-6 * (1 + (i % 2) * 0.01) })))!.regime).toBe('reação de superfície')
    expect(ajusteLevich(rpms.map((r) => ({ rotacao_rpm: r, taxa_reacao_mol_cm2_s: 8e-6 + 3e-7 * raizOmega(r) })))!.regime).toBe('misto')
    expect(ajusteLevich([{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 1e-6 }])).toBeNull()
  })
})

describe('taxa pela curva de cálcio (ensaio do laboratório)', () => {
  it('inclinação × volume ÷ área', () => {
    const pts = [0, 2, 4, 6, 8, 10].map((t) => ({ tempo_min: t, ca_mg_l: 3 + 10 * t }))
    const r = taxaPelaCurvaCalcio(pts, 200, 1.5)!
    expect(r.inclinacao_mg_l_min).toBeCloseTo(10)
    expect(r.area_cm2).toBeCloseTo(11.401, 3)
    expect(r.taxa_mol_cm2_s / ((10 / 1000 / 40.078 / 60) * 0.2 / (Math.PI * 3.81 ** 2 / 4))).toBeCloseTo(1, 9)
    expect(r.r2).toBeCloseTo(1)
    expect(taxaPelaCurvaCalcio(pts.slice(0, 1), 200, 1.5)).toBeNull()
  })
})
