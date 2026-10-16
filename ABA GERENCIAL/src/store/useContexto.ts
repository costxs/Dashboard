import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Contexto de trabalho: qual Empresa -> Projeto está aberto e o estado do menu.
// Fica guardado no navegador. A sessão e o perfil continuam no AuthContext (Supabase Auth).
// Base: docs/referencia/painel-cadastro/src/store/useContexto.ts
interface EstadoContexto {
  empresaId: string | null
  empresaSigla: string | null
  empresaNome: string | null
  projetoId: string | null       // null = todos os projetos da empresa
  projetoNome: string | null
  menuRecolhido: boolean

  escolherEmpresa: (e: { id: string; sigla: string; nome: string } | null) => void
  escolherProjeto: (p: { id: string; nome: string } | null) => void
  alternarMenu: () => void
  limpar: () => void
}

export const useContexto = create<EstadoContexto>()(
  persist(
    (set) => ({
      empresaId: null,
      empresaSigla: null,
      empresaNome: null,
      projetoId: null,
      projetoNome: null,
      menuRecolhido: false,

      escolherEmpresa: (e) =>
        set({
          empresaId: e?.id ?? null,
          empresaSigla: e?.sigla ?? null,
          empresaNome: e?.nome ?? null,
          projetoId: null,
          projetoNome: null,
        }),
      escolherProjeto: (p) => set({ projetoId: p?.id ?? null, projetoNome: p?.nome ?? null }),
      alternarMenu: () => set((s) => ({ menuRecolhido: !s.menuRecolhido })),
      limpar: () =>
        set({ empresaId: null, empresaSigla: null, empresaNome: null, projetoId: null, projetoNome: null }),
    }),
    { name: 'lcpetro-gerencial-contexto' },
  ),
)

/** Nome curto do contexto para o selo laranja das páginas: "Empresa · Projeto". */
export function rotuloContexto(s: Pick<EstadoContexto, 'empresaNome' | 'projetoNome'>) {
  if (!s.empresaNome) return 'Sem projeto'
  return s.projetoNome ? `${s.empresaNome} · ${s.projetoNome}` : `${s.empresaNome} · todos os projetos`
}
