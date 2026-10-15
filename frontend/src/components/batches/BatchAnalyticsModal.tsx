"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Users, 
  BookOpen, 
  Clock, 
  CalendarCheck, 
  Calendar, 
  AlertTriangle,
  FolderGit2,
  Award,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  User,
  Link as LinkIcon,
  Sparkles,
  GraduationCap
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { StudentDetailsModal } from "@/components/students/StudentDetailsModal";
import { ProjectSubmissionsSection } from "@/components/students/ProjectSubmissionsSection";

export function BatchAnalyticsModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

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

  const { batch, studentsCount, totalSchedules, completedSchedules, cancelledSchedules = 0, upcomingSchedules = 0, attendanceStats, schedules } = data;
  const targetClasses = (batch?.numberOfSessions && Number(batch.numberOfSessions) > 0)
    ? Number(batch.numberOfSessions)
    : totalSchedules;
  const progress = targetClasses > 0 ? Math.min(100, Math.round((completedSchedules / targetClasses) * 100)) : 0;
  const cancelledCount = cancelledSchedules || (schedules ? schedules.filter((s: any) => s.status === 'Cancelled').length : 0);
  const remainingCount = Math.max(0, targetClasses - completedSchedules);

  const barChartData = attendanceStats.map((stu: any) => ({
    name: stu.name.split(' ')[0], 
    attendance: stu.percentage
  }));

  const pieChartData = [
    { name: 'Completed', value: completedSchedules },
    { name: 'Upcoming/Remaining', value: remainingCount },
    ...(cancelledCount > 0 ? [{ name: 'Cancelled', value: cancelledCount }] : [])
  ];
  const PIE_COLORS = ['#10b981', '#3b82f6', '#ef4444'];

  const getStudentCompletedCount = (studentId: string) => {
    const completedList = (schedules || []).filter((s: any) => s.status === 'Completed');
    let count = 0;
    completedList.forEach((cls: any) => {
      if (cls.attendance && Array.isArray(cls.attendance) && cls.attendance.length > 0) {
        const record = cls.attendance.find((a: any) => {
          const sId = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
          return sId === studentId.toString();
        });
        if (record ? record.isPresent !== false : true) {
          count++;
        }
      } else {
        count++;
      }
    });
    return count;
  };

  const toggleStudentProjects = (studentId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [studentId]: !prev[studentId],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-5xl shadow-2xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-neutral-800 shrink-0 gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-white leading-tight truncate">{batch.name} Details & Analytics</h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{batch.subject}</span>
              <span>·</span>
              <span>Teacher: <strong className="text-white">{batch.assignedTeacher?.name || "No Teacher"}</strong></span>
              <span className="hidden sm:inline">•</span>
              <span>Duration: {batch.numberOfSessions ? `${batch.numberOfSessions} Classes` : (batch.durationType || "Not specified")}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 sm:space-y-8 custom-scrollbar">
          {/* Top Stats */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Students</span>
                  <Users className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">{studentsCount}</p>
              </div>
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Total Classes</span>
                  <Calendar className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">{targetClasses}</p>
              </div>
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Completed</span>
                  <CalendarCheck className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">{completedSchedules}</p>
              </div>
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Upcoming</span>
                  <Clock className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">{remainingCount}</p>
              </div>
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] sm:text-xs uppercase font-semibold text-neutral-500">Dropped / Cancelled</span>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white">{cancelledCount}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-400 mb-1.5">
                <span>Course Completion Progress</span>
                <span className="text-emerald-400">{progress}% ({completedSchedules} of {targetClasses} classes)</span>
              </div>
              <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {/* SECTION: Student Details & Project Submissions */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-2">
              <h3 className="font-bold text-white flex items-center gap-2 text-base">
                <FolderGit2 className="w-5 h-5 text-amber-500" />
                Student Details & Project Submissions
              </h3>
              <p className="text-xs text-neutral-400">
                Milestones generated every 5 completed classes (5, 10, 15...). Assigned teacher submits project links.
              </p>
            </div>

            {attendanceStats.length === 0 ? (
              <div className="p-6 text-center bg-neutral-800/20 border border-neutral-800 rounded-xl text-neutral-500 text-sm">
                No students enrolled in this batch.
              </div>
            ) : (
              <div className="space-y-3">
                {attendanceStats.map((stu: any) => {
                  const studentCompleted = getStudentCompletedCount(stu.studentId);
                  const isExpanded = expandedProjects[stu.studentId] ?? (attendanceStats.length === 1);
                  const milestonesCount = Math.floor(studentCompleted / 5);

                  // Extract student project submissions
                  const stuSubmissions: any[] = stu.projectSubmissions || [];
                  const batchSubmissions = stuSubmissions.filter((ps: any) => {
                    const psBId = ps.batchId ? ps.batchId.toString() : "";
                    return !psBId || psBId === batchId.toString();
                  });

                  const submittedCount = batchSubmissions.filter((ps: any) => ps.projectLink && ps.projectLink.trim()).length;
                  const reviewedCount = batchSubmissions.filter((ps: any) => ps.status === 'Reviewed').length;
                  const pendingCount = Math.max(0, milestonesCount - submittedCount);

                  return (
                    <div
                      key={stu.studentId}
                      className="bg-neutral-800/30 border border-neutral-800 rounded-2xl overflow-hidden transition-colors"
                    >
                      {/* Student Card Summary Bar */}
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-800/40 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() => setSelectedStudentId(stu.studentId)}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 font-bold text-base flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                            title="Click to view full student details"
                          >
                            {stu.name.charAt(0).toUpperCase()}
                          </button>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentId(stu.studentId)}
                                className="font-bold text-white hover:text-amber-400 transition-colors text-sm sm:text-base text-left truncate"
                              >
                                {stu.name}
                              </button>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                stu.percentage >= 75 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                stu.percentage >= 50 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                "bg-red-500/10 text-red-400 border-red-500/20"
                              }`}>
                                {stu.percentage}% Attendance
                              </span>
                            </div>

                            <p className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
                              <span>Completed: <strong className="text-white">{studentCompleted}</strong> classes</span>
                              <span>•</span>
                              <span>
                                {milestonesCount === 0 ? (
                                  <span className="text-neutral-500">First milestone at 5 classes ({studentCompleted}/5)</span>
                                ) : (
                                  <span className="text-amber-400 font-medium">{milestonesCount} {milestonesCount === 1 ? "Milestone" : "Milestones"} Unlocked</span>
                                )}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Milestones Pills & Toggle */}
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                          {/* Milestone status indicator pills */}
                          {milestonesCount > 0 && (
                            <div className="flex items-center gap-1.5">
                              {submittedCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  <LinkIcon className="w-3 h-3" /> {submittedCount} Submitted
                                </span>
                              )}
                              {reviewedCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" /> {reviewedCount} Reviewed
                                </span>
                              )}
                              {pendingCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <Clock className="w-3 h-3" /> {pendingCount} Pending
                                </span>
                              )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedStudentId(stu.studentId)}
                            className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors flex items-center gap-1 border border-neutral-700"
                            title="View student profile and records"
                          >
                            <User className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="hidden sm:inline">Details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleStudentProjects(stu.studentId)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <FolderGit2 className="w-3.5 h-3.5" />
                            <span>{isExpanded ? "Hide Projects" : "Project Links"}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable Project Submissions Section */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-neutral-800/80 p-4 sm:p-5 bg-neutral-900/60"
                          >
                            <ProjectSubmissionsSection
                              student={{
                                _id: stu.studentId,
                                name: stu.name,
                                projectSubmissions: stu.projectSubmissions || [],
                                batch: batch,
                              }}
                              batchId={batchId}
                              batchName={batch.name}
                              courseName={batch.subject}
                              completedClassesCount={studentCompleted}
                              schedules={schedules}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
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

          {/* Date-Wise Attendance Table & Class Timeline */}
          <div className="space-y-8">
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
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
                    <thead className="bg-neutral-900/50 border-b border-neutral-800">
                      <tr>
                        <th className="px-4 py-3 font-medium text-neutral-400 sticky left-0 bg-neutral-900 z-10 shadow-[1px_0_0_0_#262626]">Student Name</th>
                        {schedules.filter((s: any) => s.status === 'Completed').map((cls: any) => (
                          <th key={cls._id} className="px-4 py-3 font-medium text-neutral-400 text-center">
                            {format(parseISO(cls.date), "MMM d")}
                          </th>
                        ))}
                        <th className="px-4 py-3 font-medium text-neutral-400 text-center">%</th>
                        <th className="px-4 py-3 font-medium text-neutral-400 text-center">Projects</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {attendanceStats.map((stu: any) => {
                        const studentCompleted = getStudentCompletedCount(stu.studentId);
                        const milestonesCount = Math.floor(studentCompleted / 5);

                        return (
                          <tr key={stu.studentId} className="hover:bg-neutral-800/20 transition-colors">
                            <td className="px-4 py-3 text-white font-medium sticky left-0 bg-neutral-900 z-10 shadow-[1px_0_0_0_#262626]">
                              <button
                                type="button"
                                onClick={() => setSelectedStudentId(stu.studentId)}
                                className="hover:text-amber-400 transition-colors flex items-center gap-1.5"
                                title="Click to view full student details"
                              >
                                <span>{stu.name}</span>
                                <ExternalLink className="w-3 h-3 text-neutral-500 inline opacity-60" />
                              </button>
                            </td>
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
                              );
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
                            <td className="px-4 py-3 text-center">
                              {milestonesCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleStudentProjects(stu.studentId)}
                                  className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors inline-flex items-center gap-1"
                                >
                                  <FolderGit2 className="w-3 h-3" />
                                  <span>{milestonesCount} {milestonesCount === 1 ? "Milestone" : "Milestones"}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-neutral-500 font-medium">0/5 Done</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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

      {/* Student Details Full Modal (Drill-down from Batch) */}
      {selectedStudentId && (
        <StudentDetailsModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}
