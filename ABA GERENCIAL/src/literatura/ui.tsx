// Cópia do Banco da Literatura do dashboard de visualização ("src/..." na raiz), para o gerencial.
// Se mudar uma regra aqui, mude lá também.
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function Cartao(p: { titulo?: string; subtitulo?: string; icone?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`cartao ${p.className ?? ""}`}>
      {p.titulo && (
        <div className="cartao-topo">
          <div className="flex items-center gap-3">
            {p.icone && <span className="text-[var(--color-blue)]">{p.icone}</span>}
            <div>
              <h2>{p.titulo}</h2>
              {p.subtitulo && <p>{p.subtitulo}</p>}
            </div>
          </div>
          {p.acoes && <div className="flex flex-wrap items-center gap-2">{p.acoes}</div>}
        </div>
      )}
      {p.children}
    </div>
  );
}

export function Aviso(p: { tipo?: "erro" | "ok" | "info"; children: ReactNode }) {
  return <div className={`aviso aviso-${p.tipo ?? "info"}`}>{p.children}</div>;
}

export function Carregando(p: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 px-7 py-10 text-[13px] text-[var(--color-neutral-600)]">
      <Loader2 size={16} className="animate-spin text-[var(--color-orange)]" /> {p.texto ?? "Carregando…"}
    </div>
  );
}

