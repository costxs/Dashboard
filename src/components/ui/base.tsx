import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { rotuloContexto, useContexto } from "../../store/useContexto";
import { Simbolos } from "./Simbolos";

/** Topo padrão das páginas: selo laranja do contexto, título e ações à direita. */
export function CabecalhoPagina(p: { titulo: string; subtitulo?: ReactNode; acoes?: ReactNode; selo?: string }) {
  const empresaNome = useContexto((s) => s.empresaNome);
  const projetoNome = useContexto((s) => s.projetoNome);
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 px-7 pt-8 pb-5">
      <div>
        <span className="selo-projeto">{p.selo ?? rotuloContexto({ empresaNome, projetoNome })}</span>
        <h1 className="mt-3 text-[27px] leading-[1.2] text-[var(--color-blue-800)]">{p.titulo}</h1>
        {p.subtitulo && <p className="mt-2.5 text-[13px] text-[var(--color-neutral-700)]">{p.subtitulo}</p>}
      </div>
      {p.acoes && <div className="flex flex-wrap items-center gap-2">{p.acoes}</div>}
    </div>
  );
}

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

export function Campo(p: { rotulo: string; unidade?: string; obrigatorio?: boolean; ajuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${p.className ?? ""}`}>
      <span className="rotulo">
        <Simbolos>{p.rotulo}</Simbolos>
        {p.unidade && <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]"> ({p.unidade})</span>}
        {p.obrigatorio && <span className="text-[var(--color-red)]"> *</span>}
      </span>
      {p.children}
      {p.ajuda && <span className="ajuda">{p.ajuda}</span>}
    </label>
  );
}

/** Valor exibido num campo somente leitura (grade de metadados). */
export function Valor(p: { rotulo: string; children: ReactNode; destaque?: boolean; calculado?: boolean }) {
  return (
    <div className="field">
      <span className="rotulo">
        <Simbolos>{p.rotulo}</Simbolos>
        {p.calculado && <span title="Calculado pelo banco" className="ml-1 text-[var(--color-orange-700)]">ƒ</span>}
      </span>
      <div className={p.destaque
        ? "mt-1 font-heading font-extrabold text-[16px] text-[var(--color-blue)] tabular-nums"
        : "mt-1 font-medium text-[14px] tabular-nums"}>
        {p.children}
      </div>
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
