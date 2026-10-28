// A finalidade da amostra guarda o(s) ensaio(s) em que ela foi usada (o gerencial grava; aqui só se lê), no mesmo
// vocabulário do controle de rochas: 'coreflooding', 'RDA', 'Petrofísica'... Com mais de um, separados por vírgula.
// Cópia da regra de "ABA GERENCIAL/src/utils/finalidade.ts"; se mudar lá, mude aqui.
import { ANALISES } from "../config/analises";

const FINALIDADE_ESPECIAL: Record<string, string> = { coreflooding: "coreflooding", rda: "RDA" };

/** Chaves das análises citadas na finalidade ("Petrofísica, coreflooding" -> ["petrofisica", "coreflooding"]). */
export function ensaiosDaFinalidade(finalidade: string | null | undefined): string[] {
  const partes = (finalidade ?? "").split(/\s*[,;+]\s*/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ANALISES
    .filter((c) => partes.some((p) => p === c.chave || p === c.titulo.toLowerCase() || p === FINALIDADE_ESPECIAL[c.chave]?.toLowerCase()))
    .map((c) => c.chave);
}
