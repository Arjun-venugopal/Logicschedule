interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleTtlCache {
  private store = new Map<string, CacheEntry<any>>();
  private backupStore = new Map<string, any>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  getStale<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (entry) return entry.data;
    return this.backupStore.get(key) || null;
  }

  set<T>(key: string, data: T, ttlMs: number = 30_000): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    this.backupStore.set(key, data);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clearPattern(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}

export const serverCache = new SimpleTtlCache();

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
  try {
    const filePath = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn(`Failed to save disk cache for ${key}:`, err);
  }
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
