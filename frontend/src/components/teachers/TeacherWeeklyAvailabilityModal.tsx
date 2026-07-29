"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock, CheckCircle2, AlertCircle, Edit3, Save, Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";

interface Slot {
  startTime: string;
  endTime: string;
}

interface DayAvailability {
  day: string;
  slots: Slot[];
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface TeacherWeeklyAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    subjectExpertise?: string[];
    employmentType?: string;
    status?: string;
    dutyStatusSchedule?: any[];
    availability?: DayAvailability[];
  } | null;
  canEdit?: boolean;
}

export function TeacherWeeklyAvailabilityModal({
  isOpen,
  onClose,
  teacher,
  canEdit = false
}: TeacherWeeklyAvailabilityModalProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editAvailability, setEditAvailability] = useState<DayAvailability[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Normalize availability for 7 days
  useEffect(() => {
    if (teacher) {
      const normalized = DAYS_OF_WEEK.map((dayName) => {
        const existing = teacher.availability?.find((a) => a.day === dayName);
        return {
          day: dayName,
          slots: existing ? existing.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })) : [],
        };
      });
      setEditAvailability(normalized);
      setIsEditing(false);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [teacher]);

  const updateTeacherMutation = useMutation({
    mutationFn: async (filteredAvailability: DayAvailability[]) => {
      if (!teacher) return;
      return api.put(`/teachers/${teacher._id}`, {
        availability: filteredAvailability,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-timings"] });
      setSuccessMsg("Teacher weekly availability updated successfully!");
      setIsEditing(false);
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || "Failed to update teacher availability.");
    },
  });

  if (!isOpen || !teacher) return null;

  const currentAvailability = isEditing
    ? editAvailability
    : DAYS_OF_WEEK.map((dayName) => {
        const existing = teacher.availability?.find((a) => a.day === dayName);
        return {
          day: dayName,
          slots: existing ? existing.slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })) : [],
        };
      });

  const formatTime = (time24: string) => {
    if (!time24) return "";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const calculateHours = (slots: Slot[]) => {
    let totalMins = 0;
    for (const slot of slots) {
      if (!slot.startTime || !slot.endTime) continue;
      const [sh, sm] = slot.startTime.split(":").map(Number);
      const [eh, em] = slot.endTime.split(":").map(Number);
      let startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin < startMin) endMin += 1440;
      totalMins += Math.max(0, endMin - startMin);
    }
    return (totalMins / 60).toFixed(1).replace(/\.0$/, "");
  };

  const calculateTotalWeeklyHours = (availList: DayAvailability[]) => {
    let totalMins = 0;
    for (const dayAvail of availList) {
      for (const slot of dayAvail.slots) {
        if (!slot.startTime || !slot.endTime) continue;
        const [sh, sm] = slot.startTime.split(":").map(Number);
        const [eh, em] = slot.endTime.split(":").map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin < startMin) endMin += 1440;
        totalMins += Math.max(0, endMin - startMin);
      }
    }
    return (totalMins / 60).toFixed(1).replace(/\.0$/, "");
  };

  const activeDaysCount = currentAvailability.filter((a) => a.slots.length > 0).length;
  const totalWeeklyHours = calculateTotalWeeklyHours(currentAvailability);

  // Edit Handlers
  const handleAddSlot = (dayName: string) => {
    setEditAvailability((prev) =>
      prev.map((d) =>
        d.day === dayName
          ? { ...d, slots: [...d.slots, { startTime: "09:00", endTime: "17:00" }] }
          : d
      )
    );
  };

  const handleRemoveSlot = (dayName: string, index: number) => {
    setEditAvailability((prev) =>
      prev.map((d) =>
        d.day === dayName
          ? { ...d, slots: d.slots.filter((_, idx) => idx !== index) }
          : d
      )
    );
  };

  const handleSlotChange = (dayName: string, index: number, field: "startTime" | "endTime", value: string) => {
    setEditAvailability((prev) =>
      prev.map((d) => {
        if (d.day !== dayName) return d;
        const newSlots = [...d.slots];
        newSlots[index] = { ...newSlots[index], [field]: value };
        return { ...d, slots: newSlots };
      })
    );
  };

  const handleSave = () => {
    setErrorMsg(null);
    for (const dayAvail of editAvailability) {
      for (const slot of dayAvail.slots) {
        if (!slot.startTime || !slot.endTime) {
          setErrorMsg(`Please complete all start and end times for ${dayAvail.day}.`);
          return;
        }
        if (slot.startTime >= slot.endTime) {
          setErrorMsg(`Start time must be before end time on ${dayAvail.day} (${slot.startTime} - ${slot.endTime}).`);
          return;
        }
      }
    }

    const filtered = editAvailability.filter((a) => a.slots.length > 0);
    updateTeacherMutation.mutate(filtered);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Modal Header */}
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <Calendar className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{teacher.name}&apos;s Weekly Availability</h2>
                  {teacher.employmentType && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                      {teacher.employmentType}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400 flex items-center gap-2 mt-1">
                  <span>{teacher.email}</span>
                  {teacher.phone && <span>• {teacher.phone}</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canEdit && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Schedule
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="bg-neutral-950/40 border-b border-neutral-800/80 px-6 py-3 flex items-center justify-between flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500">Active Days:</span>
                <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {activeDaysCount} / 7 Days
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500">Total Availability:</span>
                <span className="font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {totalWeeklyHours} Hours / Week
                </span>
              </div>
              {teacher.dutyStatusSchedule && teacher.dutyStatusSchedule.length > 0 && (
                <div className="flex items-center gap-1.5" title={teacher.dutyStatusSchedule.map((s: any) => `${s.startDate} to ${s.endDate}: ${s.status} (${s.reason || "No note"})`).join("\n")}>
                  <span className="text-neutral-500">Scheduled Duty Status:</span>
                  <span className="font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1 cursor-help">
                    <Calendar className="w-3 h-3 text-blue-400" />
                    {teacher.dutyStatusSchedule.length} Date {teacher.dutyStatusSchedule.length === 1 ? "Schedule" : "Schedules"}
                  </span>
                </div>
              )}
            </div>
            {teacher.subjectExpertise && teacher.subjectExpertise.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-neutral-500 mr-1">Expertise:</span>
                {teacher.subjectExpertise.map((sub, i) => (
                  <span key={i} className="bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-[11px]">
                    {sub}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          {errorMsg && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Modal Body: 7 Days Cards */}
          <div className="p-6 overflow-y-auto space-y-3 flex-1">
            {currentAvailability.map((dayAvail) => {
              const hasSlots = dayAvail.slots.length > 0;
              const dayHours = calculateHours(dayAvail.slots);

              return (
                <div
                  key={dayAvail.day}
                  className={`p-4 rounded-xl border transition-all ${
                    hasSlots
                      ? "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700"
                      : "bg-neutral-950/40 border-neutral-800/50 opacity-60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Day Name & Status */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          hasSlots ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-neutral-700"
                        }`}
                      />
                      <span className="font-bold text-white text-sm min-w-[100px]">{dayAvail.day}</span>

                      {hasSlots ? (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {dayHours} hrs available
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-500 border border-neutral-700/50">
                          Not Available / Off
                        </span>
                      )}
                    </div>

                    {/* Slots Display or Editing */}
                    <div className="flex-1 sm:justify-end flex flex-wrap items-center gap-2">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {dayAvail.slots.map((slot, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-lg p-1.5 text-xs"
                            >
                              <input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) => handleSlotChange(dayAvail.day, idx, "startTime", e.target.value)}
                                className="bg-neutral-900 text-amber-400 font-mono text-xs border border-neutral-700 rounded px-1.5 py-1 focus:outline-none focus:border-amber-500"
                              />
                              <span className="text-neutral-500">to</span>
                              <input
                                type="time"
                                value={slot.endTime}
                                onChange={(e) => handleSlotChange(dayAvail.day, idx, "endTime", e.target.value)}
                                className="bg-neutral-900 text-amber-400 font-mono text-xs border border-neutral-700 rounded px-1.5 py-1 focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveSlot(dayAvail.day, idx)}
                                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddSlot(dayAvail.day)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                          >
                            <Plus className="w-3 h-3 text-amber-400" /> Add Slot
                          </button>
                        </div>
                      ) : hasSlots ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {dayAvail.slots.map((slot, idx) => (
                            <span
                              key={idx}
                              className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg text-xs font-mono font-medium"
                            >
                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-500 italic">No time slots configured</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {isEditing ? "Modify time slots above and click Save to update." : "Weekly recurring availability set by teacher."}
            </span>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setErrorMsg(null);
                    }}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={updateTeacherMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-xs shadow-md shadow-amber-500/20 hover:opacity-90 transition-opacity"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {updateTeacherMutation.isPending ? "Saving..." : "Save Availability"}
                  </button>
                </>
              ) : (
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
