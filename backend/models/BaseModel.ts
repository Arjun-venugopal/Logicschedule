import { getSupabase } from '../config/supabase';
import crypto from 'crypto';

const tableColumns: Record<string, string[]> = {
  users: ['_id', 'name', 'email', 'password', 'role', 'mustChangePassword', 'permissions', 'isVerified', 'verificationToken', 'verificationExpires', 'resetPasswordToken', 'resetPasswordExpires', 'failedLoginAttempts', 'lockUntil', 'createdAt', 'updatedAt', 'data'],
  teachers: ['_id', 'user', 'subjects', 'batches', 'dutyStatusSchedule', 'status', 'timing', 'createdAt', 'updatedAt', 'data'],
  batches: ['_id', 'name', 'subject', 'assignedTeacher', 'replacementTeacher', 'students', 'schedule', 'timing', 'status', 'createdAt', 'updatedAt', 'data'],
  students: ['_id', 'name', 'email', 'phone', 'batch', 'status', 'assignedTutor', 'createdAt', 'updatedAt', 'data'],
  schedules: ['_id', 'batch', 'teacher', 'date', 'startTime', 'endTime', 'status', 'attendance', 'createdAt', 'updatedAt', 'data'],
  demoSlots: ['_id', 'teacher', 'date', 'startTime', 'endTime', 'status', 'createdAt', 'updatedAt', 'data'],
  demos: ['_id', 'slot', 'student', 'teacher', 'salesPerson', 'status', 'notes', 'report', 'createdAt', 'updatedAt', 'data'],
  demoReports: ['_id', 'session', 'feedback', 'status', 'createdAt', 'updatedAt', 'data'],
};

function convertTimestampsInPlace(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object' || obj instanceof Date) {
    return obj;
  }
  if (typeof obj.toDate === 'function') {
    return obj.toDate();
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = convertTimestampsInPlace(obj[i]);
    }
    return obj;
  }
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete obj[key];
      continue;
    }
    obj[key] = convertTimestampsInPlace(obj[key]);
  }
  return obj;
}

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  const clean: any = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    clean[key] = sanitizeObject(obj[key]);
  }
  return clean;
}

function applySelect(doc: any, selectStr?: string): any {
  if (!doc || !selectStr || typeof selectStr !== 'string') return doc;
  const fields = selectStr.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return doc;

  const isExclusion = fields.every(f => f.startsWith('-'));
  const isExplicitInclusion = fields.some(f => !f.startsWith('-'));

  if (isExclusion) {
    const excludeKeys = new Set(fields.map(f => f.replace(/^-/, '')));
    for (const key of excludeKeys) {
      delete doc[key];
    }
    return doc;
  }

  if (isExplicitInclusion) {
    const includeKeys = new Set(fields.filter(f => !f.startsWith('-')));
    if (!fields.includes('-_id')) {
      includeKeys.add('_id');
    }
    const keys = Object.keys(doc);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!includeKeys.has(key)) {
        delete doc[key];
      }
    }
    return doc;
  }

  return doc;
}

function getNestedValues(obj: any, path: string): any[] {
  if (!obj || typeof obj !== 'object') return [];
  const parts = path.split('.');
  let current: any[] = [obj];

  for (const part of parts) {
    const next: any[] = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;
      if (Array.isArray(item)) {
        for (const sub of item) {
          if (sub && sub[part] !== undefined) {
            next.push(sub[part]);
          }
        }
      } else if (item[part] !== undefined) {
        if (Array.isArray(item[part])) {
          next.push(...item[part]);
        } else {
          next.push(item[part]);
        }
      }
    }
    current = next;
  }
  return current;
}

function getCollectionNameForPath(path: string): string {
  if (
    path === 'assignedTeacher' ||
    path === 'teacher' ||
    path === 'replacementTeacher' ||
    path === 'classAssignedTutor' ||
    path.endsWith('.teacher') ||
    path.endsWith('.assignedTeacher')
  ) {
    return 'teachers';
  }
  if (path === 'batch' || path.endsWith('.batch')) {
    return 'batches';
  }
  if (path === 'user' || path.endsWith('.user')) {
    return 'users';
  }
  if (path === 'student' || path.endsWith('.student')) {
    return 'students';
  }
  return '';
}

