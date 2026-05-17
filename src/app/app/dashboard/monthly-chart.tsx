"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

export function MonthlyChart({ data }: { data: { month: string; value: number }[] }) {
  if (data.length === 0)
    return <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <Tooltip
            cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => `${Number(v).toFixed(2)}R`}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? "hsl(var(--grade-a))" : "hsl(var(--grade-d))"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
