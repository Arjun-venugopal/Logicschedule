"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, User, Phone, BookOpen, Mail, MapPin, Calendar, Activity, CheckCircle2, History, MessageCircle, GraduationCap, ChevronRight } from "lucide-react";
import { format } from "date-fns";

export function StudentDetailsModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}`)).data,
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: async () => {
      if (!student?.batch?._id) return [];
      const schedules = (await api.get("/schedules")).data;
      return schedules.filter((s: any) =>
        s.batch?._id === student.batch._id && s.status === "Completed"
      );
    },
    enabled: !!student?.batch?._id,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="w-10 h-10 border-4 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) return null;

  // Calculate attendance if available
  let presentCount = 0;
  const totalClasses = attendanceData?.length || 0;
  if (attendanceData) {
    attendanceData.forEach((cls: any) => {
      const record = cls.attendance?.find((a: any) => a.studentId === student._id);
      if (record?.isPresent) presentCount++;
    });
  }
  const attendancePercentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  // Progress Ring Configuration
  const ringCircumference = 2 * Math.PI * 36;
  const ringOffset = ringCircumference - (attendancePercentage / 100) * ringCircumference;
  const ringColor = attendancePercentage >= 75 ? "text-emerald-500" : attendancePercentage >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* Modal Content */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="bg-neutral-900 border border-neutral-800 rounded-[2rem] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col relative z-10 max-h-[90vh]"
      >
        {/* Dynamic Glass Header */}
        <div className="relative h-16 shrink-0 overflow-hidden bg-orange-900">
          <div className="absolute inset-0 brand-gradient opacity-70" />
          <div className="absolute top-0 right-0 p-8 w-full h-full" />

          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-md hover:scale-110">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-8 pb-8 pt-0 relative flex-1 overflow-y-auto custom-scrollbar">
          {/* Profile Header (Overlapping) */}
          <div className="flex flex-col md:flex-row gap-6 items-center md:items-end mb-8 text-center md:text-left">
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", delay: 0.1 }}
              className="w-32 h-32 rounded-[2rem] bg-neutral-900 border-[6px] border-neutral-900 flex items-center justify-center text-4xl font-black text-amber-500 shadow-2xl shrink-0 brand-gradient-bg relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
              <span className="relative z-10">{student.name.charAt(0).toUpperCase()}</span>
            </motion.div>

            <div className="flex-1 pb-2">
              <h2 className="text-3xl font-black text-white tracking-tight">{student.name}</h2>
              <p className="text-amber-500/80 mt-1 flex items-center justify-center md:justify-start gap-2 font-medium">
                <BookOpen className="w-4 h-4" /> {student.batch?.name || "Unassigned Batch"}
              </p>
            </div>

            {student.batch && (
              <div className="pb-2">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold shadow-lg shadow-emerald-500/5">
                  <CheckCircle2 className="w-4 h-4" /> Enrolled
                </div>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {/* Contact Information Cards (Col Span 3) */}
            <div className="md:col-span-3 space-y-4">
              <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest px-1">
                <User className="w-4 h-4 text-amber-500" />
                <span>Contact Info</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Parent */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-4 border border-neutral-800/50 flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Parent / Guardian</p>
                    <p className="text-sm font-semibold text-white truncate">{student.parentName || "—"}</p>
                  </div>
                </div>

                {/* Mobile */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-4 border border-neutral-800/50 flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Mobile Number</p>
                    <p className="text-sm font-semibold text-white truncate">{student.mobileNumber || "—"}</p>
                  </div>
                </div>

                {/* Email */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-4 border border-neutral-800/50 flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Email Address</p>
                    <p className="text-sm font-semibold text-white truncate">{student.email || "—"}</p>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-4 border border-neutral-800/50 flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">WhatsApp</p>
                    <p className="text-sm font-semibold text-white truncate">{student.whatsappNumber || "—"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Attendance Overview (Col Span 2) */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest px-1">
                <Activity className="w-4 h-4 text-amber-500" />
                <span>Attendance</span>
              </div>
              <div className="bg-neutral-800/40 rounded-2xl p-5 border border-neutral-800/50 h-[172px] flex items-center justify-center relative overflow-hidden">
                {attLoading ? (
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                ) : !student.batch ? (
                  <div className="text-center">
                    <GraduationCap className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                    <p className="text-neutral-500 text-xs font-medium">Assign batch to track</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-6 w-full max-w-[200px] mx-auto">
                    {/* SVG Progress Ring */}
                    <div className="relative w-24 h-24 shrink-0">
                      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 80 80">
                        {/* Background ring */}
                        <circle cx="40" cy="40" r="36" className="text-neutral-800" strokeWidth="6" stroke="currentColor" fill="none" />
                        {/* Progress ring */}
                        <motion.circle
                          initial={{ strokeDashoffset: ringCircumference }}
                          animate={{ strokeDashoffset: ringOffset }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          cx="40" cy="40" r="36"
                          className={ringColor}
                          strokeWidth="6"
                          stroke="currentColor"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-white">{attendancePercentage}%</span>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1">
                      <div>
                        <p className="text-2xl font-bold text-white leading-none">{presentCount}</p>
                        <p className="text-[10px] uppercase text-neutral-500 font-bold mt-0.5">Attended</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-neutral-400 leading-none">{totalClasses}</p>
                        <p className="text-[10px] uppercase text-neutral-600 font-bold mt-0.5">Total</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Academic History */}
          <div className="space-y-4 pt-4 mt-6 border-t border-neutral-800/50">
            <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest px-1">
              <History className="w-4 h-4 text-amber-500" />
              <span>Academic History</span>
            </div>

            <div className="bg-neutral-800/20 rounded-2xl border border-neutral-800/50 overflow-hidden">
              {student.batch || (student.pastBatches && student.pastBatches.length > 0) ? (
                <div className="divide-y divide-neutral-800/50">
                  {/* Current Batch */}
                  {student.batch && (
                    <div className="p-4 flex items-center justify-between hover:bg-neutral-800/40 transition-colors relative overflow-hidden group">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-r" />
                      <div className="flex items-center gap-4 pl-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <BookOpen className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{student.batch.name}</h4>
                          <p className="text-xs text-neutral-500 font-medium mt-0.5">{student.batch.subject || "General"}</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                        Current
                      </div>
                    </div>
                  )}

                  {/* Past Batches */}
                  {student.pastBatches && student.pastBatches.slice().reverse().map((pb: any, idx: number) => (
                    <div key={idx} className="p-4 flex items-center justify-between hover:bg-neutral-800/40 transition-colors relative group">
                      <div className="flex items-center gap-4 pl-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-neutral-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-neutral-300 group-hover:text-white transition-colors">{pb.batch?.name || "Unknown Batch"}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-neutral-500 font-medium">{pb.batch?.subject || "General"}</p>
                            <span className="w-1 h-1 rounded-full bg-neutral-700" />
                            <p className="text-[10px] text-neutral-600 font-medium">Completed {format(new Date(pb.leftAt), "MMM yyyy")}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-2">
                        Completed
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3">
                    <History className="w-5 h-5 text-neutral-600" />
                  </div>
                  <p className="text-sm font-medium text-neutral-400">No academic history available</p>
                  <p className="text-xs text-neutral-600 mt-1">This student has not been assigned to any batches yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
