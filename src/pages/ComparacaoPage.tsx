import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2, Check, Download, ExternalLink, Eye, Filter, FlaskConical, FolderKanban, Layers, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, X,
} from "lucide-react";
import { Aviso, CabecalhoPagina, Carregando, Cartao } from "../components/ui/base";
import {
  CORES_SERIE, GraficoComparacao, MARCADORES_SERIE, type ExportarComparacao, type SerieGrafico,
} from "../components/pvbt/GraficoComparacao";
import { useConsulta } from "../hooks/useConsulta";
import { supabase } from "../lib/supabase";
import { listarLitologias, listarSistemasAcidos, obterAmostra, obterControleDaAmostra } from "../servicos/amostras";
import { listarEmpresas, listarProjetos } from "../servicos/contexto";
import { listarPvbt } from "../servicos/pvbt";
import { useContexto } from "../store/useContexto";
import type { FontePvbt, PontoPvbt, SistemaAcido } from "../tipos/banco";
import { fmt, fmtExato, mensagemErro } from "../utils/formatacao";
import { classeStatus, STATUS_ROTULO } from "../utils/status";

// Comparação de resultados (PVbt × Q): permite comparar amostras e resultados de vários projetos e empresas,
// filtrar por litologia, fluidos/sistemas ácidos do catálogo, temperatura, vazão e propriedades do core,
// e clicar em qualquer amostra (na lista, nas selecionadas ou nas séries) para ver todos os detalhes.

interface AmostraPvbt {
  uuid: string;
  amostraUuidLab: string | null;
  codigo: string;
  litologia: string | null;
  fonte: FontePvbt;
  empresaId: string | null;
  empresaSigla: string;
  empresaNome: string;
  projetoId: string | null;
  projetoCodigo: string;
  projetoNome: string;
  ensaios: PontoPvbt[];
}
interface Serie {
  id: string;
  nome: string;
  amostras: string[];
}

