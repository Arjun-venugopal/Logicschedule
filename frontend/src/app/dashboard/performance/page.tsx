"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, BookOpen, Clock, CalendarCheck, TrendingUp, Award, Calendar, MessageSquare, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

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

  const { teacher, stats, recentFeedback = [] } = performance;

  const pieChartData = [
    { name: "Completed", value: stats.completedClasses },
    { name: "Remaining/Cancelled", value: Math.max(0, stats.totalSchedules - stats.completedClasses) },
  ];
  const PIE_COLORS = ["#f59e0b", "#262626"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">My Performance</h1>
        <p className="text-neutral-400 text-sm mt-0.5">Track your classes, student attendance, and class remarks</p>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">My Batches</span>
            <BookOpen className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{stats.totalBatches}</p>
            <p className="text-[10px] text-neutral-500 mt-1">Assigned active batches</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Teaching Hours</span>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{stats.totalHoursTaught} hrs</p>
            <p className="text-[10px] text-neutral-500 mt-1">Across all completed classes</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Avg Attendance</span>
            <Users className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{stats.avgAttendanceRate}%</p>
            <p className="text-[10px] text-neutral-500 mt-1">Student attendance rate</p>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-semibold text-neutral-500">Demo Conversion</span>
            <TrendingUp className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{stats.demoConversionRate}%</p>
            <p className="text-[10px] text-neutral-500 mt-1">{stats.completedDemos} of {stats.totalDemos} demos completed</p>
          </div>
        </div>
      </div>

      {/* Middle Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Completion Gauge Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between">
          <h3 className="font-semibold text-white mb-2 text-sm flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-amber-500" /> Class Completion Rate
          </h3>
          <div className="h-[200px] w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
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
                  {pieChartData.map((entry, index) => (
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

    </div>
  );
}
