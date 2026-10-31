import type { SupabaseClient } from '@supabase/supabase-js';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { getConfiguredPublicOrigin } from '@/lib/http/public-origin';
import { createAdminClient } from '@/lib/supabase/server';
import type { WhatsAppAdminAction } from '@/lib/whatsapp/admin';
import { formatDay, formatNaira, lagosDateString } from '@/lib/whatsapp/assistant-format';

/**
 * Read-only Admin tools items (#1296): Today's collections and Clearance requests waiting.
 * Neither writes. The access gate and the audit of each run are #972's, in admin.ts.
 */

export const CLEARANCE_QUEUE_MAX = 10;
const PAGE = 1000;
const NO_STREET = 'No house on record';

export interface CollectionPayment {
  amount: number;
  /** `YYYY-MM-DD`, the Lagos day the payment was made. */
  paymentDate: string;
  street: string | null;
}

/**
 * The dashboard's own "verified" rule (get_dashboard_payment_metrics.verified_total, migration
 * 20261013100000): paid, and verified by hand or brought in by a bank or email import.
 */
const VERIFIED_FILTER = 'is_verified.eq.true,import_id.not.is.null,email_import_id.not.is.null';

/** Paid and verified payments dated from `fromDate` to `toDate` (`YYYY-MM-DD`, both included). */
export async function loadVerifiedPayments(fromDate: string, toDate: string, client: SupabaseClient = createAdminClient() as unknown as SupabaseClient): Promise<CollectionPayment[]> {
  const rows: CollectionPayment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('payment_records')
      .select('id, amount, payment_date, house:houses(street:streets(name))')
      .eq('status', 'paid')
      .or(VERIFIED_FILTER)
      .gte('payment_date', fromDate)
      .lte('payment_date', toDate)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const house = (Array.isArray(row.house) ? row.house[0] : row.house) as { street?: { name?: string } | { name?: string }[] | null } | null;
      const street = Array.isArray(house?.street) ? house?.street[0]?.name : house?.street?.name;
      rows.push({ amount: Number(row.amount) || 0, paymentDate: String(row.payment_date), street: street ?? null });
    }
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

/** Today (Lagos) and the calendar month so far, as `YYYY-MM-DD`. */
export function collectionDays(now: Date): { today: string; monthStart: string; monthEnd: string } {
  const today = lagosDateString(now);
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return { today, monthStart: `${prefix}-01`, monthEnd: `${prefix}-${String(last).padStart(2, '0')}` };
}

function plural(count: number): string {
  return `${count} payment${count === 1 ? '' : 's'}`;
}

function total(rows: CollectionPayment[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

export function composeCollectionsAnswer(payments: CollectionPayment[], now: Date): string {
  const { today } = collectionDays(now);
  const todays = payments.filter((p) => p.paymentDate === today);
  const lines = [
    `*Collections, ${formatDay(today)}*`,
    '',
    `Today: ${formatNaira(total(todays))} (${plural(todays.length)})`,
    `This month so far: ${formatNaira(total(payments))} (${plural(payments.length)})`,
  ];
  if (todays.length > 0) {
    const byStreet = new Map<string, CollectionPayment[]>();
    for (const p of todays) byStreet.set(p.street ?? NO_STREET, [...(byStreet.get(p.street ?? NO_STREET) ?? []), p]);
    lines.push('', 'Today by street:');
    for (const [street, rows] of [...byStreet].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${street}: ${formatNaira(total(rows))} (${plural(rows.length)})`);
    }
  }
  lines.push('', 'Verified payments only.');
  return lines.join('\n');
}

export const collectionsAction: WhatsAppAdminAction = {
  label: "Today's collections",
  icon: '📊',
  permission: PERMISSIONS.WHATSAPP_ADMIN_COLLECTIONS,
  freshCode: false,
  async run({ now }) {
    const { monthStart, monthEnd } = collectionDays(now);
    const payments = await loadVerifiedPayments(monthStart, monthEnd);
    const { today } = collectionDays(now);
    return {
      reply: composeCollectionsAnswer(payments, now),
      audit: { today_count: payments.filter((p) => p.paymentDate === today).length, month_count: payments.length },
    };
  },
};

export interface ClearanceRequest {
  createdAt: string;
  property: string;
  resident: string;
}

/** The newest pending clearance certificate requests, and how many are pending in all. */
export async function loadPendingClearanceRequests(client: SupabaseClient = createAdminClient() as unknown as SupabaseClient): Promise<{ rows: ClearanceRequest[]; total: number }> {
  const { data, count, error } = await client
    .from('approval_requests')
    .select('created_at, requested_changes', { count: 'exact' })
    .eq('request_type', 'clearance_certificate_request')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(CLEARANCE_QUEUE_MAX);
  if (error) throw error;
  const rows = (data ?? []).map((row) => {
    const changes = (row.requested_changes ?? {}) as { property?: string; resident?: string };
    return { createdAt: row.created_at as string, property: changes.property || 'Unknown property', resident: changes.resident || 'Unknown resident' };
  });
  return { rows, total: count ?? rows.length };
}

export function composeClearanceQueueAnswer(rows: ClearanceRequest[], total: number, approvalsUrl: string | null): string {
  if (total === 0) return 'No clearance certificate requests are waiting.';
  const lines = [`*Clearance requests waiting (${total})*`];
  rows.forEach((r, i) => lines.push(`${i + 1}. ${r.property}, ${r.resident}, asked ${formatDay(r.createdAt)}`));
  if (total > rows.length) lines.push(`and ${total - rows.length} more`);
  if (approvalsUrl) lines.push('', `Decide them in Approvals: ${approvalsUrl}`);
  return lines.join('\n');
}

export const clearanceQueueAction: WhatsAppAdminAction = {
  label: 'Clearance requests waiting',
  icon: '📋',
  permission: PERMISSIONS.WHATSAPP_ADMIN_CLEARANCE_QUEUE,
  freshCode: false,
  async run() {
    const { rows, total: waiting } = await loadPendingClearanceRequests();
    const origin = getConfiguredPublicOrigin();
    return {
      reply: composeClearanceQueueAnswer(rows, waiting, origin ? `${origin}/approvals` : null),
      audit: { waiting },
    };
  },
};
