import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { escalaLog, formatarLog } from "./escalaLog";

export interface PontoDispersao {
  x: number;
  y: number;
  rotulo: string;      // ex.: código da amostra
  detalhe?: string;    // ex.: litotipo
  id?: string;         // para o clique (ex.: id da amostra)
}

const fmtLinear = (v: number) => v.toLocaleString("pt-BR", { maximumSignificantDigits: 4 });

// Dispersão de uma série (ex.: PVbt × vazão, porosidade × permeabilidade).
// Eixos podem ser log; nesse caso as marcas ficam em 1-2-5 × 10ⁿ.
export function GraficoDispersao(p: {
  pontos: PontoDispersao[]; xLabel: string; yLabel: string; logX?: boolean; logY?: boolean; altura?: number; cor?: string;
  aoClicar?: (ponto: PontoDispersao) => void;
}) {
  const pts = p.pontos.filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y) && (!p.logX || d.x > 0) && (!p.logY || d.y > 0));
  const ex = escalaLog(pts.map((d) => d.x));
  const ey = escalaLog(pts.map((d) => d.y));
  const texto = "var(--grafico-texto)";

  return (
    <ResponsiveContainer width="100%" height={p.altura ?? 320}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 12 }}>
        <CartesianGrid stroke="var(--grafico-grade)" />
        <XAxis dataKey="x" type="number" scale={p.logX ? "log" : "linear"}
          domain={p.logX ? ex.dominio : ["auto", "auto"]} ticks={p.logX ? ex.marcas : undefined}
          tickFormatter={p.logX ? formatarLog : fmtLinear}
          tick={{ fontSize: 11, fill: texto }} stroke="var(--color-neutral-300)"
          label={{ value: p.xLabel, position: "insideBottom", offset: -14, fontSize: 11, fill: texto, fontWeight: 600 }} />
        <YAxis dataKey="y" type="number" scale={p.logY ? "log" : "linear"}
          domain={p.logY ? ey.dominio : ["auto", "auto"]} ticks={p.logY ? ey.marcas : undefined}
          tickFormatter={p.logY ? formatarLog : fmtLinear} width={60}
          tick={{ fontSize: 11, fill: texto }} stroke="var(--color-neutral-300)"
          label={{ value: p.yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: texto, fontWeight: 600, style: { textAnchor: "middle" } }} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as PontoDispersao;
          return (
            <div className="rounded-[10px] border border-[var(--color-neutral-300)] bg-white px-3 py-2 text-[12px] shadow-lg">
              <div className="font-bold text-[var(--color-red)]">{d.rotulo}</div>
              {d.detalhe && <div className="text-[var(--color-neutral-600)]">{d.detalhe}</div>}
              <div>{p.xLabel}: <strong>{fmtLinear(d.x)}</strong></div>
              <div>{p.yLabel}: <strong>{fmtLinear(d.y)}</strong></div>
              {p.aoClicar && <div className="mt-1 text-[var(--color-neutral-500)]">clique para abrir</div>}
            </div>
          );
        }} />
        <Scatter data={pts} fill={p.cor ?? "var(--grafico-serie-1)"} stroke="#fff" strokeWidth={1} isAnimationActive={false}
          className={p.aoClicar ? "cursor-pointer" : undefined}
          onClick={p.aoClicar ? (m: { payload?: PontoDispersao }) => { if (m.payload) p.aoClicar!(m.payload); } : undefined} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
