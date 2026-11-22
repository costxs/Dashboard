// Banco de Amostras organizado: agrupamento por tipo de amostra e prefixo do código, dimensões
// em pt-BR, fluido, experimentos e visão limitada da empresa interna LC PETRO.
// Cópia de ABA GERENCIAL/src/utils/bancoAmostras.ts: mantenha os dois iguais.

export type TipoAmostra = 'plug' | 'disco' | 'mini_plug' | 'outro'

export const TITULO_TIPO: Record<TipoAmostra, string> = {
  plug: 'Plugs · coreflooding',
  disco: 'Discos · RDA',
  mini_plug: 'Mini-plugs · reatividade estática',
  outro: 'Outras',
}
export const ROTULO_TIPO_AMOSTRA: Record<TipoAmostra, string> = { plug: 'Plug', disco: 'Disco', mini_plug: 'Mini-plug', outro: 'Outro' }
const ORDEM_TIPO: TipoAmostra[] = ['plug', 'disco', 'mini_plug', 'outro']
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
  return a.tipo_amostra === 'plug' || a.tipo_amostra === 'disco' || a.tipo_amostra === 'mini_plug'
    ? a.tipo_amostra
    : 'outro'
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

// -----------------------------------------------------------------------------
// Visão global da empresa interna LC PETRO (com proteção de dados sensíveis de projetos externos)
// -----------------------------------------------------------------------------

/** Verdadeiro quando o usuário está navegando pela empresa interna LC PETRO e a amostra pertence a outra empresa/projeto externo. */
export function ehVisaoLimitadaLcpetro(
  a: { empresa?: string | null; projeto?: string | null } | null | undefined,
  empresaSiglaContexto?: string | null,
): boolean {
  if (!a) return false
  const noLcpetro = (empresaSiglaContexto ?? '').trim().toUpperCase() === 'LCPETRO'
  if (!noLcpetro) return false
  const empAmostra = (a.empresa ?? '').trim().toUpperCase()
  return Boolean(empAmostra && empAmostra !== 'LCPETRO')
}

/** Litologia segura: oculta códigos de poço (ex.: 7-LPA-1D-SPS) quando em visão limitada. */
export function litologiaSegura(
  a: { litologia?: string | null; tipo_origem?: string | null },
  limitada: boolean,
): string {
  const lit = a.litologia ?? '—'
  if (!limitada) return lit
  if (a.tipo_origem === 'testemunho' || /\d+-[A-Z0-9]+-/i.test(lit)) {
    return 'Rocha de Testemunho (reservado)'
  }
  return lit
}

/** Lista simples dos experimentos que a amostra possui (Petrofísica, Coreflooding, RDA, Micro-CT...). */
export function experimentosDaAmostra(a: {
  finalidade?: string | null
  n_petrofisica?: number | string | null
  n_microct?: number | string | null
  n_coreflooding?: number | string | null
  n_reatividade?: number | string | null
  n_rda?: number | string | null
  n_drx?: number | string | null
  n_petrografia?: number | string | null
  n_mev?: number | string | null
}): string[] {
  const fin = (a.finalidade ?? '').toLowerCase()
  const lista: string[] = []
  if (Number(a.n_petrofisica ?? 0) > 0 || fin.includes('petrof')) lista.push('Petrofísica')
  if (Number(a.n_microct ?? 0) > 0 || fin.includes('micro')) lista.push('Micro-CT')
  if (Number(a.n_coreflooding ?? 0) > 0 || fin.includes('coreflood')) lista.push('Coreflooding')
  if (Number(a.n_reatividade ?? 0) > 0 || fin.includes('reatividade')) lista.push('Reatividade estática')
  if (Number(a.n_rda ?? 0) > 0 || fin.includes('rda')) lista.push('RDA')
  if (Number(a.n_drx ?? 0) > 0 || fin.includes('drx')) lista.push('DRX')
  if (Number(a.n_petrografia ?? 0) > 0 || fin.includes('petrograf')) lista.push('Petrografia')
  if (Number(a.n_mev ?? 0) > 0 || fin.includes('mev')) lista.push('MEV')
  return lista
}

/** Onde a amostra está fisicamente no laboratório + empresa/projeto onde está alocada. */
export function ondeAmostraEsta(a: {
  status?: string | null
  empresa?: string | null
  projeto?: string | null
}): { localFisico: string; alocacao: string; resumo: string } {
  const st = (a.status ?? 'disponivel').toLowerCase()
  const localFisico =
    st === 'disponivel'
      ? 'Acervo / Estoque LC PETRO (disponível)'
      : st === 'reservada'
        ? 'Estoque LC PETRO (reservada para ensaio)'
        : st === 'em ensaio'
          ? 'Bancada Experimental LC PETRO (em ensaio)'
          : st === 'utilizada'
            ? 'Acervo Pós-Ensaio LC PETRO (utilizada)'
            : st === 'nao localizada'
              ? 'Não localizada no estoque físico'
              : 'Depósito / Arquivo LC PETRO'
  const alocacao = [a.empresa, a.projeto].filter(Boolean).join(' · ') || 'LC PETRO'
  return {
    localFisico,
    alocacao,
    resumo: `${localFisico} · ${alocacao}`,
  }
}
