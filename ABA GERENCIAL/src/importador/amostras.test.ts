// Teste do importador da planilha de controle de amostras.
// Partes 1 e 2 rodam em qualquer lugar. A parte 3 (gravação) precisa de um Supabase de TESTE:
//   SUPABASE_TESTE_URL, SUPABASE_TESTE_JWT_EDITOR (editor do projeto), SUPABASE_TESTE_JWT_LEITOR,
//   SUPABASE_TESTE_PROJETO (id do projeto). Nunca rode contra o banco de produção.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from './lerArquivo'
import { analisarAmostras, casarLitologia, conferirNoBanco, data, encontrarBlocos, gravarAmostras, lerUtilizacao } from './planilhaAmostras'

const f = readFileSync(new URL('./controle_ficticio.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
const CATALOGO = ['Indiana Limestone', 'Pink Desert Limestone', 'Dolomita', 'Calcita']
const PROJETO = process.env.SUPABASE_TESTE_PROJETO ?? '20000000-0000-0000-0000-00000000000a'
const analisar = async () => analisarAmostras(encontrarBlocos(await lerArquivoBruto(buf)), {
  projetoId: PROJETO, litologiasExistentes: CATALOGO,
  conferenciaPadrao: { data: '2026-08-12', responsaveis: 'Equipe RDA' },
})

describe('regras', () => {
  it('datas do Excel e texto', () => {
    expect(data(45075)).toBe('2023-05-29')
    expect(data('11/08/26')).toBe('2026-08-11')
    expect(data(null)).toBeNull()
    expect(data('amanhã')).toBe('')
  })
  it('litologia: nome curto, erro de digitação e nova', () => {
    expect(casarLitologia('Indiana', CATALOGO)).toEqual({ nome: 'Indiana Limestone', nova: false })
    expect(casarLitologia('Pink desert', CATALOGO)).toEqual({ nome: 'Pink Desert Limestone', nova: false })
    expect(casarLitologia('Sillurian', ['Silurian Dolomite'])).toEqual({ nome: 'Silurian Dolomite', nova: false })
    expect(casarLitologia('Morro do chaves', CATALOGO)).toEqual({ nome: 'Morro do Chaves', nova: true })
  })
  it('texto de utilização do RDA vira sugestão', () => {
    expect(lerUtilizacao('TR - HCl [0,5M] - Indiana - 25 °C @100')).toMatchObject(
      { ensaio: 'TR', acido: 'HCl', concentracao: 0.5, unidade: 'M', formacao: 'Indiana', temperatura_c: 25, rotacao_rpm: 100 })
  })
})

describe('leitura e análise', () => {
  it('acha o cabeçalho na linha 2, mapeia as colunas e reconhece o tipo de cada aba', async () => {
    const blocos = encontrarBlocos(await lerArquivoBruto(buf))
    expect(blocos.map((b) => [b.aba, b.linhaCabecalho, b.tipo, b.linhas.length])).toEqual([['coreflooding', 2, 'coreflooding', 7], ['Planilha2', 2, 'rda', 4]])
    const cf = blocos[0]
    const m = Object.fromEntries(cf.colunas.map((c, i) => [c, cf.mapeamento[i]]))
    expect(m['Coluna1']).toBe('ignorar')
    expect(m['Conferência 11/08/26 - Ana e Bruno']).toBe('conferencia')
    expect(m['Data da Petrófisica']).toBe('petro_data')
    expect(m['Densidade aparente (g/cm3']).toBe('petro_dens_aparente')
    expect(m['Massa apos acidificação']).toBe('depois_massa')
  })

  it('valida e padroniza', async () => {
    const a = await analisar()
    expect([a.erros, a.avisos, a.corrigidos]).toEqual([3, 7, 8])
    const erros = a.problemas.filter((p) => p.severidade === 'ERRO').map((p) => `${p.aba}:${p.linha}:${p.id}`)
    expect(erros).toEqual(['coreflooding:6:CF104', 'coreflooding:7:CF102', 'coreflooding:8:CF106'])
    expect(a.codigosComErro.sort()).toEqual(['CF102', 'CF104', 'CF106'])
    expect(a.litologiasNovas).toEqual(['Morro do Chaves', 'Silurian Dolomite', 'Jandaira', 'Coquina'])
    const cf101 = a.amostras.find((x) => x.codigo === 'CF101')!
    expect(cf101.permeabilidade_fabricante_md).toBeNull()          // 46114 era uma data
    // faixas do fabricante (planilha real: "30-50", "70-115", "2 - 4 md")
    const fx = (c: string) => { const x = a.amostras.find((y) => y.codigo === c)!; return [x.permeabilidade_fabricante_min_md, x.permeabilidade_fabricante_max_md, x.permeabilidade_fabricante_md] }
    expect(fx('RDA103')).toEqual([16, 20, null])
    expect(fx('TST-001')).toEqual([2, 4, null])
    expect(fx('RDA101')).toEqual([4.96, 4.96, 4.96])
    expect(a.petrofisicas.find((p) => p.codigo === 'RDA101')!.permeabilidade_gas_md).toBeNull()
    expect(a.petrofisicas.filter((p) => p.codigo === 'CF101').map((p) => [p.momento, p.data_ensaio])).toEqual([['antes', '2023-05-29'], ['depois', null]])
    expect(a.conferencias.map((c) => `${c.codigo}:${c.data}:${c.resultado}`)).toContain('CF103:2026-08-11:não localizada')
    expect(a.conferencias.map((c) => `${c.codigo}:${c.responsaveis}`)).toContain('RDA101:Equipe RDA')
    expect(a.amostras.find((x) => x.codigo === 'RDA101')!.observacoes).toBe('Utilização: TR - HCl [0,5M] - Indiana - 25 °C @100')
  })
})

const URL_TESTE = process.env.SUPABASE_TESTE_URL
describe.skipIf(!URL_TESTE)('gravação (Supabase de teste)', () => {
  const cliente = (token: string) => createClient(URL_TESTE!, 'anon', {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })

  it('grava, não duplica ao reimportar e separa o código de outro projeto', async () => {
    const sb = cliente(process.env.SUPABASE_TESTE_JWT_EDITOR!)
    const a = await conferirNoBanco(sb, await analisar())
    await expect(gravarAmostras(sb, a)).rejects.toThrow(/3 erro/)
    const r = await gravarAmostras(sb, a, { pularErros: true })
    expect(r.amostras).toEqual({ inseridas: 5, atualizadas: 1 })          // IL900 já existia
    expect(r.recusadas.map((x) => x.codigo)).toEqual(['TST-001'])          // existe em outro projeto
    expect(r.litologias).toBe(3)                                           // Jandaira só aparece em linha com erro
    expect(r.petrofisicas).toEqual({ inseridas: 5, atualizadas: 0 })
    expect(r.conferencias).toEqual({ inseridas: 5, atualizadas: 0 })
    const { data: cf103 } = await sb.from('amostras').select('status, litologia, finalidade').eq('codigo', 'CF103').single()
    expect(cf103).toEqual({ status: 'nao localizada', litologia: 'Morro do Chaves', finalidade: 'coreflooding' })

    const r2 = await gravarAmostras(sb, await conferirNoBanco(sb, await analisar()), { pularErros: true })
    expect(r2.amostras).toEqual({ inseridas: 0, atualizadas: 6 })
    expect(r2.petrofisicas).toEqual({ inseridas: 0, atualizadas: 5 })
    expect(r2.conferencias).toEqual({ inseridas: 0, atualizadas: 5 })
  })

  it('leitor não grava', async () => {
    const sb = cliente(process.env.SUPABASE_TESTE_JWT_LEITOR!)
    const a = await analisarAmostras(encontrarBlocos(await lerArquivoBruto(buf)), { projetoId: PROJETO, litologiasExistentes: CATALOGO })
    await expect(gravarAmostras(sb, a, { pularErros: true })).rejects.toThrow(/editor do projeto ou administrador/)
  })
})
