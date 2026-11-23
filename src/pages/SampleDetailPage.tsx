import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Atom,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FlaskConical,
  Gauge,
  Layers,
  Lock,
  type LucideIcon,
  MapPin,
  Microscope,
  RotateCw,
  Scan,
  ScanEye,
} from "lucide-react";
import { AbaAnalise } from "../components/analises/AbaAnalise";
import { PermeabilidadeCoreflood } from "../components/analises/PermeabilidadeCoreflood";
import { RdaDaAmostra } from "../components/analises/RdaDaAmostra";
import { ReatividadeT50DaAmostra } from "../components/analises/ReatividadeT50DaAmostra";
import { PvbtDaAmostra } from "../components/pvbt/PvbtDaAmostra";
import { Aviso, Carregando, Cartao, Valor } from "../components/ui/base";
import { ANALISES } from "../config/analises";
import { useConsulta } from "../hooks/useConsulta";
import { listarConferencias, obterAmostra, obterControleDaAmostra } from "../servicos/amostras";
import { listarReatividadeDaAmostra } from "../servicos/reatividade";
import { useContexto } from "../store/useContexto";
import {
  dimensoes,
  ehVisaoLimitadaLcpetro,
  experimentosDaAmostra,
  litologiaSegura,
  ondeAmostraEsta,
} from "../utils/bancoAmostras";
import { rotuloFinalidade } from "../utils/controleRochas";
import { ensaiosDaFinalidade } from "../utils/finalidade";
import { fmt, fmtData, fmtPermFabricante, melhorK } from "../utils/formatacao";
import type { AmostraResumo } from "../tipos/banco";
import { OverviewTab } from "./sample-tabs/VisaoGeralTab";
import { OrigemTexto } from "./SamplesListPage";
import { classeStatus, STATUS_ROTULO } from "../utils/status";

// ícone de cada análise (mesma ordem da reunião: 1 Petrofísica … 8 MEV)
const ICONES: Record<string, LucideIcon> = {
  petrofisica: Gauge,
  microct: Scan,
  coreflooding: Droplets,
  reatividade: FlaskConical,
  rda: RotateCw,
  drx: Atom,
  petrografia: Microscope,
  mev: ScanEye,
};

type ConferenciaRow = { id: number; data: string; responsaveis: string; resultado: string; observacao: string | null };

