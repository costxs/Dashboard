// Discos do laboratório: "Utilização" da planilha de controle -> ensaio RDA ligado à amostra. Dados fictícios.
// A parte "no banco" roda só com PGPORTA_RDA apontando para um PostgreSQL VAZIO com as migrações 001–021.
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sbPg, semearUsuarios } from '../teste/sbPg'
import { gravarSerieLiteratura, lerComposicaoSistema, sistemaDosComponentes } from './cadastroReatividade'
import { lerArquivoBruto } from './lerArquivo'
import { analisarAmostras, encontrarBlocos, lerUtilizacao, type SugestaoRda } from './planilhaAmostras'
import { gravarRdaDosDiscos, lancarResultadoRda, planejarRdaDosDiscos } from './rdaDosDiscos'

const sug = (codigo: string, texto: string, linha = 2): SugestaoRda => ({ _aba: 'Planilha2', _linha: linha, codigo, ...lerUtilizacao(texto) })
const SUGESTOES = [
  sug('RDA901', 'TR - HCl [0,5M] - Indiana - 25 °C @100', 2),
  sug('RDA902', 'TR - HCl [15%] - Sillurian - 60 °C @500', 3),
  sug('RDA903', 'TR - HCl [15%] - Indiana - 60 °C @1000', 4),
  sug('RDA904', 'reservado para ensaio', 5),
  sug('RDA999', 'TR - HCl [0,5M] - Indiana - 25 °C @200', 6),
]
const SA01 = { id_sistema: 'SA01', componente_1: 'HCl', valor_1: 0.5, unidade_1: 'M' }

describe('plano (sem banco)', () => {
  it('da planilha de controle fictícia até o plano', async () => {
    const f = readFileSync(new URL('./controle_rda_ficticio.xlsx', import.meta.url))
    const bruta = await lerArquivoBruto(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer)
    const a = analisarAmostras(encontrarBlocos(bruta), { projetoId: 'p', litologiasExistentes: ['Indiana Limestone', 'Silurian Dolomite'] })
    const p = planejarRdaDosDiscos(a.sugestoesRda, [])
    expect(p.ensaios.map((e) => [e.codigo, e.temperatura_c, e.rotacao_rpm])).toEqual([['RDA911', 25, 100], ['RDA912', 60, 500]])
    expect(p.sistemasNovos.map((s) => s.nome_sistema)).toEqual(['HCl 0,5 M', 'HCl 15 wt%'])
  })

  it('reaproveita sistema existente, junta os novos iguais e avisa o que não deu', () => {
    const p = planejarRdaDosDiscos(SUGESTOES, [SA01])
    expect(p.ensaios.map((e) => [e.codigo, e.id_sistema, e.temperatura_c, e.rotacao_rpm])).toEqual([
      ['RDA901', 'SA01', 25, 100], ['RDA902', null, 60, 500], ['RDA903', null, 60, 1000], ['RDA999', 'SA01', 25, 200],
    ])
    expect(p.sistemasNovos).toEqual([expect.objectContaining({ nome_sistema: 'HCl 15 wt%', componente_1: 'HCl', valor_1: 15, unidade_1: 'wt%' })])
    expect(p.problemas.map((x) => `${x.severidade}:${x.codigo}:${x.campo}`)).toEqual([
      'CORRIGIDO:RDA902:unidade', 'CORRIGIDO:RDA903:unidade', 'AVISO:RDA904:utilizacao',
    ])
  })
  it('"%" pode ficar como está ou virar vol%', () => {
    expect(planejarRdaDosDiscos([SUGESTOES[1]], [], { porcentagem: 'vol%' }).sistemasNovos[0].unidade_1).toBe('vol%')
    const p = planejarRdaDosDiscos([SUGESTOES[1]], [], { porcentagem: '%' })
    expect(p.sistemasNovos[0].unidade_1).toBe('%')
    expect(p.problemas).toEqual([])
  })
})

