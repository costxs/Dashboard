import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, List, RotateCcw } from "lucide-react";
import { useSampleStore } from "../store/useSampleStore";
import type { LithoType, SampleStatus } from "../types";
import { Select } from "../components/ui/Select";

const lithoTypes: (LithoType | "Todos")[] = [
  "Todos",
  "Indiana Limestone",
  "Silurian Dolomite",
  "Travertino Ataxico",
  "Calcário Coquina",
  "Calcário Microporoso Pré-Sal",
  "Dolomito Jandaíra",
];

const statuses: (SampleStatus | "Todos")[] = [
  "Todos",
  "Cadastrada",
  "Em Ensaio",
  "Ensaiada",
  "Arquivada",
];

const getStatusStyle = (status: string) => {
  switch (status) {
    case "Cadastrada": return "tag tag-neutral";
    case "Em Ensaio": return "tag tag-outline";
    case "Ensaiada": return "tag tag-solid";
    case "Arquivada": return "tag tag-neutral";
    default: return "tag tag-neutral";
  }
};

export function SamplesListPage() {
  const navigate = useNavigate();
  const allSamples = useSampleStore((s) => s.samples);
  const project = useSampleStore((s) => s.activeProject);
  const filters = useSampleStore((s) => s.filters);
  const setFilter = useSampleStore((s) => s.setFilter);
  const resetFilters = useSampleStore((s) => s.resetFilters);
  const [view, setView] = useState<"table" | "grid">("table");

  const projectSamples = allSamples.filter((s) => s.project === project);
  // Re-apply filters specifically on projectSamples to match prototype behavior 
  // since useFilteredSamples from store might include other projects if we don't set it.
  // Wait, the store's `useFilteredSamples` already filters by `filters.project`.
  // To make sure it matches the active project, I'll update the filter if needed, 
  // but it's better to just filter here for UI display.
  
  const displayedSamples = projectSamples.filter(
    (s) =>
      (filters.lithoType === "Todos" || s.lithoType === filters.lithoType) &&
      (filters.status === "Todos" || s.status === filters.status) &&
      s.permeabilityInitialMd >= filters.minPermeability &&
      s.permeabilityInitialMd <= filters.maxPermeability &&
      (filters.searchQuery === "" ||
        s.name.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        (s.well?.toLowerCase() || "").includes(filters.searchQuery.toLowerCase()) ||
        s.tags.some((t) => t.toLowerCase().includes(filters.searchQuery.toLowerCase())))
  );

  const maxPermeabilityInData = useMemo(
    () => Math.max(...projectSamples.map((s) => s.permeabilityInitialMd)),
    [projectSamples]
  );

  const VIEWBTN = "flex items-center gap-2 px-4 py-2 font-heading font-bold text-[13px] cursor-pointer transition-colors";

  return (
    <div>
      <div className="flex items-end justify-between gap-8 px-7 pt-8 pb-5">
        <div>
          <span className="inline-block bg-[var(--color-accent)] text-white px-3 py-1.5 rounded-full font-heading font-semibold text-[11px] tracking-[0.07em] uppercase">
            {project}
          </span>
          <h1 className="mt-3 text-[27px] leading-[1.2]">Banco de Amostras</h1>
          <p className="mt-2.5 text-[13px] text-[var(--color-neutral-700)]">
            {displayedSamples.length} de {projectSamples.length} amostras &middot; projeto {project}
          </p>
        </div>
        <div className="flex border border-[var(--color-neutral-300)] rounded-[10px] overflow-hidden shrink-0">
          <div
            onClick={() => setView("table")}
            className={`${VIEWBTN} ${
              view === "table" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-neutral-200)]"
            }`}
          >
            <List size={15} /> Tabela
          </div>
          <div
            onClick={() => setView("grid")}
            className={`${VIEWBTN} border-l border-[var(--color-neutral-300)] ${
              view === "grid" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-neutral-700)] bg-white hover:bg-[var(--color-neutral-200)]"
            }`}
          >
            <LayoutGrid size={15} /> Grid
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-5 items-end bg-white border-y border-[var(--color-neutral-300)] px-7 py-4">
        <div className="field">
          <Select
            label="Litotipo"
            value={filters.lithoType}
            onChange={(val) => setFilter("lithoType", val)}
            options={lithoTypes}
          />
        </div>
        <div className="field">
          <Select
            label="Status"
            value={filters.status}
            onChange={(val) => setFilter("status", val)}
            options={statuses}
          />
        </div>
        <div className="field">
          <label>Permeabilidade mín. (mD)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={filters.minPermeability}
            onChange={(e) => setFilter("minPermeability", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Permeabilidade máx. (mD)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={maxPermeabilityInData}
            value={filters.maxPermeability}
            onChange={(e) => setFilter("maxPermeability", Number(e.target.value))}
          />
        </div>
        <div className="flex justify-start">
          <button
            className="btn btn-secondary w-full"
            type="button"
            onClick={resetFilters}
          >
            <RotateCcw size={14} /> Limpar filtros
          </button>
        </div>
      </div>

      {displayedSamples.length === 0 ? (
        <div className="px-7 pt-12 pb-14">
          <div className="border border-dashed border-[var(--color-neutral-400)] rounded-[16px] px-8 py-11 text-center">
            <p className="m-0 font-heading font-bold text-[17px]">
              Nenhuma amostra encontrada para os filtros aplicados.
            </p>
            <p className="mt-2 text-[13px] text-[var(--color-neutral-700)]">
              Amplie a faixa de permeabilidade ou volte o litotipo e o status para "Todos".
            </p>
            <div
              onClick={resetFilters}
              className="inline-flex items-center gap-2 mt-5 px-[18px] py-[9px] rounded-full bg-[var(--color-accent)] text-white text-[13px] font-semibold cursor-pointer hover:bg-[var(--color-accent-700)] transition-colors"
            >
              <RotateCcw size={14} /> Limpar filtros
            </div>
          </div>
        </div>
      ) : view === "table" ? (
        <div className="px-7 pt-6 pb-10">
          <table className="table text-[14px]">
            <thead>
              <tr>
                <th className="w-[58px]">Cód.</th>
                <th>Amostra</th>
                <th>Litotipo</th>
                <th>Poço / Origem</th>
                <th className="text-right">Poros.</th>
                <th className="text-right">k inicial</th>
                <th className="text-right">k final</th>
                <th className="text-right">Ganho</th>
                <th className="w-[120px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedSamples.map((s) => (
                <tr
                  key={s.id}
                  className="lcp-row cursor-pointer"
                  onClick={() => navigate(`/amostras/${s.id}`)}
                >
                  <td className="font-heading font-extrabold text-[var(--color-accent)]">{s.code}</td>
                  <td className="font-semibold">{s.name}</td>
                  <td className="text-[var(--color-neutral-800)]">{s.lithoType}</td>
                  <td className="text-[var(--color-neutral-700)] text-[13px]">{s.well}</td>
                  <td className="text-right tabular-nums">{s.porosityPercent.toFixed(1)}</td>
                  <td className="text-right tabular-nums">{s.permeabilityInitialMd.toFixed(1)}</td>
                  <td className="text-right tabular-nums">{s.permeabilityFinalMd?.toFixed(1) ?? "—"}</td>
                  <td className="text-right tabular-nums font-heading font-extrabold">
                    {s.permeabilityFinalMd ? (s.permeabilityFinalMd / s.permeabilityInitialMd).toFixed(1) : "—"}
                  </td>
                  <td>
                    <span className={getStatusStyle(s.status)}>{s.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-7 pt-6 pb-10">
          {displayedSamples.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/amostras/${s.id}`)}
              className="bg-white border border-[var(--color-neutral-300)] rounded-[14px] px-[22px] pt-[20px] pb-[22px] cursor-pointer flex flex-col gap-3.5 hover:shadow-md hover:border-[var(--color-accent-100)] transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="m-0 font-heading font-extrabold text-[13px] tracking-[0.06em] text-[var(--color-accent)]">
                    {s.code}
                  </p>
                  <h3 className="mt-1.5 text-[16px] leading-[1.3]">{s.name}</h3>
                  <p className="mt-1.5 text-[13px] text-[var(--color-neutral-700)]">{s.lithoType}</p>
                </div>
                <span className={getStatusStyle(s.status)}>{s.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-[var(--color-neutral-200)] pt-3">
                <div>
                  <p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">Poros.</p>
                  <p className="mt-1 font-heading font-extrabold text-[17px]">{s.porosityPercent.toFixed(1)}</p>
                </div>
                <div>
                  <p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">k inicial</p>
                  <p className="mt-1 font-heading font-extrabold text-[17px]">{s.permeabilityInitialMd.toFixed(1)}</p>
                </div>
                <div>
                  <p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">Ganho</p>
                  <p className="mt-1 font-heading font-extrabold text-[17px] text-[var(--color-accent)]">
                    {s.permeabilityFinalMd ? (s.permeabilityFinalMd / s.permeabilityInitialMd).toFixed(1) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {s.tags.slice(0, 3).map((t) => (
                  <span key={t} className="tag tag-neutral">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
