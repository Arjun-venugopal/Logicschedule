"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays, startOfWeek, isSameDay, parseISO, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, isSameMonth, addMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Edit2, Clock, AlertTriangle, Link as LinkIcon, User, BookOpen, Calendar, AlignLeft, Info, Search } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const SLOT_COLORS = [
  { bg: "bg-amber-500/20", border: "border-amber-500/50", text: "text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-orange-500/20", border: "border-orange-500/50", text: "text-orange-300", dot: "bg-orange-400" },
  { bg: "bg-yellow-500/20", border: "border-yellow-500/50", text: "text-yellow-300", dot: "bg-yellow-400" },
  { bg: "bg-red-500/20", border: "border-red-500/50", text: "text-red-300", dot: "bg-red-400" },
  { bg: "bg-emerald-500/20", border: "border-emerald-500/50", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-blue-500/20", border: "border-blue-500/50", text: "text-blue-300", dot: "bg-blue-400" },
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9); // 9 AM – 10 PM

const STATUS_OPTIONS = ["Scheduled", "Completed", "Cancelled", "Rescheduled"];

interface Teacher {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  status?: string;
}

interface Batch {
  _id: string;
  name: string;
  subject: string;
  studentsCount?: number;
  assignedTeacher?: string;
  timing?: { startTime: string; endTime: string };
  meetingLink?: string;
  durationType?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  days?: string[];
}

type ScheduleEntry = {
  _id?: string;
  teacher: string;
  batch: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingLink: string;
  subject: string;
  notes: string;
  attendance?: { studentId: string; isPresent: boolean }[];
};

type PopulatedScheduleEntry = {
  _id: string;
  teacher: Teacher;
  batch: Batch;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  meetingLink?: string;
  subject?: string;
  notes?: string;
};

