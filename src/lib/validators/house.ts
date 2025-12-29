import { z } from 'zod';

// House form schema for create/edit
export const houseFormSchema = z.object({
  house_number: z.string().min(1, 'House number is required'),
  street_id: z.string().uuid('Please select a street'),
  house_type_id: z.string().uuid('Please select a house type').optional().or(z.literal('')),
  address_line_2: z.string().optional().or(z.literal('')),
  short_name: z.string().max(50, 'Short name must be 50 characters or less').optional().or(z.literal('')), // Auto-generated property identifier
  notes: z.string().optional().or(z.literal('')),
  date_added_to_portal: z.string().optional(), // Date house was added to Residio (defaults to today)
  billing_profile_id: z.string().uuid().optional().nullable().or(z.literal('')), // Override billing profile from house type
  number_of_plots: z.number().int().min(1, 'Must have at least 1 plot'), // Number of plots (for Development Levy)
});

export type HouseFormData = z.infer<typeof houseFormSchema>;

// Street form schema
export const streetFormSchema = z.object({
  name: z.string().min(1, 'Street name is required'),
  short_name: z.string().max(50, 'Short name must be 50 characters or less').optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

export type StreetFormData = z.infer<typeof streetFormSchema>;

// House type form schema
export const houseTypeFormSchema = z.object({
  name: z.string().min(1, 'House type name is required'),
  description: z.string().optional().or(z.literal('')),
  max_residents: z.number().min(1).max(50).default(10),
  billing_profile_id: z.string().uuid().optional().or(z.literal('')),
});

export type HouseTypeFormData = z.infer<typeof houseTypeFormSchema>;

// Search/filter params schema
export const houseSearchSchema = z.object({
  search: z.string().optional(),
  street_id: z.string().uuid().optional(),
  house_type_id: z.string().uuid().optional(),
  is_occupied: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type HouseSearchParams = z.infer<typeof houseSearchSchema>;
