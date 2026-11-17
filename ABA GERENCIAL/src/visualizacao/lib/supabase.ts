// A visualização (copiada do dashboard) usa o MESMO cliente do painel: uma só sessão de login.
export { supabase, BUCKET_ARQUIVOS } from '../../lib/supabase'

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
