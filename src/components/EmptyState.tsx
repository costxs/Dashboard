import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";

interface EmptyStateProps {
  message?: string;
  acao?: ReactNode;
}

export function EmptyState({
  message = "Nenhum dado disponível ainda.",
  acao,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--color-blue-200)] bg-white py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-blue-50)] text-[var(--color-blue)]">
        <FolderOpen size={20} strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-sm text-[var(--color-neutral-600)]">{message}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
