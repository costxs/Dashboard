import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, Download, ExternalLink, Eye, Filter, Layers, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X,
} from "lucide-react";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import {
  CORES_SERIE, GraficoComparacao, MARCADORES_SERIE, type ExportarComparacao, type SerieGrafico,
} from "../components/pvbt/GraficoComparacao";
import { useConsulta } from "../hooks/useConsulta";
import { listarPvbt } from "../servicos/pvbt";
import { useContexto } from "../store/useContexto";
import type { PontoPvbt } from "../tipos/banco";
import { fmt, fmtExato, mensagemErro } from "../utils/formatacao";

// Comparação de resultados (PVbt × Q): a pessoa filtra e marca amostras que passaram por coreflooding e já têm PVbt,
// pode clicar em qualquer amostra para inspecionar os dados do core (D, L, φ, VP, k, ácido, vazão, temperatura) e
// selecioná-la direto do modal, criando séries comparativas no mesmo gráfico.

interface AmostraPvbt {
  uuid: string;
  codigo: string;
  litologia: string | null;
  ensaios: PontoPvbt[];
}
interface Serie {
  id: string;
  nome: string;
  amostras: string[];
}

interface FiltrosComparacao {
  litologia: string;
  acido: string;
  temperatura: string;
  vazaoMin: string;
  vazaoMax: string;
  kMin: string;
  kMax: string;
  phiMin: string;
  phiMax: string;
}

const FILTROS_VAZIOS: FiltrosComparacao = {
  litologia: "",
  acido: "",
  temperatura: "",
  vazaoMin: "",
  vazaoMax: "",
  kMin: "",
  kMax: "",
  phiMin: "",
  phiMax: "",
};

const CHAVE = "lcpetro.comparacao.series.v1";
function lerSeries(): Serie[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v)
      ? v.filter((s) => s && typeof s.id === "string" && typeof s.nome === "string" && Array.isArray(s.amostras))
      : [];
  } catch {
    return [];
  }
}
const guardar = (s: Serie[]) => {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* sem armazenamento: as séries valem só nesta tela */
  }
};
const novoId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

function lerNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function rotuloAcido(e: PontoPvbt): string {
  return (e.tratamento || e.acido || e.id_sistema || "").trim();
}

function tempDoEnsaio(e: PontoPvbt): number | null {
  const t = e.temperatura_nominal_c ?? e.temperatura_c;
  return t != null && Number.isFinite(Number(t)) ? Math.round(Number(t)) : null;
}

