// @vitest-environment jsdom
//
// #1397: the picker lists only permitted reports, the summary-first layout renders from its
// marker in both templates, CSV comes from its table, the wizard reports a failure and does not
// schedule a report it cannot generate, and History hides Delete without the delete permission.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Radix controls in the wizard measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { toastError, schema, createSchedule, perms, history } = vi.hoisted(() => ({
  toastError: vi.fn(),
  schema: { fail: false },
  createSchedule: vi.fn(),
  perms: { held: [] as string[] },
  history: { reports: [] as unknown[] },
}));
// The request schema, with a switch that makes it fail so the invalid path can be driven.
vi.mock('@/lib/validators/reports', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/validators/reports')>();
  return {
    ...real,
    reportRequestSchema: real.reportRequestSchema.superRefine((_, ctx) => {
      if (schema.fail) ctx.addIssue({ code: 'custom', path: ['reportType'], message: 'Pick a report you may run' });
    }),
  };
});
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/use-reports', () => ({
  useCreateReportSchedule: () => ({ mutateAsync: createSchedule, isPending: false }),
  useReportVersionHistory: () => ({ data: [], isLoading: false }),
  useGenerateReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGeneratedReports: () => ({ data: { data: history.reports, count: history.reports.length }, isLoading: false }),
  useDeleteGeneratedReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReportSchedules: () => ({ data: [], isLoading: false }),
  useReportArchive: () => ({ data: { data: [], count: 0 }, isLoading: false }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => perms.held.includes(p) }),
}));
vi.mock('@/hooks/use-settings', () => ({ useGeneralSettings: () => ({ data: [] }) }));
vi.mock('@/components/reports/wallet-batch-reconciliation-panel', () => ({ WalletBatchReconciliationPanel: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/reports',
  useSearchParams: () => new URLSearchParams('tab=recent'),
}));
vi.mock('@/actions/reports/get-financial-overview', () => ({
  getBankAccountsForFilter: async () => ({ data: [], error: null }),
}));

import { ReportTypePicker } from '@/components/reports/report-type-picker';
import { ReportRequestWizard } from '@/components/reports/report-request-wizard';
import { SummaryReportLayout } from '@/components/reports/summary-report-layout';
import { ModernTemplate } from '@/components/reports/templates/modern-template';
import { TraditionalTemplate } from '@/components/reports/templates/traditional-template';
import { isSummaryReport, summaryTableToCsv, type SummaryReportData } from '@/lib/reports/summary-report';
import { reportTypes, type ReportType } from '@/lib/validators/reports';
import type { ReportData } from '@/lib/reports/report-generator';
import { ReportViewer } from '@/components/reports/report-viewer';
import { ReportsPageClient } from '@/components/reports/reports-page-client';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { GeneratedReport } from '@/hooks/use-reports';

afterEach(() => {
  cleanup();
  toastError.mockReset();
  createSchedule.mockReset();
  schema.fail = false;
  perms.held = [];
  history.reports = [];
});

const config = Object.fromEntries(
  reportTypes.map((t) => [t.value, { icon: FileText, iconBg: 'bg-muted' }])
) as unknown as Record<ReportType, { icon: React.ElementType; iconBg: string }>;

describe('ReportTypePicker lists only permitted reports (#1397)', () => {
  it('shows the allowed types and no other', () => {
    render(
      <ReportTypePicker
        value=""
        onChange={vi.fn()}
        allowedTypes={['transaction_log', 'debtors_report']}
        config={config}
        realtimeTypes={[]}
        accountAgnosticTypes={[]}
      />
    );
    const list = screen.getByTestId('report-type-list');
    const items = within(list).getAllByRole('button', { pressed: false });
    expect(items.map((b) => b.textContent)).toEqual(['Transaction Log', 'Debtors Report']);
    expect(within(list).queryByRole('button', { name: /Levies/ })).toBeNull();
  });

  it('shows nothing selected when the value is not allowed', () => {
    render(
      <ReportTypePicker value="debtors_report" onChange={vi.fn()} allowedTypes={['transaction_log']} config={config} realtimeTypes={[]} accountAgnosticTypes={[]} />
    );
    expect(screen.queryByTestId('report-type-aim')).toBeNull();
  });
});

const summary: SummaryReportData = {
  summary: [
    { label: 'Houses', value: 120, tone: 'neutral' },
    { label: 'Occupied', value: 98, tone: 'good', hint: '82% of houses' },
    { label: 'Empty', value: 22, tone: 'bad' },
    { label: 'Owners living in', value: 61 },
    { label: 'Fifth tile', value: 5 },
  ],
  chart: {
    title: 'Houses by street',
    bars: [
      { label: 'Ojo Kadiri', value: 40, display: '40 houses' },
      { label: 'Gbolahon Bishi', value: 20 },
    ],
  },
  table: {
    columns: [
      { key: 'street', label: 'Street' },
      { key: 'houses', label: 'Houses', align: 'right' },
      { key: 'since', label: 'Since' },
    ],
    rows: [
      { street: 'Ojo Kadiri', houses: 1200, since: '1 Jan 2026' },
      { street: 'Gbolahon, "B"', houses: 20, since: null },
    ],
    totals: { street: 'Total', houses: 1220, since: null },
  },
  notes: ['Counts are as of today.'],
};

