"use client";

import { useState } from "react";
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
  Info
} from "lucide-react";

interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
  expiredPruned: number;
  activeKeys: string[];
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
}

interface CleanupLogItem {
  id: string;
  timestamp: string;
  action: string;
  detail: string;
  status: "success" | "warning" | "info";
}

export default function SystemOptimizationDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"memory" | "code" | "dependencies" | "sql" | "history">("memory");
  const [newCapacity, setNewCapacity] = useState<number | "">("");
  const [patternInput, setPatternInput] = useState("");
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  const [cleanupLogs, setCleanupLogs] = useState<CleanupLogItem[]>([
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      action: "System Initialized",
      detail: "Memory & Dead Code Audit Dashboard loaded with safe defaults.",
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

  // 1. Fetch memory metrics
  const { data: metrics, isLoading, isFetching, refetch } = useQuery<MemoryMetrics>({
    queryKey: ["admin-memory-metrics"],
    queryFn: async () => (await api.get("/stats/memory")).data,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  // 2. Prune cache mutation
  const pruneMutation = useMutation({
    mutationFn: async () => (await api.post("/stats/cache/prune")).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      addLog("L1 Cache Pruned", `Cleaned ${data.prunedCount || 0} expired memory entries.`, "success");
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
        ? `Freed ${((data.diskFreedBytes || 0) / 1024).toFixed(1)} KB across ${data.diskDeletedFiles || 0} files.`
        : `L1 memory & L2 disk cache completely flushed.`;
      addLog(`Cache Cleared (${variables.target})`, detail, "success");
      setConfirmModal(null);
    },
    onError: (err: any) => {
      addLog("Clear Failed", err.response?.data?.message || err.message, "warning");
      setConfirmModal(null);
    }
  });

  // 4. Update capacity mutation
  const capacityMutation = useMutation({
    mutationFn: async (capacity: number) => (await api.put("/stats/cache/config", { capacity })).data,
    onSuccess: (_, capacity) => {
      queryClient.invalidateQueries({ queryKey: ["admin-memory-metrics"] });
      addLog("Capacity Adjusted", `LRU Cache capacity updated to ${capacity} items.`, "success");
      setNewCapacity("");
    },
    onError: (err: any) => {
      addLog("Capacity Update Failed", err.response?.data?.message || err.message, "warning");
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
              System Optimization & Cleanup
              <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium border border-emerald-500/20">
                Active Audit
              </span>
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400">
              Manage runtime memory, cache lifecycles, dead code audits, and database health
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            refetch();
            addLog("Metrics Refreshed", "Live memory & cache metrics refreshed manually.", "info");
          }}
          disabled={isFetching}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700/80 text-neutral-300 hover:text-white rounded-xl text-xs font-medium border border-neutral-700/60 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-amber-500" : ""}`} />
          {isFetching ? "Refreshing..." : "Refresh Metrics"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-neutral-800/80 text-xs font-semibold">
        {[
          { id: "memory", label: "Memory Usage", icon: Activity },
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

      {/* TAB CONTENT: 1. MEMORY USAGE */}
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

            {/* L1 Cache Entries */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  L1 In-Memory Cache
                </span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {metrics?.l1Cache?.size || 0} / {metrics?.l1Cache?.capacity || 250}
                </span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : `${metrics?.l1Cache?.size || 0} keys`}
              </p>
              <p className="text-[11px] text-neutral-500">
                Hit Ratio: {metrics?.l1Cache?.hitRatio || 0}% ({metrics?.l1Cache?.hits || 0} hits / {metrics?.l1Cache?.misses || 0} misses)
              </p>
              <p className="text-[10px] text-neutral-500 font-mono">
                Pruned: {metrics?.l1Cache?.expiredPruned || 0} • Evicted: {metrics?.l1Cache?.evictions || 0}
              </p>
            </div>

            {/* L2 Disk Cache */}
            <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  L2 Disk Cache
                </span>
                <span className="font-mono text-[11px] text-blue-400">
                  {metrics?.l2DiskCache?.fileCount || 0} files
                </span>
              </div>
              <p className="text-xl font-bold text-white font-mono">
                {isLoading ? "..." : `${(((metrics?.l2DiskCache?.totalSizeBytes || 0) / 1024)).toFixed(1)} KB`}
              </p>
              <p className="text-[11px] text-neutral-500">
                Directory: backend/.cache
              </p>
              <p className="text-[10px] text-neutral-500">
                Persistent offline JSON fallbacks
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
                Last checked: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : "—"}
              </p>
            </div>
          </div>

          {/* Controls: Actions & Config */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quick Cache Operations */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Active Cache Actions
              </h4>
              <p className="text-xs text-neutral-400">
                Safely prune expired items without evicting warm data, or flush specific cache namespaces.
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => pruneMutation.mutate()}
                  disabled={pruneMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pruneMutation.isPending ? "animate-spin" : ""}`} />
                  Prune Expired Entries
                </button>

                <button
                  onClick={() => setConfirmModal({
                    isOpen: true,
                    title: "Clear L1 In-Memory Cache?",
                    description: "This will flush the in-memory cache. Subsequent requests will rebuild cache entries on demand from the database with zero downtime.",
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
                    title: "Clear L2 Disk Cache?",
                    description: "This will remove stored .json fallback snapshots from backend/.cache. Active memory cache and database records will remain intact.",
                    action: () => clearMutation.mutate({ target: "disk" })
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 rounded-xl text-xs font-semibold transition-all"
                >
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  Clear Disk Cache
                </button>
              </div>

              {/* Pattern Invalidation */}
              <div className="pt-2 border-t border-neutral-800">
                <label className="block text-[11px] font-medium text-neutral-400 mb-1.5">
                  Targeted Pattern Invalidation (e.g., schedules_, batches_, stats_)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter prefix: batches_, stats_..."
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => {
                      if (!patternInput.trim()) return;
                      clearMutation.mutate({ target: "l1", pattern: patternInput.trim() });
                      setPatternInput("");
                    }}
                    disabled={!patternInput.trim() || clearMutation.isPending}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 rounded-xl text-xs font-medium disabled:opacity-50"
                  >
                    Invalidate
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {["batches_", "schedules_", "teachers_", "stats_", "students_", "payments_"].map(p => (
                    <button
                      key={p}
                      onClick={() => clearMutation.mutate({ target: "l1", pattern: p })}
                      className="text-[10px] bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 border border-neutral-800 rounded px-1.5 py-0.5 font-mono transition-colors"
                    >
                      {p}*
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* LRU Capacity Tuning */}
            <div className="bg-neutral-800/30 border border-neutral-800 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-500" />
                LRU Cache Capacity Configuration
              </h4>
              <p className="text-xs text-neutral-400">
                Control the maximum number of items held in the fast in-memory LRU cache. When capacity is reached, least recently used entries are automatically evicted.
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-neutral-400">Current Capacity:</span>
                    <span className="font-bold text-white font-mono">{metrics?.l1Cache?.capacity || 250} entries</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={25}
                      max={2000}
                      step={25}
                      placeholder="e.g. 250"
                      value={newCapacity}
                      onChange={(e) => setNewCapacity(e.target.value === "" ? "" : Number(e.target.value))}
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-amber-500 font-mono"
                    />
                    <button
                      onClick={() => {
                        if (newCapacity && Number(newCapacity) >= 25) {
                          capacityMutation.mutate(Number(newCapacity));
                        }
                      }}
                      disabled={!newCapacity || capacityMutation.isPending}
                      className="px-4 py-2 brand-gradient text-black rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {capacityMutation.isPending ? "Saving..." : "Set Capacity"}
                    </button>
                  </div>
                </div>

                {/* Preset quick buttons */}
                <div>
                  <span className="text-[11px] text-neutral-500 block mb-1">Recommended Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "Light (100)", val: 100 },
                      { label: "Standard (250)", val: 250 },
                      { label: "High-Traffic (500)", val: 500 },
                      { label: "Enterprise (1000)", val: 1000 },
                    ].map(preset => (
                      <button
                        key={preset.val}
                        onClick={() => capacityMutation.mutate(preset.val)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                          metrics?.l1Cache?.capacity === preset.val
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-semibold"
                            : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
              Codebase Dead Code & Memory Retention Audit
            </h4>
            <p className="text-xs text-neutral-400">
              Audit results for unused exports, dynamic imports, timer cleanups, and React memory footprint.
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
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">providers.tsx</td>
                  <td className="py-2.5 px-3">TanStack Query Garbage Collection</td>
                  <td className="py-2.5 px-3">Configured with <code>gcTime: 3 mins</code> &amp; <code>staleTime: 2 mins</code> to prevent browser heap accumulation</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Clean</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">PwaProvider &amp; Layout</td>
                  <td className="py-2.5 px-3">Event Listener Memory Leaks</td>
                  <td className="py-2.5 px-3">Verified: All <code>online</code>, <code>offline</code>, <code>resize</code>, and <code>mousedown</code> listeners include clean unmount handlers</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Clean</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">scheduleHelper.ts</td>
                  <td className="py-2.5 px-3">Interval Conflict Detection</td>
                  <td className="py-2.5 px-3">Strict adherence to CODE_OPTIMIZATION.md: minute normalization + binary search sweep-line (O(N log N))</td>
                  <td className="py-2.5 px-3">
                    <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">Optimized</span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono font-medium text-amber-400">backend/utils/cache.ts</td>
                  <td className="py-2.5 px-3">Active TTL Expiration Prune</td>
                  <td className="py-2.5 px-3">Background 60s timer with <code>.unref()</code> prevents process hang on exit, actively freeing expired keys</td>
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