function matchesCondition(item: any, key: string, filterVal: any): boolean {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;

  if (key.includes('.')) {
    const vals = getNestedValues(item, key);
    if (vals.length === 0) {
      if (filterVal !== null && typeof filterVal === 'object' && filterVal.$exists === false) {
        return true;
      }
      return false;
    }
    return vals.some(v => matchesCondition({ temp: v }, 'temp', filterVal));
  }

  const itemVal = item ? item[key] : undefined;

  if (filterVal !== null && typeof filterVal === 'object' && !(filterVal instanceof Date) && !Array.isArray(filterVal)) {
    // Regex operator
    if (filterVal.$regex !== undefined) {
      const flags = filterVal.$options || 'i';
      let regex: RegExp;
      if (filterVal.$regex instanceof RegExp) {
        regex = filterVal.$regex;
      } else {
        const patternStr = String(filterVal.$regex);
        if (patternStr.length > 250) return false;
        try {
          regex = new RegExp(patternStr, flags);
        } catch {
          return false;
        }
      }
      if (!regex.test(itemVal !== null && itemVal !== undefined ? String(itemVal) : '')) return false;
    }

    // $ne operator
    if (filterVal.$ne !== undefined) {
      const expected = filterVal.$ne;
      if (expected === null || expected === undefined) {
        if (itemVal === null || itemVal === undefined) return false;
      } else if (expected instanceof Date && itemVal) {
        const eTime = expected.getTime();
        const iTime = typeof itemVal.toDate === 'function' ? itemVal.toDate().getTime() : (itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime());
        if (!isNaN(eTime) && !isNaN(iTime) && eTime === iTime) return false;
      } else {
        if (itemVal === expected || itemVal?.toString() === expected?.toString()) return false;
      }
    }

    // $in operator
    if (filterVal.$in && Array.isArray(filterVal.$in)) {
      const matched = filterVal.$in.some((v: any) => {
        if (v === itemVal || v?.toString() === itemVal?.toString()) return true;
        if (v instanceof Date && itemVal) {
          const vTime = v.getTime();
          const iTime = typeof itemVal.toDate === 'function' ? itemVal.toDate().getTime() : (itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime());
          if (!isNaN(vTime) && !isNaN(iTime) && vTime === iTime) return true;
        }
        return false;
      });
      if (!matched) return false;
    }

    // $nin operator
    if (filterVal.$nin && Array.isArray(filterVal.$nin)) {
      const matched = filterVal.$nin.some((v: any) => {
        if (v === itemVal || v?.toString() === itemVal?.toString()) return true;
        if (v instanceof Date && itemVal) {
          const vTime = v.getTime();
          const iTime = typeof itemVal.toDate === 'function' ? itemVal.toDate().getTime() : (itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime());
          if (!isNaN(vTime) && !isNaN(iTime) && vTime === iTime) return true;
        }
        return false;
      });
      if (matched) return false;
    }

    // $exists operator
    if (filterVal.$exists !== undefined) {
      const exists = itemVal !== undefined && itemVal !== null;
      if (exists !== Boolean(filterVal.$exists)) return false;
    }

    // Range operators: $gte, $gt, $lte, $lt
    if (filterVal.$gte !== undefined || filterVal.$lte !== undefined || filterVal.$gt !== undefined || filterVal.$lt !== undefined) {
      let val = itemVal;

      const parseDateToEpoch = (v: any): number | null => {
        if (v === null || v === undefined) return null;
        if (typeof v.toDate === 'function') return v.toDate().getTime();
        if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
          const parsed = new Date(v).getTime();
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      };

      const valEpoch = parseDateToEpoch(val);
      const isDateRange = (filterVal.$gte instanceof Date) || 
                          (filterVal.$lte instanceof Date) || 
                          (filterVal.$gt instanceof Date) || 
                          (filterVal.$lt instanceof Date) || 
                          (valEpoch !== null && (
                            (typeof filterVal.$gte === 'string' && /^\d{4}-\d{2}-\d{2}/.test(filterVal.$gte)) ||
                            (typeof filterVal.$lte === 'string' && /^\d{4}-\d{2}-\d{2}/.test(filterVal.$lte)) ||
                            (typeof filterVal.$gt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(filterVal.$gt)) ||
                            (typeof filterVal.$lt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(filterVal.$lt))
                          ));

      if (isDateRange) {
        if (valEpoch === null) return false;
        val = valEpoch;

        const toEpoch = (fVal: any): number => {
          const p = parseDateToEpoch(fVal);
          return p !== null ? p : (typeof fVal === 'number' ? fVal : new Date(fVal).getTime());
        };

        if (filterVal.$gte !== undefined && val < toEpoch(filterVal.$gte)) return false;
        if (filterVal.$gt !== undefined && val <= toEpoch(filterVal.$gt)) return false;
        if (filterVal.$lte !== undefined && val > toEpoch(filterVal.$lte)) return false;
        if (filterVal.$lt !== undefined && val >= toEpoch(filterVal.$lt)) return false;
      } else {
        if (typeof val === 'number') {
          if (filterVal.$gte !== undefined && val < Number(filterVal.$gte)) return false;
          if (filterVal.$gt !== undefined && val <= Number(filterVal.$gt)) return false;
          if (filterVal.$lte !== undefined && val > Number(filterVal.$lte)) return false;
          if (filterVal.$lt !== undefined && val >= Number(filterVal.$lt)) return false;
        } else {
          if (filterVal.$gte !== undefined && val < filterVal.$gte) return false;
          if (filterVal.$gt !== undefined && val <= filterVal.$gt) return false;
          if (filterVal.$lte !== undefined && val > filterVal.$lte) return false;
          if (filterVal.$lt !== undefined && val >= filterVal.$lt) return false;
        }
      }
    }

    return true;
  }

  // Exact equality
  if (filterVal instanceof Date) {
    if (!itemVal) return false;
    const fTime = filterVal.getTime();
    const iTime = typeof itemVal.toDate === 'function' ? itemVal.toDate().getTime() : (itemVal instanceof Date ? itemVal.getTime() : new Date(itemVal).getTime());
    return (!isNaN(fTime) && !isNaN(iTime) && fTime === iTime);
  }

  if (typeof filterVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(filterVal)) {
    const fDate = filterVal.split('T')[0];
    const iDate = typeof itemVal === 'string'
      ? itemVal.split('T')[0]
      : (itemVal instanceof Date ? itemVal.toISOString().split('T')[0] : null);
    if (fDate && iDate && fDate === iDate) return true;
  }

  if (itemVal === filterVal || itemVal?.toString() === filterVal?.toString()) {
    return true;
  }

  return false;
}

