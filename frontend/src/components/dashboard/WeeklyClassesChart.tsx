"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface WeeklyClassesChartProps {
  weekData: { day: string; classes: number }[];
}

export default function WeeklyClassesChart({ weekData }: WeeklyClassesChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={weekData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis dataKey="day" stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#171717", border: "1px solid #262626", borderRadius: "10px", fontSize: "12px" }}
          itemStyle={{ color: "#f59e0b" }}
          labelStyle={{ color: "#a3a3a3" }}
        />
        <Area type="monotone" dataKey="classes" stroke="#f59e0b" strokeWidth={2.5} fill="url(#amberGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
