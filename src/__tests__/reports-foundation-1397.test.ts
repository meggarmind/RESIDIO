// #1397: per-report permissions, one report list for every schema, and loaders that filter by
// the report types the caller may run.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { held, generate, calls } = vi.hoisted(() => ({
  held: { perms: [] as string[] },
  generate: vi.fn(),
  calls: { in: [] as unknown[][], from: [] as string[] },
}));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async (p: string) =>
    held.perms.includes(p)
      ? { authorized: true, userId: 'u1', permissions: held.perms, error: null }
      : { authorized: false, userId: 'u1', permissions: held.perms, error: `Unauthorized: Missing permission '${p}'` }
  ),
  authorizeAnyPermission: vi.fn(async (ps: string[]) =>
    ps.some((p) => held.perms.includes(p))
      ? { authorized: true, userId: 'u1', permissions: held.perms, error: null }
      : { authorized: false, userId: 'u1', permissions: held.perms, error: 'Unauthorized: Missing required permissions' }
  ),
}));

// A query builder that records `.from` and `.in` and resolves to no rows.
function builder() {
  const result = { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'range', 'eq']) chain[m] = vi.fn(() => chain);
  chain.in = vi.fn((...args: unknown[]) => {
    calls.in.push(args);
    return chain;
  });
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      calls.from.push(table);
      return builder();
    },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@/components/reports/reports-page-client', () => ({ ReportsPageClient: () => null }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/reports/report-generator', () => ({
  generateReportWithClient: (...args: unknown[]) => generate(...args),
}));

import {
  reportTypes,
  reportRequestSchema,
  REPORT_TYPE_VALUES,
  REPORT_VIEW_PERMISSIONS,
  reportsForPermissions,
  getReportPermission,
  GENERATABLE_REPORT_TYPES,
  hasGenerator,
  isRetiredReport,
  resolveRetiredReport,
  runnableReportsForPermissions,
  type ReportRequestFormData,
} from '@/lib/validators/reports';
import { generateReport } from '@/actions/reports/report-engine';
import { getReportArchive } from '@/actions/reports/get-report-archive';
import { getReportSchedules, getGeneratedReports, updateReportSchedule, createReportSchedule } from '@/actions/reports/report-schedules';
import { ADMIN_NAV_SECTIONS, type NavItem } from '@/config/navigation';
import ReportsPage from '@/app/(dashboard)/reports/page';

const ALL = reportTypes.map((t) => t.value);
// What the picker and the Reports page offer: everything except the retired reports (#1399).
const RUNNABLE = reportTypes.filter((t) => !('retired' in t)).map((t) => t.value);

function request(reportType: string): ReportRequestFormData {
  return reportRequestSchema.parse({ reportType, periodPreset: 'this_month' }) as ReportRequestFormData;
}

beforeEach(() => {
  held.perms = [];
  generate.mockReset();
  generate.mockResolvedValue({ success: true, report: { type: 'invoice_aging', data: {} } });
  calls.in = [];
  calls.from = [];
});

