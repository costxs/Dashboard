import { supabase, tratarErro } from '../lib/supabase'
import { URL_GRAFICOS } from './graficos'
import type {
  ConfigGraficoReatividade,
  ReatividadeCalibracaoAa,
  ReatividadeCalibracaoAaGravavel,
  ReatividadeEnsaio,
  ReatividadeEnsaioGravavel,
  ReatividadePonto,
  ReatividadePontoGravavel,
  ReatividadeSondagem,
  ReatividadeSondagemGravavel,
} from '../tipos/banco'

export interface EnsaioReatividadeCompleto {
  ensaio: ReatividadeEnsaio
  sondagens: ReatividadeSondagem[]
  pontos: ReatividadePonto[]
  calibracao: ReatividadeCalibracaoAa[]
}

export interface EstiloOriginPayload {
  titulo?: string | null
  eixo_x?: string | null
  eixo_y?: string | null
  eixo_y2?: string | null
  fonte?: 'Arial' | 'Times New Roman' | 'Calibri' | 'DejaVu Sans'
  tamanho_fonte?: number
  largura_cm?: number
  altura_cm?: number
  dpi?: number
  formato?: 'png' | 'svg' | 'pdf'
  mostrar_barras_erro?: boolean
  mostrar_reta_ajuste?: boolean
  legend_xy?: [number, number] | null
  legend_loc?: string
  legend_frame?: boolean
  legend_fontsize?: number
  legend_ncol?: number
}

export async function listarEnsaiosReatividade(amostraId?: string): Promise<ReatividadeEnsaio[]> {
  let q = supabase.from('reatividade_ensaios').select('*').order('created_at', { ascending: false })
  if (amostraId) q = q.eq('amostra_id', amostraId)
  const { data, error } = await q
  if (error) throw new Error(`Erro ao listar ensaios de reatividade: ${tratarErro(error)}`)
  return (data ?? []) as ReatividadeEnsaio[]
}

export async function obterEnsaioReatividadeCompleto(ensaioId: string): Promise<EnsaioReatividadeCompleto | null> {
  const [rEns, rSond, rPts, rCal] = await Promise.all([
    supabase.from('reatividade_ensaios').select('*').eq('id', ensaioId).maybeSingle(),
    supabase.from('reatividade_sondagem_t50').select('*').eq('ensaio_id', ensaioId).order('ordem'),
    supabase
      .from('reatividade_pontos')
      .select('*')
      .eq('ensaio_id', ensaioId)
      .order('estagio_ordem')
      .order('replica'),
    supabase
      .from('reatividade_calibracao_aa')
      .select('*')
      .eq('ensaio_id', ensaioId)
      .order('elemento')
      .order('concentracao_mg_l'),
  ])
  if (rEns.error) throw new Error(`Erro ao carregar ensaio: ${tratarErro(rEns.error)}`)
  if (!rEns.data) return null
  if (rSond.error) throw new Error(`Erro ao carregar sondagens: ${tratarErro(rSond.error)}`)
  if (rPts.error) throw new Error(`Erro ao carregar pontos: ${tratarErro(rPts.error)}`)
  if (rCal.error) throw new Error(`Erro ao carregar calibração AA: ${tratarErro(rCal.error)}`)

  return {
    ensaio: rEns.data as ReatividadeEnsaio,
    sondagens: (rSond.data ?? []) as ReatividadeSondagem[],
    pontos: (rPts.data ?? []) as ReatividadePonto[],
    calibracao: (rCal.data ?? []) as ReatividadeCalibracaoAa[],
  }
}

export async function listarPontosPorEnsaios(ensaioIds: string[]): Promise<ReatividadePonto[]> {
  if (ensaioIds.length === 0) return []
  const { data, error } = await supabase
    .from('reatividade_pontos')
    .select('*')
    .in('ensaio_id', ensaioIds)
    .order('estagio_ordem')
    .order('replica')
  if (error) throw new Error(`Erro ao carregar pontos para comparação: ${tratarErro(error)}`)
  return (data ?? []) as ReatividadePonto[]
}

