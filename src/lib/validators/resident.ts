import { z } from 'zod';

// Resident form schema for create/edit
export const residentFormSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone_primary: z.string().min(10, 'Phone number must be at least 10 digits'),
  phone_secondary: z.string().optional().or(z.literal('')),
  resident_type: z.enum(['primary', 'secondary']),
  emergency_contact_name: z.string().optional().or(z.literal('')),
  emergency_contact_phone: z.string().optional().or(z.literal('')),
  emergency_contact_relationship: z.string().optional().or(z.literal('')),
  emergency_contact_resident_id: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export type ResidentFormData = z.infer<typeof residentFormSchema>;

// House assignment schema
export const houseAssignmentSchema = z.object({
  house_id: z.string().uuid('Please select a house'),
  resident_role: z.enum(['owner', 'tenant', 'occupier', 'domestic_staff', 'family_member']),
  is_primary: z.boolean().default(true),
  move_in_date: z.string().optional(),
});

export type HouseAssignmentData = z.infer<typeof houseAssignmentSchema>;

// Combined schema for creating resident with house assignment
export const createResidentSchema = residentFormSchema.extend({
  house_id: z.string().uuid('Please select a house').optional(),
  resident_role: z.enum(['owner', 'tenant', 'occupier', 'domestic_staff', 'family_member']).optional(),
  move_in_date: z.string().optional(),
});

export type CreateResidentData = z.infer<typeof createResidentSchema>;

// Search/filter params schema
export const residentSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'archived']).optional(),
  verification: z.enum(['pending', 'submitted', 'verified', 'rejected']).optional(),
  type: z.enum(['primary', 'secondary']).optional(),
  street_id: z.string().uuid().optional(),
  house_id: z.string().uuid().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type ResidentSearchParams = z.infer<typeof residentSearchSchema>;
