import { supabase, verificar } from '../lib/supabase'
import type { DashboardProjeto, Empresa, Perfil, Projeto, WorkPackage } from '../tipos/banco'

// ---- login (Supabase Auth) ----
export async function entrar(email: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
}

export async function sair() {
  await supabase.auth.signOut()
}

export async function meuPerfil(): Promise<Perfil | null> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) return null
  return verificar(await supabase.from('perfis').select('*').eq('id', id).maybeSingle())
}

// ---- Empresa -> Projeto (o banco já devolve só o que o usuário pode ver) ----
export async function listarEmpresas(): Promise<Empresa[]> {
  return verificar(await supabase.from('empresas').select('*').order('nome'))
}

export async function listarProjetos(empresaId?: string): Promise<Projeto[]> {
  let q = supabase.from('projetos').select('*').eq('ativo', true).order('nome')
  if (empresaId) q = q.eq('empresa_id', empresaId)
  return verificar(await q)
}

// ---- administração (só admin; o banco bloqueia os demais) ----
export async function criarEmpresa(sigla: string, nome: string): Promise<Empresa> {
  return verificar(await supabase.from('empresas').insert({ sigla, nome }).select().single())
}

export async function criarProjeto(dados: Pick<Projeto, 'empresa_id' | 'codigo' | 'nome'> & Partial<Projeto>): Promise<Projeto> {
  return verificar(await supabase.from('projetos').insert(dados).select().single())
}

export async function adicionarMembro(p: {
  usuario_id: string; papel: 'leitor' | 'editor'; empresa_id?: string; projeto_id?: string
}) {
  verificar(await supabase.from('membros').insert(p))
}

export async function listarPerfis(): Promise<Perfil[]> {
  return verificar(await supabase.from('perfis').select('*').order('nome'))
}

// ---- dashboard gerencial ----
export async function dashboard(projetoId?: string, empresaId?: string): Promise<DashboardProjeto[]> {
  let q = supabase.from('v_dashboard_projetos').select('*').order('empresa').order('nome')
  if (projetoId) q = q.eq('projeto_id', projetoId)
  else if (empresaId) q = q.eq('empresa_id', empresaId)
  return verificar(await q)
}

export async function listarWorkPackages(projetoIds: string | string[]): Promise<WorkPackage[]> {
  const ids = Array.isArray(projetoIds) ? projetoIds : [projetoIds]
  if (!ids.length) return []
  return verificar(await supabase.from('work_packages').select('*').in('projeto_id', ids).order('projeto_id').order('id'))
}

export async function apagarWorkPackage(id: number) {
  verificar(await supabase.from('work_packages').delete().eq('id', id))
}

export async function salvarWorkPackage(wp: Partial<WorkPackage> & { projeto_id: string; codigo: string; nome: string }) {
  return verificar(await supabase.from('work_packages').upsert(wp, { onConflict: 'projeto_id,codigo' }).select().single())
}

// ---- permissões (só para mostrar/esconder botões; quem bloqueia é o banco) ----
export async function meuPapel(projetoId: string): Promise<'leitor' | 'editor' | null> {
  const { data, error } = await supabase.rpc('meu_papel', { p_projeto: projetoId })
  if (error) throw new Error(error.message)
  return data as 'leitor' | 'editor' | null
}

export async function souEditor(): Promise<boolean> {
  const { data, error } = await supabase.rpc('sou_editor')
  if (error) throw new Error(error.message)
  return Boolean(data)
}

// ---- administração de acessos ----
export interface Membro {
  id: number
  usuario_id: string
  empresa_id: string | null
  projeto_id: string | null
  papel: 'leitor' | 'editor'
  perfis: { email: string; nome: string | null } | null
  empresas: { sigla: string; nome: string } | null
  projetos: { codigo: string; nome: string } | null
}

export async function listarMembros(): Promise<Membro[]> {
  return verificar(await supabase.from('membros')
    .select('*, perfis(email, nome), empresas(sigla, nome), projetos(codigo, nome)').order('id'))
}

export async function removerMembro(id: number) {
  verificar(await supabase.from('membros').delete().eq('id', id))
}

export async function atualizarProjeto(id: string, dados: Partial<Projeto>) {
  verificar(await supabase.from('projetos').update(dados).eq('id', id))
}

export async function listarTodosProjetos(): Promise<Projeto[]> {
  return verificar(await supabase.from('projetos').select('*').order('nome'))
}

export async function definirAdministrador(usuarioId: string, administrador: boolean) {
  verificar(await supabase.from('perfis').update({ administrador }).eq('id', usuarioId))
}
