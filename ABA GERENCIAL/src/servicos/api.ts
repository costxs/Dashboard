import { supabase, tratarErro, BUCKET_ARQUIVOS } from '../lib/supabase'
import type { AnaliseConfig } from '../config/analises'
import { paraNumero } from '../utils/formatacao'
import type {
  Gravavel, Linha, Tabela, Papel,
  Empresa, Projeto, Perfil, Membro, Litologia, PrefixoCodigo, SistemaAcido, WorkPackage,
  Amostra, Conferencia, Curva, ArquivoAnexo, Publicacao, RegistroAnalise,
} from '../tipos/banco'

// ==========================================
// 0. GRAVAÇÃO TIPADA
// Todo insert/update/upsert/delete do app passa por estas funções: o payload é
// conferido contra tipos/banco.ts e todo erro vira exceção com mensagem em português.
// ==========================================
interface Resposta<T> {
  data: T | null
  error: unknown
}

function conferir<T>(r: Resposta<T>, oQue: string): T {
  if (r.error) throw new Error(`Não foi possível ${oQue}. ${tratarErro(r.error)}`)
  if (r.data == null) throw new Error(`Não foi possível ${oQue}. O banco não devolveu o registro gravado.`)
  return r.data
}

function conferirLeitura<T>(r: Resposta<T[]>): T[] {
  if (r.error) throw new Error(tratarErro(r.error))
  return r.data || []
}

async function inserir<T extends Tabela>(tabela: T, dados: Gravavel[T], oQue: string): Promise<Linha<T>> {
  return conferir<Linha<T>>(await supabase.from(tabela).insert(dados).select().single(), oQue)
}

async function atualizar<T extends Tabela>(
  tabela: T, coluna: string, valor: string | number, dados: Partial<Gravavel[T]>, oQue: string
): Promise<Linha<T>> {
  // o cliente Supabase não é tipado por tabela; a conferência das colunas é a do parâmetro "dados"
  const linha: Record<string, unknown> = dados
  return conferir<Linha<T>>(await supabase.from(tabela).update(linha).eq(coluna, valor).select().single(), oQue)
}

/** Com as regras de acesso do banco, um delete sem permissão não dá erro: apaga 0 linhas. Por isso conferimos. */
async function apagar(tabela: Tabela, coluna: string, valor: string | number, oQue: string): Promise<void> {
  const linhas = conferir<unknown[]>(await supabase.from(tabela).delete().eq(coluna, valor).select(), oQue)
  if (linhas.length === 0) {
    throw new Error(`Não foi possível ${oQue}. Nada foi apagado: o registro não existe mais ou seu usuário não tem permissão de editor.`)
  }
}

/** Copia só as colunas listadas; texto é aparado e texto vazio vira null. */
function escolher<T extends Tabela>(
  origem: Record<string, unknown>, colunas: readonly (keyof Gravavel[T] & string)[]
): Partial<Gravavel[T]> {
  const saida: Record<string, unknown> = {}
  for (const c of colunas) {
    if (!(c in origem)) continue
    const v = origem[c]
    saida[c] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null
  }
  return saida as Partial<Gravavel[T]>
}

function exigir(valor: unknown, rotulo: string): void {
  if (valor == null || valor === '') throw new Error(`Preencha o campo "${rotulo}".`)
}

// ==========================================
// 1. AUTENTICAÇÃO E PERFIL
// ==========================================
export async function loginComEmail(email: string, pass: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
  if (error) throw new Error(tratarErro(error))
  return data
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function buscarPerfilAtual(): Promise<Perfil | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()
  if (error) throw new Error(tratarErro(error))
  return data
}

// ---- permissões (só para mostrar/esconder botões; quem bloqueia é o banco) ----
export async function meuPapel(projetoId: string): Promise<Papel | null> {
  const { data, error } = await supabase.rpc('meu_papel', { p_projeto: projetoId })
  if (error) throw new Error(tratarErro(error))
  return (data as Papel | null) ?? null
}

export async function souEditor(): Promise<boolean> {
  const { data, error } = await supabase.rpc('sou_editor')
  if (error) throw new Error(tratarErro(error))
  return Boolean(data)
}

export async function souAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('sou_admin')
  if (error) throw new Error(tratarErro(error))
  return Boolean(data)
}

// ==========================================
// 2. EMPRESAS E PROJETOS
// (o banco já devolve só o que o usuário pode ver)
// ==========================================
export async function listarEmpresas(): Promise<Empresa[]> {
  return conferirLeitura<Empresa>(await supabase.from('empresas').select('*').order('nome'))
}

