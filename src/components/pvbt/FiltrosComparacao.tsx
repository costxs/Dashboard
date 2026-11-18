// Filtros da Comparação de resultados (ensaios de coreflooding com PVbt). Cada filtro vale por ENSAIO:
// uma amostra aparece na lista se pelo menos um ensaio dela passa em todos os filtros.
import type { ReactNode } from "react";
import type { PontoPvbt } from "../../tipos/banco";
import { fmt } from "../../utils/formatacao";

export interface Faixa { de: string; ate: string }
export interface FiltrosPvbt {
  acidos: string[]; litologias: string[]; temperaturas: string[]; dimensoes: string[]; aditivos: string[]; condicoes: string[]
  breakthrough: "todos" | "sim" | "nao"
  vazao: Faixa; porosidade: Faixa; permeabilidade: Faixa; velocidade: Faixa
}
export const FILTROS_VAZIOS: FiltrosPvbt = {
  acidos: [], litologias: [], temperaturas: [], dimensoes: [], aditivos: [], condicoes: [], breakthrough: "todos",
  vazao: { de: "", ate: "" }, porosidade: { de: "", ate: "" }, permeabilidade: { de: "", ate: "" }, velocidade: { de: "", ate: "" },
};

/** rótulos usados no filtro e na ficha (ácido com concentração: "HCl 15 wt%") */
export const rotuloAcido = (e: PontoPvbt) =>
  e.acido ? `${e.acido}${e.conc_valor != null ? ` ${fmt(e.conc_valor, 3)} ${e.conc_unidade ?? ""}`.trimEnd() : ""}` : "sem ácido";
export const rotuloTemperatura = (e: PontoPvbt) =>
  e.temperatura_nominal_c != null ? `${fmt(e.temperatura_nominal_c, 0)} °C` : e.temperatura_obs ?? "sem temperatura";
const rotuloDimensao = (e: PontoPvbt) => e.dimensao_nominal_in ? `${e.dimensao_nominal_in} in` : "sem dimensão";
const rotuloAditivo = (e: PontoPvbt) => e.aditivo ?? "sem aditivo";
const rotuloCondicao = (e: PontoPvbt) => e.pvbt_condicao ?? "sem condição";

