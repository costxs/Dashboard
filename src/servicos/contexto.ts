import { supabase, verificar } from '../lib/supabase'
import type { DashboardProjeto, Empresa, Perfil, Projeto, WorkPackage } from '../tipos/banco'

// ---- login (Supabase Auth) ----
export async function entrar(email: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
}

/**
 * Pedido de acesso: cria a conta no Supabase Auth. O banco (migração 020) cria o perfil como PENDENTE,
 * com a instituição e o motivo; até o administrador aprovar no gerencial, a pessoa não vê nada.
 * Devolve true quando o Supabase exige confirmar o e-mail antes do primeiro login.
 */
export async function registrar(d: { nome: string; email: string; senha: string; instituicao: string; motivo: string }): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email: d.email.trim(), password: d.senha,
    options: {
      data: { nome: d.nome.trim(), instituicao: d.instituicao.trim(), motivo: d.motivo.trim() },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  })
  if (error) {
    if (/already registered|already exists/i.test(error.message)) throw new Error('Já existe uma conta com este e-mail: entre com a sua senha.')
    if (/signups? not allowed|disabled/i.test(error.message)) throw new Error('O cadastro está desligado no momento. Fale com o administrador do LC PETRO.')
    if (/password/i.test(error.message)) throw new Error('Senha fraca: use pelo menos 8 caracteres, com letras e números.')
    throw new Error(error.message)
  }
  return !data.session
}

/** Link de "esqueci minha senha": o Supabase manda um e-mail que abre /redefinir-senha deste dashboard. */
export async function pedirNovaSenha(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
  if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'Muitos pedidos seguidos: espere um minuto e tente de novo.' : error.message)
}

/** Define a senha na sessão temporária aberta pelo link do e-mail (convite ou recuperação). */
export async function definirSenha(senha: string) {
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) throw new Error(/password/i.test(error.message) ? 'Senha fraca: use pelo menos 8 caracteres, com letras e números.' : error.message)
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
