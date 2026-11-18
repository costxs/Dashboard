import { useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, Database, Download, Filter, Layers, RotateCcw, Search, Table2,
} from "lucide-react";
import { GraficoRda } from "../charts/GraficoRda";
import { MedidasAgrupadas, type Agrupamento } from "../literatura/MedidasAgrupadas";
import { Aviso, Carregando, Cartao } from "../ui/base";
import { useConsulta } from "../../hooks/useConsulta";
import { supabase } from "../../lib/supabase";
import { listarSistemasAcidos } from "../../servicos/amostras";
import { listarDadosRda, listarPublicacoes, listarRochasLiteratura, pontosComparacao } from "../../servicos/literatura";
import type { DadoLiteraturaRda, SistemaAcido } from "../../tipos/banco";
import { fmt } from "../../utils/formatacao";

// Ficha da amostra › 5. RDA (e Banco de Dados de Reatividade Rocha-Ácido — LCPETRO/UFPA):
// Exibe a comparação gráfica (Levich: Taxa × √ω) e todas as abas estruturadas como na planilha
// "Banco de dados de reatividade rocha-ácido — LCPETRO/UFPA" (ensaios RDA-0001..RDA-0419 com colunas
// calculadas em cabeçalho verde ƒ, rochas, sistemas_acidos, fluidos_prop, referencias, qualidade e dicionario).

type AbaBancoRda = "ensaios" | "grafico" | "rochas" | "sistemas" | "fluidos" | "referencias" | "qualidade";
type ModoEnsaios = "planilha" | "compacto" | "agrupado";

interface FluidoPropRow {
  componente: string;
  massa_molar_g_mol: number | null;
  coef_densidade: number | null;
  n_equivalentes: number | null;
  observacao: string | null;
}

interface QualidadeRow {
  id: number;
  id_ensaio: string | null;
  campo: string;
  valor_registrado: string | null;
  valor_calculado: string | null;
  observacao: string | null;
  resolvido?: boolean;
}

interface DicItem {
  tabela: string;
  campo: string;
  tipo: string;
  unidade: string;
  valores: string;
  descricao: string;
}

const DICIONARIO_RDA: DicItem[] = [
  { tabela: "ensaios", campo: "id_ensaio", tipo: "texto", unidade: "", valores: "RDA-####", descricao: "Identificador único da medida" },
  { tabela: "ensaios", campo: "id_referencia", tipo: "texto", unidade: "", valores: "ver referencias", descricao: "Publicação de origem" },
  { tabela: "ensaios", campo: "ano", tipo: "inteiro", unidade: "", valores: "", descricao: "Ano da publicação" },
  { tabela: "ensaios", campo: "id_rocha", tipo: "texto", unidade: "", valores: "ver rochas", descricao: "Rocha e composição usadas" },
  { tabela: "ensaios", campo: "litologia", tipo: "CALCULADA", unidade: "", valores: "", descricao: "Nome da rocha, buscado em rochas" },
  { tabela: "ensaios", campo: "composicao_rocha", tipo: "CALCULADA", unidade: "", valores: "", descricao: "Composição como informada pela fonte" },
  { tabela: "ensaios", campo: "calcita_pct", tipo: "CALCULADA", unidade: "%", valores: "", descricao: "Teor de calcita, quando informado" },
  { tabela: "ensaios", campo: "dim_h_in", tipo: "decimal", unidade: "in", valores: "", descricao: "Primeira dimensão do disco (diâmetro)" },
  { tabela: "ensaios", campo: "dim_d_in", tipo: "decimal", unidade: "in", valores: "", descricao: "Segunda dimensão do disco (espessura)" },
  { tabela: "ensaios", campo: "id_sistema", tipo: "texto", unidade: "", valores: "ver sistemas_acidos", descricao: "Sistema ácido injetado" },
  { tabela: "ensaios", campo: "acido", tipo: "CALCULADA", unidade: "", valores: "", descricao: "Componente principal, buscado em sistemas_acidos" },
  { tabela: "ensaios", campo: "conc_valor", tipo: "CALCULADA", unidade: "ver conc_unidade", valores: "", descricao: "Concentração do ácido principal, como na fonte" },
  { tabela: "ensaios", campo: "conc_unidade", tipo: "CALCULADA", unidade: "", valores: "N; M; wt%", descricao: "Unidade em que a fonte informou" },
  { tabela: "ensaios", campo: "conc_pct", tipo: "CALCULADA", unidade: "wt%", valores: "", descricao: "Concentração em massa" },
  { tabela: "ensaios", campo: "conc_M", tipo: "CALCULADA", unidade: "mol/L", valores: "", descricao: "Concentração molar" },
  { tabela: "ensaios", campo: "aditivos", tipo: "CALCULADA", unidade: "", valores: "", descricao: "Demais componentes do sistema" },
  { tabela: "ensaios", campo: "temperatura_C", tipo: "decimal", unidade: "°C", valores: "", descricao: "Temperatura do ensaio" },
  { tabela: "ensaios", campo: "temperatura_nominal_C", tipo: "CALCULADA", unidade: "°C", valores: "", descricao: "Temperatura arredondada de 5 em 5 °C (faixa 18–30 → 25 °C)" },
  { tabela: "ensaios", campo: "pressao_psi", tipo: "decimal", unidade: "psi", valores: "", descricao: "Pressão do ensaio" },
  { tabela: "ensaios", campo: "tipo_variavel", tipo: "lista", unidade: "", valores: "rotação (RDA); taxa de cisalhamento; não informada", descricao: "Qual variável foi varrida" },
  { tabela: "ensaios", campo: "rotacao_rpm", tipo: "decimal", unidade: "rpm", valores: "", descricao: "Rotação do disco" },
  { tabela: "ensaios", campo: "omega_rad_s", tipo: "CALCULADA", unidade: "rad/s", valores: "", descricao: "Velocidade angular (ω = rpm × 2π / 60)" },
  { tabela: "ensaios", campo: "raiz_omega", tipo: "CALCULADA", unidade: "(rad/s)^0,5", valores: "", descricao: "Abscissa do gráfico de Levich (√ω)" },
  { tabela: "ensaios", campo: "shear_rate_s1", tipo: "decimal", unidade: "1/s", valores: "", descricao: "Taxa de cisalhamento, quando é essa a variável" },
  { tabela: "ensaios", campo: "taxa_reacao_mol_cm2_s", tipo: "decimal", unidade: "mol/(cm²·s)", valores: "", descricao: "Taxa de reação como publicada" },
  { tabela: "ensaios", campo: "taxa_reacao_mol_m2_s", tipo: "CALCULADA", unidade: "mol/(m²·s)", valores: "", descricao: "A mesma taxa em unidade SI (× 10.000)" },
  { tabela: "ensaios", campo: "coef_difusao_cm2_s", tipo: "decimal", unidade: "cm²/s", valores: "", descricao: "Coeficiente de difusão informado" },
  { tabela: "ensaios", campo: "metodo_coef_difusao", tipo: "lista", unidade: "", valores: "Newman (1966); Rozieres et al (1994)", descricao: "Correlação usada para o coeficiente" },
  { tabela: "ensaios", campo: "metodo_quantificacao", tipo: "lista", unidade: "", valores: "RDA; RDA / ICP-AES; RDA / Coreflooding; RDA / AAS", descricao: "Aparato e técnica analítica" },
  { tabela: "ensaios", campo: "obtencao_dado", tipo: "lista", unidade: "", valores: "tabelado; lido de gráfico; medida na superfície; não catalogado", descricao: "Procedência do valor — indicador de confiabilidade" },
  { tabela: "ensaios", campo: "cor_celula", tipo: "texto", unidade: "", valores: "", descricao: "Cor original da célula na planilha antiga, para auditoria" },
  { tabela: "ensaios", campo: "variavel_original / sistema_original", tipo: "texto", unidade: "", valores: "", descricao: "Textos como estavam na planilha antiga" },
];

