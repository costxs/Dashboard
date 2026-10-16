import { ScanEye } from "lucide-react";
import type { ImageStudy } from "../../types";
import { EmptyState } from "../../components/EmptyState";

interface SemTabProps {
  data?: ImageStudy;
}

export function SemTab({ data }: SemTabProps) {
  if (!data)
    return (
      <EmptyState message="Imagens de Microscopia Eletrônica de Varredura (MEV) ainda não disponíveis para esta amostra." />
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <ScanEye size={18} className="text-[var(--color-neutral-500)]" />
          <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Microscopia Eletrônica de Varredura (MEV)</h2>
        </div>
        <div className="p-7">
          <div className="field">
            <label>Ampliação</label>
            <div className="font-medium text-[14px] mt-1">{data.magnification ?? "—"}</div>
          </div>
        </div>
        <div className="border-t border-[var(--color-neutral-300)] px-7 py-5 bg-[var(--color-neutral-200)] rounded-b-[14px]">
          <p className="m-0 mb-2 text-[11px] font-semibold tracking-[0.05em] uppercase text-[var(--color-neutral-600)]">Notas de Interpretação</p>
          <p className="m-0 text-[14px] text-[var(--color-neutral-800)]">{data.notes}</p>
        </div>
      </div>

      <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
          <ScanEye size={18} className="text-[var(--color-neutral-500)]" />
          <div>
            <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">Análise Morfológica e Espectro EDS (Figure 23 & 24)</h2>
            <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">Rocha fraturada (MEV) e composição atômica (EDS)</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--color-neutral-300)]">
          {/* Lado Esquerdo: Imagem MEV */}
          <div className="p-7 flex flex-col items-center bg-[var(--color-neutral-100)] rounded-bl-[14px]">
            <div className="relative w-full max-w-md aspect-video rounded-lg overflow-hidden shadow-sm border border-[var(--color-neutral-300)]">
              <img
                src={`https://picsum.photos/seed/${data.beforeSeed}/800/600`}
                alt="MEV - Rocha Fraturada"
                className="w-full h-full object-cover"
              />
              {/* Ponto Clicável (Mock) */}
              <div
                className="absolute top-1/2 left-1/3 w-7 h-7 bg-[var(--color-accent)] rounded-full border-[3px] border-white shadow-md flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                title="Ponto de análise EDS #1"
              >
                <span className="text-white text-[11px] font-bold">1</span>
              </div>
            </div>
            <p className="mt-4 text-[12px] text-[var(--color-neutral-600)] text-center max-w-md font-medium">
              Figure 23: Superfície fraturada sob MEV. Clique no ponto #1 para ver o espectro EDS.
            </p>
          </div>

          {/* Lado Direito: Tabela EDS */}
          <div className="p-7 flex flex-col justify-center">
            <h4 className="m-0 text-[14px] font-bold text-[var(--color-neutral-900)] mb-4 flex items-center gap-2">
              <ScanEye size={16} className="text-[var(--color-accent)]" />
              Composição Atômica - Ponto #1 (EDS)
            </h4>
            <div className="overflow-x-auto border border-[var(--color-neutral-300)] rounded-lg">
              <table className="table text-[13px] m-0 border-0">
                <thead>
                  <tr>
                    <th className="pl-4 py-3">Elemento</th>
                    <th className="px-4 py-3 text-right">Massa (%)</th>
                    <th className="px-4 py-3 text-right">Átomo (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="lcp-row">
                    <td className="pl-4 py-3 font-semibold">Carbono (C)</td>
                    <td className="px-4 py-3 text-right">18.42</td>
                    <td className="px-4 py-3 text-right font-heading font-extrabold text-[var(--color-accent)]">27.58</td>
                  </tr>
                  <tr className="lcp-row">
                    <td className="pl-4 py-3 font-semibold border-t border-[var(--color-neutral-200)]">Oxigênio (O)</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">54.21</td>
                    <td className="px-4 py-3 text-right font-heading font-extrabold text-[var(--color-accent)] border-t border-[var(--color-neutral-200)]">61.08</td>
                  </tr>
                  <tr className="lcp-row">
                    <td className="pl-4 py-3 font-semibold border-t border-[var(--color-neutral-200)]">Cálcio (Ca)</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">24.50</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">10.95</td>
                  </tr>
                  <tr className="lcp-row">
                    <td className="pl-4 py-3 font-semibold border-t border-[var(--color-neutral-200)]">Magnésio (Mg)</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">1.25</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">0.31</td>
                  </tr>
                  <tr className="lcp-row">
                    <td className="pl-4 py-3 font-semibold border-t border-[var(--color-neutral-200)]">Silício (Si)</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">0.82</td>
                    <td className="px-4 py-3 text-right border-t border-[var(--color-neutral-200)]">0.05</td>
                  </tr>
                  <tr className="bg-[var(--color-neutral-200)] border-t border-[var(--color-neutral-300)]">
                    <td className="pl-4 py-3 font-bold text-[var(--color-neutral-900)]">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--color-neutral-900)]">100.00</td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--color-neutral-900)]">100.00</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
