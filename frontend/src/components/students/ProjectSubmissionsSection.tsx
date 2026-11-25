"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FolderGit2, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Edit2, 
  Check, 
  Copy, 
  Calendar, 
  User, 
  MessageSquare, 
  X, 
  Award,
  Sparkles,
  Link as LinkIcon
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useTheme } from "@/context/ThemeContext";
import { ProjectSubmission } from "@/types";

interface ProjectSubmissionsSectionProps {
  student: {
    _id: string;
    name: string;
    projectSubmissions?: ProjectSubmission[];
    batch?: any;
  };
  batchId?: string;
  batchName?: string;
  courseName?: string;
  completedClassesCount: number;
  schedules?: any[];
  readOnly?: boolean;
  onSubmissionSuccess?: () => void;
}

export function ProjectSubmissionsSection({
  student,
  batchId,
  batchName,
  courseName,
  completedClassesCount,
  schedules,
  readOnly = false,
  onSubmissionSuccess,
}: ProjectSubmissionsSectionProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { isDark } = useTheme();

  // Active submission form state
  const [editingMilestone, setEditingMilestone] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formLink, setFormLink] = useState("");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formRemarks, setFormRemarks] = useState("");
  const [formStatus, setFormStatus] = useState<"Pending" | "Link Submitted" | "Reviewed">("Link Submitted");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Calculate actual completed classes for this student from schedules (if provided)
  const actualCompleted = (() => {
    if (schedules && schedules.length > 0) {
      let count = 0;
      schedules.forEach((s: any) => {
        if (s.status === "Completed") {
          if (s.attendance && Array.isArray(s.attendance) && s.attendance.length > 0) {
            const record = s.attendance.find((a: any) => {
              const sId = a.studentId?._id ? a.studentId._id.toString() : a.studentId?.toString();
              return sId === student._id.toString();
            });
            if (record ? record.isPresent !== false : true) {
              count++;
            }
          } else {
            count++;
          }
        }
      });
      return Math.max(count, completedClassesCount);
    }
    return completedClassesCount || 0;
  })();

  // 1. Automatic Milestones Calculation: every 5 completed classes (5, 10, 15, 20...)
  const unlockedMilestones = Math.floor(actualCompleted / 5) * 5;
  const milestoneSet = new Set<number>();
  for (let m = 5; m <= unlockedMilestones; m += 5) {
    milestoneSet.add(m);
  }

  // Include any previously saved milestones in student history for this batch
  const targetBatchId = batchId ? batchId.toString() : "";
  const existingSubmissions = Array.isArray(student.projectSubmissions) ? student.projectSubmissions : [];
  existingSubmissions.forEach((ps) => {
    const psBId = ps.batchId ? ps.batchId.toString() : "";
    if (!targetBatchId || !psBId || psBId === targetBatchId) {
      if (ps.milestone && Number(ps.milestone) > 0) {
        milestoneSet.add(Number(ps.milestone));
      }
    }
  });

  const sortedMilestones = Array.from(milestoneSet).sort((a, b) => a - b);

  // Next milestone calculation
  const nextMilestoneNumber = (Math.floor(actualCompleted / 5) + 1) * 5;
  const classesUntilNext = nextMilestoneNumber - actualCompleted;

  // Mutation to submit / update project link
  const submitMutation = useMutation({
    mutationFn: async (payload: any) => {
      return (await api.put(`/students/${student._id}/project-submission`, payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", student._id] });
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      if (batchId) {
        queryClient.invalidateQueries({ queryKey: ["batch-analytics", batchId] });
        queryClient.invalidateQueries({ queryKey: ["batches"] });
      }
      setEditingMilestone(null);
      setErrorMsg(null);
      if (onSubmissionSuccess) onSubmissionSuccess();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || "Failed to save project submission");
    },
  });

  const handleOpenForm = (milestone: number) => {
    const existing = existingSubmissions.find((ps) => {
      const psBId = ps.batchId ? ps.batchId.toString() : "";
      return Number(ps.milestone) === milestone && (!targetBatchId || !psBId || psBId === targetBatchId);
    });

    setEditingMilestone(milestone);
    setFormTitle(existing?.projectTitle || "");
    setFormLink(existing?.projectLink || "");
    setFormDate(existing?.submissionDate || format(new Date(), "yyyy-MM-dd"));
    setFormRemarks(existing?.teacherRemarks || "");
    setFormStatus(existing?.status || (existing?.projectLink ? "Link Submitted" : "Link Submitted"));
    setErrorMsg(null);
  };

  const handleSaveSubmission = () => {
    if (formStatus !== "Pending" && !formTitle.trim()) {
      setErrorMsg("Please enter a project title");
      return;
    }

    let cleanLink = formLink.trim();
    if (formStatus !== "Pending" && cleanLink) {
      if (!cleanLink.startsWith("http://") && !cleanLink.startsWith("https://")) {
        cleanLink = `https://${cleanLink}`;
      }
    }

    submitMutation.mutate({
      milestone: editingMilestone,
      batchId: targetBatchId,
      batchName: batchName || (typeof student.batch === "object" ? student.batch?.name : undefined),
      courseName: courseName || (typeof student.batch === "object" ? student.batch?.subject : undefined),
      projectTitle: formTitle.trim(),
      projectLink: cleanLink,
      submissionDate: formDate,
      teacherRemarks: formRemarks.trim(),
      status: formStatus,
    });
  };

  const handleQuickReviewToggle = (milestone: number, currentStatus: string) => {
    const existing = existingSubmissions.find((ps) => {
      const psBId = ps.batchId ? ps.batchId.toString() : "";
      return Number(ps.milestone) === milestone && (!targetBatchId || !psBId || psBId === targetBatchId);
    });

    if (!existing || !existing.projectLink) return;

    const newStatus = currentStatus === "Reviewed" ? "Link Submitted" : "Reviewed";

    submitMutation.mutate({
      milestone,
      batchId: targetBatchId,
      batchName: batchName || existing.batchName,
      courseName: courseName || existing.courseName,
      projectTitle: existing.projectTitle,
      projectLink: existing.projectLink,
      submissionDate: existing.submissionDate,
      teacherRemarks: existing.teacherRemarks,
      status: newStatus,
    });
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Milestone Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl border flex items-center justify-center shrink-0"
            style={
              isDark
                ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)" }
                : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
            }
          >
            <FolderGit2 className="w-4 h-4" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base flex items-center gap-2" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
              Project Submissions
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full border"
                style={
                  isDark
                    ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FCD34D" }
                    : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                }
              >
                {sortedMilestones.length} {sortedMilestones.length === 1 ? "Milestone" : "Milestones"}
              </span>
            </h3>
            <p className="text-xs" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
              Automatic project milestones every 5 completed classes (5, 10, 15, 20...)
            </p>
          </div>
        </div>

        {/* Next Milestone Countdown Pill */}
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs shrink-0 ${
          isDark ? "bg-neutral-800/80 border-neutral-700/60 text-neutral-300" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
        }`}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
          <span>
            {actualCompleted} Classes Done ·{" "}
            <strong style={{ color: isDark ? "#FFFFFF" : "#171717" }}>Next at Class {nextMilestoneNumber}</strong>{" "}
            ({classesUntilNext} {classesUntilNext === 1 ? "class" : "classes"} left)
          </span>
        </div>
      </div>

      {/* Milestones List */}
      {sortedMilestones.length === 0 ? (
        <div className={`border rounded-2xl p-6 text-center space-y-2 ${
          isDark ? "bg-neutral-800/20 border-neutral-800" : "bg-[#F9FAFB] border-[#E5E7EB]"
        }`}>
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
            style={{ backgroundColor: isDark ? "rgba(245, 158, 11, 0.1)" : "#FFF7E6" }}
          >
            <Award className="w-6 h-6" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: isDark ? "#D4D4D4" : "#171717" }}>No project milestones unlocked yet</p>
          <p className="text-xs max-w-md mx-auto" style={{ color: "#6B7280" }}>
            {student.name} has completed <strong>{actualCompleted}</strong> of the 5 classes required for the first project milestone. Once class 5 is completed, Milestone 1 will unlock automatically here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedMilestones.map((milestoneNum, idx) => {
            const submission = existingSubmissions.find((ps) => {
              const psBId = ps.batchId ? ps.batchId.toString() : "";
              return Number(ps.milestone) === milestoneNum && (!targetBatchId || !psBId || psBId === targetBatchId);
            });

            const hasLink = Boolean(submission?.projectLink && submission.projectLink.trim());
            const currentStatus = submission?.status || (hasLink ? "Link Submitted" : "Pending");
            const isReviewed = currentStatus === "Reviewed";
            const isSubmitted = currentStatus === "Link Submitted" || isReviewed;

            return (
              <motion.div
                key={milestoneNum}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={`rounded-2xl border p-4 transition-all relative overflow-hidden ${
                  isDark
                    ? isReviewed
                      ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50"
                      : isSubmitted
                      ? "bg-blue-950/20 border-blue-500/30 hover:border-blue-500/50"
                      : "bg-neutral-800/30 border-amber-500/20 hover:border-amber-500/40"
                    : "bg-[#F9FAFB] border-[#E5E7EB]"
                }`}
              >
                {/* Accent vertical side line */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${
                    isReviewed
                      ? "bg-emerald-500"
                      : isSubmitted
                      ? "bg-blue-500"
                      : "bg-amber-500"
                  }`}
                />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pl-2">
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Milestone badge + Status */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold shadow-sm ${
                        isDark ? "bg-neutral-900 border-neutral-700/80 text-white" : "bg-[#FFFFFF] border-[#E5E7EB] text-[#171717]"
                      }`}>
                        <Award className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                        Milestone {idx + 1} ({milestoneNum} Classes Completed)
                      </span>

                      {/* Status Badges */}
                      {isReviewed ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                              : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} /> Reviewed
                        </span>
                      ) : isSubmitted ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(59, 130, 246, 0.15)", borderColor: "rgba(59, 130, 246, 0.3)", color: "#60A5FA" }
                              : { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE", color: "#1D4ED8" }
                          }
                        >
                          <LinkIcon className="w-3.5 h-3.5" style={{ color: isDark ? "#60A5FA" : "#1D4ED8" }} /> Link Submitted
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold"
                          style={
                            isDark
                              ? { backgroundColor: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)", color: "#FBBF24" }
                              : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A", color: "#B45309" }
                          }
                        >
                          <Clock className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} /> Pending Link Submission
                        </span>
                      )}

                      {submission?.submissionDate && (
                        <span className="text-[11px] flex items-center gap-1 ml-auto sm:ml-0" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                          <Calendar className="w-3 h-3" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                          {formatDateDisplay(submission.submissionDate)}
                        </span>
                      )}
                    </div>

                    {/* Project Title & Link */}
                    {isSubmitted ? (
                      <div className="space-y-1.5 pt-1">
                        <h4 className="font-bold text-sm sm:text-base leading-snug" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                          {submission?.projectTitle || "Student Project"}
                        </h4>

                        {submission?.projectLink && (
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <a
                              href={submission.projectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2 break-all group max-w-full"
                              style={{ color: isDark ? "#34D399" : "#047857" }}
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 group-hover:scale-110 transition-transform" style={{ color: isDark ? "#34D399" : "#047857" }} />
                              <span className="truncate">{submission.projectLink}</span>
                            </a>
                            <button
                              onClick={() => handleCopyLink(submission.projectLink!)}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isDark ? "text-neutral-400 hover:text-white hover:bg-neutral-800" : "text-[#4B5563] hover:text-[#171717] hover:bg-[#E5E7EB]"
                              }`}
                              title="Copy project link"
                            >
                              {copiedLink === submission.projectLink ? (
                                <Check className="w-3.5 h-3.5" style={{ color: isDark ? "#34D399" : "#047857" }} />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs italic pt-1" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                        Milestone reached. Waiting for assigned teacher to submit the project link.
                      </p>
                    )}

                    {/* Teacher Remarks & Teacher Name */}
                    {submission?.teacherRemarks && (
                      <div className={`border rounded-xl p-2.5 text-xs mt-2 flex items-start gap-2 ${
                        isDark ? "bg-neutral-900/80 border-neutral-800 text-neutral-300" : "bg-[#FFFFFF] border-[#E5E7EB] text-[#171717]"
                      }`}>
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                        <div>
                          <span className="font-semibold text-[11px] block" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>Teacher Remarks:</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{submission.teacherRemarks}</p>
                        </div>
                      </div>
                    )}

                    {submission?.teacherName && (
                      <div className="text-[11px] flex items-center gap-1.5 pt-1" style={{ color: "#6B7280" }}>
                        <User className="w-3 h-3" style={{ color: isDark ? "#737373" : "#6B7280" }} />
                        <span>Submitted by Teacher: <strong style={{ color: isDark ? "#D4D4D4" : "#171717" }}>{submission.teacherName}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons for Teachers / Admins */}
                  {!readOnly && (
                    <div className="flex items-center gap-2 sm:self-center shrink-0 pt-2 sm:pt-0">
                      {isSubmitted ? (
                        <>
                          <button
                            onClick={() => handleQuickReviewToggle(milestoneNum, currentStatus)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-opacity hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                            style={
                              isReviewed
                                ? isDark
                                  ? { backgroundColor: "#262626", borderColor: "#3F3F46", color: "#D4D4D4" }
                                  : { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB", color: "#171717" }
                                : isDark
                                ? { backgroundColor: "rgba(16, 185, 129, 0.15)", borderColor: "rgba(16, 185, 129, 0.3)", color: "#34D399" }
                                : { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0", color: "#047857" }
                            }
                            title={isReviewed ? "Revert to Link Submitted" : "Mark Project as Reviewed"}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: isReviewed ? (isDark ? "#D4D4D4" : "#1F2937") : (isDark ? "#34D399" : "#047857") }} />
                            <span>{isReviewed ? "Reviewed" : "Mark Reviewed"}</span>
                          </button>
                          <button
                            onClick={() => handleOpenForm(milestoneNum)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                              isDark
                                ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-neutral-700"
                                : "bg-[#FFFFFF] hover:bg-[#F3F4F6] text-[#171717] border-[#E5E7EB]"
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                            <span>Edit Link</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenForm(milestoneNum)}
                          className="px-3.5 py-2 rounded-xl brand-gradient text-xs font-bold transition-opacity hover:opacity-90 shadow-sm flex items-center gap-1.5 cursor-pointer"
                          style={{ color: "#171717" }}
                        >
                          <LinkIcon className="w-3.5 h-3.5" style={{ color: "#171717" }} />
                          <span style={{ color: "#171717" }}>Submit Project Link</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Teacher Submission / Edit Modal */}
      <AnimatePresence>
        {editingMilestone !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`border rounded-2xl w-full max-w-lg shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto ${
                isDark ? "bg-neutral-900 border-neutral-700" : "bg-[#FFFFFF] border-[#E5E7EB]"
              }`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between border-b pb-3 ${isDark ? "border-neutral-800" : "border-[#E5E7EB]"}`}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl border flex items-center justify-center"
                    style={
                      isDark
                        ? { backgroundColor: "rgba(245, 158, 11, 0.1)", borderColor: "rgba(245, 158, 11, 0.2)" }
                        : { backgroundColor: "#FFF7E6", borderColor: "#FDE68A" }
                    }
                  >
                    <FolderGit2 className="w-5 h-5" style={{ color: isDark ? "#FBBF24" : "#B45309" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base" style={{ color: isDark ? "#FFFFFF" : "#171717" }}>
                      {formLink ? "Update Project Submission" : "Submit Student Project Link"}
                    </h3>
                    <p className="text-xs" style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>
                      Milestone: {editingMilestone} Completed Classes · {student.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingMilestone(null)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isDark ? "text-neutral-400 hover:text-white hover:bg-neutral-800" : "text-[#4B5563] hover:text-[#171717] hover:bg-[#F3F4F6]"
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div
                  className="p-3 border rounded-xl text-xs font-medium"
                  style={
                    isDark
                      ? { backgroundColor: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#F87171" }
                      : { backgroundColor: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }
                  }
                >
                  {errorMsg}
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-4 text-xs">
                {/* Project Title */}
                <div>
                  <label className="block font-semibold mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                    Project Title <span style={{ color: "#F59E0B" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Space Shooter Game, Python Calculator, Portfolio Website"
                    className={`w-full border rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 text-sm ${
                      isDark
                        ? "bg-neutral-950 border-neutral-800 text-white placeholder-neutral-500"
                        : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717] placeholder-[#6B7280]"
                    }`}
                  />
                </div>

                {/* Project Link URL */}
                <div>
                  <label className="block font-semibold mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                    Project Link (URL) <span style={{ color: "#F59E0B" }}>*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "#6B7280" }}>
                      <LinkIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={formLink}
                      onChange={(e) => setFormLink(e.target.value)}
                      placeholder="https://scratch.mit.edu/projects/... or https://github.com/..."
                      className={`w-full border rounded-xl pl-9 pr-3.5 py-2.5 focus:outline-none focus:border-amber-500 text-sm ${
                        isDark
                          ? "bg-neutral-950 border-neutral-800 text-white placeholder-neutral-500"
                          : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717] placeholder-[#6B7280]"
                      }`}
                    />
                  </div>
                </div>

                {/* Submission Date & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>Submission Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className={`w-full border rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 text-sm ${
                        isDark ? "bg-neutral-950 border-neutral-800 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className={`w-full border rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 text-sm ${
                        isDark ? "bg-neutral-950 border-neutral-800 text-white" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717]"
                      }`}
                    >
                      <option value="Link Submitted">Link Submitted</option>
                      <option value="Reviewed">Reviewed</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>

                {/* Teacher Remarks */}
                <div>
                  <label className="block font-semibold mb-1" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
                    Teacher Remarks / Feedback <span className="font-normal" style={{ color: "#6B7280" }}>(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    placeholder="Add teacher remarks, feedback, or key concepts demonstrated in this project..."
                    className={`w-full border rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-amber-500 text-sm resize-none ${
                      isDark
                        ? "bg-neutral-950 border-neutral-800 text-white placeholder-neutral-500"
                        : "bg-[#F9FAFB] border-[#E5E7EB] text-[#171717] placeholder-[#6B7280]"
                    }`}
                  />
                </div>

                {/* Teacher Submitting Info */}
                <div className={`border rounded-xl p-3 flex items-center justify-between text-[11px] ${
                  isDark ? "bg-neutral-950/60 border-neutral-800/80 text-neutral-400" : "bg-[#F9FAFB] border-[#E5E7EB] text-[#4B5563]"
                }`}>
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" style={{ color: "#6B7280" }} />
                    Submitting Teacher:
                  </span>
                  <strong style={{ color: isDark ? "#FFFFFF" : "#171717" }}>{user?.name || "Assigned Teacher"}</strong>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: isDark ? "#262626" : "#E5E7EB" }}>
                <button
                  type="button"
                  onClick={() => setEditingMilestone(null)}
                  className={`px-4 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    isDark
                      ? "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      : "border-[#E5E7EB] bg-[#FFFFFF] text-[#171717] hover:bg-[#F3F4F6]"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSubmission}
                  disabled={submitMutation.isPending}
                  className="px-5 py-2.5 rounded-xl brand-gradient text-xs font-bold transition-opacity hover:opacity-90 shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  style={{ color: "#171717" }}
                >
                  {submitMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" style={{ color: "#171717" }} />
                      <span style={{ color: "#171717" }}>Save Project Submission</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
