"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  RotateCcw,
  Mail,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  CreditCard,
  Video,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Copy,
  Check,
  Unlock,
  ShieldCheck,
  UserCheck,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
  Sparkles,
} from "lucide-react";
import { useSearchStore } from "@/store/searchStore";
import { useDebounce } from "@/hooks/useDebounce";

type BinItem = {
  _id: string;
  entityType: string;
  entityId: string;
  name: string;
  email?: string;
  secondaryInfo?: string;
  itemData: any;
  associatedData?: any;
  deletedAt: string;
  deletedBy?: {
    name?: string;
    email?: string;
    role?: string;
  };
  emailStatus?: "held" | "released" | "restored";
  status: "in_bin" | "restored";
};

type DeletedEmailRecord = {
  binId: string;
  entityId: string;
  entityType: string;
  name: string;
  email: string;
  role: string;
  secondaryInfo?: string;
  deletedAt: string;
  deletedBy?: any;
  emailStatus: "held" | "released" | "restored";
  isEmailTakenInActive: boolean;
  activeEntityDetail?: string;
  canRestore: boolean;
  canRelease: boolean;
};

export default function RecycleBinPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "all" | "emails" | "students" | "teachers" | "batches" | "payments"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const { searchQuery: globalSearch, setSearchQuery: setGlobalSearch } = useSearchStore();

  useEffect(() => {
    if (globalSearch !== undefined && globalSearch !== searchQuery) {
      setSearchQuery(globalSearch);
    }
  }, [globalSearch]);

  // Modals state
  const [restoreWithEmailModal, setRestoreWithEmailModal] = useState<BinItem | null>(null);
  const [newEmailInput, setNewEmailInput] = useState("");
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<BinItem | null>(null);
  const [emptyBinConfirm, setEmptyBinConfirm] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  // Queries
  const {
    data: binItems = [],
    isLoading: itemsLoading,
    refetch: refetchItems,
    isRefetching: itemsRefetching,
  } = useQuery<BinItem[]>({
    queryKey: ["recycle-bin-items"],
    queryFn: async () => (await api.get("/bin")).data,
    staleTime: 30_000,
  });

  const {
    data: binStats = {
      total: 0,
      byEntityType: {},
      deletedEmailsCount: 0,
      heldEmailsCount: 0,
      releasedEmailsCount: 0,
    },
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["recycle-bin-stats"],
    queryFn: async () => (await api.get("/bin/stats")).data,
    staleTime: 30_000,
  });

  const {
    data: deletedEmails = [],
    isLoading: emailsLoading,
    refetch: refetchEmails,
  } = useQuery<DeletedEmailRecord[]>({
    queryKey: ["recycle-bin-emails"],
    queryFn: async () => (await api.get("/bin/emails")).data,
    staleTime: 30_000,
  });

  const refreshAll = () => {
    refetchItems();
    refetchStats();
    refetchEmails();
  };

  // Mutations
  const restoreMutation = useMutation({
    mutationFn: async ({ id, newEmail }: { id: string; newEmail?: string }) =>
      (await api.post(`/bin/restore/${id}`, { newEmail })).data,
    onSuccess: (data) => {
      setFeedback({ type: "success", message: data.message || "Item restored successfully!" });
      setRestoreWithEmailModal(null);
      setNewEmailInput("");
      refreshAll();
      // Invalidate relevant dashboard queries so restored item is immediately visible
      queryClient.invalidateQueries({ queryKey: ["students-all"] });
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["demo-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sales-people"] });
      queryClient.invalidateQueries({ queryKey: ["sub-admins"] });
    },
    onError: (err: any) => {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to restore item",
      });
    },
  });

  const releaseEmailMutation = useMutation({
    mutationFn: async (id: string) => (await api.post(`/bin/release-email/${id}`)).data,
    onSuccess: (data) => {
      setFeedback({
        type: "success",
        message: data.message || "Email address has been successfully released!",
      });
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to release email",
      });
    },
  });

  const deletePermanentMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bin/${id}`)).data,
    onSuccess: (data) => {
      setFeedback({ type: "success", message: data.message || "Item permanently deleted" });
      setPermanentDeleteTarget(null);
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to permanently delete item",
      });
    },
  });

  const emptyBinMutation = useMutation({
    mutationFn: async () => (await api.delete("/bin")).data,
    onSuccess: (data) => {
      setFeedback({ type: "success", message: data.message || "Recycle bin emptied" });
      setEmptyBinConfirm(false);
      refreshAll();
    },
    onError: (err: any) => {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to empty recycle bin",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Filtered Items for standard list
  const filteredItems = useMemo(() => {
    let list = binItems;

    // Filter by tab category
    if (activeTab === "students") {
      list = list.filter((i) => i.entityType === "student");
    } else if (activeTab === "teachers") {
      list = list.filter(
        (i) => i.entityType === "teacher" || i.entityType === "subAdmin" || i.entityType === "salesPerson" || i.entityType === "user"
      );
    } else if (activeTab === "batches") {
      list = list.filter((i) => i.entityType === "batch" || i.entityType === "schedule");
    } else if (activeTab === "payments") {
      list = list.filter((i) => i.entityType === "payment" || i.entityType === "demoSession" || i.entityType === "demoSlot");
    }

    // Filter by search query
    if (debouncedSearch.trim() !== "") {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.name && i.name.toLowerCase().includes(q)) ||
          (i.email && i.email.toLowerCase().includes(q)) ||
          (i.secondaryInfo && i.secondaryInfo.toLowerCase().includes(q)) ||
          (i.entityType && i.entityType.toLowerCase().includes(q))
      );
    }

    return list;
  }, [binItems, activeTab, debouncedSearch]);

  // Filtered emails
  const filteredEmails = useMemo(() => {
    if (!debouncedSearch.trim()) return deletedEmails;
    const q = debouncedSearch.trim().toLowerCase();
    return deletedEmails.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q)
    );
  }, [deletedEmails, debouncedSearch]);

  const getEntityBadge = (type: string) => {
    switch (type) {
      case "student":
        return {
          icon: GraduationCap,
          label: "Student",
          color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
        };
      case "teacher":
        return {
          icon: Users,
          label: "Teacher",
          color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        };
      case "batch":
        return {
          icon: BookOpen,
          label: "Batch",
          color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        };
      case "schedule":
        return {
          icon: Calendar,
          label: "Schedule",
          color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        };
      case "payment":
        return {
          icon: CreditCard,
          label: "Payment",
          color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        };
      case "demoSession":
        return {
          icon: Video,
          label: "Demo Session",
          color: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        };
      case "subAdmin":
        return {
          icon: ShieldCheck,
          label: "Sub Admin",
          color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
        };
      case "salesPerson":
        return {
          icon: UserCheck,
          label: "Sales Person",
          color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        };
      default:
        return {
          icon: Users,
          label: type,
          color: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
        };
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                Recycle Bin & Data Recovery
              </h1>
              <p className="text-sm text-neutral-400 mt-0.5">
                Restore deleted records, recover exiting user emails, and safely manage archived data.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={refreshAll}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 transition-colors"
            title="Refresh Bin"
          >
            <RefreshCw
              className={`w-4 h-4 ${itemsRefetching ? "animate-spin text-cyan-400" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {binItems.length > 0 && (
            <button
              onClick={() => setEmptyBinConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Empty Bin</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Alert Toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex items-center justify-between p-4 rounded-xl border ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
              )}
              <span className="text-sm font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total in Bin */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Total in Bin</span>
            <div className="p-1.5 rounded-lg bg-red-500/10 text-red-400">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 text-white">{binStats.total || 0}</p>
          <p className="text-xs text-neutral-500 mt-1">Recoverable records</p>
        </div>

        {/* Card 2: Deleted Emails Hub */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-cyan-900/30 backdrop-blur-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-cyan-300">Recoverable Emails</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Mail className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 text-cyan-300">
            {binStats.deletedEmailsCount || 0}
          </p>
          <p className="text-xs text-cyan-400/70 mt-1">From deleted accounts</p>
        </div>

        {/* Card 3: Held Emails */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-amber-900/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-300">Emails Held in Bin</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 text-amber-300">{binStats.heldEmailsCount || 0}</p>
          <p className="text-xs text-amber-400/70 mt-1">Can restore or release</p>
        </div>

        {/* Card 4: Released Emails */}
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-emerald-900/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-300">Released Emails</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Unlock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold mt-2 text-emerald-300">
            {binStats.releasedEmailsCount || 0}
          </p>
          <p className="text-xs text-emerald-400/70 mt-1">Available for new users</p>
        </div>
      </div>

      {/* Tabs & Search Navigation */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "all"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <span>All Items</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-neutral-700/50 text-neutral-300">
              {binItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("emails")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "emails"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-neutral-400 hover:text-cyan-300"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Deleted Users & Emails</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300">
              {deletedEmails.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("students")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "students"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Students</span>
          </button>

          <button
            onClick={() => setActiveTab("teachers")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "teachers"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Teachers & Staff</span>
          </button>

          <button
            onClick={() => setActiveTab("batches")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "batches"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Batches & Schedules</span>
          </button>

          <button
            onClick={() => setActiveTab("payments")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === "payments"
                ? "bg-neutral-800 text-white shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payments & Demos</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setGlobalSearch(e.target.value);
            }}
            placeholder={
              activeTab === "emails"
                ? "Search emails or users..."
                : "Search by name, email, info..."
            }
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setGlobalSearch("");
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "emails" ? (
        /* ========================================================================= */
        /* TAB 2: SPECIALIZED EMAIL RECOVERY & DELETED USER ACCOUNTS DASHBOARD      */
        /* ========================================================================= */
        <div className="space-y-4">
          {/* Informational Guidance Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-neutral-900 to-cyan-950/20 border border-cyan-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0 mt-0.5 md:mt-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-cyan-200">
                  Recovering Existing Emails from Deleted Users
                </h3>
                <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
                  When a user, teacher, or staff member is removed, their email address remains safely held in the bin so historical records are protected.
                  Use <span className="font-semibold text-cyan-300">Restore Account</span> to restore their login credentials, or <span className="font-semibold text-emerald-300">Release Email</span> to free up the email address so a new registration can claim it immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Table of Deleted Users & Emails */}
          {emailsLoading ? (
            <div className="p-12 text-center text-neutral-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
              <p className="text-sm">Loading deleted accounts and emails...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
              <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center mx-auto text-neutral-500 mb-3">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-neutral-300">
                {debouncedSearch ? "No matching emails found" : "No deleted user emails in the bin"}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                {debouncedSearch
                  ? "Try adjusting your search query."
                  : "When users or teachers with email accounts are deleted, they will show up here with full recovery options."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900/80 text-neutral-400 uppercase text-[11px] tracking-wider border-b border-neutral-800">
                    <tr>
                      <th className="py-3 px-4">User / Account</th>
                      <th className="py-3 px-4">Email Address</th>
                      <th className="py-3 px-4">Role / Type</th>
                      <th className="py-3 px-4">Deleted On</th>
                      <th className="py-3 px-4">Email Status</th>
                      <th className="py-3 px-4 text-right">Recovery Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {filteredEmails.map((item) => (
                      <tr
                        key={item.binId}
                        className="hover:bg-neutral-800/30 transition-colors group"
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{item.name}</span>
                          </div>
                          {item.secondaryInfo && (
                            <span className="text-[11px] text-neutral-400">
                              {item.secondaryInfo}
                            </span>
                          )}
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2 font-mono text-cyan-300">
                            <span>{item.email}</span>
                            <button
                              onClick={() => copyToClipboard(item.email)}
                              className="text-neutral-500 hover:text-neutral-300 p-1 rounded"
                              title="Copy email"
                            >
                              {copiedEmail === item.email ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {item.isEmailTakenInActive && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Re-registered: {item.activeEntityDetail}</span>
                            </span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-300 border border-neutral-700/60">
                            {item.role}
                          </span>
                        </td>

                        {/* Deleted Date */}
                        <td className="py-3.5 px-4 text-neutral-400 whitespace-nowrap">
                          {formatDate(item.deletedAt)}
                        </td>

                        {/* Email Status */}
                        <td className="py-3.5 px-4">
                          {item.emailStatus === "released" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <Unlock className="w-3 h-3" />
                              <span>Released (Available)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <Clock className="w-3 h-3" />
                              <span>Held in Bin</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Option 1: Restore Account */}
                            <button
                              onClick={() => restoreMutation.mutate({ id: item.binId })}
                              disabled={restoreMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-colors"
                              title="Restore account with original email"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Restore Account</span>
                            </button>

                            {/* Option 2: Release Email */}
                            {item.emailStatus !== "released" && (
                              <button
                                onClick={() => releaseEmailMutation.mutate(item.binId)}
                                disabled={releaseEmailMutation.isPending}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors"
                                title="Free up email so someone else can use it"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                <span>Release Email</span>
                              </button>
                            )}

                            {/* Option 3: Restore with New Email */}
                            <button
                              onClick={() => {
                                const fullItem = binItems.find((b) => b._id === item.binId);
                                if (fullItem) {
                                  setRestoreWithEmailModal(fullItem);
                                  setNewEmailInput(item.email);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                              title="Restore with custom or alternate email"
                            >
                              <span>Custom Email</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* TAB 1: ALL DELETED ITEMS / CATEGORY LIST VIEW                             */
        /* ========================================================================= */
        <div className="space-y-4">
          {itemsLoading ? (
            <div className="p-12 text-center text-neutral-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
              <p className="text-sm">Loading deleted records...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-neutral-900/40 border border-neutral-800/80">
              <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center mx-auto text-neutral-500 mb-3">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-neutral-300">
                {debouncedSearch ? "No matching records found" : "Recycle Bin is empty"}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                {debouncedSearch
                  ? "Try clearing your search query."
                  : "Deleted items from students, batches, schedules, teachers, and fees will appear here for recovery."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const badge = getEntityBadge(item.entityType);
                const BadgeIcon = badge.icon;

                return (
                  <motion.div
                    key={item._id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      {/* Top Header: Badge + Date */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.color}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>

                        <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(item.deletedAt)}</span>
                        </span>
                      </div>

                      {/* Main Title & Details */}
                      <div className="mt-3">
                        <h4 className="text-base font-semibold text-white tracking-tight line-clamp-1">
                          {item.name}
                        </h4>

                        {item.email && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-cyan-300 font-mono">
                            <Mail className="w-3.5 h-3.5 text-neutral-400" />
                            <span className="truncate">{item.email}</span>
                            <button
                              onClick={() => copyToClipboard(item.email!)}
                              className="text-neutral-500 hover:text-neutral-300"
                              title="Copy email"
                            >
                              {copiedEmail === item.email ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}

                        {item.secondaryInfo && (
                          <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                            {item.secondaryInfo}
                          </p>
                        )}
                      </div>

                      {/* Deleted By Metadata */}
                      {item.deletedBy && (
                        <p className="text-[11px] text-neutral-500 mt-2">
                          Deleted by: <span className="text-neutral-400">{item.deletedBy.name || item.deletedBy.email || "Admin"}</span>
                        </p>
                      )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {/* 1. Quick Restore Button */}
                        <button
                          onClick={() => restoreMutation.mutate({ id: item._id })}
                          disabled={restoreMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-colors shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>

                        {/* 2. Release Email (if applicable) */}
                        {item.email && item.emailStatus !== "released" && (
                          <button
                            onClick={() => releaseEmailMutation.mutate(item._id)}
                            disabled={releaseEmailMutation.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 transition-colors"
                            title="Release this email to be used by new registrations"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Release Email</span>
                          </button>
                        )}
                      </div>

                      {/* 3. Delete Permanently Button */}
                      <button
                        onClick={() => setPermanentDeleteTarget(item)}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete permanently from bin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RESTORE WITH NEW EMAIL                                          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {restoreWithEmailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center gap-2 text-cyan-400">
                  <RotateCcw className="w-5 h-5" />
                  <h3 className="text-base font-semibold text-white">
                    Restore User / Account
                  </h3>
                </div>
                <button
                  onClick={() => setRestoreWithEmailModal(null)}
                  className="text-neutral-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-neutral-300">
                <p>
                  You are restoring <span className="font-semibold text-white">{restoreWithEmailModal.name}</span>.
                </p>
                <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                  <span className="text-[11px] text-neutral-500">Original Archived Email:</span>
                  <p className="font-mono text-cyan-300 text-sm">
                    {restoreWithEmailModal.email || "No email on file"}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-medium text-neutral-300">
                    Target Email for Restored Account:
                  </label>
                  <input
                    type="email"
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-neutral-500">
                    You can keep the original email or specify an updated email to avoid any conflicts with active users.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setRestoreWithEmailModal(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    restoreMutation.mutate({
                      id: restoreWithEmailModal._id,
                      newEmail: newEmailInput.trim(),
                    })
                  }
                  disabled={restoreMutation.isPending || !newEmailInput.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-cyan-500 hover:bg-cyan-600 text-black transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {restoreMutation.isPending && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Restore with this Email</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRM PERMANENT DELETE                                        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {permanentDeleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-red-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-400">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-white">Permanently Delete Item?</h3>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                Are you sure you want to permanently delete{" "}
                <span className="font-semibold text-white">
                  "{permanentDeleteTarget.name}"
                </span>{" "}
                ({permanentDeleteTarget.entityType})? This action cannot be reversed.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setPermanentDeleteTarget(null)}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deletePermanentMutation.mutate(permanentDeleteTarget._id)}
                  disabled={deletePermanentMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-2"
                >
                  {deletePermanentMutation.isPending && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Delete Forever</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRM EMPTY BIN                                               */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {emptyBinConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-red-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-red-400">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-white">Empty Entire Recycle Bin?</h3>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                This will permanently delete all <span className="font-bold text-white">{binItems.length}</span> items
                currently in the bin. None of these items will be recoverable.
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEmptyBinConfirm(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => emptyBinMutation.mutate()}
                  disabled={emptyBinMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-2"
                >
                  {emptyBinMutation.isPending && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>Empty Bin Forever</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
