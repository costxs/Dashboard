import { useEffect, useState } from "react";
import { Camera, Download, ImageOff, Maximize2, ScanLine, X } from "lucide-react";
import { linkArquivo } from "../../servicos/analises";
import type { Arquivo } from "../../tipos/banco";
import { Cartao } from "../ui/base";

// Fotos da amostra e imagens de micro-CT cadastradas no painel gerencial (somente leitura).
const GRUPOS = [
  { tipo: "imagem_microct", titulo: "Imagens de micro-CT", rotulo: "Micro-CT", icone: <ScanLine size={16} /> },
  { tipo: "foto_amostra", titulo: "Fotos da amostra", rotulo: "Foto", icone: <Camera size={16} /> },
];

/** o navegador não mostra TIFF: fica só o download */
const mostravel = (nome: string) => !/\.tiff?$/i.test(nome);
const tamanho = (b: number | null) =>
  b == null ? "" : ` · ${(b / 1024 / 1024).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;

export function ImagensDaAmostra({ imagens, codigo }: { imagens: Arquivo[]; codigo: string }) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [ampliada, setAmpliada] = useState<Arquivo | null>(null);

  // links temporários: o bucket é privado e o banco confere quem pode ver a amostra
  useEffect(() => {
    let vivo = true;
    imagens.forEach((a) => {
      linkArquivo(a.caminho)
        .then((u) => { if (vivo) setLinks((l) => ({ ...l, [a.caminho]: u })); })
        .catch(() => undefined);
    });
    return () => { vivo = false; };
  }, [imagens]);

  useEffect(() => {
    if (!ampliada) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliada(null); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ampliada]);

  if (imagens.length === 0) return null;

  return (
    <Cartao titulo="Imagens da amostra e do micro-CT" subtitulo={`${codigo} · ${imagens.length} imagem(ns)`} icone={<ScanLine size={18} />}>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {GRUPOS.map((g) => {
          const doGrupo = imagens.filter((a) => a.tipo === g.tipo).sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
          if (doGrupo.length === 0) return null;
          return (
            <section key={g.tipo}>
              <h3 className="m-0 mb-3 flex items-center gap-2 text-[15px] font-bold text-[var(--color-blue-800)]">
                <span className="text-[var(--color-blue)]">{g.icone}</span>{g.titulo}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {doGrupo.map((a) => {
                  const url = links[a.caminho];
                  const ver = mostravel(a.nome_original);
                  return (
                    <figure key={a.id} className="m-0 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={!url || !ver}
                        onClick={() => setAmpliada(a)}
                        title={ver ? "Ampliar" : undefined}
                        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[12px] border border-[var(--color-neutral-300)] bg-white p-0 enabled:cursor-zoom-in"
                      >
                        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[var(--color-blue-800)] shadow-sm">
                          {g.rotulo} {a.posicao}
                        </span>
                        {!ver ? (
                          <span className="flex flex-col items-center gap-1 text-[12px] text-[var(--color-neutral-600)]">
                            <ImageOff size={22} /> TIFF: use o download
                          </span>
                        ) : url ? (
                          <img src={url} alt={a.legenda ?? a.nome_original} loading="lazy" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[12px] text-[var(--color-neutral-500)]">Carregando…</span>
                        )}
                      </button>
                      <figcaption className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block break-words text-[13px] font-semibold text-[var(--color-text)]">{a.legenda || a.nome_original}</span>
                          <span className="block break-all text-[11px] text-[var(--color-neutral-500)]">{a.nome_original}{tamanho(a.tamanho_bytes)}</span>
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          {ver && (
                            <button type="button" className="btn-icone" title="Ampliar" disabled={!url} onClick={() => setAmpliada(a)}>
                              <Maximize2 size={14} />
                            </button>
                          )}
                          {url && (
                            <a className="btn-icone" title="Baixar" href={url} download={a.nome_original} target="_blank" rel="noreferrer">
                              <Download size={14} />
                            </a>
                          )}
                        </span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {ampliada && links[ampliada.caminho] && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4" role="dialog" aria-modal="true"
          aria-label={ampliada.legenda ?? ampliada.nome_original} onClick={() => setAmpliada(null)}>
          <button type="button" className="btn-icone absolute right-4 top-4" title="Fechar" onClick={() => setAmpliada(null)}><X size={16} /></button>
          <img src={links[ampliada.caminho]} alt={ampliada.legenda ?? ampliada.nome_original}
            className="max-h-[84vh] max-w-full rounded-[10px] bg-white object-contain" onClick={(e) => e.stopPropagation()} />
          <p className="m-0 text-center text-[13px] text-white">{ampliada.legenda || ampliada.nome_original}</p>
        </div>
      )}
    </Cartao>
  );
}
