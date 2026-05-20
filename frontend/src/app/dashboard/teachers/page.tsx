"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Copy, Check, X, UserPlus, RefreshCw, Users, Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useSearchStore } from "@/store/searchStore";

function generatePassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function TeachersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role === "Teacher") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    tempPassword: generatePassword(),
  });

  const { data: teachers, isLoading } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data,
  });

  const { searchQuery } = useSearchStore();

  const filteredTeachers = teachers?.filter((t: any) => {
    if (!searchQuery) return true;
    const lowerSearch = searchQuery.toLowerCase();
    return (
      (t.name || "").toLowerCase().includes(lowerSearch) ||
      (t.email || "").toLowerCase().includes(lowerSearch) ||
      (t.subjectExpertise || []).some((s: string) => s.toLowerCase().includes(lowerSearch))
    );
  }) || [];

  const createTeacher = useMutation({
    mutationFn: async (data: typeof formData) =>
      (await api.post("/auth/create-teacher", {
        name: data.name,
        email: data.email,
        phone: data.phone,
        tempPassword: data.tempPassword,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      setCreatedCreds({ email: formData.email, tempPassword: formData.tempPassword });
      setIsModalOpen(false);
      setFormData({ name: "", email: "", phone: "", tempPassword: generatePassword() });
    },
  });

  const deleteTeacher = useMutation({
    mutationFn: async (id: string) => api.delete(`/teachers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teachers"] }),
  });

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statusColor = (status: string) => {
    if (status === "Available") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (status === "Busy") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-neutral-700/50 text-neutral-400 border-neutral-600/30";
  };

  if (user && user.role === "Teacher") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Teachers</h1>
          <p className="text-neutral-400 text-sm mt-0.5">Manage teaching staff and access credentials</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/20"
        >
          <UserPlus className="w-4 h-4" /> Add Teacher
        </button>
      </div>

      {/* Credentials Banner */}
      <AnimatePresence>
        {createdCreds && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex items-start justify-between gap-4"
          >
            <div className="flex-1">
              <p className="font-semibold text-amber-400 mb-1">✅ Teacher account created!</p>
              <p className="text-sm text-neutral-300 mb-3">Share these credentials with the teacher. Password is visible in the table below.</p>
              <div className="flex flex-wrap gap-3">
                <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <span className="text-neutral-500 text-xs block mb-0.5">Email</span>
                  <span className="text-white font-mono">{createdCreds.email}</span>
                </div>
                <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <span className="text-neutral-500 text-xs block mb-0.5">Temp Password</span>
                  <span className="text-amber-400 font-mono font-semibold">{createdCreds.tempPassword}</span>
                </div>
                <button
                  onClick={() => handleCopy(`Email: ${createdCreds.email}\nPassword: ${createdCreds.tempPassword}`, "banner")}
                  className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-white transition-colors"
                >
                  {copied === "banner" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied === "banner" ? "Copied!" : "Copy All"}
                </button>
              </div>
            </div>
            <button onClick={() => setCreatedCreds(null)} className="text-neutral-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teachers Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-neutral-500">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading teachers...
          </div>
        ) : !filteredTeachers?.length ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-neutral-600" />
            </div>
            <p className="text-neutral-400 font-medium">No teachers found</p>
            <p className="text-neutral-600 text-sm mt-1">Try adjusting your search criteria</p>
            {!searchQuery && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 px-4 py-2 brand-gradient text-black font-semibold rounded-lg text-sm hover:opacity-90"
              >
                Add Teacher
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wider">
                <th className="py-3.5 px-5 font-medium text-left">Name</th>
                <th className="py-3.5 px-5 font-medium text-left">Email</th>
                <th className="py-3.5 px-5 font-medium text-left">Status</th>
                <th className="py-3.5 px-5 font-medium text-left">Subjects</th>
                <th className="py-3.5 px-5 font-medium text-left">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" /> Password
                  </span>
                </th>
                <th className="py-3.5 px-5 font-medium text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {filteredTeachers.map((teacher: any) => {
                const isRevealed = revealedIds.has(teacher._id);
                const hasPassword = !!teacher.tempPassword;
                return (
                  <tr key={teacher._id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                          {teacher.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{teacher.name}</p>
                          <p className="text-xs text-neutral-500">{teacher.experience ? `${teacher.experience} yrs exp` : "New"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-neutral-400">{teacher.email}</td>
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(teacher.status)}`}>
                        {teacher.status || "Available"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex flex-wrap gap-1">
                        {teacher.subjectExpertise?.slice(0, 2).map((s: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-neutral-800 text-neutral-300 text-xs rounded-md border border-neutral-700">{s}</span>
                        )) || <span className="text-neutral-600 text-xs">—</span>}
                      </div>
                    </td>

                    {/* Password Cell */}
                    <td className="py-3.5 px-5">
                      {hasPassword ? (
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 ${isRevealed ? "text-amber-400" : "text-neutral-700"}`}>
                            {isRevealed ? teacher.tempPassword : "••••••••••"}
                          </span>
                          <button
                            onClick={() => toggleReveal(teacher._id)}
                            className="p-1.5 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 hover:text-white"
                            title={isRevealed ? "Hide" : "Reveal"}
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleCopy(teacher.tempPassword, teacher._id)}
                            className="p-1.5 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-500 hover:text-amber-400"
                            title="Copy password"
                          >
                            {copied === teacher._id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-600 text-xs italic">Not set</span>
                      )}
                    </td>

                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => deleteTeacher.mutate(teacher._id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-neutral-600 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Teacher Modal */}
      <AnimatePresence>
        {isModalOpen && (
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
              transition={{ duration: 0.15 }}
              className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-neutral-800">
                <h2 className="text-lg font-bold text-white">Add New Teacher</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); createTeacher.mutate(formData); }}
                className="p-6 space-y-4"
              >
                {[
                  { label: "Full Name", key: "name", type: "text", placeholder: "e.g. Sarah Jenkins" },
                  { label: "Email Address", key: "email", type: "email", placeholder: "sarah@school.edu" },
                  { label: "Phone (optional)", key: "phone", type: "tel", placeholder: "+91 98765 43210" },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">{field.label}</label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={(formData as any)[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      required={field.key !== "phone"}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-neutral-600"
                    />
                  </div>
                ))}

                {/* Temp Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-neutral-300">Temporary Password</label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, tempPassword: generatePassword() })}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.tempPassword}
                      onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                      className="w-full bg-neutral-800 border border-amber-500/30 rounded-xl px-3 py-2.5 pr-10 text-sm text-amber-400 font-mono outline-none focus:border-amber-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(formData.tempPassword, "modal")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-amber-400"
                    >
                      {copied === "modal" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Auto-generated. Teacher must change it on first login.</p>
                </div>

                {createTeacher.isError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {(createTeacher.error as any)?.response?.data?.message || "Failed to create teacher"}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTeacher.isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {createTeacher.isPending ? (
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Creating...</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Create Account</>
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
