import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Atom,
  ClipboardList,
  Droplets,
  FlaskConical,
  type LucideIcon,
  Microscope,
  Scan,
  ScanEye,
} from "lucide-react";
import { experimentResults } from "../data/samples";
import { OverviewTab } from "./sample-tabs/OverviewTab";
import { PetrographyTab } from "./sample-tabs/PetrographyTab";
import { CorefloodingTab } from "./sample-tabs/CorefloodingTab";
import { XrdTab } from "./sample-tabs/XrdTab";
import { StaticDissolutionTab } from "./sample-tabs/StaticDissolutionTab";
import { MicroCtTab } from "./sample-tabs/MicroCtTab";
import { SemTab } from "./sample-tabs/SemTab";

type TabKey =
  | "overview"
  | "petrography"
  | "coreflooding"
  | "xrd"
  | "static-dissolution"
  | "microct"
  | "sem";

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const tabs: TabDef[] = [
  { key: "overview", label: "Visão Geral", icon: ClipboardList },
  { key: "petrography", label: "Análise Petrográfica", icon: Microscope },
  { key: "coreflooding", label: "Coreflooding", icon: Droplets },
  { key: "xrd", label: "Difração de Raios X", icon: Atom },
  { key: "static-dissolution", label: "Dissolução Estática", icon: FlaskConical },
  { key: "microct", label: "Microtomografia de Raios X", icon: Scan },
  { key: "sem", label: "Microscopia Eletrônica de Varredura (MEV)", icon: ScanEye },
];

export function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const result = id ? experimentResults[id] : undefined;
  const activeTab = (searchParams.get("tab") as TabKey) ?? "overview";

  const availability = useMemo(() => {
    if (!result) return {} as Record<TabKey, boolean>;
    return {
      overview: true,
      petrography: !!result.petrography,
      coreflooding: !!result.coreflooding,
      xrd: !!result.xrd,
      "static-dissolution": !!result.staticDissolution,
      microct: !!result.microCt,
      sem: !!result.sem,
    } satisfies Record<TabKey, boolean>;
  }, [result]);

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="font-heading font-bold text-xl text-[var(--color-neutral-500)]">Amostra não encontrada.</p>
        <button
          type="button"
          onClick={() => navigate("/amostras")}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-700)] transition-colors"
        >
          <ArrowLeft size={15} /> Voltar ao banco de amostras
        </button>
      </div>
    );
  }

  const { sample } = result;

  function setTab(tab: TabKey) {
    setSearchParams({ tab });
  }

  return (
    <div>
      <div className="bg-white border-b border-[var(--color-neutral-300)] px-7 pt-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-neutral-500)] uppercase tracking-[0.07em]">
          <span
            className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-accent)] transition-colors"
            onClick={() => navigate("/amostras")}
          >
            <ArrowLeft size={12} /> Banco de Amostras
          </span>
          <span>/</span>
          <span>{sample.code}</span>
        </div>

        <div className="flex items-start justify-between gap-5 mt-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="m-0 text-[24px] leading-[1.2] font-heading font-extrabold text-[var(--color-accent)]">
                {sample.code}{" "}
                <span className="text-[var(--color-text)] font-bold">{sample.name}</span>
              </h1>
              <span className="tag tag-accent">{sample.project}</span>
            </div>
            <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
              {sample.lithoType} &middot; {sample.well}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {sample.tags.map((tag) => (
              <span key={tag} className="tag tag-neutral">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-8 mt-8 overflow-x-auto scrollbar-hide">
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            const hasData = availability[key];
            return (
              <div
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 pb-3 cursor-pointer text-[13px] font-semibold whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? "border-[var(--color-accent)] text-[var(--color-accent-800)]"
                    : "border-transparent text-[var(--color-neutral-600)] hover:text-[var(--color-neutral-900)] hover:border-[var(--color-neutral-300)]"
                }`}
              >
                <Icon size={14} className={isActive ? "text-[var(--color-accent)]" : "text-[var(--color-neutral-400)]"} />
                {label}
                {!hasData && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-neutral-300)] ml-1"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-7 pt-7 pb-10">
        {activeTab === "overview" && <OverviewTab sample={sample} />}
        {activeTab === "petrography" && <PetrographyTab data={result.petrography} />}
        {activeTab === "coreflooding" && <CorefloodingTab data={result.coreflooding} />}
        {activeTab === "xrd" && <XrdTab data={result.xrd} />}
        {activeTab === "static-dissolution" && (
          <StaticDissolutionTab data={result.staticDissolution} />
        )}
        {activeTab === "microct" && <MicroCtTab data={result.microCt} />}
        {activeTab === "sem" && <SemTab data={result.sem} />}
      </div>
    </div>
  );
}
