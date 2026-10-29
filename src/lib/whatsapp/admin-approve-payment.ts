import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { decideAsServiceAccount } from '@/lib/approvals/decision';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { createAdminClient } from '@/lib/supabase/server';
import { embed } from '@/lib/utils';
import { formatDay, formatNaira, maskReference } from '@/lib/whatsapp/assistant-format';
import { WhatsAppPaymentApprovalAlertEmail, WHATSAPP_PAYMENT_APPROVAL_ALERT_SUBJECT } from '@/emails/whatsapp-payment-approval-alert';
import type { WhatsAppAdminAccount, WhatsAppAdminAction } from '@/lib/whatsapp/admin';

/**
 * Approve payment report (#1297, Admin tools item 5): the admin picks a payment a resident reported,
 * sees its details, and approves or rejects it. The decision goes through the same approval core as
 * the dashboard (maker-checker, the claim guarded on pending, settleReportedPayment), with the
 * permissions checked again on the live account and every audit entry marked `channel: whatsapp_admin`.
 * With no code needed, each approval is emailed to the Financial Officer and the Chairman (#1290 decision 8).
 */

export const REPORT_TYPE = 'whatsapp_payment_report';
// shortcut: the list shows the oldest 9 only, so one digit picks; page it if the queue grows past that.
export const LIST_LIMIT = 9;
/** Roles told about an approval made with no code (#1290 decision 8). */
export const NO_CODE_ALERT_ROLES = ['financial_officer', 'chairman'];

export const NO_REPORTS_REPLY = 'There are no payment reports waiting for approval.';
export const REPORT_GONE_REPLY = 'That payment report is no longer waiting for approval.';
export const DECIDE_PROMPT = 'Reply 1 Approve, 2 Reject, 0 Back.';

// approval_requests.requested_by_resident_id is not in the generated types.
const db = () => createAdminClient() as unknown as SupabaseClient;

interface ReportChanges {
  amount?: number;
  payment_date?: string;
  property?: string;
  reference?: string;
}

export interface ReportDetails {
  requestId: string;
  amount: number;
  property: string;
  paymentDate: string;
  reference: string | null;
  reportedAt: string;
  resident: string;
}

/** A pending payment report and its payment's resident; null when it is not pending any more. */
export async function loadReportDetails(requestId: string): Promise<ReportDetails | null> {
  const { data: request, error } = await db()
    .from('approval_requests')
    .select('id, entity_id, requested_changes, created_at')
    .eq('id', requestId)
    .eq('request_type', REPORT_TYPE)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  if (!request) return null;
  const { data: payment, error: paymentError } = await db()
    .from('payment_records')
    .select('resident:residents!payment_records_resident_id_fkey(first_name, last_name)')
    .eq('id', request.entity_id)
    .maybeSingle();
  if (paymentError) throw paymentError;
  const resident = embed(payment?.resident as unknown as { first_name: string; last_name: string } | null);
  const changes = (request.requested_changes ?? {}) as ReportChanges;
  return {
    requestId: request.id as string,
    amount: Number(changes.amount ?? 0),
    property: changes.property ?? 'Unknown house',
    paymentDate: changes.payment_date ?? '',
    reference: maskReference(changes.reference),
    reportedAt: request.created_at as string,
    resident: resident ? `${resident.first_name} ${resident.last_name}`.trim() : 'Unknown resident',
  };
}

export function detailsText(details: ReportDetails): string {
  return [
    'Payment report',
    `Resident: ${details.resident}`,
    `House: ${details.property}`,
    `Amount: ${formatNaira(details.amount)}`,
    `Payment date: ${details.paymentDate ? formatDay(details.paymentDate) : 'Not given'}`,
    `Reference: ${details.reference ?? 'Not given'}`,
    `Reported: ${formatDay(details.reportedAt)}`,
  ].join('\n');
}

/** Lagos `HH:MM on dd mmm yyyy`. */
function lagosTime(at: Date): string {
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' });
  return `${clock} on ${formatDay(at)}`;
}

