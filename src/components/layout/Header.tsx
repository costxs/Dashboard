import { LogOut, Search, ArrowLeft, X, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSampleStore } from "../../store/useSampleStore";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = useSampleStore((s) => s.filters.searchQuery);
  const setSearchQuery = useSampleStore((s) => s.setSearchQuery);
  const toggleSidebar = useSampleStore((s) => s.toggleSidebar);
  const isSidebarCollapsed = useSampleStore((s) => s.isSidebarCollapsed);

  function handleSearch(value: string) {
    setSearchQuery(value);
    if (value.trim().length > 0 && location.pathname !== "/amostras") {
      navigate("/amostras");
    }
  }

  function clearSearch() {
    setSearchQuery("");
  }

  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-6 bg-white border-b border-[var(--color-neutral-300)] px-7">
      <div className="flex items-center gap-4 w-full max-w-[560px]">
        <button
          onClick={toggleSidebar}
          className={`flex items-center justify-center w-[34px] h-[34px] rounded-[10px] text-[var(--color-neutral-600)] bg-white border border-[var(--color-neutral-300)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-900)] transition-colors shrink-0 ${isSidebarCollapsed ? 'bg-[var(--color-neutral-200)]' : ''}`}
          title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Menu size={16} />
        </button>
        {location.pathname !== "/" && (
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] text-[var(--color-neutral-600)] bg-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-200)] hover:text-[var(--color-neutral-900)] transition-colors shrink-0"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="relative w-full">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-500)]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar amostra, litotipo, poço ou tag..."
            className="input !pl-10 pr-10 bg-[var(--color-neutral-50)] focus:bg-white"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 text-[var(--color-neutral-400)] hover:text-[var(--color-neutral-700)] rounded-full hover:bg-[var(--color-neutral-200)] transition-colors"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-3 border-l border-[var(--color-neutral-300)] pl-5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--color-accent-100)] font-heading font-extrabold text-[12px] text-[var(--color-accent-800)]">
            DL
          </div>
          <div className="leading-[1.3]">
            <p className="m-0 text-[13px] font-semibold">Pesquisador</p>
            <p className="m-0 text-[11px] text-[var(--color-neutral-600)]">LC PETRO Lab</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="ml-1 flex h-8 w-8 items-center justify-center text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-200)] hover:text-[var(--color-neutral-800)] rounded-md transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
