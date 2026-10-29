"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Clock, Edit2, X, AlertTriangle, Users, Search, BookOpen, Calendar, Filter } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearchStore } from "@/store/searchStore";
import { format, parseISO, isBefore } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { SessionNavTabs } from "@/components/dashboard/SessionNavTabs";

export default function CompletedClassesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [modal, setModal] = useState<any>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [filterExtraOnly, setFilterExtraOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { searchQuery: globalSearch, setSearchQuery: setGlobalSearch } = useSearchStore();

  useEffect(() => {
    if (globalSearch !== undefined && globalSearch !== searchQuery) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);
  const [formError, setFormError] = useState<string | null>(null);
  
  const [form, setForm] = useState<{
    subject: string;
    notes: string;
    status: string;
    attendance: any[];
    isExtraClass: boolean;
    startTime: string;
    endTime: string;
    nextExtraClassDate: string;
    nextExtraClassStartTime: string;
    nextExtraClassEndTime: string;
    extraClassReason: string;
  }>({
    subject: "",
    notes: "",
    status: "Completed",
    attendance: [],
    isExtraClass: false,
    startTime: "09:00",
    endTime: "10:00",
    nextExtraClassDate: "",
    nextExtraClassStartTime: "09:00",
    nextExtraClassEndTime: "10:00",
    extraClassReason: "",
  });

  const isTeacher = user?.role === "Teacher";
  const isAdminOrSuper = user?.role === "Admin" || user?.role === "Super Admin";
  const isSubAdmin = user?.role === "Sub Admin";
  const hasAccess = isTeacher || isAdminOrSuper || (isSubAdmin && user?.permissions?.completedClasses?.read);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
    enabled: !!hasAccess,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["all-students"],
    queryFn: async () => (await api.get("/students")).data,
    enabled: !!hasAccess,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
    enabled: !!hasAccess,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
    enabled: !isTeacher && !!hasAccess,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const updateSchedule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["my-performance"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-performance"] });
      setModal(null);
      setFormError(null);
    },
  });

  const studentBatchMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const st of students) {
      if (st._id) {
        const batchSet = new Set<string>();
        const bId = st.batch?._id ? st.batch._id.toString() : (st.batch ? st.batch.toString() : "");
        if (bId) batchSet.add(bId);
        if (st.pastBatches && Array.isArray(st.pastBatches)) {
          st.pastBatches.forEach((pb: any) => {
            const pbId = pb.batch?._id ? pb.batch._id.toString() : (pb.batch ? pb.batch.toString() : "");
            if (pbId) batchSet.add(pbId);
          });
        }
        map.set(st._id.toString(), batchSet);
      }
    }
    return map;
  }, [students]);

  // Filter schedules that are completed OR in the past, memoized to prevent re-sorting on every render
  const pastOrCompletedClasses = useMemo(() => {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const targetStudentBatches = selectedStudentId ? studentBatchMap.get(selectedStudentId) : null;
    const q = searchQuery.toLowerCase().trim();

    return schedules
      .filter((s: any) => {
        const scheduleDateStr = typeof s.date === "string" ? s.date.split("T")[0] : format(new Date(s.date), "yyyy-MM-dd");
        const todayStr = format(new Date(), "yyyy-MM-dd");
        // Requirement: classes strictly after today can never be in completed classes
        if (scheduleDateStr > todayStr) return false;

        const isPast = isBefore(new Date(s.date), todayStart);
        const isCompleted = s.status === "Completed";
        
        if (s.status === "Cancelled" || s.status === "Rescheduled") return false;
        if (!isPast && !isCompleted) return false;

        // Apply student filter via O(1) Map lookup
        if (selectedStudentId) {
          if (!targetStudentBatches || targetStudentBatches.size === 0) return false;
          const scheduleBatchId = s.batch?._id ? s.batch._id.toString() : (s.batch ? s.batch.toString() : "");
          if (!targetStudentBatches.has(scheduleBatchId)) return false;
        }

        // Apply teacher filter
        if (selectedTeacherId) {
          const tId = s.teacher?._id ? s.teacher._id.toString() : (s.teacher ? s.teacher.toString() : "");
          const repId = s.replacementTeacher?._id ? s.replacementTeacher._id.toString() : (s.replacementTeacher ? s.replacementTeacher.toString() : "");
          if (tId !== selectedTeacherId && repId !== selectedTeacherId) return false;
        }

        // Apply date filter
        if (selectedDate) {
          const scheduleDate = typeof s.date === "string" ? s.date.split("T")[0] : format(new Date(s.date), "yyyy-MM-dd");
          if (scheduleDate !== selectedDate) return false;
        }

        // Apply extra class filter
        if (filterExtraOnly && !s.isExtraClass) return false;

        // Apply text search
        if (q) {
          const batchName = (s.batch?.name || (typeof s.batch === "string" ? batches.find((b: any) => b._id === s.batch)?.name : "") || "").toLowerCase();
          const subject = (s.subject || "").toLowerCase();
          const teacherName = (s.teacher?.name || "").toLowerCase();
          const notes = (s.notes || "").toLowerCase();
          const extraReason = (s.extraClassReason || "").toLowerCase();
          const studentMatch = Array.isArray(s.attendance) && s.attendance.some((a: any) => (a.studentName || a.student?.name || "").toLowerCase().includes(q));
          if (!batchName.includes(q) && !subject.includes(q) && !teacherName.includes(q) && !notes.includes(q) && !extraReason.includes(q) && !studentMatch) {
            return false;
          }
        }

        return true;
      })
      .sort((a: any, b: any) => {
        const timeA = typeof a.date === "number" ? a.date : new Date(a.date).getTime();
        const timeB = typeof b.date === "number" ? b.date : new Date(b.date).getTime();
        return timeB - timeA;
      });
  }, [schedules, selectedStudentId, selectedTeacherId, selectedDate, searchQuery, studentBatchMap, batches, filterExtraOnly]);

  const allCompletedExtraCount = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    return schedules.filter((s: any) => {
      const scheduleDateStr = typeof s.date === "string" ? s.date.split("T")[0] : format(new Date(s.date), "yyyy-MM-dd");
      if (scheduleDateStr > todayStr) return false;
      if (s.status === "Cancelled" || s.status === "Rescheduled") return false;
      return Boolean(s.isExtraClass);
    }).length;
  }, [schedules]);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <AlertTriangle className="w-12 h-12 mb-4 text-amber-500" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p>You do not have permission to view completed classes.</p>
      </div>
    );
  }

  const openEdit = (cls: any) => {
    const batchId = cls.batch?._id ? cls.batch._id.toString() : (cls.batch ? cls.batch.toString() : "");
    const batchStudents = students.filter((st: any) => {
      const bId = st.batch?._id ? st.batch._id.toString() : (st.batch ? st.batch.toString() : "");
      return bId === batchId;
    });

    let initialAttendance = cls.attendance && cls.attendance.length > 0 ? cls.attendance : [];
    if (initialAttendance.length === 0 && batchStudents.length > 0) {
      initialAttendance = batchStudents.map((st: any) => ({
        studentId: st._id,
        isPresent: true,
        date: cls.date
      }));
    }

    setForm({
      subject: cls.subject || "",
      notes: cls.notes || "",
      status: "Completed",
      attendance: initialAttendance,
      isExtraClass: Boolean(cls.isExtraClass),
      startTime: cls.startTime || "09:00",
      endTime: cls.endTime || "10:00",
      nextExtraClassDate: cls.nextExtraClassDate ? (typeof cls.nextExtraClassDate === "string" ? cls.nextExtraClassDate.split("T")[0] : "") : "",
      nextExtraClassStartTime: cls.nextExtraClassStartTime || cls.startTime || "09:00",
      nextExtraClassEndTime: cls.nextExtraClassEndTime || cls.endTime || "10:00",
      extraClassReason: cls.extraClassReason || "",
    });
    setFormError(null);
    setModal(cls);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject?.trim()) {
      setFormError("Subject / Topic Covered is required to save a completed class.");
      return;
    }
    if (!form.notes?.trim()) {
      setFormError("Class Remarks / Notes are required to save a completed class.");
      return;
    }
    setFormError(null);
    if (modal) {
      updateSchedule.mutate({
        id: modal._id,
        data: {
          ...form,
          status: "Completed"
        }
      });
    }
  };

  const formatDateDisplay = (dateVal: any) => {
    if (!dateVal) return "—";
    try {
      const d = typeof dateVal === "string" ? parseISO(dateVal) : new Date(dateVal);
      return format(d, "MMM d, yyyy");
    } catch {
      return "—";
    }
  };

  const getBatchName = (cls: any) => {
    if (cls.batch?.name) return cls.batch.name;
    if (typeof cls.batch === "string") {
      const b = batches.find((item: any) => item._id === cls.batch);
      if (b?.name) return b.name;
    }
    return "Completed Batch";
  };

  const getBatchSubject = (cls: any) => {
    if (cls.batch?.subject) return cls.batch.subject;
    if (typeof cls.batch === "string") {
      const b = batches.find((item: any) => item._id === cls.batch);
      if (b?.subject) return b.subject;
    }
    return null;
  };

  const hasActiveFilters = Boolean(searchQuery || selectedTeacherId || selectedStudentId || selectedDate || filterExtraOnly);

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Session Navigation Tabs */}
      <SessionNavTabs className="shrink-0" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Completed Classes</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {pastOrCompletedClasses.length} {pastOrCompletedClasses.length === 1 ? "Class" : "Classes"}
            </span>
            {allCompletedExtraCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                ⭐ {allCompletedExtraCount} Extra {allCompletedExtraCount === 1 ? "Session" : "Sessions"}
              </span>
            )}
          </div>
          <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">
            {isTeacher 
              ? "Manage your completed classes, extra class sessions & reasons, attendance records, and notes."
              : "Review past completed classes, extra class reasons, student attendance, and teacher remarks."}
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Search Input */}
          <div className="relative w-full sm:w-48 lg:w-56">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setGlobalSearch(e.target.value);
              }}
              placeholder="Search batch, topic..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-8 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setGlobalSearch("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Teacher Filter (Visible for Admin/Super Admin/Sub Admin) */}
          {!isTeacher && (
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full sm:w-40 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
            >
              <option value="">All Teachers</option>
              {teachers.map((t: any) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}

          {/* Student Filter */}
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full sm:w-44 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All Students</option>
            {students.map((s: any) => (
              <option key={s._id} value={s._id}>{s.name} ({s.batch?.name || "Unknown"})</option>
            ))}
          </select>

          {/* Date Filter */}
          <div className="relative w-full sm:w-40">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
            />
            {selectedDate && (
              <button 
                onClick={() => setSelectedDate("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                title="Clear date"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Extra Classes Filter Toggle */}
          <button
            type="button"
            onClick={() => setFilterExtraOnly(!filterExtraOnly)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              filterExtraOnly
                ? "bg-purple-600 text-white border-purple-400 shadow-sm shadow-purple-600/30 font-bold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-purple-300 hover:border-purple-500/40"
            }`}
          >
            <span>⭐ Extra Classes</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterExtraOnly ? "bg-white/20 text-white" : "bg-neutral-800 text-neutral-300"}`}>
              {allCompletedExtraCount}
            </span>
          </button>

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedTeacherId("");
                setSelectedStudentId("");
                setSelectedDate("");
                setFilterExtraOnly(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0 shadow-sm">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 space-y-4 p-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-neutral-500">Loading your completed classes...</p>
          </div>
        ) : pastOrCompletedClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <div className="w-16 h-16 bg-neutral-800/50 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-neutral-600" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {hasActiveFilters ? "No matching completed classes" : "No past classes yet"}
            </h3>
            <p className="text-neutral-400 text-sm max-w-sm">
              {hasActiveFilters 
                ? "No completed classes match your current search and filter criteria. Try adjusting or clearing filters."
                : "Classes that have passed their scheduled date or are marked as completed will appear here in table format."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedTeacherId("");
                  setSelectedStudentId("");
                  setSelectedDate("");
                  setFilterExtraOnly(false);
                }}
                className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl border border-neutral-700 transition-colors"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[900px]">
              <thead className="bg-neutral-950/70 border-b border-neutral-800 text-neutral-400 text-[11px] uppercase tracking-wider font-semibold sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="px-5 py-3.5">Date & Time</th>
                  <th className="px-5 py-3.5">Batch</th>
                  {!isTeacher && <th className="px-5 py-3.5">Teacher</th>}
                  <th className="px-5 py-3.5">Topic Covered</th>
                  <th className="px-5 py-3.5">Attendance</th>
                  <th className="px-5 py-3.5">Class Notes / Remarks</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {pastOrCompletedClasses.map((cls: any, i: number) => {
                  const batchName = getBatchName(cls);
                  const batchSubject = getBatchSubject(cls);
                  const attendanceCount = cls.attendance && Array.isArray(cls.attendance) ? cls.attendance.length : 0;
                  const presentCount = attendanceCount > 0 ? cls.attendance.filter((a: any) => a.isPresent).length : 0;
                  const hasNotes = Boolean(cls.notes && cls.notes.trim());
                  const hasSubject = Boolean(cls.subject && cls.subject.trim());
                  const isFullyCompleted = cls.status === "Completed" && hasNotes && hasSubject;

                  return (
                    <tr
                      key={cls._id}
                      className="hover:bg-neutral-800/40 transition-colors group"
                    >
                      {/* Date & Time Column */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-semibold text-white text-sm">
                          {formatDateDisplay(cls.date)}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1">
                          <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          <span>{cls.startTime} – {cls.endTime}</span>
                        </div>
                      </td>

                      {/* Batch Column */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-sm">{batchName}</span>
                          {cls.isExtraClass && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                              ⭐ Extra Class
                            </span>
                          )}
                        </div>
                        {batchSubject && (
                          <div className="text-xs text-neutral-400 mt-0.5 max-w-[180px] truncate" title={batchSubject}>
                            {batchSubject}
                          </div>
                        )}
                      </td>

                      {/* Teacher Column (Visible for Admins) */}
                      {!isTeacher && (
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">
                            {cls.teacher?.name || "Unassigned"}
                          </div>
                          {cls.replacementTeacher && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium mt-1">
                              Sub: {cls.replacementTeacher.name}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Topic Covered Column */}
                      <td className="px-5 py-4">
                        {cls.subject ? (
                          <span className="text-amber-400 font-medium text-sm">
                            {cls.subject}
                          </span>
                        ) : (
                          <span className="text-neutral-500 italic text-xs">
                            No topic specified
                          </span>
                        )}
                      </td>

                      {/* Attendance Column */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {attendanceCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Users className="w-3 h-3" />
                            {presentCount}/{attendanceCount} Present
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-xs italic">
                            Not recorded
                          </span>
                        )}
                      </td>

                      {/* Class Notes Column */}
                      <td className="px-5 py-4 max-w-xs">
                        <div className="space-y-1">
                          {cls.isExtraClass && cls.extraClassReason && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              <span className="text-purple-400 font-bold">Extra Reason:</span>
                              <span className="truncate max-w-[180px]" title={cls.extraClassReason}>{cls.extraClassReason}</span>
                            </div>
                          )}
                          {cls.notes ? (
                            <p className="text-neutral-300 text-xs sm:text-sm line-clamp-2" title={cls.notes}>
                              {cls.notes}
                            </p>
                          ) : (
                            <span className="text-neutral-500 italic text-xs block">
                              No remarks recorded
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Column */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1.5 min-w-[200px]">
                          {cls.isExtraClass && (
                            <div className="flex flex-col gap-1 p-2 rounded-xl bg-purple-500/10 border border-purple-500/30">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/40">
                                  ⭐ Extra Class ({cls.startTime}–{cls.endTime})
                                </span>
                                {cls.nextExtraClassDate && (
                                  <span className="text-[10px] text-purple-300/80 font-medium">
                                    · Next: {formatDateDisplay(cls.nextExtraClassDate)}
                                  </span>
                                )}
                              </div>
                              {cls.extraClassReason && (
                                <div className="text-xs text-purple-200/95 flex items-start gap-1 font-medium bg-purple-950/40 px-2 py-1 rounded-lg border border-purple-500/20">
                                  <span className="text-purple-400 font-bold shrink-0">Reason:</span>
                                  <span className="italic">{cls.extraClassReason}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isFullyCompleted ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Completed
                              </span>
                            ) : cls.status === "Completed" ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <Clock className="w-3.5 h-3.5 text-amber-400" /> Needs Remarks
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action Column */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEdit(cls)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                            hasNotes
                              ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-neutral-600 shadow-sm"
                              : "bg-amber-500 hover:bg-amber-400 text-black border border-amber-400 shadow-sm shadow-amber-500/20"
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          {hasNotes ? "Edit Note" : "Add Note"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add Note Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    {modal.notes ? "Edit Class Notes & Attendance" : "Add Class Notes & Attendance"}
                  </h2>
                </div>
                <button
                  onClick={() => setModal(null)}
                  className="text-neutral-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
                {/* Class Details Card */}
                <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">
                      {getBatchName(modal)}
                    </p>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {modal.startTime} – {modal.endTime}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                    {formatDateDisplay(modal.date)}
                    {modal.teacher?.name && ` · Teacher: ${modal.teacher.name}`}
                  </p>
                </div>

                {/* Topic / Subject Covered */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Subject / Topic Covered <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                    placeholder="e.g. Loops, Arrays and Conditionals"
                  />
                </div>

                {/* Class Remarks / Notes */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5 flex items-center justify-between">
                    <span>
                      Class Remarks / Notes <span className="text-red-500">*</span>
                    </span>
                    <span className="text-[10px] text-amber-500 uppercase font-semibold">Required</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={form.notes}
                    onChange={(e) => {
                      setForm({ ...form, notes: e.target.value });
                      if (formError) setFormError(null);
                    }}
                    className={`w-full bg-neutral-800 border rounded-xl px-3.5 py-2.5 text-sm text-white outline-none transition-all placeholder-neutral-600 resize-none ${
                      formError && !form.notes?.trim()
                        ? "border-red-500 focus:border-red-500"
                        : "border-neutral-700 focus:border-amber-500"
                    }`}
                    placeholder="Describe student engagement, homework assignments, concepts covered..."
                  />
                  {formError && !form.notes?.trim() && (
                    <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {formError}
                    </p>
                  )}
                </div>

                {/* Extra Class Section */}
                <div className="rounded-xl bg-purple-500/10 border border-purple-500/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-purple-300">Mark as Extra Class</span>
                      <p className="text-[11px] text-purple-300/70">Extra makeup or doubt-clearing session for student</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.isExtraClass}
                      onChange={(e) => setForm({ ...form, isExtraClass: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-neutral-800 border-neutral-700 cursor-pointer"
                    />
                  </div>

                  {form.isExtraClass && (
                    <div className="pt-2 border-t border-purple-500/20 space-y-3">
                      {/* Class Time Section */}
                      <div>
                        <label className="block text-xs font-semibold text-purple-200 mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            <span>Extra Class Timing (Start & End Time)</span>
                          </span>
                          <span className="text-[10px] text-purple-400 font-normal">Reflects in Performance</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-neutral-400 block mb-0.5">Start Time</span>
                            <input
                              type="time"
                              required={form.isExtraClass}
                              value={form.startTime}
                              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-neutral-400 block mb-0.5">End Time</span>
                            <input
                              type="time"
                              required={form.isExtraClass}
                              value={form.endTime}
                              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-purple-300/60 mt-1">Teaching hours on this date directly update your performance report.</p>
                      </div>

                      {/* Next Extra Class Date & Timing */}
                      <div className="p-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/60 space-y-2">
                        <label className="block text-xs font-semibold text-purple-200 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-purple-400" />
                            <span>Student's Next Extra Class (Different Date)</span>
                          </span>
                          <span className="text-[10px] text-purple-400 font-normal">Optional</span>
                        </label>
                        <input
                          type="date"
                          value={form.nextExtraClassDate}
                          min={format(new Date(), "yyyy-MM-dd")}
                          onChange={(e) => setForm({ ...form, nextExtraClassDate: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono text-neutral-300"
                        />
                        <p className="text-[10px] text-purple-300/60">If the student has another session on a different date, select it here.</p>

                        {form.nextExtraClassDate && (
                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-700/40">
                            <div>
                              <span className="text-[10px] text-neutral-400 block mb-0.5">Next Start Time</span>
                              <input
                                type="time"
                                value={form.nextExtraClassStartTime}
                                onChange={(e) => setForm({ ...form, nextExtraClassStartTime: e.target.value })}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500 font-mono"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-neutral-400 block mb-0.5">Next End Time</span>
                              <input
                                type="time"
                                value={form.nextExtraClassEndTime}
                                onChange={(e) => setForm({ ...form, nextExtraClassEndTime: e.target.value })}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500 font-mono"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-purple-200 mb-1">
                          Reason / Topic Focus
                        </label>
                        <input
                          type="text"
                          value={form.extraClassReason}
                          onChange={(e) => setForm({ ...form, extraClassReason: e.target.value })}
                          placeholder="e.g. Doubt clearing, missed topic revision, exam preparation"
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-purple-500 placeholder-neutral-600"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Student Attendance Section */}
                {(() => {
                  const batchId = modal.batch?._id ? modal.batch._id.toString() : (modal.batch ? modal.batch.toString() : "");
                  const batchStudents = students.filter((st: any) => {
                    const bId = st.batch?._id ? st.batch._id.toString() : (st.batch ? st.batch.toString() : "");
                    return bId === batchId;
                  });

                  if (batchStudents.length === 0) return null;

                  return (
                    <div className="pt-2 border-t border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider">
                          Student Attendance ({batchStudents.length})
                        </label>
                        <span className="text-[10px] text-emerald-400 font-medium">
                          Auto-marked Present · Uncheck if Absent
                        </span>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {batchStudents.map((student: any) => {
                          const existingRecord = form.attendance?.find((a: any) => (a.studentId?._id || a.studentId) === student._id);
                          const isPresent = existingRecord ? existingRecord.isPresent : true;

                          return (
                            <label
                              key={student._id}
                              className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                isPresent
                                  ? "bg-emerald-500/10 border-emerald-500/30"
                                  : "bg-red-500/5 border-red-500/20 opacity-90"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isPresent}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    const currentAttendance = form.attendance || [];
                                    const newAttendance = currentAttendance.filter((a: any) => (a.studentId?._id || a.studentId) !== student._id);
                                    newAttendance.push({ studentId: student._id, isPresent: checked, date: modal.date });
                                    setForm({ ...form, attendance: newAttendance });
                                  }}
                                  className="w-4 h-4 rounded border-neutral-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-neutral-900 accent-emerald-500 cursor-pointer"
                                />
                                <span className="text-sm font-medium text-white">{student.name}</span>
                              </div>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                isPresent
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-red-500/20 text-red-400 border border-red-500/30"
                              }`}>
                                {isPresent ? "Present" : "Absent"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {formError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{formError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModal(null);
                      setFormError(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateSchedule.isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {updateSchedule.isPending ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Save Notes</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