export async function criarEmpresa(dados: Gravavel['empresas']): Promise<Empresa> {
  return inserir('empresas', dados, 'cadastrar a empresa')
}

export async function listarProjetos(empresaId?: string | null, soAtivos = false): Promise<Projeto[]> {
  let query = supabase.from('projetos').select('*').order('codigo')
  if (empresaId) query = query.eq('empresa_id', empresaId)
  if (soAtivos) query = query.eq('ativo', true)
  return conferirLeitura<Projeto>(await query)
}

// ---- work packages ----
export async function listarWorkPackages(projetoIds: string[]): Promise<WorkPackage[]> {
  if (projetoIds.length === 0) return []
  return conferirLeitura<WorkPackage>(
    await supabase.from('work_packages').select('*').in('projeto_id', projetoIds).order('projeto_id').order('codigo')
  )
}

const COLUNAS_WORK_PACKAGE = [
  'projeto_id', 'codigo', 'nome', 'inicio', 'fim', 'progresso_planejado', 'progresso_realizado',
] as const satisfies readonly (keyof Gravavel['work_packages'])[]

export async function salvarWorkPackage(wp: Partial<Gravavel['work_packages']> & { id?: number }): Promise<WorkPackage> {
  const linha = escolher<'work_packages'>({ ...wp }, COLUNAS_WORK_PACKAGE)
  exigir(linha.projeto_id, 'Projeto')
  exigir(linha.codigo, 'Código')
  exigir(linha.nome, 'Nome')
  for (const [campo, rotulo] of [['progresso_planejado', 'Planejado'], ['progresso_realizado', 'Realizado']] as const) {
    const v = linha[campo]
    if (v != null && (v < 0 || v > 100)) throw new Error(`"${rotulo}" deve ficar entre 0 e 100 %.`)
  }
  if (wp.id) return atualizar('work_packages', 'id', wp.id, linha, `salvar o work package ${linha.codigo}`)
  return inserir('work_packages', linha as Gravavel['work_packages'], `cadastrar o work package ${linha.codigo}`)
}

export async function apagarWorkPackage(id: number): Promise<void> {
  await apagar('work_packages', 'id', id, 'apagar o work package')
}

export async function criarProjeto(dados: Gravavel['projetos']): Promise<Projeto> {
  return inserir('projetos', dados, 'cadastrar o projeto')
}

/** Só administrador (regra do banco). Projeto inativo some das listas de escolha; os dados dele ficam. */
export async function atualizarProjeto(id: string, dados: Partial<Gravavel['projetos']>): Promise<Projeto> {
  return atualizar('projetos', 'id', id, dados, 'alterar o projeto')
}

export async function listarMembros(projetoId?: string, empresaId?: string): Promise<Membro[]> {
  let query = supabase.from('membros').select('*, perfis:usuario_id(email, nome)')
  if (projetoId) query = query.eq('projeto_id', projetoId)
  if (empresaId) query = query.eq('empresa_id', empresaId)
  const linhas = conferirLeitura<Linha<'membros'> & { perfis?: { email?: string; nome?: string | null } | null }>(await query)
  return linhas.map((m) => ({
    id: m.id,
    usuario_id: m.usuario_id,
    empresa_id: m.empresa_id,
    projeto_id: m.projeto_id,
    papel: m.papel,
    email: m.perfis?.email,
    nome: m.perfis?.nome,
  }))
}

export async function adicionarMembro(dados: Gravavel['membros']): Promise<Linha<'membros'>> {
  if (Boolean(dados.empresa_id) === Boolean(dados.projeto_id)) {
    throw new Error('Escolha a empresa OU o projeto do acesso (um dos dois, nunca ambos).')
  }
  return inserir('membros', dados, 'dar o acesso')
}

export async function removerMembro(id: number): Promise<void> {
  await apagar('membros', 'id', id, 'remover o acesso')
}

export async function listarPerfis(): Promise<Perfil[]> {
  return conferirLeitura<Perfil>(await supabase.from('perfis').select('*').order('email'))
}

// ==========================================
// 3. CATÁLOGOS (LITOLOGIAS E SISTEMAS ÁCIDOS)
// ==========================================
export async function listarLitologias(): Promise<Litologia[]> {
  return conferirLeitura<Litologia>(await supabase.from('litologias').select('*').order('nome'))
}

