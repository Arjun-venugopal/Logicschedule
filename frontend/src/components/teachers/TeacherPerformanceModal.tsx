import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, Users, BookOpen, Clock, CalendarCheck, TrendingUp, Award, Calendar, Phone, Filter, Video } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface TeacherPerformanceModalProps {
  teacherId: string;
  onClose: () => void;
}

export function TeacherPerformanceModal({ teacherId, onClose }: TeacherPerformanceModalProps) {
  const [timeRange, setTimeRange] = useState("all");
  const [demoStatus, setDemoStatus] = useState("all");
  const [batchStatus, setBatchStatus] = useState("all");
  const [studentId, setStudentId] = useState("all");
  const [activeDetailView, setActiveDetailView] = useState<'demos' | 'batches' | 'classes' | 'students'>('demos');

  const clearFilters = () => {
    setTimeRange("all");
    setDemoStatus("all");
    setBatchStatus("all");
    setStudentId("all");
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-performance", teacherId, timeRange, demoStatus, batchStatus, studentId],
    queryFn: async () => (await api.get(`/teachers/${teacherId}/performance`, {
      params: { timeRange, demoStatus, batchStatus, studentId }
    })).data,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl p-6 text-center">
          <p className="text-red-500 font-bold mb-2">Error Loading Performance</p>
          <p className="text-neutral-400 text-sm mb-4">
            {(error as any)?.response?.data?.message || "Failed to load performance metrics."}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { teacher, stats, demoSessions = [], assignedStudents = [], filteredBatches = [], filteredSchedules = [] } = data;

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

        {/* Filters */}
        <div className="px-6 py-4 border-b border-neutral-800 bg-neutral-900/50 flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
          <div className="flex flex-wrap items-center gap-3 w-full">
            <Filter className="w-4 h-4 text-amber-500 shrink-0" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500 transition-colors w-full md:w-auto"
            >
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
            
            <select
              value={demoStatus}
              onChange={(e) => setDemoStatus(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500 transition-colors w-full md:w-auto"
            >
              <option value="all">All Demos</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={batchStatus}
              onChange={(e) => setBatchStatus(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500 transition-colors w-full md:w-auto"
            >
              <option value="all">All Batches</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none focus:border-amber-500 transition-colors w-full md:w-auto max-w-[200px]"
            >
              <option value="all">All Students</option>
              {assignedStudents.map((s: any) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>

            <button
              onClick={clearFilters}
              className="text-xs text-neutral-400 hover:text-white underline underline-offset-2 ml-2 shrink-0 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          {/* Key Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div 
              onClick={() => setActiveDetailView('batches')}
              className={`bg-neutral-800/50 border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-colors ${activeDetailView === 'batches' ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800 hover:border-amber-500/50'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Batches</span>
                <BookOpen className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.totalBatches}</p>
            </div>

            <div 
              onClick={() => setActiveDetailView('classes')}
              className={`bg-neutral-800/50 border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-colors ${activeDetailView === 'classes' ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800 hover:border-amber-500/50'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Classes Completed</span>
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.completedClasses}</p>
              <span className="text-[10px] text-neutral-500 mt-1">{stats.totalHoursTaught} hrs taught</span>
            </div>

            <div 
              onClick={() => setActiveDetailView('students')}
              className={`bg-neutral-800/50 border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-colors ${activeDetailView === 'students' ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800 hover:border-amber-500/50'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold text-neutral-500">Avg Attendance</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-white">{stats.avgAttendanceRate}%</p>
            </div>

            <div 
              onClick={() => setActiveDetailView('demos')}
              className={`bg-neutral-800/50 border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-colors ${activeDetailView === 'demos' ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800 hover:border-amber-500/50'}`}
            >
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

          {/* Dynamic Details Section */}
          <div className="space-y-4 pt-4 border-t border-neutral-800/50">
            {activeDetailView === 'batches' && (
              <>
                <h3 className="font-semibold text-white flex items-center gap-2 pb-2">
                  <BookOpen className="w-4 h-4 text-amber-500" /> Filtered Batches ({filteredBatches.length})
                </h3>
                <div className="space-y-3">
                  {filteredBatches.length === 0 ? (
                    <div className="py-6 text-center text-neutral-500 bg-neutral-800/20 rounded-xl border border-neutral-850 text-sm">
                      No batches found for the selected filters.
                    </div>
                  ) : (
                    filteredBatches.map((batch: any) => (
                      <div key={batch._id} className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white mb-1">{batch.name}</h4>
                          <p className="text-xs text-neutral-400">{batch.subject} · {batch.studentsCount || 0} Students</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            batch.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            batch.status === 'Upcoming' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            batch.status === 'Completed' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {batch.status}
                          </span>
                          {batch.timing && <p className="text-xs text-neutral-500 mt-2">{batch.timing.startTime} - {batch.timing.endTime}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeDetailView === 'classes' && (
              <>
                <h3 className="font-semibold text-white flex items-center gap-2 pb-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Filtered Classes ({filteredSchedules.length})
                </h3>
                <div className="space-y-3">
                  {filteredSchedules.length === 0 ? (
                    <div className="py-6 text-center text-neutral-500 bg-neutral-800/20 rounded-xl border border-neutral-850 text-sm">
                      No classes found for the selected filters.
                    </div>
                  ) : (
                    filteredSchedules.map((schedule: any) => (
                      <div key={schedule._id} className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white mb-1">{schedule.batch?.name || "Unknown Batch"}</h4>
                          <p className="text-xs text-neutral-400 flex items-center gap-2">
                            <Calendar className="w-3 h-3" /> {schedule.date ? format(parseISO(schedule.date), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            schedule.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            schedule.status === 'Scheduled' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {schedule.status}
                          </span>
                          <p className="text-xs text-neutral-500 mt-2">{schedule.startTime} - {schedule.endTime}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeDetailView === 'students' && (
              <>
                <h3 className="font-semibold text-white flex items-center gap-2 pb-2">
                  <Users className="w-4 h-4 text-emerald-500" /> Assigned Students ({assignedStudents.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {assignedStudents.length === 0 ? (
                    <div className="col-span-full py-6 text-center text-neutral-500 bg-neutral-800/20 rounded-xl border border-neutral-850 text-sm">
                      No students found.
                    </div>
                  ) : (
                    assignedStudents.map((student: any) => (
                      <div key={student._id} className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-3 flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                          {student.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-white">{student.name}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {activeDetailView === 'demos' && (
              <>
                <h3 className="font-semibold text-white flex items-center gap-2 pb-2">
                  <Video className="w-4 h-4 text-orange-500" /> Demo Sessions ({demoSessions.length})
                </h3>
                <div className="space-y-3">
                  {demoSessions.length === 0 ? (
                    <div className="py-6 text-center text-neutral-500 bg-neutral-800/20 rounded-xl border border-neutral-850 text-sm">
                      No demo sessions found for the selected filters.
                    </div>
                  ) : (
                    demoSessions.map((demo: any) => (
                      <div key={demo._id} className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-4 hover:bg-neutral-800/60 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white">{demo.studentName}</h4>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                demo.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                demo.status === "Pending" || demo.status === "Scheduled" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}>
                                {demo.status || "Pending"}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-400 mt-1">{demo.subject}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-neutral-500 flex items-center justify-end gap-1 font-medium mb-1">
                              <Calendar className="w-3 h-3" />
                              {demo.date ? format(parseISO(demo.date), "MMM d, yyyy") : ""}
                            </span>
                            <span className="text-xs text-neutral-400">{demo.startTime} - {demo.endTime}</span>
                          </div>
                        </div>
                        
                        {(demo.studentEmail || demo.phoneNumber) && (
                          <div className="flex items-center gap-4 mt-2 mb-3">
                            {demo.phoneNumber && (
                              <span className="text-xs text-neutral-400 flex items-center gap-1 bg-neutral-900/50 px-2 py-1 rounded-md">
                                <Phone className="w-3 h-3 text-neutral-500" /> {demo.phoneNumber}
                              </span>
                            )}
                            {demo.studentEmail && (
                              <span className="text-xs text-neutral-400 bg-neutral-900/50 px-2 py-1 rounded-md">
                                {demo.studentEmail}
                              </span>
                            )}
                          </div>
                        )}

                        {demo.notes && (
                          <div className="mt-2">
                            <span className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Notes</span>
                            <p className="text-xs text-neutral-300 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/80">
                              {demo.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
