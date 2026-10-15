"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Plus, Trash2, Edit2, AlertCircle, ShieldAlert, CheckCheck, X, ShieldCheck, Check, Sliders } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const MODULES = [
  { key: "dashboard", label: "Dashboard", description: "Overview stats & analytics" },
  { key: "schedule", label: "Schedule", description: "Timetable & live schedules" },
  { key: "batches", label: "Batches", description: "Classes & batch management" },
  { key: "teachers", label: "Teachers", description: "Teacher profiles & timings" },
  { key: "students", label: "Students", description: "Student directory & roster" },
  { key: "salesPeople", label: "Sales People", description: "Sales team management" },
  { key: "demoSessions", label: "Demo Sessions", description: "Trial & demo booking classes" },
  { key: "completedClasses", label: "Completed Classes", description: "Finished class records" },
  { key: "classNotes", label: "Class Notes", description: "Teacher remarks & session notes" },
  { key: "attendance", label: "Attendance", description: "Student attendance records" },
  { key: "payments", label: "Fees & Payments", description: "Fees, payments & invoices" },
  { key: "performance", label: "Performance", description: "Teacher & academic performance" },
  { key: "settings", label: "Settings", description: "System configuration & sub-admins" }
];

export const DEFAULT_PERMISSIONS: Record<string, { read: boolean; write: boolean }> = MODULES.reduce((acc, mod) => ({
  ...acc,
  [mod.key]: { read: false, write: false }
}), {});