function matchesAllFilters(item: any, filters: any): boolean {
  if (!filters || Object.keys(filters).length === 0) return true;

  if (filters.$or && Array.isArray(filters.$or)) {
    const orMatched = filters.$or.some((orClause: any) => matchesAllFilters(item, orClause));
    if (!orMatched) return false;
  }

  if (filters.$and && Array.isArray(filters.$and)) {
    const andMatched = filters.$and.every((andClause: any) => matchesAllFilters(item, andClause));
    if (!andMatched) return false;
  }

  for (const key of Object.keys(filters)) {
    if (key === '$or' || key === '$and') continue;
    if (!matchesCondition(item, key, filters[key])) {
      return false;
    }
  }

  return true;
}

const modelRegistry = new WeakMap<any, BaseModel>();
const allModels: Record<string, BaseModel> = {};

class FirestoreDocument {
  _id?: string;
  [key: string]: any;

  private _getModel(): BaseModel | undefined {
    return modelRegistry.get(this) || (this as any)._model || allModels[(this as any)._collectionName];
  }

  toObject() {
    const clean: any = {};
    const keys = Object.keys(this);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || typeof this[key] === 'function') {
        continue;
      }
      clean[key] = this[key];
    }
    return clean;
  }

  toJSON() {
    return this.toObject();
  }

  async populate(path: string | any[], select?: string): Promise<any> {
    const model = this._getModel();
    if (!model) return this;
    const populates: { path: string; select: string }[] = [];
    if (Array.isArray(path)) {
      for (const p of path) {
        if (typeof p === 'string') {
          populates.push({ path: p, select: '' });
        } else if (p && p.path) {
          populates.push({ path: p.path, select: p.select || '' });
        }
      }
    } else if (path) {
      populates.push({ path, select: select || '' });
    }
    return await (model as any)._applyPopulates(this, populates);
  }

  async deleteOne(): Promise<void> {
    const model = this._getModel();
    if (!model || !this._id) return;
    await model.deleteOne({ _id: this._id });
  }

  async remove(): Promise<void> {
    await this.deleteOne();
  }

  async save() {
    const model = this._getModel();
    if (!model || !this._id) return this;
    const updateData: any = {};
    const keys = Object.keys(this);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === '_id' || key === '__proto__' || key === 'constructor' || key === 'prototype' || typeof this[key] === 'function') {
        continue;
      }
      const val = this[key];
      if (val && typeof val === 'object' && val._id && !(val instanceof Date)) {
        updateData[key] = val._id;
      } else if (Array.isArray(val)) {
        updateData[key] = val.map((item: any) => {
          if (item && typeof item === 'object') {
            const cleanItem: any = { ...item };
            if (cleanItem.batch && typeof cleanItem.batch === 'object' && cleanItem.batch._id) {
              if (!cleanItem.batchName && cleanItem.batch.name) cleanItem.batchName = cleanItem.batch.name;
              if (!cleanItem.batchSubject && cleanItem.batch.subject) cleanItem.batchSubject = cleanItem.batch.subject;
              cleanItem.batch = cleanItem.batch._id;
            }
            return cleanItem;
          }
          return item;
        });
      } else {
        updateData[key] = val;
      }
    }
    invalidatePopulateCache(model.collectionName);
    const now = new Date().toISOString();
    const validCols = new Set(tableColumns[model.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);
    const row: any = {
      data: { ...(this as any), ...updateData },
      updatedAt: now,
    };
    for (const k of Object.keys(updateData)) {
      if (validCols.has(k)) row[k] = updateData[k];
    }
    await getSupabase().from(model.collectionName).update(row).eq('_id', this._id);
    return this;
  }
}

