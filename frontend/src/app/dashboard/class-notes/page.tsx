"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion } from "framer-motion";
import { Search, BookOpen, Clock, CheckCircle, FileText, ChevronRight } from "lucide-react";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";

export default function ClassNotesPage() {
  const { user } = useAuthStore();
  const { searchQuery, setSearchQuery } = useSearchStore();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules-completed"],
    queryFn: async () => (await api.get("/schedules")).data,
  });

  const completedClasses = schedules.filter((s: any) => {
    if (s.status !== "Completed" || (!s.notes && !s.subject)) return false;
    if (!searchQuery) return true;
    
    const lowerSearch = searchQuery.toLowerCase();
    return (
      (s.teacher?.name || "").toLowerCase().includes(lowerSearch) ||
      (s.batch?.name || "").toLowerCase().includes(lowerSearch) ||
      (s.subject || "").toLowerCase().includes(lowerSearch)
    );
  }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (user?.role === "Teacher") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <FileText className="w-12 h-12 mb-4 text-neutral-600" />
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p>This view is only available to administrators.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Completed Class Notes</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            Review subjects taught and remarks submitted by teachers.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
          />
        </div>
      </div>

      {/* List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-neutral-500">Loading completed classes...</p>
            </div>
          ) : completedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 bg-neutral-800/50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-neutral-600" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No notes found</h3>
              <p className="text-neutral-400 text-sm max-w-sm">
                No completed classes with notes match your search. Teachers can add notes from their schedule view.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-4">
              {completedClasses.map((cls: any, i: number) => (
                <motion.div
                  key={cls._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 hover:bg-neutral-800/60 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column: Metadata */}
                    <div className="lg:w-1/3 space-y-4 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center text-black font-bold shrink-0">
                          {cls.teacher?.name?.charAt(0) || "T"}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">{cls.teacher?.name || "Unknown Teacher"}</h4>
                          <p className="text-xs text-amber-400 font-medium">
                            {cls.batch?.name}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-800/60">
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Date</p>
                          <p className="text-sm text-neutral-300">
                            {cls.date ? format(parseISO(cls.date), "MMM d, yyyy") : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Time</p>
                          <div className="flex items-center gap-1.5 text-sm text-neutral-300">
                            <Clock className="w-3.5 h-3.5 text-neutral-500" />
                            {cls.startTime} – {cls.endTime}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Notes */}
                    <div className="lg:w-2/3 flex flex-col justify-center space-y-4 pl-0 lg:pl-6 lg:border-l border-neutral-800/60">
                      <div>
                        <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1.5 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" /> Topic Covered
                        </p>
                        <p className="text-sm text-white font-medium bg-neutral-900/50 p-2.5 rounded-lg border border-neutral-800/80 inline-block">
                          {cls.subject || "No topic specified"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1.5 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Remarks & Notes
                        </p>
                        <div className="text-sm text-neutral-300 bg-neutral-900/50 p-3.5 rounded-xl border border-neutral-800/80 leading-relaxed min-h-[60px]">
                          {cls.notes ? (
                            <span className="whitespace-pre-wrap">{cls.notes}</span>
                          ) : (
                            <span className="text-neutral-600 italic">No additional remarks provided.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
