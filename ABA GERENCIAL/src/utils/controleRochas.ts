// O que o CONTROLE DE ROCHAS (planilha importada) diz sobre uma amostra que ainda não tem o
// ensaio lançado: condições do RDA no texto de Utilização e amostra já acidificada no coreflooding.
// Só leitura e sugestão: nada aqui grava no banco.
// O dashboard tem uma cópia em src/utils/controleRochas.ts; se mudar uma regra, mude lá também.
import { lerUtilizacao } from '../importador/planilhaAmostras'
import { fmt } from './formatacao'

export interface CondicoesRda {
  texto: string
  ensaio: string | null
  acido: string | null
  concentracao: number | null
  unidade: string | null
  temperatura_c: number | null
  rotacao_rpm: number | null
}

/** Condições do RDA lidas de "Utilização: TR - HCl [15%] - Silurian - 60 °C @500" nas observações. */
export function condicoesRdaDoControle(observacoes: string | null | undefined): CondicoesRda | null {
  const texto = /Utilização:\s*(.+)$/s.exec(observacoes ?? '')?.[1]?.trim()
  if (!texto) return null
  const { ensaio, acido, concentracao, unidade, temperatura_c, rotacao_rpm } = lerUtilizacao(texto)
  const num = (n: number | null) => (n != null && Number.isFinite(n) ? n : null)
  const c = { texto, ensaio, acido, concentracao: num(concentracao), unidade, temperatura_c: num(temperatura_c), rotacao_rpm: num(rotacao_rpm) }
  return c.acido || c.temperatura_c != null || c.rotacao_rpm != null ? c : null
}

/** "HCl 15 %" / "HCl 0,5 M" */
export function descreverAcido(c: Pick<CondicoesRda, 'acido' | 'concentracao' | 'unidade'>): string {
  return [c.acido, c.concentracao != null ? `${fmt(c.concentracao, 4)} ${c.unidade ?? ''}`.trim() : null].filter(Boolean).join(' ')
}

/** "TR · HCl 15 % · 60 °C · 500 rpm" */
export function descreverCondicoes(c: CondicoesRda): string {
  return [
    c.ensaio,
    descreverAcido(c),
    c.temperatura_c != null && `${fmt(c.temperatura_c, 1)} °C`,
    c.rotacao_rpm != null && `${fmt(c.rotacao_rpm, 0)} rpm`,
  ].filter(Boolean).join(' · ')
}

/** "%" da planilha = wt% do catálogo; M e N ficam como estão. */
export function unidadeDeConcentracao(u: string | null | undefined): string {
  const k = (u ?? '').replace(/\s+/g, '').toLowerCase()
  if (['%', 'wt%', '%wt', '%m/m'].includes(k)) return 'wt%'
  if (k === 'm' || k === 'mol/l') return 'M'
  if (k === 'n') return 'N'
  return (u ?? '').trim()
}

interface SistemaParaCasar {
  id_sistema: string
  componente_1: string
  valor_1?: number | null
  unidade_1?: string | null
  componente_2?: string | null
}

/**
 * Sistema ácido do catálogo com o mesmo ácido principal e a mesma concentração (valor + unidade).
 * Para HCl (monoprótico), M e N valem o mesmo. Havendo mais de um, prefere o sem aditivos. null = não achou.
 */
export function acharSistemaAcido<S extends SistemaParaCasar>(sistemas: S[], c: Pick<CondicoesRda, 'acido' | 'concentracao' | 'unidade'>): S | null {
  if (!c.acido || c.concentracao == null) return null
  const acido = c.acido.trim().toLowerCase()
  const unidade = unidadeDeConcentracao(c.unidade)
  const mesmaUnidade = (u: string) => u === unidade || (acido === 'hcl' && ['M', 'N'].includes(u) && ['M', 'N'].includes(unidade))
  const candidatos = sistemas.filter((s) =>
    s.componente_1?.trim().toLowerCase() === acido
    && s.valor_1 != null && Math.abs(Number(s.valor_1) - c.concentracao!) < 1e-6
    && mesmaUnidade(unidadeDeConcentracao(s.unidade_1)))
  return candidatos.find((s) => !s.componente_2) ?? candidatos[0] ?? null
}

/** Amostra de coreflooding que o controle marca como já usada: "utilizada", "acidificada" ou as duas. null = não é o caso. */
export function marcasDeCoreflooding(a: { finalidade?: string | null; status?: string | null }, observacoes: string | null | undefined): string | null {
  if ((a.finalidade ?? '').trim().toLowerCase() !== 'coreflooding') return null
  const marcas = [a.status === 'utilizada' && 'utilizada', /acidificad/i.test(observacoes ?? '') && 'acidificada'].filter(Boolean)
  return marcas.length > 0 ? marcas.join('/') : null
}

/** "Disco · RDA" / "Plug · coreflooding" */
export function rotuloFinalidade(finalidade: string | null | undefined): string | null {
  const f = (finalidade ?? '').trim()
  if (!f) return null
  if (f.toLowerCase() === 'rda') return 'Disco · RDA'
  if (f.toLowerCase() === 'coreflooding') return 'Plug · coreflooding'
  return f
}
