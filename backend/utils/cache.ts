import fs from 'fs';
import path from 'path';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  sizeEstimate?: number;
}

export interface CacheConfig {
  capacity: number;
  cleanupIntervalSeconds: number;
  defaultTtlSeconds: number;
  maxMemoryThresholdMb: number;
  enableMemoryPressureEviction: boolean;
  diskCacheMaxAgeHours: number;
}

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
  expiredPruned: number;
  pressureEvictions: number;
  estimatedSizeBytes: number;
  activeKeys: string[];
  namespaceCounts: Record<string, number>;
}

export interface DiskCacheFile {
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface DiskCacheStats {
  fileCount: number;
  totalSizeBytes: number;
  cacheDir: string;
  files: DiskCacheFile[];
  expiredPruned: number;
}

export interface SystemMemoryMetrics {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  uptimeSeconds: number;
  nodeVersion: string;
  timestamp: string;
  l1Cache: CacheStats;
  l2DiskCache: DiskCacheStats;
  config: CacheConfig;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  capacity: 250,
  cleanupIntervalSeconds: 60,
  defaultTtlSeconds: 30,
  maxMemoryThresholdMb: 384,
  enableMemoryPressureEviction: true,
  diskCacheMaxAgeHours: 24,
};

const CACHE_DIR = path.join(__dirname, '../.cache');
const CONFIG_FILE = path.join(CACHE_DIR, 'cache-config.json');

if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function loadPersistedConfig(): CacheConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return {
        capacity: Math.min(Math.max(25, Number(data.capacity) || 250), 5000),
        cleanupIntervalSeconds: Math.min(Math.max(15, Number(data.cleanupIntervalSeconds) || 60), 600),
        defaultTtlSeconds: Math.min(Math.max(10, Number(data.defaultTtlSeconds) || 30), 300),
        maxMemoryThresholdMb: Math.min(Math.max(128, Number(data.maxMemoryThresholdMb) || 384), 2048),
        enableMemoryPressureEviction: typeof data.enableMemoryPressureEviction === 'boolean' ? data.enableMemoryPressureEviction : true,
        diskCacheMaxAgeHours: Math.min(Math.max(1, Number(data.diskCacheMaxAgeHours) || 24), 168),
      };
    }
  } catch {
    // ignore and fallback to defaults
  }
  return { ...DEFAULT_CACHE_CONFIG };
}

function savePersistedConfig(config: CacheConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('Failed to persist cache config:', err?.message || err);
  }
}

/**
 * High-Performance O(1) LRU Cache with TTL expiration, memory pressure eviction,
 * and active background cleanup.
 */
class LruTtlCache {
  private config: CacheConfig;
  private store = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private expiredPruned: number = 0;
  private pressureEvictions: number = 0;
  private diskPrunedCount: number = 0;

  constructor() {
    this.config = loadPersistedConfig();
    this.initCleanupSchedule();
  }

