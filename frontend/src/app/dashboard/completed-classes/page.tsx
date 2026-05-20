"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CheckCircle, FileText, Clock, Edit2, X, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { format, parseISO, isBefore } from "date-fns";
import { useAuthStore } from "@/store/authStore";
import { useSearchStore } from "@/store/searchStore";

export default function CompletedClassesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { searchQuery, setSearchQuery } = useSearchStore();
  const [modal, setModal] = useState<any>(null);
  
  const [form, setForm] = useState({
    subject: "",
    notes: "",
    status: "Completed",
  });

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => (await api.get("/schedules")).data,
  });

  const updateSchedule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/schedules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setModal(null);
    },
  });

  // Filter schedules that are completed OR in the past (to let teachers mark them as completed)
  const pastOrCompletedClasses = schedules.filter((s: any) => {
    // A schedule is considered past if its date is before today, 
    // or if it's already marked as Completed.
    const isPast = isBefore(new Date(s.date), new Date(new Date().setHours(0,0,0,0)));
    const isCompleted = s.status === "Completed";
    
    if (!isPast && !isCompleted) return false;

    // Apply search filter
    if (!searchQuery) return true;
    const lowerSearch = searchQuery.toLowerCase();
    return (
      (s.batch?.name || "").toLowerCase().includes(lowerSearch) ||
      (s.subject || "").toLowerCase().includes(lowerSearch)
    );
  }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (user?.role !== "Teacher") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <AlertTriangle className="w-12 h-12 mb-4 text-amber-500" />
        <h2 className="text-xl font-bold text-white mb-2">Teacher Only</h2>
        <p>This view is specifically designed for teachers to manage their completed classes.</p>
      </div>
    );
  }

  const openEdit = (cls: any) => {
    setForm({
      subject: cls.subject || "",
      notes: cls.notes || "",
      status: "Completed",
    });
    setModal(cls);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modal) {
      updateSchedule.mutate({
        id: modal._id,
        data: {
          ...form,
          // Explicitly set status to completed if they are adding a note
          status: "Completed"
        }
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Completed Classes</h1>
          <p className="text-neutral-400 text-sm mt-0.5">
            View your past classes and add remarks or topics covered.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Search classes..."
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
              <p className="text-sm text-neutral-500">Loading your classes...</p>
            </div>
          ) : pastOrCompletedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 bg-neutral-800/50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-neutral-600" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No past classes yet</h3>
              <p className="text-neutral-400 text-sm max-w-sm">
                Classes that have passed their scheduled date or marked as completed will appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 p-4">
              {pastOrCompletedClasses.map((cls: any, i: number) => (
                <motion.div
                  key={cls._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 hover:bg-neutral-800/60 transition-colors flex flex-col md:flex-row justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-col">
                      <h4 className="font-semibold text-white text-base">{cls.batch?.name || "Unknown Batch"}</h4>
                      <p className="text-xs text-amber-400 font-medium">
                        {cls.subject || "No topic specified"}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
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

                  <div className="flex flex-col justify-between items-start md:items-end gap-3 md:w-1/2">
                    <div className="w-full">
                      <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Notes</p>
                      <div className="text-sm text-neutral-300 bg-neutral-900/50 p-3 rounded-lg border border-neutral-800/80 min-h-[44px] w-full line-clamp-2">
                        {cls.notes ? cls.notes : <span className="text-neutral-600 italic">No notes added yet.</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => openEdit(cls)}
                      className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors border border-neutral-700 hover:border-neutral-600 shrink-0"
                    >
                      <Edit2 className="w-4 h-4" />
                      {cls.notes ? "Edit Note" : "Add Note"}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                <h2 className="text-lg font-bold text-white">Add Class Notes</h2>
                <button onClick={() => setModal(null)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="p-4 bg-neutral-800/40 rounded-xl border border-neutral-800 mb-2">
                  <p className="text-sm font-medium text-white mb-1">
                    {modal.batch?.name}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {modal.date ? format(parseISO(modal.date), "MMM d, yyyy") : ""} at {modal.startTime}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Subject / Topic Covered <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600"
                    placeholder="e.g. Loops and Arrays"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Class Remarks / Notes
                  </label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 transition-all placeholder-neutral-600 resize-none"
                    placeholder="Describe student performance, assignments, etc."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateSchedule.isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {updateSchedule.isPending ? (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Save Notes</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