export async function criarLitologia(dados: Gravavel['litologias']): Promise<Litologia> {
  const linha = escolher<'litologias'>({ ...dados }, ['nome', 'tipo', 'descricao'])
  exigir(linha.nome, 'Nome da litologia')
  return inserir('litologias', linha as Gravavel['litologias'], 'cadastrar a litologia')
}

/** Lê de v_sistemas_acidos: a tabela + conc_m, conc_pct e aditivos calculados pelo banco. */
export async function listarSistemasAcidos(): Promise<SistemaAcido[]> {
  return conferirLeitura<SistemaAcido>(await supabase.from('v_sistemas_acidos').select('*').order('id_sistema'))
}

const COLUNAS_SISTEMA_ACIDO = [
  'id_sistema', 'nome_sistema', 'categoria', 'nome_comercial',
  'componente_1', 'valor_1', 'unidade_1',
  'componente_2', 'valor_2', 'unidade_2',
  'componente_3', 'valor_3', 'unidade_3',
  'componente_4', 'valor_4', 'unidade_4',
  'composicao_original',
] as const satisfies readonly (keyof Gravavel['sistemas_acidos'])[]

/** Grava na tabela sistemas_acidos. conc_m, conc_pct e aditivos nunca são enviados. */
export async function criarSistemaAcido(dados: Gravavel['sistemas_acidos']): Promise<Linha<'sistemas_acidos'>> {
  const linha = escolher<'sistemas_acidos'>({ ...dados }, COLUNAS_SISTEMA_ACIDO)
  exigir(linha.id_sistema, 'ID do sistema')
  exigir(linha.nome_sistema, 'Nome do sistema')
  exigir(linha.componente_1, 'Componente principal')
  // componente vazio não carrega valor nem unidade
  for (const n of [2, 3, 4] as const) {
    if (!linha[`componente_${n}`]) {
      linha[`valor_${n}`] = null
      linha[`unidade_${n}`] = null
    }
  }
  return inserir('sistemas_acidos', linha as Gravavel['sistemas_acidos'], 'cadastrar o sistema ácido')
}

// ---- prefixos de código (migração 011): "IL" = Indiana Limestone, "RDA" = disco de RDA... ----
export async function listarPrefixosCodigo(): Promise<PrefixoCodigo[]> {
  return conferirLeitura<PrefixoCodigo>(await supabase.from('prefixos_codigo').select('*').order('prefixo'))
}

/** prefixoOriginal = edição (o prefixo é a chave e pode ser corrigido); sem ele, cadastro novo. */
export async function salvarPrefixoCodigo(dados: Gravavel['prefixos_codigo'], prefixoOriginal?: string): Promise<PrefixoCodigo> {
  const linha = escolher<'prefixos_codigo'>({ ...dados }, ['prefixo', 'significado', 'tipo_amostra', 'observacao'])
  exigir(linha.prefixo, 'Prefixo')
  exigir(linha.significado, 'Significado')
  linha.prefixo = linha.prefixo!.toUpperCase()   // a view v_amostras casa pelo prefixo em maiúsculas
  if (!/^[A-Z]+$/.test(linha.prefixo)) throw new Error('O prefixo é só as letras do começo do código, sem número nem espaço (ex.: IL, RDA).')
  if (prefixoOriginal) return atualizar('prefixos_codigo', 'prefixo', prefixoOriginal, linha, `salvar o prefixo ${linha.prefixo}`)
  return inserir('prefixos_codigo', linha as Gravavel['prefixos_codigo'], `cadastrar o prefixo ${linha.prefixo}`)
}

export async function apagarPrefixoCodigo(prefixo: string): Promise<void> {
  await apagar('prefixos_codigo', 'prefixo', prefixo, `apagar o prefixo ${prefixo}`)
}

/** Lista de aditivos montada a partir dos componentes 2 a 4 (ex.: "IC 0,5 wt% + Surfactante 1 wt%"). */
export function montarAditivos(s: Partial<Gravavel['sistemas_acidos']>): string {
  const partes: string[] = []
  for (const n of [2, 3, 4] as const) {
    const nome = s[`componente_${n}`]?.trim()
    if (!nome) continue
    const valor = s[`valor_${n}`]
    const unidade = s[`unidade_${n}`]?.trim()
    partes.push([nome, valor != null ? String(valor).replace('.', ',') : '', unidade || ''].filter(Boolean).join(' '))
  }
  return partes.join(' + ')
}

