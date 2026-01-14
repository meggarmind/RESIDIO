import { z } from 'zod';
import type { SecurityContactStatus, AccessCodeType, IdDocumentType } from '@/types/database';

// Enums for validation
const securityContactStatusEnum = z.enum(['active', 'suspended', 'expired', 'revoked']);
const accessCodeTypeEnum = z.enum(['permanent', 'one_time']);
const idDocumentTypeEnum = z.enum(['nin', 'voters_card', 'drivers_license', 'passport', 'company_id', 'other']);

// Phone number validation regex (Nigerian format support)
const phoneRegex = /^(\+234|0)[789][01]\d{8}$/;

// Base security contact schema
const baseSecurityContactSchema = z.object({
  resident_id: z.string().uuid('Please select a resident'),
  category_id: z.string().uuid('Please select a category'),

  // Basic info (required)
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone_primary: z.string().min(10, 'Phone number must be at least 10 digits'),
  phone_secondary: z.string().optional().or(z.literal('')),

  // Identification (optional for MVP)
  photo_url: z.string().url().optional().or(z.literal('')),
  id_type: idDocumentTypeEnum.optional().nullable(),
  id_number: z.string().optional().or(z.literal('')),
  id_document_url: z.string().url().optional().or(z.literal('')),

  // Additional details
  address: z.string().optional().or(z.literal('')),
  next_of_kin_name: z.string().optional().or(z.literal('')),
  next_of_kin_phone: z.string().optional().or(z.literal('')),
  employer: z.string().optional().or(z.literal('')),
  relationship: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

// Create security contact schema
export const createSecurityContactSchema = baseSecurityContactSchema;

export type CreateSecurityContactData = z.infer<typeof createSecurityContactSchema>;

// Update security contact schema (all fields optional except id)
export const updateSecurityContactSchema = baseSecurityContactSchema.partial().extend({
  id: z.string().uuid('Invalid contact ID'),
});

export type UpdateSecurityContactData = z.infer<typeof updateSecurityContactSchema>;

// Update security contact status schema
export const updateSecurityContactStatusSchema = z.object({
  id: z.string().uuid('Invalid contact ID'),
  status: securityContactStatusEnum,
  reason: z.string().optional(),
});

export type UpdateSecurityContactStatusData = z.infer<typeof updateSecurityContactStatusSchema>;

// Create access code schema
export const createAccessCodeSchema = z.object({
  contact_id: z.string().uuid('Invalid contact ID'),
  code_type: accessCodeTypeEnum,
  validity_days: z.number().min(1, 'Validity must be at least 1 day').max(365, 'Validity cannot exceed 365 days').optional(),
  valid_from: z.string().datetime().optional(), // ISO datetime string
  valid_until: z.string().datetime().optional(), // ISO datetime string
  max_uses: z.number().min(1).optional().nullable(), // NULL for unlimited
}).refine(
  (data) => {
    // One-time codes must have max_uses = 1
    if (data.code_type === 'one_time' && data.max_uses !== 1) {
      return false;
    }
    return true;
  },
  {
    message: 'One-time codes must have max_uses set to 1',
    path: ['max_uses'],
  }
);

export type CreateAccessCodeData = z.infer<typeof createAccessCodeSchema>;

// Revoke access code schema
export const revokeAccessCodeSchema = z.object({
  code_id: z.string().uuid('Invalid code ID'),
  reason: z.string().optional(),
});

export type RevokeAccessCodeData = z.infer<typeof revokeAccessCodeSchema>;

// Verify access code schema (for security officers)
export const verifyAccessCodeSchema = z.object({
  code: z.string().min(1, 'Access code is required').toUpperCase(),
});

export type VerifyAccessCodeData = z.infer<typeof verifyAccessCodeSchema>;

// Check-in schema (record access log entry)
export const checkInSchema = z.object({
  access_code_id: z.string().uuid().optional().nullable(), // Optional if manual check-in
  contact_id: z.string().uuid('Contact ID is required'),
  gate_location: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export type CheckInData = z.infer<typeof checkInSchema>;

// Check-out schema
export const checkOutSchema = z.object({
  log_id: z.string().uuid('Invalid log ID'),
  notes: z.string().optional().or(z.literal('')),
});

export type CheckOutData = z.infer<typeof checkOutSchema>;

// Flag access schema (for suspicious activity)
export const flagAccessSchema = z.object({
  log_id: z.string().uuid('Invalid log ID'),
  flag_reason: z.string().min(5, 'Please provide a reason for flagging (minimum 5 characters)'),
});

export type FlagAccessData = z.infer<typeof flagAccessSchema>;

// Security contact filters/search schema
export const securityContactFiltersSchema = z.object({
  search: z.string().optional(),
  resident_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  status: securityContactStatusEnum.optional(),
  expiring_within_days: z.number().min(1).max(90).optional(), // Find contacts expiring soon
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
});

export type SecurityContactFilters = z.input<typeof securityContactFiltersSchema>;

// Access logs filters schema
export const accessLogsFiltersSchema = z.object({
  contact_id: z.string().uuid().optional(),
  resident_id: z.string().uuid().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  flagged_only: z.boolean().optional(),
  gate_location: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
});

export type AccessLogsFilters = z.input<typeof accessLogsFiltersSchema>;

// Category update schema (admin only)
export const updateCategorySchema = z.object({
  id: z.string().uuid('Invalid category ID'),
  name: z.string().min(2, 'Category name must be at least 2 characters').optional(),
  description: z.string().optional().or(z.literal('')),
  default_validity_days: z.number().min(1).max(365).optional(),
  max_validity_days: z.number().min(1).max(365).optional(),
  requires_photo: z.boolean().optional(),
  requires_id_document: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().min(0).optional(),
}).refine(
  (data) => {
    // max_validity_days must be >= default_validity_days
    if (data.default_validity_days && data.max_validity_days) {
      return data.max_validity_days >= data.default_validity_days;
    }
    return true;
  },
  {
    message: 'Maximum validity must be greater than or equal to default validity',
    path: ['max_validity_days'],
  }
);

export type UpdateCategoryData = z.infer<typeof updateCategorySchema>;

// Security settings update schema
export const updateSecuritySettingsSchema = z.object({
  key: z.string().min(1, 'Setting key is required'),
  value: z.unknown(), // JSONB value - type varies by setting
});

export type UpdateSecuritySettingsData = z.infer<typeof updateSecuritySettingsSchema>;

// Role permissions schema (for settings UI)
export const securityRolePermissionsSchema = z.object({
  register_contacts: z.array(z.string()),
  generate_codes: z.array(z.string()),
  update_contacts: z.array(z.string()),
  verify_codes: z.array(z.string()),
  record_checkin: z.array(z.string()),
  view_contacts: z.array(z.string()),
  search_contacts: z.array(z.string()),
  export_contacts: z.array(z.string()),
  suspend_revoke_contacts: z.array(z.string()),
  configure_categories: z.array(z.string()),
  view_access_logs: z.array(z.string()),
});

export type SecurityRolePermissionsData = z.infer<typeof securityRolePermissionsSchema>;

// Export schemas for code verification
export const codePatternSchema = z.string().regex(
  /^RES-[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}$/,
  'Invalid access code format. Expected format: RES-XXX-XXXX'
);

// Helper to validate access code format
export function isValidAccessCodeFormat(code: string): boolean {
  return codePatternSchema.safeParse(code.toUpperCase()).success;
}

// Export enums for use in forms
export { securityContactStatusEnum, accessCodeTypeEnum, idDocumentTypeEnum };
