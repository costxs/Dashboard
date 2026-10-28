import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { enviarRecuperacaoSenha } from '../servicos/api'

// Visual: docs/referencia/painel-cadastro/src/pages/LoginPage.tsx (telas/dashboard_01_login.png)
export const LoginPage: React.FC = () => {
  const { entrar, usuario, carregando } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function esqueciSenha() {
    setErro(null)
    setAviso(null)
    if (!email.trim()) {
      setErro('Digite seu e-mail no campo acima e clique em "Esqueci minha senha".')
      return
    }
    setLoading(true)
    try {
      await enviarRecuperacaoSenha(email.trim())
      setAviso('Enviamos um link de redefinição para o seu e-mail. Verifique também o spam.')
    } catch (err: any) {
      setErro(err.message || 'Não foi possível enviar o e-mail de recuperação')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      await entrar(email, senha)
      navigate('/projetos')
    } catch (err: any) {
      setErro(err.message || 'Erro ao realizar login')
    } finally {
      setLoading(false)
    }
  }

  // quem já tem sessão não precisa ver o login
  if (usuario && !carregando && !loading) return <Navigate to="/projetos" replace />

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[linear-gradient(160deg,var(--color-blue-900)_0%,var(--color-blue-700)_55%,var(--color-blue)_100%)]">
      <div className="w-full max-w-[420px] bg-white shadow-2xl shadow-black/30 rounded-[18px] overflow-hidden animate-fade-in">
        <div className="faixa-lcp" />
        <div className="p-8 sm:p-10">
          <div className="flex items-center justify-center gap-6 mb-9">
            <div className="w-[150px] h-[85px] flex items-center justify-center">
              <img src="/lab-logo-1.png" alt="LC PETRO" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="w-[1px] h-[75px] bg-[var(--color-neutral-300)]" />
            <div className="w-[150px] h-[85px] flex items-center justify-center">
              <img src="/lab-logo-2.png" alt="Laboratório" className="max-w-full max-h-full object-contain" />
            </div>
          </div>

          <h1 className="text-[26px] font-bold text-[var(--color-blue-800)] mb-2 leading-tight tracking-tight">
            Bem-vindo ao<br />
            <span className="text-[var(--color-red)]">Memória Experimental</span>
          </h1>
          <p className="mb-7 text-[10px] tracking-[0.07em] uppercase font-semibold text-[var(--color-orange-700)]">
            Painel de Cadastro
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm text-[var(--color-neutral-600)]">E-mail</label>
              <input
                id="email" name="email" type="email" required autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="input h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="senha" className="text-sm text-[var(--color-neutral-600)]">Senha</label>
              <input
                id="senha" name="senha" type="password" required autoComplete="current-password"
                value={senha} onChange={(e) => setSenha(e.target.value)}
                className="input h-11"
              />
            </div>

            <button
              type="button" onClick={esqueciSenha} disabled={loading}
              className="self-end -mt-2 text-[13px] text-[var(--color-blue-700)] hover:underline cursor-pointer bg-transparent border-0 p-0 disabled:opacity-60"
            >
              Esqueci minha senha
            </button>

            {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
            {aviso && <div className="aviso" role="status">{aviso}</div>}

            <button
              type="submit"
              disabled={loading}
              className="mt-3 w-full h-11 rounded-[10px] bg-[var(--color-red)] hover:bg-[var(--color-red-700)] active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
            <p className="text-center text-[12px] text-[var(--color-neutral-500)]">
              Acesso liberado pelo administrador do LC PETRO.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
