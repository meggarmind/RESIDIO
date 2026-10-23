/**
 * Shared billing types used across invoice and levy generation
 */

import type { BillableRole } from '@/types/database';

/**
 * Billing item structure within a billing profile
 */
export interface BillingItem {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  is_mandatory: boolean;
}

/**
 * Billing profile with its associated items
 * Used in both invoice and levy generation
 */
export interface BillingProfileWithItems {
  id: string;
  name: string;
  target_type: 'house' | 'resident';
  payer: 'occupant' | 'landlord';
  applicable_roles: BillableRole[] | null;
  is_one_time: boolean;
  is_development_levy?: boolean;
  billing_items?: BillingItem[];
}

/**
 * Result from invoice generation
 */
export interface InvoiceGenerationResult {
  success: boolean;
  generated: number;
  skipped: number;
  errors: string[];
  autoWalletDebits?: number;
  emailsSent?: number;
}

/**
 * Result from levy generation
 */
export interface LevyGenerationResult {
  success: boolean;
  generated: number;
  skipped: number;
  errors: string[];
  /** Houses where a landlord-paid levy was not raised because no landlord is on record. */
  warnings: string[];
}
