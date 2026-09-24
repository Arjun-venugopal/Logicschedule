import { getDb } from '../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

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
    // Regex operator with ReDoS security guards
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
      const isDateObj = val && (typeof val.toDate === 'function' || val instanceof Date);
      if (isDateObj) {
        if (typeof val.toDate === 'function') val = val.toDate().getTime();
        else if (val instanceof Date) val = val.getTime();
      }

      const checkOp = (fVal: any, isDate: boolean) => {
        if (isDate) {
          if (fVal instanceof Date) return fVal.getTime();
          if (typeof fVal === 'string') return new Date(fVal).getTime();
        }
        return fVal;
      };

      if (filterVal.$gte !== undefined && val < checkOp(filterVal.$gte, isDateObj)) return false;
      if (filterVal.$gt !== undefined && val <= checkOp(filterVal.$gt, isDateObj)) return false;
      if (filterVal.$lte !== undefined && val > checkOp(filterVal.$lte, isDateObj)) return false;
      if (filterVal.$lt !== undefined && val >= checkOp(filterVal.$lt, isDateObj)) return false;
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

  if (itemVal === filterVal || itemVal?.toString() === filterVal?.toString()) {
    return true;
  }

  return false;
}

function matchesAllFilters(item: any, filters: any): boolean {
  if (!item || !filters) return true;
  const keys = Object.keys(filters);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    if (key === '$or') {
      const orConditions = filters[key];
      if (Array.isArray(orConditions)) {
        const orMatch = orConditions.some((cond: any) => {
          return Object.keys(cond).every(condKey => matchesCondition(item, condKey, cond[condKey]));
        });
        if (!orMatch) return false;
      }
      continue;
    }

    if (key === '$and') {
      const andConditions = filters[key];
      if (Array.isArray(andConditions)) {
        const andMatch = andConditions.every((cond: any) => {
          return Object.keys(cond).every(condKey => matchesCondition(item, condKey, cond[condKey]));
        });
        if (!andMatch) return false;
      }
      continue;
    }

    if (!matchesCondition(item, key, filters[key])) {
      return false;
    }
  }
  return true;
}

const modelRegistry = new WeakMap<object, BaseModel>();

interface PopDocCacheEntry {
  data: any;
  expiresAt: number;
}
const globalPopulateCache = new Map<string, PopDocCacheEntry>();

