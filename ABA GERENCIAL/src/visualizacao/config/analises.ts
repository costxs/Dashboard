// Configuração das 8 análises da ficha da amostra, na ordem da reunião.
// O formulário, a tabela e as abas são montados a partir daqui: para acrescentar
// um campo, basta criar a coluna no banco e acrescentar uma linha em "campos".

export type TipoCampo = 'numero' | 'texto' | 'textoLongo' | 'data' | 'lista' | 'booleano' | 'sistema'

export interface Campo {
  nome: string            // nome da coluna no banco
  rotulo: string
  tipo: TipoCampo
  unidade?: string
  opcoes?: string[]       // para tipo 'lista'
  obrigatorio?: boolean
  ajuda?: string
  passo?: string          // step do input numérico (ex.: 'any')
}

export interface CampoCalculado {
  nome: string
  rotulo: string
  unidade?: string
  casas?: number
  cientifico?: boolean
}

export interface TabelaFilha {
  tabela: string          // ex.: 'drx_fases'
  titulo: string
  chave: string[]         // colunas da chave além de analise_id
  campos: Campo[]
}

export interface CurvaPadrao {
  nome: string
  x_grandeza: string
  x_unidade: string
  y_grandeza: string
  y_unidade: string
}

export interface ConfigAnalise {
  numero: number
  chave: string           // usado na URL / aba
  titulo: string
  tabela: string          // tabela no banco
  contador: string        // coluna n_* em v_amostras
  campos: Campo[]
  calculados?: CampoCalculado[]
  colunasResumo: string[] // colunas mostradas na lista de registros
  filha?: TabelaFilha
  curvas?: CurvaPadrao[]  // curvas típicas desta análise (atalho no formulário de curva)
  pastaArquivos: string   // subpasta no Storage: amostras/<id>/<pasta>/...
}

