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
        if (isFindById && id) {
          const doc = await this.collection.doc(id).get();
          if (!doc.exists) return null;
          let result = convertTimestamps({ _id: doc.id, ...doc.data() });
          result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        let results = await this._fetchAndFilter(queryObj, chain._limit, chain._sort);
        if (isFindOne) {
          if (results.length === 0) return null;
          let result = results[0];
          result = this._attachMethods(result);
          result = await this._applyPopulates(result, chain._populates);
          return result;
        }

        // Apply populates to all results
        results = results.map(r => this._attachMethods(r));
        if (chain._populates.length > 0) {
          const populateCache: Record<string, Promise<any>> = {};
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
    const inMemoryFilters: any = {};

    for (const key of queryKeys) {
      if (key === '$or' || key === '$and') {
        inMemoryFilters[key] = query[key];
        continue;
      }
      const val = query[key];
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        inMemoryFilters[key] = val;
        // Opportunistically push range queries to Firestore
        const opKeys = Object.keys(val);
        const hasOnlyRangeOps = opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
        if (hasOnlyRangeOps) {
          if (val.$gte !== undefined) firestoreQuery = firestoreQuery.where(key, '>=', val.$gte);
          if (val.$gt !== undefined) firestoreQuery = firestoreQuery.where(key, '>', val.$gt);
          if (val.$lte !== undefined) firestoreQuery = firestoreQuery.where(key, '<=', val.$lte);
          if (val.$lt !== undefined) firestoreQuery = firestoreQuery.where(key, '<', val.$lt);
        }
      } else {
        firestoreQuery = firestoreQuery.where(key, '==', val);
      }
    }

    const onlyRangeFilters = Object.keys(inMemoryFilters).every(key => {
       const val = inMemoryFilters[key];
       if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
           const opKeys = Object.keys(val);
           return opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
       }
       return false;
    });

    if (Object.keys(inMemoryFilters).length > 0 && !onlyRangeFilters) {
      const results = await this._fetchAndFilter(query, null, null);
      return results.length;
    } else {
      let countQuery = firestoreQuery;
      try {
        const snapshot = await countQuery.count().get();
        return snapshot.data().count;
      } catch (e: any) {
        if (e.message && e.message.includes('index')) {
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
      if (path === 'assignedTeacher' || path === 'teacher') collectionName = 'teachers';
      else if (path === 'batch') collectionName = 'batches';
      else if (path === 'user') collectionName = 'users';
      else if (path === 'pastBatches.batch') collectionName = 'batches'; // nested arrays are harder, let's skip for now or implement simply

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

  async _fetchAndFilter(query: any = {}, limitOpt: number | null, sortOpt: any): Promise<any[]> {
    let firestoreQuery: any = this.collection;
    let queryKeys = Object.keys(query);

    if (query._id && typeof query._id === 'string' && Object.keys(query).length === 1) {
      const doc = await this.collection.doc(query._id).get();
      return doc.exists ? [convertTimestamps({ _id: doc.id, ...doc.data() })] : [];
    }

    const inMemoryFilters: any = {};
    for (const key of queryKeys) {
      if (key === '$or' || key === '$and') {
        inMemoryFilters[key] = query[key];
        continue;
      }
      
      const val = query[key];
      if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
        inMemoryFilters[key] = val;
        // Opportunistically push range queries to Firestore
        const opKeys = Object.keys(val);
        const hasOnlyRangeOps = opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
        if (hasOnlyRangeOps) {
          if (val.$gte !== undefined) firestoreQuery = firestoreQuery.where(key, '>=', val.$gte);
          if (val.$gt !== undefined) firestoreQuery = firestoreQuery.where(key, '>', val.$gt);
          if (val.$lte !== undefined) firestoreQuery = firestoreQuery.where(key, '<=', val.$lte);
          if (val.$lt !== undefined) firestoreQuery = firestoreQuery.where(key, '<', val.$lt);
        }
      } else {
        if (key === '_id') {
           // Firestore requires FieldPath.documentId() for ID queries, fallback to in-memory filtering for simplicity if it's mixed with other queries
           inMemoryFilters[key] = val;
        } else {
           firestoreQuery = firestoreQuery.where(key, '==', val);
        }
      }
    }

    // If the only in-memory filters are range filters that we pushed to Firestore, we can safely push limits and sorts to Firestore!
    const onlyRangeFilters = Object.keys(inMemoryFilters).every(key => {
       const val = inMemoryFilters[key];
       if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
           const opKeys = Object.keys(val);
           return opKeys.length > 0 && opKeys.every(k => ['$gt', '$gte', '$lt', '$lte'].includes(k));
       }
       return false;
    });

    if (Object.keys(inMemoryFilters).length === 0 || onlyRangeFilters) {
      if (sortOpt) {
        for (const sortKey of Object.keys(sortOpt)) {
          const dir = sortOpt[sortKey] === -1 || sortOpt[sortKey] === 'desc' ? 'desc' : 'asc';
          firestoreQuery = firestoreQuery.orderBy(sortKey, dir);
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
        // If query requires an index we don't have, fallback to un-sorted/un-limited query
        if (e.message && e.message.includes('index')) {
             console.warn(`Firestore Index required. Falling back to in-memory sort/limit for collection ${this.collectionName}`);
             console.warn(`To permanently fix this and speed up the query, create the index using this link:\n${e.message}`);
             let fallbackQuery: any = this.collection;
             for (const key of queryKeys) {
                if (key !== '$or' && key !== '$and' && !(query[key] !== null && typeof query[key] === 'object' && !(query[key] instanceof Date))) {
                   fallbackQuery = fallbackQuery.where(key, '==', query[key]);
                }
             }
             snapshot = await fallbackQuery.get();
        } else {
             throw e;
        }
    }
    
    let results = snapshot.docs.map((doc: any) => convertTimestamps({ _id: doc.id, ...doc.data() }));

    if (Object.keys(inMemoryFilters).length > 0) {
      const imQuery = inMemoryFilters;
      results = results.filter((item: any) => {
        for (const key of Object.keys(imQuery)) {
          if (key === '$or') {
             const orConditions = imQuery[key];
             let match = false;
              for (const cond of orConditions) {
                const condKey = Object.keys(cond)[0];
                const condVal = cond[condKey];
                
                if (item[condKey] === condVal || item[condKey]?.toString() === condVal?.toString()) {
                    match = true;
                } else if (condVal && typeof condVal === 'object' && !Array.isArray(condVal)) {
                    if (condVal.$regex) {
                        const regex = new RegExp(condVal.$regex, 'i');
                        if (regex.test(item[condKey])) match = true;
                    }
                    if (condVal.$in && Array.isArray(condVal.$in)) {
                        if (condVal.$in.some((v: any) => v === item[condKey] || v?.toString() === item[condKey]?.toString())) {
                            match = true;
                        }
                    }
                }
             }
             if (!match) return false;
             continue;
          }

          if (imQuery[key] && typeof imQuery[key] === 'object' && !Array.isArray(imQuery[key])) {
            if (imQuery[key].$in) {
               if (!imQuery[key].$in.includes(item[key])) return false;
            } else if (imQuery[key].$gte !== undefined || imQuery[key].$lte !== undefined) {
               let val = item[key];
               if (val && typeof val.toDate === 'function') val = val.toDate().getTime();
               else if (val instanceof Date) val = val.getTime();
               else if (typeof val === 'string') val = new Date(val).getTime();

               let filterGte = imQuery[key].$gte;
               if (filterGte instanceof Date) filterGte = filterGte.getTime();
               else if (typeof filterGte === 'string') filterGte = new Date(filterGte).getTime();

               let filterLte = imQuery[key].$lte;
               if (filterLte instanceof Date) filterLte = filterLte.getTime();
               else if (typeof filterLte === 'string') filterLte = new Date(filterLte).getTime();

               if (filterGte !== undefined && val < filterGte) return false;
               if (filterLte !== undefined && val > filterLte) return false;
            }
          } else {
             if (item[key] !== imQuery[key] && item[key]?.toString() !== imQuery[key]?.toString()) return false;
          }
        }
        return true;
      });
    }

    // Apply in-memory sort and limit if we had in-memory filters (since we couldn't push them to Firestore)
    if (Object.keys(inMemoryFilters).length > 0 || (snapshot.docs.length > 0 && results.length < snapshot.docs.length)) {
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
    if (!id) return this._makeLazyQuery({}, false, true, false);
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
    const batch = getDb().batch();
    for (const doc of docs) {
      batch.delete(this.collection.doc(doc._id));
    }
    await batch.commit();
  }

  async insertMany(docs: any[]): Promise<any[]> {
    const batch = getDb().batch();
    const inserted: any[] = [];
    for (const doc of docs) {
      const docRef = this.collection.doc();
      batch.set(docRef, { ...doc, createdAt: new Date(), updatedAt: new Date() });
      inserted.push({ ...doc, _id: docRef.id });
    }
    await batch.commit();
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