const num = (s: string) => { const t = s.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
function naFaixa(v: number | null, f: Faixa) {
  const de = num(f.de), ate = num(f.ate);
  if (de == null && ate == null) return true;
  if (v == null) return false;
  return (de == null || v >= de) && (ate == null || v <= ate);
}

export function passaNoFiltro(e: PontoPvbt, f: FiltrosPvbt): boolean {
  const lista = (sel: string[], v: string) => !sel.length || sel.includes(v);
  return lista(f.acidos, rotuloAcido(e)) && lista(f.litologias, e.litologia ?? "—") && lista(f.temperaturas, rotuloTemperatura(e))
    && lista(f.dimensoes, rotuloDimensao(e)) && lista(f.aditivos, rotuloAditivo(e)) && lista(f.condicoes, rotuloCondicao(e))
    && (f.breakthrough === "todos" || (f.breakthrough === "sim" ? e.breakthrough === true : e.breakthrough === false))
    && naFaixa(e.vazao_ml_min, f.vazao) && naFaixa(e.porosidade_pct, f.porosidade)
    && naFaixa(e.k_inicial_md, f.permeabilidade) && naFaixa(e.vel_intersticial_cm_min, f.velocidade);
}

export function contarFiltros(f: FiltrosPvbt): number {
  const faixa = (x: Faixa) => Number(!!(x.de.trim() || x.ate.trim()));
  return f.acidos.length + f.litologias.length + f.temperaturas.length + f.dimensoes.length + f.aditivos.length + f.condicoes.length
    + Number(f.breakthrough !== "todos") + faixa(f.vazao) + faixa(f.porosidade) + faixa(f.permeabilidade) + faixa(f.velocidade);
}

/** opções de cada filtro, com quantos ensaios têm aquele valor */
function opcoes(ensaios: PontoPvbt[], rotulo: (e: PontoPvbt) => string, numerico = false) {
  const c = new Map<string, number>();
  for (const e of ensaios) c.set(rotulo(e), (c.get(rotulo(e)) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => numerico ? (parseFloat(a[0]) || 1e9) - (parseFloat(b[0]) || 1e9) : a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
}
const faixaDe = (ensaios: PontoPvbt[], k: keyof PontoPvbt) => {
  const v = ensaios.map((e) => e[k]).filter((x): x is number => typeof x === "number");
  return v.length ? `${fmt(Math.min(...v), 2)} – ${fmt(Math.max(...v), 2)}` : "sem dados";
};

export function PainelFiltros(p: { ensaios: PontoPvbt[]; filtros: FiltrosPvbt; aoMudar: (f: FiltrosPvbt) => void }) {
  const { ensaios, filtros: f, aoMudar } = p;
  const alternar = (k: "acidos" | "litologias" | "temperaturas" | "dimensoes" | "aditivos" | "condicoes", v: string) =>
    aoMudar({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const chips = (k: "acidos" | "litologias" | "temperaturas" | "dimensoes" | "aditivos" | "condicoes", rotulo: (e: PontoPvbt) => string, numerico = false) => (
    <div className="flex flex-wrap gap-1.5">
      {opcoes(ensaios, rotulo, numerico).map(([v, n]) => {
        const ativo = f[k].includes(v);
        return (
          <button key={v} type="button" aria-pressed={ativo} onClick={() => alternar(k, v)}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${ativo
              ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white"
              : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]"}`}>
            {v} <span className={ativo ? "text-white/80" : "text-[var(--color-neutral-500)]"}>{n}</span>
          </button>
        );
      })}
    </div>
  );
  const faixa = (k: "vazao" | "porosidade" | "permeabilidade" | "velocidade", campo: keyof PontoPvbt) => (
    <div className="flex items-center gap-2">
      <input className="input !py-1.5" inputMode="decimal" placeholder="de" aria-label="de" value={f[k].de} onChange={(e) => aoMudar({ ...f, [k]: { ...f[k], de: e.target.value } })} />
      <span className="text-[var(--color-neutral-500)]">–</span>
      <input className="input !py-1.5" inputMode="decimal" placeholder="até" aria-label="até" value={f[k].ate} onChange={(e) => aoMudar({ ...f, [k]: { ...f[k], ate: e.target.value } })} />
      <span className="whitespace-nowrap text-[11px] text-[var(--color-neutral-500)]">({faixaDe(ensaios, campo)})</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-[var(--color-neutral-300)] bg-[var(--color-neutral-50,#f8fafc)] p-4">
      <Grupo rotulo="Ácido">{chips("acidos", rotuloAcido)}</Grupo>
      <Grupo rotulo="Temperatura nominal">{chips("temperaturas", rotuloTemperatura, true)}</Grupo>
      <Grupo rotulo="Vazão" unidade="mL/min">{faixa("vazao", "vazao_ml_min")}</Grupo>
      <Grupo rotulo="Velocidade intersticial" unidade="cm/min">{faixa("velocidade", "vel_intersticial_cm_min")}</Grupo>
      <Grupo rotulo="Aditivo">{chips("aditivos", rotuloAditivo)}</Grupo>
      <Grupo rotulo="Litotipo">{chips("litologias", (e) => e.litologia ?? "—")}</Grupo>
      <Grupo rotulo="Dimensão do plugue">{chips("dimensoes", rotuloDimensao)}</Grupo>
      <Grupo rotulo="Porosidade" unidade="%">{faixa("porosidade", "porosidade_pct")}</Grupo>
      <Grupo rotulo="Permeabilidade inicial" unidade="mD">{faixa("permeabilidade", "k_inicial_md")}</Grupo>
      <Grupo rotulo="Condição do PVbt">{chips("condicoes", rotuloCondicao)}</Grupo>
      <Grupo rotulo="Breakthrough">
        <div className="flex gap-1.5">
          {([["todos", "Todos"], ["sim", "Com"], ["nao", "Sem"]] as const).map(([v, r]) => (
            <button key={v} type="button" aria-pressed={f.breakthrough === v} onClick={() => aoMudar({ ...f, breakthrough: v })}
              className={`rounded-full border px-2.5 py-1 text-[12px] ${f.breakthrough === v
                ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white" : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)]"}`}>{r}</button>
          ))}
        </div>
      </Grupo>
    </div>
  );
}

function Grupo({ rotulo, unidade, children }: { rotulo: string; unidade?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="rotulo">{rotulo}{unidade && <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]"> ({unidade})</span>}</span>
      {children}
    </div>
  );
}
