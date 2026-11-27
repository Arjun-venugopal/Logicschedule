"use client";
import React from "react";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import {
  X, User, Users, UserX, Loader2, Phone, BookOpen, Mail, CheckCircle2,
  History, MessageCircle, GraduationCap, Plus, CreditCard, AlertCircle, Clock,
  Receipt, Calendar, Video, ChevronDown, ChevronUp, Sparkles, Sliders,
  BarChart3, Zap, Play, RefreshCw, FileText, ArrowRight, Laptop, Code2, Gamepad2,
  PauseCircle, RotateCcw, Edit2
} from "lucide-react";
import { format } from "date-fns";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { AdmissionPaymentModal } from "@/components/payments/AdmissionPaymentModal";
import { ProjectSubmissionsSection } from "./ProjectSubmissionsSection";
import { SuccessToast } from "@/components/common/SuccessToast";
import { extractLevel, formatTime12h, computeEndTime, getSafeDateOnly } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";

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
  const [nextLevelTimeMode, setNextLevelTimeMode] = useState<"same" | "different">("same");
  const [nextLevelDayTimings, setNextLevelDayTimings] = useState<Record<string, { startTime: string; endTime: string }>>({});
  const [meetingLink, setMeetingLink] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({ current: true });
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showAdmissionPaymentModal, setShowAdmissionPaymentModal] = useState(false);

  // Next Level Payment State
  const [recordNextLevelPayment, setRecordNextLevelPayment] = useState(true);
  const [nextLevelTotalFee, setNextLevelTotalFee] = useState<number>(15000);
  const [nextLevelAmountPaid, setNextLevelAmountPaid] = useState<number>(15000);
  const [nextLevelPaymentType, setNextLevelPaymentType] = useState<"Full Payment" | "Half Payment" | "Custom Payment" | "Pending">("Full Payment");
  const [nextLevelPaymentMethod, setNextLevelPaymentMethod] = useState<string>("Bank Transfer");
  const [nextLevelPaymentDate, setNextLevelPaymentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [nextLevelPaymentNotes, setNextLevelPaymentNotes] = useState<string>("");

  // Extra Class State
  const [showScheduleExtraClassModal, setShowScheduleExtraClassModal] = useState(false);
  const [extraClassDate, setExtraClassDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [extraClassStartTime, setExtraClassStartTime] = useState("09:00");
  const [extraClassEndTime, setExtraClassEndTime] = useState("10:00");
  const [extraClassSubject, setExtraClassSubject] = useState("");
  const [extraClassReason, setExtraClassReason] = useState("");
  const [extraClassTeacher, setExtraClassTeacher] = useState("");
  const [extraClassMeetingLink, setExtraClassMeetingLink] = useState("");
  const [extraClassError, setExtraClassError] = useState("");
  const [togglingScheduleId, setTogglingScheduleId] = useState<string | null>(null);
  const [showReassignTeacherModal, setShowReassignTeacherModal] = useState(false);
  const [reassignTeacherId, setReassignTeacherId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignError, setReassignError] = useState("");
  const [expandedScheduleRowId, setExpandedScheduleRowId] = useState<string | null>(null);

  // Class Progress Correction State
  const [showEditProgressModal, setShowEditProgressModal] = useState(false);
  const [progressTotalSessions, setProgressTotalSessions] = useState<number>(25);
  const [progressCompletedSessions, setProgressCompletedSessions] = useState<number>(0);
  const [progressNextSessionNumber, setProgressNextSessionNumber] = useState<number>(1);
  const [progressNextClassDate, setProgressNextClassDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [progressNextClassStartTime, setProgressNextClassStartTime] = useState<string>("09:00");
  const [progressNextClassEndTime, setProgressNextClassEndTime] = useState<string>("10:00");
  const [progressError, setProgressError] = useState<string>("");
  const [successToastMessage, setSuccessToastMessage] = useState<string | null>(null);
  const { isDark } = useTheme();
  const { isTeacher, isAdmin, isSalesPerson, canRead } = usePermissions();
  const canViewPayments = !isTeacher && (isAdmin || isSalesPerson || canRead("payments") || canRead("demoSessions"));
  const [activeTab, setActiveTab] = useState<"overview" | "progress" | "attendance" | "activity">("overview");
  const [showChangeBatchModal, setShowChangeBatchModal] = useState(false);
  const [changeBatchId, setChangeBatchId] = useState("");
  const [changeBatchError, setChangeBatchError] = useState("");

  // Pause & Restart Classes State
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseDateInput, setPauseDateInput] = useState(format(new Date(), "yyyy-MM-dd"));
  const [pauseReasonInput, setPauseReasonInput] = useState("");
  const [pauseError, setPauseError] = useState("");

  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartModalMode, setRestartModalMode] = useState<"restart" | "edit">("restart");
  const [editingRestartEntryId, setEditingRestartEntryId] = useState<string | null>(null);
  const [restartDateInput, setRestartDateInput] = useState(format(new Date(), "yyyy-MM-dd"));
  const [restartDaysInput, setRestartDaysInput] = useState<string[]>(["Monday", "Wednesday", "Friday"]);
  const [restartDayTimings, setRestartDayTimings] = useState<Record<string, { startTime: string; endTime: string }>>({
    Monday: { startTime: "09:00", endTime: "10:00" },
    Wednesday: { startTime: "09:00", endTime: "10:00" },
    Friday: { startTime: "09:00", endTime: "10:00" },
  });
  const [restartDurationMinutes, setRestartDurationMinutes] = useState<number>(60);
  const [restartTeacherId, setRestartTeacherId] = useState("");
  const [restartError, setRestartError] = useState("");
  const [expandedArchiveIds, setExpandedArchiveIds] = useState<Record<string, boolean>>({});
  const [expandedRestartEdits, setExpandedRestartEdits] = useState<Record<string, boolean>>({});

  const { data: student, isLoading, isError, error } = useQuery({
    queryKey: ["student", studentId],
    queryFn: async () => (await api.get(`/students/${studentId}`)).data,
    enabled: !!studentId,
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

    const b = student?.batch;
    const baseStart = b?.timing?.startTime || "09:00";
    const baseEnd = b?.timing?.endTime || computeEndTime(baseStart, b?.durationMinutes || 60);
    const initialDays: string[] = b?.days && b.days.length > 0 ? b.days : ["Monday", "Wednesday", "Friday"];
    const orderedInitialDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].filter((d) =>
      initialDays.includes(d)
    );
    const finalDays = orderedInitialDays.length > 0 ? orderedInitialDays : ["Monday", "Wednesday", "Friday"];
    const existingDT = (b?.dayTimings && typeof b.dayTimings === "object" && Object.keys(b.dayTimings).length > 0)
      ? b.dayTimings
      : (student?.restartDetails?.dayTimings && typeof student.restartDetails.dayTimings === "object" ? student.restartDetails.dayTimings : {});

    const populatedDT: Record<string, { startTime: string; endTime: string }> = {};
    finalDays.forEach((day) => {
      const entry = existingDT[day] || existingDT[day.toLowerCase()];
      const dStart = entry?.startTime || baseStart;
      const dEnd = entry?.endTime || (entry?.startTime ? computeEndTime(entry.startTime, b?.durationMinutes || 60) : baseEnd);
      populatedDT[day] = { startTime: dStart, endTime: dEnd };
    });

    const distinctTimes = new Set(finalDays.map((d) => `${populatedDT[d].startTime}-${populatedDT[d].endTime}`));
    const inferredMode: "same" | "different" =
      b?.timeMode === "different" || distinctTimes.size > 1 ? "different" : "same";

    setStartTime(baseStart);
    setEndTime(baseEnd);
    setSelectedDays(finalDays);
    setNextLevelDayTimings(populatedDT);
    setNextLevelTimeMode(inferredMode);
    setMeetingLink(b?.meetingLink || "");
    setStartDate(format(new Date(), "yyyy-MM-dd"));

    // Pre-populate next level payment details from previous payment or defaults
    const prevFee = paymentData?.payment?.totalFee || 15000;
    setNextLevelTotalFee(prevFee);
    setNextLevelAmountPaid(prevFee);
    setNextLevelPaymentType("Full Payment");
    setNextLevelPaymentMethod("Bank Transfer");
    setNextLevelPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setNextLevelPaymentNotes("");
    setRecordNextLevelPayment(true);

    setShowNextCourseModal(true);
  };

  useEffect(() => {
    if (initialOpenAdvance && student && !showNextCourseModal) {
      handleOpenNextCourseModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenAdvance, student?._id]);

  const advanceLevelMutation = useMutation({
    mutationFn: async ({
      level,
      numberOfClasses,
      teacherId,
      timing,
      timeMode,
      dayTimings,
      days,
      meetingLink,
      startDate,
      paymentDetails,
    }: {
      level: string;
      numberOfClasses: number;
      teacherId?: string | null;
      timing?: { startTime: string; endTime: string };
      timeMode?: "same" | "different";
      dayTimings?: Record<string, { startTime: string; endTime: string }>;
      days?: string[];
      meetingLink?: string;
      startDate?: string;
      paymentDetails?: any;
    }) => {
      return api.post(`/students/${studentId}/advance-level`, {
        level,
        numberOfClasses,
        teacherId: teacherId === null ? null : (teacherId || undefined),
        timing,
        timeMode,
        dayTimings,
        days,
        meetingLink,
        startDate,
        paymentDetails,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-payment", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["demo-session-payment"] });
      setShowNextCourseModal(false);
      setSelectedLevel("");
      setSelectedTeacher("");
    },
  });

  const toggleExtraClassMutation = useMutation({
    mutationFn: async ({
      scheduleId,
      isExtraClass,
      extraClassReason,
    }: {
      scheduleId: string;
      isExtraClass: boolean;
      extraClassReason?: string;
    }) => {
      return api.put(`/schedules/${scheduleId}`, {
        isExtraClass,
        extraClassReason: extraClassReason !== undefined ? extraClassReason : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-today-schedules"] });
      setTogglingScheduleId(null);
    },
    onError: (err: any) => {
      setTogglingScheduleId(null);
      alert(err.response?.data?.message || "Failed to update extra class status");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: "Active" | "Dropped") =>
      api.put(`/students/${studentId}`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-timings"] });
    },
  });

  const invalidateRestartQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["student", studentId] });
    queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
    queryClient.invalidateQueries({ queryKey: ["students-all"] });
    queryClient.invalidateQueries({ queryKey: ["schedules"] });
    queryClient.invalidateQueries({ queryKey: ["batches"] });
    queryClient.invalidateQueries({ queryKey: ["batch-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["all-completed-schedules"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["teacher-timings"] });
    queryClient.invalidateQueries({ queryKey: ["teacher-today-schedules"] });
  };

  const pauseClassesMutation = useMutation({
    mutationFn: (payload: { pauseDate: string; reason: string }) =>
      api.post(`/students/${studentId}/pause-classes`, payload),
    onSuccess: () => {
      invalidateRestartQueries();
      setShowPauseModal(false);
      setPauseError("");
      setSuccessToastMessage("Student classes paused and previous schedules archived.");
    },
    onError: (err: any) => {
      setPauseError(err.response?.data?.message || "Failed to pause student classes.");
    },
  });

  const restartClassesMutation = useMutation({
    mutationFn: (payload: {
      restartDate: string;
      days: string[];
      dayTimings: Record<string, { startTime: string; endTime: string }>;
      timing: { startTime: string; endTime: string };
      durationMinutes: number;
      teacherId?: string | null;
    }) => api.post(`/students/${studentId}/restart-classes`, payload),
    onSuccess: (res: any) => {
      invalidateRestartQueries();
      setShowRestartModal(false);
      setRestartError("");
      setSuccessToastMessage(res?.data?.message || "Classes restarted successfully!");
    },
    onError: (err: any) => {
      setRestartError(err.response?.data?.message || "Failed to restart classes.");
    },
  });

  const updateRestartDetailsMutation = useMutation({
    mutationFn: (payload: {
      restartDate: string;
      days: string[];
      dayTimings: Record<string, { startTime: string; endTime: string }>;
      timing: { startTime: string; endTime: string };
      durationMinutes: number;
      teacherId?: string | null;
      historyEntryId?: string | null;
    }) => api.put(`/students/${studentId}/restart-classes`, payload),
    onSuccess: (res: any) => {
      invalidateRestartQueries();
      setShowRestartModal(false);
      setRestartError("");
      setSuccessToastMessage(res?.data?.message || "Restart schedule details updated!");
    },
    onError: (err: any) => {
      setRestartError(err.response?.data?.message || "Failed to update restart schedule.");
    },
  });

  const scheduleExtraClassMutation = useMutation({
    mutationFn: async (payload: {
      teacher: string;
      batch: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      subject?: string;
      meetingLink?: string;
      isExtraClass: boolean;
      extraClassReason?: string;
    }) => {
      return api.post("/schedules", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-today-schedules"] });
      setShowScheduleExtraClassModal(false);
      setExtraClassSubject("");
      setExtraClassReason("");
      setExtraClassError("");
    },
    onError: (err: any) => {
      setExtraClassError(err.response?.data?.message || "Failed to schedule extra class");
    },
  });

  const reassignTeacherMutation = useMutation({
    mutationFn: async ({ teacherId, reason }: { teacherId: string; reason?: string }) => {
      return (await api.put(`/students/${studentId}`, { assignedTutor: teacherId, reassignReason: reason })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-timings"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-today-schedules"] });
      setShowReassignTeacherModal(false);
      setReassignReason("");
      setReassignError("");
    },
    onError: (err: any) => {
      setReassignError(err.response?.data?.message || "Failed to reassign teacher");
    },
  });

  const correctProgressMutation = useMutation({
    mutationFn: async (payload: {
      totalSessions: number;
      completedSessions: number;
      nextSessionNumber: number;
      nextClassDate: string;
      nextClassStartTime: string;
      nextClassEndTime: string;
    }) => {
      return (await api.post(`/students/${studentId}/correct-progress`, payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      setShowEditProgressModal(false);
      setSuccessToastMessage("Class progress and schedule updated successfully!");
    },
    onError: (err: any) => {
      setProgressError(err.response?.data?.message || err.message || "Failed to update class progress");
    },
  });

  const changeBatchMutation = useMutation({
    mutationFn: async (newBatchId: string) => {
      return (await api.put(`/students/${studentId}`, { batch: newBatchId })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setShowChangeBatchModal(false);
      setChangeBatchError("");
      setSuccessToastMessage("Batch updated successfully!");
    },
    onError: (err: any) => {
      setChangeBatchError(err.response?.data?.message || err.message || "Failed to change batch");
    },
  });

  const handleOpenReassignModal = () => {
    const currentTId =
      (typeof student?.assignedTutor === "string" ? student?.assignedTutor : student?.assignedTutor?._id) ||
      student?.batch?.assignedTeacher?._id ||
      (typeof student?.batch?.assignedTeacher === "string" ? student?.batch?.assignedTeacher : "") || "";
    setReassignTeacherId(currentTId);
    setReassignReason("");
    setReassignError("");
    setShowReassignTeacherModal(true);
  };

  const handleOpenScheduleExtraClass = () => {
    setExtraClassDate(format(new Date(), "yyyy-MM-dd"));
    setExtraClassStartTime(student?.batch?.timing?.startTime || "09:00");
    setExtraClassEndTime(student?.batch?.timing?.endTime || "10:00");
    setExtraClassSubject(`${student?.batch?.subject || student?.name || "Student"} - Extra Class`);
    setExtraClassReason("");
    setExtraClassMeetingLink(student?.batch?.meetingLink || "");
    const currentTeacherId = student?.batch?.assignedTeacher?._id ||
      (typeof student?.batch?.assignedTeacher === 'string' ? student?.batch?.assignedTeacher : '') ||
      (typeof student?.assignedTutor === 'string' ? student?.assignedTutor : student?.assignedTutor?._id) || '';
    setExtraClassTeacher(currentTeacherId);
    setExtraClassError("");
    setShowScheduleExtraClassModal(true);
  };

  const handleSubmitExtraClass = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setExtraClassError("");

    const targetBatchId = student?.batch?._id ? student.batch._id.toString() : (student?.batch ? student.batch.toString() : "");
    if (!targetBatchId) {
      setExtraClassError("Student does not have an active batch assigned. Please assign a batch first.");
      return;
    }

    if (!extraClassDate) {
      setExtraClassError("Please select a valid date for the extra class.");
      return;
    }

    if (!extraClassStartTime || !extraClassEndTime) {
      setExtraClassError("Please specify start and end times.");
      return;
    }

    const teacherToUse = extraClassTeacher ||
      student?.batch?.assignedTeacher?._id ||
      (typeof student?.batch?.assignedTeacher === 'string' ? student?.batch?.assignedTeacher : '') ||
      (typeof student?.assignedTutor === 'string' ? student?.assignedTutor : student?.assignedTutor?._id) ||
      (allTeachers.length > 0 ? allTeachers[0]._id : "");

    if (!teacherToUse) {
      setExtraClassError("Please select a teacher for this extra class.");
      return;
    }

    scheduleExtraClassMutation.mutate({
      teacher: teacherToUse,
      batch: targetBatchId,
      date: extraClassDate,
      startTime: extraClassStartTime,
      endTime: extraClassEndTime,
      status: "Scheduled",
      subject: extraClassSubject || `${student?.batch?.subject || "Curriculum"} - Extra Class`,
      meetingLink: extraClassMeetingLink || student?.batch?.meetingLink || "",
      isExtraClass: true,
      extraClassReason: extraClassReason || "Extra session for student",
    });
  };

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
    enabled: !!studentId && canViewPayments,
  });

  // Active & historical Completed schedules (excludes uncompleted Archived/Paused slots from active views,
  // while keeping all conducted Completed records visible in Attendance, Overview & Course Progress logs)
  const activeStudentSchedules = useMemo(
    () =>
      (studentSchedules || []).filter(
        (s: any) =>
          s.status === "Completed" ||
          (!s.isArchived && s.status !== "Archived" && s.status !== "Paused")
      ),
    [studentSchedules]
  );

  const monthlyAttendanceData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const byMonth = new Map<string, { label: string; sortKey: string; total: number; attended: number }>();

    activeStudentSchedules.forEach((s: any) => {
      if (!s.date) return;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return;
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = monthNames[m];

      if (!byMonth.has(key)) {
        byMonth.set(key, { label, sortKey: key, total: 0, attended: 0 });
      }
      const bucket = byMonth.get(key)!;
      if (s.status === "Completed" || s.status === "Scheduled") {
        bucket.total++;
        if (s.status === "Completed") {
          if (Array.isArray(s.attendance) && s.attendance.length > 0 && student?._id) {
            const rec = s.attendance.find((a: any) => {
              const id = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
              return id === student._id;
            });
            if (!rec || rec.isPresent !== false) bucket.attended++;
          } else {
            bucket.attended++;
          }
        }
      }
    });

    const sorted = Array.from(byMonth.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey)).slice(-4);
    if (sorted.length === 0) {
      const now = new Date();
      const fallback = [];
      for (let i = 3; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        fallback.push({ label: monthNames[d.getMonth()], pct: 0, total: 0, attended: 0 });
      }
      return fallback;
    }
    return sorted.map((b) => ({
      label: b.label,
      pct: b.total > 0 ? Math.round((b.attended / b.total) * 100) : 0,
      total: b.total,
      attended: b.attended,
    }));
  }, [activeStudentSchedules, student?._id]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <div className="w-10 h-10 border-4 border-neutral-800 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !student) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Unable to Load Student</h3>
            <p className="text-xs text-neutral-400 mt-1">
              {(error as any)?.response?.data?.message || "Could not fetch student details. Please try again."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const currentTeacherName =
    getTeacherName(student?.assignedTutor) ||
    getTeacherName(student?.batch?.assignedTeacher) ||
    "Assigned Tutor";

  // Calculate attendance across completed sessions (never counting Cancelled or Paused/Archived uncompleted sessions)
  let presentCount = 0;
  const completedSchedules = activeStudentSchedules.filter((s: any) => s.status === "Completed");
  completedSchedules.forEach((cls: any) => {
    if (cls.attendance && Array.isArray(cls.attendance) && cls.attendance.length > 0) {
      const record = cls.attendance.find((a: any) => {
        const id = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
        return id === student._id;
      });
      if (!record || record.isPresent !== false) presentCount++;
    } else {
      presentCount++;
    }
  });

  const totalTrackedClasses = Math.max(activeStudentSchedules.length, presentCount, (student.pastBatches?.length || 0) * 15);
  const attendancePercentage = totalTrackedClasses > 0 ? Math.min(100, Math.round((presentCount / totalTrackedClasses) * 100)) : 100;

  // Current batch live progress calculations (keeps all historical Completed records + active Upcoming schedules for the current level)
  const currentBatchId = student.batch?._id ? student.batch._id.toString() : (student.batch ? student.batch.toString() : '');
  const pastBatchIdSet = new Set(
    (student.pastBatches || [])
      .map((pb: any) => (typeof pb.batch === "object" ? pb.batch?._id : pb.batch)?.toString())
      .filter(Boolean)
  );
  const sameLevelPrevBatchIds = new Set<string>();
  const restartedFromId =
    (typeof student.batch?.restartedFromBatch === "object"
      ? student.batch?.restartedFromBatch?._id
      : student.batch?.restartedFromBatch)?.toString() || "";
  if (restartedFromId && !pastBatchIdSet.has(restartedFromId)) {
    sameLevelPrevBatchIds.add(restartedFromId);
  }
  (student.restartHistory || []).forEach((rh: any) => {
    const prevId = rh.previousBatchId?.toString();
    if (prevId && prevId !== currentBatchId && !pastBatchIdSet.has(prevId)) {
      sameLevelPrevBatchIds.add(prevId);
    }
  });

  const currentBatchAllSchedules = (studentSchedules || []).filter((s: any) => {
    const sBId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
    if (sBId === currentBatchId) return true;
    if (s.status === "Completed" && sameLevelPrevBatchIds.has(sBId)) {
      if (Array.isArray(s.attendance) && s.attendance.length > 0) {
        const rec = s.attendance.find((a: any) => (a.studentId?._id || a.studentId || '').toString() === student._id);
        return !rec || rec.isPresent !== false;
      }
      return true;
    }
    return false;
  });
  const currentBatchSchedules = currentBatchAllSchedules.filter(
    (s: any) => s.status === "Completed" || (!s.isArchived && s.status !== "Archived" && s.status !== "Paused")
  );
  const isCompletedForStudent = (s: any) => {
    if (s.status !== "Completed") return false;
    if (Array.isArray(s.attendance) && s.attendance.length > 0) {
      const rec = s.attendance.find((a: any) => (a.studentId?._id || a.studentId || '').toString() === student._id);
      if (rec && rec.isPresent === false) return false;
    }
    return true;
  };
  const completedInCurrentBatch = currentBatchAllSchedules.filter(isCompletedForStudent).length;
  const completedInLatestBatchOnly = currentBatchAllSchedules.filter((s: any) => {
    const sBId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : '');
    return sBId === currentBatchId && isCompletedForStudent(s);
  }).length;
  const currentCompletedCount = Math.max(
    completedInCurrentBatch,
    Number(student.batch?.preCompletedClasses) || 0,
    student.batch?.restartedFromBatch
      ? (Number(student.batch?.preRestartCompletedClasses) || 0) + completedInLatestBatchOnly
      : 0
  );
  const currentClassesNeeded = student.classesNeeded || student.batch?.numberOfSessions || 15;
  const currentRemainingCount = Math.max(0, currentClassesNeeded - currentCompletedCount);
  const currentProgressPct = Math.min(100, currentClassesNeeded > 0 ? Math.round((currentCompletedCount / currentClassesNeeded) * 100) : 0);
  const currentExtraClassCount = currentBatchSchedules.filter((s: any) => s.isExtraClass).length;

  // Already-marked records across current level schedules (including same-level pre-restart batches & archived marked rows)
  const { alreadyMarkedRecords, markedCompletedListCount, verifiedPreCompletedGap } = (() => {
    const recordMap = new Map<string, any>();
    const addMarkedCandidate = (s: any, sourceLabel?: string) => {
      const idKey = (s._id || s.scheduleId || `${s.date || ""}_${s.startTime || ""}_${s.sessionNumber || ""}`).toString();
      const status = s.status || "Scheduled";
      const rec = Array.isArray(s.attendance)
        ? s.attendance.find((a: any) => (a.studentId?._id || a.studentId || "").toString() === student._id)
        : null;
      const isMarkedPresent = rec && rec.isPresent === true;
      const isExplicitAbsentInCompleted = status === "Completed" && rec && rec.isPresent === false;
      const isMarked =
        status === "Completed" ||
        status === "Cancelled" ||
        status === "Rescheduled" ||
        isMarkedPresent;
      if (!isMarked || recordMap.has(idKey)) return;
      recordMap.set(idKey, {
        ...s,
        _id: idKey,
        _markedAttendance: rec ? (rec.isPresent ? "Present" : "Absent") : (status === "Completed" ? "Present" : status === "Cancelled" ? "Absent" : "Marked"),
        _isExplicitAbsent: isExplicitAbsentInCompleted,
        _countsAsCompleted: status === "Completed" && !isExplicitAbsentInCompleted,
        _sourceLabel: sourceLabel || "",
      });
    };

    (studentSchedules || []).forEach((s: any) => {
      const sBId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : "");
      if (sBId === currentBatchId || sameLevelPrevBatchIds.has(sBId)) {
        addMarkedCandidate(s, sBId !== currentBatchId ? "Prior Level Batch" : "");
      }
    });

    (student.restartHistory || []).forEach((rh: any) => {
      const prevBId = rh.previousBatchId?.toString();
      if (prevBId && pastBatchIdSet.has(prevBId)) return;
      if (Array.isArray(rh.archivedSchedules)) {
        rh.archivedSchedules.forEach((ar: any) => {
          if (ar.status === "Completed" || ar.status === "Cancelled" || ar.status === "Rescheduled") {
            addMarkedCandidate(ar, "Archived History");
          }
        });
      }
    });

    const sortedList = Array.from(recordMap.values()).sort((a: any, b: any) => {
      const tA = a.date ? new Date(a.date).getTime() : 0;
      const tB = b.date ? new Date(b.date).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return (Number(a.sessionNumber) || 0) - (Number(b.sessionNumber) || 0);
    });
    const completedRows = sortedList.filter((r: any) => r._countsAsCompleted).length;
    return {
      alreadyMarkedRecords: sortedList,
      markedCompletedListCount: completedRows,
      verifiedPreCompletedGap: Math.max(0, currentCompletedCount - completedRows),
    };
  })();

  // Progress Ring Configuration
  const ringCircumference = 2 * Math.PI * 36;
  const ringOffset = ringCircumference - (attendancePercentage / 100) * ringCircumference;
  const ringColor = attendancePercentage >= 75 ? "text-emerald-500" : attendancePercentage >= 50 ? "text-amber-500" : "text-red-500";
  const courseRingOffset = ringCircumference - (currentProgressPct / 100) * ringCircumference;

  const isOneToOneBatch = student.batch
    ? ((student.batch.name || "").includes("1:1") || (student.batch.studentsCount !== undefined && student.batch.studentsCount <= 1))
    : true;
  const batchNumberMatch = student.batch?.name?.match(/\b(\d+)\b/)?.[1];
  const batchDisplayLabel = student.batch
    ? (batchNumberMatch ? `Batch #${batchNumberMatch}` : student.batch.name)
    : "Unassigned";

  // Recent Activity rows for Overview table (active schedule only; Completed first / newest first)
  const recentActivityRows = (() => {
    const completed = [...activeStudentSchedules]
      .filter((s: any) => s.status === "Completed")
      .sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const others = [...activeStudentSchedules]
      .filter((s: any) => s.status !== "Completed")
      .sort((a: any, b: any) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    return [...completed, ...others].slice(0, 4);
  })();

  const WEEKDAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const inferDurationMins = (start?: string, end?: string, explicitDur?: any): number => {
    const dur = Number(explicitDur);
    if (!isNaN(dur) && dur >= 15 && dur <= 360) return Math.round(dur);
    if (start && end) {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      if (!isNaN(sh) && !isNaN(eh)) {
        let diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
        if (diff <= 0) diff += 24 * 60;
        if (diff >= 15 && diff <= 360) return diff;
      }
    }
    return 60;
  };

  const savedRestartSummary = (() => {
    const histList = Array.isArray(student?.restartHistory) ? student.restartHistory : [];
    const latestRestartedEntry = [...histList]
      .reverse()
      .find((rh: any) => rh.status === "Restarted" || rh.restartDate);
    const rd = student?.restartDetails;
    const b = student?.batch;
    if (!rd && !latestRestartedEntry && !student?.lastRestartDate && !b?.isRestarted && !b?.lastRestartDate) {
      return null;
    }

    const rDays: string[] =
      (Array.isArray(rd?.days) && rd.days.length > 0 && rd.days) ||
      (Array.isArray(latestRestartedEntry?.newSchedule?.days) && latestRestartedEntry.newSchedule.days.length > 0 && latestRestartedEntry.newSchedule.days) ||
      (Array.isArray(b?.days) && b.days.length > 0 && b.days) ||
      [];
    const sortedDays = WEEKDAY_ORDER.filter((d) => rDays.includes(d));
    const finalDays = sortedDays.length > 0 ? sortedDays : rDays;

    const fallbackStart =
      rd?.timing?.startTime ||
      latestRestartedEntry?.newSchedule?.timing?.startTime ||
      b?.timing?.startTime ||
      "09:00";
    const fallbackEnd =
      rd?.timing?.endTime ||
      latestRestartedEntry?.newSchedule?.timing?.endTime ||
      b?.timing?.endTime ||
      "10:00";
    const durationMins = inferDurationMins(
      fallbackStart,
      fallbackEnd,
      rd?.durationMinutes ?? latestRestartedEntry?.newSchedule?.durationMinutes ?? b?.durationMinutes
    );

    const rawDayTimings =
      (rd?.dayTimings && typeof rd.dayTimings === "object" && Object.keys(rd.dayTimings).length > 0 && rd.dayTimings) ||
      (latestRestartedEntry?.newSchedule?.dayTimings && typeof latestRestartedEntry.newSchedule.dayTimings === "object" && Object.keys(latestRestartedEntry.newSchedule.dayTimings).length > 0 && latestRestartedEntry.newSchedule.dayTimings) ||
      (b?.dayTimings && typeof b.dayTimings === "object" ? b.dayTimings : {});

    const dayTimingsMap: Record<string, { startTime: string; endTime: string }> = {};
    finalDays.forEach((day) => {
      const entry = rawDayTimings[day] || rawDayTimings[day.toLowerCase()];
      const sTime = entry?.startTime || fallbackStart;
      dayTimingsMap[day] = {
        startTime: sTime,
        endTime: computeEndTime(sTime, durationMins),
      };
    });

    const currentTeacherId =
      (typeof student?.assignedTutor === "string" ? student.assignedTutor : student?.assignedTutor?._id) ||
      b?.assignedTeacher?._id ||
      (typeof b?.assignedTeacher === "string" ? b.assignedTeacher : "") ||
      rd?.teacherId ||
      latestRestartedEntry?.newTeacherId ||
      "";
    const displayTeacher =
      getTeacherName(student?.assignedTutor) ||
      getTeacherName(b?.assignedTeacher) ||
      rd?.teacherName ||
      latestRestartedEntry?.newTeacherName ||
      "Tutor is Unassigned";

    return {
      historyEntryId: rd?.historyEntryId || latestRestartedEntry?.id || null,
      restartDate: rd?.restartDate || latestRestartedEntry?.restartDate || student?.lastRestartDate || b?.lastRestartDate || b?.startDate || null,
      days: finalDays,
      dayTimings: dayTimingsMap,
      durationMinutes: durationMins,
      teacherId: currentTeacherId,
      teacherName: displayTeacher,
      previousScheduleStatus:
        rd?.previousScheduleStatus ||
        latestRestartedEntry?.previousScheduleStatus ||
        (latestRestartedEntry?.archivedSchedules?.length ? "Archived" : "Preserved"),
      restartStatus: student?.status === "Paused" ? "Paused" : (rd?.restartStatus || "Active"),
      editHistory: Array.isArray(latestRestartedEntry?.editHistory) ? latestRestartedEntry.editHistory : [],
    };
  })();

  const handleOpenPauseModal = () => {
    setPauseDateInput(format(new Date(), "yyyy-MM-dd"));
    setPauseReasonInput("");
    setPauseError("");
    setShowPauseModal(true);
  };

  const openRestartModalWithConfig = (mode: "restart" | "edit") => {
    const b = student?.batch;
    const source = savedRestartSummary || null;
    const initialDate =
      mode === "edit" && source?.restartDate
        ? (getSafeDateOnly(source.restartDate) || format(new Date(), "yyyy-MM-dd"))
        : (mode === "edit" && b?.startDate ? getSafeDateOnly(b.startDate) : format(new Date(), "yyyy-MM-dd"));

    const rawDays: string[] = source?.days?.length
      ? source.days
      : (Array.isArray(b?.days) && b.days.length > 0 ? b.days : ["Monday", "Wednesday", "Friday"]);
    const initialDays = WEEKDAY_ORDER.filter((d) => rawDays.includes(d));
    const finalDays = initialDays.length > 0 ? initialDays : ["Monday", "Wednesday", "Friday"];

    const dur = source?.durationMinutes || inferDurationMins(b?.timing?.startTime, b?.timing?.endTime, b?.durationMinutes);
    const existingDT = source?.dayTimings || (b?.dayTimings && typeof b.dayTimings === "object" ? b.dayTimings : {});
    const fallbackStart = b?.timing?.startTime || "09:00";

    const nextDayTimings: Record<string, { startTime: string; endTime: string }> = {};
    finalDays.forEach((day) => {
      const entry = existingDT[day] || existingDT[day.toLowerCase()];
      const sTime = entry?.startTime || fallbackStart;
      nextDayTimings[day] = {
        startTime: sTime,
        endTime: computeEndTime(sTime, dur),
      };
    });

    const tId =
      source?.teacherId ||
      b?.assignedTeacher?._id ||
      (typeof b?.assignedTeacher === "string" ? b.assignedTeacher : "") ||
      (typeof student?.assignedTutor === "string" ? student.assignedTutor : student?.assignedTutor?._id) ||
      "__unassigned__";

    setRestartModalMode(mode);
    setEditingRestartEntryId(mode === "edit" ? (source?.historyEntryId || null) : null);
    setRestartDateInput(initialDate);
    setRestartDaysInput(finalDays);
    setRestartDayTimings(nextDayTimings);
    setRestartDurationMinutes(dur);
    setRestartTeacherId(tId || "__unassigned__");
    setRestartError("");
    setShowRestartModal(true);
  };

  const handleOpenRestartModal = () => openRestartModalWithConfig("restart");
  const handleOpenEditRestartModal = () => openRestartModalWithConfig("edit");

  const latestPauseOrRestartEntry =
    Array.isArray(student?.restartHistory) && student.restartHistory.length > 0
      ? student.restartHistory[student.restartHistory.length - 1]
      : null;

  const renderRestartDetailsCard = (context: "overview" | "progress") => {
    const b = student?.batch;
    const isPausedState = student?.status === "Paused" || Boolean(student?.isPaused);
    const hasRestartRecord = Boolean(savedRestartSummary);

    // Only visible if the student class is paused or restarted
    if (!hasRestartRecord && !isPausedState) {
      return null;
    }

    const displayDays: string[] = hasRestartRecord
      ? savedRestartSummary!.days
      : WEEKDAY_ORDER.filter((d) =>
          (Array.isArray(b?.days) && b.days.length > 0
            ? b.days
            : Array.isArray(latestPauseOrRestartEntry?.previousSchedule?.days)
            ? latestPauseOrRestartEntry.previousSchedule.days
            : []
          ).includes(d)
        );
    const baseStart = b?.timing?.startTime || latestPauseOrRestartEntry?.previousSchedule?.timing?.startTime || "09:00";
    const baseEnd = b?.timing?.endTime || latestPauseOrRestartEntry?.previousSchedule?.timing?.endTime || "10:00";
    const displayDuration = hasRestartRecord
      ? savedRestartSummary!.durationMinutes
      : inferDurationMins(baseStart, baseEnd, b?.durationMinutes);
    const rawDisplayDT = hasRestartRecord
      ? savedRestartSummary!.dayTimings
      : (b?.dayTimings && typeof b.dayTimings === "object"
          ? b.dayTimings
          : latestPauseOrRestartEntry?.previousSchedule?.dayTimings || {});
    const displayTeacher = hasRestartRecord
      ? savedRestartSummary!.teacherName
      : (getTeacherName(student?.assignedTutor) ||
          getTeacherName(b?.assignedTeacher) ||
          latestPauseOrRestartEntry?.previousTeacherName ||
          "Tutor is Unassigned");
    const statusLabel = hasRestartRecord
      ? savedRestartSummary!.restartStatus
      : isPausedState
      ? "Paused"
      : "Not Restarted";

    return (
      <div
        className={`rounded-2xl border p-4 sm:p-5 space-y-3.5 ${
          isDark
            ? isPausedState
              ? "bg-neutral-800/30 border-amber-500/30"
              : "bg-neutral-800/30 border-emerald-500/25"
            : isPausedState
            ? "bg-[#FFFFFF] border-[#FDE68A]"
            : "bg-[#FFFFFF] border-[#A7F3D0]"
        }`}
        style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
              style={
                isPausedState
                  ? isDark
                    ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)" }
                    : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                  : isDark
                  ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)" }
                  : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
              }
            >
              {isPausedState ? (
                <PauseCircle className="w-4 h-4" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
              ) : (
                <RotateCcw className="w-4 h-4" style={{ color: isDark ? "#34D399" : "#047857" }} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                  Restart Details
                </h3>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  style={
                    statusLabel === "Paused"
                      ? isDark
                        ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                        : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                      : statusLabel === "Active"
                      ? isDark
                        ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                      : isDark
                      ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#D4D4D4" }
                      : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                  }
                >
                  {statusLabel}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                  style={
                    isDark
                      ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#6EE7B7" }
                      : { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", color: "#15803D" }
                  }
                >
                  {currentCompletedCount}/{currentClassesNeeded} Marked Complete ({currentRemainingCount} Left)
                </span>
              </div>
              <p className="text-[11px]" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                {hasRestartRecord
                  ? "Active continuation schedule, per-day timings & preserved records"
                  : isPausedState
                  ? "Student classes are paused — review marked progress and restart when ready"
                  : "Current schedule & continuation settings (preserved marked records stay intact on restart)"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hasRestartRecord && savedRestartSummary!.editHistory.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setExpandedRestartEdits((prev) => ({
                    ...prev,
                    [context]: !prev[context],
                  }))
                }
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                  isDark
                    ? "bg-neutral-900/70 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                    : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                }`}
              >
                <History className="w-3 h-3" />
                <span>Edits ({savedRestartSummary!.editHistory.length})</span>
              </button>
            )}
            {hasRestartRecord && (
              <button
                type="button"
                onClick={handleOpenEditRestartModal}
                className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                style={
                  isDark
                    ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.35)", color: "#34D399" }
                    : { backgroundColor: "#ECFDF5", borderColor: "#6EE7B7", color: "#047857" }
                }
              >
                <Edit2 className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                <span>Edit</span>
              </button>
            )}
            {student.status !== "Dropped" && (
              <button
                type="button"
                onClick={handleOpenRestartModal}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: "#10B981", color: "#FFFFFF" }}
              >
                <RotateCcw className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />
                <span style={{ color: "#FFFFFF" }}>{hasRestartRecord ? "New Restart" : "Restart Classes"}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
          <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/60 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>
              {hasRestartRecord ? "Restart Date" : isPausedState ? "Pause Date" : "Schedule Start"}
            </span>
            <span className="font-bold mt-0.5 block" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
              {hasRestartRecord
                ? safeFormatDate(savedRestartSummary!.restartDate, "dd MMM yyyy", "—")
                : isPausedState
                ? safeFormatDate(student.pauseDate || latestPauseOrRestartEntry?.pauseDate, "dd MMM yyyy", "—")
                : safeFormatDate(b?.startDate, "dd MMM yyyy", "—")}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/60 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Class Duration</span>
            <span className="font-bold mt-0.5 block" style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
              {displayDuration} mins
            </span>
          </div>
          <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/60 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Teacher</span>
            <span className="font-bold mt-0.5 block truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }} title={displayTeacher}>
              {displayTeacher}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/60 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>
              {hasRestartRecord ? "Previous Schedule" : "Marked Records"}
            </span>
            <span className="font-bold mt-0.5 block" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
              {hasRestartRecord
                ? savedRestartSummary!.previousScheduleStatus
                : `${alreadyMarkedRecords.length} session(s)`}
            </span>
          </div>
          <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/60 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Restart Status</span>
            <span
              className="font-bold mt-0.5 block"
              style={{
                color: statusLabel === "Paused"
                  ? (isDark ? "#FBBF24" : "#B45309")
                  : statusLabel === "Active"
                  ? (isDark ? "#34D399" : "#047857")
                  : (isDark ? "#D4D4D4" : "#4B5563"),
              }}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {isPausedState && (student.pauseReason || latestPauseOrRestartEntry?.reason) && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs ${
              isDark ? "bg-neutral-900/50 border-neutral-800" : "bg-[#FFF7E6] border-[#FDE68A]"
            }`}
          >
            <strong style={{ color: isDark ? "#FBBF24" : "#B45309" }}>Reason for Pausing:</strong>{" "}
            <span style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
              {student.pauseReason || latestPauseOrRestartEntry?.reason}
            </span>
          </div>
        )}

        {/* Class Days & Independent Start Times */}
        {displayDays.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-semibold tracking-wider block" style={{ color: "#6B7280" }}>
              {hasRestartRecord ? "New Class Days" : "Class Days"} &amp; Individual Start Times ({displayDays.length} days)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {displayDays.map((day) => {
                const slot = rawDisplayDT[day] || rawDisplayDT[day.toLowerCase()];
                const sTime = slot?.startTime || baseStart;
                return (
                  <div
                    key={day}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                      isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"
                    }`}
                  >
                    <span className="font-bold" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{day}</span>
                    <span className="font-mono text-[11px] font-semibold" style={{ color: isDark ? "#34D399" : "#047857" }}>
                      {formatTime12h(sTime)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasRestartRecord && expandedRestartEdits[context] && savedRestartSummary!.editHistory.length > 0 && (
          <div className={`pt-2.5 border-t space-y-2 ${isDark ? "border-neutral-800" : "border-[#E5E7EB]"}`}>
            <span className="text-[10px] uppercase font-bold block" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
              Restart Edit History
            </span>
            <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
              {savedRestartSummary!.editHistory.slice().reverse().map((ed: any, eIdx: number) => (
                <div
                  key={ed.id || eIdx}
                  className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                    isDark ? "bg-neutral-900/70 border-neutral-800 text-neutral-300" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                      Edited by {ed.editedByName || "Admin"}
                    </span>
                    <span className="font-mono text-[10px]" style={{ color: "#6B7280" }}>
                      {safeFormatDate(ed.editedAt, "dd MMM yyyy, HH:mm", "")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                    <span>
                      Restart: <strong>{safeFormatDate(ed.newValues?.restartDate, "dd MMM yyyy", "—")}</strong>
                    </span>
                    <span>
                      Duration: <strong>{ed.newValues?.durationMinutes || 60}m</strong>
                    </span>
                    <span>
                      Teacher: <strong>{ed.newValues?.teacherName || "Unassigned"}</strong>
                    </span>
                    <span>
                      Days: <strong>{Array.isArray(ed.newValues?.days) ? ed.newValues.days.map((d: string) => `${d.slice(0, 3)} ${formatTime12h(ed.newValues?.dayTimings?.[d]?.startTime || ed.newValues?.timing?.startTime)}`).join(", ") : "—"}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleToggleRestartDay = (day: string) => {
    setRestartDaysInput((prev) => {
      const exists = prev.includes(day);
      if (exists) {
        return prev.filter((d) => d !== day);
      }
      const next = WEEKDAY_ORDER.filter((d) => d === day || prev.includes(d));
      setRestartDayTimings((prevTimings) => {
        if (prevTimings[day]?.startTime) return prevTimings;
        const lastDay = prev[prev.length - 1];
        const fallbackStart = (lastDay && prevTimings[lastDay]?.startTime) || student?.batch?.timing?.startTime || "09:00";
        return {
          ...prevTimings,
          [day]: {
            startTime: fallbackStart,
            endTime: computeEndTime(fallbackStart, restartDurationMinutes),
          },
        };
      });
      return next;
    });
  };

  const handleChangeRestartDayStart = (day: string, newStartTime: string) => {
    setRestartDayTimings((prev) => ({
      ...prev,
      [day]: {
        startTime: newStartTime,
        endTime: computeEndTime(newStartTime, restartDurationMinutes),
      },
    }));
  };

  const handleChangeRestartDuration = (newDuration: number) => {
    const safeDur = Math.max(15, Math.min(360, Math.round(newDuration || 60)));
    setRestartDurationMinutes(safeDur);
    setRestartDayTimings((prev) => {
      const updated: Record<string, { startTime: string; endTime: string }> = { ...prev };
      Object.keys(updated).forEach((day) => {
        const sTime = updated[day]?.startTime || "09:00";
        updated[day] = {
          startTime: sTime,
          endTime: computeEndTime(sTime, safeDur),
        };
      });
      return updated;
    });
  };

  const handleSubmitRestartModal = () => {
    setRestartError("");
    if (!restartDateInput) {
      setRestartError("Please select a restart date.");
      return;
    }
    if (restartDaysInput.length === 0) {
      setRestartError("Please select at least one class day.");
      return;
    }
    const dayTimingsPayload: Record<string, { startTime: string; endTime: string }> = {};
    for (const day of restartDaysInput) {
      const sTime = restartDayTimings[day]?.startTime;
      if (!sTime) {
        setRestartError(`Please set a start time for ${day}.`);
        return;
      }
      dayTimingsPayload[day] = {
        startTime: sTime,
        endTime: computeEndTime(sTime, restartDurationMinutes),
      };
    }
    const firstDay = restartDaysInput[0];
    const payload = {
      restartDate: restartDateInput,
      days: restartDaysInput,
      dayTimings: dayTimingsPayload,
      timing: dayTimingsPayload[firstDay],
      durationMinutes: restartDurationMinutes,
      teacherId: restartTeacherId === "__unassigned__" ? null : (restartTeacherId || null),
    };

    if (restartModalMode === "edit") {
      updateRestartDetailsMutation.mutate({
        ...payload,
        historyEntryId: editingRestartEntryId,
      });
    } else {
      restartClassesMutation.mutate(payload);
    }
  };

  const handleOpenChangeBatchModal = () => {
    setChangeBatchId(currentBatchId || "");
    setChangeBatchError("");
    setShowChangeBatchModal(true);
  };

  const handleOpenEditProgressModal = () => {
    setProgressError("");
    const total = currentClassesNeeded || 25;
    const completed = currentCompletedCount || 0;
    const nextNum = completed + 1;
    setProgressTotalSessions(total);
    setProgressCompletedSessions(completed);
    setProgressNextSessionNumber(nextNum);

    // Find next upcoming scheduled class on or after today
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const upcomingSched = currentBatchSchedules.find((s: any) => {
      if (s.status !== "Scheduled" || !s.date) return false;
      const dStr = format(new Date(s.date), "yyyy-MM-dd");
      return dStr >= todayStr;
    });

    if (upcomingSched && upcomingSched.date) {
      setProgressNextClassDate(format(new Date(upcomingSched.date), "yyyy-MM-dd"));
      setProgressNextClassStartTime(upcomingSched.startTime || student?.batch?.timing?.startTime || "09:00");
      setProgressNextClassEndTime(upcomingSched.endTime || student?.batch?.timing?.endTime || "10:00");
    } else {
      setProgressNextClassDate(todayStr);
      setProgressNextClassStartTime(student?.batch?.timing?.startTime || "09:00");
      setProgressNextClassEndTime(student?.batch?.timing?.endTime || "10:00");
    }

    setShowEditProgressModal(true);
  };

  const handleCompletedSessionsChange = (val: number) => {
    const clamped = Math.max(0, val);
    setProgressCompletedSessions(clamped);
    setProgressNextSessionNumber(clamped + 1);
  };

  const handleSubmitProgressCorrection = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setProgressError("");
    if (!progressTotalSessions || progressTotalSessions < 1) {
      setProgressError("Total course sessions must be at least 1.");
      return;
    }
    if (!progressNextClassDate) {
      setProgressError("Please select the next class date.");
      return;
    }
    if (!progressNextClassStartTime) {
      setProgressError("Please select the next class start time.");
      return;
    }

    correctProgressMutation.mutate({
      totalSessions: Number(progressTotalSessions),
      completedSessions: Number(progressCompletedSessions),
      nextSessionNumber: Number(progressNextSessionNumber),
      nextClassDate: progressNextClassDate,
      nextClassStartTime: progressNextClassStartTime,
      nextClassEndTime: progressNextClassEndTime || "10:00",
    });
  };

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
        className={`rounded-2xl sm:rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative z-10 max-h-[92vh] border ${
          isDark
            ? "bg-neutral-900 border-neutral-800"
            : "bg-[#FFFFFF] border-[#E5E7EB]"
        }`}
        style={!isDark ? { boxShadow: "0 20px 50px rgba(23, 23, 23, 0.12)" } : undefined}
      >
        {/* Left Profile Sidebar Panel (Adapts to Dark & White Theme) */}
        <div
          className={`w-full md:w-[268px] lg:w-[285px] shrink-0 flex flex-col justify-between p-5 sm:p-6 relative overflow-hidden border-b md:border-b-0 md:border-r ${
            isDark
              ? "bg-[#121212] border-[#292929]"
              : "bg-[#F9FAFB] border-[#E5E7EB]"
          }`}
        >
          <div>
            {/* Brand Header */}
            <div className="flex items-center gap-2.5 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logicbox-logo.png"
                alt="LogicBox"
                className={`w-9 h-9 rounded-xl object-contain shrink-0 p-0.5 ${
                  isDark ? "bg-white/10" : "bg-[#FFFFFF] border border-[#E5E7EB]"
                }`}
              />
              <div>
                <h3
                  className="text-lg font-extrabold tracking-tight leading-none"
                  style={{ color: isDark ? "#FFFFFF" : "#171717" }}
                >
                  LogicBox
                </h3>
                <p
                  className="text-[10px] font-semibold mt-0.5"
                  style={{ color: isDark ? "#FBBF24" : "#B45309" }}
                >
                  Start Young, Dream Big.
                </p>
              </div>
            </div>

            {/* Avatar & Name */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="relative mb-3.5">
                <div
                  className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 flex items-center justify-center shadow-sm overflow-hidden ${
                    isDark ? "border-[#292929] bg-neutral-800" : "bg-[#FFF7E6]"
                  }`}
                  style={!isDark ? { borderColor: "#FDE68A" } : undefined}
                >
                  {/* Friendly Student Avatar Illustration */}
                  <svg viewBox="0 0 120 120" className="w-full h-full">
                    <circle cx="60" cy="60" r="60" fill={isDark ? "#1F2937" : "#FFF7E6"} />
                    {/* Shoulders / Hoodie */}
                    <path d="M24 120 C24 92 40 84 60 84 C80 84 96 92 96 120 Z" fill="#F59E0B" />
                    <path d="M44 86 L60 100 L76 86" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Neck */}
                    <rect x="52" y="72" width="16" height="16" rx="6" fill="#FCD5B5" />
                    {/* Face */}
                    <circle cx="60" cy="54" r="24" fill="#FCD5B5" />
                    {/* Hair */}
                    <path d="M35 50 C35 28 85 28 85 50 C82 38 72 34 60 36 C48 34 38 38 35 50 Z" fill="#451A03" />
                    <path d="M40 38 C48 26 74 26 80 40 C70 32 50 32 40 38 Z" fill="#5C2607" />
                    {/* Eyes & Smile */}
                    <circle cx="51" cy="53" r="2.8" fill="#1E293B" />
                    <circle cx="69" cy="53" r="2.8" fill="#1E293B" />
                    <circle cx="52" cy="52" r="0.9" fill="#FFFFFF" />
                    <circle cx="70" cy="52" r="0.9" fill="#FFFFFF" />
                    <circle cx="44" cy="60" r="3" fill="#FDA4AF" opacity="0.6" />
                    <circle cx="76" cy="60" r="3" fill="#FDA4AF" opacity="0.6" />
                    <path d="M52 63 Q60 70 68 63" fill="none" stroke="#9A3412" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </div>
                <span
                  className="absolute bottom-1 right-1.5 w-5 h-5 rounded-full border-[3px]"
                  style={{
                    borderColor: isDark ? "#121212" : "#F9FAFB",
                    backgroundColor:
                      student.status === "Dropped"
                        ? "#EF4444"
                        : student.status === "Paused"
                        ? "#F59E0B"
                        : "#10B981",
                  }}
                  title={
                    student.status === "Dropped"
                      ? "Dropped"
                      : student.status === "Paused"
                      ? "Paused"
                      : "Active"
                  }
                />
              </div>

              <h2
                className="text-lg sm:text-xl font-bold tracking-tight"
                style={{ color: isDark ? "#FFFFFF" : "#171717" }}
              >
                {student.name || "Student"}
              </h2>

              <div
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                style={
                  isDark
                    ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                    : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                }
              >
                <Code2 className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                <span style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
                  {currentLevelTag}
                  {student.batch?.subject ? ` – ${student.batch.subject}` : ""}
                </span>
              </div>
            </div>

            {/* Contact Info List */}
            <div
              className="space-y-3.5 pt-4 border-t text-xs"
              style={{ borderColor: isDark ? "#292929" : "#E5E7EB" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border"
                  style={
                    isDark
                      ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                      : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                  }
                >
                  <User className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium" style={{ color: isDark ? "#A3A3A3" : "#6B7280" }}>
                    Parent / Guardian
                  </p>
                  <p className="text-xs font-semibold truncate mt-0.5" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                    {student.parentName || "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border"
                  style={
                    isDark
                      ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                      : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                  }
                >
                  <Phone className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium" style={{ color: isDark ? "#A3A3A3" : "#6B7280" }}>
                    Mobile Number
                  </p>
                  <p className="text-xs font-semibold truncate mt-0.5" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                    {student.mobileNumber || student.phone || "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border"
                  style={
                    isDark
                      ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                      : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                  }
                >
                  <Mail className="w-3.5 h-3.5" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium" style={{ color: isDark ? "#A3A3A3" : "#6B7280" }}>
                    Email Address
                  </p>
                  <p className="text-xs font-semibold break-all mt-0.5" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                    {student.email || "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border"
                  style={
                    isDark
                      ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)" }
                      : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
                  }
                >
                  <MessageCircle className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium" style={{ color: isDark ? "#A3A3A3" : "#6B7280" }}>
                    WhatsApp
                  </p>
                  <p className="text-xs font-semibold truncate mt-0.5" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                    {student.whatsappNumber || "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Decorative Coding Accent & Status Toggle */}
          <div
            className="hidden md:flex items-center justify-between pt-5 mt-5 border-t"
            style={{ borderColor: isDark ? "#292929" : "#E5E7EB" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-9 h-9 rounded-xl border flex items-center justify-center"
                style={
                  isDark
                    ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                    : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                }
              >
                <Laptop className="w-4 h-4" style={{ color: isDark ? "#FBBF24" : "#D97706" }} />
              </div>
              <div
                className="w-8 h-8 rounded-xl border flex items-center justify-center"
                style={
                  isDark
                    ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                    : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                }
              >
                <Code2 className="w-3.5 h-3.5" style={{ color: isDark ? "#C084FC" : "#7E22CE" }} />
              </div>
              <div
                className="w-8 h-8 rounded-xl border flex items-center justify-center"
                style={
                  isDark
                    ? { backgroundColor: "#1F1F1F", borderColor: "#292929" }
                    : { backgroundColor: "#FFFFFF", borderColor: "#E5E7EB" }
                }
              >
                <Gamepad2 className="w-3.5 h-3.5" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (student.status === "Dropped") {
                  updateStatusMutation.mutate("Active");
                } else if (confirm("Change student status to Dropped? This removes them from upcoming schedules while preserving history.")) {
                  updateStatusMutation.mutate("Dropped");
                }
              }}
              disabled={updateStatusMutation.isPending}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-opacity hover:opacity-90 cursor-pointer"
              style={
                student.status === "Dropped"
                  ? isDark
                    ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.4)", color: "#34D399" }
                    : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                  : isDark
                  ? { backgroundColor: "rgba(244, 63, 94, 0.1)", borderColor: "rgba(244, 63, 94, 0.3)", color: "#FB7185" }
                  : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
              }
            >
              {updateStatusMutation.isPending
                ? "Updating..."
                : student.status === "Dropped"
                ? "Activate"
                : "Mark Dropped"}
            </button>
          </div>
        </div>

        {/* Right Main Content Panel */}
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isDark ? "bg-neutral-900" : "bg-[#F5F6F8]"}`}>
          {/* Top Navigation Tabs + Close */}
          <div className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isDark ? "bg-neutral-900 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
          }`}>
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
              {[
                { id: "overview" as const, label: "Overview", icon: BarChart3 },
                { id: "progress" as const, label: "Course Progress", icon: BookOpen },
                { id: "attendance" as const, label: "Attendance", icon: Calendar },
                { id: "activity" as const, label: "Activity", icon: Zap },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? "brand-gradient text-black shadow-sm"
                        : isDark
                        ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        : "hover:bg-[#E5E7EB]"
                    }`}
                    style={
                      isActive
                        ? { color: "#171717" }
                        : !isDark
                        ? { backgroundColor: "#F3F4F6", color: "#4B5563" }
                        : undefined
                    }
                  >
                    <Icon
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: isActive ? "#171717" : isDark ? "#D4D4D4" : "#4B5563" }}
                    />
                    <span style={{ color: isActive ? "#171717" : isDark ? "#D4D4D4" : "#4B5563" }}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-full transition-colors shrink-0 ${
                isDark ? "text-neutral-400 hover:text-white hover:bg-neutral-800" : "text-[#4B5563] hover:text-[#171717] hover:bg-[#F3F4F6]"
              }`}
              aria-label="Close student details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 custom-scrollbar space-y-4 sm:space-y-5">
            {activeTab === "overview" && (
              <>
                {/* Top Summary Banner Card */}
                <div
                  className={`rounded-2xl p-4 sm:px-6 border grid grid-cols-1 sm:grid-cols-3 gap-4 items-center ${
                    isDark ? "bg-[#1A1A1A] border-[#292929]" : "bg-[#FFFFFF] border-[#E5E7EB]"
                  }`}
                  style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                >
                  {/* Status Column */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor:
                          student.status === "Dropped"
                            ? "#EF4444"
                            : student.status === "Paused"
                            ? "#F59E0B"
                            : "#10B981",
                      }}
                    >
                      {student.status === "Dropped" ? (
                        <UserX className="w-5 h-5" style={{ color: "#FFFFFF" }} />
                      ) : student.status === "Paused" ? (
                        <PauseCircle className="w-5 h-5" style={{ color: "#FFFFFF" }} />
                      ) : (
                        <CheckCircle2 className="w-5 h-5" style={{ color: "#FFFFFF" }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                        {student.status === "Dropped"
                          ? "Dropped Student"
                          : student.status === "Paused"
                          ? "Classes Paused"
                          : "Active Student"}
                      </p>
                      <p className="text-xs truncate" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                        {student.status === "Paused" && student.pauseDate
                          ? `Since ${safeFormatDate(student.pauseDate, "dd MMM yyyy", "")}`
                          : "Enrolled in LogicBox"}
                      </p>
                    </div>
                  </div>

                  {/* Level Column */}
                  <div className={`flex items-center gap-3 sm:border-l sm:pl-5 ${isDark ? "sm:border-[#292929]" : "sm:border-[#E5E7EB]"}`}>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                      style={
                        isDark
                          ? { backgroundColor: "#242424", borderColor: "#292929" }
                          : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                      }
                    >
                      <GraduationCap className="w-5 h-5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                        {currentLevelTag}
                      </p>
                      <p className="text-xs truncate" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                        {student.batch?.subject || "General"}
                      </p>
                    </div>
                  </div>

                  {/* Batch Column */}
                  <div className={`flex items-center gap-3 sm:border-l sm:pl-5 ${isDark ? "sm:border-[#292929]" : "sm:border-[#E5E7EB]"}`}>
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                      style={
                        isDark
                          ? { backgroundColor: "#242424", borderColor: "#292929" }
                          : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" }
                      }
                    >
                      <Calendar className="w-5 h-5" style={{ color: isDark ? "#FBBF24" : "#1F2937" }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                        {batchDisplayLabel}
                      </p>
                      <p className="text-xs truncate" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                        {student.batch?.status || "Ongoing"}
                        {student.batch?.isRetention ? " · Retention" : ""}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Restart Details & Schedule Continuation Card (Always visible in Student Details) */}
                {renderRestartDetailsCard("overview")}

                {/* Middle Cards Row: Course Progress & Attendance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Course Progress Card */}
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                      isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                    }`}
                    style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                        <h3 className="text-sm sm:text-base font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                          Course Progress
                        </h3>
                      </div>
                      {student.batch && (
                        <button
                          type="button"
                          onClick={handleOpenEditProgressModal}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                            isDark
                              ? "border-neutral-700 text-amber-400 hover:bg-neutral-800"
                              : "border-[#E5E7EB] text-[#4B5563] hover:bg-[#F3F4F6]"
                          }`}
                        >
                          Edit Progress
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-6 py-1">
                      {/* Circular Progress Ring */}
                      <div className="relative w-28 h-28 shrink-0">
                        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 80 80">
                          <circle
                            cx="40"
                            cy="40"
                            r="36"
                            stroke={isDark ? "#262626" : "#E5E7EB"}
                            strokeWidth="7"
                            fill="none"
                          />
                          <motion.circle
                            initial={{ strokeDashoffset: ringCircumference }}
                            animate={{ strokeDashoffset: courseRingOffset }}
                            transition={{ duration: 0.9, ease: "easeOut" }}
                            cx="40"
                            cy="40"
                            r="36"
                            stroke="#10B981"
                            strokeWidth="7"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={ringCircumference}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-extrabold leading-none" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                            {currentProgressPct}%
                          </span>
                          <span className="text-[10px] font-medium mt-0.5" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                            Completed
                          </span>
                        </div>
                      </div>

                      {/* Stats Stack */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: isDark ? "rgba(16, 185, 129, 0.15)" : "#ECFDF5" }}
                          >
                            <Play className="w-4 h-4 fill-current" style={{ color: isDark ? "#34D399" : "#047857" }} />
                          </div>
                          <div>
                            <p className="text-lg font-extrabold leading-none" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                              {currentCompletedCount}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                              Classes Attended
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "#EFF6FF" }}
                          >
                            <Calendar className="w-4 h-4" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} />
                          </div>
                          <div>
                            <p className="text-lg font-extrabold leading-none" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                              {currentClassesNeeded}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                              Total Classes
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Linear Bar & Status */}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#262626" : "#E5E7EB" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${currentProgressPct}%`,
                            backgroundColor: "#10B981",
                          }}
                        />
                      </div>
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold shrink-0"
                        style={{ color: isDark ? "#34D399" : "#047857" }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                        {currentProgressPct >= 100 ? "Completed" : "On Track"}
                      </span>
                    </div>
                  </div>

                  {/* Attendance Card with Monthly Bar Chart */}
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                      isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                    }`}
                    style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                        <h3 className="text-sm sm:text-base font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                          Attendance
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("attendance")}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full border transition-colors cursor-pointer hover:opacity-90"
                        style={
                          isDark
                            ? { backgroundColor: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)", color: "#60A5FA" }
                            : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                        }
                      >
                        <span>View Details</span>
                        <ArrowRight className="w-3 h-3" style={{ color: isDark ? "#60A5FA" : "#B45309" }} />
                      </button>
                    </div>

                    {/* Monthly Attendance Bar Chart */}
                    {schedsLoading ? (
                      <div className="h-36 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-3 items-end h-36 pt-5 pb-1 px-2">
                        {monthlyAttendanceData.map((m, idx) => {
                          const barColor = m.pct >= 75 ? "#10B981" : m.pct > 0 ? "#F59E0B" : (isDark ? "#262626" : "#E5E7EB");
                          const heightPct = Math.max(m.pct > 0 ? 18 : 10, m.pct);
                          return (
                            <div key={`${m.label}-${idx}`} className="flex flex-col items-center h-full justify-end gap-1.5">
                              <span className="text-xs font-bold" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
                                {m.pct}%
                              </span>
                              <div className="w-full max-w-[44px] flex-1 flex items-end justify-center">
                                <div
                                  className="w-full rounded-t-xl transition-all duration-500"
                                  style={{
                                    height: `${heightPct}%`,
                                    backgroundColor: barColor,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                                {m.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Academic History & Recent Activity + Action Buttons */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left Table Card */}
                  <div
                    className={`lg:col-span-8 rounded-2xl border overflow-hidden ${
                      isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                    }`}
                    style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                  >
                    <div className={`px-4 py-3.5 border-b flex items-center justify-between ${
                      isDark ? "border-neutral-800" : "border-[#E5E7EB]"
                    }`}>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                        <h3 className="text-sm font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                          Academic History &amp; Recent Activity
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("activity")}
                        className="text-[11px] font-semibold hover:underline cursor-pointer"
                        style={{ color: isDark ? "#FBBF24" : "#B45309" }}
                      >
                        See All
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead style={{ backgroundColor: isDark ? "rgba(23, 23, 23, 0.6)" : "#F9FAFB", color: isDark ? "#9CA3AF" : "#4B5563" }}>
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Date</th>
                            <th className="py-2.5 px-3 font-semibold">Course Level</th>
                            <th className="py-2.5 px-3 font-semibold">Status</th>
                            <th className="py-2.5 px-4 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-neutral-800" : "divide-[#E5E7EB]"}`}>
                          {recentActivityRows.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-6 text-center text-xs" style={{ color: "#6B7280" }}>
                                No recent class activity recorded yet.
                              </td>
                            </tr>
                          ) : (
                            recentActivityRows.map((cls: any, idx: number) => {
                              const isCompleted = cls.status === "Completed";
                              const isCancelled = cls.status === "Cancelled";
                              const sessionNote = cls.notes
                                || cls.subject
                                || (cls.sessionNumber ? `Class ${cls.sessionNumber} of ${currentClassesNeeded}` : "Scheduled class");
                              return (
                                <tr key={cls._id || idx} className={isDark ? "hover:bg-neutral-800/30" : "hover:bg-[#F9FAFB]"}>
                                  <td className="py-2.5 px-4 whitespace-nowrap font-medium" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
                                    {safeFormatDate(cls.date, "MMM dd, yyyy", "Session")}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                                    {currentLevelTag}
                                    {cls.batch?.subject ? ` – ${cls.batch.subject}` : (student.batch?.subject ? ` – ${student.batch.subject}` : "")}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {isCompleted ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                                        style={
                                          isDark
                                            ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                            : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                        }
                                      >
                                        <CheckCircle2 className="w-3 h-3" style={{ color: isDark ? "#34D399" : "#047857" }} />
                                        Completed
                                      </span>
                                    ) : isCancelled ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                                        style={
                                          isDark
                                            ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#F87171" }
                                            : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                                        }
                                      >
                                        Cancelled
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                                        style={
                                          isDark
                                            ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                            : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                        }
                                      >
                                        <Clock className="w-3 h-3" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                                        Upcoming
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 max-w-[180px] truncate" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }} title={sessionNote}>
                                    {sessionNote}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Action Buttons Stack */}
                  <div className="lg:col-span-4 space-y-2.5">
                    {student.status === "Paused" ? (
                      <button
                        type="button"
                        onClick={handleOpenRestartModal}
                        className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                        style={{ backgroundColor: "#10B981", color: "#FFFFFF" }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />
                        <span style={{ color: "#FFFFFF" }}>Restart Classes</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenNextCourseModal}
                        className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer brand-gradient"
                        style={{ color: "#171717" }}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" style={{ color: "#171717" }} />
                        <span style={{ color: "#171717" }}>Move to Next Level</span>
                      </button>
                    )}

                    {student.status !== "Paused" && student.status !== "Dropped" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleOpenPauseModal}
                          className="py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FCD34D" }
                              : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                          }
                        >
                          <PauseCircle className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                          <span>Pause</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenRestartModal}
                          className="py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(16, 185, 129, 0.12)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                              : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                          }
                        >
                          <RotateCcw className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                          <span>Restart</span>
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleOpenReassignModal}
                      className="w-full py-2.5 px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                      style={
                        isDark
                          ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FCD34D" }
                          : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                      }
                    >
                      <RefreshCw className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                      <span>Reassign Teacher</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenChangeBatchModal}
                      className="w-full py-2.5 px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                      style={
                        isDark
                          ? { backgroundColor: "rgba(168, 85, 247, 0.1)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                          : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                      }
                    >
                      <Users className="w-3.5 h-3.5" style={{ color: isDark ? "#C084FC" : "#7E22CE" }} />
                      <span>{isOneToOneBatch ? "Change to Group Batch" : "Change Batch"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("progress")}
                      className={`w-full py-2.5 px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        isDark
                          ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200"
                          : "bg-[#FFFFFF] hover:bg-[#F3F4F6] border-[#E5E7EB] text-[#171717]"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" style={{ color: isDark ? "#E5E5E5" : "#1F2937" }} />
                      <span>View Full Details</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "attendance" && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Attendance Ring Card */}
                  <div
                    className={`rounded-2xl border p-5 flex items-center justify-center gap-6 ${
                      isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                    }`}
                    style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                  >
                    <div className="relative w-24 h-24 shrink-0">
                      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="36" stroke={isDark ? "#262626" : "#E5E7EB"} strokeWidth="6" fill="none" />
                        <motion.circle
                          initial={{ strokeDashoffset: ringCircumference }}
                          animate={{ strokeDashoffset: ringOffset }}
                          transition={{ duration: 0.9, ease: "easeOut" }}
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
                        <span className="text-xl font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{attendancePercentage}%</span>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div>
                        <p className="text-2xl font-bold leading-none" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{presentCount}</p>
                        <p className="text-[10px] uppercase font-bold mt-0.5" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>Classes Attended</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold leading-none" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>{totalTrackedClasses}</p>
                        <p className="text-[10px] uppercase font-bold mt-0.5" style={{ color: isDark ? "#737373" : "#6B7280" }}>Total Tracked</p>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Breakdown */}
                  <div
                    className={`rounded-2xl border p-5 ${
                      isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                    }`}
                    style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                      Monthly Attendance Trend
                    </h4>
                    <div className="grid grid-cols-4 gap-3 items-end h-28 pt-3">
                      {monthlyAttendanceData.map((m, idx) => {
                        const barColor = m.pct >= 75 ? "#10B981" : m.pct > 0 ? "#F59E0B" : (isDark ? "#262626" : "#E5E7EB");
                        const heightPct = Math.max(m.pct > 0 ? 18 : 10, m.pct);
                        return (
                          <div key={`att-${m.label}-${idx}`} className="flex flex-col items-center h-full justify-end gap-1">
                            <span className="text-xs font-bold" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{m.pct}%</span>
                            <div className="w-full max-w-[40px] flex-1 flex items-end justify-center">
                              <div className="w-full rounded-t-lg" style={{ height: `${heightPct}%`, backgroundColor: barColor }} />
                            </div>
                            <span className="text-[11px] font-medium" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Detailed Session Attendance Log */}
                <div
                  className={`rounded-2xl border overflow-hidden ${isDark ? "bg-neutral-800/20 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"}`}
                  style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                >
                  <div
                    className="px-4 py-3 border-b font-bold text-xs uppercase tracking-wider"
                    style={{
                      borderColor: isDark ? "#262626" : "#E5E7EB",
                      color: isDark ? "#D4D4D4" : "#171717",
                    }}
                  >
                    Session Attendance History ({activeStudentSchedules.length})
                  </div>
                  <div className="overflow-x-auto max-h-80 custom-scrollbar">
                    <table className="w-full text-left text-xs">
                      <thead style={{ backgroundColor: isDark ? "rgba(23, 23, 23, 0.6)" : "#F9FAFB", color: isDark ? "#9CA3AF" : "#4B5563" }}>
                        <tr>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-3">Time</th>
                          <th className="py-2.5 px-3">Teacher</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-4">Topic / Notes</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-neutral-800" : "divide-[#E5E7EB]"}`}>
                        {activeStudentSchedules.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center" style={{ color: "#6B7280" }}>No active sessions recorded yet.</td>
                          </tr>
                        ) : (
                          activeStudentSchedules.map((cls: any, idx: number) => (
                            <tr key={cls._id || idx} className={isDark ? "hover:bg-neutral-800/30" : "hover:bg-[#F9FAFB]"}>
                              <td className="py-2.5 px-4 whitespace-nowrap font-medium" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{safeFormatDate(cls.date, "dd MMM yyyy, EEE", "Session")}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>{cls.startTime || "—"}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: isDark ? "#D4D4D4" : "#171717" }}>{cls.completedByName || cls.teacher?.name || currentTeacherName}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                                  style={
                                    cls.status === "Completed"
                                      ? isDark
                                        ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                      : cls.status === "Cancelled"
                                      ? isDark
                                        ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#F87171" }
                                        : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                                      : isDark
                                      ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                      : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                  }
                                >
                                  {cls.status || "Scheduled"}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 truncate max-w-[200px]" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>{cls.subject || cls.notes || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "progress" && (
              <>
                {/* Next Course Banner for Completed Batches */}
                {(student.batch?.status === "Completed" || attendancePercentage >= 100) && (
                  <div
                    className={`border rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 ${
                      isDark
                        ? "bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                        : "bg-emerald-50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                        style={
                          isDark
                            ? { backgroundColor: "rgba(16, 185, 129, 0.2)", borderColor: "rgba(16, 185, 129, 0.3)" }
                            : { backgroundColor: "#D1FAE5", borderColor: "#A7F3D0" }
                        }
                      >
                        <GraduationCap className="w-5 h-5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                      </div>
                      <div>
                        <h4 className={`font-bold text-sm ${isDark ? "text-white" : "text-emerald-950"}`}>Course Level Completed! 🎉</h4>
                        <p className={`text-xs ${isDark ? "text-neutral-300" : "text-emerald-800"}`}>
                          {student.name} finished <strong>{student.batch.name}</strong> ({student.batch.subject}). Move to the next level without duplicating student details.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleOpenNextCourseModal}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                      style={!isDark ? { backgroundColor: "#059669", color: "#FFFFFF" } : { color: "#000000" }}
                    >
                      <Plus className="w-4 h-4" style={!isDark ? { color: "#FFFFFF" } : undefined} /> Move to Next Level
                    </button>
                  </div>
                )}

                {/* Academic History & Level Progression */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <div className={`flex items-center gap-2 font-semibold text-sm uppercase tracking-widest ${isDark ? "text-neutral-400" : "text-[#4B5563]"}`}>
                      <History className="w-4 h-4" style={{ color: isDark ? "#F59E0B" : "#B45309" }} />
                      <span>Academic History &amp; Course Levels</span>
                    </div>
              <span className={`text-[11px] hidden sm:inline ${isDark ? "text-neutral-500" : "text-[#6B7280]"}`}>
                Previous &amp; Ongoing Level Progress
              </span>
            </div>

            <div
              className={`rounded-2xl border overflow-hidden divide-y ${
                isDark
                  ? "bg-neutral-800/20 border-neutral-800/50 divide-neutral-800/50"
                  : "bg-[#FFFFFF] border-[#E5E7EB] divide-[#E5E7EB]"
              }`}
              style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
            >
              {/* Current / Ongoing Level */}
              {student.batch ? (() => {
                const currentTeacherName =
                  getTeacherName(student.assignedTutor) ||
                  getTeacherName(student.batch?.assignedTeacher) ||
                  "Assigned Tutor";

                return (
                  <div className={`p-4 sm:p-5 transition-colors relative overflow-hidden group ${
                    isDark ? "hover:bg-neutral-800/40" : "hover:bg-slate-50/50"
                  }`}>
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-500 to-teal-400 rounded-r" />
                    <div className="pl-2 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider"
                            style={
                              isDark
                                ? { backgroundColor: "rgba(16, 185, 129, 0.2)", borderColor: "rgba(16, 185, 129, 0.4)", color: "#6EE7B7" }
                                : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                            }
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live · {currentLevelTag}
                          </span>
                          <span className={`text-[11px] font-medium ${isDark ? "text-neutral-400" : "text-slate-500"}`}>Ongoing Level</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2.5 py-1 rounded-xl border text-xs font-bold"
                            style={
                              student.status === "Paused"
                                ? isDark
                                  ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                  : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                : isDark
                                ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#34D399" }
                                : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                            }
                          >
                            {student.status === "Paused" ? "Paused" : "In Progress"}
                          </span>
                          {student.status === "Paused" ? (
                            <button
                              type="button"
                              onClick={handleOpenRestartModal}
                              className="px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                              style={{ backgroundColor: "#10B981", color: "#FFFFFF" }}
                            >
                              <RotateCcw className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />
                              <span style={{ color: "#FFFFFF" }}>Restart Classes</span>
                            </button>
                          ) : student.status !== "Dropped" ? (
                            <button
                              type="button"
                              onClick={handleOpenPauseModal}
                              className="px-3 py-1 border rounded-xl text-xs font-semibold transition-opacity hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                              style={
                                isDark
                                  ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                  : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                              }
                            >
                              <PauseCircle className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} /> Pause Classes
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={handleOpenReassignModal}
                            className="px-3 py-1 border rounded-xl text-xs font-semibold transition-opacity hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                            style={
                              isDark
                                ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                            }
                            title="Reassign Teacher for Student"
                          >
                            <User className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} /> Reassign Teacher
                          </button>
                          <button
                            onClick={handleOpenNextCourseModal}
                            className={`px-3 py-1 border rounded-xl text-xs font-semibold transition-opacity hover:opacity-90 flex items-center gap-1 cursor-pointer ${
                              !isDark ? "brand-gradient border-amber-400 font-bold" : ""
                            }`}
                            style={
                              isDark
                                ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                : { color: "#171717" }
                            }
                          >
                            <GraduationCap className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#171717" }} /> Move to Next Level
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold transition-colors truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                          {student.batch.name}
                        </h4>
                        <span
                          className="px-2 py-0.5 rounded-lg font-semibold text-[11px] border"
                          style={
                            isDark
                              ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#D4D4D4" }
                              : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                          }
                        >
                          {((student.batch.name || "").includes("1:1") || (student.batch.studentsCount !== undefined && student.batch.studentsCount <= 1)) ? "1:1" : "Group"}
                        </span>
                        {student.batch.name?.match(/\b(\d+)\b/)?.[1] && (
                          <span
                            className="px-2 py-0.5 rounded-lg font-semibold text-[11px] border"
                            style={
                              isDark
                                ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)", color: "#FBBF24" }
                                : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                            }
                          >
                            Batch #{student.batch.name.match(/\b(\d+)\b/)?.[1]}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                          <span>Assigned Teacher: <strong className="font-semibold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{currentTeacherName}</strong></span>
                        </span>
                        {savedRestartSummary ? (
                          <span className="flex items-center gap-1.5 flex-wrap" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                            <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} />
                            <span>
                              {savedRestartSummary.days
                                .map((d) => `${d.slice(0, 3)}: ${formatTime12h(savedRestartSummary.dayTimings[d]?.startTime)}`)
                                .join(" · ")}
                            </span>
                            <span style={{ color: "#6B7280" }}>({savedRestartSummary.durationMinutes}m)</span>
                            <button
                              type="button"
                              onClick={handleOpenEditRestartModal}
                              className="inline-flex items-center gap-1 text-[11px] font-bold underline cursor-pointer ml-1"
                              style={{ color: isDark ? "#34D399" : "#047857" }}
                            >
                              <Edit2 className="w-3 h-3" /> Edit Schedule
                            </button>
                          </span>
                        ) : (
                          <>
                            {student.batch.timing?.startTime && (
                              <span className="flex items-center gap-1.5" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} />
                                <span>{student.batch.timing.startTime} - {student.batch.timing.endTime}</span>
                              </span>
                            )}
                            {student.batch.days && student.batch.days.length > 0 && (
                              <span className="flex items-center gap-1.5" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#C084FC" : "#7E22CE" }} />
                                <span>{student.batch.days.join(", ")}</span>
                              </span>
                            )}
                          </>
                        )}
                        {student.batch.meetingLink && (
                          <a
                            href={student.batch.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline font-semibold"
                            style={{ color: isDark ? "#34D399" : "#047857" }}
                          >
                            <Video className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} /> Class Link
                          </a>
                        )}
                      </div>

                      {/* Live Progress Bar */}
                      <div className="pt-1.5 w-full max-w-lg">
                        <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                          <span className="font-semibold" style={{ color: isDark ? "#34D399" : "#047857" }}>Level Progress: {currentProgressPct}%</span>
                          <div className="flex items-center gap-2">
                            <span>{currentCompletedCount} of {currentClassesNeeded} classes completed</span>
                            {currentExtraClassCount > 0 && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1"
                                style={
                                  isDark
                                    ? { backgroundColor: "rgba(168, 85, 247, 0.15)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                                    : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                }
                              >
                                <Sparkles className="w-2.5 h-2.5" style={{ color: isDark ? "#D8B4FE" : "#7E22CE" }} />
                                {currentExtraClassCount} Extra
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#262626" : "#E5E7EB" }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${currentProgressPct}%`, backgroundColor: "#10B981" }}
                          />
                        </div>
                      </div>

                      {/* Restart Details & Continuation Schedule Card inside Course Progress */}
                      {renderRestartDetailsCard("progress")}

                      {/* Live Level Classes list & Extra Class Action */}
                      <div className="pt-2">
                        {student.status === "Dropped" && (
                          <div className={`border rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 text-xs ${
                            isDark
                              ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                              : "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]"
                          }`}>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                                style={
                                  isDark
                                    ? { backgroundColor: "rgba(244, 63, 94, 0.2)", borderColor: "rgba(244, 63, 94, 0.3)" }
                                    : { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }
                                }
                              >
                                <UserX className="w-4 h-4" style={{ color: isDark ? "#FB7185" : "#B91C1C" }} />
                              </div>
                              <div>
                                <h4 className="font-bold text-sm" style={{ color: isDark ? "#FFFFFF" : "#991B1B" }}>Student Status: Dropped</h4>
                                <p style={{ color: isDark ? "#D4D4D4" : "#B91C1C" }}>
                                  This student is currently dropped and hidden from daily/weekly schedules and upcoming class lists. Previous attendance and completed class logs are preserved below for reference.
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => updateStatusMutation.mutate("Active")}
                              disabled={updateStatusMutation.isPending}
                              className="px-3.5 py-2 font-bold rounded-xl text-xs transition-opacity hover:opacity-90 shrink-0 flex items-center gap-1.5 cursor-pointer border"
                              style={
                                isDark
                                  ? { backgroundColor: "#10B981", borderColor: "#10B981", color: "#000000" }
                                  : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                              }
                            >
                              {updateStatusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              Reactivate to Schedule
                            </button>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                          <button
                            type="button"
                            onClick={() => setExpandedLevels(prev => ({ ...prev, current: !prev.current }))}
                            className="text-xs flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                            style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}
                          >
                            {expandedLevels.current ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span>{expandedLevels.current ? "Hide" : "View"} Class Schedule &amp; Logs ({currentBatchSchedules.length} Sessions)</span>
                            {currentExtraClassCount > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ml-1"
                                style={
                                  isDark
                                    ? { backgroundColor: "rgba(168, 85, 247, 0.15)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                                    : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                }
                              >
                                <Sparkles className="w-2.5 h-2.5" style={{ color: isDark ? "#D8B4FE" : "#7E22CE" }} />
                                {currentExtraClassCount} Extra
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-2">
                            {student.batch && (
                              <button
                                type="button"
                                onClick={handleOpenEditProgressModal}
                                className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                                style={
                                  isDark
                                    ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FCD34D" }
                                    : { backgroundColor: "#FFF7E6", borderColor: "#FCD34D", color: "#B45309" }
                                }
                                title="Edit class progress and regenerate timetable"
                              >
                                <Sliders className="w-3 h-3" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                                <span>Edit Class Progress</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleOpenScheduleExtraClass}
                              className="px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer"
                              style={
                                isDark
                                  ? { backgroundColor: "#7C3AED", borderColor: "#7C3AED", color: "#FFFFFF" }
                                  : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                              }
                            >
                              <Sparkles className="w-3 h-3" style={{ color: isDark ? "#FFFFFF" : "#7E22CE" }} />
                              <span style={{ color: isDark ? "#FFFFFF" : "#7E22CE" }}>+ Schedule Extra Class</span>
                            </button>
                          </div>
                        </div>

                        {expandedLevels.current && (
                          <div className="mt-2.5 space-y-2 border-t pt-2.5" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                            {currentBatchSchedules.length === 0 ? (
                              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                                isDark ? "bg-neutral-900/50 border-neutral-800 text-neutral-400" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
                              }`}>
                                <span>No classes scheduled yet for this level.</span>
                                <button
                                  type="button"
                                  onClick={handleOpenScheduleExtraClass}
                                  className="font-semibold flex items-center gap-1 cursor-pointer"
                                  style={{ color: isDark ? "#C084FC" : "#7E22CE" }}
                                >
                                  <Sparkles className="w-3 h-3" style={{ color: isDark ? "#C084FC" : "#7E22CE" }} />
                                  Schedule Extra Class
                                </button>
                              </div>
                            ) : (() => {
                              let regIndex = 0;
                              return (
                                <div className="space-y-2">
                                  {/* Student Teacher Transfer Log if available */}
                                  {student.teacherHistory && student.teacherHistory.length > 0 && (
                                    <div
                                      className="p-2.5 rounded-xl border text-xs space-y-1"
                                      style={
                                        isDark
                                          ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)" }
                                          : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                                      }
                                    >
                                      <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
                                        <span className="flex items-center gap-1">
                                          <History className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} /> Teacher Transfer History ({student.teacherHistory.length})
                                        </span>
                                        <span className="font-normal" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>Classes 1..N retain historical conductor</span>
                                      </div>
                                      <div className="space-y-1 pt-0.5">
                                        {student.teacherHistory.map((th: any, idx: number) => (
                                          <div
                                            key={idx}
                                            className={`flex items-center justify-between text-[11px] px-2.5 py-1 rounded-lg border ${
                                              isDark ? "text-neutral-300 bg-neutral-900/80 border-neutral-800" : "text-[#171717] bg-[#FFFFFF] border-[#FDE68A]"
                                            }`}
                                          >
                                            <span>
                                              Transferred from <strong style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{th.previousTeacherName || "Previous Teacher"}</strong> →{" "}
                                              <strong style={{ color: isDark ? "#FBBF24" : "#B45309" }}>{th.teacherName || "New Teacher"}</strong>
                                              {th.reason ? <span style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}> ({th.reason})</span> : null}
                                            </span>
                                            <span className="font-mono text-[10px]" style={{ color: "#6B7280" }}>
                                              {safeFormatDate(th.changedAt, "dd MMM yyyy", "")}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Table of Class History */}
                                  <div className={`overflow-x-auto rounded-xl border ${
                                    isDark ? "border-neutral-800/80 bg-neutral-900/60" : "border-[#E5E7EB] bg-[#FFFFFF]"
                                  }`}>
                                    <table className={`w-full text-left text-xs divide-y ${isDark ? "divide-neutral-800" : "divide-[#E5E7EB]"}`}>
                                      <thead
                                        className="text-[11px] font-bold uppercase tracking-wider"
                                        style={{ backgroundColor: isDark ? "rgba(10, 10, 10, 0.8)" : "#F9FAFB", color: isDark ? "#9CA3AF" : "#4B5563" }}
                                      >
                                        <tr>
                                          <th className="py-2.5 px-3">Class</th>
                                          <th className="py-2.5 px-3">Date</th>
                                          <th className="py-2.5 px-3">Time</th>
                                          <th className="py-2.5 px-3">Status</th>
                                          <th className="py-2.5 px-3">Completed By / Teacher</th>
                                          <th className="py-2.5 px-3 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className={`divide-y ${isDark ? "divide-neutral-800/60" : "divide-[#E5E7EB]"}`}>
                                        {currentBatchSchedules.map((cls: any, cIdx: number) => {
                                          if (!cls.isExtraClass) regIndex++;
                                          const classLabel = cls.isExtraClass ? "Extra Class" : (cls.sessionNumber ? `Class ${cls.sessionNumber}` : `Class ${regIndex}`);
                                          const isCompleted = cls.status === "Completed";
                                          const isCancelled = cls.status === "Cancelled";
                                          const isExpandedRow = expandedScheduleRowId === (cls._id || String(cIdx));

                                          // Completed classes display the teacher who actually conducted that session
                                          // Upcoming/pending classes display the currently assigned teacher
                                          const completedByTeacherName = cls.completedByName ||
                                            getTeacherName(cls.completedBy) ||
                                            cls.teacher?.name ||
                                            getTeacherName(cls.teacher) ||
                                            "Teacher";

                                          const upcomingTeacherName = cls.teacher?.name ||
                                            getTeacherName(cls.teacher) ||
                                            currentTeacherName ||
                                            "Assigned Teacher";

                                          return (
                                            <React.Fragment key={cls._id || cIdx}>
                                              <tr className={`transition-colors ${isDark ? "hover:bg-neutral-800/40" : "hover:bg-[#F9FAFB]"}`}>
                                                <td className="py-2.5 px-3 font-semibold whitespace-nowrap" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                                  <div className="flex items-center gap-1.5">
                                                    <span>{classLabel}</span>
                                                    {cls.isExtraClass && (
                                                      <span
                                                        className="px-1.5 py-0.2 rounded text-[9px] font-bold border"
                                                        style={
                                                          isDark
                                                            ? { backgroundColor: "rgba(168, 85, 247, 0.2)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                                                            : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                                        }
                                                      >
                                                        Extra
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
                                                  <span className="flex items-center gap-1 font-medium">
                                                    <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                                                    {safeFormatDate(cls.date, "dd MMM yyyy, EEE", "Session")}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                                                  <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3 shrink-0" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                                                    {cls.startTime && cls.endTime ? `${cls.startTime} - ${cls.endTime}` : (cls.startTime || "—")}
                                                  </span>
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                  {isCompleted ? (
                                                    <span
                                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                                                      style={
                                                        isDark
                                                          ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                                          : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                                      }
                                                    >
                                                      <CheckCircle2 className="w-3 h-3" style={{ color: isDark ? "#34D399" : "#047857" }} /> Completed
                                                    </span>
                                                  ) : isCancelled ? (
                                                    <span
                                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                                                      style={
                                                        isDark
                                                          ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#F87171" }
                                                          : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                                                      }
                                                    >
                                                      Cancelled
                                                    </span>
                                                  ) : (
                                                    <span
                                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                                                      style={
                                                        isDark
                                                          ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                                          : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                                      }
                                                    >
                                                      <Clock className="w-3 h-3" style={{ color: isDark ? "#FBBF24" : "#B45309" }} /> Pending
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                  {isCompleted ? (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="font-semibold" style={{ color: isDark ? "#6EE7B7" : "#047857" }}>{completedByTeacherName}</span>
                                                      <span
                                                        className="text-[9px] px-1.5 py-0.2 rounded border font-medium"
                                                        style={
                                                          isDark
                                                            ? { backgroundColor: "rgba(6, 78, 59, 0.8)", borderColor: "rgba(6, 95, 70, 0.6)", color: "#34D399" }
                                                            : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                                        }
                                                      >
                                                        Conducted
                                                      </span>
                                                    </div>
                                                  ) : (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="font-semibold" style={{ color: isDark ? "#93C5FD" : "#1D4ED8" }}>{upcomingTeacherName}</span>
                                                      <span
                                                        className="text-[9px] px-1.5 py-0.2 rounded border font-medium"
                                                        style={
                                                          isDark
                                                            ? { backgroundColor: "rgba(23, 37, 84, 0.8)", borderColor: "rgba(30, 64, 175, 0.6)", color: "#60A5FA" }
                                                            : { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }
                                                        }
                                                      >
                                                        Assigned
                                                      </span>
                                                    </div>
                                                  )}
                                                </td>
                                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                  <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                      type="button"
                                                      title={cls.isExtraClass ? "Click to unmark as Extra Class" : "Click to mark as Extra Class"}
                                                      disabled={togglingScheduleId === cls._id}
                                                      onClick={() => {
                                                        setTogglingScheduleId(cls._id);
                                                        toggleExtraClassMutation.mutate({
                                                          scheduleId: cls._id,
                                                          isExtraClass: !cls.isExtraClass,
                                                          extraClassReason: !cls.isExtraClass ? "Extra class for student" : "",
                                                        });
                                                      }}
                                                      className="px-2 py-0.5 rounded text-[10px] font-semibold border transition-opacity hover:opacity-90 flex items-center gap-1 cursor-pointer"
                                                      style={
                                                        cls.isExtraClass
                                                          ? isDark
                                                            ? { backgroundColor: "rgba(59, 7, 100, 0.6)", borderColor: "rgba(168, 85, 247, 0.4)", color: "#D8B4FE" }
                                                            : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                                          : isDark
                                                          ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#A3A3A3" }
                                                          : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                                                      }
                                                    >
                                                      {togglingScheduleId === cls._id ? (
                                                        <div className="w-2.5 h-2.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                                      ) : (
                                                        <Sparkles className="w-2.5 h-2.5" style={{ color: cls.isExtraClass ? (isDark ? "#D8B4FE" : "#7E22CE") : (isDark ? "#A3A3A3" : "#4B5563") }} />
                                                      )}
                                                      <span>{cls.isExtraClass ? "Extra ✓" : "+ Extra"}</span>
                                                    </button>
                                                    {(cls.subject || cls.notes || cls.extraClassReason || cls.meetingLink) && (
                                                      <button
                                                        type="button"
                                                        onClick={() => setExpandedScheduleRowId(isExpandedRow ? null : (cls._id || String(cIdx)))}
                                                        className={`p-1 rounded transition-colors cursor-pointer ${
                                                          isDark ? "text-neutral-400 hover:text-white hover:bg-neutral-800" : "text-[#4B5563] hover:text-[#171717] hover:bg-[#F3F4F6]"
                                                        }`}
                                                        title="View topic & notes"
                                                      >
                                                        {isExpandedRow ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                      </button>
                                                    )}
                                                  </div>
                                                </td>
                                              </tr>
                                              {isExpandedRow && (cls.subject || cls.notes || cls.extraClassReason || cls.meetingLink) && (
                                                <tr style={{ backgroundColor: isDark ? "rgba(10, 10, 10, 0.6)" : "#F9FAFB" }}>
                                                  <td colSpan={6} className="px-3 py-2 text-xs space-y-1">
                                                    {cls.subject && (
                                                      <div className="flex items-start gap-1.5">
                                                        <span className="font-semibold shrink-0" style={{ color: isDark ? "#34D399" : "#047857" }}>Topic Covered:</span>
                                                        <span style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{cls.subject}</span>
                                                      </div>
                                                    )}
                                                    {cls.notes && (
                                                      <div className="flex items-start gap-1.5 text-[11px]" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                                        <span className="font-semibold shrink-0" style={{ color: isDark ? "#737373" : "#6B7280" }}>Notes:</span>
                                                        <span>{cls.notes}</span>
                                                      </div>
                                                    )}
                                                    {cls.extraClassReason && (
                                                      <div className="flex items-start gap-1.5 text-[11px]" style={{ color: isDark ? "#D8B4FE" : "#7E22CE" }}>
                                                        <span className="font-semibold shrink-0">Extra Reason:</span>
                                                        <span>{cls.extraClassReason}</span>
                                                      </div>
                                                    )}
                                                    {cls.meetingLink && (
                                                      <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                                                        <span className="font-semibold" style={{ color: "#6B7280" }}>Link:</span>
                                                        <a href={cls.meetingLink} target="_blank" rel="noreferrer" className="hover:underline truncate" style={{ color: isDark ? "#34D399" : "#047857" }}>
                                                          {cls.meetingLink}
                                                        </a>
                                                      </div>
                                                    )}
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Project Submissions Section (Automatic milestones every 5 completed classes) */}
                      <div className="pt-3 border-t" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                        <ProjectSubmissionsSection
                          student={student}
                          batchId={currentBatchId}
                          batchName={student.batch?.name}
                          courseName={student.batch?.subject}
                          completedClassesCount={currentCompletedCount}
                          schedules={currentBatchSchedules}
                          onSubmissionSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ["student", studentId] });
                            queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
                          }}
                        />
                      </div>
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
                    <div key={pbKey} className={`p-4 sm:p-5 transition-colors relative group ${isDark ? "hover:bg-neutral-800/30" : "hover:bg-slate-50/70"}`}>
                      <div className="pl-2 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider"
                              style={
                                isDark
                                  ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#D4D4D4" }
                                  : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                              }
                            >
                              Previous Level · {pbLevel}
                            </span>
                            <span className="text-[11px] font-semibold flex items-center gap-1" style={{ color: isDark ? "#34D399" : "#047857" }}>
                              <CheckCircle2 className="w-3 h-3" style={{ color: isDark ? "#34D399" : "#047857" }} /> Completed
                            </span>
                            {completedDateStr && (
                              <span className="text-[11px]" style={{ color: "#6B7280" }}>
                                Finished in {completedDateStr}
                              </span>
                            )}
                          </div>
                          <span
                            className="px-3 py-1 rounded-xl border text-xs font-bold uppercase tracking-wider self-start sm:self-auto"
                            style={
                              isDark
                                ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#9CA3AF" }
                                : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                            }
                          >
                            Completed Level
                          </span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold transition-colors truncate" style={{ color: isDark ? "#D4D4D4" : "#171717" }}>
                          {batchName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                          <span className="flex items-center gap-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                            <User className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                            <span>Taught by: <strong className="font-medium" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{pbTeacher}</strong></span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                            <span>{pbClasses} Classes Completed</span>
                          </span>
                          <span style={{ color: "#6B7280" }}>Subject: {batchSubject}</span>
                        </div>

                        {/* Completed Progress Bar */}
                        <div className="pt-1.5 w-full max-w-lg">
                          <div className="flex items-center justify-between text-xs mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                            <span className="font-semibold" style={{ color: isDark ? "#34D399" : "#047857" }}>100% Completed</span>
                            <span>{pbClasses} of {pbClasses} classes completed</span>
                          </div>
                          <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#262626" : "#E5E7EB" }}>
                            <div className="h-full rounded-full w-full" style={{ backgroundColor: "#10B981" }} />
                          </div>
                        </div>

                        {/* Expandable Previous Classes Record */}
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedLevels(prev => ({ ...prev, [pbKey]: !prev[pbKey] }))}
                            className="text-xs flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-90 px-3 py-1.5 rounded-lg border cursor-pointer"
                            style={
                              isDark
                                ? { backgroundColor: "rgba(38, 38, 38, 0.6)", borderColor: "rgba(63, 63, 70, 0.6)", color: "#34D399" }
                                : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                            }
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />}
                            <span>{isExpanded ? "Hide" : "View"} Completed Classes Record ({pbSchedules.length > 0 ? pbSchedules.length : pbClasses} Classes)</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                              {pbSchedules.length > 0 ? (
                                pbSchedules.map((cls: any, cIdx: number) => (
                                  <div
                                    key={cls._id || cIdx}
                                    className={`p-3 rounded-xl border text-xs space-y-1.5 transition-colors ${
                                      isDark ? "bg-neutral-900/80 border-neutral-800 hover:border-neutral-700" : "bg-[#F9FAFB] border-[#E5E7EB]"
                                    }`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span
                                          className="px-2 py-0.5 rounded font-bold text-[11px] border"
                                          style={
                                            cls.isExtraClass
                                              ? isDark
                                                ? { backgroundColor: "rgba(168, 85, 247, 0.15)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                                                : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                              : isDark
                                              ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#34D399" }
                                              : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                          }
                                        >
                                          {cls.isExtraClass ? "Extra Class" : `Class ${pbSchedules.length - cIdx}`}
                                        </span>
                                        {cls.isExtraClass && (
                                          <span
                                            className="px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1"
                                            style={
                                              isDark
                                                ? { backgroundColor: "rgba(168, 85, 247, 0.2)", borderColor: "rgba(168, 85, 247, 0.3)", color: "#D8B4FE" }
                                                : { backgroundColor: "#F5F3FF", borderColor: "#DDD6FE", color: "#7E22CE" }
                                            }
                                          >
                                            <Sparkles className="w-2.5 h-2.5" style={{ color: isDark ? "#D8B4FE" : "#7E22CE" }} />
                                            Extra
                                          </span>
                                        )}
                                        <span className="font-bold flex items-center gap-1" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                          <Calendar className="w-3 h-3" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                                          {safeFormatDate(cls.date, "dd MMM yyyy, EEE", "Completed Session")}
                                        </span>
                                        <span className="font-mono text-[11px] flex items-center gap-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                          <Clock className="w-3 h-3" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                                          {cls.startTime && cls.endTime ? `${cls.startTime} - ${cls.endTime}` : "Completed Class"}
                                        </span>
                                      </div>
                                      <span className="text-[11px]" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                                        Taught by: <strong style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{cls.teacher?.name || cls.replacementTeacher?.name || pbTeacher}</strong>
                                      </span>
                                    </div>

                                    {/* Topic covered & notes */}
                                    <div className={`rounded-lg p-2.5 border space-y-1 ${
                                      isDark ? "bg-neutral-950/60 border-neutral-800/60" : "bg-[#FFFFFF] border-[#E5E7EB]"
                                    }`}>
                                      {cls.isExtraClass && cls.extraClassReason && (
                                        <div className="flex items-start gap-1.5 text-[11px]" style={{ color: isDark ? "#D8B4FE" : "#7E22CE" }}>
                                          <span className="font-semibold shrink-0">Extra Reason:</span>
                                          <span>{cls.extraClassReason}</span>
                                        </div>
                                      )}
                                      <div className="flex items-start gap-1.5">
                                        <span className="font-semibold shrink-0" style={{ color: isDark ? "#34D399" : "#047857" }}>Topic Covered:</span>
                                        <span className="font-medium" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{cls.subject || "Topic Covered / Curriculum Session"}</span>
                                      </div>
                                      {cls.notes && (
                                        <div className="flex items-start gap-1.5 text-[11px] pt-0.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                                          <span className="font-semibold shrink-0" style={{ color: "#6B7280" }}>Notes / Remarks:</span>
                                          <span>{cls.notes}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                                  isDark ? "bg-neutral-900/40 border-neutral-800 text-neutral-400" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
                                }`}>
                                  <p className="font-semibold" style={{ color: isDark ? "#D4D4D4" : "#171717" }}>
                                    ✨ {pbClasses} Sessions Completed under {pbTeacher}
                                  </p>
                                  <p className="text-[11px]" style={{ color: "#6B7280" }}>
                                    All session records, attendance, and coursework for {pbLevel} were successfully completed and archived.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Past Level Project Submissions History */}
                        <div className="pt-3 border-t" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                          <ProjectSubmissionsSection
                            student={student}
                            batchId={pbBatchId ? pbBatchId.toString() : pbKey}
                            batchName={batchName}
                            courseName={batchSubject}
                            completedClassesCount={pbClasses}
                            schedules={pbSchedules}
                            onSubmissionSuccess={() => {
                              queryClient.invalidateQueries({ queryKey: ["student", studentId] });
                              queryClient.invalidateQueries({ queryKey: ["student-schedules", studentId] });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : null}

              {!student.batch && (!student.pastBatches || student.pastBatches.length === 0) ? (
                <div className="p-6 sm:p-8 text-center flex flex-col items-center justify-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isDark ? "bg-neutral-800" : "bg-[#F3F4F6]"}`}>
                    <History className="w-5 h-5" style={{ color: isDark ? "#525252" : "#6B7280" }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: isDark ? "#9CA3AF" : "#171717" }}>No academic history recorded yet</p>
                  <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Assign a batch to begin tracking course levels and progress.</p>
                </div>
              ) : null}
                </div>
              </div>
              </>
            )}

            {activeTab === "activity" && (
              <div className="space-y-6">
                {/* Teacher Transfer History */}
                {student.teacherHistory && student.teacherHistory.length > 0 && (
                  <div className="space-y-3">
                    <div className={`flex items-center gap-2 font-semibold text-sm uppercase tracking-widest px-1 ${isDark ? "text-neutral-400" : "text-[#4B5563]"}`}>
                      <History className="w-4 h-4" style={{ color: isDark ? "#F59E0B" : "#B45309" }} />
                      <span>Teacher Transfer History ({student.teacherHistory.length})</span>
                    </div>
                    <div className="space-y-2">
                      {student.teacherHistory.map((th: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between text-xs px-4 py-3 rounded-xl border ${
                            isDark
                              ? "text-neutral-300 bg-neutral-800/40 border-neutral-800"
                              : "text-[#4B5563] bg-[#FFFFFF] border-[#E5E7EB]"
                          }`}
                          style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                        >
                          <span>
                            Transferred from <strong style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{th.previousTeacherName || "Previous Teacher"}</strong> →{" "}
                            <strong style={{ color: isDark ? "#FBBF24" : "#B45309" }}>{th.teacherName || "New Teacher"}</strong>
                            {th.reason ? <span style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}> ({th.reason})</span> : null}
                          </span>
                          <span className="font-mono text-[11px]" style={{ color: "#6B7280" }}>
                            {safeFormatDate(th.changedAt, "dd MMM yyyy", "")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Separate Student History: Pause, Restart & Archived Schedule Records */}
                {Array.isArray(student.restartHistory) && student.restartHistory.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <div className={`flex items-center gap-2 font-semibold text-sm uppercase tracking-widest ${isDark ? "text-neutral-400" : "text-[#4B5563]"}`}>
                        <RotateCcw className="w-4 h-4" style={{ color: isDark ? "#F59E0B" : "#B45309" }} />
                        <span>Pause, Restart &amp; Archived Class History ({student.restartHistory.length})</span>
                      </div>
                      <span className="text-[11px]" style={{ color: "#6B7280" }}>Preserved Historical Records</span>
                    </div>
                    <div className="space-y-3">
                      {student.restartHistory.slice().reverse().map((rh: any, idx: number) => {
                        const entryKey = rh.id || `rh-${idx}`;
                        const isArchiveExpanded = !!expandedArchiveIds[entryKey];
                        const archivedRows = Array.isArray(rh.archivedSchedules) ? rh.archivedSchedules : [];
                        const prevDaysStr = Array.isArray(rh.previousSchedule?.days) && rh.previousSchedule.days.length > 0
                          ? rh.previousSchedule.days.map((d: string) => d.slice(0, 3)).join(", ")
                          : "—";
                        const prevTimeStr = rh.previousSchedule?.timing?.startTime
                          ? `${rh.previousSchedule.timing.startTime}${rh.previousSchedule.timing.endTime ? ` - ${rh.previousSchedule.timing.endTime}` : ""}`
                          : "—";
                        return (
                          <div
                            key={entryKey}
                            className={`rounded-2xl border p-4 space-y-3 ${
                              isDark ? "bg-neutral-800/30 border-neutral-800" : "bg-[#FFFFFF] border-[#E5E7EB]"
                            }`}
                            style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                                  style={
                                    rh.status === "Restarted"
                                      ? isDark
                                        ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                      : isDark
                                      ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                      : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                  }
                                >
                                  {rh.status === "Restarted" ? "Restarted" : "Paused"}
                                </span>
                                <span className="text-xs font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                  {rh.previousBatchName || "Course Schedule"} ({rh.previousBatchType || "1:1"})
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold" style={{ color: isDark ? "#34D399" : "#047857" }}>
                                  {rh.completedAtRestart ?? rh.completedAtPause ?? 0} Completed · {rh.remainingAtRestart ?? rh.remainingAtPause ?? 0} Remaining
                                </span>
                                {rh.status === "Restarted" && (!savedRestartSummary?.historyEntryId ? idx === 0 : rh.id === savedRestartSummary.historyEntryId) && (
                                  <button
                                    type="button"
                                    onClick={handleOpenEditRestartModal}
                                    className="px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                    style={
                                      isDark
                                        ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                    }
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {rh.newSchedule && Array.isArray(rh.newSchedule.days) && rh.newSchedule.days.length > 0 && (
                              <div className={`p-3 rounded-xl border space-y-2 ${isDark ? "bg-neutral-900/50 border-emerald-500/20" : "bg-[#ECFDF5] border-[#A7F3D0]"}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                  <span className="font-bold" style={{ color: isDark ? "#34D399" : "#047857" }}>
                                    Active Restart Schedule · {rh.newTeacherName || "Tutor is Unassigned"} ({rh.newSchedule.durationMinutes || 60} mins)
                                  </span>
                                  {Array.isArray(rh.editHistory) && rh.editHistory.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedRestartEdits((prev) => ({ ...prev, [entryKey]: !prev[entryKey] }))}
                                      className="font-semibold underline cursor-pointer"
                                      style={{ color: isDark ? "#6EE7B7" : "#047857" }}
                                    >
                                      {expandedRestartEdits[entryKey] ? "Hide" : "View"} Edit History ({rh.editHistory.length})
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {rh.newSchedule.days.map((d: string) => {
                                    const dt = rh.newSchedule?.dayTimings?.[d] || rh.newSchedule?.timing;
                                    return (
                                      <span
                                        key={d}
                                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                                          isDark ? "bg-neutral-900 border-neutral-700 text-neutral-200" : "bg-[#FFFFFF] border-[#A7F3D0] text-[#171717]"
                                        }`}
                                      >
                                        {d.slice(0, 3)}: {formatTime12h(dt?.startTime)}
                                      </span>
                                    );
                                  })}
                                </div>
                                {expandedRestartEdits[entryKey] && Array.isArray(rh.editHistory) && rh.editHistory.length > 0 && (
                                  <div className={`pt-2 border-t space-y-1.5 ${isDark ? "border-neutral-800" : "border-[#A7F3D0]"}`}>
                                    {rh.editHistory.slice().reverse().map((ed: any, eIdx: number) => (
                                      <div key={ed.id || eIdx} className="text-[11px] flex flex-wrap justify-between gap-1" style={{ color: isDark ? "#D4D4D4" : "#374151" }}>
                                        <span>
                                          <strong>{ed.editedByName || "Admin"}</strong> updated → Start: {safeFormatDate(ed.newValues?.restartDate, "dd MMM yyyy", "—")}, Duration: {ed.newValues?.durationMinutes || 60}m, Teacher: {ed.newValues?.teacherName || "Unassigned"}
                                        </span>
                                        <span className="font-mono text-[10px]" style={{ color: "#6B7280" }}>
                                          {safeFormatDate(ed.editedAt, "dd MMM yyyy, HH:mm", "")}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                                <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Pause Date</span>
                                <span className="font-semibold mt-0.5 block" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                  {safeFormatDate(rh.pauseDate, "dd MMM yyyy", "—")}
                                </span>
                              </div>
                              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                                <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Restart Date</span>
                                <span className="font-semibold mt-0.5 block" style={{ color: rh.restartDate ? (isDark ? "#34D399" : "#047857") : "#B45309" }}>
                                  {rh.restartDate ? safeFormatDate(rh.restartDate, "dd MMM yyyy", "—") : "Currently Paused"}
                                </span>
                              </div>
                              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                                <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Previous Teacher</span>
                                <span className="font-semibold mt-0.5 block truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                  {rh.previousTeacherName || "Unassigned"}
                                </span>
                              </div>
                              <div className={`p-2.5 rounded-xl border ${isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                                <span className="text-[10px] uppercase font-semibold block" style={{ color: "#6B7280" }}>Previous Schedule</span>
                                <span className="font-semibold mt-0.5 block truncate" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                  {prevDaysStr} · {prevTimeStr}
                                </span>
                              </div>
                            </div>

                            <div className={`px-3 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                              isDark ? "bg-neutral-900/50 border-neutral-800" : "bg-[#FFF7E6] border-[#FDE68A]"
                            }`}>
                              <span>
                                <strong style={{ color: isDark ? "#FBBF24" : "#B45309" }}>Reason for Pausing:</strong>{" "}
                                <span style={{ color: isDark ? "#E5E7EB" : "#171717" }}>{rh.reason || "—"}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setExpandedArchiveIds((prev) => ({ ...prev, [entryKey]: !prev[entryKey] }))}
                                className="text-[11px] font-semibold flex items-center gap-1 cursor-pointer hover:underline"
                                style={{ color: isDark ? "#34D399" : "#047857" }}
                              >
                                {isArchiveExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                <span>{isArchiveExpanded ? "Hide" : "View"} Previous Class Records ({archivedRows.length})</span>
                              </button>
                            </div>

                            {isArchiveExpanded && (
                              <div className={`rounded-xl border overflow-hidden ${isDark ? "border-neutral-800 bg-neutral-900/60" : "border-[#E5E7EB] bg-[#FFFFFF]"}`}>
                                {archivedRows.length === 0 ? (
                                  <p className="p-3 text-xs text-center" style={{ color: "#6B7280" }}>
                                    No archived class records in this pause window.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto max-h-60 custom-scrollbar">
                                    <table className="w-full text-left text-xs">
                                      <thead style={{ backgroundColor: isDark ? "rgba(10, 10, 10, 0.8)" : "#F9FAFB", color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                        <tr>
                                          <th className="py-2 px-3">Date</th>
                                          <th className="py-2 px-3">Time</th>
                                          <th className="py-2 px-3">Teacher</th>
                                          <th className="py-2 px-3">Status</th>
                                          <th className="py-2 px-3">Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody className={`divide-y ${isDark ? "divide-neutral-800" : "divide-[#E5E7EB]"}`}>
                                        {archivedRows.map((ar: any, aIdx: number) => (
                                          <tr key={ar.scheduleId || aIdx}>
                                            <td className="py-2 px-3 whitespace-nowrap font-medium" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
                                              {safeFormatDate(ar.date, "dd MMM yyyy", "Session")}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px]" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                              {ar.startTime || "—"}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                                              {ar.teacherName || rh.previousTeacherName || "—"}
                                            </td>
                                            <td className="py-2 px-3 whitespace-nowrap">
                                              <span
                                                className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                                                style={
                                                  ar.status === "Completed"
                                                    ? isDark
                                                      ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                                      : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                                    : isDark
                                                    ? { backgroundColor: "rgba(156, 163, 175, 0.15)", borderColor: "rgba(156, 163, 175, 0.3)", color: "#9CA3AF" }
                                                    : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                                                }
                                              >
                                                {ar.status || "Archived"}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 truncate max-w-[180px]" style={{ color: "#6B7280" }}>
                                              {ar.subject || ar.notes || "Archived"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fees & Payment Summary Section */}
                {canViewPayments && (
                <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className={`flex items-center gap-2 font-semibold text-sm uppercase tracking-widest ${isDark ? "text-neutral-400" : "text-[#4B5563]"}`}>
                <CreditCard className="w-4 h-4" style={{ color: isDark ? "#F59E0B" : "#B45309" }} />
                <span>Fees &amp; Payment Summary</span>
              </div>
              {paymentData?.hasPayment && paymentData.payment.remainingAmount > 0 && (
                <button
                  onClick={() => setShowRecordPaymentModal(true)}
                  className="px-3 py-1.5 brand-gradient font-bold text-xs rounded-xl flex items-center gap-1.5 transition-opacity hover:opacity-90 shadow-sm cursor-pointer"
                  style={{ color: "#171717" }}
                >
                  <Receipt className="w-3.5 h-3.5" style={{ color: "#171717" }} />
                  <span style={{ color: "#171717" }}>Record Payment</span>
                </button>
              )}
            </div>

            {paymentData?.hasPayment ? (
              <div
                className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
                  isDark ? "bg-neutral-800/20 border-neutral-800/50" : "bg-[#FFFFFF] border-[#E5E7EB]"
                }`}
                style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
              >
                {/* Status & Key Stats */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                  <div>
                    <span className="text-[10px] uppercase font-bold block" style={{ color: "#6B7280" }}>Payment Status</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="px-2.5 py-1 rounded-md text-xs font-bold border inline-flex items-center gap-1.5"
                        style={
                          paymentData.payment.paymentStatus === "Paid"
                            ? isDark
                              ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#34D399" }
                              : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                            : paymentData.payment.paymentStatus === "Due" || paymentData.payment.paymentStatus === "Overdue"
                            ? isDark
                              ? { backgroundColor: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.2)", color: "#F87171" }
                              : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                            : isDark
                            ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)", color: "#FBBF24" }
                            : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                        }
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${paymentData.payment.paymentStatus === "Paid" ? "bg-emerald-500" : paymentData.payment.paymentStatus === "Due" ? "bg-red-500" : "bg-amber-500"}`} />
                        {paymentData.payment.paymentStatus === "Due" ? "Payment Due" : paymentData.payment.paymentStatus === "Paid" ? "Paid" : paymentData.payment.paymentStatus === "Upcoming" ? "Upcoming Reminder" : paymentData.payment.paymentStatus}
                      </span>
                      <span className="text-xs font-medium" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>({paymentData.payment.paymentType})</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] uppercase font-bold block" style={{ color: "#6B7280" }}>Outstanding Balance</span>
                    <span
                      className="text-base sm:text-lg font-black block mt-0.5"
                      style={{ color: paymentData.payment.remainingAmount === 0 ? (isDark ? "#34D399" : "#047857") : (isDark ? "#FBBF24" : "#B45309") }}
                    >
                      ₹{Number(paymentData.payment.remainingAmount).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* 4 Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs">
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-neutral-900/80 border-neutral-800/80" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                    <span className="block text-[10px] uppercase font-semibold" style={{ color: "#6B7280" }}>Total Fee</span>
                    <span className="font-bold text-sm mt-0.5 block" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                      ₹{Number(paymentData.payment.totalFee).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div
                    className="p-3 rounded-xl border"
                    style={
                      isDark
                        ? { backgroundColor: "rgba(23, 23, 23, 0.8)", borderColor: "rgba(38, 38, 38, 0.8)" }
                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
                    }
                  >
                    <span className="block text-[10px] uppercase font-semibold" style={{ color: isDark ? "#6B7280" : "#047857" }}>Amount Paid</span>
                    <span className="font-bold text-sm mt-0.5 block" style={{ color: isDark ? "#34D399" : "#047857" }}>
                      ₹{Number(paymentData.payment.amountPaid).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-neutral-900/80 border-neutral-800/80" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                    <span className="block text-[10px] uppercase font-semibold" style={{ color: "#6B7280" }}>Classes Completed</span>
                    <span className="font-bold text-sm mt-0.5 block" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                      {paymentData.payment.completedClasses} / {paymentData.payment.assignedClasses}
                    </span>
                  </div>
                  <div
                    className="p-3 rounded-xl border"
                    style={
                      isDark
                        ? { backgroundColor: "rgba(23, 23, 23, 0.8)", borderColor: "rgba(38, 38, 38, 0.8)" }
                        : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                    }
                  >
                    <span className="block text-[10px] uppercase font-semibold" style={{ color: isDark ? "#6B7280" : "#B45309" }}>Due After</span>
                    <span className="font-bold text-sm mt-0.5 block" style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
                      {paymentData.payment.dueAfterClasses} Classes
                    </span>
                  </div>
                </div>

                {/* Due Progress Bar */}
                <div className={`p-3.5 rounded-xl border space-y-2 ${isDark ? "bg-neutral-950/60 border-neutral-800/80" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold" style={{ color: isDark ? "#D4D4D4" : "#171717" }}>
                      Class Due Trigger Progress:
                    </span>
                    <span className="font-bold" style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
                      {paymentData.payment.completedClasses >= paymentData.payment.dueAfterClasses
                        ? "Trigger Met (Payment Due)"
                        : `${paymentData.payment.dueAfterClasses - paymentData.payment.completedClasses} classes remaining until due`}
                    </span>
                  </div>
                  <div className="relative w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#262626" : "#E5E7EB" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        backgroundColor: "#10B981",
                        width: `${Math.min(
                          100,
                          Math.round((paymentData.payment.completedClasses / paymentData.payment.assignedClasses) * 100)
                        )}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1.5 z-10"
                      style={{
                        backgroundColor: "#F59E0B",
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
                  <div className="space-y-2 pt-2 border-t" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                    <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                      Payment History ({paymentData.payment.paymentHistory.length})
                    </span>
                    <div className="space-y-2">
                      {paymentData.payment.paymentHistory.map((tx: any, idx: number) => (
                        <div
                          key={tx.id || idx}
                          className={`p-3 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                            isDark ? "bg-neutral-900/60 border-neutral-800/80" : "bg-[#F9FAFB] border-[#E5E7EB]"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>Payment #{paymentData.payment.paymentHistory.length - idx}</span>
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-full border"
                                style={
                                  isDark
                                    ? { backgroundColor: "#262626", borderColor: "#262626", color: "#9CA3AF" }
                                    : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                                }
                              >
                                {tx.paymentType || "Payment"}
                              </span>
                            </div>
                            <p className="text-[11px] mt-0.5" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                              {tx.paymentDate ? format(new Date(tx.paymentDate), "dd MMM yyyy") : "-"} · {tx.paymentMethod} {tx.transactionId ? `· Ref: ${tx.transactionId}` : ""}
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="font-extrabold text-sm" style={{ color: isDark ? "#34D399" : "#047857" }}>
                              ₹{Number(tx.amount).toLocaleString("en-IN")}
                            </span>
                            <span className="text-[11px] block" style={{ color: "#6B7280" }}>
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
              <div
                className={`rounded-2xl border p-6 text-center space-y-3 ${
                  isDark ? "bg-neutral-800/20 border-neutral-800/50" : "bg-[#FFFFFF] border-[#E5E7EB]"
                }`}
                style={!isDark ? { boxShadow: "0 1px 4px rgba(23, 23, 23, 0.04)" } : undefined}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${isDark ? "bg-neutral-800 text-neutral-500" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
                  <CreditCard className="w-5 h-5" style={{ color: isDark ? "#737373" : "#4B5563" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>No payment record found</p>
                  <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                    Admission fee has not been recorded yet for this student.
                  </p>
                </div>
                <button
                  onClick={() => setShowAdmissionPaymentModal(true)}
                  className="px-4 py-2 brand-gradient font-bold text-xs rounded-xl inline-flex items-center gap-1.5 transition-opacity hover:opacity-90 shadow-sm cursor-pointer"
                  style={{ color: "#171717" }}
                >
                  <Plus className="w-4 h-4" style={{ color: "#171717" }} />
                  <span style={{ color: "#171717" }}>Collect Admission Fee</span>
                </button>
              </div>
            )}
                </div>
                )}
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
              className="bg-neutral-900 border border-emerald-500/40 rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar"
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
                      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${(selectedLevel || getNextLevelSuggestion()) === lvl
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
                  <span className={`text-[10px] font-medium ${selectedTeacher === "__unassigned__" ? "text-amber-400" : "text-emerald-400"}`}>
                    {selectedTeacher === "__unassigned__" ? "Tutor Unassigned" : "Assigned Teacher"}
                  </span>
                </label>
                <select
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-all"
                >
                  <option value="">Keep current teacher or select new...</option>
                  <option value="__unassigned__">Tutor is Unassigned</option>
                  {allTeachers.map((t: any) => (
                    <option key={t._id} value={t._id}>
                      {t.name} {t.specialization ? `(${t.specialization})` : ""}
                    </option>
                  ))}
                </select>
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
                  {WEEKDAY_ORDER.map((day) => {
                    const isSelected = selectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDays(selectedDays.filter((d) => d !== day));
                            setNextLevelDayTimings((prev) => {
                              const next = { ...prev };
                              delete next[day];
                              return next;
                            });
                          } else {
                            setSelectedDays(WEEKDAY_ORDER.filter((d) => d === day || selectedDays.includes(d)));
                            setNextLevelDayTimings((prev) => ({
                              ...prev,
                              [day]: prev[day] || {
                                startTime: startTime || "09:00",
                                endTime: endTime || computeEndTime(startTime || "09:00", 60),
                              },
                            }));
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${isSelected
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

              {/* Class Timings (Same or Different Per Day) */}
              <div className="space-y-2.5 bg-neutral-800/40 border border-neutral-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Class Schedule Timing</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {nextLevelTimeMode === "different" ? "Different Per Day" : "Same Every Day"}
                  </span>
                </div>

                {/* Mode Switcher */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-neutral-900/80 rounded-xl border border-neutral-700/70">
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackEnd = endTime || computeEndTime(startTime || "09:00", 60);
                      const synced: Record<string, { startTime: string; endTime: string }> = {};
                      selectedDays.forEach((d) => {
                        synced[d] = { startTime: startTime || "09:00", endTime: fallbackEnd };
                      });
                      setNextLevelDayTimings(synced);
                      setNextLevelTimeMode("same");
                    }}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      nextLevelTimeMode === "same"
                        ? "bg-emerald-500 text-black font-bold shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Same time for all days</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNextLevelDayTimings((prev) => {
                        const updated = { ...prev };
                        selectedDays.forEach((d) => {
                          if (!updated[d]?.startTime) {
                            updated[d] = {
                              startTime: startTime || "09:00",
                              endTime: endTime || computeEndTime(startTime || "09:00", 60),
                            };
                          }
                        });
                        return updated;
                      });
                      setNextLevelTimeMode("different");
                    }}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      nextLevelTimeMode === "different"
                        ? "bg-emerald-500 text-black font-bold shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Different time for each day</span>
                  </button>
                </div>

                {nextLevelTimeMode === "same" ? (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 flex items-center justify-between mb-1">
                          <span>Start Time</span>
                          <span className="text-emerald-400 font-semibold">{formatTime12h(startTime)}</span>
                        </span>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            const durMins = inferDurationMins(startTime, endTime);
                            const newEnd = computeEndTime(newStart, durMins);
                            setStartTime(newStart);
                            setEndTime(newEnd);
                            const synced: Record<string, { startTime: string; endTime: string }> = {};
                            selectedDays.forEach((d) => {
                              synced[d] = { startTime: newStart, endTime: newEnd };
                            });
                            setNextLevelDayTimings(synced);
                          }}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 flex items-center justify-between mb-1">
                          <span>End Time</span>
                          <span className="text-neutral-300 font-semibold">{formatTime12h(endTime)}</span>
                        </span>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => {
                            const newEnd = e.target.value;
                            setEndTime(newEnd);
                            const synced: Record<string, { startTime: string; endTime: string }> = {};
                            selectedDays.forEach((d) => {
                              synced[d] = { startTime: startTime || "09:00", endTime: newEnd };
                            });
                            setNextLevelDayTimings(synced);
                          }}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 transition-all font-mono"
                        />
                      </div>
                    </div>
                    {selectedDays.length > 0 && (
                      <p className="text-[10px] text-neutral-400">
                        Applies to: <span className="text-white font-medium">{selectedDays.join(", ")}</span> at{" "}
                        <span className="text-emerald-400 font-semibold">{formatTime12h(startTime)} – {formatTime12h(endTime)}</span>
                      </p>
                    )}
                  </div>
                ) : selectedDays.length === 0 ? (
                  <p className="text-[11px] text-neutral-400 text-center py-2">
                    Select one or more Days of Week above to configure different timings per day.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                    {WEEKDAY_ORDER.filter((day) => selectedDays.includes(day)).map((day) => {
                      const dTiming = nextLevelDayTimings[day] || {
                        startTime: startTime || "09:00",
                        endTime: endTime || computeEndTime(startTime || "09:00", 60),
                      };
                      return (
                        <div
                          key={day}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-neutral-900/80 border border-neutral-700/70"
                        >
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold min-w-[82px] text-center">
                              {day}
                            </span>
                            <span className="text-[10px] text-neutral-400 whitespace-nowrap sm:hidden">
                              {formatTime12h(dTiming.startTime)} – {formatTime12h(dTiming.endTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                            <input
                              type="time"
                              value={dTiming.startTime || "09:00"}
                              aria-label={`${day} next level start time`}
                              onChange={(e) => {
                                const newStart = e.target.value;
                                const durMins = inferDurationMins(dTiming.startTime, dTiming.endTime);
                                const newEnd = computeEndTime(newStart, durMins);
                                setNextLevelDayTimings((prev) => ({
                                  ...prev,
                                  [day]: { startTime: newStart, endTime: newEnd },
                                }));
                              }}
                              className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-500 font-mono"
                            />
                            <span className="text-[10px] text-neutral-500">to</span>
                            <input
                              type="time"
                              value={dTiming.endTime || computeEndTime(dTiming.startTime || "09:00", 60)}
                              aria-label={`${day} next level end time`}
                              onChange={(e) => {
                                const newEnd = e.target.value;
                                setNextLevelDayTimings((prev) => ({
                                  ...prev,
                                  [day]: {
                                    startTime: dTiming.startTime || startTime || "09:00",
                                    endTime: newEnd,
                                  },
                                }));
                              }}
                              className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-500 font-mono"
                            />
                            <span className="hidden sm:inline text-[10px] text-emerald-400 font-medium whitespace-nowrap ml-1">
                              {formatTime12h(dTiming.startTime)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                        className={`text-[10px] px-2 py-0.5 rounded border transition-all ${Number(numberOfClasses) === num
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

              {/* Previous Payment History */}
              <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Previous Payment History</span>
                  </div>
                  {paymentData?.hasPayment && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${paymentData.payment.paymentStatus === 'Paid'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : paymentData.payment.paymentStatus === 'Due' || paymentData.payment.paymentStatus === 'Overdue'
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                      Status: {paymentData.payment.paymentStatus}
                    </span>
                  )}
                </div>

                {paymentData?.hasPayment ? (
                  <div className="space-y-2.5">
                    {/* Previous Fee Metrics */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-neutral-900/60 rounded-lg border border-neutral-800/60 text-center">
                      <div>
                        <span className="text-[10px] text-neutral-400 block">Total Fee</span>
                        <span className="text-xs font-bold text-white">₹{Number(paymentData.payment.totalFee || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block">Paid</span>
                        <span className="text-xs font-bold text-emerald-400">₹{Number(paymentData.payment.amountPaid || 0).toLocaleString("en-IN")}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 block">Balance</span>
                        <span className={`text-xs font-bold ${Number(paymentData.payment.remainingAmount || 0) > 0 ? "text-amber-400" : "text-neutral-400"}`}>
                          ₹{Number(paymentData.payment.remainingAmount || 0).toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    {/* Previous Transactions List */}
                    {paymentData.payment.paymentHistory && paymentData.payment.paymentHistory.length > 0 ? (
                      <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                        {paymentData.payment.paymentHistory.map((tx: any, idx: number) => (
                          <div
                            key={tx._id || tx.id || idx}
                            className="p-2 bg-neutral-900/80 border border-neutral-800 rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-white text-[11px]">
                                  {tx.level ? `[${tx.level}] ` : ""}Payment #{paymentData.payment.paymentHistory.length - idx}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                                  {tx.paymentMethod || "Payment"}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-400 mt-0.5">
                                {tx.paymentDate ? format(new Date(tx.paymentDate), "dd MMM yyyy") : "-"}
                                {tx.notes ? ` · ${tx.notes}` : ""}
                              </p>
                            </div>
                            <span className="font-bold text-emerald-400 text-xs shrink-0">
                              +₹{Number(tx.amount || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-neutral-400 italic text-center py-1">
                        No individual transaction receipts recorded yet.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2.5 px-3 bg-neutral-900/40 rounded-lg border border-neutral-800/60">
                    <p className="text-xs text-neutral-400">No previous payment records found for this student.</p>
                  </div>
                )}
              </div>

              {/* Next Level Payment Details */}
              <div className="bg-neutral-800/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Next Level Payment Details</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recordNextLevelPayment}
                      onChange={(e) => setRecordNextLevelPayment(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-800"
                    />
                    <span className="text-[11px] text-emerald-300 font-medium">Record Payment</span>
                  </label>
                </div>

                {recordNextLevelPayment && (
                  <div className="space-y-3 pt-1">
                    {/* Course Total Fee */}
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Course Fee (₹)</span>
                        <span className="text-[10px] text-emerald-400 font-medium">Total Fee for Level</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-neutral-500 font-bold">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={nextLevelTotalFee}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setNextLevelTotalFee(val);
                            if (nextLevelPaymentType === "Full Payment") setNextLevelAmountPaid(val);
                            else if (nextLevelPaymentType === "Half Payment") setNextLevelAmountPaid(Math.round(val / 2));
                            else if (nextLevelPaymentType === "Pending") setNextLevelAmountPaid(0);
                          }}
                          placeholder="e.g. 15000"
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-7 pr-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-semibold"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {[10000, 12000, 15000, 18000, 20000, 25000].map((fee) => (
                          <button
                            key={fee}
                            type="button"
                            onClick={() => {
                              setNextLevelTotalFee(fee);
                              if (nextLevelPaymentType === "Full Payment") setNextLevelAmountPaid(fee);
                              else if (nextLevelPaymentType === "Half Payment") setNextLevelAmountPaid(Math.round(fee / 2));
                              else if (nextLevelPaymentType === "Pending") setNextLevelAmountPaid(0);
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-all ${nextLevelTotalFee === fee
                                ? "bg-emerald-500 text-black border-emerald-400 font-bold"
                                : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                              }`}
                          >
                            ₹{fee.toLocaleString("en-IN")}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Payment Option */}
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                        Payment Option
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { id: "Full Payment", label: "Full Payment", sub: "100% Upfront" },
                          { id: "Half Payment", label: "Half Payment", sub: "50% Upfront" },
                          { id: "Custom Payment", label: "Custom", sub: "Specific amount" },
                          { id: "Pending", label: "Pay Later", sub: "Pending" },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setNextLevelPaymentType(opt.id as any);
                              if (opt.id === "Full Payment") setNextLevelAmountPaid(nextLevelTotalFee);
                              else if (opt.id === "Half Payment") setNextLevelAmountPaid(Math.round(nextLevelTotalFee / 2));
                              else if (opt.id === "Pending") setNextLevelAmountPaid(0);
                            }}
                            className={`p-2 rounded-xl border text-left transition-all ${nextLevelPaymentType === opt.id
                                ? "bg-emerald-500/20 border-emerald-500/60 text-white shadow-sm"
                                : "bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white"
                              }`}
                          >
                            <span className="block text-[11px] font-bold">{opt.label}</span>
                            <span className="block text-[9px] text-neutral-400">{opt.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount Paid Now & Balance */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                          Amount Paid Now (₹)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-xs text-neutral-500 font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            max={nextLevelTotalFee}
                            value={nextLevelAmountPaid}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setNextLevelAmountPaid(val);
                              setNextLevelPaymentType("Custom Payment");
                            }}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-7 pr-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-semibold font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                          Remaining Balance
                        </label>
                        <div className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-between">
                          <span className="text-neutral-400">Due:</span>
                          <span className={Math.max(0, nextLevelTotalFee - nextLevelAmountPaid) > 0 ? "text-amber-400" : "text-emerald-400"}>
                            ₹{Math.max(0, nextLevelTotalFee - nextLevelAmountPaid).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Payment Method & Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                          Payment Method
                        </label>
                        <select
                          value={nextLevelPaymentMethod}
                          onChange={(e) => setNextLevelPaymentMethod(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                        >
                          <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                          <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                          <option value="Cash">Cash</option>
                          <option value="Credit Card">Credit / Debit Card</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                          Payment Date
                        </label>
                        <input
                          type="date"
                          value={nextLevelPaymentDate}
                          onChange={(e) => setNextLevelPaymentDate(e.target.value)}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Payment Notes */}
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                        Payment Reference / Notes
                      </label>
                      <input
                        type="text"
                        value={nextLevelPaymentNotes}
                        onChange={(e) => setNextLevelPaymentNotes(e.target.value)}
                        placeholder="e.g. Transaction Ref #, GPay UPI ID, or installment note"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 placeholder:text-neutral-500"
                      />
                    </div>
                  </div>
                )}
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
                    const orderedSelected = WEEKDAY_ORDER.filter((d) => selectedDays.includes(d));
                    const finalDays = orderedSelected.length > 0 ? orderedSelected : ["Monday", "Wednesday", "Friday"];
                    const fallbackStart = startTime || "09:00";
                    const fallbackEnd = endTime || computeEndTime(fallbackStart, 60);
                    const preparedDayTimings: Record<string, { startTime: string; endTime: string }> = {};
                    finalDays.forEach((day) => {
                      const entry = nextLevelTimeMode === "different" ? nextLevelDayTimings[day] : undefined;
                      const dStart = entry?.startTime || fallbackStart;
                      const dEnd = entry?.endTime || (entry?.startTime ? computeEndTime(entry.startTime, inferDurationMins(fallbackStart, fallbackEnd)) : fallbackEnd);
                      preparedDayTimings[day] = { startTime: dStart, endTime: dEnd };
                    });
                    const primaryTiming = preparedDayTimings[finalDays[0]] || { startTime: fallbackStart, endTime: fallbackEnd };

                    advanceLevelMutation.mutate({
                      level: finalLevel,
                      numberOfClasses: Math.max(1, Number(numberOfClasses) || 15),
                      teacherId: selectedTeacher === "__unassigned__" ? null : (selectedTeacher || undefined),
                      timing: primaryTiming,
                      timeMode: nextLevelTimeMode,
                      dayTimings: preparedDayTimings,
                      days: finalDays,
                      meetingLink: meetingLink || undefined,
                      startDate: startDate || format(new Date(), "yyyy-MM-dd"),
                      paymentDetails: recordNextLevelPayment ? {
                        recordPayment: true,
                        totalFee: Number(nextLevelTotalFee) || 0,
                        amountPaid: Number(nextLevelAmountPaid) || 0,
                        paymentType: nextLevelPaymentType,
                        paymentMethod: nextLevelPaymentMethod,
                        paymentDate: nextLevelPaymentDate,
                        notes: nextLevelPaymentNotes,
                      } : undefined,
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

        {/* Reassign Teacher Modal */}
        {showReassignTeacherModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-neutral-900 border border-neutral-700/80 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Reassign Teacher</h3>
                    <p className="text-xs text-neutral-400">Transfer student class management to a new teacher</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReassignTeacherModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {reassignError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reassignError}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/60 flex items-center justify-between">
                  <span className="text-neutral-400">Currently Assigned:</span>
                  <span className="font-semibold text-white">{currentTeacherName}</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Select New Teacher <span className="text-amber-500">*</span>
                  </label>
                  <select
                    value={reassignTeacherId}
                    onChange={(e) => setReassignTeacherId(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  >
                    <option value="">Choose a teacher...</option>
                    {allTeachers.map((t: any) => (
                      <option key={t._id} value={t._id}>
                        {t.name || t.user?.name || "Teacher"} ({t.email || t.user?.email || ""})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Reason for Transfer <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="e.g. Schedule adjustment, student request"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Policy Guarantee Banner */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1 text-amber-300">
                  <p className="font-bold text-xs flex items-center gap-1.5 text-amber-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Reassignment Policy:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-200/90">
                    <li>All upcoming and pending classes will be transferred to the new teacher.</li>
                    <li>All previously completed classes permanently retain the teacher who actually conducted them.</li>
                    <li>The new teacher receives full access to this student's complete class history.</li>
                  </ul>
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReassignTeacherModal(false)}
                  disabled={reassignTeacherMutation.isPending}
                  className="px-3.5 py-2 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reassignTeacherId || reassignTeacherMutation.isPending}
                  onClick={() => reassignTeacherMutation.mutate({ teacherId: reassignTeacherId, reason: reassignReason })}
                  className="px-4 py-2 brand-gradient text-black text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  {reassignTeacherMutation.isPending ? "Transferring..." : "Confirm Reassignment"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Schedule Extra Class Modal */}
        {showScheduleExtraClassModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-neutral-900 border border-purple-500/30 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Schedule Extra Class</h3>
                    <p className="text-xs text-neutral-400">Add an extra or makeup session for {student.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduleExtraClassModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {extraClassError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{extraClassError}</span>
                </div>
              )}

              {/* Notice callout */}
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-200/90 leading-relaxed">
                  <strong>⭐ Extra Class Session:</strong> This session will automatically be marked as an extra class and tracked alongside regular curriculum sessions for batch <strong className="text-white">{student.batch?.name || "Active Batch"}</strong>.
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  Class Date
                </label>
                <input
                  type="date"
                  value={extraClassDate}
                  onChange={(e) => setExtraClassDate(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono"
                />
              </div>

              {/* Timings */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Class Timings</span>
                  </span>
                  <span className="text-[10px] text-purple-400 font-medium">Start & End</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">Start Time</span>
                    <input
                      type="time"
                      value={extraClassStartTime}
                      onChange={(e) => setExtraClassStartTime(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">End Time</span>
                    <input
                      type="time"
                      value={extraClassEndTime}
                      onChange={(e) => setExtraClassEndTime(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Teacher */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Assigned Teacher</span>
                </label>
                <select
                  value={extraClassTeacher}
                  onChange={(e) => setExtraClassTeacher(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all"
                >
                  <option value="">Select teacher...</option>
                  {allTeachers.map((t: any) => (
                    <option key={t._id} value={t._id}>
                      {t.name} {t.specialization ? `(${t.specialization})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject / Topic */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  Topic / Subject Covered
                </label>
                <input
                  type="text"
                  value={extraClassSubject}
                  onChange={(e) => setExtraClassSubject(e.target.value)}
                  placeholder="e.g. Doubt Clearing, Extra Practice, Project Revision"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all"
                />
              </div>

              {/* Reason for Extra Class */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  Reason for Extra Class
                </label>
                <input
                  type="text"
                  value={extraClassReason}
                  onChange={(e) => setExtraClassReason(e.target.value)}
                  placeholder="e.g. Missed session catch-up, Doubts clearing, Exam readiness"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all mb-1.5"
                />
                <div className="flex flex-wrap gap-1">
                  {["Doubt Clearing", "Makeup Class", "Exam Prep", "Topic Catch-up", "Special Request"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setExtraClassReason(r)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-all ${extraClassReason === r
                          ? "bg-purple-600 text-white border-purple-400 font-bold"
                          : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meeting Link */}
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
                  value={extraClassMeetingLink}
                  onChange={(e) => setExtraClassMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/xyz-abc or Zoom link"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-purple-500 transition-all font-mono placeholder:text-neutral-500"
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowScheduleExtraClassModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitExtraClass()}
                  disabled={scheduleExtraClassMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
                >
                  {scheduleExtraClassMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Confirm Extra Class
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Admin Class Progress Correction Modal */}
        {showEditProgressModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-neutral-900 border border-amber-500/30 rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Edit Class Progress</h3>
                    <p className="text-xs text-neutral-400">Admin timetable & session correction for {student.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditProgressModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {progressError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{progressError}</span>
                </div>
              )}

              {/* Informational Callout */}
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong>Admin Source of Truth:</strong> Setting completed sessions and next class date automatically recalculates and regenerates all remaining sessions along the assigned weekly class days (<strong className="text-white">{student.batch?.days?.join(", ") || "Assigned Days"}</strong>). All historical completed classes and attendance records are strictly preserved.
                </div>
              </div>

              {/* Course Progress Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Total Course Sessions */}
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Total Course Sessions
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={progressTotalSessions}
                    onChange={(e) => setProgressTotalSessions(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                    placeholder="e.g. 25"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">Full course session target</span>
                </div>

                {/* Completed Sessions */}
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Completed Sessions
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={progressTotalSessions}
                    value={progressCompletedSessions}
                    onChange={(e) => handleCompletedSessionsChange(Number(e.target.value))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                    placeholder="e.g. 17"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">Sessions completed to date</span>
                </div>
              </div>

              {/* Next Session Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Next Session Number */}
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Next Session Number
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={progressNextSessionNumber}
                    onChange={(e) => setProgressNextSessionNumber(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                    placeholder="e.g. 18"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">Number for upcoming class</span>
                </div>

                {/* Next Class Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Next Class Date
                  </label>
                  <input
                    type="date"
                    value={progressNextClassDate}
                    onChange={(e) => setProgressNextClassDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">Date for next session</span>
                </div>
              </div>

              {/* Timings */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Next Class Timings</span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-medium">Start & End</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">Start Time</span>
                    <input
                      type="time"
                      value={progressNextClassStartTime}
                      onChange={(e) => {
                        setProgressNextClassStartTime(e.target.value);
                        const [h, m] = e.target.value.split(":").map(Number);
                        if (!isNaN(h)) {
                          const endH = (h + 1) % 24;
                          setProgressNextClassEndTime(`${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`);
                        }
                      }}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 block mb-1">End Time</span>
                    <input
                      type="time"
                      value={progressNextClassEndTime}
                      onChange={(e) => setProgressNextClassEndTime(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Live Preview Box */}
              <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300 border-b border-neutral-800/80 pb-1.5">
                  <span className="flex items-center gap-1 text-amber-400">
                    <Calendar className="w-3.5 h-3.5" />
                    Dynamic Timetable Regeneration Preview
                  </span>
                  <span className="text-neutral-400 font-normal">
                    Batch: <strong className="text-white">{student.batch?.name || "Active Batch"}</strong>
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-neutral-300 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Course Progress:</span>
                    <span className="font-semibold text-emerald-400">
                      {progressCompletedSessions} of {progressTotalSessions} completed ({progressTotalSessions > 0 ? Math.min(100, Math.round((progressCompletedSessions / progressTotalSessions) * 100)) : 0}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Next Scheduled Class:</span>
                    <span className="font-semibold text-white">
                      Class #{progressNextSessionNumber} on {safeFormatDate(progressNextClassDate, "dd MMM yyyy (EEE)", progressNextClassDate)} at {progressNextClassStartTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Remaining Classes to Generate:</span>
                    <span className="font-semibold text-amber-300">
                      {progressNextSessionNumber < progressTotalSessions ? (
                        <>Classes #{progressNextSessionNumber + 1}–#{progressTotalSessions} ({progressTotalSessions - progressNextSessionNumber} sessions) on {student.batch?.days?.join(", ") || "assigned days"}</>
                      ) : progressNextSessionNumber === progressTotalSessions ? (
                        <>Final session (Class #{progressTotalSessions})</>
                      ) : (
                        <>None (course marked completed)</>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirmation Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowEditProgressModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmitProgressCorrection()}
                  disabled={correctProgressMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl brand-gradient text-black text-xs font-bold transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {correctProgressMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Apply Progress Correction
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Change Batch Modal (e.g. Change to Group Batch / Switch Batch) */}
        {showChangeBatchModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-neutral-900 border border-purple-500/30 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {isOneToOneBatch ? "Change to Group Batch" : "Change Batch"}
                    </h3>
                    <p className="text-xs text-neutral-400">Move {student.name} to another batch</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChangeBatchModal(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {changeBatchError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{changeBatchError}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/60 flex items-center justify-between">
                  <span className="text-neutral-400">Current Batch:</span>
                  <span className="font-semibold text-white">{student.batch?.name || "Unassigned"}</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                    Select Target Batch <span className="text-purple-400">*</span>
                  </label>
                  <select
                    value={changeBatchId}
                    onChange={(e) => setChangeBatchId(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="">Choose a batch...</option>
                    {allBatches
                      .filter((b: any) => b.status !== "Dropped" && b.status !== "Cancelled")
                      .map((b: any) => {
                        const formatLabel = (b.name || "").includes("1:1") || (b.studentsCount !== undefined && b.studentsCount <= 1) ? "1:1" : "Group";
                        return (
                          <option key={b._id} value={b._id}>
                            [{formatLabel}] {b.name} — {b.subject || "General"}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowChangeBatchModal(false)}
                  disabled={changeBatchMutation.isPending}
                  className="px-3.5 py-2 text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!changeBatchId || changeBatchId === currentBatchId || changeBatchMutation.isPending}
                  onClick={() => changeBatchMutation.mutate(changeBatchId)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white keep-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-1.5 shadow-md"
                >
                  {changeBatchMutation.isPending ? "Updating..." : "Confirm Batch Change"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Pause Classes Modal */}
        {showPauseModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`border rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative space-y-4 ${
                isDark ? "bg-neutral-900 border-amber-500/30" : "bg-[#FFFFFF] border-[#E5E7EB]"
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={
                      isDark
                        ? { backgroundColor: "rgba(245, 158, 11, 0.2)", borderColor: "rgba(245, 158, 11, 0.3)" }
                        : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                    }
                  >
                    <PauseCircle className="w-4 h-4" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>Pause Student Classes</h3>
                    <p className="text-xs" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>{student.name} · Archive upcoming schedule safely</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {pauseError && (
                <div className="p-3 rounded-xl border text-xs flex items-center gap-2" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{pauseError}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div className={`p-3 rounded-xl border space-y-1 ${isDark ? "bg-neutral-800/50 border-neutral-700" : "bg-[#F9FAFB] border-[#E5E7EB]"}`}>
                  <div className="flex justify-between">
                    <span style={{ color: "#6B7280" }}>Preserved Progress:</span>
                    <strong style={{ color: isDark ? "#34D399" : "#047857" }}>{currentCompletedCount} / {currentClassesNeeded} Completed</strong>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#6B7280" }}>Remaining Classes:</span>
                    <strong style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{currentRemainingCount} classes</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                    Pause Date <span style={{ color: "#F59E0B" }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={pauseDateInput}
                    onChange={(e) => setPauseDateInput(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 ${
                      isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                    Reason for Pausing <span style={{ color: "#F59E0B" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={pauseReasonInput}
                    onChange={(e) => setPauseReasonInput(e.target.value)}
                    placeholder="e.g. School exams, family travel, personal break"
                    className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-500 mb-2 ${
                      isDark ? "bg-neutral-800 border-neutral-700 text-white placeholder-neutral-500" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717] placeholder-[#6B7280]"
                    }`}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {["School Exams", "Family Vacation", "Medical / Health", "Personal Break"].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setPauseReasonInput(chip)}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-semibold cursor-pointer ${
                          isDark ? "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-amber-500/40" : "bg-[#F3F4F6] border-[#E5E7EB] text-[#4B5563] hover:bg-[#FFF7E6]"
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-end gap-2" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                <button
                  type="button"
                  onClick={() => setShowPauseModal(false)}
                  disabled={pauseClassesMutation.isPending}
                  className="px-3.5 py-2 text-xs font-semibold cursor-pointer"
                  style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pauseDateInput || !pauseReasonInput.trim() || pauseClassesMutation.isPending}
                  onClick={() => pauseClassesMutation.mutate({ pauseDate: pauseDateInput, reason: pauseReasonInput.trim() })}
                  className="px-4 py-2 brand-gradient text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  style={{ color: "#171717" }}
                >
                  <PauseCircle className="w-3.5 h-3.5" style={{ color: "#171717" }} />
                  <span style={{ color: "#171717" }}>
                    {pauseClassesMutation.isPending ? "Pausing..." : "Confirm Pause"}
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Restart / Edit Restart Classes Modal */}
        {showRestartModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className={`border rounded-2xl p-5 sm:p-6 w-full max-w-xl shadow-2xl relative space-y-4 max-h-[92vh] overflow-y-auto ${
                isDark ? "bg-neutral-900 border-emerald-500/30" : "bg-[#FFFFFF] border-[#E5E7EB]"
              }`}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg border flex items-center justify-center"
                    style={
                      isDark
                        ? { backgroundColor: "rgba(16, 185, 129, 0.2)", borderColor: "rgba(16, 185, 129, 0.3)" }
                        : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
                    }
                  >
                    {restartModalMode === "edit" ? (
                      <Edit2 className="w-4 h-4" style={{ color: isDark ? "#34D399" : "#047857" }} />
                    ) : (
                      <RotateCcw className="w-4 h-4" style={{ color: isDark ? "#34D399" : "#047857" }} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                      {restartModalMode === "edit" ? "Edit Restart Details" : "Restart Classes"}
                    </h3>
                    <p className="text-xs" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                      {student.name} · Configure independent start times per class day
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRestartModal(false)}
                  className="p-1.5 rounded-lg cursor-pointer"
                  style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {restartError && (
                <div className="p-3 rounded-xl border text-xs flex items-center gap-2" style={{ backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{restartError}</span>
                </div>
              )}

              <div className="space-y-3.5 text-xs">
                <div
                  className="p-3 rounded-xl border space-y-1"
                  style={
                    isDark
                      ? { backgroundColor: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.25)" }
                      : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }
                  }
                >
                  <p className="font-semibold" style={{ color: isDark ? "#34D399" : "#047857" }}>
                    Preserving {currentCompletedCount} completed of {currentClassesNeeded} classes ({currentRemainingCount} remaining)
                  </p>
                  <p className="text-[11px]" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                    {restartModalMode === "edit"
                      ? "Only affected upcoming regular sessions are updated or recalculated. Completed class records stay untouched."
                      : `Previous schedules move to Archived History (never deleted) and ${currentRemainingCount} remaining class(es) will be scheduled from your selected restart date.`}
                  </p>
                </div>

                {/* Already Marked Class Records Summary */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isDark ? "bg-neutral-900/70 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"
                  }`}
                >
                  <div
                    className={`px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 ${
                      isDark ? "border-neutral-800 bg-neutral-800/40" : "border-[#E5E7EB] bg-[#FFFFFF]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isDark ? "#E5E7EB" : "#171717" }}>
                        Already Marked Class Records ({alreadyMarkedRecords.length})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                        style={
                          isDark
                            ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                            : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                        }
                      >
                        {markedCompletedListCount} Completed
                      </span>
                      {verifiedPreCompletedGap > 0 && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                              : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                          }
                        >
                          +{verifiedPreCompletedGap} Verified Pre-Completed
                        </span>
                      )}
                    </div>
                  </div>

                  {alreadyMarkedRecords.length > 0 ? (
                    <div className="max-h-44 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-[11px]">
                        <thead
                          style={{
                            backgroundColor: isDark ? "rgba(23, 23, 23, 0.7)" : "#F3F4F6",
                            color: isDark ? "#9CA3AF" : "#4B5563",
                          }}
                        >
                          <tr>
                            <th className="py-1.5 px-2.5 font-semibold">Class</th>
                            <th className="py-1.5 px-2.5 font-semibold">Date</th>
                            <th className="py-1.5 px-2 font-semibold">Status</th>
                            <th className="py-1.5 px-2.5 font-semibold">Teacher</th>
                            <th className="py-1.5 px-2.5 font-semibold">Topic / Notes</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-neutral-800" : "divide-[#E5E7EB]"}`}>
                          {alreadyMarkedRecords.map((rec: any, rIdx: number) => {
                            const rowTeacher =
                              rec.completedByName ||
                              rec.teacherName ||
                              getTeacherName(rec.completedBy) ||
                              getTeacherName(rec.replacementTeacher) ||
                              getTeacherName(rec.teacher) ||
                              currentTeacherName;
                            const classTag = rec.isExtraClass
                              ? "Extra"
                              : rec.sessionNumber
                              ? `Class ${rec.sessionNumber}`
                              : `Class ${rIdx + 1}`;
                            return (
                              <tr key={rec._id || rIdx} className={isDark ? "hover:bg-neutral-800/30" : "hover:bg-[#FFFFFF]"}>
                                <td className="py-1.5 px-2.5 whitespace-nowrap font-semibold" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                                  {classTag}
                                </td>
                                <td className="py-1.5 px-2.5 whitespace-nowrap" style={{ color: isDark ? "#D4D4D4" : "#374151" }}>
                                  {safeFormatDate(rec.date, "dd MMM yyyy", "Session")}
                                  {rec.startTime ? (
                                    <span className="ml-1 font-mono text-[10px]" style={{ color: "#6B7280" }}>
                                      {formatTime12h(rec.startTime)}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-1.5 px-2 whitespace-nowrap">
                                  <span
                                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
                                    style={
                                      rec.status === "Completed" && !rec._isExplicitAbsent
                                        ? isDark
                                          ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                          : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                        : rec.status === "Cancelled" || rec._isExplicitAbsent
                                        ? isDark
                                          ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#F87171" }
                                          : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                                        : isDark
                                        ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                                        : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                                    }
                                  >
                                    {rec._isExplicitAbsent ? "Completed · Absent" : rec.status === "Scheduled" ? "Present" : rec.status}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2.5 whitespace-nowrap truncate max-w-[110px]" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }} title={rowTeacher}>
                                  {rowTeacher}
                                </td>
                                <td className="py-1.5 px-2.5 truncate max-w-[140px]" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }} title={rec.subject || rec.notes || ""}>
                                  {rec.subject || rec.notes || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 text-[11px]" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                      {verifiedPreCompletedGap > 0
                        ? `${verifiedPreCompletedGap} verified pre-completed class(es) from student batch progress will be preserved on restart.`
                        : `No classes have been marked Completed, Absent, or Cancelled yet — all ${currentClassesNeeded} sessions will be scheduled from your selected restart date.`}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                      {restartModalMode === "edit" ? "Restart Date" : "New Restart Date"} <span style={{ color: "#10B981" }}>*</span>
                    </label>
                    <input
                      type="date"
                      value={restartDateInput}
                      onChange={(e) => setRestartDateInput(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                        isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                      Teacher / Tutor
                    </label>
                    <select
                      value={restartTeacherId}
                      onChange={(e) => setRestartTeacherId(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 ${
                        isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                      }`}
                    >
                      <option value="__unassigned__">Tutor is Unassigned</option>
                      {allTeachers.map((t: any) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Class Duration */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                      Class Duration (Minutes)
                    </label>
                    <span className="text-[11px] font-bold" style={{ color: isDark ? "#FBBF24" : "#B45309" }}>
                      {restartDurationMinutes} mins per class
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[30, 45, 60, 75, 90, 120].map((mins) => {
                      const active = restartDurationMinutes === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => handleChangeRestartDuration(mins)}
                          className="text-[11px] px-2.5 py-1 rounded-lg border font-semibold cursor-pointer"
                          style={
                            active
                              ? { backgroundColor: "#F59E0B", borderColor: "#F59E0B", color: "#171717" }
                              : isDark
                              ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#D4D4D4" }
                              : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                          }
                        >
                          {mins}m
                        </button>
                      );
                    })}
                    <input
                      type="number"
                      min={15}
                      max={360}
                      step={5}
                      value={restartDurationMinutes}
                      onChange={(e) => handleChangeRestartDuration(Number(e.target.value) || 60)}
                      aria-label="Custom duration minutes"
                      className={`w-20 border rounded-lg px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-emerald-500 ${
                        isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                      }`}
                    />
                  </div>
                </div>

                {/* Class Days Selection */}
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                    Class Days ({restartDaysInput.length} selected)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_ORDER.map((day) => {
                      const active = restartDaysInput.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => handleToggleRestartDay(day)}
                          className="text-[11px] px-2.5 py-1 rounded-lg border font-semibold cursor-pointer"
                          style={
                            active
                              ? { backgroundColor: "#10B981", borderColor: "#10B981", color: "#FFFFFF" }
                              : isDark
                              ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#9CA3AF" }
                              : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#4B5563" }
                          }
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Individual Start Time per Selected Day */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: isDark ? "#D4D4D4" : "#4B5563" }}>
                      Start Time for Each Class Day <span style={{ color: "#10B981" }}>*</span>
                    </label>
                    <span className="text-[10px]" style={{ color: "#6B7280" }}>
                      End time auto-calculated (+{restartDurationMinutes}m)
                    </span>
                  </div>

                  {restartDaysInput.length === 0 ? (
                    <p
                      className={`p-3 rounded-xl border text-center text-[11px] ${
                        isDark ? "bg-neutral-800/40 border-neutral-800 text-neutral-400" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#6B7280]"
                      }`}
                    >
                      Select at least one class day above to set its independent start time.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {WEEKDAY_ORDER.filter((d) => restartDaysInput.includes(d)).map((day) => {
                        const dayTiming = restartDayTimings[day] || {
                          startTime: "09:00",
                          endTime: computeEndTime("09:00", restartDurationMinutes),
                        };
                        const computedEnd = computeEndTime(dayTiming.startTime || "09:00", restartDurationMinutes);
                        return (
                          <div
                            key={day}
                            className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-2.5 rounded-xl border ${
                              isDark ? "bg-neutral-800/60 border-neutral-700/70" : "bg-[#F9FAFB] border-[#E5E7EB]"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <span
                                className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-center min-w-[88px]"
                                style={
                                  isDark
                                    ? { backgroundColor: "rgba(16, 185, 129, 0.12)", borderColor: "rgba(16, 185, 129, 0.25)", color: "#34D399" }
                                    : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                                }
                              >
                                {day}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 flex-1 justify-end">
                              <input
                                type="time"
                                value={dayTiming.startTime || "09:00"}
                                onChange={(e) => handleChangeRestartDayStart(day, e.target.value)}
                                aria-label={`${day} start time`}
                                className={`border rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500 ${
                                  isDark ? "bg-neutral-900 border-neutral-700 text-white" : "bg-[#FFFFFF] border-[#D1D5DB] text-[#171717]"
                                }`}
                              />
                              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                                {formatTime12h(dayTiming.startTime)} – {formatTime12h(computedEnd)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t flex items-center justify-end gap-2" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                <button
                  type="button"
                  onClick={() => setShowRestartModal(false)}
                  disabled={restartClassesMutation.isPending || updateRestartDetailsMutation.isPending}
                  className="px-3.5 py-2 text-xs font-semibold cursor-pointer"
                  style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    !restartDateInput ||
                    restartDaysInput.length === 0 ||
                    restartClassesMutation.isPending ||
                    updateRestartDetailsMutation.isPending
                  }
                  onClick={handleSubmitRestartModal}
                  className="px-4 py-2 text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: "#10B981", color: "#FFFFFF" }}
                >
                  {restartModalMode === "edit" ? (
                    <Edit2 className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" style={{ color: "#FFFFFF" }} />
                  )}
                  <span style={{ color: "#FFFFFF" }}>
                    {restartClassesMutation.isPending || updateRestartDetailsMutation.isPending
                      ? "Saving..."
                      : restartModalMode === "edit"
                      ? "Save Restart Details"
                      : "Confirm Restart Classes"}
                  </span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Success Toast */}
        <SuccessToast
          message={successToastMessage}
          onClose={() => setSuccessToastMessage(null)}
        />
      </motion.div>
    </div>
  );
}

export default StudentDetailsModal;
