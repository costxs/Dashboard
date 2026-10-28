// Tipos das tabelas do banco, escritos a partir de docs/referencia/banco/*.sql.
//
// "Gravavel" tem, para cada tabela, só as colunas que o app pode ENVIAR num
// insert/update/upsert. Ficam de fora:
//   - colunas calculadas (generated always as ... stored): o banco recusa;
//   - ids automáticos (identity / gen_random_uuid);
//   - colunas de auditoria preenchidas pelo banco (criado_por, criado_em, atualizado_em...).
// Campo sem "?" é obrigatório no banco (not null, sem default).
//
// "Linha<T>" é o que o banco DEVOLVE: as colunas graváveis + as de "SoLeitura".

export type Papel = 'leitor' | 'editor'
export type TipoOrigem = 'afloramento' | 'testemunho'
export type StatusAmostra = 'disponivel' | 'reservada' | 'em ensaio' | 'utilizada' | 'nao localizada' | 'arquivada'
export type Momento = 'antes' | 'depois'
export type CategoriaPublicacao = 'geral' | 'propria'
export type MetodoDrx = 'Rietveld' | 'XRF' | 'semiquantitativo'
export type MorfologiaWormhole = 'dissolução de face' | 'cônico' | 'dominante' | 'ramificado' | 'uniforme'
export type UnidadeConcentracao = 'wt%' | 'M' | 'N'
export type PvbtCondicao = 'completo' | 'parcial' | 'nao_atingido' | 'nao_calculado'
export type PvbtClasse = 'normal' | 'otimo'
export type LwhReferencia = 'microCT' | 'darcy'
export type ObtencaoDado = 'bancada' | 'tabela' | 'grafico' | 'texto'

// -----------------------------------------------------------------------------
// 0001: acesso
// -----------------------------------------------------------------------------
export interface EmpresaGravavel {
  sigla: string
  nome: string
}

export interface ProjetoGravavel {
  empresa_id: string
  codigo: string
  nome: string
  descricao?: string | null
  inicio?: string | null
  fim?: string | null
  ativo?: boolean
}

/** Exatamente um dos dois: empresa_id OU projeto_id (constraint um_nivel). */
export interface MembroGravavel {
  usuario_id: string
  empresa_id?: string | null
  projeto_id?: string | null
  papel: Papel
}

export interface WorkPackageGravavel {
  projeto_id: string
  codigo: string
  nome: string
  inicio?: string | null
  fim?: string | null
  progresso_planejado?: number | null
  progresso_realizado?: number | null
}

// -----------------------------------------------------------------------------
// 0002: catálogos
// -----------------------------------------------------------------------------
export interface LitologiaGravavel {
  nome: string
  tipo?: string | null
  descricao?: string | null
}

/** conc_m, conc_pct e aditivos NÃO existem aqui: são calculados em v_sistemas_acidos. */
export interface SistemaAcidoGravavel {
  id_sistema: string
  nome_sistema: string
  categoria?: string | null
  nome_comercial?: string | null
  componente_1: string
  valor_1?: number | null
  unidade_1?: string | null
  componente_2?: string | null
  valor_2?: number | null
  unidade_2?: string | null
  componente_3?: string | null
  valor_3?: number | null
  unidade_3?: string | null
  componente_4?: string | null
  valor_4?: number | null
  unidade_4?: string | null
  composicao_original?: string | null
}

/** Migração 011: o que significa o começo do código da amostra (IL, RDA...). */
export interface PrefixoCodigoGravavel {
  prefixo: string
  significado: string
  tipo_amostra?: 'plug' | 'disco' | 'outro' | null
  observacao?: string | null
}

