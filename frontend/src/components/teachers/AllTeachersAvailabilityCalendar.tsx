"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  Clock,
  Search,
  Filter,
  RefreshCw,
  User,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  SlidersHorizontal,
  Sparkles,
  Layers
} from "lucide-react";
import { TeacherWeeklyAvailabilityModal } from "./TeacherWeeklyAvailabilityModal";
import { TeacherDayTimelineModal } from "./TeacherDayTimelineModal";
import { usePermissions } from "@/hooks/usePermissions";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface AvailabilitySlot {
  startTime: string;
  endTime: string;
}

interface DayAvailability {
  day: string;
  slots: AvailabilitySlot[];
}

interface TeacherTimingData {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  subjectExpertise: string[];
  experience?: number;
  employmentType?: string;
  status: string; // Raw DB status: Available / On Leave
  dutyStatusSchedule?: any[];
  dutyStatusReason?: string;
  availability?: DayAvailability[];
  liveStatus: "Free" | "In Class" | "Class Starting Soon" | "On Leave" | "Off Duty";
  todayScheduleItems?: Array<{
    id: string;
    type: "Class" | "Demo";
    date?: string;
    batchName: string;
    subject: string;
    startTime: string;
    endTime: string;
    startMin: number;
    endMin: number;
    status: string;
    meetingLink?: string;
  }>;
}

