import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  message?: string;
}

export function EmptyState({
  message = "Nenhum dado disponível para esta pasta de laboratório ainda.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <FolderOpen size={20} strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-sm text-slate-500">{message}</p>
    </div>
  );
}
