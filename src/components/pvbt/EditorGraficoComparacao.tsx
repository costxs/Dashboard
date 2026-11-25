import { useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  ESTILO_PADRAO, FONTES, Forma, ROTULO_LINHA, ROTULO_MARCADOR, TITULO_Y_PADRAO,
  type EstiloComparacao, type Marcador, type PosicaoLegenda, type TipoLinha,
} from "./GraficoComparacao";

export interface SerieEditavel {
  id: string
  nome: string
  cor: string
  marcador: Marcador
  vazado: boolean
  linha: TipoLinha
}

const MARCADORES = Object.keys(ROTULO_MARCADOR) as Marcador[];
const LINHAS = Object.keys(ROTULO_LINHA) as TipoLinha[];
const LEGENDAS: [PosicaoLegenda, string][] = [
  ["top-left", "Em cima, à esquerda"], ["top-right", "Em cima, à direita"],
  ["bottom-left", "Embaixo, à esquerda"], ["bottom-right", "Embaixo, à direita"], ["none", "Sem legenda"],
];

function Numero(p: { rotulo: string; valor: number; min: number; max: number; passo?: number; aoMudar: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)]">
      {p.rotulo}
      <input type="number" className="input !py-1.5" min={p.min} max={p.max} step={p.passo ?? 1} value={p.valor}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) p.aoMudar(Math.min(p.max, Math.max(p.min, v)));
        }} />
    </label>
  );
}

/** Personalização do gráfico de comparação: estilo geral e o de cada série. */
export function EditorGraficoComparacao(p: {
  estilo: EstiloComparacao
  aoMudarEstilo: (e: EstiloComparacao) => void
  series: SerieEditavel[]
  aoMudarSerie: (id: string, parcial: Partial<SerieEditavel>) => void
  aoRestaurarSeries: () => void
  tituloXPadrao: string
}) {
  const [aberto, setAberto] = useState(false);
  const e = p.estilo;
  const muda = (parcial: Partial<EstiloComparacao>) => p.aoMudarEstilo({ ...e, ...parcial });

  return (
    <div className="mt-5 rounded-[12px] border border-[var(--color-neutral-300)]">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 bg-[var(--color-neutral-50)] px-4 py-3 text-left text-[14px] font-semibold text-[var(--color-blue-800)] cursor-pointer rounded-[12px]">
        <span className="inline-flex items-center gap-2"><SlidersHorizontal size={16} /> Personalizar gráfico</span>
        {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberto && (
        <div className="flex flex-col gap-5 p-4">
          {/* Textos */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)]">
              Título do gráfico
              <input className="input !py-1.5" value={e.titulo} placeholder="(sem título)" onChange={(x) => muda({ titulo: x.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)]">
              Título do eixo X
              <input className="input !py-1.5" value={e.tituloX} placeholder={p.tituloXPadrao} onChange={(x) => muda({ tituloX: x.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)]">
              Título do eixo Y
              <input className="input !py-1.5" value={e.tituloY} placeholder={TITULO_Y_PADRAO} onChange={(x) => muda({ tituloY: x.target.value })} />
            </label>
          </section>

          {/* Fonte e tamanhos */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <label className="col-span-2 flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)] sm:col-span-1 lg:col-span-1">
              Fonte
              <select className="input !py-1.5" value={e.fonte} onChange={(x) => muda({ fonte: x.target.value })}>
                {FONTES.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>
            </label>
            <Numero rotulo="Números dos eixos" valor={e.tamanhoNumeros} min={8} max={28} aoMudar={(v) => muda({ tamanhoNumeros: v })} />
            <Numero rotulo="Títulos dos eixos" valor={e.tamanhoTitulosEixos} min={8} max={32} aoMudar={(v) => muda({ tamanhoTitulosEixos: v })} />
            <Numero rotulo="Legenda" valor={e.tamanhoLegenda} min={8} max={28} aoMudar={(v) => muda({ tamanhoLegenda: v })} />
            <Numero rotulo="Título" valor={e.tamanhoTitulo} min={10} max={36} aoMudar={(v) => muda({ tamanhoTitulo: v })} />
            <Numero rotulo="Espessura da linha" valor={e.espessuraLinha} min={0.5} max={6} passo={0.5} aoMudar={(v) => muda({ espessuraLinha: v })} />
            <Numero rotulo="Tamanho do símbolo" valor={e.tamanhoSimbolo} min={2} max={14} passo={0.5} aoMudar={(v) => muda({ tamanhoSimbolo: v })} />
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-neutral-700)]">
              Posição da legenda
              <select className="input !py-1.5" value={e.legenda} onChange={(x) => muda({ legenda: x.target.value as PosicaoLegenda })}>
                {LEGENDAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
          </section>

          {/* Cada série */}
          <section className="flex flex-col gap-2">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-neutral-600)]">Séries</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-[var(--color-neutral-500)]">
                    <th className="py-1.5 pr-3 font-semibold">Série</th>
                    <th className="py-1.5 pr-3 font-semibold">Cor</th>
                    <th className="py-1.5 pr-3 font-semibold">Símbolo</th>
                    <th className="py-1.5 pr-3 font-semibold">Preenchimento</th>
                    <th className="py-1.5 pr-3 font-semibold">Linha</th>
                  </tr>
                </thead>
                <tbody>
                  {p.series.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--color-neutral-200)]">
                      <td className="py-1.5 pr-3">
                        <span className="inline-flex items-center gap-2">
                          <svg width={26} height={18} aria-hidden>
                            {s.linha !== "none" && <line x1={1} x2={25} y1={9} y2={9} stroke={s.cor} strokeWidth={1.5} />}
                            <Forma forma={s.marcador} cx={13} cy={9} cor={s.cor} r={5} vazado={s.vazado} />
                          </svg>
                          <span className="font-medium">{s.nome}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input type="color" value={s.cor} aria-label={`Cor de ${s.nome}`}
                          onChange={(x) => p.aoMudarSerie(s.id, { cor: x.target.value })}
                          className="h-8 w-12 cursor-pointer rounded border border-[var(--color-neutral-300)] bg-white p-0.5" />
                      </td>
                      <td className="py-1.5 pr-3">
                        <select className="input !w-auto !py-1" value={s.marcador} aria-label={`Símbolo de ${s.nome}`}
                          onChange={(x) => p.aoMudarSerie(s.id, { marcador: x.target.value as Marcador })}>
                          {MARCADORES.map((m) => <option key={m} value={m}>{ROTULO_MARCADOR[m]}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-3">
                        <select className="input !w-auto !py-1" value={s.vazado ? "vazado" : "cheio"} aria-label={`Preenchimento de ${s.nome}`}
                          disabled={s.marcador === "cross" || s.marcador === "plus"}
                          onChange={(x) => p.aoMudarSerie(s.id, { vazado: x.target.value === "vazado" })}>
                          <option value="cheio">Cheio</option>
                          <option value="vazado">Vazado</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-3">
                        <select className="input !w-auto !py-1" value={s.linha} aria-label={`Linha de ${s.nome}`}
                          onChange={(x) => p.aoMudarSerie(s.id, { linha: x.target.value as TipoLinha })}>
                          {LINHAS.map((l) => <option key={l} value={l}>{ROTULO_LINHA[l]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary !py-1.5" onClick={() => p.aoMudarEstilo(ESTILO_PADRAO)}>
              <RotateCcw size={14} /> Restaurar estilo padrão
            </button>
            <button type="button" className="btn btn-secondary !py-1.5" onClick={p.aoRestaurarSeries}>
              <RotateCcw size={14} /> Cores e símbolos padrão das séries
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
