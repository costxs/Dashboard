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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-[var(--color-neutral-300)] shadow-sm">
              <img
                src={rockImageDataUri(beforeSeed, "before")}
                alt={beforeLabel}
                className="w-full h-[320px] object-cover"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--color-neutral-700)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-neutral-400)] shadow-sm" /> {beforeLabel}
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="overflow-hidden rounded-lg border border-[var(--color-neutral-300)] shadow-sm">
              <img
                src={rockImageDataUri(afterSeed, "after")}
                alt={afterLabel}
                className="w-full h-[320px] object-cover"
              />
            </div>
            <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--color-neutral-700)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)] shadow-sm" /> {afterLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
