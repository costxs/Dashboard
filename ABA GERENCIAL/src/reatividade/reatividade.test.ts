// Reatividade: boletim de RDA, Levich → Sc → D, miniplugs da dissolução estática. Só dados fictícios.
// A parte "no banco" roda só com PGPORTA_REAT apontando para um PostgreSQL VAZIO com as migrações 001–023.
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lerArquivoBruto } from '../importador/lerArquivo'
import { sbPg, semearUsuarios } from '../teste/sbPg'
import { areaCorrigida, calcularBoletim, calcularSerie, concentracaoInicialMolL, desvio, media, omega, residuoLevich, schmidtLevich } from './calculoRda'
import { cadastrarEstatica, calcularEGravarSerie, gravarBoletimRda, sistemaDoBoletim } from './gravarRda'
import { lerBoletimRda } from './lerBoletimRda'

const ESPERADO = JSON.parse(readFileSync(new URL('./boletins_rda_esperado.json', import.meta.url), 'utf8'))
const abrir = async (nome: string) => {
  const f = readFileSync(new URL(`./${nome}`, import.meta.url))
  return lerBoletimRda(await lerArquivoBruto(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer))
}
const perto = (a: number | null, b: number, rel = 1e-9) => expect(Math.abs((a as number) - b) / Math.abs(b)).toBeLessThan(rel)

describe('boletim (planilha fictícia no layout do laboratório)', () => {
  it('lê calcita: cabeçalho, condições, calibração e leituras', async () => {
    const b = await abrir('boletim_rda_calcita_ficticio.xlsx')
    expect(b.problemas).toEqual([])
    expect(b).toMatchObject({ codigo: 'RDA901', litologia_texto: 'Indiana', mineral: 'calcita', temperatura_c: 45, rotacao_rpm: 200,
      volume_acido_ml: 750, n_coletas: 10, fluido: 'Ácido acético', conc_wt_pct: 10, data_inicio: '2026-03-04', data_fim: '2026-03-05',
      data_boletim: '2026-03-05', operadores: 'Operador Fictício', comprimento_cm: 1.5 })
    expect(b.entrada).toMatchObject({ diametro_cm: 3.81, porosidade_pct: 16, calCa: { inclinacao: 0.0251, diluicao: 100, massaMolar: 40.078, data: '2026-02-10' }, calMg: null })
    expect(b.entrada!.leituras).toHaveLength(10)
    expect(b.extras).toMatchObject({ Secagem: 'Estufa', 'Pré-tratamento': 'Limpeza das faces' })
  })
  it('calcula a taxa igual à planilha (calcita)', async () => {
    const b = await abrir('boletim_rda_calcita_ficticio.xlsx')
    const r = calcularBoletim(b.entrada!)
    perto(r.taxa_reacao, ESPERADO.calcita.taxa)
    perto(r.taxa_reacao, b.planilha.taxa!)
    perto(r.area_corrigida_cm2, ESPERADO.calcita.area_corrigida)
    perto(b.entrada!.c0_mol_l, ESPERADO.calcita.c0)
    expect(r.taxa_ca_mg).toBeNull()
    expect(r.perda_massa_pct).toBeCloseTo((100 * (40.1234 - 39.9876)) / 40.1234, 10)
    expect(r.r2_h).toBeGreaterThan(0.99)
    expect(r.pontos[3]).toMatchObject({ rotulo: 'RDA901-T3', tempo_s: 360, usado: true })
  })
  it('dolomita: lê a tabela do Mg e dá as duas taxas (só Ca e Ca + Mg)', async () => {
    const b = await abrir('boletim_rda_dolomita_ficticio.xlsx')
    expect(b.mineral).toBe('dolomita')
    expect(b.entrada!.calCa).toMatchObject({ inclinacao: 0.0222, diluicao: 1 })
    expect(b.entrada!.calMg).toMatchObject({ inclinacao: 0.33, diluicao: 25, massaMolar: 24.305, data: '2026-02-11' })
    const r = calcularBoletim(b.entrada!)
    perto(r.taxa_so_ca, ESPERADO.dolomita.taxa_so_ca)
    perto(r.taxa_ca_mg, ESPERADO.dolomita.taxa_ca_mg)
    expect(r.taxa_reacao).toBe(r.taxa_so_ca)                         // a principal é a "só com Ca"
    perto(r.taxa_so_ca, b.planilha.taxa_so_ca!)
  })
  it('janela de tempo e avisos', async () => {
    const b = await abrir('boletim_rda_calcita_ficticio.xlsx')
    const r = calcularBoletim({ ...b.entrada!, tempoMaximo_s: 600 })
    expect(r.n_pontos).toBe(6)
    expect(r.pontos.filter((p) => !p.usado).map((p) => p.tempo_s)).toEqual([900, 1200, 1500, 1800])
    const sujo = calcularBoletim({ ...b.entrada!, leituras: b.entrada!.leituras.map((l, i) => ({ ...l, abs_ca: i === 0 ? l.abs_ca : (i % 2 ? 0.002 : 0.03) })) })
    expect(sujo.avisos.map((a) => a.campo)).toContain('leituras')
    expect(calcularBoletim({ ...b.entrada!, porosidade_pct: null }).avisos.map((a) => a.campo)).toContain('porosidade_pct')
  })
  it('contas de apoio', () => {
    expect(concentracaoInicialMolL(10, 60.052, 1.012)).toBeCloseTo(1.68521, 5)
    expect(areaCorrigida(3.81, 20)).toBeCloseTo(Math.PI * 1.905 ** 2 / 0.8, 12)
    expect(omega(100, 'planilha')).toBe(10.47)
    expect(omega(100)).toBeCloseTo(10.47198, 5)
    expect(media([1, 2, 3, 4])).toBe(2.5)
    expect(desvio([1, 2, 3, 4])).toBeCloseTo(1.2909944, 7)          // = DESVPAD.A
  })
})

