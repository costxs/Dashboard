import { supabase, verificar } from '../lib/supabase'
import type { Amostra, AmostraResumo, Litologia, SistemaAcido, StatusAmostra, TipoOrigem } from '../tipos/banco'

export interface FiltroAmostras {
  projetoId?: string
  empresaId?: string            // usado quando projetoId é vazio (todos os projetos da empresa)
  busca?: string                 // código, poço, campo, local
  litologias?: string[]
  status?: StatusAmostra[]
  tipoOrigem?: TipoOrigem
  bacia?: string
  campo?: string
  poco?: string
}

export async function listarAmostras(f: FiltroAmostras = {}): Promise<AmostraResumo[]> {
  let q = supabase.from('v_amostras').select('*').order('codigo')
  if (f.projetoId) q = q.eq('projeto_id', f.projetoId)
  else if (f.empresaId) q = q.eq('empresa_id', f.empresaId)
  if (f.litologias?.length) q = q.in('litologia', f.litologias)
  if (f.status?.length) q = q.in('status', f.status)
  if (f.tipoOrigem) q = q.eq('tipo_origem', f.tipoOrigem)
  if (f.bacia) q = q.eq('bacia', f.bacia)
  if (f.campo) q = q.eq('campo', f.campo)
  if (f.poco) q = q.eq('poco', f.poco)
  if (f.busca) {
    const b = f.busca.replace(/[,()]/g, ' ').trim()
    q = q.or(`codigo.ilike.%${b}%,poco.ilike.%${b}%,campo.ilike.%${b}%,afloramento_local.ilike.%${b}%`)
  }
  return verificar(await q)
}

export async function obterAmostra(id: string): Promise<AmostraResumo> {
  return verificar(await supabase.from('v_amostras').select('*').eq('id', id).single())
}

/** O que a ficha precisa e a view v_amostras não traz: observações e se há petrofísica depois da acidificação. */
export interface ControleDaAmostra {
  observacoes: string | null
  temPetrofisicaDepois: boolean
}

export async function obterControleDaAmostra(id: string): Promise<ControleDaAmostra> {
  const [amostra, depois] = await Promise.all([
    supabase.from('amostras').select('observacoes').eq('id', id).maybeSingle(),
    supabase.from('analise_petrofisica').select('id').eq('amostra_id', id).eq('momento', 'depois').limit(1),
  ])
  return {
    observacoes: verificar<{ observacoes: string | null } | null>(amostra)?.observacoes ?? null,
    temPetrofisicaDepois: verificar<{ id: number }[]>(depois).length > 0,
  }
}

export async function obterAmostraEditavel(id: string): Promise<Amostra> {
  return verificar(await supabase.from('amostras').select('*').eq('id', id).single())
}

/** Cria ou atualiza. Campos de afloramento/testemunho que não se aplicam são limpos. */
export async function salvarAmostra(a: Partial<Amostra> & Pick<Amostra, 'codigo' | 'projeto_id' | 'litologia' | 'tipo_origem'>) {
  const dados: Partial<Amostra> = { ...a }
  if (dados.tipo_origem === 'afloramento') {
    Object.assign(dados, { bacia: null, campo: null, poco: null, reservatorio: null, profundidade_m: null })
  } else {
    Object.assign(dados, { afloramento_local: null, fornecedor: null, bloco: null })
  }
  const q = a.id
    ? supabase.from('amostras').update(dados).eq('id', a.id)
    : supabase.from('amostras').insert(dados)
  return verificar<Amostra>(await q.select().single())
}

export async function mudarStatus(id: string, status: StatusAmostra) {
  verificar(await supabase.from('amostras').update({ status }).eq('id', id))
}

export async function apagarAmostra(id: string) {
  verificar(await supabase.from('amostras').delete().eq('id', id))
}

export async function registrarConferencia(amostraId: string, data: string, responsaveis: string, resultado = 'ok', observacao?: string) {
  verificar(await supabase.from('conferencias').insert({ amostra_id: amostraId, data, responsaveis, resultado, observacao }))
}

export async function listarConferencias(amostraId: string) {
  return verificar(await supabase.from('conferencias').select('*').eq('amostra_id', amostraId).order('data', { ascending: false }))
}

/** Valores distintos para os filtros (bacia, campo, poço) dentro do que o usuário vê. */
export async function opcoesFiltro(projetoId?: string, empresaId?: string) {
  let q = supabase.from('v_amostras').select('bacia, campo, poco')
  if (projetoId) q = q.eq('projeto_id', projetoId)
  else if (empresaId) q = q.eq('empresa_id', empresaId)
  const linhas = verificar<{ bacia: string | null; campo: string | null; poco: string | null }[]>(await q)
  const unicos = (k: 'bacia' | 'campo' | 'poco') =>
    [...new Set(linhas.map((l) => l[k]).filter((v): v is string => !!v))].sort()
  return { bacias: unicos('bacia'), campos: unicos('campo'), pocos: unicos('poco') }
}

// ---- catálogos ----
export async function listarLitologias(): Promise<Litologia[]> {
  return verificar(await supabase.from('litologias').select('*').order('nome'))
}

export async function criarLitologia(nome: string, tipo?: string) {
  verificar(await supabase.from('litologias').insert({ nome, tipo }))
}

export async function listarSistemasAcidos(): Promise<SistemaAcido[]> {
  return verificar(await supabase.from('v_sistemas_acidos').select('*').order('id_sistema'))
}

export async function salvarSistemaAcido(s: Record<string, unknown> & { id_sistema: string; nome_sistema: string; componente_1: string }) {
  verificar(await supabase.from('sistemas_acidos').upsert(s))
}