export async function salvarEnsaioReatividade(
  ensaioId: string | null,
  dados: ReatividadeEnsaioGravavel,
  sondagens: Omit<ReatividadeSondagemGravavel, 'ensaio_id'>[],
  pontos: Omit<ReatividadePontoGravavel, 'ensaio_id'>[],
  calibracao: Omit<ReatividadeCalibracaoAaGravavel, 'ensaio_id'>[],
): Promise<EnsaioReatividadeCompleto> {
  const payload = { ...dados }
  if (!payload.codigo || !payload.codigo.trim()) delete payload.codigo

  let ensaioSalvo: ReatividadeEnsaio
  if (ensaioId) {
    const { data, error } = await supabase
      .from('reatividade_ensaios')
      .update(payload)
      .eq('id', ensaioId)
      .select()
      .single()
    if (error) throw new Error(`Não foi possível atualizar o ensaio. ${tratarErro(error)}`)
    ensaioSalvo = data as ReatividadeEnsaio
  } else {
    const { data, error } = await supabase
      .from('reatividade_ensaios')
      .insert(payload)
      .select()
      .single()
    if (error) throw new Error(`Não foi possível criar o ensaio. ${tratarErro(error)}`)
    ensaioSalvo = data as ReatividadeEnsaio
  }

  const id = ensaioSalvo.id

  // Substitui sondagens
  const delSond = await supabase.from('reatividade_sondagem_t50').delete().eq('ensaio_id', id)
  if (delSond.error) throw new Error(`Erro ao limpar sondagens: ${tratarErro(delSond.error)}`)
  let sondSalvas: ReatividadeSondagem[] = []
  if (sondagens.length > 0) {
    const r = await supabase
      .from('reatividade_sondagem_t50')
      .insert(sondagens.map((s) => ({ ...s, ensaio_id: id })))
      .select()
      .order('ordem')
    if (r.error) throw new Error(`Erro ao salvar sondagens: ${tratarErro(r.error)}`)
    sondSalvas = (r.data ?? []) as ReatividadeSondagem[]
  }

  // Substitui pontos (4 estágios × 3 réplicas)
  const delPts = await supabase.from('reatividade_pontos').delete().eq('ensaio_id', id)
  if (delPts.error) throw new Error(`Erro ao limpar pontos: ${tratarErro(delPts.error)}`)
  let ptsSalvos: ReatividadePonto[] = []
  if (pontos.length > 0) {
    const r = await supabase
      .from('reatividade_pontos')
      .insert(pontos.map((p) => ({ ...p, ensaio_id: id })))
      .select()
      .order('estagio_ordem')
      .order('replica')
    if (r.error) throw new Error(`Erro ao salvar pontos de dissolução: ${tratarErro(r.error)}`)
    ptsSalvos = (r.data ?? []) as ReatividadePonto[]
  }

  // Substitui calibração AA
  const delCal = await supabase.from('reatividade_calibracao_aa').delete().eq('ensaio_id', id)
  if (delCal.error) throw new Error(`Erro ao limpar calibração AA: ${tratarErro(delCal.error)}`)
  let calSalvas: ReatividadeCalibracaoAa[] = []
  if (calibracao.length > 0) {
    const r = await supabase
      .from('reatividade_calibracao_aa')
      .insert(calibracao.map((c) => ({ ...c, ensaio_id: id })))
      .select()
    if (r.error) throw new Error(`Erro ao salvar curva de calibração AA: ${tratarErro(r.error)}`)
    calSalvas = (r.data ?? []) as ReatividadeCalibracaoAa[]
  }

  return {
    ensaio: ensaioSalvo,
    sondagens: sondSalvas,
    pontos: ptsSalvos,
    calibracao: calSalvas,
  }
}

// -----------------------------------------------------------------------------
// Mini-plugs (027): cada réplica/teste piloto é uma amostra da categoria mini_plug
// -----------------------------------------------------------------------------

/** Código normalizado como o cadastro de amostras grava (sem espaços nas pontas, maiúsculas). */
export function normalizarCodigoAmostra(codigo: string | null | undefined): string {
  return (codigo ?? '').trim().toUpperCase()
}

export interface AmostraEncontrada {
  id: string
  codigo: string
  tipo_amostra: string | null
  projeto_id: string
}

