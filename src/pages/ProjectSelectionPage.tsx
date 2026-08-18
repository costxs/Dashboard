import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, ChevronRight, Briefcase } from "lucide-react";
import { useSampleStore } from "../store/useSampleStore";
import type { ProjectPartner } from "../types";

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const username = location.state?.username || "Visitante";

  const setActiveProject = useSampleStore((s) => s.setActiveProject);

  const projects: { id: string; name: ProjectPartner; logo: string }[] = [
    {
      id: "proj-1",
      name: "TotalEnergies",
      logo: "/total-energies-256.png",
    },
    {
      id: "proj-2",
      name: "Petrobras",
      logo: "/logo-petrobras-1536.png",
    }
  ];

  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelectProject = (projectPartner: ProjectPartner) => {
    setActiveProject(projectPartner);
    navigate("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f0f0] p-6 font-sans">
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
      
      <div className="w-full max-w-[650px] border border-[#e2e8f0] p-8 sm:p-12 bg-white shadow-2xl shadow-slate-200/50 rounded-3xl animate-card">
        
        {/* Modern Search Bar */}
        <div className="flex justify-center mb-10">
          <div className="relative w-full max-w-[320px] group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Pesquisar projetos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-full text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-400 focus:bg-white transition-all shadow-sm"
            />
          </div>
        </div>

        {/* Greeting Header */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">Bom dia, {username}</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">Quais projetos quer acessar hoje?</p>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent sm:via-slate-200 sm:from-slate-200 sm:to-transparent mb-10" />

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {filteredProjects.map((project, idx) => (
            <button
              key={project.id}
              onClick={() => handleSelectProject(project.name)}
              className="animate-item flex flex-col items-center justify-center p-8 bg-white border border-slate-100 rounded-2xl hover:border-amber-400 hover:shadow-xl hover:shadow-amber-100/50 active:scale-[0.98] transition-all duration-300 group"
              style={{ animationDelay: `${0.1 * (idx + 1)}s` }}
            >
              <div className="w-[240px] h-[140px] flex items-center justify-center transition-transform duration-500 group-hover:scale-[1.10] group-hover:-translate-y-1">
                <img src={project.logo} alt={project.name} className="max-w-full max-h-full object-contain transition-all duration-500" />
              </div>

              <div className="mt-6 flex items-center text-xs font-bold text-amber-500 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-3 group-hover:translate-y-0">
                <span>Acessar Projeto</span>
                <ChevronRight size={16} className="ml-1" strokeWidth={2.5} />
              </div>
            </button>
          ))}
          
          {filteredProjects.length === 0 && (
            <div className="col-span-1 sm:col-span-2 text-center py-10 text-slate-400 text-sm flex flex-col items-center gap-3">
              <Briefcase size={32} className="text-slate-300" />
              <span>Nenhum projeto encontrado com "{searchQuery}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
