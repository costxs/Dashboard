import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Database,
  LayoutDashboard,
  Microscope,
  Repeat,
  Settings,
  ChevronRight,
  ChevronLeft
} from "lucide-react";
import { useSampleStore } from "../../store/useSampleStore";

export function Sidebar() {
  const navigate = useNavigate();
  const activeProject = useSampleStore((s) => s.activeProject);
  const isSidebarCollapsed = useSampleStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useSampleStore((s) => s.toggleSidebar);

  const navItems = [
    { to: "/", label: "Dashboard Gerencial", icon: LayoutDashboard, end: true },
    { to: "/amostras", label: "Banco de Amostras", icon: Database, end: false },
    { to: "/literatura", label: "Banco da Literatura", icon: BookOpen, end: false },
  ];

  return (
    <aside className={`flex h-full shrink-0 flex-col bg-white border-r border-[var(--color-neutral-300)] transition-all duration-300 ${isSidebarCollapsed ? "w-[72px]" : "w-[248px]"}`}>
      <div className={`p-5 border-b border-[var(--color-neutral-300)] flex items-center justify-center relative cursor-pointer group`} onClick={toggleSidebar} title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}>
        {isSidebarCollapsed ? (
          <img
            src="/lab-logo-2.png"
            alt="LC PETRO"
            className="w-[32px] h-auto object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.insertAdjacentHTML('afterbegin', '<div class="font-heading font-black text-lg text-slate-800">LC</div>');
            }}
          />
        ) : (
          <div className="flex flex-col items-start w-full">
            <img
              src="/lab-logo-1.png"
              alt="LC PETRO"
              className="w-[180px] h-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement?.insertAdjacentHTML('afterbegin', '<div class="font-heading font-black text-xl text-slate-800 tracking-tight">LC PETRO</div>');
              }}
            />
            <p className="mt-2.5 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">
              Memória Experimental
            </p>
          </div>
        )}
        <div className={`absolute right-[-12px] top-1/2 -translate-y-1/2 bg-white border border-[var(--color-neutral-300)] rounded-full p-0.5 text-[var(--color-neutral-500)] opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm ${isSidebarCollapsed ? 'opacity-100 right-[-14px]' : ''}`}>
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col p-0">
        {!isSidebarCollapsed && (
          <p className="m-0 px-5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-500)]">
            Navegação
          </p>
        )}
        <div className={isSidebarCollapsed ? "pt-5" : ""}>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={isSidebarCollapsed ? label : undefined}
              className={({ isActive }) =>
                `lcp-nav ${isActive ? "active" : ""} ${isSidebarCollapsed ? "justify-center px-0" : ""}`
              }
              style={({ isActive }) => (isActive ? {
                borderLeftColor: 'var(--color-accent)',
                background: 'var(--color-accent-100)',
                color: 'var(--color-accent-800)'
              } : {})}
            >
              <Icon size={17} className="shrink-0" />
              {!isSidebarCollapsed && label}
            </NavLink>
          ))}
        </div>

        {!isSidebarCollapsed && (
          <p className="m-0 px-5 pt-6 pb-2 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-500)]">
            Laboratório
          </p>
        )}
        <div className={`flex items-center text-sm text-[var(--color-neutral-400)] cursor-not-allowed ${isSidebarCollapsed ? 'justify-center py-4' : 'gap-3 px-5 py-2.5'}`} title={isSidebarCollapsed ? "Equipamentos" : undefined}>
          <Microscope size={17} />
          {!isSidebarCollapsed && "Equipamentos"}
        </div>
        <div className={`flex items-center text-sm text-[var(--color-neutral-400)] cursor-not-allowed ${isSidebarCollapsed ? 'justify-center py-4' : 'gap-3 px-5 py-2.5'}`} title={isSidebarCollapsed ? "Configurações" : undefined}>
          <Settings size={17} />
          {!isSidebarCollapsed && "Configurações"}
        </div>
      </nav>

      <div className={`flex flex-col items-center border-t border-[var(--color-neutral-300)] px-5 pt-4 pb-5 ${isSidebarCollapsed ? 'px-2' : ''}`}>
        {activeProject === "TotalEnergies" ? (
          <img
            src="/total-energies-256.png"
            alt="TotalEnergies"
            className={`${isSidebarCollapsed ? 'w-[40px] h-[40px]' : 'w-[120px] h-[120px]'} max-w-full object-contain object-center transition-all`}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.insertAdjacentHTML('afterbegin', `<div class="${isSidebarCollapsed ? 'h-[40px] text-xs' : 'h-[120px]'} flex items-center font-heading font-bold text-slate-400">TE</div>`);
            }}
          />
        ) : (
          <img
            src="/logo-petrobras-1536.png"
            alt="Petrobras"
            className={`${isSidebarCollapsed ? 'w-[40px] h-[40px]' : 'w-[120px] h-[120px]'} max-w-full object-contain object-center transition-all`}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.insertAdjacentHTML('afterbegin', `<div class="${isSidebarCollapsed ? 'h-[40px] text-xs' : 'h-[120px]'} flex items-center font-heading font-bold text-slate-400">PB</div>`);
            }}
          />
        )}
        
        {!isSidebarCollapsed ? (
          <div
            onClick={() => navigate("/projetos")}
            className="flex items-center justify-center gap-1.5 mt-3 text-[11px] font-semibold text-[var(--color-neutral-700)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <Repeat size={13} />
            Alternar projeto
          </div>
        ) : (
          <div
            onClick={() => navigate("/projetos")}
            title="Alternar projeto"
            className="flex items-center justify-center mt-3 text-[var(--color-neutral-700)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
          >
            <Repeat size={15} />
          </div>
        )}
      </div>
    </aside>
  );
}
