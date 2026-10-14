import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { AuditAction, AuditEntityType } from '@/types/database';
import { recordAudit } from './recorder';

// Re-export helper functions for backwards compatibility
export { getChangedValues, getChangedFields, formatChangeDescription } from './helpers';

interface LogAuditOptions {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  entityDisplay?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. Call this from any server action after a successful operation.
 *
 * This function is designed to be non-blocking and fail-safe - audit failures
 * will not break the main operation.
 *
 * @example
 * // After creating a resident
 * await logAudit({
 *   action: 'CREATE',
 *   entityType: 'residents',
 *   entityId: newResident.id,
 *   entityDisplay: `${newResident.first_name} ${newResident.last_name}`,
 *   newValues: newResident,
 * });
 *
 * @example
 * // After updating a house
 * await logAudit({
 *   action: 'UPDATE',
 *   entityType: 'houses',
 *   entityId: house.id,
 *   entityDisplay: house.house_number,
 *   oldValues: { billing_profile_id: oldProfileId },
 *   newValues: { billing_profile_id: newProfileId },
 *   description: 'Changed billing profile',
 * });
 *
 * @example
 * // After approving a request
 * await logAudit({
 *   action: 'APPROVE',
 *   entityType: 'approval_requests',
 *   entityId: request.id,
 *   entityDisplay: `Approval #${request.id.slice(0, 8)}`,
 *   metadata: { request_type: request.request_type },
 * });
 */
export async function logAudit(options: LogAuditOptions): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // recordAudit logs the missing-session case and never throws on write failures.
    await recordAudit(options, { userId: user?.id ?? null });
  } catch (error) {
    // Catch any unexpected errors to ensure audit logging never breaks main operations
    console.error('[Audit] Unexpected error:', error);
  }
}
