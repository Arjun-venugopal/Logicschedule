"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Edit2, Trash2, BookOpen, Users, Link as LinkIcon, AlertTriangle, Check, Calendar, Clock, Clock3, Sliders, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import dynamic from "next/dynamic";
import { useSearchStore } from "@/store/searchStore";
import { usePermissions } from "@/hooks/usePermissions";

const BatchAnalyticsModal = dynamic(
  () => import("@/components/batches/BatchAnalyticsModal"),
  { ssr: false, loading: () => null }
);

const ActiveBatchesAnalyticsModal = dynamic(
  () => import("@/components/batches/ActiveBatchesAnalyticsModal"),
  { ssr: false, loading: () => null }
);

const STATUS_COLORS: Record<string, string> = {
  Upcoming: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Ongoing: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Completed: "bg-neutral-700/50 text-neutral-400 border-neutral-600/30",
  Cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  Dropped: "bg-red-500/10 text-red-400 border-red-500/20",
};

function batchProgress(completedClassesCount?: number, totalClassesCount?: number): number {
  if (!totalClassesCount || totalClassesCount <= 0) return 0;
  return Math.min(100, Math.round(((completedClassesCount || 0) / totalClassesCount) * 100));
}

const getSafeDateOnly = (val: any): string => {
  if (!val) return "";
  if (typeof val === "string") return val.split("T")[0];
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val).split("T")[0];
};

