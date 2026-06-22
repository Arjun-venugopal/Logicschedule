"use client";

import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { Users, BookOpen, Clock, AlertCircle, TrendingUp, Calendar, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin";

  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/stats")).data,
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const statCards = [
    ...(isAdmin ? [{
      label: "Total Teachers",
      value: stats?.totalTeachers ?? "—",
      icon: Users,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    }] : []),
    {
      label: "Active Batches",
      value: stats?.activeBatches ?? "—",
      sub: stats?.totalBatches != null ? `of ${stats.totalBatches} total` : "",
      icon: BookOpen,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
    {
      label: "Hours This Week",
      value: stats?.hoursScheduled ?? "—",
      sub: stats?.todayClasses != null ? `${stats.todayClasses} classes today` : "",
      icon: Clock,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
    ...(isAdmin ? [{
      label: "Conflicts",
      value: stats?.conflicts ?? "—",
      icon: AlertCircle,
      color: stats?.conflicts > 0 ? "text-red-400" : "text-emerald-400",
      bg: stats?.conflicts > 0 ? "bg-red-500/10" : "bg-emerald-500/10",
      border: stats?.conflicts > 0 ? "border-red-500/20" : "border-emerald-500/20",
    }] : []),
  ];

  const weekData = stats?.weekData ?? [
    { day: "Mon", classes: 0 },
    { day: "Tue", classes: 0 },
    { day: "Wed", classes: 0 },
    { day: "Thu", classes: 0 },
    { day: "Fri", classes: 0 },
    { day: "Sat", classes: 0 },
    { day: "Sun", classes: 0 },
  ];

  const liveTeachers = stats?.liveTeachers ?? [];

  const dotColor = (dot: string) => {
    if (dot === "bg-amber-500") return "bg-amber-500";
    if (dot === "bg-emerald-500") return "bg-emerald-500";
    if (dot === "bg-red-500") return "bg-red-500";
    return "bg-neutral-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Live
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-full text-neutral-400 hover:text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`p-5 rounded-2xl bg-neutral-900 border ${stat.border} relative overflow-hidden`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-neutral-700 border-t-amber-500 rounded-full animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4 text-neutral-700" />
              )}
            </div>
            <div className="text-3xl font-bold text-white mb-0.5">
              {isLoading ? <span className="text-neutral-600 text-lg">—</span> : stat.value}
            </div>
            <div className="text-xs text-neutral-500 font-medium">{stat.label}</div>
            {stat.sub && <div className="text-[10px] text-neutral-600 mt-0.5">{stat.sub}</div>}
          </motion.div>
        ))}
      </div>

      {/* Charts + Live Status */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Weekly Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={`${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'} bg-neutral-900 border border-neutral-800 rounded-2xl p-6`}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-white">Weekly Classes</h3>
              <p className="text-xs text-neutral-500">Total classes scheduled this week</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium">
              <Calendar className="w-4 h-4" />
              This Week
            </div>
          </div>
          <div className="h-56">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.25} />
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
            )}
          </div>
        </motion.div>

        {/* Live Teacher Status */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-white">Live Status</h3>
            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              Real-time
            </span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {isLoading ? (
              <div className="py-8 text-center">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-neutral-600">Loading teachers...</p>
              </div>
            ) : liveTeachers.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-neutral-600">No teachers found</p>
              </div>
            ) : (
              liveTeachers.map((t: any, i: number) => (
                <div
                  key={t._id || i}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white">{t.name}</p>
                      <p className="text-[10px] text-neutral-500">{t.subject}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor(t.dot)} ${t.dot === "bg-amber-500" ? "animate-pulse" : ""}`} />
                    <span className={`text-[10px] font-medium whitespace-nowrap ${
                      t.status === "In Class"  ? "text-amber-400"   :
                      t.status === "Available" ? "text-emerald-400" :
                      "text-neutral-400"
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
        )}
      </div>
    </div>
  );
}
