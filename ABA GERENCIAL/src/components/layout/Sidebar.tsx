import { NavLink, useNavigate } from 'react-router-dom'
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  Repeat,
  Settings,
} from 'lucide-react'
import { LogoEmpresa } from '../LogoEmpresa'
import { useAuth } from '../../context/AuthContext'
import { useContexto } from '../../store/useContexto'

// Base: docs/referencia/painel-cadastro/src/components/layout/Sidebar.tsx
const URL_DASHBOARD = import.meta.env.VITE_URL_DASHBOARD as string | undefined

interface Item { to: string; label: string; icon: LucideIcon }

export function Sidebar() {
  const navigate = useNavigate()
  const recolhido = useContexto((s) => s.menuRecolhido)
  const alternarMenu = useContexto((s) => s.alternarMenu)
  const empresaSigla = useContexto((s) => s.empresaSigla)
  const empresaNome = useContexto((s) => s.empresaNome)
  const projetoNome = useContexto((s) => s.projetoNome)
  const { isAdmin, editor } = useAuth()

  // Itens que dependem de papel só aparecem para quem pode usá-los
  // (a regra de verdade é a do banco; aqui é só para não mostrar o que vai ser recusado).
  const lancamento: Item[] = [
    { to: '/', label: 'Visão Geral', icon: LayoutDashboard },
    { to: '/amostras', label: 'Amostras e ensaios', icon: Database },
    { to: '/work-packages', label: 'Work packages', icon: ListChecks },
    { to: '/publicacoes', label: 'Publicações LC PETRO', icon: BookOpen },
    ...(editor ? [{ to: '/importar', label: 'Importar planilha', icon: FileSpreadsheet }] : []),
    ...(editor || isAdmin ? [{ to: '/tratamento-coreflood', label: 'Tratamento de dados de coreflood', icon: Activity }] : []),
  ]
  // Empresas & Projetos e Acessos são só do administrador; Catálogos & Ácidos, de qualquer editor.
  const laboratorio: Item[] = isAdmin
    ? [{ to: '/administracao', label: 'Administração', icon: Settings }]
    : editor
      ? [{ to: '/administracao', label: 'Catálogos & Ácidos', icon: Settings }]
      : []

  const classeItem = (ativo: boolean) => `lcp-nav ${ativo ? 'active' : ''} ${recolhido ? 'justify-center px-0' : ''}`

  const itens = (lista: Item[]) =>
    lista.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} end={to === '/'} title={recolhido ? label : undefined}
        className={({ isActive }) => classeItem(isActive)}>
        <Icon size={17} className="shrink-0" />
        {!recolhido && label}
      </NavLink>
    ))

  return (
    <aside className={`flex h-full shrink-0 flex-col bg-[var(--color-blue-900)] transition-all duration-300 ${recolhido ? 'w-[72px]' : 'w-[248px]'}`}>
      {/* logos sobre fundo branco */}
      <div className="bg-white p-5 border-b-4 border-[var(--color-orange)] flex items-center justify-center relative cursor-pointer group"
        onClick={alternarMenu} title={recolhido ? 'Expandir menu' : 'Recolher menu'}>
        {recolhido ? (
          <img src="/lab-logo-2.png" alt="LC PETRO" className="w-[32px] h-auto object-contain" />
        ) : (
          <div className="flex flex-col items-start w-full">
            <img src="/lab-logo-1.png" alt="LC PETRO" className="w-[180px] h-auto object-contain" />
            <p className="mt-2.5 text-[10px] tracking-[0.07em] uppercase font-semibold text-[var(--color-red)]">
              Painel de Cadastro
            </p>
          </div>
        )}
        <div className={`absolute right-[-12px] top-1/2 -translate-y-1/2 bg-white border border-[var(--color-neutral-300)] rounded-full p-0.5 text-[var(--color-neutral-500)] opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm ${recolhido ? 'opacity-100 right-[-14px]' : ''}`}>
          {recolhido ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {!recolhido && <Secao texto="Lançamento de dados" />}
        <div className={recolhido ? 'pt-5' : ''}>{itens(lancamento)}</div>

        {laboratorio.length > 0 && (
          <>
            {!recolhido && <Secao texto="Laboratório" />}
            <div>{itens(laboratorio)}</div>
          </>
        )}
      </nav>

      <div className={`flex flex-col items-center border-t border-white/10 bg-white/5 pt-4 pb-4 ${recolhido ? 'px-2' : 'px-5'}`}>
        {empresaSigla && (
          <div className="rounded-xl bg-white p-2">
            <LogoEmpresa sigla={empresaSigla} nome={empresaNome} tamanho={recolhido ? 36 : 72} />
          </div>
        )}
        {!recolhido && (
          <p className="mt-2 text-center text-[12px] font-semibold text-white leading-tight">
            {projetoNome ?? (empresaNome ? 'Todos os projetos' : '')}
          </p>
        )}
        <button
          onClick={() => navigate('/projetos')}
          title={empresaNome ? 'Alternar projeto' : 'Escolher projeto'}
          className="flex items-center justify-center gap-1.5 mt-2 text-[11px] font-semibold text-[var(--color-orange-400)] hover:text-white transition-colors cursor-pointer"
        >
          <Repeat size={recolhido ? 15 : 13} />
          {!recolhido && (empresaNome ? 'Alternar projeto' : 'Escolher projeto')}
        </button>

        {URL_DASHBOARD ? (
          <a href={URL_DASHBOARD} target="_blank" rel="noreferrer" title="Abrir Dashboard Visual"
            className={`btn btn-secondary btn-sobre-escuro mt-4 ${recolhido ? '!p-2' : 'w-full'}`}>
            {!recolhido && 'Abrir Dashboard Visual'}
            <ExternalLink size={14} />
          </a>
        ) : (
          <span title="Defina VITE_URL_DASHBOARD no .env.local para ativar este link"
            className={`btn btn-secondary btn-sobre-escuro mt-4 opacity-50 !cursor-not-allowed ${recolhido ? '!p-2' : 'w-full'}`}>
            {!recolhido && 'Abrir Dashboard Visual'}
            <ExternalLink size={14} />
          </span>
        )}
      </div>
    </aside>
  )
}

function Secao({ texto }: { texto: string }) {
  return (
    <p className="m-0 px-5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-blue-400)]">
      {texto}
    </p>
  )
}
