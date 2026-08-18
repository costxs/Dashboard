import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import { Images } from "lucide-react";
import { rockImageDataUri } from "../utils/placeholderImage";

interface ImageComparatorProps {
  title: string;
  subtitle?: string;
  beforeSeed: string;
  afterSeed: string;
  beforeLabel: string;
  afterLabel: string;
}

export function ImageComparator({
  title,
  subtitle,
  beforeSeed,
  afterSeed,
  beforeLabel,
  afterLabel,
}: ImageComparatorProps) {
  return (
    <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
        <Images size={18} className="text-[var(--color-neutral-500)]" />
        <div>
          <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">{title}</h2>
          {subtitle && <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">{subtitle}</p>}
        </div>
      </div>
      <div className="p-7">
        <div className="overflow-hidden rounded-lg border border-[var(--color-neutral-300)] shadow-sm">
          <ReactCompareSlider
            itemOne={
              <ReactCompareSliderImage
                src={rockImageDataUri(beforeSeed, "before")}
                alt={beforeLabel}
              />
            }
            itemTwo={
              <ReactCompareSliderImage
                src={rockImageDataUri(afterSeed, "after")}
                alt={afterLabel}
              />
            }
            style={{ height: 420, width: "100%" }}
            handle={
              <div className="flex h-full w-1 items-center justify-center bg-[var(--color-accent)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-white text-[12px] font-extrabold text-[var(--color-accent)] shadow-md">
                  ↔
                </div>
              </div>
            }
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-[12px] font-semibold text-[var(--color-neutral-600)]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-neutral-400)] shadow-sm" /> {beforeLabel}
          </span>
          <span className="text-[11px] uppercase tracking-[0.05em] text-[var(--color-neutral-500)]">Arraste a barra para comparar</span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] shadow-sm" /> {afterLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