async function listarFluidosProp(): Promise<FluidoPropRow[]> {
  const { data } = await supabase.from("fluidos_prop").select("*").order("componente");
  return (data ?? []) as FluidoPropRow[];
}

async function listarQualidadeRda(): Promise<QualidadeRow[]> {
  const { data } = await supabase.from("lit_qualidade").select("*").order("id");
  return (data ?? []) as QualidadeRow[];
}

function corProcedencia(obtencao: string | null | undefined, corCelula?: string | null) {
  const o = (obtencao ?? "").toLowerCase();
  if (o === "tabelado" || corCelula === "FF92D050") {
    return { bg: "#e6f6d5", texto: "#1f5f00", ponto: "#92D050", rotulo: obtencao || "tabelado" };
  }
  if (o.includes("superf") || corCelula === "FFFFFF00") {
    return { bg: "#fef9c3", texto: "#713f12", ponto: "#eab308", rotulo: obtencao || "medida na superfície" };
  }
  if (o.includes("gráfico") || o.includes("grafico") || (corCelula ?? "").startsWith("theme4")) {
    return { bg: "#dbeafe", texto: "#1e40af", ponto: "#60a5fa", rotulo: obtencao || "lido de gráfico" };
  }
  return { bg: "#f3f4f6", texto: "#4b5563", ponto: "#9ca3af", rotulo: obtencao || "não catalogado" };
}

