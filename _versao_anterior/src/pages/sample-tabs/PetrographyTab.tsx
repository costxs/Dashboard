import { Microscope } from "lucide-react";
import type { PetrographyData } from "../../types";
import { MineralComposition } from "../../components/MineralComposition";
import { EmptyState } from "../../components/EmptyState";
import { rockImageDataUri } from "../../utils/placeholderImage";

interface PetrographyTabProps {
  data?: PetrographyData;
}

export function PetrographyTab({ data }: PetrographyTabProps) {
  if (!data) return <EmptyState message="Análise petrográfica ainda não cadastrada para esta amostra." />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px] lg:col-span-1">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <Microscope size={18} className="text-[var(--color-neutral-500)]" />
          <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Lâmina Delgada</h2>
        </div>
        <div className="p-6">
          <img
            src={rockImageDataUri(data.imageSeed, "before", 34)}
            alt="Lâmina delgada em luz polarizada"
            className="w-full rounded-lg border border-[var(--color-neutral-300)] object-cover"
          />
          <p className="mt-4 text-center text-[12px] font-medium text-[var(--color-neutral-600)]">
            {data.thinSectionMagnification}
          </p>
        </div>
      </div>

      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px] lg:col-span-2">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Análise Petrográfica</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Descrição textural e composição mineral</p>
          </div>
        </div>
        <div className="flex flex-col gap-8 p-7">
          <div className="grid grid-cols-2 gap-6">
            <div className="field">
              <label>Tipo de Porosidade</label>
              <div className="font-medium text-[14px] mt-1">{data.porosityType}</div>
            </div>
            <div className="field">
              <label>Granulometria Dominante</label>
              <div className="font-medium text-[14px] mt-1">{data.dominantGrainSize}</div>
            </div>
          </div>
          <div>
            <p className="m-0 mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">Descrição</p>
            <p className="m-0 text-[14px] leading-relaxed text-[var(--color-neutral-800)] max-w-prose">{data.description}</p>
          </div>
          <div className="border-t border-[var(--color-neutral-300)] pt-6">
            <p className="m-0 mb-5 text-[14px] font-bold text-[var(--color-neutral-900)]">Composição Mineral</p>
            <MineralComposition minerals={data.mineralComposition} />
          </div>
        </div>
      </div>
    </div>
  );
}
