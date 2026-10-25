import { useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { Carregando } from "./components/ui/base";
import { supabaseConfigurado } from "./lib/supabase";
import { ComparacaoPage } from "./pages/ComparacaoPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LiteraturePage } from "./pages/LiteraturePage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSelectionPage } from "./pages/ProjectSelectionPage";
import { RedefinirSenhaPage } from "./pages/RedefinirSenhaPage";
import { SampleDetailPage } from "./pages/SampleDetailPage";
import { SamplesListPage } from "./pages/SamplesListPage";
import { meuPerfil, sair } from "./servicos/contexto";
import { iniciarAutenticacao, useContexto } from "./store/useContexto";

function App() {
  const sessao = useContexto((s) => s.sessao);
  const definirPerfil = useContexto((s) => s.definirPerfil);

  useEffect(() => (supabaseConfigurado ? iniciarAutenticacao() : undefined), []);
  useEffect(() => {
    if (sessao) meuPerfil().then(definirPerfil).catch(() => definirPerfil(null));
  }, [sessao, definirPerfil]);

  if (!supabaseConfigurado) return <FaltaConfiguracao />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
        <Route path="/projetos" element={<RequerLogin><ProjectSelectionPage /></RequerLogin>} />
        <Route element={<RequerLogin><Shell /></RequerLogin>}>
          <Route path="/dashboard" element={<RequerContexto><DashboardPage /></RequerContexto>} />
          <Route path="/amostras" element={<RequerContexto><SamplesListPage /></RequerContexto>} />
          <Route path="/amostras/:id" element={<RequerContexto><SampleDetailPage /></RequerContexto>} />
          <Route path="/comparacao" element={<RequerContexto><ComparacaoPage /></RequerContexto>} />
          <Route path="/analises" element={<Navigate to="/amostras" replace />} />
          <Route path="/literatura" element={<RequerContexto><LiteraturePage /></RequerContexto>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

/** Só entra quem está logado no Supabase. */
function RequerLogin({ children }: { children: ReactNode }) {
  const sessao = useContexto((s) => s.sessao);
  const carregada = useContexto((s) => s.sessaoCarregada);
  const perfil = useContexto((s) => s.perfil);
  if (!carregada) return <Carregando texto="Verificando sessão…" />;
  if (!sessao) return <Navigate to="/login" replace />;
  // registrado pelo dashboard e ainda não aprovado (ou recusado): o banco não entrega nada, a tela explica
  if (perfil?.situacao === "pendente" || perfil?.situacao === "recusado") return <AguardandoAprovacao recusado={perfil.situacao === "recusado"} />;
  return <>{children}</>;
}

function AguardandoAprovacao({ recusado }: { recusado: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="cartao max-w-lg overflow-hidden">
        <div className="faixa-lcp" />
        <div className="p-8">
          <h1 className="text-[22px] font-bold text-[var(--color-blue-800)]">
            {recusado ? "Acesso não liberado" : "Aguardando aprovação"}
          </h1>
          <p className="mt-3 text-[14px] text-[var(--color-neutral-700)]">
            {recusado
              ? "O administrador do LC PETRO não liberou o acesso desta conta. Se achar que é um engano, fale com o laboratório."
              : "Seu pedido de acesso foi recebido. Assim que o administrador do LC PETRO aprovar, os projetos liberados para você aparecem aqui."}
          </p>
          <button type="button" className="btn btn-secondary mt-6" onClick={() => { void sair(); }}>Sair</button>
        </div>
      </div>
    </div>
  );
}

/** As páginas internas precisam de uma empresa escolhida. */
function RequerContexto({ children }: { children: ReactNode }) {
  const empresaId = useContexto((s) => s.empresaId);
  if (!empresaId) return <Navigate to="/projetos" replace />;
  return <>{children}</>;
}

function FaltaConfiguracao() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="cartao max-w-lg overflow-hidden">
        <div className="faixa-lcp" />
        <div className="p-8">
          <h1 className="text-[22px] font-bold text-[var(--color-blue-800)]">Falta conectar o banco de dados</h1>
          <p className="mt-3 text-[14px] text-[var(--color-neutral-700)]">
            Crie o arquivo <code>.env.local</code> na raiz do projeto (ou cadastre as variáveis na Vercel) com:
          </p>
          <pre className="mt-3 rounded-lg bg-[var(--color-blue-900)] p-4 text-[12px] text-white overflow-x-auto">
{`VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon public>`}
          </pre>
          <p className="mt-3 text-[13px] text-[var(--color-neutral-600)]">
            Os valores ficam em Supabase → Project Settings → API. Depois reinicie o <code>npm run dev</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