const MAX_POPULATE_CACHE_SIZE = 250;
const populateGlobalCache = new Map<string, { doc: any; timestamp: number }>();
const POPULATE_CACHE_TTL_MS = 15000;

function getCachedPopDoc(collectionName: string, id: string): any | null {
  const key = `${collectionName}_${id}`;
  const entry = populateGlobalCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp < POPULATE_CACHE_TTL_MS) {
    return entry.doc;
  }
  populateGlobalCache.delete(key);
  return null;
}

function setCachedPopDoc(collectionName: string, id: string, doc: any) {
  const key = `${collectionName}_${id}`;
  if (populateGlobalCache.size >= MAX_POPULATE_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, v] of populateGlobalCache.entries()) {
      if (now - v.timestamp >= POPULATE_CACHE_TTL_MS) {
        populateGlobalCache.delete(k);
      }
    }
    if (populateGlobalCache.size >= MAX_POPULATE_CACHE_SIZE) {
      const oldestKey = populateGlobalCache.keys().next().value;
      if (oldestKey !== undefined) populateGlobalCache.delete(oldestKey);
    }
  }
  populateGlobalCache.set(key, { doc, timestamp: Date.now() });
}

function invalidatePopulateCache(collectionName: string) {
  const prefix = `${collectionName}_`;
  for (const k of populateGlobalCache.keys()) {
    if (k.startsWith(prefix)) {
      populateGlobalCache.delete(k);
    }
  }
}

