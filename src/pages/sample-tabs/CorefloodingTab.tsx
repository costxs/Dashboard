import { Droplets } from "lucide-react";
import type { CorefloodingResult } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { LineChartCard } from "../../components/charts/LineChartCard";

interface CorefloodingTabProps {
  data?: CorefloodingResult;
}

export function CorefloodingTab({ data }: CorefloodingTabProps) {
  if (!data) return <EmptyState message="Ensaio de coreflooding ainda não realizado para esta amostra." />;

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <div className="flex items-center gap-3">
            <Droplets size={18} className="text-[var(--color-neutral-500)]" />
            <div>
              <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Parâmetros do Ensaio de Coreflooding</h2>
              <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Estimulação por matriz ácida</p>
            </div>
          </div>
          <span className="tag tag-accent">{data.wormholeClass}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-7 p-7">
          <div className="field">
            <label>Tipo de Ácido</label>
            <div className="font-medium text-[14px] mt-1">{data.acidType}</div>
          </div>
          <div className="field">
            <label>Concentração</label>
            <div className="font-medium text-[14px] mt-1">{data.acidConcentrationPercent}%</div>
          </div>
          <div className="field">
            <label>Vazão</label>
            <div className="font-medium text-[14px] mt-1">{data.flowRateMlMin} mL/min</div>
          </div>
          <div className="field">
            <label>Temperatura</label>
            <div className="font-medium text-[14px] mt-1">{data.temperatureC} °C</div>
          </div>
          <div className="field">
            <label>Pressão de Confinamento</label>
            <div className="font-medium text-[14px] mt-1">{data.confiningPressurePsi} psi</div>
          </div>
          <div className="field">
            <label>PV de Breakthrough</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">{data.breakthroughPv} PV</div>
          </div>
          <div className="field">
            <label>Fator de Injetividade (k_f/k_i)</label>
            <div className="font-heading font-extrabold text-[16px] text-[var(--color-accent)] mt-1">{data.injectivityFactor.toFixed(1)}x</div>
          </div>
          <div className="field">
            <label>Classificação do Wormhole</label>
            <div className="font-medium text-[14px] mt-1">{data.wormholeClass}</div>
          </div>
        </div>
      </div>

      <LineChartCard
        title="Gradiente de Pressão (ΔP) vs. Tempo"
        subtitle="Leitura convertida do ensaio (.opju → CSV)"
        icon={Droplets}
        data={data.pressureCurve}
        xKey="timeMin"
        xLabel="Tempo (min)"
        yLabel="ΔP (psi)"
        series={[{ dataKey: "deltaPPsi", label: "ΔP (psi)", color: "var(--color-accent)" }]}
      />
    </div>
  );
}