export function ComparacaoPage() {
  const projetoId = useContexto((s) => s.projetoId);
  const [busca, setBusca] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosComparacao>(FILTROS_VAZIOS);
  const [amostraDetalheUuid, setAmostraDetalheUuid] = useState<string | null>(null);
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
      const a = por.get(e.amostra_uuid) ?? {
        uuid: e.amostra_uuid,
        codigo: e.id_amostra ?? e.amostra_uuid,
        litologia: e.litologia,
        ensaios: [],
      };
      a.ensaios.push(e);
      por.set(e.amostra_uuid, a);
    }
    return [...por.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  }, [base.dados, projetoId]);

  const porUuid = useMemo(() => new Map(amostras.map((a) => [a.uuid, a])), [amostras]);

  // Opções únicas para os selects de filtro
  const opcoesFiltro = useMemo(() => {
    const litologias = new Set<string>();
    const acidos = new Set<string>();
    const temperaturas = new Set<number>();

    for (const a of amostras) {
      if (a.litologia?.trim()) litologias.add(a.litologia.trim());
      for (const e of a.ensaios) {
        const ac = rotuloAcido(e);
        if (ac) acidos.add(ac);
        const t = tempDoEnsaio(e);
        if (t != null) temperaturas.add(t);
      }
    }
    return {
      litologias: [...litologias].sort((a, b) => a.localeCompare(b, "pt-BR")),
      acidos: [...acidos].sort((a, b) => a.localeCompare(b, "pt-BR")),
      temperaturas: [...temperaturas].sort((a, b) => a - b),
    };
  }, [amostras]);

  const qtdFiltrosAtivos = useMemo(
    () => Object.values(filtros).filter((v) => v.trim() !== "").length,
    [filtros],
  );

  const ensaioPassaNosFiltros = (e: PontoPvbt): boolean => {
    if (filtros.acido && rotuloAcido(e) !== filtros.acido) return false;
    if (filtros.temperatura) {
      const t = tempDoEnsaio(e);
      if (t == null || String(t) !== filtros.temperatura) return false;
    }
    const qMin = lerNum(filtros.vazaoMin);
    const qMax = lerNum(filtros.vazaoMax);
    if (qMin != null && (e.vazao_ml_min == null || Number(e.vazao_ml_min) < qMin)) return false;
    if (qMax != null && (e.vazao_ml_min == null || Number(e.vazao_ml_min) > qMax)) return false;

    const kMin = lerNum(filtros.kMin);
    const kMax = lerNum(filtros.kMax);
    if (kMin != null && (e.k_inicial_md == null || Number(e.k_inicial_md) < kMin)) return false;
    if (kMax != null && (e.k_inicial_md == null || Number(e.k_inicial_md) > kMax)) return false;

    const phiMin = lerNum(filtros.phiMin);
    const phiMax = lerNum(filtros.phiMax);
    if (phiMin != null && (e.porosidade_pct == null || Number(e.porosidade_pct) < phiMin)) return false;
    if (phiMax != null && (e.porosidade_pct == null || Number(e.porosidade_pct) > phiMax)) return false;

    return true;
  };

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return amostras.filter((a) => {
      if (filtros.litologia && (a.litologia ?? "").trim() !== filtros.litologia) return false;
      if (t) {
        const textoAmostra = [
          a.codigo,
          a.litologia ?? "",
          ...a.ensaios.map((e) => `${rotuloAcido(e)} ${e.id_experimento ?? ""} ${tempDoEnsaio(e) ?? ""}C`),
        ]
          .join(" ")
          .toLowerCase();
        if (!textoAmostra.includes(t)) return false;
      }
      if (qtdFiltrosAtivos > 0) {
        const temEnsaioCompativel = a.ensaios.some(ensaioPassaNosFiltros);
        if (!temEnsaioCompativel) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostras, busca, filtros, qtdFiltrosAtivos]);

  // séries prontas para o gráfico: PVbt × vazão de cada ensaio das amostras da série
  const { prontas, semVazao } = useMemo(() => {
    let sem = 0;
    const prontas: SerieGrafico[] = series.map((s, i) => {
      const pontos = s.amostras
        .flatMap((u) => porUuid.get(u)?.ensaios ?? [])
        .flatMap((e) => {
          if ((e.vazao_ml_min ?? 0) <= 0 || (e.pvbt ?? 0) <= 0) {
            sem++;
            return [];
          }
          const ac = rotuloAcido(e);
          return [
            {
              x: Number(e.vazao_ml_min),
              y: Number(e.pvbt),
              detalhe: `${e.id_amostra} · ${e.id_experimento}${ac ? ` · ${ac}` : ""}${
                e.temperatura_nominal_c != null ? ` · ${fmt(e.temperatura_nominal_c, 0)} °C` : ""
              }`,
            },
          ];
        });
      return {
        id: s.id,
        nome: s.nome,
        cor: CORES_SERIE[i % CORES_SERIE.length],
        marcador: MARCADORES_SERIE[i % MARCADORES_SERIE.length],
        pontos,
      };
    });
    return { prontas, semVazao: sem };
  }, [series, porUuid]);

  const alternar = (u: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(u)) n.delete(u);
      else n.add(u);
      return n;
    });
  const limparRascunho = () => {
    setMarcadas(new Set());
    setNome("");
    setEditando(null);
  };

  function salvarSerie() {
    const n = nome.trim();
    if (!n || !marcadas.size) return;
    const amostrasDaSerie = [...marcadas];
    if (editando) setSeries((l) => l.map((s) => (s.id === editando ? { ...s, nome: n, amostras: amostrasDaSerie } : s)));
    else setSeries((l) => [...l, { id: novoId(), nome: n, amostras: amostrasDaSerie }]);
    limparRascunho();
  }
  function editar(s: Serie) {
    setEditando(s.id);
    setNome(s.nome);
    setMarcadas(new Set(s.amostras.filter((u) => porUuid.has(u))));
  }
  function apagar(s: Serie) {
    if (!confirm(`Apagar a série "${s.nome}"?`)) return;
    setSeries((l) => l.filter((x) => x.id !== s.id));
    if (editando === s.id) limparRascunho();
  }
  const baixar = (f: "png" | "svg") => grafico.current?.baixar(f, "comparacao_pvbt_q").catch((e) => setErro(mensagemErro(e)));

  const amostraDetalhe = amostraDetalheUuid ? porUuid.get(amostraDetalheUuid) ?? null : null;

  return (
    <div>
      <CabecalhoPagina
        titulo="Comparação de resultados"
        subtitulo="Filtre por ácido, temperatura, vazão ou propriedades do core, inspecione os dados da amostra e compare séries PVbt × Q"
      />

      <div className="px-7 pb-10 grid grid-cols-1 lg:grid-cols-[410px_1fr] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <Cartao
            titulo={editando ? "Editando série" : "Nova série"}
            subtitulo={`${filtradas.length} de ${amostras.length} amostra(s) · ${marcadas.size} marcada(s)`}
          >
            <div className="p-4 flex flex-col gap-3">
              {/* Busca + Botão de Filtros */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                  <input
                    className="input !pl-9"
                    placeholder="Buscar por código, litotipo ou ácido…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarFiltros((v) => !v)}
                  className={`btn ${
                    mostrarFiltros || qtdFiltrosAtivos > 0 ? "btn-primary" : "btn-secondary"
                  } !px-3 flex items-center gap-1.5 shrink-0`}
                  title="Filtrar amostras por ácido, temperatura, vazão, porosidade e permeabilidade"
                >
                  <SlidersHorizontal size={14} />
                  <span>Filtros</span>
                  {qtdFiltrosAtivos > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[var(--color-blue-800)] text-[11px] font-bold">
                      {qtdFiltrosAtivos}
                    </span>
                  )}
                </button>
              </div>

              {/* Painel de Filtros Expansível */}
              {mostrarFiltros && (
                <div className="rounded-lg border border-[var(--color-blue-100)] bg-[var(--color-blue-50)]/55 p-3 flex flex-col gap-2.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--color-blue-800)] flex items-center gap-1.5">
                      <Filter size={13} /> Filtros de Core & Ensaio
                    </span>
                    {qtdFiltrosAtivos > 0 && (
                      <button
                        type="button"
                        onClick={() => setFiltros(FILTROS_VAZIOS)}
                        className="text-[11px] font-semibold text-[var(--color-red)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
                      >
                        <RotateCcw size={11} /> Limpar filtros
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Litologia</span>
                      <select
                        className="input !h-8 !py-1 text-[12px]"
                        value={filtros.litologia}
                        onChange={(e) => setFiltros((f) => ({ ...f, litologia: e.target.value }))}
                      >
                        <option value="">Todas ({opcoesFiltro.litologias.length})</option>
                        {opcoesFiltro.litologias.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Temperatura (°C)</span>
                      <select
                        className="input !h-8 !py-1 text-[12px]"
                        value={filtros.temperatura}
                        onChange={(e) => setFiltros((f) => ({ ...f, temperatura: e.target.value }))}
                      >
                        <option value="">Todas</option>
                        {opcoesFiltro.temperaturas.map((t) => (
                          <option key={t} value={String(t)}>
                            {t} °C
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Sistema Ácido / Fluido</span>
                    <select
                      className="input !h-8 !py-1 text-[12px]"
                      value={filtros.acido}
                      onChange={(e) => setFiltros((f) => ({ ...f, acido: e.target.value }))}
                    >
                      <option value="">Todos ({opcoesFiltro.acidos.length})</option>
                      {opcoesFiltro.acidos.map((ac) => (
                        <option key={ac} value={ac}>
                          {ac}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Vazão Q (mL/min)</span>
                      <div className="flex items-center gap-1">
                        <input
                          className="input !h-8 !py-1 !px-2 text-[12px]"
                          placeholder="Mín"
                          inputMode="decimal"
                          value={filtros.vazaoMin}
                          onChange={(e) => setFiltros((f) => ({ ...f, vazaoMin: e.target.value }))}
                        />
                        <span className="text-[var(--color-neutral-400)]">–</span>
                        <input
                          className="input !h-8 !py-1 !px-2 text-[12px]"
                          placeholder="Máx"
                          inputMode="decimal"
                          value={filtros.vazaoMax}
                          onChange={(e) => setFiltros((f) => ({ ...f, vazaoMax: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Porosidade φ (%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          className="input !h-8 !py-1 !px-2 text-[12px]"
                          placeholder="Mín"
                          inputMode="decimal"
                          value={filtros.phiMin}
                          onChange={(e) => setFiltros((f) => ({ ...f, phiMin: e.target.value }))}
                        />
                        <span className="text-[var(--color-neutral-400)]">–</span>
                        <input
                          className="input !h-8 !py-1 !px-2 text-[12px]"
                          placeholder="Máx"
                          inputMode="decimal"
                          value={filtros.phiMax}
                          onChange={(e) => setFiltros((f) => ({ ...f, phiMax: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Permeabilidade inicial k (mD)</span>
                    <div className="flex items-center gap-1">
                      <input
                        className="input !h-8 !py-1 !px-2 text-[12px]"
                        placeholder="Mín (mD)"
                        inputMode="decimal"
                        value={filtros.kMin}
                        onChange={(e) => setFiltros((f) => ({ ...f, kMin: e.target.value }))}
                      />
                      <span className="text-[var(--color-neutral-400)]">–</span>
                      <input
                        className="input !h-8 !py-1 !px-2 text-[12px]"
                        placeholder="Máx (mD)"
                        inputMode="decimal"
                        value={filtros.kMax}
                        onChange={(e) => setFiltros((f) => ({ ...f, kMax: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-[12px]">
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary !py-1"
                    onClick={() => setMarcadas(new Set([...marcadas, ...filtradas.map((a) => a.uuid)]))}
                    disabled={!filtradas.length}
                  >
                    Marcar as listadas ({filtradas.length})
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary !py-1"
                    onClick={() => setMarcadas(new Set())}
                    disabled={!marcadas.size}
                  >
                    Desmarcar
                  </button>
                </div>
                <span className="text-[11px] text-[var(--color-neutral-500)]">Clique na amostra p/ ver dados</span>
              </div>

              {base.carregando && !base.dados ? (
                <Carregando />
              ) : base.erro ? (
                <Aviso tipo="erro">{base.erro}</Aviso>
              ) : !filtradas.length ? (
                <p className="m-0 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">
                  {amostras.length
                    ? "Nenhuma amostra encontrada com esses filtros."
                    : "Ainda não há amostra com coreflooding e PVbt neste projeto."}
                </p>
              ) : (
                <ul className="m-0 p-0 list-none max-h-[420px] overflow-y-auto flex flex-col divide-y divide-[var(--color-neutral-200)] border border-[var(--color-neutral-200)] rounded-lg">
                  {filtradas.map((a) => {
                    const e0 = a.ensaios[0];
                    const acidosUnicos = [...new Set(a.ensaios.map(rotuloAcido).filter(Boolean))];
                    const tempsUnicas = [...new Set(a.ensaios.map(tempDoEnsaio).filter((x): x is number => x != null))];
                    const vazoesUnicas = [
                      ...new Set(
                        a.ensaios
                          .map((e) => (e.vazao_ml_min != null ? fmt(e.vazao_ml_min, 2) : null))
                          .filter((x): x is string => Boolean(x)),
                      ),
                    ];
                    const estaMarcada = marcadas.has(a.uuid);
                    const emDetalhe = amostraDetalheUuid === a.uuid;

                    return (
                      <li
                        key={a.uuid}
                        className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
                          emDetalhe
                            ? "bg-[var(--color-blue-50)]"
                            : estaMarcada
                            ? "bg-[var(--color-blue-50)]/40"
                            : "hover:bg-[var(--color-neutral-100)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 cursor-pointer"
                          checked={estaMarcada}
                          onChange={() => alternar(a.uuid)}
                          aria-label={`Selecionar amostra ${a.codigo}`}
                        />
                        <button
                          type="button"
                          onClick={() => setAmostraDetalheUuid(a.uuid)}
                          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-heading font-bold text-[14px] text-[var(--color-red)] group-hover:underline">
                              {a.codigo}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--color-blue-800)] flex items-center gap-1">
                              <Eye size={12} className="text-[var(--color-blue)]" />
                              {a.ensaios.length} ensaio(s)
                            </span>
                          </div>
                          <span className="block text-[12px] text-[var(--color-neutral-700)] truncate">
                            {a.litologia ?? "—"}
                            {e0?.porosidade_pct != null ? ` · φ ${fmt(e0.porosidade_pct, 1)}%` : ""}
                            {e0?.k_inicial_md != null ? ` · k ${fmt(e0.k_inicial_md, 2)} mD` : ""}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {acidosUnicos.slice(0, 2).map((ac) => (
                              <span
                                key={ac}
                                className="inline-block rounded bg-[var(--color-neutral-200)]/80 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-neutral-800)] truncate max-w-[170px]"
                              >
                                {ac}
                              </span>
                            ))}
                            {tempsUnicas.length > 0 && (
                              <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                {tempsUnicas.map((t) => `${t} °C`).join(", ")}
                              </span>
                            )}
                            {vazoesUnicas.length > 0 && (
                              <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-900">
                                Q: {vazoesUnicas.join(" / ")} mL/min
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="border-t border-[var(--color-neutral-200)] pt-3 flex flex-col gap-2">
                <label className="field">
                  <span className="rotulo">
                    Nome da série{" "}
                    <span className="normal-case tracking-normal font-normal text-[var(--color-neutral-500)]">
                      (vira a legenda)
                    </span>
                  </span>
                  <input
                    className="input"
                    placeholder="ex.: BLEND, HCl 15% + IC"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarSerie();
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={salvarSerie}
                    disabled={!nome.trim() || !marcadas.size}
                  >
                    {editando ? (
                      <>
                        <Check size={14} /> Salvar série
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> Criar série
                      </>
                    )}
                  </button>
                  {(editando || marcadas.size > 0 || nome) && (
                    <button type="button" className="btn btn-secondary" onClick={limparRascunho}>
                      <X size={14} /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Séries" subtitulo={series.length ? `${series.length} no gráfico` : "Nenhuma ainda"}>
            <ul className="m-0 p-0 list-none flex flex-col">
              {!series.length && (
                <li className="px-5 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">
                  Marque amostras, dê um nome e clique em "Criar série".
                </li>
              )}
              {prontas.map((s) => {
                const orig = series.find((x) => x.id === s.id)!;
                const faltam = orig.amostras.filter((u) => !porUuid.has(u)).length;
                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 px-5 py-3 border-t first:border-t-0 border-[var(--color-neutral-200)]"
                  >
                    <svg width="34" height="14" aria-hidden>
                      <line x1="0" x2="34" y1="7" y2="7" stroke="#000" />
                      <circle cx="17" cy="7" r="5" fill={s.cor} />
                    </svg>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[14px] text-[var(--color-blue-800)] truncate">{s.nome}</span>
                      <span className="block text-[12px] text-[var(--color-neutral-600)]">
                        {orig.amostras.length - faltam} amostra(s) · {s.pontos.length} ponto(s)
                        {faltam ? ` · ${faltam} fora deste projeto` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      title="Editar seleção e nome"
                      className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-blue)]"
                      onClick={() => editar(orig)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Apagar série"
                      className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-red)]"
                      onClick={() => apagar(orig)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </div>

        <div className="flex flex-col gap-6">
          {/* Painel de inspeção da amostra clicada (dados do core, temperatura, vazão, ácido e botão de seleção) */}
          {amostraDetalhe && (
            <ModalDetalheAmostraCore
              amostra={amostraDetalhe}
              selecionada={marcadas.has(amostraDetalhe.uuid)}
              aoAlternarSelecao={() => alternar(amostraDetalhe.uuid)}
              aoFechar={() => setAmostraDetalheUuid(null)}
            />
          )}

          <Cartao
            titulo="PVbt × Q"
            subtitulo="Volume de poros injetados até o breakthrough em função da vazão"
            acoes={
              prontas.length > 0 && (
                <div className="flex gap-2">
                  {(["png", "svg"] as const).map((f) => (
                    <button key={f} type="button" className="btn btn-secondary !py-1" onClick={() => baixar(f)}>
                      <Download size={14} /> {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              )
            }
          >
            <div className="p-6">
              {erro && (
                <div className="mb-4">
                  <Aviso tipo="erro">{erro}</Aviso>
                </div>
              )}
              {!prontas.length ? (
                <p className="m-0 py-20 text-center text-[13px] text-[var(--color-neutral-600)]">
                  Crie uma série para plotar o gráfico, ou clique em qualquer amostra à esquerda para inspecionar seus dados de coreflooding.
                </p>
              ) : (
                <>
                  {semVazao > 0 && (
                    <div className="mb-4">
                      <Aviso tipo="info">{semVazao} ensaio(s) ficaram de fora por não terem vazão ou PVbt.</Aviso>
                    </div>
                  )}
                  <GraficoComparacao ref={grafico} series={prontas} />
                </>
              )}
            </div>
          </Cartao>
        </div>
      </div>
    </div>
  );
}

function ModalDetalheAmostraCore(p: {
  amostra: AmostraPvbt;
  selecionada: boolean;
  aoAlternarSelecao: () => void;
  aoFechar: () => void;
}) {
  const { amostra, selecionada, aoAlternarSelecao, aoFechar } = p;
  const e0 = amostra.ensaios[0];

  const itensCore: { rotulo: string; valor: string }[] = [
    { rotulo: "Litologia", valor: amostra.litologia ?? "—" },
    {
      rotulo: "Dimensões (D × L)",
      valor:
        e0?.diametro_cm != null || e0?.comprimento_cm != null
          ? `${fmt(e0?.diametro_cm, 2)} cm × ${fmt(e0?.comprimento_cm, 2)} cm${
              e0?.dimensao_nominal_in ? ` (${e0.dimensao_nominal_in})` : ""
            }`
          : e0?.dimensao_nominal_in ?? "—",
    },
    {
      rotulo: "Porosidade (φ)",
      valor:
        e0?.porosidade_pct != null
          ? `${fmt(e0.porosidade_pct, 2)} %${e0.faixa_porosidade ? ` (${e0.faixa_porosidade})` : ""}`
          : "—",
    },
    {
      rotulo: "Volume Poroso (VP)",
      valor: e0?.volume_poroso_cm3 != null ? `${fmt(e0.volume_poroso_cm3, 2)} cm³` : "—",
    },
    {
      rotulo: "Permeabilidade Inicial (kᵢ)",
      valor:
        e0?.k_inicial_md != null
          ? `${fmt(e0.k_inicial_md, 3)} mD${e0.faixa_permeabilidade ? ` (${e0.faixa_permeabilidade})` : ""}`
          : "—",
    },
    {
      rotulo: "Pressão de Confinamento",
      valor: e0?.p_confinamento_psi != null ? `${fmt(e0.p_confinamento_psi, 0)} psi` : "—",
    },
  ];

  return (
    <Cartao
      titulo={`Dados da Amostra · ${amostra.codigo}`}
      subtitulo="Propriedades físicas do core e parâmetros dos ensaios de acidificação"
      acoes={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={aoAlternarSelecao}
            className={`btn !py-1.5 ${selecionada ? "btn-secondary" : "btn-primary"}`}
          >
            {selecionada ? (
              <>
                <Check size={14} /> Selecionada na série (remover)
              </>
            ) : (
              <>
                <Plus size={14} /> Selecionar para a série
              </>
            )}
          </button>
          <Link
            to={`/amostras/${amostra.uuid}`}
            className="btn btn-secondary !py-1.5 no-underline flex items-center gap-1.5"
            title="Abrir ficha completa da amostra"
          >
            <ExternalLink size={14} /> Ver ficha
          </Link>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 rounded-md text-[var(--color-neutral-500)] hover:bg-[var(--color-neutral-200)] cursor-pointer bg-transparent border-0"
            title="Fechar detalhes"
          >
            <X size={16} />
          </button>
        </div>
      }
    >
      <div className="p-5 flex flex-col gap-5">
        {/* Propriedades do Core */}
        <div>
          <h4 className="m-0 mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-blue-800)] flex items-center gap-1.5">
            <Layers size={14} /> Propriedades do Core (Rocha & Petrofísica)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {itensCore.map((item) => (
              <div
                key={item.rotulo}
                className="rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/60 px-3 py-2"
              >
                <span className="block text-[11px] text-[var(--color-neutral-500)]">{item.rotulo}</span>
                <span className="block text-[13px] font-semibold text-[var(--color-neutral-900)] tabular-nums">
                  {item.valor}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabela de Ensaios (Temperatura, Vazão, Ácido, PVbt, Wormhole) */}
        <div>
          <h4 className="m-0 mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-blue-800)]">
            Ensaios de Coreflooding / Acidificação ({amostra.ensaios.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-neutral-200)]">
            <table className="tabela w-full text-[12px]">
              <thead>
                <tr>
                  <th>Ensaio</th>
                  <th>Sistema Ácido / Fluido</th>
                  <th>Temp. (°C)</th>
                  <th>Vazão Q (mL/min)</th>
                  <th>Vel. Intersticial (cm/min)</th>
                  <th>PVbt</th>
                  <th>Wormhole (cm)</th>
                </tr>
              </thead>
              <tbody>
                {amostra.ensaios.map((e) => {
                  const ac = rotuloAcido(e) || "—";
                  const temp = e.temperatura_c ?? e.temperatura_nominal_c;
                  const lwh = e.comprimento_wormhole_uct_cm ?? e.comprimento_wormhole_cm;
                  return (
                    <tr key={e.id_experimento}>
                      <td className="font-semibold text-[var(--color-blue-800)] whitespace-nowrap">
                        {e.id_experimento}
                      </td>
                      <td>
                        <span className="font-medium text-[var(--color-neutral-900)]">{ac}</span>
                        {e.aditivo && (
                          <span className="block text-[11px] text-[var(--color-neutral-500)]">
                            Aditivo: {e.aditivo}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums whitespace-nowrap">
                        {temp != null ? `${fmt(temp, 0)} °C` : "—"}
                      </td>
                      <td className="tabular-nums font-semibold whitespace-nowrap">
                        {e.vazao_ml_min != null ? `${fmt(e.vazao_ml_min, 2)} mL/min` : "—"}
                      </td>
                      <td className="tabular-nums whitespace-nowrap">
                        {e.vel_intersticial_cm_min != null ? fmt(e.vel_intersticial_cm_min, 4) : "—"}
                      </td>
                      <td className="tabular-nums font-bold text-[var(--color-red)] whitespace-nowrap">
                        {e.breakthrough === false ? "Sem BT" : fmtExato(e.pvbt)}
                        {e.pvbt_condicao && (
                          <span className="block font-normal text-[10px] text-[var(--color-neutral-500)]">
                            {e.pvbt_condicao}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums whitespace-nowrap">
                        {lwh != null ? `${fmt(lwh, 2)}${e.lwh_referencia ? ` (${e.lwh_referencia})` : ""}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Cartao>
  );
}
