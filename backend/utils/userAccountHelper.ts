import { Response } from 'express';
import User, { IUser } from '../models/User';
import RecycleBin, { BinEntityType } from '../models/RecycleBin';

export async function createManagedUser(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  permissions?: any;
  mustChangePassword?: boolean;
}): Promise<{ status: number; body: any }> {
  const emailLower = params.email.trim().toLowerCase();

  const userExists = await User.findOne({ email: emailLower });
  if (userExists) {
    return { status: 400, body: { message: 'User with this email already exists' } };
  }

  const inBin = await RecycleBin.checkEmailInBin(emailLower);
  if (inBin) {
    return {
      status: 409,
      body: {
        message: `This email belongs to deleted user "${inBin.name}". You can restore them or release this email in the Recycle Bin.`,
        inBin: true,
        binId: inBin._id,
      },
    };
  }

  const user = await User.create({
    name: params.name,
    email: emailLower,
    password: params.password,
    role: params.role,
    permissions: params.permissions ?? null,
    mustChangePassword: params.mustChangePassword ?? true,
  });

  return { status: 201, body: user };
}

export async function updateManagedUser(
  id: string,
  expectedRole: string,
  notFoundLabel: string,
  updates: { name?: string; email?: string; password?: string; permissions?: any }
): Promise<{ status: number; body: any }> {
  const user = await User.findById(id);
  if (!user || user.role !== expectedRole) {
    return { status: 404, body: { message: `${notFoundLabel} not found` } };
  }

  const updateData: Partial<IUser> = {};
  if (updates.name) updateData.name = updates.name;
  if (updates.email) {
    const emailLower = updates.email.trim().toLowerCase();
    if (emailLower !== user.email) {
      const existing = await User.findOne({ email: emailLower });
      if (existing) {
        return { status: 400, body: { message: 'Email already in use' } };
      }
      updateData.email = emailLower;
    }
  }
  if (updates.password) updateData.password = updates.password;
  if (updates.permissions !== undefined) updateData.permissions = updates.permissions;

  await User.update(id, updateData);
  const updatedUser = await User.findById(id);

  return {
    status: 200,
    body: {
      _id: updatedUser?._id,
      name: updatedUser?.name,
      email: updatedUser?.email,
      role: updatedUser?.role,
      permissions: updatedUser?.permissions,
    },
  };
}

export async function softDeleteManagedUserToBin(
  id: string,
  userDoc: IUser,
  entityType: BinEntityType,
  roleLabel: string,
  deletedBy: any,
  res: Response
): Promise<void> {
  await RecycleBin.addToBin({
    entityType,
    entityId: userDoc._id!,
    name: userDoc.name || `Unnamed ${roleLabel}`,
    email: userDoc.email,
    secondaryInfo: `Role: ${roleLabel}`,
    itemData: userDoc,
    deletedBy,
    emailStatus: 'held',
  });

  // Always delete via User.delete so auth_user cache is invalidated cleanly
  await User.delete(id);
  res.json({ message: `${roleLabel} moved to Recycle Bin` });
}
