// @vitest-environment jsdom
//
// Issue #783: the resident detail page.
//   1. Write controls in LinkedHouses, PaymentAliases, WalletPaymentBatchTools and
//      ResidentPayments are hidden from a user without the matching WRITE permission
//      (CORE.md s6), and shown to a holder.
//   2. The Link dialog's house and sponsor lists load only while the dialog is open.
//   3. Payments are paged on the server.
//   4. The tab strip is controlled by `?tab=` (back/forward), legacy tab links resolve,
//      and a load failure is not reported as "not found".

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { LinkedHouses } from '@/components/residents/linked-houses';
import { PaymentAliases } from '@/components/residents/payment-aliases';
import { WalletPaymentBatchTools } from '@/components/residents/wallet-payment-batch-tools';
import { ResidentPayments } from '@/components/residents/resident-payments';
import { resolveResidentTab, isResidentNotFoundError } from '@/components/residents/resident-detail-tabs';
import { useHousesWithRoles } from '@/hooks/use-houses';
import { useResidents } from '@/hooks/use-residents';
import { usePayments } from '@/hooks/use-payments';
import type { ResidentWithHouses } from '@/types/database';

const auth = vi.hoisted(() => ({ granted: [] as string[] }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => auth.granted.includes(permission) }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/residents/r1',
  useSearchParams: () => new URLSearchParams(),
}));

const idleMutation = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock('@/hooks/use-residents', () => ({
  useResidents: vi.fn(() => ({ data: undefined })),
  useAssignHouse: vi.fn(() => idleMutation()),
  useUnassignHouse: vi.fn(() => idleMutation()),
}));

vi.mock('@/hooks/use-houses', () => ({
  useHousesWithRoles: vi.fn(() => ({ data: undefined })),
}));

