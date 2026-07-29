"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Clock,
  Search,
  RefreshCw,
  Calendar,
  CheckCircle2,
  PlayCircle,
  UserX,
  UserCheck,
  Eye,
  Timer,
  BookOpen
} from "lucide-react";
import { TeacherDayTimelineModal } from "./TeacherDayTimelineModal";
import { TeacherWeeklyAvailabilityModal } from "./TeacherWeeklyAvailabilityModal";
import { usePermissions } from "@/hooks/usePermissions";

interface TeacherTimingData {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  subjectExpertise: string[];
  experience?: number;
  employmentType?: string;
  status: string; // Raw DB status (Available / On Leave)
  availability?: Array<{
    day: string;
    slots: Array<{ startTime: string; endTime: string }>;
  }>;
  dutyStatusReason?: string;
  dutyStatusSchedule?: any[];
  liveStatus: "Free" | "In Class" | "Class Starting Soon" | "On Leave" | "Off Duty";
  currentClass: {
    title: string;
    subject: string;
    type: "Class" | "Demo";
    startTime: string;
    endTime: string;
    minutesLeft: number | null;
    progress: number;
    meetingLink?: string;
  } | null;
  nextClass: {
    title: string;
    subject: string;
    type: "Class" | "Demo";
    startTime: string;
    endTime: string;
    startsInMinutes: number | null;
    meetingLink?: string;
  } | null;
  todayClassesCount: number;
  completedClassesCount: number;
  todayScheduleItems?: any[];
}

