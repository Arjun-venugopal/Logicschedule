"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isSameDay, isSameWeek, isSameMonth, subMonths } from "date-fns";
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
  Check,
  Video,
  CheckCircle2,
  AlertCircle,
  Eye,
  LayoutGrid,
  List,
  FileText,
  UserCheck,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  CreditCard,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";
import { usePermissions } from "@/hooks/usePermissions";
import { AdmissionPaymentModal } from "@/components/payments/AdmissionPaymentModal";
import dynamic from "next/dynamic";
const DemoReportModal = dynamic(() => import("@/components/demo/DemoReportModal"), { ssr: false });

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
  admissionConfirmed?: "Pending" | "Yes" | "No" | "Teacher is not confirmed" | string;
  salesExecutive?: string;
  classAssignedTutor?: string;
  batchAssigned?: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Scheduled" | "Completed" | "Cancelled" | "Rescheduled";
  meetingLink?: string;
  notes?: string;
  cancellationReason?: string;
  conflict?: boolean;
  createdBy?: string;
  createdAt?: string;
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
  admissionConfirmed: "Pending" | "Yes" | "No" | "Teacher is not confirmed" | string;
  salesExecutive: string;
  classAssignedTutor: string;
  batchAssigned: string;
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Scheduled" | "Completed" | "Cancelled" | "Rescheduled";
  meetingLink: string;
  notes: string;
  cancellationReason: string;
  rescheduleDate?: string;
  rescheduleStartTime?: string;
  rescheduleEndTime?: string;
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
  cancellationReason: "",
  rescheduleDate: "",
  rescheduleStartTime: "",
  rescheduleEndTime: "",
});

