import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { dataDCI, detectarEquipamento, lerNomeProjeto } from './lerDCI'
import { lerEnsaiosEquipamento } from './lerEnsaioEquipamento'
import { separarEtapas, tratarPermeabilidade } from './tratamentoPermeabilidade'
import { tratarAcidificacao } from './tratamentoAcidificacao'

const bruta = async (nome: string) => {
  const f = readFileSync(new URL(`./${nome}`, import.meta.url))
  return lerArquivoBruto(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer)
}
const A = Math.PI * 2.54 ** 2 / 4, L = 2 * 2.54, VP = A * L * 0.15

describe('DCI — leitura (dados fictícios)', () => {
  it('detecta o equipamento e avisa se a tela estiver no outro', async () => {
    const b = await bruta('dci_permeabilidade_ficticio.xlsx')
    expect(detectarEquipamento(b)).toBe('DCI')
    expect(detectarEquipamento(await bruta('acidificacao_ficticio.xlsx'))).toBe('JBV')
    const r = lerEnsaiosEquipamento(b, 'JBV')
    expect(r.aviso).toContain('DCI')
    expect(r.ensaios[0].equipamento).toBe('DCI')
  })

  it('cabeçalho: polegadas → cm, porosidade, volume poroso, data MM/DD → dd/mm, nome do projeto', async () => {
    const e = lerEnsaiosEquipamento(await bruta('dci_permeabilidade_ficticio.xlsx'), 'DCI').ensaios[0]
    const m = e.metadados
    expect(m.amostra).toBe('TESTE-D')
    expect(m.diametro_cm).toBeCloseTo(2.54, 6)
    expect(m.comprimento_cm).toBeCloseTo(5.08, 6)
    expect(m.porosidade_pct).toBe(15)
    expect(m.viscosidade_cp).toBe(1)
    expect(m.data).toBe('05/10/2026 09:00:00')
    expect(e.leituras[0].volume_poroso_eq_cm3).toBeCloseTo(VP, 4)
    expect(e.leituras[10].tempo_s).toBeCloseTo(10, 2)          // horas × 3600
    expect(dataDCI('11/28/2024:1:05:09 PM')).toBe('28/11/2024 13:05:09')
    expect(lerNomeProjeto('IL001 HCl[10 wt%] @0.3 T60')).toEqual({ amostra: 'IL001', sistema: 'HCl[10 wt%]', q: 0.3, temperatura_c: 60 })
  })
})

describe('DCI — permeabilidade (dados fictícios, k verdadeiro 20 mD)', () => {
  it('separa 1 → 2 → 4 ml/min mesmo com ruído na vazão e calcula k ≈ 20 mD', async () => {
    const e = lerEnsaiosEquipamento(await bruta('dci_permeabilidade_ficticio.xlsx'), 'DCI').ensaios[0]
    expect(separarEtapas(e).map((x) => Math.round(x.q * 100) / 100)).toEqual([1, 2, 4])
    const r = tratarPermeabilidade(e)
    for (const et of r.etapas) expect(et.k_md!).toBeCloseTo(20, 0)
    expect(r.ajuste!.k_md).toBeCloseTo(20, 0)
    expect(r.ajuste!.r2).toBeGreaterThan(0.999)
  })
})

describe('DCI — acidificação (dados fictícios)', () => {
  it('prefere a aba do pesquisador (rótulos) e herda o cabeçalho da aba do equipamento', async () => {
    const es = lerEnsaiosEquipamento(await bruta('dci_acidificacao_ficticio.xlsx'), 'DCI').ensaios
    expect(es[0].aba).toBe('Planilha1')
    expect(es[0].metadados.amostra).toBe('TESTE-D')
    expect(es[0].avisos[0]).toContain('cabeçalho')
  })

  it('fases pelos ACUMULADORES (sem rótulos) e PVbt igual ao do Origin com volume morto', async () => {
    const e = lerEnsaiosEquipamento(await bruta('dci_acidificacao_ficticio.xlsx'), 'DCI').ensaios.find((x) => x.aba !== 'Planilha1')!
    const r = tratarAcidificacao(e, { volumeMorto_cm3: 0.4 })
    expect(r.fases.map((f) => f.rotulo)).toEqual(['Acumulador 3 @0.5', 'Acumulador 2 @0.5', 'Acumulador 1 @0.5', 'Acumulador 1 @2'])
    expect(r.fase_acido!.garrafa).toBe(2)
    expect(r.volume_poroso_cm3).toBeCloseTo(VP, 4)
    expect(r.houve_breakthrough).toBe(true)
    expect(r.razao_dp_depois_antes!).toBeLessThan(0.1)
    expect(r.pvbt_queda!).toBeGreaterThan(0.55)
    expect(r.pvbt_queda!).toBeLessThan(0.62)
    expect(r.breakthrough!.pvbt!).toBeGreaterThan(r.pvbt_queda!)      // fim do ácido vem um pouco depois
  })

  it('com os rótulos do pesquisador: mesmas fases com o nome do fluido', async () => {
    const e = lerEnsaiosEquipamento(await bruta('dci_acidificacao_ficticio.xlsx'), 'DCI').ensaios[0]
    const r = tratarAcidificacao(e, { volumeMorto_cm3: 0.4 })
    expect(r.fases.map((f) => f.rotulo)).toEqual(['Água antes @0.5', 'Ácido @0.5', 'Água depois @0.5', 'Água depois @2.0'])
    expect(r.fases.map((f) => f.garrafa)).toEqual([3, 2, 1, 1])
  })

  it('sem breakthrough (ΔP sobe): não dá PVbt, informa o PV injetado e a razão depois/antes', async () => {
    const e = lerEnsaiosEquipamento(await bruta('dci_acidificacao_sem_bt_ficticio.xlsx'), 'DCI').ensaios[0]
    const r = tratarAcidificacao(e, { volumeMorto_cm3: 0.4, faseAcido: 2 })
    expect(r.houve_breakthrough).toBe(false)
    expect(r.breakthrough).toBeNull()
    expect(r.pvbt_fim_acido).toBeNull()
    expect(r.pv_acido_injetado!).toBeGreaterThan(0)
    expect(r.razao_dp_depois_antes!).toBeGreaterThan(4)
    expect(r.avisos.some((a) => a.startsWith('sem breakthrough'))).toBe(true)
  })
})
