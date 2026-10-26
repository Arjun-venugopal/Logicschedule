import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSupabase } from '../config/supabase';
import { serverCache } from '../utils/cache';
import Student from './Student';
import Teacher from './Teacher';
import Batch from './Batch';
import Schedule from './Schedule';
import DemoSession from './DemoSession';
import DemoSlot from './DemoSlot';
import DemoReport from './DemoReport';
import Payment from './Payment';
import User from './User';

export type BinEntityType =
  | 'student'
  | 'teacher'
  | 'batch'
  | 'schedule'
  | 'demoSession'
  | 'demoSlot'
  | 'demoReport'
  | 'payment'
  | 'subAdmin'
  | 'salesPerson'
  | 'user';

export interface IBinItem {
  _id: string;
  entityType: BinEntityType;
  entityId: string;
  name: string;
  email?: string;
  secondaryInfo?: string;
  itemData: any;
  associatedData?: {
    user?: any;
    schedules?: any[];
    [key: string]: any;
  };
  deletedAt: string;
  deletedBy?: {
    _id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
  emailStatus?: 'held' | 'released' | 'restored';
  status: 'in_bin' | 'restored';
  restoredAt?: string;
}

const LOCAL_STORAGE_DIR = path.join(__dirname, '..', 'data');
const LOCAL_STORAGE_FILE = path.join(LOCAL_STORAGE_DIR, 'recycleBinStore.json');

class RecycleBinModel {
  constructor() {
    this._ensureStoreExists();
  }

  private _ensureStoreExists(): void {
    try {
      if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
        fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
      }
      if (!fs.existsSync(LOCAL_STORAGE_FILE)) {
        fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('[RecycleBin] Error ensuring store exists:', err);
    }
  }

  private _readLocal(): IBinItem[] {
    try {
      if (fs.existsSync(LOCAL_STORAGE_FILE)) {
        const raw = fs.readFileSync(LOCAL_STORAGE_FILE, 'utf-8');
        return JSON.parse(raw) || [];
      }
    } catch (err) {
      console.error('[RecycleBin] Error reading store:', err);
    }
    return [];
  }

  private _writeLocal(records: IBinItem[]): void {
    try {
      fs.writeFileSync(LOCAL_STORAGE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    } catch (err) {
      console.error('[RecycleBin] Error writing store:', err);
    }
  }

  async addToBin(params: {
    entityType: BinEntityType;
    entityId: string;
    name: string;
    email?: string;
    secondaryInfo?: string;
    itemData: any;
    associatedData?: any;
    deletedBy?: any;
    emailStatus?: 'held' | 'released' | 'restored';
  }): Promise<IBinItem> {
    const records = this._readLocal();
    const cleanItemData = { ...(params.itemData || {}) };
    delete cleanItemData.data;

    const newItem: IBinItem = {
      _id: crypto.randomUUID(),
      entityType: params.entityType,
      entityId: String(params.entityId),
      name: params.name || 'Unnamed Item',
      email: params.email ? String(params.email).trim().toLowerCase() : undefined,
      secondaryInfo: params.secondaryInfo || '',
      itemData: cleanItemData,
      associatedData: params.associatedData || {},
      deletedAt: new Date().toISOString(),
      deletedBy: params.deletedBy
        ? {
            _id: params.deletedBy._id || params.deletedBy.id,
            name: params.deletedBy.name,
            email: params.deletedBy.email,
            role: params.deletedBy.role,
          }
        : undefined,
      emailStatus: params.email ? (params.emailStatus || 'held') : undefined,
      status: 'in_bin',
    };

    records.unshift(newItem);
    this._writeLocal(records);

    // Also attempt write to Supabase if table exists
    try {
      await getSupabase().from('recycle_bin').insert({
        _id: newItem._id,
        entityType: newItem.entityType,
        entityId: newItem.entityId,
        name: newItem.name,
        email: newItem.email,
        secondaryInfo: newItem.secondaryInfo,
        emailStatus: newItem.emailStatus,
        status: newItem.status,
        deletedAt: newItem.deletedAt,
        deletedBy: newItem.deletedBy,
        itemData: newItem.itemData,
        associatedData: newItem.associatedData,
      });
    } catch {
      // PostgREST fallback handled silently
    }

    return newItem;
  }

  async getAll(options?: {
    entityType?: string;
    search?: string;
    emailOnly?: boolean;
    status?: 'in_bin' | 'restored' | 'all';
  }): Promise<IBinItem[]> {
    let items = this._readLocal();

    const targetStatus = options?.status || 'in_bin';
    if (targetStatus !== 'all') {
      items = items.filter((i) => i.status === targetStatus);
    }

    if (options?.entityType && options.entityType !== 'all') {
      items = items.filter((i) => i.entityType === options.entityType);
    }

    if (options?.emailOnly) {
      items = items.filter((i) => Boolean(i.email));
    }

    if (options?.search && options.search.trim() !== '') {
      const q = options.search.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.name && i.name.toLowerCase().includes(q)) ||
          (i.email && i.email.toLowerCase().includes(q)) ||
          (i.secondaryInfo && i.secondaryInfo.toLowerCase().includes(q)) ||
          (i.entityType && i.entityType.toLowerCase().includes(q))
      );
    }

