import { Scan } from "lucide-react";
import type { ImageStudy } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { ImageComparator } from "../../components/ImageComparator";

interface MicroCtTabProps {
  data?: ImageStudy;
}

export function MicroCtTab({ data }: MicroCtTabProps) {
  if (!data)
    return (
      <EmptyState message="Reconstrução de microtomografia de raios X ainda não disponível para esta amostra." />
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <Scan size={18} className="text-[var(--color-neutral-500)]" />
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Microtomografia de Raios X</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Metadados da reconstrução volumétrica</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-7 p-7 sm:grid-cols-3">
          <div className="field">
            <label>Resolução</label>
            <div className="font-medium text-[14px] mt-1">{data.resolutionMicronsPerVoxel ? `${data.resolutionMicronsPerVoxel} µm/voxel` : "—"}</div>
          </div>
          <div className="field">
            <label>Volume de Wormhole Estimado</label>
            <div className="font-medium text-[14px] mt-1">{data.wormholeVolumeMm3 ? `${data.wormholeVolumeMm3} mm³` : "—"}</div>
          </div>
        </div>
        <div className="border-t border-[var(--color-neutral-300)] px-7 py-5 bg-[var(--color-neutral-200)] rounded-b-[14px]">
          <p className="m-0 mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">Notas de Interpretação</p>
          <p className="m-0 text-[14px] text-[var(--color-neutral-800)]">{data.notes}</p>
        </div>
      </div>

      <ImageComparator
        title="Comparador Antes / Depois"
        subtitle="Mesma seção — evidência da evolução dos wormholes por dissolução ácida"
        beforeSeed={data.beforeSeed}
        afterSeed={data.afterSeed}
        beforeLabel={data.beforeLabel}
        afterLabel={data.afterLabel}
      />
    </div>
  );
}
