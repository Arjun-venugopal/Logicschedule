import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Teacher from '../models/Teacher';
import generateToken, { generateTokens, REFRESH_COOKIE_OPTIONS, parseCookies } from '../utils/generateToken';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
} from '../utils/authValidation';
import { serverCache } from '../utils/cache';
import { config } from '../config/config';

// Maximum failed login attempts allowed before temporary lockout
const MAX_FAILED_ATTEMPTS = 5;
// Lockout duration in milliseconds (15 minutes)
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// @desc    Login user & get token pair with brute-force lockout protection
// @route   POST /auth/login
// @access  Public
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validate request body against schema
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: validation.error.issues[0]?.message || 'Invalid login credentials',
      });
      return;
    }

    const { email, password } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // 2. Fetch user by email
    const user: any = await User.findOne({ email: normalizedEmail });

    // 3. Prevent account enumeration by using generic failure response
    if (!user) {
      console.warn(`[AUTH_AUDIT] Failed login attempt for non-existent account: ${normalizedEmail}`);
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // 4. Check for active account lockout
    if (user.lockUntil) {
      const lockDate = new Date(user.lockUntil);
      if (lockDate.getTime() > Date.now()) {
        const remainingMinutes = Math.ceil((lockDate.getTime() - Date.now()) / 60000);
        console.warn(`[AUTH_AUDIT] Blocked login attempt on locked account: ${normalizedEmail}`);
        res.status(423).json({
          message: `Account temporarily locked due to excessive failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        });
        return;
      }
    }

    // 5. Verify password hash using bcrypt
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        console.warn(`[AUTH_AUDIT] Account locked for ${normalizedEmail} after ${failedAttempts} failed attempts`);
        await User.update(user._id, updateData);
        res.status(423).json({
          message: 'Account temporarily locked due to excessive failed attempts. Please try again in 15 minutes.',
        });
        return;
      }

      await User.update(user._id, updateData);
      console.warn(`[AUTH_AUDIT] Failed password attempt ${failedAttempts}/${MAX_FAILED_ATTEMPTS} for: ${normalizedEmail}`);
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    // 6. Reset failed attempts upon successful authentication
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      await User.update(user._id, {
        failedLoginAttempts: 0,
        lockUntil: null,
      });
    }

    // 7. Generate Access + Refresh Token pair
    const tokens = generateTokens(user._id, user.role);

    // 8. Set HttpOnly Refresh Cookie
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

    console.log(`[AUTH_AUDIT] Successful login for user: ${normalizedEmail} (Role: ${user.role})`);

    // 9. Send response (maintaining backward-compatibility for frontend)
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      isVerified: user.isVerified ?? true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error: any) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'An unexpected server error occurred during authentication.' });
  }
};

// @desc    Register a new user with password validation & email verification token
// @route   POST /auth/register
// @access  Public
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validate request body against schema (enforcing strong passwords)
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: validation.error.issues[0]?.message || 'Invalid registration data',
      });
      return;
    }

    const { name, email, password, role } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // 2. Prevent duplicate accounts
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      res.status(400).json({ message: 'A user with this email address already exists' });
      return;
    }

    // 3. Generate cryptographic email verification token (24-hour expiration)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 4. Create User (password automatically hashed with bcrypt factor 12)
    const user: any = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: role || 'Admin',
      isVerified: false,
      verificationToken,
      verificationExpires,
      failedLoginAttempts: 0,
      lockUntil: null,
    });

    if (user) {
      const tokens = generateTokens(user._id, user.role);
      res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

      console.log(`[AUTH_AUDIT] New user registered: ${normalizedEmail} (Role: ${user.role})`);

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        isVerified: false,
        verificationToken, // Provided in response for verification flow
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } else {
      res.status(400).json({ message: 'Failed to create user account' });
    }
  } catch (error: any) {
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'An unexpected server error occurred during registration.' });
  }
};

// @desc    Refresh session using long-lived refresh token
// @route   POST /auth/refresh
// @access  Public (Requires Refresh Token)
export const refreshTokenHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ message: 'Refresh token is required' });
      return;
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, config.JWT_SECRET);
    } catch {
      res.status(401).json({ message: 'Invalid or expired refresh token' });
      return;
    }

    if (decoded.type !== 'refresh') {
      res.status(401).json({ message: 'Supplied token is not a refresh token' });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ message: 'User account associated with this token no longer exists' });
      return;
    }

    // Generate rotated tokens
    const tokens = generateTokens(user._id as string, user.role);
    res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error: any) {
    console.error('Refresh token error:', error.message);
    res.status(500).json({ message: 'Server error processing token refresh' });
  }
};

// @desc    Logout user & clear refresh session
// @route   POST /auth/logout
// @access  Public
export const logoutUser = async (req: any, res: Response): Promise<void> => {
  try {
    if (req.user?._id) {
      serverCache.delete(`auth_user_${req.user._id}`);
    }
    res.clearCookie('refreshToken', { path: '/' });
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error.message);
    res.status(500).json({ message: 'Server error processing logout' });
  }
};

// @desc    Verify email address using verification token
// @route   POST /auth/verify-email
// @access  Public
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req.body.token || req.query.token) as string;
    const validation = verifyEmailSchema.safeParse({ token });

    if (!validation.success) {
      res.status(400).json({ message: 'Valid verification token is required' });
      return;
    }

    const user = await User.findOne({ verificationToken: validation.data.token });

    if (!user) {
      res.status(400).json({ message: 'Invalid or already used verification token' });
      return;
    }

    if (user.verificationExpires && new Date(user.verificationExpires).getTime() < Date.now()) {
      res.status(400).json({ message: 'Verification token has expired. Please request a new one.' });
      return;
    }

    await User.update(user._id as string, {
      isVerified: true,
      verificationToken: null,
      verificationExpires: null,
    });

    console.log(`[AUTH_AUDIT] Email verified successfully for: ${user.email}`);

    res.json({ message: 'Email verified successfully. You can now access all features.' });
  } catch (error: any) {
    console.error('Verify email error:', error.message);
    res.status(500).json({ message: 'Server error during email verification' });
  }
};

// @desc    Initiate password reset flow (Time-limited cryptographic token)
// @route   POST /auth/forgot-password
// @access  Public
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ message: validation.error.issues[0]?.message || 'Invalid email address' });
      return;
    }

    const normalizedEmail = validation.data.email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Always return success response to prevent user account enumeration
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

      await User.update(user._id as string, {
        resetPasswordToken: resetToken,
        resetPasswordExpires,
      });

      console.log(`[AUTH_AUDIT] Password reset token generated for: ${normalizedEmail}`);
    }

    res.json({
      message: 'If that email address is registered, a password reset link has been dispatched.',
    });
  } catch (error: any) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ message: 'Server error processing password reset request' });
  }
};

// @desc    Reset password using time-limited reset token
// @route   POST /auth/reset-password
// @access  Public
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: validation.error.issues[0]?.message || 'Invalid reset token or password criteria',
      });
      return;
    }

    const { token, newPassword } = validation.data;
    const user = await User.findOne({ resetPasswordToken: token });

    if (!user) {
      res.status(400).json({ message: 'Password reset token is invalid or has already been used' });
      return;
    }

    if (user.resetPasswordExpires && new Date(user.resetPasswordExpires).getTime() < Date.now()) {
      res.status(400).json({ message: 'Password reset token has expired. Please request a new one.' });
      return;
    }

    // Update password (hashed with bcrypt salt 12) & clear lockout/reset fields
    await User.update(user._id as string, {
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      failedLoginAttempts: 0,
      lockUntil: null,
      mustChangePassword: false,
    });

    console.log(`[AUTH_AUDIT] Password reset successfully executed for: ${user.email}`);

    res.json({ message: 'Password has been reset successfully. You may now log in with your new credentials.' });
  } catch (error: any) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ message: 'Server error resetting password' });
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

    const normalizedEmail = email.toLowerCase().trim();

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
      isVerified: true,
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

// @desc    Change current user password with strength validation
// @route   PUT /auth/change-password
// @access  Private
export const changePassword = async (req: any, res: Response): Promise<void> => {
  try {
    const validation = changePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        message: validation.error.issues[0]?.message || 'Invalid password criteria',
      });
      return;
    }

    const { currentPassword, newPassword } = validation.data;
    const user: any = await User.findById(req.user._id);

    if (user && (await user.matchPassword(currentPassword))) {
      await User.update(user._id, {
        password: newPassword,
        mustChangePassword: false,
      });

      // Update tempPassword on Teacher profile so Admin view stays in sync
      if (user.role === 'Teacher' || user.role === 'Sub Admin') {
        const teacher = await Teacher.findOne({ user: user._id });
        if (teacher) {
          await Teacher.findByIdAndUpdate(teacher._id, { tempPassword: newPassword });
        }
      }

      console.log(`[AUTH_AUDIT] Password changed successfully for user: ${user.email}`);
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(401).json({ message: 'Invalid current password' });
    }
  } catch (error: any) {
    console.error('Change password error:', error.message);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};
