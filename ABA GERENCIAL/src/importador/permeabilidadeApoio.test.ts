import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { etapasPadrao, resultadoComEtapas } from './permeabilidadeApoio'
import { lerEnsaios, tratarPermeabilidade } from './tratamentoPermeabilidade'

const f = readFileSync(new URL('./permeabilidade_ficticio.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer

describe('apoio da tela de permeabilidade', () => {
  it('com a seleção padrão (as estáveis) devolve o resultado do tratamento, sem recalcular', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e)
    expect(etapasPadrao(r)).toEqual([1, 2, 3])
    expect(resultadoComEtapas(r, new Set([1, 2, 3]), 7.32, 0.89)).toBe(r)
  })

  it('refaz o ajuste e a média só com as etapas marcadas em "usar"', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e)
    const s = resultadoComEtapas(r, new Set([1, 3]), 7.32, 0.89)
    expect(s.ajuste!.k_md).toBeCloseTo(78, 0)
    expect(s.k_medio_md).toBeCloseTo((r.etapas[0].k_md! + r.etapas[2].k_md!) / 2, 6)
    // com as três de volta, bate com o ajuste do tratamento
    const t = resultadoComEtapas({ ...r, etapas: r.etapas.map((x) => ({ ...x, estavel: false })) }, new Set([1, 2, 3]), 7.32, 0.89)
    expect(t.ajuste!.k_md).toBeCloseTo(r.ajuste!.k_md, 9)
    expect(t.ajuste!.r2).toBeCloseTo(r.ajuste!.r2, 9)
    expect(t.k_medio_md).toBeCloseTo(r.k_medio_md!, 9)
    // uma etapa só não dá reta
    expect(resultadoComEtapas(r, new Set([2]), 7.32, 0.89).ajuste).toBeNull()
  })

})