  private initCleanupSchedule(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    const intervalMs = Math.max(15_000, this.config.cleanupIntervalSeconds * 1000);
    this.cleanupInterval = setInterval(() => {
      this.pruneExpired();
      if (this.config.enableMemoryPressureEviction) {
        this.checkMemoryPressure();
      }
      const diskPrune = pruneExpiredDiskCache(this.config.diskCacheMaxAgeHours * 3600 * 1000);
      this.diskPrunedCount += diskPrune.prunedFiles;
    }, intervalMs);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref(); // Ensure it doesn't prevent graceful shutdown
    }
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.expiredPruned++;
      this.misses++;
      return null;
    }
    // LRU promotion: re-insert key to mark as most recently used (tail of Map)
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.data;
  }

  getStale<T>(key: string): T | null {
    const entry = this.store.get(key);
    return entry ? entry.data : null;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const effectiveTtl = (typeof ttlMs === 'number' && ttlMs > 0)
      ? ttlMs
      : this.config.defaultTtlSeconds * 1000;

    // Check memory pressure before allocation if enabled
    if (this.config.enableMemoryPressureEviction && this.store.size > 20) {
      this.checkMemoryPressure();
    }

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.config.capacity) {
      // First prune any expired entries to free capacity without evicting warm items
      this.pruneExpired();
      while (this.store.size >= this.config.capacity) {
        // Evict least recently used (first item in Map)
        const lruKey = this.store.keys().next().value;
        if (lruKey !== undefined) {
          this.store.delete(lruKey);
          this.evictions++;
        } else {
          break;
        }
      }
    }

    // Rough size estimate: key length * 2 bytes + object base overhead (128 bytes)
    const sizeEstimate = (key.length * 2) + 128;

    this.store.set(key, {
      data,
      expiresAt: Date.now() + effectiveTtl,
      sizeEstimate,
    });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clearPattern(prefix: string): number {
    let count = 0;
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        if (this.store.delete(key)) {
          count++;
        }
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  setCapacity(newCapacity: number): void {
    const validCapacity = Math.min(Math.max(25, Number(newCapacity) || 250), 5000);
    this.config.capacity = validCapacity;
    savePersistedConfig(this.config);

    while (this.store.size > this.config.capacity) {
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
        this.evictions++;
      } else {
        break;
      }
    }
  }

  updateConfig(partialConfig: Partial<CacheConfig>): CacheConfig {
    if (partialConfig.capacity !== undefined) {
      this.config.capacity = Math.min(Math.max(25, Number(partialConfig.capacity) || 250), 5000);
      while (this.store.size > this.config.capacity) {
        const lruKey = this.store.keys().next().value;
        if (lruKey !== undefined) {
          this.store.delete(lruKey);
          this.evictions++;
        } else {
          break;
        }
      }
    }
    if (partialConfig.cleanupIntervalSeconds !== undefined) {
      this.config.cleanupIntervalSeconds = Math.min(Math.max(15, Number(partialConfig.cleanupIntervalSeconds) || 60), 600);
    }
    if (partialConfig.defaultTtlSeconds !== undefined) {
      this.config.defaultTtlSeconds = Math.min(Math.max(10, Number(partialConfig.defaultTtlSeconds) || 30), 300);
    }
    if (partialConfig.maxMemoryThresholdMb !== undefined) {
      this.config.maxMemoryThresholdMb = Math.min(Math.max(128, Number(partialConfig.maxMemoryThresholdMb) || 384), 2048);
    }
    if (partialConfig.enableMemoryPressureEviction !== undefined) {
      this.config.enableMemoryPressureEviction = Boolean(partialConfig.enableMemoryPressureEviction);
    }
    if (partialConfig.diskCacheMaxAgeHours !== undefined) {
      this.config.diskCacheMaxAgeHours = Math.min(Math.max(1, Number(partialConfig.diskCacheMaxAgeHours) || 24), 168);
    }

    savePersistedConfig(this.config);
    this.initCleanupSchedule();
    return { ...this.config };
  }

  getConfig(): CacheConfig {
    return { ...this.config };
  }

  pruneExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    this.expiredPruned += count;
    return count;
  }

  checkMemoryPressure(): boolean {
    try {
      const mem = process.memoryUsage();
      const heapUsedMb = mem.heapUsed / (1024 * 1024);
      const isHighUsage = (heapUsedMb >= this.config.maxMemoryThresholdMb) ||
                          (mem.heapTotal > 0 && (mem.heapUsed / mem.heapTotal) > 0.88);

      if (isHighUsage) {
        this.pruneExpired();
        // If still under high memory pressure, evict the oldest 25% of cache entries
        if (this.store.size > 10) {
          const toEvict = Math.ceil(this.store.size * 0.25);
          let evicted = 0;
          while (this.store.size > 0 && evicted < toEvict) {
            const lruKey = this.store.keys().next().value;
            if (lruKey !== undefined) {
              this.store.delete(lruKey);
              this.pressureEvictions++;
              evicted++;
            } else {
              break;
            }
          }
        }
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const activeKeys = Array.from(this.store.keys());

    // Calculate namespace distributions
    const namespaceCounts: Record<string, number> = {};
    let estimatedSizeBytes = 0;

    for (const key of activeKeys) {
      const prefix = key.split('_')[0] || 'other';
      namespaceCounts[prefix] = (namespaceCounts[prefix] || 0) + 1;
      const entry = this.store.get(key);
      if (entry?.sizeEstimate) {
        estimatedSizeBytes += entry.sizeEstimate;
      }
    }

    return {
      size: this.store.size,
      capacity: this.config.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalRequests > 0 ? parseFloat(((this.hits / totalRequests) * 100).toFixed(1)) : 0,
      evictions: this.evictions,
      expiredPruned: this.expiredPruned,
      pressureEvictions: this.pressureEvictions,
      estimatedSizeBytes,
      activeKeys,
      namespaceCounts,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expiredPruned = 0;
    this.pressureEvictions = 0;
  }

  getDiskPrunedCount(): number {
    return this.diskPrunedCount;
  }
}

export const serverCache = new LruTtlCache();

export function saveDiskCache(key: string, data: any): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  const payload = {
    key,
    savedAt: new Date().toISOString(),
    data,
  };
  // Non-blocking async write to avoid stalling event loop
  fs.promises.writeFile(filePath, JSON.stringify(payload), 'utf8').catch((err) => {
    console.warn(`Failed to save disk cache for ${key}:`, err?.message || err);
  });
}

export function readDiskCache<T>(key: string): T | null {
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      // Support both new envelope and legacy direct payload
      if (parsed && typeof parsed === 'object' && 'data' in parsed && 'savedAt' in parsed) {
        return parsed.data as T;
      }
      return parsed as T;
    }
  } catch (err) {
    console.warn(`Failed to read disk cache for ${key}:`, err);
  }
  return null;
}

