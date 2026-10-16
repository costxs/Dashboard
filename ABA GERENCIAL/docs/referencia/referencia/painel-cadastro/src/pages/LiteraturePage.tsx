import { useState } from "react";
import { ExternalLink, FileText, Lock, Pencil, Plus } from "lucide-react";
import { Select } from "../components/ui/Select";
import { Aviso, CabecalhoPagina, Carregando } from "../components/ui/base";
import { ANALISES } from "../config/analises";
import { useConsulta } from "../hooks/useConsulta";
import { linkArquivo } from "../servicos/analises";
import { souEditor } from "../servicos/contexto";
import { arquivosDaPublicacao, listarPublicacoes } from "../servicos/literatura";
import type { Publicacao } from "../tipos/banco";
import { FormularioPublicacao } from "./literatura/FormularioPublicacao";

const TODOS = "Todos";
const EIXOS: Record<string, string> = Object.fromEntries(ANALISES.map((a) => [a.chave, `${a.numero}. ${a.titulo}`]));

// Cadastro das publicações PRÓPRIAS do LC PETRO (artigos, TCCs, relatórios).
// A literatura geral entra pela planilha de reatividade (importador em Dashboard-Back).
export function LiteraturePage() {
  return (
    <div>
      <CabecalhoPagina titulo="Publicações do LC PETRO"
        subtitulo="Artigos, dissertações, TCCs e relatórios. O que for cadastrado aqui aparece na aba Literatura › Própria do dashboard." />
      <Propria />
    </div>
  );
}

// ---------------------------------------------------------------------------
function Propria() {
  const [eixo, setEixo] = useState(TODOS);
  const [ordem, setOrdem] = useState("Mais recentes");
  const [editando, setEditando] = useState<Publicacao | "nova" | null>(null);
  const pubs = useConsulta(() => listarPublicacoes({ categoria: "propria", eixo: eixo !== TODOS ? eixo : undefined }), [eixo]);
  const editor = useConsulta(souEditor, []);

  if (editando) {
    return (
      <div className="px-7 pt-6 pb-10">
        <FormularioPublicacao publicacao={editando === "nova" ? undefined : editando}
          aoCancelar={() => setEditando(null)} aoSalvar={() => { setEditando(null); pubs.recarregar(); }} />
      </div>
    );
  }

  const lista = [...(pubs.dados ?? [])].sort((a, b) =>
    ordem === "Mais recentes" ? (b.ano_ordem ?? 0) - (a.ano_ordem ?? 0) : (a.ano_ordem ?? 0) - (b.ano_ordem ?? 0));

  return (
    <>
      <div className="flex flex-wrap gap-5 items-end bg-white border-b border-[var(--color-neutral-300)] px-7 py-4">
        <Select className="min-w-[240px]" label="Filtrar por eixo" value={eixo} onChange={setEixo}
          options={[TODOS, ...Object.keys(EIXOS)]} rotulos={EIXOS} />
        <Select className="min-w-[200px]" label="Ordenação" value={ordem} onChange={setOrdem} options={["Mais recentes", "Mais antigas"]} />
        {editor.dados && <button className="btn btn-primary ml-auto" onClick={() => setEditando("nova")}><Plus size={14} /> Nova publicação</button>}
      </div>
      <div className="px-7 pt-6 pb-10">
        {pubs.erro && <Aviso tipo="erro">{pubs.erro}</Aviso>}
        <ListaPublicacoes lista={pubs.dados ? lista : null} aoEditar={editor.dados ? setEditando : undefined} />
      </div>
    </>
  );
}

function ListaPublicacoes({ lista, aoEditar }: { lista: Publicacao[] | null; aoEditar?: (p: Publicacao) => void }) {
  if (!lista) return <Carregando />;
  if (!lista.length) {
    return (
      <div className="border border-dashed border-[var(--color-blue-200)] rounded-[16px] px-8 py-11 text-center bg-white">
        <p className="m-0 font-heading font-bold text-[17px] text-[var(--color-blue-800)]">Nenhuma publicação encontrada.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {lista.map((p) => <CartaoPublicacao key={p.id_referencia} p={p} aoEditar={aoEditar} />)}
    </div>
  );
}

function CartaoPublicacao({ p, aoEditar }: { p: Publicacao; aoEditar?: (p: Publicacao) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  async function baixar() {
    try {
      const arqs = await arquivosDaPublicacao(p.id_referencia);
      if (!arqs.length) { setErro("Nenhum PDF anexado a esta publicação."); return; }
      window.open(await linkArquivo(arqs[0].caminho), "_blank", "noopener");
    } catch (e) { setErro(String(e)); }
  }
  return (
    <div className="bg-white border border-[var(--color-neutral-300)] border-l-4 border-l-[var(--color-blue)] rounded-[14px] p-6 hover:shadow-md transition-all">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex-1 min-w-[280px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-extrabold text-[12px] text-[var(--color-red)] uppercase tracking-[0.06em]">{p.id_referencia}</span>
            <span className="text-[var(--color-neutral-300)]">•</span>
            <span className="text-[12px] font-bold text-[var(--color-neutral-600)]">{p.ano ?? "s/d"}</span>
            {p.tipo && <span className="tag tag-blue">{p.tipo}</span>}
            {p.projeto_id && <span className="tag tag-orange flex items-center gap-1"><Lock size={10} /> restrita ao projeto</span>}
          </div>
          <h3 className="mt-2 text-[17px] font-bold text-[var(--color-blue-800)] leading-[1.3]">{p.titulo ?? p.autor}</h3>
          {p.titulo && <p className="mt-1.5 text-[13px] font-medium text-[var(--color-neutral-700)]">{p.autor}</p>}
          {p.periodico && <p className="mt-1 text-[12px] italic text-[var(--color-neutral-500)]">{p.periodico}</p>}
          {p.resumo && <p className="mt-3 text-[13px] text-[var(--color-neutral-700)] max-w-[80ch]">{p.resumo}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.eixos?.map((e) => <span key={e} className="tag tag-orange">{EIXOS[e] ?? e}</span>)}
            {p.palavras_chave?.map((k) => <span key={k} className="tag tag-neutral">#{k}</span>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[var(--color-neutral-600)]">
            {p.n_dados_rda > 0 && <span><strong className="text-[var(--color-blue)]">{p.n_dados_rda}</strong> medidas de taxa de reação</span>}
            {p.n_amostras > 0 && <span><strong className="text-[var(--color-blue)]">{p.n_amostras}</strong> amostra(s) do LC PETRO</span>}
          </div>
          {erro && <div className="mt-3"><Aviso tipo="info">{erro}</Aviso></div>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 min-w-[150px]">
          <button type="button" className="btn btn-primary w-full" onClick={baixar}><FileText size={15} /> Abrir PDF</button>
          {aoEditar && <button type="button" className="btn btn-secondary w-full" onClick={() => aoEditar(p)}><Pencil size={14} /> Editar</button>}
          {p.doi && (
            <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-end gap-1.5 mt-1 text-[11px] font-medium text-[var(--color-neutral-500)] hover:text-[var(--color-red)]">
              DOI: {p.doi} <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
