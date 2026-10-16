import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useContexto } from './store/useContexto'
import { Shell } from './components/layout/Shell'
import { LoginPage } from './pages/LoginPage'
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

  return <>{children}</>
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
