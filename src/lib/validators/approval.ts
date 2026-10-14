import { z } from 'zod';

// Approval action schema (for approve/reject operations)
export const approvalActionSchema = z.object({
  request_id: z.string().uuid('Invalid request ID'),
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

export type ApprovalActionData = z.infer<typeof approvalActionSchema>;
