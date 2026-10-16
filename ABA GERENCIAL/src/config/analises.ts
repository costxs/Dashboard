// Configuração das 8 análises. Os campos são os de
// docs/referencia/painel-cadastro/src/config/analises.ts, que batem com o banco.
// O "nome" de cada campo é conferido pelo TypeScript contra tipos/banco.ts:
// coluna que não existe na tabela (ou que é calculada) não compila.

import type { Calculadas, Gravavel, TabelaAnalise } from '../tipos/banco'

export type TipoCampo = 'numero' | 'texto' | 'textoLongo' | 'data' | 'lista' | 'booleano' | 'sistema'

export interface CampoDef<N extends string = string> {
  nome: N               // nome da coluna no banco
  rotulo: string
  tipo: TipoCampo
  unidade?: string
  opcoes?: string[]     // para tipo 'lista'
  obrigatorio?: boolean
  ajuda?: string
  secao?: string        // agrupa o formulário e os detalhes do ensaio (ver "secoes" da análise)
  padrao?: string       // valor que um ensaio novo já traz preenchido
}

export interface CampoCalculado<N extends string = string> {
  nome: N
  rotulo: string
  unidade?: string
  casas?: number
  cientifico?: boolean
}

/** Tabela-filha de uma análise (uma linha por mineral, componente ou elemento). */
export type TabelaFilha = 'drx_fases' | 'petrografia_componentes' | 'mev_eds'

export interface FilhaDef {
  tabela: TabelaFilha
  titulo: string
  chave: string[]         // colunas da chave além de analise_id
  campos: CampoDef[]
}

/** Curva típica da análise: atalho para preencher nome e eixos ao importar. */
export interface CurvaPadrao {
  nome: string
  x_grandeza: string
  x_unidade: string
  y_grandeza: string
  y_unidade: string
}

type ColunaGravavel<T extends TabelaAnalise> = Exclude<Extract<keyof Gravavel[T], string>, 'amostra_id'>
type ColunaCalculada<T extends TabelaAnalise> = Extract<keyof Calculadas[T], string>

interface ConfigDe<T extends TabelaAnalise> {
  numero: number
  chave: string
  titulo: string
  tabela: T
  pastaArquivos: string   // subpasta no Storage: amostras/<id>/<pasta>/...
  campos: CampoDef<ColunaGravavel<T>>[]
  /** seções do formulário, na ordem; cada campo aponta a sua em "secao" */
  secoes?: string[]
  /** campos do resumo na lista de ensaios (sem isto: os quatro primeiros) */
  principais?: ColunaGravavel<T>[]
  calculados?: CampoCalculado<ColunaCalculada<T>>[]
  filha?: FilhaDef
  curvas?: CurvaPadrao[]
}

export type AnaliseConfig = { [T in TabelaAnalise]: ConfigDe<T> }[TabelaAnalise]

const campoData: CampoDef<'data_ensaio'> = { nome: 'data_ensaio', rotulo: 'Data do ensaio', tipo: 'data' }
const campoResponsavel: CampoDef<'responsavel'> = { nome: 'responsavel', rotulo: 'Responsável', tipo: 'texto' }
const campoObs: CampoDef<'observacoes'> = { nome: 'observacoes', rotulo: 'Observações', tipo: 'textoLongo' }
const campoMomento: CampoDef<'momento'> = {
  nome: 'momento', rotulo: 'Momento', tipo: 'lista', opcoes: ['antes', 'depois'],
  ajuda: 'Antes ou depois da acidificação',
}
// petrofísica e micro-CT: momento é not null no banco
const campoMomentoObrigatorio: CampoDef<'momento'> = { ...campoMomento, obrigatorio: true }

