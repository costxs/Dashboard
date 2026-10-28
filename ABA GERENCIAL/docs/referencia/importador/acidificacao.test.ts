import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { lerEnsaios } from './tratamentoPermeabilidade'
import { detectarFases, sugerirFaseAcido, sugerirPapeis, tratarAcidificacao } from './tratamentoAcidificacao'

const abrir = async (nome: string) => {
  const f = readFileSync(new URL(`./${nome}`, import.meta.url))
  return lerEnsaios(await lerArquivoBruto(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer))[0]
}
const VP = Math.PI * 3.8 ** 2 / 4 * 7.3 * 0.14
const ROTULOS = ['KCl 2% @2', 'BLEND @2', 'AUP @2', 'AUP @4', 'AUP @6']

describe('acidificação JBV — exportação completa (dados fictícios)', () => {
  it('separa as fases por garrafa + vazão, com o mesmo rótulo que o pesquisador usa', async () => {
    const fases = detectarFases(await abrir('acidificacao_ficticio.xlsx'))
    expect(fases.map((f) => f.rotulo)).toEqual(ROTULOS)
    expect(fases.map((f) => f.garrafa)).toEqual([3, 4, 2, 2, 2])
    expect(fases.every((f) => f.origem === 'garrafas')).toBe(true)
    expect(fases[0].volume_cm3).toBeCloseTo(20, 0)             // 300 leituras × 2 s × 2 cm³/min
  })

  it('sugere o BLEND como ácido (maior queda de ΔP) e os papéis em volta', async () => {
    const fases = detectarFases(await abrir('acidificacao_ficticio.xlsx'))
    expect(sugerirFaseAcido(fases)).toBe(2)
    expect(sugerirPapeis(fases, 2)).toEqual({ 1: 'pre_fluxo', 2: 'acido', 3: 'pos_fluxo', 4: 'pos_fluxo', 5: 'pos_fluxo' })
  })

  it('PV igual ao Origin: (Q·(t − t₀)/60 − volume morto) ÷ VP; PVbt padrão = PV no fim do ácido', async () => {
    const r = tratarAcidificacao(await abrir('acidificacao_ficticio.xlsx'), { volumeMorto_cm3: 0.5 })
    expect(r.volume_poroso_cm3).toBeCloseTo(VP, 3)
    expect(r.q_ml_min).toBe(2)
    const s = r.serie, t0 = s[0].t_s, k = 20
    expect(s[k].volume_acido_cm3).toBeCloseTo(2 * (s[k].t_s - t0) / 60, 9)        // "Volume injetado Total"
    expect(s[k].volume_liquido_cm3).toBeCloseTo(s[k].volume_acido_cm3 - 0.5, 9)   // "Injected Volume"
    expect(s[0].pv!).toBeCloseTo(-0.5 / VP, 9)                                    // começa negativo
    expect(r.breakthrough!.criterio).toContain('fim da injeção')
    expect(r.breakthrough!.pvbt).toBeCloseTo(s[s.length - 1].pv!, 12)
    expect(r.pvbt_fim_acido).toBe(r.breakthrough!.pvbt)
    // conferência pela queda até o patamar: um pouco antes do fim do ácido
    expect(r.pvbt_queda!).toBeLessThan(r.pvbt_fim_acido!)
    expect(r.pvbt_queda!).toBeGreaterThan(r.pvbt_fim_acido! - 0.05)
    expect(r.dp_patamar_psi!).toBeGreaterThan(1.9)
    expect(r.dp_patamar_psi!).toBeLessThan(2.2)
    expect(r.avisos.some((a) => a.includes('zero do transdutor'))).toBe(true)
  })

  it('sem volume morto informado usa 0 e avisa', async () => {
    const r = tratarAcidificacao(await abrir('acidificacao_ficticio.xlsx'))
    expect(r.volume_morto_cm3).toBe(0)
    expect(r.avisos.some((a) => a.includes('volume morto'))).toBe(true)
  })

  it('critérios alternativos: limite fixo e manual', async () => {
    const e = await abrir('acidificacao_ficticio.xlsx')
    const lim = tratarAcidificacao(e, { volumeMorto_cm3: 0.5, criterio: { tipo: 'limite', dp_psi: 3 } })
    expect(lim.breakthrough!.criterio).toBe('ΔP ≤ 3 psi')
    const man = tratarAcidificacao(e, { volumeMorto_cm3: 0.5, criterio: { tipo: 'manual', t_s: lim.breakthrough!.t_s } })
    expect(man.breakthrough!.pvbt).toBeCloseTo(lim.breakthrough!.pvbt!, 9)
  })
})

describe('acidificação JBV — arquivo resumido pelo pesquisador (dados fictícios)', () => {
  it('lê os rótulos "<fluido> @<Q>" como fases e acha a garrafa de cada uma pelo volume', async () => {
    const e = await abrir('acidificacao_resumo_ficticio.xlsx')
    const fases = detectarFases(e)
    expect(fases.map((f) => f.rotulo)).toEqual(ROTULOS)
    expect(fases.map((f) => f.garrafa)).toEqual([3, 4, 2, 2, 2])
    expect(fases.every((f) => f.origem === 'rotulos')).toBe(true)
    expect(fases[1].nome_sugerido).toBe('BLEND')
  })

  it('sem cabeçalho não há volume poroso: avisa e calcula quando as dimensões são informadas', async () => {
    const e = await abrir('acidificacao_resumo_ficticio.xlsx')
    const sem = tratarAcidificacao(e)
    expect(sem.volume_poroso_cm3).toBeNull()
    expect(sem.avisos.some((a) => a.includes('sem volume poroso'))).toBe(true)
    const dims = { comprimento_cm: 7.3, diametro_cm: 3.8, porosidade_pct: 14, volumeMorto_cm3: 0.5 }
    const com = tratarAcidificacao(e, dims)
    expect(com.fonte_volume_poroso).toBe('dimensoes')
    expect(com.avisos.some((a) => a.includes('arquivo resumido'))).toBe(true)
    // como no Origin: volume pela vazão × tempo entre a 1ª e a última leitura do ácido
    const s = com.serie
    expect(s[s.length - 1].volume_acido_cm3).toBeCloseTo(2 * (s[s.length - 1].t_s - s[0].t_s) / 60, 9)
    expect(com.pvbt_fim_acido!).toBeCloseTo((s[s.length - 1].volume_acido_cm3 - 0.5) / VP, 9)
    // opção: volume pelo que saiu da garrafa
    const g = tratarAcidificacao(e, { ...dims, fonteVolume: 'garrafa' })
    expect(g.serie[g.serie.length - 1].volume_acido_cm3).toBeCloseTo(g.fase_acido!.volume_cm3, 6)
  })
})