    return items;
  }

  async getById(id: string): Promise<IBinItem | null> {
    const items = this._readLocal();
    return items.find((i) => i._id === id) || null;
  }

  async getDeletedEmails(): Promise<any[]> {
    const items = this._readLocal();
    const emailItems = items.filter((i) => Boolean(i.email) && i.status === 'in_bin');

    // Check active status of these emails against current database
    const results = await Promise.all(
      emailItems.map(async (item) => {
        const emailLower = (item.email || '').trim().toLowerCase();
        let isEmailTakenInActive = false;
        let activeEntityDetail: string | null = null;

        try {
          // Check users table
          const activeUser = await User.findOne({ email: emailLower });
          if (activeUser && activeUser._id !== item.entityId) {
            isEmailTakenInActive = true;
            activeEntityDetail = `Active User (${activeUser.name || 'Account'}, Role: ${activeUser.role})`;
          } else {
            // Check students table if student
            const activeStudent = await Student.findOne({ email: emailLower });
            if (activeStudent && activeStudent._id !== item.entityId) {
              isEmailTakenInActive = true;
              activeEntityDetail = `Active Student (${activeStudent.name || 'Student'})`;
            }
          }
        } catch {
          // fallback
        }

        return {
          binId: item._id,
          entityId: item.entityId,
          entityType: item.entityType,
          name: item.name,
          email: item.email,
          role:
            item.entityType === 'teacher'
              ? 'Teacher'
              : item.entityType === 'student'
              ? 'Student'
              : item.entityType === 'salesPerson'
              ? 'Sales Person'
              : item.entityType === 'subAdmin'
              ? 'Sub Admin'
              : 'User',
          secondaryInfo: item.secondaryInfo,
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy,
          emailStatus: item.emailStatus || 'held',
          isEmailTakenInActive,
          activeEntityDetail,
          canRestore: !isEmailTakenInActive || item.emailStatus === 'released',
          canRelease: item.emailStatus !== 'released',
        };
      })
    );

    return results;
  }

  async releaseEmail(binId: string): Promise<{ success: boolean; message: string; email: string }> {
    const items = this._readLocal();
    const itemIndex = items.findIndex((i) => i._id === binId);
    if (itemIndex === -1) {
      throw new Error('Item not found in bin');
    }

    const item = items[itemIndex];
    if (!item.email) {
      throw new Error('This item has no associated email address');
    }

    const email = item.email.trim().toLowerCase();

    // If there is an inactive/lingering user record in Supabase with this exact email
    // that belonged to this deleted entity or was left behind, rename it so the email is freed up
    try {
      const lingeringUser = await User.findOne({ email });
      if (lingeringUser) {
        // If it's this user or linked teacher, release its email
        const isMatched =
          lingeringUser._id === item.entityId ||
          (item.associatedData?.user && lingeringUser._id === item.associatedData.user._id) ||
          item.entityType === 'teacher' ||
          item.entityType === 'subAdmin' ||
          item.entityType === 'salesPerson';

        if (isMatched) {
          const releasedEmail = `released_${Date.now()}_${email}`;
          await User.update(lingeringUser._id!, { email: releasedEmail });
        }
      }
    } catch (err: any) {
      console.warn('[RecycleBin] Error freeing lingering user email:', err?.message);
    }

    item.emailStatus = 'released';
    items[itemIndex] = item;
    this._writeLocal(items);

    return {
      success: true,
      message: `Email "${email}" has been successfully released and is now available for new registrations!`,
      email,
    };
  }

