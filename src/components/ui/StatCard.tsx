import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  tone?: "amber" | "emerald" | "sky" | "rose";
}

const toneClasses = {
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  tone = "amber",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <div className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {trend && (
          <span
            className={clsx(
              "text-xs font-medium",
              trend.positive ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
