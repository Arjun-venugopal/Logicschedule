"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  Users,
  Phone,
  Mail,
  BookOpen,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  GraduationCap,
  Check,
  Loader2,
  Video,
  ChevronRight,
  Filter,
} from "lucide-react";
import { format } from "date-fns";

const POPULAR_SUBJECTS = [
  "Scratch",
  "Python",
  "Web Development",
  "Robotics",
  "AI & ML",
  "App Development",
  "Maths",
  "General",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface EditStudentModalProps {
  student: any | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EditStudentModal({ student, onClose, onSuccess }: EditStudentModalProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(student?._id);

  // Core Student Form State
  const [formData, setFormData] = useState({
    name: student?.name || "",
    batch: student?.batch?._id || (typeof student?.batch === "string" ? student?.batch : "") || "",
    parentName: student?.parentName || "",
    mobileNumber: student?.mobileNumber || "",
    whatsappNumber: student?.whatsappNumber || "",
    email: student?.email || "",
  });

  // Batch Assignment Mode: "select" (filter/choose existing) vs "create" (create batch in form)
  const [batchMode, setBatchMode] = useState<"select" | "create">("select");
  const [batchSearchQuery, setBatchSearchQuery] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState<string>("All");

  // Inline New Batch Form State
  const [newBatchForm, setNewBatchForm] = useState({
    name: "",
    subject: "",
    assignedTeacher: "",
    numberOfSessions: 15 as number | "",
    days: ["Monday", "Wednesday", "Friday"] as string[],
    startTime: "09:00",
    endTime: "10:00",
    startDate: format(new Date(), "yyyy-MM-dd"),
    meetingLink: "",
    status: "Upcoming",
  });
  const [isBatchNameCustomized, setIsBatchNameCustomized] = useState(false);
  const [inlineCreatingBatch, setInlineCreatingBatch] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Queries
  const { data: batches = [] } = useQuery({
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

  const { data: demoSessions = [] } = useQuery({
    queryKey: ["demo-sessions"],
    queryFn: async () => (await api.get("/demo-sessions")).data,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["students-all"],
    queryFn: async () => (await api.get("/students")).data,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Keep new batch name in sync with student name unless manually altered
  useEffect(() => {
    if (!isBatchNameCustomized) {
      const cleanName = formData.name.trim();
      setNewBatchForm((prev) => ({
        ...prev,
        name: cleanName ? `${cleanName} 1:1` : "",
      }));
    }
  }, [formData.name, isBatchNameCustomized]);

  // Existing student check (to avoid accidental duplicates & offer advance level)
  const matchingExistingStudent = useMemo(() => {
    if (!formData.name || isEditing) return null;
    const cleanName = formData.name.trim().toLowerCase();
    if (cleanName.length < 2) return null;
    return (
      allStudents.find((s: any) => (s.name || "").trim().toLowerCase() === cleanName) || null
    );
  }, [formData.name, isEditing, allStudents]);

  // Demo Session Matcher based on student name (or phone / email)
  const matchingDemoSession = useMemo(() => {
    const cleanName = formData.name.trim().toLowerCase();
    const cleanPhone = formData.mobileNumber.replace(/\D/g, "");
    const cleanEmail = formData.email.trim().toLowerCase();

    if (!cleanName && !cleanPhone && !cleanEmail) return null;

    return (
      demoSessions.find((d: any) => {
        if (cleanName.length >= 2 && d.studentName?.trim().toLowerCase().includes(cleanName)) {
          return true;
        }
        if (cleanPhone.length >= 8 && d.phoneNumber) {
          const dPhone = String(d.phoneNumber).replace(/\D/g, "");
          if (dPhone.length >= 8 && dPhone.slice(-8) === cleanPhone.slice(-8)) return true;
        }
        if (cleanEmail && d.studentEmail && d.studentEmail.trim().toLowerCase() === cleanEmail) {
          return true;
        }
        return false;
      }) || null
    );
  }, [formData.name, formData.mobileNumber, formData.email, demoSessions]);

  // Auto-fill from demo session
  const handleAutoFillFromDemo = () => {
    if (!matchingDemoSession) return;
    setFormData((prev) => ({
      ...prev,
      name: matchingDemoSession.studentName || prev.name,
      parentName: matchingDemoSession.customerName || prev.parentName,
      mobileNumber: matchingDemoSession.phoneNumber || prev.mobileNumber,
      email: matchingDemoSession.studentEmail || prev.email,
      batch: matchingDemoSession.batchAssigned || prev.batch,
    }));

    if (matchingDemoSession.subject) {
      setNewBatchForm((prev) => ({
        ...prev,
        subject: matchingDemoSession.subject,
        assignedTeacher:
          matchingDemoSession.classAssignedTutor ||
          (matchingDemoSession.teacher?._id ? matchingDemoSession.teacher._id : matchingDemoSession.teacher) ||
          prev.assignedTeacher,
        numberOfSessions: matchingDemoSession.numberOfSessions || prev.numberOfSessions,
      }));
    }

    setSuccessMsg(`Imported details from Demo Session for ${matchingDemoSession.studentName}!`);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Filter batches based on student name and search query
  const { suggestedBatches, otherFilteredBatches, selectedBatchObj } = useMemo(() => {
    const cleanStudentName = formData.name.trim().toLowerCase();
    const searchLower = batchSearchQuery.trim().toLowerCase();

    const selected = batches.find((b: any) => b._id === formData.batch) || null;

    let list = [...batches];

    // Status filter
    if (batchStatusFilter !== "All") {
      list = list.filter((b: any) => (b.status || "Upcoming") === batchStatusFilter);
    }

    // Search query filter
    if (searchLower) {
      list = list.filter((b: any) => {
        const nameMatch = (b.name || "").toLowerCase().includes(searchLower);
        const subMatch = (b.subject || "").toLowerCase().includes(searchLower);
        const teacherMatch = (b.assignedTeacher?.name || "").toLowerCase().includes(searchLower);
        return nameMatch || subMatch || teacherMatch;
      });
    }

    // Identify suggested batches that match the student's name or demo session batch
    const suggested: any[] = [];
    const others: any[] = [];

    const demoBatchId = matchingDemoSession?.batchAssigned;

    list.forEach((b: any) => {
      const isDemoBatch = demoBatchId && (b._id === demoBatchId || b._id?.toString() === demoBatchId?.toString());
      const hasStudentName =
        cleanStudentName.length >= 2 && (b.name || "").toLowerCase().includes(cleanStudentName);

      if (isDemoBatch || hasStudentName) {
        suggested.push({
          ...b,
          _matchReason: isDemoBatch ? "Assigned in Demo Session" : "Matches Student Name",
        });
      } else {
        others.push(b);
      }
    });

    return {
      suggestedBatches: suggested,
      otherFilteredBatches: others,
      selectedBatchObj: selected,
    };
  }, [batches, formData.batch, formData.name, batchSearchQuery, batchStatusFilter, matchingDemoSession]);

  // Mutations
  const createStudentMutation = useMutation({
    mutationFn: (data: any) => api.post("/students", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to create student");
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/students/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to update student");
    },
  });

  // Toggle Day helper for new batch
  const toggleDay = (day: string) => {
    setNewBatchForm((prev) => {
      const exists = prev.days.includes(day);
      return {
        ...prev,
        days: exists ? prev.days.filter((d) => d !== day) : [...prev.days, day],
      };
    });
  };

  // Helper to create a batch via API
  const handleCreateBatchApi = async (): Promise<string | null> => {
    if (!newBatchForm.name.trim()) {
      setErrorMsg("Please provide a batch name");
      return null;
    }
    if (!newBatchForm.subject.trim()) {
      setErrorMsg("Please enter or select a course / subject for the batch");
      return null;
    }

    try {
      const payload: any = {
        name: newBatchForm.name.trim(),
        subject: newBatchForm.subject.trim(),
        assignedTeacher: newBatchForm.assignedTeacher || undefined,
        studentsCount: 0,
        days: newBatchForm.days,
        timing: { startTime: newBatchForm.startTime, endTime: newBatchForm.endTime },
        startDate: newBatchForm.startDate,
        numberOfSessions: newBatchForm.numberOfSessions ? Number(newBatchForm.numberOfSessions) : null,
        status: newBatchForm.status || "Upcoming",
        meetingLink: newBatchForm.meetingLink || "",
        durationType: "Custom",
      };

      const res = await api.post("/batches", payload);
      const createdBatch = res.data;
      queryClient.invalidateQueries({ queryKey: ["batches"] });

      return createdBatch._id;
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || "Failed to create batch");
      return null;
    }
  };

  // Inline "Create & Select Batch Now" button handler
  const handleInlineCreateBatch = async () => {
    setErrorMsg(null);
    setInlineCreatingBatch(true);
    const newBatchId = await handleCreateBatchApi();
    setInlineCreatingBatch(false);

    if (newBatchId) {
      setFormData((prev) => ({ ...prev, batch: newBatchId }));
      setBatchMode("select");
      setSuccessMsg(`Batch "${newBatchForm.name}" created and assigned!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  // Main Submit handler (Save Student)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!formData.name.trim()) {
      setErrorMsg("Student name is required");
      return;
    }

    let finalBatchId = formData.batch;

    // If user is in "create" mode and hasn't selected a batch yet, create the batch first
    if (batchMode === "create") {
      setInlineCreatingBatch(true);
      const createdId = await handleCreateBatchApi();
      setInlineCreatingBatch(false);

      if (!createdId) return; // Error handled inside handleCreateBatchApi
      finalBatchId = createdId;
    }

    if (!finalBatchId) {
      setErrorMsg("Please select or create a batch for this student");
      return;
    }

    const payload = {
      ...formData,
      name: formData.name.trim(),
      batch: finalBatchId,
    };

    if (isEditing) {
      updateStudentMutation.mutate({ id: student._id, data: payload });
    } else {
      createStudentMutation.mutate(payload);
    }
  };

  const isSaving =
    createStudentMutation.isPending ||
    updateStudentMutation.isPending ||
    inlineCreatingBatch;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-900 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center text-black font-bold shadow-md shadow-amber-500/10">
              {isEditing ? <BookOpen className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base sm:text-lg">
                  {isEditing ? "Edit Student Profile" : "Add New Student"}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {isEditing ? "Update" : "Registration"}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Assign an existing batch or create a new batch in form based on student details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-6 space-y-5 flex-1">
          {/* Status Banners */}
          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{errorMsg}</span>
                <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Demo Session Match Banner */}
          {matchingDemoSession && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-400 flex items-center gap-1.5">
                    Demo Session Found for {matchingDemoSession.studentName}
                    {matchingDemoSession.status && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 font-normal">
                        {matchingDemoSession.status}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-neutral-300 mt-0.5">
                    Course: <strong className="text-white">{matchingDemoSession.subject || "General"}</strong>
                    {matchingDemoSession.classAssignedTutor && ` • Tutor: ${matchingDemoSession.classAssignedTutor}`}
                    {matchingDemoSession.date && ` • ${format(new Date(matchingDemoSession.date), "MMM d, yyyy")}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAutoFillFromDemo}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs transition-colors shrink-0 flex items-center justify-center gap-1.5 border border-amber-500/30"
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto-fill from Demo
              </button>
            </div>
          )}

          {/* Existing Student Warning / Level Advance Notice */}
          {matchingExistingStudent && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5 animate-in fade-in">
              <GraduationCap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-amber-400">
                  Existing Child Found: {matchingExistingStudent.name}
                </p>
                <p className="text-[11px] text-neutral-300 mt-1 leading-relaxed">
                  Currently in <strong>{matchingExistingStudent.batch?.name || "Unassigned Batch"}</strong>.
                  Assigning a new batch will advance them to the next level/batch and retain all academic history
                  without creating duplicate records.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      name: matchingExistingStudent.name,
                      parentName: matchingExistingStudent.parentName || prev.parentName,
                      mobileNumber: matchingExistingStudent.mobileNumber || prev.mobileNumber,
                      whatsappNumber: matchingExistingStudent.whatsappNumber || prev.whatsappNumber,
                      email: matchingExistingStudent.email || prev.email,
                    }));
                  }}
                  className="mt-2 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] transition-colors inline-flex items-center gap-1"
                >
                  Use Existing Student Profile Details
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Student Information */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-500" /> Student Information
            </h4>

            {/* Student Name */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 mb-1.5 block">
                Student Full Name <span className="text-amber-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm transition-all pl-9"
                  placeholder="e.g. Rahul Sharma"
                />
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Parent Name */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 mb-1.5 block">
                Parent / Guardian Name <span className="text-neutral-500 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.parentName}
                  onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm transition-all pl-9"
                  placeholder="e.g. Suresh Sharma"
                />
                <Users className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Contact Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-neutral-300 mb-1.5 block">
                  Mobile Number <span className="text-neutral-500 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={formData.mobileNumber}
                    onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm transition-all pl-9"
                    placeholder="+91 98765 43210"
                  />
                  <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 mb-1.5 flex items-center justify-between">
                  <span>WhatsApp Number</span>
                  <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    WA
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 text-sm transition-all pl-9"
                    placeholder="Same as mobile or alt"
                  />
                  <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="text-xs font-semibold text-neutral-300 mb-1.5 block">
                Email Address <span className="text-neutral-500 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 text-sm transition-all pl-9"
                  placeholder="student@example.com"
                />
                <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-800/80 my-4" />

          {/* Section 2: Batch / Course Assignment (Core Feature) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-amber-500" /> Batch / Course Assignment{" "}
                  <span className="text-amber-500">*</span>
                </h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Filter by student name or create a new batch right in this form.
                </p>
              </div>

              {/* Mode Switcher: Select Batch vs Create Batch in Form */}
              <div className="inline-flex p-1 bg-neutral-950/80 border border-neutral-800 rounded-xl shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBatchMode("select")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    batchMode === "select"
                      ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-amber-400" /> Select Batch
                </button>
                <button
                  type="button"
                  onClick={() => setBatchMode("create")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    batchMode === "create"
                      ? "brand-gradient text-black font-bold shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> + Create Batch in Form
                </button>
              </div>
            </div>

            {/* MODE A: Select Existing Batch (with smart filtering & suggestions based on student name) */}
            {batchMode === "select" && (
              <div className="space-y-3">
                {/* Suggested Batches for Student Name */}
                {suggestedBatches.length > 0 && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                    <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Suggested for {formData.name || "Student"}:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {suggestedBatches.map((b: any) => {
                        const isSelected = formData.batch === b._id;
                        return (
                          <div
                            key={b._id}
                            onClick={() => setFormData({ ...formData, batch: b._id })}
                            className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between gap-2 ${
                              isSelected
                                ? "bg-amber-500/20 border-amber-500 text-white shadow-md shadow-amber-500/10"
                                : "bg-neutral-800/80 border-neutral-700 hover:border-amber-500/50 text-neutral-200"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{b.name}</p>
                              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">
                                {b.subject} • {b.assignedTeacher?.name || "No Tutor"}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md font-bold shrink-0 ${
                                isSelected
                                  ? "bg-amber-500 text-black"
                                  : "bg-neutral-700/80 text-neutral-300"
                              }`}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected Batch Preview (if chosen) */}
                {selectedBatchObj && (
                  <div className="p-3 bg-neutral-800/60 border border-neutral-700 rounded-xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Check className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">
                            {selectedBatchObj.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                            {selectedBatchObj.subject}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-700 text-neutral-300">
                            {selectedBatchObj.status || "Active"}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                          Tutor: {selectedBatchObj.assignedTeacher?.name || "Unassigned"}
                          {selectedBatchObj.timing?.startTime &&
                            ` • ${selectedBatchObj.timing.startTime} - ${selectedBatchObj.timing.endTime}`}
                          {selectedBatchObj.days?.length > 0 && ` • ${selectedBatchObj.days.join(", ")}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, batch: "" })}
                      className="text-xs text-neutral-400 hover:text-red-400 p-1.5 hover:bg-neutral-800 rounded-lg transition-colors shrink-0"
                      title="Clear selection"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Filter and Search Section */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={batchSearchQuery}
                        onChange={(e) => setBatchSearchQuery(e.target.value)}
                        placeholder="Search batches by name, course, tutor..."
                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-500 pl-8 transition-all"
                      />
                      <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      {batchSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setBatchSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Quick Status Filter Pills */}
                    <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                      {["All", "Active", "Upcoming"].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setBatchStatusFilter(st)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            batchStatusFilter === st
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Batches Select Dropdown */}
                  <select
                    value={formData.batch}
                    onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:outline-none focus:border-amber-500 text-xs transition-all"
                  >
                    <option value="">— Select from all batches ({batches.length} total) —</option>
                    {suggestedBatches.length > 0 && (
                      <optgroup label="🌟 Suggested for this Student">
                        {suggestedBatches.map((b: any) => (
                          <option key={`sug-${b._id}`} value={b._id}>
                            ★ {b.name} ({b.subject}) — {b.assignedTeacher?.name || "No Tutor"}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All Filtered Batches">
                      {otherFilteredBatches.map((b: any) => (
                        <option key={b._id} value={b._id}>
                          {b.name} ({b.subject}) {b.status === "Completed" ? "— [Completed]" : ""}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
            )}

            {/* MODE B: Create Batch in Form ("or create a batch in the form") */}
            {batchMode === "create" && (
              <div className="p-4 bg-neutral-950/60 border border-amber-500/30 rounded-xl space-y-3.5 animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Create New Batch in Form</span>
                  </div>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold">
                    1:1 or Group Batch
                  </span>
                </div>

                {/* Batch Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-neutral-300">
                      Batch Name <span className="text-amber-500">*</span>
                    </label>
                    {!isBatchNameCustomized && formData.name && (
                      <span className="text-[10px] text-neutral-500">Auto-filled from student name</span>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    value={newBatchForm.name}
                    onChange={(e) => {
                      setIsBatchNameCustomized(true);
                      setNewBatchForm({ ...newBatchForm, name: e.target.value });
                    }}
                    placeholder="e.g. Rahul 1:1"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Course / Subject with Quick Chips */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                    Course / Subject <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newBatchForm.subject}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, subject: e.target.value })}
                    placeholder="e.g. Python, Scratch, Robotics"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500 mb-2"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_SUBJECTS.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setNewBatchForm({ ...newBatchForm, subject: sub })}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-medium transition-all ${
                          newBatchForm.subject === sub
                            ? "bg-amber-500 text-black border-amber-500 font-bold"
                            : "bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white"
                        }`}
                      >
                        + {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Assigned Teacher */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                    Assigned Teacher / Tutor <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={newBatchForm.assignedTeacher}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, assignedTeacher: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="">None / Assign Later</option>
                    {teachers.map((t: any) => (
                      <option key={t._id} value={t._id}>
                        {t.name} {t.subjects?.length > 0 ? `(${t.subjects.join(", ")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Days of Week */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 mb-1.5 block">
                    Class Days
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => {
                      const isSelected = newBatchForm.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                            isSelected
                              ? "brand-gradient text-black border-amber-500 font-bold"
                              : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200"
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timing (Start & End Time) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={newBatchForm.startTime}
                      onChange={(e) => setNewBatchForm({ ...newBatchForm, startTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={newBatchForm.endTime}
                      onChange={(e) => setNewBatchForm({ ...newBatchForm, endTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Sessions Count & Start Date */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                      Total Classes (Sessions)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newBatchForm.numberOfSessions}
                      onChange={(e) =>
                        setNewBatchForm({
                          ...newBatchForm,
                          numberOfSessions: e.target.value ? Number(e.target.value) : "",
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                      placeholder="15"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={newBatchForm.startDate}
                      onChange={(e) => setNewBatchForm({ ...newBatchForm, startDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Meeting Link (Optional) */}
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 mb-1 block">
                    Meeting Link <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    value={newBatchForm.meetingLink}
                    onChange={(e) => setNewBatchForm({ ...newBatchForm, meetingLink: e.target.value })}
                    placeholder="https://meet.google.com/..."
                    className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Action button inside batch card */}
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500">
                    Will auto-create when saving or click to create now:
                  </span>
                  <button
                    type="button"
                    onClick={handleInlineCreateBatch}
                    disabled={inlineCreatingBatch || !newBatchForm.name.trim() || !newBatchForm.subject.trim()}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {inlineCreatingBatch ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Create & Select Batch Now
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3 sticky bottom-0 bg-neutral-900 pb-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs font-semibold text-neutral-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                isSaving ||
                !formData.name.trim() ||
                (batchMode === "select" && !formData.batch) ||
                (batchMode === "create" && (!newBatchForm.name.trim() || !newBatchForm.subject.trim()))
              }
              className="px-5 py-2.5 brand-gradient text-black text-xs font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSaving
                ? batchMode === "create" && !formData.batch
                  ? "Creating Batch & Saving..."
                  : "Saving Student..."
                : isEditing
                ? "Update Student"
                : "Save Student"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
