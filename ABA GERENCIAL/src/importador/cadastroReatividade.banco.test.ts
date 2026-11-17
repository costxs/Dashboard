// Cadastro pelo painel contra um PostgreSQL de teste com as migrações (regras de acesso valendo).
// Roda só quando PGPORTA aponta para um banco VAZIO com as migrações 001–020:  PGPORTA=54365 npx vitest run ...
// Dados fictícios.
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sbPg, semearUsuarios } from '../teste/sbPg'
import {
  gravarSerieLaboratorio, gravarSerieLiteratura, lerComposicaoRocha, lerComposicaoSistema, sistemaDosComponentes,
} from './cadastroReatividade'

const PORTA = Number(process.env.PGPORTA)

describe.skipIf(!PORTA)('cadastro de reatividade no banco', () => {
  let pool: pg.Pool, adm: string, leitor: string
  beforeAll(async () => {
    pool = new pg.Pool({ host: '/tmp', port: PORTA, user: 'postgres', database: 'lcpetro' })
    ;({ adm, leitor } = await semearUsuarios(pool))
  })
  afterAll(async () => { await pool.end() })

  const serie = () => ({
    publicacao: { autor: 'Autor Fictício et al.', ano: '2019', titulo: 'Dissolução de calcita em disco rotativo' },
    rocha: { litologia: 'Calcário Teste', composicao_texto: '[Calcita] > 99 %', ...lerComposicaoRocha('[Calcita] > 99 %') },
    sistema: sistemaDosComponentes(lerComposicaoSistema('[HCl]=15 wt% [IC-A]=0,5 vol%').componentes, 'HCl 15% + IC'),
    condicao: { temperatura_c: 50, pressao_psi: 1000, dim_h_in: 1.5, dim_d_in: 0.5, metodo_quantificacao: 'RDA / ICP-AES',
                obtencao_dado: 'tabelado' as const, fonte_local: 'Tabela 2', unidades_originais: { temperatura: '°F' } },
    pontos: [100, 400, 900, 1600].map((r) => ({ rotacao_rpm: r, taxa_reacao_mol_cm2_s: 1e-6 * Math.sqrt(r) })),
  })

  it('leitor não cadastra', async () => {
    await expect(gravarSerieLiteratura(sbPg(pool, leitor), serie())).rejects.toThrow(/Sem permissão/)
    expect((await pool.query('select count(*)::int n from publicacoes')).rows[0].n).toBe(0)
  })

  it('cria publicação, rocha, sistema e pontos com códigos automáticos', async () => {
    const r = await gravarSerieLiteratura(sbPg(pool, adm), serie())
    expect(r).toEqual({ id_referencia: 'REF-R01', id_rocha: 'RCH-01', id_sistema: 'SA01', ids: ['LIT-0001', 'LIT-0002', 'LIT-0003', 'LIT-0004'] })
    const { rows } = await pool.query(`select id_ensaio, ano, raiz_omega, tipo_variavel, origem_registro, fonte_local, criado_por, temperatura_nominal_c
                                         from v_lit_dados_rda where id_referencia = 'REF-R01' order by id_ensaio`)
    expect(rows[0]).toMatchObject({ ano: 2019, raiz_omega: '3.236', tipo_variavel: 'rotação (RDA)', origem_registro: 'formulario', fonte_local: 'Tabela 2' })
    expect(Number(rows[0].temperatura_nominal_c)).toBe(50)
    const roc = (await pool.query(`select calcita_pct, calcita_qualificador from lit_rochas where id_rocha = 'RCH-01'`)).rows[0]
    expect(roc).toEqual({ calcita_pct: '99', calcita_qualificador: '>' })
  })

  it('mesma composição em outra ordem reaproveita o sistema; outra série continua a numeração', async () => {
    const s = serie()
    const r = await gravarSerieLiteratura(sbPg(pool, adm), {
      id_referencia: 'REF-R01', id_rocha: 'RCH-01',
      sistema: sistemaDosComponentes(lerComposicaoSistema('[IC-A]=0,5 vol% [HCl]=15 wt%').componentes),
      condicao: { ...s.condicao, temperatura_c: 80 }, pontos: s.pontos.slice(0, 2),
    })
    expect(r).toMatchObject({ id_sistema: 'SA01', ids: ['LIT-0005', 'LIT-0006'] })
    expect((await pool.query('select count(*)::int n from sistemas_acidos')).rows[0].n).toBe(1)
  })

  it('numeração passa da largura sem cortar (SA99 → SA100)', async () => {
    await pool.query(`insert into sistemas_acidos (id_sistema, nome_sistema, componente_1, valor_1, unidade_1) values ('SA99', 'teste', 'HCl', 1, 'M')`)
    const r = await gravarSerieLiteratura(sbPg(pool, adm), { id_referencia: 'REF-R01', id_rocha: 'RCH-01',
      sistema: sistemaDosComponentes([{ componente: 'HCl', valor: 2, unidade: 'M' }]), condicao: { temperatura_c: 25 }, pontos: [{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 1e-6 }] })
    expect(r.id_sistema).toBe('SA100')
    await pool.query(`delete from lit_dados_rda where id_sistema in ('SA99', 'SA100'); delete from sistemas_acidos where id_sistema in ('SA99', 'SA100')`)
  })

  it('é tudo ou nada: um ponto ruim não deixa publicação nem rocha soltas', async () => {
    const s = serie()
    s.publicacao.autor = 'Outro Autor'
    await expect(gravarSerieLiteratura(sbPg(pool, adm), { ...s, condicao: { ...s.condicao, tipo_variavel: 'xyz' as never } })).rejects.toThrow()
    expect((await pool.query(`select count(*)::int n from publicacoes`)).rows[0].n).toBe(1)
    expect((await pool.query(`select count(*)::int n from lit_rochas`)).rows[0].n).toBe(1)
    await expect(gravarSerieLiteratura(sbPg(pool, adm), { ...s, pontos: [] })).rejects.toThrow(/não tem pontos/)
  })

  it('valor suspeito cai na fila de conferência', async () => {
    const s = serie()
    const r = await gravarSerieLiteratura(sbPg(pool, adm), { id_referencia: 'REF-R01', id_rocha: 'RCH-01', id_sistema: 'SA01',
      condicao: { ...s.condicao, temperatura_c: 250 }, pontos: [{ rotacao_rpm: 100, taxa_reacao_mol_cm2_s: 3e-66 }] })
    const { rows } = await pool.query(`select campo, gravidade from v_lit_pendencias where id_ensaio = $1 order by campo`, [r.ids[0]])
    expect(rows).toEqual(expect.arrayContaining([{ campo: 'taxa_reacao_mol_cm2_s', gravidade: 'erro' }, { campo: 'temperatura_c', gravidade: 'conferir' }]))
  })

  it('ensaio do laboratório: taxa calculada pela curva de cálcio e curva gravada', async () => {
    const lit = (await pool.query(`insert into litologias (nome) values ('Calcário Lab') on conflict do nothing returning nome`))
    void lit
    const emp = (await pool.query(`insert into empresas (sigla, nome) values ('TESTE', 'Empresa Teste') returning id`)).rows[0].id
    const prj = (await pool.query(`insert into projetos (empresa_id, codigo, nome) values ($1, 'TESTE-RDA', 'Projeto Teste') returning id`, [emp])).rows[0].id
    const am = (await pool.query(`insert into amostras (codigo, projeto_id, litologia, tipo_origem) values ('XX001', $1, 'Calcário Lab', 'afloramento') returning id`, [prj])).rows[0].id
    const curva = [0, 5, 10, 15, 20].map((t) => ({ tempo_min: t, ca_mg_l: 2 + 12 * t }))
    const ids = await gravarSerieLaboratorio(sbPg(pool, adm), {
      serie: 'S-TESTE-1', id_sistema: 'SA01',
      condicao: { temperatura_c: 25, pressao_psi: 1000, dim_h_in: 1.5, dim_d_in: 0.5, volume_acido_ml: 250, metodo_quantificacao: 'RDA / ICP-AES' },
      pontos: [{ amostra_id: am, rotacao_rpm: 500, taxa_reacao_mol_cm2_s: null, curva_calcio: curva }, { amostra_id: am, rotacao_rpm: 1000, taxa_reacao_mol_cm2_s: 4e-6 }],
    })
    expect(ids).toHaveLength(2)
    const { rows } = await pool.query(`select serie, taxa_calculada, taxa_reacao_mol_cm2_s, area_cm2 from analise_rda order by id`)
    expect(rows[0]).toMatchObject({ serie: 'S-TESTE-1', taxa_calculada: true })
    expect(rows[0].taxa_reacao_mol_cm2_s).toBeCloseTo((12 / 1000 / 40.078 / 60) * 0.25 / Number(rows[0].area_cm2), 15)
    expect(rows[1]).toMatchObject({ taxa_calculada: false, taxa_reacao_mol_cm2_s: 4e-6 })
    expect((await pool.query(`select count(*)::int n from curva_pontos`)).rows[0].n).toBe(5)
    await expect(gravarSerieLaboratorio(sbPg(pool, leitor), { serie: 'X', id_sistema: 'SA01', condicao: {}, pontos: [{ amostra_id: am, rotacao_rpm: 1, taxa_reacao_mol_cm2_s: 1e-6 }] }))
      .rejects.toThrow(/Sem permissão|analise_rda/)
  })
})
