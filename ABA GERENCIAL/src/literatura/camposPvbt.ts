// Campos do cadastro de PVbt da literatura, no padrão da planilha "Banco de dados de PVbt — LCPETRO/UFPA"
// (abas amostras e experimento). As colunas CALCULADAS da planilha (cabeçalho verde: litologia, dimensões nominais,
// volume poroso, velocidades, PVbt por Darcy/microCT...) não são digitadas: o banco recalcula na view v_pvbt.

export type TipoCampo = 'texto' | 'num' | 'int' | 'data' | 'lista' | 'simnao' | 'fonte-dinamica'
/** de onde vêm as opções de um campo "fonte-dinamica" */
export type FonteOpcoes = 'litologia' | 'referencia' | 'amostra' | 'sistema' | 'empresa'

export interface CampoPvbt {
  k: string
  rotulo: string
  tipo: TipoCampo
  opcoes?: string[]
  fonte?: FonteOpcoes
  obrig?: boolean
  unidade?: string
  largura?: 1 | 2
  grupo?: string
}

export const FONTES_LIT = ['Literatura', 'Petrobras'] as const

const L = ['Literatura', 'Petrobras']

export const CAMPOS_AMOSTRA: CampoPvbt[] = [
  { k: 'id_amostra', rotulo: 'id_amostra', tipo: 'texto', obrig: true, grupo: 'Identificação' },
  { k: 'fonte', rotulo: 'fonte', tipo: 'lista', opcoes: L, obrig: true, grupo: 'Identificação' },
  { k: 'litologia', rotulo: 'litologia', tipo: 'fonte-dinamica', fonte: 'litologia', obrig: true, grupo: 'Identificação' },
  { k: 'empresa_id', rotulo: 'empresa (só Petrobras)', tipo: 'fonte-dinamica', fonte: 'empresa', grupo: 'Identificação' },
  { k: 'diametro_cm', rotulo: 'diametro_cm', tipo: 'num', unidade: 'cm', grupo: 'Dimensões e petrofísica' },
  { k: 'comprimento_cm', rotulo: 'comprimento_cm', tipo: 'num', unidade: 'cm', grupo: 'Dimensões e petrofísica' },
  { k: 'porosidade_pct', rotulo: 'porosidade_pct', tipo: 'num', unidade: '%', grupo: 'Dimensões e petrofísica' },
  { k: 'volume_poroso_medido_cm3', rotulo: 'volume_poroso_medido_cm3', tipo: 'num', unidade: 'cm³', grupo: 'Dimensões e petrofísica' },
  { k: 'k_inicial_md', rotulo: 'k_inicial_md', tipo: 'num', unidade: 'mD', grupo: 'Dimensões e petrofísica' },
  { k: 'k_metodo', rotulo: 'k_metodo', tipo: 'texto', grupo: 'Dimensões e petrofísica' },
  { k: 'ca_pct', rotulo: 'ca_pct', tipo: 'num', unidade: '%', grupo: 'Composição' },
  { k: 'mg_pct', rotulo: 'mg_pct', tipo: 'num', unidade: '%', grupo: 'Composição' },
]

