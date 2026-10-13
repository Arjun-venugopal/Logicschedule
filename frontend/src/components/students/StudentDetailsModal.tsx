"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { X, User, Phone, BookOpen, Mail, Activity, CheckCircle2, History, MessageCircle, GraduationCap, Plus, CreditCard, IndianRupee, AlertCircle, Clock, Receipt, Calendar, Video, ExternalLink, ChevronDown, ChevronUp, FileText, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { AdmissionPaymentModal } from "@/components/payments/AdmissionPaymentModal";

function extractLevel(text?: string, fallback = "Level 1"): string {
  if (!text) return fallback;
  const match = text.match(/level\s*[-]?\s*(\d+)/i) || text.match(/lvl\s*[-]?\s*(\d+)/i);
  return match ? `Level ${match[1]}` : fallback;
}

function safeFormatDate(dateVal: any, formatStr = "dd MMM yyyy, EEE", fallback = "Session"): string {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

export function StudentDetailsModal({ 
  studentId, 
  onClose,
  initialOpenAdvance = false,
}: { 
  studentId: string; 
  onClose: () => void;
  initialOpenAdvance?: boolean;
}) {
  const queryClient = useQueryClient();
  const [showNextCourseModal, setShowNextCourseModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [numberOfClasses, setNumberOfClasses] = useState("15");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Monday", "Wednesday", "Friday"]);
  const [meetingLink, setMeetingLink] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({ current: true });
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showAdmissionPaymentModal, setShowAdmissionPaymentModal] = useState(false);

  const { data: student, isLoading } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}`)).data,
  });

  const { data: allTeachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data: allBatches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  // Helper to determine current level tag
  const currentLevelTag = student?.currentLevel || 
    student?.level || 
    (() => {
      const str = `${student?.batch?.name || ''} ${student?.batch?.subject || ''}`.toLowerCase();
      const match = str.match(/level\s*[-]?\s*(\d+)/i) || str.match(/lvl\s*[-]?\s*(\d+)/i);
      if (match) return `Level ${match[1]}`;
      const pastCount = student?.pastBatches?.length || 0;
      if (pastCount > 0) return `Level ${pastCount + 1}`;
      return "Level 1";
    })();

  // Helper to determine next course level suggestion
  const getNextLevelSuggestion = () => {
    if (student?.currentLevel) {
      const m = student.currentLevel.match(/(\d+)/);
      if (m) return `Level ${Number(m[1]) + 1}`;
    }
    const text = `${student?.batch?.name || ''} ${student?.batch?.subject || ''}`.toLowerCase();
    if (text.includes('level 1') || text.includes('lvl 1') || text.includes('level-1')) return 'Level 2';
    if (text.includes('level 2') || text.includes('lvl 2') || text.includes('level-2')) return 'Level 3';
    if (text.includes('level 3') || text.includes('lvl 3') || text.includes('level-3')) return 'Level 4';
    if (text.includes('level 4') || text.includes('lvl 4') || text.includes('level-4')) return 'Level 5';
    if (text.includes('level 5') || text.includes('lvl 5') || text.includes('level-5')) return 'Level 6';
    const pastCount = student?.pastBatches?.length || 0;
    if (pastCount > 0) return `Level ${pastCount + 2}`;
    return 'Level 2';
  };

  const handleOpenNextCourseModal = () => {
    const nextLvl = getNextLevelSuggestion();
    setSelectedLevel(nextLvl);
    const defaultClasses = student?.classesNeeded || student?.batch?.numberOfSessions || 15;
    setNumberOfClasses(String(defaultClasses));
    const currentTeacherId = student?.batch?.assignedTeacher?._id || 
      (typeof student?.batch?.assignedTeacher === 'string' ? student?.batch?.assignedTeacher : '') || 
      (typeof student?.assignedTutor === 'string' ? student?.assignedTutor : student?.assignedTutor?._id) || '';
    setSelectedTeacher(currentTeacherId);
    setStartTime(student?.batch?.timing?.startTime || "09:00");
    setEndTime(student?.batch?.timing?.endTime || "10:00");
    setSelectedDays(student?.batch?.days && student.batch.days.length > 0 ? student.batch.days : ["Monday", "Wednesday", "Friday"]);
    setMeetingLink(student?.batch?.meetingLink || "");
    setStartDate(format(new Date(), "yyyy-MM-dd"));
    setShowNextCourseModal(true);
  };

  useEffect(() => {
    if (initialOpenAdvance && student && !showNextCourseModal) {
      handleOpenNextCourseModal();
    }
  }, [initialOpenAdvance, student?._id]);

  const advanceLevelMutation = useMutation({
    mutationFn: async ({
      level,
      numberOfClasses,
      teacherId,
      timing,
      days,
      meetingLink,
      startDate,
    }: {
      level: string;
      numberOfClasses: number;
      teacherId?: string;
      timing?: { startTime: string; endTime: string };
      days?: string[];
      meetingLink?: string;
      startDate?: string;
    }) => {
      return api.post(`/students/${studentId}/advance-level`, {
        level,
        numberOfClasses,
        teacherId: teacherId || undefined,
        timing,
        days,
        meetingLink,
        startDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setShowNextCourseModal(false);
      setSelectedLevel("");
      setSelectedTeacher("");
    },
  });

  const getTeacherName = (teacherRef: any) => {
    if (!teacherRef) return "";
    if (typeof teacherRef === "object") {
      return teacherRef.name || teacherRef.user?.name || teacherRef.email || "";
    }
    const matched = allTeachers.find((t: any) => t._id === teacherRef || t.user?._id === teacherRef);
    return matched?.name || matched?.user?.name || "";
  };

  const { data: studentSchedules = [], isLoading: schedsLoading } = useQuery({
    queryKey: ["student-schedules", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const res = await api.get(`/schedules/student/${studentId}`);
      return res.data || [];
    },
    enabled: !!studentId,
  });

  const { data: paymentData } = useQuery({
    queryKey: ["student-payment", studentId],
    queryFn: async () => (await api.get(`/payments/student/${studentId}`)).data,
    enabled: !!studentId,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="w-10 h-10 border-4 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) return null;

  // Calculate attendance if available across completed sessions
  let presentCount = 0;
  const completedSchedules = studentSchedules.filter((s: any) => s.status === "Completed");
  completedSchedules.forEach((cls: any) => {
    if (cls.attendance && Array.isArray(cls.attendance) && cls.attendance.length > 0) {
      const record = cls.attendance.find((a: any) => {
        const id = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
        return id === student._id;
      });
      if (record ? record.isPresent : true) presentCount++;
    } else {
      presentCount++;
    }
  });

  const totalTrackedClasses = Math.max(studentSchedules.length, presentCount, (student.pastBatches?.length || 0) * 15);
  const attendancePercentage = totalTrackedClasses > 0 ? Math.min(100, Math.round((presentCount / totalTrackedClasses) * 100)) : 100;

  // Current batch live progress calculations
  const currentBatchId = student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : '');
  const currentBatchSchedules = studentSchedules.filter((s: any) => {
    const sBId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
    return sBId === currentBatchId;
  });
  const currentCompletedCount = currentBatchSchedules.filter((s: any) => s.status === "Completed").length;
  const currentClassesNeeded = student.classesNeeded || student.batch?.numberOfSessions || 15;
  const currentProgressPct = Math.min(100, currentClassesNeeded > 0 ? Math.round((currentCompletedCount / currentClassesNeeded) * 100) : 0);

  // Progress Ring Configuration
  const ringCircumference = 2 * Math.PI * 36;
  const ringOffset = ringCircumference - (attendancePercentage / 100) * ringCircumference;
  const ringColor = attendancePercentage >= 75 ? "text-emerald-500" : attendancePercentage >= 50 ? "text-amber-500" : "text-red-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8">
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
        className="bg-neutral-900 border border-neutral-800 rounded-2xl sm:rounded-[2rem] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col relative z-10 max-h-[92vh]"
      >
        {/* Dynamic Glass Header */}
        <div className="relative h-14 sm:h-16 shrink-0 overflow-hidden bg-orange-900">
          <div className="absolute inset-0 brand-gradient opacity-70" />
          <div className="absolute top-0 right-0 p-8 w-full h-full" />

          <button onClick={onClose} className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-all backdrop-blur-md hover:scale-110 min-h-[38px] min-w-[38px] flex items-center justify-center">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-8 pb-6 sm:pb-8 pt-0 relative flex-1 overflow-y-auto custom-scrollbar">
          {/* Profile Header (Overlapping) */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center sm:items-end mb-6 sm:mb-8 text-center sm:text-left -mt-8 sm:-mt-10">
            <motion.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", delay: 0.1 }}
              className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl sm:rounded-[2rem] bg-neutral-900 border-4 sm:border-[6px] border-neutral-900 flex items-center justify-center text-3xl sm:text-4xl font-black text-amber-500 shadow-2xl shrink-0 brand-gradient-bg relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
              <span className="relative z-10">{student.name.charAt(0).toUpperCase()}</span>
            </motion.div>

            <div className="flex-1 pb-1 sm:pb-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">{student.name}</h2>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/35 text-amber-300 font-bold text-xs uppercase tracking-wider shadow-sm shadow-amber-500/10">
                  <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                  {currentLevelTag}
                </span>
              </div>
              <p className="text-amber-500/80 mt-1 flex items-center justify-center sm:justify-start gap-2 font-medium text-xs sm:text-sm">
                <BookOpen className="w-4 h-4" /> {student.batch?.name || "Unassigned Batch"}
              </p>
            </div>

            {student.batch && (
              <div className="pb-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold shadow-lg shadow-emerald-500/5">
                  <CheckCircle2 className="w-4 h-4" /> Enrolled
                </div>
                <button
                  onClick={handleOpenNextCourseModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all shadow-sm shadow-emerald-500/10"
                >
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  Move to Next Level
                </button>
              </div>
            )}
          </div>

          {/* Next Course Banner for Completed Batches */}
          {(student.batch?.status === "Completed" || attendancePercentage >= 100) && (
            <div className="bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">Course Level Completed! 🎉</h4>
                  <p className="text-xs text-neutral-300">
                    {student.name} finished <strong>{student.batch.name}</strong> ({student.batch.subject}). Move to the second level to continue learning without duplicating child details.
                  </p>
                </div>
              </div>
              <button
                onClick={handleOpenNextCourseModal}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" /> Move to Next Level
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 sm:gap-6">
            {/* Contact Information Cards (Col Span 3) */}
            <div className="md:col-span-3 space-y-4">
              <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest px-1">
                <User className="w-4 h-4 text-amber-500" />
                <span>Contact Info</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Parent */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-3.5 sm:p-4 border border-neutral-800/50 flex items-center gap-3.5 sm:gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Parent / Guardian</p>
                    <p className="text-sm font-semibold text-white truncate">{student.parentName || "—"}</p>
                  </div>
                </div>

                {/* Mobile */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-3.5 sm:p-4 border border-neutral-800/50 flex items-center gap-3.5 sm:gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Mobile Number</p>
                    <p className="text-sm font-semibold text-white truncate">{student.mobileNumber || "—"}</p>
                  </div>
                </div>

                {/* Email */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-3.5 sm:p-4 border border-neutral-800/50 flex items-center gap-3.5 sm:gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mb-0.5">Email Address</p>
                    <p className="text-sm font-semibold text-white truncate">{student.email || "—"}</p>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="bg-neutral-800/40 hover:bg-neutral-800/80 transition-colors rounded-2xl p-3.5 sm:p-4 border border-neutral-800/50 flex items-center gap-3.5 sm:gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
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
              <div className="bg-neutral-800/40 rounded-2xl p-4 sm:p-5 border border-neutral-800/50 min-h-[160px] flex items-center justify-center relative overflow-hidden">
                {schedsLoading ? (
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                ) : !student.batch ? (
                  <div className="text-center">
                    <GraduationCap className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                    <p className="text-neutral-500 text-xs font-medium">Assign batch to track</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-4 sm:gap-6 w-full max-w-[220px] mx-auto">
                    {/* SVG Progress Ring */}
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
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
                        <span className="text-lg sm:text-xl font-bold text-white">{attendancePercentage}%</span>
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 flex-1 min-w-0">
                      <div>
                        <p className="text-xl sm:text-2xl font-bold text-white leading-none">{presentCount}</p>
                        <p className="text-[10px] uppercase text-neutral-500 font-bold mt-0.5">Attended</p>
                      </div>
                      <div>
                        <p className="text-lg sm:text-xl font-bold text-neutral-400 leading-none">{totalTrackedClasses}</p>
                        <p className="text-[10px] uppercase text-neutral-600 font-bold mt-0.5">Total</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Academic History & Level Progression */}
          <div className="space-y-4 pt-4 mt-6 border-t border-neutral-800/50">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest">
                <History className="w-4 h-4 text-amber-500" />
                <span>Academic History & Course Levels</span>
              </div>
              <span className="text-[11px] text-neutral-500 hidden sm:inline">
                Previous & Ongoing Level Progress
              </span>
            </div>

            <div className="bg-neutral-800/20 rounded-2xl border border-neutral-800/50 overflow-hidden divide-y divide-neutral-800/50">
              {/* Current / Ongoing Level */}
              {student.batch ? (() => {
                const currentTeacherName = 
                  getTeacherName(student.batch?.assignedTeacher) || 
                  getTeacherName(student.assignedTutor) || 
                  "Assigned Tutor";

                return (
                  <div className="p-4 sm:p-5 hover:bg-neutral-800/40 transition-colors relative overflow-hidden group">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-400 rounded-r" />
                    <div className="pl-2 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live · {currentLevelTag}
                          </span>
                          <span className="text-[11px] text-neutral-400 font-medium">Ongoing Level</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                            In Progress
                          </span>
                          <button
                            onClick={handleOpenNextCourseModal}
                            className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                          >
                            <GraduationCap className="w-3.5 h-3.5" /> Move to Next Level
                          </button>
                        </div>
                      </div>

                      <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                        {student.batch.name}
                      </h4>

                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-neutral-300">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Teacher: <strong className="text-white font-semibold">{currentTeacherName}</strong></span>
                        </span>
                        {student.batch.timing?.startTime && (
                          <span className="flex items-center gap-1.5 text-neutral-400">
                            <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>{student.batch.timing.startTime} - {student.batch.timing.endTime}</span>
                          </span>
                        )}
                        {student.batch.days && student.batch.days.length > 0 && (
                          <span className="flex items-center gap-1.5 text-neutral-400">
                            <Calendar className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span>{student.batch.days.join(", ")}</span>
                          </span>
                        )}
                        {student.batch.meetingLink && (
                          <a
                            href={student.batch.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                          >
                            <Video className="w-3.5 h-3.5" /> Class Link
                          </a>
                        )}
                      </div>

                      {/* Live Progress Bar */}
                      <div className="pt-1.5 w-full max-w-lg">
                        <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                          <span className="font-semibold text-emerald-400">Level Progress: {currentProgressPct}%</span>
                          <span>{currentCompletedCount} of {currentClassesNeeded} classes completed</span>
                        </div>
                        <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                            style={{ width: `${currentProgressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Live Level Classes list toggle */}
                      {currentBatchSchedules.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setExpandedLevels(prev => ({ ...prev, current: !prev.current }))}
                            className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 font-medium transition-colors"
                          >
                            {expandedLevels.current ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>{expandedLevels.current ? "Hide" : "View"} Class Schedule & Logs ({currentBatchSchedules.length} Sessions)</span>
                          </button>

                          {expandedLevels.current && (
                            <div className="mt-2.5 space-y-2 border-t border-neutral-800/80 pt-2.5">
                              {currentBatchSchedules.map((cls: any, cIdx: number) => (
                                <div key={cls._id || cIdx} className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs space-y-1.5">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-white flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-neutral-500" />
                                        {safeFormatDate(cls.date, "dd MMM yyyy, EEE", "Session")}
                                      </span>
                                      <span className="text-neutral-400 font-mono text-[11px] flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-neutral-500" />
                                        {cls.startTime} - {cls.endTime}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        cls.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                      }`}>
                                        {cls.status}
                                      </span>
                                    </div>
                                    <span className="text-neutral-400 text-[11px]">
                                      Teacher: <strong className="text-neutral-200">{cls.teacher?.name || cls.replacementTeacher?.name || currentTeacherName}</strong>
                                    </span>
                                  </div>
                                  {(cls.subject || cls.notes) && (
                                    <div className="bg-neutral-950/60 rounded-lg p-2 border border-neutral-800/60 space-y-1">
                                      {cls.subject && (
                                        <div className="flex items-start gap-1.5">
                                          <span className="text-neutral-500 font-semibold shrink-0">Topic Covered:</span>
                                          <span className="text-white font-medium">{cls.subject}</span>
                                        </div>
                                      )}
                                      {cls.notes && (
                                        <div className="flex items-start gap-1.5 text-neutral-400 text-[11px]">
                                          <span className="text-neutral-500 font-semibold shrink-0">Notes:</span>
                                          <span>{cls.notes}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : null}

              {/* Previous Levels */}
              {student.pastBatches && student.pastBatches.length > 0 ? (
                student.pastBatches.slice().reverse().map((pb: any, idx: number) => {
                  const pbKey = pb.batch?._id ? pb.batch._id.toString() : (pb.batch ? pb.batch.toString() : `pb-${idx}`);
                  const pbBatchId = typeof pb.batch === "object" ? pb.batch?._id : pb.batch;
                  const matchedBatch = allBatches.find((b: any) => b._id === pbBatchId);
                  const batchName = pb.batchName || pb.batch?.name || matchedBatch?.name || "Completed Course";
                  const batchSubject = pb.batchSubject || pb.batch?.subject || matchedBatch?.subject || "General";
                  const pbLevel = pb.level || extractLevel(batchName, `Level ${student.pastBatches.length - idx}`);
                  const pbTeacher = pb.teacherName || getTeacherName(pb.teacher) || getTeacherName(matchedBatch?.assignedTeacher) || "Completed Tutor";
                  const pbClasses = pb.numberOfClasses || matchedBatch?.numberOfSessions || 15;

                  // Find all schedules recorded for this past batch
                  const pbSchedules = studentSchedules.filter((s: any) => {
                    const sBId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
                    return (pbBatchId && sBId === pbBatchId) || (pb.batchName && s.batch?.name === pb.batchName);
                  });

                  const isExpanded = !!expandedLevels[pbKey];

                  let completedDateStr = "";
                  if (pb.leftAt) {
                    try {
                      const dateObj = new Date(pb.leftAt);
                      if (!isNaN(dateObj.getTime())) {
                        completedDateStr = format(dateObj, "MMM yyyy");
                      }
                    } catch {
                      completedDateStr = "";
                    }
                  }

                  return (
                    <div key={pbKey} className="p-4 sm:p-5 hover:bg-neutral-800/30 transition-colors relative group">
                      <div className="pl-2 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-bold uppercase tracking-wider">
                              Previous Level · {pbLevel}
                            </span>
                            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </span>
                            {completedDateStr && (
                              <span className="text-[11px] text-neutral-500">
                                Finished in {completedDateStr}
                              </span>
                            )}
                          </div>
                          <span className="px-3 py-1 rounded-xl bg-neutral-800 text-neutral-400 border border-neutral-700 text-xs font-bold uppercase tracking-wider self-start sm:self-auto">
                            Completed Level
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-neutral-300 group-hover:text-white transition-colors truncate">
                          {batchName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-neutral-400">
                          <span className="flex items-center gap-1.5 text-neutral-300">
                            <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span>Taught by: <strong className="text-white font-medium">{pbTeacher}</strong></span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                            <span>{pbClasses} Classes Completed</span>
                          </span>
                          <span className="text-neutral-500">Subject: {batchSubject}</span>
                        </div>

                        {/* Completed Progress Bar */}
                        <div className="pt-1.5 w-full max-w-lg">
                          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
                            <span className="font-semibold text-emerald-400">100% Completed</span>
                            <span>{pbClasses} of {pbClasses} classes completed</span>
                          </div>
                          <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-full" />
                          </div>
                        </div>

                        {/* Expandable Previous Classes Record */}
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedLevels(prev => ({ ...prev, [pbKey]: !prev[pbKey] }))}
                            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 font-semibold transition-colors bg-neutral-800/60 hover:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-700/60"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>{isExpanded ? "Hide" : "View"} Completed Classes Record ({pbSchedules.length > 0 ? pbSchedules.length : pbClasses} Classes)</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t border-neutral-800/80 pt-3">
                              {pbSchedules.length > 0 ? (
                                pbSchedules.map((cls: any, cIdx: number) => (
                                  <div
                                    key={cls._id || cIdx}
                                    className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs space-y-1.5 hover:border-neutral-700 transition-colors"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                                          Class {pbSchedules.length - cIdx}
                                        </span>
                                        <span className="font-bold text-white flex items-center gap-1">
                                          <Calendar className="w-3 h-3 text-neutral-500" />
                                          {safeFormatDate(cls.date, "dd MMM yyyy, EEE", "Completed Session")}
                                        </span>
                                        <span className="text-neutral-400 font-mono text-[11px] flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-neutral-500" />
                                          {cls.startTime && cls.endTime ? `${cls.startTime} - ${cls.endTime}` : "Completed Class"}
                                        </span>
                                      </div>
                                      <span className="text-neutral-400 text-[11px]">
                                        Taught by: <strong className="text-neutral-200">{cls.teacher?.name || cls.replacementTeacher?.name || pbTeacher}</strong>
                                      </span>
                                    </div>

                                    {/* Topic covered & notes */}
                                    <div className="bg-neutral-950/60 rounded-lg p-2.5 border border-neutral-800/60 space-y-1">
                                      <div className="flex items-start gap-1.5">
                                        <span className="text-emerald-400 font-semibold shrink-0">Topic Covered:</span>
                                        <span className="text-white font-medium">{cls.subject || "Topic Covered / Curriculum Session"}</span>
                                      </div>
                                      {cls.notes && (
                                        <div className="flex items-start gap-1.5 text-neutral-300 text-[11px] pt-0.5">
                                          <span className="text-neutral-500 font-semibold shrink-0">Notes / Remarks:</span>
                                          <span>{cls.notes}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="p-3.5 bg-neutral-900/40 rounded-xl border border-neutral-800 text-xs text-neutral-400 space-y-1">
                                  <p className="font-semibold text-neutral-300">
                                    ✨ {pbClasses} Sessions Completed under {pbTeacher}
                                  </p>
                                  <p className="text-[11px] text-neutral-500">
                                    All session records, attendance, and coursework for {pbLevel} were successfully completed and archived.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : null}

              {!student.batch && (!student.pastBatches || student.pastBatches.length === 0) ? (
                <div className="p-6 sm:p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center mb-3">
                    <History className="w-5 h-5 text-neutral-600" />
                  </div>
                  <p className="text-sm font-medium text-neutral-400">No academic history recorded yet</p>
                  <p className="text-xs text-neutral-600 mt-1">Assign a batch to begin tracking course levels and progress.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Fees & Payment Summary Section */}
          <div className="space-y-4 pt-4 mt-6 border-t border-neutral-800/50">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-neutral-400 font-semibold text-sm uppercase tracking-widest">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <span>Fees & Payment Summary</span>
              </div>
              {paymentData?.hasPayment && paymentData.payment.remainingAmount > 0 && (
                <button
                  onClick={() => setShowRecordPaymentModal(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Record Payment
                </button>
              )}
            </div>

            {paymentData?.hasPayment ? (
              <div className="bg-neutral-800/20 rounded-2xl border border-neutral-800/50 p-4 sm:p-5 space-y-4">
                {/* Status & Key Stats */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/60">
                  <div>
                    <span className="text-[10px] text-neutral-500 uppercase font-bold block">Payment Status</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border inline-flex items-center gap-1.5 ${
                        paymentData.payment.paymentStatus === "Paid"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : paymentData.payment.paymentStatus === "Due" || paymentData.payment.paymentStatus === "Overdue"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          paymentData.payment.paymentStatus === "Paid" ? "bg-emerald-400" : paymentData.payment.paymentStatus === "Due" ? "bg-red-400" : "bg-amber-400"
                        }`} />
                        {paymentData.payment.paymentStatus === "Due" ? "🔴 Payment Due" : paymentData.payment.paymentStatus === "Paid" ? "🟢 Paid" : paymentData.payment.paymentStatus === "Upcoming" ? "🟡 Upcoming Reminder" : `🔵 ${paymentData.payment.paymentStatus}`}
                      </span>
                      <span className="text-xs text-neutral-400 font-medium">({paymentData.payment.paymentType})</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-neutral-500 uppercase font-bold block">Outstanding Balance</span>
                    <span className={`text-base sm:text-lg font-black block mt-0.5 ${paymentData.payment.remainingAmount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                      ₹{Number(paymentData.payment.remainingAmount).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* 4 Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Total Fee</span>
                    <span className="text-white font-bold text-sm mt-0.5 block">
                      ₹{Number(paymentData.payment.totalFee).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Amount Paid</span>
                    <span className="text-emerald-400 font-bold text-sm mt-0.5 block">
                      ₹{Number(paymentData.payment.amountPaid).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Classes Completed</span>
                    <span className="text-white font-bold text-sm mt-0.5 block">
                      {paymentData.payment.completedClasses} / {paymentData.payment.assignedClasses}
                    </span>
                  </div>
                  <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Due After</span>
                    <span className="text-amber-400 font-bold text-sm mt-0.5 block">
                      {paymentData.payment.dueAfterClasses} Classes
                    </span>
                  </div>
                </div>

                {/* Due Progress Bar */}
                <div className="p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800/80 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-300 font-semibold">
                      Class Due Trigger Progress:
                    </span>
                    <span className="text-amber-400 font-bold">
                      {paymentData.payment.completedClasses >= paymentData.payment.dueAfterClasses
                        ? "Trigger Met (Payment Due)"
                        : `${paymentData.payment.dueAfterClasses - paymentData.payment.completedClasses} classes remaining until due`}
                    </span>
                  </div>
                  <div className="relative w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((paymentData.payment.completedClasses / paymentData.payment.assignedClasses) * 100)
                        )}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1.5 bg-amber-400 z-10"
                      style={{
                        left: `${Math.min(
                          100,
                          Math.round((paymentData.payment.dueAfterClasses / paymentData.payment.assignedClasses) * 100)
                        )}%`,
                      }}
                      title={`Due trigger at ${paymentData.payment.dueAfterClasses} classes`}
                    />
                  </div>
                </div>

                {/* Payment History Accordion */}
                {paymentData.payment.paymentHistory && paymentData.payment.paymentHistory.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-neutral-800/60">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                      Payment History ({paymentData.payment.paymentHistory.length})
                    </span>
                    <div className="space-y-2">
                      {paymentData.payment.paymentHistory.map((tx: any, idx: number) => (
                        <div
                          key={tx.id || idx}
                          className="p-3 bg-neutral-900/60 border border-neutral-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">Payment #{paymentData.payment.paymentHistory.length - idx}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
                                {tx.paymentType || "Payment"}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 mt-0.5">
                              {tx.paymentDate ? format(new Date(tx.paymentDate), "dd MMM yyyy") : "-"} · {tx.paymentMethod} {tx.transactionId ? `· Ref: ${tx.transactionId}` : ""}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="font-extrabold text-sm text-emerald-400">
                              ₹{Number(tx.amount).toLocaleString("en-IN")}
                            </span>
                            <span className="text-[11px] text-neutral-500 block">
                              Balance: ₹{Number(tx.remainingBalance || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-neutral-800/20 rounded-2xl border border-neutral-800/50 p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center mx-auto text-neutral-500">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">No payment record found</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Admission fee has not been recorded yet for this student.
                  </p>
                </div>
                <button
                  onClick={() => setShowAdmissionPaymentModal(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Collect Admission Fee
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Record Payment Modal */}
        {showRecordPaymentModal && paymentData?.payment && (
          <RecordPaymentModal
            isOpen={true}
            onClose={() => setShowRecordPaymentModal(false)}
            payment={paymentData.payment}
          />
        )}

        {/* Admission Payment Modal */}
        {showAdmissionPaymentModal && (
          <AdmissionPaymentModal
            isOpen={true}
            onClose={() => setShowAdmissionPaymentModal(false)}
            studentId={student._id}
            batchId={student.batch?._id}
            studentName={student.name}
            courseName={student.batch?.subject || student.batch?.name || "General"}
            initialFee={15000}
            initialSessions={student.batch?.numberOfSessions || 15}
          />
        )}

        {/* Move to Next Level Dialog */}
        {showNextCourseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-emerald-500/40 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Move to Next Level</h3>
                    <p className="text-xs text-neutral-400">Promote student into their next level</p>
                  </div>
                </div>
                <button onClick={() => setShowNextCourseModal(false)} className="text-neutral-500 hover:text-white p-1 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Student & Progression Info */}
              <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Student:</span>
                  <span className="text-white font-semibold">{student.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-neutral-800/80 pt-2">
                  <span className="text-neutral-400">Progression:</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[11px] font-bold">{currentLevelTag}</span>
                    <span className="text-emerald-400 text-xs">➔</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                      {selectedLevel || getNextLevelSuggestion()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Level */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Target Level</span>
                  <span className="text-[10px] text-emerald-400 font-medium">Select or Type</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={selectedLevel}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    placeholder="e.g. Level 2"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-semibold"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedLevel(lvl)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                        (selectedLevel || getNextLevelSuggestion()) === lvl
                          ? "bg-emerald-500 text-black border-emerald-400 font-bold shadow-sm"
                          : "bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-white"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Who is Teaching? */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Who is Teaching? (Teacher / Tutor)</span>
                  <span className="text-[10px] text-emerald-400 font-medium">Assigned Teacher</span>
                </label>
                <select
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-all"
                >
                  <option value="">Keep current teacher or select new...</option>
                  {allTeachers.map((t: any) => (
                    <option key={t._id} value={t._id}>
                      {t.name} {t.specialization ? `(${t.specialization})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Class Timings */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Class Timings</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">Start & End</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">Start Time</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">End Time</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Days of the Week */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Days of Week</span>
                  </span>
                  <span className="text-[10px] text-neutral-400 font-normal">
                    {selectedDays.length} day{selectedDays.length !== 1 ? "s" : ""} selected
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDays(selectedDays.filter((d) => d !== day));
                          } else {
                            setSelectedDays([...selectedDays, day]);
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-emerald-500 text-black border-emerald-400 font-bold shadow-sm"
                            : "bg-neutral-800/80 text-neutral-400 border-neutral-700 hover:text-white"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Classroom / Meeting Link */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Meeting / Classroom Link</span>
                  </span>
                  <span className="text-[10px] text-neutral-400 font-normal">Optional</span>
                </label>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/xyz-abc or Zoom link"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono placeholder:text-neutral-500"
                />
              </div>

              {/* Number of Classes Needed & Start Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    <span>Number of Classes</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={numberOfClasses}
                    onChange={(e) => setNumberOfClasses(e.target.value)}
                    placeholder="e.g. 15"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-semibold mb-1.5"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[8, 12, 15, 20, 24, 30].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setNumberOfClasses(String(num))}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                          Number(numberOfClasses) === num
                            ? "bg-emerald-500 text-black border-emerald-400 font-bold"
                            : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    <span>Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1.5">Auto-generates schedules on selected days</p>
                </div>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-[11px] text-emerald-300 leading-relaxed">
                ✨ <strong>Zero duplication:</strong> The student continues under their existing profile. A new live progress bar is created for{" "}
                <span className="font-bold underline">{selectedLevel || getNextLevelSuggestion()}</span>, and previous classes remain archived in Academic History.
              </div>

              <div className="flex gap-3 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowNextCourseModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const finalLevel = selectedLevel || getNextLevelSuggestion();
                    advanceLevelMutation.mutate({
                      level: finalLevel,
                      numberOfClasses: Math.max(1, Number(numberOfClasses) || 15),
                      teacherId: selectedTeacher || undefined,
                      timing: {
                        startTime: startTime || "09:00",
                        endTime: endTime || "10:00",
                      },
                      days: selectedDays.length > 0 ? selectedDays : ["Monday", "Wednesday", "Friday"],
                      meetingLink: meetingLink || undefined,
                      startDate: startDate || format(new Date(), "yyyy-MM-dd"),
                    });
                  }}
                  disabled={advanceLevelMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {advanceLevelMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Move to Next Level
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default StudentDetailsModal;
