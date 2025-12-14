import { z } from 'zod';

// ============================================================
// Enums for Import Workflow
// ============================================================

export const importStatusEnum = z.enum([
  'pending',
  'processing',
  'awaiting_approval',
  'approved',
  'completed',
  'failed',
  'rejected',
]);

export const transactionFilterEnum = z.enum(['credit', 'debit', 'all']);

export const matchConfidenceEnum = z.enum(['high', 'medium', 'low', 'none', 'manual']);

export const matchMethodEnum = z.enum(['alias', 'phone', 'name', 'house_number', 'manual']);

export const importRowStatusEnum = z.enum([
  'pending',
  'matched',
  'unmatched',
  'duplicate',
  'created',
  'skipped',
  'error',
]);

export const fileTypeEnum = z.enum(['csv', 'xlsx']);

// ============================================================
// Column Mapping Schema
// ============================================================

export const columnMappingSchema = z.object({
  date: z.string().min(1, 'Date column is required'),
  description: z.string().min(1, 'Description column is required'),
  credit: z.string().optional().default(''),
  debit: z.string().optional().default(''),
  reference: z.string().optional().default(''),
  balance: z.string().optional(),
});

export type ColumnMappingFormData = z.infer<typeof columnMappingSchema>;

// ============================================================
// Estate Bank Account Schemas
// ============================================================

export const estateBankAccountFormSchema = z.object({
  account_number: z
    .string()
    .min(10, 'Account number must be at least 10 digits')
    .max(12, 'Account number must be at most 12 digits')
    .regex(/^\d+$/, 'Account number must contain only digits'),
  account_name: z.string().min(2, 'Account name is required'),
  bank_name: z.string().min(2, 'Bank name is required').default('FirstBank'),
  is_active: z.boolean().default(true),
});

export type EstateBankAccountFormData = z.infer<typeof estateBankAccountFormSchema>;

// ============================================================
// Payment Alias Schemas
// ============================================================

export const paymentAliasFormSchema = z.object({
  resident_id: z.string().uuid('Resident is required'),
  alias_name: z
    .string()
    .min(2, 'Alias name must be at least 2 characters')
    .max(100, 'Alias name must be at most 100 characters'),
  notes: z.string().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

export type PaymentAliasFormData = z.infer<typeof paymentAliasFormSchema>;

export const paymentAliasSearchSchema = z.object({
  resident_id: z.string().uuid().optional(),
  query: z.string().optional(),
  is_active: z.boolean().optional(),
});

export type PaymentAliasSearchParams = z.infer<typeof paymentAliasSearchSchema>;

// ============================================================
// Import Session Schemas
// ============================================================

export const createImportSchema = z.object({
  file_name: z.string().min(1, 'File name is required'),
  file_type: fileTypeEnum,
  bank_account_id: z.string().uuid('Bank account is required'),
  bank_name: z.string().default('FirstBank'),
  transaction_filter: transactionFilterEnum.default('credit'),
  column_mapping: columnMappingSchema,
  total_rows: z.number().int().min(0),
});

export type CreateImportFormData = z.infer<typeof createImportSchema>;

export const importSearchSchema = z.object({
  status: importStatusEnum.optional(),
  bank_account_id: z.string().uuid().optional(),
  created_by: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type ImportSearchParams = z.infer<typeof importSearchSchema>;

// ============================================================
// Import Row Schemas
// ============================================================

export const importRowMatchSchema = z.object({
  row_id: z.string().uuid('Row ID is required'),
  resident_id: z.string().uuid('Resident is required'),
  save_as_alias: z.boolean().default(false),
  alias_notes: z.string().optional(),
});

export type ImportRowMatchFormData = z.infer<typeof importRowMatchSchema>;

export const batchMatchSchema = z.object({
  matches: z.array(importRowMatchSchema).min(1, 'At least one match is required'),
});

export type BatchMatchFormData = z.infer<typeof batchMatchSchema>;

// ============================================================
// File Upload Validation
// ============================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export const fileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= MAX_FILE_SIZE, 'File size must be less than 10MB')
    .refine(
      (file) => ACCEPTED_FILE_TYPES.includes(file.type) || file.name.endsWith('.csv') || file.name.endsWith('.xlsx'),
      'Only CSV and XLSX files are accepted'
    ),
  bank_account_id: z.string().uuid('Please select a bank account'),
  transaction_filter: transactionFilterEnum.default('credit'),
});

export type FileUploadFormData = z.infer<typeof fileUploadSchema>;

// ============================================================
// Parsed Row Validation
// ============================================================

export const parsedRowSchema = z.object({
  row_number: z.number().int().min(1),
  raw_data: z.record(z.string(), z.unknown()),
  transaction_date: z.date().nullable(),
  description: z.string().nullable(),
  amount: z.number().nullable(),
  transaction_type: z.enum(['credit', 'debit']).nullable(),
  reference: z.string().nullable(),
});

export type ParsedRow = z.infer<typeof parsedRowSchema>;

export const parsedStatementSchema = z.object({
  rows: z.array(parsedRowSchema),
  detected_columns: columnMappingSchema.optional(),
  header_row_index: z.number().int().min(0).optional(),
  total_credits: z.number().optional(),
  total_debits: z.number().optional(),
  date_range: z
    .object({
      start: z.date().optional(),
      end: z.date().optional(),
    })
    .optional(),
});

export type ParsedStatement = z.infer<typeof parsedStatementSchema>;

// ============================================================
// Import Confirmation Schema
// ============================================================

export const confirmImportSchema = z.object({
  import_id: z.string().uuid('Import ID is required'),
  create_mode: z.enum(['atomic', 'individual']).default('individual'),
  skip_duplicates: z.boolean().default(true),
  skip_unmatched: z.boolean().default(true),
});

export type ConfirmImportFormData = z.infer<typeof confirmImportSchema>;

// ============================================================
// Approval Workflow Schemas
// ============================================================

export const approveImportSchema = z.object({
  import_id: z.string().uuid('Import ID is required'),
  approval_notes: z.string().optional(),
});

export type ApproveImportFormData = z.infer<typeof approveImportSchema>;

export const rejectImportSchema = z.object({
  import_id: z.string().uuid('Import ID is required'),
  rejection_reason: z.string().min(1, 'Rejection reason is required'),
});

export type RejectImportFormData = z.infer<typeof rejectImportSchema>;

// ============================================================
// Match Result Schema (for matching engine)
// ============================================================

export const matchResultSchema = z.object({
  resident_id: z.string().uuid().nullable(),
  confidence: matchConfidenceEnum,
  method: matchMethodEnum.nullable(),
  matched_value: z.string().optional(),
  score: z.number().min(0).max(1).optional(),
});

export type MatchResultData = z.infer<typeof matchResultSchema>;

// ============================================================
// Duplicate Detection Schema
// ============================================================

export const duplicateCheckSchema = z.object({
  reference_number: z.string().optional(),
  amount: z.number(),
  transaction_date: z.date(),
  tolerance_days: z.number().int().min(0).max(7).default(1),
});

export type DuplicateCheckParams = z.infer<typeof duplicateCheckSchema>;
