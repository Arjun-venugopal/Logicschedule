"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { CheckCircle2, XCircle, Users, BookOpen, Clock, Loader2, Save, CalendarDays, Check } from "lucide-react";

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  
  // Local state for attendance edits before saving
  const [attendanceState, setAttendanceState] = useState<Record<string, boolean>>({});

  // 1. Fetch Teacher's Batches (or all if admin)
  const { data: batches = [], isLoading: loadingBatches } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => (await api.get("/batches")).data,
  });

  // 2. Fetch Schedules for selected batch
  const { data: fetchedSchedules, isLoading: loadingSchedules } = useQuery({
    queryKey: ["schedules-batch", selectedBatchId],
    queryFn: async () => {
      const allSchedules = (await api.get("/schedules")).data;
      return allSchedules.filter((s: any) => 
        (s.batch?._id || s.batch) === selectedBatchId && 
        s.status === "Completed"
      ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!selectedBatchId,
  });
  const schedules = fetchedSchedules || [];

  // 3. Fetch Students for selected batch
  const { data: fetchedStudents, isLoading: loadingStudents } = useQuery({
    queryKey: ["students", selectedBatchId],
    queryFn: async () => (await api.get(`/students/batch/${selectedBatchId}`)).data,
    enabled: !!selectedBatchId,
  });
  const students = useMemo(() => fetchedStudents || [], [fetchedStudents]);

  const selectedClass = schedules.find((s: any) => s._id === selectedClassId);

  // Initialize attendance state when a class is selected
  useEffect(() => {
    if (selectedClass && students.length > 0) {
      const initialState: Record<string, boolean> = {};
      students.forEach((student: any) => {
        const existingRecord = selectedClass.attendance?.find((a: any) => a.studentId === student._id);
        // Default to true (Present) if no record exists
        initialState[student._id] = existingRecord ? existingRecord.isPresent : true;
      });
      // Only set if we actually need to change state to avoid loops
      setAttendanceState(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(initialState)) {
          return initialState;
        }
        return prev;
      });
    } else {
      setAttendanceState(prev => Object.keys(prev).length > 0 ? {} : prev);
    }
  }, [selectedClassId, students, selectedClass]);

  const updateSchedule = useMutation({
    mutationFn: (data: any) => api.put(`/schedules/${selectedClassId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules-batch", selectedBatchId] });
      // Optional toast or success indicator here
    },
  });

  const handleSave = () => {
    if (!selectedClass) return;
    
    const formattedAttendance = Object.entries(attendanceState).map(([studentId, isPresent]) => ({
      studentId,
      isPresent
    }));

    updateSchedule.mutate({
      ...selectedClass,
      teacher: selectedClass.teacher?._id || selectedClass.teacher,
      batch: selectedClass.batch?._id || selectedClass.batch,
      replacementTeacher: selectedClass.replacementTeacher?._id || selectedClass.replacementTeacher,
      attendance: formattedAttendance
    });
  };

  const markAll = (isPresent: boolean) => {
    const newState: Record<string, boolean> = {};
    students.forEach((s: any) => {
      newState[s._id] = isPresent;
    });
    setAttendanceState(newState);
  };

  const presentCount = Object.values(attendanceState).filter(Boolean).length;
  const totalCount = students.length;
  const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 h-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Mark Attendance</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            Select a completed class and update the student attendance register.
          </p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid md:grid-cols-2 gap-4 shrink-0">
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl relative z-10">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-3">
            <BookOpen className="w-4 h-4 text-amber-500" /> Select Batch
          </label>
          <select
            value={selectedBatchId}
            onChange={(e) => {
              setSelectedBatchId(e.target.value);
              setSelectedClassId("");
            }}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500 transition-all"
          >
            <option value="">-- Choose a Batch --</option>
            {batches.map((b: any) => (
              <option key={b._id} value={b._id}>{b.name} ({b.subject})</option>
            ))}
          </select>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl relative z-10">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-3">
            <CalendarDays className="w-4 h-4 text-emerald-500" /> Select Completed Class
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={!selectedBatchId || loadingSchedules}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500 transition-all disabled:opacity-50"
          >
            <option value="">-- Choose Date & Time --</option>
            {schedules.map((s: any) => (
              <option key={s._id} value={s._id}>
                {format(parseISO(s.date), "MMM d, yyyy")} | {s.startTime} - {s.endTime} | {s.subject}
              </option>
            ))}
          </select>
          {selectedBatchId && schedules.length === 0 && !loadingSchedules && (
            <p className="absolute bottom-1 right-5 text-[10px] text-red-400">No completed classes found</p>
          )}
        </div>
      </div>

      {/* Main Attendance Section */}
      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col min-h-[400px]">
        {!selectedBatchId || !selectedClassId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 bg-neutral-800/50 rounded-full flex items-center justify-center mb-6">
              <Users className="w-10 h-10 text-neutral-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Ready to take attendance</h3>
            <p className="text-neutral-400 text-sm max-w-md mx-auto">
              Please select a batch and a completed class from the dropdowns above to load the student roster.
            </p>
          </div>
        ) : loadingStudents ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
            <p className="text-neutral-400 text-sm">Loading roster...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Users className="w-12 h-12 text-neutral-600 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">No Students Found</h3>
            <p className="text-neutral-400 text-sm">This batch doesn't have any enrolled students yet.</p>
          </div>
        ) : (
          <>
            {/* Action Bar */}
            <div className="bg-neutral-800/50 border-b border-neutral-800 p-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">{presentCount} <span className="text-neutral-500 text-lg font-medium">/ {totalCount}</span></span>
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">Present</span>
                </div>
                <div className="h-10 w-px bg-neutral-700"></div>
                <div className="flex flex-col">
                  <span className={`text-xl font-bold ${percentage >= 75 ? 'text-emerald-400' : percentage >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {percentage}%
                  </span>
                  <span className="text-[10px] text-neutral-400 uppercase font-semibold tracking-wider">Attendance</span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => markAll(true)}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-semibold rounded-xl transition-colors"
                >
                  Mark All Present
                </button>
                <button
                  onClick={() => markAll(false)}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-semibold rounded-xl transition-colors"
                >
                  Mark All Absent
                </button>
                <div className="w-px h-6 bg-neutral-700 hidden md:block mx-1"></div>
                <button
                  onClick={handleSave}
                  disabled={updateSchedule.isPending}
                  className="flex items-center gap-2 px-5 py-2 brand-gradient text-black font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  {updateSchedule.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : updateSchedule.isSuccess ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {updateSchedule.isSuccess ? "Saved!" : "Save Attendance"}
                </button>
              </div>
            </div>

            {/* Students Grid */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-950/30">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {students.map((student: any) => {
                  const isPresent = attendanceState[student._id];
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={student._id}
                      onClick={() => setAttendanceState(prev => ({ ...prev, [student._id]: !prev[student._id] }))}
                      className={`relative p-4 rounded-2xl border-2 cursor-pointer transition-all duration-200 overflow-hidden group ${
                        isPresent 
                          ? "bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10" 
                          : "bg-red-500/5 border-red-500/30 hover:bg-red-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-3 relative z-10">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
                          isPresent ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        }`}>
                          {student.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="font-semibold text-white truncate">{student.name}</h4>
                          <p className={`text-xs font-medium truncate ${isPresent ? 'text-emerald-500' : 'text-red-500'}`}>
                            {isPresent ? "Present" : "Absent"}
                          </p>
                        </div>
                      </div>
                      
                      {/* Big Icon Background */}
                      <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                        {isPresent ? (
                          <CheckCircle2 className="w-32 h-32 text-emerald-500" />
                        ) : (
                          <XCircle className="w-32 h-32 text-red-500" />
                        )}
                      </div>
                      
                      {/* Status Indicator */}
                      <div className={`absolute top-4 right-4 w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
                        isPresent ? "bg-emerald-500 shadow-emerald-500/50" : "bg-red-500 shadow-red-500/50"
                      }`} />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
