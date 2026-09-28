import { getDb } from '../config/firebase';
import bcrypt from 'bcrypt';
import { serverCache } from '../utils/cache';

const getCollection = () => getDb().collection('users');

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
    let ref: any = getCollection();
    for (const key of keys) {
      if (query[key] !== undefined) {
        ref = ref.where(key, '==', query[key]);
      }
    }
    const snapshot = await ref.limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data() as IUser;
    data._id = doc.id;
    data.matchPassword = async function (enteredPassword: string) {
      return await bcrypt.compare(enteredPassword, this.password || '');
    };
    return data;
  },

  async findById(id: string): Promise<IUser | null> {
    const doc = await getCollection().doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as IUser;
    data._id = doc.id;
    data.matchPassword = async function (enteredPassword: string) {
      return await bcrypt.compare(enteredPassword, this.password || '');
    };
    return data;
  },

  async create(data: Partial<IUser>): Promise<IUser> {
    if (data.password) {
      // Work factor 12 for strong cryptographic resistance
      const salt = await bcrypt.genSalt(12);
      data.password = await bcrypt.hash(data.password, salt);
    }
    const docRef = await getCollection().add({
      ...data,
      isVerified: data.isVerified ?? false,
      failedLoginAttempts: data.failedLoginAttempts ?? 0,
      lockUntil: data.lockUntil ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...data, _id: docRef.id } as IUser;
  },

  async update(id: string, updateData: Partial<IUser>): Promise<void> {
    if (updateData.password) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }
    await getCollection().doc(id).update({
      ...updateData,
      updatedAt: new Date(),
    });
    serverCache.delete(`auth_user_${id}`);
  }
};

export default User;
