import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import {
  CORES_SERIE, GraficoComparacao, MARCADORES_SERIE, type ExportarComparacao, type SerieGrafico,
} from "../components/pvbt/GraficoComparacao";
import { useConsulta } from "../hooks/useConsulta";
import { listarPvbt } from "../servicos/pvbt";
import { useContexto } from "../store/useContexto";
import type { PontoPvbt } from "../tipos/banco";
import { fmt, mensagemErro } from "../utils/formatacao";

// Comparação de resultados (PVbt × Q): a pessoa marca amostras que passaram por coreflooding e já têm PVbt,
// cria uma SÉRIE com elas e dá um nome (a legenda do gráfico). Várias séries ficam no mesmo gráfico.
// As séries ficam guardadas neste navegador (preferência de quem consulta; o dashboard não grava no banco).

interface AmostraPvbt { uuid: string; codigo: string; litologia: string | null; ensaios: PontoPvbt[] }
interface Serie { id: string; nome: string; amostras: string[] }

const CHAVE = "lcpetro.comparacao.series.v1";
function lerSeries(): Serie[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((s) => s && typeof s.id === "string" && typeof s.nome === "string" && Array.isArray(s.amostras)) : [];
  } catch { return []; }
}
const guardar = (s: Serie[]) => { try { localStorage.setItem(CHAVE, JSON.stringify(s)); } catch { /* sem armazenamento: as séries valem só nesta tela */ } };
const novoId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export function ComparacaoPage() {
  const projetoId = useContexto((s) => s.projetoId);
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [nome, setNome] = useState("");
  const [series, setSeries] = useState<Serie[]>(lerSeries);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const grafico = useRef<ExportarComparacao>(null);

  useEffect(() => guardar(series), [series]);

  const base = useConsulta(() => listarPvbt({ fontes: ["LCPETRO"] }), []);

  // amostras do laboratório com coreflooding e PVbt, dentro do projeto aberto
  const amostras = useMemo<AmostraPvbt[]>(() => {
    const por = new Map<string, AmostraPvbt>();
    for (const e of base.dados ?? []) {
      if (e.pvbt == null || !e.amostra_uuid) continue;
      if (projetoId && e.projeto_id !== projetoId) continue;
      const a = por.get(e.amostra_uuid) ?? { uuid: e.amostra_uuid, codigo: e.id_amostra ?? e.amostra_uuid, litologia: e.litologia, ensaios: [] };
      a.ensaios.push(e);
      por.set(e.amostra_uuid, a);
    }
    return [...por.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  }, [base.dados, projetoId]);
  const porUuid = useMemo(() => new Map(amostras.map((a) => [a.uuid, a])), [amostras]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? amostras.filter((a) => `${a.codigo} ${a.litologia ?? ""}`.toLowerCase().includes(t)) : amostras;
  }, [amostras, busca]);

  // séries prontas para o gráfico: PVbt × vazão de cada ensaio das amostras da série
  const { prontas, semVazao } = useMemo(() => {
    let sem = 0;
    const prontas: SerieGrafico[] = series.map((s, i) => {
      const pontos = s.amostras.flatMap((u) => porUuid.get(u)?.ensaios ?? []).flatMap((e) => {
        if ((e.vazao_ml_min ?? 0) <= 0 || (e.pvbt ?? 0) <= 0) { sem++; return []; }
        return [{ x: Number(e.vazao_ml_min), y: Number(e.pvbt), detalhe: `${e.id_amostra} · ${e.id_experimento}${e.temperatura_nominal_c != null ? ` · ${fmt(e.temperatura_nominal_c, 0)} °C` : ""}` }];
      });
      return { id: s.id, nome: s.nome, cor: CORES_SERIE[i % CORES_SERIE.length], marcador: MARCADORES_SERIE[i % MARCADORES_SERIE.length], pontos };
    });
    return { prontas, semVazao: sem };
  }, [series, porUuid]);

  const alternar = (u: string) => setMarcadas((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const limparRascunho = () => { setMarcadas(new Set()); setNome(""); setEditando(null); };

  function salvarSerie() {
    const n = nome.trim();
    if (!n || !marcadas.size) return;
    const amostrasDaSerie = [...marcadas];
    if (editando) setSeries((l) => l.map((s) => (s.id === editando ? { ...s, nome: n, amostras: amostrasDaSerie } : s)));
    else setSeries((l) => [...l, { id: novoId(), nome: n, amostras: amostrasDaSerie }]);
    limparRascunho();
  }
  function editar(s: Serie) { setEditando(s.id); setNome(s.nome); setMarcadas(new Set(s.amostras.filter((u) => porUuid.has(u)))); }
  function apagar(s: Serie) {
    if (!confirm(`Apagar a série "${s.nome}"?`)) return;
    setSeries((l) => l.filter((x) => x.id !== s.id));
    if (editando === s.id) limparRascunho();
  }
  const baixar = (f: "png" | "svg") => grafico.current?.baixar(f, "comparacao_pvbt_q").catch((e) => setErro(mensagemErro(e)));

  return (
    <div>
      <CabecalhoPagina titulo="Comparação de resultados"
        subtitulo="Marque amostras com coreflooding e PVbt, crie uma série com um nome e compare PVbt × Q" />

      <div className="px-7 pb-10 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <Cartao titulo={editando ? "Editando série" : "Nova série"} subtitulo={`${amostras.length} amostra(s) com PVbt · ${marcadas.size} marcada(s)`}>
            <div className="p-4 flex flex-col gap-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                <input className="input !pl-9" placeholder="Buscar por código ou litotipo" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <div className="flex gap-2 text-[12px]">
                <button type="button" className="btn btn-secondary !py-1" onClick={() => setMarcadas(new Set([...marcadas, ...filtradas.map((a) => a.uuid)]))}>Marcar as listadas</button>
                <button type="button" className="btn btn-secondary !py-1" onClick={() => setMarcadas(new Set())} disabled={!marcadas.size}>Desmarcar</button>
              </div>
              {base.carregando && !base.dados ? <Carregando />
                : base.erro ? <Aviso tipo="erro">{base.erro}</Aviso>
                : !filtradas.length ? (
                  <p className="m-0 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">
                    {amostras.length ? "Nenhuma amostra com esse filtro." : "Ainda não há amostra com coreflooding e PVbt neste projeto."}
                  </p>
                ) : (
                  <ul className="m-0 p-0 list-none max-h-[380px] overflow-y-auto flex flex-col">
                    {filtradas.map((a) => (
                      <li key={a.uuid}>
                        <label className="flex items-start gap-3 px-2 py-2 rounded-md cursor-pointer hover:bg-[var(--color-blue-50)]">
                          <input type="checkbox" className="mt-1" checked={marcadas.has(a.uuid)} onChange={() => alternar(a.uuid)} />
                          <span className="flex-1 min-w-0">
                            <span className="font-heading font-bold text-[14px] text-[var(--color-red)]">{a.codigo}</span>
                            <span className="block text-[12px] text-[var(--color-neutral-600)] truncate">{a.litologia ?? "—"}</span>
                          </span>
                          <span className="text-right text-[12px] tabular-nums text-[var(--color-blue-800)]">{a.ensaios.length} ensaio(s)</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              <div className="border-t border-[var(--color-neutral-200)] pt-3 flex flex-col gap-2">
                <label className="field">
                  <span className="rotulo">Nome da série <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]">(vira a legenda)</span></span>
                  <input className="input" placeholder="ex.: BLEND, HCl 15% + IC" value={nome} onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") salvarSerie(); }} />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-primary" onClick={salvarSerie} disabled={!nome.trim() || !marcadas.size}>
                    {editando ? <><Check size={14} /> Salvar série</> : <><Plus size={14} /> Criar série</>}
                  </button>
                  {(editando || marcadas.size > 0 || nome) && <button type="button" className="btn btn-secondary" onClick={limparRascunho}><X size={14} /> Cancelar</button>}
                </div>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Séries" subtitulo={series.length ? `${series.length} no gráfico` : "Nenhuma ainda"}>
            <ul className="m-0 p-0 list-none flex flex-col">
              {!series.length && <li className="px-5 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">Marque amostras, dê um nome e clique em "Criar série".</li>}
              {prontas.map((s) => {
                const orig = series.find((x) => x.id === s.id)!;
                const faltam = orig.amostras.filter((u) => !porUuid.has(u)).length;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3 border-t first:border-t-0 border-[var(--color-neutral-200)]">
                    <svg width="34" height="14" aria-hidden><line x1="0" x2="34" y1="7" y2="7" stroke="#000" /><circle cx="17" cy="7" r="5" fill={s.cor} /></svg>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[14px] text-[var(--color-blue-800)] truncate">{s.nome}</span>
                      <span className="block text-[12px] text-[var(--color-neutral-600)]">
                        {orig.amostras.length - faltam} amostra(s) · {s.pontos.length} ponto(s){faltam ? ` · ${faltam} fora deste projeto` : ""}
                      </span>
                    </span>
                    <button type="button" title="Editar seleção e nome" className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-blue)]" onClick={() => editar(orig)}><Pencil size={14} /></button>
                    <button type="button" title="Apagar série" className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-red)]" onClick={() => apagar(orig)}><Trash2 size={14} /></button>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </div>

        <Cartao titulo="PVbt × Q" subtitulo="Volume de poros injetados até o breakthrough em função da vazão"
          acoes={prontas.length > 0 && (
            <div className="flex gap-2">
              {(["png", "svg"] as const).map((f) => <button key={f} type="button" className="btn btn-secondary !py-1" onClick={() => baixar(f)}><Download size={14} /> {f.toUpperCase()}</button>)}
            </div>
          )}>
          <div className="p-6">
            {erro && <div className="mb-4"><Aviso tipo="erro">{erro}</Aviso></div>}
            {!prontas.length ? (
              <p className="m-0 py-20 text-center text-[13px] text-[var(--color-neutral-600)]">Crie uma série para plotar o gráfico.</p>
            ) : (
              <>
                {semVazao > 0 && <div className="mb-4"><Aviso tipo="info">{semVazao} ensaio(s) ficaram de fora por não terem vazão ou PVbt.</Aviso></div>}
                <GraficoComparacao ref={grafico} series={prontas} />
              </>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  );
}
