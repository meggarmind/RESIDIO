import { z } from 'zod';
import type { EntityType, ResidentRole, PrimaryResidentRole, SecondaryResidentRole, CorporateRole } from '@/types/database';

// Entity type enum for validation (2 types only)
const entityTypeEnum = z.enum(['individual', 'corporate']);

// Role enums matching database (renamed in Phase 2, contractor added in Phase 15)
const residentRoleEnum = z.enum([
  'resident_landlord',
  'non_resident_landlord',
  'tenant',
  'developer',
  'co_resident',
  'household_member',
  'domestic_staff',
  'caretaker',
  'contractor',
]);

const primaryRoleEnum = z.enum(['resident_landlord', 'non_resident_landlord', 'tenant', 'developer']);
const secondaryRoleEnum = z.enum(['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor']);
const corporateRoleEnum = z.enum(['non_resident_landlord', 'developer']);

// Roles that require a sponsor (domestic_staff, caretaker, and contractor)
const sponsorRequiredRoles: ResidentRole[] = ['domestic_staff', 'caretaker', 'contractor'];

// Residency roles (for "One Home" policy) - updated names
const residencyRoles: ResidentRole[] = ['resident_landlord', 'tenant', 'co_resident'];

// Corporate-allowed roles
const corporateAllowedRoles: ResidentRole[] = ['non_resident_landlord', 'developer'];

// Corporate entity schema - validates corporate-specific fields
const corporateFieldsSchema = z.object({
  company_name: z.string().min(1, 'Company name is required for corporate entities'),
  rc_number: z.string().optional().or(z.literal('')),
  liaison_contact_name: z.string().optional().or(z.literal('')),
  liaison_contact_phone: z.string().optional().or(z.literal('')),
});

// Base resident form schema
const baseResidentSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone_primary: z.string().min(10, 'Phone number must be at least 10 digits'),
  phone_secondary: z.string().optional().or(z.literal('')),
  resident_type: z.enum(['primary', 'secondary']),
  entity_type: entityTypeEnum.optional(), // Defaults to 'individual' in server
  // Corporate fields (optional, validated conditionally)
  company_name: z.string().optional().or(z.literal('')),
  rc_number: z.string().optional().or(z.literal('')),
  liaison_contact_name: z.string().optional().or(z.literal('')),
  liaison_contact_phone: z.string().optional().or(z.literal('')),
  // Emergency contact fields
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_phone: z.string().optional().or(z.literal('')),
  emergency_contact_relationship: z.string().optional().or(z.literal('')),
  emergency_contact_resident_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

// Resident form schema with corporate field validation
export const residentFormSchema = baseResidentSchema.refine(
  (data) => {
    // If entity_type is corporate, company_name is required
    if (data.entity_type === 'corporate') {
      return data.company_name && data.company_name.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Company name is required for corporate entities',
    path: ['company_name'],
  }
);

export type ResidentFormData = z.infer<typeof baseResidentSchema>;

// House assignment schema with new roles
export const houseAssignmentSchema = z.object({
  house_id: z.string().uuid('Please select a house'),
  resident_role: residentRoleEnum,
  move_in_date: z.string().optional(),
  // Sponsor fields for secondary roles
  sponsor_resident_id: z.string().uuid().optional().nullable(),
}).refine(
  (data) => {
    // domestic_staff and caretaker require a sponsor
    if (sponsorRequiredRoles.includes(data.resident_role as ResidentRole)) {
      return data.sponsor_resident_id != null && data.sponsor_resident_id !== '';
    }
    return true;
  },
  {
    message: 'Domestic staff, caretakers, and contractors must have a sponsor',
    path: ['sponsor_resident_id'],
  }
);

export type HouseAssignmentData = z.infer<typeof houseAssignmentSchema>;

// Base schema for creating resident with house assignment (without refinements)
const createResidentBaseSchema = baseResidentSchema.extend({
  house_id: z.string().uuid('Please select a house').optional(),
  resident_role: residentRoleEnum.optional(),
  move_in_date: z.string().optional(),
  sponsor_resident_id: z.string().uuid().optional().nullable(),
});

// Combined schema for creating resident with house assignment (with refinements for validation)
export const createResidentSchema = createResidentBaseSchema.refine(
  (data) => {
    // If entity_type is corporate, company_name is required
    if (data.entity_type === 'corporate') {
      return data.company_name && data.company_name.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Company name is required for corporate entities',
    path: ['company_name'],
  }
).refine(
  (data) => {
    // Corporate entities can only be non_resident_landlord or developer
    if (data.entity_type === 'corporate' && data.resident_role) {
      return corporateAllowedRoles.includes(data.resident_role as ResidentRole);
    }
    return true;
  },
  {
    message: 'Corporate entities can only be Non-Resident Landlord or Developer',
    path: ['resident_role'],
  }
).refine(
  (data) => {
    // Secondary roles must be individuals only
    if (data.entity_type === 'corporate' && data.resident_type === 'secondary') {
      return false;
    }
    return true;
  },
  {
    message: 'Secondary residents must be individuals',
    path: ['resident_type'],
  }
).refine(
  (data) => {
    // If role requires sponsor, sponsor_resident_id must be provided
    if (data.resident_role && sponsorRequiredRoles.includes(data.resident_role as ResidentRole)) {
      return data.sponsor_resident_id != null && data.sponsor_resident_id !== '';
    }
    return true;
  },
  {
    message: 'Domestic staff, caretakers, and contractors must have a sponsor',
    path: ['sponsor_resident_id'],
  }
);

// Export base schema for form type inference (without refinements)
export { createResidentBaseSchema };

export type CreateResidentData = z.infer<typeof createResidentBaseSchema>;

// Search/filter params schema
export const residentSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'archived']).optional(),
  verification: z.enum(['pending', 'submitted', 'verified', 'rejected']).optional(),
  type: z.enum(['primary', 'secondary']).optional(),
  entity_type: entityTypeEnum.optional(),
  resident_role: z.array(residentRoleEnum).optional(),
  street_id: z.string().uuid().optional(),
  house_id: z.string().uuid().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type ResidentSearchParams = z.infer<typeof residentSearchSchema>;

// Helper functions for role validation
export function isPrimaryRole(role: ResidentRole): role is PrimaryResidentRole {
  return ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'].includes(role);
}

export function isSecondaryRole(role: ResidentRole): role is SecondaryResidentRole {
  return ['co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor'].includes(role);
}

export function isResidencyRole(role: ResidentRole): boolean {
  return residencyRoles.includes(role);
}

export function requiresSponsor(role: ResidentRole): boolean {
  return sponsorRequiredRoles.includes(role);
}

export function isValidCorporateRole(role: ResidentRole): role is CorporateRole {
  return corporateAllowedRoles.includes(role);
}

// Export role constants for UI
export { sponsorRequiredRoles, residencyRoles, corporateAllowedRoles };
