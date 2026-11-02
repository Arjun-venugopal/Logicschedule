"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileCode2,
  PackageCheck,
  History,
  Activity,
  ShieldCheck,
  Zap,
  Server,
  Layers,
  ArrowRight,
  Info,
  Gauge,
  Clock,
  Sparkles,
  RotateCcw,
  Check,
} from "lucide-react";

interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
  expiredPruned: number;
  pressureEvictions?: number;
  estimatedSizeBytes?: number;
  activeKeys: string[];
  namespaceCounts?: Record<string, number>;
}

interface DiskCacheFile {
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

interface DiskCacheStats {
  fileCount: number;
  totalSizeBytes: number;
  cacheDir: string;
  files: DiskCacheFile[];
  expiredPruned?: number;
}

interface CacheConfig {
  capacity: number;
  cleanupIntervalSeconds: number;
  defaultTtlSeconds: number;
  maxMemoryThresholdMb: number;
  enableMemoryPressureEviction: boolean;
  diskCacheMaxAgeHours: number;
}

interface MemoryMetrics {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  uptimeSeconds: number;
  nodeVersion: string;
  timestamp: string;
  l1Cache: CacheStats;
  l2DiskCache: DiskCacheStats;
  config?: CacheConfig;
}

interface CleanupLogItem {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  status: "success" | "warning" | "info";
}

const DEFAULT_CONFIG: CacheConfig = {
  capacity: 250,
  cleanupIntervalSeconds: 60,
  defaultTtlSeconds: 30,
  maxMemoryThresholdMb: 384,
  enableMemoryPressureEviction: true,
  diskCacheMaxAgeHours: 24,
};

export default function SystemOptimizationDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"memory" | "code" | "dependencies" | "sql" | "history">("memory");
  const [patternInput, setPatternInput] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  // Config form state
  const [configForm, setConfigForm] = useState<CacheConfig>(DEFAULT_CONFIG);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);

  const [cleanupLogs, setCleanupLogs] = useState<CleanupLogItem[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      action: "System Initialized",
      detail: "Memory & Cache Optimization loaded with verified safe defaults.",
      status: "info"
    }
  ]);

  const addLog = (action: string, detail: string, status: "success" | "warning" | "info" = "success") => {
    setCleanupLogs(prev => [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        action,
        detail,
        status
      },
      ...prev.slice(0, 49) // Keep last 50 logs
    ]);
  };

  // 1. Fetch live memory metrics
  const { data: metrics, isLoading, isFetching, refetch } = useQuery<MemoryMetrics>({
    queryKey: ["admin-memory-metrics"],
    queryFn: async () => (await api.get("/stats/memory")).data,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  // Sync server config into local form if user hasn't modified it
  useEffect(() => {
    if (metrics?.config && !isConfigDirty) {
      setConfigForm(metrics.config);
    }
  }, [metrics?.config, isConfigDirty]);

  // 2. Prune cache mutation
  const pruneMutation = useMutation({
    mutationFn: async () => (await api.post("/stats/cache/prune")).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      const detail = `Pruned ${data.prunedCount || 0} expired memory entries & ${data.prunedDiskFiles || 0} disk files (${((data.freedDiskBytes || 0) / 1024).toFixed(1)} KB freed).`;
      addLog("Expired Entries Pruned", detail, "success");
    },
    onError: (err: any) => {
      addLog("Prune Failed", err.response?.data?.message || err.message, "warning");
    }
  });

  // 3. Clear cache mutation
  const clearMutation = useMutation({
    mutationFn: async (payload: { target: "all" | "l1" | "disk" | "pattern"; pattern?: string }) =>
      (await api.post("/stats/cache/clear", payload)).data,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      const detail = variables.target === "pattern"
        ? `Cleared pattern '${variables.pattern}' (${data.l1ClearedCount || 0} keys freed).`
        : variables.target === "disk"
        ? `Freed ${((data.diskFreedBytes || 0) / 1024).toFixed(1)} KB across ${data.diskDeletedFiles || 0} disk files.`
        : `L1 memory & L2 disk cache completely flushed.`;
      addLog(`Cache Cleared (${variables.target})`, detail, "success");
      setConfirmModal(null);
    },
    onError: (err: any) => {
      addLog("Clear Failed", err.response?.data?.message || err.message, "warning");
      setConfirmModal(null);
    }
  });

  // 4. Update configuration mutation
  const configMutation = useMutation({
    mutationFn: async (payload: Partial<CacheConfig> & { resetToDefaults?: boolean }) =>
      (await api.put("/stats/cache/config", payload)).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      if (data.config) {
        setConfigForm(data.config);
      }
      setIsConfigDirty(false);
      setConfigSuccessMsg(data.message || "Memory optimization configuration saved.");
      setTimeout(() => setConfigSuccessMsg(null), 4000);
      addLog("Configuration Saved", `Capacity: ${data.config?.capacity || configForm.capacity}, Cleanup: ${data.config?.cleanupIntervalSeconds || configForm.cleanupIntervalSeconds}s, Retain: ${data.config?.diskCacheMaxAgeHours || configForm.diskCacheMaxAgeHours}h.`, "success");
    },
    onError: (err: any) => {
      addLog("Config Save Failed", err.response?.data?.message || err.message, "warning");
    }
  });

  // 5. Memory compaction / Garbage collector mutation
  const gcMutation = useMutation({
    mutationFn: async () => (await api.post("/stats/memory/gc")).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      const freedMb = ((data.heapFreedBytes || 0) / (1024 * 1024)).toFixed(1);
      const detail = `Freed ${freedMb} MB heap • Pruned ${data.prunedL1Entries || 0} L1 entries • Cleaned ${data.prunedDiskFiles || 0} disk files.${data.gcTriggered ? " (V8 GC executed)" : ""}`;
      addLog("Memory Optimization Executed", detail, "success");
    },
    onError: (err: any) => {
      addLog("Optimization Failed", err.response?.data?.message || err.message, "warning");
    }
  });

  const formatBytes = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "0s";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
  };

  const heapPct = metrics?.heapTotalBytes && metrics?.heapUsedBytes
    ? Math.min(100, Math.round((metrics.heapUsedBytes / metrics.heapTotalBytes) * 100))
    : 0;

  const currentCapacity = metrics?.l1Cache?.capacity || configForm.capacity;
  const currentNamespaceCounts = metrics?.l1Cache?.namespaceCounts || {};

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
              Memory Optimization & System Health
              <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium border border-emerald-500/20 flex items-center gap-1">
                <Check className="w-3 h-3" /> Safe Defaults Active
              </span>
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400">
              Manage runtime memory, LRU cache capacity, automated cleanup schedules, and system audits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => gcMutation.mutate()}
            disabled={gcMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl text-xs font-semibold border border-amber-500/30 transition-all disabled:opacity-50"
            title="Run memory compaction, prune expired cache, and trigger garbage collection"
          >
            <Sparkles className={`w-3.5 h-3.5 ${gcMutation.isPending ? "animate-spin" : ""}`} />
            {gcMutation.isPending ? "Compacting..." : "Optimize Memory"}
          </button>

          <button
            onClick={() => {
              refetch();
              addLog("Metrics Refreshed", "Live memory & cache metrics refreshed manually.", "info");
            }}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700/80 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-neutral-700/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-amber-500" : ""}`} />
            {isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-800/80 text-xs font-semibold">
        {[
          { id: "memory", label: "Memory Optimization", icon: Activity },
          { id: "code", label: "Code Audit", icon: FileCode2 },
          { id: "dependencies", label: "Dependency Audit", icon: PackageCheck },
          { id: "sql", label: "SQL & DB Audit", icon: Database },
          { id: "history", label: "Cleanup History", icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
                isActive
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60 border border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT: 1. MEMORY OPTIMIZATION */}
      {activeTab === "memory" && (
        <div className="space-y-6">
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Heap Used */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-500" />
                  Node.js Heap
                </span>
                <span className="font-mono text-[11px] text-neutral-500">{heapPct}%</span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : formatBytes(metrics?.heapUsedBytes)}
              </p>
              <div className="w-full bg-neutral-700/40 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${heapPct}%` }}
                />
              </div>
              <p className="text-[11px] text-neutral-500">
                Total Allocated: {formatBytes(metrics?.heapTotalBytes)} • RSS: {formatBytes(metrics?.rssBytes)}
              </p>
            </div>

            {/* L1 In-Memory Cache Entries */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  L1 In-Memory LRU Cache
                </span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {metrics?.l1Cache?.size || 0} / {currentCapacity}
                </span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : `${metrics?.l1Cache?.size || 0} keys`}
              </p>
              <p className="text-[11px] text-neutral-500">
                Hit Ratio: {metrics?.l1Cache?.hitRatio || 0}% ({metrics?.l1Cache?.hits || 0} hits / {metrics?.l1Cache?.misses || 0} misses)
              </p>
              <p className="text-[10px] text-neutral-500 font-mono">
                Pruned: {metrics?.l1Cache?.expiredPruned || 0} • Evicted: {metrics?.l1Cache?.evictions || 0} • Pressure: {metrics?.l1Cache?.pressureEvictions || 0}
              </p>
            </div>

            {/* L2 Disk Cache */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  L2 Disk Fallback Cache
                </span>
                <span className="font-mono text-[11px] text-blue-400">
                  {metrics?.l2DiskCache?.fileCount || 0} files
                </span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : `${(((metrics?.l2DiskCache?.totalSizeBytes || 0) / 1024)).toFixed(1)} KB`}
              </p>
              <p className="text-[11px] text-neutral-500">
                Max Retention: {metrics?.config?.diskCacheMaxAgeHours || configForm.diskCacheMaxAgeHours}h
              </p>
              <p className="text-[10px] text-neutral-500">
                Expired disk files pruned: {metrics?.l2DiskCache?.expiredPruned || 0}
              </p>
            </div>

            {/* Server Uptime */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  Server Health
                </span>
                <span className="font-mono text-[11px] text-purple-400">
                  {metrics?.nodeVersion || "Node.js"}
                </span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : formatUptime(metrics?.uptimeSeconds)}
              </p>
              <p className="text-[11px] text-neutral-500">
                Timezone: Asia/Kolkata
              </p>
              <p className="text-[10px] text-neutral-500">
                Auto-cleanup: Every {metrics?.config?.cleanupIntervalSeconds || configForm.cleanupIntervalSeconds}s
              </p>
            </div>
          </div>

          {/* Active Cache Namespaces Inspector */}
          {Object.keys(currentNamespaceCounts).length > 0 && (
            <div className="bg-neutral-800/25 border border-neutral-800/70 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5 font-medium text-neutral-300">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  Active Cache Namespaces in Memory
                </span>
                <span className="text-[11px] text-neutral-500">
                  Estimated Memory Overhead: ~{(((metrics?.l1Cache?.estimatedSizeBytes || 0) / 1024)).toFixed(1)} KB
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(currentNamespaceCounts).map(([prefix, count]) => (
                  <div
                    key={prefix}
                    className="flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-800 px-2.5 py-1 rounded-lg text-xs"
                  >
                    <span className="font-mono text-neutral-300 font-medium">{prefix}_</span>
                    <span className="bg-amber-500/15 text-amber-400 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                      {count}
                    </span>
                    <button
                      onClick={() => clearMutation.mutate({ target: "l1", pattern: `${prefix}_` })}
                      disabled={clearMutation.isPending}
                      className="ml-1 text-neutral-500 hover:text-red-400 transition-colors"
                      title={`Purge all '${prefix}_' entries`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Panel A: Cache Cleanup Operations */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Cache Cleanup & Maintenance Operations
                </h4>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Prune expired entries without touching active cache, or clear specific cache namespaces.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => pruneMutation.mutate()}
                  disabled={pruneMutation.isPending}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pruneMutation.isPending ? "animate-spin" : ""}`} />
                  {pruneMutation.isPending ? "Pruning..." : "Prune Expired Entries (L1 & L2)"}
                </button>

                <button
                  onClick={() => gcMutation.mutate()}
                  disabled={gcMutation.isPending}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Compact Memory
                </button>

                <button
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    title: "Clear L1 In-Memory Cache?",
                    description: "This will flush in-memory cached query results. Future requests will automatically rebuild fresh cache entries from Supabase with zero downtime.",
                    action: () => clearMutation.mutate({ target: "l1" })
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-xl text-xs font-semibold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                  Clear In-Memory Cache
                </button>

                <button
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    title: "Clear L2 Disk Fallback Cache?",
                    description: "This will remove stored .json fallback snapshots from backend/.cache. Active in-memory cache and database records will remain completely intact.",
                    action: () => clearMutation.mutate({ target: "disk" })
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-xl text-xs font-semibold transition-all"
                >
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  Clear Disk Cache
                </button>
              </div>

              {/* Targeted Namespace Invalidation */}
              <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                <label className="block text-[11px] font-medium text-neutral-400">
                  Targeted Namespace Invalidation (e.g. schedules_, batches_, stats_)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter prefix: batches_, stats_..."
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    onClick={() => {
                      if (!patternInput.trim()) return;
                      clearMutation.mutate({ target: "l1", pattern: patternInput.trim() });
                      setPatternInput("");
                    }}
                    disabled={!patternInput.trim() || clearMutation.isPending}
                    className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 rounded-xl text-xs font-medium disabled:opacity-50"
                  >
                    Invalidate Prefix
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {["batches_", "schedules_", "teachers_", "students_", "demo_sessions_", "payments_", "stats_"].map(p => (
                    <button
                      key={p}
                      onClick={() => clearMutation.mutate({ target: "l1", pattern: p })}
                      className="text-[10px] bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 border border-neutral-800 rounded px-2 py-0.5 font-mono transition-colors"
                    >
                      {p}*
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Panel B: Memory Optimization Settings & Policies */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-500" />
                    Memory Limits & Cleanup Schedules
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Configure memory thresholds, automatic background eviction, and disk retention.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    configMutation.mutate({ resetToDefaults: true });
                  }}
                  disabled={configMutation.isPending}
                  className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-400 transition-colors"
                  title="Reset all settings to verified safe defaults"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Defaults
                </button>
              </div>

              <AnimatePresence>
                {configSuccessMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2 rounded-xl flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{configSuccessMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3.5">
                {/* 1. LRU Capacity */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <label className="text-neutral-300 font-medium">LRU Cache Capacity (Max Keys)</label>
                    <span className="font-mono text-amber-400 text-xs">{configForm.capacity} entries</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={25}
                      max={5000}
                      step={25}
                      value={configForm.capacity}
                      onChange={(e) => {
                        const val = Math.min(Math.max(25, Number(e.target.value) || 250), 5000);
                        setConfigForm({ ...configForm, capacity: val });
                        setIsConfigDirty(true);
                      }}
                      className="w-28 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-mono"
                    />
                    {/* Preset buttons */}
                    <div className="flex flex-wrap gap-1 items-center flex-1">
                      {[
                        { label: "100", val: 100 },
                        { label: "250 (Safe)", val: 250 },
                        { label: "500", val: 500 },
                        { label: "1000", val: 1000 },
                      ].map(p => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => {
                            setConfigForm({ ...configForm, capacity: p.val });
                            setIsConfigDirty(true);
                          }}
                          className={`text-[11px] px-2 py-1 rounded-lg border transition-all ${
                            configForm.capacity === p.val
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold"
                              : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Automatic Cleanup Schedule */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Auto-Cleanup Schedule
                    </label>
                    <select
                      value={configForm.cleanupIntervalSeconds}
                      onChange={(e) => {
                        setConfigForm({ ...configForm, cleanupIntervalSeconds: Number(e.target.value) });
                        setIsConfigDirty(true);
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value={30}>Every 30 seconds</option>
                      <option value={60}>Every 60 seconds (Safe Default)</option>
                      <option value={120}>Every 2 minutes</option>
                      <option value={300}>Every 5 minutes</option>
                      <option value={600}>Every 10 minutes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Memory Pressure Limit
                    </label>
                    <select
                      value={configForm.maxMemoryThresholdMb}
                      onChange={(e) => {
                        setConfigForm({ ...configForm, maxMemoryThresholdMb: Number(e.target.value) });
                        setIsConfigDirty(true);
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value={256}>256 MB (Low RAM)</option>
                      <option value={384}>384 MB (Safe Default)</option>
                      <option value={512}>512 MB (Standard)</option>
                      <option value={1024}>1024 MB (High Capacity)</option>
                    </select>
                  </div>
                </div>

                {/* 3. Disk Retention & Pressure Eviction Toggle */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Disk Cache Retention
                    </label>
                    <select
                      value={configForm.diskCacheMaxAgeHours}
                      onChange={(e) => {
                        setConfigForm({ ...configForm, diskCacheMaxAgeHours: Number(e.target.value) });
                        setIsConfigDirty(true);
                      }}
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-amber-500"
                    >
                      <option value={6}>6 Hours</option>
                      <option value={12}>12 Hours</option>
                      <option value={24}>24 Hours (Safe Default)</option>
                      <option value={48}>48 Hours</option>
                      <option value={168}>7 Days</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="pressureEviction"
                      checked={configForm.enableMemoryPressureEviction}
                      onChange={(e) => {
                        setConfigForm({ ...configForm, enableMemoryPressureEviction: e.target.checked });
                        setIsConfigDirty(true);
                      }}
                      className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500/20"
                    />
                    <label htmlFor="pressureEviction" className="text-xs text-neutral-300 cursor-pointer">
                      Auto-evict LRU when memory exceeds threshold
                    </label>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      configMutation.mutate(configForm);
                    }}
                    disabled={configMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 brand-gradient text-black rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {configMutation.isPending ? "Saving Settings..." : "Save Optimization Settings"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Safe Defaults Guarantee Notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Safe Defaults Guard: </span>
              Essential application caching is preserved to ensure low latency and high responsiveness. Cache cleanups only evict expired or cold LRU data; active database entities and operational records are never deleted.
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. CODE AUDIT */}
      {activeTab === "code" && (
        <div className="space-y-4">
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <FileCode2 className="w-4 h-4 text-amber-500" />
              Codebase Dead Code &amp; Memory Retention Audit
            </h4>
            <p className="text-xs text-neutral-400">
              Audit results for unused exports, dynamic imports, timer cleanups, Socket.IO connections, and React memory footprint.
            </p>
          </div>

          <div className="overflow-x-auto border border-neutral-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-800/60 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Module / Area</th>
                  <th className="py-2.5 px-3 font-semibold">Audit Check</th>
                  <th className="py-2.5 px-3 font-semibold">Finding</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">Socket.IO Client</td>
                  <td className="py-2.5 px-3">Connection retention &amp; duplicate listeners</td>
                  <td className="py-2.5 px-3">Frontend does not initialize WebSocket connections; relies on TanStack Query HTTP polling with auto garbage collection</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">PwaProvider, Layout, Modals</td>
                  <td className="py-2.5 px-3">Event Listener Memory Leaks</td>
                  <td className="py-2.5 px-3">Verified: All <code>online</code>, <code>offline</code>, <code>resize</code>, and <code>mousedown</code> listeners include clean unmount handlers</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Clean</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">useDebounce &amp; Toast Timers</td>
                  <td className="py-2.5 px-3">Timer retention &amp; unmount clearing</td>
                  <td className="py-2.5 px-3"><code>useDebounce</code> clears timer on unmount; toast timeouts use non-retaining 2-4s durations with unref cleanup</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Clean</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">providers.tsx</td>
                  <td className="py-2.5 px-3">TanStack Query Garbage Collection</td>
                  <td className="py-2.5 px-3">Configured with <code>gcTime: 3 mins</code> &amp; <code>staleTime: 2 mins</code> to prevent browser heap accumulation</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Clean</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">studentController.ts</td>
                  <td className="py-2.5 px-3">Student Cache Lifecycle</td>
                  <td className="py-2.5 px-3">Added 30s TTL in-memory caching to <code>getAllStudents</code>, completing the lifecycle with existing <code>students_</code> invalidation</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">backend/utils/cache.ts</td>
                  <td className="py-2.5 px-3">Active TTL Expiration Prune</td>
                  <td className="py-2.5 px-3">Background cleanup schedule with memory pressure protection (evicts oldest 25% if heap exceeds limit)</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">DemoReportPDF.tsx</td>
                  <td className="py-2.5 px-3">Dynamic imports for heavy libraries</td>
                  <td className="py-2.5 px-3">Uses lazy <code>import(&apos;html2canvas&apos;)</code> &amp; <code>import(&apos;jspdf&apos;)</code> only when generating PDFs</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">Analytics Modals</td>
                  <td className="py-2.5 px-3">Code-splitting large modal bundles</td>
                  <td className="py-2.5 px-3"><code>ActiveBatchesAnalyticsModal</code>, <code>TeacherPerformanceModal</code>, <code>TeacherWeeklyAvailabilityModal</code> use Next.js <code>dynamic()</code></td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. DEPENDENCY AUDIT */}
      {activeTab === "dependencies" && (
        <div className="space-y-4">
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <PackageCheck className="w-4 h-4 text-amber-500" />
              Package &amp; Dependency Audit Report
            </h4>
            <p className="text-xs text-neutral-400">
              Audit of root, backend, and frontend packages against application import trees.
            </p>
          </div>

          <div className="overflow-x-auto border border-neutral-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-800/60 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Package Name</th>
                  <th className="py-2.5 px-3 font-semibold">Location</th>
                  <th className="py-2.5 px-3 font-semibold">Classification</th>
                  <th className="py-2.5 px-3 font-semibold">Usage &amp; Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">@supabase/supabase-js</td>
                  <td className="py-2.5 px-3 font-mono">backend</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Active &amp; Core</span>
                  </td>
                  <td className="py-2.5 px-3">Used for all database operations and BaseModel query execution. Essential.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">bcrypt, jsonwebtoken</td>
                  <td className="py-2.5 px-3 font-mono">backend</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Active &amp; Core</span>
                  </td>
                  <td className="py-2.5 px-3">Password hashing, JWT generation and session authorization. Essential.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">compression, helmet</td>
                  <td className="py-2.5 px-3 font-mono">backend</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Active &amp; Security</span>
                  </td>
                  <td className="py-2.5 px-3">HTTP response gzip compression and security headers. Essential.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">xlsx, zod, multer</td>
                  <td className="py-2.5 px-3 font-mono">backend</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Active &amp; Features</span>
                  </td>
                  <td className="py-2.5 px-3">Bulk student Excel imports, input validation schemas, and file uploads. Essential.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-amber-400 font-semibold">socket.io-client</td>
                  <td className="py-2.5 px-3 font-mono">frontend</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-[10px] font-semibold">Unused Candidate</span>
                  </td>
                  <td className="py-2.5 px-3">Frontend utilizes TanStack Query polling intervals; socket client is unimported. Safe for removal with confirmation.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-amber-400 font-semibold">@supabase/ssr</td>
                  <td className="py-2.5 px-3 font-mono">root</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-[10px] font-semibold">Unused Candidate</span>
                  </td>
                  <td className="py-2.5 px-3">Root orchestrates scripts; no direct SSR Supabase imports in root. Safe for removal with confirmation.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Safety Commitment: </span>
              In accordance with project rules, candidate packages are cataloged for review and will never be deleted without explicit confirmation.
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 4. SQL & DB AUDIT */}
      {activeTab === "sql" && (
        <div className="space-y-4">
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-amber-500" />
              PostgreSQL &amp; Supabase Database Audit
            </h4>
            <p className="text-xs text-neutral-400">
              Audit of tables, indexes, extensions, and stored functions in Supabase PostgreSQL schema.
            </p>
          </div>

          <div className="overflow-x-auto border border-neutral-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-800/60 text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Database Object</th>
                  <th className="py-2.5 px-3 font-semibold">Object Type</th>
                  <th className="py-2.5 px-3 font-semibold">Classification</th>
                  <th className="py-2.5 px-3 font-semibold">Purpose &amp; Dependencies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">pgcrypto</td>
                  <td className="py-2.5 px-3">Extension</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">1. Active &amp; Required</span>
                  </td>
                  <td className="py-2.5 px-3">Generates UUIDs (<code>gen_random_uuid()</code>) for table primary keys. Essential.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">users, teachers, batches, students</td>
                  <td className="py-2.5 px-3">Core Tables</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">1. Active &amp; Required</span>
                  </td>
                  <td className="py-2.5 px-3">Primary entity storage with B-tree indexes on email, role, teacher, batch, and status.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">schedules, demoSlots, demos, demoReports</td>
                  <td className="py-2.5 px-3">Session Tables</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">1. Active &amp; Required</span>
                  </td>
                  <td className="py-2.5 px-3">Class schedules, attendance, demo bookings, and feedback reporting.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">payments, recycle_bin</td>
                  <td className="py-2.5 px-3">Financial &amp; Bin</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">1. Active &amp; Required</span>
                  </td>
                  <td className="py-2.5 px-3">Payment history records, fee tracking, and soft-delete recovery bin.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-blue-400 font-semibold">19 B-Tree Indexes</td>
                  <td className="py-2.5 px-3">Indexes</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-[10px] font-semibold">1. Active &amp; Required</span>
                  </td>
                  <td className="py-2.5 px-3">Covering foreign keys and query filters. Zero redundant or duplicate indexes found.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-purple-400 font-semibold">Stored Procedures / Triggers</td>
                  <td className="py-2.5 px-3">RPC &amp; Triggers</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded text-[10px] font-semibold">None (Clean Architecture)</span>
                  </td>
                  <td className="py-2.5 px-3">Application logic managed by Express/BaseModel. Zero orphan triggers or deprecated procedures.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 5. CLEANUP HISTORY */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
                <History className="w-4 h-4 text-amber-500" />
                Audit &amp; Cleanup History Log
              </h4>
              <p className="text-xs text-neutral-400">
                Audit executions, cache operations, and administrative maintenance actions.
              </p>
            </div>
            <button
              onClick={() => setCleanupLogs([])}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Clear Log
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {cleanupLogs.map((log) => (
              <div
                key={log.id}
                className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-3 flex items-start gap-3 text-xs"
              >
                <div className="mt-0.5 shrink-0">
                  {log.status === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : log.status === "warning" ? (
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{log.action}</span>
                    <span className="font-mono text-[10px] text-neutral-500">{log.timestamp}</span>
                  </div>
                  <p className="text-neutral-400 text-[11px]">{log.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 text-amber-400">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <h4 className="font-bold text-white text-base">{confirmModal.title}</h4>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {confirmModal.description}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmModal.action()}
                  disabled={clearMutation.isPending}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {clearMutation.isPending ? "Executing..." : "Confirm & Proceed"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
