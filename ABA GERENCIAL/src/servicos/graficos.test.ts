import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerArquivoBruto } from '../importador/lerArquivo'
import { lerEnsaios, tratarPermeabilidade } from '../importador/tratamentoPermeabilidade'
import { crc32, montarZip } from '../utils/zip'
import { CONFIG_PADRAO, CORES_ORIGIN, configDoBanco, configParaGravar, etapaGrafico, montarPedido } from './graficos'

const f = readFileSync(new URL('../importador/permeabilidade_ficticio.xlsx', import.meta.url))
const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer

async function dados() {
  const [e] = lerEnsaios(await lerArquivoBruto(buf))
  const r = tratarPermeabilidade(e)
  return { leituras: e.leituras, etapas: r.etapas, usadas: new Set([1, 2, 3]), comprimento_cm: 7.32, diametro_cm: 3.79, viscosidade_cp: 0.89 }
}

describe('pedido ao serviço de gráficos', () => {
  it('monta leituras, etapas com as escolhas da pessoa e a config', async () => {
    const d = await dados()
    const c = { ...CONFIG_PADRAO, titulo: ' Ensaio ', xlim: [0, 900] as [number, number], etapas: { 2: { cor: '#123456', marcador: 's' } } }
    const p = montarPedido(d, c, 'combinado', 'png', 110)
    expect(p.leituras[0]).toEqual({ t: d.leituras[0].tempo_s, dp: d.leituras[0].dp, q: d.leituras[0].q })
    expect(p.etapas.map((e) => e.cor)).toEqual(['#000000', '#123456', '#0000FF'])
    expect(p.etapas[1]).toMatchObject({ ordem: 2, q: 4, marcador: 's', rotulo: null, visivel: true, usada: true })
    expect(p.config).toMatchObject({ modo: 'combinado', continuo: true, sobrepor: false, dpi: 110, titulo: 'Ensaio', xlim: [0, 900], ylim: null })
  })

  it('ΔP × Q não herda título, eixo X nem limites do gráfico de tempo', async () => {
    const c = { ...CONFIG_PADRAO, titulo: 'X', eixo_x: 'Tempo (min)', xlim: [0, 10] as [number, number] }
    const p = montarPedido(await dados(), c, 'darcy', 'svg', 72)
    expect(p.config).toMatchObject({ modo: 'darcy', titulo: null, eixo_x: 'Tempo (s)', xlim: null, ylim: null, comprimento_cm: 7.32 })
  })

  it('config gravada tem todas as etapas e volta igual do banco', async () => {
    const d = await dados()
    const gravada = configParaGravar({ ...CONFIG_PADRAO, etapas: { 3: { rotulo: 'alta' } } }, d.etapas)
    expect(Object.keys(gravada.etapas)).toEqual(['1', '2', '3'])
    expect(gravada.etapas['3']).toEqual({ cor: CORES_ORIGIN[2], rotulo: 'alta', marcador: '', visivel: true })
    const lida = configDoBanco(JSON.parse(JSON.stringify(gravada)))!
    expect(etapaGrafico(lida, 3, 2).rotulo).toBe('alta')
    expect(configDoBanco(null)).toBeNull()
    expect(configDoBanco({ outra: 1 })).toBeNull()
  })

  // gera o pedido do arquivo fictício para conferir no serviço Python (curl), se pedido
  it.runIf(process.env.PEDIDO_GRAFICOS)('grava o pedido de exemplo', async () => {
    const d = await dados()
    for (const modo of ['combinado', 'darcy'] as const) {
      writeFileSync(`${process.env.PEDIDO_GRAFICOS}/pedido_${modo}.json`, JSON.stringify(montarPedido(d, CONFIG_PADRAO, modo, 'png', 110)))
    }
    // o mesmo pedido que a tela manda para /permeabilidade/planilha-etapas
    writeFileSync(`${process.env.PEDIDO_GRAFICOS}/pedido_planilha.json`, JSON.stringify({
      etapas: d.etapas.map((e) => ({
        ordem: e.ordem, q: e.q, j_inicio: e.j_inicio_s, j_fim: e.j_fim_s, dp_medio: e.dp_medio, dp_desvio: e.dp_desvio,
        n_pontos: e.n_pontos, volume_injetado_cm3: e.volume_injetado_cm3, volume_bombeado_cm3: e.volume_bombeado_cm3,
        k_md: e.k_md, usada: true,
      })),
      metodo_k: 'ajuste ΔP × Q', comprimento_cm: 7.32, diametro_cm: 3.79, viscosidade_cp: 0.89,
    }))
  })
})

describe('zip', () => {
  it('crc32 confere com o valor de referência', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('monta um zip com os arquivos na ordem, sem compressão', async () => {
    const z = new Uint8Array(await (await montarZip([
      { nome: 'a.txt', dados: new Blob(['olá']) }, { nome: 'gráfico.svg', dados: new Blob(['<svg/>']) },
    ])).arrayBuffer())
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    const fim = z.length - 22
    expect(v.getUint32(fim, true)).toBe(0x06054b50)
    expect(v.getUint16(fim + 10, true)).toBe(2)
    const central = v.getUint32(fim + 16, true)
    expect(v.getUint32(central, true)).toBe(0x02014b50)
    if (process.env.PEDIDO_GRAFICOS) writeFileSync(`${process.env.PEDIDO_GRAFICOS}/teste.zip`, z)
  })
})