// ==========================================
// 4. AMOSTRAS E CONFERÊNCIAS FÍSICAS
// ==========================================
/** Linha de v_amostras (só leitura): amostra + empresa, projeto e resumo das análises. */
export type AmostraResumo = Pick<Amostra, 'id' | 'codigo' | 'litologia' | 'tipo_origem' | 'projeto_id'> & Record<string, any>

export async function listarAmostras(
  filtro?: { projeto_id?: string | null; empresa_id?: string | null; busca?: string }
): Promise<AmostraResumo[]> {
  let query = supabase.from('v_amostras').select('*').order('codigo')
  if (filtro?.projeto_id) query = query.eq('projeto_id', filtro.projeto_id)
  else if (filtro?.empresa_id) query = query.eq('empresa_id', filtro.empresa_id)
  let lista = conferirLeitura<AmostraResumo>(await query)
  if (filtro?.busca) {
    const q = filtro.busca.toLowerCase()
    lista = lista.filter((a) =>
      a.codigo?.toLowerCase().includes(q) ||
      a.litologia?.toLowerCase().includes(q) ||
      a.poco?.toLowerCase().includes(q) ||
      a.campo?.toLowerCase().includes(q) ||
      a.afloramento_local?.toLowerCase().includes(q)
    )
  }
  return lista
}

/** Uma linha de v_amostras: a amostra com empresa, projeto e contagem de análises (n_petrofisica...). */
export async function obterAmostraResumo(id: string): Promise<AmostraResumo | null> {
  const { data, error } = await supabase.from('v_amostras').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(tratarErro(error))
  return data
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
  if (amostra.error) throw new Error(tratarErro(amostra.error))
  return {
    observacoes: (amostra.data as { observacoes: string | null } | null)?.observacoes ?? null,
    temPetrofisicaDepois: conferirLeitura<{ id: number }>(depois).length > 0,
  }
}

/** Lê da TABELA amostras (não da view): é o que serve de base para editar. */
export async function buscarAmostraPorId(id: string): Promise<Amostra> {
  const { data, error } = await supabase.from('amostras').select('*').eq('id', id).single()
  if (error) throw new Error(tratarErro(error))
  return data
}

const COLUNAS_AMOSTRA = [
  'codigo', 'projeto_id', 'litologia', 'tipo_origem',
  'afloramento_local', 'fornecedor', 'bloco',
  'bacia', 'campo', 'poco', 'reservatorio', 'profundidade_m',
  'diametro_cm', 'comprimento_cm', 'massa_seca_g', 'permeabilidade_fabricante_md',
  'permeabilidade_fabricante_min_md', 'permeabilidade_fabricante_max_md',
  'finalidade', 'status', 'responsavel', 'data_coleta', 'observacoes',
] as const satisfies readonly (keyof Gravavel['amostras'])[]

export async function salvarAmostra(amostra: Partial<Gravavel['amostras']> & { id?: string }): Promise<Amostra> {
  const linha = escolher<'amostras'>({ ...amostra }, COLUNAS_AMOSTRA)
  exigir(linha.codigo, 'Código da amostra')
  exigir(linha.projeto_id, 'Projeto')
  exigir(linha.litologia, 'Litologia')
  exigir(linha.tipo_origem, 'Tipo de origem')
  if (linha.tipo_origem === 'testemunho') exigir(linha.poco, 'Poço')
  if (linha.permeabilidade_fabricante_min_md != null && linha.permeabilidade_fabricante_max_md != null
    && linha.permeabilidade_fabricante_min_md > linha.permeabilidade_fabricante_max_md) {
    throw new Error('Permeabilidade do fabricante: o valor "de" não pode ser maior que o "até".')
  }
  if (linha.status == null) delete linha.status   // not null com default no banco

  if (amostra.id) return atualizar('amostras', 'id', amostra.id, linha, `salvar a amostra ${linha.codigo}`)
  return inserir('amostras', linha as Gravavel['amostras'], `cadastrar a amostra ${linha.codigo}`)
}

export async function excluirAmostra(id: string): Promise<void> {
  await apagar('amostras', 'id', id, 'excluir a amostra')
}

export async function listarConferencias(amostraId: string): Promise<Conferencia[]> {
  return conferirLeitura<Conferencia>(
    await supabase.from('conferencias').select('*').eq('amostra_id', amostraId).order('data', { ascending: false })
  )
}

