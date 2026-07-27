"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock, BookOpen, Video, ExternalLink, UserCheck } from "lucide-react";

interface TimelineItem {
  id: string;
  type: "Class" | "Demo";
  batchName: string;
  subject: string;
  startTime: string;
  endTime: string;
  startMin: number;
  endMin: number;
  status: string;
  meetingLink?: string;
  isReplacement?: boolean;
}

interface TeacherDayTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: {
    _id: string;
    name: string;
    email: string;
    subjectExpertise?: string[];
    todayScheduleItems?: TimelineItem[];
  } | null;
  selectedDate: string;
}

export function TeacherDayTimelineModal({ isOpen, onClose, teacher, selectedDate }: TeacherDayTimelineModalProps) {
  if (!isOpen || !teacher) return null;

  const items = teacher.todayScheduleItems || [];

  const formatTime = (time24: string) => {
    if (!time24) return "";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const formattedDate = new Date(selectedDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Modal Header */}
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">{teacher.name}&apos;s Timeline</h2>
                {teacher.subjectExpertise?.[0] && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {teacher.subjectExpertise[0]}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                {formattedDate}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {items.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                <Clock className="w-10 h-10 mx-auto mb-3 text-neutral-600 opacity-60" />
                <p className="text-base font-medium text-neutral-400">No classes scheduled for this day</p>
                <p className="text-xs text-neutral-600 mt-1">Teacher is completely free on {formattedDate}</p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-800">
                {items.map((item, idx) => (
                  <div key={item.id || idx} className="relative group">
                    {/* Timeline Node Icon */}
                    <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-neutral-900 ${
                      item.type === "Demo"
                        ? "border-purple-500 text-purple-400"
                        : item.status === "Completed"
                        ? "border-emerald-500 text-emerald-400"
                        : "border-amber-500 text-amber-400"
                    }`}>
                      <div className={`w-2 h-2 rounded-full ${
                        item.type === "Demo"
                          ? "bg-purple-500"
                          : item.status === "Completed"
                          ? "bg-emerald-500"
                          : "bg-amber-500 animate-pulse"
                      }`} />
                    </div>

                    {/* Timeline Card */}
                    <div className="p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition-all space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                              item.type === "Demo" ? "bg-purple-500/20 text-purple-300" : "bg-amber-500/20 text-amber-300"
                            }`}>
                              {item.type}
                            </span>
                            <h4 className="font-semibold text-white text-sm">{item.batchName}</h4>
                          </div>
                          <p className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
                            Subject: <span className="text-neutral-200">{item.subject}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 block">
                            {formatTime(item.startTime)} - {formatTime(item.endTime)}
                          </span>
                          <span className={`text-[10px] font-medium mt-1 block ${
                            item.status === "Completed" ? "text-emerald-400" : "text-amber-400"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>

                      {item.isReplacement && (
                        <div className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 p-2 rounded-lg border border-orange-500/20">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Taking as Substitute Teacher</span>
                        </div>
                      )}

                      {item.meetingLink && (
                        <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                          <span className="text-xs text-neutral-500 flex items-center gap-1">
                            <Video className="w-3.5 h-3.5 text-neutral-400" /> Class Meeting Link
                          </span>
                          <a
                            href={item.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline"
                          >
                            Join Link <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 text-right">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
