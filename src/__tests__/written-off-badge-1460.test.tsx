// @vitest-environment jsdom
//
// #1460: a bill with a write-off row shows "Written off" (not "Void") on the bill list and the bill
// page; the bill page shows the write-off and its Undo button only with billing.write_off_invoices.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  invoices: [] as unknown[],
  invoice: null as unknown,
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    user: null,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('@/contexts/visual-theme-context', () => ({ useVisualTheme: () => ({ themeId: 'default' }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'inv-1' }),
}));
vi.mock('@/actions/billing/get-invoices', () => ({
  getBillingResidentFilterOptions: async () => ({ data: [], error: null }),
  getInvoiceById: async () => ({ data: mocks.invoice, error: null }),
}));
vi.mock('@/actions/billing/get-invoice-corrections', () => ({ getParentInvoice: vi.fn() }));
vi.mock('@/actions/billing/write-off-invoices', () => ({ undoWriteOff: vi.fn() }));
vi.mock('@/components/billing/statement-generator-dialog', () => ({ StatementGeneratorDialog: () => null }));
vi.mock('@/components/billing/invoice-correction-dialog', () => ({ InvoiceCorrectionDialog: () => null }));
vi.mock('@/components/billing/invoice-correction-timeline', () => ({ InvoiceCorrectionTimeline: () => null }));
vi.mock('@/hooks/use-billing', () => ({
  useAdminInvoices: () => ({ data: { data: mocks.invoices, total: mocks.invoices.length }, isLoading: false, refetch: vi.fn() }),
  useInvoiceSummary: () => ({ data: undefined, isLoading: false }),
  useOverdueStats: () => ({ data: undefined }),
  useCheckOverdueInvoices: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import BillingPage from '@/app/(dashboard)/billing/page';
import InvoiceDetailPage from '@/app/(dashboard)/billing/[id]/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const invoice = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  invoice_number: `INV-${id}`,
  resident_id: 'r1',
  house_id: 'h1',
  amount_due: 5000,
  amount_paid: 0,
  status: 'void',
  invoice_type: 'SERVICE_CHARGE',
  due_date: '2020-07-28',
  period_start: '2020-07-01',
  period_end: '2020-07-31',
  created_at: '2020-07-01T00:00:00Z',
  updated_at: '2020-07-01T00:00:00Z',
  notes: null,
  created_by: null,
  resident: { id: 'r1', first_name: 'Alhaji', last_name: 'Shakiru', resident_code: 'R-36' },
  house: { id: 'h1', house_number: '36', short_name: 'IBB-36', street: { name: 'Palm Close' } },
  billing_profile: null,
  invoice_items: [{ id: 'it', description: 'Security Dues', amount: 5000 }],
  write_off: null,
  ...over,
});
const WRITE_OFF = {
  id: 'wo-1',
  batch_id: 'batch-1',
  reason: 'exco_settlement',
  note: 'Exco settlement 4 Nov 2026',
  amount_written_off: 5000,
  original_amount_due: 5000,
  written_off_at: '2026-11-05T09:00:00Z',
  written_off_by_profile: { full_name: 'Chairman Admin' },
};

beforeEach(() => {
  mocks.permissions = [PERMISSIONS.BILLING_VIEW];
  mocks.invoices = [];
  mocks.invoice = null;
});
afterEach(() => cleanup());

describe('Bill list status badge (#1460)', () => {
  it('shows Written off for a bill with a write-off row and void for a bill voided as an error', () => {
    mocks.invoices = [invoice('wo', { write_off: { id: 'wo-1' } }), invoice('err')];
    render(<BillingPage />);
    expect(screen.getAllByText('Written off').length).toBeGreaterThan(0);
    expect(screen.getAllByText('void').length).toBeGreaterThan(0);
    // One badge per invoice in each layout: the written-off bill never shows "void".
    expect(screen.getAllByText('Written off').length).toBe(screen.getAllByText('void').length);
  });
});

describe('Bill page write-off (#1460)', () => {
  it('shows WRITTEN OFF and the write-off details, and Undo with billing.write_off_invoices', async () => {
    mocks.permissions = [PERMISSIONS.BILLING_VIEW, PERMISSIONS.BILLING_WRITE_OFF_INVOICES];
    mocks.invoice = invoice('inv-1', { write_off: WRITE_OFF });
    render(<InvoiceDetailPage />);
    expect(await screen.findByText('WRITTEN OFF')).toBeInTheDocument();
    expect(screen.queryByText('VOID')).toBeNull();
    expect(screen.getByText('Exco settlement 4 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText(/By Chairman Admin on 05 Nov 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo write-off/i })).toBeInTheDocument();
  });

  it('hides Undo without billing.write_off_invoices', async () => {
    mocks.invoice = invoice('inv-1', { write_off: WRITE_OFF });
    render(<InvoiceDetailPage />);
    expect(await screen.findByText('WRITTEN OFF')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo write-off/i })).toBeNull();
  });

  it('shows VOID for a bill voided as an error', async () => {
    mocks.invoice = invoice('inv-1');
    render(<InvoiceDetailPage />);
    expect(await screen.findByText('VOID')).toBeInTheDocument();
    expect(screen.queryByText('WRITTEN OFF')).toBeNull();
  });
});
