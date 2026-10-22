/**
 * Approval request-type registry.
 *
 * One entry per request type the approvals flow can APPLY. Each entry owns the schema for
 * `requested_changes`, the apply step, and the entity audit written when the change lands.
 * `createApprovalRequest` validates against the same schema when a request is filed, and
 * `applyRequestedChanges` validates again at apply time (the row is jsonb, so it can never be
 * trusted by type alone).
 *
 * Deliberately NOT a server-action module (no directive): these are server-only helpers
 * reached through approveRequest, which has already passed its own authorizePermission().
 *
 * `late_fee_waiver` is in the DB enum but has NO entry on purpose: it is handled by its own
 * flow (src/actions/billing/late-fee-waivers.ts, its own table). Looking it up here returns
 * undefined, so the approvals flow fails closed with "Unhandled approval request type".
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApprovalRequest, ApprovalRequestType, AuditEntityType } from '@/types/database';
import { logAudit } from '@/lib/audit/logger';
import { getChangedValues } from '@/lib/audit/helpers';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { formatNaira } from '@/lib/whatsapp/assistant-format';
import { settleReportedPayment } from '@/lib/whatsapp/payment-report-settlement';
import { issueApprovedClearance } from '@/lib/whatsapp/clearance-approval';

export interface ApprovalApplyResult {
  success: boolean;
  error: string | null;
  /** The change applied, but something the admin should know about did not happen. */
  warning?: string;
}

export interface ApprovalHandler<TChanges> {
  /** Schema for `approval_requests.requested_changes` for this type. */
  schema: z.ZodType<TChanges>;
  /** Entity type written to the audit log when the change is applied. */
  auditEntityType: AuditEntityType;
  /** Reads the entity, applies the change with the session client, and writes the entity audit. */
  apply: (
    request: ApprovalRequest,
    changes: TChanges,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any, any, any>
  ) => Promise<ApprovalApplyResult>;
}

const billingProfileEffectiveDateChanges = z.object({
  effective_date: z
    .string()
    .min(1, 'effective_date is required')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'effective_date must be a valid date'),
});

const housePlotsChanges = z.object({
  number_of_plots: z.number().int().min(1, 'Must have at least 1 plot'),
});

const billingProfileEffectiveDate: ApprovalHandler<z.infer<typeof billingProfileEffectiveDateChanges>> = {
  schema: billingProfileEffectiveDateChanges,
  auditEntityType: 'billing_profiles',
  apply: async (request, { effective_date }, supabase) => {
    const { data: before, error: readError } = await supabase
      .from('billing_profiles')
      .select('name, effective_date')
      .eq('id', request.entity_id)
      .single();

    if (readError || !before) {
      return {
        success: false,
        error: `Failed to read billing profile: ${readError?.message ?? 'not found'}`,
      };
    }

    const { error } = await supabase
      .from('billing_profiles')
      .update({ effective_date, updated_at: new Date().toISOString() })
      .eq('id', request.entity_id);

    if (error) {
      return { success: false, error: `Failed to update billing profile: ${error.message}` };
    }

    const changes = getChangedValues(
      { effective_date: before.effective_date },
      { effective_date }
    );
    await logAudit({
      action: 'UPDATE',
      entityType: 'billing_profiles',
      entityId: request.entity_id,
      entityDisplay: before.name ?? request.entity_id,
      oldValues: changes.old,
      newValues: changes.new,
      description: `Applied via approval request ${request.id}`,
      metadata: { approval_request_id: request.id },
    });

    return { success: true, error: null };
  },
};

