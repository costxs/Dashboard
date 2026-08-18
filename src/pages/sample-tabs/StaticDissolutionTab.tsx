import { FlaskConical } from "lucide-react";
import type { StaticDissolutionData } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { LineChartCard } from "../../components/charts/LineChartCard";

interface StaticDissolutionTabProps {
  data?: StaticDissolutionData;
}

export function StaticDissolutionTab({ data }: StaticDissolutionTabProps) {
  if (!data) return <EmptyState message="Ensaio de dissolução estática ainda não realizado para esta amostra." />;

  const massLossTotal = data.initialMassG - data.finalMassG;
  const massLossPercent = (massLossTotal / data.initialMassG) * 100;

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <FlaskConical size={18} className="text-[var(--color-neutral-500)]" />
          <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Ensaio de Dissolução Estática (PVBT)</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-7 p-7">
          <div className="field">
            <label>Tipo de Ácido</label>
            <div className="font-medium text-[14px] mt-1">{data.acidType}</div>
          </div>
          <div className="field">
            <label>Concentração</label>
            <div className="font-medium text-[14px] mt-1">{data.acidConcentrationPercent}%</div>
          </div>
          <div className="field">
            <label>Temperatura</label>
            <div className="font-medium text-[14px] mt-1">{data.temperatureC} °C</div>
          </div>
          <div className="field">
            <label>Massa Inicial</label>
            <div className="font-medium text-[14px] mt-1">{data.initialMassG} g</div>
          </div>
          <div className="field">
            <label>Massa Final</label>
            <div className="font-medium text-[14px] mt-1">{data.finalMassG} g</div>
          </div>
          <div className="field">
            <label>Perda de Massa Total</label>
            <div className="font-medium text-[14px] mt-1">{massLossTotal.toFixed(2)} g</div>
          </div>
          <div className="field">
            <label>Perda de Massa (%)</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">{massLossPercent.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <LineChartCard
        title="Perda de Massa vs. Tempo"
        subtitle="Curva PVBT — leitura convertida do ensaio (.opju → CSV)"
        icon={FlaskConical}
        data={data.massLossCurve}
        xKey="timeMin"
        xLabel="Tempo (min)"
        yLabel="Perda de Massa (%)"
        series={[{ dataKey: "massLossPercent", label: "Perda de Massa (%)", color: "var(--color-accent)" }]}
      />
    </div>
  );
}
