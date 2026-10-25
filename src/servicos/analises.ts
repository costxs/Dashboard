import { BUCKET_ARQUIVOS, supabase, verificar } from '../lib/supabase'
import type { ConfigAnalise } from '../config/analises'
import type { AcidificacaoFase, Arquivo, Curva, PermeabilidadeEtapa, PontoCurva, RegistroAnalise } from '../tipos/banco'

// ---------------------------------------------------------------------------
// Análises (as 8 tabelas analise_* seguem o mesmo padrão)
// ---------------------------------------------------------------------------
export async function listarRegistros(cfg: ConfigAnalise, amostraId: string): Promise<RegistroAnalise[]> {
  return verificar(
    await supabase.from(cfg.tabela).select('*').eq('amostra_id', amostraId)
      .order('data_ensaio', { ascending: false, nullsFirst: false }).order('id', { ascending: false }),
  )
}

/** Remove campos calculados e metadados antes de gravar. */
function soCamposEditaveis(cfg: ConfigAnalise, dados: Record<string, unknown>) {
  const permitidos = new Set(cfg.campos.map((c) => c.nome))
  return Object.fromEntries(Object.entries(dados).filter(([k]) => permitidos.has(k)))
}

export async function salvarRegistro(cfg: ConfigAnalise, amostraId: string, dados: Record<string, unknown>, id?: number) {
  const linha = { ...soCamposEditaveis(cfg, dados), amostra_id: amostraId }
  const q = id
    ? supabase.from(cfg.tabela).update(linha).eq('id', id)
    : supabase.from(cfg.tabela).insert(linha)
  return verificar<RegistroAnalise>(await q.select().single())
}

export async function apagarRegistro(cfg: ConfigAnalise, id: number) {
  verificar(await supabase.from(cfg.tabela).delete().eq('id', id))
}

// ---- tabelas-filhas (fases DRX, componentes petrografia, EDS) ----
export async function listarFilhos(cfg: ConfigAnalise, analiseId: number) {
  if (!cfg.filha) return []
  return verificar<Record<string, unknown>[]>(
    await supabase.from(cfg.filha.tabela).select('*').eq('analise_id', analiseId),
  )
}

/** Substitui todas as linhas-filhas de uma análise pelas informadas. */
export async function salvarFilhos(cfg: ConfigAnalise, analiseId: number, linhas: Record<string, unknown>[]) {
  if (!cfg.filha) return
  verificar(await supabase.from(cfg.filha.tabela).delete().eq('analise_id', analiseId))
  const validas = linhas.filter((l) => cfg.filha!.chave.every((k) => l[k] != null && l[k] !== ''))
  if (validas.length) {
    verificar(await supabase.from(cfg.filha.tabela).insert(validas.map((l) => ({ ...l, analise_id: analiseId }))))
  }
}

// ---- etapas de vazão do tratamento de permeabilidade (petrofísica) ----
export async function listarEtapasPermeabilidade(analiseId: number): Promise<PermeabilidadeEtapa[]> {
  const r = await supabase.from('permeabilidade_etapas').select('*').eq('analise_id', analiseId).order('ordem')
  // banco ainda sem a migração 015 (tabela não existe): a ficha segue sem o cartão de etapas
  if (r.error && ['42P01', 'PGRST205'].includes(r.error.code)) return []
  return verificar<PermeabilidadeEtapa[]>(r)
}

// ---- fases do tratamento de acidificação (coreflooding) ----
export async function listarFasesAcidificacao(analiseId: number): Promise<AcidificacaoFase[]> {
  const r = await supabase.from('acidificacao_fases').select('*').eq('analise_id', analiseId).order('ordem')
  // banco ainda sem a migração 018 (tabela não existe): a ficha segue sem o cartão de fases
  if (r.error && ['42P01', 'PGRST205'].includes(r.error.code)) return []
  return verificar<AcidificacaoFase[]>(r)
}

// ---------------------------------------------------------------------------
// Curvas (ΔP × PV, massa × tempo, difratograma)
// ---------------------------------------------------------------------------
export async function listarCurvas(analiseTabela: string, analiseId: number): Promise<Curva[]> {
  return verificar(
    await supabase.from('curvas').select('*').eq('analise_tabela', analiseTabela).eq('analise_id', analiseId).order('id'),
  )
}