/** Emails the Financial Officer and the Chairman about an approval made with no code. Never throws. */
export async function emailNoCodeApproval(account: WhatsAppAdminAccount, details: ReportDetails, now: Date): Promise<void> {
  try {
    const { data, error } = await db()
      .from('profiles')
      .select('full_name, email, app_roles!profiles_role_id_fkey!inner(name)')
      .eq('approval_status', 'active')
      .in('app_roles.name', NO_CODE_ALERT_ROLES);
    if (error) throw error;
    const estate = await getEstateEmailSettings();
    const approver = `${account.fullName} (${account.roleDisplayName || account.roleName})`;
    for (const recipient of data || []) {
      const email = (recipient.email as string | null)?.trim();
      if (!email) continue;
      const name = (recipient.full_name as string | null) || email;
      const result = await sendEmail({
        to: { email, name },
        subject: WHATSAPP_PAYMENT_APPROVAL_ALERT_SUBJECT,
        react: WhatsAppPaymentApprovalAlertEmail({
          firstName: name.split(' ')[0] || name,
          approver,
          amount: formatNaira(details.amount),
          property: details.property,
          resident: details.resident,
          approvedAt: lagosTime(now),
          ...estate,
        }),
        emailType: 'notification',
        metadata: { purpose: 'whatsapp_payment_approval_alert', approval_request_id: details.requestId },
      });
      if (!result.success) console.error('[whatsapp-admin] No-code approval email failed:', { email, error: result.error });
    }
  } catch (error) {
    // Best effort: the approval has landed and is audited; a throw would make the provider retry it.
    console.error('[whatsapp-admin] No-code approval email failed:', error instanceof Error ? error.message : error);
  }
}

interface ListState extends Record<string, unknown> {
  reports: { number: number; id: string }[];
}

export const approvePaymentAction: WhatsAppAdminAction = {
  label: 'Approve payment report',
  permission: PERMISSIONS.WHATSAPP_ADMIN_APPROVE_PAYMENT,
  // The same permissions the dashboard approval needs (#1297 item 1).
  alsoRequires: [PERMISSIONS.APPROVALS_APPROVE_REJECT, PERMISSIONS.PAYMENTS_VERIFY],
  // With the code on, the session code is enough (#1290 decision 8).
  freshCode: false,

  async begin() {
    const { data, error } = await db()
      .from('approval_requests')
      .select('id, requested_changes, created_at')
      .eq('request_type', REPORT_TYPE)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(LIST_LIMIT);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) return { reply: NO_REPORTS_REPLY };
    const reports = rows.map((row, index) => ({ number: index + 1, id: row.id as string }));
    return {
      reply: [
        'Payment reports waiting for approval. Reply a number to see one:',
        ...rows.map((row, index) => {
          const changes = (row.requested_changes ?? {}) as ReportChanges;
          return `${index + 1}. ${formatNaira(Number(changes.amount ?? 0))}, ${changes.property ?? 'Unknown house'}, reported ${formatDay(row.created_at as string)}`;
        }),
      ].join('\n'),
      state: { reports } satisfies ListState,
    };
  },

  async choose(text, state) {
    if (typeof state.requestId === 'string') {
      if (text === '1') return { params: { requestId: state.requestId, decision: 'approve' } };
      if (text === '2') return { params: { requestId: state.requestId, decision: 'reject' } };
      return { retry: DECIDE_PROMPT };
    }
    const picked = ((state as ListState).reports ?? []).find((report) => String(report.number) === text);
    if (!picked) return { retry: 'Reply a number from the list, or 0 for Admin tools.' };
    const details = await loadReportDetails(picked.id);
    if (!details) return { retry: `${REPORT_GONE_REPLY} Reply another number, or 0 for Admin tools.` };
    return { ask: `${detailsText(details)}\n\n${DECIDE_PROMPT}`, state: { requestId: picked.id } };
  },

  async run({ account, now, codeNeeded, params }) {
    const requestId = typeof params.requestId === 'string' ? params.requestId : '';
    const decision = params.decision === 'approve' ? 'approve' : 'reject';
    const audit = { approval_request_id: requestId, decision, code_needed: codeNeeded };
    const details = requestId ? await loadReportDetails(requestId) : null;
    if (!details) return { reply: REPORT_GONE_REPLY, audit: { ...audit, outcome: 'not_pending' } };

    const result = await decideAsServiceAccount({
      profileId: account.profileId,
      requestId,
      decision,
      requestType: REPORT_TYPE,
      alsoRequires: [PERMISSIONS.WHATSAPP_ADMIN_APPROVE_PAYMENT, PERMISSIONS.PAYMENTS_VERIFY],
      metadata: { channel: 'whatsapp_admin', code_needed: codeNeeded },
    });
    const what = `${formatNaira(details.amount)} for ${details.property}`;
    if (!result.success) {
      return { reply: `Not done: ${result.error}`, audit: { ...audit, outcome: 'refused', error: result.error } };
    }
    if (decision === 'approve' && !codeNeeded) await emailNoCodeApproval(account, details, now);
    const done =
      decision === 'approve'
        ? `Approved: ${what}. The payment is verified and the wallet is credited.`
        : `Rejected: ${what}.`;
    return {
      reply: result.warning ? `${done}\n${result.warning}` : done,
      audit: { ...audit, outcome: decision === 'approve' ? 'approved' : 'rejected' },
    };
  },
};
