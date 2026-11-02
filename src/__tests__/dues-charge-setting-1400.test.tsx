// @vitest-environment jsdom
//
// #1400, owner comments of 2 Nov 2026: the Charge setting. Chips on the report card (real buttons,
// at least 44 px), one line under them saying who shows, the charge in the title, "as of" with no
// period, and the charge kept as a schedule / download parameter.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FileText } from 'lucide-react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const h = vi.hoisted(() => ({
  generateReport: vi.fn(),
  saveGeneratedReport: vi.fn(),
  charges: { data: [] as { code: string; name: string; sort_order: number }[], isLoading: false, error: null as Error | null },
}));
vi.mock('@/actions/reports/report-engine', () => ({ generateReport: h.generateReport }));
vi.mock('@/actions/reports/report-schedules', () => ({
  getReportSchedules: vi.fn(), getReportSchedule: vi.fn(), createReportSchedule: vi.fn(), updateReportSchedule: vi.fn(),
  deleteReportSchedule: vi.fn(), getGeneratedReports: vi.fn(), getGeneratedReport: vi.fn(), saveGeneratedReport: h.saveGeneratedReport,
  deleteGeneratedReport: vi.fn(), createReportVersion: vi.fn(), getReportVersionHistory: vi.fn(),
}));
vi.mock('@/hooks/use-billing', () => ({ useChargeCategories: () => h.charges }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { ReportTypePicker, chargePayerLine } from '@/components/reports/report-type-picker';
import { reportTypes, reportRequestSchema, type ReportType } from '@/lib/validators/reports';
import { useGenerateReport } from '@/hooks/use-reports';
import { isAsOfReportType } from '@/components/reports/report-viewer';

afterEach(() => {
  cleanup();
  h.generateReport.mockReset();
  h.saveGeneratedReport.mockReset();
  h.charges.error = null;
  h.charges.isLoading = false;
});

const config = Object.fromEntries(
  reportTypes.map((t) => [t.value, { icon: FileText, iconBg: 'bg-muted' }])
) as unknown as Record<ReportType, { icon: React.ElementType; iconBg: string }>;
const ALL: ReportType[] = reportTypes.map((t) => t.value);
const OPTIONS = [
  { code: 'dues', name: 'Security Dues' },
  { code: 'development_levy', name: 'Development Levy' },
  { code: 'transformer_fee', name: 'Transformer Fee' },
];

function picker(value: ReportType, charge: Partial<NonNullable<React.ComponentProps<typeof ReportTypePicker>['charge']>> = {}) {
  const onCharge = vi.fn();
  render(
    <ReportTypePicker
      value={value}
      onChange={vi.fn()}
      allowedTypes={ALL}
      config={config}
      realtimeTypes={[]}
      accountAgnosticTypes={[]}
      charge={{ options: OPTIONS, value: 'dues', onChange: onCharge, ...charge }}
    />
  );
  return onCharge;
}

describe('Charge chips on the report card (#1400)', () => {
  it('shows one chip for each charge from the table, as real buttons at least 44 px high', () => {
    picker('dues_collection_status');
    const chips = within(screen.getByTestId('charge-chips')).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Security Dues', 'Development Levy', 'Transformer Fee']);
    for (const chip of chips) {
      expect(chip.tagName).toBe('BUTTON');
      expect(chip.getAttribute('type')).toBe('button');
      expect(chip.className).toContain('min-h-[44px]');
    }
  });

  it('lists whatever the table holds, not a fixed list', () => {
    picker('dues_collection_status', { options: [{ code: 'dues', name: 'Security Dues' }, { code: 'water', name: 'Water Rate' }] });
    expect(within(screen.getByTestId('charge-chips')).getAllByRole('button').map((c) => c.textContent)).toEqual(['Security Dues', 'Water Rate']);
  });

  it('marks the chosen charge and calls onChange with the code', () => {
    const onCharge = picker('dues_collection_status', { value: 'development_levy' });
    expect(screen.getByTestId('charge-chip-development_levy').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('charge-chip-dues').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('charge-chip-transformer_fee'));
    expect(onCharge).toHaveBeenCalledWith('transformer_fee');
  });

  it('says under the chips who shows: tenant for dues, landlord for the others', () => {
    expect(chargePayerLine('dues')).toBe('Shows the tenant, else the owner-occupier.');
    expect(chargePayerLine('development_levy')).toBe('Shows the landlord (owner-occupier, else landlord, else developer).');
    expect(chargePayerLine('transformer_fee')).toBe(chargePayerLine('development_levy'));
    picker('dues_collection_status', { value: 'transformer_fee' });
    expect(screen.getByTestId('charge-payer-line').textContent).toBe(chargePayerLine('transformer_fee'));
  });

  it('shows only on the dues report card', () => {
    picker('transaction_log');
    expect(screen.queryByTestId('charge-chips')).toBeNull();
  });

  it('a load that fails shows the reason, never an empty list', () => {
    picker('dues_collection_status', { options: [], error: 'permission denied' });
    const box = screen.getByTestId('charge-chips');
    expect(within(box).getByRole('alert').textContent).toContain('permission denied');
    expect(within(box).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('The charge is a request parameter (#1400)', () => {
  it('defaults to dues, accepts a code and refuses a malformed one', () => {
    const base = { reportType: 'dues_collection_status', periodPreset: 'this_month' };
    expect(reportRequestSchema.parse(base).chargeCategory).toBe('dues');
    expect(reportRequestSchema.parse({ ...base, chargeCategory: 'transformer_fee' }).chargeCategory).toBe('transformer_fee');
    expect(reportRequestSchema.safeParse({ ...base, chargeCategory: 'Bad Code' }).success).toBe(false);
  });

  it('the download route passes the charge, and Dues when none is given', async () => {
    for (const [query, expected] of [['', 'dues'], ['&chargeCategory=transformer_fee', 'transformer_fee']]) {
      vi.resetModules();
      const generateReport = vi.fn().mockResolvedValue({ success: false, error: 'stop' });
      vi.doMock('@/actions/reports/report-engine', () => ({ generateReport }));
      vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn() }));
      vi.doMock('@/lib/pdf/reports/archive', () => ({ storeReportPdf: vi.fn() }));
      vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
      vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
      vi.doMock('@/lib/email/send-email', () => ({ getEstateEmailSettings: async () => ({ estateName: 'Test Estate' }) }));
      vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
      const { GET } = await import('@/app/api/reports/download/route');
      const { NextRequest } = await import('next/server');
      await GET(new NextRequest(`http://localhost/api/reports/download?type=dues_collection_status${query}`));
      expect(generateReport.mock.calls[0][0].chargeCategory).toBe(expected);
      for (const m of ['@/actions/reports/report-engine', '@/lib/pdf/reports/renderer', '@/lib/pdf/reports/archive', '@/lib/audit/logger', '@/lib/auth/authorize', '@/lib/email/send-email', '@/lib/supabase/server']) vi.doUnmock(m);
    }
  });

  it.each([
    ['dues_collection_status', { chargeCategory: 'transformer_fee' }, 'transformer_fee'],
    ['dues_collection_status', {}, 'dues'],
    ['indebtedness_summary', { chargeCategory: 'transformer_fee' }, 'dues'], // a retired Indebtedness schedule covers Dues
    ['indebtedness_detail', {}, 'dues'],
  ])('a %s schedule with %j runs for charge %s', async (savedType, configuration, expected) => {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'dues_collection_status', layout: 'summary', data: {} } });
    // A retired schedule never saved a charge: it is Dues even if the configuration holds none.
    const schedule = { id: 's1', report_type: savedType, period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: [], configuration };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn().mockResolvedValue(null) }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    expect(generate.mock.calls[0][1]).toMatchObject({ reportType: 'dues_collection_status', chargeCategory: expected });
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/lib/audit/logger']) vi.doUnmock(m);
  });
});

