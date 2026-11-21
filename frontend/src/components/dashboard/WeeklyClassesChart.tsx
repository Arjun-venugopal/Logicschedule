"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useTheme } from "@/context/ThemeContext";

interface WeeklyClassesChartProps {
  weekData: { day: string; classes: number }[];
}

export default function WeeklyClassesChart({ weekData }: WeeklyClassesChartProps) {
  const { isDark } = useTheme();

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={weekData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={isDark ? 0.25 : 0.2} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#262626" : "#E5E7EB"} vertical={false} />
        <XAxis dataKey="day" stroke={isDark ? "#525252" : "#9CA3AF"} fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke={isDark ? "#525252" : "#9CA3AF"} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: isDark ? "#171717" : "#FFFFFF",
            border: isDark ? "1px solid #262626" : "1px solid #E5E7EB",
            borderRadius: "10px",
            fontSize: "12px",
            boxShadow: isDark ? "0 10px 15px -3px rgba(0,0,0,0.5)" : "0 10px 15px -3px rgba(0,0,0,0.08)",
          }}
          itemStyle={{ color: "#f59e0b" }}
          labelStyle={{ color: isDark ? "#a3a3a3" : "#6B7280" }}
        />
        <Area type="monotone" dataKey="classes" stroke="#f59e0b" strokeWidth={2.5} fill="url(#amberGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