export async function adicionarConferencia(dados: Gravavel['conferencias']): Promise<Conferencia> {
  const linha = escolher<'conferencias'>({ ...dados }, ['amostra_id', 'data', 'responsaveis', 'resultado', 'observacao'])
  exigir(linha.data, 'Data da conferência')
  exigir(linha.responsaveis, 'Responsáveis')
  if (linha.resultado == null) delete linha.resultado   // not null com default 'ok' no banco
  return inserir('conferencias', linha as Gravavel['conferencias'], 'registrar a conferência')
}

// ==========================================
// 5. AS 8 ANÁLISES LABORATORIAIS
// ==========================================
export async function listarEnsaios(cfg: AnaliseConfig, amostraId: string): Promise<RegistroAnalise[]> {
  return conferirLeitura<RegistroAnalise>(
    await supabase.from(cfg.tabela).select('*').eq('amostra_id', amostraId).order('id')
  )
}

/**
 * Monta a linha a gravar a partir dos campos da configuração (e só deles): colunas
 * calculadas, id e datas de auditoria que estejam no formulário nunca são enviados.
 */
export function montarLinhaAnalise(cfg: AnaliseConfig, form: Record<string, unknown>): Record<string, unknown> {
  const linha: Record<string, unknown> = {}
  for (const c of cfg.campos) {
    const bruto = form[c.nome]
    let valor: unknown
    if (c.tipo === 'booleano') {
      valor = Boolean(bruto)
    } else if (c.tipo === 'numero') {
      valor = typeof bruto === 'number' ? bruto : paraNumero(String(bruto ?? ''))
      if (Number.isNaN(valor)) {
        throw new Error(`Campo "${c.rotulo}": "${String(bruto)}" não é um número. Use vírgula ou ponto decimal, ex.: 0,5 ou 5,2e-7.`)
      }
    } else {
      const texto = String(bruto ?? '').trim()
      valor = texto === '' ? null : texto
    }
    if (c.obrigatorio) exigir(valor, c.rotulo)
    linha[c.nome] = valor
  }
  return linha
}

export async function salvarEnsaio(
  cfg: AnaliseConfig, amostraId: string, form: Record<string, unknown>, id?: number
): Promise<RegistroAnalise> {
  const linha = montarLinhaAnalise(cfg, form)
  const oQue = `gravar o ensaio de ${cfg.titulo}`
  const gravado = id
    ? await atualizar(cfg.tabela, 'id', id, linha as Partial<Gravavel[typeof cfg.tabela]>, oQue)
    : await inserir(cfg.tabela, { ...linha, amostra_id: amostraId } as Gravavel[typeof cfg.tabela], oQue)
  return gravado as unknown as RegistroAnalise
}

export async function excluirEnsaio(cfg: AnaliseConfig, id: number): Promise<void> {
  await apagar(cfg.tabela, 'id', id, `excluir o ensaio de ${cfg.titulo}`)
}

// ---- tabelas-filhas: fases do DRX, componentes da petrografia, EDS do MEV ----
export type LinhaFilha = Record<string, unknown> & { analise_id: number }

export async function listarFilhos(cfg: AnaliseConfig, analiseIds: number[]): Promise<LinhaFilha[]> {
  if (!cfg.filha || analiseIds.length === 0) return []
  return conferirLeitura<LinhaFilha>(await supabase.from(cfg.filha.tabela).select('*').in('analise_id', analiseIds))
}

/**
 * Deixa as linhas-filhas de um ensaio iguais às informadas: grava (upsert pela chave) as que vieram
 * e só depois apaga as que saíram da lista, para uma falha no meio não deixar o ensaio sem linhas.
 */
export async function salvarFilhos(cfg: AnaliseConfig, analiseId: number, linhas: Record<string, unknown>[]): Promise<void> {
  const filha = cfg.filha
  if (!filha) return
  const chaveDe = (l: Record<string, unknown>) => filha.chave.map((k) => String(l[k] ?? '')).join('|')
  const vistas = new Set<string>()
  for (const l of linhas) {
    if (vistas.has(chaveDe(l))) {
      throw new Error(`${filha.titulo}: a linha "${filha.chave.map((k) => l[k]).join(' / ')}" está repetida. Deixe uma só e grave de novo.`)
    }
    vistas.add(chaveDe(l))
  }
  const oQue = `gravar ${filha.titulo.toLowerCase()} do ensaio #${analiseId} (o ensaio em si foi gravado)`
  if (linhas.length > 0) {
    conferir(
      await supabase.from(filha.tabela)
        .upsert(linhas.map((l) => ({ ...l, analise_id: analiseId })), { onConflict: ['analise_id', ...filha.chave].join(',') })
        .select(),
      oQue
    )
  }
  const noBanco = await listarFilhos(cfg, [analiseId])
  for (const l of noBanco.filter((x) => !vistas.has(chaveDe(x)))) {
    let q = supabase.from(filha.tabela).delete().eq('analise_id', analiseId)
    for (const k of filha.chave) q = q.eq(k, String(l[k]))
    conferir(await q.select(), oQue)
  }
}

