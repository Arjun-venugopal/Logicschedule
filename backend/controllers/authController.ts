import { Request, Response } from 'express';
import User from '../models/User';
import Teacher from '../models/Teacher';
import generateToken from '../utils/generateToken';

// @desc    Login user & get token
// @route   POST /auth/login
// @access  Public
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Please provide email and password' });
      return;
    }

    const user: any = await User.findOne({ email: email.toLowerCase() });

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error: any) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Register a new admin user (first-time setup)
// @route   POST /auth/register
// @access  Public
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Please provide name, email, and password' });
      return;
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      res.status(400).json({ message: 'User with this email already exists' });
      return;
    }

    const user: any = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'Admin',
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error: any) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Admin creates a teacher account with temp password
// @route   POST /auth/create-teacher
// @access  Private/Admin
export const createTeacherAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, tempPassword, phone } = req.body;

    if (!name || !email || !tempPassword) {
      res.status(400).json({ message: 'Please provide name, email, and temporary password' });
      return;
    }

    const normalizedEmail = email.toLowerCase();

    // Check user doesn't already exist
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      res.status(400).json({ message: 'A user with this email already exists' });
      return;
    }

    // Create User (for login)
    const user: any = await User.create({
      name,
      email: normalizedEmail,
      password: tempPassword,
      role: 'Teacher',
      mustChangePassword: true,
    });

    // Create Teacher profile (for scheduling & listings)
    const teacherExists = await Teacher.findOne({ email: normalizedEmail });
    if (!teacherExists) {
      await Teacher.create({
        user: user._id,
        name,
        email: normalizedEmail,
        phone: phone || '',
        status: 'Available',
        tempPassword: tempPassword, // Store so admin can view it later
      });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tempPassword,
      message: 'Teacher account created. Share the temporary password with the teacher.',
    });
  } catch (error: any) {
    console.error('Create teacher error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// @desc    Change current user password
// @route   PUT /auth/change-password
// @access  Private
export const changePassword = async (req: any, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Please provide current and new password' });
      return;
    }

    const user: any = await User.findById(req.user._id);

    if (user && (await user.matchPassword(currentPassword))) {
      await User.update(user._id, {
        password: newPassword,
        mustChangePassword: false,
      });

      // Clear tempPassword from Teacher profile if it exists
      if (user.role === 'Teacher') {
        const teacher = await Teacher.findOne({ user: user._id });
        if (teacher) {
          // teacher.tempPassword = '';
          // await teacher.save(); // Needs Teacher model refactor
          // await Teacher.update(teacher._id, { tempPassword: '' });
        }
      }

      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(401).json({ message: 'Invalid current password' });
    }
  } catch (error: any) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
