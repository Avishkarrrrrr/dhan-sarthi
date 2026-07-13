"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { AllocationSlice } from "@/lib/finance/metrics";
import { ASSET_LABELS, CHART_COLORS, inrCompact } from "@/lib/format";

export function AllocationChart({ data }: { data: AllocationSlice[] }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="assetClass" innerRadius={38} outerRadius={62} paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((a, i) => (
          <li key={a.assetClass} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-ink/70">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              {ASSET_LABELS[a.assetClass] ?? a.assetClass}
            </span>
            <span className="font-medium text-ink">
              {a.pct.toFixed(0)}% · {inrCompact(a.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
