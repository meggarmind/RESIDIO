// @vitest-environment jsdom
//
// #1373: the main menu's Reports shortcuts open a tab through `?tab=`, and changing tabs
// writes it back with replaceState (no history entry per tab).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/hooks/use-reports', () => ({
  useGenerateReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useGeneratedReports: () => ({ data: { data: [], count: 0 }, isLoading: false }),
  useDeleteGeneratedReport: () => ({ mutateAsync: vi.fn() }),
  useReportSchedules: () => ({ data: [], isLoading: false }),
  useReportArchive: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock('@/hooks/use-settings', () => ({ useGeneralSettings: () => ({ data: [] }) }));
vi.mock('@/components/auth/can', () => ({ useCan: () => true }));
vi.mock('@/components/reports/report-request-wizard', () => ({ ReportRequestWizard: () => <p>wizard panel</p> }));
vi.mock('@/components/reports/report-viewer', () => ({ ReportViewer: () => null }));
vi.mock('@/components/reports/report-schedules', () => ({ ReportSchedulesPanel: () => <p>schedules panel</p> }));
vi.mock('@/components/reports/wallet-batch-reconciliation-panel', () => ({
  WalletBatchReconciliationPanel: () => null,
}));

import { ReportsPageClient } from '@/components/reports/reports-page-client';

afterEach(() => {
  cleanup();
  search = '';
  vi.restoreAllMocks();
});

const selected = () => screen.getByRole('tab', { selected: true });

describe('Reports page tabs from the URL (#1373)', () => {
  it('opens the tab named by ?tab=', () => {
    search = 'tab=schedules';
    render(<ReportsPageClient />);
    expect(selected()).toHaveTextContent('Schedules');
    expect(screen.getByText('schedules panel')).toBeInTheDocument();
  });

  it('opens New Report for a missing or unknown tab', () => {
    search = 'tab=nonsense';
    render(<ReportsPageClient />);
    expect(selected()).toHaveTextContent('New Report');
    expect(screen.getByText('wizard panel')).toBeInTheDocument();
  });

  it('writes the chosen tab to the URL without a new history entry', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    render(<ReportsPageClient />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /History/ }), { button: 0 });
    expect(replace).toHaveBeenCalledWith(null, '', '?tab=recent');
    expect(push).not.toHaveBeenCalled();
  });
});
