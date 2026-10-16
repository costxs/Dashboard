import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LucideIcon } from "lucide-react";

export interface LineSeriesConfig {
  dataKey: string;
  label: string;
  color: string;
}

interface LineChartCardProps<T extends object> {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  data: T[];
  xKey: keyof T & string;
  series: LineSeriesConfig[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  enableZoom?: boolean;
  /** eixo X numérico contínuo (curvas de ensaio). Padrão: true */
  numericX?: boolean;
  semCartao?: boolean;
}

const fmtEixo = (v: number) =>
  typeof v !== "number" ? String(v)
    : v !== 0 && (Math.abs(v) < 1e-2 || Math.abs(v) >= 1e5) ? v.toExponential(1) : v.toLocaleString("pt-BR");

export function LineChartCard<T extends object>({
  title,
  subtitle,
  icon: Icon,
  data,
  xKey,
  series,
  xLabel,
  yLabel,
  height = 300,
  enableZoom = true,
  numericX = true,
  semCartao = false,
}: LineChartCardProps<T>) {
  // acima de ~5 mil pontos o SVG fica lento: reduz só para exibir (o banco guarda tudo)
  const passo = Math.max(1, Math.ceil(data.length / 5000));
  const dados = passo === 1 ? data : data.filter((_, i) => i % passo === 0);

  const grafico = (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={dados} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--grafico-grade)" vertical={false} />
        <XAxis
          dataKey={xKey as string}
          type={numericX ? "number" : "category"}
          domain={numericX ? ["dataMin", "dataMax"] : undefined}
          tickFormatter={numericX ? fmtEixo : undefined}
          tick={{ fontSize: 11, fill: "var(--grafico-texto)", fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-neutral-300)" }}
        />
        <YAxis
          tickFormatter={fmtEixo}
          width={64}
          tick={{ fontSize: 11, fill: "var(--grafico-texto)", fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: "var(--color-neutral-300)" }}
          label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--grafico-texto)", fontWeight: 600, style: { textAnchor: "middle" } } : undefined}
        />
        <Tooltip
          formatter={(v) => fmtEixo(Number(v))}
          labelFormatter={(x) => `${xLabel ?? String(xKey)}: ${fmtEixo(Number(x))}`}
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid var(--color-neutral-300)",
            fontSize: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            backgroundColor: "#fff",
          }}
          labelStyle={{ fontWeight: 800, color: "var(--color-neutral-900)", marginBottom: "4px" }}
          cursor={{ stroke: "var(--color-neutral-400)", strokeDasharray: "3 3" }}
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="linear"
            dataKey={s.dataKey}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
          />
        ))}
        {enableZoom && dados.length > 6 && (
          <Brush
            dataKey={xKey as string}
            height={22}
            stroke="var(--color-blue)"
            fill="var(--color-blue-50)"
            travellerWidth={8}
            tickFormatter={numericX ? fmtEixo : undefined}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );

  const comRotulo = (
    <>
      {grafico}
      {xLabel && <p className="m-0 mt-1 text-center text-[11px] font-semibold text-[var(--grafico-texto)]">{xLabel}</p>}
    </>
  );

  if (semCartao) return comRotulo;

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <div className="flex items-center gap-3">
          {Icon && <Icon size={18} className="text-[var(--color-blue)]" />}
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}{passo > 1 && ` · exibindo 1 a cada ${passo} pontos`}</p>}
          </div>
        </div>
      </div>
      <div className="px-6 py-6">{comRotulo}</div>
    </div>
  );
}