export function TeacherTimingTable() {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const hasWriteAccess = canWrite("teachers");

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "Free" | "In Class" | "Class Starting Soon" | "On Leave">("ALL");
  const [selectedTimelineTeacher, setSelectedTimelineTeacher] = useState<TeacherTimingData | null>(null);
  const [selectedWeeklyAvailTeacher, setSelectedWeeklyAvailTeacher] = useState<TeacherTimingData | null>(null);

  // Fetch teacher timings
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["teacher-timings", selectedDate],
    queryFn: async () => {
      const res = await api.get(`/teachers/timings?date=${selectedDate}`);
      return res.data;
    },
    refetchInterval: 30_000, // Auto-refetch every 30 seconds
  });

  // Local clock state to ensure relative time tickers update live
  const [nowTime, setNowTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // Status mutation (e.g. toggle On Leave / Available)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return api.put(`/teachers/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-timings"] });
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
    },
  });

  const summary = data?.summary || {
    totalTeachers: 0,
    freeCount: 0,
    inClassCount: 0,
    startingSoonCount: 0,
    onLeaveCount: 0,
  };

  const teachers: TeacherTimingData[] = data?.teachers || [];

  // Filter logic
  const filteredTeachers = teachers.filter((t) => {
    // Category filter
    if (activeFilter !== "ALL" && t.liveStatus !== activeFilter) {
      return false;
    }
    // Search query filter
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.subjectExpertise.some((s) => s.toLowerCase().includes(q)) ||
      t.currentClass?.title.toLowerCase().includes(q) ||
      t.nextClass?.title.toLowerCase().includes(q)
    );
  });

  const formatTime = (time24?: string) => {
    if (!time24) return "—";
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  };

  const formatMinutes = (mins: number | null) => {
    if (mins === null || mins === undefined) return "—";
    if (mins <= 0) return "Starting now";
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Live Indicators */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Timer className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Teacher Timing & Real-Time Availability</h2>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Status
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Track live classes, free schedules, upcoming class countdowns, and leave status in real-time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-neutral-300">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none text-xs font-mono cursor-pointer"
            />
          </div>

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-neutral-300 hover:text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin text-amber-400" : ""}`} />
            {isRefetching ? "Updating..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 🟢 Free (Available) Teachers */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          onClick={() => setActiveFilter(activeFilter === "Free" ? "ALL" : "Free")}
          className={`p-5 rounded-2xl cursor-pointer border transition-all ${
            activeFilter === "Free"
              ? "bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-500/10"
              : "bg-neutral-900/80 border-neutral-800 hover:border-emerald-500/30"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              🟢 Free (Available)
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{isLoading ? "—" : summary.freeCount}</div>
          <p className="text-xs text-neutral-400">Teachers ready & free right now</p>
        </motion.div>

        {/* 🔴 In Class */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          onClick={() => setActiveFilter(activeFilter === "In Class" ? "ALL" : "In Class")}
          className={`p-5 rounded-2xl cursor-pointer border transition-all ${
            activeFilter === "In Class"
              ? "bg-red-950/40 border-red-500/60 shadow-lg shadow-red-500/10"
              : "bg-neutral-900/80 border-neutral-800 hover:border-red-500/30"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              🔴 In Class
            </span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400">
              <PlayCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{isLoading ? "—" : summary.inClassCount}</div>
          <p className="text-xs text-neutral-400">Actively teaching a class or demo</p>
        </motion.div>

        {/* 🟡 Class Starting Soon */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          onClick={() => setActiveFilter(activeFilter === "Class Starting Soon" ? "ALL" : "Class Starting Soon")}
          className={`p-5 rounded-2xl cursor-pointer border transition-all ${
            activeFilter === "Class Starting Soon"
              ? "bg-amber-950/40 border-amber-500/60 shadow-lg shadow-amber-500/10"
              : "bg-neutral-900/80 border-neutral-800 hover:border-amber-500/30"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              🟡 Class Starts Soon
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{isLoading ? "—" : summary.startingSoonCount}</div>
          <p className="text-xs text-neutral-400">Starting in next 60 mins</p>
        </motion.div>

        {/* ⚪ On Leave */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          onClick={() => setActiveFilter(activeFilter === "On Leave" ? "ALL" : "On Leave")}
          className={`p-5 rounded-2xl cursor-pointer border transition-all ${
            activeFilter === "On Leave"
              ? "bg-neutral-800 border-neutral-600 shadow-lg"
              : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-700"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-neutral-600" />
              ⚪ On Leave
            </span>
            <div className="p-2 rounded-xl bg-neutral-800 text-neutral-400">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-white mb-1">{isLoading ? "—" : summary.onLeaveCount}</div>
          <p className="text-xs text-neutral-400">Currently unavailable today</p>
        </motion.div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveFilter("ALL")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
              activeFilter === "ALL"
                ? "bg-amber-500 text-black font-semibold"
                : "bg-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            All Teachers ({summary.totalTeachers})
          </button>
          <button
            onClick={() => setActiveFilter("Free")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeFilter === "Free"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-neutral-800/60 text-neutral-400 hover:text-emerald-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Free ({summary.freeCount})
          </button>
          <button
            onClick={() => setActiveFilter("In Class")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeFilter === "In Class"
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "bg-neutral-800/60 text-neutral-400 hover:text-red-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            In Class ({summary.inClassCount})
          </button>
          <button
            onClick={() => setActiveFilter("Class Starting Soon")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeFilter === "Class Starting Soon"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "bg-neutral-800/60 text-neutral-400 hover:text-amber-400"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Class Starting Soon ({summary.startingSoonCount})
          </button>
          <button
            onClick={() => setActiveFilter("On Leave")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeFilter === "On Leave"
                ? "bg-neutral-700 text-white border border-neutral-600"
                : "bg-neutral-800/60 text-neutral-400 hover:text-neutral-300"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
            On Leave ({summary.onLeaveCount})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search teacher, subject, batch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Timing Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="py-20 text-center text-neutral-500">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-400">Loading teacher timing data...</p>
          </div>
        ) : filteredTeachers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-neutral-600 mx-auto mb-3 opacity-60" />
            <p className="text-neutral-300 font-medium text-base">No teachers match criteria</p>
            <p className="text-xs text-neutral-500 mt-1">Try clearing filters or search terms</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 uppercase tracking-wider bg-neutral-950/50">
                  <th className="py-4 px-5 font-semibold">Teacher Name</th>
                  <th className="py-4 px-5 font-semibold">Live Availability Status</th>
                  <th className="py-4 px-5 font-semibold">Current Activity / Class</th>
                  <th className="py-4 px-5 font-semibold">Next Scheduled Class</th>
                  <th className="py-4 px-5 font-semibold">Class Start Countdown</th>
                  <th className="py-4 px-5 font-semibold text-right">Actions & Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-xs">
                {filteredTeachers.map((t) => {
                  const isFree = t.liveStatus === "Free";
                  const isInClass = t.liveStatus === "In Class";
                  const isStartingSoon = t.liveStatus === "Class Starting Soon";
                  const isOnLeave = t.liveStatus === "On Leave";

                  return (
                    <tr
                      key={t._id}
                      className="hover:bg-neutral-800/40 transition-colors group"
                    >
                      {/* Teacher Info */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-9 h-9 rounded-full brand-gradient flex items-center justify-center font-bold text-black text-sm shrink-0 shadow-md">
                              {t.name.charAt(0)}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${
                                isInClass
                                  ? "bg-red-500 animate-pulse"
                                  : isStartingSoon
                                  ? "bg-amber-500"
                                  : isFree
                                  ? "bg-emerald-500"
                                  : "bg-neutral-600"
                              }`}
                            />
                          </div>
                          <div>
                            <p className="font-semibold text-white group-hover:text-amber-400 transition-colors text-sm">
                              {t.name}
                            </p>
                            <p className="text-[11px] text-neutral-400 font-mono">{t.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {t.subjectExpertise?.slice(0, 2).map((sub, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] px-1.5 py-0.2 bg-neutral-800 border border-neutral-700 text-neutral-300 rounded"
                                >
                                  {sub}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Live Availability Status */}
                      <td className="py-4 px-5">
                        {isInClass && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-semibold shadow-sm shadow-red-500/10">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            In Class Now {t.currentClass?.minutesLeft !== null && t.currentClass?.minutesLeft !== undefined ? `(${t.currentClass.minutesLeft}m left)` : ""}
                          </span>
                        )}
                        {isStartingSoon && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold shadow-sm shadow-amber-500/10">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                            Class Starts Soon
                          </span>
                        )}
                        {isFree && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Free & Available
                          </span>
                        )}
                        {isOnLeave && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 text-xs font-medium" title={t.dutyStatusReason ? `Reason: ${t.dutyStatusReason}` : "On Leave"}>
                            <UserX className="w-3.5 h-3.5 text-neutral-500" />
                            On Leave {t.dutyStatusReason ? `(${t.dutyStatusReason})` : ""}
                          </span>
                        )}
                      </td>

                      {/* Current Activity / Class */}
                      <td className="py-4 px-5">
                        {t.currentClass ? (
                          <div className="space-y-1 max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 uppercase">
                                {t.currentClass.type}
                              </span>
                              <span className="font-semibold text-white truncate text-xs">
                                {t.currentClass.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                              <Clock className="w-3 h-3 text-neutral-500" />
                              <span>
                                {formatTime(t.currentClass.startTime)} - {formatTime(t.currentClass.endTime)}
                              </span>
                              {t.currentClass.minutesLeft !== null && (
                                <span className="text-red-400 font-semibold bg-red-500/10 px-1.5 py-0.5 rounded text-[10px]">
                                  {t.currentClass.minutesLeft}m left
                                </span>
                              )}
                            </div>
                            {/* Class Progress Bar */}
                            <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-gradient-to-r from-red-500 to-amber-500 h-full rounded-full transition-all"
                                style={{ width: `${t.currentClass.progress}%` }}
                              />
                            </div>
                          </div>
                        ) : (t as any).lastCompletedClass ? (
                          <div className="space-y-1 max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 uppercase border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Class Finished
                              </span>
                              <span className="font-semibold text-neutral-200 truncate text-xs">
                                {(t as any).lastCompletedClass.title}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
                              <Clock className="w-3 h-3 text-neutral-500" />
                              <span>
                                Ended at {formatTime((t as any).lastCompletedClass.endTime)} ({(t as any).lastCompletedClass.subject})
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-neutral-500 italic text-xs">No active class right now</span>
                        )}
                      </td>

                      {/* Next Scheduled Class */}
                      <td className="py-4 px-5">
                        {t.nextClass ? (
                          <div className="space-y-1">
                            <p className="font-medium text-neutral-200 text-xs truncate max-w-xs">
                              {t.nextClass.title}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-amber-400">
                              <Clock className="w-3 h-3" />
                              <span>
                                {formatTime(t.nextClass.startTime)} ({t.nextClass.subject})
                              </span>
                            </div>
                          </div>
                        ) : (t as any).lastCompletedClass ? (
                          <span className="text-emerald-400/90 font-medium text-xs flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> All classes finished for today
                          </span>
                        ) : (
                          <span className="text-neutral-500 text-xs">No more classes scheduled today</span>
                        )}
                      </td>

                      {/* Class Start Countdown in Minutes */}
                      <td className="py-4 px-5">
                        {t.nextClass?.startsInMinutes !== null && t.nextClass?.startsInMinutes !== undefined ? (
                          <div className="flex items-center gap-2">
                            {t.nextClass.startsInMinutes <= 30 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 animate-pulse">
                                <Timer className="w-3.5 h-3.5 text-amber-400" />
                                Starts in {formatMinutes(t.nextClass.startsInMinutes)}
                              </span>
                            ) : t.nextClass.startsInMinutes <= 60 ? (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium text-xs flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                Starts in {formatMinutes(t.nextClass.startsInMinutes)}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-300 font-mono text-xs">
                                In {formatMinutes(t.nextClass.startsInMinutes)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions & Timeline */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Weekly Availability */}
                          <button
                            onClick={() => setSelectedWeeklyAvailTeacher(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 hover:text-emerald-300 rounded-lg text-xs font-medium transition-colors border border-neutral-700"
                            title="View Teacher Weekly Availability Schedule"
                          >
                            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Weekly Availability</span>
                          </button>

                          {/* View Day Timeline */}
                          <button
                            onClick={() => setSelectedTimelineTeacher(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 hover:text-amber-300 rounded-lg text-xs font-medium transition-colors border border-neutral-700"
                            title="View Today's Complete Timeline"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Timeline</span>
                          </button>

                          {/* Toggle On Leave / Available */}
                          {hasWriteAccess && (
                            <button
                              onClick={() => {
                                const newStatus = t.status === "On Leave" ? "Available" : "On Leave";
                                updateStatusMutation.mutate({ id: t._id, status: newStatus });
                              }}
                              disabled={updateStatusMutation.isPending}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 border ${
                                t.status === "On Leave"
                                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 border-neutral-700 hover:border-red-500/30"
                              }`}
                              title={t.status === "On Leave" ? "Set Teacher to Available" : "Mark Teacher On Leave"}
                            >
                              {t.status === "On Leave" ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Set Available</span>
                                </>
                              ) : (
                                <>
                                  <UserX className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>Mark Leave</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Teacher Timeline Modal */}
      <TeacherDayTimelineModal
        isOpen={!!selectedTimelineTeacher}
        onClose={() => setSelectedTimelineTeacher(null)}
        teacher={selectedTimelineTeacher}
        selectedDate={selectedDate}
      />

      {/* Teacher Weekly Availability Modal */}
      <TeacherWeeklyAvailabilityModal
        isOpen={!!selectedWeeklyAvailTeacher}
        onClose={() => setSelectedWeeklyAvailTeacher(null)}
        teacher={selectedWeeklyAvailTeacher}
        canEdit={hasWriteAccess}
      />
    </div>
  );
}
