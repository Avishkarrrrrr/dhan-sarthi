"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import type { ProjectionRow } from "@/lib/finance/simulate";
import { inrCompact } from "@/lib/format";

export function ProjectionChart({ rows, target }: { rows: ProjectionRow[]; target?: number }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#12B886" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#12B886" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#0E1B14aa" }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => inrCompact(v)} tick={{ fontSize: 10, fill: "#0E1B14aa" }} width={48} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v) => [inrCompact(Number(v)), "Projected"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #E6F4EE", fontSize: 12 }}
          />
          {target && <ReferenceLine y={target} stroke="#0B7A4B" strokeDasharray="4 4" label={{ value: "Target", fontSize: 10, fill: "#0B7A4B", position: "insideTopRight" }} />}
          <Area type="monotone" dataKey="value" stroke="#0B7A4B" strokeWidth={2.5} fill="url(#proj)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