export function deleteDiskCache(key: string): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  fs.promises.unlink(filePath).catch(() => {
    // ignore if file doesn't exist
  });
}

export function pruneExpiredDiskCache(maxAgeMs: number = 24 * 3600 * 1000): { prunedFiles: number; freedBytes: number } {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { prunedFiles: 0, freedBytes: 0 };
    }
    const fileNames = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    let prunedFiles = 0;
    let freedBytes = 0;

    for (const name of fileNames) {
      if (!name.endsWith('.json') || name === 'cache-config.json') continue;
      try {
        const filePath = path.join(CACHE_DIR, name);
        const stat = fs.statSync(filePath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs > maxAgeMs) {
          freedBytes += stat.size;
          fs.unlinkSync(filePath);
          prunedFiles++;
        }
      } catch {
        // Skip unreadable files
      }
    }

    return { prunedFiles, freedBytes };
  } catch {
    return { prunedFiles: 0, freedBytes: 0 };
  }
}

export function getDiskCacheStats(): DiskCacheStats {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { fileCount: 0, totalSizeBytes: 0, cacheDir: CACHE_DIR, files: [], expiredPruned: 0 };
    }
    const fileNames = fs.readdirSync(CACHE_DIR);
    let totalSizeBytes = 0;
    const files: DiskCacheFile[] = [];

    for (const name of fileNames) {
      if (!name.endsWith('.json') || name === 'cache-config.json') continue;
      try {
        const filePath = path.join(CACHE_DIR, name);
        const stat = fs.statSync(filePath);
        totalSizeBytes += stat.size;
        files.push({
          name,
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // Skip unreadable files
      }
    }

    return {
      fileCount: files.length,
      totalSizeBytes,
      cacheDir: CACHE_DIR,
      files,
      expiredPruned: serverCache.getDiskPrunedCount(),
    };
  } catch {
    return { fileCount: 0, totalSizeBytes: 0, cacheDir: CACHE_DIR, files: [], expiredPruned: 0 };
  }
}

export function clearAllDiskCache(): { deletedFiles: number; freedBytes: number } {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { deletedFiles: 0, freedBytes: 0 };
    }
    const fileNames = fs.readdirSync(CACHE_DIR);
    let deletedFiles = 0;
    let freedBytes = 0;

    for (const name of fileNames) {
      if (!name.endsWith('.json') || name === 'cache-config.json') continue;
      try {
        const filePath = path.join(CACHE_DIR, name);
        const stat = fs.statSync(filePath);
        freedBytes += stat.size;
        fs.unlinkSync(filePath);
        deletedFiles++;
      } catch {
        // Skip
      }
    }

    return { deletedFiles, freedBytes };
  } catch {
    return { deletedFiles: 0, freedBytes: 0 };
  }
}

export function runManualMemoryCompaction(): {
  prunedL1Entries: number;
  prunedDiskFiles: number;
  freedDiskBytes: number;
  heapFreedBytes: number;
  gcTriggered: boolean;
} {
  const beforeMem = process.memoryUsage().heapUsed;
  const prunedL1 = serverCache.pruneExpired();
  const diskRes = pruneExpiredDiskCache(serverCache.getConfig().diskCacheMaxAgeHours * 3600 * 1000);
  let gcTriggered = false;

  if (typeof (global as any).gc === 'function') {
    try {
      (global as any).gc();
      gcTriggered = true;
    } catch {
      // ignore
    }
  }

  const afterMem = process.memoryUsage().heapUsed;
  return {
    prunedL1Entries: prunedL1,
    prunedDiskFiles: diskRes.prunedFiles,
    freedDiskBytes: diskRes.freedBytes,
    heapFreedBytes: Math.max(0, beforeMem - afterMem),
    gcTriggered,
  };
}

export function getSystemMemoryMetrics(): SystemMemoryMetrics {
  const mem = process.memoryUsage();
  return {
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    rssBytes: mem.rss,
    externalBytes: mem.external,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    l1Cache: serverCache.getStats(),
    l2DiskCache: getDiskCacheStats(),
    config: serverCache.getConfig(),
  };
}