// ==========================================
// 6. CURVAS NUMÉRICAS E PONTOS
// ==========================================
/** Curva com a contagem de pontos (não traz os pontos: podem ser milhares). */
export type CurvaResumo = Curva & { n_pontos: number | null }

export async function listarCurvas(cfg: AnaliseConfig, amostraId: string): Promise<CurvaResumo[]> {
  const consulta = (colunas: string) =>
    supabase.from('curvas').select(colunas).eq('amostra_id', amostraId).eq('analise_tabela', cfg.tabela).order('id')
  let resposta: Resposta<unknown[]> = await consulta('*, curva_pontos(count)')
  // se o banco não aceitar a contagem embutida, lista as curvas sem o número de pontos
  if (resposta.error) resposta = await consulta('*')
  const linhas = conferirLeitura(resposta as Resposta<(Curva & { curva_pontos?: { count: number }[] })[]>)
  return linhas.map(({ curva_pontos, ...c }) => ({ ...c, n_pontos: curva_pontos?.[0]?.count ?? null }))
}

/** Todos os pontos da curva, em ordem. O banco devolve no máximo 1000 linhas por chamada: busca em páginas. */
export async function pontosDaCurva(curvaId: number): Promise<{ x: number; y: number }[]> {
  const todos: { x: number; y: number }[] = []
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    const lote = conferirLeitura<{ x: number; y: number }>(
      await supabase.from('curva_pontos').select('x, y').eq('curva_id', curvaId).order('ordem').range(de, de + pagina - 1)
    )
    todos.push(...lote)
    if (lote.length < pagina) break
  }
  return todos
}

/** Apaga a curva; os pontos vão junto (on delete cascade). */
export async function apagarCurva(id: number): Promise<void> {
  await apagar('curvas', 'id', id, 'apagar a curva')
}

export async function salvarCurva(dados: Gravavel['curvas'], pontos: { x: number; y: number }[]): Promise<Curva> {
  const curva = await inserir('curvas', dados, 'gravar a curva')
  const linhas: Gravavel['curva_pontos'][] = pontos.map((p, idx) => ({ curva_id: curva.id, ordem: idx + 1, x: p.x, y: p.y }))

  // Inserção em lotes de 500
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('curva_pontos').insert(linhas.slice(i, i + 500))
    if (error) {
      // não deixa curva pela metade no banco
      await supabase.from('curvas').delete().eq('id', curva.id)
      throw new Error(`Não foi possível gravar os pontos da curva (a curva não foi salva). ${tratarErro(error)}`)
    }
  }
  return curva
}

// ==========================================
// 7. ARQUIVOS E SUPABASE STORAGE
// ==========================================
export async function listarArquivosAnexos(amostraId: string, cfg?: AnaliseConfig): Promise<ArquivoAnexo[]> {
  let query = supabase.from('arquivos').select('*').eq('amostra_id', amostraId)
  // registros antigos guardaram o nome da pasta no lugar do nome da tabela
  if (cfg) query = query.in('analise_tabela', [cfg.tabela, cfg.pastaArquivos])
  return conferirLeitura<ArquivoAnexo>(await query)
}

export async function uploadArquivoStorage(
  amostraId: string,
  cfg: AnaliseConfig,
  arquivo: File,
  analiseId?: number
): Promise<ArquivoAnexo> {
  const timestamp = Date.now()
  const nomeSanitizado = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  // convenção da migração 0007: amostras/<amostra_id>/<analise>/<nome>
  const caminhoStorage = `amostras/${amostraId}/${cfg.pastaArquivos}/${timestamp}_${nomeSanitizado}`

  // 1. Enviar para o bucket de storage
  const { error: errUpload } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminhoStorage, arquivo, {
    cacheControl: '3600',
    upsert: false
  })
  if (errUpload) throw new Error(`Não foi possível enviar o arquivo "${arquivo.name}". ${tratarErro(errUpload)}`)

  // 2. Registrar metadados na tabela arquivos
  try {
    return await inserir('arquivos', {
      amostra_id: amostraId,
      analise_tabela: cfg.tabela,
      analise_id: analiseId ?? null,
      nome_original: arquivo.name,
      caminho: caminhoStorage,
      tamanho_bytes: arquivo.size,
      tipo: arquivo.type || null
    }, `registrar o arquivo "${arquivo.name}"`)
  } catch (err) {
    // não deixa arquivo solto no bucket sem registro no banco
    await supabase.storage.from(BUCKET_ARQUIVOS).remove([caminhoStorage])
    throw err
  }
}