export async function pontosDaCurva(curvaId: number): Promise<PontoCurva[]> {
  // o PostgREST devolve no máximo 1000 linhas por chamada: busca em páginas
  const todos: PontoCurva[] = []
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    const lote = verificar<PontoCurva[]>(
      await supabase.from('curva_pontos').select('*').eq('curva_id', curvaId).order('ordem').range(de, de + pagina - 1),
    )
    todos.push(...lote)
    if (lote.length < pagina) break
  }
  return todos
}

export async function criarCurva(
  c: Omit<Curva, 'id'>,
  pontos: { x: number; y: number }[],
): Promise<Curva> {
  const curva = verificar<Curva>(await supabase.from('curvas').insert(c).select().single())
  const lote = 1000
  for (let i = 0; i < pontos.length; i += lote) {
    const parte = pontos.slice(i, i + lote).map((p, j) => ({ curva_id: curva.id, ordem: i + j, x: p.x, y: p.y }))
    verificar(await supabase.from('curva_pontos').insert(parte))
  }
  return curva
}

export async function apagarCurva(id: number) {
  verificar(await supabase.from('curvas').delete().eq('id', id))
}

/**
 * Lê duas colunas numéricas de um texto colado do Excel/Origin ou de um .csv/.txt.
 * Aceita separador tab, ponto e vírgula ou vírgula; vírgula decimal; ignora cabeçalho.
 */
export function lerPontos(texto: string, colX = 0, colY = 1): { x: number; y: number }[] {
  const pontos: { x: number; y: number }[] = []
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim()
    if (!linha) continue
    // tab ou ";" separam colunas (vírgula vira decimal); senão espaços; senão vírgula
    let partes: string[]
    if (linha.includes('\t')) partes = linha.split('\t')
    else if (linha.includes(';')) partes = linha.split(';')
    else if (/\s/.test(linha)) partes = linha.split(/\s+/)
    else partes = linha.split(',')
    partes = partes.map((p) => p.trim())
    const num = (s?: string) => (s == null ? NaN : Number(s.replace(',', '.')))
    const x = num(partes[colX])
    const y = num(partes[colY])
    if (Number.isFinite(x) && Number.isFinite(y)) pontos.push({ x, y })
  }
  return pontos
}

// ---------------------------------------------------------------------------
// Arquivos (Supabase Storage, bucket privado "arquivos")
// caminho: amostras/<amostra_id>/<pasta>/<timestamp>_<nome>
// ---------------------------------------------------------------------------
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
}

export async function enviarArquivo(p: {
  arquivo: File; amostraId: string; pasta: string; analiseTabela?: string; analiseId?: number; tipo?: string
}): Promise<Arquivo> {
  const caminho = `amostras/${p.amostraId}/${p.pasta}/${Date.now()}_${nomeSeguro(p.arquivo.name)}`
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, p.arquivo)
  if (error) throw new Error(`Falha no envio: ${error.message}`)
  return verificar(
    await supabase.from('arquivos').insert({
      amostra_id: p.amostraId,
      analise_tabela: p.analiseTabela ?? null,
      analise_id: p.analiseId ?? null,
      tipo: p.tipo ?? tipoPorExtensao(p.arquivo.name),
      nome_original: p.arquivo.name,
      caminho,
      tamanho_bytes: p.arquivo.size,
    }).select().single(),
  )
}

export async function listarArquivos(amostraId: string, analiseTabela?: string, analiseId?: number): Promise<Arquivo[]> {
  let q = supabase.from('arquivos').select('*').eq('amostra_id', amostraId).order('enviado_em', { ascending: false })
  if (analiseTabela) q = q.eq('analise_tabela', analiseTabela)
  if (analiseId != null) q = q.eq('analise_id', analiseId)
  return verificar(await q)
}

/** Link temporário (1 h) para abrir ou baixar. */
export async function linkArquivo(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(caminho, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function apagarArquivo(a: Arquivo) {
  await supabase.storage.from(BUCKET_ARQUIVOS).remove([a.caminho])
  verificar(await supabase.from('arquivos').delete().eq('id', a.id))
}

function tipoPorExtensao(nome: string) {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp'].includes(ext)) return 'imagem'
  if (ext === 'opju' || ext === 'opj') return 'opju'
  if (ext === 'pdf') return 'pdf'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'planilha'
  if (['raw', 'tiff', 'nii', 'vol'].includes(ext)) return 'volume_ct'
  return ext || 'outro'
}