describe('Title and "as of" (#1400)', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
  );

  it('the title is "<report> - <Charge name> - As of <dd mmmm yyyy>", with no period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    h.generateReport.mockResolvedValue({
      success: true,
      report: { type: 'dues_collection_status', layout: 'summary', data: { summary: [], table: { columns: [], rows: [] }, chargeName: 'Transformer Fee' } },
    });
    const { result } = renderHook(() => useGenerateReport(), { wrapper });
    const report = await result.current.mutateAsync({
      ...reportRequestSchema.parse({ reportType: 'dues_collection_status', periodPreset: 'last_quarter', chargeCategory: 'transformer_fee' }),
      saveToHistory: true,
    });
    vi.useRealTimers();
    expect(report.title).toBe('Dues, levies and collection status - Transformer Fee - As of 02 November 2026');
    expect(h.saveGeneratedReport.mock.calls[0][0].name).toBe(report.title);
    expect(report.title).not.toMatch(/ to /);
  });

  it('the viewer prints "As of", not a period, for the dues report', () => {
    expect(isAsOfReportType('dues_collection_status')).toBe(true);
    expect(isAsOfReportType('transaction_log')).toBe(false);
  });

  it('the server PDF title carries the charge', async () => {
    const { SummaryReportPdf } = await import('@/lib/pdf/reports/summary-report-pdf');
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    const data = { summary: [], table: { columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] }, chargeName: 'Development Levy' };
    const buffer = await renderReportPdf('dues_collection_status', data, 'Test Estate');
    expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    expect(JSON.stringify(SummaryReportPdf({ data, title: 'Dues, levies and collection status - Development Levy', estateName: 'E' }))).toContain('Development Levy');
  });
});

describe('Charge wiring in the wizard (#1400)', () => {
  it('step 1 shows the chips for the dues report and passes the chosen charge on generate', async () => {
    h.charges.data = [
      { code: 'dues', name: 'Security Dues', sort_order: 1 },
      { code: 'development_levy', name: 'Development Levy', sort_order: 2 },
      { code: 'transformer_fee', name: 'Transformer Fee', sort_order: 3 },
    ];
    const { ReportRequestWizard } = await import('@/components/reports/report-request-wizard');
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ReportRequestWizard allowedReportTypes={['dues_collection_status']} onGenerate={onGenerate} />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('charge-chip-dues').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('charge-chip-transformer_fee'));
    expect(screen.getByTestId('charge-payer-line').textContent).toBe(chargePayerLine('transformer_fee'));
    for (let i = 0; i < 4 && !screen.queryByRole('button', { name: /Generate Report/ }); i++) fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Report/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ reportType: 'dues_collection_status', chargeCategory: 'transformer_fee' });
  });
});