function baixarCsvPlanilhaRda(linhas: DadoLiteraturaRda[]) {
  const cab = [
    "id_ensaio", "id_referencia", "ano", "id_rocha", "litologia", "composicao_rocha", "calcita_pct",
    "dim_h_in", "dim_d_in", "id_sistema", "acido", "conc_valor", "conc_unidade", "conc_pct", "conc_M",
    "aditivos", "temperatura_C", "temperatura_nominal_C", "pressao_psi", "tipo_variavel", "rotacao_rpm",
    "omega_rad_s", "raiz_omega", "shear_rate_s1", "taxa_reacao_mol_cm2_s", "taxa_reacao_mol_m2_s",
    "coef_difusao_cm2_s", "metodo_coef_difusao", "metodo_quantificacao", "obtencao_dado", "cor_celula",
    "variavel_original", "sistema_original",
  ];
  const esc = (v: unknown) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const csv = [
    cab.join(","),
    ...linhas.map((l) =>
      [
        l.id_ensaio, l.id_referencia, l.ano, l.id_rocha, l.litologia, l.composicao_rocha, l.calcita_pct,
        l.dim_h_in, l.dim_d_in, l.id_sistema, l.acido, l.conc_valor, l.conc_unidade, l.conc_pct, l.conc_m,
        l.aditivos, l.temperatura_c, l.temperatura_nominal_c, l.pressao_psi, l.tipo_variavel, l.rotacao_rpm,
        l.omega_rad_s, l.raiz_omega, l.shear_rate_s1, l.taxa_reacao_mol_cm2_s, l.taxa_reacao_mol_m2_s,
        l.coef_difusao_cm2_s, l.metodo_coef_difusao, l.metodo_quantificacao, l.obtencao_dado, l.cor_celula,
        l.variavel_original, l.sistema_original,
      ]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = "BDD_LCPETRO_Reatividade_RDA.csv";
  a.click();
}

export function RdaDaAmostra({
  codigo,
  projetoId,
  litologia,
}: {
  codigo?: string;
  projetoId?: string;
  litologia?: string;
}) {
  const [aba, setAba] = useState<AbaBancoRda>("ensaios");
  const [modoEnsaios, setModoEnsaios] = useState<ModoEnsaios>("planilha");
  const [agrup, setAgrup] = useState<Agrupamento>("serie");
  // Quando aberto na ficha de uma amostra, permite alternar entre "Só mesma rocha da amostra" e "Todo o banco de RDA (419)"
  const [escopoRochaAmostra, setEscopoRochaAmostra] = useState<boolean>(false);

  const [busca, setBusca] = useState("");
  const [fRef, setFRef] = useState("");
  const [fRocha, setFRocha] = useState("");
  const [fLitologia, setFLitologia] = useState("");
  const [fAcido, setFAcido] = useState("");
  const [fSistema, setFSistema] = useState("");
  const [fTemp, setFTemp] = useState("");
  const [fObtencao, setFObtencao] = useState("");

  const todosDados = useConsulta(() => listarDadosRda(), []);
  const pontos = useConsulta(() => pontosComparacao(), []);
  const rochas = useConsulta(listarRochasLiteratura, []);
  const sistemas = useConsulta(listarSistemasAcidos, []);
  const fluidos = useConsulta(listarFluidosProp, []);
  const pubs = useConsulta(() => listarPublicacoes({ categoria: "geral" }), []);
  const qualidade = useConsulta(listarQualidadeRda, []);

  const contagensPorRocha = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of todosDados.dados ?? []) m[d.id_rocha] = (m[d.id_rocha] ?? 0) + 1;
    return m;
  }, [todosDados.dados]);

  const contagensPorSistema = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of todosDados.dados ?? []) m[d.id_sistema] = (m[d.id_sistema] ?? 0) + 1;
    return m;
  }, [todosDados.dados]);

  const contagensPorRef = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of todosDados.dados ?? []) m[d.id_referencia] = (m[d.id_referencia] ?? 0) + 1;
    return m;
  }, [todosDados.dados]);

  const nDaMesmaRocha = useMemo(() => {
    if (!litologia) return 0;
    return (todosDados.dados ?? []).filter((d) => d.litologia?.toLowerCase() === litologia.toLowerCase()).length;
  }, [todosDados.dados, litologia]);

  const opcoes = useMemo(() => {
    const base = todosDados.dados ?? [];
    const litologias = [...new Set(base.map((d) => d.litologia).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const acidos = [...new Set(base.map((d) => d.acido).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const temps = [...new Set(base.map((d) => d.temperatura_nominal_c).filter((t): t is number => t != null))].sort((a, b) => a - b);
    const obtencoes = [...new Set(base.map((d) => d.obtencao_dado).filter((o): o is string => Boolean(o)))].sort();
    return { litologias, acidos, temps, obtencoes };
  }, [todosDados.dados]);

  const temFiltroAtivo = Boolean(
    busca.trim() || fRef || fRocha || fLitologia || fAcido || fSistema || fTemp || fObtencao || escopoRochaAmostra,
  );

  const limparFiltros = () => {
    setBusca("");
    setFRef("");
    setFRocha("");
    setFLitologia("");
    setFAcido("");
    setFSistema("");
    setFTemp("");
    setFObtencao("");
    setEscopoRochaAmostra(false);
  };

  const dadosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (todosDados.dados ?? []).filter((d) => {
      if (escopoRochaAmostra && litologia && d.litologia?.toLowerCase() !== litologia.toLowerCase()) return false;
      if (fRef && d.id_referencia !== fRef) return false;
      if (fRocha && d.id_rocha !== fRocha) return false;
      if (fLitologia && d.litologia !== fLitologia) return false;
      if (fAcido && d.acido?.toLowerCase() !== fAcido.toLowerCase()) return false;
      if (fSistema && d.id_sistema !== fSistema) return false;
      if (fTemp && String(d.temperatura_nominal_c) !== fTemp) return false;
      if (fObtencao && d.obtencao_dado !== fObtencao) return false;
      if (q) {
        const txt = [
          d.id_ensaio,
          d.id_referencia,
          d.referencia_autor,
          d.id_rocha,
          d.litologia,
          d.composicao_rocha,
          d.id_sistema,
          d.nome_sistema,
          d.acido,
          d.aditivos,
          d.sistema_original,
          d.variavel_original,
          d.metodo_quantificacao,
          d.obtencao_dado,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [todosDados.dados, escopoRochaAmostra, litologia, fRef, fRocha, fLitologia, fAcido, fSistema, fTemp, fObtencao, busca]);

  const idsFiltrados = useMemo(() => new Set(dadosFiltrados.map((d) => d.id_ensaio)), [dadosFiltrados]);

  const pontosGrafico = useMemo(() => {
    const todos = pontos.dados ?? [];
    const litPts = todos.filter((p) => p.fonte === "literatura" && idsFiltrados.has(p.id));
    const labPts = todos.filter(
      (p) =>
        p.fonte === "lcpetro" &&
        (!codigo || p.rotulo === codigo || !projetoId || p.projeto_id === projetoId) &&
        (!escopoRochaAmostra || !litologia || p.litologia?.toLowerCase() === litologia.toLowerCase()),
    );
    return [...litPts, ...labPts];
  }, [pontos.dados, idsFiltrados, codigo, projetoId, escopoRochaAmostra, litologia]);

  const cardsResumo: { id: AbaBancoRda; rotulo: string; valor: number | string; sub: string }[] = [
    {
      id: "ensaios",
      rotulo: "Ensaios (RDA)",
      valor: dadosFiltrados.length,
      sub: `de ${todosDados.dados?.length ?? 419} medidas`,
    },
    {
      id: "grafico",
      rotulo: "Gráfico de Levich",
      valor: pontosGrafico.length,
      sub: "Taxa × √ω",
    },
    {
      id: "rochas",
      rotulo: "Rochas",
      valor: rochas.dados?.length ?? 22,
      sub: "RCH-01 a RCH-22",
    },
    {
      id: "sistemas",
      rotulo: "Sistemas Ácidos",
      valor: sistemas.dados?.length ?? 144,
      sub: "SA01+ (M e wt% ƒ)",
    },
    {
      id: "fluidos",
      rotulo: "Fluidos (Prop.)",
      valor: fluidos.dados?.length ?? 7,
      sub: "MM, ρ e equivalentes",
    },
    {
      id: "referencias",
      rotulo: "Referências",
      valor: pubs.dados?.length ?? 10,
      sub: "REF-R01 a REF-R10",
    },
    {
      id: "qualidade",
      rotulo: "Dicionário & Qualidade",
      valor: DICIONARIO_RDA.length,
      sub: `${qualidade.dados?.length ?? 8} notas de auditoria`,
    },
  ];

  return (
    <Cartao
      titulo="Banco de Dados de Reatividade Rocha-Ácido (RDA) — LCPETRO/UFPA"
      subtitulo="Medidas de taxa de reação em disco rotativo (RDA-0001 a RDA-0419), catálogos de rochas, sistemas ácidos, fluidos e referências. Colunas em verde (ƒ) são calculadas automaticamente."
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          {litologia && (
            <div className="inline-flex rounded-lg border border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setEscopoRochaAmostra(false)}
                className={`rounded-md px-2.5 py-1 font-semibold cursor-pointer border-0 transition-colors ${
                  !escopoRochaAmostra
                    ? "bg-[var(--color-blue)] text-white shadow-sm"
                    : "bg-transparent text-[var(--color-neutral-700)] hover:text-[var(--color-blue-800)]"
                }`}
              >
                Todo o Banco RDA ({todosDados.dados?.length ?? 419})
              </button>
              <button
                type="button"
                onClick={() => setEscopoRochaAmostra(true)}
                className={`rounded-md px-2.5 py-1 font-semibold cursor-pointer border-0 transition-colors ${
                  escopoRochaAmostra
                    ? "bg-[var(--color-orange)] text-white shadow-sm"
                    : "bg-transparent text-[var(--color-neutral-700)] hover:text-[var(--color-blue-800)]"
                }`}
              >
                Só {litologia} ({nDaMesmaRocha})
              </button>
            </div>
          )}
          {dadosFiltrados.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary !py-1.5"
              onClick={() => baixarCsvPlanilhaRda(dadosFiltrados)}
              title="Exportar CSV no formato completo da planilha BDD_LCPETRO_Reatividade"
            >
              <Download size={14} /> Baixar CSV ({dadosFiltrados.length})
            </button>
          )}
        </div>
      }
    >
      <div className="p-6 flex flex-col gap-5">
        {/* Cards de navegação das abas do banco RDA */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
          {cardsResumo.map((c) => {
            const ativo = aba === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setAba(c.id)}
                className={`text-left rounded-xl border px-3.5 py-2.5 cursor-pointer transition-all ${
                  ativo
                    ? "border-[var(--color-orange)] bg-[var(--color-orange-50)]/50 shadow-sm ring-1 ring-[var(--color-orange)]"
                    : "border-[var(--color-neutral-300)] bg-white hover:border-[var(--color-blue)]"
                }`}
              >
                <div className="font-heading font-extrabold text-[20px] leading-tight text-[var(--color-blue-800)] tabular-nums">
                  {c.valor}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-[var(--color-neutral-800)] truncate">{c.rotulo}</div>
                <div className="text-[10px] text-[var(--color-neutral-500)] truncate">{c.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Barra de filtros dos ensaios e gráfico */}
        {(aba === "ensaios" || aba === "grafico") && (
          <div className="rounded-xl border border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)]/65 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--color-blue-800)]">
                <Filter size={14} />
                <span>Filtros do Banco de Dados de RDA</span>
                {(fRocha || fSistema) && (
                  <span className="rounded bg-[var(--color-red-50)] px-2 py-0.5 text-[11px] text-[var(--color-red)] font-semibold">
                    {fRocha ? `Rocha: ${fRocha}` : `Sistema: ${fSistema}`}
                  </span>
                )}
              </div>
              {temFiltroAtivo && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="text-[12px] font-semibold text-[var(--color-red)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
                >
                  <RotateCcw size={12} /> Limpar todos os filtros
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5 text-[12px]">
              <label className="flex flex-col gap-1 xl:col-span-2">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Buscar (ID RDA, rocha, ácido, autor…)</span>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-neutral-400)]" />
                  <input
                    className="input !h-8 !pl-8 !py-1 text-[12px]"
                    placeholder="Ex.: RDA-0001, Acqua Bianca, GLDA, 100 rpm…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Referência</span>
                <select className="input !h-8 !py-1 text-[12px]" value={fRef} onChange={(e) => setFRef(e.target.value)}>
                  <option value="">Todas ({pubs.dados?.length ?? 10})</option>
                  {(pubs.dados ?? []).map((r) => (
                    <option key={r.id_referencia} value={r.id_referencia}>
                      {r.id_referencia} · {r.autor} ({r.ano ?? "?"})
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Litologia (ƒ)</span>
                <select className="input !h-8 !py-1 text-[12px]" value={fLitologia} onChange={(e) => setFLitologia(e.target.value)}>
                  <option value="">Todas ({opcoes.litologias.length})</option>
                  {opcoes.litologias.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Ácido Principal (ƒ)</span>
                <select className="input !h-8 !py-1 text-[12px]" value={fAcido} onChange={(e) => setFAcido(e.target.value)}>
                  <option value="">Todos ({opcoes.acidos.length})</option>
                  {opcoes.acidos.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Temp. Nominal (ƒ)</span>
                <select className="input !h-8 !py-1 text-[12px]" value={fTemp} onChange={(e) => setFTemp(e.target.value)}>
                  <option value="">Todas</option>
                  {opcoes.temps.map((t) => (
                    <option key={t} value={String(t)}>
                      {t} °C
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-[var(--color-neutral-600)]">Procedência (Cor)</span>
                <select className="input !h-8 !py-1 text-[12px]" value={fObtencao} onChange={(e) => setFObtencao(e.target.value)}>
                  <option value="">Todas</option>
                  {opcoes.obtencoes.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* ABA 1: ENSAIOS (Tabela idêntica à planilha com colunas calculadas em cabeçalho verde) */}
        {aba === "ensaios" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#1b5e20] px-2.5 py-1 text-[11px] font-bold text-white">
                  <span>ƒ</span> Cabeçalho Verde = Coluna Calculada Automaticamente
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-neutral-700)]">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#92D050" }} /> tabelado
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-neutral-700)]">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#60a5fa" }} /> lido de gráfico
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-neutral-300)] bg-white px-2 py-0.5 text-[11px] text-[var(--color-neutral-700)]">
                  <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} /> medida na superfície
                </span>
              </div>

              <div className="inline-flex rounded-lg border border-[var(--color-neutral-300)] bg-[var(--color-neutral-100)] p-0.5 text-[12px]">
                <button
                  type="button"
                  onClick={() => setModoEnsaios("planilha")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold cursor-pointer border-0 ${
                    modoEnsaios === "planilha" ? "bg-[var(--color-blue)] text-white" : "bg-transparent text-[var(--color-neutral-700)]"
                  }`}
                >
                  <Table2 size={13} /> Planilha Completa (33 col.)
                </button>
                <button
                  type="button"
                  onClick={() => setModoEnsaios("compacto")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold cursor-pointer border-0 ${
                    modoEnsaios === "compacto" ? "bg-[var(--color-blue)] text-white" : "bg-transparent text-[var(--color-neutral-700)]"
                  }`}
                >
                  <Database size={13} /> Resumo
                </button>
                <button
                  type="button"
                  onClick={() => setModoEnsaios("agrupado")}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold cursor-pointer border-0 ${
                    modoEnsaios === "agrupado" ? "bg-[var(--color-blue)] text-white" : "bg-transparent text-[var(--color-neutral-700)]"
                  }`}
                >
                  <Layers size={13} /> Agrupado (Levich)
                </button>
              </div>
            </div>

            {todosDados.carregando && !todosDados.dados ? (
              <Carregando />
            ) : todosDados.erro ? (
              <Aviso tipo="erro">{todosDados.erro}</Aviso>
            ) : modoEnsaios === "agrupado" ? (
              <div className="rounded-xl border border-[var(--color-neutral-300)] bg-white">
                <MedidasAgrupadas linhas={dadosFiltrados} agrupamento={agrup} onAgrupamento={setAgrup} />
              </div>
            ) : (
              <TabelaPlanilhaRda linhas={dadosFiltrados} completa={modoEnsaios === "planilha"} />
            )}
          </div>
        )}

        {/* ABA 2: GRÁFICO DE LEVICH */}
        {aba === "grafico" && (
          <div className="flex flex-col gap-4">
            {pontos.carregando && !pontos.dados ? (
              <Carregando />
            ) : pontos.erro ? (
              <Aviso tipo="erro">{pontos.erro}</Aviso>
            ) : (
              <>
                <GraficoRda pontos={pontosGrafico} destacarRotulo={codigo} altura={420} />
                <div className="rounded-xl border border-[var(--color-neutral-300)] bg-white">
                  <div className="border-b border-[var(--color-neutral-200)] px-5 py-3 flex items-center justify-between">
                    <span className="font-bold text-[14px] text-[var(--color-blue-800)]">
                      Séries de Reatividade Filtradas ({dadosFiltrados.length} medidas)
                    </span>
                  </div>
                  <MedidasAgrupadas linhas={dadosFiltrados} agrupamento={agrup} onAgrupamento={setAgrup} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ABA 3: ROCHAS (RCH-01 a RCH-22) */}
        {aba === "rochas" && (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
            <table className="table text-[12px] w-full">
              <thead>
                <tr>
                  <th>id_rocha</th>
                  <th>litologia</th>
                  <th>composicao_texto</th>
                  <th className="text-right">calcita_pct (%)</th>
                  <th className="text-right">dolomita_pct (%)</th>
                  <th className="text-right">razao_ca_mg</th>
                  <th className="text-right">Medidas</th>
                </tr>
              </thead>
              <tbody>
                {(rochas.dados ?? []).map((r) => {
                  const n = contagensPorRocha[r.id_rocha] ?? 0;
                  return (
                    <tr key={r.id_rocha} className="lcp-row">
                      <td className="font-bold text-[var(--color-red)] whitespace-nowrap">{r.id_rocha}</td>
                      <td className="font-semibold text-[var(--color-blue-800)]">{r.litologia}</td>
                      <td>{r.composicao_texto ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        {r.calcita_pct != null ? `${r.calcita_qualificador && r.calcita_qualificador !== "=" ? `${r.calcita_qualificador} ` : ""}${fmt(r.calcita_pct, 1)}` : "—"}
                      </td>
                      <td className="text-right tabular-nums">
                        {r.dolomita_pct != null ? `${r.dolomita_qualificador && r.dolomita_qualificador !== "=" ? `${r.dolomita_qualificador} ` : ""}${fmt(r.dolomita_pct, 1)}` : "—"}
                      </td>
                      <td className="text-right tabular-nums">{fmt(r.razao_ca_mg, 2)}</td>
                      <td className="text-right tabular-nums">
                        <button
                          type="button"
                          onClick={() => {
                            limparFiltros();
                            setFRocha(r.id_rocha);
                            setAba("ensaios");
                          }}
                          className="font-bold text-[var(--color-blue)] hover:underline cursor-pointer bg-transparent border-0"
                        >
                          {n} ver ensaios →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA 4: SISTEMAS ÁCIDOS (SA01 a SA144) */}
        {aba === "sistemas" && (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)] max-h-[540px]">
            <table className="table text-[12px] w-full">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th>id_sistema</th>
                  <th>nome_sistema</th>
                  <th>componente_1</th>
                  <th className="text-right">valor_1</th>
                  <th>unid_1</th>
                  <th>componente_2</th>
                  <th className="text-right">valor_2</th>
                  <th>unid_2</th>
                  <th className="!bg-[#1b5e20] !text-white text-right">ƒ conc_M (mol/L)</th>
                  <th className="!bg-[#1b5e20] !text-white text-right">ƒ conc_pct (wt%)</th>
                  <th className="!bg-[#1b5e20] !text-white">ƒ aditivos</th>
                  <th>composicao_original</th>
                  <th className="text-right">Medidas</th>
                </tr>
              </thead>
              <tbody>
                {(sistemas.dados ?? []).map((s: SistemaAcido & { composicao_original?: string | null }) => {
                  const n = contagensPorSistema[s.id_sistema] ?? 0;
                  return (
                    <tr key={s.id_sistema} className="lcp-row">
                      <td className="font-bold text-[var(--color-red)] whitespace-nowrap">{s.id_sistema}</td>
                      <td className="font-semibold text-[var(--color-blue-800)]">{s.nome_sistema}</td>
                      <td>{s.componente_1}</td>
                      <td className="text-right tabular-nums">{fmt(s.valor_1, 3)}</td>
                      <td>{s.unidade_1 ?? "—"}</td>
                      <td>{s.componente_2 ?? "—"}</td>
                      <td className="text-right tabular-nums">{fmt(s.valor_2, 2)}</td>
                      <td>{s.unidade_2 ?? "—"}</td>
                      <td className="bg-[#f1f8f3] font-semibold text-[#1b5e20] text-right tabular-nums">{fmt(s.conc_m, 3)}</td>
                      <td className="bg-[#f1f8f3] font-semibold text-[#1b5e20] text-right tabular-nums">{fmt(s.conc_pct, 2)}</td>
                      <td className="bg-[#f1f8f3] text-[#1b5e20]">{s.aditivos ?? "—"}</td>
                      <td className="text-[11px] text-[var(--color-neutral-600)]">{s.composicao_original ?? "—"}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {n > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              limparFiltros();
                              setFSistema(s.id_sistema);
                              setAba("ensaios");
                            }}
                            className="font-bold text-[var(--color-blue)] hover:underline cursor-pointer bg-transparent border-0"
                          >
                            {n}
                          </button>
                        ) : (
                          <span className="text-[var(--color-neutral-400)]">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA 5: FLUIDOS (fluidos_prop) */}
        {aba === "fluidos" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-[#a5d6a7] bg-[#f1f8f3] p-4 text-[12px] text-[#1b5e20]">
              <strong>Regra de Conversão das Colunas Verdes (conc_M e conc_pct):</strong>
              <p className="m-0 mt-1">
                <code>conc_M</code> e <code>conc_pct</code> convertem a concentração do ácido principal a partir de{" "}
                <code>conc_valor</code> e <code>conc_unidade</code> usando massa molar (MM), densidade e número de equivalentes da tabela{" "}
                <code>fluidos_prop</code>: <strong>N vira M</strong> dividindo pelos equivalentes (para HCl, 1 N = 1 M; para ácido cítrico, 1 N = 1/3 M) e{" "}
                <strong>wt% vira M</strong> por <code>M = 10 × wt% × ρ / MM</code>, com <code>ρ = 1 + coef × wt%</code>.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
              <table className="table text-[12px] w-full">
                <thead>
                  <tr>
                    <th>componente</th>
                    <th className="text-right">massa_molar_g_mol (g/mol)</th>
                    <th className="text-right">coef_densidade</th>
                    <th className="text-right">n_equivalentes (eq/mol)</th>
                    <th>observacao</th>
                  </tr>
                </thead>
                <tbody>
                  {(fluidos.dados ?? []).map((fl) => (
                    <tr key={fl.componente} className="lcp-row">
                      <td className="font-bold text-[var(--color-blue-800)]">{fl.componente}</td>
                      <td className="text-right tabular-nums">{fmt(fl.massa_molar_g_mol, 2)}</td>
                      <td className="text-right tabular-nums">{fmt(fl.coef_densidade, 5)}</td>
                      <td className="text-right tabular-nums">{fl.n_equivalentes ?? "—"}</td>
                      <td>{fl.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA 6: REFERÊNCIAS (REF-R01 a REF-R10) */}
        {aba === "referencias" && (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
            <table className="table text-[12px] w-full">
              <thead>
                <tr>
                  <th>id_referencia</th>
                  <th>autor</th>
                  <th>ano</th>
                  <th className="text-right">n_ensaios</th>
                </tr>
              </thead>
              <tbody>
                {(pubs.dados ?? []).map((p) => {
                  const n = contagensPorRef[p.id_referencia] ?? p.n_dados_rda ?? 0;
                  return (
                    <tr key={p.id_referencia} className="lcp-row">
                      <td className="font-bold text-[var(--color-red)] whitespace-nowrap">{p.id_referencia}</td>
                      <td className="font-semibold text-[var(--color-blue-800)]">{p.autor}</td>
                      <td>{p.ano ?? "—"}</td>
                      <td className="text-right tabular-nums">
                        <button
                          type="button"
                          onClick={() => {
                            limparFiltros();
                            setFRef(p.id_referencia);
                            setAba("ensaios");
                          }}
                          className="font-bold text-[var(--color-blue)] hover:underline cursor-pointer bg-transparent border-0"
                        >
                          {n} ver ensaios →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ABA 7: QUALIDADE & DICIONÁRIO */}
        {aba === "qualidade" && (
          <div className="flex flex-col gap-6">
            <div>
              <h4 className="m-0 mb-2 text-[14px] font-bold text-[var(--color-blue-800)] flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-[var(--color-orange)]" /> Aba Qualidade — Conferência da Planilha ({qualidade.dados?.length ?? 0})
              </h4>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
                <table className="table text-[12px] w-full">
                  <thead>
                    <tr>
                      <th>id_ensaio</th>
                      <th>campo</th>
                      <th>valor_registrado</th>
                      <th>valor_calculado</th>
                      <th>observacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(qualidade.dados ?? []).map((q) => (
                      <tr key={q.id} className="lcp-row">
                        <td className="font-semibold text-[var(--color-red)]">{q.id_ensaio ?? "(banco todo)"}</td>
                        <td className="font-mono text-[11px] font-semibold text-[var(--color-blue-800)]">{q.campo}</td>
                        <td>{q.valor_registrado ?? "—"}</td>
                        <td>{q.valor_calculado ?? "—"}</td>
                        <td>{q.observacao ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="m-0 mb-2 text-[14px] font-bold text-[var(--color-blue-800)] flex items-center gap-1.5">
                <BookOpen size={15} /> Aba Dicionário — Estrutura das 33 Colunas da Planilha RDA
              </h4>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-neutral-300)]">
                <table className="table text-[12px] w-full">
                  <thead>
                    <tr>
                      <th>tabela</th>
                      <th>campo</th>
                      <th>tipo</th>
                      <th>unidade</th>
                      <th>valores_aceitos</th>
                      <th>descricao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DICIONARIO_RDA.map((item) => {
                      const calc = item.tipo === "CALCULADA";
                      return (
                        <tr key={item.campo} className={calc ? "bg-[#f1f8f3]" : "lcp-row"}>
                          <td className="text-[var(--color-neutral-600)]">{item.tabela}</td>
                          <td className="font-mono font-bold text-[var(--color-blue-800)]">{item.campo}</td>
                          <td>
                            {calc ? (
                              <span className="inline-block rounded bg-[#1b5e20] px-2 py-0.5 text-[10px] font-bold text-white">
                                ƒ CALCULADA (cabeçalho verde)
                              </span>
                            ) : (
                              <span className="text-[var(--color-neutral-700)]">{item.tipo}</span>
                            )}
                          </td>
                          <td className="tabular-nums">{item.unidade || "—"}</td>
                          <td className="text-[11px] text-[var(--color-neutral-600)]">{item.valores || "—"}</td>
                          <td>{item.descricao}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Cartao>
  );
}

function TabelaPlanilhaRda({ linhas, completa }: { linhas: DadoLiteraturaRda[]; completa: boolean }) {
  if (!linhas.length) {
    return (
      <p className="m-0 py-8 text-center text-[13px] text-[var(--color-neutral-600)]">
        Nenhuma medida de RDA encontrada com esses filtros.
      </p>
    );
  }

  const thNormal = "whitespace-nowrap !bg-[var(--color-blue-900)] !text-white text-[11px] font-bold px-2.5 py-2";
  const thVerde = "whitespace-nowrap !bg-[#1b5e20] !text-white text-[11px] font-bold px-2.5 py-2 border-x border-[#2e7d32]";
  const tdVerde = "!py-2 px-2.5 bg-[#f1f8f3] text-[#14532d] font-medium tabular-nums whitespace-nowrap";
  const tdNormal = "!py-2 px-2.5 tabular-nums whitespace-nowrap";

  return (
    <div className="max-h-[560px] overflow-auto rounded-xl border border-[var(--color-neutral-300)] bg-white">
      <table className="table text-[12px] w-full border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={thNormal}>id_ensaio</th>
            <th className={thNormal}>id_referencia</th>
            {completa && <th className={thNormal}>ano</th>}
            <th className={thNormal}>id_rocha</th>
            <th className={thVerde} title="Coluna calculada pelo catálogo de rochas">ƒ litologia</th>
            {completa && <th className={thVerde} title="Coluna calculada pelo catálogo de rochas">ƒ composicao_rocha</th>}
            {completa && <th className={`${thVerde} text-right`} title="Coluna calculada pelo catálogo de rochas">ƒ calcita_pct</th>}
            {completa && <th className={`${thNormal} text-right`}>dim_h_in</th>}
            {completa && <th className={`${thNormal} text-right`}>dim_d_in</th>}
            <th className={thNormal}>id_sistema</th>
            <th className={thVerde} title="Coluna calculada pelo catálogo de sistemas ácidos">ƒ acido</th>
            {completa && <th className={`${thVerde} text-right`}>ƒ conc_valor</th>}
            {completa && <th className={thVerde}>ƒ conc_unidade</th>}
            {completa && <th className={`${thVerde} text-right`}>ƒ conc_pct (wt%)</th>}
            <th className={`${thVerde} text-right`}>ƒ conc_M (mol/L)</th>
            <th className={thVerde}>ƒ aditivos</th>
            <th className={`${thNormal} text-right`}>temperatura_C</th>
            <th className={`${thVerde} text-right`} title="Arredonda de 5 em 5 °C e junta 18–30 em 25 °C">ƒ temp_nominal_C</th>
            <th className={`${thNormal} text-right`}>pressao_psi</th>
            {completa && <th className={thNormal}>tipo_variavel</th>}
            <th className={`${thNormal} text-right`}>rotacao_rpm</th>
            {completa && <th className={`${thVerde} text-right`} title="ω = rotação × 2π / 60">ƒ omega_rad_s</th>}
            <th className={`${thVerde} text-right`} title="Abscissa de Levich: √ω">ƒ raiz_omega</th>
            {completa && <th className={`${thNormal} text-right`}>shear_rate_s1</th>}
            <th className={`${thNormal} text-right`}>taxa_reacao (mol/cm²·s)</th>
            <th className={`${thVerde} text-right`} title="taxa × 10.000">ƒ taxa_SI (mol/m²·s)</th>
            {completa && <th className={`${thNormal} text-right`}>coef_difusao (cm²/s)</th>}
            {completa && <th className={thNormal}>metodo_coef_difusao</th>}
            <th className={thNormal}>metodo_quantificacao</th>
            <th className={thNormal}>obtencao_dado</th>
            {completa && <th className={thNormal}>cor_celula</th>}
            {completa && <th className={thNormal}>variavel_original</th>}
            {completa && <th className={thNormal}>sistema_original</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const proc = corProcedencia(l.obtencao_dado, l.cor_celula);
            return (
              <tr key={l.id_ensaio} className="lcp-row">
                <td className={`${tdNormal} font-bold text-[var(--color-red)]`}>{l.id_ensaio}</td>
                <td className={tdNormal} title={l.referencia_autor}>
                  <span className="font-semibold text-[var(--color-blue-800)]">{l.id_referencia}</span>
                  {!completa && <span className="ml-1 text-[11px] text-[var(--color-neutral-500)]">({l.ano ?? "?"})</span>}
                </td>
                {completa && <td className={tdNormal}>{l.ano ?? "—"}</td>}
                <td className={`${tdNormal} font-semibold text-[var(--color-blue-800)]`}>{l.id_rocha}</td>
                <td className={tdVerde}>{l.litologia}</td>
                {completa && <td className={tdVerde}>{l.composicao_rocha ?? "—"}</td>}
                {completa && <td className={`${tdVerde} text-right`}>{fmt(l.calcita_pct, 1)}</td>}
                {completa && <td className={`${tdNormal} text-right`}>{fmt(l.dim_h_in, 2)}</td>}
                {completa && <td className={`${tdNormal} text-right`}>{fmt(l.dim_d_in, 2)}</td>}
                <td className={`${tdNormal} font-semibold text-[var(--color-blue-800)]`}>{l.id_sistema}</td>
                <td className={`${tdVerde} font-bold`}>{l.acido}</td>
                {completa && <td className={`${tdVerde} text-right`}>{fmt(l.conc_valor, 2)}</td>}
                {completa && <td className={tdVerde}>{l.conc_unidade ?? "—"}</td>}
                {completa && <td className={`${tdVerde} text-right`}>{fmt(l.conc_pct, 2)}</td>}
                <td className={`${tdVerde} text-right`}>{fmt(l.conc_m, 3)}</td>
                <td className={tdVerde}>{l.aditivos ?? "—"}</td>
                <td className={`${tdNormal} text-right`}>{fmt(l.temperatura_c, 1)}</td>
                <td className={`${tdVerde} text-right font-bold`}>{fmt(l.temperatura_nominal_c, 0)}</td>
                <td className={`${tdNormal} text-right`}>{fmt(l.pressao_psi, 0)}</td>
                {completa && <td className={tdNormal}>{l.tipo_variavel ?? "—"}</td>}
                <td className={`${tdNormal} text-right`}>{fmt(l.rotacao_rpm, 0)}</td>
                {completa && <td className={`${tdVerde} text-right`}>{fmt(l.omega_rad_s, 2)}</td>}
                <td className={`${tdVerde} text-right`}>{fmt(l.raiz_omega, 3)}</td>
                {completa && <td className={`${tdNormal} text-right`}>{fmt(l.shear_rate_s1, 0)}</td>}
                <td className={`${tdNormal} text-right font-bold text-[var(--color-blue-800)]`}>
                  {fmt(l.taxa_reacao_mol_cm2_s, 3, true)}
                </td>
                <td className={`${tdVerde} text-right font-bold`}>{fmt(l.taxa_reacao_mol_m2_s, 3, true)}</td>
                {completa && <td className={`${tdNormal} text-right`}>{fmt(l.coef_difusao_cm2_s, 3, true)}</td>}
                {completa && <td className={tdNormal}>{l.metodo_coef_difusao ?? "—"}</td>}
                <td className={tdNormal}>{l.metodo_quantificacao ?? "—"}</td>
                <td className={tdNormal}>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: proc.bg, color: proc.texto }}
                  >
                    <i className="inline-block h-2 w-2 rounded-full" style={{ background: proc.ponto }} />
                    {proc.rotulo}
                  </span>
                </td>
                {completa && <td className={`${tdNormal} font-mono text-[11px] text-[var(--color-neutral-500)]`}>{l.cor_celula ?? "—"}</td>}
                {completa && <td className={tdNormal}>{l.variavel_original ?? "—"}</td>}
                {completa && <td className={tdNormal}>{l.sistema_original ?? "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
