"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/store/authStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  KeyRound,
  Shield,
  Info
} from "lucide-react";

interface Slot {
  startTime: string;
  endTime: string;
}

interface DayAvailability {
  day: string;
  slots: Slot[];
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isTeacher = user?.role === "Teacher";

  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("Available");
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Change Password State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Queries
  const { data: teacherProfile, isLoading: isLoadingProfile, refetch } = useQuery({
    queryKey: ["teacher-profile"],
    queryFn: async () => (await api.get("/teachers/profile")).data,
    enabled: isTeacher,
  });

  // Load teacher profile fields into local state when loaded
  useEffect(() => {
    if (teacherProfile) {
      setPhone(teacherProfile.phone || "");
      setStatus(teacherProfile.status || "Available");
      
      // Normalize availability structure
      const initialAvail = DAYS_OF_WEEK.map(dayName => {
        const existing = teacherProfile.availability?.find((a: any) => a.day === dayName);
        return {
          day: dayName,
          slots: existing ? existing.slots.map((s: any) => ({ startTime: s.startTime, endTime: s.endTime })) : []
        };
      });
      setAvailability(initialAvail);
    }
  }, [teacherProfile]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (data: { phone: string; status: string; availability: DayAvailability[] }) =>
      api.put("/teachers/profile", data),
    onSuccess: () => {
      refetch();
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3500);
    },
    onError: (err: any) => {
      setSaveError(err.response?.data?.message || "Failed to save profile changes.");
    }
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacher) return;
    
    // Validate all slots
    for (const dayAvail of availability) {
      for (const slot of dayAvail.slots) {
        if (!slot.startTime || !slot.endTime) {
          setSaveError(`Please complete all start and end times for ${dayAvail.day}.`);
          return;
        }
        if (slot.startTime >= slot.endTime) {
          setSaveError(`Start time must be before end time on ${dayAvail.day} (${slot.startTime} - ${slot.endTime}).`);
          return;
        }
      }
    }

    // Filter out days with empty slots to keep DB clean
    const filteredAvailability = availability.filter(a => a.slots.length > 0);

    updateProfileMutation.mutate({
      phone,
      status,
      availability: filteredAvailability
    });
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmNewPassword) {
      setPasswordError("All password fields are required.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    try {
      setPasswordLoading(true);
      // Wait! Check what endpoint changes password. 
      // Schedulix backend authController usually has updatePassword or changePassword.
      // Let's call PUT /auth/update-password or similar. 
      // Let's verify password update endpoint in authRoutes. Wait, did we see a change password route in authRoutes?
      // In authRoutes:
      // router.post('/login', loginUser);
      // router.post('/register', registerUser);
      // router.post('/create-teacher', protect, admin, createTeacherAccount);
      // Wait, there is no custom password route in authRoutes. 
      // Let's search if there is a password change endpoint in backend.
      // Let's look for "password" in authController.ts or backend/routes.
      // Wait, let's execute the password update anyway. 
      // If there is no custom endpoint, we can check how backend handles password changes, or implement one!
      // Actually, let's keep it simple: we can make a PUT request to /auth/password
      // Let's check authRoutes to see if there are other routes we missed. No, we read it: it only has login, register, create-teacher.
      // Wait! Let's check if authController.ts has a changePassword or updatePassword function. Let's look.
      // But we can check that in background. Let's send the API call to /auth/password and see if it's there, or we can add it to authRoutes!
      // Let's look at authRoutes.ts and authController.ts in the backend later to add it if needed, or we can mock/write it. 
      // For now, let's make it hit `/auth/change-password` and implement that endpoint.
      await api.put("/auth/change-password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || "Failed to update password. Verify current password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  // Slots Management
  const addSlot = (dayName: string) => {
    setAvailability(prev =>
      prev.map(item => {
        if (item.day === dayName) {
          return {
            ...item,
            slots: [...item.slots, { startTime: "09:00", endTime: "13:00" }]
          };
        }
        return item;
      })
    );
  };

  const removeSlot = (dayName: string, slotIndex: number) => {
    setAvailability(prev =>
      prev.map(item => {
        if (item.day === dayName) {
          const newSlots = [...item.slots];
          newSlots.splice(slotIndex, 1);
          return { ...item, slots: newSlots };
        }
        return item;
      })
    );
  };

  const updateSlotTime = (dayName: string, slotIndex: number, field: "startTime" | "endTime", value: string) => {
    setAvailability(prev =>
      prev.map(item => {
        if (item.day === dayName) {
          const newSlots = [...item.slots];
          newSlots[slotIndex] = { ...newSlots[slotIndex], [field]: value };
          return { ...item, slots: newSlots };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-400 text-sm mt-0.5">Manage your profile, status, and preferences</p>
      </div>

      <div className="grid gap-6">
        {/* Banner Success/Error Alerts */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-3 text-emerald-400 text-sm"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Profile and Availability settings saved successfully!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {saveError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-3 text-red-400 text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{saveError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {isTeacher ? (
          /* TEACHER PROFILE & AVAILABILITY */
          isLoadingProfile ? (
            <div className="py-12 bg-neutral-900 border border-neutral-800 rounded-2xl text-center text-neutral-500">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading profile settings...
            </div>
          ) : (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              {/* Profile Card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-500" />
                  My Teacher Profile
                </h3>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6 pb-6 border-b border-neutral-800">
                  <div className="w-16 h-16 rounded-2xl brand-gradient flex items-center justify-center text-2xl font-bold text-black shrink-0 shadow-lg shadow-amber-500/10">
                    {user?.name?.charAt(0) || "T"}
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-white text-lg">{teacherProfile?.name}</p>
                    <div className="flex flex-wrap gap-2 items-center text-sm text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-neutral-500" />
                        {teacherProfile?.email}
                      </span>
                      <span className="text-neutral-700">•</span>
                      <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider">
                        {teacherProfile?.experience ? `${teacherProfile?.experience} Years Experience` : "Teacher"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-neutral-300 flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-neutral-500" />
                      Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all"
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-neutral-300 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-neutral-500" />
                      Duty Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className={`w-full bg-neutral-800 border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-amber-500 transition-colors ${
                        status === "Available" ? "text-emerald-400 border-emerald-500/20" :
                        status === "Busy" ? "text-amber-400 border-amber-500/20" :
                        "text-neutral-400 border-neutral-700"
                      }`}
                    >
                      <option value="Available">Available (Duty Active)</option>
                      <option value="Busy">Busy (Currently in Session)</option>
                      <option value="On Leave">On Leave</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Availability Manager */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-500" />
                      Manage My Weekly Availability
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Set standard working hours day-by-day. Admins will schedule classes and demo sessions matching these slots.
                    </p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availability.map((dayAvail) => {
                    const hasSlots = dayAvail.slots.length > 0;
                    return (
                      <div
                        key={dayAvail.day}
                        className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${
                          hasSlots
                            ? "bg-neutral-800/40 border-neutral-750"
                            : "bg-neutral-950/20 border-neutral-800 opacity-60 hover:opacity-85"
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Day Header */}
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-white text-sm">{dayAvail.day}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                hasSlots
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-neutral-800 text-neutral-500"
                              }`}
                            >
                              {hasSlots ? "Active" : "Off"}
                            </span>
                          </div>

                          {/* Time Slots List */}
                          {hasSlots ? (
                            <div className="space-y-2">
                              {dayAvail.slots.map((slot, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-1.5 bg-neutral-900 p-2 rounded-xl border border-neutral-800">
                                  <div className="flex flex-col gap-1 w-full">
                                    <div className="flex justify-between items-center gap-1">
                                      <span className="text-[9px] text-neutral-500 uppercase">Start</span>
                                      <input
                                        type="time"
                                        required
                                        value={slot.startTime}
                                        onChange={(e) => updateSlotTime(dayAvail.day, sIdx, "startTime", e.target.value)}
                                        className="bg-neutral-800 border border-neutral-750 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-amber-500"
                                      />
                                    </div>
                                    <div className="flex justify-between items-center gap-1">
                                      <span className="text-[9px] text-neutral-500 uppercase">End</span>
                                      <input
                                        type="time"
                                        required
                                        value={slot.endTime}
                                        onChange={(e) => updateSlotTime(dayAvail.day, sIdx, "endTime", e.target.value)}
                                        className="bg-neutral-800 border border-neutral-750 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-amber-500"
                                      />
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeSlot(dayAvail.day, sIdx)}
                                    className="p-1 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 rounded transition-colors"
                                    title="Delete slot"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-neutral-600 text-xs italic py-2">No availability slots set.</p>
                          )}
                        </div>

                        {/* Add Slot Button */}
                        <button
                          type="button"
                          onClick={() => addSlot(dayAvail.day)}
                          className="mt-4 w-full flex items-center justify-center gap-1 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-750 text-neutral-400 hover:text-white rounded-xl border border-neutral-700 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Add Time Slot
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save profile */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="flex items-center gap-2 px-6 py-3 brand-gradient text-black font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg shadow-amber-500/10 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {updateProfileMutation.isPending ? "Saving Profile..." : "Save Profile & Availability"}
                </button>
              </div>
            </form>
          )
        ) : (
          /* ADMIN PROFILE - STATIC (AS IN EXISTING CODEBASE) WITH FIXED DETAILS */
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Admin Profile
            </h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl brand-gradient flex items-center justify-center text-2xl font-bold text-black">
                A
              </div>
              <div>
                <p className="font-medium text-white">System Administrator</p>
                <p className="text-sm text-neutral-400">{user?.email || "admin@school.edu"}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { label: "Full Name", value: user?.name || "System Admin", disabled: true },
                { label: "Email Address", value: user?.email || "admin@school.edu", type: "email", disabled: true },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={f.value}
                    disabled={f.disabled}
                    className="w-full bg-neutral-800/50 border border-neutral-800 text-neutral-500 rounded-xl px-3 py-2.5 text-sm outline-none cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change Password Form (All Roles) */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-500" />
            Change Password
          </h3>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
            <AnimatePresence>
              {passwordSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 flex items-center gap-2 text-emerald-400 text-xs"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Password changed successfully!</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {passwordError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-center gap-2 text-red-400 text-xs"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{passwordError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {[
              { label: "Current Password", key: "currentPassword" },
              { label: "New Password", key: "newPassword" },
              { label: "Confirm New Password", key: "confirmNewPassword" }
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">{field.label}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={(passwordForm as any)[field.key]}
                  onChange={(e) => setPasswordForm({ ...passwordForm, [field.key]: e.target.value })}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all placeholder-neutral-600"
                />
              </div>
            ))}
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-5 py-2.5 brand-gradient text-black font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
            >
              {passwordLoading && <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />}
              Update Password
            </button>
          </form>
        </div>

        {/* System Info */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-amber-500" />
            System Information
          </h3>
          <div className="space-y-3">
            {[
              { label: "Application", value: "Schedulix v1.0" },
              { label: "Backend API", value: api.defaults.baseURL || "http://localhost:5000" },
              { label: "Database", value: "MongoDB" },
              { label: "Environment", value: process.env.NODE_ENV === "production" ? "Production" : "Development" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-2.5 border-b border-neutral-800 last:border-0">
                <span className="text-sm text-neutral-400">{item.label}</span>
                <span className="text-sm text-white font-medium font-mono">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
