/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { lerArquivo } from './lerArquivo'
import { analisarBdd, gravarBdd, numero } from './planilhaBdd'

const arquivo = readFileSync('docs/referencia/importador/BDD_ficticio.xlsx')
const buf = arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength) as ArrayBuffer

// Os dois testes de gravação precisam de um Supabase LOCAL de teste (nunca o banco real):
//   SUPABASE_TESTE_URL, SUPABASE_TESTE_JWT_ADMIN e SUPABASE_TESTE_JWT_LEITOR.
// Sem essas variáveis eles são pulados; leitura e análise rodam sempre.
const URL_TESTE = process.env.SUPABASE_TESTE_URL ?? ''
const jwt = (id: string) =>
  (id.endsWith('a') ? process.env.SUPABASE_TESTE_JWT_ADMIN : process.env.SUPABASE_TESTE_JWT_LEITOR) ?? ''

describe('importador da planilha (TS)', () => {
  it('lê números no formato brasileiro', () => {
    expect(numero('0,1')).toBe(0.1)
    expect(numero('5,24E-07')).toBeCloseTo(5.24e-7)
    expect(numero('1.000,5')).toBe(1000.5)
    expect(numero('-')).toBeNull()
    expect(Number.isNaN(numero('5,1e-7?'))).toBe(true)
  })

  it('analisa igual ao importador Python', async () => {
    const a = analisarBdd(await lerArquivo(buf))
    expect(a.abasFaltando).toEqual([])
    expect(a.contagens).toEqual({ publicacoes: 4, fluidos_prop: 4, litologias: 6, lit_rochas: 8, sistemas_acidos: 6, lit_dados_rda: 28 })
    expect([a.erros, a.avisos, a.corrigidos]).toEqual([4, 7, 5])
    const erros = a.problemas.filter((p) => p.severidade === 'ERRO').map((p) => `${p.aba}:${p.linha}:${p.campo}`)
    expect(erros).toEqual(['ensaios:5:id_rocha', 'ensaios:7:taxa_reacao_mol_cm2_s', 'ensaios:9:id_ensaio', 'ensaios:14:tipo_variavel'])
    expect(a.colunasIgnoradas).toContain('omega_rad_s')
  })

  it.skipIf(!URL_TESTE)('bloqueia gravação com erro e grava pulando as linhas ruins', async () => {
    const sb = createClient(URL_TESTE, 'anon', {
      global: { headers: { Authorization: `Bearer ${jwt('00000000-0000-0000-0000-00000000000a')}` } },
      auth: { persistSession: false },
    })
    const a = analisarBdd(await lerArquivo(buf))
    await expect(gravarBdd(sb, a)).rejects.toThrow(/4 erro/)
    const etapas: string[] = []
    const r = await gravarBdd(sb, a, { pularErros: true, aoProgresso: (t) => etapas.push(t) })
    expect(r.gravadas).toEqual({ publicacoes: 4, fluidos_prop: 4, litologias: 6, lit_rochas: 8, sistemas_acidos: 6, lit_dados_rda: 25 })
    expect(r.deixadasDeFora).toBe(3)
    expect(etapas[0]).toBe('publicacoes')
    const { data } = await sb.from('v_lit_dados_rda').select('raiz_omega, conc_pct').eq('id_ensaio', 'RDA-0001').single()
    expect(data).toEqual({ raiz_omega: 3.236, conc_pct: 0.3639 })
  })

  it.skipIf(!URL_TESTE)('leitor não consegue gravar (regra do banco)', async () => {
    const sb = createClient(URL_TESTE, 'anon', {
      global: { headers: { Authorization: `Bearer ${jwt('00000000-0000-0000-0000-00000000000e')}` } },
      auth: { persistSession: false },
    })
    const a = analisarBdd(await lerArquivo(buf))
    await expect(gravarBdd(sb, a, { pularErros: true })).rejects.toThrow(/editor ou administrador/)
  })
})
