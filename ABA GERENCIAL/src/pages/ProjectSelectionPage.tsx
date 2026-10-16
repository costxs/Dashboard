import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Briefcase, ChevronRight, FolderKanban, Loader2, LogOut, Search, Settings } from 'lucide-react'
import { LogoEmpresa } from '../components/LogoEmpresa'
import { Alert } from '../components/UI'
import { useAuth } from '../context/AuthContext'
import { listarEmpresas, listarProjetos } from '../servicos/api'
import { useContexto } from '../store/useContexto'
import type { Empresa, Projeto } from '../tipos/banco'

// Dois níveis: 1) escolher a EMPRESA  2) escolher o PROJETO (ou todos da empresa).
// As listas vêm do banco já filtradas pelo acesso de quem está logado.
// Base: docs/referencia/painel-cadastro/src/pages/ProjectSelectionPage.tsx
export const ProjectSelectionPage: React.FC = () => {
  const navigate = useNavigate()
  const { perfil, isAdmin, sair } = useAuth()
  const escolherEmpresa = useContexto((s) => s.escolherEmpresa)
  const escolherProjeto = useContexto((s) => s.escolherProjeto)

  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null)
  const [projetos, setProjetos] = useState<Projeto[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    listarEmpresas()
      .then((lista) => {
        setEmpresas(lista)
        // quem veio de "Alternar projeto" já cai nos projetos da empresa em que estava
        const atual = lista.find((e) => e.id === useContexto.getState().empresaId)
        if (atual) setEmpresa(atual)
      })
      .catch((e) => setErro(e.message))
  }, [])

  useEffect(() => {
    setProjetos(null)
    if (!empresa) return
    let vivo = true
    listarProjetos(empresa.id, true)
      .then((p) => { if (vivo) setProjetos(p) })
      .catch((e) => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [empresa])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = perfil?.nome?.split(' ')[0]

  const q = busca.toLowerCase()
  const empresasFiltradas = (empresas ?? []).filter(
    (e) => e.nome.toLowerCase().includes(q) || e.sigla.toLowerCase().includes(q))
  const projetosFiltrados = (projetos ?? []).filter(
    (p) => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))

  function entrarNoProjeto(projeto: { id: string; nome: string } | null) {
    if (!empresa) return
    escolherEmpresa({ id: empresa.id, sigla: empresa.sigla, nome: empresa.nome })
    escolherProjeto(projeto)
    navigate('/')
  }

  async function handleSair() {
    await sair()
    navigate('/login')
  }

  const carregando = (
    <div className="flex items-center gap-2 py-6 text-[13px] text-[var(--color-neutral-600)]">
      <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" /> Carregando…
    </div>
  )

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[var(--color-bg)]">
      <div className="w-full max-w-[720px] bg-white shadow-2xl shadow-[var(--color-blue-200)]/40 rounded-3xl overflow-hidden animate-fade-in">
        <div className="faixa-lcp" />
        <div className="p-8 sm:p-12">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="relative w-full max-w-[320px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)] group-focus-within:text-[var(--color-orange)] transition-colors" size={18} />
              <input
                type="text"
                placeholder={empresa ? 'Pesquisar projetos...' : 'Pesquisar empresas...'}
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[var(--color-neutral-50)] hover:bg-white border border-[var(--color-neutral-200)] rounded-full text-sm focus:outline-none focus:ring-4 focus:ring-[var(--color-orange-100)] focus:border-[var(--color-orange)] focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-1">
              {isAdmin && (
                <button className="btn btn-secondary" onClick={() => navigate('/administracao')} title="Empresas, projetos e acessos">
                  <Settings size={14} /> Administração
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleSair} title="Sair"><LogOut size={14} /></button>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[var(--color-blue-800)] tracking-tight leading-tight">
              {saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}
            </h1>
            <p className="text-[var(--color-neutral-600)] mt-1.5 text-sm font-medium">
              {empresa
                ? <>Qual projeto de <strong className="text-[var(--color-red)]">{empresa.nome}</strong> quer abrir?</>
                : 'Em qual empresa vai lançar dados hoje?'}
            </p>
          </div>

          <div className="w-full h-px bg-gradient-to-r from-[var(--color-red-200)] via-[var(--color-orange-200)] to-[var(--color-blue-200)] mb-8" />

          {erro && <Alert tipo="erro" mensagem={erro} />}
          {!erro && !empresas && carregando}

          {/* NÍVEL 1: empresas */}
          {!empresa && empresas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {empresasFiltradas.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setEmpresa(e); setBusca('') }}
                  className="flex flex-col items-center justify-center p-8 bg-white border border-[var(--color-neutral-200)] rounded-2xl hover:border-[var(--color-orange)] hover:shadow-xl hover:shadow-[var(--color-orange-100)] active:scale-[0.98] transition-all duration-300 group cursor-pointer"
                >
                  <div className="h-[130px] flex items-center justify-center transition-transform duration-500 group-hover:scale-[1.08] group-hover:-translate-y-1">
                    <LogoEmpresa sigla={e.sigla} nome={e.nome} tamanho={130} />
                  </div>
                  <p className="mt-4 font-heading font-bold text-[15px] text-[var(--color-blue-800)]">{e.nome}</p>
                  <div className="mt-2 flex items-center text-xs font-bold text-[var(--color-red)] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                    <span>Ver projetos</span>
                    <ChevronRight size={16} className="ml-1" strokeWidth={2.5} />
                  </div>
                </button>
              ))}
              {empresasFiltradas.length === 0 && (
                <div className="col-span-1 sm:col-span-2 text-center py-10 text-[var(--color-neutral-500)] text-sm flex flex-col items-center gap-3">
                  <Briefcase size={32} className="text-[var(--color-neutral-300)]" />
                  {empresas.length === 0
                    ? <span>Você ainda não tem acesso a nenhum projeto. Peça ao administrador do LC PETRO.
                        {isAdmin && <> Como administrador, crie a primeira empresa em <button className="underline text-[var(--color-red)] cursor-pointer" onClick={() => navigate('/administracao')}>Administração</button>.</>}
                      </span>
                    : <span>Nenhuma empresa encontrada com "{busca}"</span>}
                </div>
              )}
            </div>
          )}

          {/* NÍVEL 2: projetos da empresa */}
          {empresa && (
            <div className="flex flex-col gap-3">
              <button className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-neutral-600)] hover:text-[var(--color-red)] w-fit mb-2 cursor-pointer"
                onClick={() => { setEmpresa(null); setBusca('') }}>
                <ArrowLeft size={14} /> Trocar empresa
              </button>
              {!projetos && !erro && carregando}
              {projetosFiltrados.map((p) => (
                <button key={p.id} onClick={() => entrarNoProjeto({ id: p.id, nome: p.nome })}
                  className="flex items-center gap-4 text-left px-5 py-4 border border-[var(--color-neutral-200)] rounded-xl hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)] transition-all group cursor-pointer">
                  <FolderKanban size={20} className="text-[var(--color-orange)] shrink-0" />
                  <div className="flex-1">
                    <p className="m-0 font-semibold text-[15px] text-[var(--color-blue-800)]">{p.nome}</p>
                    <p className="m-0 text-[12px] text-[var(--color-neutral-500)]">{p.codigo}{p.descricao ? ` · ${p.descricao}` : ''}</p>
                  </div>
                  <ChevronRight size={18} className="text-[var(--color-neutral-400)] group-hover:text-[var(--color-red)]" />
                </button>
              ))}
              {projetos && projetos.length > 0 && (
                <button onClick={() => entrarNoProjeto(null)} className="btn btn-blue w-fit mt-2">
                  Ver todos os projetos de {empresa.sigla}
                </button>
              )}
              {projetos?.length === 0 && (
                <p className="text-sm text-[var(--color-neutral-500)]">Nenhum projeto ativo nesta empresa.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
