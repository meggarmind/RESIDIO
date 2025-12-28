import { z } from 'zod';

/**
 * Common weak passwords that should be explicitly rejected.
 * These are frequently used and easily guessable.
 */
export const COMMON_PASSWORDS = [
  'password', 'password1', 'password123', '12345678', '123456789',
  'qwerty123', 'letmein', 'welcome1', 'admin123', 'changeme',
  'iloveyou1', 'sunshine1', 'princess1', 'football1', 'monkey123',
];

/**
 * Password validation schema with security requirements.
 *
 * Requirements:
 * - Minimum 12 characters (NIST 2024 recommendation)
 * - Maximum 128 characters (prevent DoS via long password hashing)
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one number
 * - At least one special character
 * - Not in common passwords list
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character')
  .refine(
    (password) => !COMMON_PASSWORDS.includes(password.toLowerCase()),
    'This password is too common. Please choose a stronger password.'
  );

/**
 * Password requirements for display in UI
 */
export const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { id: 'lowercase', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'uppercase', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character', test: (p: string) => /[^a-zA-Z0-9]/.test(p) },
];
