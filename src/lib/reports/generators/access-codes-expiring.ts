/**
 * "Access codes due to expire" report (#1405, layout B): the active access codes that expire in the
 * next N days (30 unless the request names another number), with holder, house and type, and tiles
 * for 7 days, N days, already expired and renewed in the period.
 *
 * Reads `access_codes` directly, as `getExpiringCodes` does, because that action needs a security
 * permission the report's holders may not have; the on-demand path passes the admin client for that
 * reason (report-engine.ts). The report shows where
 * the codes stand now, not on the period's end date; only "Renewed" follows the period. The code
 * itself (the secret the visitor types) is never printed.
 *
 * Expired: still marked active, with a valid-until date in the past. Renewed: a code made in the
 * period for a holder who already had an earlier code. The app has no renewal action, so a new
 * code for the same holder is what a renewal looks like in the data.
 *
 * No authorization here (see the header of report-generator.ts): the callers check REPORTS_VIEW_SECURITY.
 */

import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { formatLongDate } from '@/lib/reports/generators/finance-format';
import {
  DAY_MS,
  lagosDateTime,
  lagosDayStartIso,
  nextDay,
  one,
  residentHouseLabel,
  type Embed,
  type ResidentHouseEmbed,
} from '@/lib/reports/generators/security-common';

/** How far ahead the list looks when the request names no number of days. */
export const EXPIRY_WINDOW_DAYS = 30;
const SOON_DAYS = 7;

const CODE_TYPE_LABELS: Record<string, string> = { permanent: 'Permanent', one_time: 'One time' };

type CodeRow = {
  id: string;
  code_type: string;
  contact_id: string;
  is_active: boolean | null;
  valid_until: string | null;
  created_at: string;
  contact: Embed<{
    full_name: string | null;
    resident: Embed<{ resident_houses: ResidentHouseEmbed[] | ResidentHouseEmbed }>;
  }>;
};

export async function generateAccessCodesExpiring(
  client: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
  windowDays: number = EXPIRY_WINDOW_DAYS,
  now: Date = new Date()
): Promise<SummaryReport> {
  const { startDate, endDate } = dateRange;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error('Choose a start and end date for the period');
  }
  const periodFrom = lagosDayStartIso(startDate);
  const periodTo = lagosDayStartIso(nextDay(endDate));

  const result = await fetchAllRows<CodeRow>((from, to) =>
    client
      .from('access_codes')
      .select(`
        id, code_type, contact_id, is_active, valid_until, created_at,
        contact:security_contacts!inner(
          full_name,
          resident:residents(resident_houses!resident_houses_resident_id_fkey(is_active, is_primary, house:houses!house_id(house_number, short_name, street:streets(name))))
        )
      `)
      .order('id')
      .range(from, to) as never
  );
  if (result.error !== null) {
    console.error('Error fetching access codes for expiry report:', result.error);
    throw new Error('Failed to load access codes');
  }
  const codes = result.data;

  const nowMs = now.getTime();
  const soonMs = nowMs + SOON_DAYS * DAY_MS;
  const windowMs = nowMs + windowDays * DAY_MS;

  const active = codes.filter((c) => c.is_active !== false && c.valid_until);
  const untilMs = (c: CodeRow) => Date.parse(c.valid_until as string);
  const expired = active.filter((c) => untilMs(c) < nowMs);
  const due = active.filter((c) => untilMs(c) >= nowMs && untilMs(c) <= windowMs).sort((a, b) => untilMs(a) - untilMs(b));
  const dueSoon = due.filter((c) => untilMs(c) <= soonMs);

  // Renewed: made in the period, and the holder had a code made before it.
  const firstCodeAt = new Map<string, string>();
  for (const c of codes) {
    const seen = firstCodeAt.get(c.contact_id);
    if (!seen || c.created_at < seen) firstCodeAt.set(c.contact_id, c.created_at);
  }
  const renewed = codes.filter((c) => c.created_at >= periodFrom && c.created_at < periodTo && firstCodeAt.get(c.contact_id)! < c.created_at);

  const rows = due.map((c) => {
    const contact = one(c.contact);
    const resident = contact ? one(contact.resident) : null;
    const daysLeft = Math.ceil((untilMs(c) - nowMs) / DAY_MS);
    return {
      holder: contact?.full_name || 'Unknown holder',
      house: resident ? residentHouseLabel(resident.resident_houses) : 'No house',
      type: CODE_TYPE_LABELS[c.code_type] ?? c.code_type,
      expires: lagosDateTime(c.valid_until as string),
      daysLeft,
    };
  });

  const data: SummaryReportData = {
    summary: [
      { label: 'Expiring in 7 days', value: dueSoon.length, tone: dueSoon.length > 0 ? 'bad' : 'good' },
      { label: `Expiring in ${windowDays} days`, value: due.length, tone: 'neutral' },
      { label: 'Already expired', value: expired.length, tone: expired.length > 0 ? 'bad' : 'good', hint: 'Still marked active' },
      { label: 'Renewed this period', value: renewed.length, tone: 'neutral' },
    ],
    table: {
      columns: [
        { key: 'holder', label: 'Holder' },
        { key: 'house', label: 'House' },
        { key: 'type', label: 'Type' },
        { key: 'expires', label: 'Expires' },
        { key: 'daysLeft', label: 'Days left', align: 'right' },
      ],
      rows,
    },
    notes: [
      `Codes that expire in the next ${windowDays} days, as at ${formatLongDate(now.toISOString().slice(0, 10))}. Only active codes are counted. The code itself is not shown.`,
      'Already expired: codes that are still marked active but whose valid-until date has passed.',
      `Renewed this period: codes made between ${formatLongDate(startDate)} and ${formatLongDate(endDate)} for a holder who already had an earlier code.`,
    ],
  };

  return { type: 'access_codes_expiring', layout: 'summary', data };
}
