import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { SCurvePoint } from "../../types";
import { Card, CardHeader } from "../ui/Card";

interface SCurveChartProps {
  data: SCurvePoint[];
}

/** Curva S do projeto: % planejado vs. % realizado ao longo dos meses. */
export function SCurveChart({ data }: SCurveChartProps) {
  const latest = data[data.length - 1];
  const gap = latest ? latest.planejado - latest.realizado : 0;

  return (
    <Card>
      <CardHeader
        title="Curva S — Evolução do Projeto"
        subtitle="Planejado vs. Realizado (% acumulado)"
        icon={<TrendingUp size={17} strokeWidth={2} />}
        action={
          <span
            className={
              gap > 5
                ? "rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700"
                : "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
            }
          >
            {gap > 0 ? `${gap.toFixed(0)} p.p. de desvio` : "No prazo"}
          </span>
        }
      />
      <div className="px-4 pb-4 pt-3">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              domain={[0, 100]}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              formatter={(value) => `${value}%`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="planejado"
              name="Planejado"
              stroke="#94a3b8"
              strokeDasharray="5 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="realizado"
              name="Realizado"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
