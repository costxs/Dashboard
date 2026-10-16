// Teste do importador da planilha de PVbt.
// Leitura/análise rodam em qualquer lugar. A gravação precisa de um Supabase de TESTE:
//   SUPABASE_TESTE_URL, SUPABASE_TESTE_JWT_ADMIN, SUPABASE_TESTE_JWT_EDITOR (sem acesso à Petrobras),
//   SUPABASE_TESTE_JWT_PETROBRAS (membro da empresa Petrobras), SUPABASE_TESTE_JWT_LEITOR,
//   SUPABASE_TESTE_EMPRESA_PETROBRAS, SUPABASE_TESTE_PROJETO_LCPETRO. Nunca rode contra produção.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { analisarPvbt, conferirPvbtNoBanco, gravarPvbt } from './planilhaPvbt'

const f = readFileSync(new URL('./pvbt_ficticio.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
const EMPRESA_PB = process.env.SUPABASE_TESTE_EMPRESA_PETROBRAS ?? '10000000-0000-0000-0000-000000000002'
const PROJETO_LCP = process.env.SUPABASE_TESTE_PROJETO_LCPETRO ?? '20000000-0000-0000-0000-00000000000d'
const OPCOES = { litologiasExistentes: ['Indiana Limestone', 'Dolomita'], empresaPetrobrasId: EMPRESA_PB, projetoLcpetroId: PROJETO_LCP }
const analisar = async (o: object = OPCOES) => analisarPvbt(await lerArquivoBruto(buf), o)

describe('leitura e análise da planilha de PVbt', () => {
  it('separa as três fontes e ignora as colunas calculadas', async () => {
    const a = await analisar()
    expect(a.abasFaltando).toEqual([])
    expect(a.contagens).toEqual({ referencias: 2, fluidos_prop: 1, sistemas_acidos: 3, amostras_lcpetro: 3, amostras_literatura: 6,
      amostras_petrobras: 2, ensaios_lcpetro: 3, ensaios_literatura: 7, ensaios_petrobras: 2 })
    expect(a.colunasIgnoradas).toContain('vel_intersticial_cm_min')
    expect(a.publicacoes.map((p) => [p.id_referencia, p.empresa_id])).toEqual([['REF-LX1', null], ['REF-PBX', EMPRESA_PB]])
  })

  it('aponta erros, avisos e correções', async () => {
    const a = await analisar()
    expect([a.erros, a.avisos, a.corrigidos]).toEqual([3, 5, 9])
    expect(a.problemas.filter((p) => p.severidade === 'ERRO').map((p) => `${p.linha}:${p.id}:${p.campo}`))
      .toEqual(['10:LIT-9006:id_amostra', '11:LIT-9007:pvbt_condicao', '12:LIT-9003:id_experimento'])
    const avisos = a.problemas.filter((p) => p.severidade === 'AVISO').map((p) => `${p.id}:${p.campo}`)
    expect(avisos).toContain('LCP-9001:pvbt_condicao')          // "Não ocorreu Bt" com condição completo
    expect(avisos).toContain('IL902:volume_poroso_medido_cm3')  // VP medido × calculado
    expect(avisos).toContain('LIT-9005:qualidade')              // aba qualidade
    expect(a.lit_dados_pvbt.find((d) => d.id_experimento === 'LIT-9001')!.temperatura_obs).toBe('Ambiente')
  })

  it('exige a empresa quando há dados Petrobras', async () => {
    const a = await analisar({ litologiasExistentes: ['Indiana Limestone'] })
    expect(a.problemas.some((p) => p.campo === 'empresa' && p.severidade === 'ERRO')).toBe(true)
  })
})

const URL_TESTE = process.env.SUPABASE_TESTE_URL
describe.skipIf(!URL_TESTE)('gravação (Supabase de teste)', () => {
  const cliente = (t?: string) => createClient(URL_TESTE!, 'anon', {
    global: { headers: { Authorization: `Bearer ${t}` } }, auth: { persistSession: false } })
  const admin = cliente(process.env.SUPABASE_TESTE_JWT_ADMIN)

  it('grava as três fontes, calcula na view e não duplica ao reimportar', async () => {
    const a = await conferirPvbtNoBanco(admin, await analisar(), OPCOES)
    await expect(gravarPvbt(admin, a)).rejects.toThrow(/3 erro/)
    const r = await gravarPvbt(admin, a, { pularErros: true, projetoLcpetroId: PROJETO_LCP })
    expect(r.amostrasCriadas).toBe(2)                                  // IL901, IL902 (IL900 já existia)
    expect(r.recusadas).toEqual([])
    expect(r.gravadas).toMatchObject({ publicacoes: 2, sistemas_acidos: 3, lit_amostras_pvbt: 8, lit_dados_pvbt: 6, analise_coreflooding: 3 })

    const { data: v } = await admin.from('v_pvbt').select('*').eq('id_experimento', 'LCP-9002').single()
    expect(v.fonte).toBe('LCPETRO')
    expect(v.lwh_referencia).toBe('microCT')
    expect(Number(v.pvbt_por_darcy)).toBeCloseTo(2.8 * 4.29 / 3.9, 3)
    const { data: v1 } = await admin.from('v_pvbt').select('vel_intersticial_cm_min, conc_m, dimensao_nominal_in').eq('id_experimento', 'LCP-9001').single()
    expect(v1.vel_intersticial_cm_min).toBeCloseTo(0.101175, 5)
    expect(Number(v1.conc_m)).toBeCloseTo(4.419, 3)
    expect(v1.dimensao_nominal_in).toBe('1.5x3')
    const { data: t } = await admin.from('v_pvbt').select('temperatura_nominal_c').eq('id_experimento', 'PB-9002').single()
    expect(Number(t.temperatura_nominal_c)).toBe(95)                   // 93,33 °C cai em 95

    const r2 = await gravarPvbt(admin, await conferirPvbtNoBanco(admin, await analisar(), OPCOES), { pularErros: true, projetoLcpetroId: PROJETO_LCP })
    expect(r2.amostrasCriadas).toBe(0)
    const { count } = await admin.from('analise_coreflooding').select('id', { count: 'exact', head: true }).like('id_experimento', 'LCP-90%')
    expect(count).toBe(3)
  })

  it('dados Petrobras só para quem tem acesso à empresa', async () => {
    const semAcesso = cliente(process.env.SUPABASE_TESTE_JWT_EDITOR)
    const petro = cliente(process.env.SUPABASE_TESTE_JWT_PETROBRAS)
    const conta = async (sb: ReturnType<typeof cliente>, fonte: string) =>
      (await sb.from('v_pvbt').select('id_experimento', { count: 'exact', head: true }).eq('fonte', fonte)).count
    expect(await conta(semAcesso, 'Literatura')).toBe(4)
    expect(await conta(semAcesso, 'Petrobras')).toBe(0)
    expect((await semAcesso.from('publicacoes').select('id_referencia').eq('id_referencia', 'REF-PBX')).data).toEqual([])
    expect(await conta(petro, 'Petrobras')).toBe(2)
  })

  it('leitor não grava', async () => {
    const leitor = cliente(process.env.SUPABASE_TESTE_JWT_LEITOR)
    const a = await analisar()
    await expect(gravarPvbt(leitor, a, { pularErros: true, projetoLcpetroId: PROJETO_LCP })).rejects.toThrow(/editor/)
  })
})
