// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Issue #463: admin UI accessibility gaps.
 *
 * - the invoice generation modal was a hand-built overlay with no dialog
 *   semantics (no role, no title, no Escape)
 * - icon-only buttons had no accessible name
 * - a failed approvals query rendered "Everything caught up!"
 * - clickable year rows had no keyboard path
 */

const approvalsState = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));

// Every control renders: these tests are about behaviour, not permission gating (#788).
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ isLoading: false, hasPermission: () => true }) }));
vi.mock('@/hooks/use-approvals', () => ({
  useApprovalRequests: () => approvalsState.value,
  useApproveRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/dashboard/enhanced-stat-card', () => ({
  EnhancedPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  EnhancedTableCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/use-billing', () => {
  const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    useGenerateInvoicesPreview: () => mutation,
    usePrepareInvoiceGenerationRun: () => mutation,
    useProcessInvoiceGenerationRun: () => mutation,
    useApproveInvoiceGenerationRun: () => mutation,
    useInvoiceGenerationRun: () => ({ data: undefined }),
  };
});
vi.mock('@/actions/billing/apply-late-fees', () => ({
  getLateFeeSettings: () => Promise.resolve({ enabled: false }),
}));
vi.mock('@/actions/houses/get-houses', () => ({ getHouses: vi.fn() }));
vi.mock('@/actions/reference/get-streets', () => ({ getStreets: vi.fn() }));
vi.mock('@/actions/residents/get-residents', () => ({ getResidents: vi.fn() }));

vi.mock('@/hooks/use-reference', () => ({
  useStreets: () => ({
    data: [{ id: 's1', name: 'Palm Avenue', short_name: null, description: null, is_active: true }],
    isLoading: false,
  }),
  useCreateStreet: () => ({ mutateAsync: vi.fn() }),
  useUpdateStreet: () => ({ mutateAsync: vi.fn() }),
  useDuplicateStreet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteStreet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/actions/houses/get-house-yearly-summary', () => ({
  getHouseYearlySummary: () =>
    Promise.resolve({
      data: [
        {
          year: 2025,
          amount_due: 1000,
          amount_paid: 400,
          outstanding: 600,
          paid_count: 0,
          partial_count: 1,
          unpaid_count: 0,
          total_count: 1,
          payments: [{ month_label: 'Jan 2025', day_label: '3', amount: 400 }],
        },
      ],
      error: null,
    }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/audit/audit-detail-dialog', () => ({ AuditDetailDialog: () => null }));

import ApprovalsPage from '@/app/(dashboard)/approvals/page';
import { GenerateInvoicesDialog } from '@/components/billing/generate-invoices-dialog';
import { StreetsList } from '@/components/admin/streets-list';
import { AuditLogsTable } from '@/components/audit/audit-logs-table';
import { YearlyPaymentTable } from '@/components/houses/yearly-payment-table';

afterEach(() => cleanup());

describe('ApprovalsPage query failure', () => {
  it('shows an alert with retry, not the empty-queue message, when the query fails', () => {
    const refetch = vi.fn();
    approvalsState.value = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    };
    render(<ApprovalsPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load approval requests');
    expect(screen.queryByText(/Everything caught up/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('still shows the empty state when the query succeeds with no rows', () => {
    approvalsState.value = {
      data: { data: [], count: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    render(<ApprovalsPage />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Everything caught up/)).toBeInTheDocument();
  });

  it('names the filter controls', () => {
    approvalsState.value = { data: { data: [], count: 0 }, isLoading: false, isError: false, refetch: vi.fn() };
    render(<ApprovalsPage />);
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toBeInTheDocument();
  });
});

describe('GenerateInvoicesDialog', () => {
  it('is a labelled modal dialog', () => {
    render(<GenerateInvoicesDialog open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate Invoices' });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription(/Prepare a reviewable financial run/);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<GenerateInvoicesDialog open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(<GenerateInvoicesDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('icon-only buttons have accessible names', () => {
  it('streets list edit, duplicate and delete', () => {
    render(<StreetsList />);
    expect(screen.getByRole('button', { name: 'Edit street Palm Avenue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate street Palm Avenue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete street Palm Avenue' })).toBeInTheDocument();
  });

  it('audit log view-details button', () => {
    render(
      <AuditLogsTable
        logs={[
          {
            id: 'a1',
            created_at: '2026-01-02T10:00:00Z',
            action: 'CREATE',
            entity_type: 'houses',
            entity_id: 'h1',
            entity_display: '12 Palm Avenue',
            description: null,
            actor: { full_name: 'Admin', app_roles: null },
          } as never,
        ]}
        total={1}
        isLoading={false}
        page={1}
        limit={10}
        onPageChange={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /View details of .* on 12 Palm Avenue/ });
    expect(button).toBeInTheDocument();
  });
});

describe('YearlyPaymentTable keyboard path', () => {
  it('expands a year row with Enter and Space, exposing aria-expanded', async () => {
    render(<YearlyPaymentTable houseId="h1" />);
    const row = (await screen.findByText('2025')).closest('tr') as HTMLElement;
    expect(row).toHaveAttribute('tabindex', '0');
    expect(row).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText('Jan 2025')).toBeInTheDocument();

    fireEvent.keyDown(row, { key: ' ' });
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.queryByText('Jan 2025')).not.toBeInTheDocument();
  });
});
