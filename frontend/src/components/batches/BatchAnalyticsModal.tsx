"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, Users, BookOpen, Clock, CalendarCheck, Calendar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function BatchAnalyticsModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["batch-analytics", batchId],
    queryFn: async () => (await api.get(`/batches/${batchId}/analytics`)).data,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { batch, studentsCount, totalSchedules, completedSchedules, attendanceStats, schedules } = data;
  const targetClasses = (batch?.numberOfSessions && Number(batch.numberOfSessions) > 0)
    ? Number(batch.numberOfSessions)
    : totalSchedules;
  const progress = targetClasses > 0 ? Math.min(100, Math.round((completedSchedules / targetClasses) * 100)) : 0;


  const barChartData = attendanceStats.map((stu: any) => ({
    name: stu.name.split(' ')[0], 
    attendance: stu.percentage
  }));

  const pieChartData = [
    { name: 'Completed', value: completedSchedules },
    { name: 'Remaining', value: Math.max(0, targetClasses - completedSchedules) }
  ];
  const PIE_COLORS = ['#10b981', '#3f3f46'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col"
      >
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-neutral-800 shrink-0 gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-white leading-tight truncate">{batch.name} Analytics</h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{batch.subject}</span>
              <span>·</span>
              <span>{batch.assignedTeacher?.name || "No Teacher"}</span>
              <span className="hidden sm:inline">•</span>
              <span>Duration: {batch.numberOfSessions ? `${batch.numberOfSessions} Hours` : (batch.durationType || "Not specified")}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 sm:space-y-8">
          {/* Top Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Students</span>
                <Users className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white">{studentsCount}</p>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Total Classes</span>
                <Calendar className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white">{targetClasses}</p>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Completed</span>
                <CalendarCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white">{completedSchedules}</p>
            </div>
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Progress</span>
                <Clock className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white">{progress}%</p>
              <div className="w-full h-1.5 bg-neutral-700 rounded-full mt-2 overflow-hidden">
                <div className="h-full brand-gradient" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {/* Visual Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 sm:p-5 min-w-0">
              <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-500" /> Syllabus Progress
              </h3>
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 sm:p-5 min-w-0">
              <h3 className="font-semibold text-white mb-4 text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" /> Student Attendance %
              </h3>
              <div className="h-[200px] w-full min-w-0">
                {barChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={barChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis dataKey="name" stroke="#737373" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#737373" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{ fill: '#262626' }}
                        contentStyle={{ backgroundColor: '#171717', borderColor: '#262626', borderRadius: '8px', color: '#fff' }}
                      />
                      <Bar dataKey="attendance" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-neutral-500 text-sm">Not enough data</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {/* Detailed Date-Wise Attendance Table */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2 border-b border-neutral-800 pb-2">
                <CalendarCheck className="w-4 h-4 text-emerald-500" />
                Date-Wise Attendance
              </h3>
              <div className="overflow-x-auto bg-neutral-800/30 rounded-xl border border-neutral-800/50">
                {attendanceStats.length === 0 ? (
                  <p className="text-sm text-neutral-500 p-4">No students enrolled.</p>
                ) : schedules.filter((s: any) => s.status === 'Completed').length === 0 ? (
                  <p className="text-sm text-neutral-500 p-4">No completed classes yet.</p>
                ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-[450px]">
                    <thead className="bg-neutral-900/50 border-b border-neutral-800">
                      <tr>
                        <th className="px-4 py-3 font-medium text-neutral-400 sticky left-0 bg-neutral-900 z-10 shadow-[1px_0_0_0_#262626]">Student Name</th>
                        {schedules.filter((s: any) => s.status === 'Completed').map((cls: any) => (
                          <th key={cls._id} className="px-4 py-3 font-medium text-neutral-400 text-center">
                            {format(parseISO(cls.date), "MMM d")}
                          </th>
                        ))}
                        <th className="px-4 py-3 font-medium text-neutral-400 text-center">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {attendanceStats.map((stu: any) => (
                        <tr key={stu.studentId} className="hover:bg-neutral-800/20 transition-colors">
                          <td className="px-4 py-3 text-white font-medium sticky left-0 bg-neutral-900 z-10 shadow-[1px_0_0_0_#262626]">{stu.name}</td>
                          {schedules.filter((s: any) => s.status === 'Completed').map((cls: any) => {
                            const record = cls.attendance?.find((a: any) => a.studentId === stu.studentId);
                            const isPresent = record ? record.isPresent : false;
                            const hasRecord = !!record;
                            return (
                              <td key={cls._id} className="px-4 py-3 text-center">
                                {!hasRecord ? (
                                  <span className="text-neutral-600">—</span>
                                ) : isPresent ? (
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="Present"></span>
                                ) : (
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" title="Absent"></span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-bold px-2 py-1 rounded-md border ${
                              stu.percentage >= 75 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              stu.percentage >= 50 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}>
                              {stu.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Schedules Timeline */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2 border-b border-neutral-800 pb-2">
                <Clock className="w-4 h-4 text-blue-500" />
                Class Timeline
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {schedules.length === 0 ? (
                  <p className="text-sm text-neutral-500">No classes scheduled.</p>
                ) : (
                  schedules.map((s: any) => (
                    <div key={s._id} className="relative pl-6 border-l-2 border-neutral-800">
                      <div className={`absolute -left-1.5 top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-neutral-900 ${
                        s.status === 'Completed' ? 'bg-emerald-500' :
                        s.status === 'Cancelled' ? 'bg-red-500' :
                        'bg-amber-500'
                      }`} />
                      <div className="bg-neutral-800/30 p-3 rounded-xl border border-neutral-800/50">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-semibold text-white">
                            {format(parseISO(s.date), "MMM d, yyyy")}
                          </p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            s.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            s.status === 'Cancelled' ? 'bg-red-500/10 text-red-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>
                            {s.status}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-400 mb-1">{s.startTime} – {s.endTime}</p>
                        {s.subject && <p className="text-[11px] text-amber-200 bg-amber-500/10 px-2 py-0.5 rounded inline-block">Topic: {s.subject}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