describe('Levich estendido → Sc → D', () => {
  it('Sc exato satisfaz a equação (o que o Solver fazia)', () => {
    for (const [slope, c0, nu] of [[1e-5, 0.0044, 0.007], [2e-6, 0.0017, 0.008], [1.5e-5, 0.0043, 0.003]]) {
      const sc = schmidtLevich(slope, c0, nu)!
      expect(residuoLevich(slope, c0, nu, sc)).toBeCloseTo(1, 12)
    }
    expect(schmidtLevich(1, 0.0044, 0.007)).toBeNull()                // slope alto demais: sem solução física
    expect(schmidtLevich(-1e-6, 0.0044, 0.007)).toBeNull()
  })
  it('série com réplicas: média, desvio, reta, Sc, D e Reynolds', () => {
    const disco = (rpm: number, t: number, c: string) => ({ rotacao_rpm: rpm, taxa_reacao: t, codigo: c })
    const s = calcularSerie({
      discos: [disco(100, 3.0e-5, 'A1'), disco(100, 3.2e-5, 'A2'), disco(200, 4.4e-5, 'B1'), disco(200, 4.6e-5, 'B2'), disco(500, 7.0e-5, 'C1'), disco(500, 7.4e-5, 'C2')],
      c0_mol_cm3: 0.0044, viscosidade_cm2_s: 0.007, diametro_cm: 3.81, modoOmega: 'planilha',
    })
    expect(s.porRotacao.map((g) => [g.rotacao_rpm, g.n])).toEqual([[100, 2], [200, 2], [500, 2]])
    s.porRotacao.forEach((g, i) => perto(g.taxa_media, [3.1e-5, 4.5e-5, 7.2e-5][i], 1e-12))
    expect(s.porRotacao[0].taxa_desvio).toBeCloseTo(desvio([3.0e-5, 3.2e-5]), 15)
    expect(s.porRotacao[2].raiz_omega).toBeCloseTo(Math.sqrt(52.35), 12)
    expect(s.r2).toBeGreaterThan(0.99)
    expect(s.d_cm2_s).toBeCloseTo(0.007 / s.sc!, 15)
    expect(s.residuo_levich).toBeCloseTo(1, 10)
    expect(s.reynolds_max).toBeCloseTo((52.35 * 1.905 ** 2) / 0.007, 6)  // Re = ω·r²/ν
    expect(s.avisos).toEqual([])
  })
  it('taxa que não depende da rotação: avisa que o D de Levich não vale', () => {
    const s = calcularSerie({ discos: [{ rotacao_rpm: 100, taxa_reacao: 1.4e-7 }, { rotacao_rpm: 200, taxa_reacao: 1.1e-7 }, { rotacao_rpm: 500, taxa_reacao: 1.8e-7 }],
      c0_mol_cm3: 0.0017, viscosidade_cm2_s: 0.008 })
    expect(s.avisos.map((a) => a.campo)).toEqual(expect.arrayContaining(['r2']))
    const plano = calcularSerie({ discos: [{ rotacao_rpm: 100, taxa_reacao: 1e-7 }, { rotacao_rpm: 200, taxa_reacao: 1.001e-7 }, { rotacao_rpm: 500, taxa_reacao: 1.002e-7 }],
      c0_mol_cm3: 0.0017, viscosidade_cm2_s: 0.008 })
    expect(plano.regime).toBe('reação de superfície')
    const caindo = calcularSerie({ discos: [{ rotacao_rpm: 100, taxa_reacao: 3e-7 }, { rotacao_rpm: 500, taxa_reacao: 1e-7 }], c0_mol_cm3: 0.0017, viscosidade_cm2_s: 0.008 })
    expect(caindo.sc).toBeNull()
    expect(caindo.avisos.some((a) => a.severidade === 'ERRO')).toBe(true)
  })
})