// -----------------------------------------------------------------------------
// 0003: amostras e análises
// -----------------------------------------------------------------------------
export interface AmostraGravavel {
  codigo: string
  projeto_id: string
  litologia: string
  tipo_origem: TipoOrigem
  afloramento_local?: string | null
  fornecedor?: string | null
  bloco?: string | null
  bacia?: string | null
  campo?: string | null
  poco?: string | null
  reservatorio?: string | null
  profundidade_m?: number | null
  diametro_cm?: number | null
  comprimento_cm?: number | null
  massa_seca_g?: number | null
  permeabilidade_fabricante_md?: number | null
  // faixa do fornecedor (013); valor único = min e max iguais
  permeabilidade_fabricante_min_md?: number | null
  permeabilidade_fabricante_max_md?: number | null
  finalidade?: string | null
  status?: StatusAmostra
  responsavel?: string | null
  data_coleta?: string | null
  observacoes?: string | null
}

export interface ConferenciaGravavel {
  amostra_id: string
  data: string
  responsaveis: string
  resultado?: string
  observacao?: string | null
}

/** Colunas comuns a toda análise. */
interface AnaliseComum {
  amostra_id: string
  data_ensaio?: string | null
  responsavel?: string | null
  observacoes?: string | null
}

export interface AnalisePetrofisicaGravavel extends AnaliseComum {
  momento?: Momento
  pressao_confinamento_psi?: number | null
  porosidade_pct?: number | null
  permeabilidade_gas_md?: number | null
  permeabilidade_liquido_md?: number | null
  densidade_grao_g_cm3?: number | null
  densidade_bulk_g_cm3?: number | null
  densidade_aparente_g_cm3?: number | null
  massa_g?: number | null
  equipamento?: string | null
  /** reta ΔP × Q usada no k (migração 017): 'intercepto' = como o FitLinear do Origin; 'origem' = ΔP = a·Q */
  ajuste_modo?: 'intercepto' | 'origem' | null
  ajuste_inclinacao?: number | null
  ajuste_intercepto_psi?: number | null
  ajuste_r2?: number | null
}

export interface AnaliseMicroctGravavel extends AnaliseComum {
  momento?: Momento
  resolucao_um_voxel?: number | null
  porosidade_ct_pct?: number | null
  volume_dissolvido_mm3?: number | null
  equipamento?: string | null
}

/** razao_dp é calculada pelo banco. */
export interface AnaliseCorefloodingGravavel extends AnaliseComum {
  id_sistema?: string | null
  vazao_ml_min?: number | null
  temperatura_c?: number | null
  pressao_confinamento_psi?: number | null
  contrapressao_psi?: number | null
  /** Dead Volume das linhas e conexões (migração 017) */
  volume_morto_cm3?: number | null
  breakthrough?: boolean | null
  pvbt?: number | null
  dp_inicial_psi?: number | null
  dp_final_psi?: number | null
  morfologia_wormhole?: MorfologiaWormhole | null
  massa_apos_g?: number | null
  porosidade_apos_pct?: number | null
  // migração 010 (base de PVbt): as mesmas colunas da planilha de PVbt
  id_experimento?: string | null
  acido?: string | null
  conc_valor?: number | null
  conc_unidade?: UnidadeConcentracao | null
  aditivo?: string | null
  aditivo_valor?: number | null
  aditivo_unidade?: string | null
  tratamento?: string | null
  temperatura_obs?: string | null
  pvbt_condicao?: PvbtCondicao | null
  pvbt_classe?: PvbtClasse | null
  comprimento_wormhole_cm?: number | null
  comprimento_wormhole_uct_cm?: number | null
  lwh_referencia?: LwhReferencia | null
  fluido_saturacao?: string | null
  tipo_fluido_saturacao?: string | null
  metodo_saturacao?: string | null
  forma_saturacao?: string | null
  obtencao_dado?: ObtencaoDado | null
  vel_intersticial_fonte?: number | null
  k_fluxo_md?: number | null
  tipo_experimento?: string | null
  status_ensaio?: string | null
  projeto_origem?: string | null
  estudo?: string | null
  equipamento?: string | null
  rotulo_original?: string | null
}

/** perda_massa_g e perda_massa_pct são calculadas pelo banco. */
export interface AnaliseReatividadeEstaticaGravavel extends AnaliseComum {
  id_sistema?: string | null
  temperatura_c?: number | null
  pressao_psi?: number | null
  volume_acido_ml?: number | null
  tempo_min?: number | null
  massa_inicial_g?: number | null
  massa_final_g?: number | null
}

