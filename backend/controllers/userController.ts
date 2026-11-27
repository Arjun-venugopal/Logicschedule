import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import Teacher from '../models/Teacher';
import { getSupabase } from '../config/supabase';
import {
  createManagedUser,
  updateManagedUser,
  softDeleteManagedUserToBin,
} from '../utils/userAccountHelper';

// @desc    Get all sub admins
// @route   GET /api/users/sub-admins
// @access  Private/Admin
export const getSubAdmins = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await getSupabase().from('users').select('*').eq('role', 'Sub Admin');
    if (error) throw error;
    const subAdmins = (data || []).map(row => ({
      _id: row._id,
      name: row.name,
      email: row.email,
      role: row.role,
      permissions: row.permissions,
      createdAt: row.createdAt
    }));
    res.json(subAdmins);
  } catch (error: any) {
    console.error('Get sub admins error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Create sub admin
// @route   POST /api/users/sub-admins
// @access  Private/Admin
export const createSubAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, permissions, teacherUserId } = req.body;

    // Handle assigning an existing teacher
    if (teacherUserId) {
      const existingUser = await User.findById(teacherUserId);
      if (!existingUser) {
        res.status(404).json({ message: 'Teacher user not found' });
        return;
      }

      await User.update(teacherUserId, {
        role: 'Sub Admin',
        permissions
      });

      const updatedUser = await User.findById(teacherUserId);
      res.status(201).json({
        _id: updatedUser?._id,
        name: updatedUser?.name,
        email: updatedUser?.email,
        role: updatedUser?.role,
        permissions: updatedUser?.permissions
      });
      return;
    }

    if (!name || !email || !password || !permissions) {
      res.status(400).json({ message: 'Please provide name, email, password, and permissions' });
      return;
    }

    const result = await createManagedUser({
      name,
      email,
      password,
      role: 'Sub Admin',
      permissions,
      mustChangePassword: true,
    });
    if (result.status !== 201) {
      res.status(result.status).json(result.body);
      return;
    }

    const user = result.body;
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions
    });
  } catch (error: any) {
    console.error('Create sub admin error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update sub admin
// @route   PUT /api/users/sub-admins/:id
// @access  Private/Admin
export const updateSubAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, email, password, permissions } = req.body;
    const result = await updateManagedUser(id, 'Sub Admin', 'Sub admin', {
      name,
      email,
      password,
      permissions,
    });
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Update sub admin error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete sub admin
// @route   DELETE /api/users/sub-admins/:id
// @access  Private/Admin
export const deleteSubAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const user = await User.findById(id);
    if (!user || user.role !== 'Sub Admin') {
      res.status(404).json({ message: 'Sub admin not found' });
      return;
    }

    // If the user is also a Teacher, just revert their role
    const teacher = await Teacher.findOne({ user: id });
    if (teacher) {
      await User.update(id, { role: 'Teacher', permissions: null });
      res.json({ message: 'Sub admin privileges removed, user reverted to Teacher' });
      return;
    }

    await softDeleteManagedUserToBin(id, user, 'subAdmin', 'Sub Admin', req.user, res);
  } catch (error: any) {
    console.error('Delete sub admin error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Bulk update all sub admins permissions
// @route   PUT /api/users/sub-admins/bulk-permissions
// @access  Private/Admin
export const bulkUpdateSubAdminsPermissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      res.status(400).json({ message: 'Valid permissions object is required' });
      return;
    }

    const { data: subAdmins, error } = await getSupabase().from('users').select('_id, data').eq('role', 'Sub Admin');
    if (error) throw error;

    const list = subAdmins || [];
    const CHUNK_SIZE = 10;
    for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      await Promise.all(
        list.slice(i, i + CHUNK_SIZE).map((admin: any) => User.update(admin._id, { permissions }))
      );
    }

    res.json({ message: `Successfully updated permissions for ${list.length} sub admin(s)` });
  } catch (error: any) {
    console.error('Bulk update sub admins error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