const campoData: Campo = { nome: 'data_ensaio', rotulo: 'Data do ensaio', tipo: 'data' }
const campoResponsavel: Campo = { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto' }
const campoObs: Campo = { nome: 'observacoes', rotulo: 'Observações', tipo: 'textoLongo' }
const campoMomento: Campo = {
  nome: 'momento', rotulo: 'Momento', tipo: 'lista', opcoes: ['antes', 'depois'],
  ajuda: 'Antes ou depois da acidificação',
}

export const ANALISES: ConfigAnalise[] = [
  {
    numero: 1, chave: 'petrofisica', titulo: 'Petrofísica', tabela: 'analise_petrofisica',
    contador: 'n_petrofisica', pastaArquivos: 'petrofisica',
    campos: [
      campoData, campoMomento,
      { nome: 'pressao_confinamento_psi', rotulo: 'Pressão de confinamento', tipo: 'numero', unidade: 'psi', ajuda: 'Entrada do ensaio' },
      { nome: 'porosidade_pct', rotulo: 'Porosidade', tipo: 'numero', unidade: '%' },
      { nome: 'permeabilidade_gas_md', rotulo: 'Permeabilidade ao gás', tipo: 'numero', unidade: 'mD' },
      { nome: 'permeabilidade_liquido_md', rotulo: 'Permeabilidade ao líquido (em fluxo)', tipo: 'numero', unidade: 'mD' },
      { nome: 'densidade_grao_g_cm3', rotulo: 'Densidade de grão', tipo: 'numero', unidade: 'g/cm³' },
      { nome: 'densidade_bulk_g_cm3', rotulo: 'Densidade bulk', tipo: 'numero', unidade: 'g/cm³' },
      { nome: 'densidade_aparente_g_cm3', rotulo: 'Densidade aparente', tipo: 'numero', unidade: 'g/cm³' },
      { nome: 'massa_g', rotulo: 'Massa', tipo: 'numero', unidade: 'g' },
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'texto' },
      campoResponsavel, campoObs,
    ],
    colunasResumo: ['data_ensaio', 'momento', 'pressao_confinamento_psi', 'porosidade_pct', 'permeabilidade_gas_md', 'permeabilidade_liquido_md'],
  },
  {
    numero: 2, chave: 'microct', titulo: 'Micro-CT', tabela: 'analise_microct',
    contador: 'n_microct', pastaArquivos: 'microct',
    campos: [
      campoData, campoMomento,
      { nome: 'resolucao_um_voxel', rotulo: 'Resolução', tipo: 'numero', unidade: 'µm/voxel' },
      { nome: 'porosidade_ct_pct', rotulo: 'Porosidade (CT)', tipo: 'numero', unidade: '%' },
      { nome: 'volume_dissolvido_mm3', rotulo: 'Volume dissolvido (wormhole)', tipo: 'numero', unidade: 'mm³' },
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'texto' },
      campoResponsavel, campoObs,
    ],
    colunasResumo: ['data_ensaio', 'momento', 'resolucao_um_voxel', 'porosidade_ct_pct', 'volume_dissolvido_mm3'],
  },
  {
    numero: 3, chave: 'coreflooding', titulo: 'Coreflooding', tabela: 'analise_coreflooding',
    contador: 'n_coreflooding', pastaArquivos: 'coreflooding',
    campos: [
      campoData,
      { nome: 'id_sistema', rotulo: 'Sistema ácido', tipo: 'sistema', obrigatorio: true },
      { nome: 'vazao_ml_min', rotulo: 'Vazão', tipo: 'numero', unidade: 'mL/min' },
      { nome: 'temperatura_c', rotulo: 'Temperatura', tipo: 'numero', unidade: '°C' },
      { nome: 'pressao_confinamento_psi', rotulo: 'Pressão de confinamento', tipo: 'numero', unidade: 'psi' },
      { nome: 'contrapressao_psi', rotulo: 'Contrapressão', tipo: 'numero', unidade: 'psi' },
      { nome: 'breakthrough', rotulo: 'Breakthrough atingido', tipo: 'booleano' },
      { nome: 'pvbt', rotulo: 'PVbt', tipo: 'numero', unidade: 'PV', ajuda: 'Volumes porosos injetados até o breakthrough' },
      { nome: 'dp_inicial_psi', rotulo: 'ΔP inicial', tipo: 'numero', unidade: 'psi' },
      { nome: 'dp_final_psi', rotulo: 'ΔP final', tipo: 'numero', unidade: 'psi' },
      { nome: 'morfologia_wormhole', rotulo: 'Morfologia do wormhole', tipo: 'lista',
        opcoes: ['dissolução de face', 'cônico', 'dominante', 'ramificado', 'uniforme'] },
      { nome: 'massa_apos_g', rotulo: 'Massa após acidificação', tipo: 'numero', unidade: 'g' },
      { nome: 'porosidade_apos_pct', rotulo: 'Porosidade após acidificação', tipo: 'numero', unidade: '%' },
      campoResponsavel, campoObs,
    ],
    calculados: [{ nome: 'razao_dp', rotulo: 'ΔP inicial / ΔP final', casas: 1 }],
    colunasResumo: ['data_ensaio', 'id_sistema', 'vazao_ml_min', 'temperatura_c', 'pvbt', 'breakthrough', 'razao_dp'],
    curvas: [{ nome: 'ΔP × PV injetado', x_grandeza: 'PV injetado', x_unidade: 'PV', y_grandeza: 'ΔP', y_unidade: 'psi' },
             { nome: 'ΔP × tempo', x_grandeza: 'Tempo', x_unidade: 'min', y_grandeza: 'ΔP', y_unidade: 'psi' }],
  },
  {
    numero: 4, chave: 'reatividade', titulo: 'Reatividade estática', tabela: 'analise_reatividade_estatica',
    contador: 'n_reatividade', pastaArquivos: 'reatividade',
    campos: [
      campoData,
      { nome: 'id_sistema', rotulo: 'Sistema ácido', tipo: 'sistema' },
      { nome: 'temperatura_c', rotulo: 'Temperatura', tipo: 'numero', unidade: '°C' },
      { nome: 'pressao_psi', rotulo: 'Pressão', tipo: 'numero', unidade: 'psi' },
      { nome: 'volume_acido_ml', rotulo: 'Volume de ácido', tipo: 'numero', unidade: 'mL' },
      { nome: 'tempo_min', rotulo: 'Tempo de contato', tipo: 'numero', unidade: 'min' },
      { nome: 'massa_inicial_g', rotulo: 'Massa inicial', tipo: 'numero', unidade: 'g', obrigatorio: true },
      { nome: 'massa_final_g', rotulo: 'Massa final', tipo: 'numero', unidade: 'g' },
      campoResponsavel, campoObs,
    ],
    calculados: [
      { nome: 'perda_massa_g', rotulo: 'Perda de massa', unidade: 'g', casas: 3 },
      { nome: 'perda_massa_pct', rotulo: 'Perda de massa', unidade: '%', casas: 2 },
    ],
    colunasResumo: ['data_ensaio', 'id_sistema', 'temperatura_c', 'tempo_min', 'perda_massa_pct'],
    curvas: [{ nome: 'Perda de massa × tempo', x_grandeza: 'Tempo', x_unidade: 'min', y_grandeza: 'Perda de massa', y_unidade: '%' }],
  },
  {
    numero: 5, chave: 'rda', titulo: 'RDA', tabela: 'analise_rda',
    contador: 'n_rda', pastaArquivos: 'rda',
    campos: [
      campoData,
      { nome: 'id_sistema', rotulo: 'Sistema ácido', tipo: 'sistema', obrigatorio: true },
      { nome: 'rotacao_rpm', rotulo: 'Rotação', tipo: 'numero', unidade: 'rpm' },
      { nome: 'pressao_psi', rotulo: 'Pressão', tipo: 'numero', unidade: 'psi' },
      { nome: 'temperatura_c', rotulo: 'Temperatura', tipo: 'numero', unidade: '°C' },
      { nome: 'dim_h_in', rotulo: 'Altura do disco', tipo: 'numero', unidade: 'in' },
      { nome: 'dim_d_in', rotulo: 'Diâmetro do disco', tipo: 'numero', unidade: 'in' },
      { nome: 'tempo_min', rotulo: 'Duração', tipo: 'numero', unidade: 'min' },
      { nome: 'taxa_reacao_mol_cm2_s', rotulo: 'Taxa de reação', tipo: 'numero', unidade: 'mol/(cm²·s)', passo: 'any',
        ajuda: 'Aceita notação científica, ex.: 5.2e-7' },
      { nome: 'coef_difusao_cm2_s', rotulo: 'Coeficiente de difusão', tipo: 'numero', unidade: 'cm²/s', passo: 'any' },
      { nome: 'metodo_quantificacao', rotulo: 'Método de quantificação', tipo: 'lista',
        opcoes: ['RDA', 'RDA / ICP', 'RDA / ICP-AES', 'RDA / AAS'] },
      campoResponsavel, campoObs,
    ],
    calculados: [
      { nome: 'omega_rad_s', rotulo: 'ω', unidade: 'rad/s', casas: 2 },
      { nome: 'raiz_omega', rotulo: '√ω', unidade: '(rad/s)^0,5', casas: 3 },
      { nome: 'temperatura_nominal_c', rotulo: 'Temperatura nominal', unidade: '°C', casas: 0 },
      { nome: 'taxa_reacao_mol_m2_s', rotulo: 'Taxa (SI)', unidade: 'mol/(m²·s)', cientifico: true },
    ],
    colunasResumo: ['data_ensaio', 'id_sistema', 'rotacao_rpm', 'temperatura_c', 'taxa_reacao_mol_cm2_s'],
  },
  {
    numero: 6, chave: 'drx', titulo: 'DRX', tabela: 'analise_drx',
    contador: 'n_drx', pastaArquivos: 'drx',
    campos: [
      campoData,
      { nome: 'metodo', rotulo: 'Método', tipo: 'lista', opcoes: ['Rietveld', 'XRF', 'semiquantitativo'] },
      campoResponsavel, campoObs,
    ],
    colunasResumo: ['data_ensaio', 'metodo'],
    filha: {
      tabela: 'drx_fases', titulo: 'Fases minerais', chave: ['mineral'],
      campos: [
        { nome: 'mineral', rotulo: 'Mineral', tipo: 'texto', obrigatorio: true },
        { nome: 'pct', rotulo: 'Teor', tipo: 'numero', unidade: '%' },
      ],
    },
    curvas: [{ nome: 'Difratograma', x_grandeza: '2θ', x_unidade: '°', y_grandeza: 'Intensidade', y_unidade: 'contagens' }],
  },
  {
    numero: 7, chave: 'petrografia', titulo: 'Petrografia', tabela: 'analise_petrografia',
    contador: 'n_petrografia', pastaArquivos: 'petrografia',
    campos: [
      campoData,
      { nome: 'lamina', rotulo: 'Lâmina', tipo: 'texto' },
      { nome: 'aumento', rotulo: 'Aumento', tipo: 'texto' },
      { nome: 'tipo_porosidade', rotulo: 'Tipo de porosidade', tipo: 'texto' },
      { nome: 'granulometria', rotulo: 'Granulometria', tipo: 'texto' },
      { nome: 'descricao_textural', rotulo: 'Descrição textural', tipo: 'textoLongo' },
      campoResponsavel, campoObs,
    ],
    colunasResumo: ['data_ensaio', 'lamina', 'tipo_porosidade', 'granulometria'],
    filha: {
      tabela: 'petrografia_componentes', titulo: 'Composição', chave: ['componente'],
      campos: [
        { nome: 'componente', rotulo: 'Componente', tipo: 'texto', obrigatorio: true },
        { nome: 'pct', rotulo: 'Teor', tipo: 'numero', unidade: '%' },
      ],
    },
  },
  {
    numero: 8, chave: 'mev', titulo: 'MEV', tabela: 'analise_mev',
    contador: 'n_mev', pastaArquivos: 'mev',
    campos: [
      campoData,
      { ...campoMomento },
      { nome: 'aumento', rotulo: 'Aumento', tipo: 'texto' },
      { nome: 'detector', rotulo: 'Detector', tipo: 'texto' },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textoLongo' },
      campoResponsavel, campoObs,
    ],
    colunasResumo: ['data_ensaio', 'momento', 'aumento', 'detector'],
    filha: {
      tabela: 'mev_eds', titulo: 'EDS', chave: ['ponto', 'elemento'],
      campos: [
        { nome: 'ponto', rotulo: 'Ponto', tipo: 'texto', obrigatorio: true },
        { nome: 'elemento', rotulo: 'Elemento', tipo: 'texto', obrigatorio: true },
        { nome: 'pct_massa', rotulo: '% massa', tipo: 'numero', unidade: '%' },
        { nome: 'pct_atomico', rotulo: '% atômico', tipo: 'numero', unidade: '%' },
      ],
    },
  },
]

export const analisePorChave = (chave: string) => ANALISES.find((a) => a.chave === chave)

/** Rótulo de uma coluna qualquer de uma análise (campo digitado ou calculado). */
export function rotuloColuna(cfg: ConfigAnalise, coluna: string): string {
  const c = cfg.campos.find((x) => x.nome === coluna)
  if (c) return c.unidade ? `${c.rotulo} (${c.unidade})` : c.rotulo
  const k = cfg.calculados?.find((x) => x.nome === coluna)
  if (k) return k.unidade ? `${k.rotulo} (${k.unidade})` : k.rotulo
  return coluna
}