/** temperatura_nominal_c, omega_rad_s, raiz_omega e taxa_reacao_mol_m2_s são calculadas pelo banco. */
export interface AnaliseRdaGravavel extends AnaliseComum {
  id_sistema: string
  rotacao_rpm?: number | null
  pressao_psi?: number | null
  temperatura_c?: number | null
  dim_h_in?: number | null
  dim_d_in?: number | null
  tempo_min?: number | null
  taxa_reacao_mol_cm2_s?: number | null
  coef_difusao_cm2_s?: number | null
  metodo_quantificacao?: string | null
}

export interface AnaliseDrxGravavel extends AnaliseComum {
  metodo?: MetodoDrx | null
}

export interface DrxFaseGravavel {
  analise_id: number
  mineral: string
  pct?: number | null
}

export interface AnalisePetrografiaGravavel extends AnaliseComum {
  lamina?: string | null
  aumento?: string | null
  tipo_porosidade?: string | null
  granulometria?: string | null
  descricao_textural?: string | null
}

export interface PetrografiaComponenteGravavel {
  analise_id: number
  componente: string
  pct?: number | null
}

export interface AnaliseMevGravavel extends AnaliseComum {
  momento?: Momento | null
  aumento?: string | null
  detector?: string | null
  descricao?: string | null
}

export interface MevEdsGravavel {
  analise_id: number
  ponto?: string
  elemento: string
  pct_massa?: number | null
  pct_atomico?: number | null
}

export interface CurvaGravavel {
  amostra_id: string
  analise_tabela: TabelaAnalise
  analise_id: number
  nome: string
  x_grandeza: string
  x_unidade?: string | null
  y_grandeza: string
  y_unidade?: string | null
}

export interface CurvaPontoGravavel {
  curva_id: number
  ordem: number
  x: number
  y: number
}

/** id_referencia vem da migração 0004 (arquivo de publicação). */
export interface ArquivoGravavel {
  amostra_id?: string | null
  analise_tabela?: TabelaAnalise | null
  analise_id?: number | null
  id_referencia?: string | null
  tipo?: string | null
  nome_original: string
  caminho: string
  tamanho_bytes?: number | null
  sha256?: string | null
}

// -----------------------------------------------------------------------------
// 0004: literatura
// -----------------------------------------------------------------------------
/** ano_ordem é calculada pelo banco. */
export interface PublicacaoGravavel {
  id_referencia: string
  categoria: CategoriaPublicacao
  tipo?: string | null
  autor: string
  ano?: string | null
  titulo?: string | null
  periodico?: string | null
  doi?: string | null
  resumo?: string | null
  palavras_chave?: string[] | null
  eixos?: string[] | null
  projeto_id?: string | null
}

export interface PublicacaoAmostraGravavel {
  id_referencia: string
  amostra_id: string
}

// -----------------------------------------------------------------------------
// Mapa tabela -> colunas graváveis. Toda gravação do app passa por aqui.
// -----------------------------------------------------------------------------
export interface Gravavel {
  empresas: EmpresaGravavel
  projetos: ProjetoGravavel
  membros: MembroGravavel
  work_packages: WorkPackageGravavel
  litologias: LitologiaGravavel
  sistemas_acidos: SistemaAcidoGravavel
  prefixos_codigo: PrefixoCodigoGravavel
  amostras: AmostraGravavel
  conferencias: ConferenciaGravavel
  analise_petrofisica: AnalisePetrofisicaGravavel
  analise_microct: AnaliseMicroctGravavel
  analise_coreflooding: AnaliseCorefloodingGravavel
  analise_reatividade_estatica: AnaliseReatividadeEstaticaGravavel
  analise_rda: AnaliseRdaGravavel
  analise_drx: AnaliseDrxGravavel
  drx_fases: DrxFaseGravavel
  analise_petrografia: AnalisePetrografiaGravavel
  petrografia_componentes: PetrografiaComponenteGravavel
  analise_mev: AnaliseMevGravavel
  mev_eds: MevEdsGravavel
  curvas: CurvaGravavel
  curva_pontos: CurvaPontoGravavel
  arquivos: ArquivoGravavel
  publicacoes: PublicacaoGravavel
  publicacao_amostras: PublicacaoAmostraGravavel
}

