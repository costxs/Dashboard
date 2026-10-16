import type { MineralComponent } from "../types";
import { ProgressBar } from "./ui/ProgressBar";

const colorCycle: Array<"amber" | "sky" | "emerald" | "rose" | "slate"> = [
  "amber",
  "sky",
  "emerald",
  "rose",
  "slate",
];

interface MineralCompositionProps {
  minerals: MineralComponent[];
}

export function MineralComposition({ minerals }: MineralCompositionProps) {
  return (
    <div className="space-y-3">
      {minerals.map((m, i) => (
        <div key={m.mineral}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">{m.mineral}</span>
            <span className="tabular-nums text-slate-500">{m.percent}%</span>
          </div>
          <ProgressBar percent={m.percent} tone={colorCycle[i % colorCycle.length]} />
        </div>
      ))}
    </div>
  );
}
