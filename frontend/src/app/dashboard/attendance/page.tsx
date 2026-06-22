"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { CheckCircle2, XCircle, Users, CalendarIcon, Loader2, Check, Lock, Edit2 } from "lucide-react";
import { useState } from "react";

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // 1. Fetch Students
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["all-students"],
    queryFn: async () => (await api.get("/students")).data,
  });

  // 2. Fetch All Completed Schedules
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery({
    queryKey: ["all-completed-schedules"],
    queryFn: async () => {
      const res = await api.get("/schedules");
      return res.data
        .filter((s: any) => s.status === "Completed")
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
  });

  const updateSchedule = useMutation({
    mutationFn: (data: any) => api.put(`/schedules/${data._id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-completed-schedules"] });
      setTimeout(() => setSavingScheduleId(null), 500); // clear loading state after a brief delay
    },
    onError: () => {
      setSavingScheduleId(null);
    }
  });

  const handleToggleAttendance = (schedule: any, studentId: string, isPresent: boolean) => {
    setSavingScheduleId(schedule._id);
    
    // Clone schedule attendance or init if empty
    const currentAttendance = [...(schedule.attendance || [])];
    const existingIndex = currentAttendance.findIndex((a: any) => 
      (a.studentId?._id || a.studentId) === studentId
    );

    if (existingIndex >= 0) {
      currentAttendance[existingIndex].isPresent = isPresent;
    } else {
      currentAttendance.push({ studentId, isPresent });
    }

    updateSchedule.mutate({
      ...schedule,
      teacher: schedule.teacher?._id || schedule.teacher,
      batch: schedule.batch?._id || schedule.batch,
      replacementTeacher: schedule.replacementTeacher?._id || schedule.replacementTeacher,
      attendance: currentAttendance
    });
  };

  if (loadingStudents || loadingSchedules) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 h-full">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-4" />
        <p className="text-neutral-400 font-medium">Loading Attendance Unified View...</p>
      </div>
    );
  }

  // Filter out students who don't have any completed schedules to show
  const studentsWithSchedules = students.map((student: any) => {
    const studentSchedules = schedules.filter((s: any) => (s.batch?._id || s.batch) === (student.batch?._id || student.batch));
    
    // Calculate Analytics
    let presentCount = 0;
    let markedCount = 0;
    
    studentSchedules.forEach((s: any) => {
      const record = s.attendance?.find((a: any) => (a.studentId?._id || a.studentId) === student._id);
      if (record) {
        markedCount++;
        if (record.isPresent) presentCount++;
      }
    });

    const attendanceRate = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0;

    return {
      ...student,
      schedules: studentSchedules,
      stats: { total: studentSchedules.length, marked: markedCount, present: presentCount, rate: attendanceRate }
    };
  }).filter((s: any) => s.schedules.length > 0);

  let globalTotal = 0;
  let globalMarked = 0;
  let globalPresent = 0;

  studentsWithSchedules.forEach((s: any) => {
    globalTotal += s.stats.total;
    globalMarked += s.stats.marked;
    globalPresent += s.stats.present;
  });

  const globalRate = globalMarked > 0 ? Math.round((globalPresent / globalMarked) * 100) : 0;

  const displayedStudents = selectedStudentId 
    ? studentsWithSchedules.filter((s: any) => s._id === selectedStudentId)
    : studentsWithSchedules;

  return (
    <div className="flex flex-col gap-6 h-full max-w-6xl mx-auto pb-10 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0 px-2">
        <div>
          <h1 className="text-3xl font-bold text-white">Attendance Unified View</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Everything in one place. Mark and view attendance history per student seamlessly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 cursor-pointer bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition-colors">
            <input 
              type="checkbox" 
              checked={isEditMode}
              onChange={(e) => setIsEditMode(e.target.checked)}
              className="accent-amber-500 w-4 h-4 cursor-pointer"
            />
            {isEditMode ? <Edit2 className="w-4 h-4 text-amber-500" /> : <Lock className="w-4 h-4 text-neutral-500" />}
            Edit Mode
          </label>
        </div>
      </div>

      {/* Global Analytics & Filter */}
      <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl flex flex-col lg:flex-row gap-6 shrink-0 relative z-10">
        
        {/* Global Analytics */}
        <div className="flex-1 flex items-center justify-between bg-neutral-950/50 px-6 py-4 rounded-2xl border border-neutral-800/50">
          <div className="text-center flex-1">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Total Classes</p>
            <p className="text-2xl font-bold text-white">{globalTotal}</p>
          </div>
          <div className="w-px h-10 bg-neutral-800"></div>
          <div className="text-center flex-1">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Total Present</p>
            <p className="text-2xl font-bold text-emerald-400">{globalPresent}</p>
          </div>
          <div className="w-px h-10 bg-neutral-800"></div>
          <div className="text-center flex-1">
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Overall Rate</p>
            <p className={`text-2xl font-bold ${globalRate >= 75 ? 'text-emerald-400' : globalRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {globalRate}%
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="lg:w-1/3 flex flex-col justify-center">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-300 mb-2">
            <Users className="w-4 h-4 text-amber-500" /> Filter by Student
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-500 transition-all"
          >
            <option value="">All Students</option>
            {studentsWithSchedules.map((s: any) => (
              <option key={s._id} value={s._id}>{s.name} ({s.batch?.name || 'Unknown Batch'})</option>
            ))}
          </select>
        </div>
      </div>

      {displayedStudents.length === 0 ? (
        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-3xl flex flex-col items-center justify-center text-center p-12">
          <div className="w-20 h-20 bg-neutral-800/50 rounded-full flex items-center justify-center mb-6">
            <Users className="w-10 h-10 text-neutral-600" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">No Classes Found</h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto">
            There are currently no completed classes in the system that require attendance marking for the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {displayedStudents.map((student: any) => (
            <motion.div 
              key={student._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl"
            >
              {/* Student Header */}
              <div className="bg-neutral-800/40 p-6 border-b border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 text-2xl font-bold shrink-0 border border-amber-500/20">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{student.name}</h2>
                    <p className="text-neutral-400 text-sm font-medium mt-1">Batch: {student.batch?.name || 'Unknown Batch'}</p>
                  </div>
                </div>

                {/* Analytics Block */}
                <div className="flex items-center gap-6 bg-neutral-950/50 px-6 py-4 rounded-2xl border border-neutral-800/50">
                  <div className="text-center">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Classes</p>
                    <p className="text-xl font-bold text-white">{student.stats.total}</p>
                  </div>
                  <div className="w-px h-8 bg-neutral-800"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Present</p>
                    <p className="text-xl font-bold text-emerald-400">{student.stats.present}</p>
                  </div>
                  <div className="w-px h-8 bg-neutral-800"></div>
                  <div className="text-center">
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Attendance</p>
                    <p className={`text-xl font-bold ${student.stats.rate >= 75 ? 'text-emerald-400' : student.stats.rate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {student.stats.rate}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Schedules Grid */}
              <div className="p-6">
                <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {student.schedules.map((schedule: any) => {
                    const record = schedule.attendance?.find((a: any) => (a.studentId?._id || a.studentId) === student._id);
                    const isMarked = !!record;
                    const isPresent = record?.isPresent;
                    const isSaving = savingScheduleId === schedule._id;

                    return (
                      <div 
                        key={schedule._id} 
                        className={`relative p-5 rounded-2xl border transition-all duration-200 group ${
                          !isMarked 
                            ? 'bg-neutral-800/30 border-neutral-700/50 hover:bg-neutral-800/50' 
                            : isPresent 
                              ? 'bg-emerald-500/5 border-emerald-500/20' 
                              : 'bg-red-500/5 border-red-500/20'
                        }`}
                      >
                        {/* Status Label */}
                        <div className="absolute top-4 right-4">
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                          ) : !isMarked ? (
                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse" title="Needs Marking"></div>
                          ) : isPresent ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                        </div>

                        {/* Date & Time */}
                        <div className="mb-4 pr-6">
                          <p className="text-white font-bold text-lg">{format(parseISO(schedule.date), "MMM d, yyyy")}</p>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1 font-medium">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            {schedule.startTime} - {schedule.endTime}
                          </div>
                          <p className="text-[11px] text-neutral-500 uppercase font-bold mt-2 tracking-wider">{schedule.subject}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-auto">
                          {isEditMode ? (
                            <>
                              <button
                                disabled={isSaving}
                                onClick={() => handleToggleAttendance(schedule, student._id, true)}
                                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 ${
                                  isMarked && isPresent
                                    ? 'bg-emerald-500 text-black border-emerald-500'
                                    : 'bg-transparent text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                                }`}
                              >
                                {isMarked && isPresent ? "Present" : "Mark Present"}
                              </button>
                              <button
                                disabled={isSaving}
                                onClick={() => handleToggleAttendance(schedule, student._id, false)}
                                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all disabled:opacity-50 ${
                                  isMarked && !isPresent
                                    ? 'bg-red-500 text-white border-red-500'
                                    : 'bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10'
                                }`}
                              >
                                {isMarked && !isPresent ? "Absent" : "Mark Absent"}
                              </button>
                            </>
                          ) : (
                            <div className={`flex-1 py-2 text-center text-xs font-bold rounded-xl border ${
                              !isMarked 
                                ? 'bg-neutral-800/50 text-neutral-400 border-neutral-700/50' 
                                : isPresent 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                  : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}>
                              {!isMarked ? "Not Marked" : isPresent ? "Present" : "Absent"}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