  async restoreItem(
    binId: string,
    options?: { newEmail?: string }
  ): Promise<{ success: boolean; message: string; restoredEntity: any }> {
    const items = this._readLocal();
    const itemIndex = items.findIndex((i) => i._id === binId);
    if (itemIndex === -1) {
      throw new Error('Item not found in bin');
    }

    const item = items[itemIndex];
    if (item.status === 'restored') {
      throw new Error('This item has already been restored');
    }

    let restoredEntity: any = null;
    const targetEmail = options?.newEmail
      ? options.newEmail.trim().toLowerCase()
      : item.email
      ? item.email.trim().toLowerCase()
      : undefined;

    switch (item.entityType) {
      case 'student': {
        const studentPayload = { ...item.itemData };
        if (targetEmail) studentPayload.email = targetEmail;
        delete studentPayload.createdAt;
        delete studentPayload.updatedAt;

        // Restore into students table
        const restored = await Student.create(studentPayload);
        if (restored.batch) {
          try {
            await Batch.findByIdAndUpdate(restored.batch, { $inc: { studentsCount: 1 } });
          } catch {
            // ignore
          }
        }
        serverCache.clearPattern('students_');
        restoredEntity = restored;
        break;
      }

      case 'teacher': {
        // Restore login User if available
        let userId = item.associatedData?.user?._id;
        const userEmail = targetEmail || item.associatedData?.user?.email || item.email;

        if (userEmail) {
          const normEmail = userEmail.trim().toLowerCase();
          const existingUser = await User.findOne({ email: normEmail });

          if (existingUser && existingUser._id !== userId) {
            throw new Error(
              `The email "${normEmail}" is currently used by another active account. Please provide a different email or release the existing email first.`
            );
          }

          if (existingUser) {
            // Update role back to Teacher
            await User.update(existingUser._id!, { role: 'Teacher', name: item.name });
            userId = existingUser._id;
          } else {
            // Recreate User with original password
            const userData = item.associatedData?.user || {};
            const createdUser = await User.create({
              _id: userData._id || crypto.randomUUID(),
              name: item.name,
              email: normEmail,
              password: userData.password || 'Temp@1234',
              role: 'Teacher',
              mustChangePassword: false,
              isVerified: true,
            });
            userId = createdUser._id;
          }
        }

        const teacherPayload = { ...item.itemData, user: userId };
        if (targetEmail) teacherPayload.email = targetEmail;
        delete teacherPayload.createdAt;
        delete teacherPayload.updatedAt;

        const restored = await Teacher.create(teacherPayload);
        serverCache.delete('teachers_all');
        serverCache.clearPattern('timings_');
        serverCache.clearPattern('stats_');
        restoredEntity = restored;
        break;
      }

      case 'batch': {
        const batchPayload = { ...item.itemData };
        delete batchPayload.createdAt;
        delete batchPayload.updatedAt;

        const restored = await Batch.create(batchPayload);

        // Restore any auto-generated schedules tied to this batch
        if (item.associatedData?.schedules && Array.isArray(item.associatedData.schedules)) {
          for (const sched of item.associatedData.schedules) {
            try {
              const schedPayload = { ...sched };
              delete schedPayload.createdAt;
              delete schedPayload.updatedAt;
              schedPayload.batch = restored._id;
              await Schedule.create(schedPayload);
            } catch {
              // ignore duplicate schedule issues
            }
          }
        }

        serverCache.clearPattern('batches_');
        serverCache.clearPattern('schedules_');
        serverCache.clearPattern('stats_');
        restoredEntity = restored;
        break;
      }

      case 'schedule': {
        const schedPayload = { ...item.itemData };
        delete schedPayload.createdAt;
        delete schedPayload.updatedAt;

        const restored = await Schedule.create(schedPayload);
        serverCache.clearPattern('schedules_');
        serverCache.clearPattern('timings_');
        serverCache.clearPattern('stats_');
        restoredEntity = restored;
        break;
      }

      case 'demoSession': {
        const demoPayload = { ...item.itemData };
        delete demoPayload.createdAt;
        delete demoPayload.updatedAt;

        const restored = await DemoSession.create(demoPayload);
        serverCache.clearPattern('demo_sessions_');
        serverCache.clearPattern('stats_');
        restoredEntity = restored;
        break;
      }

      case 'demoSlot': {
        const slotPayload = { ...item.itemData };
        delete slotPayload.createdAt;
        delete slotPayload.updatedAt;

        const restored = await DemoSlot.create(slotPayload);
        serverCache.clearPattern('demo_slots_');
        restoredEntity = restored;
        break;
      }

      case 'demoReport': {
        const reportPayload = { ...item.itemData };
        delete reportPayload.createdAt;
        delete reportPayload.updatedAt;

        const restored = await DemoReport.create(reportPayload);
        restoredEntity = restored;
        break;
      }

      case 'payment': {
        const paymentPayload = { ...item.itemData };
        delete paymentPayload.createdAt;
        delete paymentPayload.updatedAt;

        const restored = await Payment.safeCreate(paymentPayload);
        restoredEntity = restored;
        break;
      }

      case 'subAdmin':
      case 'salesPerson':
      case 'user': {
        if (!targetEmail) {
          throw new Error('A valid email address is required to restore this user account');
        }

        const normEmail = targetEmail.trim().toLowerCase();
        const existing = await User.findOne({ email: normEmail });
        if (existing) {
          throw new Error(
            `An active user with email "${normEmail}" already exists. Please choose a different email or release the existing one.`
          );
        }

        const role =
          item.entityType === 'subAdmin'
            ? 'Sub Admin'
            : item.entityType === 'salesPerson'
            ? 'Sales Person'
            : item.itemData?.role || 'User';

        const restored = await User.create({
          _id: item.entityId || crypto.randomUUID(),
          name: item.name,
          email: normEmail,
          password: item.itemData?.password || 'Temp@1234',
          role,
          permissions: item.itemData?.permissions || {},
          mustChangePassword: false,
          isVerified: true,
        });

        restoredEntity = restored;
        break;
      }

      default:
        throw new Error(`Unsupported entity type: ${item.entityType}`);
    }

    // Mark bin item as restored
    item.status = 'restored';
    item.restoredAt = new Date().toISOString();
    if (item.email) item.emailStatus = 'restored';
    items[itemIndex] = item;
    this._writeLocal(items);

    return {
      success: true,
      message: `Successfully restored ${item.name} (${item.entityType})!`,
      restoredEntity,
    };
  }

