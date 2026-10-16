import { useState, useMemo } from "react";
import { ExternalLink, Download } from "lucide-react";
import { useSampleStore } from "../store/useSampleStore";
import { Select } from "../components/ui/Select";

interface LiteratureItem {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  doi: string;
  wpAssociated: string;
  keywords: string[];
  summary: string;
}

const literatureByProject: Record<string, LiteratureItem[]> = {
  TotalEnergies: [
    {
      id: "lit-1",
      title: "Acid Stimulation of Carbonate Reservoirs: Matrix Acidizing vs Wormholing Dynamics",
      authors: "Nogueira, R., Prado, M., et al.",
      journal: "Journal of Petroleum Science and Engineering",
      year: "2024",
      doi: "10.1016/j.petrol.2024.112001",
      wpAssociated: "Eixo 11 - Coreflooding Pre-Salt Analog",
      keywords: ["Acidizing", "Wormhole", "Carbonate", "HCl"],
      summary: "Estudo comparativo da eficiência de dissolução ácida em calcários de alta e baixa permeabilidade sob condições de reservatório.",
    },
    {
      id: "lit-2",
      title: "Experimental Protocols for Dualcore Acid Flooding in Heterogeneous Carbonates",
      authors: "Prado, M., Nogueira, R.",
      journal: "SPE Reservoir Evaluation & Engineering",
      year: "2023",
      doi: "10.2118/212345-PA",
      wpAssociated: "Eixo 13 - Coreflooding Dualcore",
      keywords: ["Dualcore", "Coreflooding", "Heterogeneity"],
      summary: "Metodologia experimental para avaliação de desvio de ácido em rochas carbonáticas heterogêneas utilizando arranjo paralelo de plugs.",
    },
    {
      id: "lit-3",
      title: "Mass Transfer Rate Parameters in Static and Dynamic Carbonate Dissolution",
      authors: "Nogueira, R., Salgado, I.",
      journal: "Fluid Phase Equilibria",
      year: "2024",
      doi: "10.1016/j.fluid.2024.113990",
      wpAssociated: "Eixo 7 - Mass Transfer Parameters",
      keywords: ["Mass Transfer", "Kinetics", "Dissolution Rate"],
      summary: "Determinação cinética dos coeficientes de transferência de massa para HCl em superfícies de calcário e dolomita sob temperatura elevada.",
    },
  ],
  Petrobras: [
    {
      id: "lit-4",
      title: "Micro-CT 3D Visualization of Wormhole Networks in Pre-Salt Carbonate Analogs",
      authors: "Duarte, C., Salgado, I., et al.",
      journal: "Marine and Petroleum Geology",
      year: "2024",
      doi: "10.1016/j.marpetgeo.2024.106500",
      wpAssociated: "Eixo 9 - MicroCT Imaging & Analysis",
      keywords: ["MicroCT", "Pre-Salt", "3D Reconstruction"],
      summary: "Caracterização tomográfica de alta resolução da evolução de porosidade e tortuosidade de canais de dissolução pós-acidificação.",
    },
    {
      id: "lit-5",
      title: "Petrographic and Mineralogical Controls on Acid Reactivity of Brazilian Pre-Salt Rocks",
      authors: "Salgado, I., Duarte, C.",
      journal: "Sedimentary Geology",
      year: "2023",
      doi: "10.1016/j.sedgeo.2023.106210",
      wpAssociated: "Eixo 6 - Compositional & Mineral Analysis",
      keywords: ["DRX-FRX", "Petrography", "Dolomitization"],
      summary: "Análise quantitativa mineralógica por DRX e microtextura por MEV para predição de resposta ao tratamento ácido em dolomitos intercalados.",
    },
    {
      id: "lit-6",
      title: "Cleaning Protocols for Bituminous Carbonate Rock Samples prior to Petrophysical Testing",
      authors: "Duarte, C., Nogueira, R.",
      journal: "Petroleum Geoscience",
      year: "2024",
      doi: "10.1144/petgeo2024-012",
      wpAssociated: "Eixo 8 - Cleaning Rock Samples",
      keywords: ["Sample Cleaning", "Soxhlet Extraction", "Wettability"],
      summary: "Avaliação do impacto de solventes no processo de restauração da molhabilidade original de amostras carbonáticas da Bacia de Santos.",
    },
  ],
};

