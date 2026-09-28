import { z } from 'zod';

/**
 * Strong password specification:
 * - 8 to 128 characters
 * - Minimum 1 uppercase letter
 * - Minimum 1 lowercase letter
 * - Minimum 1 number
 * - Minimum 1 special symbol
 */
export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,128}$/;

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(
    passwordRegex,
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  );

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long').max(70, 'Name cannot exceed 70 characters'),
  email: z.string().trim().email('Invalid email address format').toLowerCase(),
  password: passwordSchema,
  role: z.enum(['Admin', 'Super Admin', 'Sub Admin', 'Teacher', 'Sales Person']).optional().default('Admin'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address format').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address format').toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Reset token is invalid or missing'),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10, 'Verification token is invalid or missing'),
});