/** Amostras já cadastradas com estes códigos (só as que a pessoa enxerga). Chave = código normalizado. */
export async function buscarAmostrasPorCodigos(codigos: string[]): Promise<Map<string, AmostraEncontrada>> {
  const lista = [...new Set(codigos.map(normalizarCodigoAmostra).filter(Boolean))]
  const mapa = new Map<string, AmostraEncontrada>()
  if (lista.length === 0) return mapa
  const { data, error } = await supabase
    .from('v_amostras')
    .select('id, codigo, tipo_amostra, projeto_id')
    .in('codigo', lista)
  if (error) throw new Error(`Erro ao procurar os mini-plugs: ${tratarErro(error)}`)
  for (const a of (data ?? []) as AmostraEncontrada[]) mapa.set(normalizarCodigoAmostra(a.codigo), a)
  return mapa
}

export interface RochaDeOrigem {
  id: string
  codigo: string
  projeto_id: string
  litologia: string
  tipo_origem: 'afloramento' | 'testemunho'
  afloramento_local?: string | null
  fornecedor?: string | null
  bacia?: string | null
  campo?: string | null
  poco?: string | null
  reservatorio?: string | null
}

/**
 * Cadastra mini-plugs novos, cortados da rocha do ensaio: herdam projeto, litologia e origem
 * e entram como "utilizada" na reatividade estática. `massas` = m₀ de cada código (massa seca).
 */
export async function cadastrarMiniPlugs(
  codigos: string[],
  rocha: RochaDeOrigem,
  massas: Map<string, number>,
  ensaioCodigo: string | null,
): Promise<Map<string, AmostraEncontrada>> {
  const lista = [...new Set(codigos.map(normalizarCodigoAmostra).filter(Boolean))]
  const mapa = new Map<string, AmostraEncontrada>()
  if (lista.length === 0) return mapa
  const linhas = lista.map((codigo) => ({
    codigo,
    projeto_id: rocha.projeto_id,
    litologia: rocha.litologia,
    tipo_origem: rocha.tipo_origem,
    afloramento_local: rocha.afloramento_local ?? null,
    fornecedor: rocha.fornecedor ?? null,
    bacia: rocha.bacia ?? null,
    campo: rocha.campo ?? null,
    poco: rocha.poco ?? null,
    reservatorio: rocha.reservatorio ?? null,
    massa_seca_g: massas.get(codigo) ?? null,
    finalidade: 'reatividade estática',
    status: 'utilizada' as const,
    tipo_amostra: 'mini_plug' as const,
    amostra_mae_id: rocha.id,
    observacoes: `Mini-plug cortado de ${rocha.codigo}${ensaioCodigo ? `, usado no ensaio ${ensaioCodigo}` : ''}.`,
  }))
  const { data, error } = await supabase.from('amostras').insert(linhas).select('id, codigo, tipo_amostra, projeto_id')
  if (error) throw new Error(`Não foi possível cadastrar os mini-plugs. ${tratarErro(error)}`)
  for (const a of (data ?? []) as AmostraEncontrada[]) mapa.set(normalizarCodigoAmostra(a.codigo), a)
  return mapa
}

export interface EnsaioDaAmostra {
  ensaio: ReatividadeEnsaio
  /** 'rocha' = amostra escolhida no ensaio; 'mini_plug' = usada numa réplica/teste piloto */
  papeis: Array<'rocha' | 'mini_plug'>
}