interface FiltrosComparacao {
  empresa: string;
  projeto: string;
  incluirLiteratura: boolean;
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
  empresa: "",
  projeto: "",
  incluirLiteratura: false,
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

/** Rótulo legível do sistema ácido/fluido do ensaio, usando o catálogo quando disponível. */
function descreverSistemaEnsaio(e: PontoPvbt, porSistema: Map<string, SistemaAcido>): string {
  const sis = e.id_sistema ? porSistema.get(e.id_sistema) : undefined;
  if (sis) {
    return `${sis.id_sistema} — ${sis.nome_sistema}`;
  }
  const partes: string[] = [];
  if (e.acido) partes.push(e.acido);
  if (e.conc_valor != null) partes.push(`${fmt(e.conc_valor, 2)}${e.conc_unidade ? ` ${e.conc_unidade}` : ""}`);
  if (e.aditivo) partes.push(`+ ${e.aditivo}`);
  if (partes.length > 0) return partes.join(" ");
  return (e.tratamento || e.id_sistema || "").trim();
}

function tempDoEnsaio(e: PontoPvbt): number | null {
  const t = e.temperatura_nominal_c ?? e.temperatura_c;
  return t != null && Number.isFinite(Number(t)) ? Math.round(Number(t)) : null;
}

async function listarFluidosCatalogo(): Promise<string[]> {
  const { data, error } = await supabase.from("fluidos_prop").select("componente").order("componente");
  if (error || !data) return [];
  return data.map((r: { componente: string }) => r.componente).filter(Boolean);
}

export function ComparacaoPage() {
  const projetoIdContexto = useContexto((s) => s.projetoId);
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
  const painelDetalheRef = useRef<HTMLDivElement>(null);

  useEffect(() => guardar(series), [series]);

  // Carrega todos os resultados de PVbt acessíveis (vários projetos, empresas e fontes)
  const base = useConsulta(() => listarPvbt(), []);
  const empresasCat = useConsulta(listarEmpresas, []);
  const projetosCat = useConsulta(() => listarProjetos(), []);
  const litologiasCat = useConsulta(listarLitologias, []);
  const sistemasCat = useConsulta(listarSistemasAcidos, []);
  const fluidosCat = useConsulta(listarFluidosCatalogo, []);

  const porSistema = useMemo(
    () => new Map((sistemasCat.dados ?? []).map((s) => [s.id_sistema, s])),
    [sistemasCat.dados],
  );
  const porEmpresa = useMemo(
    () => new Map((empresasCat.dados ?? []).map((e) => [e.id, e])),
    [empresasCat.dados],
  );
  const porProjeto = useMemo(
    () => new Map((projetosCat.dados ?? []).map((p) => [p.id, p])),
    [projetosCat.dados],
  );

  // Todas as amostras com PVbt (de todos os projetos e empresas que o usuário tem acesso)
  const todasAmostras = useMemo<AmostraPvbt[]>(() => {
    const por = new Map<string, AmostraPvbt>();
    for (const e of base.dados ?? []) {
      if (e.pvbt == null) continue;
      const chave = e.amostra_uuid ?? `${e.fonte}:${e.id_amostra || e.id_experimento}`;
      const proj = e.projeto_id ? porProjeto.get(e.projeto_id) : undefined;
      const emp = proj ? porEmpresa.get(proj.empresa_id) : undefined;

      const empresaId = emp?.id ?? (e.fonte === "Petrobras" ? "fonte:Petrobras" : e.fonte === "Literatura" ? "fonte:Literatura" : null);
      const empresaSigla = emp?.sigla ?? (e.fonte === "Petrobras" ? "PETROBRAS" : e.fonte === "Literatura" ? "LITERATURA" : e.fonte);
      const empresaNome = emp?.nome ?? (e.fonte === "Petrobras" ? "Petrobras" : e.fonte === "Literatura" ? "Literatura Científica" : e.fonte);
      const projetoId = proj?.id ?? (e.fonte === "Petrobras" ? `petrobras:${e.estudo ?? "geral"}` : e.fonte === "Literatura" ? `lit:${e.id_referencia ?? "geral"}` : e.projeto_id);
      const projetoCodigo = proj?.codigo ?? (e.fonte === "Petrobras" ? (e.estudo ?? "Petrobras") : e.fonte === "Literatura" ? (e.id_referencia ?? "Literatura") : "—");
      const projetoNome = proj?.nome ?? (e.fonte === "Petrobras" ? (e.estudo ?? "Base Petrobras") : e.fonte === "Literatura" ? (e.referencia_autor ?? e.id_referencia ?? "Literatura") : "—");

      const a = por.get(chave) ?? {
        uuid: chave,
        amostraUuidLab: e.amostra_uuid ?? null,
        codigo: e.id_amostra || e.id_experimento || chave,
        litologia: e.litologia,
        fonte: e.fonte,
        empresaId,
        empresaSigla,
        empresaNome,
        projetoId,
        projetoCodigo,
        projetoNome,
        ensaios: [],
      };
      a.ensaios.push(e);
      por.set(chave, a);
    }
    return [...por.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
  }, [base.dados, porProjeto, porEmpresa]);

  // Amostras considerando o escopo de literatura (por padrão mostra todas as empresas e projetos de laboratório/Petrobras)
  const amostras = useMemo(
    () =>
      todasAmostras.filter((a) => {
        if (!filtros.incluirLiteratura && a.fonte === "Literatura" && filtros.empresa !== "fonte:Literatura") {
          return false;
        }
        return true;
      }),
    [todasAmostras, filtros.incluirLiteratura, filtros.empresa],
  );

  // Mapa completo por uuid (para que séries salvas com amostras de qualquer projeto/empresa ou literatura sempre funcionem)
  const porUuid = useMemo(() => new Map(todasAmostras.map((a) => [a.uuid, a])), [todasAmostras]);

  // Opções para os selects de filtro (empresas, projetos, ácidos, sistemas ácidos, fluidos e litologias do catálogo)
  const opcoesFiltro = useMemo(() => {
    // Empresas cadastradas + fontes com dados
    const empresasOpcoes = new Map<string, { id: string; sigla: string; nome: string }>();
    for (const emp of empresasCat.dados ?? []) {
      empresasOpcoes.set(emp.id, { id: emp.id, sigla: emp.sigla, nome: emp.nome });
    }
    for (const a of todasAmostras) {
      if (a.empresaId && !empresasOpcoes.has(a.empresaId)) {
        empresasOpcoes.set(a.empresaId, { id: a.empresaId, sigla: a.empresaSigla, nome: a.empresaNome });
      }
    }

    // Projetos cadastrados + projetos das amostras (filtrados pela empresa se alguma estiver selecionada)
    const projetosOpcoes = new Map<string, { id: string; codigo: string; nome: string; empresaId: string | null; empresaSigla: string }>();
    for (const proj of projetosCat.dados ?? []) {
      const emp = porEmpresa.get(proj.empresa_id);
      if (filtros.empresa && proj.empresa_id !== filtros.empresa) continue;
      projetosOpcoes.set(proj.id, {
        id: proj.id,
        codigo: proj.codigo,
        nome: proj.nome,
        empresaId: proj.empresa_id,
        empresaSigla: emp?.sigla ?? "—",
      });
    }
    for (const a of todasAmostras) {
      if (!a.projetoId) continue;
      if (filtros.empresa && a.empresaId !== filtros.empresa) continue;
      if (!projetosOpcoes.has(a.projetoId)) {
        projetosOpcoes.set(a.projetoId, {
          id: a.projetoId,
          codigo: a.projetoCodigo,
          nome: a.projetoNome,
          empresaId: a.empresaId,
          empresaSigla: a.empresaSigla,
        });
      }
    }

    const litologiasMap = new Map<string, string>();
    for (const l of litologiasCat.dados ?? []) {
      if (l.nome?.trim()) litologiasMap.set(l.nome.trim().toLowerCase(), l.nome.trim());
    }
    for (const a of todasAmostras) {
      if (a.litologia?.trim()) {
        const k = a.litologia.trim().toLowerCase();
        if (!litologiasMap.has(k)) litologiasMap.set(k, a.litologia.trim());
      }
    }

    // Fluidos / componentes químicos do catálogo (fluidos_prop + componentes de sistemas_acidos + ácidos dos ensaios), sem duplicar maiúsculas/minúsculas (HCl vs HCL)
    const fluidosMap = new Map<string, string>();
    const addFluido = (nome: string | null | undefined) => {
      const limpo = (nome ?? "").trim();
      if (!limpo) return;
      const chave = limpo.toLowerCase();
      // Prefere grafia padrão "HCl" em vez de "HCL"
      if (chave === "hcl") {
        fluidosMap.set(chave, "HCl");
        return;
      }
      if (!fluidosMap.has(chave)) fluidosMap.set(chave, limpo);
    };

    for (const f of fluidosCat.dados ?? []) addFluido(f);
    for (const s of sistemasCat.dados ?? []) {
      addFluido(s.componente_1);
      addFluido(s.componente_2);
    }
    for (const a of todasAmostras) {
      for (const e of a.ensaios) addFluido(e.acido);
    }

    const sistemasLista = [...(sistemasCat.dados ?? [])].sort((a, b) =>
      a.id_sistema.localeCompare(b.id_sistema, "pt-BR", { numeric: true }),
    );

    const temperaturas = new Set<number>();
    for (const a of todasAmostras) {
      for (const e of a.ensaios) {
        const t = tempDoEnsaio(e);
        if (t != null) temperaturas.add(t);
      }
    }

    return {
      empresas: [...empresasOpcoes.values()].sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR")),
      projetos: [...projetosOpcoes.values()].sort((a, b) =>
        `${a.empresaSigla} ${a.codigo}`.localeCompare(`${b.empresaSigla} ${b.codigo}`, "pt-BR"),
      ),
      litologias: [...litologiasMap.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
      fluidos: [...fluidosMap.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
      sistemas: sistemasLista,
      temperaturas: [...temperaturas].sort((a, b) => a - b),
    };
  }, [todasAmostras, empresasCat.dados, projetosCat.dados, porEmpresa, filtros.empresa, litologiasCat.dados, sistemasCat.dados, fluidosCat.dados]);

  const qtdFiltrosCoreAtivos = useMemo(
    () =>
      [
        filtros.litologia,
        filtros.acido,
        filtros.temperatura,
        filtros.vazaoMin,
        filtros.vazaoMax,
        filtros.kMin,
        filtros.kMax,
        filtros.phiMin,
        filtros.phiMax,
      ].filter((v) => v.trim() !== "").length,
    [filtros],
  );

  const qtdFiltrosAtivos = useMemo(
    () =>
      qtdFiltrosCoreAtivos +
      (filtros.empresa ? 1 : 0) +
      (filtros.projeto ? 1 : 0) +
      (filtros.incluirLiteratura ? 1 : 0),
    [qtdFiltrosCoreAtivos, filtros.empresa, filtros.projeto, filtros.incluirLiteratura],
  );

  const ensaioPassaNosFiltros = (e: PontoPvbt): boolean => {
    if (filtros.acido) {
      const sis = e.id_sistema ? porSistema.get(e.id_sistema) : undefined;
      if (filtros.acido.startsWith("sis:")) {
        const idAlvo = filtros.acido.slice(4);
        if (e.id_sistema !== idAlvo) return false;
      } else if (filtros.acido.startsWith("fluido:")) {
        const fluidoAlvo = filtros.acido.slice(7).toLowerCase();
        const candidatos = [
          e.acido,
          e.aditivo,
          e.tratamento,
          sis?.componente_1,
          sis?.componente_2,
          sis?.aditivos,
          sis?.nome_sistema,
        ]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());
        if (!candidatos.some((c) => c === fluidoAlvo || c.includes(fluidoAlvo))) return false;
      }
    }

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
      if (filtros.empresa && a.empresaId !== filtros.empresa) return false;
      if (filtros.projeto && a.projetoId !== filtros.projeto) return false;
      if (filtros.litologia && (a.litologia ?? "").trim().toLowerCase() !== filtros.litologia.toLowerCase()) return false;
      if (t) {
        const textoAmostra = [
          a.codigo,
          a.litologia ?? "",
          a.empresaSigla,
          a.empresaNome,
          a.projetoCodigo,
          a.projetoNome,
          ...a.ensaios.map((e) => `${descreverSistemaEnsaio(e, porSistema)} ${e.id_experimento ?? ""} ${tempDoEnsaio(e) ?? ""}C`),
        ]
          .join(" ")
          .toLowerCase();
        if (!textoAmostra.includes(t)) return false;
      }
      if (qtdFiltrosCoreAtivos > 0) {
        const temEnsaioCompativel = a.ensaios.some(ensaioPassaNosFiltros);
        if (!temEnsaioCompativel) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostras, busca, filtros, qtdFiltrosCoreAtivos, porSistema]);

  // séries prontas para o gráfico: PVbt × vazão de cada ensaio das amostras da série
  const { prontas, semVazao } = useMemo(() => {
    let sem = 0;
    const prontas: SerieGrafico[] = series.map((s, i) => {
      const pontos = s.amostras
        .flatMap((u) => {
          const am = porUuid.get(u);
          return (am?.ensaios ?? []).map((e) => ({ am: am!, e }));
        })
        .flatMap(({ am, e }) => {
          if ((e.vazao_ml_min ?? 0) <= 0 || (e.pvbt ?? 0) <= 0) {
            sem++;
            return [];
          }
          const ac = descreverSistemaEnsaio(e, porSistema);
          const ctx = am.projetoCodigo && am.projetoCodigo !== "—" ? `${am.empresaSigla} · ${am.projetoCodigo}` : am.empresaSigla;
          return [
            {
              x: Number(e.vazao_ml_min),
              y: Number(e.pvbt),
              detalhe: `[${ctx}] ${e.id_amostra} · ${e.id_experimento}${ac ? ` · ${ac}` : ""}${
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
  }, [series, porUuid, porSistema]);

  const abrirDetalhesAmostra = (uuid: string) => {
    setAmostraDetalheUuid(uuid);
    setTimeout(() => {
      painelDetalheRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const alternar = (u: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(u)) {
        n.delete(u);
      } else {
        n.add(u);
        // Ao selecionar uma amostra, já abre os detalhes dela automaticamente para conferência
        setAmostraDetalheUuid(u);
      }
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
    const validas = s.amostras.filter((u) => porUuid.has(u));
    setMarcadas(new Set(validas));
    if (validas.length > 0) setAmostraDetalheUuid(validas[0]);
  }
  function apagar(s: Serie) {
    if (!confirm(`Apagar a série "${s.nome}"?`)) return;
    setSeries((l) => l.filter((x) => x.id !== s.id));
    if (editando === s.id) limparRascunho();
  }
  const baixar = (f: "png" | "svg") => grafico.current?.baixar(f, "comparacao_pvbt_q").catch((e) => setErro(mensagemErro(e)));

  const amostraDetalhe = amostraDetalheUuid ? porUuid.get(amostraDetalheUuid) ?? null : null;
  const listaMarcadas = useMemo(
    () => [...marcadas].map((u) => porUuid.get(u)).filter((a): a is AmostraPvbt => Boolean(a)),
    [marcadas, porUuid],
  );

  return (
    <div>
      <CabecalhoPagina
        titulo="Comparação de resultados"
        subtitulo="Compare resultados de PVbt × Q entre vários projetos e empresas, filtre pelos fluidos e sistemas ácidos do catálogo e clique nas amostras para inspecionar seus detalhes"
      />

      <div className="px-7 pb-10 grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-6 items-start">
        <div className="flex flex-col gap-6">
          <Cartao
            titulo={editando ? "Editando série" : "Nova série"}
            subtitulo={`${filtradas.length} de ${amostras.length} amostra(s) · ${marcadas.size} selecionada(s)`}
          >
            <div className="p-4 flex flex-col gap-3">
              {/* Busca + Botão de Filtros */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                  <input
                    className="input !pl-9"
                    placeholder="Buscar por amostra, empresa, projeto, litotipo ou ácido…"
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
                  title="Filtrar amostras por empresa, projeto, ácido/fluido do catálogo, temperatura, vazão, porosidade e permeabilidade"
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

              {/* Seletores rápidos de Empresas e Projetos (permite comparar vários projetos e empresas) */}
              <div className="rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/65 p-2.5 flex flex-col gap-2 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-blue-800)] flex items-center gap-1">
                    <Building2 size={12} /> Empresas & Projetos
                  </span>
                  <div className="flex items-center gap-2">
                    {projetoIdContexto && (
                      <button
                        type="button"
                        onClick={() =>
                          setFiltros((f) => ({
                            ...f,
                            empresa: "",
                            projeto: f.projeto === projetoIdContexto ? "" : projetoIdContexto,
                          }))
                        }
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold border cursor-pointer transition-colors ${
                          filtros.projeto === projetoIdContexto
                            ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white"
                            : "border-[var(--color-neutral-300)] bg-white text-[var(--color-neutral-700)] hover:border-[var(--color-blue)]"
                        }`}
                        title="Alternar entre apenas o projeto aberto no menu lateral ou todos os projetos"
                      >
                        {filtros.projeto === projetoIdContexto ? "Só projeto atual ✓" : "Todos os projetos"}
                      </button>
                    )}
                    <label className="inline-flex items-center gap-1 text-[11px] text-[var(--color-neutral-700)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={filtros.incluirLiteratura}
                        onChange={(e) => setFiltros((f) => ({ ...f, incluirLiteratura: e.target.checked }))}
                      />
                      <span>+ Literatura</span>
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold text-[var(--color-neutral-600)]">Empresa / Instituição</span>
                    <select
                      className="input !h-8 !py-1 text-[12px]"
                      value={filtros.empresa}
                      onChange={(e) =>
                        setFiltros((f) => ({
                          ...f,
                          empresa: e.target.value,
                          projeto: "",
                        }))
                      }
                    >
                      <option value="">Todas as empresas ({opcoesFiltro.empresas.length})</option>
                      {opcoesFiltro.empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.sigla} — {emp.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold text-[var(--color-neutral-600)] flex items-center gap-1">
                      <FolderKanban size={11} /> Projeto
                    </span>
                    <select
                      className="input !h-8 !py-1 text-[12px]"
                      value={filtros.projeto}
                      onChange={(e) => setFiltros((f) => ({ ...f, projeto: e.target.value }))}
                    >
                      <option value="">Todos os projetos ({opcoesFiltro.projetos.length})</option>
                      {opcoesFiltro.projetos.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.empresaSigla} · {proj.codigo}
                          {proj.nome && proj.nome !== proj.codigo ? ` (${proj.nome})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                      <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Litologia (Catálogo)</span>
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
                    <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">
                      Sistema Ácido / Fluido (Catálogo)
                    </span>
                    <select
                      className="input !h-8 !py-1 text-[12px]"
                      value={filtros.acido}
                      onChange={(e) => setFiltros((f) => ({ ...f, acido: e.target.value }))}
                    >
                      <option value="">
                        Todos ({opcoesFiltro.fluidos.length} fluidos · {opcoesFiltro.sistemas.length} sistemas)
                      </option>
                      {opcoesFiltro.fluidos.length > 0 && (
                        <optgroup label={`Fluidos e Ácidos (${opcoesFiltro.fluidos.length})`}>
                          {opcoesFiltro.fluidos.map((fl) => (
                            <option key={`fluido:${fl}`} value={`fluido:${fl}`}>
                              {fl}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {opcoesFiltro.sistemas.length > 0 && (
                        <optgroup label={`Sistemas Ácidos do Catálogo (${opcoesFiltro.sistemas.length})`}>
                          {opcoesFiltro.sistemas.map((s) => (
                            <option key={`sis:${s.id_sistema}`} value={`sis:${s.id_sistema}`}>
                              {s.id_sistema} — {s.nome_sistema}
                              {s.aditivos ? ` (${s.aditivos})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
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
                <span className="text-[11px] text-[var(--color-neutral-500)]">Clique na amostra p/ detalhes</span>
              </div>

              {base.carregando && !base.dados ? (
                <Carregando />
              ) : base.erro ? (
                <Aviso tipo="erro">{base.erro}</Aviso>
              ) : !filtradas.length ? (
                <p className="m-0 py-6 text-center text-[13px] text-[var(--color-neutral-600)]">
                  {amostras.length
                    ? "Nenhuma amostra encontrada com esses filtros."
                    : "Ainda não há amostras com coreflooding e PVbt disponíveis."}
                </p>
              ) : (
                <ul className="m-0 p-0 list-none max-h-[380px] overflow-y-auto flex flex-col divide-y divide-[var(--color-neutral-200)] border border-[var(--color-neutral-200)] rounded-lg">
                  {filtradas.map((a) => {
                    const e0 = a.ensaios[0];
                    const sistemasUnicos = [
                      ...new Set(a.ensaios.map((e) => descreverSistemaEnsaio(e, porSistema)).filter(Boolean)),
                    ];
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
                    const rotuloContexto =
                      a.projetoCodigo && a.projetoCodigo !== "—" && a.projetoCodigo !== a.empresaSigla
                        ? `${a.empresaSigla} · ${a.projetoCodigo}`
                        : a.empresaSigla;

                    return (
                      <li
                        key={a.uuid}
                        className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
                          emDetalhe
                            ? "bg-[var(--color-blue-50)] ring-1 ring-inset ring-[var(--color-blue)]"
                            : estaMarcada
                            ? "bg-[var(--color-blue-50)]/45"
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
                          onClick={() => abrirDetalhesAmostra(a.uuid)}
                          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer group"
                          title={`Clique para ver todos os detalhes da amostra ${a.codigo}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-heading font-bold text-[14px] text-[var(--color-red)] group-hover:underline truncate">
                                {a.codigo}
                              </span>
                              <span className="shrink-0 inline-block rounded bg-[var(--color-blue-100)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-blue-800)]">
                                {rotuloContexto}
                              </span>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-[var(--color-blue-800)] flex items-center gap-1 group-hover:text-[var(--color-blue)]">
                              <Eye size={12} className="text-[var(--color-blue)]" />
                              Detalhes ({a.ensaios.length})
                            </span>
                          </div>
                          <span className="block text-[12px] text-[var(--color-neutral-700)] truncate">
                            {a.litologia ?? "—"}
                            {e0?.porosidade_pct != null ? ` · φ ${fmt(e0.porosidade_pct, 1)}%` : ""}
                            {e0?.k_inicial_md != null ? ` · k ${fmt(e0.k_inicial_md, 2)} mD` : ""}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {sistemasUnicos.slice(0, 2).map((ac) => (
                              <span
                                key={ac}
                                className="inline-block rounded bg-[var(--color-neutral-200)]/80 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-neutral-800)] truncate max-w-[200px]"
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

              {/* Amostras Selecionadas Clicáveis */}
              {listaMarcadas.length > 0 && (
                <div className="rounded-lg border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/60 p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-blue-800)]">
                    <span>Amostras selecionadas ({listaMarcadas.length}) — clique para ver detalhes:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {listaMarcadas.map((a) => {
                      const ativa = amostraDetalheUuid === a.uuid;
                      return (
                        <div
                          key={a.uuid}
                          className={`inline-flex items-center rounded-md border text-[12px] font-semibold transition-all ${
                            ativa
                              ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white shadow-sm"
                              : "border-[var(--color-blue-200)] bg-white text-[var(--color-blue-800)] hover:border-[var(--color-blue)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => abrirDetalhesAmostra(a.uuid)}
                            className="flex items-center gap-1 px-2 py-1 bg-transparent border-0 cursor-pointer text-inherit"
                            title={`Ver detalhes de ${a.codigo} (${a.empresaSigla} · ${a.projetoCodigo})`}
                          >
                            <Eye size={12} />
                            <span>{a.codigo}</span>
                            <span className="opacity-75 text-[10px] font-normal">({a.empresaSigla})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => alternar(a.uuid)}
                            className={`px-1.5 py-1 border-l bg-transparent border-0 cursor-pointer ${
                              ativa
                                ? "border-white/30 text-white/90 hover:text-white"
                                : "border-[var(--color-neutral-200)] text-[var(--color-neutral-500)] hover:text-[var(--color-red)]"
                            }`}
                            title={`Remover ${a.codigo} da seleção`}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                    placeholder="ex.: LCPETRO vs Petrobras — HCl 15%"
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
                  Marque amostras (de um ou mais projetos/empresas), dê um nome e clique em "Criar série".
                </li>
              )}
              {prontas.map((s) => {
                const orig = series.find((x) => x.id === s.id)!;
                const amostrasDaSerie = orig.amostras.map((u) => porUuid.get(u)).filter((a): a is AmostraPvbt => Boolean(a));
                const empresasDaSerie = [...new Set(amostrasDaSerie.map((a) => a.empresaSigla))];
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 px-5 py-3 border-t first:border-t-0 border-[var(--color-neutral-200)]"
                  >
                    <div className="flex items-center gap-3">
                      <svg width="34" height="14" aria-hidden>
                        <line x1="0" x2="34" y1="7" y2="7" stroke="#000" />
                        <circle cx="17" cy="7" r="5" fill={s.cor} />
                      </svg>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-[14px] text-[var(--color-blue-800)] truncate">{s.nome}</span>
                        <span className="block text-[12px] text-[var(--color-neutral-600)]">
                          {amostrasDaSerie.length} amostra(s) · {s.pontos.length} ponto(s)
                          {empresasDaSerie.length > 0 ? ` · ${empresasDaSerie.join(", ")}` : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        title="Editar seleção e nome"
                        className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-blue)] cursor-pointer bg-transparent border-0"
                        onClick={() => editar(orig)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        title="Apagar série"
                        className="p-1 text-[var(--color-neutral-500)] hover:text-[var(--color-red)] cursor-pointer bg-transparent border-0"
                        onClick={() => apagar(orig)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {amostrasDaSerie.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-[46px]">
                        {amostrasDaSerie.map((a) => (
                          <button
                            key={a.uuid}
                            type="button"
                            onClick={() => abrirDetalhesAmostra(a.uuid)}
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold cursor-pointer border transition-colors ${
                              amostraDetalheUuid === a.uuid
                                ? "border-[var(--color-blue)] bg-[var(--color-blue)] text-white"
                                : "border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] text-[var(--color-blue-800)] hover:border-[var(--color-blue)]"
                            }`}
                            title={`Clique para ver os detalhes da amostra ${a.codigo} (${a.empresaSigla} · ${a.projetoCodigo})`}
                          >
                            <Eye size={11} />
                            <span>{a.codigo}</span>
                            <span className="opacity-70 text-[9px]">({a.empresaSigla})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Cartao>
        </div>

        <div className="flex flex-col gap-6" ref={painelDetalheRef}>
          {/* Painel completo de inspeção da amostra clicada */}
          {amostraDetalhe && (
            <ModalDetalheAmostraCore
              amostra={amostraDetalhe}
              porSistema={porSistema}
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
                  Crie uma série para plotar o gráfico, ou clique em qualquer amostra à esquerda para inspecionar todos os seus dados.
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

interface CorefloodExtra {
  id: number;
  data_ensaio: string | null;
  id_sistema: string | null;
  vazao_ml_min: number | null;
  temperatura_c: number | null;
  pressao_confinamento_psi: number | null;
  contrapressao_psi: number | null;
  dp_inicial_psi: number | null;
  dp_final_psi: number | null;
  razao_dp: number | null;
  volume_poroso_usado_cm3: number | null;
  volume_morto_cm3: number | null;
  equipamento_aquisicao: string | null;
  pvbt: number | null;
  breakthrough: boolean | null;
  criterio_bt: string | null;
  observacoes: string | null;
}

function ModalDetalheAmostraCore(p: {
  amostra: AmostraPvbt;
  porSistema: Map<string, SistemaAcido>;
  selecionada: boolean;
  aoAlternarSelecao: () => void;
  aoFechar: () => void;
}) {
  const { amostra, porSistema, selecionada, aoAlternarSelecao, aoFechar } = p;
  const e0 = amostra.ensaios[0];
  const uuidLab = amostra.amostraUuidLab;

  // Busca dados completos da amostra em v_amostras, observações do controle e registros detalhados de analise_coreflooding (quando é amostra do laboratório)
  const ficha = useConsulta(() => (uuidLab ? obterAmostra(uuidLab) : Promise.resolve(null)), [uuidLab]);
  const controle = useConsulta(() => (uuidLab ? obterControleDaAmostra(uuidLab) : Promise.resolve(null)), [uuidLab]);
  const corefloods = useConsulta(async () => {
    if (!uuidLab) return [];
    const { data } = await supabase
      .from("analise_coreflooding")
      .select("*")
      .eq("amostra_id", uuidLab)
      .order("id", { ascending: true });
    return (data ?? []) as CorefloodExtra[];
  }, [uuidLab]);

  const cfPorId = useMemo(
    () => new Map((corefloods.dados ?? []).map((c) => [c.id, c])),
    [corefloods.dados],
  );

  const resumo = ficha.dados;
  const origemTxt = useMemo(() => {
    if (!resumo) return e0?.estudo ?? e0?.referencia_autor ?? null;
    if (resumo.tipo_origem === "testemunho") {
      return [
        resumo.poco && `Poço ${resumo.poco}`,
        resumo.campo && `Campo ${resumo.campo}`,
        resumo.bacia && `Bacia ${resumo.bacia}`,
        resumo.reservatorio && `Res. ${resumo.reservatorio}`,
        resumo.profundidade_m != null && `${fmt(resumo.profundidade_m, 1)} m`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return [resumo.afloramento_local, resumo.fornecedor].filter(Boolean).join(" · ");
  }, [resumo, e0]);

  const diam = resumo?.diametro_cm ?? e0?.diametro_cm;
  const comp = resumo?.comprimento_cm ?? e0?.comprimento_cm;
  const phi = resumo?.porosidade_pct ?? e0?.porosidade_pct;
  const vp = resumo?.volume_poroso_cm3 ?? e0?.volume_poroso_cm3;
  const ki = e0?.k_inicial_md ?? resumo?.k_liquido_md ?? resumo?.k_gas_md;
  const pConf = e0?.p_confinamento_psi ?? resumo?.pressao_confinamento_psi;

  const itensCore: { rotulo: string; valor: string }[] = [
    {
      rotulo: "Empresa / Projeto",
      valor: `${amostra.empresaSigla}${amostra.projetoCodigo && amostra.projetoCodigo !== "—" ? ` · ${amostra.projetoCodigo}` : ""}`,
    },
    { rotulo: "Litologia", valor: resumo?.litologia ?? amostra.litologia ?? "—" },
    {
      rotulo: "Origem / Procedência",
      valor: resumo
        ? `${resumo.tipo_origem}${origemTxt ? ` · ${origemTxt}` : ""}`
        : `${amostra.fonte}${origemTxt ? ` · ${origemTxt}` : ""}`,
    },
    {
      rotulo: "Dimensões do Core (D × L)",
      valor:
        diam != null || comp != null
          ? `${fmt(diam, 2)} cm × ${fmt(comp, 2)} cm${e0?.dimensao_nominal_in ? ` (${e0.dimensao_nominal_in})` : ""}`
          : e0?.dimensao_nominal_in ?? "—",
    },
    {
      rotulo: "Massa Seca",
      valor: resumo?.massa_seca_g != null ? `${fmt(resumo.massa_seca_g, 2)} g` : "—",
    },
    {
      rotulo: "Porosidade (φ)",
      valor: phi != null ? `${fmt(phi, 2)} %${e0?.faixa_porosidade ? ` (${e0.faixa_porosidade})` : ""}` : "—",
    },
    {
      rotulo: "Volume Poroso (VP)",
      valor: vp != null ? `${fmt(vp, 2)} cm³` : "—",
    },
    {
      rotulo: "Permeabilidade ao Gás (k_gás)",
      valor: resumo?.k_gas_md != null ? `${fmt(resumo.k_gas_md, 3)} mD` : "—",
    },
    {
      rotulo: "Permeabilidade Inicial (kᵢ)",
      valor: ki != null ? `${fmt(ki, 3)} mD${e0?.faixa_permeabilidade ? ` (${e0.faixa_permeabilidade})` : ""}` : "—",
    },
    {
      rotulo: "Permeabilidade Pós-Ácido",
      valor: resumo?.k_liquido_depois_md != null ? `${fmt(resumo.k_liquido_depois_md, 3)} mD` : "—",
    },
    {
      rotulo: "Pressão de Confinamento",
      valor: pConf != null ? `${fmt(pConf, 0)} psi` : "—",
    },
    {
      rotulo: "Outras Análises na Ficha",
      valor: resumo
        ? [
            resumo.n_petrofisica > 0 && `${resumo.n_petrofisica} Petrofísica`,
            resumo.n_coreflooding > 0 && `${resumo.n_coreflooding} Coreflooding`,
            resumo.n_microct > 0 && `${resumo.n_microct} Micro-CT`,
            resumo.n_drx > 0 && `${resumo.n_drx} DRX`,
            resumo.n_petrografia > 0 && `${resumo.n_petrografia} Petrografia`,
            resumo.n_mev > 0 && `${resumo.n_mev} MEV`,
          ]
            .filter(Boolean)
            .join(" · ") || "—"
        : "—",
    },
  ];

  return (
    <Cartao
      titulo={`Detalhes da Amostra · ${amostra.codigo}`}
      subtitulo={
        resumo
          ? `${resumo.empresa} · ${resumo.projeto} · Status: ${STATUS_ROTULO[resumo.status] ?? resumo.status}`
          : `${amostra.empresaNome} · ${amostra.projetoNome}`
      }
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          {resumo && <span className={classeStatus(resumo.status)}>{STATUS_ROTULO[resumo.status]}</span>}
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
          {uuidLab && (
            <Link
              to={`/amostras/${uuidLab}`}
              className="btn btn-secondary !py-1.5 no-underline flex items-center gap-1.5"
              title="Abrir ficha completa da amostra"
            >
              <ExternalLink size={14} /> Abrir ficha completa
            </Link>
          )}
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
        {/* Propriedades do Core e Petrofísica */}
        <div>
          <h4 className="m-0 mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-blue-800)] flex items-center gap-1.5">
            <Layers size={14} /> Propriedades do Core (Rocha & Petrofísica)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
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
          {controle.dados?.observacoes && (
            <p className="m-0 mt-2.5 rounded-lg border border-[var(--color-neutral-200)] bg-amber-50/60 px-3 py-2 text-[12px] text-[var(--color-neutral-700)]">
              <strong>Observações do Controle de Rochas:</strong> {controle.dados.observacoes}
            </p>
          )}
        </div>

        {/* Tabela Completa de Ensaios (Temperatura, Vazão, Sistema Ácido do Catálogo, ΔP, PVbt, Wormhole) */}
        <div>
          <h4 className="m-0 mb-2.5 text-[12px] font-bold uppercase tracking-wider text-[var(--color-blue-800)] flex items-center gap-1.5">
            <FlaskConical size={14} /> Ensaios de Coreflooding / Acidificação ({amostra.ensaios.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-neutral-200)]">
            <table className="tabela w-full text-[12px]">
              <thead>
                <tr>
                  <th>Ensaio</th>
                  <th>Sistema Ácido / Fluido (Catálogo)</th>
                  <th>Temp. (°C)</th>
                  <th>Vazão Q (mL/min)</th>
                  <th>Vel. Intersticial (cm/min)</th>
                  <th>ΔP inic. → final (psi)</th>
                  <th>PVbt</th>
                  <th>Wormhole (cm)</th>
                </tr>
              </thead>
              <tbody>
                {amostra.ensaios.map((e) => {
                  const sis = e.id_sistema ? porSistema.get(e.id_sistema) : undefined;
                  const cf = e.analise_id != null ? cfPorId.get(e.analise_id) : undefined;
                  const temp = e.temperatura_c ?? e.temperatura_nominal_c ?? cf?.temperatura_c;
                  const lwh = e.comprimento_wormhole_uct_cm ?? e.comprimento_wormhole_cm;
                  const dpTxt =
                    cf?.dp_inicial_psi != null || cf?.dp_final_psi != null
                      ? `${fmt(cf?.dp_inicial_psi, 1)} → ${fmt(cf?.dp_final_psi, 1)}${
                          cf?.razao_dp != null ? ` (${fmt(cf.razao_dp, 1)}×)` : ""
                        }`
                      : "—";

                  return (
                    <tr key={e.id_experimento}>
                      <td className="font-semibold text-[var(--color-blue-800)] whitespace-nowrap">
                        {e.id_experimento}
                        {cf?.equipamento_aquisicao && (
                          <span className="block text-[10px] font-normal text-[var(--color-neutral-500)]">
                            Eq.: {cf.equipamento_aquisicao}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="font-semibold text-[var(--color-neutral-900)]">
                          {descreverSistemaEnsaio(e, porSistema) || "—"}
                        </span>
                        {sis && (
                          <span className="block text-[11px] text-[var(--color-neutral-600)]">
                            {sis.componente_1}
                            {sis.valor_1 != null ? ` ${fmt(sis.valor_1, 2)} ${sis.unidade_1 ?? ""}` : ""}
                            {sis.conc_m != null ? ` (${fmt(sis.conc_m, 2)} M)` : ""}
                            {sis.aditivos ? ` · Aditivos: ${sis.aditivos}` : ""}
                          </span>
                        )}
                        {!sis && e.aditivo && (
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
                      <td className="tabular-nums whitespace-nowrap">{dpTxt}</td>
                      <td className="tabular-nums font-bold text-[var(--color-red)] whitespace-nowrap">
                        {e.breakthrough === false ? "Sem BT" : fmtExato(e.pvbt)}
                        {(e.pvbt_condicao || cf?.criterio_bt) && (
                          <span className="block font-normal text-[10px] text-[var(--color-neutral-500)]">
                            {e.pvbt_condicao ?? cf?.criterio_bt}
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
