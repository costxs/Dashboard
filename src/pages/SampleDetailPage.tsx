import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Atom,
  ClipboardList,
  Droplets,
  FlaskConical,
  Gauge,
  type LucideIcon,
  Microscope,
  RotateCw,
  Scan,
  ScanEye,
} from "lucide-react";
import { AbaAnalise } from "../components/analises/AbaAnalise";
import { PermeabilidadeCoreflood } from "../components/analises/PermeabilidadeCoreflood";
import { RdaDaAmostra } from "../components/analises/RdaDaAmostra";
import { PvbtDaAmostra } from "../components/pvbt/PvbtDaAmostra";
import { Aviso, Carregando } from "../components/ui/base";
import { ANALISES } from "../config/analises";
import { useConsulta } from "../hooks/useConsulta";
import { obterAmostra, obterControleDaAmostra } from "../servicos/amostras";
import { rotuloFinalidade } from "../utils/controleRochas";
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

export function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "geral";

  const amostra = useConsulta(() => obterAmostra(id!), [id]);
  // observações e petrofísica "depois": vêm do controle de rochas e a view v_amostras não traz
  const controle = useConsulta(() => obterControleDaAmostra(id!), [id]);

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
  const todas = ANALISES.map((cfg) => ({
    key: cfg.chave,
    label: `${cfg.numero}. ${cfg.titulo}`,
    icon: ICONES[cfg.chave],
    n: Number(a[cfg.contador as keyof AmostraResumo] ?? 0),
  }));
  // só aparecem as abas dos ensaios que foram realizados nesta amostra. Os ensaios são lançados no painel gerencial:
  // aqui as abas são só de consulta
  const abas: { key: string; label: string; icon: LucideIcon; n?: number }[] = [
    { key: "geral", label: "Visão Geral", icon: ClipboardList },
    ...todas.filter((t) => t.n > 0),
  ];
  const cfgAtiva = abas.some((t) => t.key === activeTab) ? ANALISES.find((c) => c.chave === activeTab) : undefined;
  const semEnsaio = todas.every((t) => t.n === 0);

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
