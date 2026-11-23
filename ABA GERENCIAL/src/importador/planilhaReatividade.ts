// Importador e motor de cálculos para Reatividade Estática (t50), 4 Estágios (Triplicata)
// e Absorção Atômica (Ca²⁺, Mg²⁺ e H⁺ residual).
import * as XLSX from 'xlsx'

export interface SondagemImportada {
  ordem: number
  codigo_mini_plug?: string
  massa_inicial_g: number
  tempo_contato_min: number
  massa_final_g: number
  escolhido: boolean
}

export interface PontoImportado {
  estagio_ordem: 1 | 2 | 3 | 4
  fracao_t50: number
  tempo_contato_s: number
  replica: 1 | 2 | 3
  codigo_mini_plug?: string
  massa_inicial_g: number
  massa_final_g: number
  fator_diluicao_ca?: number
  abs_ca?: number
  fator_diluicao_mg?: number
  abs_mg?: number
}

export interface CalibracaoImportada {
  elemento: 'Ca' | 'Mg'
  concentracao_mg_l: number
  absorbancia_med: number
}

export interface MetadadosImportados {
  codigo?: string
  amostra_codigo?: string
  sistema_acido?: string
  geometria?: 'mini_plug' | 'disco'
  modalidade?: 'estatica' | 'dinamica_rda'
  litologia?: 'calcario' | 'dolomita' | 'outro'
  ph_inicial?: number
  h_inicial_mol_l?: number
  volume_solucao_ml?: number
  temperatura_c?: number
  cal_ca_slope?: number
  cal_ca_intercept?: number
}

export interface ResultadoImportacaoReatividade {
  metadados: MetadadosImportados
  sondagens: SondagemImportada[]
  pontos: PontoImportado[]
  calibracao: CalibracaoImportada[]
  avisos: string[]
  erros: string[]
}

export interface EstagioT50 {
  estagio_ordem: 1 | 2 | 3 | 4
  fracao_t50: number
  tempo_contato_s: number
  rotulo_tempo: string
}

export interface CalculoT50 {
  m50: number
  taxaGMin: number
  t50Min: number
  t50Seg: number
  estagios: EstagioT50[]
}

export const MASSA_MOLAR_CA_PADRAO = 40.078
export const MASSA_MOLAR_MG_PADRAO = 24.305
export const CAL_CA_SLOPE_PADRAO = 0.0383
export const CAL_CA_INTERCEPT_PADRAO = 0.0037

export function formatarTempoMinSeg(segundos: number): string {
  const sTot = Math.max(0, Math.round(segundos))
  const mins = Math.floor(sTot / 60)
  const segs = sTot % 60
  return mins > 0 ? `${mins} min ${String(segs).padStart(2, '0')} s` : `${segs} s`
}

export function calcularT50(m0: number, tMin: number, mf: number): CalculoT50 {
  if (!(m0 > 0) || !(tMin > 0) || !(mf < m0)) {
    return { m50: 0, taxaGMin: 0, t50Min: 0, t50Seg: 0, estagios: [] }
  }
  const m50 = m0 / 2
  const taxaGMin = (mf - m0) / tMin
  // valor exato: a inclinação não é arredondada como no rótulo da tendência do Excel
  const t50Min = (m0 * tMin) / (2 * (m0 - mf))
  const t50Seg = Math.round(t50Min * 60)
  const estagios: EstagioT50[] = ([0.25, 0.5, 0.75, 1.0] as const).map((frac, idx) => {
    const tempoS = Math.round(t50Min * frac * 60)
    return {
      estagio_ordem: (idx + 1) as 1 | 2 | 3 | 4,
      fracao_t50: frac,
      tempo_contato_s: tempoS,
      rotulo_tempo: formatarTempoMinSeg(tempoS),
    }
  })
  return { m50, taxaGMin, t50Min, t50Seg, estagios }
}

export function media(vals: number[]): number {
  if (vals.length === 0) return 0
  return vals.reduce((acc, v) => acc + v, 0) / vals.length
}

/** Desvio padrão amostral (ddof = 1), padrão de laboratório e Origin. */
export function desvioPadraoAmostral(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = media(vals)
  const somaQuad = vals.reduce((acc, v) => acc + (v - m) ** 2, 0)
  return Math.sqrt(somaQuad / (vals.length - 1))
}