const emptyForm = (): ScheduleEntry => ({
  teacher: "",
  batch: "",
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  status: "Scheduled",
  meetingLink: "",
  subject: "",
  notes: "",
  attendance: [],
});

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isTeacher = user?.role === "Teacher";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [modal, setModal] = useState<{ open: boolean; mode: "create" | "edit"; prefillDate?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleEntry>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterBatch, setFilterBatch] = useState<string>("");

  const [viewMode, setViewMode] = useState<"day" | "week" | "month">("week");

  let startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  let calendarDays: Date[] = [];

  if (viewMode === "day") {
    calendarDays = [currentDate];
  } else if (viewMode === "week") {
    calendarDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
  } else {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  }

  // Queries
  const { data: schedules = [] } = useQuery<PopulatedScheduleEntry[]>({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
  });

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students", form.batch],
    queryFn: async () => {
      if (!form.batch) return [];
      return (await api.get(`/students/batch/${form.batch}`)).data;
    },
    enabled: !!form.batch,
  });

  // Mutations
  const createSchedule = useMutation({
    mutationFn: (data: ScheduleEntry) => api.post("/schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      closeModal();
    },
  });

  const updateSchedule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ScheduleEntry }) => api.put(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      closeModal();
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setDeleteConfirm(null);
    },
  });

  // Helpers
  const openCreate = (prefillDate?: string) => {
    setForm({ ...emptyForm(), date: prefillDate || format(new Date(), "yyyy-MM-dd") });
    setEditingId(null);
    setModal({ open: true, mode: "create", prefillDate });
  };

  const openEdit = (s: any) => {
    setForm({
      teacher: s.teacher?._id || s.teacher,
      batch: s.batch?._id || s.batch,
      date: s.date ? format(new Date(s.date), "yyyy-MM-dd") : "",
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      meetingLink: s.meetingLink || "",
      subject: s.subject || "",
      notes: s.notes || "",
      attendance: s.attendance || [],
    });
    setEditingId(s._id);
    setModal({ open: true, mode: "edit" });
  };

  const closeModal = () => {
    setModal(null);
    setForm(emptyForm());
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modal?.mode === "edit" && editingId) {
      updateSchedule.mutate({ id: editingId, data: form });
    } else {
      createSchedule.mutate(form);
    }
  };

  // Match schedule to a day+hour cell
  const getEventForCell = (dayDate: Date, hour: number) => {
    return schedules.find((s: any) => {
      const sDate = new Date(s.date);
      const sHour = parseInt(s.startTime?.split(":")[0] || "0", 10);
      const matchesTime = isSameDay(sDate, dayDate) && sHour === hour;
      
      if (!matchesTime) return false;
      
      if (!isTeacher) {
        if (filterTeacher && (s.teacher?._id || s.teacher) !== filterTeacher) return false;
        if (filterBatch && (s.batch?._id || s.batch) !== filterBatch) return false;
      }
      
      return true;
    });
  };

  const getEventsForDay = (dayDate: Date) => {
    return schedules.filter((s: any) => {
      const sDate = new Date(s.date);
      if (!isSameDay(sDate, dayDate)) return false;
      
      if (!isTeacher) {
        if (filterTeacher && (s.teacher?._id || s.teacher) !== filterTeacher) return false;
        if (filterBatch && (s.batch?._id || s.batch) !== filterBatch) return false;
      }
      return true;
    }).sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
  };

  const colorForIndex = (id: string) => {
    const idx = id ? id.charCodeAt(id.length - 1) % SLOT_COLORS.length : 0;
    return SLOT_COLORS[idx];
  };

  const isPending = createSchedule.isPending || updateSchedule.isPending;
  const apiError = (createSchedule.error || updateSchedule.error) as any;

  return (
    <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 112px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">{isTeacher ? "My Schedule" : "Schedule"}</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            {isTeacher ? "View your classes · Click an event to add completed subject & notes" : "Click a cell to add · Click an event to edit"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggles */}
          <div className="hidden md:flex items-center bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden p-1 mr-2">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                  viewMode === mode 
                    ? "bg-neutral-800 text-white shadow-sm" 
                    : "text-neutral-500 hover:text-white hover:bg-neutral-800/50"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <button
              onClick={() => {
                if (viewMode === "day") setCurrentDate(addDays(currentDate, -1));
                else if (viewMode === "week") setCurrentDate(addDays(currentDate, -7));
                else setCurrentDate(addMonths(currentDate, -1));
              }}
              className="px-3 py-2 hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm font-medium text-white border-x border-neutral-800 min-w-[130px] text-center">
              {viewMode === "day" 
                ? format(currentDate, "MMM d, yyyy") 
                : viewMode === "week"
                ? `${format(startDate, "MMM d")} – ${format(addDays(startDate, 6), "MMM d, yyyy")}`
                : format(currentDate, "MMMM yyyy")}
            </span>
            <button
              onClick={() => {
                if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
                else if (viewMode === "week") setCurrentDate(addDays(currentDate, 7));
                else setCurrentDate(addMonths(currentDate, 1));
              }}
              className="px-3 py-2 hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Today
          </button>
          {!isTeacher && (
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-2 px-4 py-2 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 text-sm shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" /> New Class
            </button>
          )}
        </div>
      </div>

      {/* Filters (Admin only) */}
      {!isTeacher && (
        <div className="flex items-center gap-3 shrink-0 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
          <div className="flex-1 md:max-w-xs">
            <select
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
            >
              <option value="">All Teachers</option>
              {teachers.map((t: Teacher) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 md:max-w-xs">
            <select
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
            >
              <option value="">All Batches</option>
              {batches.map((b: Batch) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          </div>
          {(filterTeacher || filterBatch) && (
            <button
              onClick={() => { setFilterTeacher(""); setFilterBatch(""); }}
              className="p-2 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors"
              title="Clear Filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-lg">
        {viewMode === "month" ? (
          <div className="flex flex-col h-full overflow-x-auto custom-scrollbar bg-neutral-950">
            <div className="min-w-[800px] h-full flex flex-col flex-1">
              <div className="grid grid-cols-7 border-b border-neutral-800 bg-neutral-900 shrink-0">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                  <div key={day} className="py-3 text-center text-[11px] text-neutral-400 uppercase font-bold tracking-wider border-l border-neutral-800/50 first:border-0">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1 auto-rows-[minmax(100px,1fr)] overflow-y-auto custom-scrollbar bg-neutral-900/30">
                {calendarDays.map((dayDate, i) => {
                  const isToday = isSameDay(dayDate, new Date());
                  const isCurrentMonth = isSameMonth(dayDate, currentDate);
                  const dayEvents = getEventsForDay(dayDate);
                  
                  return (
                    <div 
                      key={i} 
                      className={`border-b border-r border-neutral-800/40 p-1.5 md:p-2 flex flex-col group cursor-pointer hover:bg-neutral-800/40 transition-colors ${isCurrentMonth ? 'bg-transparent' : 'bg-neutral-950/50'}`}
                      onClick={() => {
                        if (!isTeacher) openCreate(format(dayDate, "yyyy-MM-dd"));
                      }}
                    >
                      <div className="flex justify-between items-start mb-1.5 pl-1">
                        <span className={`text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full transition-transform ${isToday ? 'brand-gradient text-black shadow-lg shadow-amber-500/20 scale-110' : isCurrentMonth ? 'text-neutral-300' : 'text-neutral-600'}`}>
                          {format(dayDate, "d")}
                        </span>
                        {!isTeacher && (
                          <div className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-neutral-700/50 text-neutral-500 hover:text-white transition-all mt-0.5 mr-0.5">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-0.5 pb-1">
                        {dayEvents.map((event: any) => {
                          const color = colorForIndex(event._id);
                          return (
                            <div 
                              key={event._id}
                              onClick={(e) => { e.stopPropagation(); openEdit(event); }}
                              className={`px-2 py-1.5 rounded-lg border border-transparent hover:border-current ${color.bg} border-l-2 ${color.border} cursor-pointer hover:brightness-110 transition-all`}
                              title={`${event.startTime} - ${event.subject || event.batch?.name}`}
                            >
                              <div className={`text-[10px] font-bold truncate ${color.text} flex justify-between items-center gap-1.5`}>
                                <span className="truncate">{event.batch?.name || "Class"}</span>
                                <span className="shrink-0 opacity-75 text-[9px] font-medium">{event.startTime}</span>
                              </div>
                              <div className={`text-[9px] truncate opacity-60 ${color.text} mt-0.5 flex items-center gap-1`}>
                                <User className="w-2.5 h-2.5" />
                                {event.teacher?.name}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-x-auto custom-scrollbar">
            <div className="flex flex-col h-full min-w-max md:min-w-0">
              {/* Day Headers (Day/Week View) */}
              <div
                className="grid border-b border-neutral-800 bg-neutral-900/80 shrink-0"
                style={{ gridTemplateColumns: `64px repeat(${calendarDays.length}, minmax(${viewMode === 'week' ? '120px' : '0px'}, 1fr))` }}
              >
                <div className="p-3 flex items-center justify-center sticky left-0 bg-neutral-900/80 border-r border-neutral-800 z-10">
                  <Clock className="w-3.5 h-3.5 text-neutral-700" />
                </div>
                {calendarDays.map((date, i) => {
                  const isToday = isSameDay(date, new Date());
                  return (
                    <div key={i} className="p-3 text-center border-l border-neutral-800">
                      <div className="text-[10px] text-neutral-500 uppercase font-semibold mb-1 tracking-wider">
                        {format(date, "EEE")}
                      </div>
                      <div
                        className={`text-sm font-bold inline-flex items-center justify-center w-7 h-7 rounded-full mx-auto ${
                          isToday ? "brand-gradient text-black" : "text-neutral-300"
                        }`}
                      >
                        {format(date, "d")}
                      </div>
                    </div>
                  );
                })}
              </div>
  
              {/* Time Rows */}
              <div className="flex-1 overflow-y-auto">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="grid border-b border-neutral-800/40"
                    style={{ gridTemplateColumns: `64px repeat(${calendarDays.length}, minmax(${viewMode === 'week' ? '120px' : '0px'}, 1fr))`, minHeight: "76px" }}
                  >
                    {/* Hour label */}
                    <div className="p-2 text-center text-[10px] text-neutral-600 font-medium pt-2.5 border-r border-neutral-800/40 sticky left-0 bg-neutral-900 z-10">
                    {hour >= 12
                      ? `${hour === 12 ? 12 : hour - 12}:00 PM`
                      : `${hour}:00 AM`}
                  </div>

                  {calendarDays.map((dayDate, dayIdx) => {
                    const event = getEventForCell(dayDate, hour);
                    const color = event ? colorForIndex(event._id) : SLOT_COLORS[0];
                    return (
                      <div
                        key={dayIdx}
                        className="border-l border-neutral-800/40 relative p-1 hover:bg-neutral-800/20 transition-colors group cursor-pointer"
                        onClick={() => {
                          if (!event && !isTeacher) openCreate(format(dayDate, "yyyy-MM-dd"));
                        }}
                      >
                        {event ? (
                          <motion.div
                            layoutId={event._id}
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`absolute inset-1 rounded-xl border ${color.bg} ${color.border} p-2 overflow-hidden cursor-default`}
                          >
                            {/* Event content */}
                            <div className={`text-[11px] font-bold truncate leading-tight ${color.text}`}>
                              {event.batch?.name || (typeof event.batch === "string" ? event.batch : "Class")}
                            </div>
                            <div className={`text-[10px] truncate opacity-70 ${color.text}`}>
                              {event.teacher?.name || (typeof event.teacher === "string" ? event.teacher : "Teacher")}
                            </div>

                            {event.subject && (
                              <div className="text-[9px] truncate font-medium border border-amber-500/20 px-1 py-0.5 rounded bg-black/30 text-amber-300 inline-block mt-0.5 max-w-full">
                                Topic: {event.subject}
                              </div>
                            )}

                            <div className={`text-[9px] truncate opacity-50 ${color.text} mt-0.5`}>
                              {event.startTime} – {event.endTime}
                            </div>

                            {/* Status badge */}
                            {event.status !== "Scheduled" && (
                              <span className={`absolute top-1.5 right-1.5 text-[8px] px-1 py-0.5 rounded font-semibold ${
                                event.status === "Completed" ? "bg-emerald-500/30 text-emerald-300" :
                                event.status === "Cancelled" ? "bg-red-500/30 text-red-300" :
                                "bg-neutral-500/30 text-neutral-300"
                              }`}>
                                {event.status}
                              </span>
                            )}

                            {/* Action buttons (hover) */}
                            <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {event.meetingLink && (
                                <a
                                  href={event.meetingLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 rounded bg-blue-500/30 hover:bg-blue-500/50 transition-colors"
                                  title="Join Meeting"
                                >
                                  <LinkIcon className="w-2.5 h-2.5 text-blue-300" />
                                </a>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(event); }}
                                className="p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
                                title={isTeacher ? "Add session notes / topic" : "Edit Class"}
                              >
                                <Edit2 className={`w-2.5 h-2.5 ${color.text}`} />
                              </button>
                              {!isTeacher && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(event._id); }}
                                  className="p-1 rounded bg-red-500/20 hover:bg-red-500/40 transition-colors"
                                >
                                  <Trash2 className="w-2.5 h-2.5 text-red-300" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        ) : (
                          !isTeacher && (
                            <div className="absolute inset-1 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity border border-dashed border-neutral-700 flex items-center justify-center">
                              <Plus className="w-3.5 h-3.5 text-neutral-600" />
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {modal?.open && (
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
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-900/50">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    {modal.mode === "edit" ? <><Edit2 className="w-5 h-5 text-amber-500" /> Edit Class Details</> : <><Plus className="w-5 h-5 text-amber-500" /> Schedule New Class</>}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">Configure class details, timings, and meeting link.</p>
                </div>
                <button onClick={closeModal} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {isTeacher ? (
                  <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500">Batch / Class</span>
                        <p className="text-sm font-medium text-white truncate">
                          {batches.find((b: Batch) => b._id === form.batch)?.name || "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500">Default Subject</span>
                        <p className="text-sm font-medium text-neutral-400 truncate">
                          {batches.find((b: Batch) => b._id === form.batch)?.subject || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-neutral-800/60 pt-2.5">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500">Date</span>
                        <p className="text-sm font-medium text-white">
                          {form.date ? format(parseISO(form.date), "MMM d, yyyy") : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500">Time Slot</span>
                        <p className="text-sm font-medium text-white flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          {form.startTime} – {form.endTime}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
                        <Info className="w-4 h-4" /> Assignment Details
                      </h3>
                      
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Teacher */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" /> Teacher
                          </label>
                          <div className="relative">
                            <select
                              required
                              value={form.teacher}
                              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-amber-500 transition-colors"
                            >
                              <option value="">Select teacher...</option>
                              {teachers.map((t: Teacher) => (
                                <option key={t._id} value={t._id}>{t.name}</option>
                              ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                              <ChevronRight className="w-4 h-4 rotate-90" />
                            </div>
                          </div>
                        </div>

                        {/* Batch */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" /> Batch / Class
                          </label>
                          <div className="relative">
                            <select
                              required
                              value={form.batch}
                              onChange={(e) => setForm({ ...form, batch: e.target.value })}
                              className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white appearance-none focus:outline-none focus:border-amber-500 transition-colors"
                            >
                              <option value="">Select batch...</option>
                              {batches.map((b: Batch) => (
                                <option key={b._id} value={b._id}>{b.name} — {b.subject}</option>
                              ))}
                              {batches.length === 0 && (
                                <option disabled>No batches yet — create one first</option>
                              )}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                              <ChevronRight className="w-4 h-4 rotate-90" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
                        <Clock className="w-4 h-4" /> Schedule Timing
                      </h3>

                      <div className="grid md:grid-cols-3 gap-4">
                        {/* Date */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Date
                          </label>
                          <input
                            type="date"
                            required
                            value={form.date}
                            onChange={(e) => setForm({ ...form, date: e.target.value })}
                            className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>

                        {/* Start Time */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">Start Time</label>
                          <input
                            type="time"
                            required
                            value={form.startTime}
                            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                            className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>

                        {/* End Time */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">End Time</label>
                          <input
                            type="time"
                            required
                            value={form.endTime}
                            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                            className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
                    <AlignLeft className="w-4 h-4" /> Additional Details
                  </h3>

                  {/* Status (edit only) */}
                  {modal.mode === "edit" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Status</label>
                      <div className="relative">
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value })}
                          className={`w-full bg-neutral-800/50 border rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none transition-colors ${
                            form.status === "Scheduled" ? "text-amber-400 border-amber-500/30" :
                            form.status === "Completed" ? "text-emerald-400 border-emerald-500/30" :
                            form.status === "Cancelled" ? "text-red-400 border-red-500/30" :
                            "text-white border-neutral-700"
                          }`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                          <ChevronRight className="w-4 h-4 rotate-90" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Google Meet Link */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400 flex items-center justify-between">
                      <span>Virtual Meeting Link</span>
                      <span className="text-[10px] text-neutral-600 uppercase">Optional</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <LinkIcon className="h-4 w-4 text-blue-400" />
                      </div>
                      <input
                        type="url"
                        placeholder="e.g., https://meet.google.com/xxx-xxxx-xxx"
                        value={form.meetingLink}
                        onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                        className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-neutral-600"
                      />
                    </div>
                  </div>

                  {/* Subject / Topic Covered */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400 flex items-center justify-between">
                      <span>Subject / Topic Covered</span>
                      {isTeacher && <span className="text-[10px] text-amber-500 uppercase">Required</span>}
                    </label>
                    <input
                      type="text"
                      required={isTeacher}
                      placeholder="e.g. Introduction to Variables, React Hooks..."
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600"
                    />
                  </div>

                  {/* Completed Class Note */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400 flex items-center justify-between">
                      <span>Class Notes / Remarks</span>
                      <span className="text-[10px] text-neutral-600 uppercase">Optional</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe what was taught, overall student performance, or any homework given..."
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600 resize-none"
                    />
                  </div>
                </div>

                {/* Attendance */}
                {isTeacher && modal.mode === "edit" && students.length > 0 && (
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      Attendance
                    </label>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                      {students.map((student: any) => {
                        const existingRecord = form.attendance?.find(a => a.studentId === student._id);
                        const isPresent = existingRecord ? existingRecord.isPresent : true;
                        return (
                          <div key={student._id} className="flex items-center justify-between p-2 rounded-lg bg-neutral-800/50 border border-neutral-700/50">
                            <span className="text-sm text-neutral-200">{student.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentAttendance = form.attendance || [];
                                const newAttendance = currentAttendance.filter(a => a.studentId !== student._id);
                                newAttendance.push({ studentId: student._id, isPresent: !isPresent });
                                setForm({ ...form, attendance: newAttendance });
                              }}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                isPresent ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              }`}
                            >
                              {isPresent ? "Present" : "Absent"}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* API Error */}
                {apiError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{apiError?.response?.data?.message || "Something went wrong"}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-neutral-800">
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
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Saving...</>
                    ) : modal.mode === "edit" ? (
                      isTeacher ? (
                        <><Edit2 className="w-4 h-4" /> Save Class Details</>
                      ) : (
                        <><Edit2 className="w-4 h-4" /> Update Class</>
                      )
                    ) : (
                      <><Plus className="w-4 h-4" /> Schedule Class</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Dialog */}
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
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Delete this class?</h3>
                  <p className="text-sm text-neutral-400">This action cannot be undone.</p>
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
                  onClick={() => deleteSchedule.mutate(deleteConfirm)}
                  disabled={deleteSchedule.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleteSchedule.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <><Trash2 className="w-4 h-4" /> Delete</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
