// =============================================================================
// Ponte entre o aplicativo "Diagrama Ternário LCPETRO" (página HTML em public/ternario/) e o Supabase.
//
// O aplicativo já sabe falar com uma API REST própria (/api/workspace, /api/projects, /api/diagrams…).
// Em vez de subir outro servidor, o dashboard entrega à página (que roda num <iframe> da MESMA origem) uma
// função `window.__lcpTernario(metodo, caminho, corpo)` que responde exatamente como aquela API, mas lendo e
// gravando nas tabelas ternario_projetos / ternario_diagramas com o login de quem está usando o dashboard.
// Quem pode o quê é decidido pelo banco (módulo 'ternario': editor grava, leitor só vê).
//
// Uso no dashboard (página /ternario):
//     window.__lcpTernario = criarApiTernario(supabase)
//     <iframe src="/ternario/index.html" …/>
// =============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiTernario = (metodo: string, caminho: string, corpo?: Record<string, unknown>) => Promise<unknown>;

interface ProjetoBanco { id: number; nome: string; posicao: number; atualizado_em: string }
interface DiagramaBanco { id: number; projeto_id: number; nome: string; posicao: number; dados: Record<string, unknown>; atualizado_em: string }

/** Erro com `status` HTTP, como o aplicativo espera (ele trata 404 recriando o item). */
export class ErroApi extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}

function traduz(e: { code?: string; message: string }, onde: string): ErroApi {
  if (e.code === "42501") return new ErroApi(403, `${onde}: sem permissão (peça ao administrador acesso de editor ao diagrama ternário)`);
  if (e.code === "23503") return new ErroApi(404, `${onde}: projeto não encontrado`);
  if (e.code === "PGRST116") return new ErroApi(404, `${onde}: não encontrado`);
  return new ErroApi(500, `${onde}: ${e.message}`);
}

// ids sempre como número (o aplicativo compara com +id)
const projetoSaida = (p: ProjetoBanco) => ({ id: Number(p.id), name: p.nome, position: p.posicao, updated_at: p.atualizado_em });
const diagramaSaida = (d: DiagramaBanco) => ({
  id: Number(d.id), project_id: Number(d.projeto_id), name: d.nome, position: d.posicao, data: d.dados ?? {}, updated_at: d.atualizado_em,
});
const ordena = <T extends { posicao: number; id: number }>(a: T, b: T) => a.posicao - b.posicao || Number(a.id) - Number(b.id);

