import { z } from 'zod';
import type { SecurityContactStatus, AccessCodeType, IdDocumentType, VisitorRecurrencePattern, DayOfWeek, VehicleType } from '@/types/database';

// Enums for validation
const securityContactStatusEnum = z.enum(['active', 'suspended', 'expired', 'revoked']);
const accessCodeTypeEnum = z.enum(['permanent', 'one_time']);
const idDocumentTypeEnum = z.enum(['nin', 'voters_card', 'drivers_license', 'passport', 'company_id', 'other']);

// Visitor Management Enhancement enums
const visitorRecurrencePatternEnum = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']);
const dayOfWeekEnum = z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const vehicleTypeEnum = z.enum(['car', 'motorcycle', 'bicycle', 'truck', 'van', 'bus', 'other']);

// Phone number validation regex (Nigerian format support)
const phoneRegex = /^(\+234|0)[789][01]\d{8}$/;

// Recurring schedule sub-schema
const recurringScheduleSchema = z.object({
  is_recurring: z.boolean().default(false),
  recurrence_pattern: visitorRecurrencePatternEnum.optional().nullable(),
  recurrence_days: z.array(dayOfWeekEnum).optional().nullable(),
  recurrence_start_date: z.string().optional().nullable(),
  recurrence_end_date: z.string().optional().nullable(),
  expected_arrival_time: z.string().optional().nullable(),
  expected_departure_time: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
});

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

  // Recurring visitor fields
  is_recurring: z.boolean().default(false),
  recurrence_pattern: visitorRecurrencePatternEnum.optional().nullable(),
  recurrence_days: z.array(dayOfWeekEnum).optional().nullable(),
  recurrence_start_date: z.string().optional().nullable(),
  recurrence_end_date: z.string().optional().nullable(),
  expected_arrival_time: z.string().optional().nullable(),
  expected_departure_time: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
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

// ============================================================
// Visitor Management Enhancement Schemas
// ============================================================

// Visitor Vehicle schema
export const createVisitorVehicleSchema = z.object({
  contact_id: z.string().uuid('Invalid contact ID'),
  vehicle_type: vehicleTypeEnum.default('car'),
  plate_number: z.string().min(2, 'Plate number is required').max(20, 'Plate number is too long'),
  make: z.string().optional().or(z.literal('')),
  model: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  year: z.number().min(1900).max(new Date().getFullYear() + 1).optional().nullable(),
  photo_url: z.string().url().optional().or(z.literal('')),
  is_primary: z.boolean().default(false),
  notes: z.string().optional().or(z.literal('')),
});

export type CreateVisitorVehicleData = z.infer<typeof createVisitorVehicleSchema>;

// Update visitor vehicle schema
export const updateVisitorVehicleSchema = createVisitorVehicleSchema.partial().extend({
  id: z.string().uuid('Invalid vehicle ID'),
});

export type UpdateVisitorVehicleData = z.infer<typeof updateVisitorVehicleSchema>;

// Enhanced check-in schema with duration and vehicle
export const enhancedCheckInSchema = z.object({
  access_code_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid('Contact ID is required'),
  gate_location: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  expected_duration_minutes: z.number().min(1).max(1440).optional().nullable(), // Max 24 hours
  vehicle_id: z.string().uuid().optional().nullable(),
  entry_method: z.enum(['code', 'photo', 'manual', 'vehicle_plate']).optional().nullable(),
  photo_url: z.string().url().optional().or(z.literal('')),
});

export type EnhancedCheckInData = z.infer<typeof enhancedCheckInSchema>;

// Photo capture schema for visitor photos at gate
export const visitorPhotoCaptureSchema = z.object({
  contact_id: z.string().uuid('Invalid contact ID'),
  photo_data: z.string().min(1, 'Photo data is required'), // Base64 encoded image
  capture_type: z.enum(['profile', 'gate_entry']).default('profile'),
});

export type VisitorPhotoCaptureData = z.infer<typeof visitorPhotoCaptureSchema>;

// Recurring schedule update schema
export const updateRecurringScheduleSchema = z.object({
  contact_id: z.string().uuid('Invalid contact ID'),
  is_recurring: z.boolean(),
  recurrence_pattern: visitorRecurrencePatternEnum.optional().nullable(),
  recurrence_days: z.array(dayOfWeekEnum).optional().nullable(),
  recurrence_start_date: z.string().optional().nullable(),
  recurrence_end_date: z.string().optional().nullable(),
  expected_arrival_time: z.string().optional().nullable(),
  expected_departure_time: z.string().optional().nullable(),
  purpose: z.string().optional().nullable(),
}).refine(
  (data) => {
    // If recurring is true, pattern is required
    if (data.is_recurring && !data.recurrence_pattern) {
      return false;
    }
    return true;
  },
  {
    message: 'Recurrence pattern is required for recurring visitors',
    path: ['recurrence_pattern'],
  }
).refine(
  (data) => {
    // If pattern is weekly or biweekly, days are required
    if (data.is_recurring && ['weekly', 'biweekly'].includes(data.recurrence_pattern || '')) {
      return data.recurrence_days && data.recurrence_days.length > 0;
    }
    return true;
  },
  {
    message: 'Please select at least one day for weekly/bi-weekly recurring visits',
    path: ['recurrence_days'],
  }
);

export type UpdateRecurringScheduleData = z.infer<typeof updateRecurringScheduleSchema>;

// Visitor analytics filters schema
export const visitorAnalyticsFiltersSchema = z.object({
  resident_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  is_recurring: z.boolean().optional(),
  is_frequent_visitor: z.boolean().optional(),
  min_visits: z.number().min(1).optional(),
  days: z.number().min(1).max(365).optional().default(30),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
});

export type VisitorAnalyticsFilters = z.input<typeof visitorAnalyticsFiltersSchema>;

// Export enums for use in forms
export {
  securityContactStatusEnum,
  accessCodeTypeEnum,
  idDocumentTypeEnum,
  visitorRecurrencePatternEnum,
  dayOfWeekEnum,
  vehicleTypeEnum,
};
