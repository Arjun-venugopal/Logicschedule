import { getDb } from '../config/firebase';
import bcrypt from 'bcrypt';

const getCollection = () => getDb().collection('users');

export interface IUser {
  _id?: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  mustChangePassword?: boolean;
  createdAt?: any;
  updatedAt?: any;
  matchPassword?: (enteredPassword: string) => Promise<boolean>;
  save?: () => Promise<void>;
}

const User = {
  async findOne(query: { email: string }): Promise<IUser | null> {
    const snapshot = await getCollection().where('email', '==', query.email).limit(1).get();
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
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }
    const docRef = await getCollection().add({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...data, _id: docRef.id } as IUser;
  },

  async update(id: string, updateData: Partial<IUser>): Promise<void> {
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }
    await getCollection().doc(id).update({
      ...updateData,
      updatedAt: new Date(),
    });
  }
};

export default User;
