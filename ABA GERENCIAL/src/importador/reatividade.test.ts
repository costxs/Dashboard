import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  calcularGuiaRda,
  calcularRegressaoLinear,
  calcularResumoEstagios,
  calcularT50,
  desvioPadraoAmostral,
  lerPlanilhaReatividade,
  MASSA_MOLAR_CA_PADRAO,
  MASSA_MOLAR_MG_PADRAO,
} from './planilhaReatividade'

function workbookParaArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return bytes
}

describe('planilhaReatividade — cálculos de laboratório', () => {
  it('calcula m50, taxa, t50 e os 4 estágios (0.25..1.00 do t50)', () => {
    const r = calcularT50(4.0, 4.0, 2.0)
    expect(r.m50).toBeCloseTo(2.0, 6)
    expect(r.taxaGMin).toBeCloseTo(-0.5, 6)
    expect(r.t50Min).toBeCloseTo(4.0, 6)
    expect(r.t50Seg).toBe(240)
    expect(r.estagios.map((e) => e.tempo_contato_s)).toEqual([60, 120, 180, 240])
    expect(r.estagios[0].rotulo_tempo).toBe('1 min 00 s')
    expect(r.estagios[3].rotulo_tempo).toBe('4 min 00 s')
  })

  it('calcula desvio padrão amostral (ddof=1) e regressão linear y = m*x + b', () => {
    expect(desvioPadraoAmostral([10, 12, 14])).toBeCloseTo(2.0, 6)
    const reg = calcularRegressaoLinear([60, 120, 180, 240], [12, 24, 36, 48])
    expect(reg.m).toBeCloseTo(0.2, 6)
    expect(reg.b).toBeCloseTo(0.0, 6)
    expect(reg.r2).toBeCloseTo(1.0, 6)
  })

  it('calcula perda por média das réplicas, razão das médias, [Ca²⁺], [Mg²⁺] e [H+] residual', () => {
    const resumo = calcularResumoEstagios(
      [
        {
          estagio_ordem: 1,
          fracao_t50: 0.25,
          tempo_contato_s: 60,
          replica: 1,
          massa_inicial_g: 4.0,
          massa_final_g: 3.6, // 10%
          fator_diluicao_ca: 2000,
          abs_ca: 0.3867, // (0.3867 - 0.0037)/0.0383 = 10 mg/L -> *2000 = 20000 mg/L -> /40078 = 0.49903 mol/L
          fator_diluicao_mg: 1000,
          abs_mg: 0.1, // slope=0.02, intercept=0 -> 5 mg/L -> *1000 = 5000 mg/L -> /24305 = 0.20572 mol/L
        },
        {
          estagio_ordem: 1,
          fracao_t50: 0.25,
          tempo_contato_s: 60,
          replica: 2,
          massa_inicial_g: 5.0,
          massa_final_g: 4.0, // 20%
          fator_diluicao_ca: 2000,
          abs_ca: 0.3867,
          fator_diluicao_mg: 1000,
          abs_mg: 0.1,
        },
      ],
      {
        hInicialMolL: 4.4,
        calCaSlope: 0.0383,
        calCaIntercept: 0.0037,
        calMgSlope: 0.02,
        calMgIntercept: 0,
        massaMolarCa: MASSA_MOLAR_CA_PADRAO,
        massaMolarMg: MASSA_MOLAR_MG_PADRAO,
        incluirMg: true,
      },
    )

    const t1 = resumo[0]
    expect(t1.perda_media_replicas_pct).toBeCloseTo(15.0, 5)
    // Razão das médias: (0.4 + 1.0) / (4.0 + 5.0) = 1.4 / 9 = 15.5556%
    expect(t1.perda_razao_medias_pct).toBeCloseTo(15.555556, 4)
    const caEsperado = 20000 / (MASSA_MOLAR_CA_PADRAO * 1000)
    const mgEsperado = 5000 / (MASSA_MOLAR_MG_PADRAO * 1000)
    expect(t1.ca_media_mol_l).toBeCloseTo(caEsperado, 5)
    expect(t1.mg_media_mol_l).toBeCloseTo(mgEsperado, 5)
    expect(t1.h_media_mol_l).toBeCloseTo(4.4 - 2 * (caEsperado + mgEsperado), 5)
  })

  it('gera guia de tempo seguro decrescente por rotação (RPM) para RDA', () => {
    const guia = calcularGuiaRda(4.0, null)
    expect(guia.length).toBeGreaterThanOrEqual(4)
    expect(guia[0].tempoSeguroMaxS).toBeGreaterThan(guia[guia.length - 1].tempoSeguroMaxS)
  })
})