export function calcularRegressaoLinear(x: number[], y: number[]): { m: number; b: number; r2: number } {
  const n = Math.min(x.length, y.length)
  if (n < 2) return { m: 0, b: 0, r2: 0 }
  const xs = x.slice(0, n)
  const ys = y.slice(0, n)
  const mediaX = media(xs)
  const mediaY = media(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mediaX
    const dy = ys[i] - mediaY
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const m = sxx !== 0 ? sxy / sxx : 0
  const b = mediaY - m * mediaX
  const r2 = sxx !== 0 && syy !== 0 ? (sxy * sxy) / (sxx * syy) : 0
  return { m, b, r2 }
}

export interface ParametrosAA {
  hInicialMolL: number
  calCaSlope: number
  calCaIntercept: number
  calMgSlope?: number | null
  calMgIntercept?: number | null
  massaMolarCa?: number
  massaMolarMg?: number
  incluirMg?: boolean
}

export interface ResumoEstagio {
  estagio_ordem: 1 | 2 | 3 | 4
  rotulo: string
  fracao_t50: number
  tempo_contato_s: number
  n_replicas: number
  perda_media_replicas_pct: number
  perda_razao_medias_pct: number
  perda_dp_pct: number
  ca_media_mol_l: number | null
  ca_dp_mol_l: number
  mg_media_mol_l: number | null
  mg_dp_mol_l: number
  h_media_mol_l: number | null
  h_dp_mol_l: number
}

export function calcularMolaridadeAA(
  abs: number | null | undefined,
  fatorDiluicao: number | null | undefined,
  slope: number | null | undefined,
  intercept: number | null | undefined,
  massaMolar: number,
): number | null {
  if (abs == null || !Number.isFinite(abs) || !slope || slope === 0 || !massaMolar) return null
  const fd = fatorDiluicao != null && Number.isFinite(fatorDiluicao) ? fatorDiluicao : 1
  const cMgL = ((abs - (intercept ?? 0)) / slope) * fd
  return Math.max(0, cMgL / (massaMolar * 1000))
}

export function calcularResumoEstagios(
  pontos: PontoImportado[],
  paramsAA: ParametrosAA,
): ResumoEstagio[] {
  const mmCa = paramsAA.massaMolarCa || MASSA_MOLAR_CA_PADRAO
  const mmMg = paramsAA.massaMolarMg || MASSA_MOLAR_MG_PADRAO

  return ([1, 2, 3, 4] as const).map((ordem) => {
    const grupo = pontos.filter((p) => p.estagio_ordem === ordem)
    const fracao = grupo[0]?.fracao_t50 ?? ordem * 0.25
    const tempoS = grupo.length > 0 ? Math.round(media(grupo.map((p) => p.tempo_contato_s))) : 0
    const perdasIndiv = grupo
      .filter((p) => p.massa_inicial_g > 0)
      .map((p) => ((p.massa_inicial_g - p.massa_final_g) / p.massa_inicial_g) * 100)
    const m0s = grupo.map((p) => p.massa_inicial_g).filter((v) => v > 0)
    const dms = grupo.map((p) => p.massa_inicial_g - p.massa_final_g)
    const somaM0 = m0s.reduce((a, b) => a + b, 0)
    const somaDm = dms.reduce((a, b) => a + b, 0)

    const cas: number[] = []
    const mgs: number[] = []
    const hs: number[] = []

    for (const p of grupo) {
      const ca = calcularMolaridadeAA(p.abs_ca, p.fator_diluicao_ca, paramsAA.calCaSlope, paramsAA.calCaIntercept, mmCa)
      const mg = paramsAA.incluirMg
        ? calcularMolaridadeAA(p.abs_mg, p.fator_diluicao_mg, paramsAA.calMgSlope, paramsAA.calMgIntercept, mmMg)
        : 0
      if (ca != null) {
        cas.push(ca)
        if (paramsAA.incluirMg && mg != null) mgs.push(mg)
        hs.push(paramsAA.hInicialMolL - 2 * (ca + (mg ?? 0)))
      }
    }

    return {
      estagio_ordem: ordem,
      rotulo: `T${ordem} (${(fracao * 100).toFixed(0).replace('.', ',')}%·t50)`,
      fracao_t50: fracao,
      tempo_contato_s: tempoS,
      n_replicas: grupo.length,
      perda_media_replicas_pct: media(perdasIndiv),
      perda_razao_medias_pct: somaM0 > 0 ? (somaDm / somaM0) * 100 : 0,
      perda_dp_pct: desvioPadraoAmostral(perdasIndiv),
      ca_media_mol_l: cas.length > 0 ? media(cas) : null,
      ca_dp_mol_l: desvioPadraoAmostral(cas),
      mg_media_mol_l: paramsAA.incluirMg && mgs.length > 0 ? media(mgs) : null,
      mg_dp_mol_l: paramsAA.incluirMg ? desvioPadraoAmostral(mgs) : 0,
      h_media_mol_l: hs.length > 0 ? media(hs) : null,
      h_dp_mol_l: desvioPadraoAmostral(hs),
    }
  })
}

export interface PontoLogLog {
  estagio_ordem: number
  fracao_t50: number
  n: number
  tempo_medio_s: number
  m0_media_g: number
  mf_media_g: number
  log_tempo: number
  log_m0: number
  log_mf: number
}

/** Por estágio (0,25; 0,50...): médias de tempo, massa inicial e final das réplicas e o log10 de cada média. */
export function calcularLogLog(
  pontos: Pick<PontoImportado, 'estagio_ordem' | 'fracao_t50' | 'tempo_contato_s' | 'massa_inicial_g' | 'massa_final_g'>[],
): PontoLogLog[] {
  const saida: PontoLogLog[] = []
  for (const ordem of [1, 2, 3, 4]) {
    const g = pontos.filter((p) => p.estagio_ordem === ordem && p.tempo_contato_s > 0 && p.massa_inicial_g > 0 && p.massa_final_g > 0)
    if (g.length === 0) continue
    const tempo = media(g.map((p) => p.tempo_contato_s))
    const m0 = media(g.map((p) => p.massa_inicial_g))
    const mf = media(g.map((p) => p.massa_final_g))
    saida.push({
      estagio_ordem: ordem, fracao_t50: g[0].fracao_t50, n: g.length,
      tempo_medio_s: tempo, m0_media_g: m0, mf_media_g: mf,
      log_tempo: Math.log10(tempo), log_m0: Math.log10(m0), log_mf: Math.log10(mf),
    })
  }
  return saida
}

export interface GuiaRdaRotacao {
  rpm: number
  fatorRotacao: number
  tempoSeguroMinS: number
  tempoSeguroMaxS: number
  intervaloColetaS: number
}

/**
 * Estima a janela segura de ensaio em Disco Rotatório (RDA) a partir da cinética estática.
 * Pela lei de Levich (J ∝ ω^(1/2)), o transporte de massa escala com √(RPM / RPM_ref),
 * reduzindo o tempo máximo seguro para evitar cavitação/dissolução excessiva da face do disco.
 */
export function calcularGuiaRda(t50Min: number | null | undefined, taxaDissolucaoPctPorS: number | null | undefined): GuiaRdaRotacao[] {
  const tBaseS =
    t50Min && t50Min > 0
      ? t50Min * 60
      : taxaDissolucaoPctPorS && taxaDissolucaoPctPorS > 0
        ? 50 / taxaDissolucaoPctPorS
        : 0
  if (!(tBaseS > 0)) return []

  const rpms = [100, 300, 500, 750, 1000]
  return rpms.map((rpm) => {
    const fator = Math.sqrt(rpm / 100)
    // Janela recomendada: entre 15% e 45% do t50 ajustado pelo fator de rotação
    const tMin = Math.max(15, Math.round((tBaseS * 0.15) / fator))
    const tMax = Math.max(tMin + 15, Math.round((tBaseS * 0.45) / fator))
    const intervalo = Math.max(5, Math.round(tMax / 6))
    return {
      rpm,
      fatorRotacao: Number(fator.toFixed(2)),
      tempoSeguroMinS: tMin,
      tempoSeguroMaxS: tMax,
      intervaloColetaS: intervalo,
    }
  })
}

function paraNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function textoMinSegParaSegundos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  const mMinSeg = s.match(/(\d+(?:[.,]\d+)?)\s*min(?:\s*e)?\s*(\d+(?:[.,]\d+)?)?\s*s?/)
  if (mMinSeg) {
    const m = Number(mMinSeg[1].replace(',', '.'))
    const seg = mMinSeg[2] ? Number(mMinSeg[2].replace(',', '.')) : 0
    return Math.round(m * 60 + seg)
  }
  const mSeg = s.match(/(\d+(?:[.,]\d+)?)\s*s/)
  if (mSeg) return Math.round(Number(mSeg[1].replace(',', '.')))
  return paraNum(s)
}

