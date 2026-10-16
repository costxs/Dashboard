// Acrescente ao final de src/tipos/banco.ts
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