export default function SubAdminManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkPermissions, setBulkPermissions] = useState<Record<string, { read: boolean; write: boolean }>>(
    JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS))
  );
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
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
      setSuccessMessage("Sub Admin created successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
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
      setSuccessMessage("Sub Admin updated successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || "Failed to update sub admin");
    }
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (perms: any) => api.put("/users/sub-admins/bulk-permissions", { permissions: perms }),
    onSuccess: (res: any) => {
      refetch();
      setIsBulkModalOpen(false);
      setSuccessMessage(res.data?.message || "Successfully updated permissions across all sub admins!");
      setTimeout(() => setSuccessMessage(null), 5000);
    },
    onError: (err: any) => {
      setBulkError(err.response?.data?.message || "Failed to bulk update sub admins");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/sub-admins/${id}`),
    onSuccess: () => {
      refetch();
      setSuccessMessage("Sub Admin removed successfully!");
      setTimeout(() => setSuccessMessage(null), 4000);
    }
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
      permissions: { ...DEFAULT_PERMISSIONS, ...(admin.permissions || {}) }
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

  // Permission toggles for Single Form
  const handlePermissionChange = (moduleKey: string, type: 'read' | 'write', value: boolean) => {
    setFormData(prev => {
      const newPerms = { ...prev.permissions };
      newPerms[moduleKey] = { ...newPerms[moduleKey], [type]: value };
      
      if (type === 'write' && value) {
        newPerms[moduleKey].read = true;
      }
      if (type === 'read' && !value) {
        newPerms[moduleKey].write = false;
      }
      
      return { ...prev, permissions: newPerms };
    });
  };

  const handleSelectAllRead = (checked: boolean) => {
    setFormData(prev => {
      const newPerms = { ...prev.permissions };
      MODULES.forEach(mod => {
        newPerms[mod.key] = {
          read: checked,
          write: checked ? (newPerms[mod.key]?.write || false) : false
        };
      });
      return { ...prev, permissions: newPerms };
    });
  };

  const handleSelectAllWrite = (checked: boolean) => {
    setFormData(prev => {
      const newPerms = { ...prev.permissions };
      MODULES.forEach(mod => {
        newPerms[mod.key] = {
          read: checked ? true : (newPerms[mod.key]?.read || false),
          write: checked
        };
      });
      return { ...prev, permissions: newPerms };
    });
  };

  const handleGrantAll = () => {
    const newPerms: Record<string, { read: boolean; write: boolean }> = {};
    MODULES.forEach(mod => {
      newPerms[mod.key] = { read: true, write: true };
    });
    setFormData(prev => ({ ...prev, permissions: newPerms }));
  };

  const handleGrantReadOnlyAll = () => {
    const newPerms: Record<string, { read: boolean; write: boolean }> = {};
    MODULES.forEach(mod => {
      newPerms[mod.key] = { read: true, write: false };
    });
    setFormData(prev => ({ ...prev, permissions: newPerms }));
  };

  const handleClearAll = () => {
    const newPerms: Record<string, { read: boolean; write: boolean }> = {};
    MODULES.forEach(mod => {
      newPerms[mod.key] = { read: false, write: false };
    });
    setFormData(prev => ({ ...prev, permissions: newPerms }));
  };

  // Bulk modal permission handlers
  const handleBulkPermissionChange = (moduleKey: string, type: 'read' | 'write', value: boolean) => {
    setBulkPermissions(prev => {
      const newPerms = { ...prev };
      newPerms[moduleKey] = { ...newPerms[moduleKey], [type]: value };
      if (type === 'write' && value) newPerms[moduleKey].read = true;
      if (type === 'read' && !value) newPerms[moduleKey].write = false;
      return newPerms;
    });
  };

  const handleBulkSelectAllRead = (checked: boolean) => {
    setBulkPermissions(prev => {
      const newPerms = { ...prev };
      MODULES.forEach(mod => {
        newPerms[mod.key] = {
          read: checked,
          write: checked ? (newPerms[mod.key]?.write || false) : false
        };
      });
      return newPerms;
    });
  };

  const handleBulkSelectAllWrite = (checked: boolean) => {
    setBulkPermissions(prev => {
      const newPerms = { ...prev };
      MODULES.forEach(mod => {
        newPerms[mod.key] = {
          read: checked ? true : (newPerms[mod.key]?.read || false),
          write: checked
        };
      });
      return newPerms;
    });
  };

  const handleBulkGrantAll = () => {
    const newPerms: Record<string, { read: boolean; write: boolean }> = {};
    MODULES.forEach(mod => {
      newPerms[mod.key] = { read: true, write: true };
    });
    setBulkPermissions(newPerms);
  };

  const handleBulkClearAll = () => {
    const newPerms: Record<string, { read: boolean; write: boolean }> = {};
    MODULES.forEach(mod => {
      newPerms[mod.key] = { read: false, write: false };
    });
    setBulkPermissions(newPerms);
  };

  const allReadChecked = MODULES.every(mod => formData.permissions[mod.key]?.read);
  const allWriteChecked = MODULES.every(mod => formData.permissions[mod.key]?.write);

  const bulkAllReadChecked = MODULES.every(mod => bulkPermissions[mod.key]?.read);
  const bulkAllWriteChecked = MODULES.every(mod => bulkPermissions[mod.key]?.write);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-4">
      {/* Success Notification */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 text-emerald-400 text-sm"
        >
          <Check className="w-4 h-4 shrink-0" />
          {successMessage}
        </motion.div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Sub Admins Management
          </h3>
          <p className="text-xs text-neutral-400 mt-1">Manage sub admin roles and module permissions across all sections.</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setBulkPermissions(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)));
              setBulkError(null);
              setIsBulkModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-800 border border-neutral-700 hover:border-amber-500/50 text-neutral-200 font-semibold rounded-xl text-sm transition-all"
            title="Update permissions for all existing sub admins at once"
          >
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            Update All Sub Admins
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-black font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity justify-center shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Sub Admin
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-neutral-500 text-sm">Loading sub admins...</div>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-[500px]">
            <thead className="text-xs text-neutral-400 uppercase bg-neutral-900 border-b border-neutral-800">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Access Granted</th>
                <th className="px-4 py-3 font-medium">Created At</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {subAdmins?.map((admin: any) => {
                const perms = admin.permissions || {};
                const readCount = MODULES.filter(m => perms[m.key]?.read).length;
                const writeCount = MODULES.filter(m => perms[m.key]?.write).length;

                return (
                  <tr key={admin._id} className="hover:bg-neutral-800/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{admin.name}</td>
                    <td className="px-4 py-3 text-neutral-400">{admin.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300">
                        {readCount}/{MODULES.length} Read · {writeCount} Write
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {new Date(admin.createdAt?._seconds ? admin.createdAt._seconds * 1000 : admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEditModal(admin)}
                        className="p-1.5 text-neutral-400 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                        title="Edit sub admin permissions"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${admin.name}?`)) {
                            deleteMutation.mutate(admin._id);
                          }
                        }}
                        className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete sub admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!subAdmins || subAdmins.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    No sub admins found. Click 'Add Sub Admin' to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create or Edit Single Sub Admin */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-4 sm:p-6 border-b border-neutral-800 shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    {editingId ? "Edit Sub Admin Permissions" : "Create Sub Admin"}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">Configure access rights across all modules and sessions.</p>
                </div>
                <button onClick={closeModal} className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
                {formError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {formError}
                  </div>
                )}

                <form id="subAdminForm" onSubmit={handleSubmit} className="space-y-6">
                  {!editingId && (
                    <div className="flex flex-wrap gap-2 sm:gap-4 p-1 bg-neutral-950 rounded-xl mb-4 w-full sm:w-max">
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

                  {/* Module Permissions with Bulk Select All Controls */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <h4 className="text-white font-medium text-sm sm:text-base">Module Permissions</h4>
                        <p className="text-xs text-neutral-400">Configure read and write permissions across all sessions & sections</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleGrantAll}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleGrantReadOnlyAll}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          Read Only All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAll}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white hover:bg-neutral-700 transition-colors flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Clear All
                        </button>
                      </div>
                    </div>

                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden overflow-x-auto shadow-inner">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-900 border-b border-neutral-800">
                          <tr>
                            <th className="px-4 py-2.5 font-medium text-neutral-400">
                              Module ({MODULES.length})
                            </th>
                            <th className="px-4 py-2.5 font-medium text-neutral-400 text-center w-28">
                              <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                                  checked={allReadChecked}
                                  onChange={(e) => handleSelectAllRead(e.target.checked)}
                                />
                                <span>Read All</span>
                              </label>
                            </th>
                            <th className="px-4 py-2.5 font-medium text-neutral-400 text-center w-28">
                              <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                                  checked={allWriteChecked}
                                  onChange={(e) => handleSelectAllWrite(e.target.checked)}
                                />
                                <span>Write All</span>
                              </label>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          {MODULES.map(mod => {
                            const perms = formData.permissions[mod.key] || { read: false, write: false };

                            return (
                              <tr key={mod.key} className="hover:bg-neutral-900/60 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-neutral-200">{mod.label}</div>
                                  <div className="text-[11px] text-neutral-500">{mod.description}</div>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                                    checked={perms.read || false}
                                    onChange={(e) => handlePermissionChange(mod.key, 'read', e.target.checked)}
                                  />
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                                    checked={perms.write || false}
                                    onChange={(e) => handlePermissionChange(mod.key, 'write', e.target.checked)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </form>
              </div>

              <div className="p-4 sm:p-6 border-t border-neutral-800 shrink-0 flex justify-end gap-3 bg-neutral-900">
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

      {/* Modal: Bulk Update All Sub Admins Permissions */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-4 sm:p-6 border-b border-neutral-800 shrink-0 flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-500" />
                    Bulk Update All Sub Admins Permissions
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    This will apply the selected module permissions to all {subAdmins?.length || 0} sub admin accounts.
                  </p>
                </div>
                <button onClick={() => setIsBulkModalOpen(false)} className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                {bulkError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {bulkError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="text-xs text-neutral-400">Quickly apply access rules across all modules:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleBulkGrantAll}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newPerms: Record<string, { read: boolean; write: boolean }> = {};
                        MODULES.forEach(mod => { newPerms[mod.key] = { read: true, write: false }; });
                        setBulkPermissions(newPerms);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                    >
                      Read Only All
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkClearAll}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-white hover:bg-neutral-700 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Clear All
                    </button>
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden overflow-x-auto shadow-inner">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-neutral-900 border-b border-neutral-800">
                      <tr>
                        <th className="px-4 py-2.5 font-medium text-neutral-400">
                          Module ({MODULES.length})
                        </th>
                        <th className="px-4 py-2.5 font-medium text-neutral-400 text-center w-28">
                          <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-amber-500 cursor-pointer"
                              checked={bulkAllReadChecked}
                              onChange={(e) => handleBulkSelectAllRead(e.target.checked)}
                            />
                            <span>Read All</span>
                          </label>
                        </th>
                        <th className="px-4 py-2.5 font-medium text-neutral-400 text-center w-28">
                          <label className="flex items-center justify-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-amber-500 cursor-pointer"
                              checked={bulkAllWriteChecked}
                              onChange={(e) => handleBulkSelectAllWrite(e.target.checked)}
                            />
                            <span>Write All</span>
                          </label>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {MODULES.map(mod => {
                        const perms = bulkPermissions[mod.key] || { read: false, write: false };

                        return (
                          <tr key={mod.key} className="hover:bg-neutral-900/60 transition-colors">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-neutral-200">{mod.label}</div>
                              <div className="text-[11px] text-neutral-500">{mod.description}</div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 accent-amber-500 cursor-pointer"
                                checked={perms.read || false}
                                onChange={(e) => handleBulkPermissionChange(mod.key, 'read', e.target.checked)}
                              />
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 accent-amber-500 cursor-pointer"
                                checked={perms.write || false}
                                onChange={(e) => handleBulkPermissionChange(mod.key, 'write', e.target.checked)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 sm:p-6 border-t border-neutral-800 shrink-0 flex justify-end gap-3 bg-neutral-900">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-5 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkUpdateMutation.isPending}
                  onClick={() => bulkUpdateMutation.mutate(bulkPermissions)}
                  className="px-5 py-2 text-sm font-semibold brand-gradient text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {bulkUpdateMutation.isPending ? "Updating All..." : `Update All (${subAdmins?.length || 0}) Sub Admins`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