describe('planilhaReatividade — importação Excel padronizado e legado', () => {
  it('importa o formato padronizado 1_Entrada_Pesquisador e recalcula estágios', () => {
    const wb = XLSX.utils.book_new()
    const matriz: unknown[][] = Array.from({ length: 22 }, () => Array(12).fill(''))
    matriz[3][0] = 'Código do Ensaio'
    matriz[3][1] = 'REA-9999'
    matriz[8][0] = 'Litologia'
    matriz[8][1] = 'dolomita'
    matriz[10][0] = '[H+] inicial (mol/L)'
    matriz[10][1] = 4.2

    // Sondagem linha 6 (índice 5), colunas E..J (índices 4..9)
    matriz[5][4] = 'Teste 1'
    matriz[5][5] = 'MP-A'
    matriz[5][6] = 4.0
    matriz[5][7] = 4.0
    matriz[5][8] = 2.0
    matriz[5][9] = 'SIM'

    // Pontos linha 18 (índice 17), colunas B..K (índices 1..10)
    matriz[17][1] = 'T1'
    matriz[17][2] = 0.25
    matriz[17][3] = 'Original'
    matriz[17][4] = 'MP-T1-1'
    matriz[17][5] = 4.1
    matriz[17][6] = 3.6
    matriz[17][7] = 2250
    matriz[17][8] = 0.25
    matriz[17][9] = 100
    matriz[17][10] = 0.08

    // Linha inválida (mf >= m0) deve gerar erro
    matriz[18][1] = 'T1'
    matriz[18][2] = 0.25
    matriz[18][3] = 'Duplicata'
    matriz[18][5] = 4.0
    matriz[18][6] = 4.2

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matriz), '1_Entrada_Pesquisador')
    const res = lerPlanilhaReatividade(workbookParaArrayBuffer(wb))

    expect(res.metadados.litologia).toBe('dolomita')
    expect(res.metadados.h_inicial_mol_l).toBe(4.2)
    expect(res.sondagens).toHaveLength(1)
    expect(res.sondagens[0].escolhido).toBe(true)
    expect(res.pontos).toHaveLength(1)
    expect(res.pontos[0].tempo_contato_s).toBe(60)
    expect(res.pontos[0].abs_ca).toBe(0.25)
    expect(res.pontos[0].abs_mg).toBe(0.08)
    expect(res.erros.length).toBe(1)
  })

  it('importa planilha legada (T50 + Perda de Massa + Ca e H+) e alerta divergência de tempo digitado', () => {
    const wb = XLSX.utils.book_new()
    const abaT50 = [
      ['Teste', 'm0 (g)', 'Tempo (min)', 'mf (g)'],
      ['Teste 1', 4.0, 2, 3.1],
      ['Teste 2', 4.0, 4, 2.0], // t50 = 4.0 min -> T1 = 60s, T2 = 120s, T3 = 180s, T4 = 240s
    ]
    const abaPerda = [
      ['Estágio', 'Tempo', 'm0_1', 'mf_1', 'm0_2', 'mf_2', 'm0_3', 'mf_3'],
      ['T1', '1 min 30 s', 4.1, 3.6, 4.0, 3.5, 4.2, 3.7], // digitado 90s vs exato 60s -> gera aviso!
      ['T2', '2 min 00 s', 4.0, 3.0, 4.1, 3.1, 4.0, 3.0],
    ]
    const abaAA = [
      ['Estágio', 'Réplica', 'FD Ca', 'ABS Ca'],
      ['T1', 'Original', 2250, 0.21],
      ['T1', 'Duplicata', 2250, 0.22],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaT50), 'T50 Piloto')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaPerda), 'Perda de Massa')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abaAA), 'Ca e H+')

    const res = lerPlanilhaReatividade(workbookParaArrayBuffer(wb))
    expect(res.erros).toHaveLength(0)
    expect(res.sondagens).toHaveLength(2)
    expect(res.pontos).toHaveLength(6)
    expect(res.pontos[0].tempo_contato_s).toBe(60)
    expect(res.pontos[0].abs_ca).toBe(0.21)
    expect(res.avisos.some((a) => a.includes('difere do t50 exato'))).toBe(true)
  })
})
