import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Layers,
  BookOpen,
  FileSpreadsheet,
  FolderKanban,
  ListChecks,
  Database,
  ArrowRight
} from 'lucide-react'
import { Alert, CabecalhoPagina } from '../components/UI'
import { obterMetricasGerais } from '../servicos/api'
import { useAuth } from '../context/AuthContext'
import { useContexto } from '../store/useContexto'
import { usePodeEditar } from '../hooks/usePapel'

// Visão geral do contexto aberto (um projeto, ou todos os projetos da empresa).
export const DashboardPage: React.FC = () => {
  const { perfil, isAdmin, editor } = useAuth()
  const empresaId = useContexto((s) => s.empresaId)
  const projetoId = useContexto((s) => s.projetoId)
  // papel no projeto aberto (RPC meu_papel); em "todos os projetos", editor em algum lugar
  const podeEditar = usePodeEditar(projetoId)
  const [metricas, setMetricas] = useState({
    totalProjetos: 0,
    totalAmostras: 0,
    totalWorkPackages: 0,
    totalPublicacoes: 0,
    totalSistemasAcidos: 0
  })
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    try {
      setMetricas(await obterMetricasGerais({ empresaId, projetoId }))
      setErro(null)
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [empresaId, projetoId])

  const indicadores = [
    { rotulo: 'Amostras', valor: metricas.totalAmostras, legenda: projetoId ? 'Neste projeto' : 'Nos projetos da empresa', icone: Layers },
    { rotulo: 'Projetos', valor: metricas.totalProjetos, legenda: projetoId ? 'Projeto aberto' : 'Projetos da empresa', icone: FolderKanban },
    { rotulo: 'Work packages', valor: metricas.totalWorkPackages, legenda: 'Planejado × realizado', icone: ListChecks },
    { rotulo: 'Publicações', valor: metricas.totalPublicacoes, legenda: 'Próprias do LC PETRO', icone: BookOpen },
    { rotulo: 'Sistemas ácidos', valor: metricas.totalSistemasAcidos, legenda: 'Catálogo do laboratório', icone: Database },
  ]

  const atalhos = [
    {
      to: '/amostras', icone: Layers, titulo: 'Amostras e ensaios', acao: 'Abrir amostras e ensaios', mostrar: true,
      texto: 'Cadastre amostras de afloramento ou de testemunho e, dentro da ficha de cada uma, lance os ensaios das 8 análises, as curvas e os arquivos.',
    },
    {
      to: '/work-packages', icone: ListChecks, titulo: 'Work packages', acao: 'Abrir work packages', mostrar: true,
      texto: 'Mantenha os pacotes de trabalho de cada projeto com o progresso planejado e o realizado. É o que alimenta o dashboard gerencial.',
    },
    {
      to: '/importar', icone: FileSpreadsheet, titulo: 'Importar planilha', acao: 'Importar dados do Excel', mostrar: editor,
      texto: 'Carregue a planilha BDD_LCPETRO_Reatividade com conferência dos dados antes de gravar no banco.',
    },
  ].filter((a) => a.mostrar)

  return (
    <div className="space-y-6 animate-fade-in">
      <CabecalhoPagina
        titulo={`Olá, ${perfil?.nome || 'Pesquisador'}!`}
        subtitulo={
          <>
            Painel de cadastro da Memória Experimental: tudo o que é gravado aqui aparece no dashboard.
            <span className="tag tag-blue ml-2 align-middle">
              {isAdmin ? 'Administrador' : podeEditar ? 'Editor' : 'Leitor'}
            </span>
          </>
        }
      />

      {erro && <Alert tipo="erro" mensagem={erro} onClose={() => setErro(null)} />}

      {/* Indicadores */}
      <div className="cartao grid grid-cols-2 lg:grid-cols-5 overflow-hidden">
        {indicadores.map(({ rotulo, valor, legenda, icone: Icone }) => (
          <div key={rotulo} className="p-5 border-b lg:border-b-0 border-r border-[var(--color-neutral-300)] last:border-r-0">
            <div className="field flex-row! items-center justify-between">
              <span className="rotulo">{rotulo}</span>
              <Icone size={16} className="text-[var(--color-blue-400)]" />
            </div>
            <p className="numero mt-2 text-[30px] leading-none">{loading ? '—' : valor}</p>
            <p className="mt-2 text-[12px] text-[var(--color-neutral-500)]">{legenda}</p>
          </div>
        ))}
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {atalhos.map(({ to, icone: Icone, titulo, texto, acao }) => (
          <div key={to} className="cartao p-6 flex flex-col justify-between">
            <div>
              <div className="w-11 h-11 rounded-[10px] bg-[var(--color-blue-50)] text-[var(--color-blue)] flex items-center justify-center mb-4">
                <Icone size={20} />
              </div>
              <h2 className="text-[17px] font-bold text-[var(--color-neutral-900)]">{titulo}</h2>
              <p className="text-[13px] text-[var(--color-neutral-600)] mt-1.5 leading-relaxed">{texto}</p>
            </div>
            <Link to={to} className="btn btn-secondary mt-6 w-full justify-between!">
              <span>{acao}</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
