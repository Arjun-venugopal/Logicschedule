import { getSupabase } from '../config/supabase';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { serverCache } from '../utils/cache';

export interface IUserPermissions {
  dashboard: { read: boolean; write: boolean };
  schedule: { read: boolean; write: boolean };
  batches: { read: boolean; write: boolean };
  teachers: { read: boolean; write: boolean };
  students: { read: boolean; write: boolean };
  salesPeople: { read: boolean; write: boolean };
  demoSessions: { read: boolean; write: boolean };
  classNotes: { read: boolean; write: boolean };
  attendance: { read: boolean; write: boolean };
  settings: { read: boolean; write: boolean };
}

export interface IUser {
  _id?: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  mustChangePassword?: boolean;
  permissions?: IUserPermissions | null;
  isVerified?: boolean;
  verificationToken?: string | null;
  verificationExpires?: any;
  resetPasswordToken?: string | null;
  resetPasswordExpires?: any;
  failedLoginAttempts?: number;
  lockUntil?: any;
  createdAt?: any;
  updatedAt?: any;
  matchPassword?: (enteredPassword: string) => Promise<boolean>;
  save?: () => Promise<void>;
}

const User = {
  async findOne(query: Record<string, any>): Promise<IUser | null> {
    const keys = Object.keys(query);
    if (keys.length === 0) return null;
    let q = getSupabase().from('users').select('*');
    for (const k of keys) {
      if (query[k] !== undefined) {
        q = q.eq(k, query[k]);
      }
    }
    const { data, error } = await q.limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    const user: IUser = {
      ...(row.data || {}),
      ...row,
      _id: row._id,
    };
    delete (user as any).data;
    user.matchPassword = async function (enteredPassword: string) {
      return await bcrypt.compare(enteredPassword, this.password || '');
    };
    return user;
  },

  async findById(id: string): Promise<IUser | null> {
    if (!id) return null;
    const { data, error } = await getSupabase().from('users').select('*').eq('_id', id).maybeSingle();
    if (error || !data) return null;
    const user: IUser = {
      ...(data.data || {}),
      ...data,
      _id: data._id,
    };
    delete (user as any).data;
    user.matchPassword = async function (enteredPassword: string) {
      return await bcrypt.compare(enteredPassword, this.password || '');
    };
    return user;
  },

  async create(data: Partial<IUser>): Promise<IUser> {
    if (data.password) {
      // Work factor 12 for strong cryptographic resistance
      const salt = await bcrypt.genSalt(12);
      data.password = await bcrypt.hash(data.password, salt);
    }

    const id = data._id || crypto.randomUUID();
    const now = new Date().toISOString();
    const payload: any = {
      _id: id,
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role || 'User',
      mustChangePassword: data.mustChangePassword ?? false,
      permissions: data.permissions || {},
      isVerified: data.isVerified ?? false,
      failedLoginAttempts: data.failedLoginAttempts ?? 0,
      lockUntil: data.lockUntil ?? null,
      createdAt: now,
      updatedAt: now,
      data: { ...data, _id: id, createdAt: now, updatedAt: now },
    };
    const { error } = await getSupabase().from('users').insert(payload);
    if (error) throw new Error(`Supabase create user error: ${error.message}`);
    return { ...data, _id: id } as IUser;
  },

  async update(id: string, updateData: Partial<IUser>): Promise<void> {
    if (updateData.password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const now = new Date().toISOString();
    const cleanUpdate: any = { ...updateData, updatedAt: now };
    delete cleanUpdate._id;
    const existing = await User.findById(id);
    if (existing) {
      cleanUpdate.data = { ...(existing as any), ...cleanUpdate };
    }
    await getSupabase().from('users').update(cleanUpdate).eq('_id', id);
    serverCache.delete(`auth_user_${id}`);
  }
};

export default User;
