"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, FileText, Star, MessageSquare } from "lucide-react";
import DemoReportPDF from "./DemoReportPDF";

interface DemoSession {
  _id: string;
  studentName: string;
  age?: number;
  subject: string;
  teacher?: { _id: string; name: string };
  salesExecutive?: string;
  date: string;
}

interface Scores {
  introductionToInterface: number;
  blocksAndCommands: number;
  logicAndProblemSolving: number;
  creativityAndProjectBuilding: number;
  communicationAndParticipation: number;
  timeManagement: number;
}

interface TaskRemarks {
  introductionToInterface: string;
  blocksAndCommands: string;
  logicAndProblemSolving: string;
  creativityAndProjectBuilding: string;
  communicationAndParticipation: string;
  timeManagement: string;
}

interface ReportForm {
  studentName: string;
  age: number | "";
  className: string;
  tutor: string;
  courseSelected: string;
  scores: Scores;
  taskRemarks: TaskRemarks;
  overallRemarks: string;
  date: string;
}

const TASK_LABELS: { key: keyof Scores; label: string; icon: string }[] = [
  { key: "introductionToInterface", label: "Introduction to Interface", icon: "🧩" },
  { key: "blocksAndCommands", label: "Blocks & Commands", icon: "🧱" },
  { key: "logicAndProblemSolving", label: "Logic & Problem Solving", icon: "</>" },
  { key: "creativityAndProjectBuilding", label: "Creativity & Project Building", icon: "💡" },
  { key: "communicationAndParticipation", label: "Communication & Participation", icon: "💬" },
  { key: "timeManagement", label: "Time Management", icon: "⏱️" },
];

const emptyScores = (): Scores => ({
  introductionToInterface: 0,
  blocksAndCommands: 0,
  logicAndProblemSolving: 0,
  creativityAndProjectBuilding: 0,
  communicationAndParticipation: 0,
  timeManagement: 0,
});

const emptyRemarks = (): TaskRemarks => ({
  introductionToInterface: "",
  blocksAndCommands: "",
  logicAndProblemSolving: "",
  creativityAndProjectBuilding: "",
  communicationAndParticipation: "",
  timeManagement: "",
});

interface Props {
  session: DemoSession;
  onClose: () => void;
  readOnly?: boolean;
}