/** Apaga o registro e depois o arquivo do Storage (se o banco recusar, o arquivo continua lá). */
export async function apagarArquivoAnexo(arq: Pick<ArquivoAnexo, 'id' | 'caminho' | 'nome_original'>): Promise<void> {
  await apagar('arquivos', 'id', arq.id, `apagar o arquivo "${arq.nome_original}"`)
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).remove([arq.caminho])
  if (error) throw new Error(`O registro de "${arq.nome_original}" foi apagado, mas o arquivo ficou no Storage. ${tratarErro(error)}`)
}

export async function obterUrlDownloadArquivo(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ARQUIVOS).createSignedUrl(caminho, 3600)
  if (error) throw new Error(tratarErro(error))
  return data.signedUrl
}

// ==========================================
// 8. LITERATURA
// ==========================================
export async function listarPublicacoes(categoria?: 'geral' | 'propria'): Promise<Publicacao[]> {
  let query = supabase.from('publicacoes').select('*').order('ano_ordem', { ascending: false })
  if (categoria) query = query.eq('categoria', categoria)
  return conferirLeitura<Publicacao>(await query)
}

const COLUNAS_PUBLICACAO = [
  'id_referencia', 'categoria', 'tipo', 'autor', 'ano', 'titulo', 'periodico', 'doi',
  'resumo', 'palavras_chave', 'eixos', 'projeto_id',
] as const satisfies readonly (keyof Gravavel['publicacoes'])[]

/**
 * Publicação nova = insert: ID que já existe é recusado (nunca sobrescreve outra publicação).
 * Edição = update pelo ID original (idOriginal), que não muda.
 * ano_ordem é calculada pelo banco e nunca é enviada.
 */
export async function salvarPublicacao(dados: Gravavel['publicacoes'], idOriginal?: string): Promise<Publicacao> {
  const linha = escolher<'publicacoes'>({ ...dados }, COLUNAS_PUBLICACAO)
  exigir(linha.id_referencia, 'ID de referência')
  exigir(linha.autor, 'Autor(es)')
  if (linha.categoria === 'geral') linha.projeto_id = null

  if (idOriginal) {
    delete linha.id_referencia
    return atualizar('publicacoes', 'id_referencia', idOriginal, linha, `salvar a publicação ${idOriginal}`)
  }
  const resposta = await supabase.from('publicacoes').insert(linha as Gravavel['publicacoes']).select().single()
  if ((resposta.error as { code?: string } | null)?.code === '23505') {
    throw new Error(`Já existe uma publicação com o ID ${linha.id_referencia}. Escolha outro ID ou edite a existente. Nada foi gravado.`)
  }
  return conferir<Publicacao>(resposta, `cadastrar a publicação ${linha.id_referencia}`)
}

/** Próximo código livre para publicação própria: LCP-0001, LCP-0002... */
export async function proximoCodigoProprio(): Promise<string> {
  const linhas = conferirLeitura<{ id_referencia: string }>(
    await supabase.from('publicacoes').select('id_referencia').like('id_referencia', 'LCP-%')
  )
  const n = Math.max(0, ...linhas.map((l) => Number(l.id_referencia.slice(4)) || 0)) + 1
  return `LCP-${String(n).padStart(4, '0')}`
}

/** Ids das amostras usadas na publicação (só as que o usuário pode ver). */
export async function amostrasDaPublicacao(idReferencia: string): Promise<string[]> {
  const linhas = conferirLeitura<{ amostra_id: string }>(
    await supabase.from('publicacao_amostras').select('amostra_id').eq('id_referencia', idReferencia)
  )
  return linhas.map((l) => l.amostra_id)
}

