import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import RecycleBin from '../models/RecycleBin';
import { getSupabase } from '../config/supabase';

// @desc    Get all sales people
// @route   GET /api/sales-people
// @access  Private/Admin
export const getSalesPeople = async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await getSupabase().from('users').select('*').eq('role', 'Sales Person');
    if (error) throw error;
    const uniqueMap = new Map<string, any>();
    (data || []).forEach(row => {
      const key = (row.email || row.name || row._id).trim().toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          _id: row._id,
          name: row.name,
          email: row.email,
          role: row.role,
          permissions: row.permissions,
          createdAt: row.createdAt
        });
      }
    });
    res.json(Array.from(uniqueMap.values()));
  } catch (error: any) {
    console.error('Get sales people error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Create sales person
// @route   POST /api/sales-people
// @access  Private/Admin
export const createSalesPerson = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Please provide name, email, and password' });
      return;
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      res.status(400).json({ message: 'User with this email already exists' });
      return;
    }

    const inBin = await RecycleBin.checkEmailInBin(email.toLowerCase());
    if (inBin) {
      res.status(409).json({
        message: `This email belongs to deleted user "${inBin.name}". You can restore them or release this email in the Recycle Bin.`,
        inBin: true,
        binId: inBin._id,
      });
      return;
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: 'Sales Person',
      permissions: null, // Sales people might not need sub-admin permissions, but we'll default to null
      mustChangePassword: true
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error: any) {
    console.error('Create sales person error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Update sales person
// @route   PUT /api/sales-people/:id
// @access  Private/Admin
export const updateSalesPerson = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name, email, password } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== 'Sales Person') {
      res.status(404).json({ message: 'Sales person not found' });
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

    await User.update(id, updateData);

    // Fetch updated user to return
    const updatedUser = await User.findById(id);

    res.json({
      _id: updatedUser?._id,
      name: updatedUser?.name,
      email: updatedUser?.email,
      role: updatedUser?.role,
    });
  } catch (error: any) {
    console.error('Update sales person error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Delete sales person
// @route   DELETE /api/sales-people/:id
// @access  Private/Admin
export const deleteSalesPerson = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const user = await User.findById(id);
    if (!user || user.role !== 'Sales Person') {
      res.status(404).json({ message: 'Sales person not found' });
      return;
    }

    // Archive into Recycle Bin
    await RecycleBin.addToBin({
      entityType: 'salesPerson',
      entityId: user._id!,
      name: user.name || 'Unnamed Sales Person',
      email: user.email,
      secondaryInfo: 'Role: Sales Person',
      itemData: user,
      deletedBy: req.user,
      emailStatus: 'held',
    });

    await getSupabase().from('users').delete().eq('_id', id);
    res.json({ message: 'Sales person moved to Recycle Bin' });
  } catch (error: any) {
    console.error('Delete sales person error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
