import { Request, Response } from 'express';
import User from '../models/User';
import Teacher from '../models/Teacher';

// @desc    Get all sub admins
// @route   GET /api/users/sub-admins
// @access  Private/Admin
export const getSubAdmins = async (req: Request, res: Response): Promise<void> => {
  try {
    const { getDb } = await import('../config/firebase');
    const snapshot = await getDb().collection('users').where('role', '==', 'Sub Admin').get();
    
    const subAdmins = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        _id: doc.id,
        name: data.name,
        email: data.email,
        role: data.role,
        permissions: data.permissions,
        createdAt: data.createdAt
      };
    });

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

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      res.status(400).json({ message: 'User with this email already exists' });
      return;
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: 'Sub Admin',
      permissions,
      mustChangePassword: true
    });

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

    const user = await User.findById(id);
    if (!user || user.role !== 'Sub Admin') {
      res.status(404).json({ message: 'Sub admin not found' });
      return;
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) {
      const emailLower = email.toLowerCase();
      // Check if email belongs to someone else
      if (emailLower !== user.email) {
        const existing = await User.findOne({ email: emailLower });
        if (existing) {
          res.status(400).json({ message: 'Email already in use' });
          return;
        }
        updateData.email = emailLower;
      }
    }
    if (password) updateData.password = password;
    if (permissions) updateData.permissions = permissions;

    await User.update(id, updateData);
    
    // Fetch updated user to return
    const updatedUser = await User.findById(id);

    res.json({
      _id: updatedUser?._id,
      name: updatedUser?.name,
      email: updatedUser?.email,
      role: updatedUser?.role,
      permissions: updatedUser?.permissions
    });
  } catch (error: any) {
    console.error('Update sub admin error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete sub admin
// @route   DELETE /api/users/sub-admins/:id
// @access  Private/Admin
export const deleteSubAdmin = async (req: Request, res: Response): Promise<void> => {
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

    const { getDb } = await import('../config/firebase');
    await getDb().collection('users').doc(id).delete();

    res.json({ message: 'Sub admin removed' });
  } catch (error: any) {
    console.error('Delete sub admin error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