vi.mock('@/hooks/use-imports', () => ({
  useResidentAliases: () => ({
    data: { data: [{ id: 'a1', resident_id: 'r1', alias_name: 'J Doe Ltd', notes: null, is_active: true }] },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useCreatePaymentAlias: () => idleMutation(),
  useUpdatePaymentAlias: () => idleMutation(),
  useToggleAliasStatus: () => idleMutation(),
  useDeletePaymentAlias: () => idleMutation(),
}));

vi.mock('@/hooks/use-payments', () => ({
  usePayments: vi.fn(() => ({ data: { data: [], count: 45 }, isLoading: false })),
}));

vi.mock('@/components/payments/payment-table', () => ({
  PaymentTable: () => <div data-testid="payment-table" />,
}));

vi.mock('@/hooks/use-wallet', () => ({
  useWallet: () => ({ data: { data: { id: 'w1', balance: 1000 } }, isLoading: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/actions/billing/settle-wallet-invoices', () => ({
  getResidentPayableInvoices: vi.fn().mockResolvedValue({
    data: [{ id: 'inv-1', invoice_number: 'INV-0001', house_id: 'h1', amount_due: 100, amount_paid: 0, status: 'pending', period_start: '2026-01-01', period_end: '2026-01-31' }],
    error: null,
  }),
  settleWalletInvoices: vi.fn(),
}));
vi.mock('@/actions/billing/prepay-future-invoices', () => ({ prepayFutureInvoices: vi.fn() }));
vi.mock('@/actions/billing/get-wallet-payment-batch', () => ({
  getWalletPaymentBatch: vi.fn(),
  getWalletPaymentBatches: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  auth.granted = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const house = (id: string) => ({ id, house_number: '1', short_name: id.toUpperCase(), street: { name: 'Oak Street' } });

const RESIDENT = {
  id: 'r1',
  first_name: 'Ada',
  last_name: 'Obi',
  resident_type: 'primary',
  entity_type: 'individual',
  resident_houses: [
    { id: 'rh1', house_id: 'h1', resident_role: 'resident_landlord', is_active: true, move_in_date: '2025-01-01', house: house('h1') },
    { id: 'rh2', house_id: 'h2', resident_role: 'co_resident', is_active: true, move_in_date: '2025-01-01', house: house('h2') },
  ],
} as unknown as ResidentWithHouses;

describe('LinkedHouses write controls (#783)', () => {
  it('hides Link House, Move Out, Transfer and Remove without houses.assign_resident', () => {
    auth.granted = ['residents.view', 'residents.update', 'houses.view'];
    render(<LinkedHouses resident={RESIDENT} />);

    expect(screen.getByText('H1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /link house/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /transfer property/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove assignment/i })).not.toBeInTheDocument();
  });

  it('shows them with houses.assign_resident', () => {
    auth.granted = ['houses.assign_resident'];
    render(<LinkedHouses resident={RESIDENT} />);

    expect(screen.getByRole('button', { name: /link house/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /transfer property/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove assignment/i })).toBeInTheDocument();
  });

  it('loads the house list only once the Link dialog opens, and no sponsor list until needed', async () => {
    auth.granted = ['houses.assign_resident'];
    render(<LinkedHouses resident={RESIDENT} />);

    const housesCalls = vi.mocked(useHousesWithRoles).mock.calls;
    expect(housesCalls.length).toBeGreaterThan(0);
    expect(housesCalls.every(([, options]) => options?.enabled === false)).toBe(true);
    expect(vi.mocked(useResidents).mock.calls.every(([, options]) => options?.enabled === false)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /link house/i }));

    await waitFor(() => {
      expect(vi.mocked(useHousesWithRoles).mock.calls.at(-1)?.[1]).toEqual({ enabled: true });
    });
    // No house picked and the default role needs no sponsor: still no resident fetch.
    expect(vi.mocked(useResidents).mock.calls.at(-1)?.[1]).toEqual({ enabled: false });
  });
});

describe('PaymentAliases write controls (#783)', () => {
  it('hides Add Alias and the alias action menu without residents.update', () => {
    auth.granted = ['residents.view'];
    render(<PaymentAliases residentId="r1" residentName="Ada Obi" />);

    expect(screen.getByText('J Doe Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add alias/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows them with residents.update', () => {
    auth.granted = ['residents.update'];
    render(<PaymentAliases residentId="r1" residentName="Ada Obi" />);

    expect(screen.getByRole('button', { name: /add alias/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('WalletPaymentBatchTools write controls (#783)', () => {
  it('hides settle, invoice selection and prepay without billing.manage_wallets', async () => {
    auth.granted = ['billing.view'];
    render(<WalletPaymentBatchTools residentId="r1" houses={[]} />);

    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /settle selected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create and pay future invoices/i })).not.toBeInTheDocument();
  });

  it('shows them with billing.manage_wallets', async () => {
    auth.granted = ['billing.manage_wallets'];
    render(<WalletPaymentBatchTools residentId="r1" houses={[]} />);

    await waitFor(() => expect(screen.getByText('INV-0001')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /settle selected/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create and pay future invoices/i })).toBeInTheDocument();
  });
});

describe('ResidentPayments (#783)', () => {
  it('hides Record Payment without payments.create', () => {
    auth.granted = ['payments.view'];
    render(<ResidentPayments residentId="r1" />);
    expect(screen.queryByRole('link', { name: /record payment/i })).not.toBeInTheDocument();
  });

  it('shows Record Payment with payments.create', () => {
    auth.granted = ['payments.create'];
    render(<ResidentPayments residentId="r1" />);
    expect(screen.getByRole('link', { name: /record payment/i })).toBeInTheDocument();
  });

  it('pages on the server: 20 per page, next page requests page 2', async () => {
    render(<ResidentPayments residentId="r1" />);
    expect(vi.mocked(usePayments).mock.calls[0][0]).toMatchObject({ resident_id: 'r1', limit: 20, page: 1 });
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(vi.mocked(usePayments).mock.calls.at(-1)?.[0]).toMatchObject({ page: 2 });
    });
  });
});

describe('resolveResidentTab (#783)', () => {
  it('defaults to overview', () => {
    expect(resolveResidentTab(null, true)).toBe('overview');
    expect(resolveResidentTab('bogus', true)).toBe('overview');
  });

  it('maps the merged tabs onto Money and the removed ones onto Overview', () => {
    expect(resolveResidentTab('transactions', false)).toBe('money');
    expect(resolveResidentTab('payments', false)).toBe('money');
    expect(resolveResidentTab('aliases', false)).toBe('money');
    expect(resolveResidentTab('emergency', false)).toBe('overview');
    expect(resolveResidentTab('notifications', false)).toBe('overview');
    expect(resolveResidentTab('security', false)).toBe('security');
  });

  it('opens Notes only for a notes viewer', () => {
    expect(resolveResidentTab('notes', true)).toBe('notes');
    expect(resolveResidentTab('notes', false)).toBe('overview');
  });
});

describe('isResidentNotFoundError (#783)', () => {
  it('treats a missing row or a malformed id as not found', () => {
    expect(isResidentNotFoundError('JSON object requested, multiple (or no) rows returned')).toBe(true);
    expect(isResidentNotFoundError('invalid input syntax for type uuid: "abc"')).toBe(true);
  });

  it('treats network and server failures as failures', () => {
    expect(isResidentNotFoundError('Failed to fetch')).toBe(false);
    expect(isResidentNotFoundError(undefined)).toBe(false);
  });
});

describe('resident detail page wiring (#783)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/(dashboard)/residents/[id]/page.tsx'), 'utf8');

  it('drives the tabs from the URL so back/forward switches tab', () => {
    expect(source).toContain('const activeTab = resolveResidentTab(tabParam, canViewNotes);');
    expect(source).toMatch(/<Tabs value=\{activeTab\}/);
    expect(source).not.toMatch(/<Tabs[^>]*defaultValue/);
    expect(source).not.toContain('setTimeout(');
  });

  it('confirms verification with an AlertDialog, not native confirm()', () => {
    expect(source).not.toMatch(/\bconfirm\(/);
    expect(source).toMatch(/\{canVerifyResident && \(\s*<AlertDialog open=\{isVerifyDialogOpen\}/);
  });

  it('loads the non-Overview tabs on demand', () => {
    for (const mod of ['resident-money-tab', 'resident-security-contacts']) {
      expect(source).toContain(`import('@/components/residents/${mod}')`);
      expect(source).not.toContain(`from '@/components/residents/${mod}'`);
    }
    expect(source).not.toContain("from 'framer-motion'");
  });

  it('has no fixed-height nested scroll boxes and no hard-coded green badges', () => {
    expect(source).not.toMatch(/h-\[460px\]|max-h-\[calc\(100vh-12rem\)\]/);
    expect(source).not.toContain('bg-green-100');
  });
});
