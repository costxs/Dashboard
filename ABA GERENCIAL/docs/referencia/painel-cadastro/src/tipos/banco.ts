// Tipos das tabelas e views do banco (migrações em supabase/migrations).
// Quando o projeto estiver no Supabase, dá para gerar isto automaticamente:
//   npx supabase gen types typescript --project-id <id> > src/tipos/supabase.ts

export type Papel = 'leitor' | 'editor'
export type TipoOrigem = 'afloramento' | 'testemunho'
export type StatusAmostra = 'cadastrada' | 'em ensaio' | 'utilizada' | 'arquivada'
export type Momento = 'antes' | 'depois'
export type CategoriaPublicacao = 'geral' | 'propria'

export interface Perfil {
  id: string
  email: string
  nome: string | null
  administrador: boolean
  ativo: boolean
}

export interface Empresa {
  id: string
  sigla: string
  nome: string
}

export interface Projeto {
  id: string
  empresa_id: string
  codigo: string
  nome: string
  descricao: string | null
  inicio: string | null
  fim: string | null
  ativo: boolean
}

export interface WorkPackage {
  id: number
  projeto_id: string
  codigo: string
  nome: string
  inicio: string | null
  fim: string | null
  progresso_planejado: number | null
  progresso_realizado: number | null
}

export interface Litologia {
  nome: string
  tipo: string | null
  descricao: string | null
}

export interface SistemaAcido {
  id_sistema: string
  nome_sistema: string
  categoria: string | null
  nome_comercial: string | null
  componente_1: string
  valor_1: number | null
  unidade_1: string | null
  componente_2?: string | null
  valor_2?: number | null
  unidade_2?: string | null
  conc_m: number | null
  conc_pct: number | null
  aditivos: string | null
}

/** Tabela amostras (o que se grava). */
export interface Amostra {
  id: string
  codigo: string
  projeto_id: string
  litologia: string
  tipo_origem: TipoOrigem
  afloramento_local: string | null
  fornecedor: string | null
  bloco: string | null
  bacia: string | null
  campo: string | null
  poco: string | null
  reservatorio: string | null
  profundidade_m: number | null
  diametro_cm: number | null
  comprimento_cm: number | null
  massa_seca_g: number | null
  permeabilidade_fabricante_md: number | null
  finalidade: string | null
  status: StatusAmostra
  responsavel: string | null
  data_coleta: string | null
  observacoes: string | null
}

/** View v_amostras (o que se lê no banco de amostras e na ficha). */
export interface AmostraResumo {
  id: string
  codigo: string
  litologia: string
  tipo_origem: TipoOrigem
  status: StatusAmostra
  finalidade: string | null
  empresa: string
  empresa_id: string
  projeto: string
  projeto_id: string
  afloramento_local: string | null
  fornecedor: string | null
  bacia: string | null
  campo: string | null
  poco: string | null
  reservatorio: string | null
  profundidade_m: number | null
  diametro_cm: number | null
  comprimento_cm: number | null
  massa_seca_g: number | null
  permeabilidade_fabricante_md: number | null
  porosidade_pct: number | null
  k_gas_md: number | null
  k_liquido_md: number | null
  pressao_confinamento_psi: number | null
  volume_poroso_cm3: number | null
  k_liquido_depois_md: number | null
  pvbt: number | null
  breakthrough: boolean | null
  razao_dp: number | null
  n_petrofisica: number
  n_microct: number
  n_coreflooding: number
  n_reatividade: number
  n_rda: number
  n_drx: number
  n_petrografia: number
  n_mev: number
}

export interface DashboardProjeto {
  projeto_id: string
  projeto: string
  nome: string
  empresa: string
  empresa_id: string
  n_amostras: number
  n_em_ensaio: number
  n_utilizadas: number
  n_wps: number
  progresso_planejado: number | null
  progresso_realizado: number | null
}

/** Registro genérico de análise: as colunas variam por tabela (ver config/analises.ts). */
export type RegistroAnalise = { id: number; amostra_id: string } & Record<string, unknown>

export interface Curva {
  id: number
  amostra_id: string
  analise_tabela: string
  analise_id: number
  nome: string
  x_grandeza: string
  x_unidade: string | null
  y_grandeza: string
  y_unidade: string | null
}

export interface PontoCurva {
  curva_id: number
  ordem: number
  x: number
  y: number
}

export interface Arquivo {
  id: number
  amostra_id: string | null
  analise_tabela: string | null
  analise_id: number | null
  id_referencia: string | null
  tipo: string | null
  nome_original: string
  caminho: string
  tamanho_bytes: number | null
  enviado_em: string
}

export interface Publicacao {
  id_referencia: string
  categoria: CategoriaPublicacao
  tipo: string | null
  autor: string
  ano: string | null
  ano_ordem: number | null
  titulo: string | null
  periodico: string | null
  doi: string | null
  resumo: string | null
  palavras_chave: string[] | null
  eixos: string[] | null
  projeto_id: string | null
  n_dados_rda: number
  n_amostras: number
}

/** View v_lit_dados_rda: a aba "ensaios" da planilha, com as colunas calculadas. */
export interface DadoLiteraturaRda {
  id_ensaio: string
  id_referencia: string
  referencia_autor: string
  ano: number | null
  id_rocha: string
  litologia: string
  composicao_rocha: string | null
  calcita_pct: number | null
  id_sistema: string
  nome_sistema: string
  acido: string
  conc_valor: number | null
  conc_unidade: string | null
  conc_pct: number | null
  conc_m: number | null
  aditivos: string | null
  temperatura_c: number | null
  temperatura_nominal_c: number | null
  pressao_psi: number | null
  tipo_variavel: string | null
  rotacao_rpm: number | null
  omega_rad_s: number | null
  raiz_omega: number | null
  shear_rate_s1: number | null
  taxa_reacao_mol_cm2_s: number | null
  taxa_reacao_mol_m2_s: number | null
  metodo_quantificacao: string | null
  obtencao_dado: string | null
}

/** View v_rda_comparacao: literatura + ensaios do laboratório, mesmas colunas. */
export interface PontoRdaComparacao {
  fonte: 'literatura' | 'lcpetro'
  id: string
  rotulo: string
  projeto_id: string | null
  litologia: string
  acido: string
  conc_m: number | null
  aditivos: string | null
  temperatura_nominal_c: number | null
  pressao_psi: number | null
  rotacao_rpm: number | null
  raiz_omega: number | null
  taxa_reacao_mol_m2_s: number | null
  obtencao_dado: string | null
}
