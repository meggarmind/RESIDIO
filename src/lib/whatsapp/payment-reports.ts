import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { createResidentApprovalRequest } from '@/lib/approvals/create-resident-approval-request';
import { formatNaira, lagosDateString, lagosMidnight, lagosParts } from '@/lib/whatsapp/assistant-format';

/**
 * "Report a payment" in the WhatsApp Assistant (#816 decisions 10-12): a resident tells the estate
 * about a transfer. It lands as a pending, unverified payment record plus an approval request, so it
 * counts as "awaiting verification" and never as paid until an admin approves it.
 *
 * Not `submitPaymentProof`: that action needs a signed-in portal user and a proof file, and it
 * cannot file its approval (#306). This runs from the webhook with the identified resident.
 */

export const REPORTS_PER_DAY = 3;
export const REPORT_WINDOW_DAYS = 90;
export const MAX_REPORT_AMOUNT = 1_000_000_000;
const MAX_REFERENCE_LENGTH = 100;
export const REPORT_NOTE = 'Reported via WhatsApp';

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** `50000`, `50,000`, `₦50,000.50`, `NGN 50000`, `50000 naira`. Anything else is not an amount. */
export function parseReportAmount(text: string): number | null {
  const match = text.trim().match(/^(?:ngn|n|₦)?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(?:naira)?$/i);
  if (!match) return null;
  const amount = Number(`${match[1].replaceAll(',', '')}${match[2] ?? ''}`);
  return Number.isFinite(amount) ? amount : null;
}

function dayString(year: number, month: number, day: number): string | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return dayString(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())!;
}

/**
 * `12 Oct 2026`, `12 October 2026`, `2026-10-12`, `today` or `yesterday`, as a Lagos calendar day.
 * No numeric day-first or month-first forms: they read differently to different residents.
 */
export function parseReportDate(text: string, now: Date): string | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const today = lagosDateString(now);
  if (input === 'today') return today;
  if (input === 'yesterday') return addDays(today, -1);
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dayString(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = input.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+),? (\d{4})$/);
  if (!named) return null;
  // Three letters or more of the month name: `oct`, `sept`, `october`.
  const month = named[2].length >= 3 ? MONTH_NAMES.findIndex((name) => name.startsWith(named[2])) : -1;
  return month < 0 ? null : dayString(Number(named[3]), month + 1, Number(named[1]));
}

export type ReportDateCheck = 'ok' | 'future' | 'too_old';

/** Not in the future, and within the last 90 days (decision 12). */
export function checkReportDate(day: string, now: Date): ReportDateCheck {
  const today = lagosDateString(now);
  if (day > today) return 'future';
  return day < addDays(today, -REPORT_WINDOW_DAYS) ? 'too_old' : 'ok';
}

export function cleanReference(text: string): string | null {
  const reference = text.trim().replace(/\s+/g, ' ');
  return reference && reference.length <= MAX_REFERENCE_LENGTH ? reference : null;
}

export interface PaymentReportInput {
  residentId: string;
  houseId: string;
  houseLabel: string;
  amount: number;
  /** Lagos calendar day, `YYYY-MM-DD`. */
  paymentDate: string;
  reference: string;
  /** When the resident sent a screenshot of the transfer to the estate phone, if they did. */
  screenshotAt?: string | null;
  now?: Date;
}

export type PaymentReportResult =
  | { status: 'created'; paymentId: string; requestId: string }
  | { status: 'invalid' | 'not_your_property' | 'limit' | 'duplicate' };

/** `<house>|<kobo>|<day>`: the same amount, date and property can be reported once. */
export function reportKey(houseId: string, amount: number, paymentDate: string): string {
  return `${houseId}|${Math.round(amount * 100)}|${paymentDate}`;
}

/**
 * Files a report: guards first, then the pending payment, then its approval request. A report whose
 * approval cannot be filed is removed again, so nothing sits pending that no admin will ever see.
 */
export async function createPaymentReport(input: PaymentReportInput): Promise<PaymentReportResult> {
  const now = input.now ?? new Date();
  const reference = cleanReference(input.reference);
  if (!(input.amount > 0) || input.amount > MAX_REPORT_AMOUNT || !reference || checkReportDate(input.paymentDate, now) !== 'ok') {
    return { status: 'invalid' };
  }

  // payment_records.whatsapp_report_key and approval_requests.requested_by_resident_id are not in the
  // generated types until migration 20261022000000 is applied.
  const admin = createAdminClient() as unknown as SupabaseClient;

  const { data: link, error: linkError } = await admin
    .from('resident_houses')
    .select('house_id')
    .eq('resident_id', input.residentId)
    .eq('house_id', input.houseId)
    .eq('is_active', true)
    .in('resident_role', ['resident_landlord', 'non_resident_landlord', 'tenant', 'developer'])
    .limit(1);
  if (linkError) throw linkError;
  if (!link?.length) return { status: 'not_your_property' };

  // A rejected or expired report still counts toward the day's limit: its request row stays.
  const { year, month, day } = lagosParts(now);
  const { count, error: countError } = await admin
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('request_type', 'whatsapp_payment_report')
    .eq('requested_by_resident_id', input.residentId)
    .gte('created_at', lagosMidnight(year, month, day).toISOString());
  if (countError) throw countError;
  if ((count || 0) >= REPORTS_PER_DAY) return { status: 'limit' };

  const notes = input.screenshotAt ? `${REPORT_NOTE}. Screenshot sent to the estate phone at ${input.screenshotAt}.` : REPORT_NOTE;
  const { data: payment, error } = await admin
    .from('payment_records')
    .insert({
      resident_id: input.residentId,
      house_id: input.houseId,
      amount: input.amount,
      // Noon in Lagos, so the stored instant falls on the reported day in every timezone.
      payment_date: new Date(`${input.paymentDate}T12:00:00+01:00`).toISOString(),
      status: 'pending',
      method: 'bank_transfer',
      reference_number: reference,
      notes,
      is_verified: false,
      whatsapp_report_key: reportKey(input.houseId, input.amount, input.paymentDate),
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { status: 'duplicate' };
    throw error;
  }

  const request = await createResidentApprovalRequest({
    residentId: input.residentId,
    request_type: 'whatsapp_payment_report',
    entity_type: 'payment_record',
    entity_id: payment.id,
    requested_changes: { amount: input.amount, payment_date: input.paymentDate, property: input.houseLabel, reference },
    reason: notes,
  });
  if (!request.success) {
    await admin.from('payment_records').delete().eq('id', payment.id).eq('status', 'pending');
    throw new Error(`Payment report approval not filed: ${request.error}`);
  }
  await admin.from('payment_records').update({ approval_request_id: request.request_id }).eq('id', payment.id);

  await recordAudit(
    {
      action: 'CREATE',
      entityType: 'payment_records',
      entityId: payment.id,
      entityDisplay: `Reported payment ${formatNaira(input.amount)} for ${input.houseLabel}`,
      newValues: { amount: input.amount, payment_date: input.paymentDate, house_id: input.houseId, status: 'pending', approval_request_id: request.request_id },
      description: 'Payment reported by the resident over WhatsApp',
    },
    { userId: null, residentId: input.residentId }
  );
  return { status: 'created', paymentId: payment.id, requestId: request.request_id };
}