export function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const abaNaUrl = searchParams.get("tab") ?? "geral";
  // links antigos da aba separada abrem a aba RDA, onde a dissolução estática fica agora
  const activeTab = abaNaUrl === "reatividade-t50" ? "rda" : abaNaUrl;
  const empresaSigla = useContexto((s) => s.empresaSigla);

  const amostra = useConsulta(() => obterAmostra(id!), [id]);
  const limitada = ehVisaoLimitadaLcpetro(amostra.dados, empresaSigla);
  const controle = useConsulta(() => (limitada ? Promise.resolve(null) : obterControleDaAmostra(id!)), [id, limitada]);
  const conferencias = useConsulta(() => listarConferencias(id!) as Promise<ConferenciaRow[]>, [id]);
  const reatividadeT50 = useConsulta(
    () => (limitada ? Promise.resolve([]) : listarReatividadeDaAmostra(id!)),
    [id, limitada],
  );

  if (amostra.carregando && !amostra.dados) return <Carregando />;
  if (amostra.erro || !amostra.dados) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <p className="font-heading font-bold text-xl text-[var(--color-neutral-500)]">Amostra não encontrada.</p>
        {amostra.erro && <Aviso tipo="erro">{amostra.erro}</Aviso>}
        <button type="button" onClick={() => navigate("/amostras")}
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-red)] hover:text-[var(--color-red-700)] transition-colors">
          <ArrowLeft size={15} /> Voltar ao banco de amostras
        </button>
      </div>
    );
  }

  const a = amostra.dados;

  // MODO LIMITADO (LC PETRO Interno visualizando amostra alocada em outra empresa/projeto):
  // Exibe onde a amostra está, quais experimentos ela tem e a petrofísica básica, protegendo dados sensíveis.
  if (limitada) {
    const onde = ondeAmostraEsta(a);
    const exps = experimentosDaAmostra(a);
    const k = melhorK(a);
    const ultimaConf = conferencias.dados?.[0] ?? null;

    return (
      <div>
        <div className="bg-white border-b border-[var(--color-neutral-300)] px-7 py-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-neutral-500)] uppercase tracking-[0.07em]">
            <span className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-red)] transition-colors" onClick={() => navigate("/amostras")}>
              <ArrowLeft size={12} /> Banco de Amostras (Visão Global LC PETRO)
            </span>
            <span>/</span>
            <span>{a.codigo}</span>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-5 mt-5">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="m-0 text-[26px] leading-[1.2] font-heading font-extrabold text-[var(--color-red)]">
                  {a.codigo} <span className="text-[var(--color-blue-800)] font-bold">{litologiaSegura(a, true)}</span>
                </h1>
                <span className={classeStatus(a.status)}>{STATUS_ROTULO[a.status]}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-orange-50)] border border-[var(--color-orange-200)] px-3 py-1 text-[12px] font-bold text-[var(--color-orange-700)]">
                  <Lock size={13} /> {a.empresa} · {a.projeto} (Visão Limitada)
                </span>
              </div>
              <p className="mt-2 text-[13px] text-[var(--color-neutral-600)]">
                Localização física: <strong>{onde.localFisico}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="px-7 pt-7 pb-10 flex flex-col gap-6">
          <div className="rounded-xl border border-[var(--color-orange-200)] bg-[var(--color-orange-50)]/70 p-4 flex items-start gap-3 text-[13px] text-[var(--color-neutral-800)]">
            <Lock size={18} className="text-[var(--color-orange-700)] shrink-0 mt-0.5" />
            <div>
              <strong className="text-[var(--color-orange-700)]">Visualização Limitada (Dados Sensíveis Protegidos):</strong>{" "}
              Esta amostra pertence ao projeto externo <strong>{a.empresa} · {a.projeto}</strong>. Pela empresa interna LC PETRO é possível consultar{" "}
              <strong>onde a amostra está</strong>, <strong>quais experimentos ela possui</strong> e sua <strong>petrofísica básica</strong>. Dados sensíveis (poço, campo, profundidades, formulações químicas, PVbt, curvas e laudos) permanecem ocultos.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Onde a amostra está */}
            <Cartao titulo="Onde a amostra está" subtitulo="Localização física no laboratório, status atual e alocação" icone={<MapPin size={18} />}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-7">
                <Valor rotulo="Local Físico" destaque>{onde.localFisico}</Valor>
                <Valor rotulo="Status no Estoque" destaque>{STATUS_ROTULO[a.status]}</Valor>
                <Valor rotulo="Empresa / Projeto Alocado">{a.empresa} · {a.projeto}</Valor>
                <Valor rotulo="Tipo de Amostra">
                  {a.tipo_amostra === "disco" ? "Disco" : a.tipo_amostra === "mini_plug" ? "Mini-plug" : "Plug"}
                  {a.amostra_mae_codigo ? ` · cortado de ${a.amostra_mae_codigo}` : ""}
                </Valor>
                <Valor rotulo="Última Conferência Física">
                  {ultimaConf ? `${ultimaConf.resultado.toUpperCase()} (${fmtData(ultimaConf.data)} · ${ultimaConf.responsaveis})` : "Sem conferência registrada"}
                </Valor>
                <Valor rotulo="Origem / Poço">
                  <span className="inline-flex items-center gap-1 text-[12px] text-[var(--color-neutral-500)] italic">
                    <Lock size={12} /> {a.tipo_origem} (dados protegidos)
                  </span>
                </Valor>
              </div>
            </Cartao>

            {/* 2. Quais experimentos ela tem */}
            <Cartao titulo="Quais experimentos ela tem" subtitulo="Experimentos realizados ou vinculados a esta amostra (resultados confidenciais ocultos)" icone={<ClipboardCheck size={18} />}>
              <div className="p-7 flex flex-col gap-4">
                {exps.length === 0 ? (
                  <p className="m-0 text-[13px] text-[var(--color-neutral-500)]">Nenhum experimento registrado para esta amostra até o momento.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ANALISES.map((cfg) => {
                      const n = Number(a[cfg.contador as keyof AmostraResumo] ?? 0);
                      const marcado = ensaiosDaFinalidade(a.finalidade).includes(cfg.chave);
                      if (n === 0 && !marcado) return null;
                      const Icon = ICONES[cfg.chave];
                      return (
                        <div key={cfg.chave} className="flex items-center justify-between rounded-xl border border-[var(--color-blue-200)] bg-[var(--color-blue-50)]/50 px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Icon size={16} className="text-[var(--color-blue)]" />
                            <span className="font-heading font-bold text-[13px] text-[var(--color-blue-800)]">{cfg.titulo}</span>
                          </div>
                          <span className="tag tag-blue !text-[10px]">
                            {n > 0 ? `${n} registro(s)` : "Vinculado"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Cartao>
          </div>

          {/* 3. Geometria & Petrofísica Básica */}
          <Cartao titulo="Geometria e Petrofísica Básica" subtitulo="Propriedades físicas básicas do plug/disco" icone={<Layers size={18} />}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5 p-7">
              <Valor rotulo="Dimensões (D × L)">{dimensoes(a)}</Valor>
              <Valor rotulo="Massa Seca">{a.massa_seca_g != null ? `${fmt(a.massa_seca_g, 2)} g` : "—"}</Valor>
              <Valor rotulo="Volume Poroso (Vp)" calculado>{a.volume_poroso_cm3 != null ? `${fmt(a.volume_poroso_cm3, 3)} cm³` : "—"}</Valor>
              <Valor rotulo="Porosidade (φ)" destaque>{a.porosidade_pct != null ? `${fmt(a.porosidade_pct, 1)} %` : "—"}</Valor>
              <Valor rotulo="Permeabilidade (k)" destaque>{k ? `${k.texto} mD (${k.origem})` : "—"}</Valor>
              <Valor rotulo="k do Fabricante">{fmtPermFabricante(a)}</Valor>
            </div>
          </Cartao>
        </div>
      </div>
    );
  }

  const ensaiosReatT50 = reatividadeT50.dados ?? [];
  // n_reatividade soma os ensaios de dissolução; eles aparecem na aba RDA
  const contagem = (chave: string, n: number) =>
    chave === "reatividade" ? Math.max(0, n - ensaiosReatT50.length) : chave === "rda" ? n + ensaiosReatT50.length : n;
  const todas = ANALISES.map((cfg) => ({
    key: cfg.chave,
    label: `${cfg.numero}. ${cfg.titulo}`,
    icon: ICONES[cfg.chave],
    n: contagem(cfg.chave, Number(a[cfg.contador as keyof AmostraResumo] ?? 0)),
  }));
  const marcados = ensaiosDaFinalidade(a.finalidade);
  const abas: { key: string; label: string; icon: LucideIcon; n?: number }[] = [
    { key: "geral", label: "Visão Geral", icon: ClipboardList },
    ...todas.filter((t) => t.n > 0 || marcados.includes(t.key)),
  ];
  const cfgAtiva = abas.some((t) => t.key === activeTab) ? ANALISES.find((c) => c.chave === activeTab) : undefined;
  const semEnsaio = marcados.length === 0 && todas.every((t) => t.n === 0) && ensaiosReatT50.length === 0;

  return (
    <div>
      <div className="bg-white border-b border-[var(--color-neutral-300)] px-7 pt-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-neutral-500)] uppercase tracking-[0.07em]">
          <span className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-red)] transition-colors" onClick={() => navigate("/amostras")}>
            <ArrowLeft size={12} /> Banco de Amostras
          </span>
          <span>/</span>
          <span>{a.codigo}</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5 mt-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="m-0 text-[26px] leading-[1.2] font-heading font-extrabold text-[var(--color-red)]">
                {a.codigo} <span className="text-[var(--color-blue-800)] font-bold">{a.litologia}</span>
              </h1>
              <span className={classeStatus(a.status)}>{STATUS_ROTULO[a.status]}</span>
              <span className="tag tag-blue">{a.empresa} · {a.projeto}</span>
            </div>
            <p className="mt-2 text-[13px]">
              <OrigemTexto a={a} />
              {rotuloFinalidade(a.finalidade) && <span className="tag tag-outline ml-2">{rotuloFinalidade(a.finalidade)}</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-7 gap-y-1 mt-7">
          {abas.map(({ key, label, icon: Icon, n }) => {
            const ativa = activeTab === key;
            return (
              <div key={key} onClick={() => setSearchParams({ tab: key })}
                className={`flex items-center gap-2 pb-3 cursor-pointer text-[13px] font-semibold whitespace-nowrap border-b-[3px] transition-all ${ativa
                  ? "border-[var(--color-orange)] text-[var(--color-blue-800)]"
                  : "border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-blue)] hover:border-[var(--color-blue-200)]"}`}>
                <Icon size={14} className={ativa ? "text-[var(--color-red)]" : "text-[var(--color-neutral-400)]"} />
                {label}
                {n != null && (n > 0
                  ? <span className="rounded-full bg-[var(--color-blue)] px-1.5 text-[10px] font-bold text-white">{n}</span>
                  : <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neutral-300)]" title="Sem registros" />)}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-7 pt-7 pb-10">
        {activeTab === "geral" && a.status === "utilizada" && semEnsaio && (
          <div className="mb-5"><Aviso tipo="info">Esta amostra está como utilizada, mas não tem nenhum ensaio registrado.</Aviso></div>
        )}
        {activeTab === "geral" && <OverviewTab a={a} podeEditar={false} observacoes={controle.dados?.observacoes ?? null} />}
        {activeTab === "rda" && ensaiosReatT50.length > 0 && (
          <div className="mb-7"><ReatividadeT50DaAmostra ensaios={ensaiosReatT50} /></div>
        )}
        {cfgAtiva && <AbaAnalise key={cfgAtiva.chave} cfg={cfgAtiva} amostraId={a.id} podeEditar={false} aoMudar={amostra.recarregar}
          amostra={{ finalidade: a.finalidade, status: a.status, codigo: a.codigo, comprimento_cm: a.comprimento_cm, diametro_cm: a.diametro_cm }} controle={controle.dados ?? null}
          antes={cfgAtiva.chave === "coreflooding"
            ? <PermeabilidadeCoreflood amostraId={a.id} amostra={{ codigo: a.codigo, comprimento_cm: a.comprimento_cm, diametro_cm: a.diametro_cm }} />
            : undefined}
          extra={cfgAtiva.chave === "coreflooding" ? <PvbtDaAmostra amostraId={a.id} codigo={a.codigo} />
            : cfgAtiva.chave === "rda" ? <RdaDaAmostra codigo={a.codigo} projetoId={a.projeto_id} litologia={a.litologia} /> : undefined} />}
      </div>
    </div>
  );
}
