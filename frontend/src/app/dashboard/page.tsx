"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Users,
  BookOpen,
  Clock,
  AlertCircle,
  TrendingUp,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Sparkles,
  Code2,
  Bot,
  Brain,
  Terminal,
  Smartphone,
  Layers,
} from "lucide-react";
import dynamic from "next/dynamic";

const ActiveBatchesAnalyticsModal = dynamic(
  () => import("@/components/batches/ActiveBatchesAnalyticsModal").then((mod) => mod.ActiveBatchesAnalyticsModal || mod.default),
  { ssr: false, loading: () => null }
);

const WeeklyClassesChart = dynamic(
  () => import("@/components/dashboard/WeeklyClassesChart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);
export default function DashboardPage() {
  const { user } = useAuthStore();
  const { setSearchQuery } = useSearchStore();
  const router = useRouter();

  useEffect(() => {
    if (user?.role === "Sales Person") {
      router.replace("/dashboard/demo-sessions");
    }
  }, [user, router]);

  const isAdmin = user?.role === "Admin" || user?.role === "Super Admin";
  const [showAllLiveTeachers, setShowAllLiveTeachers] = useState(false);
  const [showActiveAnalyticsModal, setShowActiveAnalyticsModal] = useState(false);

  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/stats")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: false, // Manual refresh via Refresh button to preserve quota
  });

  const handleCourseFilterClick = (searchFilter: string) => {
    setSearchQuery(searchFilter);
    router.push("/dashboard/students");
  };

  const courseCards = useMemo(() => {
    const cd = stats?.courseDistribution;
    if (!cd) return [];

    const total = cd.totalStudents || 1;

    return [
      {
        key: "earlyLogic",
        title: "EarlyLogic",
        badge: "Age 4 - 7",
        count: cd.earlyLogic?.count ?? 0,
        activeCount: cd.earlyLogic?.activeCount ?? 0,
        pct: Math.round(((cd.earlyLogic?.count ?? 0) / total) * 100),
        icon: Sparkles,
        searchFilter: "Early",
        borderColor: "border-purple-500/30 hover:border-purple-500/60",
        bgGradient: "bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent",
        iconStyle: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
        barColor: "bg-purple-500",
        badgeStyle: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
        desc: "Logic Foundations & Scratch Jr",
      },
      {
        key: "scratch",
        title: "Scratch",
        badge: "Age 8 - 15",
        count: cd.scratch?.count ?? 0,
        activeCount: cd.scratch?.activeCount ?? 0,
        pct: Math.round(((cd.scratch?.count ?? 0) / total) * 100),
        icon: Code2,
        searchFilter: "Scratch",
        borderColor: "border-amber-500/30 hover:border-amber-500/60",
        bgGradient: "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent",
        iconStyle: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        barColor: "bg-amber-500",
        badgeStyle: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
        desc: "Visual Blocks & Game Design",
      },
      {
        key: "robotics",
        title: "Robotics",
        badge: "Hardware",
        count: cd.robotics?.count ?? 0,
        activeCount: cd.robotics?.activeCount ?? 0,
        pct: Math.round(((cd.robotics?.count ?? 0) / total) * 100),
        icon: Bot,
        searchFilter: "Robotics",
        borderColor: "border-blue-500/30 hover:border-blue-500/60",
        bgGradient: "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent",
        iconStyle: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
        barColor: "bg-blue-500",
        badgeStyle: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
        desc: "Circuits, IoT & Sensors",
      },
      {
        key: "aiCoding",
        title: "AI Coding",
        badge: "AI & ML",
        count: cd.aiCoding?.count ?? 0,
        activeCount: cd.aiCoding?.activeCount ?? 0,
        pct: Math.round(((cd.aiCoding?.count ?? 0) / total) * 100),
        icon: Brain,
        searchFilter: "AI",
        borderColor: "border-pink-500/30 hover:border-pink-500/60",
        bgGradient: "bg-gradient-to-br from-pink-500/10 via-pink-500/5 to-transparent",
        iconStyle: "bg-pink-500/15 text-pink-400 border border-pink-500/30",
        barColor: "bg-pink-500",
        badgeStyle: "bg-pink-500/15 text-pink-300 border border-pink-500/30",
        desc: "Machine Learning & Neural Logic",
      },
      {
        key: "python",
        title: "Python",
        badge: "Core Coding",
        count: cd.python?.count ?? 0,
        activeCount: cd.python?.activeCount ?? 0,
        pct: Math.round(((cd.python?.count ?? 0) / total) * 100),
        icon: Terminal,
        searchFilter: "Python",
        borderColor: "border-emerald-500/30 hover:border-emerald-500/60",
        bgGradient: "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent",
        iconStyle: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        barColor: "bg-emerald-500",
        badgeStyle: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
        desc: "Syntax, Algorithms & Scripting",
      },
      {
        key: "appDevelopment",
        title: "App Development",
        badge: "Apps & UI",
        count: cd.appDevelopment?.count ?? 0,
        activeCount: cd.appDevelopment?.activeCount ?? 0,
        pct: Math.round(((cd.appDevelopment?.count ?? 0) / total) * 100),
        icon: Smartphone,
        searchFilter: "App",
        borderColor: "border-cyan-500/30 hover:border-cyan-500/60",
        bgGradient: "bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent",
        iconStyle: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
        barColor: "bg-cyan-500",
        badgeStyle: "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20",
        desc: "Mobile UI & Full-Stack Apps",
      },
    ];
  }, [stats?.courseDistribution]);

  const statCards = useMemo(() => [
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
  ], [isAdmin, stats]);

  const weekData = useMemo(() => stats?.weekData ?? [
    { day: "Mon", classes: 0 },
    { day: "Tue", classes: 0 },
    { day: "Wed", classes: 0 },
    { day: "Thu", classes: 0 },
    { day: "Fri", classes: 0 },
    { day: "Sat", classes: 0 },
    { day: "Sun", classes: 0 },
  ], [stats?.weekData]);

  const liveTeachers = useMemo(() => stats?.liveTeachers ?? [], [stats?.liveTeachers]);

  const dotColor = (dot: string) => {
    if (dot === "bg-amber-500") return "bg-amber-500";
    if (dot === "bg-emerald-500") return "bg-emerald-500";
    if (dot === "bg-red-500") return "bg-red-500";
    return "bg-neutral-600";
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Live
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-full text-neutral-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat, i) => {
          const isActiveBatchesCard = stat.label === "Active Batches";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => {
                if (isActiveBatchesCard) setShowActiveAnalyticsModal(true);
              }}
              className={`p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-neutral-900 border ${stat.border} relative overflow-hidden ${
                isActiveBatchesCard ? "cursor-pointer hover:border-orange-500/50 hover:bg-neutral-800/80 transition-all group shadow-lg shadow-orange-950/10" : ""
              }`}
            >
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className={`p-2 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-neutral-700 border-t-amber-500 rounded-full animate-spin" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-neutral-700" />
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white mb-0.5 truncate">
                {isLoading ? <span className="text-neutral-600 text-lg">—</span> : stat.value}
              </div>
              <div className="text-xs text-neutral-500 font-medium flex items-center justify-between">
                <span className="truncate">{stat.label}</span>
                {isActiveBatchesCard && (
                  <span className="text-[10px] text-orange-400 font-semibold group-hover:underline shrink-0 ml-1">
                    View Analytics →
                  </span>
                )}
              </div>
              {stat.sub && <div className="text-[10px] text-neutral-600 mt-0.5 truncate">{stat.sub}</div>}
            </motion.div>
          );
        })}
      </div>

      {/* Course & Age Group Student Breakdown (Admin) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Student Enrollment by Course &amp; Age Group
                  </h2>
                  {stats?.courseDistribution && (
                    <>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {stats.courseDistribution.totalStudents} Enrolled
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {stats.courseDistribution.totalActiveStudents} Active
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Click any learning track to view and filter enrolled students
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              {stats?.courseDistribution?.other?.count > 0 && (
                <button
                  type="button"
                  onClick={() => handleCourseFilterClick("")}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                  title="Students without an assigned course or batch"
                >
                  {stats.courseDistribution.other.count} Unassigned
                </button>
              )}
              <Link
                href="/dashboard/students"
                className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 hover:underline"
              >
                <span>View All Students</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 animate-pulse h-32"
                />
              ))
            ) : (
              courseCards.map((card) => {
                const IconComponent = card.icon;
                return (
                  <div
                    key={card.key}
                    onClick={() => handleCourseFilterClick(card.searchFilter)}
                    className={`p-3.5 rounded-xl border ${card.borderColor} ${card.bgGradient} transition-all cursor-pointer group flex flex-col justify-between gap-3 relative overflow-hidden`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconStyle}`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${card.badgeStyle}`}>
                          {card.badge}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">
                        {card.title}
                      </h3>
                      <p className="text-[10px] text-neutral-400 line-clamp-1 mt-0.5">
                        {card.desc}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-neutral-800/60">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl sm:text-2xl font-extrabold text-white">
                          {card.count}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-400">
                          {card.activeCount} active
                        </span>
                      </div>
                      <div className="w-full bg-neutral-800 h-1 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${card.barColor} transition-all duration-500`}
                          style={{ width: `${Math.max(4, card.pct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-500 font-medium">
                        <span>{card.pct}% of students</span>
                        <span className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          View →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}

      {/* Charts + Live Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
        {/* Weekly Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={`${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'} bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 min-w-0`}
        >
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h3 className="font-semibold text-white text-sm sm:text-base">Weekly Classes</h3>
              <p className="text-xs text-neutral-500">Total classes scheduled this week</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <Calendar className="w-3.5 h-3.5" />
              This Week
            </div>
          </div>
          <div className="h-48 sm:h-56 w-full min-w-0">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <WeeklyClassesChart weekData={weekData} />
            )}
          </div>
        </motion.div>

        {/* Live Teacher Status */}
        {isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col min-w-0"
          >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-white">Live Status & Timings</h3>
              <p className="text-[10px] text-neutral-500">Real-time availability</p>
            </div>
            <Link
              href="/dashboard/teachers"
              className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium hover:bg-amber-500/20 transition-colors flex items-center gap-1"
            >
              Timing Table →
            </Link>
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
              <>
                {(showAllLiveTeachers ? liveTeachers : liveTeachers.slice(0, 4)).map((t: any, i: number) => (
                  <div
                    key={t._id || i}
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{t.name}</p>
                        <p className="text-[10px] text-neutral-500 truncate">{t.subject}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor(t.dot)} ${t.dot === "bg-amber-500" ? "animate-pulse" : ""}`} />
                        <span className={`text-[10px] font-medium whitespace-nowrap ${
                          t.status === "In Class"  ? "text-amber-400 font-semibold"   :
                          t.status === "Class Starting Soon" ? "text-amber-300 font-semibold" :
                          t.status === "Available" ? "text-emerald-400" :
                          "text-neutral-400"
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      {t.status === "In Class" && t.minutesLeft !== null && t.minutesLeft !== undefined ? (
                        <span className="text-[9px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-semibold">
                          ⏳ {t.minutesLeft}m left
                        </span>
                      ) : t.startsInMinutes !== null && t.startsInMinutes !== undefined && t.startsInMinutes <= 60 ? (
                        <span className="text-[9px] text-amber-300 font-mono bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 font-bold animate-pulse">
                          ⏱️ Starts in {t.startsInMinutes}m
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}

                {liveTeachers.length > 4 && (
                  <button
                    onClick={() => setShowAllLiveTeachers(!showAllLiveTeachers)}
                    className="w-full mt-3 py-2 text-center text-xs text-amber-400 font-medium bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    {showAllLiveTeachers ? (
                      <>
                        View Less <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        View More ({liveTeachers.length - 4} more) <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
        )}
      </div>

      {showActiveAnalyticsModal && (
        <ActiveBatchesAnalyticsModal onClose={() => setShowActiveAnalyticsModal(false)} />
      )}
    </div>
  );
}
