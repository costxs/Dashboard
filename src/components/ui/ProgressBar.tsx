import clsx from "clsx";

interface ProgressBarProps {
  percent: number;
  tone?: "amber" | "emerald" | "rose" | "sky" | "slate";
  className?: string;
  showLabel?: boolean;
}

const toneClasses: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  slate: "bg-slate-500",
};

export function ProgressBar({
  percent,
  tone = "amber",
  className,
  showLabel = false,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx("h-full rounded-full transition-all", toneClasses[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-slate-600">
          {clamped}%
        </span>
      )}
    </div>
  );
}