const housePlotsChange: ApprovalHandler<z.infer<typeof housePlotsChanges>> = {
  schema: housePlotsChanges,
  auditEntityType: 'houses',
  apply: async (request, { number_of_plots }, supabase) => {
    const { data: before, error: readError } = await supabase
      .from('houses')
      .select('house_number, number_of_plots')
      .eq('id', request.entity_id)
      .single();

    if (readError || !before) {
      return {
        success: false,
        error: `Failed to read house: ${readError?.message ?? 'not found'}`,
      };
    }

    const { error } = await supabase
      .from('houses')
      .update({ number_of_plots, updated_at: new Date().toISOString() })
      .eq('id', request.entity_id);

    if (error) {
      return { success: false, error: `Failed to update house: ${error.message}` };
    }

    const changes = getChangedValues(
      { number_of_plots: before.number_of_plots },
      { number_of_plots }
    );
    await logAudit({
      action: 'UPDATE',
      entityType: 'houses',
      entityId: request.entity_id,
      entityDisplay: before.house_number ?? request.entity_id,
      oldValues: changes.old,
      newValues: changes.new,
      description: `Applied via approval request ${request.id}`,
      metadata: { approval_request_id: request.id },
    });

    return { success: true, error: null };
  },
};

const whatsappPaymentReportChanges = z.object({
  amount: z.number().positive(),
  payment_date: z.string().min(1),
  property: z.string().min(1),
  reference: z.string().min(1),
});

/**
 * A payment a resident reported over WhatsApp (#816). Approving it verifies the payment and credits
 * the wallet, which is what payments.verify guards, so the approver needs that permission too.
 */
const whatsappPaymentReport: ApprovalHandler<z.infer<typeof whatsappPaymentReportChanges>> = {
  schema: whatsappPaymentReportChanges,
  auditEntityType: 'payment_records',
  apply: async (request, changes) => {
    const auth = await authorizePermission(PERMISSIONS.PAYMENTS_VERIFY);
    if (!auth.authorized || !auth.userId) {
      return { success: false, error: 'Confirming a reported payment needs the payments.verify permission' };
    }

    const settled = await settleReportedPayment(request.entity_id, auth.userId);
    if (!settled.success) return { success: false, error: settled.error };

    await logAudit({
      action: 'VERIFY',
      entityType: 'payment_records',
      entityId: request.entity_id,
      entityDisplay: `Reported payment ${formatNaira(changes.amount)} for ${changes.property}`,
      oldValues: { status: 'pending', is_verified: false },
      newValues: { status: 'paid', is_verified: true, verified_by: auth.userId, verification_type: 'whatsapp_report_approval' },
      description: `Applied via approval request ${request.id}`,
      metadata: { approval_request_id: request.id },
    });
    return { success: true, error: null };
  },
};

const clearanceRequestChanges = z.object({
  property: z.string().min(1),
  resident: z.string().min(1),
});

/**
 * A clearance certificate a resident asked for over WhatsApp (#816). Approving it issues the certificate:
 * it is saved to the documents store, copied to the recipient group and sent to the resident in chat.
 */
const clearanceCertificateRequest: ApprovalHandler<z.infer<typeof clearanceRequestChanges>> = {
  schema: clearanceRequestChanges,
  auditEntityType: 'clearance_certificate',
  apply: async (request) => {
    const auth = await authorizePermission(PERMISSIONS.APPROVALS_APPROVE_REJECT);
    if (!auth.authorized || !auth.userId) {
      return { success: false, error: auth.error || 'Unauthorized' };
    }
    const issued = await issueApprovedClearance(request, auth.userId);
    return issued.success ? { success: true, error: null, warning: issued.warning } : { success: false, error: issued.error };
  },
};

// Handled types only. `late_fee_waiver` is intentionally absent (see file header).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Partial<Record<ApprovalRequestType, ApprovalHandler<any>>> = {
  billing_profile_effective_date: billingProfileEffectiveDate,
  house_plots_change: housePlotsChange,
  whatsapp_payment_report: whatsappPaymentReport,
  clearance_certificate_request: clearanceCertificateRequest,
};

/** The handler for a request type, or undefined when the approvals flow does not handle it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getApprovalHandler(type: string): ApprovalHandler<any> | undefined {
  return Object.prototype.hasOwnProperty.call(REGISTRY, type)
    ? REGISTRY[type as ApprovalRequestType]
    : undefined;
}
