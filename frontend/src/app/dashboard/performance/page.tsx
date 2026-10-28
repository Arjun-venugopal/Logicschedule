"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Users, BookOpen, Clock, CalendarCheck, TrendingUp, Award, AlertTriangle, Sparkles, Calendar } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";

export default function TeacherPerformancePage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "Teacher") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const { data: performance, isLoading, error } = useQuery({
    queryKey: ["my-performance"],
    queryFn: async () => (await api.get("/teachers/self/performance")).data,
    enabled: !!user && user.role === "Teacher",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (user && user.role !== "Teacher") {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-neutral-500">Loading your performance metrics...</p>
      </div>
    );
  }

  if (error || !performance) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <AlertTriangle className="w-12 h-12 mb-4 text-red-500" />
        <h2 className="text-xl font-bold text-white mb-2">Error Loading Performance</h2>
        <p>Failed to load performance metrics. Please try again later.</p>
      </div>
    );
  }

  const { teacher, stats, extraClassRecords = [] } = performance;

  const pieChartData = [
    { name: "Completed", value: stats.completedClasses },
    { name: "Remaining/Cancelled", value: Math.max(0, stats.totalSchedules - stats.completedClasses) },
  ];
  const PIE_COLORS = ["#f59e0b", "#262626"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">My Performance</h1>
        <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">Track your classes, student attendance, and class remarks</p>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">My Batches</span>
            <BookOpen className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.totalBatches}</p>
            <p className="text-[10px] text-neutral-500 mt-1">Assigned active batches</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Teaching Hours</span>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.totalHoursTaught} hrs</p>
            <p className="text-[10px] text-neutral-500 mt-1">Across all completed classes</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Avg Attendance</span>
            <Users className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.avgAttendanceRate}%</p>
            <p className="text-[10px] text-neutral-500 mt-1">Student attendance rate</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Demo Conversion</span>
            <TrendingUp className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.demoConversionRate}%</p>
            <p className="text-[10px] text-neutral-500 mt-1">{stats.completedDemos} of {stats.totalDemos} demos completed</p>
          </div>
        </div>
      </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Extra Classes</span>
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-bold text-white">{stats.extraClassesCount || 0}</p>
            <p className="text-[10px] text-purple-300/80 mt-1">{stats.extraHoursTaught || 0} hrs makeup & doubts</p>
          </div>
        </div>

      {/* Middle Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Completion Gauge Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
          <h3 className="font-semibold text-white mb-2 text-sm flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-amber-500" /> Class Completion Rate
          </h3>
          <div className="h-[200px] w-full min-w-0 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {pieChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold text-white">{stats.completionRate}%</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">Classes Completed</p>
            </div>
          </div>
          <div className="flex justify-between text-xs text-neutral-400 border-t border-neutral-800 pt-4">
            <span>Completed: {stats.completedClasses}</span>
            <span>Total Scheduled: {stats.totalSchedules}</span>
          </div>
        </div>

        {/* Teaching Details Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" /> My Profile & Expertise
            </h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-neutral-500 block mb-1.5">Registered Subjects</span>
                <div className="flex flex-wrap gap-2">
                  {teacher.subjectExpertise?.length > 0 ? (
                    teacher.subjectExpertise.map((sub: string, i: number) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-neutral-800 text-neutral-300 text-xs rounded-lg border border-neutral-700 font-medium"
                      >
                        {sub}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-500 italic">No subject expertise added yet. Contact Admin.</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-neutral-500 block mb-1">Teaching Experience</span>
                <p className="text-sm font-semibold text-white">
                  {teacher.experience ? `${teacher.experience} Years of teaching experience` : "New Profile"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-amber-500/5 rounded-xl border border-amber-500/10 text-xs text-amber-400/80 leading-relaxed">
            <span className="font-semibold text-amber-400">Keep it up! </span>
            Your dedication shows in your {stats.completionRate}% class completion rate. Regularly completing classes and updating student attendance helps maintain an accurate dashboard.
          </div>
        </div>
      </div>


      {/* Extra Classes Conducted & Scheduled Dates Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/30">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">Extra Classes & Performance Dates</h3>
              <p className="text-neutral-400 text-xs mt-0.5">Makeup sessions, doubt-clearing, and upcoming scheduled dates</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
              Total Extra Classes: {stats.extraClassesCount || 0}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
              Extra Hours: {stats.extraHoursTaught || 0} hrs
            </span>
          </div>
        </div>

        {extraClassRecords.length === 0 ? (
          <div className="text-center py-8 text-neutral-500 text-xs flex flex-col items-center gap-2">
            <Sparkles className="w-6 h-6 text-neutral-600 opacity-60" />
            <p>No extra classes recorded yet. Extra classes updated in Completed Classes or Schedule will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400">
                  <th className="py-2.5 px-3 font-semibold">Date & Class Time</th>
                  <th className="py-2.5 px-3 font-semibold">Batch / Student</th>
                  <th className="py-2.5 px-3 font-semibold">Next Extra Class Date & Time</th>
                  <th className="py-2.5 px-3 font-semibold">Subject / Remarks</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {extraClassRecords.map((item: any) => {
                  const formattedDate = item.date ? format(parseISO(item.date), "MMM d, yyyy") : "—";
                  const nextDateStr = item.nextExtraClassDate ? format(parseISO(item.nextExtraClassDate), "MMM d, yyyy") : "—";
                  return (
                    <tr key={item._id} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="py-3 px-3 text-white font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-400" />
                          <span>{formattedDate}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 ml-5 block">{item.startTime} – {item.endTime}</span>
                      </td>
                      <td className="py-3 px-3 text-neutral-200 font-medium">
                        {item.batchName}
                      </td>
                      <td className="py-3 px-3 text-neutral-300 whitespace-nowrap">
                        {item.nextExtraClassDate ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-purple-300 font-medium">
                              <Calendar className="w-3 h-3 text-purple-400" />
                              {nextDateStr}
                            </span>
                            <span className="text-[10px] text-neutral-400 block ml-4">
                              {item.nextExtraClassStartTime || item.startTime} – {item.nextExtraClassEndTime || item.endTime}
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-500 italic">None scheduled</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-neutral-300 max-w-xs truncate">
                        <span className="text-white block font-medium truncate">{item.subject}</span>
                        {item.extraClassReason && (
                          <span className="text-[10px] text-neutral-400 block truncate">Focus: {item.extraClassReason}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.status === "Completed"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