export function lerPlanilhaReatividade(buffer: ArrayBuffer): ResultadoImportacaoReatividade {
  const wb = XLSX.read(buffer, { type: 'array' })
  const metadados: MetadadosImportados = {}
  const sondagens: SondagemImportada[] = []
  const pontos: PontoImportado[] = []
  const calibracao: CalibracaoImportada[] = []
  const avisos: string[] = []
  const erros: string[] = []

  // 1. Formato padronizado ("1_Entrada_Pesquisador")
  const abaPadrao = wb.Sheets['1_Entrada_Pesquisador']
  if (abaPadrao) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(abaPadrao, { header: 1 })

    // Bloco A: Metadados (colunas A e B, linhas 4..15 -> índices 3..14)
    for (let r = 3; r < Math.min(16, linhas.length); r++) {
      const row = linhas[r]
      if (!row || !row[0]) continue
      const chave = String(row[0]).toLowerCase()
      const val = row[1]
      if (chave.includes('código') && val) metadados.codigo = String(val).trim()
      else if (chave.includes('amostra') && val) metadados.amostra_codigo = String(val).trim()
      else if (chave.includes('sistema') && val) metadados.sistema_acido = String(val).trim()
      else if (chave.includes('geometria') && val) {
        const g = String(val).toLowerCase()
        metadados.geometria = g.includes('disco') ? 'disco' : 'mini_plug'
      } else if (chave.includes('modalidade') && val) {
        const m = String(val).toLowerCase()
        metadados.modalidade = m.includes('rda') || m.includes('din') ? 'dinamica_rda' : 'estatica'
      } else if (chave.includes('litologia') && val) {
        const l = String(val).toLowerCase()
        metadados.litologia = l.includes('dolom') ? 'dolomita' : l.includes('calc') ? 'calcario' : 'outro'
      } else if (chave.includes('ph')) metadados.ph_inicial = paraNum(val) ?? undefined
      else if (chave.includes('h+')) metadados.h_inicial_mol_l = paraNum(val) ?? undefined
      else if (chave.includes('volume')) metadados.volume_solucao_ml = paraNum(val) ?? undefined
      else if (chave.includes('temp')) metadados.temperatura_c = paraNum(val) ?? undefined
      else if (chave.includes('slope')) metadados.cal_ca_slope = paraNum(val) ?? undefined
      else if (chave.includes('intercept')) metadados.cal_ca_intercept = paraNum(val) ?? undefined
    }

    // Bloco B: Sondagens (linhas 6..14, colunas E..J -> índices 4..9)
    for (let r = 5; r < Math.min(15, linhas.length); r++) {
      const row = linhas[r]
      if (!row) continue
      const m0 = paraNum(row[6])
      const tMin = paraNum(row[7])
      const mf = paraNum(row[8])
      if (m0 == null || tMin == null || mf == null) continue
      if (mf >= m0) {
        erros.push(`Sondagem linha ${r + 1}: massa final (${mf} g) >= massa inicial (${m0} g).`)
        continue
      }
      if (tMin <= 0) {
        erros.push(`Sondagem linha ${r + 1}: tempo de contato deve ser maior que zero.`)
        continue
      }
      sondagens.push({
        ordem: sondagens.length + 1,
        codigo_mini_plug: row[5] ? String(row[5]).trim() : undefined,
        massa_inicial_g: m0,
        tempo_contato_min: tMin,
        massa_final_g: mf,
        escolhido: String(row[9] ?? '').trim().toUpperCase() === 'SIM',
      })
    }

    const escolhida = sondagens.find((s) => s.escolhido) ?? sondagens[0]
    if (escolhida && !sondagens.some((s) => s.escolhido)) {
      escolhida.escolhido = true
      avisos.push('Nenhuma sondagem marcada como "SIM"; a primeira sondagem válida foi selecionada para o t50.')
    }
    const estagiosCalc = escolhida
      ? calcularT50(escolhida.massa_inicial_g, escolhida.tempo_contato_min, escolhida.massa_final_g).estagios
      : null

    // Bloco C: 4 Estágios × 3 Réplicas (a partir da linha 18 -> índice 17, colunas B..K -> índices 1..10)
    const mapaReplica: Record<string, 1 | 2 | 3> = {
      original: 1,
      '1': 1,
      duplicata: 2,
      '2': 2,
      triplicata: 3,
      '3': 3,
    }
    for (let r = 17; r < linhas.length; r++) {
      const row = linhas[r]
      if (!row || !row[1]) continue
      const m0 = paraNum(row[5])
      const mf = paraNum(row[6])
      if (m0 == null || mf == null) continue

      const estNum = Number(String(row[1]).replace(/\D/g, '')) as 1 | 2 | 3 | 4
      if (![1, 2, 3, 4].includes(estNum)) continue

      const frac = paraNum(row[2]) ?? estNum * 0.25
      const repKey = String(row[3] ?? 'original').toLowerCase().trim()
      const replica = mapaReplica[repKey] ?? 1

      if (mf >= m0) {
        erros.push(`Estágio T${estNum} (${repKey}): massa final (${mf} g) >= massa inicial (${m0} g).`)
        continue
      }
      const tempoS = estagiosCalc?.[estNum - 1]?.tempo_contato_s ?? estNum * 45
      pontos.push({
        estagio_ordem: estNum,
        fracao_t50: frac,
        tempo_contato_s: tempoS,
        replica,
        codigo_mini_plug: row[4] ? String(row[4]).trim() : undefined,
        massa_inicial_g: m0,
        massa_final_g: mf,
        fator_diluicao_ca: paraNum(row[7]) ?? 2250,
        abs_ca: paraNum(row[8]) ?? undefined,
        fator_diluicao_mg: paraNum(row[9]) ?? 1,
        abs_mg: paraNum(row[10]) ?? undefined,
      })
    }
    return { metadados, sondagens, pontos, calibracao, avisos, erros }
  }

  // 2. Fallback para planilhas legadas (abas "T50 ...", "Perda de Massa", "Ca e H+")
  const nomeAbaT50 = wb.SheetNames.find((n) => /t\s*50/i.test(n.trim()))
  const nomeAbaPerda = wb.SheetNames.find((n) => /perda\s*de\s*massa|dissolu/i.test(n.trim()))
  const nomeAbaAA = wb.SheetNames.find((n) => /ca\s*e\s*h|absor|aa\b/i.test(n.trim()))

  if (!nomeAbaT50 && !nomeAbaPerda) {
    erros.push('Nenhuma aba "1_Entrada_Pesquisador", "T50..." ou "Perda de Massa" encontrada na planilha.')
    return { metadados, sondagens, pontos, calibracao, avisos, erros }
  }

  avisos.push(
    `Formato legado detectado (${[nomeAbaT50, nomeAbaPerda, nomeAbaAA].filter(Boolean).join(', ')}). Fórmulas antigas foram ignoradas e recalculadas no sistema.`,
  )

  if (nomeAbaT50) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAbaT50], { header: 1 })
    linhas.forEach((row) => {
      if (!row || !/^teste\s*\d+/i.test(String(row[0] ?? '').trim())) return
      const m0 = paraNum(row[1])
      const tMin = paraNum(row[2])
      const mf = paraNum(row[3])
      if (m0 != null && tMin != null && mf != null) {
        if (mf >= m0) {
          erros.push(`Aba "${nomeAbaT50}" (${String(row[0])}): massa final >= massa inicial.`)
          return
        }
        sondagens.push({
          ordem: sondagens.length + 1,
          codigo_mini_plug: String(row[0]).trim(),
          massa_inicial_g: m0,
          tempo_contato_min: tMin,
          massa_final_g: mf,
          escolhido: false,
        })
      }
    })
    if (sondagens.length > 0) {
      // Marca o último teste válido (ou o mais próximo de 50% de perda) como escolhido
      let melhorIdx = sondagens.length - 1
      let menorDiff = Infinity
      sondagens.forEach((s, idx) => {
        const pct = ((s.massa_inicial_g - s.massa_final_g) / s.massa_inicial_g) * 100
        const diff = Math.abs(pct - 50)
        if (diff < menorDiff) {
          menorDiff = diff
          melhorIdx = idx
        }
      })
      sondagens[melhorIdx].escolhido = true
    }
  }

  const escolhida = sondagens.find((s) => s.escolhido) ?? sondagens[0]
  const t50Calc = escolhida
    ? calcularT50(escolhida.massa_inicial_g, escolhida.tempo_contato_min, escolhida.massa_final_g)
    : null

  // Mapa auxiliar de AA da aba "Ca e H+"
  const mapaAA = new Map<string, { fdCa?: number; absCa?: number; fdMg?: number; absMg?: number }>()
  if (nomeAbaAA) {
    const linhasAA = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAbaAA], { header: 1 })
    for (const row of linhasAA) {
      if (!row || !row[0]) continue
      const mEst = String(row[0]).match(/t\s*([1-4])/i)
      if (!mEst) continue
      const est = Number(mEst[1]) as 1 | 2 | 3 | 4
      const repStr = String(row[1] ?? '').toLowerCase()
      const rep: 1 | 2 | 3 = repStr.includes('tri') || repStr === '3' ? 3 : repStr.includes('dup') || repStr === '2' ? 2 : 1
      const fdCa = paraNum(row[2]) ?? 2250
      const absCa = paraNum(row[3]) ?? undefined
      const fdMg = paraNum(row[4]) ?? 1
      const absMg = paraNum(row[5]) ?? undefined
      if (absCa !== undefined || absMg !== undefined) {
        mapaAA.set(`${est}-${rep}`, { fdCa, absCa, fdMg, absMg })
      }
    }
  }

  if (nomeAbaPerda) {
    const linhasP = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAbaPerda], { header: 1 })
    for (let r = 0; r < linhasP.length; r++) {
      const row = linhasP[r]
      if (!row || !row[0]) continue
      const mEst = String(row[0]).trim().match(/^t\s*([1-4])\b/i)
      if (!mEst) continue
      const estNum = Number(mEst[1]) as 1 | 2 | 3 | 4
      const tempoPlanilhaS = textoMinSegParaSegundos(row[1])
      const tempoExatoS = t50Calc?.estagios[estNum - 1]?.tempo_contato_s ?? tempoPlanilhaS ?? estNum * 45

      if (tempoPlanilhaS != null && t50Calc && Math.abs(tempoPlanilhaS - tempoExatoS) >= 5) {
        avisos.push(
          `Estágio T${estNum}: tempo digitado na planilha legada (${formatarTempoMinSeg(tempoPlanilhaS)}) difere do t50 exato (${formatarTempoMinSeg(tempoExatoS)}). Tempo recalculado aplicado.`,
        )
      }

      // Aceita layout horizontal [T1, tempo, m0_1, mf_1, m0_2, mf_2, m0_3, mf_3]
      // ou layout vertical [T1, replica, m0, mf]
      const repTxt = String(row[1] ?? '').toLowerCase()
      if (repTxt.includes('orig') || repTxt.includes('dup') || repTxt.includes('tri')) {
        const rep: 1 | 2 | 3 = repTxt.includes('tri') ? 3 : repTxt.includes('dup') ? 2 : 1
        const m0 = paraNum(row[2])
        const mf = paraNum(row[3])
        if (m0 != null && mf != null && mf < m0) {
          const aa = mapaAA.get(`${estNum}-${rep}`)
          pontos.push({
            estagio_ordem: estNum,
            fracao_t50: estNum * 0.25,
            tempo_contato_s: tempoExatoS,
            replica: rep,
            massa_inicial_g: m0,
            massa_final_g: mf,
            fator_diluicao_ca: aa?.fdCa ?? 2250,
            abs_ca: aa?.absCa,
            fator_diluicao_mg: aa?.fdMg ?? 1,
            abs_mg: aa?.absMg,
          })
        }
      } else {
        for (let repIdx = 0; repIdx < 3; repIdx++) {
          const m0 = paraNum(row[2 + repIdx * 2])
          const mf = paraNum(row[3 + repIdx * 2])
          if (m0 == null || mf == null) continue
          if (mf >= m0) {
            erros.push(`Aba "${nomeAbaPerda}" T${estNum} réplica ${repIdx + 1}: massa final >= massa inicial.`)
            continue
          }
          const rep = (repIdx + 1) as 1 | 2 | 3
          const aa = mapaAA.get(`${estNum}-${rep}`)
          pontos.push({
            estagio_ordem: estNum,
            fracao_t50: estNum * 0.25,
            tempo_contato_s: tempoExatoS,
            replica: rep,
            massa_inicial_g: m0,
            massa_final_g: mf,
            fator_diluicao_ca: aa?.fdCa ?? 2250,
            abs_ca: aa?.absCa,
            fator_diluicao_mg: aa?.fdMg ?? 1,
            abs_mg: aa?.absMg,
          })
        }
      }
    }
  }

  return { metadados, sondagens, pontos, calibracao, avisos, erros }
}
