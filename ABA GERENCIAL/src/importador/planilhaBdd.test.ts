// Importador da planilha de reatividade (v2) com a planilha FICTÍCIA BDD_ficticio_v2.xlsx
// (gerada por gerar_bdd_ficticio_v2.py; mesma estrutura da planilha real, valores inventados).
// A parte "no banco" roda só com PGPORTA_BDD apontando para um PostgreSQL VAZIO com as migrações 001–020.
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sbPg, semearUsuarios } from '../teste/sbPg'
import { lerArquivo } from './lerArquivo'
import { analisarBdd, assinaturaSistema, conferirBddNoBanco, gravarBdd, normalizaComponente, numero, unificarGrafias } from './planilhaBdd'

const f = readFileSync(new URL('./BDD_ficticio_v2.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
const analisar = async () => analisarBdd(await lerArquivo(buf))
const chave = (p: { severidade: string; aba: string; id?: string | null; campo?: string | null }) => `${p.severidade}:${p.aba}:${p.id}:${p.campo}`

describe('análise da planilha', () => {
  it('números no formato brasileiro', () => {
    expect(numero('0,1')).toBe(0.1)
    expect(numero('6,37E-07')).toBeCloseTo(6.37e-7)
    expect(numero('1.000,5')).toBe(1000.5)
    expect(numero('-')).toBeNull()
    expect(Number.isNaN(numero('5,1e-7?'))).toBe(true)
  })

  it('conta o que vai para cada tabela', async () => {
    const a = await analisar()
    expect(a.abasFaltando).toEqual([])
    expect(a.contagens).toEqual({ publicacoes: 4, fluidos_prop: 5, litologias: 6, lit_listas: 7, lit_rochas: 8, sistemas_acidos: 9, lit_dados_rda: 34, lit_qualidade: 4, analise_rda: 0 })
    expect([a.erros, a.avisos, a.corrigidos]).toEqual([4, 15, 7])
    expect(a.problemas.filter((p) => p.severidade === 'ERRO').map((p) => `${p.aba}:${p.linha}:${p.campo}`))
      .toEqual(['ensaios:5:id_rocha', 'ensaios:7:taxa_reacao_mol_cm2_s', 'ensaios:9:id_ensaio', 'ensaios:14:tipo_variavel'])
  })

  it('pega os problemas que existem na planilha real', async () => {
    const k = (await analisar()).problemas.map(chave)
    expect(k).toContain('AVISO:ensaios:RDA-0030:dim_h_in')                  // dimensão arrastada 1, 2, 3, 4
    expect(k).toContain('AVISO:sistemas_acidos:SA07:composicao')            // SA07 = SA01
    expect(k).toContain('CORRIGIDO:sistemas_acidos:SA08:componente_1')      // 'acido formico'
    expect(k).toContain('CORRIGIDO:sistemas_acidos:SA08:unidade_1')         // 'wt'
    expect(k).toContain('AVISO:sistemas_acidos:SA09:unidade_1')             // '%'
    expect(k).toContain('AVISO:ensaios:RDA-0034:temperatura_c')             // 250 °C
    expect(k).toContain('AVISO:ensaios:RDA-0035:taxa_reacao_mol_cm2_s')     // 3e-66
    expect(k).toContain('AVISO:qualidade:RDA-9999:id_ensaio')
  })

  it('listas, qualidade e origem', async () => {
    const d = (await analisar()).dados
    expect(d.lit_listas.map((l) => `${l.lista}|${l.valor}`)).toEqual(expect.arrayContaining(['metodo_quantificacao|Titulação', 'metodo_coef_difusao|Newman, J. (1966)']))
    expect(d.lit_qualidade.find((q) => q.campo === 'dim_h_in')?.id_ensaio).toBeNull()      // id inexistente vira anotação geral
    expect(d.lit_dados_rda.every((r) => r.origem_registro === 'planilha')).toBe(true)
  })

  it('assinatura do sistema ignora ordem, maiúsculas e grafia', () => {
    const a = assinaturaSistema({ componente_1: 'HCl', valor_1: 15, unidade_1: 'wt%', componente_2: 'IC-A', valor_2: 0.5, unidade_2: 'vol%' })
    const b = assinaturaSistema({ componente_1: 'ic-a', valor_1: 0.5, unidade_1: 'VOL%', componente_2: 'hcl', valor_2: 15, unidade_2: 'wt%' })
    expect(a).toBe(b)
    expect(normalizaComponente('acido formico')).toBe('Ácido fórmico')
  })

  it('grafias: acento e maiúscula unificam; nome parecido só gera aviso', () => {
    const g = unificarGrafias(['Polímero-X', 'Poliméro-X', 'Polímero-X', 'Polímero-Y', 'Inibidor Zeta', 'Inibidro Zeta', 'metanol', 'etanol'], [])
    expect(g.mapa.get('Poliméro-X')).toBe('Polímero-X')       // a mais usada
    expect(g.mapa.get('Polímero-Y')).toBe('Polímero-Y')       // série diferente, não junta
    expect(g.mapa.get('Inibidro Zeta')).toBe('Inibidro Zeta')       // parecido: não troca sozinho...
    expect(g.parecidos).toEqual([['Inibidor Zeta', 'Inibidro Zeta'], ['metanol', 'etanol']])   // ...só avisa
    expect(unificarGrafias(['hcl', 'HCL']).mapa.get('HCL')).toBe('HCl')
    expect(unificarGrafias(['surfact b'], ['Surfact B']).mapa.get('surfact b')).toBe('Surfact B')   // fluidos_prop manda
  })

  it('ensaios do LC PETRO (coluna amostra ou referência do laboratório) vão para a ficha da amostra', () => {
    const base = { id_rocha: 'RCH-01', id_sistema: 'SA01', temperatura_C: 50, rotacao_rpm: 400, taxa_reacao_mol_cm2_s: '3,4E-06' }
    const a = analisarBdd({
      referencias: [{ id_referencia: 'REF-R01', autor: 'Fulano et al' }, { id_referencia: 'LCPETRO', autor: 'LC PETRO (laboratório)' }],
      rochas: [{ id_rocha: 'RCH-01', litologia: 'Indiana' }],
      sistemas_acidos: [{ id_sistema: 'SA01', componente_1: 'HCl', valor_1: 15, unidade_1: 'wt%' }],
      ensaios: [
        { id_ensaio: 'RDA-0001', id_referencia: 'REF-R01', ...base },                                          // literatura
        { id_ensaio: 'RDA-0002', id_referencia: 'LCPETRO', amostra: 'IL076', serie: 'IL076-S1', data_ensaio: '2026-10-02', ...base, id_rocha: null },
        { id_ensaio: 'RDA-0003', id_referencia: 'REF-R01', amostra: 'IL077', ...base },                       // coluna amostra manda
        { id_ensaio: 'RDA-0004', id_referencia: 'LCPETRO', ...base },                                          // do LC PETRO sem amostra: erro
      ],
    })
    expect(a.contagens.publicacoes).toBe(1)                     // LCPETRO não vira publicação
    expect(a.dados.lit_dados_rda.map((d) => d.id_ensaio)).toEqual(['RDA-0001'])   // preserva o id_ensaio RDA-0001 da planilha
    expect(a.dados.analise_rda.map((d) => [d.id_ensaio_planilha, d._amostra])).toEqual([['RDA-0002', 'IL076'], ['RDA-0003', 'IL077'], ['RDA-0004', null]])
    const l = a.dados.analise_rda[0]
    expect(l).toMatchObject({ serie: 'IL076-S1', data_ensaio: '2026-10-02', id_sistema: 'SA01', temperatura_c: 50, rotacao_rpm: 400, tipo_variavel: 'rotação (RDA)' })
    expect(l.taxa_reacao_mol_cm2_s).toBeCloseTo(3.4e-6)
    expect(l).not.toHaveProperty('omega_rad_s')                // calculada: o banco faz
    expect(a.problemas.filter((p) => p.severidade === 'ERRO').map((p) => [p.id, p.campo])).toEqual([['RDA-0004', 'amostra']])
  })
})

const PORTA = Number(process.env.PGPORTA_BDD)
describe.skipIf(!PORTA)('gravação no banco', () => {
  let pool: pg.Pool, adm: string, leitor: string
  beforeAll(async () => {
    pool = new pg.Pool({ host: '/tmp', port: PORTA, user: 'postgres', database: 'lcpetro' })
    ;({ adm, leitor } = await semearUsuarios(pool))
  })
  afterAll(async () => { await pool.end() })

  it('leitor não grava', async () => {
    await expect(gravarBdd(sbPg(pool, leitor), await analisar(), { pularErros: true })).rejects.toThrow(/editor ou administrador/)
  })

  it('com erro só grava pulando as linhas ruins; reimportar não duplica nem altera', async () => {
    const sb = sbPg(pool, adm), a = await analisar()
    await expect(gravarBdd(sb, a)).rejects.toThrow(/4 erro/)
    const antes = await conferirBddNoBanco(sb, a)
    expect(antes.find((t) => t.tabela === 'lit_dados_rda')?.novos).toHaveLength(34)
    const r = await gravarBdd(sb, a, { pularErros: true })
    expect(r.gravadas).toMatchObject({ publicacoes: 4, sistemas_acidos: 9, lit_dados_rda: 31, lit_qualidade: 4 })
    expect(r.deixadasDeFora).toBe(3)
    const depois = await conferirBddNoBanco(sb, a)
    expect(depois.flatMap((t) => t.alterados)).toEqual([])
    await gravarBdd(sb, a, { pularErros: true })
    expect((await pool.query('select count(*)::int n from lit_dados_rda')).rows[0].n).toBe(31)
    expect((await pool.query('select count(*)::int n from lit_qualidade')).rows[0].n).toBe(4)
  })

  it('banco calcula e aponta o que conferir', async () => {
    const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows
    expect(await q(`select raiz_omega, conc_pct from v_lit_dados_rda where id_ensaio = 'LIT-0001'`)).toEqual([{ raiz_omega: '3.236', conc_pct: '0.3639' }])
    expect((await q(`select temperatura_nominal_c from lit_dados_rda where id_ensaio = 'LIT-0030'`))[0].temperatura_nominal_c).toBe('30')
    expect(await q(`select ids from v_sistemas_duplicados`)).toEqual([{ ids: ['SA01', 'SA07'] }])
    const pend = (await q(`select id_ensaio, campo, gravidade from v_lit_pendencias where gravidade <> 'incompleto'`)).map((r) => `${r.gravidade}:${r.id_ensaio}:${r.campo}`)
    expect(pend).toEqual(expect.arrayContaining(['erro:LIT-0035:taxa_reacao_mol_cm2_s', 'conferir:LIT-0034:temperatura_c', 'conferir:LIT-0030:dim_h_in']))
  })
})
