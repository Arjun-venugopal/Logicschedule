import fs from 'fs';
import path from 'path';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface CacheStats {
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  hitRatio: number;
  evictions: number;
  expiredPruned: number;
  activeKeys: string[];
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
}

/**
 * High-Performance O(1) LRU Cache with TTL expiration and active memory optimization.
 * Evicts least-recently-used items when capacity is reached and actively prunes expired entries.
 */
class LruTtlCache {
  private capacity: number;
  private store = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private expiredPruned: number = 0;

  constructor(capacity: number = 250) {
    this.capacity = Math.max(25, capacity);
    // Active background cleanup of expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.pruneExpired(), 60_000);
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

  set<T>(key: string, data: T, ttlMs: number = 30_000): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // First prune any expired entries to free capacity without evicting warm items
      this.pruneExpired();
      while (this.store.size >= this.capacity) {
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

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
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
    this.capacity = validCapacity;
    while (this.store.size > this.capacity) {
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) {
        this.store.delete(lruKey);
        this.evictions++;
      } else {
        break;
      }
    }
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

  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    return {
      size: this.store.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalRequests > 0 ? parseFloat(((this.hits / totalRequests) * 100).toFixed(1)) : 0,
      evictions: this.evictions,
      expiredPruned: this.expiredPruned,
      activeKeys: Array.from(this.store.keys()),
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.expiredPruned = 0;
  }
}

export const serverCache = new LruTtlCache(250);

const CACHE_DIR = path.join(__dirname, '../.cache');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

export function saveDiskCache(key: string, data: any): void {
  const filePath = path.join(CACHE_DIR, `${key}.json`);
  // Non-blocking async write to avoid stalling event loop
  fs.promises.writeFile(filePath, JSON.stringify(data), 'utf8').catch((err) => {
    console.warn(`Failed to save disk cache for ${key}:`, err?.message || err);
  });
}

export function readDiskCache<T>(key: string): T | null {
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as T;
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

export function getDiskCacheStats(): DiskCacheStats {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      return { fileCount: 0, totalSizeBytes: 0, cacheDir: CACHE_DIR, files: [] };
    }
    const fileNames = fs.readdirSync(CACHE_DIR);
    let totalSizeBytes = 0;
    const files: DiskCacheFile[] = [];

    for (const name of fileNames) {
      if (!name.endsWith('.json')) continue;
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
    };
  } catch {
    return { fileCount: 0, totalSizeBytes: 0, cacheDir: CACHE_DIR, files: [] };
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
      if (!name.endsWith('.json')) continue;
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
  };
}
