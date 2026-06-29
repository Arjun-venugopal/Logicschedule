"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isSameDay, isSameWeek, isSameMonth } from "date-fns";
import {
  Plus,
  X,
  Trash2,
  Edit2,
  Clock,
  AlertTriangle,
  Link as LinkIcon,
  User,
  Calendar,
  AlignLeft,
  Info,
  Search,
  Check,
  Video,
  CheckCircle2,
  AlertCircle,
  Eye,
  LayoutGrid,
  List
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import { usePermissions } from "@/hooks/usePermissions";

interface Teacher {
  _id: string;
  name: string;
  email: string;
  status?: string;
  availability?: {
    day: string;
    slots: { startTime: string; endTime: string }[];
  }[];
}

interface DemoSession {
  _id: string;
  teacher: Teacher;
  studentName: string;
  studentEmail?: string;
  customerName?: string;
  phoneNumber?: string;
  place?: string;
  age?: number;
  feeDiscussed?: string;
  numberOfSessions?: number;
  admissionConfirmed?: "Pending" | "Yes" | "No";
  salesExecutive?: string;
  classAssignedTutor?: string;
  batchAssigned?: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  meetingLink?: string;
  notes?: string;
  conflict?: boolean;
  createdBy?: string;
}

type DemoSessionForm = {
  teacher: string;
  studentName: string;
  studentEmail: string;
  customerName: string;
  phoneNumber: string;
  place: string;
  age: number | "";
  feeDiscussed: string;
  numberOfSessions: number | "";
  admissionConfirmed: "Pending" | "Yes" | "No";
  salesExecutive: string;
  classAssignedTutor: string;
  batchAssigned: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  meetingLink: string;
  notes: string;
};

const emptyForm = (): DemoSessionForm => ({
  teacher: "",
  studentName: "",
  studentEmail: "",
  customerName: "",
  phoneNumber: "",
  place: "",
  age: "",
  feeDiscussed: "",
  numberOfSessions: "",
  admissionConfirmed: "Pending",
  salesExecutive: "",
  classAssignedTutor: "",
  batchAssigned: "",
  subject: "",
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "09:00",
  endTime: "10:00",
  status: "Scheduled",
  meetingLink: "",
  notes: "",
});

export default function DemoSessionsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isTeacher = user?.role === "Teacher";
  const { searchQuery } = useSearchStore();
  const { canWrite, isSalesPerson } = usePermissions();
  const hasWriteAccess = canWrite("demoSessions");
  const canManageSlots = !isSalesPerson && hasWriteAccess;

  const [modal, setModal] = useState<{ open: boolean; mode: "create" | "edit" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState<DemoSessionForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("All");
  const [viewingSession, setViewingSession] = useState<DemoSession | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [activeTab, setActiveTab] = useState<"sessions" | "slots">("sessions");
  const [slotForm, setSlotForm] = useState({
    teacher: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
  });

  // Queries
  const { data: demoSessions = [], isLoading: isLoadingDemo } = useQuery<DemoSession[]>({
    queryKey: ["demo-sessions"],
    queryFn: async () => (await api.get("/demo-sessions")).data,
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
  });

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  const { data: demoSlots = [], isLoading: isLoadingSlots } = useQuery<any[]>({
    queryKey: ["demo-slots"],
    queryFn: async () => (await api.get("/demo-slots")).data,
  });

  const { data: salesPeople = [] } = useQuery<any[]>({
    queryKey: ["salesPeople"],
    queryFn: async () => (await api.get("/sales")).data,
  });

  const createSlotMutation = useMutation({
    mutationFn: (data: any) => api.post("/demo-slots", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-slots"] });
      setSlotForm({ teacher: "", date: format(new Date(), "yyyy-MM-dd"), startTime: "09:00", endTime: "10:00" });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/demo-slots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-slots"] });
    },
  });

  // Mutations
  const createDemoMutation = useMutation({
    mutationFn: (data: DemoSessionForm) => api.post("/demo-sessions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      closeModal();
    },
  });

  useEffect(() => {
    if (isTeacher && user?.email && teachers.length > 0 && !slotForm.teacher) {
      const myTeacher = teachers.find((t) => t.email === user.email);
      if (myTeacher) {
        setSlotForm((prev) => ({ ...prev, teacher: myTeacher._id }));
      }
    }
  }, [isTeacher, user, teachers]);

  const updateDemoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DemoSessionForm }) =>
      api.put(`/demo-sessions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      closeModal();
    },
  });

  const deleteDemoMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/demo-sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      setDeleteConfirm(null);
    },
  });

  // Helpers
  const formatTimeAMPM = (timeStr: string) => {
    if (!timeStr) return "";
    try {
      const [h, m] = timeStr.split(":");
      const date = new Date();
      date.setHours(parseInt(h, 10), parseInt(m, 10), 0);
      return format(date, "h:mm a");
    } catch {
      return timeStr;
    }
  };

  const openCreate = () => {
    setForm({
      ...emptyForm(),
      salesExecutive: isSalesPerson && user?.name ? user.name : "",
    });
    setEditingId(null);
    setModal({ open: true, mode: "create" });
  };

  const openBookSlot = (slot: any) => {
    setForm({
      ...emptyForm(),
      teacher: slot.teacher?._id || slot.teacher,
      date: format(new Date(slot.date), "yyyy-MM-dd"),
      startTime: slot.startTime,
      endTime: slot.endTime,
      salesExecutive: isSalesPerson && user?.name ? user.name : "",
    });
    setEditingId(null);
    setModal({ open: true, mode: "create" });
    setActiveTab("sessions");
  };

  const openEdit = (d: DemoSession) => {
    setForm({
      teacher: d.teacher?._id || (d.teacher as any),
      studentName: d.studentName,
      studentEmail: d.studentEmail || "",
      customerName: d.customerName || "",
      phoneNumber: d.phoneNumber || "",
      place: d.place || "",
      age: d.age || "",
      feeDiscussed: d.feeDiscussed || "",
      numberOfSessions: d.numberOfSessions || "",
      admissionConfirmed: d.admissionConfirmed || "Pending",
      salesExecutive: d.salesExecutive || "",
      classAssignedTutor: d.classAssignedTutor || "",
      batchAssigned: d.batchAssigned || "",
      subject: d.subject,
      date: d.date ? format(new Date(d.date), "yyyy-MM-dd") : "",
      startTime: d.startTime,
      endTime: d.endTime,
      status: d.status,
      meetingLink: d.meetingLink || "",
      notes: d.notes || "",
    });
    setEditingId(d._id);
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
      updateDemoMutation.mutate({ id: editingId, data: form });
    } else {
      createDemoMutation.mutate(form);
    }
  };

  // Availability Logic
  const getSelectedTeacherAvailability = () => {
    if (!form.teacher) return null;
    const teacherObj = teachers.find((t) => t._id === form.teacher);
    if (!teacherObj || !teacherObj.availability) return null;
    return teacherObj.availability;
  };

  const getDayName = (dateStr: string) => {
    if (!dateStr) return "";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    try {
      const parts = dateStr.split("-");
      // Create local date object avoiding timezone shift
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return days[d.getDay()];
    } catch {
      return "";
    }
  };

  const checkAvailabilityStatus = () => {
    if (!form.teacher || !form.date) return { isSet: false, isAvailable: false, msg: "Fill teacher and date to check availability." };

    const avail = getSelectedTeacherAvailability();
    const dayName = getDayName(form.date);
    if (!avail || avail.length === 0) {
      return { isSet: false, isAvailable: false, msg: "No availability configured for this teacher." };
    }

    const dayAvail = avail.find((a) => a.day === dayName);
    if (!dayAvail || !dayAvail.slots || dayAvail.slots.length === 0) {
      return { isSet: true, isAvailable: false, msg: `Teacher has not set availability for ${dayName}s.` };
    }

    const start = form.startTime;
    const end = form.endTime;

    // Check if form start and end falls within at least one slot
    const fits = dayAvail.slots.some(
      (slot) => start >= slot.startTime && end <= slot.endTime
    );

    const slotStr = dayAvail.slots
      .map((s) => `${s.startTime} - ${s.endTime}`)
      .join(", ");

    if (fits) {
      return { isSet: true, isAvailable: true, msg: `Teacher is available on ${dayName}s: ${slotStr}` };
    } else {
      return { isSet: true, isAvailable: false, msg: `Teacher availability on ${dayName}s is: ${slotStr}. Selected slot falls outside.` };
    }
  };

  // Conflict Logic (real time check)
  const getConflictStatus = () => {
    if (!form.teacher || !form.date || !form.startTime || !form.endTime) return false;

    // Check regular classes
    const scheduleOverlap = schedules.some((s: any) => {
      if (s.status === "Cancelled") return false;
      const tId = s.teacher?._id || s.teacher;
      if (tId !== form.teacher) return false;
      const sDate = format(new Date(s.date), "yyyy-MM-dd");
      if (sDate !== form.date) return false;
      return s.startTime < form.endTime && s.endTime > form.startTime;
    });

    // Check other demo sessions
    const demoOverlap = demoSessions.some((d) => {
      if (d._id === editingId || d.status === "Cancelled") return false;
      const tId = d.teacher?._id || (d.teacher as any);
      if (tId !== form.teacher) return false;
      const dDate = format(new Date(d.date), "yyyy-MM-dd");
      if (dDate !== form.date) return false;
      return d.startTime < form.endTime && d.endTime > form.startTime;
    });

    return scheduleOverlap || demoOverlap;
  };

  const availability = checkAvailabilityStatus();
  const hasConflict = getConflictStatus();

  // Filters
  const filteredSessions = demoSessions.filter((d) => {
    // Search filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const matchName = d.studentName.toLowerCase().includes(search);
      const matchSubject = d.subject.toLowerCase().includes(search);
      const matchTeacher = d.teacher?.name?.toLowerCase().includes(search);
      if (!matchName && !matchSubject && !matchTeacher) return false;
    }

    // Teacher filter
    if (filterTeacher) {
      const tId = d.teacher?._id || (d.teacher as any);
      if (tId !== filterTeacher) return false;
    }

    // Status filter
    if (filterStatus && d.status !== filterStatus) return false;

    // Date filter
    if (filterDate !== "All") {
      const dDate = new Date(d.date);
      const today = new Date();
      if (filterDate === "Today" && !isSameDay(dDate, today)) return false;
      if (filterDate === "This Week" && !isSameWeek(dDate, today)) return false;
      if (filterDate === "This Month" && !isSameMonth(dDate, today)) return false;
    }

    return true;
  });

  // Slots Filtering & Grouping
  const filteredSlots = demoSlots.filter((slot: any) => {
    if (filterTeacher && slot.teacher?._id !== filterTeacher && slot.teacher !== filterTeacher) {
      return false;
    }
    if (filterDate !== "All") {
      const sDate = new Date(slot.date);
      const today = new Date();
      if (filterDate === "Today" && !isSameDay(sDate, today)) return false;
      if (filterDate === "This Week" && !isSameWeek(sDate, today)) return false;
      if (filterDate === "This Month" && !isSameMonth(sDate, today)) return false;
    }
    return true;
  });

  const groupedSlots = filteredSlots.reduce((acc: any, slot: any) => {
    const tId = slot.teacher?._id || slot.teacher;
    const key = tId;
    
    if (!acc[key]) {
      acc[key] = {
        teacher: slot.teacher,
        slots: []
      };
    }
    acc[key].slots.push(slot);
    return acc;
  }, {});

  const groupedSlotsArray = Object.values(groupedSlots).sort((a: any, b: any) => {
    return (a.teacher?.name || "").localeCompare(b.teacher?.name || "");
  });

  // sort slots within teacher by date then time
  groupedSlotsArray.forEach((group: any) => {
    group.slots.sort((a: any, b: any) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  });

  const canViewFee = (sessionSalesExec?: string) => {
    if (!isSalesPerson) return true;
    if (!user?.name) return false;
    return sessionSalesExec?.trim().toLowerCase() === user.name.trim().toLowerCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Video className="w-6 h-6 text-amber-400" />
            Demo Sessions
          </h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            {isTeacher
              ? "View and update feedback for your upcoming prospect demo classes"
              : "Schedule and manage prospective student demo classes based on teacher availability"}
          </p>
        </div>
        
        {hasWriteAccess && (
          <div className="flex items-center gap-2">
            <div className="bg-neutral-900 border border-neutral-800 p-1 rounded-xl flex items-center mr-2">
              <button
                onClick={() => setActiveTab("sessions")}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === "sessions" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveTab("slots")}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === "slots" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Available Slots
              </button>
            </div>
            
            {!isTeacher && activeTab === "sessions" && canManageSlots && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" /> Schedule Demo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      {!isTeacher && activeTab === "sessions" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
            <div className="flex-1 min-w-[120px] max-w-[150px]">
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
              >
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
            </div>
            <div className="flex-1 md:max-w-xs">
              <select
                value={filterTeacher}
                onChange={(e) => setFilterTeacher(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
              >
                <option value="">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 md:max-w-xs">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
              >
                <option value="">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            {(filterTeacher || filterStatus || filterDate !== "All") && (
              <button
                onClick={() => {
                  setFilterTeacher("");
                  setFilterStatus("");
                  setFilterDate("All");
                }}
                className="px-3 py-2 text-xs font-semibold bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          
          {/* Stats Summary & View Toggle */}
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-medium">Total Demos Booked</p>
                <p className="text-xl font-bold text-white">{filteredSessions.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-semibold">Current Filter</p>
                <p className="text-sm font-medium text-amber-400">{filterDate === "All" ? "All Time" : filterDate}</p>
              </div>
              
              {!isTeacher && (
                <div className="flex bg-neutral-900 border border-neutral-800 p-1 rounded-xl">
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === "table" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-white"}`}
                    title="Table View"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded-lg transition-colors ${viewMode === "grid" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-white"}`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main List */}
      {activeTab === "sessions" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          {isLoadingDemo ? (
            <div className="py-16 text-center text-neutral-500">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading demo sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Video className="w-6 h-6 text-neutral-600" />
            </div>
            <p className="text-neutral-400 font-medium">No demo sessions found</p>
            <p className="text-neutral-600 text-sm mt-1">
              {searchQuery ? "Try resetting your search query" : "No demo sessions have been scheduled yet"}
            </p>
            {!isTeacher && !searchQuery && hasWriteAccess && (
              <button
                onClick={openCreate}
                className="mt-4 px-4 py-2 brand-gradient text-black font-semibold rounded-lg text-sm hover:opacity-90"
              >
                Schedule Demo Class
              </button>
            )}
          </div>
        ) : isTeacher || viewMode === "grid" ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 p-5 bg-neutral-900/30">
            {filteredSessions.map((session) => {
              const sessionDate = new Date(session.date);
              const statusColors = {
                Scheduled: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                Cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
              };

              return (
                <motion.div
                  key={session._id}
                  layoutId={session._id}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group"
                >
                  {session.conflict && (
                    <div className="absolute top-0 right-0 left-0 bg-red-500/15 border-b border-red-500/20 text-red-400 text-[10px] py-1 px-3 flex items-center gap-1 font-semibold">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Conflict: Slot overlaps with other classes
                    </div>
                  )}

                  <div className={`space-y-3 ${session.conflict ? "pt-4" : ""}`}>
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                          PROSPECT DEMO
                        </span>
                        <h3 className="font-bold text-white text-base mt-0.5 truncate max-w-[180px]" title={session.studentName}>
                          {session.studentName}
                        </h3>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusColors[session.status]}`}
                      >
                        {session.status}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-xs text-neutral-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{format(sessionDate, "EEEE, MMMM d, yyyy")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-neutral-500" />
                        <span>
                          {formatTimeAMPM(session.startTime)} – {formatTimeAMPM(session.endTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-neutral-500" />
                        <span className="text-neutral-300 font-medium">
                          Teacher: {session.teacher?.name || "Unassigned"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlignLeft className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Subject: <strong className="text-white">{session.subject}</strong></span>
                      </div>
                      {session.studentEmail && (
                        <div className="text-[11px] text-neutral-500 truncate" title={session.studentEmail}>
                          Email: {session.studentEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Notes & Join */}
                  <div className="space-y-3 pt-3 border-t border-neutral-800/60">
                    {session.notes && (
                      <p className="text-neutral-500 text-[11px] italic bg-neutral-950/40 p-2 rounded-lg truncate" title={session.notes}>
                        Note: {session.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      {session.meetingLink ? (
                        <a
                          href={session.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 px-2.5 py-1.5 rounded-lg transition-all"
                        >
                          <LinkIcon className="w-3 h-3" />
                          Join Meeting
                        </a>
                      ) : (
                        <span className="text-[10px] text-neutral-600 italic">No link provided</span>
                      )}

                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        {!isTeacher && (
                          <button
                            onClick={() => setViewingSession(session)}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg transition-colors border border-blue-500/25"
                            title="View Full Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManageSlots && (
                          <button
                            onClick={() => openEdit(session)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition-colors border border-neutral-700"
                            title={isTeacher ? "Add notes / feedback" : "Edit Session"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isTeacher && canManageSlots && (
                          <button
                            onClick={() => setDeleteConfirm(session._id)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-colors border border-red-500/25"
                            title="Delete Session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-400 whitespace-nowrap">
              <thead className="bg-neutral-800/50 text-xs uppercase font-semibold text-neutral-500 border-b border-neutral-800">
                <tr>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Place</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Demo Tutor</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Fee Discussed</th>
                  <th className="px-4 py-3">No. Hours</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Admn Confirmed</th>
                  <th className="px-4 py-3">Sales Exec</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredSessions.map((session) => (
                  <tr key={session._id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{session.studentName}</td>
                    <td className="px-4 py-3">{session.customerName || "-"}</td>
                    <td className="px-4 py-3">{session.phoneNumber || "-"}</td>
                    <td className="px-4 py-3">{session.place || "-"}</td>
                    <td className="px-4 py-3">{session.age || "-"}</td>
                    <td className="px-4 py-3">{format(new Date(session.date), "dd MMM yyyy")}</td>
                    <td className="px-4 py-3">{formatTimeAMPM(session.startTime)} - {formatTimeAMPM(session.endTime)}</td>
                    <td className="px-4 py-3">{session.teacher?.name || "-"}</td>
                    <td className="px-4 py-3">{session.subject}</td>
                    <td className="px-4 py-3">
                      {canViewFee(session.salesExecutive) ? (session.feeDiscussed || "-") : <span className="text-neutral-600 italic">Hidden</span>}
                    </td>
                    <td className="px-4 py-3">{session.numberOfSessions || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border ${session.status === "Scheduled" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : session.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{session.admissionConfirmed || "Pending"}</td>
                    <td className="px-4 py-3">{session.salesExecutive || "-"}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => setViewingSession(session)} className="text-blue-400 hover:text-blue-300" title="View Details"><Eye className="w-4 h-4" /></button>
                      {(canManageSlots || (isSalesPerson && (session.createdBy === user?._id || session.salesExecutive === user?.name))) && (
                        <>
                          <button onClick={() => openEdit(session)} className="text-neutral-400 hover:text-white" title="Edit Session"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteConfirm(session._id)} className="text-red-400 hover:text-red-300" title="Delete Session"><Trash2 className="w-4 h-4" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Slots Layout */}
      {activeTab === "slots" && (
        <div className="space-y-6">
          {/* Add Slot Form */}
          {canManageSlots && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <h2 className="text-lg font-bold text-white mb-4">Add Available Time Slot</h2>
              <div className={`grid grid-cols-1 ${!isTeacher ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 items-end`}>
                {!isTeacher && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Teacher *</label>
                    <select
                      required
                      value={slotForm.teacher}
                      onChange={(e) => setSlotForm({ ...slotForm, teacher: e.target.value })}
                      disabled={isTeacher}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                    >
                      <option value="">Select Teacher</option>
                      {teachers.map((t) => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-400">Date *</label>
                  <input
                    required
                    type="date"
                    value={slotForm.date}
                    onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-400">Start Time *</label>
                  <input
                    required
                    type="time"
                    value={slotForm.startTime}
                    onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-400">End Time *</label>
                  <input
                    required
                    type="time"
                    value={slotForm.endTime}
                    onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => {
                    if (slotForm.teacher && slotForm.date && slotForm.startTime && slotForm.endTime) {
                      createSlotMutation.mutate(slotForm);
                    }
                  }}
                  disabled={createSlotMutation.isPending || !slotForm.teacher}
                  className="w-full px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl transition-all text-sm border border-neutral-700 disabled:opacity-50"
                >
                  {createSlotMutation.isPending ? "Adding..." : "Add Slot"}
                </button>
              </div>
            </div>
          )}

          {/* Slots Filter */}
          <div className="flex flex-wrap items-center gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl mb-4">
            <div className="flex-1 min-w-[120px] max-w-[150px]">
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
              >
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
              </select>
            </div>
            {!isTeacher && (
              <div className="flex-1 md:max-w-xs">
                <select
                  value={filterTeacher}
                  onChange={(e) => setFilterTeacher(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                >
                  <option value="">All Teachers</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(filterTeacher || filterDate !== "All") && (
              <button
                onClick={() => {
                  setFilterTeacher("");
                  setFilterDate("All");
                }}
                className="px-3 py-2 text-xs font-semibold bg-neutral-800 border border-neutral-700 rounded-xl text-neutral-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Slots List */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden p-5">
            <h2 className="text-lg font-bold text-white mb-4">Available Slots</h2>
            {isLoadingSlots ? (
              <div className="py-10 text-center text-neutral-500">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Loading slots...
              </div>
            ) : groupedSlotsArray.length === 0 ? (
              <div className="py-10 text-center text-neutral-400">
                No demo slots match the current filters.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedSlotsArray.map((group: any, idx: number) => (
                  <div
                    key={idx}
                    className="border border-neutral-800 rounded-xl bg-neutral-900/50 p-4 flex flex-col max-h-[500px]"
                  >
                    <div className="pb-3 border-b border-neutral-800 mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-white text-base truncate">
                        {group.teacher?.name || "Unknown Teacher"}
                      </h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 shrink-0">
                        {group.slots.length} Slots
                      </span>
                    </div>
                    
                    <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
                      {group.slots.map((slot: any) => (
                        <div key={slot._id} className={`p-2.5 rounded-lg border ${
                          slot.isBooked
                            ? "bg-red-500/5 border-red-500/10"
                            : "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10"
                        } transition-colors`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-[10px] text-neutral-400 uppercase font-semibold">
                                {format(new Date(slot.date), "dd MMM yyyy")}
                              </p>
                              <p className="text-sm font-bold text-white mt-0.5">
                                {formatTimeAMPM(slot.startTime)} - {formatTimeAMPM(slot.endTime)}
                              </p>
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                              slot.isBooked ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                            }`}>
                              {slot.isBooked ? "BOOKED" : "AVAILABLE"}
                            </span>
                          </div>
                          
                          <div className="flex gap-2 mt-2 pt-2 border-t border-neutral-800/50">
                            {!slot.isBooked && hasWriteAccess && (
                              <button
                                onClick={() => openBookSlot(slot)}
                                className="flex-1 py-1.5 text-xs font-semibold bg-amber-500 text-black hover:opacity-90 rounded-lg transition-opacity"
                              >
                                Book Demo
                              </button>
                            )}
                            {canManageSlots && (
                              <button
                                onClick={() => deleteSlotMutation.mutate(slot._id)}
                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center"
                                title="Delete Slot"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {modal?.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-900/50">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {modal.mode === "create" ? (
                      <>
                        <Plus className="w-5 h-5 text-amber-500" />
                        Schedule Demo Session
                      </>
                    ) : (
                      <>
                        <Edit2 className="w-5 h-5 text-amber-500" />
                        {isTeacher ? "Update Class Notes" : "Edit Demo Session"}
                      </>
                    )}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    {isTeacher ? "Provide demo completion feedback & notes" : "Provide prospective student details and timing"}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {isTeacher ? (
                  /* Teacher Edit View (Read only details, editable notes & status) */
                  <div className="space-y-4">
                    <div className="p-4 bg-neutral-850 rounded-xl border border-neutral-800 space-y-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-neutral-500 block">Student Info</span>
                        <p className="text-sm font-medium text-white">{form.studentName}</p>
                        {form.studentEmail && <p className="text-xs text-neutral-400 mt-0.5">{form.studentEmail}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4 border-t border-neutral-800/60 pt-2.5">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-neutral-500 block">Subject</span>
                          <p className="text-xs font-semibold text-amber-400 mt-0.5">{form.subject}</p>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-neutral-500 block">Date & Time</span>
                          <p className="text-[11px] text-white mt-0.5">
                            {form.date} · {form.startTime} - {form.endTime}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Class Status</label>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    {/* Virtual Meeting Link */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Virtual Meeting Link</label>
                      <input
                        type="url"
                        placeholder="https://meet.google.com/xxx-xxxx-xxx"
                        value={form.meetingLink}
                        onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Demo Class Notes / Feedback</label>
                      <textarea
                        rows={3}
                        placeholder="Enter feedback e.g., Student understood basic variables well. Recommended to enroll in Core JS."
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-neutral-600 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Admin Full Edit/Create View */
                  <div className="space-y-4">
                    {/* Student details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Student Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sen"
                          value={form.studentName}
                          onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400 flex justify-between">
                          <span>Student Email</span>
                          <span className="text-[9px] text-neutral-600 font-semibold uppercase">Optional</span>
                        </label>
                        <input
                          type="email"
                          placeholder="rahul@example.com"
                          value={form.studentEmail}
                          onChange={(e) => setForm({ ...form, studentEmail: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>

                    <hr className="border-neutral-800 my-4" />
                    <h3 className="text-sm font-bold text-white mb-2">Admission Tracker Details</h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Customer Name</label>
                        <input
                          type="text"
                          placeholder="Parent or Guardian Name"
                          value={form.customerName}
                          onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Phone Number</label>
                        <input
                          type="text"
                          placeholder="e.g. +91 9876543210"
                          value={form.phoneNumber}
                          onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Place</label>
                        <input
                          type="text"
                          placeholder="City or Area"
                          value={form.place}
                          onChange={(e) => setForm({ ...form, place: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Age</label>
                        <input
                          type="number"
                          placeholder="Student Age"
                          value={form.age}
                          onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : "" })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      {(!isSalesPerson || modal?.mode === "create" || canViewFee(form.salesExecutive)) && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">Fee Discussed</label>
                          <input
                            type="text"
                            placeholder="e.g. 5000 INR"
                            value={form.feeDiscussed}
                            onChange={(e) => setForm({ ...form, feeDiscussed: e.target.value })}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          />
                        </div>
                      )}
                      {!isSalesPerson && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">Sales Executive</label>
                          <select
                            value={form.salesExecutive}
                            onChange={(e) => setForm({ ...form, salesExecutive: e.target.value })}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors appearance-none"
                          >
                            <option value="">Select Sales Executive</option>
                            {salesPeople.map((sp: any) => (
                              <option key={sp._id} value={sp.name}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">No. of Hours</label>
                        <input
                          type="number"
                          placeholder="e.g. 10"
                          value={form.numberOfSessions}
                          onChange={(e) => setForm({ ...form, numberOfSessions: e.target.value ? Number(e.target.value) : "" })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Admission Confirmed</label>
                      <select
                        value={form.admissionConfirmed}
                        onChange={(e) => setForm({ ...form, admissionConfirmed: e.target.value as "Pending" | "Yes" | "No" })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    {form.admissionConfirmed === "Yes" && (
                      <div className="p-3 bg-neutral-800 border border-neutral-700 rounded-xl mt-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">Class Assigned Tutor</label>
                          <select
                            required={form.admissionConfirmed === "Yes"}
                            value={form.classAssignedTutor}
                            onChange={(e) => setForm({ ...form, classAssignedTutor: e.target.value })}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          >
                            <option value="">Select tutor...</option>
                            {teachers.map((t) => (
                              <option key={t._id} value={t._id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <hr className="border-neutral-800 my-4" />
                    <h3 className="text-sm font-bold text-white mb-2">Demo Class Details</h3>

                    {/* Subject */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Subject / Topic</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Demo Class - Web Dev Basics"
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>

                    {/* Teacher Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Assign Teacher</label>
                      <select
                        required
                        value={form.teacher}
                        onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        <option value="">Select teacher...</option>
                        {teachers.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date and Time slots */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Date</label>
                        <input
                          type="date"
                          required
                          value={form.date}
                          onChange={(e) => setForm({ ...form, date: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Start Time</label>
                        <input
                          type="time"
                          required
                          value={form.startTime}
                          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">End Time</label>
                        <input
                          type="time"
                          required
                          value={form.endTime}
                          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Availability check display */}
                    {form.teacher && form.date && (
                      <div
                        className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          availability.isAvailable
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : availability.isSet
                            ? "bg-red-500/10 border-red-500/20 text-red-400"
                            : "bg-neutral-800 border-neutral-700 text-neutral-400"
                        }`}
                      >
                        {availability.isAvailable ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold">
                            {availability.isAvailable ? "Teacher Available" : "Availability Warning"}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{availability.msg}</p>
                        </div>
                      </div>
                    )}

                    {/* Conflict check display */}
                    {hasConflict && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">⚠️ Scheduling Conflict Detected</p>
                          <p className="mt-0.5 text-[11px] opacity-90">
                            Teacher has another class or demo session scheduled within this time slot.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Optional Virtual Link */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Virtual Link (Optional)</label>
                      <input
                        type="url"
                        placeholder="https://meet.google.com/xxx-xxxx-xxx"
                        value={form.meetingLink}
                        onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Admin Notes / Remarks</label>
                      <input
                        type="text"
                        placeholder="e.g. Requested evening slot. Parents will also join."
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>

                    {/* Status (edit mode only) */}
                    {modal.mode === "edit" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        >
                          <option value="Scheduled">Scheduled</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* API Error display */}
                {(createDemoMutation.isError || updateDemoMutation.isError) && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                    {((createDemoMutation.error || updateDemoMutation.error) as any)?.response?.data?.message ||
                      "An API error occurred. Please try again."}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-neutral-800/80">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createDemoMutation.isPending || updateDemoMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {createDemoMutation.isPending || updateDemoMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : modal.mode === "create" ? (
                      <>
                        <Plus className="w-4 h-4" />
                        Schedule Class
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Update Details
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4"
            >
              <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Demo Class?</h3>
                <p className="text-neutral-400 text-xs mt-1">
                  Are you sure you want to remove this demo session? This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 bg-neutral-850 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteDemoMutation.mutate(deleteConfirm)}
                  disabled={deleteDemoMutation.isPending}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-655 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  {deleteDemoMutation.isPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Confirm Delete"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Details Modal */}
      <AnimatePresence>
        {viewingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-900/50 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-500" />
                    Demo Session Details
                  </h2>
                </div>
                <button
                  onClick={() => setViewingSession(null)}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                 {/* Basic Info */}
                 <div>
                   <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                     <User className="w-4 h-4 text-amber-500" /> Student Information
                   </h3>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-neutral-800/30 p-4 rounded-xl border border-neutral-800">
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Student Name</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.studentName}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Student Email</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.studentEmail || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Age</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.age || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Customer / Parent Name</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.customerName || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Phone Number</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.phoneNumber || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Place</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.place || "-"}</p>
                     </div>
                   </div>
                 </div>

                 {/* Class Details */}
                 <div>
                   <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                     <Video className="w-4 h-4 text-amber-500" /> Class Details
                   </h3>
                   <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-neutral-800/30 p-4 rounded-xl border border-neutral-800">
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Subject</p>
                       <p className="text-sm text-amber-400 font-bold mt-1">{viewingSession.subject}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Teacher</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.teacher?.name || "Unassigned"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Status</p>
                       <p className="text-sm font-medium mt-1">
                         <span className={`px-2 py-1 rounded-md text-xs font-bold border ${viewingSession.status === "Scheduled" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : viewingSession.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                           {viewingSession.status}
                         </span>
                       </p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Date</p>
                       <p className="text-sm text-white font-medium mt-1">{format(new Date(viewingSession.date), "dd MMM yyyy")}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Time</p>
                       <p className="text-sm text-white font-medium mt-1">{formatTimeAMPM(viewingSession.startTime)} - {formatTimeAMPM(viewingSession.endTime)}</p>
                     </div>
                     <div className="col-span-2 md:col-span-1">
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Meeting Link</p>
                       {viewingSession.meetingLink ? (
                         <a href={viewingSession.meetingLink} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:text-blue-300 font-medium mt-1 break-all flex items-center gap-1">
                           <LinkIcon className="w-3 h-3" /> Join Link
                         </a>
                       ) : (
                         <p className="text-sm text-neutral-500 font-medium mt-1">-</p>
                       )}
                     </div>
                     <div className="col-span-2 md:col-span-3 mt-2">
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Notes / Remarks</p>
                       <div className="bg-neutral-950/50 border border-neutral-800 p-3 rounded-lg mt-1">
                         <p className="text-sm text-neutral-300 whitespace-pre-wrap">{viewingSession.notes || "No notes provided."}</p>
                       </div>
                     </div>
                   </div>
                 </div>

                 {/* Admission Tracker */}
                 <div>
                   <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                     <AlignLeft className="w-4 h-4 text-amber-500" /> Admission Tracker
                   </h3>
                   <div className="grid grid-cols-2 gap-4 bg-neutral-800/30 p-4 rounded-xl border border-neutral-800">
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Fee Discussed</p>
                       <p className="text-sm text-white font-medium mt-1">
                         {canViewFee(viewingSession.salesExecutive) ? (viewingSession.feeDiscussed || "-") : <span className="text-neutral-500 italic">Hidden</span>}
                       </p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">No. of Hours</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.numberOfSessions || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Sales Executive</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.salesExecutive || "-"}</p>
                     </div>
                     <div>
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Admission Confirmed</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.admissionConfirmed || "Pending"}</p>
                     </div>
                   </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
