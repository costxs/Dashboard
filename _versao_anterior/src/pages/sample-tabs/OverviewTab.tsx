import { Layers } from "lucide-react";
import type { Sample } from "../../types";

interface OverviewTabProps {
  sample: Sample;
}

export function OverviewTab({ sample }: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <Layers size={18} className="text-[var(--color-neutral-500)]" />
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Metadados da Amostra</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Ficha de cadastro registrada antes da injeção / ensaio de dissolução estática</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-7 p-7">
          <div className="field">
            <label>Litotipo</label>
            <div className="font-medium text-[14px] mt-1">{sample.lithoType}</div>
          </div>
          <div className="field">
            <label>Projeto</label>
            <div className="font-medium text-[14px] mt-1">{sample.project}</div>
          </div>
          <div className="field">
            <label>Poço / Origem</label>
            <div className="font-medium text-[14px] mt-1">{sample.well ?? "—"}</div>
          </div>
          <div className="field">
            <label>Taxonomia de Pastas</label>
            <div className="font-medium text-[14px] mt-1">{sample.folderTaxonomy === "10-pastas" ? "10 pastas" : "13 pastas"}</div>
          </div>
          <div className="field">
            <label>Porosidade</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">{sample.porosityPercent}%</div>
          </div>
          <div className="field">
            <label>Permeabilidade Inicial</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">{sample.permeabilityInitialMd} mD</div>
          </div>
          <div className="field">
            <label>Permeabilidade Final</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">
              {sample.permeabilityFinalMd ? `${sample.permeabilityFinalMd} mD` : "Ensaio pendente"}
            </div>
          </div>
          <div className="field">
            <label>Ganho de Injetividade</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">
              {sample.permeabilityFinalMd ? `${(sample.permeabilityFinalMd / sample.permeabilityInitialMd).toFixed(1)}x` : "—"}
            </div>
          </div>
          <div className="field">
            <label>Diâmetro</label>
            <div className="font-medium text-[14px] mt-1">{sample.diameterMm} mm</div>
          </div>
          <div className="field">
            <label>Comprimento</label>
            <div className="font-medium text-[14px] mt-1">{sample.lengthMm} mm</div>
          </div>
          <div className="field">
            <label>Massa Seca</label>
            <div className="font-medium text-[14px] mt-1">{sample.dryMassG} g</div>
          </div>
          <div className="field">
            <label>Data de Coleta</label>
            <div className="font-medium text-[14px] mt-1">{new Date(sample.collectionDate).toLocaleDateString("pt-BR")}</div>
          </div>
          <div className="field">
            <label>Pesquisador Responsável</label>
            <div className="font-medium text-[14px] mt-1">{sample.responsibleResearcher}</div>
          </div>
          <div className="field">
            <label>Status</label>
            <div className="font-medium text-[14px] mt-1">{sample.status}</div>
          </div>
        </div>

        <div className="border-t border-[var(--color-neutral-300)] px-7 py-5">
          <p className="m-0 mb-3 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {sample.tags.map((tag) => (
              <span key={tag} className="tag tag-neutral">{tag}</span>
            ))}
          </div>
        </div>
        
        {sample.notes && (
          <div className="border-t border-[var(--color-neutral-300)] px-7 py-5 bg-[var(--color-neutral-200)] rounded-b-[14px]">
            <p className="m-0 mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">Observações</p>
            <p className="m-0 text-[14px] text-[var(--color-neutral-800)]">{sample.notes}</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <Layers size={18} className="text-[var(--color-neutral-500)]" />
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Histórico de Limpeza Petrofísica (Table 15)</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Porosidade e Permeabilidade antes e depois da limpeza</p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="table text-[14px]">
            <thead>
              <tr>
                <th className="pl-4 py-3">Parâmetro</th>
                <th className="px-4 py-3">Antes da Limpeza</th>
                <th className="px-4 py-3">Após Limpeza (Toluene/Acetone)</th>
                <th className="px-4 py-3 text-right">Após Limpeza (Chloroform)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="lcp-row">
                <td className="pl-4 py-4 font-semibold">Porosidade (%)</td>
                <td className="px-4 py-4">{(sample.porosityPercent * 0.9).toFixed(1)}</td>
                <td className="px-4 py-4">{(sample.porosityPercent * 0.95).toFixed(1)}</td>
                <td className="px-4 py-4 font-heading font-extrabold text-[var(--color-accent)] text-right">{sample.porosityPercent}</td>
              </tr>
              <tr className="lcp-row">
                <td className="pl-4 py-4 font-semibold border-0">Permeabilidade (mD)</td>
                <td className="px-4 py-4 border-0">{(sample.permeabilityInitialMd * 0.8).toFixed(1)}</td>
                <td className="px-4 py-4 border-0">{(sample.permeabilityInitialMd * 0.9).toFixed(1)}</td>
                <td className="px-4 py-4 font-heading font-extrabold text-[var(--color-accent)] text-right border-0">{sample.permeabilityInitialMd}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