export const CAMPOS_ENSAIO: CampoPvbt[] = [
  { k: 'id_experimento', rotulo: 'id_experimento', tipo: 'texto', obrig: true, grupo: 'Identificação' },
  { k: 'fonte', rotulo: 'fonte', tipo: 'lista', opcoes: L, obrig: true, grupo: 'Identificação' },
  { k: 'id_referencia', rotulo: 'id_referencia', tipo: 'fonte-dinamica', fonte: 'referencia', grupo: 'Identificação' },
  { k: 'id_amostra', rotulo: 'id_amostra', tipo: 'fonte-dinamica', fonte: 'amostra', obrig: true, grupo: 'Identificação' },
  { k: 'empresa_id', rotulo: 'empresa (só Petrobras)', tipo: 'fonte-dinamica', fonte: 'empresa', grupo: 'Identificação' },
  { k: 'rotulo_original', rotulo: 'rotulo_original', tipo: 'texto', grupo: 'Identificação' },

  { k: 'id_sistema', rotulo: 'id_sistema', tipo: 'fonte-dinamica', fonte: 'sistema', grupo: 'Sistema ácido' },
  { k: 'acido', rotulo: 'acido', tipo: 'texto', grupo: 'Sistema ácido' },
  { k: 'conc_valor', rotulo: 'conc_valor', tipo: 'num', grupo: 'Sistema ácido' },
  { k: 'conc_unidade', rotulo: 'conc_unidade', tipo: 'lista', opcoes: ['wt%', 'M', 'N'], grupo: 'Sistema ácido' },
  { k: 'aditivo', rotulo: 'aditivo', tipo: 'texto', grupo: 'Sistema ácido' },
  { k: 'aditivo_valor', rotulo: 'aditivo_valor', tipo: 'num', grupo: 'Sistema ácido' },
  { k: 'aditivo_unidade', rotulo: 'aditivo_unidade', tipo: 'texto', grupo: 'Sistema ácido' },
  { k: 'tratamento', rotulo: 'tratamento', tipo: 'texto', grupo: 'Sistema ácido' },

  { k: 'temperatura_c', rotulo: 'temperatura_c', tipo: 'num', unidade: '°C', grupo: 'Condições do ensaio' },
  { k: 'temperatura_obs', rotulo: 'temperatura_obs', tipo: 'texto', grupo: 'Condições do ensaio' },
  { k: 'vazao_ml_min', rotulo: 'vazao_ml_min', tipo: 'num', unidade: 'mL/min', grupo: 'Condições do ensaio' },
  { k: 'p_confinamento_psi', rotulo: 'p_confinamento_psi', tipo: 'num', unidade: 'psi', grupo: 'Condições do ensaio' },
  { k: 'p_backpressure_psi', rotulo: 'p_backpressure_psi', tipo: 'num', unidade: 'psi', grupo: 'Condições do ensaio' },
  { k: 'vel_intersticial_fonte', rotulo: 'vel_intersticial_fonte', tipo: 'num', unidade: 'cm/min', grupo: 'Condições do ensaio' },
  { k: 'k_fluxo_md', rotulo: 'k_fluxo_md', tipo: 'num', unidade: 'mD', grupo: 'Condições do ensaio' },

  { k: 'pvbt', rotulo: 'pvbt', tipo: 'num', grupo: 'Resultado' },
  { k: 'pvbt_condicao', rotulo: 'pvbt_condicao', tipo: 'lista', opcoes: ['completo', 'parcial', 'nao_atingido', 'nao_calculado'], grupo: 'Resultado' },
  { k: 'pvbt_classe', rotulo: 'pvbt_classe', tipo: 'lista', opcoes: ['normal', 'otimo'], grupo: 'Resultado' },
  { k: 'breakthrough', rotulo: 'breakthrough', tipo: 'simnao', grupo: 'Resultado' },
  { k: 'comprimento_wormhole_cm', rotulo: 'comprimento_wormhole_cm', tipo: 'num', unidade: 'cm', grupo: 'Resultado' },
  { k: 'comprimento_wormhole_uct_cm', rotulo: 'comprimento_wormhole_uct_cm', tipo: 'num', unidade: 'cm', grupo: 'Resultado' },
  { k: 'lwh_referencia', rotulo: 'lwh_referencia', tipo: 'lista', opcoes: ['microCT', 'darcy'], grupo: 'Resultado' },

  { k: 'fluido_saturacao', rotulo: 'fluido_saturacao', tipo: 'texto', grupo: 'Saturação' },
  { k: 'tipo_fluido_saturacao', rotulo: 'tipo_fluido_saturacao', tipo: 'texto', grupo: 'Saturação' },
  { k: 'metodo_saturacao', rotulo: 'metodo_saturacao', tipo: 'texto', grupo: 'Saturação' },
  { k: 'forma_saturacao', rotulo: 'forma_saturacao', tipo: 'texto', grupo: 'Saturação' },

  { k: 'obtencao_dado', rotulo: 'obtencao_dado', tipo: 'lista', opcoes: ['bancada', 'tabela', 'grafico', 'texto'], grupo: 'Origem do dado' },
  { k: 'tipo_experimento', rotulo: 'tipo_experimento', tipo: 'texto', grupo: 'Origem do dado' },
  { k: 'status_ensaio', rotulo: 'status', tipo: 'texto', grupo: 'Origem do dado' },
  { k: 'data_ensaio', rotulo: 'data_ensaio', tipo: 'data', grupo: 'Origem do dado' },
  { k: 'ano', rotulo: 'ano', tipo: 'int', grupo: 'Origem do dado' },
  { k: 'projeto_origem', rotulo: 'projeto', tipo: 'texto', grupo: 'Origem do dado' },
  { k: 'estudo', rotulo: 'estudo', tipo: 'texto', grupo: 'Origem do dado' },
  { k: 'equipamento', rotulo: 'equipamento', tipo: 'texto', grupo: 'Origem do dado' },
  { k: 'observacoes', rotulo: 'observacoes', tipo: 'texto', largura: 2, grupo: 'Origem do dado' },
]

/** Valor da linha do banco -> texto do campo do formulário (vírgula decimal, sim/nao). */
export function paraTexto(c: CampoPvbt, v: unknown): string {
  if (v == null) return ''
  if (c.tipo === 'simnao') return v === true ? 'sim' : v === false ? 'nao' : ''
  if (c.tipo === 'num' || c.tipo === 'int') return String(v).replace('.', ',')
  return String(v)
}

/** Texto do formulário -> valor para gravar; lança erro em português para número inválido ou obrigatório vazio. */
export function doTexto(c: CampoPvbt, t: string | undefined): string | number | boolean | null {
  const s = (t ?? '').trim()
  if (!s) {
    if (c.obrig) throw new Error(`Preencha "${c.rotulo}".`)
    return null
  }
  if (c.tipo === 'simnao') return s === 'sim'
  if (c.tipo === 'num' || c.tipo === 'int') {
    const n = Number(s.replace(',', '.'))
    if (!Number.isFinite(n)) throw new Error(`"${c.rotulo}": "${s}" não é número. Use vírgula ou ponto decimal.`)
    if (c.tipo === 'int' && !Number.isInteger(n)) throw new Error(`"${c.rotulo}": use um número inteiro.`)
    return n
  }
  return s
}
