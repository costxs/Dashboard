// Leituras e gravações das telas de reatividade (RDA): nova série, conferência, listas e séries do laboratório.
// Tudo aqui depende da migração 020 (20261112000020_reatividade_cadastro.sql): sem ela, as funções
// respondem "Rode a migração 020 no Supabase".
import { supabase, tratarErro } from '../../lib/supabase'
import type { PropFluido } from '../../importador/cadastroReatividade'

export const MSG_MIGRACAO_020 =
  'Rode a migração 020 no Supabase (20261112000020_reatividade_cadastro.sql): o banco ainda não tem as tabelas e funções da reatividade.'

type ErroBanco = { message: string; code?: string }

/** Tabela, coluna, view ou função da migração 020 que o banco ainda não tem. */
export function faltaMigracao020(e: ErroBanco | null | undefined): boolean {
  if (!e) return false
  return ['PGRST205', 'PGRST202', 'PGRST204', '42P01', '42703', '42883'].includes(e.code ?? '')
    || /schema cache|does not exist|não existe/i.test(e.message ?? '')
}

/** Mensagem de erro (texto) que veio de planilhaBdd/cadastroReatividade: troca pelo aviso da migração quando for o caso. */
export function explicarErro020(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return faltaMigracao020({ message: msg }) ? MSG_MIGRACAO_020 : msg
}

function ok<T>(r: { data: T | null; error: ErroBanco | null }): T {
  if (r.error) throw new Error(faltaMigracao020(r.error) ? MSG_MIGRACAO_020 : tratarErro(r.error))
  return r.data as T
}

/** Gravação protegida por regra de acesso: sem permissão o banco não dá erro, só não grava nada. */
function gravou<T>(r: { data: T[] | null; error: ErroBanco | null }): T[] {
  const linhas = ok(r)
  if (!linhas?.length) throw new Error('Nada foi gravado: só editor ou administrador altera os dados da literatura.')
  return linhas
}

export async function migracao020Aplicada(): Promise<boolean> {
  const { error } = await supabase.from('lit_listas').select('lista').limit(1)
  if (!error) return true
  if (faltaMigracao020(error)) return false
  throw new Error(tratarErro(error))
}

// ---- listas suspensas (métodos) ----
export type NomeLista = 'metodo_quantificacao' | 'metodo_coef_difusao'
export interface ItemLista { lista: NomeLista; valor: string; ordem: number; ativo: boolean }
export const ROTULO_LISTA: Record<NomeLista, string> = {
  metodo_quantificacao: 'Método de quantificação',
  metodo_coef_difusao: 'Método do coeficiente de difusão',
}

export async function listarListas(soAtivos = false): Promise<ItemLista[]> {
  let q = supabase.from('lit_listas').select('*').order('lista').order('ordem').order('valor')
  if (soAtivos) q = q.eq('ativo', true)
  return ok<ItemLista[]>(await q)
}
export async function criarItemLista(item: ItemLista) {
  gravou(await supabase.from('lit_listas').insert(item).select())
}
export async function atualizarItemLista(lista: NomeLista, valor: string, mudanca: Partial<Pick<ItemLista, 'ordem' | 'ativo'>>) {
  gravou(await supabase.from('lit_listas').update(mudanca).eq('lista', lista).eq('valor', valor).select())
}

// ---- catálogos usados pelo formulário de série ----
export type Fluido = PropFluido & { componente: string }
export async function listarFluidos(): Promise<Fluido[]> {
  return ok<Fluido[]>(await supabase.from('fluidos_prop').select('componente, massa_molar_g_mol, coef_densidade, n_equivalentes'))
}

export type SistemaBanco = Record<string, unknown> & { id_sistema: string; nome_sistema: string; composicao_original: string | null }
export async function listarSistemasBanco(): Promise<SistemaBanco[]> {
  return ok<SistemaBanco[]>(await supabase.from('sistemas_acidos').select('*').order('id_sistema'))
}