export default function DemoSessionsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isTeacher = user?.role === "Teacher";
  const { searchQuery } = useSearchStore();
  const { canWrite, isSalesPerson } = usePermissions();
  const hasWriteAccess = canWrite("demoSessions");
  const canManageSlots = !isSalesPerson && hasWriteAccess;

  const canEditSession = (session: DemoSession) => {
    if (isTeacher) return true;
    if (hasWriteAccess) return true;
    if (session.createdBy === user?._id) return true;
    if (user?.name && session.salesExecutive?.trim().toLowerCase() === user.name.trim().toLowerCase()) return true;
    return false;
  };

  const [modal, setModal] = useState<{ open: boolean; mode: "create" | "edit" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState<DemoSessionForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterTeacher, setFilterTeacher] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterAdmissionStatus, setFilterAdmissionStatus] = useState<string>("");
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("All");
  const [filterDay, setFilterDay] = useState<string>("All");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [viewingSession, setViewingSession] = useState<DemoSession | null>(null);
  const [reportSession, setReportSession] = useState<DemoSession | null>(null);
  const [admissionPaymentSession, setAdmissionPaymentSession] = useState<DemoSession | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [activeTab, setActiveTab] = useState<"sessions" | "slots">("sessions");
  const [slotForm, setSlotForm] = useState({
    teacher: "",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:00",
  });

  // Queries with optimized caching
  const { data: demoSessions = [], isLoading: isLoadingDemo } = useQuery<DemoSession[]>({
    queryKey: ["demo-sessions"],
    queryFn: async () => (await api.get("/demo-sessions")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: teachers = [] } = useQuery<Teacher[]>({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: schedules = [] } = useQuery<any[]>({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: demoSlots = [], isLoading: isLoadingSlots } = useQuery<any[]>({
    queryKey: ["demo-slots"],
    queryFn: async () => (await api.get("/demo-slots")).data,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: salesPeople = [] } = useQuery<any[]>({
    queryKey: ["salesPeople"],
    queryFn: async () => (await api.get("/sales-people")).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
    if (isTeacher && user?.email && teachers.length > 0) {
      setSlotForm((prev) => {
        if (prev.teacher) return prev;
        const myTeacher = teachers.find((t) => t.email === user.email);
        return myTeacher ? { ...prev, teacher: myTeacher._id } : prev;
      });
    }
  }, [isTeacher, user, teachers]);

  const updateDemoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: DemoSessionForm }) =>
      api.put(`/demo-sessions/${id}`, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      closeModal();
      if (variables.data.admissionConfirmed === "Yes" || variables.data.admissionConfirmed === "Won") {
        setAdmissionPaymentSession({
          ...variables.data,
          _id: variables.id,
        } as any);
      }
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
  const formatDateSafe = (dateStr: any, pattern: string = "dd MMM yyyy") => {
    if (!dateStr) return "";
    try {
      const d = typeof dateStr === "string" && dateStr.includes("-") && dateStr.length === 10 ? parseISO(dateStr) : new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return format(d, pattern);
    } catch {
      return String(dateStr);
    }
  };

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

  const getAdmissionBadge = (status?: string) => {
    const val = status || "Pending";
    if (val === "Won" || val === "Yes") {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
    if (val === "Teacher is not confirmed" || val === "Teacher Not Confirmed") {
      return "bg-sky-500/10 text-sky-400 border-sky-500/20";
    }
    if (val === "Loss" || val === "No") {
      return "bg-red-500/10 text-red-400 border-red-500/20";
    }
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
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
      date: formatDateSafe(slot.date, "yyyy-MM-dd"),
      startTime: slot.startTime,
      endTime: slot.endTime,
      salesExecutive: isSalesPerson && user?.name ? user.name : "",
    });
    setEditingId(null);
    setModal({ open: true, mode: "create" });
    setActiveTab("sessions");
  };

  const openEdit = (d: DemoSession, overrideStatus?: "Scheduled" | "Completed" | "Cancelled" | "Rescheduled") => {
    const currentStatus = overrideStatus || d.status || "Scheduled";
    setForm({
      teacher: d.teacher?._id || (d.teacher as any) || "unassigned",
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
      date: formatDateSafe(d.date, "yyyy-MM-dd"),
      startTime: d.startTime,
      endTime: d.endTime,
      status: currentStatus,
      meetingLink: d.meetingLink || "",
      notes: d.notes || "",
      cancellationReason: d.cancellationReason || "",
      rescheduleDate: formatDateSafe(d.date, "yyyy-MM-dd"),
      rescheduleStartTime: d.startTime || "09:00",
      rescheduleEndTime: d.endTime || "10:00",
    });
    setEditingId(d._id);
    setModal({ open: true, mode: "edit" });
  };

  const handleQuickStatusChange = (session: DemoSession, newStatus: "Scheduled" | "Completed" | "Cancelled" | "Rescheduled") => {
    if (newStatus === "Rescheduled" || newStatus === "Cancelled") {
      openEdit(session, newStatus);
    } else {
      updateDemoMutation.mutate({
        id: session._id,
        data: {
          teacher: session.teacher?._id || (session.teacher as any) || "unassigned",
          studentName: session.studentName,
          studentEmail: session.studentEmail || "",
          customerName: session.customerName || "",
          phoneNumber: session.phoneNumber || "",
          place: session.place || "",
          age: session.age || "",
          feeDiscussed: session.feeDiscussed || "",
          numberOfSessions: session.numberOfSessions || "",
          admissionConfirmed: session.admissionConfirmed || "Pending",
          salesExecutive: session.salesExecutive || "",
          classAssignedTutor: session.classAssignedTutor || "",
          batchAssigned: session.batchAssigned || "",
          subject: session.subject,
          date: formatDateSafe(session.date, "yyyy-MM-dd"),
          startTime: session.startTime,
          endTime: session.endTime,
          status: newStatus,
          meetingLink: session.meetingLink || "",
          notes: session.notes || "",
          cancellationReason: session.cancellationReason || "",
        },
      });
    }
  };

  const closeModal = () => {
    setModal(null);
    setForm(emptyForm());
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form };
    payload.status = payload.status || "Scheduled";
    if (payload.status === "Rescheduled") {
      if (payload.rescheduleDate) payload.date = payload.rescheduleDate;
      if (payload.rescheduleStartTime) payload.startTime = payload.rescheduleStartTime;
      if (payload.rescheduleEndTime) payload.endTime = payload.rescheduleEndTime;
    }
    if (modal?.mode === "edit" && editingId) {
      updateDemoMutation.mutate({ id: editingId, data: payload });
    } else {
      createDemoMutation.mutate(payload);
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

  // Memoized teacher+date index for fast sub-linear conflict checking
  const teacherDateSchedulesMap = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    const parseMin = (t: string) => {
      if (!t) return -1;
      const [h, m] = t.split(":").map(Number);
      return isNaN(h) || isNaN(m) ? -1 : h * 60 + m;
    };

    for (const s of schedules) {
      if (s.status === "Cancelled" || !s.date || !s.startTime || !s.endTime) continue;
      const tId = s.teacher?._id || s.teacher;
      if (!tId) continue;
      const sDate = formatDateSafe(s.date, "yyyy-MM-dd");
      if (!sDate) continue;
      const start = parseMin(s.startTime);
      const end = parseMin(s.endTime);
      if (start < 0 || end < 0) continue;

      const key = `${tId}_${sDate}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push({ start, end });
    }
    return map;
  }, [schedules]);

  const teacherDateDemosMap = useMemo(() => {
    const map = new Map<string, { id: string; start: number; end: number }[]>();
    const parseMin = (t: string) => {
      if (!t) return -1;
      const [h, m] = t.split(":").map(Number);
      return isNaN(h) || isNaN(m) ? -1 : h * 60 + m;
    };

    for (const d of demoSessions) {
      if (d.status === "Cancelled" || !d.date || !d.startTime || !d.endTime) continue;
      const tId = d.teacher?._id || (d.teacher as any);
      if (!tId) continue;
      const dDate = formatDateSafe(d.date, "yyyy-MM-dd");
      if (!dDate) continue;
      const start = parseMin(d.startTime);
      const end = parseMin(d.endTime);
      if (start < 0 || end < 0) continue;

      const key = `${tId}_${dDate}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push({ id: d._id, start, end });
    }
    return map;
  }, [demoSessions]);

  // Conflict Logic (O(1) key lookup into date-slot intervals)
  const hasConflict = useMemo(() => {
    if (!form.teacher || !form.date || !form.startTime || !form.endTime) return false;

    const parseMin = (t: string) => {
      if (!t) return -1;
      const [h, m] = t.split(":").map(Number);
      return isNaN(h) || isNaN(m) ? -1 : h * 60 + m;
    };

    const targetStart = parseMin(form.startTime);
    const targetEnd = parseMin(form.endTime);
    if (targetStart < 0 || targetEnd < 0 || targetEnd <= targetStart) return false;

    const lookupKey = `${form.teacher}_${form.date}`;

    // 1. Check regular classes for this teacher on this date
    const daySchedules = teacherDateSchedulesMap.get(lookupKey);
    if (daySchedules && daySchedules.some(s => targetStart < s.end && targetEnd > s.start)) {
      return true;
    }

    // 2. Check other demo sessions for this teacher on this date
    const dayDemos = teacherDateDemosMap.get(lookupKey);
    if (dayDemos && dayDemos.some(d => d.id !== editingId && targetStart < d.end && targetEnd > d.start)) {
      return true;
    }

    return false;
  }, [form.teacher, form.date, form.startTime, form.endTime, teacherDateSchedulesMap, teacherDateDemosMap, editingId]);

  const availability = checkAvailabilityStatus();

  const salesExecOptions = useMemo(() => {
    const map = new Map<string, string>();
    salesPeople.forEach((sp: any) => {
      const name = sp.name?.trim();
      if (name) {
        map.set(name.toLowerCase(), name);
      }
    });
    demoSessions.forEach((d: any) => {
      const name = d.salesExecutive?.trim();
      if (name) {
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, name);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [salesPeople, demoSessions]);

  const uniqueSalesPeople = useMemo(() => {
    const map = new Map<string, any>();
    salesPeople.forEach((sp: any) => {
      const name = sp.name?.trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), sp);
      }
    });
    return Array.from(map.values());
  }, [salesPeople]);

  // Filters
  const filteredSessions = demoSessions.filter((d) => {
    // Search filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      const matchName = d.studentName.toLowerCase().includes(search);
      const matchSubject = d.subject.toLowerCase().includes(search);
      const matchTeacher = d.teacher?.name?.toLowerCase().includes(search);
      const matchSales = d.salesExecutive?.toLowerCase().includes(search);
      const matchAdmission = (d.admissionConfirmed || "").toLowerCase().includes(search);
      if (!matchName && !matchSubject && !matchTeacher && !matchSales && !matchAdmission) return false;
    }

    // Teacher filter
    if (filterTeacher) {
      const tId = d.teacher?._id || (d.teacher as any);
      if (tId !== filterTeacher) return false;
    }

    // Status filter
    if (filterStatus && (d.status || "Scheduled") !== filterStatus) return false;

    // Admission Status filter
    if (filterAdmissionStatus) {
      const admStatus = d.admissionConfirmed || "Pending";
      if (filterAdmissionStatus === "Yes") {
        if (admStatus !== "Yes" && admStatus !== "Won") return false;
      } else if (filterAdmissionStatus === "No") {
        if (admStatus !== "No" && admStatus !== "Loss") return false;
      } else if (filterAdmissionStatus === "Pending") {
        if (admStatus !== "Pending") return false;
      } else if (filterAdmissionStatus === "Teacher is not confirmed") {
        if (admStatus !== "Teacher is not confirmed" && admStatus !== "Teacher Not Confirmed") return false;
      } else if (admStatus !== filterAdmissionStatus) {
        return false;
      }
    }

    // Sales Exec / Sales Person filter
    if (filterSalesPerson) {
      const target = filterSalesPerson.toLowerCase();
      const sessExec = d.salesExecutive ? d.salesExecutive.trim().toLowerCase() : "";
      const matchesExec = sessExec === target || sessExec.includes(target);
      const spObj = salesPeople.find((sp: any) => sp._id === filterSalesPerson || sp.name?.toLowerCase() === target);
      const matchesCreator = d.createdBy && (d.createdBy === filterSalesPerson || (spObj && d.createdBy === spObj._id));
      if (!matchesExec && !matchesCreator) return false;
    }

    // Date filter
    if (filterDate !== "All") {
      if (!d.date) return false;
      const dDate = new Date(d.date);
      if (isNaN(dDate.getTime())) return false;
      const today = new Date();
      if (filterDate === "Today" && !isSameDay(dDate, today)) return false;
      if (filterDate === "This Week" && !isSameWeek(dDate, today)) return false;
      if (filterDate === "This Month" && !isSameMonth(dDate, today)) return false;
      if (filterDate === "Last Month" && !isSameMonth(dDate, subMonths(today, 1))) return false;
    }

    // Day of week filter
    if (filterDay && filterDay !== "All") {
      if (!d.date) return false;
      const dayName = formatDateSafe(d.date, "EEEE");
      if (dayName !== filterDay) return false;
    }

    // Start & End Date range filter
    if (filterStartDate || filterEndDate) {
      if (!d.date) return false;
      const sDate = formatDateSafe(d.date, "yyyy-MM-dd");
      if (filterStartDate && sDate < filterStartDate) return false;
      if (filterEndDate && sDate > filterEndDate) return false;
    }

    return true;
  });

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
      const dateAStr = formatDateSafe(a.date, "yyyy-MM-dd");
      const dateBStr = formatDateSafe(b.date, "yyyy-MM-dd");

      // Compare dates descending (newest date first)
      if (dateAStr && dateBStr && dateAStr !== dateBStr) {
        return dateBStr.localeCompare(dateAStr);
      }

      if (!dateAStr && dateBStr) return 1;
      if (dateAStr && !dateBStr) return -1;

      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      const validA = isNaN(timeA) ? 0 : timeA;
      const validB = isNaN(timeB) ? 0 : timeB;
      if (validB !== validA) {
        return validB - validA;
      }

      // If dates are identical, sort by startTime descending
      const timeCompare = (b.startTime || "").localeCompare(a.startTime || "");
      if (timeCompare !== 0) {
        return timeCompare;
      }

      // If both date and startTime are identical, fallback to createdAt descending
      const createdA = new Date(a.createdAt || 0).getTime();
      const createdB = new Date(b.createdAt || 0).getTime();
      return (isNaN(createdB) ? 0 : createdB) - (isNaN(createdA) ? 0 : createdA);
    });
  }, [filteredSessions]);

  // Slots Filtering & Grouping
  const filteredSlots = demoSlots.filter((slot: any) => {
    if (filterTeacher && slot.teacher?._id !== filterTeacher && slot.teacher !== filterTeacher) {
      return false;
    }
    if (filterDate !== "All") {
      if (!slot.date) return false;
      const sDate = new Date(slot.date);
      if (isNaN(sDate.getTime())) return false;
      const today = new Date();
      if (filterDate === "Today" && !isSameDay(sDate, today)) return false;
      if (filterDate === "This Week" && !isSameWeek(sDate, today)) return false;
      if (filterDate === "This Month" && !isSameMonth(sDate, today)) return false;
      if (filterDate === "Last Month" && !isSameMonth(sDate, subMonths(today, 1))) return false;
    }
    if (filterDay && filterDay !== "All") {
      if (!slot.date) return false;
      const dayName = formatDateSafe(slot.date, "EEEE");
      if (dayName !== filterDay) return false;
    }
    if (filterStartDate || filterEndDate) {
      if (!slot.date) return false;
      const sDate = formatDateSafe(slot.date, "yyyy-MM-dd");
      if (filterStartDate && sDate < filterStartDate) return false;
      if (filterEndDate && sDate > filterEndDate) return false;
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

  // Active Filter Helpers
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterDate !== "All") count++;
    if (filterDay !== "All") count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    if (filterTeacher) count++;
    if (filterSalesPerson) count++;
    if (filterStatus) count++;
    if (filterAdmissionStatus) count++;
    return count;
  }, [filterDate, filterDay, filterStartDate, filterEndDate, filterTeacher, filterSalesPerson, filterStatus, filterAdmissionStatus]);

  const hasActiveFilters = activeFilterCount > 0;

  const handleClearAllFilters = () => {
    setFilterTeacher("");
    setFilterStatus("");
    setFilterAdmissionStatus("");
    setFilterSalesPerson("");
    setFilterDate("All");
    setFilterDay("All");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const activeSlotFilterCount = useMemo(() => {
    let count = 0;
    if (filterDate !== "All") count++;
    if (filterDay !== "All") count++;
    if (filterStartDate) count++;
    if (filterEndDate) count++;
    if (filterTeacher) count++;
    return count;
  }, [filterDate, filterDay, filterStartDate, filterEndDate, filterTeacher]);

  const hasActiveSlotFilters = activeSlotFilterCount > 0;

  const handleClearSlotFilters = () => {
    setFilterTeacher("");
    setFilterDate("All");
    setFilterDay("All");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const canViewFee = (sessionSalesExec?: string) => {
    if (!isSalesPerson) return true;
    if (!user?.name) return false;
    return sessionSalesExec?.trim().toLowerCase() === user.name.trim().toLowerCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Video className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
            Demo Sessions
          </h1>
          <p className="text-neutral-400 text-xs sm:text-sm mt-0.5">
            {isTeacher
              ? "View and update feedback for your upcoming prospect demo classes"
              : "Schedule and manage prospective student demo classes based on teacher availability"}
          </p>
        </div>
        
        {hasWriteAccess && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-neutral-900 border border-neutral-800 p-1 rounded-xl flex items-center">
              <button
                onClick={() => setActiveTab("sessions")}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                  activeTab === "sessions" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Sessions
              </button>
              <button
                onClick={() => setActiveTab("slots")}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                  activeTab === "slots" ? "bg-neutral-800 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                Available Slots
              </button>
            </div>
            
            {!isTeacher && activeTab === "sessions" && canManageSlots && (
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-xs sm:text-sm shadow-lg shadow-amber-500/20"
              >
                <Plus className="w-4 h-4" /> Schedule Demo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      {activeTab === "sessions" && (
        <div className="flex flex-col gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 lg:p-5 shadow-sm space-y-3.5">
            {/* Filter Header with active count & reset */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-800/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-white tracking-wide">Filter Sessions</span>
                {activeFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              
              {hasActiveFilters && (
                <button
                  onClick={handleClearAllFilters}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 rounded-lg transition-colors ml-auto cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            {/* Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {/* Date Preset */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Date Range</label>
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterDate !== "All" ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="All">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                </select>
              </div>

              {/* Day of Week */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Day of Week</label>
                <select
                  value={filterDay}
                  onChange={(e) => setFilterDay(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterDay !== "All" ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="All">All Days</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">From Date</label>
                <div className={`relative flex items-center h-10 bg-neutral-800 border rounded-xl px-3 transition-all ${
                  filterStartDate ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus-within:border-amber-500"
                }`}>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-white outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 cursor-pointer"
                    title="Filter by Start Date"
                  />
                  {filterStartDate && (
                    <button
                      type="button"
                      onClick={() => setFilterStartDate("")}
                      className="p-1 text-neutral-400 hover:text-white shrink-0 ml-1"
                      title="Clear start date"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">To Date</label>
                <div className={`relative flex items-center h-10 bg-neutral-800 border rounded-xl px-3 transition-all ${
                  filterEndDate ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus-within:border-amber-500"
                }`}>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-white outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 cursor-pointer"
                    title="Filter by End Date"
                  />
                  {filterEndDate && (
                    <button
                      type="button"
                      onClick={() => setFilterEndDate("")}
                      className="p-1 text-neutral-400 hover:text-white shrink-0 ml-1"
                      title="Clear end date"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Teacher (if not teacher) */}
              {!isTeacher && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400 block">Teacher</label>
                  <select
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                    className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                      filterTeacher ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                    }`}
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

              {/* Sales Exec (if not sales) */}
              {!isSalesPerson && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400 block">Sales Executive</label>
                  <select
                    value={filterSalesPerson}
                    onChange={(e) => setFilterSalesPerson(e.target.value)}
                    className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                      filterSalesPerson ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                    }`}
                  >
                    <option value="">All Sales Execs</option>
                    {salesExecOptions.map((execName: string) => (
                      <option key={execName} value={execName}>
                        {execName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Session Status */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Session Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterStatus ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="">All Session Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Rescheduled">Rescheduled</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Admission Status */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Admission Status</label>
                <select
                  value={filterAdmissionStatus}
                  onChange={(e) => setFilterAdmissionStatus(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterAdmissionStatus ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="">All Admission Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Yes">Yes</option>
                  <option value="Teacher is not confirmed">Teacher is not confirmed</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Stats Summary & View Toggle */}
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-medium">Total Demos Booked</p>
                <p className="text-lg sm:text-xl font-bold text-white">{filteredSessions.length}</p>
              </div>
            </div>
            <div className="flex items-center justify-between w-full sm:w-auto gap-4 text-left sm:text-right">
              <div>
                <p className="text-[10px] text-neutral-500 uppercase font-semibold">Current Filter</p>
                <p className="text-xs sm:text-sm font-medium text-amber-400">
                  {filterStartDate && filterEndDate
                    ? `${formatDateSafe(filterStartDate, "dd MMM")} - ${formatDateSafe(filterEndDate, "dd MMM yyyy")}`
                    : filterStartDate
                    ? `From ${formatDateSafe(filterStartDate, "dd MMM yyyy")}`
                    : filterEndDate
                    ? `Until ${formatDateSafe(filterEndDate, "dd MMM yyyy")}`
                    : filterDate === "All"
                    ? "All Time"
                    : filterDate}
                </p>
              </div>
              
              {!isTeacher && (
                <div className="flex bg-neutral-900 border border-neutral-800 p-1 rounded-xl shrink-0">
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
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden overflow-x-auto w-full">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4 p-3 sm:p-5 bg-neutral-900/30">
            {sortedSessions.map((session) => {
              const statusColors: Record<string, string> = {
                Scheduled: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                Cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
                Rescheduled: "bg-purple-500/10 text-purple-400 border-purple-500/20",
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
                      {canEditSession(session) ? (
                        <select
                          value={session.status || "Scheduled"}
                          onChange={(e) => handleQuickStatusChange(session, e.target.value as any)}
                          disabled={updateDemoMutation.isPending}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border bg-neutral-900 cursor-pointer focus:outline-none transition-colors appearance-none ${
                            statusColors[session.status || "Scheduled"] || statusColors.Scheduled
                          }`}
                        >
                          <option value="Scheduled" className="bg-neutral-900 text-amber-400">Scheduled</option>
                          <option value="Completed" className="bg-neutral-900 text-emerald-400">Completed</option>
                          <option value="Rescheduled" className="bg-neutral-900 text-purple-400">Rescheduled</option>
                          <option value="Cancelled" className="bg-neutral-900 text-red-400">Cancelled</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusColors[session.status || "Scheduled"] || statusColors.Scheduled}`}
                        >
                          {session.status || "Scheduled"}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-xs text-neutral-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{formatDateSafe(session.date, "EEEE, MMMM d, yyyy")}</span>
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
                        <span>Subject: <strong className="text-white">{session.subject || (session.status === "Cancelled" && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">Cancelled</span>) || "-"}</strong></span>
                      </div>
                      {session.salesExecutive && (
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Sales Exec: <strong className="text-neutral-200">{session.salesExecutive}</strong></span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Admn Status: <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getAdmissionBadge(session.admissionConfirmed)}`}>{session.admissionConfirmed || "Pending"}</span></span>
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
                        {canEditSession(session) && (
                          <button
                            onClick={() => openEdit(session)}
                            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition-colors border border-neutral-700"
                            title={isTeacher ? "Add notes / feedback" : "Edit Session"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {session.status === "Completed" && (
                          <button
                            onClick={() => setReportSession(session)}
                            className="p-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 rounded-lg transition-colors border border-purple-500/25"
                            title="Student Performance Report"
                          >
                            <FileText className="w-3.5 h-3.5" />
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
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Admn Confirmed</th>
                  <th className="px-4 py-3">Sales Exec</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {sortedSessions.map((session) => (
                  <tr key={session._id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{session.studentName}</td>
                    <td className="px-4 py-3">{session.customerName || "-"}</td>
                    <td className="px-4 py-3">{session.phoneNumber || "-"}</td>
                    <td className="px-4 py-3">{session.place || "-"}</td>
                    <td className="px-4 py-3">{session.age || "-"}</td>
                    <td className="px-4 py-3">{formatDateSafe(session.date, "dd MMM yyyy")}</td>
                    <td className="px-4 py-3">{formatTimeAMPM(session.startTime)} - {formatTimeAMPM(session.endTime)}</td>
                    <td className="px-4 py-3">{session.teacher?.name || "-"}</td>
                    <td className="px-4 py-3">{session.subject || (session.status === "Cancelled" && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">Cancelled</span>) || "-"}</td>
                    <td className="px-4 py-3">
                      {canEditSession(session) ? (
                        <select
                          value={session.status || "Scheduled"}
                          onChange={(e) => handleQuickStatusChange(session, e.target.value as any)}
                          disabled={updateDemoMutation.isPending}
                          className={`px-2 py-1 rounded-md text-xs font-bold border bg-neutral-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors appearance-none ${
                            (session.status || "Scheduled") === "Scheduled"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : session.status === "Completed"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : session.status === "Rescheduled"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          <option value="Scheduled" className="bg-neutral-900 text-amber-400">Scheduled</option>
                          <option value="Completed" className="bg-neutral-900 text-emerald-400">Completed</option>
                          <option value="Rescheduled" className="bg-neutral-900 text-purple-400">Rescheduled</option>
                          <option value="Cancelled" className="bg-neutral-900 text-red-400">Cancelled</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded-md text-xs font-bold border ${(session.status || "Scheduled") === "Scheduled" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : session.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : session.status === "Rescheduled" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                          {session.status || "Scheduled"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${getAdmissionBadge(session.admissionConfirmed)}`}>
                        {session.admissionConfirmed || "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{session.salesExecutive || "-"}</td>
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={() => setViewingSession(session)} className="text-blue-400 hover:text-blue-300" title="View Details"><Eye className="w-4 h-4" /></button>
                      {canEditSession(session) && (
                        <>
                          <button onClick={() => openEdit(session)} className="text-neutral-400 hover:text-white" title="Edit Session"><Edit2 className="w-4 h-4" /></button>
                          {(canManageSlots || (isSalesPerson && (session.createdBy === user?._id || session.salesExecutive === user?.name))) && (
                            <button onClick={() => setDeleteConfirm(session._id)} className="text-red-400 hover:text-red-300" title="Delete Session"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </>
                      )}
                      {session.status === "Completed" && (
                        <button onClick={() => setReportSession(session)} className="text-purple-400 hover:text-purple-300" title="Student Performance Report"><FileText className="w-4 h-4" /></button>
                      )}
                      {(session.admissionConfirmed === "Yes" || session.status === "Completed") && (
                        <button
                          onClick={() => setAdmissionPaymentSession(session)}
                          className="text-amber-400 hover:text-amber-300"
                          title="Fee Collection / Payment Details"
                        >
                          <CreditCard className="w-4 h-4" />
                        </button>
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
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-amber-400" />
                <h2 className="text-base sm:text-lg font-bold text-white">Add Available Time Slot</h2>
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isTeacher ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3 sm:gap-4 items-end`}>
                {!isTeacher && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Teacher *</label>
                    <select
                      required
                      value={slotForm.teacher}
                      onChange={(e) => setSlotForm({ ...slotForm, teacher: e.target.value })}
                      disabled={isTeacher}
                      className="w-full h-10 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
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
                    className="w-full h-10 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 [&::-webkit-calendar-picker-indicator]:invert transition-all cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-400">Start Time *</label>
                  <input
                    required
                    type="time"
                    value={slotForm.startTime}
                    onChange={(e) => setSlotForm({ ...slotForm, startTime: e.target.value })}
                    className="w-full h-10 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 [&::-webkit-calendar-picker-indicator]:invert transition-all cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-400">End Time *</label>
                  <input
                    required
                    type="time"
                    value={slotForm.endTime}
                    onChange={(e) => setSlotForm({ ...slotForm, endTime: e.target.value })}
                    className="w-full h-10 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none focus:border-amber-500 [&::-webkit-calendar-picker-indicator]:invert transition-all cursor-pointer"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <button
                    onClick={() => {
                      if (slotForm.teacher && slotForm.date && slotForm.startTime && slotForm.endTime) {
                        createSlotMutation.mutate(slotForm);
                      }
                    }}
                    disabled={createSlotMutation.isPending || !slotForm.teacher}
                    className="w-full h-10 px-4 brand-gradient hover:opacity-95 text-black font-semibold rounded-xl transition-all text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    {createSlotMutation.isPending ? "Adding..." : "Add Slot"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Slots Filter */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 mb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-neutral-800/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-white">Filter Slots</span>
                {activeSlotFilterCount > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full">
                    {activeSlotFilterCount} active
                  </span>
                )}
              </div>
              {hasActiveSlotFilters && (
                <button
                  onClick={handleClearSlotFilters}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700 rounded-lg transition-colors ml-auto cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${!isTeacher ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
              {/* Date Range */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Date Range</label>
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterDate !== "All" ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="All">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="Last Month">Last Month</option>
                </select>
              </div>

              {/* Day of Week */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">Day of Week</label>
                <select
                  value={filterDay}
                  onChange={(e) => setFilterDay(e.target.value)}
                  className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                    filterDay !== "All" ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                  }`}
                >
                  <option value="All">All Days</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">From Date</label>
                <div className={`relative flex items-center h-10 bg-neutral-800 border rounded-xl px-3 transition-all ${
                  filterStartDate ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus-within:border-amber-500"
                }`}>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-white outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 cursor-pointer"
                    title="Filter by Start Date"
                  />
                  {filterStartDate && (
                    <button
                      type="button"
                      onClick={() => setFilterStartDate("")}
                      className="p-1 text-neutral-400 hover:text-white shrink-0 ml-1"
                      title="Clear start date"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400 block">To Date</label>
                <div className={`relative flex items-center h-10 bg-neutral-800 border rounded-xl px-3 transition-all ${
                  filterEndDate ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus-within:border-amber-500"
                }`}>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full bg-transparent text-xs sm:text-sm text-white outline-none [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70 cursor-pointer"
                    title="Filter by End Date"
                  />
                  {filterEndDate && (
                    <button
                      type="button"
                      onClick={() => setFilterEndDate("")}
                      className="p-1 text-neutral-400 hover:text-white shrink-0 ml-1"
                      title="Clear end date"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Teacher */}
              {!isTeacher && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-400 block">Teacher</label>
                  <select
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                    className={`w-full h-10 bg-neutral-800 border rounded-xl px-3 py-2 text-xs sm:text-sm text-white outline-none transition-all cursor-pointer truncate ${
                      filterTeacher ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-700 focus:border-amber-500"
                    }`}
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
            </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-800 bg-neutral-900 sticky top-0 z-10 shrink-0">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
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
              <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
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
                        <option value="Rescheduled">Rescheduled</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>

                    {/* Reschedule Date & Time (Teacher View) */}
                    {form.status === "Rescheduled" && (
                      <div className="space-y-3 p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                        <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" /> Reschedule Date & Time
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">New Date *</label>
                            <input
                              type="date"
                              required
                              value={form.rescheduleDate || form.date}
                              onChange={(e) => setForm({ ...form, rescheduleDate: e.target.value, date: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">Start Time *</label>
                            <input
                              type="time"
                              required
                              value={form.rescheduleStartTime || form.startTime}
                              onChange={(e) => setForm({ ...form, rescheduleStartTime: e.target.value, startTime: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">End Time *</label>
                            <input
                              type="time"
                              required
                              value={form.rescheduleEndTime || form.endTime}
                              onChange={(e) => setForm({ ...form, rescheduleEndTime: e.target.value, endTime: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cancellation Reason (Teacher View) */}
                    {form.status === "Cancelled" && (
                      <div className="space-y-1.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <label className="text-xs font-semibold text-red-400">Reason for Cancellation</label>
                        <textarea
                          required
                          rows={2}
                          placeholder="Please provide a reason..."
                          value={form.cancellationReason}
                          onChange={(e) => setForm({ ...form, cancellationReason: e.target.value })}
                          className="w-full bg-neutral-900 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors resize-none"
                        />
                      </div>
                    )}

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-400">Sales Executive</label>
                        <select
                          value={form.salesExecutive}
                          onChange={(e) => setForm({ ...form, salesExecutive: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors appearance-none"
                        >
                          <option value="">Select Sales Executive</option>
                          {uniqueSalesPeople.map((sp: any) => (
                            <option key={sp._id} value={sp.name}>
                              {sp.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-neutral-400">Admission Confirmed</label>
                      <select
                        value={form.admissionConfirmed}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm({
                            ...form,
                            admissionConfirmed: val,
                            ...(val === "Teacher is not confirmed" ? { classAssignedTutor: "" } : {}),
                          });
                        }}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Yes">Yes</option>
                        <option value="Teacher is not confirmed">Teacher is not confirmed</option>
                        <option value="No">No</option>
                      </select>
                    </div>

                    {form.admissionConfirmed === "Teacher is not confirmed" && (
                      <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl mt-2 flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                        <p className="text-xs text-sky-300">
                          Admission is confirmed. Regular class tutor is not confirmed yet and can be assigned later.
                        </p>
                      </div>
                    )}

                    {(form.admissionConfirmed === "Yes" || form.admissionConfirmed === "Won") && (
                      <div className="p-3 bg-neutral-800 border border-neutral-700 rounded-xl mt-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-neutral-400">Class Assigned Tutor</label>
                          <select
                            required={form.admissionConfirmed === "Yes" || form.admissionConfirmed === "Won"}
                            value={form.classAssignedTutor}
                            onChange={(e) => setForm({ ...form, classAssignedTutor: e.target.value })}
                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                          >
                            <option value="">Select tutor...</option>
                            <option value="Teacher is not confirmed">Teacher is not confirmed</option>
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
                        required={form.status !== "Cancelled"}
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
                        value={form.teacher}
                        onChange={(e) => setForm({ ...form, teacher: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                      >
                        <option value="">Select teacher...</option>
                        <option value="unassigned" className="text-amber-400">⚠ Teacher is Unassigned</option>
                        {teachers.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date and Time slots */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          value={form.status || "Scheduled"}
                          onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                        >
                          <option value="Scheduled">Scheduled</option>
                          <option value="Completed">Completed</option>
                          <option value="Rescheduled">Rescheduled</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    )}

                    {/* Reschedule Date & Time (Admin View) */}
                    {form.status === "Rescheduled" && (
                      <div className="space-y-3 p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-xl mt-2">
                        <label className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" /> Reschedule Date & Time
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">New Date *</label>
                            <input
                              type="date"
                              required
                              value={form.rescheduleDate || form.date}
                              onChange={(e) => setForm({ ...form, rescheduleDate: e.target.value, date: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">Start Time *</label>
                            <input
                              type="time"
                              required
                              value={form.rescheduleStartTime || form.startTime}
                              onChange={(e) => setForm({ ...form, rescheduleStartTime: e.target.value, startTime: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-400 font-semibold block mb-1">End Time *</label>
                            <input
                              type="time"
                              required
                              value={form.rescheduleEndTime || form.endTime}
                              onChange={(e) => setForm({ ...form, rescheduleEndTime: e.target.value, endTime: e.target.value })}
                              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cancellation / Rejection Reason */}
                    {(form.status === "Cancelled" || form.admissionConfirmed === "No" || form.admissionConfirmed === "Loss") && (
                      <div className="space-y-1.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mt-2">
                        <label className="text-xs font-semibold text-red-400">
                          {form.status === "Cancelled" ? "Reason for Cancellation" : "Reason for Admission Rejection"}
                        </label>
                        <textarea
                          required={form.status === "Cancelled"}
                          rows={2}
                          placeholder="Please provide a reason..."
                          value={form.cancellationReason}
                          onChange={(e) => setForm({ ...form, cancellationReason: e.target.value })}
                          className="w-full bg-neutral-900 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 transition-colors resize-none"
                        />
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
                       <p className="text-sm text-amber-400 font-bold mt-1">{viewingSession.subject || (viewingSession.status === "Cancelled" && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">Cancelled</span>) || "-"}</p>
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
                       <p className="text-sm text-white font-medium mt-1">{formatDateSafe(viewingSession.date, "dd MMM yyyy")}</p>
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
                       <p className="text-[10px] text-neutral-500 uppercase font-semibold">Sales Executive</p>
                       <p className="text-sm text-white font-medium mt-1">{viewingSession.salesExecutive || "-"}</p>
                     </div>
                     <div>
                        <p className="text-[10px] text-neutral-500 uppercase font-semibold">Admission Confirmed</p>
                        <p className="text-sm font-medium mt-1">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${getAdmissionBadge(viewingSession.admissionConfirmed)}`}>
                            {viewingSession.admissionConfirmed || "Pending"}
                          </span>
                        </p>
                      </div>
                      {(viewingSession.admissionConfirmed === "Yes" || viewingSession.admissionConfirmed === "Teacher is not confirmed" || viewingSession.admissionConfirmed === "Teacher Not Confirmed" || viewingSession.classAssignedTutor) && (
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase font-semibold">Class Assigned Tutor</p>
                          <p className="text-sm text-white font-medium mt-1">
                            {viewingSession.admissionConfirmed === "Teacher is not confirmed" || viewingSession.admissionConfirmed === "Teacher Not Confirmed" || viewingSession.classAssignedTutor === "Teacher is not confirmed" || viewingSession.classAssignedTutor === "Teacher Not Confirmed"
                              ? <span className="text-sky-400 font-medium">Teacher is not confirmed</span>
                              : (teachers.find((t: any) => t._id === viewingSession.classAssignedTutor)?.name || (viewingSession.classAssignedTutor as any)?.name || viewingSession.classAssignedTutor || "-")}
                          </p>
                        </div>
                      )}

                     {/* Display cancellation reason if it exists */}
                     {viewingSession.cancellationReason && (
                       <div className="col-span-1 md:col-span-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mt-2">
                         <span className="text-[10px] uppercase font-semibold text-red-400 block">
                           {viewingSession.status === "Cancelled" ? "Reason for Cancellation" : "Reason for Rejection"}
                         </span>
                         <p className="text-sm text-white font-medium mt-1 whitespace-pre-wrap">{viewingSession.cancellationReason}</p>
                       </div>
                     )}
                   </div>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {reportSession && (
        <DemoReportModal
          session={reportSession as any}
          onClose={() => setReportSession(null)}
          readOnly={isSalesPerson}
        />
      )}

      {admissionPaymentSession && (
        <AdmissionPaymentModal
          isOpen={true}
          onClose={() => setAdmissionPaymentSession(null)}
          demoSessionId={admissionPaymentSession._id}
          studentName={admissionPaymentSession.studentName}
          courseName={admissionPaymentSession.subject}
          initialFee={15000}
          initialSessions={15}
        />
      )}
    </div>
  );
}