  async deletePermanently(binId: string): Promise<{ success: boolean; message: string }> {
    const items = this._readLocal();
    const itemIndex = items.findIndex((i) => i._id === binId);
    if (itemIndex === -1) {
      throw new Error('Item not found in bin');
    }

    const item = items[itemIndex];

    // If an inactive user was held, permanently delete from users table
    if (item.email && (item.entityType === 'teacher' || item.entityType === 'subAdmin' || item.entityType === 'salesPerson')) {
      try {
        const lingeringUser = await User.findOne({ email: item.email.trim().toLowerCase() });
        if (lingeringUser) {
          await User.delete(lingeringUser._id!);
        }
      } catch {
        // ignore
      }
    }

    items.splice(itemIndex, 1);
    this._writeLocal(items);

    // Also attempt delete from Supabase if table exists
    try {
      await getSupabase().from('recycle_bin').delete().eq('_id', binId);
    } catch {
      // ignore
    }

    return {
      success: true,
      message: `Permanently removed "${item.name}" from Recycle Bin`,
    };
  }

  async emptyBin(entityType?: string): Promise<{ success: boolean; message: string; deletedCount: number }> {
    const items = this._readLocal();
    let remaining: IBinItem[] = [];
    let deletedCount = 0;

    if (entityType && entityType !== 'all') {
      remaining = items.filter((i) => i.entityType !== entityType);
      deletedCount = items.length - remaining.length;
    } else {
      deletedCount = items.length;
      remaining = [];
    }

    this._writeLocal(remaining);

    return {
      success: true,
      message: `Recycle Bin emptied successfully. ${deletedCount} item(s) permanently deleted.`,
      deletedCount,
    };
  }

  async checkEmailInBin(email: string): Promise<IBinItem | null> {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    const items = this._readLocal();
    const match = items.find(
      (i) => i.status === 'in_bin' && i.email && i.email.toLowerCase() === cleanEmail && i.emailStatus !== 'released'
    );
    return match || null;
  }
}

export default new RecycleBinModel();
