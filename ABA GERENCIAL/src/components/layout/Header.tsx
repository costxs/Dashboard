import { LogOut, Search, ArrowLeft, X, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { SUPABASE_REF } from '../../lib/supabase'
import { useContexto } from '../../store/useContexto'

// Base: docs/referencia/visual/Header.tsx, com o selo "Modo cadastro" do gerencial.
export function Header() {
  const recolhido = useContexto((s) => s.menuRecolhido)
  const alternarMenu = useContexto((s) => s.alternarMenu)
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { perfil, sair } = useAuth()

  // a busca vai para a lista de amostras pela URL (/amostras?busca=...)
  const buscaNaUrl = location.pathname === '/amostras' ? params.get('busca') ?? '' : ''
  const [busca, setBusca] = useState(buscaNaUrl)
  useEffect(() => setBusca(buscaNaUrl), [buscaNaUrl])

  function buscar(valor: string) {
    const termo = valor.trim()
    navigate(termo ? `/amostras?busca=${encodeURIComponent(termo)}` : '/amostras')
  }

  async function handleSair() {
    await sair()
    navigate('/login')
  }

  const nome = perfil?.nome ?? perfil?.email ?? 'Pesquisador'
  const iniciais = nome.split(/[\s.@]+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="shrink-0">
      <div className="faixa-lcp" />
      <header className="flex h-[64px] items-center justify-between gap-6 bg-white border-b border-[var(--color-neutral-300)] px-7">
        <div className="flex items-center gap-4 w-full max-w-[560px]">
          <button
            onClick={alternarMenu}
            className={`flex items-center justify-center w-[34px] h-[34px] rounded-[10px] text-[var(--color-blue)] bg-white border border-[var(--color-neutral-300)] hover:bg-[var(--color-blue-50)] transition-colors shrink-0 cursor-pointer ${recolhido ? 'bg-[var(--color-blue-50)]' : ''}`}
            title={recolhido ? 'Expandir menu' : 'Recolher menu'}
          >
            <Menu size={16} />
          </button>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] text-[var(--color-blue)] bg-[var(--color-blue-50)] hover:bg-[var(--color-blue-100)] transition-colors shrink-0 cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <form className="relative w-full" onSubmit={(e) => { e.preventDefault(); buscar(busca) }}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-500)]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar amostra, poço, campo ou local..."
              className="input !pl-10 pr-10 !py-2"
            />
            {busca && (
              <button
                type="button"
                onClick={() => { setBusca(''); if (buscaNaUrl) buscar('') }}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)] rounded-full hover:bg-[var(--color-neutral-200)] transition-colors cursor-pointer"
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </form>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="hidden xl:flex items-center gap-1.5 text-[11px] text-[var(--color-neutral-500)]"
            title="Banco de dados conectado">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neutral-400)]" />
            Supabase conectado · {SUPABASE_REF}
          </span>
          <span className="tag tag-orange !text-[11px] !py-1.5 shrink-0">Modo cadastro</span>
        </div>

        <div className="flex items-center gap-3 border-l border-[var(--color-neutral-300)] pl-5 shrink-0">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--color-red)] font-heading font-extrabold text-[12px] text-white">
            {iniciais}
          </div>
          <div className="leading-[1.3]">
            <p className="m-0 text-[13px] font-semibold">{nome}</p>
            <p className="m-0 text-[11px] text-[var(--color-neutral-600)]">
              {perfil?.administrador ? 'Administrador · LC PETRO' : 'LC PETRO'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSair}
            className="ml-1 flex h-8 w-8 items-center justify-center text-[var(--color-neutral-500)] hover:bg-[var(--color-red-50)] hover:text-[var(--color-red)] rounded-md transition-colors cursor-pointer"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
    </div>
  )
}