export function criarApiTernario(sb: SupabaseClient): ApiTernario {
  async function lerTudo<T>(tabela: string, colunas: string): Promise<T[]> {
    const saida: T[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from(tabela).select(colunas).range(de, de + 999);
      if (error) throw traduz(error, tabela);
      saida.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return saida;
    }
  }

  async function workspace() {
    const ps = (await lerTudo<ProjetoBanco>("ternario_projetos", "id,nome,posicao,atualizado_em")).sort(ordena);
    const ds = (await lerTudo<DiagramaBanco>("ternario_diagramas", "id,projeto_id,nome,posicao,dados,atualizado_em")).sort(ordena);
    const carimbo = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
    // o aplicativo compara este carimbo a cada 15 s para saber se alguém mudou algo: ele muda com qualquer
    // inclusão, alteração ou exclusão (resumo de todos os ids + datas)
    let h = 5381;
    for (const x of [...ps.map((p) => `p${p.id}@${carimbo(p.atualizado_em)}`), ...ds.map((d) => `d${d.id}@${carimbo(d.atualizado_em)}`)].join("|"))
      h = ((h * 33) ^ x.charCodeAt(0)) >>> 0;
    const ultima = [...ps, ...ds].map((x) => carimbo(x.atualizado_em)).sort().pop();
    return {
      projects: ps.map((p) => ({ ...projetoSaida(p), diagrams: ds.filter((d) => Number(d.projeto_id) === Number(p.id)).map(diagramaSaida) })),
      updated_at: ultima ? `${ultima}#${h.toString(36)}` : null,
    };
  }

  async function umaLinha<T>(q: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>, onde: string): Promise<T> {
    const { data, error } = await q;
    if (error) throw traduz(error, onde);
    const linhas = (Array.isArray(data) ? data : data ? [data] : []) as T[];
    if (!linhas.length) throw new ErroApi(404, `${onde}: não encontrado`);   // não existe ou a regra escondeu
    return linhas[0];
  }

  return async function api(metodo, caminho, corpo = {}) {
    const m = metodo.toUpperCase();
    const partes = caminho.replace(/^\/+|\/+$/g, "").split("/");
    const num = (s: string | undefined) => { const n = Number(s); if (!Number.isInteger(n)) throw new ErroApi(404, `id inválido: ${s}`); return n; };
    const nome = corpo.name as string | undefined, posicao = corpo.position as number | undefined;

    if (m === "GET" && caminho === "/health") {
      const { data, error } = await sb.rpc("pode_editar_modulo", { p_modulo: "ternario" });
      if (error) throw traduz(error, "acesso");
      const ver = await sb.rpc("pode_ver_modulo", { p_modulo: "ternario" });
      if (!ver.data) throw new ErroApi(403, "sem acesso ao diagrama ternário: peça ao administrador");
      return { ok: true, db: "supabase", podeEditar: data === true };
    }
    if (m === "GET" && caminho === "/workspace") return workspace();

    if (partes[0] === "projects") {
      if (m === "POST" && partes.length === 1) {
        const p = await umaLinha<ProjetoBanco>(sb.from("ternario_projetos").insert({ nome: nome ?? "Projeto", posicao: posicao ?? 0 })
          .select("id,nome,posicao,atualizado_em"), "projeto");
        return { ...projetoSaida(p), diagrams: [] };
      }
      const pid = num(partes[1]);
      if (m === "PATCH" && partes.length === 2) {
        const mud: Record<string, unknown> = {};
        if (nome !== undefined) mud.nome = nome;
        if (posicao !== undefined) mud.posicao = posicao;
        if (!Object.keys(mud).length) mud.posicao = posicao ?? 0;
        return projetoSaida(await umaLinha<ProjetoBanco>(sb.from("ternario_projetos").update(mud).eq("id", pid)
          .select("id,nome,posicao,atualizado_em"), "projeto"));
      }
      if (m === "DELETE" && partes.length === 2) {
        const { error } = await sb.from("ternario_projetos").delete().eq("id", pid);
        if (error) throw traduz(error, "projeto");
        return null;
      }
      if (m === "POST" && partes[2] === "diagrams") {
        return diagramaSaida(await umaLinha<DiagramaBanco>(sb.from("ternario_diagramas").insert({
          projeto_id: pid, nome: nome ?? "Diagrama", posicao: posicao ?? 0, dados: (corpo.data as object) ?? {},
        }).select("id,projeto_id,nome,posicao,dados,atualizado_em"), "diagrama"));
      }
    }

    if (partes[0] === "diagrams" && partes.length === 2) {
      const did = num(partes[1]);
      const cols = "id,projeto_id,nome,posicao,dados,atualizado_em";
      if (m === "GET") return diagramaSaida(await umaLinha<DiagramaBanco>(sb.from("ternario_diagramas").select(cols).eq("id", did), "diagrama"));
      if (m === "PUT") {
        const mud: Record<string, unknown> = {};
        if (nome !== undefined) mud.nome = nome;
        if (corpo.data !== undefined) mud.dados = corpo.data;
        if (corpo.project_id !== undefined) mud.projeto_id = corpo.project_id;
        if (posicao !== undefined) mud.posicao = posicao;
        return diagramaSaida(await umaLinha<DiagramaBanco>(sb.from("ternario_diagramas").update(mud).eq("id", did).select(cols), "diagrama"));
      }
      if (m === "DELETE") {
        const { error } = await sb.from("ternario_diagramas").delete().eq("id", did);
        if (error) throw traduz(error, "diagrama");
        return null;
      }
    }
    throw new ErroApi(404, `rota não existe: ${m} ${caminho}`);
  };
}
