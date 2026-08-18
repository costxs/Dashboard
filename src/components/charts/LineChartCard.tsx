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
}

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
}: LineChartCardProps<T>) {
  return (
    <div className="bg-white border border-[var(--color-neutral-300)] rounded-[14px]">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-neutral-300)]">
        {Icon && <Icon size={18} className="text-[var(--color-neutral-500)]" />}
        <div>
          <h2 className="m-0 text-[17px] font-bold text-[var(--color-neutral-900)]">{title}</h2>
          {subtitle && <p className="m-0 mt-1 text-[13px] text-[var(--color-neutral-600)]">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-7">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-neutral-300)" />
            <XAxis
              dataKey={xKey as string}
              tick={{ fontSize: 11, fill: "var(--color-neutral-600)", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-neutral-300)" }}
              label={
                xLabel
                  ? { value: xLabel, position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--color-neutral-500)", fontWeight: 600 }
                  : undefined
              }
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-neutral-600)", fontWeight: 500 }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-neutral-300)" }}
              label={
                yLabel
                  ? { value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--color-neutral-500)", fontWeight: 600 }
                  : undefined
              }
            />
            <Tooltip
              contentStyle={{
                borderRadius: "10px",
                border: "1px solid var(--color-neutral-300)",
                fontSize: "12px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
                backgroundColor: "#fff",
              }}
              labelStyle={{ fontWeight: 800, color: "var(--color-neutral-900)", marginBottom: "4px" }}
            />
            {series.map((s) => (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            ))}
            {enableZoom && data.length > 6 && (
              <Brush
                dataKey={xKey as string}
                height={22}
                stroke="var(--color-accent)"
                fill="var(--color-neutral-100)"
                travellerWidth={8}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
