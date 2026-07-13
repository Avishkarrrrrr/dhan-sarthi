"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { FrontierPoint, PortfolioMetrics } from "@/lib/finance/mpt";

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export function FrontierChart({
  frontier,
  current,
  optimal,
}: {
  frontier: FrontierPoint[];
  current: PortfolioMetrics;
  optimal: PortfolioMetrics;
}) {
  const cloud = frontier.map((f) => ({ x: f.volatility, y: f.return }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 0, right: 10, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="#E6F4EE" />
          <XAxis
            type="number"
            dataKey="x"
            name="Volatility"
            tickFormatter={pct}
            tick={{ fontSize: 10, fill: "#0E1B14aa" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Risk →", fontSize: 10, fill: "#0E1B14aa", position: "insideBottomRight", offset: -2 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Return"
            tickFormatter={pct}
            tick={{ fontSize: 10, fill: "#0E1B14aa" }}
            width={38}
            axisLine={false}
            tickLine={false}
          />
          <ZAxis range={[30, 30]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(v) => pct(Number(v))}
            contentStyle={{ borderRadius: 12, border: "1px solid #E6F4EE", fontSize: 12 }}
          />
          <Scatter name="Possible portfolios" data={cloud} fill="#38D9A9" fillOpacity={0.35} />
          <Scatter name="Your portfolio" data={[{ x: current.volatility, y: current.return }]} fill="#B8860B" shape="circle" />
          <Scatter name="Optimal (max Sharpe)" data={[{ x: optimal.volatility, y: optimal.return }]} fill="#0B7A4B" shape="star" />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex justify-center gap-4 text-[10px] text-ink/55">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#38D9A9" }} /> Possible</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#B8860B" }} /> You now</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#0B7A4B" }} /> Optimal ★</span>
      </div>
    </div>
  );
}
