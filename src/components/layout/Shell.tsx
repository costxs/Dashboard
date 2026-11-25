import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useContexto } from "../../store/useContexto";

// No celular (< lg) o menu vira uma gaveta por cima da página; no computador fica fixo ao lado.
export function Shell() {
  const aberto = useContexto((s) => s.menuMobileAberto);
  const abrir = useContexto((s) => s.abrirMenuMobile);
  const { pathname, search } = useLocation();

  // fecha a gaveta ao trocar de página
  useEffect(() => abrir(false), [pathname, search, abrir]);

  // Esc fecha a gaveta
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") abrir(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, abrir]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[var(--color-bg)]">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* gaveta do celular */}
      <div
        className={`fixed inset-0 z-40 bg-[rgba(10,26,56,0.55)] transition-opacity lg:hidden ${aberto ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => abrir(false)}
        aria-hidden
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 flex shadow-2xl transition-transform duration-300 lg:hidden ${aberto ? "translate-x-0" : "-translate-x-full"}`}
        role="dialog"
        aria-modal={aberto}
        aria-label="Menu"
      >
        <Sidebar mobile />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