const PORTA = Number(process.env.PGPORTA_RDA)
describe.skipIf(!PORTA)('no banco', () => {
  let pool: pg.Pool, adm: string, leitor: string
  const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows
  beforeAll(async () => {
    pool = new pg.Pool({ host: '/tmp', port: PORTA, user: 'postgres', database: 'lcpetro' })
    ;({ adm, leitor } = await semearUsuarios(pool))
    await q(`insert into litologias (nome) values ('Indiana Limestone'), ('Silurian Dolomite') on conflict do nothing`)
    const emp = (await q(`insert into empresas (sigla, nome) values ('TESTE', 'Empresa Teste') returning id`))[0].id
    const prj = (await q(`insert into projetos (empresa_id, codigo, nome) values ($1, 'TESTE-RDA', 'Projeto Teste') returning id`, [emp]))[0].id
    for (const [c, l] of [['RDA901', 'Indiana Limestone'], ['RDA902', 'Silurian Dolomite'], ['RDA903', 'Indiana Limestone'], ['RDA904', 'Indiana Limestone']])
      await q(`insert into amostras (codigo, projeto_id, litologia, tipo_origem, finalidade, diametro_cm, comprimento_cm)
               values ($1, $2, $3, 'afloramento', 'RDA', 3.81, 1.2)`, [c, prj, l])
    await q(`insert into sistemas_acidos (nome_sistema, componente_1, valor_1, unidade_1) values ('HCl 0,5 M', 'HCl', 0.5, 'M')`)
  })
  afterAll(async () => { await pool.end() })

  const plano = async () => planejarRdaDosDiscos(SUGESTOES, await q(`select * from sistemas_acidos`))

  it('leitor não vê os discos e não grava nada', async () => {
    const r = await gravarRdaDosDiscos(sbPg(pool, leitor), await plano())
    expect(r.inseridos).toBe(0)
    expect(r.semAmostra).toHaveLength(4)
    expect((await q(`select count(*)::int n from analise_rda`))[0].n).toBe(0)
  })

  it('cria um ensaio por disco, ligado à amostra, e o sistema novo com código do banco', async () => {
    const r = await gravarRdaDosDiscos(sbPg(pool, adm), await plano())
    expect(r).toEqual({ inseridos: 3, atualizados: 0, iguais: 0, sistemasCriados: ['SA02'], semAmostra: ['RDA999'] })
    const rows = await q(`select amostra, id_sistema, temperatura_c, rotacao_rpm, origem_registro, situacao, texto_utilizacao
                            from v_analise_rda order by amostra`)
    expect(rows.map((x) => [x.amostra, x.id_sistema, Number(x.temperatura_c), Number(x.rotacao_rpm), x.origem_registro, x.situacao])).toEqual([
      ['RDA901', 'SA01', 25, 100, 'controle', 'aguardando resultado'],
      ['RDA902', 'SA02', 60, 500, 'controle', 'aguardando resultado'],
      ['RDA903', 'SA02', 60, 1000, 'controle', 'aguardando resultado'],
    ])
    expect((await q(`select n_rda from v_amostras where codigo = 'RDA901'`))[0].n_rda).toBe('1')
  })

  it('reimportar não duplica; mudar o texto atualiza só as condições e mantém a taxa lançada', async () => {
    expect(await gravarRdaDosDiscos(sbPg(pool, adm), await plano())).toMatchObject({ inseridos: 0, atualizados: 0, iguais: 3, sistemasCriados: [] })
    await q(`update analise_rda set taxa_reacao_mol_cm2_s = 2.5e-6 from amostras a where a.id = analise_rda.amostra_id and a.codigo = 'RDA901'`)
    const outro = planejarRdaDosDiscos([sug('RDA901', 'TR - HCl [0,5M] - Indiana - 25 °C @150')], await q(`select * from sistemas_acidos`))
    expect(await gravarRdaDosDiscos(sbPg(pool, adm), outro)).toMatchObject({ inseridos: 0, atualizados: 1 })
    const [x] = await q(`select rotacao_rpm, taxa_reacao_mol_cm2_s, situacao from v_analise_rda where amostra = 'RDA901'`)
    expect([Number(x.rotacao_rpm), x.taxa_reacao_mol_cm2_s, x.situacao]).toEqual([150, 2.5e-6, 'com resultado'])
    // no gráfico lab × literatura só entra quem tem taxa
    expect((await q(`select id from v_rda_comparacao where fonte = 'lcpetro'`))).toHaveLength(1)   // RDA901
  })

  it('lançar resultado pela curva de cálcio atualiza o mesmo ensaio', async () => {
    const [x] = await q(`select r.id from analise_rda r join amostras a on a.id = r.amostra_id where a.codigo = 'RDA902'`)
    await expect(lancarResultadoRda(sbPg(pool, adm), x.id, {})).rejects.toThrow(/taxa ou a curva/)
    const r = await lancarResultadoRda(sbPg(pool, adm), x.id, {
      curva_calcio: [0, 5, 10, 15].map((t) => ({ tempo_min: t, ca_mg_l: 1 + 8 * t })), volume_acido_ml: 250, dim_h_in: 1.5, serie: 'RDA902-S1',
    })
    expect(r.calculada).toBe(true)
    const rows = await q(`select taxa_calculada, situacao, serie from v_analise_rda where amostra = 'RDA902'`)
    expect(rows).toEqual([{ taxa_calculada: true, situacao: 'com resultado', serie: 'RDA902-S1' }])
    expect((await q(`select count(*)::int n from curva_pontos`))[0].n).toBe(4)
  })

  it('literatura (LIT-0001) aparece no banco de amostras e na ficha do disco como comparável', async () => {
    const r = await gravarSerieLiteratura(sbPg(pool, adm), {
      publicacao: { autor: 'Autor Fictício et al.', ano: '2020' },
      rocha: { litologia: 'Indiana Limestone', composicao_texto: '[Calcita] > 99 %' },
      sistema: sistemaDosComponentes(lerComposicaoSistema('[HCl]=0,5 M').componentes),
      condicao: { temperatura_c: 25, pressao_psi: 1000, obtencao_dado: 'tabelado' },
      pontos: [100, 400].map((rpm) => ({ rotacao_rpm: rpm, taxa_reacao_mol_cm2_s: 1e-6 * Math.sqrt(rpm) })),
    })
    expect(r).toMatchObject({ id_sistema: 'SA01', ids: ['LIT-0001', 'LIT-0002'] })

    const banco = await q(`select fonte, codigo, status, n_rda, n_rda_com_resultado, referencia from v_banco_amostras order by fonte, codigo`)
    expect(banco.filter((b) => b.fonte === 'laboratorio').map((b) => b.codigo)).toEqual(['RDA901', 'RDA902', 'RDA903', 'RDA904'])
    expect(banco.filter((b) => b.fonte === 'literatura')).toEqual([
      { fonte: 'literatura', codigo: 'RCH-01 · REF-R01', status: 'sem disco físico', n_rda: '2', n_rda_com_resultado: '2', referencia: 'Autor Fictício et al. (2020)' },
    ])
    // o leitor (sem projeto) vê a literatura, mas não as amostras do projeto
    const doLeitor = await sbPg(pool, leitor).from('v_banco_amostras').select('fonte')
    expect((doLeitor.data as { fonte: string }[]).map((x) => x.fonte)).toEqual(['literatura'])

    const am = (await q(`select id from amostras where codigo = 'RDA901'`))[0].id
    const comp = await sbPg(pool, adm).rpc('rda_literatura_comparavel', { p_amostra: am })
    expect((comp.data as Record<string, unknown>[]).map((c) => [c.id_ensaio, c.mesmo_acido, c.mesma_temperatura])).toEqual([
      ['LIT-0001', true, true], ['LIT-0002', true, true],
    ])
    const am2 = (await q(`select id from amostras where codigo = 'RDA902'`))[0].id   // outra rocha
    expect((await sbPg(pool, adm).rpc('rda_literatura_comparavel', { p_amostra: am2 })).data).toEqual([])
  })
})
