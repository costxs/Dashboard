import { ClipboardList } from "lucide-react";
import type { WorkPackage } from "../types";
import { Card, CardHeader } from "./ui/Card";
import { Badge, type BadgeTone } from "./ui/Badge";

interface WorkPackageStatusProps {
  workPackages: WorkPackage[];
  title?: string;
  subtitle?: string;
}

const statusTone: Record<WorkPackage["status"], BadgeTone> = {
  Concluded: "success",
  Started: "info",
  "Not-started": "neutral",
};

const statusLabel: Record<WorkPackage["status"], string> = {
  Concluded: "Concluded",
  Started: "Started",
  "Not-started": "Not-started",
};

export function WorkPackageStatus({
  workPackages,
  title = "Work packages progress",
  subtitle = "Table 8: Work packages progress in January 2025",
}: WorkPackageStatusProps) {
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={<ClipboardList size={17} strokeWidth={2} />}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-700">
              <th className="px-5 py-3 w-20 text-center font-bold">WP</th>
              <th className="px-5 py-3 font-bold">Description</th>
              <th className="px-5 py-3 w-36 text-center font-bold">Status</th>
              <th className="px-5 py-3 w-36 text-right font-bold">% of evolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workPackages.map((wp) => (
              <tr
                key={wp.id}
                className="hover:bg-amber-50/30 transition-colors"
              >
                <td className="px-5 py-3.5 text-center font-bold text-slate-800">
                  {wp.code}
                </td>
                <td className="px-5 py-3.5 text-slate-700 font-medium">
                  {wp.description}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <Badge tone={statusTone[wp.status]}>
                    {statusLabel[wp.status]}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-slate-800">
                  {wp.progressPercent}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
