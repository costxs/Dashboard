import { useSampleStore } from "../store/useSampleStore";
import { workPackages as allWorkPackages } from "../data/workPackages";

export function DashboardPage() {
  const project = useSampleStore((s) => s.activeProject);
  const allSamples = useSampleStore((s) => s.samples);

  // Deriving data similar to the prototype logic
  const projectSamples = allSamples.filter((s) => s.project === project);
  const totalSamples = projectSamples.length;
  const samplesInProgress = projectSamples.filter((s) => s.status === "Em Ensaio").length;

  const projectWorkPackages = allWorkPackages.filter((wp) => wp.project === project);
  const activeWorkPackages = projectWorkPackages.filter((wp) => wp.status !== "Concluded").length;
  const overallProgress = projectWorkPackages.length > 0
    ? Math.round(projectWorkPackages.reduce((acc, wp) => acc + wp.progressPercent, 0) / projectWorkPackages.length)
    : 0;



  const getWpStyle = (status: string) => {
    switch (status) {
      case "Concluded": return "tag tag-solid";
      case "Started": return "tag tag-accent";
      case "Not-started": return "tag tag-muted";
      default: return "tag tag-neutral";
    }
  };

  const getWpLabel = (status: string) => {
    switch (status) {
      case "Concluded": return "Concluído";
      case "Started": return "Em curso";
      case "Not-started": return "Não iniciado";
      default: return status;
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-8 px-7 pt-8 pb-6">
        <div>
          <span className="inline-block bg-[var(--color-accent)] text-white px-3 py-1.5 rounded-full font-heading font-semibold text-[11px] tracking-[0.07em] uppercase">
            {project}
          </span>
          <h1 className="mt-3 text-[27px] leading-[1.2]">Dashboard Gerencial</h1>
          <p className="mt-2.5 max-w-[62ch] text-[13px] text-[var(--color-neutral-700)]">
            Visão macro dos projetos de caracterização de rochas carbonáticas e estimulação ácida.
          </p>
        </div>
        <div className="text-right shrink-0 pb-1.5">
          <p className="m-0 text-[10px] tracking-[0.07em] uppercase text-[var(--color-neutral-500)]">Referência</p>
          <p className="mt-1 font-heading font-bold text-base">Jan 2025</p>
        </div>
      </div>

      <div className="grid grid-cols-3 border-y border-[var(--color-neutral-300)] bg-white">
        <div className="p-5 px-7 border-r border-[var(--color-neutral-300)]">
          <p className="m-0 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">
            Amostras cadastradas
          </p>
          <p className="mt-2.5 font-heading font-extrabold text-[32px] leading-[1.1] tracking-[-0.01em]">
            {totalSamples}
          </p>
          <p className="mt-2 text-[12px] text-[var(--color-neutral-700)]">
            {samplesInProgress} em ensaio
          </p>
        </div>

        <div className="p-5 px-7 border-r border-[var(--color-neutral-300)]">
          <p className="m-0 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">
            Work packages ativos
          </p>
          <p className="mt-2.5 font-heading font-extrabold text-[32px] leading-[1.1] tracking-[-0.01em]">
            {activeWorkPackages}
          </p>
          <p className="mt-2 text-[12px] text-[var(--color-neutral-700)]">
            {projectWorkPackages.length} no total
          </p>
        </div>
        <div className="p-5 px-7">
          <p className="m-0 text-[10px] font-semibold tracking-[0.07em] uppercase text-[var(--color-neutral-600)]">
            Progresso geral
          </p>
          <p className="mt-2.5 font-heading font-extrabold text-[32px] leading-[1.1] tracking-[-0.01em] text-[var(--color-accent)]">
            {overallProgress}%
          </p>
          <p className="mt-2 text-[12px] text-[var(--color-accent-700)]">
            abaixo do planejado
          </p>
        </div>
      </div>



      <div className="px-7 pt-9 pb-10">
        <div className="flex items-baseline justify-between gap-6 mb-3">
          <h2 className="m-0 text-[19px]">Work packages</h2>
          <p className="m-0 text-[12px] tracking-[0.06em] uppercase text-[var(--color-neutral-600)]">
            Table 8 · progresso em janeiro de 2025
          </p>
        </div>
        <table className="table text-[14px]">
          <thead>
            <tr>
              <th className="w-[70px]">WP</th>
              <th>Descrição</th>
              <th className="w-[130px]">Status</th>
              <th className="w-[240px] text-right">Evolução</th>
            </tr>
          </thead>
          <tbody>
            {projectWorkPackages.map((wp) => (
              <tr key={wp.id} className="lcp-row">
                <td className="font-heading font-extrabold text-[14px]">{wp.code}</td>
                <td className="text-[var(--color-neutral-800)] pr-6">{wp.description}</td>
                <td>
                  <span className={getWpStyle(wp.status)}>
                    {getWpLabel(wp.status)}
                  </span>
                </td>
                <td>
                  <div className="flex items-center justify-end gap-3">
                    <div className="w-[140px] h-[7px] rounded-full bg-[var(--color-neutral-200)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)]"
                        style={{ width: `${wp.progressPercent}%` }}
                      ></div>
                    </div>
                    <span className="w-[42px] text-right font-heading font-extrabold text-[14px] tabular-nums">
                      {wp.progressPercent}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
