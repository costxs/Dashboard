// Painel lateral da Comparação de resultados: os dados do plugue (core) e os ensaios de coreflooding de uma amostra,
// para conferir antes de marcar para a série.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import type { PontoPvbt } from "../../tipos/banco";
import { fmt, fmtData } from "../../utils/formatacao";
import { rotuloAcido } from "./FiltrosComparacao";

export interface AmostraFicha { uuid: string; codigo: string; litologia: string | null; ensaios: PontoPvbt[] }

export function FichaAmostraPvbt(p: {
  amostra: AmostraFicha; marcada: boolean; passa: (e: PontoPvbt) => boolean; filtrando: boolean
  aoMarcar: () => void; aoFechar: () => void
}) {
  const a = p.amostra;
  const e0 = a.ensaios[0];
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") p.aoFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [p]);

  const core: [string, string][] = [
    ["Litotipo", a.litologia ?? "—"],
    ["Dimensão nominal", e0?.dimensao_nominal_in ? `${e0.dimensao_nominal_in} in` : "—"],
    ["Diâmetro", e0?.diametro_cm != null ? `${fmt(e0.diametro_cm, 2)} cm` : "—"],
    ["Comprimento", e0?.comprimento_cm != null ? `${fmt(e0.comprimento_cm, 2)} cm` : "—"],
    ["Porosidade", e0?.porosidade_pct != null ? `${fmt(e0.porosidade_pct, 2)} %${e0.faixa_porosidade ? ` (${e0.faixa_porosidade})` : ""}` : "—"],
    ["Permeabilidade inicial", e0?.k_inicial_md != null ? `${fmt(e0.k_inicial_md, 2)} mD${e0.faixa_permeabilidade ? ` (${e0.faixa_permeabilidade})` : ""}` : "—"],
    ["Volume poroso", e0?.volume_poroso_cm3 != null ? `${fmt(e0.volume_poroso_cm3, 2)} cm³` : "—"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={`Amostra ${a.codigo}`} onClick={p.aoFechar}>
      <aside className="flex h-full w-full max-w-[760px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-neutral-300)] px-6 py-5">
          <div>
            <h2 className="m-0 font-heading text-[22px] font-extrabold text-[var(--color-red)]">{a.codigo}</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">{a.ensaios.length} ensaio(s) de coreflooding com PVbt</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={`btn ${p.marcada ? "btn-secondary" : "btn-primary"}`} onClick={p.aoMarcar}>
              {p.marcada ? <><Check size={14} /> Marcada · desmarcar</> : <><Plus size={14} /> Marcar para a série</>}
            </button>
            <button type="button" className="p-2 text-[var(--color-neutral-500)] hover:text-[var(--color-red)]" title="Fechar (Esc)" onClick={p.aoFechar}><X size={18} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          <section>
            <h3 className="m-0 mb-3 text-[14px] font-bold text-[var(--color-blue-800)]">Plugue (core)</h3>
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {core.map(([r, v]) => (
                <div key={r}>
                  <dt className="rotulo">{r}</dt>
                  <dd className="m-0 mt-0.5 text-[14px] font-semibold tabular-nums text-[var(--color-neutral-800)]">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="m-0 mb-1 text-[14px] font-bold text-[var(--color-blue-800)]">Ensaios</h3>
            {p.filtrando && <p className="m-0 mb-2 text-[12px] text-[var(--color-neutral-600)]">Em cinza, os ensaios que não passam nos filtros (não entram na série nova).</p>}
            <div className="flex flex-col gap-3">
              {a.ensaios.map((e) => {
                const ok = p.passa(e);
                const linhas: [string, string][] = [
                  ["Ácido", rotuloAcido(e)],
                  ["Aditivo", e.aditivo ? `${e.aditivo}${e.aditivo_valor != null ? ` ${fmt(e.aditivo_valor, 3)} ${e.aditivo_unidade ?? ""}` : ""}` : "—"],
                  ["Tratamento", e.tratamento ?? "—"],
                  ["Temperatura", e.temperatura_c != null ? `${fmt(e.temperatura_c, 1)} °C (nominal ${fmt(e.temperatura_nominal_c, 0)})` : e.temperatura_obs ?? "—"],
                  ["Vazão", e.vazao_ml_min != null ? `${fmt(e.vazao_ml_min, 3)} mL/min` : "—"],
                  ["Vel. intersticial", e.vel_intersticial_cm_min != null ? `${fmt(e.vel_intersticial_cm_min, 3)} cm/min` : "—"],
                  ["Vel. de Darcy", e.vel_darcy_cm_min != null ? `${fmt(e.vel_darcy_cm_min, 3)} cm/min` : "—"],
                  ["Confinamento", e.p_confinamento_psi != null ? `${fmt(e.p_confinamento_psi, 0)} psi` : "—"],
                  ["PVbt", e.pvbt != null ? `${fmt(e.pvbt, 3)}${e.pvbt_condicao ? ` (${e.pvbt_condicao})` : ""}` : "—"],
                  ["Breakthrough", e.breakthrough == null ? "—" : e.breakthrough ? "sim" : "não"],
                  ["Wormhole", e.comprimento_wormhole_cm != null ? `${fmt(e.comprimento_wormhole_cm, 2)} cm` : e.comprimento_wormhole_uct_cm != null ? `${fmt(e.comprimento_wormhole_uct_cm, 2)} cm (µCT)` : "—"],
                  ["Data", fmtData(e.data_ensaio)],
                ];
                return (
                  <article key={e.id_experimento} className={`rounded-[10px] border p-4 ${ok ? "border-[var(--color-neutral-300)]" : "border-dashed border-[var(--color-neutral-300)] opacity-50"}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <strong className="text-[14px] text-[var(--color-blue-800)]">{e.id_experimento}</strong>
                      {!ok && <span className="text-[11px] text-[var(--color-neutral-600)]">fora do filtro</span>}
                    </div>
                    <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                      {linhas.map(([r, v]) => (
                        <div key={r}>
                          <dt className="text-[11px] text-[var(--color-neutral-500)]">{r}</dt>
                          <dd className="m-0 text-[13px] tabular-nums text-[var(--color-neutral-800)]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {e.observacoes && <p className="m-0 mt-2 text-[12px] text-[var(--color-neutral-600)]">{e.observacoes}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="border-t border-[var(--color-neutral-300)] px-6 py-3">
          <Link to={`/amostras/${a.uuid}?aba=coreflooding`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-blue)] hover:underline">
            Abrir a ficha completa da amostra <ExternalLink size={13} />
          </Link>
        </footer>
      </aside>
    </div>
  );
}
