import { z } from 'zod';

// Approval action schema (for approve/reject operations)
export const approvalActionSchema = z.object({
  request_id: z.string().uuid('Invalid request ID'),
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

export type ApprovalActionData = z.infer<typeof approvalActionSchema>;

// Approval request creation schema (for creating new requests)
export const createApprovalRequestSchema = z.object({
  request_type: z.enum(['billing_profile_effective_date', 'house_plots_change']),
  entity_type: z.enum(['billing_profile', 'house']),
  entity_id: z.string().uuid('Invalid entity ID'),
  requested_changes: z.record(z.string(), z.unknown()),
  current_values: z.record(z.string(), z.unknown()),
  reason: z.string().optional(),
});

export type CreateApprovalRequestData = z.infer<typeof createApprovalRequestSchema>;

// Approval request search/filter schema
export const approvalSearchSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
  request_type: z.enum(['billing_profile_effective_date', 'house_plots_change', 'all']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export type ApprovalSearchParams = z.infer<typeof approvalSearchSchema>;
