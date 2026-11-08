import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { definirNovaSenha, logout } from '../servicos/api'

/** Aberta pelo link do e-mail de recuperação (o Supabase cria uma sessão temporária) ou pelo código de 6 dígitos. */
export const RedefinirSenhaPage: React.FC = () => {
  const { usuario, carregando } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro('A senha deve ter pelo menos 8 caracteres.')
    if (senha !== confirma) return setErro('As senhas não conferem.')
    setLoading(true)
    try {
      if (!usuario) {
        if (!email.trim() || !codigo.trim()) {
          throw new Error('Informe o e-mail e o código de 6 dígitos recebido no e-mail.')
        }
        const { error: otpErr } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: codigo.trim(),
          type: 'recovery',
        })
        if (otpErr) throw new Error('Código inválido ou expirado. Peça um novo na tela de login.')
      }
      await definirNovaSenha(senha)
      await logout()
      navigate('/login')
    } catch (err: any) {
      setErro(err.message || 'Erro ao redefinir a senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[linear-gradient(160deg,var(--color-blue-900)_0%,var(--color-blue-700)_55%,var(--color-blue)_100%)]">
      <div className="w-full max-w-[420px] bg-white shadow-2xl shadow-black/30 rounded-[18px] overflow-hidden animate-fade-in">
        <div className="faixa-lcp" />
        <div className="p-8 sm:p-10">
          <h1 className="text-[24px] font-bold text-[var(--color-blue-800)] mb-6">Redefinir senha</h1>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Verificando link…</div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {usuario ? (
                <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Conta: <strong>{usuario.email}</strong></p>
              ) : (
                <>
                  <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">
                    Digite o seu e-mail e o <strong>código de 6 dígitos</strong> recebido no e-mail para escolher sua nova senha:
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="email-rec" className="text-sm text-[var(--color-neutral-600)]">E-mail</label>
                    <input id="email-rec" type="email" required autoComplete="username" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="input h-11" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="codigo-rec" className="text-sm text-[var(--color-neutral-600)]">Código de 6 dígitos (do e-mail)</label>
                    <input id="codigo-rec" type="text" required inputMode="numeric" maxLength={8} placeholder="Ex.: 437117" value={codigo}
                      onChange={(e) => setCodigo(e.target.value)} className="input h-11 font-mono tracking-widest text-center text-lg" />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nova" className="text-sm text-[var(--color-neutral-600)]">Nova senha</label>
                <input id="nova" type="password" required autoComplete="new-password" value={senha}
                  onChange={(e) => setSenha(e.target.value)} className="input h-11" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirma" className="text-sm text-[var(--color-neutral-600)]">Confirmar nova senha</label>
                <input id="confirma" type="password" required autoComplete="new-password" value={confirma}
                  onChange={(e) => setConfirma(e.target.value)} className="input h-11" />
              </div>
              {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
              <button type="submit" disabled={loading}
                className="mt-2 w-full h-11 rounded-[10px] bg-[var(--color-red)] hover:bg-[var(--color-red-700)] text-white font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
              <button type="button" onClick={() => navigate('/login')} className="btn btn-secondary">
                Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
