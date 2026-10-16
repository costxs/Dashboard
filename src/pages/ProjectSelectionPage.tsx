import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Briefcase, ChevronRight, FolderKanban, LogOut, Search, Settings } from "lucide-react";
import { LogoEmpresa } from "../components/LogoEmpresa";
import { Aviso, Carregando } from "../components/ui/base";
import { useConsulta } from "../hooks/useConsulta";
import { listarEmpresas, listarProjetos, sair } from "../servicos/contexto";
import { useContexto } from "../store/useContexto";
import type { Empresa } from "../tipos/banco";

// Dois níveis: 1) escolher a EMPRESA  2) escolher o PROJETO (ou todos da empresa).
// As listas vêm do banco já filtradas pelo acesso de quem está logado.
export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const perfil = useContexto((s) => s.perfil);
  const escolherEmpresa = useContexto((s) => s.escolherEmpresa);
  const escolherProjeto = useContexto((s) => s.escolherProjeto);

  const empresas = useConsulta(listarEmpresas, []);
  const projetos = useConsulta(() => (empresa ? listarProjetos(empresa.id) : Promise.resolve([])), [empresa?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const q = searchQuery.toLowerCase();
  const empresasFiltradas = (empresas.dados ?? []).filter(
    (e) => e.nome.toLowerCase().includes(q) || e.sigla.toLowerCase().includes(q));
  const projetosFiltrados = (projetos.dados ?? []).filter(
    (p) => p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));

  function entrarNoProjeto(projeto: { id: string; nome: string } | null) {
    if (!empresa) return;
    escolherEmpresa({ id: empresa.id, sigla: empresa.sigla, nome: empresa.nome });
    escolherProjeto(projeto);
    navigate("/dashboard");
  }

  const primeiroNome = perfil?.nome?.split(" ")[0];

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 font-sans bg-[var(--color-bg)]">
      <style>
        {`
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-card { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .animate-item { opacity: 0; animation: slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        `}
      </style>

      <div className="w-full max-w-[720px] bg-white shadow-2xl shadow-[var(--color-blue-200)]/40 rounded-3xl overflow-hidden animate-card">
        <div className="faixa-lcp" />
        <div className="p-8 sm:p-12">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div className="relative w-full max-w-[320px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)] group-focus-within:text-[var(--color-orange)] transition-colors" size={18} />
              <input
                type="text"
                placeholder={empresa ? "Pesquisar projetos..." : "Pesquisar empresas..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[var(--color-neutral-50)] hover:bg-white border border-[var(--color-neutral-200)] rounded-full text-sm focus:outline-none focus:ring-4 focus:ring-[var(--color-orange-100)] focus:border-[var(--color-orange)] focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-1">
              {perfil?.administrador && (
                <button className="btn btn-secondary" onClick={() => navigate("/administracao")} title="Empresas, projetos e acessos">
                  <Settings size={14} /> Administração
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => sair()} title="Sair"><LogOut size={14} /></button>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[var(--color-blue-800)] tracking-tight leading-tight">
              {getGreeting()}{primeiroNome ? `, ${primeiroNome}` : ""}
            </h1>
            <p className="text-[var(--color-neutral-600)] mt-1.5 text-sm font-medium">
              {empresa ? <>Qual projeto de <strong className="text-[var(--color-red)]">{empresa.nome}</strong> quer abrir?</> : "Qual empresa quer acessar hoje?"}
            </p>
          </div>

          <div className="w-full h-px bg-gradient-to-r from-[var(--color-red-200)] via-[var(--color-orange-200)] to-[var(--color-blue-200)] mb-8" />

          {empresas.erro && <Aviso tipo="erro">{empresas.erro}</Aviso>}
          {empresas.carregando && <Carregando />}

          {/* NÍVEL 1: empresas */}
          {!empresa && empresas.dados && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {empresasFiltradas.map((e, idx) => (
                <button
                  key={e.id}
                  onClick={() => { setEmpresa(e); setSearchQuery(""); }}
                  className="animate-item flex flex-col items-center justify-center p-8 bg-white border border-[var(--color-neutral-200)] rounded-2xl hover:border-[var(--color-orange)] hover:shadow-xl hover:shadow-[var(--color-orange-100)] active:scale-[0.98] transition-all duration-300 group"
                  style={{ animationDelay: `${0.1 * (idx + 1)}s` }}
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
                  {empresas.dados.length === 0
                    ? <span>Você ainda não tem acesso a nenhum projeto. Peça ao administrador do LC PETRO.
                        {perfil?.administrador && <> Como administrador, crie a primeira empresa em <button className="underline text-[var(--color-red)]" onClick={() => navigate("/administracao")}>Administração</button>.</>}
                      </span>
                    : <span>Nenhuma empresa encontrada com "{searchQuery}"</span>}
                </div>
              )}
            </div>
          )}

          {/* NÍVEL 2: projetos da empresa */}
          {empresa && (
            <div className="flex flex-col gap-3">
              <button className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-neutral-600)] hover:text-[var(--color-red)] w-fit mb-2"
                onClick={() => { setEmpresa(null); setSearchQuery(""); }}>
                <ArrowLeft size={14} /> Trocar empresa
              </button>
              {projetos.carregando && <Carregando />}
              {projetosFiltrados.map((p, idx) => (
                <button key={p.id} onClick={() => entrarNoProjeto({ id: p.id, nome: p.nome })}
                  className="animate-item flex items-center gap-4 text-left px-5 py-4 border border-[var(--color-neutral-200)] rounded-xl hover:border-[var(--color-blue)] hover:bg-[var(--color-blue-50)] transition-all group"
                  style={{ animationDelay: `${0.06 * (idx + 1)}s` }}>
                  <FolderKanban size={20} className="text-[var(--color-orange)] shrink-0" />
                  <div className="flex-1">
                    <p className="m-0 font-semibold text-[15px] text-[var(--color-blue-800)]">{p.nome}</p>
                    <p className="m-0 text-[12px] text-[var(--color-neutral-500)]">{p.codigo}{p.descricao ? ` · ${p.descricao}` : ""}</p>
                  </div>
                  <ChevronRight size={18} className="text-[var(--color-neutral-400)] group-hover:text-[var(--color-red)]" />
                </button>
              ))}
              {projetos.dados && projetos.dados.length > 1 && (
                <button onClick={() => entrarNoProjeto(null)}
                  className="btn btn-blue w-fit mt-2">
                  Ver todos os projetos de {empresa.sigla}
                </button>
              )}
              {projetos.dados?.length === 0 && (
                <p className="text-sm text-[var(--color-neutral-500)]">Nenhum projeto ativo nesta empresa.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
