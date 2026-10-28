// Cadastro de usuários do painel gerencial (admin ou editor), feito pelo administrador.
// Criar a conta exige a chave secreta do Supabase, que só existe no backend (Dashboard-Back/servico-graficos,
// contas.py): o backend confere no banco que quem pede é administrador e o Supabase manda o convite por e-mail.
import { supabase } from '../lib/supabase'
import { URL_GRAFICOS } from './graficos'

// endereço PUBLICADO do dashboard (Vercel); sem ele, o link do convite usa este gerencial
const URL_DASHBOARD = String(import.meta.env.VITE_URL_DASHBOARD ?? '').replace(/\/+$/, '')

export interface ConviteUsuario {
  email: string
  nome: string
  nivel: 'admin' | 'editor'
  /** editor: uma ou mais empresas e/ou projetos (cada vínculo é de uma empresa OU de um projeto) */
  escopos?: { empresa_id?: string | null; projeto_id?: string | null }[]
}

export async function convidarUsuario(c: ConviteUsuario): Promise<{ id: string; email: string }> {
  if (!URL_GRAFICOS) throw new Error('Falta o endereço do backend: coloque VITE_URL_GRAFICOS no .env.local e reinicie o npm run dev.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sua sessão expirou: entre de novo no gerencial.')
  let r: Response
  try {
    r = await fetch(`${URL_GRAFICOS}/usuarios/convidar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // o link do e-mail abre a página de definir a senha do DASHBOARD, que é o que está publicado
      // (o gerencial roda só no laboratório: um link para localhost não abre no computador da pessoa)
      body: JSON.stringify({ ...c, redirect_to: `${URL_DASHBOARD || window.location.origin}/redefinir-senha` }),
    })
  } catch {
    throw new Error(`O backend não respondeu (${URL_GRAFICOS}). Confira se ele está rodando na pasta Dashboard-Back/servico-graficos.`)
  }
  const corpo = await r.json().catch(() => null) as { detail?: unknown; id?: string; email?: string } | null
  if (r.ok && corpo?.id) return { id: corpo.id, email: corpo.email ?? c.email }
  const detalhe = Array.isArray(corpo?.detail)
    ? (corpo.detail as { msg?: string }[]).map((d) => d.msg).join('; ')
    : corpo?.detail ? String(corpo.detail) : r.statusText
  throw new Error(detalhe.replace(/^Value error, /, ''))
}