const PORTA = Number(process.env.PGPORTA_REAT)
describe.skipIf(!PORTA)('no banco', () => {
  let pool: pg.Pool, adm: string, leitor: string, prj: string
  const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows
  beforeAll(async () => {
    pool = new pg.Pool({ host: '/tmp', port: PORTA, user: 'postgres', database: 'lcpetro' })
    ;({ adm, leitor } = await semearUsuarios(pool))
    await q(`insert into litologias (nome) values ('Indiana Limestone'), ('Silurian Dolomite') on conflict do nothing`)
    const emp = (await q(`insert into empresas (sigla, nome) values ('TESTE', 'Empresa Teste') returning id`))[0].id
    prj = (await q(`insert into projetos (empresa_id, codigo, nome) values ($1, 'TESTE-REAT', 'Projeto Teste') returning id`, [emp]))[0].id
    await q(`insert into amostras (codigo, projeto_id, litologia, tipo_origem, diametro_cm, comprimento_cm) values ('IL900', $1, 'Indiana Limestone', 'afloramento', 3.8, 7.6)`, [prj])
    await q(`insert into fluidos_prop (componente, massa_molar_g_mol, coef_densidade, n_equivalentes) values ('Ácido acético', 60.05, 0.00125, 1) on conflict do nothing`)
    await q(`insert into sistemas_acidos (nome_sistema, componente_1, valor_1, unidade_1) values ('Ácido acético 10 wt%', 'Ácido acético', 10, 'wt%')`)
  })
  afterAll(async () => { await pool.end() })

  it('miniplug da dissolução estática: código automático, origem e ensaio numa operação', async () => {
    const sb = sbPg(pool, adm)
    expect((await sb.rpc('proximo_codigo_miniplug', {})).data).toBe('MP001')
    const r = await cadastrarEstatica(sb, {
      amostra: { projeto_id: prj, litologia: 'Indiana Limestone', diametro_cm: 1.27, comprimento_cm: 2.5, massa_seca_g: 7.1, amostra_origem: 'IL900' },
      ensaio: { id_sistema: 'SA01', temperatura_c: 25, tempo_min: 60, massa_inicial_g: 7.1, massa_final_g: 6.4, area_cm2: 11.24 },
    })
    expect(r).toMatchObject({ codigo: 'MP001', amostra_nova: true })
    const [a] = await q(`select tipo_amostra, amostra_mae_codigo, finalidade, n_reatividade from v_amostras where codigo = 'MP001'`)
    expect(a).toEqual({ tipo_amostra: 'mini_plug', amostra_mae_codigo: 'IL900', finalidade: 'reatividade estática', n_reatividade: '1' })
    const [e] = await q(`select perda_massa_pct, taxa_dissolucao_g_cm2_min from analise_reatividade_estatica`)
    expect(Number(e.perda_massa_pct)).toBeCloseTo((100 * 0.7) / 7.1, 6)
    expect(Number(e.taxa_dissolucao_g_cm2_min)).toBeCloseTo(0.7 / 11.24 / 60, 9)
    // mesmo código de novo = outro ensaio no mesmo miniplug; código do laboratório também vale
    expect(await cadastrarEstatica(sb, { amostra: { codigo: 'mp001' }, ensaio: { massa_inicial_g: 6.4, massa_final_g: 6.0 } })).toMatchObject({ codigo: 'MP001', amostra_nova: false })
    expect(await cadastrarEstatica(sb, { amostra: { codigo: 'MINI-7', projeto_id: prj, litologia: 'Indiana Limestone' }, ensaio: { massa_inicial_g: 5, massa_final_g: 4.5 } }))
      .toMatchObject({ codigo: 'MINI-7', amostra_nova: true })
    await expect(cadastrarEstatica(sb, { amostra: { projeto_id: prj, litologia: 'Indiana Limestone', amostra_origem: 'XX000' }, ensaio: { massa_inicial_g: 5, massa_final_g: 4 } }))
      .rejects.toThrow(/origem/)
    await expect(cadastrarEstatica(sbPg(pool, leitor), { amostra: { projeto_id: prj, litologia: 'Indiana Limestone' }, ensaio: { massa_inicial_g: 5, massa_final_g: 4 } }))
      .rejects.toThrow(/sem permissão/i)
    await expect(cadastrarEstatica(sb, { amostra: { codigo: 'MP001' }, ensaio: { massa_inicial_g: 5, massa_final_g: 6 } })).rejects.toThrow(/maior que a inicial/)
  })

  it('boletim do disco: atualiza o ensaio "aguardando resultado" e grava as leituras e a curva', async () => {
    const b = await abrir('boletim_rda_calcita_ficticio.xlsx')
    const am = (await q(`insert into amostras (codigo, projeto_id, litologia, tipo_origem, finalidade) values ('RDA901', $1, 'Indiana Limestone', 'afloramento', 'RDA') returning id`, [prj]))[0].id
    await q(`insert into analise_rda (amostra_id, id_sistema, rotacao_rpm, temperatura_c, origem_registro, texto_utilizacao) values ($1, 'SA01', 200, 45, 'controle', 'TR - HAc [10%] - Indiana - 45 °C @200')`, [am])
    expect(sistemaDoBoletim(b)).toMatchObject({ componente_1: 'Ácido acético', valor_1: 10, unidade_1: 'wt%' })
    const r = await gravarBoletimRda(sbPg(pool, adm), { amostra_id: am, id_sistema: 'SA01', serie: 'IL HAc 10% 45 °C', rotacao_rpm: 200, entrada: b.entrada!, boletim: b })
    const linhas = await q(`select origem_registro, situacao, mineral, serie, taxa_reacao_mol_cm2_s, r2_h, operadores, data_ensaio::text, perda_massa_pct, calibracao_ca
                              from v_analise_rda where amostra = 'RDA901'`)
    expect(linhas).toHaveLength(1)                                     // atualizou, não duplicou
    expect(linhas[0]).toMatchObject({ origem_registro: 'controle', situacao: 'com resultado', mineral: 'calcita', serie: 'IL HAc 10% 45 °C', operadores: 'Operador Fictício', data_ensaio: '2026-03-04' })
    perto(linhas[0].taxa_reacao_mol_cm2_s, ESPERADO.calcita.taxa)
    expect(linhas[0].calibracao_ca).toMatchObject({ inclinacao: 0.0251 })
    expect((await q(`select count(*)::int n from rda_leituras where analise_id = $1`, [r.analise_id]))[0].n).toBe(10)
    expect((await q(`select count(*)::int n from curva_pontos`))[0].n).toBe(10)
    // regravar (ex.: mudou a janela) troca as leituras e a curva, sem duplicar
    await gravarBoletimRda(sbPg(pool, adm), { amostra_id: am, id_sistema: 'SA01', serie: 'IL HAc 10% 45 °C', rotacao_rpm: 200, entrada: { ...b.entrada!, tempoMaximo_s: 600 }, boletim: b, analise_id: r.analise_id })
    expect((await q(`select count(*)::int n from rda_leituras where usado`))[0].n).toBe(6)
    expect((await q(`select count(*)::int n from curvas`))[0].n).toBe(1)
    await expect(gravarBoletimRda(sbPg(pool, leitor), { amostra_id: am, id_sistema: 'SA01', rotacao_rpm: 200, entrada: b.entrada! })).rejects.toThrow(/sem permissão|analise_rda/)

    // sincronizarAmostra + incluirCurvasIons grava geometria/massa no disco, petrofísica antes/depois e curvas de íons
    const rSync = await gravarBoletimRda(sbPg(pool, adm), {
      amostra_id: am, id_sistema: 'SA01', serie: 'IL HAc 10% 45 °C', rotacao_rpm: 200,
      permeabilidade_md: 18.5, entrada: b.entrada!, boletim: b, analise_id: r.analise_id,
      sincronizarAmostra: true, incluirCurvasIons: true,
    })
    expect(rSync.amostraAtualizada).toBe(true)
    expect(rSync.petrofisicaSincronizada).toBe(true)
    expect(rSync.nCurvas).toBe(2)
    const [amRow] = await q(`select diametro_cm, comprimento_cm, massa_seca_g, status from amostras where id = $1`, [am])
    expect(Number(amRow.diametro_cm)).toBeCloseTo(3.81, 4)
    expect(Number(amRow.comprimento_cm)).toBeCloseTo(1.5, 4)
    expect(Number(amRow.massa_seca_g)).toBeCloseTo(40.1234, 4)
    expect(amRow.status).toBe('utilizada')
    const petros = await q(`select momento, porosidade_pct, permeabilidade_gas_md, massa_g from analise_petrofisica where amostra_id = $1 order by momento`, [am])
    expect(petros).toHaveLength(2)
    expect(Number(petros[0].porosidade_pct)).toBeCloseTo(16, 4)
    expect(Number(petros[0].permeabilidade_gas_md)).toBeCloseTo(18.5, 4)
    expect(Number(petros[1].massa_g)).toBeCloseTo(39.9876, 4)
  })

  it('série: junta os discos, calcula Sc e D e mostra média e desvio por rotação', async () => {
    const sb = sbPg(pool, adm)
    for (const [cod, rpm, taxa] of [['RDA911', 100, 3.0e-8], ['RDA912', 100, 3.4e-8], ['RDA913', 500, 7.1e-8], ['RDA914', 500, 7.5e-8]] as const) {
      const am = (await q(`insert into amostras (codigo, projeto_id, litologia, tipo_origem, finalidade) values ($1, $2, 'Indiana Limestone', 'afloramento', 'RDA') returning id`, [cod, prj]))[0].id
      await q(`insert into analise_rda (amostra_id, id_sistema, rotacao_rpm, temperatura_c, serie, taxa_reacao_mol_cm2_s, dim_h_in) values ($1, 'SA01', $2, 45, 'IL HAc 10% 45 °C', $3, 1.5)`, [am, rpm, taxa])
    }
    const { id, resultado } = await calcularEGravarSerie(sb, { projeto_id: prj, nome: 'IL HAc 10% 45 °C', litologia: 'Indiana Limestone', id_sistema: 'SA01',
      temperatura_c: 45, c0_mol_cm3: 0.00169, viscosidade_cm2_s: 0.0081, fonte_viscosidade: 'valor fictício de teste' })
    expect(resultado.porRotacao.map((g) => [g.rotacao_rpm, g.n])).toEqual([[100, 2], [200, 1], [500, 2]])   // o RDA901 (200 rpm) entra
    const [s] = await q(`select sc, d_cm2_s, n_discos, por_rotacao, diametro_cm from v_rda_series where id = $1`, [id])
    expect(s.sc).toBeCloseTo(resultado.sc!, 6)
    expect(s.d_cm2_s).toBeCloseTo(0.0081 / resultado.sc!, 15)
    expect(s.n_discos).toBe('5')
    expect(Number(s.diametro_cm)).toBeCloseTo(3.81, 10)
    expect(s.por_rotacao.map((g: { rotacao_rpm: number; n: number }) => [Number(g.rotacao_rpm), g.n])).toEqual([[100, 2], [200, 1], [500, 2]])
    expect(s.por_rotacao[0].taxa_desvio).toBeCloseTo(desvio([3.0e-8, 3.4e-8]), 18)
    // recalcular atualiza a mesma série
    expect((await calcularEGravarSerie(sb, { projeto_id: prj, nome: 'IL HAc 10% 45 °C', c0_mol_cm3: 0.00169, viscosidade_cm2_s: 0.0081 })).id).toBe(id)
    await expect(calcularEGravarSerie(sbPg(pool, leitor), { projeto_id: prj, nome: 'X', c0_mol_cm3: 0.0017, viscosidade_cm2_s: 0.008 })).rejects.toThrow(/sem permissão/i)
  })
})
