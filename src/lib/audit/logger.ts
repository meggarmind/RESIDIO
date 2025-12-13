'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import type { AuditAction, AuditEntityType, AuditLogInsert } from '@/types/database';

// NOTE: Helper functions (getChangedFields, getChangedValues, formatChangeDescription)
// are now in '@/lib/audit/helpers' - import them directly from there.

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

    if (!user) {
      console.error('[Audit] Cannot log audit: No authenticated user');
      return;
    }

    // Use admin client to ensure insert succeeds (RLS allows insert for authenticated users)
    const adminClient = createAdminClient();

    const auditEntry: AuditLogInsert = {
      actor_id: user.id,
      action: options.action,
      entity_type: options.entityType,
      entity_id: options.entityId,
      entity_display: options.entityDisplay || null,
      old_values: options.oldValues || null,
      new_values: options.newValues || null,
      description: options.description || null,
      metadata: options.metadata || null,
      ip_address: null, // Could be populated from request headers in future
      user_agent: null, // Could be populated from request headers in future
    };

    const { error } = await adminClient
      .from('audit_logs')
      .insert(auditEntry);

    if (error) {
      // Log error but don't throw - audit failures shouldn't break main operations
      console.error('[Audit] Failed to log audit event:', error.message);
    }
  } catch (error) {
    // Catch any unexpected errors to ensure audit logging never breaks main operations
    console.error('[Audit] Unexpected error:', error);
  }
}
