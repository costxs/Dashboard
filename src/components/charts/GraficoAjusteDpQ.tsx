import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "../../utils/formatacao";

export interface PontoDpQ {
  ordem: number;
  q: number;         // cm³/min
  dp: number;        // psi
  usada: boolean;    // entrou no ajuste?
}

const TEXTO = "var(--grafico-texto)";

// ΔP médio de cada etapa contra a vazão, com a reta do ajuste (lei de Darcy): ΔP = a·Q + b com intercepto
// (como o FitLinear do Origin do laboratório) ou ΔP = a·Q pela origem (intercepto 0).
// Etapas que não entraram no ajuste aparecem vazadas.
export function GraficoAjusteDpQ(p: { pontos: PontoDpQ[]; inclinacao: number | null; intercepto?: number; altura?: number }) {
  const qMax = Math.max(...p.pontos.map((d) => d.q), 0) * 1.1;
  const b = p.intercepto ?? 0;
  const usadas = p.pontos.filter((d) => d.usada);
  // com intercepto a reta começa na metade da menor vazão usada, não no zero
  const q0 = b !== 0 && usadas.length ? Math.min(...usadas.map((d) => d.q)) * 0.5 : 0;
  const reta = p.inclinacao != null ? [{ q: q0, dp: p.inclinacao * q0 + b }, { q: qMax, dp: p.inclinacao * qMax + b }] : [];
  const fora = p.pontos.filter((d) => !d.usada);
  const eixo = { fontSize: 11, fill: TEXTO };

  return (
    <ResponsiveContainer width="100%" height={p.altura ?? 300}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
        <CartesianGrid stroke="var(--grafico-grade)" />
        <XAxis dataKey="q" type="number" domain={[0, qMax]} tickFormatter={(v: number) => fmt(v, 2)}
          tick={eixo} stroke="var(--color-neutral-300)"
          label={{ value: "Q (cm³/min)", position: "insideBottom", offset: -14, fontSize: 11, fill: TEXTO, fontWeight: 600 }} />
        <YAxis dataKey="dp" type="number" domain={[0, "auto"]} tickFormatter={(v: number) => fmt(v, 2)} width={60}
          tick={eixo} stroke="var(--color-neutral-300)"
          label={{ value: "ΔP (psi)", angle: -90, position: "insideLeft", fontSize: 11, fill: TEXTO, fontWeight: 600, style: { textAnchor: "middle" } }} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
          const d = payload?.[0]?.payload as Partial<PontoDpQ> | undefined;
          if (!active || d?.ordem == null) return null;
          return (
            <div className="rounded-[10px] border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-lg">
              <div className="font-bold text-[var(--color-blue)]">Etapa {d.ordem}{d.usada ? "" : " (não usada)"}</div>
              <div>Q: <strong>{fmt(d.q, 3)}</strong> cm³/min</div>
              <div>ΔP médio: <strong>{fmt(d.dp, 3)}</strong> psi</div>
            </div>
          );
        }} />
        {reta.length > 0 && (
          <Scatter data={reta} line={{ stroke: "var(--grafico-linha)", strokeWidth: 2 }} shape={() => <g />}
            legendType="none" isAnimationActive={false} />
        )}
        <Scatter data={fora} fill="var(--grafico-fundo)" stroke="var(--grafico-serie-1)" strokeWidth={1.5} isAnimationActive={false} />
        <Scatter data={usadas} fill="var(--grafico-serie-1)" stroke="#fff" strokeWidth={1} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
