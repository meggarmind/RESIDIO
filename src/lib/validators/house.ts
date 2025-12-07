import { z } from 'zod';

// House form schema for create/edit
export const houseFormSchema = z.object({
  house_number: z.string().min(1, 'House number is required'),
  street_id: z.string().uuid('Please select a street'),
  house_type_id: z.string().uuid('Please select a house type').optional().or(z.literal('')),
  address_line_2: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export type HouseFormData = z.infer<typeof houseFormSchema>;

// Street form schema
export const streetFormSchema = z.object({
  name: z.string().min(1, 'Street name is required'),
  description: z.string().optional().or(z.literal('')),
});

export type StreetFormData = z.infer<typeof streetFormSchema>;

// House type form schema
export const houseTypeFormSchema = z.object({
  name: z.string().min(1, 'House type name is required'),
  description: z.string().optional().or(z.literal('')),
  max_residents: z.number().min(1).max(50).default(10),
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
