"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SpendingSlice } from "@/lib/finance/metrics";
import { CHART_COLORS, inrCompact } from "@/lib/format";

export function SpendingChart({ data }: { data: SpendingSlice[] }) {
  const top = data.slice(0, 6);
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="category"
            width={120}
            tick={{ fontSize: 10, fill: "#0E1B14aa" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "#0B7A4B0d" }}
            formatter={(v) => [inrCompact(Number(v)) + "/mo", "Spend"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #E6F4EE", fontSize: 12 }}
          />
          <Bar dataKey="total" radius={[0, 6, 6, 0]}>
            {top.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