describe('SummaryReportLayout (#1397)', () => {
  for (const variant of ['modern', 'traditional'] as const) {
    it(`${variant}: renders at most four tiles, the bars, the rows and the totals`, () => {
      render(<SummaryReportLayout data={summary} variant={variant} />);
      const tiles = screen.getAllByTestId('summary-tile');
      expect(tiles).toHaveLength(4);
      expect(tiles[1].textContent).toContain('Occupied');
      expect(tiles[1].textContent).toContain('98');
      expect(tiles[1].textContent).toContain('82% of houses');
      expect(screen.queryByText('Fifth tile')).toBeNull();

      const bars = screen.getAllByTestId('summary-bar');
      expect(bars).toHaveLength(2);
      expect(bars[0].textContent).toContain('40 houses');
      expect(screen.getByText('Houses by street')).toBeTruthy();

      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Street', 'Houses', 'Since']);
      expect(within(table).getByText('1,200')).toBeTruthy();
      expect(within(table).getByText('1 Jan 2026')).toBeTruthy();
      const totals = screen.getByTestId('summary-totals');
      expect(totals.textContent).toBe('Total1,220');
      expect(screen.getByText('Counts are as of today.')).toBeTruthy();
    });
  }

  it('starts the printed table on a new page after the summary', () => {
    const { container } = render(<SummaryReportLayout data={summary} variant="modern" />);
    const tableSection = container.querySelector('table')!.closest('div[style*="border-radius"]') as HTMLElement;
    expect(tableSection.style.pageBreakBefore).toBe('always');
  });
});

describe('Templates pick the summary layout by its marker (#1397)', () => {
  const report = { type: 'any_future_type', layout: 'summary', data: summary } as unknown as ReportData;

  it('modern and traditional both render it', () => {
    const { unmount } = render(<ModernTemplate report={report} title="Occupancy" />);
    expect(screen.getByTestId('summary-report')).toBeTruthy();
    unmount();
    render(<TraditionalTemplate report={report} title="Occupancy" />);
    expect(screen.getByTestId('summary-report')).toBeTruthy();
  });

  it('existing reports do not use it', () => {
    expect(isSummaryReport({ type: 'invoice_aging', data: {} })).toBe(false);
    expect(isSummaryReport(report)).toBe(true);
  });
});

describe('summaryTableToCsv (#1397)', () => {
  it('writes the header, rows and totals, quoting where needed', () => {
    expect(summaryTableToCsv(summary.table)).toBe(
      ['Street,Houses,Since', 'Ojo Kadiri,1200,1 Jan 2026', '"Gbolahon, ""B""",20,', 'Total,1220,'].join('\n')
    );
  });
});

function renderWizard(allowed: ReportType[], onGenerate = vi.fn().mockResolvedValue(undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReportRequestWizard allowedReportTypes={allowed} onGenerate={onGenerate} />
    </QueryClientProvider>
  );
  return onGenerate;
}
// A non-realtime type walks steps 1 to 5.
const toReview = () => {
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
};

describe('ReportRequestWizard (#1397)', () => {
  it('starts on the first report the user may run', () => {
    renderWizard(['transaction_log', 'debtors_report']);
    expect(screen.getByTestId('report-type-aim').textContent).toContain('Transaction Log');
  });

  it('shows a toast when the form fails validation, and does not generate (#1379)', async () => {
    schema.fail = true;
    const onGenerate = renderWizard(['financial_overview']);
    toReview();
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/ }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Cannot generate this report', { description: 'Pick a report you may run' })
    );
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('offers no schedule for a report it cannot generate, and says why', () => {
    renderWizard(['indebtedness_detail']);
    toReview();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('This report cannot be generated yet, so it cannot be scheduled.')).toBeTruthy();
  });

  it('offers the schedule switch for a report it can generate', () => {
    renderWizard(['financial_overview']);
    toReview();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.queryByText('This report cannot be generated yet, so it cannot be scheduled.')).toBeNull();
  });
});

const summaryGenerated = {
  id: 'r1',
  type: 'financial_overview',
  title: 'Occupancy - Oct 2026',
  generatedAt: '2026-10-31T08:00:00Z',
  parameters: { reportType: 'financial_overview', periodPreset: 'custom', startDate: '2026-10-01', endDate: '2026-10-31' },
  data: { type: 'any_future_type', layout: 'summary', data: summary },
  version: 1,
  parentReportId: null,
  isLatest: true,
  editNotes: null,
} as unknown as GeneratedReport;

describe('ReportViewer CSV export of a summary-first report (#1397)', () => {
  it('downloads the table as CSV', async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:csv';
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ReportViewer report={summaryGenerated} />);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await blob!.text()).toBe(summaryTableToCsv(summary.table));
    click.mockRestore();
  });
});

describe('History hides Delete without reports.manage_schedules (#1397)', () => {
  const page = () => render(<ReportsPageClient allowedReportTypes={['financial_overview']} />);

  it('no Delete for a viewer', () => {
    perms.held = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
    history.reports = [{ ...summaryGenerated, title: 'October overview' }];
    page();
    expect(screen.getByText('October overview')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete report/ })).toBeNull();
  });

  it('Delete for a holder of reports.manage_schedules', () => {
    perms.held = [PERMISSIONS.REPORTS_VIEW_FINANCIAL, PERMISSIONS.REPORTS_MANAGE_SCHEDULES];
    history.reports = [{ ...summaryGenerated, title: 'October overview' }];
    page();
    expect(screen.getByRole('button', { name: 'Delete report October overview' })).toBeTruthy();
  });
});
