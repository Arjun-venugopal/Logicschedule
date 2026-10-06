import { BaseModel } from './BaseModel';
import fs from 'fs';
import path from 'path';

export interface IPaymentRecord {
  _id?: string;
  student: string | any;
  batch?: string | any;
  demoSession?: string | any;
  totalFee: number;
  amountPaid: number;
  remainingAmount: number;
  paymentType: 'Full Payment' | 'Half Payment' | 'Custom Payment';
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid' | 'Upcoming' | 'Due' | 'Overdue';
  assignedClasses: number;
  dueAfterClasses: number;
  reminderBeforeClasses?: number;
  dueDate?: string;
  salesExecutive?: string;
  closedBy?: string;
  paymentHistory: any[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

const LOCAL_STORAGE_FILE = path.join(__dirname, '..', 'data', 'paymentsStore.json');

class PaymentModel extends BaseModel {
  constructor() {
    super('payments');
  }

  private _readLocalFallback(): any[] {
    try {
      if (fs.existsSync(LOCAL_STORAGE_FILE)) {
        const raw = fs.readFileSync(LOCAL_STORAGE_FILE, 'utf-8');
        return JSON.parse(raw) || [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  private _writeLocalFallback(records: any[]): void {
    try {
      fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  // Safe create with fallback to local persistent store if Supabase table is not yet created
  async safeCreate(data: any): Promise<any> {
    try {
      const res = await this.create(data);
      return res;
    } catch (err: any) {
      if (err?.code === 'PGRST205' || err?.message?.includes('schema cache') || err?.message?.includes('not found')) {
        // PostgREST table doesn't exist yet, save locally
        const list = this._readLocalFallback();
        const doc = {
          ...data,
          _id: data._id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        list.push(doc);
        this._writeLocalFallback(list);
        return (this as any)._attachMethods(doc);
      }
      throw err;
    }
  }

  // Safe find with fallback
  async safeFind(query: any = {}): Promise<any[]> {
    try {
      const res = await this.find(query);
      return res;
    } catch (err: any) {
      if (err?.code === 'PGRST205' || err?.message?.includes('schema cache') || err?.message?.includes('not found')) {
        const list = this._readLocalFallback();
        return list.filter((item) => {
          for (const k of Object.keys(query)) {
            if (item[k] !== query[k]) return false;
          }
          return true;
        }).map(d => (this as any)._attachMethods(d));
      }
      throw err;
    }
  }

  // Safe findById with fallback
  async safeFindById(id: string): Promise<any | null> {
    try {
      const res = await this.findById(id);
      if (res) return res;
    } catch (err: any) {
      if (err?.code !== 'PGRST205' && !err?.message?.includes('schema cache')) {
        throw err;
      }
    }

    const list = this._readLocalFallback();
    const found = list.find((item) => item._id === id);
    return found ? (this as any)._attachMethods(found) : null;
  }

  // Safe findOne with fallback
  async safeFindOne(query: any): Promise<any | null> {
    try {
      const res = await this.findOne(query);
      if (res) return res;
    } catch (err: any) {
      if (err?.code !== 'PGRST205' && !err?.message?.includes('schema cache')) {
        throw err;
      }
    }

    const list = this._readLocalFallback();
    const found = list.find((item) => {
      for (const k of Object.keys(query)) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    return found ? (this as any)._attachMethods(found) : null;
  }

  // Safe findByIdAndUpdate with fallback
  async safeFindByIdAndUpdate(id: string, update: any): Promise<any | null> {
    try {
      const res = await this.findByIdAndUpdate(id, update);
      if (res) return res;
    } catch (err: any) {
      if (err?.code !== 'PGRST205' && !err?.message?.includes('schema cache')) {
        throw err;
      }
    }

    const list = this._readLocalFallback();
    const idx = list.findIndex((item) => item._id === id);
    if (idx !== -1) {
      const updateData = update.$set || update;
      const updated = {
        ...list[idx],
        ...updateData,
        updatedAt: new Date().toISOString(),
      };
      if (update.$push && update.$push.paymentHistory) {
        updated.paymentHistory = [...(updated.paymentHistory || []), update.$push.paymentHistory];
      }
      list[idx] = updated;
      this._writeLocalFallback(list);
      return (this as any)._attachMethods(updated);
    }
    return null;
  }

  // Safe delete with fallback
  async safeFindByIdAndDelete(id: string): Promise<boolean> {
    try {
      await this.deleteOne({ _id: id });
    } catch (err: any) {
      if (err?.code !== 'PGRST205' && !err?.message?.includes('schema cache')) {
        throw err;
      }
    }
    const list = this._readLocalFallback();
    const filtered = list.filter((item) => item._id !== id);
    this._writeLocalFallback(filtered);
    return true;
  }
}

export default new PaymentModel();