export function AllTeachersAvailabilityCalendar() {
  const { canWrite } = usePermissions();
  const hasWriteAccess = canWrite("teachers");

  // Selected date state (defaults to today)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"weekly-matrix" | "daily-timeline">("weekly-matrix");

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("ALL");
  const [selectedSubject, setSelectedSubject] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Modal target states
  const [selectedWeeklyTeacher, setSelectedWeeklyTeacher] = useState<TeacherTimingData | null>(null);
  const [selectedTimelineTeacher, setSelectedTimelineTeacher] = useState<TeacherTimingData | null>(null);

  // Helper to calculate start & end of week for current selectedDate
  const weekDates = useMemo(() => {
    const curr = new Date(selectedDate);
    const firstDay = curr.getDate() - (curr.getDay() === 0 ? 6 : curr.getDay() - 1); // Monday
    const dates: { dayName: string; dateStr: string; dateObj: Date }[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(curr.setDate(firstDay + i));
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push({
        dayName: DAYS_OF_WEEK[i],
        dateStr: `${year}-${month}-${day}`,
        dateObj: new Date(d)
      });
    }
    return dates;
  }, [selectedDate]);

  const startDateStr = weekDates[0].dateStr;
  const endDateStr = weekDates[6].dateStr;

  // Fetch teacher timings across the date range
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["all-teacher-availability", startDateStr, endDateStr],
    queryFn: async () => {
      const res = await api.get(`/teachers/timings?startDate=${startDateStr}&endDate=${endDateStr}`);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const teachers: TeacherTimingData[] = data?.teachers || [];

  // Extract all unique subjects across teachers for filter dropdown
  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      t.subjectExpertise?.forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [teachers]);

  // Helper to check if teacher is on leave / off duty for a given YYYY-MM-DD date string
  const isTeacherOnLeaveForDate = (teacher: TeacherTimingData, dateStr: string) => {
    if (teacher.dutyStatusSchedule && Array.isArray(teacher.dutyStatusSchedule)) {
      const activeEntry = teacher.dutyStatusSchedule.find((item: any) => {
        const start = item.startDate;
        const end = item.endDate || item.startDate;
        return dateStr >= start && dateStr <= end;
      });
      if (activeEntry) {
        return {
          isOnLeave: activeEntry.status === "On Leave" || activeEntry.status === "Off Duty" || activeEntry.status === "Half Day",
          status: activeEntry.status,
          reason: activeEntry.reason
        };
      }
    }
    const isOnLeave = teacher.status === "On Leave" || teacher.status === "Off Duty";
    return {
      isOnLeave,
      status: teacher.status || "Available",
      reason: teacher.dutyStatusReason
    };
  };

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      const matchesSearch =
        teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teacher.subjectExpertise?.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesTeacher =
        selectedTeacherId === "ALL" || teacher._id === selectedTeacherId;

      const matchesSubject =
        selectedSubject === "ALL" || teacher.subjectExpertise?.includes(selectedSubject);

      const todayStr = new Date().toLocaleDateString("en-CA");
      const todayLeave = isTeacherOnLeaveForDate(teacher, todayStr);

      const matchesStatus =
        selectedStatus === "ALL" ||
        (selectedStatus === "On Leave" && todayLeave.isOnLeave) ||
        (selectedStatus === "Available" && !todayLeave.isOnLeave) ||
        teacher.liveStatus === selectedStatus;

      return matchesSearch && matchesTeacher && matchesSubject && matchesStatus;
    });
  }, [teachers, searchQuery, selectedTeacherId, selectedSubject, selectedStatus]);


  // Navigate dates
  const handlePrev = () => {
    const d = new Date(selectedDate);
    if (viewMode === "weekly-matrix") {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(d);
  };

  const handleNext = () => {
    const d = new Date(selectedDate);
    if (viewMode === "weekly-matrix") {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setSelectedDate(d);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  // Format date range header label
  const rangeLabel = useMemo(() => {
    if (viewMode === "weekly-matrix") {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  }, [viewMode, startDateStr, endDateStr, selectedDate]);

  return (
    <div className="space-y-6">
      {/* Top Header Card & Controls */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">All Teachers Availability Calendar</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Master schedule matrix showing weekly recurring slots, booked classes, and live availability across all faculty members.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* View Mode Toggle */}
            <div className="bg-neutral-950 p-1 rounded-xl border border-neutral-800 flex items-center gap-1">
              <button
                onClick={() => setViewMode("weekly-matrix")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === "weekly-matrix"
                  ? "bg-amber-500 text-black shadow-md"
                  : "text-neutral-400 hover:text-white"
                  }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Weekly Matrix
              </button>
              <button
                onClick={() => setViewMode("daily-timeline")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${viewMode === "daily-timeline"
                  ? "bg-amber-500 text-black shadow-md"
                  : "text-neutral-400 hover:text-white"
                  }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Daily Timeline
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors border border-neutral-700 disabled:opacity-50"
              title="Refresh Calendar"
            >
              <RefreshCw className={`w-4 h-4 ${isRefetching ? "animate-spin text-amber-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Date Navigator & Filters Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 pt-6">
          {/* Date Navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl border border-neutral-700 transition-colors"
            >
              Today
            </button>
            <div className="flex items-center bg-neutral-950 rounded-xl border border-neutral-800">
              <button
                onClick={handlePrev}
                className="p-2 text-neutral-400 hover:text-white transition-colors border-r border-neutral-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 py-1.5 text-xs font-semibold text-white whitespace-nowrap min-w-[180px] text-center">
                {rangeLabel}
              </span>
              <button
                onClick={handleNext}
                className="p-2 text-neutral-400 hover:text-white transition-colors border-l border-neutral-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-3 flex-1 lg:justify-end">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search teacher or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Select Teacher Filter */}
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-[11px] font-medium text-neutral-300 focus:outline-none focus:border-amber-500/50 max-w-[200px] truncate"
            >
              <option value="ALL">All Teachers ({teachers.length})</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.subjectExpertise?.[0] || 'Faculty'})
                </option>
              ))}
            </select>

            {/* Subject Filter */}
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-[11px] font-medium text-neutral-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">All Subjects</option>
              {allSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-[11px] font-medium text-neutral-300 focus:outline-none focus:border-amber-500/50"
            >
              <option value="ALL">All Statuses</option>
              <option value="Available">Available Staff</option>
              <option value="In Class">In Class Now</option>
              <option value="On Leave">On Leave</option>
            </select>

            {/* Clear Filters Button */}
            {(selectedTeacherId !== "ALL" || selectedSubject !== "ALL" || selectedStatus !== "ALL" || searchQuery !== "") && (
              <button
                onClick={() => {
                  setSelectedTeacherId("ALL");
                  setSelectedSubject("ALL");
                  setSelectedStatus("ALL");
                  setSearchQuery("");
                }}
                className="px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl transition-colors flex items-center gap-1 shrink-0"
                title="Reset all filters"
              >
                <XCircle className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Main Calendar Matrix / Timeline */}
      {isLoading ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-neutral-400">Loading teacher availability schedule...</p>
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center">
          <User className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No teachers found</h3>
          <p className="text-xs text-neutral-400 mt-1">Try resetting your search query or status filters.</p>
        </div>
      ) : viewMode === "weekly-matrix" ? (
        /* WEEKLY MATRIX VIEW */
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-neutral-950 border-b border-neutral-800 text-xs text-neutral-400">
                  <th className="py-4 px-4 font-semibold w-64 border-r border-neutral-800 sticky left-0 bg-neutral-950 z-10 shadow-sm">
                    Faculty Member
                  </th>
                  {weekDates.map(({ dayName, dateStr }) => {
                    const todayLocalStr = new Date().toLocaleDateString("en-CA");
                    const isTodayStr = dateStr === todayLocalStr;
                    return (
                      <th
                        key={dayName}
                        className={`py-3 px-3 font-semibold text-center border-r border-neutral-800/60 min-w-[150px] ${isTodayStr ? "bg-amber-500/10 text-amber-400" : ""
                          }`}
                      >
                        <div className="text-xs font-bold">{dayName}</div>
                        <div className="text-[10px] text-neutral-500 font-normal">
                          {new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-xs">
                {filteredTeachers.map((teacher) => {
                  const todayStr = new Date().toLocaleDateString("en-CA");
                  const todayLeave = isTeacherOnLeaveForDate(teacher, todayStr);

                  return (
                    <tr key={teacher._id} className="hover:bg-neutral-800/40 transition-colors group">
                      {/* Teacher Profile Info Sticky Left Column */}
                      <td className="py-3 px-4 border-r border-neutral-800 sticky left-0 bg-neutral-900 group-hover:bg-neutral-900/90 z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 border border-neutral-700 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow">
                              {teacher.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-semibold text-white truncate max-w-[130px]">{teacher.name}</h4>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span
                                  className={`w-2 h-2 rounded-full ${todayLeave.isOnLeave
                                    ? "bg-amber-500"
                                    : teacher.liveStatus === "In Class"
                                      ? "bg-rose-500 animate-pulse"
                                      : "bg-emerald-500"
                                    }`}
                                />
                                <span className="text-[10px] text-neutral-400 truncate">
                                  {todayLeave.isOnLeave ? todayLeave.status : teacher.subjectExpertise?.[0] || "Faculty"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Action to Edit Weekly Availability */}
                          {hasWriteAccess && (
                            <button
                              onClick={() => setSelectedWeeklyTeacher(teacher)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all"
                              title="Edit Availability Slots"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 7 Days Availability Cells */}
                      {weekDates.map(({ dayName, dateStr }) => {
                        const dayAvail = teacher.availability?.find((a) => a.day === dayName);
                        const hasSlots = dayAvail && dayAvail.slots && dayAvail.slots.length > 0;
                        const dayLeaveInfo = isTeacherOnLeaveForDate(teacher, dateStr);

                        // Filter scheduled items on this specific date
                        const dayItems = teacher.todayScheduleItems?.filter((item) => {
                          if (!item.date) return false;
                          const itemDateStr = typeof item.date === "string" && item.date.includes("T") 
                            ? item.date.split("T")[0] 
                            : typeof item.date === "string" 
                            ? item.date 
                            : new Date(item.date).toLocaleDateString("en-CA");
                          return itemDateStr === dateStr;
                        }) || [];

                        return (
                          <td
                            key={dayName}
                            onClick={() => setSelectedTimelineTeacher(teacher)}
                            className="py-2.5 px-3 border-r border-neutral-800/60 align-top cursor-pointer hover:bg-neutral-800/80 transition-colors"
                          >
                            {dayLeaveInfo.isOnLeave ? (
                              <div
                                className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg p-2 text-center text-[10px] font-medium"
                                title={dayLeaveInfo.reason ? `Reason: ${dayLeaveInfo.reason}` : dayLeaveInfo.status}
                              >
                                <div className="font-bold uppercase tracking-wider text-[9px] text-amber-400">
                                  {dayLeaveInfo.status || "On Leave"}
                                </div>
                                {dayLeaveInfo.reason && (
                                  <div className="text-[9px] text-neutral-300 italic truncate mt-0.5">
                                    {dayLeaveInfo.reason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {/* Recurring Availability Slots */}
                                {hasSlots ? (
                                  <div className="space-y-1">
                                    <div className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Available
                                    </div>
                                    {dayAvail.slots.map((slot, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded px-1.5 py-0.5 text-[10px] font-mono text-center"
                                      >
                                        {slot.startTime} - {slot.endTime}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-neutral-600 italic py-1 text-center">
                                    No slots set
                                  </div>
                                )}

                                {/* Overlay Booked Classes & Demos on this date */}
                                {dayItems.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-neutral-800 space-y-1">
                                    <div className="text-[9px] font-semibold text-rose-400 uppercase tracking-wider">
                                      Booked ({dayItems.length})
                                    </div>
                                    {dayItems.map((item) => (
                                      <div
                                        key={item.id}
                                        className={`rounded px-1.5 py-1 text-[10px] border ${item.type === "Demo"
                                          ? "bg-purple-500/10 border-purple-500/20 text-purple-300"
                                          : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                                          }`}
                                      >
                                        <div className="font-semibold truncate">{item.batchName}</div>
                                        <div className="text-[9px] opacity-80 font-mono">
                                          {item.startTime} - {item.endTime}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* DAILY TIMELINE VIEW */
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h3 className="text-sm font-semibold text-white">Daily Hourly Availability Matrix</h3>
            <span className="text-xs text-neutral-400 font-mono">07:00 AM - 10:00 PM</span>
          </div>

          <div className="space-y-3 divide-y divide-neutral-800">
            {filteredTeachers.map((teacher) => (
              <div key={teacher._id} className="pt-3 flex flex-col md:flex-row items-start md:items-center gap-4">
                <div className="w-48 shrink-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white text-xs font-bold">
                    {teacher.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white truncate">{teacher.name}</h4>
                    <p className="text-[10px] text-neutral-400">{teacher.subjectExpertise?.[0] || "Faculty"}</p>
                  </div>
                </div>

                <div className="flex-1 w-full grid grid-cols-6 sm:grid-cols-12 gap-1 bg-neutral-950 p-2 rounded-xl border border-neutral-800">
                  {Array.from({ length: 15 }, (_, i) => i + 7).map((hour) => {
                    const hourStr = `${String(hour).padStart(2, "0")}:00`;
                    const dayName = selectedDate.toLocaleDateString("en-US", { weekday: "long" });
                    const dayAvail = teacher.availability?.find((a) => a.day === dayName);

                    // Check if hour falls within any configured slot
                    const isAvailable = dayAvail?.slots?.some((slot) => {
                      const [sh] = slot.startTime.split(":").map(Number);
                      const [eh] = slot.endTime.split(":").map(Number);
                      return hour >= sh && hour < eh;
                    });

                    const selectedDateStr = selectedDate.toLocaleDateString("en-CA");
                    const dateScheduleEntry = teacher.dutyStatusSchedule?.find((item: any) => {
                      const start = item.startDate;
                      const end = item.endDate || item.startDate;
                      return selectedDateStr >= start && selectedDateStr <= end;
                    });
                    const isOnLeave = dateScheduleEntry
                      ? dateScheduleEntry.status === "On Leave" || dateScheduleEntry.status === "Off Duty"
                      : teacher.status === "On Leave";

                    return (
                      <div
                        key={hour}
                        className={`h-7 rounded text-[9px] font-mono flex items-center justify-center border transition-all ${isOnLeave
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          : isAvailable
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                          }`}
                        title={`${teacher.name} @ ${hourStr}: ${isOnLeave
                          ? `On Leave (${dateScheduleEntry?.reason || "Scheduled"})`
                          : isAvailable
                            ? "Available"
                            : "Not Available"
                          }`}
                      >
                        {hour}:00
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Weekly Availability Modal */}
      {selectedWeeklyTeacher && (
        <TeacherWeeklyAvailabilityModal
          isOpen={!!selectedWeeklyTeacher}
          onClose={() => setSelectedWeeklyTeacher(null)}
          teacher={selectedWeeklyTeacher as any}
          canEdit={hasWriteAccess}
        />
      )}

      {/* Day Timeline Modal */}
      {selectedTimelineTeacher && (
        <TeacherDayTimelineModal
          isOpen={!!selectedTimelineTeacher}
          onClose={() => setSelectedTimelineTeacher(null)}
          teacher={selectedTimelineTeacher as any}
          selectedDate={selectedDate.toLocaleDateString("en-CA")}
        />
      )}

    </div>
  );
}
