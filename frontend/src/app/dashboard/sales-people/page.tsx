"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Copy, Check, X, UserPlus, RefreshCw, Users, Eye, EyeOff, KeyRound, Edit2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import { useSearchStore } from "@/store/searchStore";
import { usePermissions } from "@/hooks/usePermissions";

function generatePassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function SalesPeoplePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const router = useRouter();
  const { canWrite, isAdmin, isSuperAdmin } = usePermissions() as any;
  const isSuperAdminOrAdmin = user?.role === "Super Admin" || user?.role === "Admin";
  // Sub Admin might have write access if they have salesPeople.write = true
  const hasWriteAccess = isSuperAdminOrAdmin || canWrite("salesPeople");

  useEffect(() => {
    if (user && user.role === "Teacher") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [editSalesPerson, setEditSalesPerson] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    tempPassword: generatePassword(),
  });

  const { data: salesPeople, isLoading } = useQuery({
    queryKey: ["salesPeople"],
    queryFn: async () => (await api.get("/sales-people")).data,
  });

  const { searchQuery } = useSearchStore();

  const filteredSalesPeople = salesPeople?.filter((sp: any) => {
    if (!searchQuery) return true;
    const lowerSearch = searchQuery.toLowerCase();
    return (
      (sp.name || "").toLowerCase().includes(lowerSearch) ||
      (sp.email || "").toLowerCase().includes(lowerSearch)
    );
  }) || [];

  const createSalesPersonMutation = useMutation({
    mutationFn: async (data: typeof formData) =>
      (await api.post("/sales-people", {
        name: data.name,
        email: data.email,
        password: data.tempPassword,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salesPeople"] });
      setCreatedCreds({ email: formData.email, tempPassword: formData.tempPassword });
      setIsModalOpen(false);
      setFormData({ name: "", email: "", tempPassword: generatePassword() });
    },
  });

  const updateSalesPersonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const payload = { ...data };
      if (!payload.tempPassword) delete payload.password; // Don't update password if empty
      else payload.password = payload.tempPassword;
      return api.put(`/sales-people/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salesPeople"] });
      setEditSalesPerson(null);
      setIsModalOpen(false);
      setFormData({ name: "", email: "", tempPassword: generatePassword() });
    },
  });

  const deleteSalesPersonMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/sales-people/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salesPeople"] }),
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

  const openEditModal = (sp: any) => {
    setEditSalesPerson(sp);
    setFormData({
      name: sp.name || "",
      email: sp.email || "",
      tempPassword: "",
    });
    setIsModalOpen(true);
  };

  if (user && user.role === "Teacher") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales People</h1>
          <p className="text-neutral-400 text-sm mt-0.5">Manage sales executives and access credentials</p>
        </div>
        {hasWriteAccess && (
          <button
            onClick={() => {
              setEditSalesPerson(null);
              setFormData({ name: "", email: "", tempPassword: generatePassword() });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/20"
          >
            <UserPlus className="w-4 h-4" /> Add Sales Person
          </button>
        )}
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
              <p className="font-semibold text-amber-400 mb-1">✅ Sales Person account created!</p>
              <p className="text-sm text-neutral-300 mb-3">
                {isSuperAdminOrAdmin ? "Share these credentials with the sales person. Password is visible in the table below." : "The sales account has been successfully created."}
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm">
                  <span className="text-neutral-500 text-xs block mb-0.5">Email</span>
                  <span className="text-white font-mono">{createdCreds.email}</span>
                </div>
                {isSuperAdminOrAdmin && (
                  <>
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
                  </>
                )}
              </div>
            </div>
            <button onClick={() => setCreatedCreds(null)} className="text-neutral-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sales People Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-neutral-500">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading sales people...
          </div>
        ) : !filteredSalesPeople?.length ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-neutral-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-neutral-600" />
            </div>
            <p className="text-neutral-400 font-medium">No sales people found</p>
            <p className="text-neutral-600 text-sm mt-1">Try adjusting your search criteria</p>
            {!searchQuery && hasWriteAccess && (
              <button
                onClick={() => {
                  setEditSalesPerson(null);
                  setFormData({ name: "", email: "", tempPassword: generatePassword() });
                  setIsModalOpen(true);
                }}
                className="mt-4 px-4 py-2 brand-gradient text-black font-semibold rounded-lg text-sm hover:opacity-90"
              >
                Add Sales Person
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wider">
                <th className="py-3.5 px-5 font-medium text-left">Name</th>
                <th className="py-3.5 px-5 font-medium text-left">Email</th>
                <th className="py-3.5 px-5 font-medium text-left">Role</th>
                {isSuperAdminOrAdmin && (
                  <th className="py-3.5 px-5 font-medium text-left">
                    <span className="flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" /> Password
                    </span>
                  </th>
                )}
                <th className="py-3.5 px-5 font-medium text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {filteredSalesPeople.map((sp: any) => {
                const isRevealed = revealedIds.has(sp._id);
                // The tempPassword field isn't saved in plaintext in the DB, so we can't show it here later.
                // It is only visible right after creation. If needed, Admin can reset it.
                return (
                  <tr key={sp._id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-black shrink-0">
                          {sp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{sp.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-neutral-400">{sp.email}</td>
                    <td className="py-3.5 px-5">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-500/10 text-purple-400 border-purple-500/20">
                        {sp.role}
                      </span>
                    </td>

                    {/* Password Cell */}
                    {isSuperAdminOrAdmin && (
                      <td className="py-3.5 px-5">
                        <span className="text-neutral-600 text-xs italic">Hidden (Use Edit to Reset)</span>
                      </td>
                    )}

                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        {hasWriteAccess && (
                          <>
                            <button
                              onClick={() => openEditModal(sp)}
                              className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors text-neutral-500 hover:text-blue-400"
                              title="Edit Sales Person"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteSalesPersonMutation.mutate(sp._id)}
                              className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-neutral-500 hover:text-red-400"
                              title="Delete Sales Person"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
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
                <h2 className="text-lg font-bold text-white">{editSalesPerson ? "Edit Sales Person" : "Add Sales Person"}</h2>
                <button onClick={() => { setIsModalOpen(false); setEditSalesPerson(null); }} className="text-neutral-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => { 
                  e.preventDefault(); 
                  if (editSalesPerson) {
                    updateSalesPersonMutation.mutate({ id: editSalesPerson._id, data: formData });
                  } else {
                    createSalesPersonMutation.mutate(formData); 
                  }
                }}
                className="p-6 space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Full Name", key: "name", type: "text", placeholder: "e.g. John Doe" },
                    { label: "Email Address", key: "email", type: "email", placeholder: "john@sales.edu" },
                  ].map((field) => (
                    <div key={field.key} className="col-span-2">
                      <label className="block text-sm font-medium text-neutral-300 mb-1.5">{field.label}</label>
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={(formData as any)[field.key]}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        required
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-neutral-600"
                      />
                    </div>
                  ))}
                </div>

                {/* Temp Password */}
                {isSuperAdminOrAdmin && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-neutral-300">
                        {editSalesPerson ? "Reset Password (Leave blank to keep current)" : "Temporary Password"}
                      </label>
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
                    {!editSalesPerson && (
                      <p className="text-xs text-neutral-500 mt-1">Auto-generated. Sales person must change it on first login.</p>
                    )}
                  </div>
                )}

                {(createSalesPersonMutation.isError || updateSalesPersonMutation.isError) && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {editSalesPerson ? 
                      ((updateSalesPersonMutation.error as any)?.response?.data?.message || "Failed to update sales person") : 
                      ((createSalesPersonMutation.error as any)?.response?.data?.message || "Failed to create sales person")
                    }
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setIsModalOpen(false); setEditSalesPerson(null); }}
                    className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSalesPersonMutation.isPending || updateSalesPersonMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl brand-gradient text-black font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {createSalesPersonMutation.isPending || updateSalesPersonMutation.isPending ? (
                      <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> {editSalesPerson ? "Updating..." : "Creating..."}</>
                    ) : (
                      <><Plus className="w-4 h-4" /> {editSalesPerson ? "Update Account" : "Create Account"}</>
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
