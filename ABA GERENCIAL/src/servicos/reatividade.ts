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
