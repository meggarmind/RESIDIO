import { z } from 'zod';

// Issue #965: the invoice run (validate_invoice_generation_run_short_names) rejects any
// short name outside this pattern, so reject it when the house is saved instead.
export const HOUSE_SHORT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

// Mirrors public.generate_house_shortname: a run of whitespace in the house number becomes one hyphen.
export function generateHouseShortName(
  streetShortName: string | null | undefined,
  houseNumber: string
): string {
  if (!streetShortName || !houseNumber) return '';
  return `${streetShortName}-${houseNumber.trim().replace(/\s+/g, '-')}`.toUpperCase();
}

export const HOUSE_SHORT_NAME_MESSAGE = 'Use letters, digits, dots and hyphens only';

// A short name the house already stores is not re-checked, so houses that predate the rule stay editable.
export function isValidHouseShortName(value: string, stored?: string | null): boolean {
  return value === '' || value === stored || HOUSE_SHORT_NAME_PATTERN.test(value);
}

const shortNameField = (stored?: string | null) =>
  z
    .string()
    .max(50, 'Short name must be 50 characters or less')
    .refine((v) => isValidHouseShortName(v, stored), HOUSE_SHORT_NAME_MESSAGE)
    .optional()
    .or(z.literal('')); // Auto-generated property identifier

export const houseFormSchema = z.object({
  house_number: z.string().min(1, 'House number is required'),
  street_id: z.guid('Please select a street'),
  house_type_id: z.guid('Please select a house type').optional().or(z.literal('')),
  address_line_2: z.string().optional().or(z.literal('')),
  short_name: shortNameField(),
  notes: z.string().optional().or(z.literal('')),
  date_added_to_portal: z.string().optional(), // Date house was added to Residio (defaults to today)
  billing_profile_id: z.guid().optional().nullable().or(z.literal('')), // Override billing profile from house type
  number_of_plots: z.number().int().min(1, 'Must have at least 1 plot'), // Number of plots (for Development Levy)
  // Issue #119: the recorded identifier is never rewritten; the doubt about it
  // is carried alongside so it can be queried, filtered and cleared.
  identifier_unverified: z.boolean().optional(),
  identifier_note: z.string().max(500, 'Note must be 500 characters or less').optional().or(z.literal('')),
  // #1068: a brand-new house bills no occupant dues while vacant; assigning its first tenant or resident landlord clears this in the database.
  is_new_never_occupied: z.boolean().optional(),
  property_status: z.enum(['occupied', 'vacant', 'under_renovation', 'under_construction']).optional(),
});

export const houseFormSchemaFor = (storedShortName?: string | null) =>
  houseFormSchema.extend({ short_name: shortNameField(storedShortName) });

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
  billing_profile_id: z.guid().optional().or(z.literal('')),
});

export type HouseTypeFormData = z.infer<typeof houseTypeFormSchema>;

// Search/filter params schema
export const houseSearchSchema = z.object({
  search: z.string().optional(),
  street_id: z.guid().optional(),
  house_type_id: z.guid().optional(),
  is_occupied: z.boolean().optional(),
  identifier_unverified: z.boolean().optional(), // Issue #119: "Needs confirmation" filter
  property_status: z.enum(['occupied', 'vacant', 'under_renovation', 'under_construction']).optional(),
  sort_by: z.enum(['short_name', 'house_number', 'street', 'house_type']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type HouseSearchParams = z.infer<typeof houseSearchSchema>;