export class BaseModel {
  collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
    allModels[collectionName] = this;
  }

  private _attachMethods(doc: any) {
    if (!doc || typeof doc !== 'object') return doc;
    Object.setPrototypeOf(doc, FirestoreDocument.prototype);
    modelRegistry.set(doc, this);
    try {
      Object.defineProperty(doc, '_collectionName', {
        value: this.collectionName,
        writable: true,
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(doc, '_model', {
        value: this,
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch {}
    return doc;
  }

  // Helper to create a lazy query object
  private _makeLazyQuery(queryObj: any, isCount: boolean, isFindOne: boolean, isFindById: boolean, id?: string) {
    const chain: any = {
      _populates: [] as { path: string, select: string }[],
      _sort: null as any,
      _limit: null as number | null,
      _startAfter: null as string | null,
      _select: null as string | null,
      _lean: false as boolean,
      
      populate: (path: string | any[], select?: string) => {
        if (Array.isArray(path)) {
          for (const p of path) {
            if (typeof p === 'string') {
              chain._populates.push({ path: p, select: '' });
            } else if (p && p.path) {
              chain._populates.push({ path: p.path, select: p.select || '' });
            }
          }
        } else if (path) {
          chain._populates.push({ path, select: select || '' });
        }
        return chain;
      },
      select: (fields: string) => {
        chain._select = fields;
        return chain;
      },
      lean: () => {
        chain._lean = true;
        return chain;
      },
      sort: (obj: any) => {
        chain._sort = obj;
        return chain;
      },
      limit: (n: number) => {
        chain._limit = n;
        return chain;
      },
      startAfter: (docId: string) => {
        chain._startAfter = docId;
        return chain;
      },
      
      // Execute the query when awaited
      then: (resolve: any, reject: any) => {
        chain.execute().then(resolve).catch(reject);
      },
      catch: (reject: any) => {
        chain.execute().catch(reject);
      },

      execute: async () => {
        if (isCount) {
          return await this._executeCount(queryObj);
        }
        if (isFindById) {
          if (!id) return null;
          const { data, error } = await getSupabase().from(this.collectionName).select('*').eq('_id', id).maybeSingle();
          if (error || !data) return null;
          let result: any = { ...(data.data || {}), ...data, _id: data._id };
          delete result.data;
          convertTimestampsInPlace(result);
          if (chain._select) applySelect(result, chain._select);
          if (!chain._lean) result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        const effectiveLimit = isFindOne ? 1 : chain._limit;
        let results = await this._fetchAndFilter(queryObj, effectiveLimit, chain._sort, chain._startAfter, isFindOne);
        if (isFindOne) {
          if (results.length === 0) return null;
          let result = results[0];
          if (chain._select) applySelect(result, chain._select);
          if (!chain._lean) result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        if (chain._select) {
          results.forEach((r: any) => applySelect(r, chain._select));
        }
        if (!chain._lean) {
          results = results.map((r: any) => this._attachMethods(r));
        }

        // Apply populates to all results efficiently using pre-batched cache
        if (chain._populates.length > 0) {
          const populateCache: Record<string, Promise<any>> = {};

          // Pre-collect unique document IDs for each path
          for (const pop of chain._populates) {
            const path = pop.path;
            const collectionName = getCollectionNameForPath(path);

            if (collectionName) {
              const uniqueIds = new Set<string>();
              for (let i = 0; i < results.length; i++) {
                if (path.includes('.')) {
                  const parts = path.split('.');
                  const parentProp = parts[0];
                  const childProp = parts[1];
                  const container = results[i][parentProp];
                  if (Array.isArray(container)) {
                    for (const elem of container) {
                      if (elem) {
                        const targetVal = elem[childProp];
                        const idVal = typeof targetVal === 'string' ? targetVal.trim() : (targetVal && typeof targetVal === 'object' && targetVal._id ? targetVal._id : null);
                        if (typeof idVal === 'string' && idVal.trim()) {
                          uniqueIds.add(idVal.trim());
                        }
                      }
                    }
                  } else if (container && typeof container === 'object') {
                    const targetVal = container[childProp];
                    const idVal = typeof targetVal === 'string' ? targetVal.trim() : (targetVal && typeof targetVal === 'object' && targetVal._id ? targetVal._id : null);
                    if (typeof idVal === 'string' && idVal.trim()) {
                      uniqueIds.add(idVal.trim());
                    }
                  }
                } else {
                  const idVal = results[i][path];
                  if (typeof idVal === 'string' && idVal.trim()) {
                    uniqueIds.add(idVal.trim());
                  }
                }
              }

              if (uniqueIds.size > 0) {
                const uncachedIds: string[] = [];
                for (const id of uniqueIds) {
                  const cached = getCachedPopDoc(collectionName, id);
                  if (cached) {
                    const docObj: any = { ...cached };
                    if (pop.select) {
                      applySelect(docObj, pop.select);
                    }
                    populateCache[`${collectionName}_${id}`] = Promise.resolve(docObj);
                  } else {
                    uncachedIds.push(id);
                  }
                }

                if (uncachedIds.length > 0) {
                  const chunkSize = 100;
                  for (let i = 0; i < uncachedIds.length; i += chunkSize) {
                    const chunkIds = uncachedIds.slice(i, i + chunkSize);
                    const sb = getSupabase();
                    const batchPromise = Promise.resolve(sb.from(collectionName).select('*').in('_id', chunkIds)).then(({ data, error }) => {
                      const map = new Map<string, any>();
                      if (!error && data) {
                        data.forEach((row: any) => {
                          const rawObj: any = { ...(row.data || {}), ...row, _id: row._id };
                          delete rawObj.data;
                          convertTimestampsInPlace(rawObj);
                          if (collectionName === 'users') {
                            delete rawObj.password;
                          }
                          setCachedPopDoc(collectionName, row._id, rawObj);
                          const docObj: any = { ...rawObj };
                          if (pop.select) {
                            applySelect(docObj, pop.select);
                          }
                          map.set(row._id, docObj);
                        });
                      }
                      return map;
                    }).catch((err: any) => {
                      console.error(`Batched Supabase populate error for ${collectionName}:`, err);
                      return new Map<string, any>();
                    });

                    chunkIds.forEach(refId => {
                      const cacheKey = `${collectionName}_${refId}`;
                      populateCache[cacheKey] = batchPromise.then(map => map.get(refId) || null);
                    });
                  }
                }
              }
            }
          }

          results = await Promise.all(results.map((r: any) => this._applyPopulates(r, chain._populates, populateCache)));
        }
        return results;
      }
    };

    return chain;
  }

  // Execute count with native PostgREST head request when possible, falling back to in-memory filter
  private async _executeCount(query: any = {}): Promise<number> {
    try {
      const keys = Object.keys(query || {});
      const validCols = new Set(tableColumns[this.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);

      const canUseNativeCount = keys.every(k => {
        if (!validCols.has(k)) return false;
        const val = query[k];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return true;
        if (val instanceof Date) return true;
        if (val && typeof val === 'object') {
          if (val.$in && Array.isArray(val.$in) && val.$in.length <= 50) return true;
          if (val.$ne !== undefined && typeof val.$ne !== 'object') return true;
          if (val.$gte !== undefined || val.$lte !== undefined || val.$gt !== undefined || val.$lt !== undefined) return true;
        }
        return false;
      });

      if (canUseNativeCount) {
        let q = getSupabase().from(this.collectionName).select('*', { count: 'exact', head: true });
        for (const k of keys) {
          const val = query[k];
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            q = q.eq(k, val);
          } else if (val instanceof Date) {
            q = q.eq(k, val.toISOString());
          } else if (val && typeof val === 'object') {
            if (val.$in && Array.isArray(val.$in)) {
              q = q.in(k, val.$in);
            }
            if (val.$ne !== undefined) {
              q = q.neq(k, val.$ne);
            }
            if (val.$gte !== undefined) {
              q = q.gte(k, val.$gte instanceof Date ? val.$gte.toISOString() : val.$gte);
            }
            if (val.$gt !== undefined) {
              q = q.gt(k, val.$gt instanceof Date ? val.$gt.toISOString() : val.$gt);
            }
            if (val.$lte !== undefined) {
              q = q.lte(k, val.$lte instanceof Date ? val.$lte.toISOString() : val.$lte);
            }
            if (val.$lt !== undefined) {
              q = q.lt(k, val.$lt instanceof Date ? val.$lt.toISOString() : val.$lt);
            }
          }
        }
        const { count, error } = await q;
        if (!error && count !== null && count !== undefined) {
          return count;
        }
      }
    } catch {
      // In case of any network or postgrest issue, fall through to in-memory filter
    }

    const docs = await this._fetchAndFilter(query, null, null);
    return docs.length;
  }

  // Population implementation
  async _applyPopulates(doc: any, populates: { path: string, select: string }[], cache?: Record<string, Promise<any>>): Promise<any> {
    if (!doc) return doc;
    
    for (const pop of populates) {
      const path = pop.path;
      const collectionName = getCollectionNameForPath(path);
      if (!collectionName) continue;

      const fetchPopDoc = async (id: string) => {
        const cached = getCachedPopDoc(collectionName, id);
        if (cached) {
          const obj: any = { ...cached };
          if (pop.select) applySelect(obj, pop.select);
          return obj;
        }

        const sb = getSupabase();
        if (cache) {
          const cacheKey = `${collectionName}_${id}`;
          if (!cache[cacheKey]) {
            cache[cacheKey] = Promise.resolve(sb.from(collectionName).select('*').eq('_id', id).maybeSingle()).then(({ data, error }: any) => {
              if (error || !data) return null;
              const rawObj: any = { ...(data.data || {}), ...data, _id: data._id };
              delete rawObj.data;
              convertTimestampsInPlace(rawObj);
              if (collectionName === 'users') delete rawObj.password;
              setCachedPopDoc(collectionName, data._id, rawObj);
              const obj: any = { ...rawObj };
              if (pop.select) applySelect(obj, pop.select);
              return obj;
            });
          }
          return await cache[cacheKey];
        } else {
          const { data, error } = await sb.from(collectionName).select('*').eq('_id', id).maybeSingle();
          if (error || !data) return null;
          const rawObj: any = { ...(data.data || {}), ...data, _id: data._id };
          delete rawObj.data;
          convertTimestampsInPlace(rawObj);
          if (collectionName === 'users') delete rawObj.password;
          setCachedPopDoc(collectionName, data._id, rawObj);
          const obj: any = { ...rawObj };
          if (pop.select) applySelect(obj, pop.select);
          return obj;
        }
      };

      if (path.includes('.')) {
        const parts = path.split('.');
        const parentProp = parts[0];
        const childProp = parts[1];
        if (doc[parentProp]) {
          if (Array.isArray(doc[parentProp])) {
            for (let idx = 0; idx < doc[parentProp].length; idx++) {
              const item = doc[parentProp][idx];
              if (!item) continue;
              const targetVal = item[childProp];
              const docId = typeof targetVal === 'string' ? targetVal.trim() : (targetVal && typeof targetVal === 'object' && targetVal._id ? targetVal._id : null);
              if (docId) {
                const popDoc = await fetchPopDoc(docId);
                if (popDoc) {
                  item[childProp] = popDoc;
                }
              }
            }
          } else if (typeof doc[parentProp] === 'object') {
            const targetVal = doc[parentProp][childProp];
            const docId = typeof targetVal === 'string' ? targetVal.trim() : (targetVal && typeof targetVal === 'object' && targetVal._id ? targetVal._id : null);
            if (docId) {
              const popDoc = await fetchPopDoc(docId);
              if (popDoc) {
                doc[parentProp][childProp] = popDoc;
              }
            }
          }
        }
      } else {
        if (!doc[path]) continue;
        if (Array.isArray(doc[path])) {
          for (let idx = 0; idx < doc[path].length; idx++) {
            const item = doc[path][idx];
            if (!item) continue;
            const docId = typeof item === 'string' ? item.trim() : (item && typeof item === 'object' && item._id ? String(item._id).trim() : null);
            if (docId) {
              const popDoc = await fetchPopDoc(docId);
              if (popDoc) doc[path][idx] = popDoc;
            }
          }
        } else {
          const targetVal = doc[path];
          const docId = typeof targetVal === 'string' ? targetVal.trim() : (targetVal && typeof targetVal === 'object' && targetVal._id ? String(targetVal._id).trim() : null);
          if (docId) {
            const popDoc = await fetchPopDoc(docId);
            if (popDoc) doc[path] = popDoc;
          }
        }
      }
    }
    return doc;
  }

  async _fetchAndFilter(
    query: any = {}, 
    limitOpt: number | null, 
    sortOpt: any, 
    _startAfterOpt?: string | null,
    isFindOne: boolean = false
  ): Promise<any[]> {
    const sb = getSupabase();
    let q = sb.from(this.collectionName).select('*');
    
    const validCols = new Set(tableColumns[this.collectionName] || ['_id']);
    const queryKeys = Object.keys(query);
    let allKeysPushed = true;

    for (let i = 0; i < queryKeys.length; i++) {
      const key = queryKeys[i];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '$or' || key === '$and') {
        allKeysPushed = false;
        continue;
      }

      // Only push filter down to PostgreSQL if the column actually exists in the table schema
      if (!validCols.has(key)) {
        allKeysPushed = false;
        continue;
      }

      const val = query[key];
      if (val instanceof Date) {
        q = q.eq(key, val.toISOString());
      } else if (val !== null && typeof val === 'object') {
        if (val.$in && Array.isArray(val.$in) && val.$in.length > 0 && val.$in.length <= 50) {
          q = q.in(key, val.$in);
        } else if (val.$ne !== undefined && typeof val.$ne !== 'object') {
          q = q.neq(key, val.$ne);
        }
        if (val.$gte !== undefined) {
          const v = val.$gte instanceof Date ? val.$gte.toISOString() : val.$gte;
          q = q.gte(key, v);
        }
        if (val.$gt !== undefined) {
          const v = val.$gt instanceof Date ? val.$gt.toISOString() : val.$gt;
          q = q.gt(key, v);
        }
        if (val.$lte !== undefined) {
          const v = val.$lte instanceof Date ? val.$lte.toISOString() : val.$lte;
          q = q.lte(key, v);
        }
        if (val.$lt !== undefined) {
          const v = val.$lt instanceof Date ? val.$lt.toISOString() : val.$lt;
          q = q.lt(key, v);
        }
      } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        q = q.eq(key, val);
      }
    }

    if (sortOpt) {
      const sortKey = Object.keys(sortOpt)[0];
      if (validCols.has(sortKey)) {
        const ascending = sortOpt[sortKey] === 1 || sortOpt[sortKey] === 'asc';
        q = q.order(sortKey, { ascending });
      }
    }

    if (isFindOne && allKeysPushed) {
      q = q.limit(1);
    } else if (limitOpt && allKeysPushed && (!sortOpt || validCols.has(Object.keys(sortOpt)[0]))) {
      q = q.limit(limitOpt);
    }

    const { data, error } = await q;
    if (error) {
      console.error(`Supabase query error on ${this.collectionName}:`, error.message);
      throw error;
    }

    const items = (data || []).map((row: any) => {
      const item = { ...(row.data || {}), ...row, _id: row._id };
      delete item.data;
      convertTimestampsInPlace(item);
      return item;
    });

    const results: any[] = [];
    const targetLimit = isFindOne ? 1 : limitOpt;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!matchesAllFilters(item, query)) continue;
      results.push(item);
      if (targetLimit && !sortOpt && results.length >= targetLimit) break;
    }

    if (sortOpt) {
      const sortKey = Object.keys(sortOpt)[0];
      const dir = sortOpt[sortKey] === -1 || sortOpt[sortKey] === 'desc' ? -1 : 1;
      results.sort((a: any, b: any) => {
        if (a[sortKey] < b[sortKey]) return -1 * dir;
        if (a[sortKey] > b[sortKey]) return 1 * dir;
        return 0;
      });
    }

    if (limitOpt && results.length > limitOpt) {
      return results.slice(0, limitOpt);
    }

    return results;
  }

  find(query: any = {}): any {
    return this._makeLazyQuery(query, false, false, false);
  }

  findOne(query: any): any {
    return this._makeLazyQuery(query, false, true, false);
  }

  findById(id: string): any {
    if (!id) return this._makeLazyQuery({}, false, false, true, '');
    return this._makeLazyQuery({}, false, false, true, id);
  }

  async create(data: any): Promise<any> {
    invalidatePopulateCache(this.collectionName);
    const cleanData = sanitizeObject(data);
    delete cleanData._id;
    const newId = data._id || crypto.randomUUID();
    const now = new Date().toISOString();
    const validCols = new Set(tableColumns[this.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);
    const row: any = {
      _id: newId,
      data: cleanData,
      createdAt: now,
      updatedAt: now,
    };
    for (const k of Object.keys(cleanData)) {
      if (validCols.has(k)) row[k] = cleanData[k];
    }
    const { error } = await getSupabase().from(this.collectionName).insert(row);
    if (error) throw error;
    const newDoc = { ...cleanData, _id: newId };
    return this._attachMethods(newDoc);
  }

  async updateOne(query: any, data: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, 1, null, null, true).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      invalidatePopulateCache(this.collectionName);
      const cleanData = sanitizeObject(data.$set || data);
      delete cleanData._id;
      const now = new Date().toISOString();
      const validCols = new Set(tableColumns[this.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);
      const row: any = {
        data: { ...doc, ...cleanData },
        updatedAt: now,
      };
      for (const k of Object.keys(cleanData)) {
        if (validCols.has(k)) row[k] = cleanData[k];
      }
      await getSupabase().from(this.collectionName).update(row).eq('_id', doc._id);
    }
  }

  async deleteOne(query: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, 1, null, null, true).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      invalidatePopulateCache(this.collectionName);
      await getSupabase().from(this.collectionName).delete().eq('_id', doc._id);
    }
  }

  async deleteMany(query: any): Promise<void> {
    invalidatePopulateCache(this.collectionName);
    const docs = await this._fetchAndFilter(query, null, null);
    const ids = docs.map(d => d._id);
    if (ids.length > 0) {
      await getSupabase().from(this.collectionName).delete().in('_id', ids);
    }
  }

  async insertMany(docs: any[]): Promise<any[]> {
    invalidatePopulateCache(this.collectionName);
    const now = new Date().toISOString();
    const validCols = new Set(tableColumns[this.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);
    const inserted: any[] = [];
    const rows = docs.map(chunkDoc => {
      const cleanDoc = sanitizeObject(chunkDoc);
      const newId = cleanDoc._id || crypto.randomUUID();
      delete cleanDoc._id;
      const row: any = {
        _id: newId,
        data: cleanDoc,
        createdAt: now,
        updatedAt: now,
      };
      for (const k of Object.keys(cleanDoc)) {
        if (validCols.has(k)) row[k] = cleanDoc[k];
      }
      inserted.push(this._attachMethods({ ...cleanDoc, _id: newId }));
      return row;
    });
    if (rows.length > 0) {
      await getSupabase().from(this.collectionName).insert(rows);
    }
    return inserted;
  }

  async findByIdAndUpdate(id: string, update: any, _options?: any): Promise<any> {
    if (!id || typeof id !== 'string') return null;
    const cleanId = id.trim();
    let updateData = { ...(update.$set || update) };
    
    // Security: sanitize prototype pollution keys and immutable _id
    delete updateData.__proto__;
    delete updateData.constructor;
    delete updateData.prototype;
    delete updateData._id;

    invalidatePopulateCache(this.collectionName);
    const existing = await this.findById(cleanId);
    if (!existing) return null;
    const merged = { ...existing, ...updateData };

    if (update.$inc && typeof update.$inc === 'object') {
      for (const key of Object.keys(update.$inc)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        merged[key] = (Number(merged[key]) || 0) + Number(update.$inc[key]);
      }
    }

    if (update.$push && typeof update.$push === 'object') {
      for (const key of Object.keys(update.$push)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const pushVal = update.$push[key];
        const arr = Array.isArray(merged[key]) ? [...merged[key]] : [];
        if (pushVal && pushVal.$each && Array.isArray(pushVal.$each)) {
          arr.push(...pushVal.$each);
        } else {
          arr.push(pushVal);
        }
        merged[key] = arr;
      }
    }

    const now = new Date().toISOString();
    const validCols = new Set(tableColumns[this.collectionName] || ['_id', 'data', 'createdAt', 'updatedAt']);
    const row: any = {
      data: merged,
      updatedAt: now,
    };
    for (const k of Object.keys(merged)) {
      if (validCols.has(k)) row[k] = merged[k];
    }
    await getSupabase().from(this.collectionName).update(row).eq('_id', cleanId);
    return this.findById(cleanId);
  }

  countDocuments(query: any = {}): any {
    return this._makeLazyQuery(query, true, false, false);
  }
}