export type Tabela = keyof Gravavel

export type TabelaAnalise =
  | 'analise_petrofisica' | 'analise_microct' | 'analise_coreflooding'
  | 'analise_reatividade_estatica' | 'analise_rda' | 'analise_drx'
  | 'analise_petrografia' | 'analise_mev'

// -----------------------------------------------------------------------------
// Colunas que só o banco preenche (nunca enviar).
// -----------------------------------------------------------------------------
interface Auditoria {
  criado_em: string
  atualizado_em: string
}

/** Colunas calculadas (generated always as ... stored) de cada análise. */
export interface Calculadas {
  analise_petrofisica: object
  analise_microct: object
  analise_coreflooding: { razao_dp: number | null }
  analise_reatividade_estatica: { perda_massa_g: number | null; perda_massa_pct: number | null }
  analise_rda: {
    temperatura_nominal_c: number | null
    omega_rad_s: number | null
    raiz_omega: number | null
    taxa_reacao_mol_m2_s: number | null
  }
  analise_drx: object
  analise_petrografia: object
  analise_mev: object
}

type SoLeituraAnalises = { [T in TabelaAnalise]: { id: number } & Auditoria & Calculadas[T] }

export interface SoLeitura extends SoLeituraAnalises {
  empresas: { id: string; criado_em: string }
  projetos: { id: string; criado_em: string }
  membros: { id: number }
  work_packages: { id: number }
  litologias: object
  sistemas_acidos: object
  prefixos_codigo: object
  amostras: { id: string } & Auditoria
  conferencias: { id: number }
  drx_fases: object
  petrografia_componentes: object
  mev_eds: object
  curvas: { id: number; criado_em: string }
  curva_pontos: object
  arquivos: { id: number; enviado_em: string }
  publicacoes: { ano_ordem: number | null; criado_em: string }
  publicacao_amostras: object
}

/** Linha devolvida pelo banco. */
export type Linha<T extends Tabela> = Gravavel[T] & SoLeitura[T]

// -----------------------------------------------------------------------------
// Nomes usados nas telas
// -----------------------------------------------------------------------------
export interface Perfil {
  id: string
  email: string
  nome: string | null
  administrador: boolean
  ativo: boolean
  criado_em?: string
  // migração 020: cadastro pelo dashboard com aprovação do administrador
  situacao?: 'pendente' | 'aprovado' | 'recusado'
  instituicao?: string | null
  motivo?: string | null
  decidido_em?: string | null
}

export type Empresa = Linha<'empresas'>
export type Projeto = Linha<'projetos'>
export type WorkPackage = Linha<'work_packages'>
export type Litologia = Linha<'litologias'>
export type PrefixoCodigo = Linha<'prefixos_codigo'>
export type Amostra = Linha<'amostras'>
export type Conferencia = Linha<'conferencias'>
export type Curva = Linha<'curvas'>
export type ArquivoAnexo = Linha<'arquivos'>
export type Publicacao = Linha<'publicacoes'>

/** Membro com e-mail e nome do perfil (embutidos na consulta). */
export type Membro = Linha<'membros'> & { email?: string; nome?: string | null }

/** View v_sistemas_acidos: a tabela + concentrações convertidas e aditivos. Só leitura. */
export type SistemaAcido = Linha<'sistemas_acidos'> & {
  conc_m: number | null
  conc_pct: number | null
  aditivos: string | null
}

/** Registro de análise lido do banco: colunas variam por tabela (ver config/analises.ts). */
export type RegistroAnalise = { id: number; amostra_id: string } & Record<string, unknown>
