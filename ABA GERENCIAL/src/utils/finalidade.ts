// A finalidade da amostra guarda o(s) ensaio(s) em que ela foi usada, no mesmo vocabulário do
// controle de rochas ('coreflooding', 'RDA', 'Petrofísica'...). Com mais de um ensaio, ficam
// separados por vírgula: "Petrofísica, coreflooding, Micro-CT".
import { LISTA_ANALISES } from '../config/analises'

// nomes que o controle de rochas (e o importador) já usam para estas análises
const FINALIDADE_ESPECIAL: Record<string, string> = { coreflooding: 'coreflooding', rda: 'RDA' }

/** "Petrofísica, coreflooding" -> ['Petrofísica', 'coreflooding'] (aceita vírgula, ponto e vírgula ou +). */
export function partesDaFinalidade(finalidade: string | null | undefined): string[] {
  return (finalidade ?? '').split(/\s*[,;+]\s*/).map((s) => s.trim()).filter(Boolean)
}

/** Chaves das análises (LISTA_ANALISES) citadas na finalidade, na ordem das abas. */
export function ensaiosDaFinalidade(finalidade: string | null | undefined): string[] {
  const partes = partesDaFinalidade(finalidade).map((p) => p.toLowerCase())
  return LISTA_ANALISES
    .filter((c) => partes.some((p) => p === c.chave || p === c.titulo.toLowerCase() || p === FINALIDADE_ESPECIAL[c.chave]?.toLowerCase()))
    .map((c) => c.chave)
}

/** ['rda', 'petrofisica'] -> "Petrofísica, RDA" (na ordem das abas). */
export function finalidadeDosEnsaios(chaves: string[]): string {
  return LISTA_ANALISES
    .filter((c) => chaves.includes(c.chave))
    .map((c) => FINALIDADE_ESPECIAL[c.chave] ?? c.titulo)
    .join(', ')
}