/** Deixa as amostras ligadas à publicação iguais à lista: inclui as novas e só depois tira as que saíram. */
export async function ligarAmostrasPublicacao(idReferencia: string, amostraIds: string[]): Promise<void> {
  const atuais = await amostrasDaPublicacao(idReferencia)
  const novas: Gravavel['publicacao_amostras'][] = amostraIds
    .filter((id) => !atuais.includes(id)).map((amostra_id) => ({ id_referencia: idReferencia, amostra_id }))
  const oQue = `ligar as amostras à publicação ${idReferencia} (a publicação em si foi gravada)`
  if (novas.length > 0) conferir(await supabase.from('publicacao_amostras').insert(novas).select(), oQue)
  const sairam = atuais.filter((id) => !amostraIds.includes(id))
  if (sairam.length > 0) {
    conferir(
      await supabase.from('publicacao_amostras').delete().eq('id_referencia', idReferencia).in('amostra_id', sairam).select(),
      oQue
    )
  }
}

export type ArquivoPublicacao = Pick<ArquivoAnexo, 'id' | 'nome_original' | 'caminho' | 'tamanho_bytes'>

/** PDFs e anexos de uma publicação. */
export async function arquivosDaPublicacao(idReferencia: string): Promise<ArquivoPublicacao[]> {
  return conferirLeitura<ArquivoPublicacao>(
    await supabase.from('arquivos').select('id, nome_original, caminho, tamanho_bytes')
      .eq('id_referencia', idReferencia).order('enviado_em', { ascending: false })
  )
}

/** Arquivos de todas as publicações que o usuário vê, por id_referencia (para o botão "PDF" da lista). */
export async function listarArquivosPublicacoes(): Promise<Record<string, ArquivoPublicacao[]>> {
  const linhas = conferirLeitura<ArquivoPublicacao & { id_referencia: string }>(
    await supabase.from('arquivos').select('id, id_referencia, nome_original, caminho, tamanho_bytes')
      .not('id_referencia', 'is', null).order('enviado_em', { ascending: false })
  )
  const porPublicacao: Record<string, ArquivoPublicacao[]> = {}
  for (const l of linhas) (porPublicacao[l.id_referencia] ??= []).push(l)
  return porPublicacao
}

/** Envia o PDF para publicacoes/<id_referencia>/ no Storage e registra em arquivos. */
export async function enviarPdfPublicacao(idReferencia: string, arquivo: File): Promise<void> {
  const caminho = `publicacoes/${idReferencia}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).upload(caminho, arquivo, { cacheControl: '3600', upsert: false })
  if (error) throw new Error(`A publicação foi gravada, mas não foi possível enviar o PDF "${arquivo.name}". ${tratarErro(error)}`)
  try {
    await inserir('arquivos', {
      id_referencia: idReferencia, tipo: 'pdf', nome_original: arquivo.name, caminho, tamanho_bytes: arquivo.size,
    }, `registrar o PDF "${arquivo.name}"`)
  } catch (err) {
    // não deixa arquivo solto no bucket sem registro no banco
    await supabase.storage.from(BUCKET_ARQUIVOS).remove([caminho])
    throw err
  }
}

// ==========================================
// 9. MÉTRICAS DO PAINEL GERENCIAL
// ==========================================
/** Contagens do contexto aberto: um projeto, ou todos os projetos da empresa. */
export async function obterMetricasGerais(contexto: { empresaId: string | null; projetoId: string | null }) {
  const contar = async (tabela: string, filtro?: [string, string]) => {
    let q = supabase.from(tabela).select('*', { count: 'exact', head: true })
    if (filtro) q = q.eq(filtro[0], filtro[1])
    const { count, error } = await q
    if (error) throw new Error(tratarErro(error))
    return count || 0
  }
  const doContexto: [string, string] | undefined = contexto.projetoId
    ? ['projeto_id', contexto.projetoId]
    : contexto.empresaId ? ['empresa_id', contexto.empresaId] : undefined

  const projetos = await listarProjetos(contexto.empresaId)
  const idsProjetos = contexto.projetoId ? [contexto.projetoId] : projetos.map((p) => p.id)
  const [totalAmostras, workPackages, totalPublicacoes, totalSistemasAcidos] = await Promise.all([
    contar('v_amostras', doContexto),
    listarWorkPackages(idsProjetos),
    contar('publicacoes', ['categoria', 'propria']),
    contar('sistemas_acidos'),
  ])
  return {
    totalProjetos: idsProjetos.length,
    totalAmostras,
    totalWorkPackages: workPackages.length,
    totalPublicacoes,
    totalSistemasAcidos,
  }
}
