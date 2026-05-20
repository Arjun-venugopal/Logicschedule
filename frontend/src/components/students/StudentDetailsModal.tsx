"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, User, Phone, BookOpen, Mail, MapPin, Calendar, Activity, CheckCircle2, History, MessageCircle } from "lucide-react";
import { format } from "date-fns";

export function StudentDetailsModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}`)).data,
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: async () => {
      // In a real app, there would be a direct endpoint for student's attendance.
      // Assuming we calculate it here based on their batch's schedules.
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) return null;

  // Calculate attendance if available
  let presentCount = 0;
  let totalClasses = attendanceData?.length || 0;
  if (attendanceData) {
    attendanceData.forEach((cls: any) => {
      const record = cls.attendance?.find((a: any) => a.studentId === student._id);
      if (record?.isPresent) presentCount++;
    });
  }
  const attendancePercentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="relative h-24 brand-gradient shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg transition-colors backdrop-blur-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-6 pt-0 relative flex-1 overflow-y-auto space-y-6">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end -mt-12">
            <div className="w-24 h-24 rounded-2xl bg-neutral-800 border-4 border-neutral-900 flex items-center justify-center text-3xl font-bold text-amber-500 shadow-xl shrink-0">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 pb-2">
              <h2 className="text-2xl font-bold text-white leading-tight">{student.name}</h2>
              <p className="text-neutral-400 mt-1 flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> {student.batch?.name || "Unassigned Batch"}
              </p>
            </div>
            {student.batch && (
              <div className="pb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Active Student
                </span>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">Contact Details</h3>
              <div className="bg-neutral-800/50 rounded-xl p-4 space-y-4 border border-neutral-800">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Parent / Guardian</p>
                    <p className="text-sm font-medium text-white">{student.parentName || "Not provided"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Mobile Number</p>
                    <p className="text-sm font-medium text-white">{student.mobileNumber || "Not provided"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Email Address</p>
                    <p className="text-sm font-medium text-white">{student.email || "Not provided"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">WhatsApp Number</p>
                    <p className="text-sm font-medium text-white">{student.whatsappNumber || "Not provided"}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance/Attendance Overview */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">Overview</h3>
              <div className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-800 h-[190px] flex flex-col justify-center">
                {attLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !student.batch ? (
                  <div className="text-center text-neutral-500 text-sm">
                    Assign to a batch to track attendance.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-amber-500" />
                        <span className="text-sm font-medium text-neutral-300">Overall Attendance</span>
                      </div>
                      <span className={`text-lg font-bold ${
                        attendancePercentage >= 75 ? "text-emerald-400" :
                        attendancePercentage >= 50 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {attendancePercentage}%
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-neutral-900 rounded-lg p-3 text-center border border-neutral-800">
                        <p className="text-2xl font-bold text-emerald-500">{presentCount}</p>
                        <p className="text-[10px] uppercase text-neutral-500 font-semibold mt-1">Classes Attended</p>
                      </div>
                      <div className="bg-neutral-900 rounded-lg p-3 text-center border border-neutral-800">
                        <p className="text-2xl font-bold text-white">{totalClasses}</p>
                        <p className="text-[10px] uppercase text-neutral-500 font-semibold mt-1">Total Classes</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Academic History */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4" /> Academic History
            </h3>
            <div className="bg-neutral-800/50 rounded-xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-neutral-900/50 border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch / Class</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {student.batch && (
                    <tr className="bg-emerald-500/5">
                      <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        {student.batch.name}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{student.batch.subject || "General"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 uppercase">Current</span>
                      </td>
                    </tr>
                  )}
                  {student.pastBatches && student.pastBatches.length > 0 ? (
                    student.pastBatches.slice().reverse().map((pb: any, idx: number) => (
                      <tr key={idx} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="px-4 py-3 text-neutral-300 font-medium">{pb.batch?.name || "Unknown Batch"}</td>
                        <td className="px-4 py-3 text-neutral-500">{pb.batch?.subject || "General"}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-500 uppercase" title={`Completed/Left on ${format(new Date(pb.leftAt), "PPP")}`}>
                            Completed
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    !student.batch && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-neutral-500 text-sm">
                          No academic history available.
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