export default function DemoReportModal({ session, onClose, readOnly = false }: Props) {
  const queryClient = useQueryClient();

  const { data: existingReport, isLoading } = useQuery({
    queryKey: ["demo-report", session._id],
    queryFn: async () => {
      try {
        const res = await api.get(`/demo-reports/by-session/${session._id}`);
        return res.data;
      } catch {
        return null;
      }
    },
  });

  const isEditing = !!existingReport;

  const [form, setForm] = useState<ReportForm>({
    studentName: session.studentName || "",
    age: session.age || "",
    className: "",
    tutor: session.teacher?.name || "",
    courseSelected: session.subject || "",
    scores: emptyScores(),
    taskRemarks: emptyRemarks(),
    overallRemarks: "",
    date: session.date ? new Date(session.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    if (existingReport) {
      setForm({
        studentName: existingReport.studentName || session.studentName || "",
        age: existingReport.age || session.age || "",
        className: existingReport.className || "",
        tutor: existingReport.tutor || session.teacher?.name || "",
        courseSelected: existingReport.courseSelected || session.subject || "",
        scores: existingReport.scores || emptyScores(),
        taskRemarks: existingReport.taskRemarks || emptyRemarks(),
        overallRemarks: existingReport.overallRemarks || "",
        date: existingReport.date ? new Date(existingReport.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      });
    }
  }, [existingReport, session]);

  const totalScore = Object.values(form.scores).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/demo-reports", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-report", session._id] });
      queryClient.invalidateQueries({ queryKey: ["demo-reports"] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/demo-reports/${existingReport._id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["demo-report", session._id] });
      queryClient.invalidateQueries({ queryKey: ["demo-reports"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      demoSession: session._id,
      ...form,
      age: form.age || null,
    };

    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const setScore = (key: keyof Scores, value: string) => {
    const num = Math.min(10, Math.max(0, parseInt(value) || 0));
    setForm((prev) => ({
      ...prev,
      scores: { ...prev.scores, [key]: num },
    }));
  };

  const setTaskRemark = (key: keyof TaskRemarks, value: string) => {
    setForm((prev) => ({
      ...prev,
      taskRemarks: { ...prev.taskRemarks, [key]: value },
    }));
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-3xl max-h-[90vh] bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {readOnly ? "View" : isEditing ? "Edit" : "Create"} Performance Report
                </h2>
                <p className="text-white/70 text-xs">Student 1:1 Demo Assessment</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Student Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Student Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Student Name *</label>
                    <input
                      required
                      value={form.studentName}
                      onChange={(e) => setForm({ ...form, studentName: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Age</label>
                    <input
                      type="number"
                      value={form.age}
                      onChange={(e) => setForm({ ...form, age: e.target.value ? parseInt(e.target.value) : "" })}
                      disabled={readOnly}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Class</label>
                    <input
                      value={form.className}
                      onChange={(e) => setForm({ ...form, className: e.target.value })}
                      disabled={readOnly}
                      placeholder="e.g. Scratch Level 1"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50 placeholder-neutral-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Tutor</label>
                    <input
                      value={form.tutor}
                      onChange={(e) => setForm({ ...form, tutor: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold text-neutral-400">Course Selected</label>
                    <input
                      value={form.courseSelected}
                      onChange={(e) => setForm({ ...form, courseSelected: e.target.value })}
                      disabled={readOnly}
                      placeholder="e.g. Scratch Level 1 Program"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50 placeholder-neutral-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-400">Report Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* Scoring Table */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Task Scores
                </h3>
                <div className="bg-neutral-800/50 rounded-2xl border border-neutral-700 overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[1fr_100px_1fr] gap-0 bg-gradient-to-r from-amber-600 to-orange-500 text-white text-xs font-bold uppercase">
                    <div className="px-4 py-3">Task</div>
                    <div className="px-4 py-3 text-center">Score (/10)</div>
                    <div className="px-4 py-3">Remarks</div>
                  </div>

                  {/* Task Rows */}
                  {TASK_LABELS.map(({ key, label, icon }, i) => (
                    <div
                      key={key}
                      className={`grid grid-cols-[1fr_100px_1fr] gap-0 items-center ${i % 2 === 0 ? "bg-neutral-800/30" : "bg-neutral-800/10"} border-b border-neutral-800 last:border-b-0`}
                    >
                      <div className="px-4 py-3 flex items-center gap-2 text-sm text-neutral-200">
                        <span className="text-base">{icon}</span>
                        {label}
                      </div>
                      <div className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={form.scores[key]}
                          onChange={(e) => setScore(key, e.target.value)}
                          disabled={readOnly}
                          className="w-16 mx-auto bg-neutral-900 border border-neutral-600 rounded-lg px-2 py-1.5 text-sm text-white text-center outline-none focus:border-amber-500 transition-all disabled:opacity-50"
                        />
                      </div>
                      <div className="px-4 py-3">
                        <input
                          type="text"
                          value={form.taskRemarks[key]}
                          onChange={(e) => setTaskRemark(key, e.target.value)}
                          disabled={readOnly}
                          placeholder="Add remarks..."
                          className="w-full bg-neutral-900 border border-neutral-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50 placeholder-neutral-600"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Total Row */}
                  <div className="grid grid-cols-[1fr_100px_1fr] gap-0 items-center bg-amber-500/10 border-t-2 border-amber-500/30">
                    <div className="px-4 py-3 text-sm font-bold text-amber-400">TOTAL SCORE</div>
                    <div className="px-4 py-3 text-center">
                      <span className="text-lg font-bold text-amber-400">{totalScore}</span>
                      <span className="text-neutral-500 text-sm">/60</span>
                    </div>
                    <div className="px-4 py-3 text-xs text-neutral-500">
                      {totalScore >= 50 ? "🌟 Excellent!" : totalScore >= 40 ? "👍 Good" : totalScore >= 30 ? "📈 Average" : "📝 Needs Improvement"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Overall Remarks */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-400" />
                  Overall Remarks
                </h3>
                <textarea
                  value={form.overallRemarks}
                  onChange={(e) => setForm({ ...form, overallRemarks: e.target.value })}
                  disabled={readOnly}
                  rows={4}
                  placeholder="Provide overall assessment and recommendations for the student..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500 transition-all resize-none disabled:opacity-50 placeholder-neutral-600"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-2">
                <div>
                  {existingReport && (
                    <DemoReportPDF report={existingReport} />
                  )}
                </div>
                {!readOnly && (
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-xl transition-all text-sm border border-neutral-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-xl transition-all text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Saving..." : isEditing ? "Update Report" : "Create Report"}
                    </button>
                  </div>
                )}
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
