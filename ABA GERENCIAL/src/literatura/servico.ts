// Cópia do Banco da Literatura do dashboard de visualização ("src/..." na raiz), para o gerencial.
// Se mudar uma regra aqui, mude lá também.
import { BUCKET_ARQUIVOS, supabase, tratarErro } from '../lib/supabase'
import type { CategoriaPublicacao } from '../tipos/banco'
import type { DadoLiteraturaRda, PontoRdaComparacao, PublicacaoLit as Publicacao, FontePvbt, PontoPvbt, SistemaAcidoView } from './tipos'

export function verificar<T>(resposta: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (resposta.error) {
    const e = resposta.error
    if (e.code === '42501') throw new Error('Sem permissão para esta operação neste projeto.')
    if (e.code === '23505') throw new Error('Já existe um registro com este código.')
    if (e.code === '23503') throw new Error('Referência inválida (ex.: sistema ácido ou litologia não cadastrados).')
    if (e.code === '23514') throw new Error(`Valor fora do permitido: ${e.message}`)
    throw new Error(e.message)
  }
  return resposta.data as T
}

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


export interface FiltroPvbt {
  amostraUuid?: string          // só os ensaios de uma amostra do laboratório
  fontes?: FontePvbt[]
  litologia?: string
  acidos?: string[]
}

/** Base de PVbt (LC PETRO + literatura + Petrobras). A RLS já esconde o que o usuário não pode ver. */
export async function listarPvbt(f: FiltroPvbt = {}): Promise<PontoPvbt[]> {
  const todos: PontoPvbt[] = []
  for (let de = 0; ; de += 1000) {
    let q = supabase.from('v_pvbt').select('*').order('id_experimento').range(de, de + 999)
    if (f.amostraUuid) q = q.eq('amostra_uuid', f.amostraUuid)
    if (f.fontes?.length) q = q.in('fonte', f.fontes)
    if (f.litologia) q = q.eq('litologia', f.litologia)
    if (f.acidos?.length) q = q.in('acido', f.acidos)
    const lote = verificar<PontoPvbt[]>(await q)
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}

export async function listarSistemasAcidos(): Promise<SistemaAcidoView[]> {
  return verificar(await supabase.from('v_sistemas_acidos').select('*').order('id_sistema'))
}

// ---------------------------------------------------------------------------
// Cadastro de PVbt da literatura (amostras e ensaios): ler, gravar e excluir
// ---------------------------------------------------------------------------

async function lerTudo<T>(tabela: string, ordem: string, filtrar?: (q: any) => any): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += 1000) {
    let q: any = supabase.from(tabela).select('*').order(ordem).range(de, de + 999)
    if (filtrar) q = filtrar(q)
    const lote = verificar<T[]>(await q)
    todos.push(...lote)
    if (lote.length < 1000) break
  }
  return todos
}

export type LinhaPvbt = Record<string, unknown>

export const listarAmostrasLit = () => lerTudo<LinhaPvbt>('lit_amostras_pvbt', 'id_amostra')
/** Ensaios da literatura/Petrobras na view v_pvbt, que já traz as colunas calculadas pelo banco. */
export const listarEnsaiosLit = () => lerTudo<LinhaPvbt>('v_pvbt', 'id_experimento', (q) => q.in('fonte', ['Literatura', 'Petrobras']))
export async function obterEnsaioLit(id: string): Promise<LinhaPvbt> {
  return verificar(await supabase.from('lit_dados_pvbt').select('*').eq('id_experimento', id).single())
}

async function gravar(tabela: string, chave: string, linha: LinhaPvbt, nova: boolean, oQue: string) {
  const q = nova
    ? supabase.from(tabela).insert(linha)
    : supabase.from(tabela).update(linha).eq(chave, linha[chave] as string)
  const { data, error } = await q.select()
  if (error) {
    if (error.code === '23505') throw new Error(`Já existe um registro com este ${chave}.`)
    if (error.code === '23503') throw new Error(`Não foi possível ${oQue}: um dos códigos ligados (litologia, amostra, referência ou sistema ácido) não existe. Cadastre-o antes.`)
    throw new Error(`Não foi possível ${oQue}. ${tratarErro(error)}`)
  }
  if (!data?.length) throw new Error(`Não foi possível ${oQue}. Nada foi gravado: confira se seu usuário é editor.`)
}
export const salvarAmostraLit = (a: LinhaPvbt, nova: boolean) => gravar('lit_amostras_pvbt', 'id_amostra', a, nova, 'salvar a amostra')
export const salvarEnsaioLit = (e: LinhaPvbt, nova: boolean) => gravar('lit_dados_pvbt', 'id_experimento', e, nova, 'salvar o ensaio')

/** Apaga em lotes. O banco não dá erro quando falta permissão (apaga 0 linhas): por isso se confere a contagem. */
async function apagarVarios(tabela: string, chave: string, ids: string[], oQue: string): Promise<number> {
  let total = 0
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from(tabela).delete().in(chave, ids.slice(i, i + 100)).select()
    if (error) {
      if (error.code === '23503') throw new Error(`Não foi possível ${oQue}: há registros ligados a estes. Exclua primeiro os ensaios da amostra.`)
      throw new Error(`Não foi possível ${oQue}. ${tratarErro(error)}`)
    }
    total += data?.length ?? 0
  }
  if (total === 0) throw new Error(`Não foi possível ${oQue}. Nada foi apagado: o registro não existe mais ou seu usuário não é editor.`)
  return total
}
export const excluirAmostrasLit = (ids: string[]) => apagarVarios('lit_amostras_pvbt', 'id_amostra', ids, 'excluir as amostras')
export const excluirEnsaiosLit = (ids: string[]) => apagarVarios('lit_dados_pvbt', 'id_experimento', ids, 'excluir os ensaios')
