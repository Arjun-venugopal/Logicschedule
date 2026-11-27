import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import User from '../models/User';
import { getSupabase } from '../config/supabase';
import {
  createManagedUser,
  updateManagedUser,
  softDeleteManagedUserToBin,
} from '../utils/userAccountHelper';

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

    const result = await createManagedUser({
      name,
      email,
      password,
      role: 'Sales Person',
      permissions: null,
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
    const result = await updateManagedUser(id, 'Sales Person', 'Sales person', {
      name,
      email,
      password,
    });
    res.status(result.status).json(result.body);
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

    await softDeleteManagedUserToBin(id, user, 'salesPerson', 'Sales Person', req.user, res);
  } catch (error: any) {
    console.error('Delete sales person error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