export function getCachedPopDoc(collectionName: string, id: string): any | null {
  const cacheKey = `${collectionName}_${id}`;
  const entry = globalPopulateCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    globalPopulateCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function setCachedPopDoc(collectionName: string, id: string, doc: any, ttlMs: number = 180_000): void {
  const cacheKey = `${collectionName}_${id}`;
  globalPopulateCache.set(cacheKey, {
    data: doc,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidatePopulateCache(collectionName?: string): void {
  if (!collectionName) {
    globalPopulateCache.clear();
    return;
  }
  for (const key of globalPopulateCache.keys()) {
    if (key.startsWith(`${collectionName}_`)) {
      globalPopulateCache.delete(key);
    }
  }
}

export class FirestoreDocument {
  [key: string]: any;

  async populate(path: string | any[], select?: string) {
    const model = modelRegistry.get(this);
    if (model) {
      const populates = Array.isArray(path)
        ? path.map(p => typeof p === 'string' ? { path: p, select: '' } : p)
        : [{ path, select: select || '' }];
      await (model as any)._applyPopulates(this, populates);
    }
    return this;
  }

  async deleteOne() {
    const model = modelRegistry.get(this);
    if (model && this._id) {
      invalidatePopulateCache(model.collectionName);
      await model.collection.doc(this._id).delete();
    }
  }

  async save() {
    const model = modelRegistry.get(this);
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
    await model.collection.doc(this._id).update({ ...updateData, updatedAt: new Date() });
    return this;
  }
}

export class BaseModel {
  collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  get collection() {
    return getDb().collection(this.collectionName);
  }

  private _attachMethods(doc: any) {
    if (!doc || typeof doc !== 'object') return doc;
    Object.setPrototypeOf(doc, FirestoreDocument.prototype);
    modelRegistry.set(doc, this);
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
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[Firestore] ${this.collectionName} query`);
        }
        if (isCount) {
          return await this._executeCount(queryObj);
        }
        if (isFindById) {
          if (!id) return null;
          const doc = await this.collection.doc(id).get();
          if (!doc.exists) return null;
          const data = doc.data();
          convertTimestampsInPlace(data);
          let result: any = { _id: doc.id, ...data };
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
          const db = getDb();

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
                    const docRefs = chunkIds.map(refId => db.collection(collectionName).doc(refId));
                    const batchPromise = db.getAll(...docRefs).then((snapshots: any[]) => {
                      const map = new Map<string, any>();
                      snapshots.forEach(ref => {
                        if (ref.exists) {
                          const d = ref.data();
                          convertTimestampsInPlace(d);
                          const rawObj: any = { _id: ref.id, ...d };
                          if (collectionName === 'users') {
                            delete rawObj.password;
                          }
                          setCachedPopDoc(collectionName, ref.id, rawObj);

                          const docObj: any = { ...rawObj };
                          if (pop.select) {
                            applySelect(docObj, pop.select);
                          }
                          map.set(ref.id, docObj);
                        } else {
                          map.set(ref.id, null);
                        }
                      });
                      return map;
                    }).catch(err => {
                      console.error(`Batched populate error for ${collectionName}:`, err);
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

  // Execute a highly optimized count
  private async _executeCount(query: any = {}): Promise<number> {
    let firestoreQuery: any = this.collection;
    let queryKeys = Object.keys(query);
    const unpushedFilters: any = {};
    let hasInClause = false;
    let hasDisparityClause = false;

    for (let i = 0; i < queryKeys.length; i++) {
      const key = queryKeys[i];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (key === '$or' || key === '$and' || key === '_id') {
        unpushedFilters[key] = query[key];
        continue;
      }
      const val = query[key];
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        if (val.$in && Array.isArray(val.$in)) {
          if (val.$in.length === 0) return 0;
          if (val.$in.length <= 30 && !hasInClause) {
            firestoreQuery = firestoreQuery.where(key, 'in', val.$in);
            hasInClause = true;
            continue;
          }
        }
        if (val.$ne !== undefined) {
          if (!hasDisparityClause) {
            firestoreQuery = firestoreQuery.where(key, '!=', val.$ne);
            hasDisparityClause = true;
            continue;
          } else {
            unpushedFilters[key] = val;
            continue;
          }
        }
        const opKeys = Object.keys(val);
        const hasOnlyRangeOps = opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
        if (hasOnlyRangeOps) {
          if (val.$gte !== undefined) firestoreQuery = firestoreQuery.where(key, '>=', val.$gte);
          if (val.$gt !== undefined) firestoreQuery = firestoreQuery.where(key, '>', val.$gt);
          if (val.$lte !== undefined) firestoreQuery = firestoreQuery.where(key, '<=', val.$lte);
          if (val.$lt !== undefined) firestoreQuery = firestoreQuery.where(key, '<', val.$lt);
          continue;
        }
        unpushedFilters[key] = val;
      } else {
        firestoreQuery = firestoreQuery.where(key, '==', val);
      }
    }

    if (Object.keys(unpushedFilters).length > 0) {
      const results = await this._fetchAndFilter(query, null, null);
      return results.length;
    } else {
      let countQuery = firestoreQuery;
      try {
        const snapshot = await countQuery.count().get();
        return snapshot.data().count;
      } catch (e: any) {
        if (e.message && (e.message.includes('index') || e.message.includes('FAILED_PRECONDITION') || e.code === 9 || e.code === 3 || e.message.includes('INVALID_ARGUMENT') || e.message.includes('NOT_EQUAL'))) {
          const results = await this._fetchAndFilter(query, null, null);
          return results.length;
        }
        throw e;
      }
    }
  }

  // Basic population implementation
  private async _applyPopulates(doc: any, populates: { path: string, select: string }[], cache?: Record<string, Promise<any>>): Promise<any> {
    if (!doc) return doc;
    const db = getDb();
    
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

        if (cache) {
          const cacheKey = `${collectionName}_${id}`;
          if (!cache[cacheKey]) {
            cache[cacheKey] = db.collection(collectionName).doc(id).get().then((ref: any) => {
              if (!ref.exists) return null;
              const d = ref.data();
              convertTimestampsInPlace(d);
              const rawObj: any = { _id: ref.id, ...d };
              if (collectionName === 'users') delete rawObj.password;
              setCachedPopDoc(collectionName, ref.id, rawObj);
              const obj: any = { ...rawObj };
              if (pop.select) applySelect(obj, pop.select);
              return obj;
            });
          }
          return await cache[cacheKey];
        } else {
          const ref = await db.collection(collectionName).doc(id).get();
          if (ref.exists) {
            const d = ref.data();
            convertTimestampsInPlace(d);
            const rawObj: any = { _id: ref.id, ...d };
            if (collectionName === 'users') delete rawObj.password;
            setCachedPopDoc(collectionName, ref.id, rawObj);
            const obj: any = { ...rawObj };
            if (pop.select) applySelect(obj, pop.select);
            return obj;
          }
          return null;
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
        if (typeof doc[path] === 'string') {
          const docId = doc[path].trim();
          const popDoc = await fetchPopDoc(docId);
          if (popDoc) doc[path] = popDoc;
        }
      }
    }
    return doc;
  }

  async _fetchAndFilter(
    query: any = {}, 
    limitOpt: number | null, 
    sortOpt: any, 
    startAfterOpt?: string | null,
    isFindOne: boolean = false
  ): Promise<any[]> {
    let firestoreQuery: any = this.collection;
    let queryKeys = Object.keys(query);

    if (query._id && typeof query._id === 'string' && Object.keys(query).length === 1) {
      const doc = await this.collection.doc(query._id).get();
      if (!doc.exists) return [];
      const data = doc.data();
      convertTimestampsInPlace(data);
      return [{ _id: doc.id, ...data }];
    }

    if (query._id && typeof query._id === 'string') {
      const doc = await this.collection.doc(query._id).get();
      if (!doc.exists) return [];
      const data = doc.data();
      convertTimestampsInPlace(data);
      const item = { _id: doc.id, ...data };
      return matchesAllFilters(item, query) ? [item] : [];
    }

    // Special case: if $in is empty array, return [] immediately
    for (let i = 0; i < queryKeys.length; i++) {
      const key = queryKeys[i];
      if (query[key] && Array.isArray(query[key].$in) && query[key].$in.length === 0) {
        return [];
      }
    }

    // Special case: single field $in with > 30 items
    if (queryKeys.length === 1 && query[queryKeys[0]] && Array.isArray(query[queryKeys[0]].$in) && query[queryKeys[0]].$in.length > 30) {
      const key = queryKeys[0];
      const allIds = query[key].$in;
      const chunks: any[][] = [];
      for (let i = 0; i < allIds.length; i += 30) {
        chunks.push(allIds.slice(i, i + 30));
      }
      const allDocs: any[] = [];
      for (const chunk of chunks) {
        const snap = await this.collection.where(key, 'in', chunk).get();
        snap.docs.forEach((doc: any) => {
          const data = doc.data();
          convertTimestampsInPlace(data);
          allDocs.push({ _id: doc.id, ...data });
        });
      }
      if (sortOpt) {
        const sortKey = Object.keys(sortOpt)[0];
        const dir = sortOpt[sortKey] === -1 || sortOpt[sortKey] === 'desc' ? -1 : 1;
        allDocs.sort((a: any, b: any) => {
          if (a[sortKey] < b[sortKey]) return -1 * dir;
          if (a[sortKey] > b[sortKey]) return 1 * dir;
          return 0;
        });
      }
      return limitOpt ? allDocs.slice(0, limitOpt) : allDocs;
    }

    const unpushedFilters: any = {};
    let hasInClause = false;
    let hasDisparityClause = false;

    for (let i = 0; i < queryKeys.length; i++) {
      const key = queryKeys[i];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (key === '$or' || key === '$and' || key === '_id') {
        unpushedFilters[key] = query[key];
        continue;
      }
      
      const val = query[key];
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        if (val.$in && Array.isArray(val.$in)) {
          if (val.$in.length <= 30 && !hasInClause) {
            firestoreQuery = firestoreQuery.where(key, 'in', val.$in);
            hasInClause = true;
            continue;
          }
        }
        if (val.$ne !== undefined) {
          if (!hasDisparityClause) {
            firestoreQuery = firestoreQuery.where(key, '!=', val.$ne);
            hasDisparityClause = true;
            continue;
          } else {
            unpushedFilters[key] = val;
            continue;
          }
        }
        // Opportunistically push range queries to Firestore
        const opKeys = Object.keys(val);
        const hasOnlyRangeOps = opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
        if (hasOnlyRangeOps) {
          if (val.$gte !== undefined) firestoreQuery = firestoreQuery.where(key, '>=', val.$gte);
          if (val.$gt !== undefined) firestoreQuery = firestoreQuery.where(key, '>', val.$gt);
          if (val.$lte !== undefined) firestoreQuery = firestoreQuery.where(key, '<=', val.$lte);
          if (val.$lt !== undefined) firestoreQuery = firestoreQuery.where(key, '<', val.$lt);
          continue;
        }
        unpushedFilters[key] = val;
      } else {
        firestoreQuery = firestoreQuery.where(key, '==', val);
      }
    }

    if (Object.keys(unpushedFilters).length === 0) {
      if (sortOpt) {
        for (const sortKey of Object.keys(sortOpt)) {
          const dir = sortOpt[sortKey] === -1 || sortOpt[sortKey] === 'desc' ? 'desc' : 'asc';
          firestoreQuery = firestoreQuery.orderBy(sortKey, dir);
        }
      }
      if (startAfterOpt) {
        try {
          const startDoc = await this.collection.doc(startAfterOpt).get();
          if (startDoc.exists) {
            firestoreQuery = firestoreQuery.startAfter(startDoc);
          }
        } catch (err) {
          console.warn('startAfter cursor document fetch warning:', err);
        }
      }
      if (limitOpt) {
        firestoreQuery = firestoreQuery.limit(limitOpt);
      }
    }

    let snapshot;
    try {
        snapshot = await firestoreQuery.get();
    } catch(e: any) {
        const isIndexErr = e.message && (e.message.includes('index') || e.message.includes('FAILED_PRECONDITION') || e.code === 9);
        const isArgErr = e.message && (e.message.includes('INVALID_ARGUMENT') || e.code === 3 || e.message.includes('NOT_EQUAL'));

        if (isIndexErr || isArgErr) {
             if (isIndexErr) {
               console.warn(`Firestore Index required. Falling back to in-memory sort/limit for collection ${this.collectionName}`);
               console.warn(`To permanently fix this and speed up the query, create the index using this link:\n${e.message}`);
             } else {
               console.warn(`Firestore query constraint fallback for collection ${this.collectionName}: ${e.message}`);
             }
             let fallbackQuery: any = this.collection;
             for (const key of queryKeys) {
                if (key !== '$or' && key !== '$and' && key !== '_id' && !(query[key] !== null && typeof query[key] === 'object' && !(query[key] instanceof Date))) {
                   fallbackQuery = fallbackQuery.where(key, '==', query[key]);
                } else if (query[key]?.$in && Array.isArray(query[key].$in) && query[key].$in.length <= 30) {
                   fallbackQuery = fallbackQuery.where(key, 'in', query[key].$in);
                }
             }
             snapshot = await fallbackQuery.get();
             for (const key of queryKeys) {
               unpushedFilters[key] = query[key];
             }
        } else {
             throw e;
        }
    }
    
    const hasUnpushed = Object.keys(unpushedFilters).length > 0;
    const targetLimit = isFindOne ? 1 : limitOpt;
    const canEarlyExit = Boolean(targetLimit && (!sortOpt || !hasUnpushed));
    const results: any[] = [];

    for (let i = 0; i < snapshot.docs.length; i++) {
      const docSnap = snapshot.docs[i];
      const data = docSnap.data();
      convertTimestampsInPlace(data);
      const item = { _id: docSnap.id, ...data };

      if (hasUnpushed) {
        if (!matchesAllFilters(item, unpushedFilters)) {
          continue;
        }
      }

      results.push(item);
      if (canEarlyExit && results.length >= targetLimit!) {
        break;
      }
    }

    // Apply in-memory sort and limit if we had in-memory filters or couldn't sort natively
    if (hasUnpushed || (snapshot.docs.length > 0 && results.length < snapshot.docs.length)) {
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
    const docRef = await this.collection.add({ ...cleanData, createdAt: new Date(), updatedAt: new Date() });
    const newDoc = { ...cleanData, _id: docRef.id };
    return this._attachMethods(newDoc);
  }

  async updateOne(query: any, data: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, 1, null, null, true).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      invalidatePopulateCache(this.collectionName);
      const cleanData = sanitizeObject(data.$set || data);
      delete cleanData._id;
      await this.collection.doc(doc._id).update({ ...cleanData, updatedAt: new Date() });
    }
  }

  async deleteOne(query: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, 1, null, null, true).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      invalidatePopulateCache(this.collectionName);
      await this.collection.doc(doc._id).delete();
    }
  }

  async deleteMany(query: any): Promise<void> {
    invalidatePopulateCache(this.collectionName);
    const docs = await this._fetchAndFilter(query, null, null);
    const BATCH_LIMIT = 500;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = getDb().batch();
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      for (let j = 0; j < chunk.length; j++) {
        batch.delete(this.collection.doc(chunk[j]._id));
      }
      await batch.commit();
    }
  }

  async insertMany(docs: any[]): Promise<any[]> {
    invalidatePopulateCache(this.collectionName);
    const inserted: any[] = [];
    const BATCH_LIMIT = 500;
    const now = new Date();
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = getDb().batch();
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      for (let j = 0; j < chunk.length; j++) {
        const cleanDoc = sanitizeObject(chunk[j]);
        delete cleanDoc._id;
        const docRef = this.collection.doc();
        batch.set(docRef, { ...cleanDoc, createdAt: now, updatedAt: now });
        inserted.push(this._attachMethods({ ...cleanDoc, _id: docRef.id }));
      }
      await batch.commit();
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

    // Handle $inc for Firestore natively using FieldValue.increment
    if (update.$inc && typeof update.$inc === 'object') {
      const keys = Object.keys(update.$inc);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        updateData[key] = FieldValue.increment(update.$inc[key]);
      }
      delete updateData.$inc;
    }
    
    // Handle $push for Firestore natively using FieldValue.arrayUnion
    if (update.$push && typeof update.$push === 'object') {
      const keys = Object.keys(update.$push);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const pushVal = update.$push[key];
        if (pushVal && pushVal.$each && Array.isArray(pushVal.$each)) {
          updateData[key] = FieldValue.arrayUnion(...pushVal.$each);
        } else {
          updateData[key] = FieldValue.arrayUnion(pushVal);
        }
      }
      delete updateData.$push;
    }

    try {
      invalidatePopulateCache(this.collectionName);
      await this.collection.doc(cleanId).update({ ...updateData, updatedAt: new Date() });
      return this.findById(cleanId);
    } catch (e: any) {
      if (e.code === 5 || (e.message && (e.message.includes('NOT_FOUND') || e.message.includes('No document to update')))) {
        return null;
      }
      throw e;
    }
  }

  countDocuments(query: any = {}): any {
    return this._makeLazyQuery(query, true, false, false);
  }
}
