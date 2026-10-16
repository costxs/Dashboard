import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { entrar } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";

export function LoginPage() {
  const sessao = useContexto((s) => s.sessao);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sessao) return <Navigate to="/projetos" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, password); // a sessão muda e o redirecionamento acontece sozinho
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 font-sans bg-[linear-gradient(160deg,var(--color-blue-900)_0%,var(--color-blue-700)_55%,var(--color-blue)_100%)]">
      <div className="w-full max-w-[420px] bg-white shadow-2xl shadow-black/30 rounded-[18px] overflow-hidden animate-[fadeIn_0.5s_ease-out]">
        <style>
          {`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-stagger-1 { animation: fadeIn 0.5s ease-out 0.1s both; }
            .animate-stagger-2 { animation: fadeIn 0.5s ease-out 0.2s both; }
            .animate-stagger-3 { animation: fadeIn 0.5s ease-out 0.3s both; }
          `}
        </style>
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

          <h1 className="text-[26px] font-bold text-[var(--color-blue-800)] mb-8 leading-tight tracking-tight">
            Bem-vindo ao<br />
            <span className="text-[var(--color-red)]">Memória Experimental</span>
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 animate-stagger-1">
              <label htmlFor="email" className="text-sm text-[var(--color-neutral-600)]">E-mail</label>
              <input
                id="email" name="email" type="email" required autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="input h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5 animate-stagger-2">
              <label htmlFor="password" className="text-sm text-[var(--color-neutral-600)]">Senha</label>
              <input
                id="password" name="password" type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="input h-11"
              />
            </div>

            {erro && <div className="aviso aviso-erro">{erro}</div>}

            <button
              type="submit"
              disabled={enviando}
              className="mt-3 w-full h-11 rounded-[10px] bg-[var(--color-red)] hover:bg-[var(--color-red-700)] active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 animate-stagger-3 disabled:opacity-60"
            >
              {enviando && <Loader2 size={16} className="animate-spin" />}
              {enviando ? "Entrando…" : "Entrar"}
            </button>
            <p className="text-center text-[12px] text-[var(--color-neutral-500)]">
              Acesso liberado pelo administrador do LC PETRO.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