export function LiteraturePage() {
  const activeProject = useSampleStore((s) => s.activeProject);
  const items = literatureByProject[activeProject] || [];
  
  const [axisFilter, setAxisFilter] = useState("Todos");
  const [sortOrder, setSortOrder] = useState("Mais recentes");

  const axesList = useMemo(() => {
    const axes = new Set(items.map((item) => item.wpAssociated.split(" - ")[0]));
    return ["Todos", ...Array.from(axes)].sort();
  }, [items]);

  const displayedItems = useMemo(() => {
    let filtered = items;
    
    if (axisFilter !== "Todos") {
      filtered = filtered.filter((item) => item.wpAssociated.startsWith(axisFilter));
    }
    
    return filtered.sort((a, b) => {
      if (sortOrder === "Mais recentes") {
        return parseInt(b.year) - parseInt(a.year);
      } else {
        return parseInt(a.year) - parseInt(b.year);
      }
    });
  }, [items, axisFilter, sortOrder]);

  return (
    <div>
      <div className="flex items-end justify-between gap-8 px-7 pt-8 pb-5">
        <div>
          <span className="inline-block bg-[var(--color-accent)] text-white px-3 py-1.5 rounded-full font-heading font-semibold text-[11px] tracking-[0.07em] uppercase">
            {activeProject}
          </span>
          <h1 className="mt-3 text-[27px] leading-[1.2]">Banco da Literatura</h1>
          <p className="mt-2.5 text-[13px] text-[var(--color-neutral-700)]">
            {displayedItems.length} referências encontradas &middot; projeto {activeProject}
          </p>
        </div>
      </div>

      <div className="flex gap-5 items-end bg-white border-y border-[var(--color-neutral-300)] px-7 py-4">
        <div className="field min-w-[220px]">
          <Select
            label="Filtrar por Eixo"
            value={axisFilter}
            onChange={setAxisFilter}
            options={axesList}
          />
        </div>
        <div className="field min-w-[200px]">
          <Select
            label="Ordenação"
            value={sortOrder}
            onChange={setSortOrder}
            options={["Mais recentes", "Antigos"]}
          />
        </div>
      </div>

      <div className="px-7 pt-6 pb-10 flex flex-col gap-5">
        {displayedItems.map((item) => (
          <div key={item.id} className="bg-white border border-[var(--color-neutral-300)] rounded-[14px] p-6 hover:shadow-md hover:border-[var(--color-accent-100)] transition-all">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-heading font-extrabold text-[12px] text-[var(--color-accent)] uppercase tracking-[0.06em]">
                    {item.wpAssociated.split(" - ")[0]}
                  </span>
                  <span className="text-[var(--color-neutral-300)]">•</span>
                  <span className="text-[12px] font-bold text-[var(--color-neutral-500)]">{item.year}</span>
                  <span className="text-[var(--color-neutral-300)]">•</span>
                  <span className="text-[12px] font-medium text-[var(--color-neutral-600)]">{item.wpAssociated.split(" - ")[1]}</span>
                </div>
                <h3 className="mt-2 text-[17px] font-bold text-[var(--color-neutral-900)] leading-[1.3]">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-[13px] font-medium text-[var(--color-neutral-700)]">{item.authors}</p>
                <p className="mt-1 text-[12px] italic text-[var(--color-neutral-500)]">{item.journal}</p>
                
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="tag tag-neutral"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0 min-w-[150px]">
                <button
                  type="button"
                  className="btn bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-700)] w-full py-2.5 shadow-sm"
                  onClick={() => window.alert("Iniciando download do PDF...")}
                >
                  <Download size={15} /> Baixar PDF
                </button>
                <a
                  href={`https://doi.org/${item.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-end gap-1.5 mt-1 text-[11px] font-medium text-[var(--color-neutral-500)] hover:text-[var(--color-accent)] transition-colors"
                >
                  DOI: {item.doi} <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        ))}
        {displayedItems.length === 0 && (
          <div className="border border-dashed border-[var(--color-neutral-400)] rounded-[16px] px-8 py-11 text-center mt-4">
            <p className="m-0 font-heading font-bold text-[17px]">
              Nenhuma referência encontrada para os filtros aplicados.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