// ---- medidas da literatura ----
export interface MedidaLit {
  id_ensaio: string; id_referencia: string; id_rocha: string; id_sistema: string; ano: number | null
  dim_h_in: number | null; dim_d_in: number | null; temperatura_c: number | null; pressao_psi: number | null
  tipo_variavel: string | null; rotacao_rpm: number | null; shear_rate_s1: number | null
  taxa_reacao_mol_cm2_s: number | null; coef_difusao_cm2_s: number | null
  metodo_coef_difusao: string | null; metodo_quantificacao: string | null; obtencao_dado: string | null
  fonte_local: string | null; observacao: string | null; origem_registro: string
  conferido: boolean; conferido_em: string | null
}
const COLUNAS_MEDIDA = 'id_ensaio, id_referencia, id_rocha, id_sistema, ano, dim_h_in, dim_d_in, temperatura_c, pressao_psi, tipo_variavel, ' +
  'rotacao_rpm, shear_rate_s1, taxa_reacao_mol_cm2_s, coef_difusao_cm2_s, metodo_coef_difusao, metodo_quantificacao, obtencao_dado, ' +
  'fonte_local, observacao, origem_registro, conferido, conferido_em'

/** Medidas já cadastradas com a mesma rocha e sistema (para avisar lançamento repetido e comparar no gráfico). */
export async function medidasDaRochaSistema(idRocha: string, idSistema: string): Promise<MedidaLit[]> {
  return ok<MedidaLit[]>(await supabase.from('lit_dados_rda').select(COLUNAS_MEDIDA).eq('id_rocha', idRocha).eq('id_sistema', idSistema)
    .order('id_ensaio') as never)
}
export async function medidasDaPublicacao(idReferencia: string): Promise<MedidaLit[]> {
  return ok<MedidaLit[]>(await supabase.from('lit_dados_rda').select(COLUNAS_MEDIDA).eq('id_referencia', idReferencia).order('id_ensaio') as never)
}
export async function marcarConferido(idEnsaio: string, conferido: boolean) {
  gravou(await supabase.from('lit_dados_rda').update({ conferido }).eq('id_ensaio', idEnsaio).select('id_ensaio'))
}
export type MudancaMedida = Partial<Omit<MedidaLit, 'id_ensaio' | 'id_referencia' | 'id_rocha' | 'id_sistema' | 'origem_registro' | 'conferido' | 'conferido_em'>>
export async function atualizarMedida(idEnsaio: string, mudanca: MudancaMedida) {
  gravou(await supabase.from('lit_dados_rda').update(mudanca).eq('id_ensaio', idEnsaio).select('id_ensaio'))
}

// ---- conferência ----
export interface ResumoConferencia {
  id_referencia: string; autor: string; ano: string | null
  n_medidas: number; n_conferidas: number; n_pelo_painel: number; n_a_conferir: number; n_incompletas: number
}
export async function listarConferencia(): Promise<ResumoConferencia[]> {
  return ok<ResumoConferencia[]>(await supabase.from('v_lit_conferencia').select('*').order('id_referencia'))
}

export type Gravidade = 'erro' | 'conferir' | 'incompleto'
export interface Pendencia { id_ensaio: string; id_referencia: string; campo: string; gravidade: Gravidade; mensagem: string }
export async function pendenciasDaPublicacao(idReferencia: string): Promise<Pendencia[]> {
  const todas: Pendencia[] = []
  for (let de = 0; ; de += 1000) {
    const lote = ok<Pendencia[]>(await supabase.from('v_lit_pendencias').select('*').eq('id_referencia', idReferencia)
      .order('id_ensaio').range(de, de + 999))
    todas.push(...lote)
    if (lote.length < 1000) break
  }
  return todas
}

