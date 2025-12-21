/**
 * Authorization Types and Role Configurations
 *
 * These are separated from the 'use server' authorize.ts file because
 * Next.js 15/16 only allows async function exports from 'use server' files.
 */

import type { UserRole } from '@/types/database';

export interface AuthorizationResult {
  authorized: boolean;
  userId: string | null;
  role: UserRole | null;
  error: string | null;
}

/**
 * Role configurations for common actions
 * Based on route access control defined in middleware.ts
 */
export const ACTION_ROLES = {
  // Resident management - admin, chairman, financial_secretary
  residents: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // House management - admin, chairman, financial_secretary
  houses: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Payment management - admin, chairman, financial_secretary
  payments: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Security contacts - admin, chairman (for create/update/delete)
  security_write: ['admin', 'chairman'] as UserRole[],

  // Security contacts - admin, chairman, security_officer (for read)
  security_read: ['admin', 'chairman', 'security_officer'] as UserRole[],

  // Reference data (streets, house types) - admin, chairman
  reference: ['admin', 'chairman'] as UserRole[],

  // Billing management - admin, chairman, financial_secretary
  billing: ['admin', 'chairman', 'financial_secretary'] as UserRole[],

  // Admin only actions
  admin: ['admin'] as UserRole[],

  // Settings - admin, chairman
  settings: ['admin', 'chairman'] as UserRole[],
} as const;
