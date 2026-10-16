import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Perfil } from "../tipos/banco";

// Estado global do app: quem está logado, qual Empresa -> Projeto está aberto,
// menu recolhido e a busca do cabeçalho. Substitui o antigo useSampleStore.
interface EstadoContexto {
  sessao: Session | null;
  sessaoCarregada: boolean;
  perfil: Perfil | null;

  empresaId: string | null;
  empresaSigla: string | null;
  empresaNome: string | null;
  projetoId: string | null;       // null = todos os projetos da empresa
  projetoNome: string | null;

  busca: string;
  menuRecolhido: boolean;

  definirSessao: (s: Session | null) => void;
  definirPerfil: (p: Perfil | null) => void;
  escolherEmpresa: (e: { id: string; sigla: string; nome: string } | null) => void;
  escolherProjeto: (p: { id: string; nome: string } | null) => void;
  definirBusca: (b: string) => void;
  alternarMenu: () => void;
  limpar: () => void;
}

export const useContexto = create<EstadoContexto>()(
  persist(
    (set) => ({
      sessao: null,
      sessaoCarregada: false,
      perfil: null,
      empresaId: null,
      empresaSigla: null,
      empresaNome: null,
      projetoId: null,
      projetoNome: null,
      busca: "",
      menuRecolhido: false,

      definirSessao: (sessao) => set({ sessao, sessaoCarregada: true }),
      definirPerfil: (perfil) => set({ perfil }),
      escolherEmpresa: (e) =>
        set({
          empresaId: e?.id ?? null,
          empresaSigla: e?.sigla ?? null,
          empresaNome: e?.nome ?? null,
          projetoId: null,
          projetoNome: null,
        }),
      escolherProjeto: (p) => set({ projetoId: p?.id ?? null, projetoNome: p?.nome ?? null }),
      definirBusca: (busca) => set({ busca }),
      alternarMenu: () => set((s) => ({ menuRecolhido: !s.menuRecolhido })),
      limpar: () =>
        set({
          sessao: null, perfil: null, empresaId: null, empresaSigla: null, empresaNome: null,
          projetoId: null, projetoNome: null, busca: "",
        }),
    }),
    {
      name: "lcpetro-contexto",
      // no navegador fica só a escolha de empresa/projeto e o menu; a sessão é do Supabase
      partialize: (s) => ({
        empresaId: s.empresaId, empresaSigla: s.empresaSigla, empresaNome: s.empresaNome,
        projetoId: s.projetoId, projetoNome: s.projetoNome, menuRecolhido: s.menuRecolhido,
      }),
    },
  ),
);

/** Chamar uma vez no início do app (App.tsx). Devolve a função de limpeza. */
export function iniciarAutenticacao() {
  supabase.auth.getSession().then(({ data }) => useContexto.getState().definirSessao(data.session));
  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
    useContexto.getState().definirSessao(sessao);
    if (!sessao) useContexto.getState().limpar();
  });
  return () => data.subscription.unsubscribe();
}

/** Nome curto do contexto para os selos das páginas. */
export function rotuloContexto(s: Pick<EstadoContexto, "empresaNome" | "projetoNome">) {
  if (!s.empresaNome) return "Sem projeto";
  return s.projetoNome ? `${s.empresaNome} · ${s.projetoNome}` : `${s.empresaNome} · todos os projetos`;
}