const formatSafeDisplayDate = (val: any): string => {
  const dateStr = getSafeDateOnly(val);
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const computeEndTime = (startTime?: string, durationMinutes = 60): string => {
  if (!startTime) return "10:00";
  const parts = startTime.split(":");
  if (parts.length < 2) return startTime;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return startTime;
  const totalMin = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor((totalMin / 60) % 24);
  const endMin = totalMin % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
};

const formatTime12h = (time24?: string): string => {
  if (!time24) return "—";
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || "0", 10);
  if (isNaN(h)) return time24;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

const formatBatchTiming = (batch: any): string => {
  if (batch?.dayTimings && typeof batch.dayTimings === "object") {
    const keys = Object.keys(batch.dayTimings);
    if (keys.length > 0) {
      const days = batch.days && batch.days.length > 0 ? batch.days : keys;
      const relevantEntries = days
        .map((d: string) => ({
          day: d,
          start: batch.dayTimings[d]?.startTime,
        }))
        .filter((e: any) => Boolean(e.start));

      if (relevantEntries.length > 0) {
        const uniqueTimes = Array.from(new Set<string>(relevantEntries.map((e: any) => String(e.start))));
        if (uniqueTimes.length === 1) {
          const shortDays = relevantEntries.map((e: any) => e.day.slice(0, 3)).join(", ");
          return `${shortDays}: ${formatTime12h(uniqueTimes[0])}`;
        }
        return relevantEntries
          .map((e: any) => `${e.day.slice(0, 3)}: ${formatTime12h(e.start)}`)
          .join(" • ");
      }
    }
  }

  if (batch?.timing?.startTime) {
    return `${formatTime12h(batch.timing.startTime)}${batch.timing.endTime ? ` - ${formatTime12h(batch.timing.endTime)}` : ""}`;
  }
  return "—";
};

type BatchForm = {
  name: string;
  subject: string;
  studentsCount: number;
  assignedTeacher: string;
  startTime: string;
  endTime: string;
  days: string[];
  timeMode: "same" | "different";
  dayTimings: Record<string, { startTime: string; endTime: string }>;
  meetingLink: string;
  durationType: string;
  startDate: string;
  status: string;
  numberOfSessions: number | "";
  preCompletedClasses?: number | "";
};

const emptyForm = (): BatchForm => ({
  name: "",
  subject: "",
  studentsCount: 0,
  assignedTeacher: "",
  startTime: "09:00",
  endTime: "10:00",
  days: [],
  timeMode: "same",
  dayTimings: {},
  meetingLink: "",
  durationType: "Custom",
  startDate: "",
  status: "Upcoming",
  numberOfSessions: "",
  preCompletedClasses: "",
});

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { searchQuery } = useSearchStore();
  const { canWrite } = usePermissions();
  const hasWriteAccess = canWrite("batches");

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BatchForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  const [analyticsBatchId, setAnalyticsBatchId] = useState<string | null>(null);
  const [showActiveAnalyticsModal, setShowActiveAnalyticsModal] = useState<boolean>(false);
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCourse, setFilterCourse] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const validateAndPreparePayload = (data: BatchForm) => {
    if (!data.name || !data.name.trim()) {
      throw new Error("Batch name is required.");
    }
    if (!data.days || data.days.length === 0) {
      throw new Error("Please select at least one class day.");
    }

    const preparedDayTimings: Record<string, { startTime: string; endTime: string }> = {};

    if (data.timeMode === "different") {
      for (const day of data.days) {
        const t = data.dayTimings?.[day];
        if (!t || !t.startTime) {
          throw new Error(`Please select a start time for ${day}.`);
        }
        preparedDayTimings[day] = {
          startTime: t.startTime,
          endTime: t.endTime || computeEndTime(t.startTime, 60),
        };
      }
    } else {
      if (!data.startTime) {
        throw new Error("Please select a class start time.");
      }
      const sharedEnd = data.endTime || computeEndTime(data.startTime, 60);
      for (const day of data.days) {
        preparedDayTimings[day] = {
          startTime: data.startTime,
          endTime: sharedEnd,
        };
      }
    }

    const firstDay = data.days[0];
    const primaryStart = data.timeMode === "different" && firstDay ? preparedDayTimings[firstDay]?.startTime : (data.startTime || "09:00");
    const primaryEnd = data.timeMode === "different" && firstDay ? preparedDayTimings[firstDay]?.endTime : (data.endTime || computeEndTime(primaryStart, 60));

    return {
      ...data,
      preCompletedClasses: data.preCompletedClasses !== "" && data.preCompletedClasses !== undefined ? Number(data.preCompletedClasses) : 0,
      numberOfSessions: data.numberOfSessions !== "" && data.numberOfSessions !== undefined ? Number(data.numberOfSessions) : null,
      timing: { startTime: primaryStart, endTime: primaryEnd },
      timeMode: data.timeMode,
      dayTimings: preparedDayTimings,
    };
  };

  const createBatch = useMutation({
    mutationFn: (data: any) => api.post("/batches", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); closeModal(); },
  });

  const updateBatch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/batches/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); closeModal(); },
  });

  const deleteBatch = useMutation({
    mutationFn: (id: string) => api.delete(`/batches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); setDeleteConfirm(null); },
  });

  const openCreate = () => {
    setForm(emptyForm());
    setFormError(null);
    setEditingId(null);
    setModal(true);
  };

  const openEdit = (b: any) => {
    const bDays = Array.isArray(b.days) ? b.days : [];
    const existingDayTimings = (b.dayTimings && typeof b.dayTimings === "object") ? { ...b.dayTimings } : {};
    const fallbackStart = b.timing?.startTime || "09:00";
    const fallbackEnd = b.timing?.endTime || computeEndTime(fallbackStart, 60);

    let inferredMode: "same" | "different" = b.timeMode || "same";
    const dayTimingValues = Object.values(existingDayTimings) as Array<{ startTime: string; endTime: string }>;
    if (!b.timeMode && dayTimingValues.length > 1) {
      const distinctStarts = new Set(dayTimingValues.map((v) => v.startTime).filter(Boolean));
      if (distinctStarts.size > 1) {
        inferredMode = "different";
      }
    }

    const populatedDayTimings: Record<string, { startTime: string; endTime: string }> = {};
    bDays.forEach((day: string) => {
      if (existingDayTimings[day] && existingDayTimings[day].startTime) {
        populatedDayTimings[day] = {
          startTime: existingDayTimings[day].startTime,
          endTime: existingDayTimings[day].endTime || computeEndTime(existingDayTimings[day].startTime, 60),
        };
      } else {
        populatedDayTimings[day] = {
          startTime: fallbackStart,
          endTime: fallbackEnd,
        };
      }
    });

    setForm({
      name: b.name || "",
      subject: b.subject || "",
      studentsCount: b.studentsCount || 0,
      assignedTeacher: b.assignedTeacher?._id || b.assignedTeacher || "",
      startTime: fallbackStart,
      endTime: fallbackEnd,
      days: bDays,
      timeMode: inferredMode,
      dayTimings: populatedDayTimings,
      meetingLink: b.meetingLink || "",
      durationType: b.durationType || "Custom",
      startDate: getSafeDateOnly(b.startDate),
      status: b.status || "Upcoming",
      numberOfSessions: b.numberOfSessions || "",
      preCompletedClasses: b.preCompletedClasses !== undefined && b.preCompletedClasses !== null && b.preCompletedClasses !== "" ? b.preCompletedClasses : (b.completedClassesCount || ""),
    });
    setFormError(null);
    setEditingId(b._id);
    setModal(true);
  };

  const closeModal = () => {
    setModal(false);
    setForm(emptyForm());
    setFormError(null);
    setEditingId(null);
  };

  const toggleDay = (day: string) => {
    setForm((f) => {
      const isSelected = f.days.includes(day);
      const updatedDays = isSelected ? f.days.filter((d) => d !== day) : [...f.days, day];
      const updatedDayTimings = { ...f.dayTimings };

      if (isSelected) {
        delete updatedDayTimings[day];
      } else {
        if (!updatedDayTimings[day]) {
          const defaultStart = f.startTime || "09:00";
          updatedDayTimings[day] = {
            startTime: defaultStart,
            endTime: f.endTime || computeEndTime(defaultStart, 60),
          };
        }
      }

      return {
        ...f,
        days: updatedDays,
        dayTimings: updatedDayTimings,
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const payload = validateAndPreparePayload(form);
      if (editingId) updateBatch.mutate({ id: editingId, data: payload as any });
      else createBatch.mutate(payload as any);
    } catch (err: any) {
      setFormError(err.message || "Please check form errors");
    }
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setLinkCopied(id);
    setTimeout(() => setLinkCopied(null), 2000);
  };

  const isPending = createBatch.isPending || updateBatch.isPending;
  const apiError = (createBatch.error || updateBatch.error) as any;

  // No early return for teacher, let them see their batches

  // Determine effective status for a batch
  const getBatchEffectiveStatus = (b: any): "Ongoing" | "Completed" | "Dropped" | "Upcoming" => {
    const targetSessions = (b.numberOfSessions && Number(b.numberOfSessions) > 0)
      ? Number(b.numberOfSessions)
      : (b.totalClassesCount || 0);
    const completedCount = Math.max(b.completedClassesCount || 0, Number(b.preCompletedClasses) || 0);
    const isClassCompleted = b.status === "Completed" || (targetSessions > 0 && completedCount >= targetSessions);
    const rawStatus = (b.status || "").toLowerCase();

    if (rawStatus === "dropped" || rawStatus === "cancelled") return "Dropped";
    if (isClassCompleted || rawStatus === "completed") return "Completed";
    if (rawStatus === "upcoming") return "Upcoming";
    return "Ongoing";
  };

  // Base batches for calculating contextual counts (filtered by teacher and course if selected)
  const baseBatchesForStats = useMemo(() => {
    return batches.filter((b: any) => {
      if (filterTeacher && (b.assignedTeacher?._id || b.assignedTeacher) !== filterTeacher) return false;
      if (filterCourse) {
        const bSubject = (b.subject || "").toLowerCase();
        if (!bSubject.includes(filterCourse.toLowerCase())) return false;
      }
      return true;
    });
  }, [batches, filterTeacher, filterCourse]);

  // Aggregate batch counts for: Total Batches, Ongoing, Completed, Dropped/Cancelled, Upcoming
  const batchStats = useMemo(() => {
    const totalBatches = baseBatchesForStats.length;
    let ongoingBatches = 0;
    let completedBatches = 0;
    let droppedBatches = 0;
    let upcomingBatches = 0;

    baseBatchesForStats.forEach((b: any) => {
      const effective = getBatchEffectiveStatus(b);

      if (effective === "Completed") {
        completedBatches++;
      } else if (effective === "Ongoing") {
        ongoingBatches++;
      } else if (effective === "Dropped") {
        droppedBatches++;
      } else if (effective === "Upcoming") {
        upcomingBatches++;
      }
    });

    return {
      totalBatches,
      ongoingBatches,
      completedBatches,
      droppedBatches,
      upcomingBatches,
    };
  }, [baseBatchesForStats]);

  const filteredBatches = batches.filter((b: any) => {
    if (filterTeacher && (b.assignedTeacher?._id || b.assignedTeacher) !== filterTeacher) return false;
    
    if (filterStatus) {
      const effective = getBatchEffectiveStatus(b);
      if (filterStatus === "Ongoing" && effective !== "Ongoing") return false;
      if (filterStatus === "Completed" && effective !== "Completed") return false;
      if (filterStatus === "Dropped" && effective !== "Dropped") return false;
      if (filterStatus === "Upcoming" && effective !== "Upcoming") return false;
    }

    if (filterCourse) {
      const bSubject = (b.subject || "").toLowerCase();
      const targetCourse = filterCourse.toLowerCase();
      if (!bSubject.includes(targetCourse)) return false;
    }

    if (!searchQuery) return true;
    const lowerSearch = searchQuery.toLowerCase();
    return (
      (b.name || "").toLowerCase().includes(lowerSearch) ||
      (b.subject || "").toLowerCase().includes(lowerSearch) ||
      (b.assignedTeacher?.name || "").toLowerCase().includes(lowerSearch)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Batches</h1>
          <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">Create and manage class batches with schedules and meeting links</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => setShowActiveAnalyticsModal(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-neutral-900 border border-neutral-700 hover:border-amber-500/50 text-neutral-200 font-semibold rounded-xl transition-all text-xs sm:text-sm shadow-md"
          >
            <BookOpen className="w-4 h-4 text-amber-500" /> Active Analytics
          </button>
          {hasWriteAccess && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-xs sm:text-sm shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" /> New Batch
            </button>
          )}
        </div>
      </div>

      {/* Overview Count Cards: Batches (Total, Ongoing, Completed, Upcoming, Dropped/Cancelled) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 shrink-0">
        {/* Total Batches Card */}
        <div
          onClick={() => setFilterStatus("")}
          className={`bg-neutral-900 border rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all cursor-pointer ${
            filterStatus === ""
              ? "border-amber-500/50 ring-1 ring-amber-500/30 bg-amber-500/5 shadow-lg shadow-amber-500/10"
              : "border-neutral-800 hover:border-amber-500/30"
          }`}
          title="Click to view all batches"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] sm:text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Total Batches</p>
              <div className="flex items-baseline gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{batchStats.totalBatches}</h3>
                <span className="text-xs text-neutral-400 font-medium">batches</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              filterStatus === "" ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20"
            }`}>
              <BookOpen className="w-5 h-5" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <BookOpen className="w-24 h-24 text-amber-500" />
          </div>
        </div>

        {/* Ongoing / Active Card */}
        <div
          onClick={() => setFilterStatus(filterStatus === "Ongoing" ? "" : "Ongoing")}
          className={`bg-neutral-900 border rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all cursor-pointer ${
            filterStatus === "Ongoing"
              ? "border-emerald-500/50 ring-1 ring-emerald-500/30 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
              : "border-neutral-800 hover:border-emerald-500/30"
          }`}
          title="Click to filter by Ongoing batches"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] sm:text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Ongoing</p>
              <div className="flex items-baseline gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{batchStats.ongoingBatches}</h3>
                <span className="text-xs text-neutral-400 font-medium">batches</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              filterStatus === "Ongoing" ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20"
            }`}>
              <Clock3 className="w-5 h-5" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Clock3 className="w-24 h-24 text-emerald-500" />
          </div>
        </div>

        {/* Completed Card */}
        <div
          onClick={() => setFilterStatus(filterStatus === "Completed" ? "" : "Completed")}
          className={`bg-neutral-900 border rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all cursor-pointer ${
            filterStatus === "Completed"
              ? "border-teal-500/50 ring-1 ring-teal-500/30 bg-teal-500/5 shadow-lg shadow-teal-500/10"
              : "border-neutral-800 hover:border-teal-500/30"
          }`}
          title="Click to filter by Completed batches"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] sm:text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Completed</p>
              <div className="flex items-baseline gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{batchStats.completedBatches}</h3>
                <span className="text-xs text-neutral-400 font-medium">batches</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              filterStatus === "Completed" ? "bg-teal-500/20 text-teal-400" : "bg-teal-500/10 text-teal-500 group-hover:bg-teal-500/20"
            }`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <CheckCircle2 className="w-24 h-24 text-teal-500" />
          </div>
        </div>

        {/* Upcoming Card */}
        <div
          onClick={() => setFilterStatus(filterStatus === "Upcoming" ? "" : "Upcoming")}
          className={`bg-neutral-900 border rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all cursor-pointer ${
            filterStatus === "Upcoming"
              ? "border-blue-500/50 ring-1 ring-blue-500/30 bg-blue-500/5 shadow-lg shadow-blue-500/10"
              : "border-neutral-800 hover:border-blue-500/30"
          }`}
          title="Click to filter by Upcoming batches"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] sm:text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Upcoming</p>
              <div className="flex items-baseline gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{batchStats.upcomingBatches}</h3>
                <span className="text-xs text-neutral-400 font-medium">batches</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              filterStatus === "Upcoming" ? "bg-blue-500/20 text-blue-400" : "bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20"
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Calendar className="w-24 h-24 text-blue-500" />
          </div>
        </div>

        {/* Dropped / Cancelled Card */}
        <div
          onClick={() => setFilterStatus(filterStatus === "Dropped" ? "" : "Dropped")}
          className={`bg-neutral-900 border rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all cursor-pointer ${
            filterStatus === "Dropped"
              ? "border-rose-500/50 ring-1 ring-rose-500/30 bg-rose-500/5 shadow-lg shadow-rose-500/10"
              : "border-neutral-800 hover:border-rose-500/30"
          }`}
          title="Click to filter by Dropped / Cancelled batches"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] sm:text-xs text-neutral-500 uppercase font-semibold tracking-wider mb-1">Dropped / Cancelled</p>
              <div className="flex items-baseline gap-1.5">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{batchStats.droppedBatches}</h3>
                <span className="text-xs text-neutral-400 font-medium">batches</span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              filterStatus === "Dropped" ? "bg-rose-500/20 text-rose-400" : "bg-rose-500/10 text-rose-500 group-hover:bg-rose-500/20"
            }`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <AlertTriangle className="w-24 h-24 text-rose-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 shrink-0 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
        {/* Teacher Filter */}
        {user?.role !== "Teacher" && (
          <div className="flex-1 min-w-[160px] md:max-w-xs">
            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
            >
              <option value="">All Teachers</option>
              {teachers.map((t: any) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Batch Status Filter */}
        <div className="flex-1 min-w-[160px] md:max-w-xs">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All Statuses ({batchStats.totalBatches})</option>
            <option value="Ongoing">Ongoing / Active ({batchStats.ongoingBatches})</option>
            <option value="Completed">Completed ({batchStats.completedBatches})</option>
            <option value="Dropped">Dropped / Cancelled ({batchStats.droppedBatches})</option>
            <option value="Upcoming">Upcoming ({batchStats.upcomingBatches})</option>
          </select>
        </div>

        {/* Course Details Filter */}
        <div className="flex-1 min-w-[160px] md:max-w-xs">
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All Course Details</option>
            <option value="Scratch">Scratch</option>
            <option value="Robotics">Robotics</option>
            <option value="Python">Python</option>
            <option value="AI">AI</option>
          </select>
        </div>

        {/* Clear Filters */}
        {(filterTeacher || filterStatus || filterCourse) && (
          <button
            onClick={() => {
              setFilterTeacher("");
              setFilterStatus("");
              setFilterCourse("");
            }}
            className="px-3 py-2 text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
            title="Clear Filters"
          >
            <X className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
      </div>

      {/* Batch Cards */}
      {isLoading ? (
        <div className="py-20 text-center text-neutral-500">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading batches...
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="py-20 text-center bg-neutral-900 border border-neutral-800 rounded-2xl">
          <div className="w-14 h-14 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-neutral-600" />
          </div>
          <p className="text-neutral-300 font-semibold mb-1">No batches found</p>
          <p className="text-neutral-600 text-sm mb-4">Try adjusting your search criteria</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredBatches.map((batch: any, i: number) => {
            const targetSessions = (batch.numberOfSessions && Number(batch.numberOfSessions) > 0)
              ? Number(batch.numberOfSessions)
              : (batch.totalClassesCount || 0);

            const completedCount = Math.max(batch.completedClassesCount || 0, Number(batch.preCompletedClasses) || 0);
            const isCompleted = batch.status === "Completed" || (targetSessions > 0 && completedCount >= targetSessions);
            
            return (
              <motion.div
                key={batch._id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => setAnalyticsBatchId(batch._id)}
                className={`bg-neutral-900 border rounded-2xl p-5 flex flex-col gap-4 cursor-pointer transition-colors relative overflow-hidden ${
                  isCompleted 
                    ? "border-emerald-500/40 hover:border-emerald-400 shadow-lg shadow-emerald-950/20" 
                    : "border-neutral-800 hover:border-amber-500/50"
                }`}
              >
                {/* Top Accent bar for completed batches */}
                {isCompleted && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
                )}

                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "brand-gradient text-black"}`}>
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white leading-tight">{batch.name}</h3>
                      <p className="text-sm text-amber-400">{batch.subject}</p>
                    </div>
                  </div>
                  {hasWriteAccess && (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(batch)}
                        className="p-1.5 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 hover:text-white"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(batch._id)}
                        className="p-1.5 hover:bg-red-500/10 rounded-lg transition-colors text-neutral-500 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Status + Duration badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isCompleted ? (
                    <span className="flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold shadow-sm shadow-emerald-500/20">
                      <Check className="w-3 h-3 text-emerald-400" /> Class is Completed
                    </span>
                  ) : batch.status ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[batch.status] || STATUS_COLORS.Upcoming}`}>
                      {batch.status}
                    </span>
                  ) : null}
                  {batch.durationType && (
                    <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                      <Clock3 className="w-2.5 h-2.5" /> 
                      {batch.durationType === 'Custom' && batch.numberOfSessions ? `${batch.numberOfSessions} Hours` : batch.durationType}
                    </span>
                  )}
                </div>

                {/* Info Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-800/60 rounded-xl p-3">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-0.5">Students</p>
                    <p className="text-lg font-bold text-white">{batch.studentsCount || 0}</p>
                  </div>
                  <div className="bg-neutral-800/60 rounded-xl p-3">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-0.5">Classes Done</p>
                    <p className={`text-lg font-bold ${isCompleted ? "text-emerald-400" : "text-amber-400"}`}>
                      {completedCount} / {targetSessions || 0}
                    </p>
                  </div>
                  <div className="bg-neutral-800/60 rounded-xl p-3">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-0.5">Classes (Sessions)</p>
                    <p className="text-lg font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis">
                      {batch.numberOfSessions ? `${batch.numberOfSessions} Classes` : "Ongoing"}
                    </p>
                  </div>
                  <div className="bg-neutral-800/60 rounded-xl p-3 overflow-hidden">
                    <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-0.5">Timing</p>
                    <p className="text-sm font-semibold text-white whitespace-nowrap text-ellipsis overflow-hidden" title={formatBatchTiming(batch)}>
                      {formatBatchTiming(batch)}
                    </p>
                  </div>
                </div>

                {/* Start Date + Progress */}
                {(batch.startDate || (targetSessions && targetSessions > 0)) && (
                  <div>
                    {batch.startDate && (
                      <div className="flex items-center text-[10px] text-neutral-500 mb-1.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Started: {formatSafeDisplayDate(batch.startDate)}
                        </span>
                      </div>
                    )}
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isCompleted ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/50" : "brand-gradient"
                        }`}
                        style={{ width: `${isCompleted ? 100 : batchProgress(completedCount, targetSessions)}%` }}
                      />
                    </div>
                    {isCompleted ? (
                      <div className="flex items-center justify-between text-[10px] font-semibold mt-1.5">
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Class is Completed
                        </span>
                        <span className="text-emerald-400">100% completed ({completedCount}/{targetSessions})</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[9px] text-neutral-400 mt-1">
                        <span>{Math.max(targetSessions - completedCount, 0)} classes remaining</span>
                        <span>{batchProgress(completedCount, targetSessions)}% completed</span>
                      </div>
                    )}

                    {/* Class Count Breakdown Pills */}
                    <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-neutral-800/60 text-[10px] text-neutral-400 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        ✓ {completedCount} Completed
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                        🕒 {Math.max(targetSessions - completedCount, 0)} Upcoming
                      </span>
                      {batch.cancelledClassesCount && batch.cancelledClassesCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
                          ✗ {batch.cancelledClassesCount} Dropped
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}

              {/* Days */}
              {batch.days?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d) => (
                    <span
                      key={d}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                        batch.days.includes(d)
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-transparent text-neutral-700 border-neutral-800"
                      }`}
                    >
                      {d.slice(0, 3)}
                    </span>
                  ))}
                </div>
              )}

              {/* Teacher */}
              {batch.assignedTeacher && (
                <div className="flex items-center gap-2 text-sm text-neutral-400">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{batch.assignedTeacher?.name || "—"}</span>
                </div>
              )}

              {/* Meet Link */}
              {batch.meetingLink && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl" onClick={(e) => e.stopPropagation()}>
                  <LinkIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <a
                    href={batch.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 text-xs truncate flex-1 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {batch.meetingLink}
                  </a>
                  <button
                    onClick={(e) => { e.stopPropagation(); copyLink(batch.meetingLink, batch._id); }}
                    className="shrink-0 text-blue-400 hover:text-blue-300"
                  >
                    {linkCopied === batch._id
                      ? <Check className="w-3.5 h-3.5" />
                      : <LinkIcon className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {editingId ? "Edit Batch" : "Create New Batch"}
                </h2>
                <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                {/* Batch Name + Subject */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Batch Name</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Batch A"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Subject / Course</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Scratch, Robotics, Python, AI"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600 mb-2"
                    />
                    <div className="flex flex-wrap gap-1">
                      {["Scratch", "Robotics", "Python", "AI", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const current = form.subject.trim();
                            if (!current) setForm({ ...form, subject: tag });
                            else if (!current.includes(tag)) setForm({ ...form, subject: `${current} - ${tag}` });
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded-md border font-medium transition-all ${
                            form.subject.includes(tag)
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-600"
                          }`}
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Students + Teacher */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Students Count</label>
                    <input
                      type="number"
                      min={0}
                      value={form.studentsCount}
                      onChange={(e) => setForm({ ...form, studentsCount: Number(e.target.value) })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Assigned Teacher</label>
                    <select
                      value={form.assignedTeacher}
                      onChange={(e) => setForm({ ...form, assignedTeacher: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    >
                      <option value="">None</option>
                      {teachers.map((t: any) => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Start Date & Total Classes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-neutral-300">Total Classes (Sessions)</label>
                      <span className="text-[11px] text-neutral-500">Optional</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="e.g. 20 (or leave empty for ongoing)"
                      value={form.numberOfSessions}
                      onChange={(e) => setForm({ ...form, numberOfSessions: e.target.value ? Number(e.target.value) : "" })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                    />
                  </div>
                </div>

                {/* Classes Already Completed */}
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-neutral-300">
                      {form.status === "Completed" ? "Total Completed Classes" : "Classes Already Completed"}
                    </label>
                    <span className="text-[11px] text-neutral-500">Optional</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={form.numberOfSessions ? Number(form.numberOfSessions) : undefined}
                    placeholder="e.g. 5"
                    value={form.preCompletedClasses}
                    onChange={(e) => setForm({ ...form, preCompletedClasses: e.target.value ? Number(e.target.value) : "" })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                  />
                  <p className="text-xs text-neutral-500 mt-1.5">
                    {form.status === "Completed"
                      ? "Specify how many classes were completed for this batch."
                      : "If this batch has already completed classes prior to today, specify how many here."}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Status</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "Upcoming", value: "Upcoming" },
                      { label: "Ongoing", value: "Active" },
                      { label: "Completed", value: "Completed" },
                      { label: "Dropped", value: "Dropped" },
                    ].map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm({ ...form, status: s.value })}
                        className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                          form.status === s.value || (s.value === "Active" && form.status === "Ongoing") || (s.value === "Dropped" && form.status === "Cancelled")
                            ? STATUS_COLORS[s.value] || STATUS_COLORS.Upcoming
                            : "bg-neutral-800 text-neutral-600 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Days Selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-neutral-300">
                      Class Days <span className="text-red-400">*</span>
                    </label>
                    {form.days.length > 0 && (
                      <span className="text-xs text-amber-400/90 font-medium">
                        {form.days.length} day{form.days.length > 1 ? "s" : ""} selected
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const isSelected = form.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? "brand-gradient text-black border-transparent shadow-sm shadow-amber-500/20"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timing Configuration */}
                {form.days.length === 0 ? (
                  <div className="p-3 rounded-xl bg-neutral-800/40 border border-neutral-700/60 text-xs text-neutral-400 text-center">
                    Select one or more class days above to configure class timings.
                  </div>
                ) : (
                  <div className="space-y-3 bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-800">
                    {/* Time Mode Segmented Control */}
                    <div>
                      <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
                        Class Schedule Timing
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-neutral-800/80 rounded-xl border border-neutral-700/70">
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({
                              ...f,
                              timeMode: "same",
                            }));
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                            form.timeMode === "same"
                              ? "brand-gradient text-black shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Same time for all days
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => {
                              const updatedDayTimings = { ...f.dayTimings };
                              f.days.forEach((day) => {
                                if (!updatedDayTimings[day]) {
                                  updatedDayTimings[day] = {
                                    startTime: f.startTime || "09:00",
                                    endTime: f.endTime || computeEndTime(f.startTime || "09:00", 60),
                                  };
                                }
                              });
                              return {
                                ...f,
                                timeMode: "different",
                                dayTimings: updatedDayTimings,
                              };
                            });
                          }}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                            form.timeMode === "different"
                              ? "brand-gradient text-black shadow-sm"
                              : "text-neutral-400 hover:text-white"
                          }`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          Different time for each day
                        </button>
                      </div>
                    </div>

                    {/* Mode 1: Same Time for All Days */}
                    {form.timeMode === "same" ? (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-medium text-neutral-300">Class Start Time</label>
                              <span className="text-[11px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                                {formatTime12h(form.startTime)}
                              </span>
                            </div>
                            <input
                              type="time"
                              value={form.startTime}
                              onChange={(e) => {
                                const newStart = e.target.value;
                                setForm((f) => ({
                                  ...f,
                                  startTime: newStart,
                                  endTime: computeEndTime(newStart, 60),
                                }));
                              }}
                              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-medium text-neutral-300">Class End Time</label>
                              <span className="text-[11px] font-bold text-neutral-300 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
                                {formatTime12h(form.endTime)}
                              </span>
                            </div>
                            <input
                              type="time"
                              value={form.endTime}
                              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-neutral-400">
                          Applies to: <span className="text-white font-medium">{form.days.join(", ")}</span> at{" "}
                          <span className="text-amber-400 font-semibold">{formatTime12h(form.startTime)}</span>
                        </p>
                      </div>
                    ) : (
                      /* Mode 2: Different Time for Each Day */
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] text-neutral-400">
                          Configure individual class start times for each selected day:
                        </p>
                        <div className="space-y-2">
                          {DAYS.filter((day) => form.days.includes(day)).map((day) => {
                            const timing = form.dayTimings[day] || {
                              startTime: form.startTime || "09:00",
                              endTime: form.endTime || computeEndTime(form.startTime || "09:00", 60),
                            };
                            return (
                              <div
                                key={day}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-neutral-800/80 border border-neutral-700/80 hover:border-neutral-600 transition-all"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold min-w-[70px] text-center">
                                    {day}
                                  </span>
                                  <span className="text-xs text-neutral-400 hidden sm:inline">•</span>
                                  <span className="text-xs font-semibold text-white">
                                    {formatTime12h(timing.startTime)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                  <div className="flex-1 sm:w-36">
                                    <input
                                      type="time"
                                      value={timing.startTime || ""}
                                      onChange={(e) => {
                                        const newStart = e.target.value;
                                        setForm((f) => ({
                                          ...f,
                                          dayTimings: {
                                            ...f.dayTimings,
                                            [day]: {
                                              startTime: newStart,
                                              endTime: computeEndTime(newStart, 60),
                                            },
                                          },
                                        }));
                                      }}
                                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500 transition-all"
                                    />
                                  </div>
                                  <span className="text-[11px] text-neutral-500 shrink-0">
                                    to {formatTime12h(timing.endTime || computeEndTime(timing.startTime, 60))}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Google Meet Link */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Google Meet Link
                    <span className="ml-2 text-xs text-neutral-500 font-normal">Optional — shared with students</span>
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                    <input
                      type="url"
                      placeholder="https://meet.google.com/xxx-xxxx-xxx"
                      value={form.meetingLink}
                      onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                      className="w-full bg-neutral-800 border border-blue-500/30 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder-neutral-600"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {apiError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {apiError?.response?.data?.message || "Something went wrong"}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isPending ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : editingId ? (
                      <><Edit2 className="w-4 h-4" /> Update Batch</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Create Batch</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Delete this batch?</h3>
                  <p className="text-sm text-neutral-400">All associated schedules may be affected.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteBatch.mutate(deleteConfirm)}
                  disabled={deleteBatch.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteBatch.isPending
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Trash2 className="w-4 h-4" /> Delete</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analytics Modals */}
      {analyticsBatchId && (
        <BatchAnalyticsModal batchId={analyticsBatchId} onClose={() => setAnalyticsBatchId(null)} />
      )}

      {showActiveAnalyticsModal && (
        <ActiveBatchesAnalyticsModal onClose={() => setShowActiveAnalyticsModal(false)} />
      )}
    </div>
  );
}
