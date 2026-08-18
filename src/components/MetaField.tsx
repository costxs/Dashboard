import type { ReactNode } from "react";

interface MetaFieldProps {
  label: string;
  value: ReactNode;
}

export function MetaField({ label, value }: MetaFieldProps) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
