"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Edit2, Trash2, BookOpen, Users, Link as LinkIcon, AlertTriangle, Check, Calendar, Clock3 } from "lucide-react";
import { format, addWeeks, addMonths, addYears, differenceInDays, parseISO } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { BatchAnalyticsModal } from "@/components/batches/BatchAnalyticsModal";
import { useSearchStore } from "@/store/searchStore";

const DURATION_PRESETS = [
  { label: "1 Week", value: "1 Week" },
  { label: "2 Weeks", value: "2 Weeks" },
  { label: "1 Month", value: "1 Month" },
  { label: "3 Months", value: "3 Months" },
  { label: "6 Months", value: "6 Months" },
  { label: "1 Year", value: "1 Year" },
  { label: "Custom", value: "Custom" },
];

const STATUS_COLORS: Record<string, string> = {
  Upcoming: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Completed: "bg-neutral-700/50 text-neutral-400 border-neutral-600/30",
  Cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

function computeEndDate(startDate: string, durationType: string): string {
  if (!startDate || durationType === "Custom") return "";
  const d = parseISO(startDate);
  if (durationType === "1 Week") return format(addWeeks(d, 1), "yyyy-MM-dd");
  if (durationType === "2 Weeks") return format(addWeeks(d, 2), "yyyy-MM-dd");
  if (durationType === "1 Month") return format(addMonths(d, 1), "yyyy-MM-dd");
  if (durationType === "3 Months") return format(addMonths(d, 3), "yyyy-MM-dd");
  if (durationType === "6 Months") return format(addMonths(d, 6), "yyyy-MM-dd");
  if (durationType === "1 Year") return format(addYears(d, 1), "yyyy-MM-dd");
  return "";
}

function batchProgress(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type BatchForm = {
  name: string;
  subject: string;
  studentsCount: number;
  assignedTeacher: string;
  startTime: string;
  endTime: string;
  days: string[];
  meetingLink: string;
  durationType: string;
  startDate: string;
  endDate: string;
  status: string;
};

const emptyForm = (): BatchForm => ({
  name: "",
  subject: "",
  studentsCount: 0,
  assignedTeacher: "",
  startTime: "09:00",
  endTime: "10:00",
  days: [],
  meetingLink: "",
  durationType: "1 Month",
  startDate: "",
  endDate: "",
  status: "Upcoming",
});

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const router = useRouter();
  const { searchQuery } = useSearchStore();

  // Removed redirect so teachers can view batches

  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BatchForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  const [analyticsBatchId, setAnalyticsBatchId] = useState<string | null>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
  });

  const createBatch = useMutation({
    mutationFn: (data: BatchForm) => api.post("/batches", {
      ...data,
      timing: { startTime: data.startTime, endTime: data.endTime },
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); closeModal(); },
  });

  const updateBatch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: BatchForm }) => api.put(`/batches/${id}`, {
      ...data,
      timing: { startTime: data.startTime, endTime: data.endTime },
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); closeModal(); },
  });

  const deleteBatch = useMutation({
    mutationFn: (id: string) => api.delete(`/batches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["batches"] }); setDeleteConfirm(null); },
  });

  const openCreate = () => { setForm(emptyForm()); setEditingId(null); setModal(true); };

  const openEdit = (b: any) => {
    setForm({
      name: b.name,
      subject: b.subject,
      studentsCount: b.studentsCount || 0,
      assignedTeacher: b.assignedTeacher?._id || b.assignedTeacher || "",
      startTime: b.timing?.startTime || "09:00",
      endTime: b.timing?.endTime || "10:00",
      days: b.days || [],
      meetingLink: b.meetingLink || "",
      durationType: b.durationType || "1 Month",
      startDate: b.startDate ? format(new Date(b.startDate), "yyyy-MM-dd") : "",
      endDate: b.endDate ? format(new Date(b.endDate), "yyyy-MM-dd") : "",
      status: b.status || "Upcoming",
    });
    setEditingId(b._id);
    setModal(true);
  };

  const closeModal = () => { setModal(false); setForm(emptyForm()); setEditingId(null); };

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(day) ? f.days.filter((d) => d !== day) : [...f.days, day],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) updateBatch.mutate({ id: editingId, data: form });
    else createBatch.mutate(form);
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link);
    setLinkCopied(id);
    setTimeout(() => setLinkCopied(null), 2000);
  };

  const isPending = createBatch.isPending || updateBatch.isPending;
  const apiError = (createBatch.error || updateBatch.error) as any;

  // No early return for teacher, let them see their batches

  const filteredBatches = batches.filter((b: any) => {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Batches</h1>
          <p className="text-neutral-400 text-sm mt-0.5">Create and manage class batches with schedules and meeting links</p>
        </div>
        {user?.role !== "Teacher" && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" /> New Batch
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
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBatches.map((batch: any, i: number) => (
            <motion.div
              key={batch._id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => setAnalyticsBatchId(batch._id)}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-amber-500/50 cursor-pointer transition-colors"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 brand-gradient rounded-xl flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-black" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white leading-tight">{batch.name}</h3>
                    <p className="text-sm text-amber-400">{batch.subject}</p>
                  </div>
                </div>
                {user?.role !== "Teacher" && (
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
                {batch.status && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[batch.status] || STATUS_COLORS.Upcoming}`}>
                    {batch.status}
                  </span>
                )}
                {batch.durationType && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                    <Clock3 className="w-2.5 h-2.5" /> {batch.durationType}
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
                  <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-0.5">Timing</p>
                  <p className="text-sm font-semibold text-white">
                    {batch.timing?.startTime || "—"} – {batch.timing?.endTime || "—"}
                  </p>
                </div>
              </div>

              {/* Date Range + Progress */}
              {batch.startDate && batch.endDate && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(batch.startDate), "MMM d, yyyy")}
                    </span>
                    <span>{format(new Date(batch.endDate), "MMM d, yyyy")}</span>
                  </div>
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full brand-gradient rounded-full transition-all"
                      style={{ width: `${batchProgress(batch.startDate, batch.endDate)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-neutral-600 mt-1 text-right">
                    {batchProgress(batch.startDate, batch.endDate)}% complete
                  </p>
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
          ))}
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
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
                <h2 className="text-lg font-bold text-white">
                  {editingId ? "Edit Batch" : "Create New Batch"}
                </h2>
                <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Batch Name + Subject */}
                <div className="grid grid-cols-2 gap-3">
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
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Subject</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Physics"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                    />
                  </div>
                </div>

                {/* Students + Teacher */}
                <div className="grid grid-cols-2 gap-3">
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

                {/* Duration */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Batch Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => {
                          const end = computeEndDate(form.startDate, p.value);
                          setForm({ ...form, durationType: p.value, endDate: end });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          form.durationType === p.value
                            ? "brand-gradient text-black border-transparent"
                            : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start + End Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => {
                        const end = computeEndDate(e.target.value, form.durationType);
                        setForm({ ...form, startDate: e.target.value, endDate: end });
                      }}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value, durationType: "Custom" })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">Status</label>
                  <div className="flex gap-2">
                    {["Upcoming", "Active", "Completed", "Cancelled"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm({ ...form, status: s })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          form.status === s
                            ? STATUS_COLORS[s]
                            : "bg-neutral-800 text-neutral-600 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timing */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Class Start Time</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">Class End Time</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all"
                    />
                  </div>
                </div>

                {/* Days */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">Class Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          form.days.includes(day)
                            ? "brand-gradient text-black border-transparent"
                            : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500"
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

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

      {/* Analytics Modal */}
      {analyticsBatchId && (
        <BatchAnalyticsModal batchId={analyticsBatchId} onClose={() => setAnalyticsBatchId(null)} />
      )}
    </div>
  );
}
