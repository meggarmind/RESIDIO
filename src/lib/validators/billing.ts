import { z } from 'zod';
import type { BillingTargetType, BillableRole, BillingFrequency } from '@/types/database';

// Billing target type enum
const billingTargetTypeEnum = z.enum(['house', 'resident']);

// Billable roles enum
const billableRoleEnum = z.enum([
  'resident_landlord',
  'non_resident_landlord',
  'tenant',
  'developer',
]);

// Billing frequency enum
const billingFrequencyEnum = z.enum(['monthly', 'yearly', 'one_off']);

// Billing item schema
export const billingItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.coerce.number().min(0, 'Amount must be positive'),
  frequency: billingFrequencyEnum,
  is_mandatory: z.boolean().default(true),
});

export type BillingItemData = z.infer<typeof billingItemSchema>;

// Base billing profile schema (without refinements for form type inference)
const baseBillingProfileSchema = z.object({
  name: z.string().min(1, 'Profile name is required'),
  description: z.string().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  target_type: billingTargetTypeEnum.default('house'),
  applicable_roles: z.array(billableRoleEnum).optional().nullable(),
  is_one_time: z.boolean().default(false),
  is_development_levy: z.boolean().default(false), // True for Development Levy profiles (flat fee per house)
  effective_date: z.string().optional(), // ISO date string (YYYY-MM-DD)
  items: z.array(billingItemSchema).optional(),
});

// Billing profile schema with validation refinements
export const billingProfileSchema = baseBillingProfileSchema
  .refine(
    (data) => {
      // If target_type is 'resident', applicable_roles must have at least one role
      if (data.target_type === 'resident') {
        return data.applicable_roles && data.applicable_roles.length > 0;
      }
      return true;
    },
    {
      message: 'At least one role must be selected for resident-targeted profiles',
      path: ['applicable_roles'],
    }
  )
  .refine(
    (data) => {
      // Development Levy must be a one-time profile
      if (data.is_development_levy) {
        return data.is_one_time === true;
      }
      return true;
    },
    {
      message: 'Development Levy must be a one-time profile',
      path: ['is_development_levy'],
    }
  );

export type BillingProfileData = z.infer<typeof baseBillingProfileSchema>;

// Export base schema for form type inference
export { baseBillingProfileSchema };

// System settings schema
export const systemSettingSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.unknown(),
  description: z.string().optional(),
  category: z.string().default('general'),
});

export type SystemSettingData = z.infer<typeof systemSettingSchema>;

// Billing settings keys (type-safe)
export const BILLING_SETTINGS = {
  BILL_VACANT_HOUSES: 'bill_vacant_houses',
  AUTO_GENERATE_LEVIES: 'auto_generate_levies',
  PRO_RATA_FIRST_MONTH: 'pro_rata_first_month',
  INVOICE_DUE_DAY: 'invoice_due_day',
  CURRENT_DEVELOPMENT_LEVY_PROFILE_ID: 'current_development_levy_profile_id',
} as const;

// Helper to check if a role is billable
export function isBillableRole(role: string): role is BillableRole {
  return ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(role);
}

// Helper to get display label for billing target type
export function getBillingTargetLabel(targetType: BillingTargetType): string {
  return targetType === 'house' ? 'Property (House)' : 'Resident (Role-Based)';
}

// =====================================================
// Billing profile versions (historical rate schedule)
// =====================================================

/**
 * A billing profile version's `effective_from` is constrained in the database by
 * `CHECK (effective_from = date_trunc('month', effective_from)::date)`. Validate
 * it here rather than letting the insert fail: a raw CHECK violation surfaces to
 * the admin as an opaque Postgres error, and the month is the one field a
 * historical rate entry cannot get wrong.
 */
export const monthStartDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/, 'Effective from must be the first day of a month (YYYY-MM-01)')
  .refine((value) => {
    const month = Number(value.slice(5, 7));
    if (month < 1 || month > 12) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Effective from must be a real calendar month');

export const billingProfileVersionItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  amount: z.coerce.number().min(0, 'Amount must be zero or greater'),
  frequency: billingFrequencyEnum,
  is_mandatory: z.boolean().default(true),
});

export type BillingProfileVersionItemData = z.infer<typeof billingProfileVersionItemSchema>;

export const billingProfileVersionSchema = z.object({
  billing_profile_id: z.string().uuid('A billing profile must be selected'),
  effective_from: monthStartDateSchema,
  items: z.array(billingProfileVersionItemSchema).min(1, 'At least one rate item is required'),
});

export type BillingProfileVersionData = z.infer<typeof billingProfileVersionSchema>;

/** Item edits for an unlocked, unapproved version. The profile it belongs to never moves. */
export const billingProfileVersionUpdateSchema = z.object({
  effective_from: monthStartDateSchema.optional(),
  items: z.array(billingProfileVersionItemSchema).min(1, 'At least one rate item is required').optional(),
});

export type BillingProfileVersionUpdateData = z.infer<typeof billingProfileVersionUpdateSchema>;
