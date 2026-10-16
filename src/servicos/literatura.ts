import { BUCKET_ARQUIVOS, supabase, verificar } from '../lib/supabase'
import type { CategoriaPublicacao, DadoLiteraturaRda, PontoRdaComparacao, Publicacao } from '../tipos/banco'

export interface FiltroPublicacoes {
  categoria: CategoriaPublicacao
  busca?: string
  eixo?: string
  projetoId?: string            // própria: só as de um projeto
}

export async function listarPublicacoes(f: FiltroPublicacoes): Promise<Publicacao[]> {
  let q = supabase.from('v_publicacoes').select('*').eq('categoria', f.categoria)
    .order('ano_ordem', { ascending: false, nullsFirst: false })
  if (f.eixo) q = q.contains('eixos', [f.eixo])
  if (f.projetoId) q = q.eq('projeto_id', f.projetoId)
  if (f.busca) {
    const b = f.busca.replace(/[,()]/g, ' ').trim()
    q = q.or(`autor.ilike.%${b}%,titulo.ilike.%${b}%,periodico.ilike.%${b}%`)
  }
  return verificar(await q)
}

export async function salvarPublicacao(p: Partial<Publicacao> & Pick<Publicacao, 'id_referencia' | 'categoria' | 'autor'>) {
  const { n_dados_rda: _a, n_amostras: _b, ano_ordem: _c, ...dados } = p as Publicacao
  verificar(await supabase.from('publicacoes').upsert(dados))
}

/** Próximo código livre para publicação própria: LCP-0001, LCP-0002... */
export async function proximoCodigoProprio(): Promise<string> {
  const linhas = verificar<{ id_referencia: string }[]>(
    await supabase.from('publicacoes').select('id_referencia').like('id_referencia', 'LCP-%'),
  )
  const n = Math.max(0, ...linhas.map((l) => Number(l.id_referencia.slice(4)) || 0)) + 1
  return `LCP-${String(n).padStart(4, '0')}`
}

export async function ligarAmostras(idReferencia: string, amostraIds: string[]) {
  verificar(await supabase.from('publicacao_amostras').delete().eq('id_referencia', idReferencia))
  if (amostraIds.length) {
    verificar(await supabase.from('publicacao_amostras').insert(
      amostraIds.map((amostra_id) => ({ id_referencia: idReferencia, amostra_id })),
    ))
  }
}

export async function enviarPdfPublicacao(idReferencia: string, arquivo: File) {
  const caminho = `publicacoes/${idReferencia}/${Date.now()}_${arquivo.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo)
  if (error) throw new Error(error.message)
  verificar(await supabase.from('arquivos').insert({
    id_referencia: idReferencia, tipo: 'pdf', nome_original: arquivo.name, caminho, tamanho_bytes: arquivo.size,
  }))
}

// ---- dados extraídos da literatura geral (planilha de reatividade) ----
export interface FiltroRda {
  litologias?: string[]
  acidos?: string[]
  temperaturas?: number[]        // temperatura nominal
  referencias?: string[]
  obtencao?: string[]
}

export async function listarDadosRda(f: FiltroRda = {}): Promise<DadoLiteraturaRda[]> {
  const todos: DadoLiteraturaRda[] = []
  for (let de = 0; ; de += 1000) {
    let q = supabase.from('v_lit_dados_rda').select('*').order('id_ensaio').range(de, de + 999)
    if (f.litologias?.length) q = q.in('litologia', f.litologias)
    if (f.acidos?.length) q = q.in('acido', f.acidos)
    if (f.temperaturas?.length) q = q.in('temperatura_nominal_c', f.temperaturas)
    if (f.referencias?.length) q = q.in('id_referencia', f.referencias)
    if (f.obtencao?.length) q = q.in('obtencao_dado', f.obtencao)
    const lote = verificar<DadoLiteraturaRda[]>(await q)
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}

/** Literatura + ensaios do laboratório (só os projetos que o usuário vê). */
export async function pontosComparacao(f: Omit<FiltroRda, 'referencias' | 'obtencao'> = {}): Promise<PontoRdaComparacao[]> {
  const todos: PontoRdaComparacao[] = []
  for (let de = 0; ; de += 1000) {
    let q = supabase.from('v_rda_comparacao').select('*').range(de, de + 999)
    if (f.litologias?.length) q = q.in('litologia', f.litologias)
    if (f.acidos?.length) q = q.in('acido', f.acidos)
    if (f.temperaturas?.length) q = q.in('temperatura_nominal_c', f.temperaturas)
    const lote = verificar<PontoRdaComparacao[]>(await q)
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}

/** PDFs e anexos de uma publicação. */
export async function arquivosDaPublicacao(idReferencia: string) {
  return verificar<{ id: number; nome_original: string; caminho: string }[]>(
    await supabase.from('arquivos').select('id, nome_original, caminho').eq('id_referencia', idReferencia).order('enviado_em', { ascending: false }),
  )
}


export async function amostrasDaPublicacao(idReferencia: string): Promise<string[]> {
  const linhas = verificar<{ amostra_id: string }[]>(
    await supabase.from('publicacao_amostras').select('amostra_id').eq('id_referencia', idReferencia),
  )
  return linhas.map((l) => l.amostra_id)
}

// ---- abas rochas e sistemas ácidos da planilha ----
export interface RochaLiteratura {
  id_rocha: string
  litologia: string
  composicao_texto: string | null
  calcita_pct: number | null
  calcita_qualificador: string | null
  dolomita_pct: number | null
  dolomita_qualificador: string | null
  razao_ca_mg: number | null
}

export async function listarRochasLiteratura(): Promise<RochaLiteratura[]> {
  return verificar(await supabase.from('lit_rochas').select('*').order('id_rocha'))
}

/** ids das publicações que têm pelo menos um arquivo (PDF) anexado. */
export async function publicacoesComArquivo(): Promise<Set<string>> {
  const linhas = verificar<{ id_referencia: string }[]>(
    await supabase.from('arquivos').select('id_referencia').not('id_referencia', 'is', null),
  )
  return new Set(linhas.map((l) => l.id_referencia))
}