describe('One report list for every schema (#1397)', () => {
  it('the request schema accepts every listed report, indebtedness_detail included (#1379)', () => {
    for (const type of ALL) {
      expect(reportRequestSchema.safeParse({ reportType: type, periodPreset: 'this_month' }).success, type).toBe(true);
    }
    expect(ALL).toContain('indebtedness_detail');
    expect(reportRequestSchema.safeParse({ reportType: 'bogus', periodPreset: 'this_month' }).success).toBe(false);
  });

  it('REPORT_TYPE_VALUES is the list, in order', () => {
    expect(REPORT_TYPE_VALUES).toEqual(ALL);
  });

  it('the schedule update schema accepts every generatable report and refuses others', async () => {
    held.perms = [PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    for (const type of GENERATABLE_REPORT_TYPES) {
      // Past validation the mock has no row, so the action stops at "Schedule not found".
      expect((await updateReportSchedule('s1', { report_type: type })).error, type).toBe('Schedule not found');
    }
    const bad = await updateReportSchedule('s1', { report_type: 'bogus' as never });
    expect(bad.error).not.toBe('Schedule not found');
    expect(bad.data).toBeNull();
  });
});

describe('Report permissions (#1397)', () => {
  it('every report names a real permission; all 9 use reports.view_financial today', () => {
    const known = Object.values(PERMISSIONS) as string[];
    for (const t of reportTypes) expect(known, t.value).toContain(t.permission);
    expect(reportTypes.every((t) => t.permission === PERMISSIONS.REPORTS_VIEW_FINANCIAL)).toBe(true);
  });

  it('REPORT_VIEW_PERMISSIONS is the distinct set', () => {
    expect(REPORT_VIEW_PERMISSIONS).toEqual([PERMISSIONS.REPORTS_VIEW_FINANCIAL]);
  });

  it('reportsForPermissions keeps only the reports whose permission is held', () => {
    expect(reportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toEqual(ALL);
    expect(reportsForPermissions([PERMISSIONS.REPORTS_VIEW_OCCUPANCY])).toEqual([]);
    expect(reportsForPermissions([])).toEqual([]);
  });

  it('getReportPermission returns null for an unlisted value', () => {
    expect(getReportPermission('transaction_log')).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(getReportPermission('bogus')).toBeNull();
  });
});

describe('generateReport authorizes with the report type permission (#1397)', () => {
  it('refuses a caller without that permission and generates nothing', async () => {
    held.perms = [PERMISSIONS.REPORTS_VIEW_OCCUPANCY];
    const result = await generateReport(request('transaction_log'));
    expect(result.success).toBe(false);
    expect(result.error).toContain(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(generate).not.toHaveBeenCalled();
  });

  it('generates for a caller holding it', async () => {
    held.perms = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
    const result = await generateReport(request('invoice_aging'));
    expect(result.success).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('refuses an unlisted type before any lookup', async () => {
    held.perms = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
    const result = await generateReport({ ...request('invoice_aging'), reportType: 'bogus' as never });
    expect(result).toEqual({ success: false, error: 'Unknown report type' });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('generateReportWithClient for a listed report with no generator (#1379)', () => {
  it('returns a clear error instead of nothing', async () => {
    // indebtedness_detail never had a generator; since #1400 it is retired and says what replaced it.
    const real = await vi.importActual<typeof import('@/lib/reports/report-generator')>('@/lib/reports/report-generator');
    const result = await real.generateReportWithClient({} as never, request('indebtedness_detail'));
    expect(result).toEqual({ success: false, error: 'Indebtedness Detail Report was replaced by Dues, levies and collection status.' });
  });
});

describe('History, archive and schedule lists filter by permitted report types (#1397)', () => {
  const loaders = [
    ['getGeneratedReports', 'generated_reports', () => getGeneratedReports()],
    ['getReportArchive', 'report_archive', () => getReportArchive()],
    ['getReportSchedules', 'report_schedules', () => getReportSchedules()],
  ] as const;

  for (const [name, table, load] of loaders) {
    it(`${name} refuses a caller with no report permission and reads nothing`, async () => {
      held.perms = [PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
      const result = await load();
      expect(result.error).toBeTruthy();
      expect(calls.from).toEqual([]);
    });

    it(`${name} reads only the types the caller may run`, async () => {
      held.perms = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
      const result = await load();
      expect(result.error).toBeNull();
      expect(calls.from).toEqual([table]);
      expect(calls.in).toEqual([['report_type', ALL]]);
    });
  }
});

describe('Reports menu follows the derived permissions (#1397)', () => {
  const reports = ADMIN_NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === 'reports')!;

  // Same OR rule as use-navigation.ts filterItem.
  const visible = (item: NavItem, perms: string[]) => !item.permissions || item.permissions.some((p) => perms.includes(p));
  const menuFor = (perms: string[]) =>
    visible(reports, perms) ? [reports.title, ...(reports.children ?? []).filter((c) => visible(c, perms)).map((c) => c.title)] : [];

  it('the entry and every child ask for REPORT_VIEW_PERMISSIONS', () => {
    expect(reports.permissions).toEqual(REPORT_VIEW_PERMISSIONS);
    for (const child of reports.children!) expect(child.permissions, child.title).toEqual(REPORT_VIEW_PERMISSIONS);
  });

  it('shows the entry and all three children to a holder of a report permission', () => {
    expect(menuFor([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toEqual(['Reports', 'New report', 'History', 'Schedules']);
  });

  it('hides it from a user whose permissions run no listed report', () => {
    expect(menuFor([PERMISSIONS.REPORTS_VIEW_OCCUPANCY])).toEqual([]);
    expect(menuFor([PERMISSIONS.REPORTS_MANAGE_SCHEDULES])).toEqual([]);
  });
});

describe('Reports page guard (#1397)', () => {
  it('opens for a holder of a report permission and passes the reports they may run', async () => {
    held.perms = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
    const page = (await ReportsPage()) as { props: { children: { props: { allowedReportTypes: string[] } } } };
    expect(page.props.children.props.allowedReportTypes).toEqual(RUNNABLE);
    expect(page.props.children.props.allowedReportTypes).not.toContain('debtors_report');
    expect(page.props.children.props.allowedReportTypes).not.toContain('invoice_aging');
  });

  it('sends anyone else to the dashboard', async () => {
    held.perms = [PERMISSIONS.REPORTS_VIEW_OCCUPANCY, PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    await expect(ReportsPage()).rejects.toThrow('redirect:/dashboard');
  });
});

describe('Only reports with a generator can be scheduled (#1397)', () => {
  const NO_GENERATOR = 'Indebtedness Detail Report was replaced by Dues, levies and collection status, so it cannot be scheduled.';

  it('GENERATABLE_REPORT_TYPES matches the cases in generateReportWithClient', async () => {
    const real = await vi.importActual<typeof import('@/lib/reports/report-generator')>('@/lib/reports/report-generator');
    // A stub client that fails on first use: a type with a case reaches it, a type without one does not.
    const stub = { from: () => { throw new Error('stub client reached'); }, rpc: () => { throw new Error('stub client reached'); } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const type of ALL) {
      const result = await real.generateReportWithClient(stub as never, request(type));
      // A retired report has no case on purpose: it is refused with its own message (#1399).
      const refused = /cannot be generated yet|was replaced by/.test(result.error ?? '');
      expect(refused, type).toBe(!hasGenerator(type));
      expect(/was replaced by/.test(result.error ?? ''), type).toBe(isRetiredReport(type));
    }
    spy.mockRestore();
    expect(hasGenerator('indebtedness_detail')).toBe(false);
  });

  it('createReportSchedule refuses a report with no generator and writes nothing', async () => {
    held.perms = [PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    const result = await createReportSchedule({ name: 'x', report_type: 'indebtedness_detail', frequency: 'monthly', period_preset: 'last_month' });
    expect(result).toEqual({ data: null, error: NO_GENERATOR });
    expect(calls.from).toEqual([]);
  });

  it('updateReportSchedule refuses a change to a report with no generator and reads nothing', async () => {
    held.perms = [PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    const result = await updateReportSchedule('s1', { report_type: 'indebtedness_detail' });
    expect(result).toEqual({ data: null, error: NO_GENERATOR });
    expect(calls.from).toEqual([]);
  });
});

describe('Retired reports (#1399)', () => {
  it('the four replaced reports are retired; everything else is not', () => {
    expect(reportTypes.filter((t) => 'retired' in t).map((t) => t.value)).toEqual(['invoice_aging', 'debtors_report', 'indebtedness_summary', 'indebtedness_detail']);
    expect(ALL).toContain('debtors_aging');
    expect(isRetiredReport('debtors_aging')).toBe(false);
  });

  it('stay valid values, so History and Archive still show and open old rows', () => {
    expect(REPORT_TYPE_VALUES).toContain('debtors_report');
    expect(REPORT_TYPE_VALUES).toContain('invoice_aging');
    expect(reportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toEqual(ALL);
  });

  it('are not offered: runnableReportsForPermissions leaves them out', () => {
    expect(runnableReportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toEqual(RUNNABLE);
    expect(runnableReportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toContain('debtors_aging');
    expect(runnableReportsForPermissions([])).toEqual([]);
  });

  it('are not generatable and not schedulable', () => {
    for (const type of ['debtors_report', 'invoice_aging']) {
      expect(hasGenerator(type), type).toBe(false);
      expect(GENERATABLE_REPORT_TYPES).not.toContain(type);
    }
    expect(hasGenerator('debtors_aging')).toBe(true);
  });

  it('generateReportWithClient refuses a retired report with a pointer to the new one', async () => {
    const real = await vi.importActual<typeof import('@/lib/reports/report-generator')>('@/lib/reports/report-generator');
    const result = await real.generateReportWithClient({} as never, request('debtors_report'));
    expect(result).toEqual({ success: false, error: 'Debtors Report was replaced by Debtors and aging.' });
  });

  it('createReportSchedule and updateReportSchedule refuse them and touch nothing', async () => {
    held.perms = [PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    const msg = 'Invoice Aging Report was replaced by Debtors and aging, so it cannot be scheduled.';
    const created = await createReportSchedule({ name: 'x', report_type: 'invoice_aging', frequency: 'monthly', period_preset: 'last_month' });
    expect(created).toEqual({ data: null, error: msg });
    const updated = await updateReportSchedule('s1', { report_type: 'invoice_aging' });
    expect(updated).toEqual({ data: null, error: msg });
    expect(calls.from).toEqual([]);
  });

  it('a schedule saved for a retired report runs as Debtors and aging', () => {
    expect(resolveRetiredReport('debtors_report')).toBe('debtors_aging');
    expect(resolveRetiredReport('invoice_aging')).toBe('debtors_aging');
    expect(resolveRetiredReport('transaction_log')).toBe('transaction_log');
  });
});
