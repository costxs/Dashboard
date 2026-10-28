import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useContexto } from './store/useContexto'
import { Shell } from './components/layout/Shell'
import { LoginPage } from './pages/LoginPage'
import { RedefinirSenhaPage } from './pages/RedefinirSenhaPage'
import { ProjectSelectionPage } from './pages/ProjectSelectionPage'
import { DashboardPage } from './pages/DashboardPage'
import { AmostrasPage } from './pages/AmostrasPage'
import { AmostraPage } from './pages/AmostraPage'
import { WorkPackagesPage } from './pages/WorkPackagesPage'
import { LiteraturaPage } from './pages/LiteraturaPage'
import { ImportadorPage } from './pages/ImportadorPage'
import { TratamentoCorefloodPage } from './pages/TratamentoCorefloodPage'
import { AdministracaoPage } from './pages/AdministracaoPage'

/** Só entra quem está logado no Supabase; sem sessão, vai para /login. */
const RequerLogin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario, carregando } = useAuth()

  if (carregando) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[13px] text-[var(--color-neutral-600)]">
          <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" />
          Verificando sessão…
        </div>
      </div>
    )
  }

  if (!usuario) {
    return <Navigate to="/login" replace />
  }

  return <RequerNivelElevado>{children}</RequerNivelElevado>
}

const URL_DASHBOARD = import.meta.env.VITE_URL_DASHBOARD as string | undefined

/**
 * O painel gerencial é só de administradores e editores. Leitores e quem se registrou pelo dashboard
 * usam o dashboard de visualização. É navegação: o que cada um lê ou grava, quem decide é o banco.
 */
const RequerNivelElevado: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { editor, isAdmin, perfil, sair } = useAuth()
  if (editor || isAdmin) return <>{children}</>
  const pendente = perfil?.situacao === 'pendente'
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-6">
      <div className="cartao max-w-md p-8 text-center">
        <h1 className="m-0 text-[22px] text-[var(--color-blue-800)]">Acesso ao painel gerencial</h1>
        <p className="mt-3 text-[14px] text-[var(--color-neutral-700)]">
          {pendente
            ? 'Seu cadastro ainda aguarda a aprovação do administrador.'
            : 'Este painel é para administradores e editores. Sua conta tem acesso ao dashboard de visualização.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {URL_DASHBOARD && !pendente && <a className="btn btn-blue" href={URL_DASHBOARD}>Abrir o dashboard</a>}
          <button type="button" className="btn btn-secondary" onClick={() => { void sair() }}>Sair</button>
        </div>
      </div>
    </div>
  )
}

/** As páginas de lançamento precisam de uma empresa escolhida. */
const RequerContexto: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const empresaId = useContexto((s) => s.empresaId)
  if (!empresaId) return <Navigate to="/projetos" replace />
  return <>{children}</>
}

/** Páginas só de editor/administrador. É só navegação: quem bloqueia a gravação é o banco. */
const RequerEditor: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { editor, isAdmin } = useAuth()
  if (!editor && !isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
          <Route path="/projetos" element={<RequerLogin><ProjectSelectionPage /></RequerLogin>} />

          <Route element={<RequerLogin><Shell /></RequerLogin>}>
            <Route path="/" element={<RequerContexto><DashboardPage /></RequerContexto>} />
            <Route path="/amostras" element={<RequerContexto><AmostrasPage /></RequerContexto>} />
            <Route path="/amostras/:id" element={<RequerContexto><AmostraPage /></RequerContexto>} />
            <Route path="/work-packages" element={<RequerContexto><WorkPackagesPage /></RequerContexto>} />
            <Route path="/publicacoes" element={<RequerContexto><LiteraturaPage /></RequerContexto>} />
            <Route path="/importar" element={<RequerEditor><ImportadorPage /></RequerEditor>} />
            <Route path="/tratamento-coreflood" element={<RequerEditor><RequerContexto><TratamentoCorefloodPage /></RequerContexto></RequerEditor>} />
            <Route path="/administracao"element={<RequerEditor><AdministracaoPage /></RequerEditor>} />

            {/* endereços antigos */}
            <Route path="/analises" element={<Navigate to="/amostras" replace />} />
            <Route path="/literatura" element={<Navigate to="/publicacoes" replace />} />
            <Route path="/importador" element={<Navigate to="/importar" replace />} />
            <Route path="/empresas-projetos" element={<Navigate to="/administracao" replace />} />
            <Route path="/catalogos" element={<Navigate to="/administracao?aba=catalogos" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
