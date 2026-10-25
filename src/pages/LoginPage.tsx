import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { entrar, pedirNovaSenha, registrar } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";

export function LoginPage() {
  const sessao = useContexto((s) => s.sessao);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // "registrar": pedido de acesso, que fica pendente até o administrador aprovar no gerencial
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [nome, setNome] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);

  if (sessao) return <Navigate to="/projetos" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === "registrar") {
        if (password !== confirmar) throw new Error("As senhas não conferem.");
        if (password.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
        const precisaConfirmar = await registrar({ nome, email, senha: password, instituicao, motivo });
        setEnviado(precisaConfirmar
          ? "Pedido enviado. Confirme o seu e-mail pelo link que o sistema mandou; depois o administrador do LC PETRO analisa o acesso."
          : "Pedido enviado. O administrador do LC PETRO vai analisar o seu acesso.");
      } else {
        await entrar(email, password); // a sessão muda e o redirecionamento acontece sozinho
      }
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

          {enviado ? (
            <div className="flex flex-col gap-4">
              <div className="aviso aviso-ok">{enviado}</div>
              <button type="button" className="btn btn-secondary"
                onClick={() => { setEnviado(null); setModo("entrar"); setPassword(""); setConfirmar(""); }}>
                Voltar para o login
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {modo === "registrar" && (
              <>
                <Campo id="nome" rotulo="Nome completo" valor={nome} aoMudar={setNome} obrigatorio autoComplete="name" />
                <Campo id="instituicao" rotulo="Instituição ou empresa" valor={instituicao} aoMudar={setInstituicao} obrigatorio autoComplete="organization" />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="motivo" className="text-sm text-[var(--color-neutral-600)]">Para que você precisa do acesso?</label>
                  <textarea id="motivo" rows={3} required value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    className="input" placeholder="Projeto, orientador, pesquisa…" />
                </div>
              </>
            )}
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
                id="password" name="password" type="password" required
                autoComplete={modo === "registrar" ? "new-password" : "current-password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="input h-11"
              />
            </div>
            {modo === "registrar" && (
              <Campo id="confirmar" rotulo="Confirme a senha" tipo="password" valor={confirmar} aoMudar={setConfirmar} obrigatorio autoComplete="new-password" />
            )}

            {erro && <div className="aviso aviso-erro">{erro}</div>}

            <button
              type="submit"
              disabled={enviando}
              className="mt-3 w-full h-11 rounded-[10px] bg-[var(--color-red)] hover:bg-[var(--color-red-700)] active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 animate-stagger-3 disabled:opacity-60"
            >
              {enviando && <Loader2 size={16} className="animate-spin" />}
              {modo === "registrar" ? (enviando ? "Enviando…" : "Pedir acesso") : (enviando ? "Entrando…" : "Entrar")}
            </button>
            {modo === "entrar" && (
              <button type="button" className="text-center text-[13px] text-[var(--color-blue)] hover:underline cursor-pointer"
                onClick={async () => {
                  setErro(null);
                  if (!email.trim()) return setErro("Escreva o seu e-mail acima e clique de novo em “Esqueci minha senha”.");
                  try {
                    await pedirNovaSenha(email);
                    setEnviado("Se este e-mail tiver conta, chega uma mensagem com o link para definir a nova senha.");
                  } catch (err) {
                    setErro(err instanceof Error ? err.message : String(err));
                  }
                }}>
                Esqueci minha senha
              </button>
            )}
            <p className="text-center text-[13px] text-[var(--color-neutral-600)]">
              {modo === "entrar" ? "Ainda não tem acesso? " : "Já tem conta? "}
              <button type="button" className="font-semibold text-[var(--color-blue)] hover:underline cursor-pointer"
                onClick={() => { setModo(modo === "entrar" ? "registrar" : "entrar"); setErro(null); }}>
                {modo === "entrar" ? "Criar conta" : "Entrar"}
              </button>
            </p>
            {modo === "registrar" && (
              <p className="text-center text-[12px] text-[var(--color-neutral-500)]">
                O acesso é liberado depois da aprovação do administrador do LC PETRO.
              </p>
            )}
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo(p: {
  id: string; rotulo: string; valor: string; aoMudar: (v: string) => void;
  tipo?: string; obrigatorio?: boolean; autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={p.id} className="text-sm text-[var(--color-neutral-600)]">{p.rotulo}</label>
      <input id={p.id} type={p.tipo ?? "text"} required={p.obrigatorio} autoComplete={p.autoComplete}
        value={p.valor} onChange={(e) => p.aoMudar(e.target.value)} className="input h-11" />
    </div>
  );
}
