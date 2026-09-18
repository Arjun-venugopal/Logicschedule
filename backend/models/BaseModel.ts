import { getDb } from '../config/firebase';

function convertTimestamps(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj.toDate === 'function') return obj.toDate();
  if (Array.isArray(obj)) return obj.map(convertTimestamps);
  if (typeof obj === 'object') {
    if (obj instanceof Date) return obj;
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = convertTimestamps(obj[key]);
    }
    return newObj;
  }
  return obj;
}

function matchesCondition(item: any, key: string, filterVal: any): boolean {
  const itemVal = item ? item[key] : undefined;

  if (filterVal !== null && typeof filterVal === 'object' && !(filterVal instanceof Date) && !Array.isArray(filterVal)) {
    // Regex operator
    if (filterVal.$regex) {
      const flags = filterVal.$options || 'i';
      const regex = new RegExp(filterVal.$regex, flags);
      if (!regex.test(itemVal || '')) return false;
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
  for (const key of Object.keys(filters)) {
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

class QueryMock {
  constructor(private results: any[]) {}
  
  populate(field: string, select?: string) { return this; }
  select(fields: string) { return this; }
  lean() { return this; }
  sort(obj: any) { 
    // naive sort mock
    return this; 
  }
  limit(n: number) { 
    this.results = this.results.slice(0, n);
    return this; 
  }
  
  // To allow await on this object
  then(resolve: any, reject: any) {
    return Promise.resolve(this.results).then(resolve, reject);
  }
  catch(reject: any) {
    return Promise.resolve(this.results).catch(reject);
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
    
    // Add populate method
    Object.defineProperty(doc, 'populate', {
      value: async (path: string, select?: string) => {
        await this._applyPopulates(doc, [{ path, select: select || '' }]);
        return doc;
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

    Object.defineProperty(doc, 'deleteOne', {
      value: async () => {
        await this.collection.doc(doc._id).delete();
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

    // Add save method
    Object.defineProperty(doc, 'save', {
      value: async () => {
        const updateData = { ...doc };
        delete updateData._id;
        for (const key of Object.keys(updateData)) {
           if (updateData[key] && typeof updateData[key] === 'object' && updateData[key]._id && !(updateData[key] instanceof Date)) {
              updateData[key] = updateData[key]._id;
           }
        }
        await this.collection.doc(doc._id).update({ ...updateData, updatedAt: new Date() });
        return doc;
      },
      enumerable: false,
      configurable: true,
      writable: true
    });

    return doc;
  }

  // Helper to create a lazy query object
  private _makeLazyQuery(queryObj: any, isCount: boolean, isFindOne: boolean, isFindById: boolean, id?: string) {
    const chain: any = {
      _populates: [] as { path: string, select: string }[],
      _sort: null as any,
      _limit: null as number | null,
      _startAfter: null as string | null,
      
      populate: (path: string, select?: string) => {
        chain._populates.push({ path, select: select || '' });
        return chain;
      },
      select: () => chain,
      lean: () => chain,
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
          let result = convertTimestamps({ _id: doc.id, ...doc.data() });
          result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        let results = await this._fetchAndFilter(queryObj, chain._limit, chain._sort, chain._startAfter);
        if (isFindOne) {
          if (results.length === 0) return null;
          let result = results[0];
          result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        // Apply populates to all results efficiently using pre-batched cache
        results = results.map(r => this._attachMethods(r));
        if (chain._populates.length > 0) {
          const populateCache: Record<string, Promise<any>> = {};
          const db = getDb();

          // Pre-collect unique document IDs for each path
          for (const pop of chain._populates) {
            const path = pop.path;
            let collectionName = '';
            if (path === 'assignedTeacher' || path === 'teacher' || path === 'replacementTeacher' || path === 'classAssignedTutor') collectionName = 'teachers';
            else if (path === 'batch') collectionName = 'batches';
            else if (path === 'user') collectionName = 'users';

            if (collectionName) {
              const uniqueIds = new Set<string>();
              for (const r of results) {
                const idVal = r[path];
                if (typeof idVal === 'string' && idVal.trim()) {
                  uniqueIds.add(idVal);
                }
              }

              if (uniqueIds.size > 0) {
                const idsArr = Array.from(uniqueIds);
                const chunkSize = 100;
                for (let i = 0; i < idsArr.length; i += chunkSize) {
                  const chunkIds = idsArr.slice(i, i + chunkSize);
                  const docRefs = chunkIds.map(id => db.collection(collectionName).doc(id));
                  const batchPromise = db.getAll(...docRefs).then((snapshots: any[]) => {
                    const map = new Map<string, any>();
                    snapshots.forEach(ref => {
                      map.set(ref.id, ref.exists ? convertTimestamps({ _id: ref.id, ...ref.data() }) : null);
                    });
                    return map;
                  }).catch(err => {
                    console.error(`Batched populate error for ${collectionName}:`, err);
                    return new Map<string, any>();
                  });

                  chunkIds.forEach(id => {
                    const cacheKey = `${collectionName}_${id}`;
                    populateCache[cacheKey] = batchPromise.then(map => map.get(id) || null);
                  });
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

    for (const key of queryKeys) {
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
      if (!doc[path]) continue;

      let collectionName = '';
      if (path === 'assignedTeacher' || path === 'teacher' || path === 'replacementTeacher' || path === 'classAssignedTutor') collectionName = 'teachers';
      else if (path === 'batch') collectionName = 'batches';
      else if (path === 'user') collectionName = 'users';

      if (collectionName && typeof doc[path] === 'string') {
        if (cache) {
          const cacheKey = `${collectionName}_${doc[path]}`;
          if (!cache[cacheKey]) {
            cache[cacheKey] = db.collection(collectionName).doc(doc[path]).get().then((ref: any) => {
              return ref.exists ? convertTimestamps({ _id: ref.id, ...ref.data() }) : null;
            });
          }
          const popDoc = await cache[cacheKey];
          if (popDoc) doc[path] = popDoc;
        } else {
          const ref = await db.collection(collectionName).doc(doc[path]).get();
          if (ref.exists) {
            doc[path] = convertTimestamps({ _id: ref.id, ...ref.data() });
          }
        }
      }
    }
    return doc;
  }

  async _fetchAndFilter(query: any = {}, limitOpt: number | null, sortOpt: any, startAfterOpt?: string | null): Promise<any[]> {
    let firestoreQuery: any = this.collection;
    let queryKeys = Object.keys(query);

    if (query._id && typeof query._id === 'string' && Object.keys(query).length === 1) {
      const doc = await this.collection.doc(query._id).get();
      return doc.exists ? [convertTimestamps({ _id: doc.id, ...doc.data() })] : [];
    }

    if (query._id && typeof query._id === 'string') {
      const doc = await this.collection.doc(query._id).get();
      if (!doc.exists) return [];
      const item = convertTimestamps({ _id: doc.id, ...doc.data() });
      return matchesAllFilters(item, query) ? [item] : [];
    }

    // Special case: if $in is empty array, return [] immediately
    for (const key of queryKeys) {
      if (query[key] && Array.isArray(query[key].$in) && query[key].$in.length === 0) {
        return [];
      }
    }

    // Special case: single field $in with > 30 items (e.g. batch: { $in: batchIds })
    // Chunk into 30-item queries so we don't scan the whole collection!
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
          allDocs.push(convertTimestamps({ _id: doc.id, ...doc.data() }));
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

    for (const key of queryKeys) {
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
        // If query requires an index we don't have or hits query constraints, fallback to safe query + in-memory filtering
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
             // Mark all filters to be evaluated in memory since fallbackQuery stripped them
             for (const key of queryKeys) {
               unpushedFilters[key] = query[key];
             }
        } else {
             throw e;
        }
    }
    
    let results = snapshot.docs.map((doc: any) => convertTimestamps({ _id: doc.id, ...doc.data() }));

    if (Object.keys(unpushedFilters).length > 0) {
      results = results.filter((item: any) => matchesAllFilters(item, unpushedFilters));
    }

    // Apply in-memory sort and limit if we had in-memory filters (since we couldn't push them to Firestore)
    if (Object.keys(unpushedFilters).length > 0 || (snapshot.docs.length > 0 && results.length < snapshot.docs.length)) {
       if (sortOpt) {
          const sortKey = Object.keys(sortOpt)[0];
          const dir = sortOpt[sortKey] === -1 || sortOpt[sortKey] === 'desc' ? -1 : 1;
          results.sort((a: any, b: any) => {
             if (a[sortKey] < b[sortKey]) return -1 * dir;
             if (a[sortKey] > b[sortKey]) return 1 * dir;
             return 0;
          });
       }
       if (limitOpt) {
          results = results.slice(0, limitOpt);
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
    const docRef = await this.collection.add({ ...data, createdAt: new Date(), updatedAt: new Date() });
    const newDoc = { ...data, _id: docRef.id };
    return this._attachMethods(newDoc);
  }

  async updateOne(query: any, data: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, null, null).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      await this.collection.doc(doc._id).update({ ...data, updatedAt: new Date() });
    }
  }

  async deleteOne(query: any): Promise<void> {
    const doc = await this._fetchAndFilter(query, null, null).then(res => res.length > 0 ? res[0] : null);
    if (doc) {
      await this.collection.doc(doc._id).delete();
    }
  }

  async deleteMany(query: any): Promise<void> {
    const docs = await this._fetchAndFilter(query, null, null);
    const BATCH_LIMIT = 500;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = getDb().batch();
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      for (const doc of chunk) {
        batch.delete(this.collection.doc(doc._id));
      }
      await batch.commit();
    }
  }

  async insertMany(docs: any[]): Promise<any[]> {
    const inserted: any[] = [];
    const BATCH_LIMIT = 500;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = getDb().batch();
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      for (const doc of chunk) {
        const docRef = this.collection.doc();
        batch.set(docRef, { ...doc, createdAt: new Date(), updatedAt: new Date() });
        inserted.push({ ...doc, _id: docRef.id });
      }
      await batch.commit();
    }
    return inserted;
  }

  async findByIdAndUpdate(id: string, update: any, options?: any): Promise<any> {
    if (!id) return null;
    let updateData = { ...(update.$set || update) };
    
    // Handle $inc for Firestore natively using FieldValue.increment
    if (update.$inc) {
      const { FieldValue } = require('firebase-admin/firestore');
      for (const key of Object.keys(update.$inc)) {
        updateData[key] = FieldValue.increment(update.$inc[key]);
      }
      delete updateData.$inc; // Make sure we don't save $inc literally
    }
    
    // Handle naive $push
    if (update.$push) {
      // Mock push manually (naively)
    }

    try {
      await this.collection.doc(id).update({ ...updateData, updatedAt: new Date() });
      return this.findById(id);
    } catch (e: any) {
      if (e.code === 5 || e.message.includes('NOT_FOUND') || e.message.includes('No document to update')) {
        return null;
      }
      throw e;
    }
  }

  countDocuments(query: any = {}): any {
    return this._makeLazyQuery(query, true, false, false);
  }
}

