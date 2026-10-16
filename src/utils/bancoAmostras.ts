// Banco de Amostras organizado: agrupamento por tipo de amostra e prefixo do código, dimensões
// em pt-BR e fluido. As colunas tipo_amostra, prefixo, significado_prefixo e fluidos vêm da view
// v_amostras (migração 011). Cópia de ABA GERENCIAL/src/utils/bancoAmostras.ts: mantenha os dois iguais.

export type TipoAmostra = 'plug' | 'disco' | 'outro'

export const TITULO_TIPO: Record<TipoAmostra, string> = {
  plug: 'Plugs · coreflooding',
  disco: 'Discos · RDA',
  outro: 'Outras',
}
export const ROTULO_TIPO_AMOSTRA: Record<TipoAmostra, string> = { plug: 'Plug', disco: 'Disco', outro: 'Outro' }
const ORDEM_TIPO: TipoAmostra[] = ['plug', 'disco', 'outro']
const PREVISTO = /\s*\(previsto\)\s*$/i

/** O que estas funções leem de uma linha de v_amostras. */
export interface LinhaBanco {
  codigo: string
  tipo_amostra?: string | null
  prefixo?: string | null
  significado_prefixo?: string | null
  fluidos?: string | null
  diametro_cm?: number | string | null
  comprimento_cm?: number | string | null
}

export interface GrupoPrefixo<T> {
  prefixo: string                 // '' = código sem letras no começo
  significado: string | null      // null = prefixo ainda não cadastrado no catálogo
  amostras: T[]
}
export interface GrupoTipo<T> {
  tipo: TipoAmostra
  titulo: string
  total: number
  prefixos: GrupoPrefixo<T>[]
}

export function tipoDe(a: LinhaBanco): TipoAmostra {
  return a.tipo_amostra === 'plug' || a.tipo_amostra === 'disco' ? a.tipo_amostra : 'outro'
}

/** Prefixo em maiúsculas (é como o catálogo prefixos_codigo guarda). */
export function prefixoDe(a: LinhaBanco): string {
  return (a.prefixo ?? '').trim().toUpperCase()
}

/** Plugs, discos e outras (nesta ordem); dentro de cada tipo, um grupo por prefixo em ordem alfabética. */
export function agruparAmostras<T extends LinhaBanco>(lista: T[]): GrupoTipo<T>[] {
  return ORDEM_TIPO.flatMap((tipo) => {
    const doTipo = lista.filter((a) => tipoDe(a) === tipo)
    if (doTipo.length === 0) return []
    const porPrefixo = new Map<string, GrupoPrefixo<T>>()
    for (const a of doTipo) {
      const prefixo = prefixoDe(a)
      const g = porPrefixo.get(prefixo) ?? { prefixo, significado: null, amostras: [] }
      g.significado ??= a.significado_prefixo?.trim() || null
      g.amostras.push(a)
      porPrefixo.set(prefixo, g)
    }
    const prefixos = [...porPrefixo.values()].sort((x, y) => (x.prefixo || '~').localeCompare(y.prefixo || '~', 'pt-BR'))
    return [{ tipo, titulo: TITULO_TIPO[tipo], total: doTipo.length, prefixos }]
  })
}

/** "IL — Indiana Limestone" · "CF — significado não cadastrado" · "Sem prefixo" */
export function tituloPrefixo(g: Pick<GrupoPrefixo<unknown>, 'prefixo' | 'significado'>): string {
  if (!g.prefixo) return 'Sem prefixo'
  return `${g.prefixo} — ${g.significado ?? 'significado não cadastrado'}`
}

const n = (v: number | string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** "3,79 × 7,61 cm"; para disco, "Ø 3,81 × 1,2 cm". Sem as duas medidas: "—". */
export function dimensoes(a: LinhaBanco): string {
  const d = a.diametro_cm, c = a.comprimento_cm
  if (d == null || c == null || d === '' || c === '' || !Number.isFinite(Number(d)) || !Number.isFinite(Number(c))) return '—'
  return `${tipoDe(a) === 'disco' ? 'Ø ' : ''}${n(d)} × ${n(c)} cm`
}

/** Fluido da amostra: o dos ensaios lançados ou, sem ensaio, o previsto no controle de rochas. */
export function fluidoDe(a: LinhaBanco): { texto: string; previsto: boolean } | null {
  const bruto = a.fluidos?.trim()
  if (!bruto) return null
  return { texto: bruto.replace(PREVISTO, ''), previsto: PREVISTO.test(bruto) }
}

/** Fluidos separados (a view junta os dos ensaios com " · "), para o filtro. */
export function nomesDeFluido(a: LinhaBanco): string[] {
  return (fluidoDe(a)?.texto ?? '').split(' · ').map((s) => s.trim()).filter(Boolean)
}

export interface FiltrosBanco { tipo: string; prefixo: string; litologia: string; status: string; fluido: string }
export const FILTROS_VAZIOS: FiltrosBanco = { tipo: '', prefixo: '', litologia: '', status: '', fluido: '' }

/** Filtros do topo ('' = todos). */
export function filtrarAmostras<T extends LinhaBanco & { litologia?: string | null; status?: string | null }>(lista: T[], f: FiltrosBanco): T[] {
  return lista.filter((a) =>
    (!f.tipo || tipoDe(a) === f.tipo) &&
    (!f.prefixo || prefixoDe(a) === f.prefixo) &&
    (!f.litologia || a.litologia === f.litologia) &&
    (!f.status || a.status === f.status) &&
    (!f.fluido || nomesDeFluido(a).includes(f.fluido)))
}

/** Valores distintos da lista para as opções dos filtros. */
export function opcoesDeFiltro<T extends LinhaBanco & { litologia?: string | null }>(lista: T[]) {
  const unicos = (vs: (string | null | undefined)[]) => [...new Set(vs.filter((v): v is string => Boolean(v)))].sort((x, y) => x.localeCompare(y, 'pt-BR'))
  return {
    prefixos: unicos(lista.map(prefixoDe)),
    litologias: unicos(lista.map((a) => a.litologia)),
    fluidos: unicos(lista.flatMap(nomesDeFluido)),
  }
}
