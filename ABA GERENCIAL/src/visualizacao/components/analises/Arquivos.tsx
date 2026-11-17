import { useEffect, useState } from "react";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { useConsulta } from "../../hooks/useConsulta";
import { apagarArquivo, enviarArquivo, linkArquivo, listarArquivos } from "../../servicos/analises";
import type { Arquivo } from "../../tipos/banco";
import { Aviso } from "../ui/base";
import { mensagemErro } from "../../utils/formatacao";

// Arquivos de uma análise ou da amostra: .opju, PDF, imagens de MEV/micro-CT…
// Ficam no Supabase Storage (privado). Imagens aparecem como miniaturas;
// com duas imagens (antes/depois) dá para comparar lado a lado.
export function Arquivos(p: {
  amostraId: string; pasta: string; analiseTabela?: string; analiseId?: number; podeEditar: boolean;
}) {
  const lista = useConsulta(() => listarArquivos(p.amostraId, p.analiseTabela, p.analiseId),
    [p.amostraId, p.analiseTabela, p.analiseId]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [links, setLinks] = useState<Record<number, string>>({});
  const [ampliada, setAmpliada] = useState<Arquivo | null>(null);

  const imagens = (lista.dados ?? []).filter((a) => a.tipo === "imagem");
  const outros = (lista.dados ?? []).filter((a) => a.tipo !== "imagem");

  // links temporários para as miniaturas
  useEffect(() => {
    imagens.forEach((a) => {
      if (!links[a.id]) linkArquivo(a.caminho).then((u) => setLinks((l) => ({ ...l, [a.id]: u }))).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.dados]);

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    setEnviando(true);
    try {
      for (const arquivo of Array.from(arquivos)) {
        await enviarArquivo({ arquivo, amostraId: p.amostraId, pasta: p.pasta, analiseTabela: p.analiseTabela, analiseId: p.analiseId });
      }
      lista.recarregar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  async function abrir(a: Arquivo) {
    try { window.open(await linkArquivo(a.caminho), "_blank", "noopener"); } catch (e) { setErro(mensagemErro(e)); }
  }

  async function apagar(a: Arquivo) {
    if (!confirm(`Apagar ${a.nome_original}?`)) return;
    await apagarArquivo(a);
    lista.recarregar();
  }

  return (
    <div className="flex flex-col gap-4">
      {imagens.length > 0 && (
        <div className={`grid gap-4 ${imagens.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
          {imagens.map((a) => (
            <figure key={a.id} className="m-0 flex flex-col gap-1.5">
              <button className="overflow-hidden rounded-lg border border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)]"
                onClick={() => setAmpliada(a)}>
                {links[a.id]
                  ? <img src={links[a.id]} alt={a.nome_original} className={`w-full object-cover ${imagens.length === 2 ? "h-[300px]" : "h-[160px]"}`} />
                  : <div className="h-[160px]" />}
              </button>
              <figcaption className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-neutral-700)]">
                <span className="truncate">{a.nome_original}</span>
                {p.podeEditar && <button title="Apagar" onClick={() => apagar(a)} className="text-[var(--color-neutral-400)] hover:text-[var(--color-red)]"><Trash2 size={13} /></button>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {outros.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {outros.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[13px]">
              <FileText size={14} className="text-[var(--color-blue)]" />
              <button className="font-medium text-[var(--color-blue)] hover:text-[var(--color-red)] hover:underline" onClick={() => abrir(a)}>{a.nome_original}</button>
              <span className="tag tag-neutral">{a.tipo}</span>
              <span className="text-[11px] text-[var(--color-neutral-500)]">{((a.tamanho_bytes ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
              {p.podeEditar && <button title="Apagar" onClick={() => apagar(a)} className="text-[var(--color-neutral-400)] hover:text-[var(--color-red)]"><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      )}

      {lista.dados?.length === 0 && <p className="m-0 text-[13px] text-[var(--color-neutral-600)]">Nenhum arquivo anexado.</p>}

      {p.podeEditar && (
        <label className="btn btn-secondary w-fit cursor-pointer">
          <Paperclip size={14} /> {enviando ? "Enviando…" : "Anexar arquivos"}
          <input type="file" multiple className="hidden" onChange={(e) => enviar(e.target.files)} disabled={enviando} />
        </label>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {ampliada && links[ampliada.id] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-8" onClick={() => setAmpliada(null)}>
          <button className="absolute right-6 top-6 text-white" aria-label="Fechar"><X size={24} /></button>
          <img src={links[ampliada.id]} alt={ampliada.nome_original} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
