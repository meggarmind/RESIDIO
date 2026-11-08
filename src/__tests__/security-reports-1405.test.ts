// #1405: Security reports (layout B): Visitor and access log, Access codes due to expire.
import { describe, expect, it } from 'vitest';

import { generateVisitorAccessLog } from '@/lib/reports/generators/visitor-access-log';
import { generateAccessCodesExpiring } from '@/lib/reports/generators/access-codes-expiring';
import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport } from '@/lib/reports/summary-report';
import { GENERATABLE_REPORT_TYPES, getReportPermission, reportRequestSchema, reportsForPermissions, reportTypes, type ReportRequestFormData } from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type Row = Record<string, unknown>;

/** A Supabase stand-in: gte/lt filters apply, `.range(a, b)` returns that slice, no read returns more than 1,000 rows. */
function client(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const builder: Record<string, unknown> = {};
      const chain = (fn: (...a: never[]) => void) => (...a: unknown[]) => { (fn as (...x: unknown[]) => void)(...a); return builder; };
      builder.select = chain(() => {});
      builder.order = chain(() => {});
      builder.gte = chain((col: string, v: string) => filters.push((r) => String(r[col]) >= v));
      builder.lt = chain((col: string, v: string) => filters.push((r) => String(r[col]) < v));
      builder.range = (from: number, to: number) =>
        Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(from, Math.min(to + 1, from + 1000)), error: null });
      return builder;
    },
  } as never;
}

const link = (num: string, street: string) => [{ is_active: true, is_primary: true, house: { house_number: num, short_name: null, street: { name: street } } }];
const RANGE = { startDate: '2026-11-01', endDate: '2026-11-03' };

const log = (id: string, contact: string, checkIn: string, over: Row = {}): Row => ({
  id, contact_id: contact, check_in_time: checkIn, check_out_time: null, flagged: false, flag_reason: null,
  contact: { full_name: `Visitor ${contact}` },
  resident: { first_name: 'A', last_name: 'B', resident_houses: link('12', 'Palm Close') },
  ...over,
});

describe('Security reports registry (#1405)', () => {
  it('lists both under Security, guarded by the security report permission, and generatable', () => {
    for (const value of ['visitor_access_log', 'access_codes_expiring'] as const) {
      const entry = reportTypes.find((r) => r.value === value);
      expect(entry?.group).toBe('Security');
      expect(getReportPermission(value)).toBe(PERMISSIONS.REPORTS_VIEW_SECURITY);
      expect(GENERATABLE_REPORT_TYPES).toContain(value);
    }
    expect(reportsForPermissions([PERMISSIONS.REPORTS_VIEW_SECURITY])).toEqual(['visitor_access_log', 'access_codes_expiring']);
    expect(reportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).not.toContain('visitor_access_log');
  });
});

