import { createClient } from '@supabase/supabase-js'

// Variáveis no arquivo .env.local da raiz do projeto (NÃO subir para o GitHub):
//   VITE_SUPABASE_URL=https://<projeto>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<chave "anon public" em Project Settings -> API>
// A chave anon pode ficar no front: quem decide o que cada usuário vê são as
// regras de acesso do banco (migração 0006), não o front.
const url = import.meta.env.VITE_SUPABASE_URL as string
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string

/** false quando o .env.local (ou as variáveis na Vercel) ainda não foram preenchidos. */
export const supabaseConfigurado = Boolean(url && chave)

export const supabase = createClient(url || 'http://localhost', chave || 'sem-chave')

export const BUCKET_ARQUIVOS = 'arquivos'

/** Lança o erro do Supabase com mensagem em português quando possível. */
export function verificar<T>(resposta: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (resposta.error) {
    const e = resposta.error
    if (e.code === '42501') throw new Error('Sem permissão para esta operação neste projeto.')
    if (e.code === '23505') throw new Error('Já existe um registro com este código.')
    if (e.code === '23503') throw new Error('Referência inválida (ex.: sistema ácido ou litologia não cadastrados).')
    if (e.code === '23514') throw new Error(`Valor fora do permitido: ${e.message}`)
    throw new Error(e.message)
  }
  return resposta.data as T
}