export const LISTA_ANALISES: AnaliseConfig[] = [
  {
    numero: 1, chave: 'petrofisica', titulo: 'Petrofísica', tabela: 'analise_petrofisica', pastaArquivos: 'petrofisica',
    campos: [
      campoData, campoMomentoObrigatorio,
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
  },
  {
    numero: 2, chave: 'microct', titulo: 'Micro-CT', tabela: 'analise_microct', pastaArquivos: 'microct',
    campos: [
      campoData, campoMomentoObrigatorio,
      { nome: 'resolucao_um_voxel', rotulo: 'Resolução', tipo: 'numero', unidade: 'µm/voxel' },
      { nome: 'porosidade_ct_pct', rotulo: 'Porosidade (CT)', tipo: 'numero', unidade: '%' },
      { nome: 'volume_dissolvido_mm3', rotulo: 'Volume dissolvido (wormhole)', tipo: 'numero', unidade: 'mm³' },
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'texto' },
      campoResponsavel, campoObs,
    ],
  },
  {
    numero: 3, chave: 'coreflooding', titulo: 'Coreflooding', tabela: 'analise_coreflooding', pastaArquivos: 'coreflooding',
    // as colunas da planilha de PVbt (migração 010) entram aqui; a view v_pvbt calcula o resto
    secoes: ['Condições', 'Resultado', 'Wormhole', 'Saturação', 'Origem do dado'],
    principais: ['id_experimento', 'id_sistema', 'vazao_ml_min', 'temperatura_c', 'pvbt', 'pvbt_condicao'],
    campos: [
      { ...campoData, secao: 'Condições' },
      { nome: 'id_experimento', rotulo: 'ID do experimento', tipo: 'texto', secao: 'Condições',
        ajuda: 'Como na planilha de PVbt, ex.: LCP-0063. Não pode repetir.' },
      { nome: 'id_sistema', rotulo: 'Sistema ácido', tipo: 'sistema', obrigatorio: true, secao: 'Condições' },
      { nome: 'acido', rotulo: 'Ácido', tipo: 'texto', secao: 'Condições', ajuda: 'Em branco: vale o do sistema ácido' },
      { nome: 'conc_valor', rotulo: 'Concentração', tipo: 'numero', secao: 'Condições' },
      { nome: 'conc_unidade', rotulo: 'Unidade da concentração', tipo: 'lista', opcoes: ['wt%', 'M', 'N'], secao: 'Condições' },
      { nome: 'aditivo', rotulo: 'Aditivo', tipo: 'texto', secao: 'Condições' },
      { nome: 'aditivo_valor', rotulo: 'Concentração do aditivo', tipo: 'numero', secao: 'Condições' },
      { nome: 'aditivo_unidade', rotulo: 'Unidade do aditivo', tipo: 'texto', secao: 'Condições' },
      { nome: 'tratamento', rotulo: 'Tratamento', tipo: 'texto', secao: 'Condições' },
      { nome: 'vazao_ml_min', rotulo: 'Vazão', tipo: 'numero', unidade: 'mL/min', secao: 'Condições' },
      { nome: 'temperatura_c', rotulo: 'Temperatura', tipo: 'numero', unidade: '°C', secao: 'Condições' },
      { nome: 'temperatura_obs', rotulo: 'Temperatura (texto)', tipo: 'texto', secao: 'Condições', ajuda: 'Sem valor medido, ex.: Ambiente' },
      { nome: 'pressao_confinamento_psi', rotulo: 'Pressão de confinamento', tipo: 'numero', unidade: 'psi', secao: 'Condições' },
      { nome: 'contrapressao_psi', rotulo: 'Contrapressão', tipo: 'numero', unidade: 'psi', secao: 'Condições' },
      { nome: 'volume_morto_cm3', rotulo: 'Volume morto', tipo: 'numero', unidade: 'cm³', secao: 'Condições',
        ajuda: 'Dead Volume (ml) das linhas e conexões, da planilha do ensaio (migração 017)' },
      { nome: 'tipo_experimento', rotulo: 'Tipo de experimento', tipo: 'texto', secao: 'Condições' },
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'texto', secao: 'Condições' },

      { nome: 'breakthrough', rotulo: 'Breakthrough atingido', tipo: 'booleano', secao: 'Resultado' },
      { nome: 'pvbt', rotulo: 'PVbt', tipo: 'numero', unidade: 'PV', secao: 'Resultado', ajuda: 'Volumes porosos injetados até o breakthrough' },
      { nome: 'pvbt_condicao', rotulo: 'Condição do PVbt', tipo: 'lista', secao: 'Resultado',
        opcoes: ['completo', 'parcial', 'nao_atingido', 'nao_calculado'] },
      { nome: 'pvbt_classe', rotulo: 'Classe do PVbt', tipo: 'lista', opcoes: ['normal', 'otimo'], secao: 'Resultado' },
      { nome: 'dp_inicial_psi', rotulo: 'ΔP inicial', tipo: 'numero', unidade: 'psi', secao: 'Resultado' },
      { nome: 'dp_final_psi', rotulo: 'ΔP final', tipo: 'numero', unidade: 'psi', secao: 'Resultado' },
      { nome: 'k_fluxo_md', rotulo: 'Permeabilidade em fluxo', tipo: 'numero', unidade: 'mD', secao: 'Resultado' },
      { nome: 'massa_apos_g', rotulo: 'Massa após acidificação', tipo: 'numero', unidade: 'g', secao: 'Resultado' },
      { nome: 'porosidade_apos_pct', rotulo: 'Porosidade após acidificação', tipo: 'numero', unidade: '%', secao: 'Resultado' },
      { nome: 'status_ensaio', rotulo: 'Status do ensaio', tipo: 'texto', secao: 'Resultado' },

      { nome: 'morfologia_wormhole', rotulo: 'Morfologia do wormhole', tipo: 'lista', secao: 'Wormhole',
        opcoes: ['dissolução de face', 'cônico', 'dominante', 'ramificado', 'uniforme'] },
      { nome: 'comprimento_wormhole_cm', rotulo: 'Comprimento por Darcy', tipo: 'numero', unidade: 'cm', secao: 'Wormhole' },
      { nome: 'comprimento_wormhole_uct_cm', rotulo: 'Comprimento por microCT', tipo: 'numero', unidade: 'cm', secao: 'Wormhole' },
      { nome: 'lwh_referencia', rotulo: 'Comprimento de referência', tipo: 'lista', opcoes: ['microCT', 'darcy'], secao: 'Wormhole' },

      { nome: 'fluido_saturacao', rotulo: 'Fluido de saturação', tipo: 'texto', secao: 'Saturação' },
      { nome: 'tipo_fluido_saturacao', rotulo: 'Tipo do fluido', tipo: 'texto', secao: 'Saturação' },
      { nome: 'metodo_saturacao', rotulo: 'Método de saturação', tipo: 'texto', secao: 'Saturação' },
      { nome: 'forma_saturacao', rotulo: 'Forma de saturação', tipo: 'texto', secao: 'Saturação' },

      { nome: 'obtencao_dado', rotulo: 'Obtenção do dado', tipo: 'lista', secao: 'Origem do dado', padrao: 'bancada',
        opcoes: ['bancada', 'tabela', 'grafico', 'texto'] },
      { nome: 'estudo', rotulo: 'Estudo', tipo: 'texto', secao: 'Origem do dado' },
      { nome: 'projeto_origem', rotulo: 'Projeto de origem', tipo: 'texto', secao: 'Origem do dado' },
      { nome: 'rotulo_original', rotulo: 'Rótulo original', tipo: 'texto', secao: 'Origem do dado' },
      { nome: 'vel_intersticial_fonte', rotulo: 'Vel. intersticial informada', tipo: 'numero', unidade: 'cm/min', secao: 'Origem do dado',
        ajuda: 'A da planilha; a calculada fica na view v_pvbt' },
      { ...campoResponsavel, secao: 'Origem do dado' },
      campoObs,
    ],
    calculados: [{ nome: 'razao_dp', rotulo: 'ΔP inicial / ΔP final', casas: 1 }],
    curvas: [
      { nome: 'ΔP × PV injetado', x_grandeza: 'PV injetado', x_unidade: 'PV', y_grandeza: 'ΔP', y_unidade: 'psi' },
      { nome: 'ΔP × tempo', x_grandeza: 'Tempo', x_unidade: 'min', y_grandeza: 'ΔP', y_unidade: 'psi' },
    ],
  },
  {
    numero: 4, chave: 'reatividade', titulo: 'Reatividade estática', tabela: 'analise_reatividade_estatica', pastaArquivos: 'reatividade',
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
    curvas: [{ nome: 'Perda de massa × tempo', x_grandeza: 'Tempo', x_unidade: 'min', y_grandeza: 'Perda de massa', y_unidade: '%' }],
  },
  {
    numero: 5, chave: 'rda', titulo: 'RDA', tabela: 'analise_rda', pastaArquivos: 'rda',
    campos: [
      campoData,
      { nome: 'id_sistema', rotulo: 'Sistema ácido', tipo: 'sistema', obrigatorio: true },
      { nome: 'rotacao_rpm', rotulo: 'Rotação', tipo: 'numero', unidade: 'rpm' },
      { nome: 'pressao_psi', rotulo: 'Pressão', tipo: 'numero', unidade: 'psi' },
      { nome: 'temperatura_c', rotulo: 'Temperatura', tipo: 'numero', unidade: '°C' },
      { nome: 'dim_h_in', rotulo: 'Altura do disco', tipo: 'numero', unidade: 'in' },
      { nome: 'dim_d_in', rotulo: 'Diâmetro do disco', tipo: 'numero', unidade: 'in' },
      { nome: 'tempo_min', rotulo: 'Duração', tipo: 'numero', unidade: 'min' },
      { nome: 'taxa_reacao_mol_cm2_s', rotulo: 'Taxa de reação', tipo: 'numero', unidade: 'mol/(cm²·s)',
        ajuda: 'Aceita notação científica, ex.: 5,2e-7' },
      { nome: 'coef_difusao_cm2_s', rotulo: 'Coeficiente de difusão', tipo: 'numero', unidade: 'cm²/s' },
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
  },
  {
    numero: 6, chave: 'drx', titulo: 'DRX', tabela: 'analise_drx', pastaArquivos: 'drx',
    campos: [
      campoData,
      { nome: 'metodo', rotulo: 'Método', tipo: 'lista', opcoes: ['Rietveld', 'XRF', 'semiquantitativo'] },
      campoResponsavel, campoObs,
    ],
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
    numero: 7, chave: 'petrografia', titulo: 'Petrografia', tabela: 'analise_petrografia', pastaArquivos: 'petrografia',
    campos: [
      campoData,
      { nome: 'lamina', rotulo: 'Lâmina', tipo: 'texto' },
      { nome: 'aumento', rotulo: 'Aumento', tipo: 'texto' },
      { nome: 'tipo_porosidade', rotulo: 'Tipo de porosidade', tipo: 'texto' },
      { nome: 'granulometria', rotulo: 'Granulometria', tipo: 'texto' },
      { nome: 'descricao_textural', rotulo: 'Descrição textural', tipo: 'textoLongo' },
      campoResponsavel, campoObs,
    ],
    filha: {
      tabela: 'petrografia_componentes', titulo: 'Composição', chave: ['componente'],
      campos: [
        { nome: 'componente', rotulo: 'Componente', tipo: 'texto', obrigatorio: true },
        { nome: 'pct', rotulo: 'Teor', tipo: 'numero', unidade: '%' },
      ],
    },
  },
  {
    numero: 8, chave: 'mev', titulo: 'MEV', tabela: 'analise_mev', pastaArquivos: 'mev',
    campos: [
      campoData, campoMomento,
      { nome: 'aumento', rotulo: 'Aumento', tipo: 'texto' },
      { nome: 'detector', rotulo: 'Detector', tipo: 'texto' },
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'textoLongo' },
      campoResponsavel, campoObs,
    ],
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
