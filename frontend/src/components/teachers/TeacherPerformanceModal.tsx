"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, Users, BookOpen, Clock, CalendarCheck, TrendingUp, Award, Calendar, MessageSquare, Phone } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface TeacherPerformanceModalProps {
  teacherId: string;
  onClose: () => void;
}

export function TeacherPerformanceModal({ teacherId, onClose }: TeacherPerformanceModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-performance", teacherId],
    queryFn: async () => (await api.get(`/teachers/${teacherId}/performance`)).data,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { teacher, stats, recentFeedback = [] } = data;

  const pieChartData = [
    { name: "Completed", value: stats.completedClasses },
    { name: "Remaining/Cancelled", value: Math.max(0, stats.totalSchedules - stats.completedClasses) },
  ];
  const PIE_COLORS = ["#f59e0b", "#262626"];

  const statusColor = (status: string) => {
    if (status === "Available") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "Busy") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-neutral-700/50 text-neutral-400 border-neutral-600/30";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full brand-gradient flex items-center justify-center text-lg font-bold text-black shrink-0">
              {teacher.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white leading-tight">{teacher.name} Performance</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusColor(teacher.status)}`}>
                  {teacher.status || "Available"}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1">
                {teacher.email} {teacher.phone ? `· ${teacher.phone}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          {/* Key Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Batches</span>
                <BookOpen className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.totalBatches}</p>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Hours Taught</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.totalHoursTaught} hrs</p>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Avg Attendance</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.avgAttendanceRate}%</p>
            </div>

            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Demo Conversion</span>
                <TrendingUp className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.demoConversionRate}%</p>
              <span className="text-[10px] text-neutral-500 mt-1">
                {stats.completedDemos} of {stats.totalDemos} completed
              </span>
            </div>
          </div>

          {/* Graphical Analytics & Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Completion Gauge */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between">
              <h3 className="font-semibold text-white mb-2 text-sm flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-amber-500" /> Completion Rate
              </h3>
              <div className="h-[180px] w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={70}
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
              <div className="flex justify-between text-xs text-neutral-400 px-2 mt-2">
                <span>Completed: {stats.completedClasses}</span>
                <span>Total: {stats.totalSchedules}</span>
              </div>
            </div>

            {/* Experience / Subject Expertise */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-5 lg:col-span-2 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" /> Teaching Details
                </h3>
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">Subject Expertise</span>
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
                        <span className="text-xs text-neutral-500 italic">No subjects added yet</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-500 block mb-1">Experience</span>
                    <p className="text-sm font-semibold text-white">
                      {teacher.experience ? `${teacher.experience} Years of teaching experience` : "New Profile"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status banner */}
              <div className="mt-4 p-3 bg-neutral-900/50 rounded-xl border border-neutral-850 text-xs text-neutral-400">
                <span className="font-medium text-neutral-300">System Logs: </span>
                Teacher account is associated with {stats.totalBatches} batches and has taken {stats.completedClasses} classes.
              </div>
            </div>
          </div>

          {/* Feedback & Notes Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2 border-b border-neutral-850 pb-2">
              <MessageSquare className="w-4 h-4 text-amber-500" /> Recent Remarks & Class Notes
            </h3>
            <div className="space-y-3">
              {recentFeedback.length === 0 ? (
                <div className="py-6 text-center text-neutral-500 bg-neutral-800/20 rounded-xl border border-neutral-850 text-sm">
                  No notes or remarks have been recorded for completed classes yet.
                </div>
              ) : (
                recentFeedback.map((feedback: any) => (
                  <div
                    key={feedback._id}
                    className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-4 hover:bg-neutral-800/60 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs text-amber-400 font-semibold">{feedback.batch?.name || "Unknown Batch"}</span>
                        <h4 className="text-sm font-bold text-white">{feedback.subject}</h4>
                      </div>
                      <span className="text-[10px] text-neutral-500 flex items-center gap-1 font-medium">
                        <Calendar className="w-3 h-3" />
                        {feedback.date ? format(parseISO(feedback.date), "MMM d, yyyy") : ""}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/80">
                      {feedback.notes}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
