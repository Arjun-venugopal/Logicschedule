"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Plus, Trash2, Edit2, CheckCircle2, AlertCircle, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "schedule", label: "Schedule" },
  { key: "batches", label: "Batches" },
  { key: "teachers", label: "Teachers" },
  { key: "students", label: "Students" },
  { key: "demoSessions", label: "Demo Sessions" },
  { key: "classNotes", label: "Class Notes" },
  { key: "attendance", label: "Attendance" },
  { key: "settings", label: "Settings" }
];

const DEFAULT_PERMISSIONS = MODULES.reduce((acc, mod) => ({
  ...acc,
  [mod.key]: { read: false, write: false }
}), {});

export default function SubAdminManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    teacherUserId: "",
    permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
  });

  const [creationMode, setCreationMode] = useState<"new" | "teacher">("new");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/teachers")).data
  });

  const { data: subAdmins, isLoading, refetch } = useQuery({
    queryKey: ["sub-admins"],
    queryFn: async () => (await api.get("/users/sub-admins")).data
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/users/sub-admins", data),
    onSuccess: () => {
      refetch();
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || "Failed to create sub admin");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string, payload: any }) => api.put(`/users/sub-admins/${data.id}`, data.payload),
    onSuccess: () => {
      refetch();
      closeModal();
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || "Failed to update sub admin");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/sub-admins/${id}`),
    onSuccess: () => refetch()
  });

  const openCreateModal = () => {
    setEditingId(null);
    setCreationMode("new");
    setFormData({
      name: "",
      email: "",
      password: "",
      teacherUserId: "",
      permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (admin: any) => {
    setEditingId(admin._id);
    setFormData({
      name: admin.name,
      email: admin.email,
      password: "", // Leave blank unless they want to change it
      teacherUserId: "",
      permissions: { ...DEFAULT_PERMISSIONS, ...admin.permissions }
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      const payload: any = { name: formData.name, email: formData.email, permissions: formData.permissions };
      if (formData.password) payload.password = formData.password;
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handlePermissionChange = (moduleKey: string, type: 'read' | 'write', value: boolean) => {
    setFormData(prev => {
      const newPerms = { ...prev.permissions };
      newPerms[moduleKey] = { ...newPerms[moduleKey], [type]: value };
      
      // If write is checked, automatically check read
      if (type === 'write' && value) {
        newPerms[moduleKey].read = true;
      }
      // If read is unchecked, automatically uncheck write
      if (type === 'read' && !value) {
        newPerms[moduleKey].write = false;
      }
      
      return { ...prev, permissions: newPerms };
    });
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Sub Admins Management
          </h3>
          <p className="text-xs text-neutral-400 mt-1">Manage sub admins and their read/write permissions.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Sub Admin
        </button>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-neutral-500 text-sm">Loading sub admins...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900 border-b border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Created At</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {subAdmins?.map((admin: any) => (
                <tr key={admin._id} className="hover:bg-neutral-800/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{admin.name}</td>
                  <td className="px-4 py-3 text-neutral-400">{admin.email}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {new Date(admin.createdAt?._seconds ? admin.createdAt._seconds * 1000 : admin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(admin)}
                      className="p-1.5 text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this sub admin?')) {
                          deleteMutation.mutate(admin._id);
                        }
                      }}
                      className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!subAdmins || subAdmins.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No sub admins found. Click 'Add Sub Admin' to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-neutral-800 shrink-0">
                <h2 className="text-xl font-bold text-white">
                  {editingId ? "Edit Sub Admin" : "Create Sub Admin"}
                </h2>
              </div>

              <div className="p-6 overflow-y-auto">
                {formError && (
                  <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {formError}
                  </div>
                )}

                <form id="subAdminForm" onSubmit={handleSubmit} className="space-y-6">
                  {!editingId && (
                    <div className="flex gap-4 p-1 bg-neutral-950 rounded-xl mb-4 w-max">
                      <button
                        type="button"
                        onClick={() => {
                          setCreationMode("new");
                          setFormData({ ...formData, teacherUserId: "" });
                        }}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${creationMode === "new" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                      >
                        Create New Account
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreationMode("teacher");
                          setFormData({ ...formData, name: "", email: "", password: "" });
                        }}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${creationMode === "teacher" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                      >
                        Assign Existing Teacher
                      </button>
                    </div>
                  )}

                  {creationMode === "teacher" && !editingId ? (
                    <div className="space-y-1.5 max-w-md">
                      <label className="text-sm font-medium text-neutral-300">Select Teacher</label>
                      <select
                        required
                        value={formData.teacherUserId}
                        onChange={(e) => setFormData({ ...formData, teacherUserId: e.target.value })}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                      >
                        <option value="">-- Select a Teacher --</option>
                        {teachers?.filter((t: any) => t.user?.role === "Teacher").map((t: any) => (
                          <option key={t._id} value={t.user?._id}>{t.name} ({t.email})</option>
                        ))}
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">This teacher will keep their schedule but will now access the Admin portal with Sub Admin privileges.</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Name</label>
                        <input
                          required
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Email</label>
                        <input
                          required
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-neutral-300">
                          Password {editingId && <span className="text-neutral-500 text-xs">(Leave blank to keep current)</span>}
                        </label>
                        <input
                          required={!editingId}
                          type="text"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-500 transition-all"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-white font-medium mb-3">Module Permissions</h4>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-900 border-b border-neutral-800">
                          <tr>
                            <th className="px-4 py-2 font-medium text-neutral-400">Module</th>
                            <th className="px-4 py-2 font-medium text-neutral-400 text-center">Read</th>
                            <th className="px-4 py-2 font-medium text-neutral-400 text-center">Write</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          {MODULES.map(mod => (
                            <tr key={mod.key} className="hover:bg-neutral-900/50">
                              <td className="px-4 py-2.5 text-neutral-300">{mod.label}</td>
                              <td className="px-4 py-2.5 text-center">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 accent-amber-500"
                                  checked={formData.permissions[mod.key as keyof typeof formData.permissions].read}
                                  onChange={(e) => handlePermissionChange(mod.key, 'read', e.target.checked)}
                                />
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 accent-amber-500"
                                  checked={formData.permissions[mod.key as keyof typeof formData.permissions].write}
                                  onChange={(e) => handlePermissionChange(mod.key, 'write', e.target.checked)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-6 border-t border-neutral-800 shrink-0 flex justify-end gap-3 bg-neutral-900">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="subAdminForm"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 text-sm font-semibold brand-gradient text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Sub Admin"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
