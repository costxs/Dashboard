import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  Microscope,
  Repeat,
  Settings,
} from "lucide-react";
import { LogoEmpresa } from "../LogoEmpresa";
import { useContexto } from "../../store/useContexto";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const recolhido = useContexto((s) => s.menuRecolhido);
  const alternarMenu = useContexto((s) => s.alternarMenu);
  const empresaSigla = useContexto((s) => s.empresaSigla);
  const empresaNome = useContexto((s) => s.empresaNome);
  const projetoNome = useContexto((s) => s.projetoNome);
  const admin = useContexto((s) => s.perfil?.administrador);

  const navItems = [
    { to: "/dashboard", label: "Dashboard Gerencial", icon: LayoutDashboard },
    { to: "/amostras", label: "Banco de Amostras", icon: Database },
  ];
  const abaLiteratura = new URLSearchParams(location.search).get("aba") ?? "geral";
  const naLiteratura = location.pathname.startsWith("/literatura");

  const classeItem = (ativo: boolean) => `lcp-nav ${ativo ? "active" : ""} ${recolhido ? "justify-center px-0" : ""}`;

  return (
    <aside className={`flex h-full shrink-0 flex-col bg-[var(--color-blue-900)] transition-all duration-300 ${recolhido ? "w-[72px]" : "w-[248px]"}`}>
      {/* logos sobre fundo branco */}
      <div className="bg-white p-5 border-b-4 border-[var(--color-orange)] flex items-center justify-center relative cursor-pointer group"
        onClick={alternarMenu} title={recolhido ? "Expandir menu" : "Recolher menu"}>
        {recolhido ? (
          <img src="/lab-logo-2.png" alt="LC PETRO" className="w-[32px] h-auto object-contain" />
        ) : (
          <div className="flex flex-col items-start w-full">
            <img src="/lab-logo-1.png" alt="LC PETRO" className="w-[180px] h-auto object-contain" />
            <p className="mt-2.5 text-[10px] tracking-[0.07em] uppercase font-semibold text-[var(--color-red)]">
              Memória Experimental
            </p>
          </div>
        )}
        <div className={`absolute right-[-12px] top-1/2 -translate-y-1/2 bg-white border border-[var(--color-neutral-300)] rounded-full p-0.5 text-[var(--color-neutral-500)] opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm ${recolhido ? "opacity-100 right-[-14px]" : ""}`}>
          {recolhido ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {!recolhido && <Secao texto="Navegação" />}
        <div className={recolhido ? "pt-5" : ""}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} title={recolhido ? label : undefined}
              className={({ isActive }) => classeItem(isActive)}>
              <Icon size={17} className="shrink-0" />
              {!recolhido && label}
            </NavLink>
          ))}

          <NavLink to="/literatura?aba=geral" title={recolhido ? "Literatura" : undefined}
            className={() => classeItem(naLiteratura)}>
            <BookOpen size={17} className="shrink-0" />
            {!recolhido && "Literatura"}
          </NavLink>
          {!recolhido && naLiteratura && (
            <div className="flex flex-col pb-1">
              {[["geral", "Geral"], ["propria", "Própria (LC PETRO)"]].map(([aba, rotulo]) => (
                <NavLink key={aba} to={`/literatura?aba=${aba}`}
                  className={`pl-[49px] pr-5 py-1.5 text-[13px] ${abaLiteratura === aba ? "text-[var(--color-orange-400)] font-semibold" : "text-[var(--color-blue-200)] hover:text-white"}`}>
                  {rotulo}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {!recolhido && <Secao texto="Laboratório" />}
        {admin && (
          <NavLink to="/administracao" title={recolhido ? "Administração" : undefined}
            className={({ isActive }) => classeItem(isActive)}>
            <Settings size={17} className="shrink-0" />
            {!recolhido && "Administração"}
          </NavLink>
        )}
        <div className={`flex items-center text-sm text-[var(--color-blue-400)] cursor-not-allowed ${recolhido ? "justify-center py-4" : "gap-3 px-5 py-2.5"}`}
          title="Em breve">
          <Microscope size={17} />
          {!recolhido && "Equipamentos"}
        </div>
      </nav>

      <div className={`flex flex-col items-center border-t border-white/10 bg-white/5 pt-4 pb-5 ${recolhido ? "px-2" : "px-5"}`}>
        {empresaSigla && (
          <div className="rounded-xl bg-white p-2">
            <LogoEmpresa sigla={empresaSigla} nome={empresaNome} tamanho={recolhido ? 36 : 96} />
          </div>
        )}
        {!recolhido && (
          <p className="mt-2 text-center text-[12px] font-semibold text-white leading-tight">
            {projetoNome ?? (empresaNome ? "Todos os projetos" : "")}
          </p>
        )}
        <button
          onClick={() => navigate("/projetos")}
          title="Alternar projeto"
          className={`flex items-center justify-center gap-1.5 mt-3 text-[11px] font-semibold text-[var(--color-orange-400)] hover:text-white transition-colors cursor-pointer`}
        >
          <Repeat size={recolhido ? 15 : 13} />
          {!recolhido && "Alternar projeto"}
        </button>
      </div>
    </aside>
  );
}

function Secao({ texto }: { texto: string }) {
  return (
    <p className="m-0 px-5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-blue-400)]">
      {texto}
    </p>
  );
}
