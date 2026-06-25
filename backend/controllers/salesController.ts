import { Request, Response } from 'express';
import User from '../models/User';

// @desc    Get all sales people
// @route   GET /api/sales-people
// @access  Private/Admin
export const getSalesPeople = async (req: Request, res: Response): Promise<void> => {
  try {
    const { getDb } = await import('../config/firebase');
    const snapshot = await getDb().collection('users').where('role', '==', 'Sales Person').get();
    
    const salesPeople = snapshot.docs.map(doc => {
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

    res.json(salesPeople);
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
export const deleteSalesPerson = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const user = await User.findById(id);
    if (!user || user.role !== 'Sales Person') {
      res.status(404).json({ message: 'Sales person not found' });
      return;
    }

    const { getDb } = await import('../config/firebase');
    await getDb().collection('users').doc(id).delete();

    res.json({ message: 'Sales person removed' });
  } catch (error: any) {
    console.error('Delete sales person error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
