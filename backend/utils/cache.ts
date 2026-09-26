interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * High-Performance O(1) LRU Cache with TTL expiration.
 * Evicts least-recently-used items when capacity is reached.
 */
class LruTtlCache {
  private capacity: number;
  private store = new Map<string, CacheEntry<any>>();
  private backupStore = new Map<string, any>();

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU promotion: re-insert key to mark as most recently used (tail of Map)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  getStale<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (entry) return entry.data;
    return this.backupStore.get(key) || null;
  }

  set<T>(key: string, data: T, ttlMs: number = 30_000): void {
    // If key already exists, refresh its position
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict least recently used (first item in Map)
      const lruKey = this.store.keys().next().value;
      if (lruKey !== undefined) this.store.delete(lruKey);
    }

    if (this.backupStore.has(key)) {
      this.backupStore.delete(key);
    } else if (this.backupStore.size >= this.capacity) {
      const lruBackupKey = this.backupStore.keys().next().value;
      if (lruBackupKey !== undefined) this.backupStore.delete(lruBackupKey);
    }

    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    this.backupStore.set(key, data);
  }

  delete(key: string): void {
    this.store.delete(key);
    this.backupStore.delete(key);
  }

  clearPattern(prefix: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
    for (const key of Array.from(this.backupStore.keys())) {
      if (key.startsWith(prefix)) {
        this.backupStore.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.backupStore.clear();
  }
}

export const serverCache = new LruTtlCache(1000);

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(__dirname, '../.cache');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (err) {
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