describe('Visitor and access log (#1405)', () => {
  it('counts visits, unique visitors, flagged entries and the busiest hour, in Lagos time', async () => {
    const { data } = await generateVisitorAccessLog(client({
      access_logs: [
        // 16:10 UTC = 17:10 Lagos
        log('a', 'c1', '2026-11-01T16:10:00Z', { check_out_time: '2026-11-01T17:00:00Z' }),
        log('b', 'c1', '2026-11-02T16:40:00Z', { flagged: true, flag_reason: 'No ID shown' }),
        log('c', 'c2', '2026-11-02T08:00:00Z', { resident: { first_name: 'C', last_name: 'D', resident_houses: link('4', 'Cedar Way') } }),
        // 23:30 UTC on 3 Nov is 00:30 Lagos on 4 Nov: outside the period
        log('late', 'c3', '2026-11-03T23:30:00Z'),
        // 22:59 UTC on 31 Oct is 23:59 Lagos on 31 Oct: outside the period
        log('early', 'c3', '2026-10-31T22:59:00Z'),
      ],
    }), RANGE);
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Visits', 3], ['Unique visitors', 2], ['Flagged', 1], ['Busiest hour', '17:00 (2)'],
    ]);
    expect(data.table.rows).toEqual([
      { house: '12, Palm Close', visits: 2, visitors: 1, checkedOut: 1, flagged: 1 },
      { house: '4, Cedar Way', visits: 1, visitors: 1, checkedOut: 0, flagged: 0 },
    ]);
    expect(data.table.totals).toMatchObject({ visits: 3, visitors: 2, checkedOut: 1, flagged: 1 });
    expect(data.chart?.bars.map((b) => [b.label, b.value])).toEqual([['01 November 2026', 1], ['02 November 2026', 2], ['03 November 2026', 0]]);
    const notes = (data.notes ?? []).join('\n');
    expect(notes).toContain('Visitor c1, visiting 12, Palm Close. No ID shown.');
    expect(notes).toContain('09:00 1, 17:00 2');
  });

  it('shows dashes and no flagged section for an empty period', async () => {
    const { data } = await generateVisitorAccessLog(client({ access_logs: [] }), RANGE);
    expect(data.summary[3].value).toBe('-');
    expect(data.table.rows).toEqual([]);
    expect((data.notes ?? []).join('\n')).not.toContain('Flagged entries:');
  });

  it('reads every page of a busy period', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => log(`id-${String(i).padStart(4, '0')}`, `c${i % 10}`, '2026-11-02T10:00:00Z'));
    const { data } = await generateVisitorAccessLog(client({ access_logs: many }), RANGE);
    expect(data.summary[0].value).toBe(1500);
  });

  it('runs through the generator switch as a summary report', async () => {
    const params = { ...reportRequestSchema.parse({ reportType: 'visitor_access_log', periodPreset: 'custom', ...RANGE }) } as ReportRequestFormData;
    const result = await generateReportWithClient(client({ access_logs: [] }), params);
    expect(result.success).toBe(true);
    expect(isSummaryReport(result.report)).toBe(true);
  });
});

describe('Access codes due to expire (#1405)', () => {
  const NOW = new Date('2026-11-08T10:00:00Z');
  const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
  const code = (id: string, contact: string, validUntil: string | null, over: Row = {}): Row => ({
    id, code_type: 'permanent', contact_id: contact, is_active: true, valid_until: validUntil, created_at: '2026-01-01T00:00:00Z',
    contact: { full_name: `Holder ${contact}`, resident: { resident_houses: link('12', 'Palm Close') } },
    ...over,
  });

  it('lists codes expiring in 30 days and counts 7 days, 30 days, expired and renewed', async () => {
    const { data } = await generateAccessCodesExpiring(client({
      access_codes: [
        code('soon', 'c1', day(3)),
        code('mid', 'c2', day(20), { code_type: 'one_time' }),
        code('far', 'c3', day(45)),
        code('gone', 'c4', day(-2)),
        code('revoked', 'c5', day(2), { is_active: false }),
        code('never', 'c6', null),
        // c7's first code is old; this one was made in the period: a renewal
        code('c7-old', 'c7', day(100), { created_at: '2026-02-01T00:00:00Z' }),
        code('c7-new', 'c7', day(200), { created_at: '2026-11-05T09:00:00Z' }),
        // c8's only code was made in the period: new, not renewed
        code('c8-new', 'c8', day(200), { created_at: '2026-11-05T09:00:00Z' }),
      ],
    }), { startDate: '2026-11-01', endDate: '2026-11-08' }, NOW);

    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Expiring in 7 days', 1], ['Expiring in 30 days', 2], ['Already expired', 1], ['Renewed this period', 1],
    ]);
    expect(data.table.rows.map((r) => [r.holder, r.house, r.type, r.daysLeft])).toEqual([
      ['Holder c1', '12, Palm Close', 'Permanent', 3],
      ['Holder c2', '12, Palm Close', 'One time', 20],
    ]);
  });

  it('never prints the code value', async () => {
    const { data } = await generateAccessCodesExpiring(client({ access_codes: [{ ...code('a', 'c1', day(3)), code: 'SECRET123' }] }), RANGE, NOW);
    expect(JSON.stringify(data)).not.toContain('SECRET123');
  });
});
