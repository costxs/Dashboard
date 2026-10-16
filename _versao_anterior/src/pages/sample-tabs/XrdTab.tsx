import { Atom } from "lucide-react";
import type { XrdData } from "../../types";
import { EmptyState } from "../../components/EmptyState";
import { LineChartCard } from "../../components/charts/LineChartCard";

interface XrdTabProps {
  data?: XrdData;
}

export function XrdTab({ data }: XrdTabProps) {
  if (!data) return <EmptyState message="Difratograma de raios X ainda não disponível para esta amostra." />;

  return (
    <div className="flex flex-col gap-6">
      {/* Gráfico na parte superior */}
      <div className="w-full">
        <LineChartCard
          title="Difratograma de Raios X (Figure 41)"
          subtitle={`Intensidade vs. Ângulo 2θ • Equipamento: ${data.equipment}`}
          icon={Atom}
          data={data.diffractogram}
          xKey="twoTheta"
          xLabel="2θ (graus)"
          yLabel="Intensidade (u.a.)"
          series={[{ dataKey: "intensity", label: "Intensidade", color: "var(--color-accent)" }]}
          enableZoom
        />
      </div>

      {/* Tabela 13 na parte inferior */}
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <Atom size={18} className="text-[var(--color-neutral-500)]" />
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Comparação XRF e Rietveld (Table 13)</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Composição química e mineralógica</p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="table text-[14px]">
            <thead>
              <tr>
                <th className="pl-4 py-3">Composto / Mineral</th>
                <th className="px-4 py-3 text-right">XRF (%)</th>
                <th className="px-4 py-3 text-right">Rietveld (%)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="lcp-row bg-[var(--color-accent-100)]">
                <td className="pl-4 py-4 font-bold text-[var(--color-accent-800)]">CaO / Calcita</td>
                <td className="px-4 py-4 font-bold text-[var(--color-accent-800)] text-right">54.3</td>
                <td className="px-4 py-4 font-bold text-[var(--color-accent-800)] text-right">96.2</td>
              </tr>
              <tr className="lcp-row bg-[var(--color-accent-100)] border-t border-[var(--color-neutral-200)]">
                <td className="pl-4 py-4 font-bold text-[var(--color-accent-800)]">MgO / Dolomita</td>
                <td className="px-4 py-4 font-bold text-[var(--color-accent-800)] text-right">1.2</td>
                <td className="px-4 py-4 font-bold text-[var(--color-accent-800)] text-right">2.1</td>
              </tr>
              <tr className="lcp-row">
                <td className="pl-4 py-4 font-semibold border-0">SiO2 / Quartzo</td>
                <td className="px-4 py-4 text-right border-0">0.5</td>
                <td className="px-4 py-4 text-right border-0">1.0</td>
              </tr>
              <tr className="lcp-row">
                <td className="pl-4 py-4 font-semibold border-t border-[var(--color-neutral-200)]">Al2O3 / Argilominerais</td>
                <td className="px-4 py-4 text-right border-t border-[var(--color-neutral-200)]">0.2</td>
                <td className="px-4 py-4 text-right border-t border-[var(--color-neutral-200)]">0.7</td>
              </tr>
              <tr className="lcp-row">
                <td className="pl-4 py-4 font-semibold border-t border-[var(--color-neutral-200)]">Fe2O3 / Pirita</td>
                <td className="px-4 py-4 text-right border-t border-[var(--color-neutral-200)]">0.1</td>
                <td className="px-4 py-4 text-right border-t border-[var(--color-neutral-200)]">&lt; 0.1</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