export interface Anotacao {
  id: number; id_ensaio: string | null; campo: string; valor_registrado: string | null; valor_calculado: string | null
  observacao: string | null; origem: 'planilha' | 'manual'; resolvido: boolean; resolvido_em: string | null
  resolucao: string | null; criado_em: string
}
export async function listarAnotacoes(): Promise<Anotacao[]> {
  return ok<Anotacao[]>(await supabase.from('lit_qualidade').select('*').order('resolvido').order('criado_em', { ascending: false }))
}
export async function criarAnotacao(a: Pick<Anotacao, 'id_ensaio' | 'campo' | 'valor_registrado' | 'valor_calculado' | 'observacao'>) {
  const r = await supabase.from('lit_qualidade').insert({ ...a, origem: 'manual' }).select('id')
  if (r.error?.code === '23503') throw new Error(`O ensaio "${a.id_ensaio}" não existe. Confira o código (ex.: RDA-0012) ou deixe em branco.`)
  if (r.error?.code === '23505') throw new Error('Já existe uma anotação igual (mesmo ensaio, campo e valor registrado).')
  gravou(r)
}
export async function resolverAnotacao(id: number, resolucao: string) {
  gravou(await supabase.from('lit_qualidade').update({ resolvido: true, resolucao }).eq('id', id).select('id'))
}

export interface SistemaDuplicado { assinatura: string; id_principal: string; ids: string[]; quantidade: number }
export async function listarSistemasDuplicados(): Promise<SistemaDuplicado[]> {
  return ok<SistemaDuplicado[]>(await supabase.from('v_sistemas_duplicados').select('*').order('id_principal'))
}

// ---- ensaios RDA do próprio laboratório ----
export interface RdaLaboratorio {
  id: number; amostra_id: string; amostra: string; serie: string | null; id_sistema: string; nome_sistema: string
  temperatura_c: number | null; pressao_psi: number | null; rotacao_rpm: number | null; shear_rate_s1: number | null
  taxa_reacao_mol_cm2_s: number | null; taxa_calculada: boolean; dim_h_in: number | null; dim_d_in: number | null
  volume_acido_ml: number | null; data_ensaio: string | null; metodo_quantificacao: string | null
  /** migração 021 */
  situacao?: 'aguardando resultado' | 'com resultado'; origem_registro?: 'controle' | 'formulario' | 'equipamento'
  texto_utilizacao?: string | null; temperatura_nominal_c?: number | null; acido?: string | null
}

/** Medidas da literatura com a mesma rocha da amostra (migração 021), marcando mesmo ácido e mesma temperatura. */
export interface LiteraturaComparavel {
  id_ensaio: string; id_referencia: string; referencia: string; litologia: string; acido: string; conc_m: number | null
  temperatura_nominal_c: number | null; rotacao_rpm: number | null; raiz_omega: number | null
  taxa_reacao_mol_m2_s: number | null; obtencao_dado: string | null; conferido: boolean
  mesmo_acido: boolean; mesma_temperatura: boolean
}
export async function literaturaComparavel(amostraId: string): Promise<LiteraturaComparavel[]> {
  const { data, error } = await supabase.rpc('rda_literatura_comparavel', { p_amostra: amostraId })
  if (error) {
    if (faltaMigracao020(error)) throw new Error('Rode a migração 021 no Supabase (20261116000021_rda_amostras_literatura.sql).')
    throw new Error(tratarErro(error))
  }
  return (data ?? []) as LiteraturaComparavel[]
}
/** Os ensaios desta amostra e os demais pontos das séries em que ela entra (outros discos da mesma curva). */
export async function seriesRdaDaAmostra(amostraId: string): Promise<RdaLaboratorio[]> {
  const meus = ok<RdaLaboratorio[]>(await supabase.from('v_analise_rda').select('*').eq('amostra_id', amostraId).order('rotacao_rpm') as never)
  if (meus.length && !('serie' in meus[0])) throw new Error(MSG_MIGRACAO_020)
  const series = [...new Set(meus.map((m) => m.serie).filter((s): s is string => !!s))]
  if (!series.length) return meus
  const outros = ok<RdaLaboratorio[]>(await supabase.from('v_analise_rda').select('*').in('serie', series).neq('amostra_id', amostraId)
    .order('rotacao_rpm') as never)
  return [...meus, ...outros]
}
