import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { createClient } from '@supabase/supabase-js'
import { CONSTANTE_DARCY, dataDoCabecalho, gravarPermeabilidade, lerEnsaios, separarEtapas, tratarPermeabilidade } from './tratamentoPermeabilidade'

const f = readFileSync(new URL('./permeabilidade_ficticio.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer

describe('tratamento de permeabilidade (coreflooding)', () => {
  it('lê o cabeçalho do equipamento e a tabela de leituras', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    expect(e.metadados).toMatchObject({ amostra: 'TESTE-K', comprimento_cm: 7.32, diametro_cm: 3.79, porosidade_pct: 14.3, viscosidade_cp: 0.89, fluido: 'KCl 2%' })
    expect(e.metadados.garrafas).toEqual({ 2: 'AUP', 3: 'KCl 2%' })
    expect(e.holder).toBe('H1')
    expect(e.leituras.length).toBe(460)
    expect(e.leituras[0]).toMatchObject({ linha: 15, q: 2 })
  })

  it('separa as etapas pela vazão (pausa com Q = 0 não conta)', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    expect(separarEtapas(e).map((b) => b.q)).toEqual([2, 4, 6])
  })

  it('calcula ΔP estável, volumes e k (Darcy) por etapa e pelo ajuste ΔP × Q', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e)
    expect(CONSTANTE_DARCY).toBeCloseTo(244.93, 2)
    expect(r.etapas).toHaveLength(3)
    for (const et of r.etapas) {
      expect(et.estavel).toBe(true)
      expect(et.k_md!).toBeGreaterThan(76.5); expect(et.k_md!).toBeLessThan(79.5)   // verdadeiro: 78 mD
      expect(et.volume_bombeado_cm3!).toBeCloseTo(et.q * 300 / 60, 0)               // a bomba confere com Q × t
    }
    expect(r.etapas.map((x) => Math.round(x.dp_medio! * 10) / 10)).toEqual([3.6, 7.3, 10.9])
    expect(r.ajuste!.k_md).toBeCloseTo(78, 0)
    expect(r.ajuste!.r2).toBeGreaterThan(0.999)
    expect(r.avisos).toEqual([])
  })

  it('com o trecho inteiro (incluindo o transiente) a etapa não é estável', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e, { fracaoEstavel: 1 })
    expect(r.etapas.some((x) => !x.estavel)).toBe(true)
    expect(r.avisos.some((a) => a.includes('não estabilizou'))).toBe(true)
  })

  it('janela escolhida à mão sobrepõe a automática', async () => {
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e, { janelas: { 1: [200, 300] } })
    expect(r.etapas[0].j_inicio_s).toBe(200)
    expect(r.etapas[0].n_pontos).toBe(50)
  })
})

// Gravação: precisa de um Supabase de TESTE (SUPABASE_TESTE_URL, SUPABASE_TESTE_JWT_EDITOR,
// SUPABASE_TESTE_JWT_LEITOR, SUPABASE_TESTE_AMOSTRA = id de uma amostra do projeto do editor).
const URL_TESTE = process.env.SUPABASE_TESTE_URL
describe.skipIf(!URL_TESTE)('gravação do tratamento de permeabilidade', () => {
  const cliente = (t?: string) => createClient(URL_TESTE!, 'anon', { global: { headers: { Authorization: `Bearer ${t}` } }, auth: { persistSession: false } })
  it('grava petrofísica, etapas e curva; leitor não grava', async () => {
    expect(dataDoCabecalho('02/09/2026 15:05:46')).toBe('2026-09-02')
    const [e] = lerEnsaios(await lerArquivoBruto(buf))
    const r = tratarPermeabilidade(e)
    const sb = cliente(process.env.SUPABASE_TESTE_JWT_EDITOR)
    const g = await gravarPermeabilidade(sb, { amostraId: process.env.SUPABASE_TESTE_AMOSTRA!, ensaio: e, resultado: r, metodo: 'ajuste ΔP × Q', arquivo: 'permeabilidade_ficticio.xlsx' })
    const { data: p } = await sb.from('analise_petrofisica').select('permeabilidade_liquido_md, data_ensaio, viscosidade_cp, fluido, metodo_k').eq('id', g.analiseId).single()
    expect(Number(p!.permeabilidade_liquido_md)).toBeCloseTo(78, 0)
    expect(p).toMatchObject({ data_ensaio: '2026-09-02', fluido: 'KCl 2%', metodo_k: 'ajuste ΔP × Q' })
    const { count: n } = await sb.from('permeabilidade_etapas').select('id', { count: 'exact', head: true }).eq('analise_id', g.analiseId)
    expect(n).toBe(3)
    const { count: np } = await sb.from('curva_pontos').select('ordem', { count: 'exact', head: true }).eq('curva_id', g.curvaId)
    expect(np).toBe(460)
    await expect(gravarPermeabilidade(cliente(process.env.SUPABASE_TESTE_JWT_LEITOR), { amostraId: process.env.SUPABASE_TESTE_AMOSTRA!, ensaio: e, resultado: r, metodo: 'ajuste ΔP × Q' }))
      .rejects.toThrow(/editor do projeto/)
  })
})
