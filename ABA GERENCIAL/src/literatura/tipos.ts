// Cópia do Banco da Literatura do dashboard de visualização ("src/..." na raiz), para o gerencial.
// Se mudar uma regra aqui, mude lá também.
import type { CategoriaPublicacao } from '../tipos/banco'

export interface PublicacaoLit {
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
  criado_em?: string | null
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

/** View v_pvbt: ensaios de PVbt das três fontes, com as colunas calculadas pelo banco. */
export type FontePvbt = 'LCPETRO' | 'Literatura' | 'Petrobras'
export interface PontoPvbt {
  fonte: FontePvbt
  id_experimento: string
  analise_id: number | null
  amostra_uuid: string | null
  id_amostra: string
  projeto_id: string | null
  id_referencia: string | null
  referencia_autor: string | null
  litologia: string
  dimensao_nominal_in: string | null
  diametro_cm: number | null
  comprimento_cm: number | null
  porosidade_pct: number | null
  faixa_porosidade: string | null
  volume_poroso_cm3: number | null
  k_inicial_md: number | null
  faixa_permeabilidade: string | null
  id_sistema: string | null
  acido: string | null
  conc_valor: number | null
  conc_unidade: string | null
  conc_pct: number | null
  conc_m: number | null
  aditivo: string | null
  aditivo_valor: number | null
  aditivo_unidade: string | null
  tratamento: string | null
  temperatura_c: number | null
  temperatura_obs: string | null
  temperatura_nominal_c: number | null
  vazao_ml_min: number | null
  vazao_nominal_ml_min: number | null
  vel_darcy_cm_min: number | null
  vel_intersticial_cm_min: number | null
  vel_intersticial_nominal_cm_min: number | null
  pvbt: number | null
  pvbt_condicao: string | null
  pvbt_classe: string | null
  comprimento_wormhole_cm: number | null
  comprimento_wormhole_uct_cm: number | null
  lwh_referencia: string | null
  volume_poroso_wh_cm3: number | null
  pvbt_por_darcy: number | null
  pvbt_por_uct: number | null
  obtencao_dado: string | null
  p_confinamento_psi: number | null
  breakthrough: boolean | null
  data_ensaio: string | null
  ano: number | null
  estudo: string | null
  observacoes: string | null
}

export interface SistemaAcidoView {
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

