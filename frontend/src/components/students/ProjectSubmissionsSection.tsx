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
  Link as LinkIcon,
  RotateCcw
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuthStore } from "@/store/authStore";
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              Project Submissions
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {sortedMilestones.length} {sortedMilestones.length === 1 ? "Milestone" : "Milestones"}
              </span>
            </h3>
            <p className="text-xs text-neutral-400">
              Automatic project milestones every 5 completed classes (5, 10, 15, 20...)
            </p>
          </div>
        </div>

        {/* Next Milestone Countdown Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800/80 border border-neutral-700/60 text-xs text-neutral-300 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>
            {actualCompleted} Classes Done ·{" "}
            <strong className="text-white">Next at Class {nextMilestoneNumber}</strong>{" "}
            ({classesUntilNext} {classesUntilNext === 1 ? "class" : "classes"} left)
          </span>
        </div>
      </div>

      {/* Milestones List */}
      {sortedMilestones.length === 0 ? (
        <div className="bg-neutral-800/20 border border-neutral-800 rounded-2xl p-6 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-neutral-300">No project milestones unlocked yet</p>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
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
                  isReviewed
                    ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50"
                    : isSubmitted
                    ? "bg-blue-950/20 border-blue-500/30 hover:border-blue-500/50"
                    : "bg-neutral-800/30 border-amber-500/20 hover:border-amber-500/40"
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
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs font-bold text-white shadow-sm">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        Milestone {idx + 1} ({milestoneNum} Classes Completed)
                      </span>

                      {/* Status Badges */}
                      {isReviewed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Reviewed
                        </span>
                      ) : isSubmitted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold">
                          <LinkIcon className="w-3.5 h-3.5" /> Link Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
                          <Clock className="w-3.5 h-3.5" /> Pending Link Submission
                        </span>
                      )}

                      {submission?.submissionDate && (
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1 ml-auto sm:ml-0">
                          <Calendar className="w-3 h-3 text-neutral-500" />
                          {formatDateDisplay(submission.submissionDate)}
                        </span>
                      )}
                    </div>

                    {/* Project Title & Link */}
                    {isSubmitted ? (
                      <div className="space-y-1.5 pt-1">
                        <h4 className="font-bold text-white text-sm sm:text-base leading-snug">
                          {submission?.projectTitle || "Student Project"}
                        </h4>

                        {submission?.projectLink && (
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <a
                              href={submission.projectLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 break-all group max-w-full"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0 group-hover:scale-110 transition-transform" />
                              <span className="truncate">{submission.projectLink}</span>
                            </a>
                            <button
                              onClick={() => handleCopyLink(submission.projectLink!)}
                              className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors"
                              title="Copy project link"
                            >
                              {copiedLink === submission.projectLink ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 italic pt-1">
                        Milestone reached. Waiting for assigned teacher to submit the project link.
                      </p>
                    )}

                    {/* Teacher Remarks & Teacher Name */}
                    {submission?.teacherRemarks && (
                      <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-2.5 text-xs text-neutral-300 mt-2 flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-neutral-400 text-[11px] block">Teacher Remarks:</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{submission.teacherRemarks}</p>
                        </div>
                      </div>
                    )}

                    {submission?.teacherName && (
                      <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 pt-1">
                        <User className="w-3 h-3 text-neutral-500" />
                        <span>Submitted by Teacher: <strong className="text-neutral-300">{submission.teacherName}</strong></span>
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
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                              isReviewed
                                ? "bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                            }`}
                            title={isReviewed ? "Revert to Link Submitted" : "Mark Project as Reviewed"}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isReviewed ? "Reviewed" : "Mark Reviewed"}
                          </button>
                          <button
                            onClick={() => handleOpenForm(milestoneNum)}
                            className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                            Edit Link
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenForm(milestoneNum)}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 hover:scale-[1.02]"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          Submit Project Link
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
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                    <FolderGit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {formLink ? "Update Project Submission" : "Submit Student Project Link"}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Milestone: {editingMilestone} Completed Classes · {student.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingMilestone(null)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-4 text-xs">
                {/* Project Title */}
                <div>
                  <label className="block text-neutral-400 font-semibold mb-1">
                    Project Title <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Space Shooter Game, Python Calculator, Portfolio Website"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm"
                  />
                </div>

                {/* Project Link URL */}
                <div>
                  <label className="block text-neutral-400 font-semibold mb-1">
                    Project Link (URL) <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                      <LinkIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      value={formLink}
                      onChange={(e) => setFormLink(e.target.value)}
                      placeholder="https://scratch.mit.edu/projects/... or https://github.com/..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm"
                    />
                  </div>
                </div>

                {/* Submission Date & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">Submission Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-400 font-semibold mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500 text-sm"
                    >
                      <option value="Link Submitted">Link Submitted</option>
                      <option value="Reviewed">Reviewed</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>

                {/* Teacher Remarks */}
                <div>
                  <label className="block text-neutral-400 font-semibold mb-1">
                    Teacher Remarks / Feedback <span className="text-neutral-500 font-normal">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    placeholder="Add teacher remarks, feedback, or key concepts demonstrated in this project..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 text-sm resize-none"
                  />
                </div>

                {/* Teacher Submitting Info */}
                <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3 flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-neutral-500" />
                    Submitting Teacher:
                  </span>
                  <strong className="text-white">{user?.name || "Assigned Teacher"}</strong>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingMilestone(null)}
                  className="px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSubmission}
                  disabled={submitMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Save Project Submission
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
