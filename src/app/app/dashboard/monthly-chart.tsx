"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/lib/i18n/context";

interface EquityPoint {
  date: string; // ISO date
  cumR: number;
  trade: number; // sequential trade index (1, 2, 3, ...)
}

/**
 * Equity curve — cumulative R over time. The shaded area beneath shows
 * green when above 0, red below — gradient masks transitions for polish.
 */
export function EquityCurve({ data }: { data: EquityPoint[] }) {
  const t = useT();
  if (data.length === 0)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        {t("dashboard.equity.noData")}
      </div>
    );

  const maxAbs = Math.max(...data.map((d) => Math.abs(d.cumR)), 1);
  const yDomain: [number, number] = [-maxAbs * 1.15, maxAbs * 1.15];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--grade-a))" stopOpacity={0.45} />
              <stop offset="50%" stopColor="hsl(var(--grade-a))" stopOpacity={0.05} />
              <stop offset="50%" stopColor="hsl(var(--grade-d))" stopOpacity={0.05} />
              <stop offset="100%" stopColor="hsl(var(--grade-d))" stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={(v: string) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            minTickGap={32}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            domain={yDomain}
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--primary))", strokeDasharray: "3 3" }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(v) =>
              typeof v === "string"
                ? new Date(v).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
                : ""
            }
            formatter={(value) => {
              const n = Number(value);
              return [`${n >= 0 ? "+" : ""}${n.toFixed(2)}R`, t("dashboard.equity.tooltipLabel")];
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Area
            type="monotone"
            dataKey="cumR"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#equityGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