/** Ensaios de dissolução estática em que a amostra aparece (como rocha ou como mini-plug). */
export async function listarEnsaiosDaAmostra(amostraId: string): Promise<EnsaioDaAmostra[]> {
  const vinc = await supabase
    .from('v_reatividade_ensaios_amostra')
    .select('ensaio_id, papel')
    .eq('amostra_id', amostraId)
  let ligacoes: Array<{ ensaio_id: string; papel: 'rocha' | 'mini_plug' }>
  if (vinc.error) {
    // banco ainda sem a 027: só os ensaios em que ela é a rocha
    const r = await supabase.from('reatividade_ensaios').select('id').eq('amostra_id', amostraId)
    if (r.error) throw new Error(`Erro ao listar ensaios de reatividade: ${tratarErro(r.error)}`)
    ligacoes = (r.data ?? []).map((e: { id: string }) => ({ ensaio_id: e.id, papel: 'rocha' as const }))
  } else {
    ligacoes = (vinc.data ?? []) as typeof ligacoes
  }
  const ids = [...new Set(ligacoes.map((l) => l.ensaio_id))]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('reatividade_ensaios')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao listar ensaios de reatividade: ${tratarErro(error)}`)
  return ((data ?? []) as ReatividadeEnsaio[]).map((ensaio) => ({
    ensaio,
    papeis: [...new Set(ligacoes.filter((l) => l.ensaio_id === ensaio.id).map((l) => l.papel))],
  }))
}

export async function atualizarConfigGraficoReatividade(
  ensaioId: string,
  config: ConfigGraficoReatividade,
): Promise<ReatividadeEnsaio> {
  const { data, error } = await supabase
    .from('reatividade_ensaios')
    .update({ config_grafico: config })
    .eq('id', ensaioId)
    .select()
    .single()
  if (error) throw new Error(`Não foi possível salvar a posição da legenda. ${tratarErro(error)}`)
  return data as ReatividadeEnsaio
}

export async function excluirEnsaioReatividade(ensaioId: string): Promise<void> {
  const { data, error } = await supabase
    .from('reatividade_ensaios')
    .delete()
    .eq('id', ensaioId)
    .select('id')
  if (error) throw new Error(`Não foi possível excluir o ensaio. ${tratarErro(error)}`)
  if (!data || data.length === 0) {
    throw new Error('Nada foi apagado: o ensaio não existe mais ou seu usuário não tem permissão de editor.')
  }
}

// ============================================================================
// Integração com o serviço Python de gráficos Origin (/reatividade/*)
// ============================================================================

async function postarServicoReatividade(caminho: string, corpo: unknown, sinal?: AbortSignal): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cab: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) cab.Authorization = `Bearer ${session.access_token}`

  const r = await fetch(`${URL_GRAFICOS}${caminho}`, {
    method: 'POST',
    headers: cab,
    body: JSON.stringify(corpo),
    signal: sinal,
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    let detalhe = txt
    try {
      const parsed = JSON.parse(txt)
      if (parsed?.detail) detalhe = String(parsed.detail)
    } catch {
      /* texto puro */
    }
    throw new Error(detalhe || `Serviço de gráficos respondeu HTTP ${r.status}`)
  }
  return await r.blob()
}

export function gerarGraficoT50Blob(
  corpo: { m0_g: number; tempo_min: number; mf_g: number; estilo: EstiloOriginPayload },
  sinal?: AbortSignal,
): Promise<Blob> {
  return postarServicoReatividade('/reatividade/grafico-t50', corpo, sinal)
}

export interface SeriePerdaMassaPayload {
  nome: string
  cor: string
  marcador: string
  estilo_linha: string
  x_valores: number[]
  y_medias_pct: number[]
  y_desvios_pct: number[]
  incluir_zero_na_reta?: boolean
}

export function gerarGraficoPerdaMassaBlob(
  corpo: { series: SeriePerdaMassaPayload[]; estilo: EstiloOriginPayload },
  sinal?: AbortSignal,
): Promise<Blob> {
  return postarServicoReatividade('/reatividade/grafico-perda-massa', corpo, sinal)
}

export function gerarGraficoAABlob(
  corpo: {
    rotulos_x: string[]
    ca_medias_mol_l: number[]
    ca_desvios_mol_l: number[]
    mg_medias_mol_l?: number[] | null
    mg_desvios_mol_l?: number[] | null
    h_medias_mol_l: number[]
    h_desvios_mol_l: number[]
    estilo: EstiloOriginPayload
  },
  sinal?: AbortSignal,
): Promise<Blob> {
  return postarServicoReatividade('/reatividade/grafico-absorcao-atomica', corpo, sinal)
}

export function exportarExcelReatividadeBlob(corpo: Record<string, unknown>): Promise<Blob> {
  return postarServicoReatividade('/reatividade/exportar-excel', corpo)
}
