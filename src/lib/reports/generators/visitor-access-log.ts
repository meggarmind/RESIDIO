/**
 * "Visitor and access log" report (#1405, layout B): the check-ins and check-outs in the period, by
 * house, by hour of day and by day, with the flagged entries listed.
 *
 * Reads `access_logs` directly, as `getAccessLogs` does, because that action needs
 * `security.view_logs`, a permission the report's holders may not have; the on-demand path passes the
 * admin client for that reason (report-engine.ts). Days and hours
 * are Lagos time (UTC+1). A visit is counted on the day of its check-in.
 *
 * No authorization here (see the header of report-generator.ts): the callers check REPORTS_VIEW_SECURITY.
 */

import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { formatLongDate } from '@/lib/reports/generators/finance-format';
import {
  hourLabel,
  lagosDateTime,
  lagosDay,
  lagosDayStartIso,
  lagosHour,
  nextDay,
  one,
  residentHouseLabel,
  type Embed,
  type ResidentHouseEmbed,
} from '@/lib/reports/generators/security-common';

type LogRow = {
  id: string;
  contact_id: string;
  check_in_time: string;
  check_out_time: string | null;
  flagged: boolean | null;
  flag_reason: string | null;
  contact: Embed<{ full_name: string | null }>;
  resident: Embed<{ first_name: string; last_name: string; resident_houses: ResidentHouseEmbed[] | ResidentHouseEmbed }>;
};

/** At most this many flagged entries are written out in the notes; the tile counts them all. */
const MAX_FLAGGED_LISTED = 25;

export async function generateVisitorAccessLog(
  client: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string }
): Promise<SummaryReport> {
  const { startDate, endDate } = dateRange;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    throw new Error('Choose a start and end date for the period');
  }
  const fromIso = lagosDayStartIso(startDate);
  const toIso = lagosDayStartIso(nextDay(endDate));

  const result = await fetchAllRows<LogRow>((from, to) =>
    client
      .from('access_logs')
      .select(`
        id, contact_id, check_in_time, check_out_time, flagged, flag_reason,
        contact:security_contacts(full_name),
        resident:residents(first_name, last_name, resident_houses!resident_houses_resident_id_fkey(is_active, is_primary, house:houses!house_id(house_number, short_name, street:streets(name))))
      `)
      .gte('check_in_time', fromIso)
      .lt('check_in_time', toIso)
      .order('id')
      .range(from, to) as never
  );
  if (result.error !== null) {
    console.error('Error fetching access logs for visitor report:', result.error);
    throw new Error('Failed to load the access log');
  }
  const logs = result.data;

  const byDay = new Map<string, number>();
  for (let day = startDate; day <= endDate; day = nextDay(day)) byDay.set(day, 0);
  const byHour = new Array<number>(24).fill(0);
  const byHouse = new Map<string, { visits: number; visitors: Set<string>; checkedOut: number; flagged: number }>();
  const visitors = new Set<string>();
  const flaggedRows: LogRow[] = [];
  let checkedOut = 0;

  for (const log of logs) {
    const day = lagosDay(log.check_in_time);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    byHour[lagosHour(log.check_in_time)] += 1;
    visitors.add(log.contact_id);
    if (log.check_out_time) checkedOut += 1;
    if (log.flagged) flaggedRows.push(log);

    const resident = one(log.resident);
    const house = resident ? residentHouseLabel(resident.resident_houses) : 'No house';
    const entry = byHouse.get(house) ?? { visits: 0, visitors: new Set<string>(), checkedOut: 0, flagged: 0 };
    entry.visits += 1;
    entry.visitors.add(log.contact_id);
    if (log.check_out_time) entry.checkedOut += 1;
    if (log.flagged) entry.flagged += 1;
    byHouse.set(house, entry);
  }

  const peak = byHour.reduce((best, count, hour) => (count > byHour[best] ? hour : best), 0);
  const peakText = logs.length > 0 ? `${hourLabel(peak)} (${byHour[peak]})` : '-';

  const rows = [...byHouse.entries()]
    .sort((a, b) => b[1].visits - a[1].visits || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([house, e]) => ({ house, visits: e.visits, visitors: e.visitors.size, checkedOut: e.checkedOut, flagged: e.flagged }));

  const hourNote = byHour
    .map((count, hour) => (count > 0 ? `${hourLabel(hour)} ${count}` : null))
    .filter((v): v is string => v !== null)
    .join(', ');

  const flaggedSorted = [...flaggedRows].sort((a, b) => a.check_in_time.localeCompare(b.check_in_time));
  const flaggedNotes = flaggedSorted.slice(0, MAX_FLAGGED_LISTED).map((log) => {
    const resident = one(log.resident);
    const house = resident ? residentHouseLabel(resident.resident_houses) : 'No house';
    const name = one(log.contact)?.full_name || 'Unknown visitor';
    return `${lagosDateTime(log.check_in_time)}: ${name}, visiting ${house}. ${log.flag_reason?.trim() || 'No reason given'}.`;
  });
  if (flaggedSorted.length > MAX_FLAGGED_LISTED) {
    flaggedNotes.push(`${flaggedSorted.length - MAX_FLAGGED_LISTED} more flagged entries are not listed.`);
  }

  const data: SummaryReportData = {
    summary: [
      { label: 'Visits', value: logs.length, tone: 'neutral' },
      { label: 'Unique visitors', value: visitors.size, tone: 'neutral' },
      { label: 'Flagged', value: flaggedRows.length, tone: flaggedRows.length > 0 ? 'bad' : 'good' },
      { label: 'Busiest hour', value: peakText, tone: 'neutral', hint: logs.length > 0 ? 'Visits at that hour' : undefined },
    ],
    chart: {
      title: 'Visits by day',
      bars: [...byDay.entries()].map(([day, count]) => ({ label: formatLongDate(day), value: count, display: String(count), tone: 'neutral' as const })),
    },
    table: {
      columns: [
        { key: 'house', label: 'House' },
        { key: 'visits', label: 'Visits', align: 'right' },
        { key: 'visitors', label: 'Unique visitors', align: 'right' },
        { key: 'checkedOut', label: 'Checked out', align: 'right' },
        { key: 'flagged', label: 'Flagged', align: 'right' },
      ],
      rows,
      totals: { house: 'Total', visits: logs.length, visitors: visitors.size, checkedOut, flagged: flaggedRows.length },
    },
    notes: [
      `Period: ${formatLongDate(startDate)} to ${formatLongDate(endDate)}. Days and hours are Lagos time. A visit counts on the day it checked in.`,
      `Checked out: ${checkedOut} of ${logs.length} visits have a check-out time. Unique visitors in a house row are counted for that house alone, so the rows can add up to more than the total.`,
      hourNote ? `Visits by hour of check-in: ${hourNote}.` : 'No visits in the period.',
      ...(flaggedNotes.length > 0 ? ['Flagged entries:', ...flaggedNotes] : []),
    ],
  };

  return { type: 'visitor_access_log', layout: 'summary', data };
}
